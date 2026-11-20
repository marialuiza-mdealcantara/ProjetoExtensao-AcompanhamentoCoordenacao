import { supabase } from './supabaseClient';
import type { AuditLogRow, JustificationRow, JustificationStatus } from '../types/database';

export interface JustificationCoordinatorOption {
  id: string;
  full_name: string;
}

function getClient() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

export async function fetchJustifications(): Promise<JustificationRow[]> {
  const { data, error } = await getClient().from('justifications')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar as justificativas autorizadas.');
  return data ?? [];
}

export async function fetchJustificationForAbsence(
  absenceId: string
): Promise<JustificationRow | null> {
  const { data, error } = await getClient().from('justifications')
    .select('*')
    .eq('absence_id', absenceId)
    .maybeSingle();
  if (error) throw new Error('Não foi possível carregar a justificativa desta ausência.');
  return data;
}

export async function fetchJustificationHistory(
  absenceId: string
): Promise<AuditLogRow[]> {
  const { data, error } = await getClient().from('audit_logs')
    .select('*')
    .eq('entity_name', 'justification')
    .eq('entity_id', absenceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Não foi possível carregar o histórico da justificativa.');
  return data ?? [];
}

export async function fetchResponsibleCoordinators(
  absenceId: string
): Promise<JustificationCoordinatorOption[]> {
  const client = getClient();
  const { data: absence, error: absenceError } = await client.from('absences')
    .select('occurrence_id')
    .eq('id', absenceId)
    .maybeSingle();
  if (absenceError || !absence) throw new Error('Não foi possível identificar os cursos desta ausência.');

  const { data: occurrence, error: occurrenceError } = await client.from('class_occurrences')
    .select('schedule_id')
    .eq('id', absence.occurrence_id)
    .maybeSingle();
  if (occurrenceError || !occurrence) throw new Error('Não foi possível identificar a oferta desta ausência.');

  const { data: schedule, error: scheduleError } = await client.from('offering_schedules')
    .select('offering_id')
    .eq('id', occurrence.schedule_id)
    .maybeSingle();
  if (scheduleError || !schedule) throw new Error('Não foi possível identificar a oferta desta ausência.');

  const { data: offeringClasses, error: offeringClassesError } = await client.from('offering_classes')
    .select('class_id')
    .eq('offering_id', schedule.offering_id);
  if (offeringClassesError) throw new Error('Não foi possível carregar as turmas da oferta.');
  const classIds = [...new Set((offeringClasses ?? []).map(({ class_id }) => class_id))];
  if (classIds.length === 0) return [];

  const { data: classes, error: classesError } = await client.from('classes')
    .select('course_id')
    .in('id', classIds);
  if (classesError) throw new Error('Não foi possível carregar os cursos da oferta.');
  const courseIds = [...new Set((classes ?? []).map(({ course_id }) => course_id))];
  if (courseIds.length === 0) return [];

  const { data: assignments, error: assignmentsError } = await client.from('user_courses')
    .select('user_id')
    .in('course_id', courseIds);
  if (assignmentsError) throw new Error('Não foi possível consultar os coordenadores responsáveis.');
  const coordinatorIds = [...new Set((assignments ?? []).map(({ user_id }) => user_id))];
  if (coordinatorIds.length === 0) return [];

  const { data: coordinators, error: coordinatorsError } = await client.from('profiles')
    .select('id, full_name')
    .in('id', coordinatorIds)
    .eq('role', 'COORDENADOR')
    .eq('active', true)
    .order('full_name', { ascending: true });
  if (coordinatorsError) throw new Error('Não foi possível carregar os coordenadores ativos.');
  return coordinators ?? [];
}

export async function submitJustification(
  absenceId: string,
  description: string
): Promise<void> {
  const text = description.trim();
  if (!text) throw new Error('Preencha o termo de justificativa antes de enviar.');

  const { error } = await getClient().from('justifications')
    .insert({ absence_id: absenceId, description: text });
  if (error?.code === '23505') throw new Error('Já existe uma justificativa para esta ausência.');
  if (error) throw new Error('Não foi possível enviar a justificativa.');
}

export async function forwardJustification(
  justificationId: string,
  coordinatorId: string
): Promise<void> {
  const { data, error } = await getClient().from('justifications')
    .update({ coordinator_id: coordinatorId })
    .eq('id', justificationId)
    .eq('status', 'PENDENTE')
    .is('forwarded_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Não foi possível encaminhar a justificativa ao Coordenador.');
  if (!data) throw new Error('A justificativa já foi encaminhada ou não está disponível.');
}

export async function decideJustification(
  justificationId: string,
  coordinatorId: string,
  status: Extract<JustificationStatus, 'APROVADA' | 'REJEITADA'>,
  notes: string
): Promise<void> {
  const { data, error } = await getClient().from('justifications')
    .update({ status, decision_notes: notes.trim() || null })
    .eq('id', justificationId)
    .eq('coordinator_id', coordinatorId)
    .eq('status', 'PENDENTE')
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Não foi possível registrar a decisão do Coordenador.');
  if (!data) throw new Error('A justificativa já foi decidida ou não está atribuída a este Coordenador.');
}

export async function registerResultReceipt(
  justification: JustificationRow,
  userId: string
): Promise<void> {
  if (justification.status === 'PENDENTE' || !justification.decision_at) {
    throw new Error('Ainda não há decisão final para registrar como recebida.');
  }
  const { error } = await getClient().from('audit_logs').insert({
    user_id: userId,
    entity_name: 'justification',
    entity_id: justification.absence_id,
    action: 'JUSTIFICATIVA_RESULTADO_RECEBIDO',
    new_data: {
      justification_id: justification.id,
      status: justification.status,
      decision_at: justification.decision_at,
    },
  });
  if (error?.code === '23505') throw new Error('O recebimento deste resultado já foi registrado.');
  if (error) throw new Error('Não foi possível registrar administrativamente o recebimento do resultado.');
}

export function isJustificationResultReceived(
  events: AuditLogRow[],
  justificationId: string
): boolean {
  return events.some((event) => {
    if (event.action !== 'JUSTIFICATIVA_RESULTADO_RECEBIDO' || !event.new_data) return false;
    const payload = event.new_data as Record<string, unknown>;
    return payload.justification_id === justificationId;
  });
}

export function justificationStatusLabel(status: JustificationStatus | null): string {
  switch (status) {
    case 'APROVADA': return 'Aprovada pelo Coordenador';
    case 'REJEITADA': return 'Rejeitada pelo Coordenador';
    case 'PENDENTE': return 'Aguardando decisão do Coordenador';
    default: return 'Sem justificativa';
  }
}
