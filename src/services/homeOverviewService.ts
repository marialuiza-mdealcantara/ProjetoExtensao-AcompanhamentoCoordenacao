import { supabase } from './supabaseClient';
import type { UserRole } from '../types/database';
import type { DashboardActivity, DashboardPeriod } from './dashboardService';

interface RecentAbsenceRow {
  id: string;
  created_at: string;
  substitute_id: string | null;
  substitute_selected_at: string | null;
}

interface RecentMakeupRow {
  id: string;
  status: 'PENDENTE' | 'REALIZADA';
  updated_at: string;
}

interface RecentAuditRow {
  id: string;
  entity_name: string;
  action: string;
  created_at: string;
}

function client() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

function rolePaths(role: UserRole) {
  if (role === 'SECRETARIA') {
    return { absences: '/secretaria/ausencias', justifications: '/secretaria/justificativas', makeups: '/secretaria/reposicoes', documents: '/secretaria/atestados' };
  }
  if (role === 'COORDENADOR') {
    return { absences: '/coordenacao/ausencias', justifications: '/coordenacao/justificativas', makeups: '/coordenacao/reposicoes', documents: '/coordenacao/ausencias' };
  }
  return { absences: '/professor/ausencias', justifications: '/professor/justificativas', makeups: '/professor/reposicoes', documents: '/professor/ausencias' };
}

function auditLabel(event: RecentAuditRow) {
  const action = event.action.toLocaleUpperCase('pt-BR');
  if (event.entity_name === 'absence_document') {
    if (action.includes('REMOV')) return 'Atestado removido';
    if (action.includes('ENCAMINH')) return 'Atestado encaminhado';
    if (action.includes('CONFER') || action.includes('STATUS')) return 'Status administrativo do atestado atualizado';
    return 'Atestado registrado';
  }
  if (action.includes('APROV')) return 'Justificativa aprovada';
  if (action.includes('REJEIT')) return 'Justificativa rejeitada';
  if (action.includes('ENCAMINH')) return 'Justificativa encaminhada à Coordenação';
  if (action.includes('RECEB')) return 'Resultado da justificativa recebido pela Secretaria';
  return 'Justificativa atualizada';
}

/**
 * Busca somente eventos resumidos e metadados mínimos. RLS continua definindo
 * o escopo por perfil; payloads de auditoria, caminhos e nomes de arquivo não
 * são consultados.
 */
export async function fetchHomeRecentActivities(
  role: UserRole,
  userId: string,
  period: DashboardPeriod,
): Promise<DashboardActivity[]> {
  const db = client();
  const from = `${period.startDate}T00:00:00`;
  const to = `${period.endDate}T23:59:59.999`;
  const paths = rolePaths(role);

  let absenceQuery = db.from('absences')
    .select('id, created_at, substitute_id, substitute_selected_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(12);
  if (role === 'PROFESSOR') absenceQuery = absenceQuery.eq('teacher_id', userId);

  const [absencesResult, makeupsResult, auditResult] = await Promise.all([
    absenceQuery,
    db.from('makeups')
      .select('id, status, updated_at')
      .gte('updated_at', from)
      .lte('updated_at', to)
      .order('updated_at', { ascending: false })
      .limit(12),
    db.from('audit_logs')
      .select('id, entity_name, action, created_at')
      .in('entity_name', ['absence_document', 'justification'])
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  if (absencesResult.error || makeupsResult.error || auditResult.error) {
    throw new Error('Não foi possível carregar as atividades recentes autorizadas.');
  }

  const activities: DashboardActivity[] = [];
  for (const row of (absencesResult.data ?? []) as RecentAbsenceRow[]) {
    activities.push({ id: `absence-${row.id}`, label: 'Ausência registrada', occurredAt: row.created_at, href: paths.absences });
    if (row.substitute_id && row.substitute_selected_at && row.substitute_selected_at >= from && row.substitute_selected_at <= to) {
      activities.push({ id: `substitution-${row.id}`, label: 'Substituição confirmada', occurredAt: row.substitute_selected_at, href: paths.absences });
    }
  }
  for (const row of (makeupsResult.data ?? []) as RecentMakeupRow[]) {
    activities.push({ id: `makeup-${row.id}`, label: row.status === 'REALIZADA' ? 'Reposição realizada' : 'Reposição atualizada', occurredAt: row.updated_at, href: paths.makeups });
  }
  for (const row of (auditResult.data ?? []) as RecentAuditRow[]) {
    activities.push({
      id: `audit-${row.id}`,
      label: auditLabel(row),
      occurredAt: row.created_at,
      href: row.entity_name === 'justification' ? paths.justifications : paths.documents,
    });
  }

  return activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
}

export async function fetchCoordinatorPendingJustificationCount(userId: string): Promise<number> {
  const { count, error } = await client().from('justifications')
    .select('id', { count: 'exact', head: true })
    .eq('coordinator_id', userId)
    .eq('status', 'PENDENTE')
    .not('forwarded_at', 'is', null);
  if (error) throw new Error('Não foi possível consultar suas justificativas pendentes.');
  return count ?? 0;
}
