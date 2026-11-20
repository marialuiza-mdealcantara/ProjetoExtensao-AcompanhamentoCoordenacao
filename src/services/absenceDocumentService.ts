import { supabase } from './supabaseClient';
import { STORAGE_BUCKETS, STORAGE_CONSTRAINTS } from '../types/database';
import type { AbsenceDocumentRow, DocumentReviewStatus, Json, UserRole } from '../types/database';

export type AbsenceDocumentItem = Pick<AbsenceDocumentRow,
  'id' | 'absence_id' | 'storage_path' | 'file_name' | 'mime_type' |
  'review_status' | 'reviewed_by' | 'reviewed_at' | 'forwarded_externally' |
  'forwarded_by' | 'forwarded_at' | 'created_by' | 'created_at'>;

export interface CoordinatorDocumentStatus {
  review_status: DocumentReviewStatus;
  created_at: string;
}

export interface DocumentAuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  old_data: Json | null;
  new_data: Json | null;
  created_at: string;
}

export const ABSENCE_DOCUMENT_BUCKET = STORAGE_BUCKETS.ABSENCE_DOCUMENTS;

type SecureCrypto = Pick<Crypto, 'getRandomValues'> & {
  randomUUID?: () => string;
};

export function generateSecureFileIdentifier(
  cryptoApi: SecureCrypto | undefined = globalThis.crypto
): string {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Este navegador não disponibiliza um gerador criptográfico seguro.');
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function getClient() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

export function validateAbsenceDocument(file: File): string | null {
  if (file.size <= 0) return 'O arquivo está vazio.';
  if (file.size > STORAGE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) return 'O arquivo excede o limite de 10 MB.';
  if (!(STORAGE_CONSTRAINTS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato inválido. Envie PDF, JPEG ou PNG.';
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  if (!extension || allowedExtensions[extension] !== file.type) {
    return 'A extensão do arquivo não corresponde ao formato permitido.';
  }
  return null;
}

export async function fetchAbsenceDocuments(
  absenceId: string,
  role: UserRole
): Promise<AbsenceDocumentItem[]> {
  if (role === 'COORDENADOR') {
    throw new Error('O Coordenador consulta somente o status administrativo.');
  }
  const { data, error } = await getClient().from('absence_documents')
    .select('id, absence_id, storage_path, file_name, mime_type, review_status, reviewed_by, reviewed_at, forwarded_externally, forwarded_by, forwarded_at, created_by, created_at')
    .eq('absence_id', absenceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar os atestados desta ausência.');
  return (data ?? []) as AbsenceDocumentItem[];
}

export async function fetchCoordinatorDocumentStatus(absenceId: string): Promise<CoordinatorDocumentStatus[]> {
  const { data, error } = await getClient().from('absence_document_status')
    .select('review_status, created_at')
    .eq('absence_id', absenceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Não foi possível carregar o status administrativo do atestado.');
  return data ?? [];
}

export async function fetchDocumentHistory(absenceId: string): Promise<DocumentAuditEvent[]> {
  const { data, error } = await getClient().from('audit_logs')
    .select('id, user_id, action, old_data, new_data, created_at')
    .eq('entity_name', 'absence_document')
    .eq('entity_id', absenceId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error('Não foi possível carregar o histórico administrativo do atestado.');
  }
  return (data ?? []) as DocumentAuditEvent[];
}

export async function uploadAbsenceDocument(input: {
  absenceId: string;
  userId: string;
  role: UserRole;
  file: File;
}): Promise<void> {
  if (input.role !== 'PROFESSOR') throw new Error('Somente o professor titular pode enviar o próprio atestado.');
  const validationError = validateAbsenceDocument(input.file);
  if (validationError) throw new Error(validationError);

  const client = getClient();
  const extension = input.file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${input.absenceId}/${generateSecureFileIdentifier()}.${extension}`;
  const { error: uploadError } = await client.storage.from(ABSENCE_DOCUMENT_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (uploadError) throw new Error('Falha no envio para o armazenamento privado. Tente novamente.');

  const safeFileName = input.file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 255);
  const { error: rowError } = await client.from('absence_documents').insert({
    absence_id: input.absenceId,
    storage_path: path,
    file_name: safeFileName,
    mime_type: input.file.type,
    document_type: 'ATESTADO',
    created_by: input.userId,
  });
  if (rowError) {
    throw new Error('O arquivo foi enviado ao bucket privado, mas não foi possível registrar seus dados. Solicite à Secretaria que confira o envio antes de tentar novamente.');
  }
}

export async function createAbsenceDocumentUrl(
  document: AbsenceDocumentItem,
  role: UserRole
): Promise<string> {
  if (role === 'COORDENADOR') throw new Error('O Coordenador não possui acesso ao arquivo do atestado.');
  const { data, error } = await getClient().storage.from(ABSENCE_DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60);
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o arquivo. Verifique suas permissões e tente novamente.');
  return data.signedUrl;
}

export async function markAbsenceDocumentReviewed(documentId: string, userId: string): Promise<void> {
  const { data, error } = await getClient().from('absence_documents').update({
    review_status: 'CONFERIDO',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', documentId).eq('review_status', 'PENDENTE').select('id').maybeSingle();
  if (error) throw new Error('Não foi possível registrar a conferência administrativa do atestado.');
  if (!data) throw new Error('Este atestado já foi conferido ou não está disponível para atualização.');
}

export async function markAbsenceDocumentForwarded(documentId: string, userId: string): Promise<void> {
  const { data, error } = await getClient().from('absence_documents').update({
    forwarded_externally: true,
    forwarded_by: userId,
    forwarded_at: new Date().toISOString(),
  }).eq('id', documentId).eq('forwarded_externally', false).select('id').maybeSingle();
  if (error) throw new Error('Não foi possível registrar o encaminhamento externo.');
  if (!data) throw new Error('Este atestado já foi encaminhado ou não está disponível para atualização.');
}

async function restoreAbsenceDocumentObject(
  storage: ReturnType<typeof getClient>['storage'],
  path: string,
  contents: Blob,
  mimeType: string
): Promise<boolean> {
  try {
    const { error } = await storage.from(ABSENCE_DOCUMENT_BUCKET).upload(path, contents, {
      contentType: mimeType,
      upsert: false,
    });
    if (!error) return true;

    const { data: existingObject } = await storage.from(ABSENCE_DOCUMENT_BUCKET).download(path);
    return Boolean(existingObject);
  } catch {
    try {
      const { data: existingObject } = await storage.from(ABSENCE_DOCUMENT_BUCKET).download(path);
      return Boolean(existingObject);
    } catch {
      return false;
    }
  }
}

export async function removeAbsenceDocument(input: {
  absenceId: string;
  documentId: string;
  userId: string;
  role: UserRole;
}): Promise<void> {
  if (input.role !== 'PROFESSOR') {
    throw new Error('Somente o professor titular pode remover o próprio atestado.');
  }

  const client = getClient();
  const { data: document, error: documentError } = await client.from('absence_documents')
    .select('id, absence_id, storage_path, mime_type, review_status, forwarded_externally, created_by')
    .eq('id', input.documentId)
    .eq('absence_id', input.absenceId)
    .maybeSingle();
  if (documentError) throw new Error('Não foi possível verificar o atestado antes da remoção.');
  if (!document || document.created_by !== input.userId) {
    throw new Error('Atestado não encontrado ou sem permissão para removê-lo.');
  }
  if (document.review_status !== 'PENDENTE' || document.forwarded_externally) {
    throw new Error('Somente atestados pendentes e não encaminhados podem ser removidos.');
  }

  const storage = client.storage;
  let contents: Blob | null = null;
  let downloadError: unknown = null;
  try {
    const result = await storage.from(ABSENCE_DOCUMENT_BUCKET).download(document.storage_path);
    contents = result.data;
    downloadError = result.error;
  } catch (error) {
    downloadError = error;
  }
  if (downloadError || !contents) {
    throw new Error('Não foi possível preservar o arquivo para uma eventual restauração. Nenhum registro foi removido.');
  }

  let storageError: unknown = null;
  try {
    const result = await storage.from(ABSENCE_DOCUMENT_BUCKET).remove([document.storage_path]);
    storageError = result.error;
  } catch (error) {
    storageError = error;
  }
  if (storageError) {
    let stillPresent: Blob | null = null;
    try {
      const result = await storage.from(ABSENCE_DOCUMENT_BUCKET).download(document.storage_path);
      stillPresent = result.data;
    } catch {
      // The restore helper also checks whether an object already exists.
    }
    if (!stillPresent) {
      const restored = await restoreAbsenceDocumentObject(
        storage, document.storage_path, contents, document.mime_type
      );
      if (!restored) {
        throw new Error('A remoção do arquivo falhou e a restauração não pôde ser confirmada. Solicite suporte à Secretaria antes de tentar novamente.');
      }
    }
    throw new Error('Não foi possível remover o arquivo do Storage. O registro foi mantido.');
  }

  let deleted: { id: string } | null = null;
  let deleteError: unknown = null;
  try {
    const result = await client.from('absence_documents')
      .delete()
      .eq('id', input.documentId)
      .eq('absence_id', input.absenceId)
      .eq('created_by', input.userId)
      .eq('review_status', 'PENDENTE')
      .eq('forwarded_externally', false)
      .select('id')
      .maybeSingle();
    deleted = result.data;
    deleteError = result.error;
  } catch (error) {
    deleteError = error;
  }

  if (!deleteError && deleted) return;

  // A resposta pode ter se perdido depois do commit; confirme o estado antes de compensar.
  let remaining: { id: string } | null = null;
  let checkError: unknown = null;
  try {
    const result = await client.from('absence_documents')
      .select('id')
      .eq('id', input.documentId)
      .eq('absence_id', input.absenceId)
      .maybeSingle();
    remaining = result.data;
    checkError = result.error;
  } catch (error) {
    checkError = error;
  }
  if (!checkError && !remaining) return;

  const restored = await restoreAbsenceDocumentObject(
    storage, document.storage_path, contents, document.mime_type
  );
  if (!restored) {
    throw new Error('O registro do atestado foi mantido, mas o arquivo não pôde ser restaurado. Solicite suporte à Secretaria.');
  }
  if (checkError) {
    throw new Error('Não foi possível confirmar a exclusão do registro. O arquivo foi restaurado; confira o histórico antes de repetir.');
  }
  throw new Error('Não foi possível excluir o registro. O arquivo foi restaurado e o atestado continua pendente.');
}

export interface SecretaryDocumentListItem extends AbsenceDocumentItem {
  teacher_name: string;
  class_date: string | null;
}

export async function fetchSecretaryAbsenceDocuments(): Promise<SecretaryDocumentListItem[]> {
  const client = getClient();
  const { data, error } = await client.from('absence_documents')
    .select('id, absence_id, storage_path, file_name, mime_type, review_status, reviewed_by, reviewed_at, forwarded_externally, forwarded_by, forwarded_at, created_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar os atestados enviados.');
  const documents = (data ?? []) as AbsenceDocumentItem[];
  if (!documents.length) return [];

  const absenceIds = [...new Set(documents.map(({ absence_id }) => absence_id))];
  const { data: absences, error: absencesError } = await client.from('absences').select('id, teacher_id, occurrence_id').in('id', absenceIds);
  if (absencesError) throw new Error('Não foi possível carregar os vínculos das ausências.');
  const teacherIds = [...new Set((absences ?? []).map(({ teacher_id }) => teacher_id))];
  const occurrenceIds = [...new Set((absences ?? []).map(({ occurrence_id }) => occurrence_id))];
  const [teachersResult, occurrencesResult] = await Promise.all([
    client.from('profiles').select('id, full_name').in('id', teacherIds),
    client.from('class_occurrences').select('id, class_date').in('id', occurrenceIds),
  ]);
  if (teachersResult.error || occurrencesResult.error) throw new Error('Não foi possível carregar os dados das ausências.');
  const absencesById = new Map((absences ?? []).map((absence) => [absence.id, absence]));
  const teachersById = new Map((teachersResult.data ?? []).map((teacher) => [teacher.id, teacher.full_name]));
  const datesById = new Map((occurrencesResult.data ?? []).map((occurrence) => [occurrence.id, occurrence.class_date]));
  return documents.map((document) => {
    const absence = absencesById.get(document.absence_id);
    return {
      ...document,
      teacher_name: teachersById.get(absence?.teacher_id ?? '') ?? 'Professor indisponível',
      class_date: datesById.get(absence?.occurrence_id ?? '') ?? null,
    };
  });
}
