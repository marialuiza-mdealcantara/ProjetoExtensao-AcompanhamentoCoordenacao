import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  createAbsence,
  fetchActiveTeachers,
  fetchAvailableOccurrences,
  type AvailableOccurrence,
} from '../../services/absenceService';
import type { UserRole } from '../../types/database';
import { formatDate } from './absenceFormatting';

interface TeacherOption {
  id: string;
  full_name: string;
  email: string;
}

export function AbsenceFormPage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;
  const isSecretary = role === 'SECRETARIA';
  const basePath = isSecretary ? '/secretaria/ausencias' : '/professor/ausencias';

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [occurrences, setOccurrences] = useState<AvailableOccurrence[]>([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState('');
  const [reason, setReason] = useState('');
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(isSecretary);
  const [isLoadingOccurrences, setIsLoadingOccurrences] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSecretary) return;
    let isActive = true;
    setIsLoadingTeachers(true);
    fetchActiveTeachers()
      .then((items) => {
        if (isActive) setTeachers(items);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os professores.'
          );
        }
      })
      .finally(() => {
        if (isActive) setIsLoadingTeachers(false);
      });
    return () => {
      isActive = false;
    };
  }, [isSecretary]);

  const loadOccurrences = useCallback(async () => {
    if (!profile || (isSecretary && !selectedTeacherId)) {
      setOccurrences([]);
      setSelectedOccurrenceId('');
      setIsLoadingOccurrences(false);
      return;
    }

    setIsLoadingOccurrences(true);
    setErrorMessage(null);
    try {
      const items = await fetchAvailableOccurrences(
        profile.role as UserRole,
        profile.id,
        selectedTeacherId || undefined
      );
      setOccurrences(items);
      setSelectedOccurrenceId((current) =>
        items.some(({ id }) => id === current) ? current : ''
      );
    } catch (error) {
      setOccurrences([]);
      setSelectedOccurrenceId('');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as ocorrências disponíveis.'
      );
    } finally {
      setIsLoadingOccurrences(false);
    }
  }, [isSecretary, profile, selectedTeacherId]);

  useEffect(() => {
    void loadOccurrences();
  }, [loadOccurrences]);

  const handleTeacherChange = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setSelectedOccurrenceId('');
    setOccurrences([]);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !profile || !user) return;
    setErrorMessage(null);

    const selectedOccurrence = occurrences.find(
      ({ id }) => id === selectedOccurrenceId
    );
    const teacherId = isSecretary ? selectedTeacherId : profile.id;

    if (!teacherId) {
      setErrorMessage('Selecione o professor da ausência.');
      return;
    }
    if (!selectedOccurrence) {
      setErrorMessage('Selecione uma ocorrência de aula disponível.');
      return;
    }
    if (selectedOccurrence.teacher_id !== teacherId) {
      setErrorMessage('A ocorrência selecionada não pertence ao professor escolhido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const absenceId = await createAbsence({
        occurrenceId: selectedOccurrence.id,
        teacherId,
        createdBy: user.id,
        role: profile.role,
        reason,
      });
      navigate(`${basePath}/${absenceId}?created=1`, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a ausência. Tente novamente.'
      );
      setIsSubmitting(false);
      void loadOccurrences();
    }
  };

  const isLoading = isLoadingTeachers || isLoadingOccurrences;

  return (
    <section className="info-card">
      <span className="badge-stage">Novo registro</span>
      <h2>Registrar ausência</h2>
      <p className="lead-text">
        A ausência será vinculada a uma ocorrência de aula disponível, sem registro anterior.
      </p>

      {errorMessage && (
        <div className="alert-box alert-danger" role="alert">
          {errorMessage}
        </div>
      )}

      <form className="create-user-form" onSubmit={handleSubmit}>
        {isSecretary && (
          <div className="form-group">
            <label className="form-label" htmlFor="absence-teacher">
              Professor
            </label>
            <select
              id="absence-teacher"
              className="form-input"
              value={selectedTeacherId}
              onChange={(event) => handleTeacherChange(event.currentTarget.value)}
              disabled={isLoadingTeachers || isSubmitting}
              required
            >
              <option value="">
                {isLoadingTeachers ? 'Carregando professores...' : 'Selecione um professor'}
              </option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name} — {teacher.email}
                </option>
              ))}
            </select>
            {!isLoadingTeachers && teachers.length === 0 && !errorMessage && (
              <p className="text-muted">Não há professores ativos disponíveis.</p>
            )}
          </div>
        )}

        {isLoadingOccurrences ? (
          <div className="state-box" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Carregando ocorrências disponíveis...</p>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="absence-occurrence">
              Ocorrência de aula
            </label>
            <select
              id="absence-occurrence"
              className="form-input"
              value={selectedOccurrenceId}
              onChange={(event) => setSelectedOccurrenceId(event.currentTarget.value)}
              disabled={isSubmitting || (isSecretary && !selectedTeacherId)}
              required
            >
              <option value="">Selecione uma ocorrência disponível</option>
              {occurrences.map((occurrence) => (
                <option key={occurrence.id} value={occurrence.id}>
                  {formatDate(occurrence.class_date)} · {occurrence.subject_name} ·{' '}
                  {occurrence.classes
                    .map(({ courseName, name }) => `${courseName} — ${name}`)
                    .join(', ')}{' '}
                  · {occurrence.start_time.slice(0, 5)}–{occurrence.end_time.slice(0, 5)}
                </option>
              ))}
            </select>
            {occurrences.length === 0 && !isLoading && !errorMessage &&
              (!isSecretary || selectedTeacherId) && (
                <p className="text-muted">
                  Não há ocorrências válidas e sem ausência para este professor.
                </p>
              )}
          </div>
        )}

        {selectedOccurrenceId && (
          <div className="meta-box">
            {(() => {
              const occurrence = occurrences.find(({ id }) => id === selectedOccurrenceId);
              if (!occurrence) return null;
              return (
                <>
                  <strong>Detalhes da ocorrência</strong>
                  <span>Professor: {occurrence.teacher_name}</span>
                  <span>Período: {occurrence.term_name}</span>
                  <span>
                    Horário: {occurrence.start_time.slice(0, 5)}–{occurrence.end_time.slice(0, 5)}
                    {occurrence.room ? ` · ${occurrence.room}` : ''}
                  </span>
                </>
              );
            })()}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="absence-reason">
            Observação (opcional)
          </label>
          <textarea
            id="absence-reason"
            className="form-input"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="card-footer-actions">
          <button
            className="btn-primary"
            type="submit"
            disabled={isSubmitting || isLoading || !selectedOccurrenceId}
          >
            {isSubmitting ? 'Registrando...' : 'Confirmar ausência'}
          </button>
          <Link className="btn-secondary" to={basePath}>
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
