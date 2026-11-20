import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { fetchAbsences, type AbsenceDetails } from '../../services/absenceService';
import { formatClassification, formatDate } from './absenceFormatting';

export function AbsencesListPage() {
  const { profile } = useAuth();
  const [absences, setAbsences] = useState<AbsenceDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSecretary = profile?.role === 'SECRETARIA';
  const isCoordinator = profile?.role === 'COORDENADOR';
  const basePath = isSecretary
    ? '/secretaria/ausencias'
    : isCoordinator
      ? '/coordenacao/ausencias'
      : '/professor/ausencias';

  const loadAbsences = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setAbsences(await fetchAbsences(profile.role, profile.id));
    } catch (error) {
      setAbsences([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro ao carregar os registros de ausência.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  return (
    <section className="info-card">
      <span className="badge-stage">Registro e acompanhamento</span>
      <h2>Ausências</h2>
      <p className="lead-text">
        {isSecretary
          ? 'Consulte os registros de todos os professores e registre uma ausência em nome de um professor.'
          : isCoordinator
            ? 'Consulte as ausências dos cursos sob sua responsabilidade e acompanhe as decisões de substituição.'
            : 'Consulte seus registros e informe uma ausência vinculada a uma ocorrência de aula.'}
      </p>

      <div className="card-footer-actions">
        {!isCoordinator && (
          <Link className="btn-primary" to={`${basePath}/nova`}>
            Registrar ausência
          </Link>
        )}
        <button
          className="btn-secondary"
          type="button"
          onClick={() => void loadAbsences()}
          disabled={isLoading}
        >
          Atualizar lista
        </button>
      </div>

      {errorMessage && (
        <div className="alert-box alert-danger" role="alert">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="state-box" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Carregando ausências...</p>
        </div>
      ) : errorMessage ? (
        <div className="card-footer-actions">
          <button className="btn-secondary" type="button" onClick={() => void loadAbsences()}>
            Tentar novamente
          </button>
        </div>
      ) : absences.length === 0 ? (
        <div className="state-box">
          <h3>Nenhuma ausência registrada</h3>
          <p className="text-muted">
            Quando houver registros, eles aparecerão nesta lista.
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data da aula</th>
                {(isSecretary || isCoordinator) && <th>Professor</th>}
                <th>Disciplina</th>
                <th>Turma(s)</th>
                <th>Horário</th>
                <th>Situação</th>
                {isCoordinator && <th>Sugestões</th>}
                <th>Registrada em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((absence) => (
                <tr key={absence.id}>
                  <td>{formatDate(absence.class_date)}</td>
                  {(isSecretary || isCoordinator) && (
                    <td>
                      <strong>{absence.teacher_name}</strong>
                      <br />
                      {isSecretary && absence.teacher_email && (
                        <span className="user-email-cell">{absence.teacher_email}</span>
                      )}
                    </td>
                  )}
                  <td>{absence.subject_name}</td>
                  <td>
                    {absence.classes.length > 0
                      ? absence.classes
                          .map(({ courseName, name }) => `${courseName} — ${name}`)
                          .join(', ')
                      : '—'}
                  </td>
                  <td>{`${absence.start_time.slice(0, 5)}–${absence.end_time.slice(0, 5)}`}</td>
                  <td>{formatClassification(absence.classification)}</td>
                  {isCoordinator && (
                    <td>
                      {absence.suggestion_count === 1
                        ? '1 sugestão'
                        : `${absence.suggestion_count} sugestões`}
                    </td>
                  )}
                  <td>{formatDate(absence.created_at)}</td>
                  <td>
                    <Link className="text-link" to={`${basePath}/${absence.id}`}>
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
