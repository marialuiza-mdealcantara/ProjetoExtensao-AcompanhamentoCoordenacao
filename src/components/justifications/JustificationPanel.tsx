import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  decideJustification,
  fetchJustificationForAbsence,
  fetchJustificationHistory,
  fetchResponsibleCoordinators,
  forwardJustification,
  isJustificationResultReceived,
  justificationStatusLabel,
  registerResultReceipt,
  submitJustification,
  type JustificationCoordinatorOption,
} from '../../services/justificationService';
import type { AuditLogRow, JustificationRow } from '../../types/database';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function describeEvent(action: string): string {
  switch (action) {
    case 'JUSTIFICATIVA_ENVIADA': return 'Termo enviado pelo Professor';
    case 'JUSTIFICATIVA_ENCAMINHADA': return 'Encaminhada pela Secretaria';
    case 'JUSTIFICATIVA_DECIDIDA': return 'Decisão registrada pelo Coordenador';
    case 'JUSTIFICATIVA_RESULTADO_RECEBIDO': return 'Recebimento do resultado registrado pela Secretaria';
    case 'JUSTIFICATIVA_REMOVIDA': return 'Registro removido administrativamente';
    default: return 'Etapa registrada';
  }
}

export function JustificationPanel({ absenceId }: { absenceId: string }) {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'PROFESSOR';
  const isSecretary = profile?.role === 'SECRETARIA';
  const isCoordinator = profile?.role === 'COORDENADOR';
  const [justification, setJustification] = useState<JustificationRow | null>(null);
  const [history, setHistory] = useState<AuditLogRow[]>([]);
  const [coordinators, setCoordinators] = useState<JustificationCoordinatorOption[]>([]);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('');
  const [description, setDescription] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setHistoryError(null);
    setCoordinatorError(null);
    try {
      const current = await fetchJustificationForAbsence(absenceId);
      setJustification(current);
      const [events, options] = await Promise.all([
        fetchJustificationHistory(absenceId).catch((error: unknown) => {
          setHistoryError(error instanceof Error ? error.message : 'Não foi possível consultar o histórico.');
          return [];
        }),
        isSecretary && current?.status === 'PENDENTE' && !current.forwarded_at
          ? fetchResponsibleCoordinators(absenceId).catch((error: unknown) => {
              setCoordinatorError(error instanceof Error ? error.message : 'Não foi possível listar coordenadores.');
              return [];
            })
          : Promise.resolve([]),
      ]);
      setHistory(events);
      setCoordinators(options);
      if (options.length > 0) setSelectedCoordinatorId(options[0].id);
      else setSelectedCoordinatorId('');
    } catch (error) {
      setJustification(null);
      setHistory([]);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a justificativa.');
    } finally {
      setIsLoading(false);
    }
  }, [absenceId, isSecretary]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await action();
      setSuccessMessage(success);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = () => runAction(async () => {
    await submitJustification(absenceId, description);
    setDescription('');
  }, 'Termo de justificativa enviado.');

  const handleForward = () => {
    if (!justification || !selectedCoordinatorId) return;
    return runAction(
      () => forwardJustification(justification.id, selectedCoordinatorId),
      'Justificativa encaminhada ao Coordenador.'
    );
  };

  const handleDecision = (status: 'APROVADA' | 'REJEITADA') => {
    if (!justification || !profile) return;
    return runAction(
      () => decideJustification(justification.id, profile.id, status, decisionNotes),
      status === 'APROVADA' ? 'Justificativa aprovada pelo Coordenador.' : 'Justificativa rejeitada pelo Coordenador.'
    );
  };

  const handleReceipt = () => {
    if (!justification || !profile) return;
    return runAction(
      () => registerResultReceipt(justification, profile.id),
      'Recebimento administrativo do resultado registrado.'
    );
  };

  const resultReceived = isJustificationResultReceived(history, justification?.id ?? '');
  const canDecide = Boolean(
    isCoordinator && profile && justification?.status === 'PENDENTE' &&
    justification.forwarded_at && justification.coordinator_id === profile.id
  );
  const canForward = Boolean(
    isSecretary && justification?.status === 'PENDENTE' && !justification.forwarded_at
  );
  const canAcknowledge = Boolean(
    isSecretary && justification && justification.status !== 'PENDENTE' &&
    justification.decision_at && !resultReceived
  );

  return (
    <section className="role-box" aria-labelledby={`justification-heading-${absenceId}`}>
      <h3 id={`justification-heading-${absenceId}`}>Justificativa</h3>
      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {successMessage && <div className="alert-box alert-ok" role="status">{successMessage}</div>}

      {isLoading ? (
        <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando justificativa...</p></div>
      ) : errorMessage ? (
        <button className="btn-secondary" type="button" onClick={() => void load()}>Tentar novamente</button>
      ) : !justification ? (
        isTeacher ? (
          <>
            <p>Preencha o termo de justificativa para esta ausência. O atestado, se enviado, é tratado separadamente.</p>
            <div className="form-group">
              <label className="form-label" htmlFor={`justification-description-${absenceId}`}>Termo de justificativa</label>
              <textarea
                id={`justification-description-${absenceId}`}
                className="form-input"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isBusy}
              />
            </div>
            <button className="btn-primary" type="button" onClick={() => void handleSubmit()} disabled={isBusy || !description.trim()}>
              {isBusy ? 'Enviando...' : 'Enviar justificativa'}
            </button>
          </>
        ) : <p className="text-muted">Nenhuma justificativa foi enviada para esta ausência.</p>
      ) : (
        <>
          <div className="meta-box">
            <strong>Situação</strong>
            <span>{justificationStatusLabel(justification.status)}</span>
            <span>Enviada em {formatDateTime(justification.submitted_at)}</span>
            {justification.forwarded_at && <span>Encaminhada em {formatDateTime(justification.forwarded_at)}</span>}
            {justification.decision_at && <span>Decidida em {formatDateTime(justification.decision_at)}</span>}
          </div>
          <div className="meta-box">
            <strong>Termo enviado</strong>
            <p>{justification.description}</p>
          </div>
          {justification.decision_notes && <div className="meta-box"><strong>Observação da decisão</strong><p>{justification.decision_notes}</p></div>}
          {justification.forwarded_by && <p className="text-muted">Encaminhamento registrado pela Secretaria (usuário {justification.forwarded_by.slice(0, 8)}).</p>}
          {justification.status !== 'PENDENTE' && justification.coordinator_id && <p className="text-muted">Decisão registrada pelo Coordenador (usuário {justification.coordinator_id.slice(0, 8)}).</p>}

          {canForward && (
            <div className="form-group">
              <label className="form-label" htmlFor={`justification-coordinator-${absenceId}`}>Coordenador responsável</label>
              {coordinatorError ? <div className="alert-box alert-danger" role="alert">{coordinatorError}</div> : coordinators.length === 0 ? <p className="text-muted">Nenhum Coordenador ativo vinculado às turmas desta oferta.</p> : (
                <>
                  <select id={`justification-coordinator-${absenceId}`} className="form-input" value={selectedCoordinatorId} onChange={(event) => setSelectedCoordinatorId(event.target.value)} disabled={isBusy}>
                    {coordinators.map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.full_name}</option>)}
                  </select>
                  <button className="btn-primary" type="button" onClick={() => void handleForward()} disabled={isBusy || !selectedCoordinatorId}>{isBusy ? 'Encaminhando...' : 'Encaminhar ao Coordenador'}</button>
                </>
              )}
            </div>
          )}

          {canDecide && (
            <div className="form-group">
              <label className="form-label" htmlFor={`justification-notes-${absenceId}`}>Observação da decisão (opcional)</label>
              <textarea id={`justification-notes-${absenceId}`} className="form-input" rows={3} value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} disabled={isBusy} />
              <div className="card-footer-actions">
                <button className="btn-primary" type="button" onClick={() => void handleDecision('APROVADA')} disabled={isBusy}>{isBusy ? 'Registrando...' : 'Aprovar justificativa'}</button>
                <button className="btn-secondary" type="button" onClick={() => void handleDecision('REJEITADA')} disabled={isBusy}>{isBusy ? 'Registrando...' : 'Rejeitar justificativa'}</button>
              </div>
            </div>
          )}

          {canAcknowledge && <button className="btn-secondary" type="button" onClick={() => void handleReceipt()} disabled={isBusy}>{isBusy ? 'Registrando...' : 'Registrar recebimento do resultado'}</button>}
          {isSecretary && resultReceived && <p className="text-muted">Recebimento administrativo registrado.</p>}
        </>
      )}

      <div className="meta-box">
        <strong>Histórico</strong>
        {historyError ? <span role="alert">{historyError}</span> : history.length > 0 ? (
          <ul className="check-list">{history.map((event) => <li key={event.id}>{describeEvent(event.action)} — {formatDateTime(event.created_at)}{event.user_id ? ` (usuário ${event.user_id.slice(0, 8)})` : ''}</li>)}</ul>
        ) : <span>Nenhuma etapa auditada foi registrada.</span>}
      </div>
    </section>
  );
}
