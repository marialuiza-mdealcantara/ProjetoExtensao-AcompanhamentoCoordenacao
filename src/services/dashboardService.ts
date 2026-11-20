import { supabase } from './supabaseClient';
import type { UserRole } from '../types/database';
import {
  aggregateDashboardIndicators,
  buildDashboardChartsData,
  type DashboardChartsData,
  type DashboardIndicators,
} from './dashboardAggregation';

export type { DashboardIndicators } from './dashboardAggregation';

export interface AcademicTermPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

export interface DashboardPeriod {
  startDate: string;
  endDate: string;
}

export interface DashboardActivity {
  id: string;
  label: string;
  occurredAt: string;
  href: string;
}

export interface DashboardData {
  indicators: DashboardIndicators;
  charts: DashboardChartsData;
  pendingActions: Array<{ id: string; label: string; count: number; href: string }>;
}

interface AbsenceDashboardRow {
  id: string;
  teacher_id: string;
  occurrence_id: string;
}

interface OccurrenceDashboardRow {
  id: string;
  class_date: string;
  classification: 'SUBSTITUIDA' | 'VAGA' | 'DISPENSADA' | null;
  schedule_id: string;
}

interface ScheduleDashboardRow { id: string; offering_id: string }
interface OfferingClassDashboardRow { offering_id: string; class_id: string }
interface ClassDashboardRow { id: string; course_id: string }
interface CourseDashboardRow { id: string; name: string }

interface MakeupDashboardRow {
  absence_id: string;
  status: 'PENDENTE' | 'REALIZADA';
}

interface DocumentDashboardRow {
  absence_id: string;
  review_status: 'PENDENTE' | 'CONFERIDO';
}

interface JustificationDashboardRow {
  absence_id: string;
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA';
  forwarded_at: string | null;
}

type PageResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type PageQuery<T> = (from: number, to: number) => PromiseLike<PageResponse<T>>;

