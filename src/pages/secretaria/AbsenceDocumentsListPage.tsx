import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSecretaryAbsenceDocuments, type SecretaryDocumentListItem } from '../../services/absenceDocumentService';
import { formatDate } from '../absences/absenceFormatting';

export function AbsenceDocumentsListPage() {
  const [documents, setDocuments] = useState<SecretaryDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setDocuments(await fetchSecretaryAbsenceDocuments());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os atestados enviados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="page-stack">
    <section className="hero-card"><span className="badge-stage">Área da Secretaria de Coordenação</span><h2>Atestados enviados</h2><p className="lead-text" style={{ marginBottom: 0 }}>Consulte o recebimento e o tratamento administrativo dos documentos vinculados às ausências.</p></section>
    <section className="info-card">
      <div className="section-header-row"><h3>Documentos ({documents.length})</h3><button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={isLoading}>Atualizar</button></div>
      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {isLoading ? <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando atestados...</p></div> : documents.length === 0 ? <div className="state-box"><p className="text-muted">Nenhum atestado foi enviado.</p></div> : <div className="table-responsive"><table className="data-table"><thead><tr><th>Professor</th><th>Data da aula</th><th>Arquivo</th><th>Recebido em</th><th>Conferência</th><th>Encaminhamento</th><th>Ausência</th></tr></thead><tbody>
        {documents.map((document) => <tr key={document.id}>
          <td>{document.teacher_name}</td><td>{document.class_date ? formatDate(document.class_date) : '—'}</td>
          <td>{document.file_name}</td><td>{formatDate(document.created_at)}</td>
          <td>{document.review_status === 'CONFERIDO' ? 'Conferido' : 'Pendente'}</td><td>{document.forwarded_externally ? 'Encaminhado' : 'Não encaminhado'}</td>
          <td><Link className="text-link" to={`/secretaria/ausencias/${document.absence_id}`}>Abrir ausência</Link></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
