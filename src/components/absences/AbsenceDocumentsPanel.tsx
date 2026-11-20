import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  createAbsenceDocumentUrl,
  fetchAbsenceDocuments,
  fetchCoordinatorDocumentStatus,
  fetchDocumentHistory,
  markAbsenceDocumentForwarded,
  markAbsenceDocumentReviewed,
  removeAbsenceDocument,
  uploadAbsenceDocument,
  validateAbsenceDocument,
  type AbsenceDocumentItem,
  type CoordinatorDocumentStatus,
  type DocumentAuditEvent,
} from '../../services/absenceDocumentService';
import { formatDate } from '../../pages/absences/absenceFormatting';

function describeEvent(action: string): string {
  switch (action) {
    case 'ATESTADO_ENVIADO': return 'Atestado recebido';
    case 'ATESTADO_VERIFICADO': return 'Conferência administrativa registrada';
    case 'ATESTADO_ENCAMINHADO': return 'Encaminhamento externo registrado';
    case 'ATESTADO_REMOVIDO': return 'Atestado removido pelo Professor';
    default: return 'Atualização administrativa';
  }
}

function jsonValue(data: DocumentAuditEvent['new_data'], key: string): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>)[key];
}

export function AbsenceDocumentsPanel({ absenceId }: { absenceId: string }) {
  const { profile } = useAuth();
  const role = profile?.role;
  const isTeacher = role === 'PROFESSOR';
  const isSecretary = role === 'SECRETARIA';
  const isCoordinator = role === 'COORDENADOR';
  const [documents, setDocuments] = useState<AbsenceDocumentItem[]>([]);
  const [coordinatorStatuses, setCoordinatorStatuses] = useState<CoordinatorDocumentStatus[]>([]);
  const [history, setHistory] = useState<DocumentAuditEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!role) return;
    setIsLoading(true);
    setErrorMessage(null);
    setHistoryError(null);
    try {
      if (isCoordinator) {
        const statuses = await fetchCoordinatorDocumentStatus(absenceId);
        setCoordinatorStatuses(statuses);
        setDocuments([]);
      } else {
        const items = await fetchAbsenceDocuments(absenceId, role);
        setDocuments(items);
        setCoordinatorStatuses([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os atestados.');
      setHistory([]);
      setIsLoading(false);
      return;
    }

    try {
      setHistory(await fetchDocumentHistory(absenceId));
    } catch (error) {
      setHistory([]);
      setHistoryError(error instanceof Error ? error.message : 'Não foi possível carregar o histórico administrativo.');
    } finally {
      setIsLoading(false);
    }
  }, [absenceId, isCoordinator, role]);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setValidationMessage(null);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!file || !profile || !isTeacher) return;
    const validationError = validateAbsenceDocument(file);
    if (validationError) {
      setValidationMessage(validationError);
      return;
    }
    setIsBusy(true);
    try {
      await uploadAbsenceDocument({ absenceId, userId: profile.id, role: profile.role, file });
      setSuccessMessage('Atestado enviado com sucesso.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao enviar o atestado.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpen = async (document: AbsenceDocumentItem) => {
    if (!role || isCoordinator) return;
    const openedWindow = window.open('about:blank', '_blank');
    if (openedWindow) openedWindow.opener = null;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const url = await createAbsenceDocumentUrl(document, role);
      if (!openedWindow) throw new Error('O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.');
      openedWindow.location.replace(url);
    } catch (error) {
      openedWindow?.close();
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdministrativeAction = async (documentId: string, action: 'review' | 'forward') => {
    if (!profile || !isSecretary || isBusy) return;
    setIsBusy(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      if (action === 'review') await markAbsenceDocumentReviewed(documentId, profile.id);
      else await markAbsenceDocumentForwarded(documentId, profile.id);
      setSuccessMessage(action === 'review' ? 'Conferência administrativa registrada.' : 'Encaminhamento externo registrado.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o atestado.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async (document: AbsenceDocumentItem) => {
    if (!profile || !isTeacher || isBusy || document.created_by !== profile.id) return;
    const confirmed = window.confirm('Deseja realmente remover este atestado? Essa ação não poderá ser desfeita.');
    if (!confirmed) return;

    setIsBusy(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await removeAbsenceDocument({
        absenceId,
        documentId: document.id,
        userId: profile.id,
        role: profile.role,
      });
      setSuccessMessage('Atestado removido.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível remover o atestado.');
    } finally {
      setIsBusy(false);
    }
  };

  let coordinatorHasForwarded = false;
  for (const event of history) {
    const data = event.new_data;
    const forwarded = jsonValue(data, 'has_forwarded_externally');
    if (typeof forwarded === 'boolean') coordinatorHasForwarded = forwarded;
  }

  return (
    <section className="role-box" aria-labelledby="absence-documents-heading">
      <h3 id="absence-documents-heading">Atestados</h3>
      <p className="text-muted">Esta área registra o recebimento e o tratamento administrativo do documento; não avalia conteúdo médico nem decide a justificativa da ausência.</p>

      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {successMessage && <div className="alert-box alert-ok" role="status">{successMessage}</div>}
      {validationMessage && <div className="alert-box alert-danger" role="alert">{validationMessage}</div>}

      {isTeacher && <div className="form-group">
        <label className="form-label" htmlFor={`absence-document-${absenceId}`}>Enviar atestado (PDF, JPEG ou PNG, até 10 MB)</label>
        <input id={`absence-document-${absenceId}`} className="form-input" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" disabled={isBusy} onChange={(event) => void handleUpload(event)} />
      </div>}

      {isLoading ? <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando situação dos atestados...</p></div> : isCoordinator ? (
        coordinatorStatuses.length === 0 ? <p className="text-muted">Nenhum status de atestado disponível para esta ausência.</p> : <>
          <ul className="check-list">{coordinatorStatuses.map((status, index) => <li key={`${status.created_at}-${index}`}>
            Recebido — {status.review_status === 'CONFERIDO' ? 'conferido pela Secretaria' : 'aguardando conferência'}.
          </li>)}</ul>
          {history.length > 0 && <p className="text-muted">Encaminhamento externo registrado nesta ausência: {coordinatorHasForwarded ? 'sim' : 'não'}.</p>}
          <p className="text-muted">Os arquivos e seus metadados não são consultados ou exibidos neste perfil.</p>
        </>
      ) : documents.length === 0 ? <p className="text-muted">Nenhum atestado foi enviado para esta ausência.</p> : (
        <div className="table-responsive"><table className="data-table"><thead><tr><th>Arquivo</th><th>Recebido</th><th>Conferência</th><th>Encaminhamento</th><th>Ações</th></tr></thead><tbody>
          {documents.map((document) => <tr key={document.id}>
            <td>{document.file_name}<br /><span className="text-muted">{document.mime_type}</span></td>
            <td>{formatDate(document.created_at)}</td>
            <td>{document.review_status === 'CONFERIDO' ? `Conferido em ${document.reviewed_at ? formatDate(document.reviewed_at) : 'data indisponível'}` : 'Pendente'}</td>
            <td>{document.forwarded_externally ? `Encaminhado em ${document.forwarded_at ? formatDate(document.forwarded_at) : 'data indisponível'}` : 'Não encaminhado'}</td>
            <td><div className="header-actions-inline">
              <button className="btn-secondary btn-sm" type="button" onClick={() => void handleOpen(document)} disabled={isBusy}>Abrir arquivo</button>
              {isSecretary && document.review_status === 'PENDENTE' && <button className="btn-primary btn-sm" type="button" onClick={() => void handleAdministrativeAction(document.id, 'review')} disabled={isBusy}>Registrar conferência</button>}
              {isSecretary && !document.forwarded_externally && <button className="btn-secondary btn-sm" type="button" onClick={() => void handleAdministrativeAction(document.id, 'forward')} disabled={isBusy}>Registrar encaminhamento</button>}
              {isTeacher && profile?.id === document.created_by && document.review_status === 'PENDENTE' && !document.forwarded_externally && <button className="btn-secondary btn-sm" type="button" onClick={() => void handleRemove(document)} disabled={isBusy}>Remover</button>}
            </div></td>
          </tr>)}
        </tbody></table></div>
      )}

      <div className="meta-box">
        <strong>Histórico disponível</strong>
        {historyError ? <span role="alert">{historyError}</span> : history.length ? <ul className="check-list">{history.map((event) => <li key={event.id}>{describeEvent(event.action)} — {formatDate(event.created_at)}</li>)}</ul> : <span>Nenhum evento de auditoria foi registrado para esta ausência.</span>}
      </div>
    </section>
  );
}