async function fetchAllPages<T>(queryPage: PageQuery<T>, errorMessage: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw new Error(errorMessage);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

export async function fetchDashboardAcademicTerms(): Promise<AcademicTermPeriod[]> {
  const client = requireSupabase();
  return fetchAllPages(
    (from, to) => client.from('academic_terms')
      .select('id, name, start_date, end_date, active')
      .order('start_date', { ascending: false })
      .range(from, to),
    'Não foi possível carregar os semestres letivos.'
  );
}

export async function fetchDashboardData(
  role: UserRole,
  userId: string,
  period: DashboardPeriod
): Promise<DashboardData> {
  if (period.startDate > period.endDate) {
    throw new Error('A data inicial deve ser anterior ou igual à data final.');
  }

  const client = requireSupabase();
  const absences = await fetchAllPages<AbsenceDashboardRow>(
    (from, to) => {
      let query = client.from('absences')
        .select('id, teacher_id, occurrence_id')
        .order('created_at', { ascending: true });
      if (role === 'PROFESSOR') query = query.eq('teacher_id', userId);
      return query.range(from, to);
    },
    'Não foi possível carregar as ausências autorizadas.'
  );

  let occurrences: OccurrenceDashboardRow[] = [];
  if (role !== 'PROFESSOR') {
    occurrences = await fetchAllPages<OccurrenceDashboardRow>(
      (from, to) => client.from('class_occurrences')
        .select('id, class_date, classification, schedule_id')
        .gte('class_date', period.startDate)
        .lte('class_date', period.endDate)
        .order('class_date', { ascending: true })
        .range(from, to),
      'Não foi possível carregar as ocorrências autorizadas.'
    );
  } else {
    const occurrenceIds = [...new Set(absences.map(({ occurrence_id }) => occurrence_id))];
    if (occurrenceIds.length > 0) {
      occurrences = await fetchAllPages<OccurrenceDashboardRow>(
        (from, to) => client.from('class_occurrences')
          .select('id, class_date, classification, schedule_id')
          .in('id', occurrenceIds)
          .gte('class_date', period.startDate)
          .lte('class_date', period.endDate)
          .order('class_date', { ascending: true })
          .range(from, to),
        'Não foi possível carregar as ocorrências das suas ausências.'
      );
    }
  }

  const occurrenceIdsInPeriod = new Set(occurrences.map(({ id }) => id));
  const absenceIdsInPeriod = absences
    .filter(({ occurrence_id }) => occurrenceIdsInPeriod.has(occurrence_id))
    .map(({ id }) => id);

  if (absenceIdsInPeriod.length === 0) {
    return {
      indicators: aggregateDashboardIndicators({ role, absenceIds: [], occurrences, makeups: [], documents: [], justifications: [] }),
      charts: buildDashboardChartsData({ period, absences: [] }),
      pendingActions: [],
    };
  }

  const absenceIds = [...new Set(absenceIdsInPeriod)];
  const absenceIdSet = new Set(absenceIds);
  const occurrencesById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const periodAbsences = absences.filter(({ id, occurrence_id }) =>
    absenceIdSet.has(id) && occurrencesById.has(occurrence_id)
  );
  const scheduleIds = [...new Set(periodAbsences.map(({ occurrence_id }) => occurrencesById.get(occurrence_id)!.schedule_id))];
  const [makeups, justifications, documents, schedules] = await Promise.all([
    fetchAllPages<MakeupDashboardRow>(
      (from, to) => client.from('makeups')
        .select('absence_id, status')
        .in('absence_id', absenceIds)
        .range(from, to),
      'Não foi possível carregar as reposições autorizadas.'
    ),
    fetchAllPages<JustificationDashboardRow>(
        (from, to) => {
          let query = client.from('justifications')
            .select('absence_id, status, forwarded_at')
            .in('absence_id', absenceIds);
          if (role === 'COORDENADOR') query = query.eq('coordinator_id', userId);
          return query.range(from, to);
        },
        'Não foi possível carregar as justificativas autorizadas.'
      ),
    role === 'COORDENADOR'
      ? Promise.resolve([] as DocumentDashboardRow[])
      : fetchAllPages<DocumentDashboardRow>(
        (from, to) => client.from('absence_documents')
          .select('absence_id, review_status')
          .in('absence_id', absenceIds)
          .range(from, to),
        'Não foi possível carregar os status administrativos dos atestados.'
      ),
    fetchAllPages<ScheduleDashboardRow>(
      (from, to) => client.from('offering_schedules')
        .select('id, offering_id')
        .in('id', scheduleIds)
        .range(from, to),
      'Não foi possível carregar os horários das ocorrências.'
    ),
  ]);

  const offeringIds = [...new Set(schedules.map(({ offering_id }) => offering_id))];
  const offeringClasses = offeringIds.length > 0
    ? await fetchAllPages<OfferingClassDashboardRow>(
      (from, to) => client.from('offering_classes')
        .select('offering_id, class_id')
        .in('offering_id', offeringIds)
        .range(from, to),
      'Não foi possível carregar as turmas das ofertas.'
    )
    : [];
  const classIds = [...new Set(offeringClasses.map(({ class_id }) => class_id))];
  const classes = classIds.length > 0
    ? await fetchAllPages<ClassDashboardRow>(
      (from, to) => client.from('classes')
        .select('id, course_id')
        .in('id', classIds)
        .range(from, to),
      'Não foi possível carregar os cursos das turmas.'
    )
    : [];
  const courseIds = [...new Set(classes.map(({ course_id }) => course_id))];
  const courses = courseIds.length > 0
    ? await fetchAllPages<CourseDashboardRow>(
      (from, to) => client.from('courses')
        .select('id, name')
        .in('id', courseIds)
        .range(from, to),
      'Não foi possível carregar os nomes dos cursos.'
    )
    : [];

  const offeringIdBySchedule = new Map(schedules.map(({ id, offering_id }) => [id, offering_id]));
  const classIdsByOffering = new Map<string, string[]>();
  for (const link of offeringClasses) {
    const linkedClasses = classIdsByOffering.get(link.offering_id) ?? [];
    linkedClasses.push(link.class_id);
    classIdsByOffering.set(link.offering_id, linkedClasses);
  }
  const courseIdByClass = new Map(classes.map(({ id, course_id }) => [id, course_id]));
  const courseNameById = new Map(courses.map(({ id, name }) => [id, name]));
  const charts = buildDashboardChartsData({
    period,
    absences: periodAbsences.map((absence) => {
      const occurrence = occurrencesById.get(absence.occurrence_id);
      const offeringId = occurrence ? offeringIdBySchedule.get(occurrence.schedule_id) : undefined;
      const linkedClassIds = offeringId ? classIdsByOffering.get(offeringId) ?? [] : [];
      const courseNames = [...new Set(linkedClassIds
        .map((classId) => courseIdByClass.get(classId))
        .filter((courseId): courseId is string => Boolean(courseId))
        .map((courseId) => courseNameById.get(courseId))
        .filter((name): name is string => Boolean(name)))];
      return { classDate: occurrence!.class_date, courses: courseNames };
    }),
  });

  const indicators = aggregateDashboardIndicators({ role, absenceIds, occurrences, makeups, documents, justifications });
  const pendingActions: DashboardData['pendingActions'] = [];
  const addPending = (id: string, label: string, count: number, href: string) => {
    if (count > 0) pendingActions.push({ id, label, count, href });
  };
  if (role === 'SECRETARIA') {
    addPending('documents', 'Atestados aguardando conferência', indicators.pendingDocuments, '/secretaria/atestados');
    addPending('justifications', 'Justificativas aguardando decisão', indicators.justificationsAwaitingDecision, '/secretaria/justificativas');
    addPending('makeups', 'Reposições pendentes', indicators.pendingMakeups, '/secretaria/reposicoes');
  } else if (role === 'COORDENADOR') {
    addPending('justifications', 'Justificativas aguardando sua decisão', indicators.justificationsAwaitingDecision, '/coordenacao/justificativas');
    addPending('makeups', 'Reposições pendentes para acompanhamento', indicators.pendingMakeups, '/coordenacao/reposicoes');
  } else {
    addPending('documents', 'Seus atestados aguardando conferência', indicators.pendingDocuments, '/professor/ausencias');
    addPending('justifications', 'Suas justificativas pendentes', indicators.justificationsAwaitingDecision, '/professor/justificativas');
    addPending('makeups', 'Suas reposições pendentes', indicators.pendingMakeups, '/professor/reposicoes');
  }
  return { indicators, charts, pendingActions };
}
