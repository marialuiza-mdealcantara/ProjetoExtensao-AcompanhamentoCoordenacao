import type { UserRole } from '../types/database';

export interface DashboardIndicators {
  absences: number;
  substitutions: number;
  vacantClasses: number;
  dispensedClasses: number;
  pendingMakeups: number;
  completedMakeups: number;
  pendingDocuments: number;
  justificationsAwaitingDecision: number;
}

export interface DashboardOccurrenceStatus {
  classification: 'SUBSTITUIDA' | 'VAGA' | 'DISPENSADA' | null;
}

export interface DashboardMakeupStatus {
  status: 'PENDENTE' | 'REALIZADA';
}

export interface DashboardDocumentStatus {
  review_status: 'PENDENTE' | 'CONFERIDO';
}

export interface DashboardJustificationStatus {
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA';
  forwarded_at: string | null;
}

export interface AbsenceTimelinePoint {
  date: string;
  label: string;
  count: number;
}

export interface CourseAbsencePoint {
  course: string;
  count: number;
}

export interface DashboardChartsData {
  absenceTimeline: AbsenceTimelinePoint[];
  absencesByCourse: CourseAbsencePoint[];
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function moveDate(date: Date, granularity: 'day' | 'week' | 'month'): Date {
  const next = new Date(date);
  if (granularity === 'day') next.setDate(next.getDate() + 1);
  else if (granularity === 'week') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function binStart(date: Date, granularity: 'day' | 'week' | 'month'): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (granularity === 'month') start.setDate(1);
  return start;
}

function timelineLabel(value: string, granularity: 'day' | 'week' | 'month'): string {
  const date = parseDate(value);
  if (granularity === 'month') return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return granularity === 'week' ? `Sem. ${day}` : day;
}

export function buildDashboardChartsData(input: {
  period: { startDate: string; endDate: string };
  absences: Array<{ classDate: string; courses: string[] }>;
}): DashboardChartsData {
  const start = parseDate(input.period.startDate);
  const end = parseDate(input.period.endDate);
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const granularity = totalDays <= 14 ? 'day' : totalDays <= 120 ? 'week' : 'month';
  const startBin = binStart(start, granularity);
  const endBin = binStart(end, granularity);
  const countsByBin = new Map<string, number>();
  for (let date = startBin; date <= endBin; date = moveDate(date, granularity)) {
    countsByBin.set(dateValue(date), 0);
  }

  const courses = new Map<string, number>();
  for (const absence of input.absences) {
    const date = parseDate(absence.classDate);
    const key = dateValue(binStart(date, granularity));
    if (countsByBin.has(key)) countsByBin.set(key, (countsByBin.get(key) ?? 0) + 1);
    for (const course of new Set(absence.courses)) {
      courses.set(course, (courses.get(course) ?? 0) + 1);
    }
  }

  return {
    absenceTimeline: [...countsByBin].map(([date, count]) => ({
      date,
      label: timelineLabel(date, granularity),
      count,
    })),
    absencesByCourse: [...courses]
      .map(([course, count]) => ({ course, count }))
      .sort((a, b) => b.count - a.count || a.course.localeCompare(b.course, 'pt-BR')),
  };
}

export function aggregateDashboardIndicators(input: {
  role: UserRole;
  absenceIds: string[];
  occurrences: DashboardOccurrenceStatus[];
  makeups: DashboardMakeupStatus[];
  documents: DashboardDocumentStatus[];
  justifications: DashboardJustificationStatus[];
}): DashboardIndicators {
  return {
    absences: input.absenceIds.length,
    substitutions: input.occurrences.filter(({ classification }) => classification === 'SUBSTITUIDA').length,
    vacantClasses: input.occurrences.filter(({ classification }) => classification === 'VAGA').length,
    dispensedClasses: input.occurrences.filter(({ classification }) => classification === 'DISPENSADA').length,
    pendingMakeups: input.makeups.filter(({ status }) => status === 'PENDENTE').length,
    completedMakeups: input.makeups.filter(({ status }) => status === 'REALIZADA').length,
    pendingDocuments: input.documents.filter(({ review_status }) => review_status === 'PENDENTE').length,
    justificationsAwaitingDecision: input.justifications.filter(({ status, forwarded_at }) =>
      status === 'PENDENTE' && (input.role === 'PROFESSOR' || forwarded_at !== null)
    ).length,
  };
}
