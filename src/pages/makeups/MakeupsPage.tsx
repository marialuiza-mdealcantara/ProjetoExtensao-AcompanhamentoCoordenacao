import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  createMakeup,
  createSecretaryEvidenceUrl,
  fetchMakeupById,
  fetchMakeupClassesForAbsence,
  fetchMakeups,
  fetchTeacherMakeupAbsences,
  removeMakeupEvidence,
  rescheduleMakeup,
  suggestedMakeupSaturday,
  uploadMakeupEvidence,
  verifyMakeup,
  type MakeupClassOption,
  type MakeupDetails,
} from '../../services/makeupService';
import type { AbsenceDetails } from '../../services/absenceService';
import type { EvidenceType, MakeupModality } from '../../types/database';
import { formatDate } from '../absences/absenceFormatting';

function timeNowPlusHour(): string {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function statusLabel(status: MakeupDetails['status']) {
  return status === 'REALIZADA' ? 'Realizada' : 'Pendente';
}

const evidenceTypes: { value: EvidenceType; label: string }[] = [
  { value: 'LISTA_PRESENCA', label: 'Lista de presença' },
  { value: 'REGISTRO_AULA', label: 'Registro da aula' },
  { value: 'MATERIAL_ATIVIDADE', label: 'Material ou atividade' },
  { value: 'OUTRO', label: 'Outro' },
];

export function MakeupsPage() {
  const { profile } = useAuth();
  const { makeupId } = useParams();
  const [items, setItems] = useState<MakeupDetails[]>([]);
  const [selected, setSelected] = useState<MakeupDetails | null>(null);
  const [absences, setAbsences] = useState<AbsenceDetails[]>([]);
  const [classes, setClasses] = useState<MakeupClassOption[]>([]);
  const [absenceId, setAbsenceId] = useState('');
  const [classId, setClassId] = useState('');
  const [makeupDate, setMakeupDate] = useState(suggestedMakeupSaturday());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState(timeNowPlusHour());
  const [modality, setModality] = useState<MakeupModality>('PRESENCIAL');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('LISTA_PRESENCA');
  const [evidenceLinks, setEvidenceLinks] = useState<Record<string, string>>({});
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTeacher = profile?.role === 'PROFESSOR';
  const isSecretary = profile?.role === 'SECRETARIA';
  const basePath = isSecretary ? '/secretaria/reposicoes' : profile?.role === 'COORDENADOR' ? '/coordenacao/reposicoes' : '/professor/reposicoes';

  const load = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [makeupRows, absenceRows] = await Promise.all([
        fetchMakeups(profile.role, profile.id),
        isTeacher ? fetchTeacherMakeupAbsences(profile.id) : Promise.resolve([]),
      ]);
      setItems(makeupRows);
      setAbsences(absenceRows);
      if (makeupId) setSelected(await fetchMakeupById(makeupId, profile.role, profile.id));
      else setSelected(null);
    } catch (error) {
      setItems([]);
      setSelected(null);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as reposições.');
    } finally {
      setIsLoading(false);
    }
  }, [profile, isTeacher, makeupId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEvidenceLinks({});
    setMakeupDate(selected.makeup_date);
    setStartTime(selected.start_time.slice(0, 5));
    setEndTime(selected.end_time.slice(0, 5));
    setModality(selected.modality);
  }, [selected]);

  useEffect(() => {
    let active = true;
    if (!absenceId || !profile || !isTeacher) { setClasses([]); setClassId(''); return; }
    void fetchMakeupClassesForAbsence(absenceId, profile.id).then((options) => {
      if (active) { setClasses(options); setClassId(options[0]?.id ?? ''); }
    }).catch((error: unknown) => {
      if (active) {
        setClasses([]);
        setClassId('');
        setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as turmas.');
      }
    });
    return () => { active = false; };
  }, [absenceId, profile, isTeacher]);

  const selectedAbsence = useMemo(() => absences.find(({ id }) => id === absenceId) ?? null, [absences, absenceId]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !absenceId || !classId || isBusy) return;
    setIsBusy(true); setErrorMessage(null); setSuccessMessage(null);
    try {
      await createMakeup({ absenceId, classId, teacherId: profile.id, makeupDate, startTime, endTime, modality });
      setSuccessMessage('Reposição cadastrada como pendente.');
      setAbsenceId(''); setClasses([]); setClassId('');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível cadastrar a reposição.');
    } finally { setIsBusy(false); }
  };

  const submitReschedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !selected || isBusy) return;
    setIsBusy(true); setErrorMessage(null); setSuccessMessage(null);
    try {
      await rescheduleMakeup({ makeupId: selected.id, teacherId: profile.id, makeupDate, startTime, endTime, modality });
      setSuccessMessage('Reposição reagendada.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível reagendar a reposição.');
    } finally { setIsBusy(false); }
  };

  const submitEvidence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || !selected || !evidenceFile || isBusy) return;
    setIsBusy(true); setErrorMessage(null); setSuccessMessage(null);
    try {
      await uploadMakeupEvidence({ makeupId: selected.id, teacherId: profile.id, file: evidenceFile, evidenceType });
      setEvidenceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccessMessage('Evidência enviada e registrada.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar a evidência.');
    } finally { setIsBusy(false); }
  };

  const handleOpenEvidence = async (evidenceId: string) => {
    if (!profile || profile.role !== 'SECRETARIA' || !selected || openingEvidenceId) return;
    setOpeningEvidenceId(evidenceId); setErrorMessage(null);
    try {
      const url = await createSecretaryEvidenceUrl(selected.id, evidenceId, profile.role);
      setEvidenceLinks((current) => ({ ...current, [evidenceId]: url }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir a evidência.');
    } finally { setOpeningEvidenceId(null); }
  };

  const handleVerifyMakeup = async () => {
    if (!selected || !isSecretary || isBusy) return;
    if (!window.confirm('Confirma a conferência da evidência e o registro da reposição como realizada?')) return;
    setIsBusy(true); setErrorMessage(null); setSuccessMessage(null);
    try {
      await verifyMakeup(selected.id);
      setSuccessMessage('Evidência conferida. Reposição registrada como realizada.');
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir a conferência.');
    } finally { setIsBusy(false); }
  };

  const handleRemoveEvidence = async (evidenceId: string, uploadedBy: string) => {
    if (!profile || !isTeacher || !selected || uploadedBy !== profile.id || isBusy) return;
    if (!window.confirm('Deseja realmente excluir esta evidência? Essa ação não poderá ser desfeita.')) return;
    setIsBusy(true); setErrorMessage(null); setSuccessMessage(null);
    try {
      await removeMakeupEvidence({ makeupId: selected.id, evidenceId, userId: profile.id, role: profile.role });
      setSelected((current) => current
        ? { ...current, evidence: current.evidence.filter((evidence) => evidence.id !== evidenceId) }
        : current);
      setItems((current) => current.map((item) => item.id === selected.id
        ? { ...item, evidence: item.evidence.filter((evidence) => evidence.id !== evidenceId) }
        : item));
      setSuccessMessage('Evidência excluída.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível excluir a evidência.');
    } finally { setIsBusy(false); }
  };

  return (
    <section className="info-card">
      <span className="badge-stage">Registro e acompanhamento</span>
      <h2>Reposições</h2>
      <p className="lead-text">
        {isTeacher ? 'Cadastre ou reagende reposições vinculadas às suas ausências e acompanhe o status.' : isSecretary ? 'Consulte e acompanhe as reposições cadastradas.' : 'Acompanhe as reposições dos cursos sob sua responsabilidade.'}
      </p>
      <div className="card-footer-actions">
        <button className="btn-secondary" type="button" onClick={() => void load()} disabled={isLoading}>Atualizar lista</button>
      </div>
      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {successMessage && <div className="alert-box alert-ok" role="status">{successMessage}</div>}

      {isTeacher && !makeupId && (
        <form className="role-box" onSubmit={(event) => void submit(event)}>
          <h3>Cadastrar reposição</h3>
          <label className="form-label" htmlFor="makeup-absence">Ausência vinculada</label>
          <select id="makeup-absence" className="form-input" value={absenceId} onChange={(event) => setAbsenceId(event.target.value)} required>
            <option value="">Selecione uma ausência</option>
            {absences.map((absence) => <option key={absence.id} value={absence.id}>{formatDate(absence.class_date)} — {absence.subject_name} — {absence.classes.map(({ name }) => name).join(', ')}</option>)}
          </select>
          {absenceId && <>
            <label className="form-label" htmlFor="makeup-class">Turma da ausência</label>
            <select id="makeup-class" className="form-input" value={classId} onChange={(event) => setClassId(event.target.value)} required>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </>}
          <div className="form-grid-three">
            <div className="form-group"><label className="form-label" htmlFor="makeup-date">Data</label><input id="makeup-date" className="form-input" type="date" value={makeupDate} onChange={(event) => setMakeupDate(event.target.value)} required /><small>Data sugerida em sábado no mês atual ou seguinte; outros dias também são permitidos.</small></div>
            <div className="form-group"><label className="form-label" htmlFor="makeup-modality">Modalidade</label><select id="makeup-modality" className="form-input" value={modality} onChange={(event) => setModality(event.target.value as MakeupModality)}><option value="PRESENCIAL">Presencial</option><option value="REMOTA">Remota</option></select></div>
            <div className="form-group"><label className="form-label" htmlFor="makeup-start">Horário inicial</label><input id="makeup-start" className="form-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></div>
            <div className="form-group"><label className="form-label" htmlFor="makeup-end">Horário final</label><input id="makeup-end" className="form-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></div>
          </div>
          <div className="card-footer-actions"><button className="btn-primary" type="submit" disabled={isBusy || isLoading || !absenceId || !classId}>{isBusy ? 'Salvando...' : 'Cadastrar reposição'}</button></div>
          {selectedAbsence && <p className="text-muted">Ausência de {formatDate(selectedAbsence.class_date)} — {selectedAbsence.subject_name}.</p>}
        </form>
      )}

      {isLoading ? <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando reposições...</p></div>
        : items.length === 0 ? <div className="state-box"><h3>Nenhuma reposição cadastrada</h3><p className="text-muted">Os registros disponíveis aparecerão nesta lista.</p></div>
          : <div className="table-responsive"><table className="data-table"><thead><tr><th>Data</th>{!isTeacher && <th>Professor</th>}<th>Disciplina</th><th>Turma</th><th>Horário</th><th>Modalidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>
            {items.map((item) => <tr key={item.id}><td>{formatDate(item.makeup_date)}</td>{!isTeacher && <td>{item.absence?.teacher_name ?? '—'}</td>}<td>{item.absence?.subject_name ?? '—'}</td><td>{item.class_name}</td><td>{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</td><td>{item.modality === 'PRESENCIAL' ? 'Presencial' : 'Remota'}</td><td>{statusLabel(item.status)}</td><td><Link className="text-link" to={`${basePath}/${item.id}`}>Ver detalhes</Link></td></tr>)}
          </tbody></table></div>}

      {makeupId && selected && <section className="role-box">
        <div className="card-footer-actions"><h3>Detalhes da reposição</h3><Link className="text-link" to={basePath}>Voltar à lista</Link></div>
        <dl><dt>Status</dt><dd>{statusLabel(selected.status)}</dd><dt>Ausência</dt><dd>{selected.absence ? `${formatDate(selected.absence.class_date)} — ${selected.absence.subject_name}` : selected.absence_id}</dd><dt>Turma</dt><dd>{selected.class_name}</dd><dt>Data e horário</dt><dd>{formatDate(selected.makeup_date)}, {selected.start_time.slice(0, 5)}–{selected.end_time.slice(0, 5)}</dd><dt>Modalidade</dt><dd>{selected.modality === 'PRESENCIAL' ? 'Presencial' : 'Remota'}</dd></dl>
        <h4>Evidências</h4>{selected.evidence.length === 0 ? <p className="text-muted">Nenhuma evidência cadastrada.</p> : <ul>{selected.evidence.map((evidence) => <li key={evidence.id}>
          {evidence.file_name} — {evidenceTypes.find(({ value }) => value === evidence.evidence_type)?.label ?? evidence.evidence_type} — enviada em {formatDate(evidence.created_at)}
          {isTeacher && selected.teacher_id === profile?.id && selected.status === 'PENDENTE' && evidence.uploaded_by === profile.id && <button className="btn-secondary btn-sm" type="button" onClick={() => void handleRemoveEvidence(evidence.id, evidence.uploaded_by)} disabled={isBusy}>Excluir</button>}
          {isSecretary && <>{' '}<button className="btn-secondary btn-sm" type="button" onClick={() => void handleOpenEvidence(evidence.id)} disabled={openingEvidenceId === evidence.id}>{openingEvidenceId === evidence.id ? 'Preparando...' : evidenceLinks[evidence.id] ? 'Link pronto' : 'Preparar visualização'}</button>{evidenceLinks[evidence.id] && <a className="text-link" href={evidenceLinks[evidence.id]} target="_blank" rel="noreferrer"> Abrir arquivo</a>}</>}
        </li>)}</ul>}
        {isTeacher && selected.teacher_id === profile?.id && selected.status === 'PENDENTE' && !selected.verified_by && !selected.verified_at && <form className="create-user-form" onSubmit={(event) => void submitEvidence(event)}>
          <h4>Enviar evidência</h4>
          <div className="form-group"><label className="form-label" htmlFor="makeup-evidence-file">Arquivo (PDF, JPEG ou PNG; até 10 MB)</label><input ref={fileInputRef} id="makeup-evidence-file" className="form-input" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setEvidenceFile(event.currentTarget.files?.[0] ?? null)} required /></div>
          <div className="form-group"><label className="form-label" htmlFor="makeup-evidence-type">Tipo de evidência</label><select id="makeup-evidence-type" className="form-input" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}>{evidenceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <button className="btn-primary" type="submit" disabled={isBusy || !evidenceFile}>{isBusy ? 'Enviando...' : 'Enviar evidência'}</button>
        </form>}
        {isSecretary && selected.status === 'PENDENTE' && <div className="card-footer-actions"><button className="btn-primary" type="button" onClick={() => void handleVerifyMakeup()} disabled={isBusy || selected.evidence.length === 0}>{isBusy ? 'Registrando...' : 'Conferir e marcar como realizada'}</button></div>}
        {isTeacher && selected.teacher_id === profile?.id && selected.status === 'PENDENTE' && !selected.verified_by && !selected.verified_at && <form onSubmit={(event) => void submitReschedule(event)}>
          <h4>Reagendar reposição pendente</h4>
          <div className="form-grid-three"><div className="form-group"><label className="form-label" htmlFor="reschedule-date">Data</label><input id="reschedule-date" className="form-input" type="date" value={makeupDate} onChange={(event) => setMakeupDate(event.target.value)} required /></div><div className="form-group"><label className="form-label" htmlFor="reschedule-modality">Modalidade</label><select id="reschedule-modality" className="form-input" value={modality} onChange={(event) => setModality(event.target.value as MakeupModality)}><option value="PRESENCIAL">Presencial</option><option value="REMOTA">Remota</option></select></div><div className="form-group"><label className="form-label" htmlFor="reschedule-start">Horário inicial</label><input id="reschedule-start" className="form-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></div><div className="form-group"><label className="form-label" htmlFor="reschedule-end">Horário final</label><input id="reschedule-end" className="form-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></div></div>
          <div className="card-footer-actions"><button className="btn-primary" type="submit" disabled={isBusy}>{isBusy ? 'Salvando...' : 'Reagendar'}</button></div>
        </form>}
        {selected.status === 'PENDENTE' && <p className="text-muted">A reposição permanece pendente até a conferência administrativa da evidência.</p>}
      </section>}
      {makeupId && !isLoading && !selected && <div className="state-box"><h3>Reposição indisponível</h3><p>O registro não existe ou não está disponível para seu perfil.</p><Link className="text-link" to={basePath}>Voltar à lista</Link></div>}
    </section>
  );
}
