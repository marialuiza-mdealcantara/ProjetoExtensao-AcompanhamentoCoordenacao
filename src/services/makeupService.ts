import { supabase } from './supabaseClient';
import { fetchAbsenceById, fetchAbsences, type AbsenceDetails } from './absenceService';
import { generateSecureFileIdentifier, validateAbsenceDocument } from './absenceDocumentService';
import type {
  EvidenceType,
  MakeupEvidenceInsert,
  MakeupEvidenceRow,
  MakeupInsert,
  MakeupModality,
  MakeupRow,
  MakeupUpdate,
  UserRole,
} from '../types/database';
import { STORAGE_BUCKETS } from '../types/database';

export interface MakeupDetails extends MakeupRow {
  absence: AbsenceDetails | null;
  class_name: string;
  evidence: Pick<MakeupEvidenceRow, 'id' | 'makeup_id' | 'file_name' | 'evidence_type' | 'uploaded_by' | 'created_at'>[];
}

export interface MakeupClassOption {
  id: string;
  name: string;
}

function client() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

async function classesForAbsence(absenceId: string, userId: string) {
  const db = client();
  const { data: absence, error: absenceError } = await db.from('absences')
    .select('id, teacher_id, occurrence_id').eq('id', absenceId).maybeSingle();
  if (absenceError || !absence) throw new Error('A ausência selecionada não está disponível.');
  if (absence.teacher_id !== userId) throw new Error('Só é possível cadastrar uma reposição para sua própria ausência.');

  const { data: occurrence, error: occurrenceError } = await db.from('class_occurrences')
    .select('schedule_id').eq('id', absence.occurrence_id).maybeSingle();
  if (occurrenceError || !occurrence) throw new Error('Não foi possível localizar a ocorrência da ausência.');
  const { data: schedule, error: scheduleError } = await db.from('offering_schedules')
    .select('offering_id').eq('id', occurrence.schedule_id).maybeSingle();
  if (scheduleError || !schedule) throw new Error('Não foi possível localizar a oferta da ocorrência.');
  const { data: links, error: linksError } = await db.from('offering_classes')
    .select('class_id').eq('offering_id', schedule.offering_id);
  if (linksError) throw new Error('Não foi possível consultar as turmas da oferta.');
  return { absence, classIds: [...new Set((links ?? []).map(({ class_id }) => class_id))] };
}

export async function fetchMakeupClassesForAbsence(absenceId: string, userId: string): Promise<MakeupClassOption[]> {
  const { classIds } = await classesForAbsence(absenceId, userId);
  if (classIds.length === 0) return [];
  const { data, error } = await client().from('classes').select('id, name').in('id', classIds).order('name');
  if (error) throw new Error('Não foi possível carregar as turmas da ausência.');
  return data ?? [];
}

async function hydrate(rows: MakeupRow[], role: UserRole, userId: string): Promise<MakeupDetails[]> {
  if (rows.length === 0) return [];
  const db = client();
  const makeupIds = rows.map(({ id }) => id);
  const classIds = [...new Set(rows.map(({ class_id }) => class_id))];
  const [{ data: classRows, error: classError }, { data: evidenceRows, error: evidenceError }] = await Promise.all([
    db.from('classes').select('id, name').in('id', classIds),
    db.from('makeup_evidence').select('id, makeup_id, file_name, evidence_type, uploaded_by, created_at')
      .in('makeup_id', makeupIds).order('created_at', { ascending: false }),
  ]);
  if (classError || evidenceError) throw new Error('Não foi possível carregar os detalhes e evidências das reposições.');
  const absences = await Promise.all(rows.map((row) => fetchAbsenceById(row.absence_id, role, userId)));
  const classNames = new Map((classRows ?? []).map(({ id, name }) => [id, name]));
  const evidenceByMakeup = new Map<string, MakeupDetails['evidence']>();
  for (const item of evidenceRows ?? []) {
    const items = evidenceByMakeup.get(item.makeup_id) ?? [];
    items.push(item);
    evidenceByMakeup.set(item.makeup_id, items);
  }
  return rows.map((row, index) => ({
    ...row,
    absence: absences[index],
    class_name: classNames.get(row.class_id) ?? 'Turma não disponível',
    evidence: evidenceByMakeup.get(row.id) ?? [],
  }));
}

