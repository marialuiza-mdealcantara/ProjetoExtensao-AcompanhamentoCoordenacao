import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { fetchAbsences, type AbsenceDetails } from '../../services/absenceService';
import { fetchJustifications, justificationStatusLabel } from '../../services/justificationService';
import type { JustificationRow } from '../../types/database';
import { formatDate } from '../absences/absenceFormatting';

export function JustificationsPage() {
  const { profile } = useAuth();
  const [absences, setAbsences] = useState<AbsenceDetails[]>([]);
  const [justifications, setJustifications] = useState<JustificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isTeacher = profile?.role === 'PROFESSOR';
  const basePath = profile?.role === 'SECRETARIA'
    ? '/secretaria'
    : profile?.role === 'COORDENADOR'
      ? '/coordenacao'
      : '/professor';

  const load = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [absenceRows, justificationRows] = await Promise.all([
        fetchAbsences(profile.role, profile.id),
        fetchJustifications(),
      ]);
      setAbsences(absenceRows);
      setJustifications(justificationRows);
    } catch (error) {
      setAbsences([]);
      setJustifications([]);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as justificativas.');
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  const justificationsByAbsence = new Map(justifications.map((item) => [item.absence_id, item]));
  const visibleAbsences = isTeacher
    ? absences
    : absences.filter(({ id }) => justificationsByAbsence.has(id));

  return (
    <section className="info-card">
      <span className="badge-stage">Registro e acompanhamento</span>
      <h2>Justificativas</h2>
      <p className="lead-text">
        {isTeacher
          ? 'Consulte suas ausências, envie o termo de justificativa e acompanhe o encaminhamento e a decisão.'
          : profile?.role === 'SECRETARIA'
            ? 'Consulte as justificativas, encaminhe-as ao Coordenador responsável e registre o recebimento do resultado.'
            : 'Consulte e decida justificativas encaminhadas nos cursos sob sua responsabilidade.'}
      </p>
      <div className="card-footer-actions">
        <button className="btn-secondary" type="button" onClick={() => void load()} disabled={isLoading}>Atualizar lista</button>
      </div>

      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {isLoading ? (
        <div className="state-box" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Carregando justificativas...</p></div>
      ) : errorMessage ? (
        <button className="btn-secondary" type="button" onClick={() => void load()}>Tentar novamente</button>
      ) : visibleAbsences.length === 0 ? (
        <div className="state-box"><h3>Nenhuma justificativa disponível</h3><p className="text-muted">Quando houver ausências ou termos enviados, eles aparecerão nesta lista.</p></div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Data da aula</th>{!isTeacher && <th>Professor</th>}<th>Disciplina</th><th>Turma(s)</th><th>Status</th><th>Enviada em</th><th>Ação</th></tr></thead>
            <tbody>
              {visibleAbsences.map((absence) => {
                const justification = justificationsByAbsence.get(absence.id);
                return (
                  <tr key={absence.id}>
                    <td>{formatDate(absence.class_date)}</td>
                    {!isTeacher && <td>{absence.teacher_name}</td>}
                    <td>{absence.subject_name}</td>
                    <td>{absence.classes.map(({ courseName, name }) => `${courseName} — ${name}`).join(', ') || '—'}</td>
                    <td>{justificationStatusLabel(justification?.status ?? null)}</td>
                    <td>{justification ? formatDate(justification.submitted_at) : '—'}</td>
                    <td><Link className="text-link" to={`${basePath}/ausencias/${absence.id}`}>{isTeacher && !justification ? 'Preencher termo' : 'Ver justificativa'}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