export async function fetchMakeups(role: UserRole, userId: string): Promise<MakeupDetails[]> {
  let query = client().from('makeups').select('*').order('makeup_date', { ascending: true });
  if (role === 'PROFESSOR') query = query.eq('teacher_id', userId);
  // Secretaria e Coordenador dependem do escopo aplicado pelo RLS.
  const { data, error } = await query;
  if (error) throw new Error('Não foi possível carregar as reposições.');
  return hydrate(data ?? [], role, userId);
}

export async function fetchMakeupById(id: string, role: UserRole, userId: string): Promise<MakeupDetails | null> {
  let query = client().from('makeups').select('*').eq('id', id);
  if (role === 'PROFESSOR') query = query.eq('teacher_id', userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Não foi possível carregar os detalhes da reposição.');
  if (!data) return null;
  return (await hydrate([data], role, userId))[0] ?? null;
}

export async function fetchMakeupEvidence(makeupId: string): Promise<MakeupDetails['evidence']> {
  const { data, error } = await client().from('makeup_evidence')
    .select('id, makeup_id, file_name, evidence_type, uploaded_by, created_at')
    .eq('makeup_id', makeupId).order('created_at', { ascending: false });
  if (error) throw new Error('Não foi possível consultar as evidências da reposição.');
  return data ?? [];
}

export function validateMakeupEvidence(file: File): string | null {
  return validateAbsenceDocument(file);
}

export async function uploadMakeupEvidence(input: {
  makeupId: string;
  teacherId: string;
  file: File;
  evidenceType: EvidenceType;
}): Promise<void> {
  const db = client();
  const validationMessage = validateMakeupEvidence(input.file);
  if (validationMessage) throw new Error(validationMessage);

  const { data: makeup, error: makeupError } = await db.from('makeups')
    .select('id, teacher_id, status').eq('id', input.makeupId).eq('teacher_id', input.teacherId).maybeSingle();
  if (makeupError || !makeup) throw new Error('Reposição não encontrada ou sem permissão para anexar evidência.');
  if (makeup.status !== 'PENDENTE') throw new Error('Só é possível enviar evidências enquanto a reposição estiver pendente.');

  const cleanName = input.file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 255);
  const extension = cleanName.split('.').pop()?.toLowerCase();
  if (!cleanName || !extension) throw new Error('O nome do arquivo é inválido.');
  const path = `${input.makeupId}/${generateSecureFileIdentifier()}.${extension}`;
  const bucket = db.storage.from(STORAGE_BUCKETS.MAKEUP_EVIDENCE);
  const { error: uploadError } = await bucket.upload(path, input.file, {
    contentType: input.file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw new Error('Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.');

  const payload: MakeupEvidenceInsert = {
    makeup_id: input.makeupId,
    storage_path: path,
    file_name: cleanName,
    evidence_type: input.evidenceType,
    uploaded_by: input.teacherId,
  };
  const { error: insertError } = await db.from('makeup_evidence').insert(payload);
  if (insertError) {
    const { error: cleanupError } = await bucket.remove([path]);
    if (cleanupError) {
      throw new Error('O registro da evidência falhou e a remoção compensatória do arquivo também falhou. A Secretaria deve verificar o Storage.');
    }
    throw new Error('Não foi possível registrar os dados da evidência. O arquivo enviado foi removido.');
  }
}

export async function createSecretaryEvidenceUrl(
  makeupId: string,
  evidenceId: string,
  role: UserRole
): Promise<string> {
  if (role !== 'SECRETARIA') throw new Error('Somente a Secretaria pode abrir o arquivo nesta interface.');
  const { data: evidence, error } = await client().from('makeup_evidence')
    .select('storage_path').eq('id', evidenceId).eq('makeup_id', makeupId).maybeSingle();
  if (error || !evidence) throw new Error('Evidência não encontrada ou sem permissão para abri-la.');
  const { data, error: signedUrlError } = await client().storage
    .from(STORAGE_BUCKETS.MAKEUP_EVIDENCE).createSignedUrl(evidence.storage_path, 300);
  if (signedUrlError || !data?.signedUrl) throw new Error('Não foi possível preparar o acesso temporário ao arquivo.');
  return data.signedUrl;
}

export async function verifyMakeup(makeupId: string): Promise<void> {
  const db = client();
  const { data: makeup, error: makeupError } = await db.from('makeups')
    .select('id, status, verified_by, verified_at').eq('id', makeupId).maybeSingle();
  if (makeupError || !makeup) throw new Error('Reposição não encontrada ou sem permissão para verificá-la.');
  if (makeup.status !== 'PENDENTE' || makeup.verified_by || makeup.verified_at) {
    throw new Error('A reposição não está pendente ou já possui conferência registrada.');
  }
  const evidence = await fetchMakeupEvidence(makeupId);
  if (evidence.length === 0) throw new Error('Envie ao menos uma evidência antes de registrar a reposição como realizada.');

  // O trigger proposto no banco preencherá verified_by e verified_at a partir de auth.uid() e do horário do servidor.
  const { data, error } = await db.from('makeups').update({ status: 'REALIZADA' })
    .eq('id', makeupId).eq('status', 'PENDENTE').select('id').maybeSingle();
  if (error || !data) {
    throw new Error('A conferência administrativa não foi concluída. Confirme que a migration de proteção foi aplicada e tente novamente.');
  }
}

async function restoreMakeupEvidenceObject(
  storage: ReturnType<typeof client>['storage'],
  path: string,
  contents: Blob
): Promise<boolean> {
  try {
    const { error } = await storage.from(STORAGE_BUCKETS.MAKEUP_EVIDENCE).upload(path, contents, {
      contentType: contents.type || 'application/octet-stream',
      upsert: false,
    });
    if (!error) return true;
    const { data: existing } = await storage.from(STORAGE_BUCKETS.MAKEUP_EVIDENCE).download(path);
    return Boolean(existing);
  } catch {
    try {
      const { data: existing } = await storage.from(STORAGE_BUCKETS.MAKEUP_EVIDENCE).download(path);
      return Boolean(existing);
    } catch {
      return false;
    }
  }
}

export async function removeMakeupEvidence(input: {
  makeupId: string;
  evidenceId: string;
  userId: string;
  role: UserRole;
}): Promise<void> {
  if (input.role !== 'PROFESSOR') {
    throw new Error('Somente o Professor titular pode excluir a própria evidência.');
  }

  const db = client();
  const { data: evidence, error: evidenceError } = await db.from('makeup_evidence')
    .select('id, makeup_id, storage_path, uploaded_by')
    .eq('id', input.evidenceId)
    .eq('makeup_id', input.makeupId)
    .maybeSingle();
  if (evidenceError) throw new Error('Não foi possível verificar a evidência antes da exclusão.');
  if (!evidence || evidence.uploaded_by !== input.userId) {
    throw new Error('Evidência não encontrada ou sem permissão para excluí-la.');
  }

  const { data: makeup, error: makeupError } = await db.from('makeups')
    .select('id, teacher_id, status')
    .eq('id', input.makeupId)
    .maybeSingle();
  if (makeupError || !makeup || makeup.teacher_id !== input.userId) {
    throw new Error('Reposição não encontrada ou sem permissão para alterá-la.');
  }
  if (makeup.status !== 'PENDENTE') {
    throw new Error('Evidências de reposições realizadas não podem ser excluídas pelo Professor.');
  }

  const storage = db.storage;
  const bucket = storage.from(STORAGE_BUCKETS.MAKEUP_EVIDENCE);
  let contents: Blob | null = null;
  let downloadError: unknown = null;
  try {
    const result = await bucket.download(evidence.storage_path);
    contents = result.data;
    downloadError = result.error;
  } catch (error) {
    downloadError = error;
  }
  if (downloadError || !contents) {
    throw new Error('Não foi possível preservar o arquivo para uma eventual restauração. Nenhum registro foi excluído.');
  }

  let storageError: unknown = null;
  let storageRemovalConfirmed = false;
  try {
    const result = await bucket.remove([evidence.storage_path]);
    storageError = result.error;
    storageRemovalConfirmed = Boolean(result.data?.some(({ name }) => name === evidence.storage_path));
  } catch (error) {
    storageError = error;
  }
  if (storageError || !storageRemovalConfirmed) {
    let stillPresent: Blob | null = null;
    try { stillPresent = (await bucket.download(evidence.storage_path)).data; } catch { /* restauração verifica também */ }
    if (!stillPresent && !(await restoreMakeupEvidenceObject(storage, evidence.storage_path, contents))) {
      throw new Error('A exclusão do arquivo falhou e ele não pôde ser restaurado. Solicite suporte à Secretaria.');
    }
    throw new Error('Não foi possível confirmar a exclusão do arquivo no Storage. O registro foi mantido.');
  }

  let deleted: { id: string } | null = null;
  let deleteError: unknown = null;
  try {
    const result = await db.from('makeup_evidence').delete()
      .eq('id', input.evidenceId)
      .eq('makeup_id', input.makeupId)
      .eq('uploaded_by', input.userId)
      .select('id')
      .maybeSingle();
    deleted = result.data;
    deleteError = result.error;
  } catch (error) {
    deleteError = error;
  }
  if (!deleteError && deleted) return;

  // Confirma o resultado antes de compensar uma resposta de rede ambígua.
  let remaining: { id: string } | null = null;
  let checkError: unknown = null;
  try {
    const result = await db.from('makeup_evidence').select('id')
      .eq('id', input.evidenceId).eq('makeup_id', input.makeupId).maybeSingle();
    remaining = result.data;
    checkError = result.error;
  } catch (error) {
    checkError = error;
  }
  if (!checkError && !remaining) return;

  const restored = await restoreMakeupEvidenceObject(storage, evidence.storage_path, contents);
  if (!restored) {
    throw new Error('O registro foi mantido, mas o arquivo não pôde ser restaurado. Solicite suporte à Secretaria.');
  }
  if (checkError) {
    throw new Error('Não foi possível confirmar a exclusão do registro. O arquivo foi restaurado; confira antes de repetir.');
  }
  throw new Error('Não foi possível excluir o registro. O arquivo foi restaurado e a evidência continua vinculada.');
}

export async function fetchTeacherMakeupAbsences(userId: string): Promise<AbsenceDetails[]> {
  return fetchAbsences('PROFESSOR', userId);
}

export async function createMakeup(input: {
  absenceId: string;
  classId: string;
  teacherId: string;
  makeupDate: string;
  startTime: string;
  endTime: string;
  modality: MakeupModality;
}): Promise<string> {
  if (input.endTime <= input.startTime) throw new Error('O horário final deve ser posterior ao horário inicial.');
  const { absence, classIds } = await classesForAbsence(input.absenceId, input.teacherId);
  if (!classIds.includes(input.classId)) throw new Error('A turma selecionada não pertence à oferta da ausência.');
  const payload: MakeupInsert = {
    absence_id: absence.id,
    class_id: input.classId,
    teacher_id: input.teacherId,
    makeup_date: input.makeupDate,
    start_time: input.startTime,
    end_time: input.endTime,
    modality: input.modality,
    status: 'PENDENTE',
    verified_by: null,
    verified_at: null,
  };
  const { data, error } = await client().from('makeups').insert(payload).select('id').single();
  if (error) throw new Error('Não foi possível cadastrar a reposição. Verifique suas permissões e tente novamente.');
  return data.id;
}

export async function rescheduleMakeup(input: {
  makeupId: string;
  teacherId: string;
  makeupDate: string;
  startTime: string;
  endTime: string;
  modality: MakeupModality;
}): Promise<void> {
  if (input.endTime <= input.startTime) throw new Error('O horário final deve ser posterior ao horário inicial.');
  const db = client();
  const { data: current, error: readError } = await db.from('makeups').select('id, status, teacher_id, verified_by, verified_at')
    .eq('id', input.makeupId).eq('teacher_id', input.teacherId).maybeSingle();
  if (readError || !current) throw new Error('Reposição não encontrada ou sem permissão para alterá-la.');
  if (current.status !== 'PENDENTE' || current.verified_by || current.verified_at) {
    throw new Error('Somente reposições pendentes podem ser reagendadas.');
  }
  const patch: MakeupUpdate = {
    makeup_date: input.makeupDate,
    start_time: input.startTime,
    end_time: input.endTime,
    modality: input.modality,
  };
  const { data, error } = await db.from('makeups').update(patch).eq('id', input.makeupId)
    .eq('teacher_id', input.teacherId).eq('status', 'PENDENTE').select('id').maybeSingle();
  if (error || !data) throw new Error('Não foi possível reagendar a reposição. Atualize a página e tente novamente.');
}

export function suggestedMakeupSaturday(from = new Date()): string {
  const firstOfMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  const lastOfNextMonth = new Date(from.getFullYear(), from.getMonth() + 2, 0);
  for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate()); day <= lastOfNextMonth; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 6) return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  }
  return `${firstOfMonth.getFullYear()}-${String(firstOfMonth.getMonth() + 1).padStart(2, '0')}-${String(firstOfMonth.getDate()).padStart(2, '0')}`;
}
