import { supabase } from './supabaseClient';
import type {
  AbsenceInsert,
  AbsenceRow,
  ClassificationStatus,
  SubstituteSuggestionInsert,
  SubstituteSuggestionRow,
  UserRole,
} from '../types/database';

type Relation<T> = T | T[] | null | undefined;

interface TeacherOption {
  id: string;
  full_name: string;
  email: string;
}

interface CourseClassInfo {
  name: string;
  courseName: string;
}

export interface AvailableOccurrence {
  id: string;
  class_date: string;
  teacher_id: string;
  teacher_name: string;
  subject_name: string;
  term_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
  classes: CourseClassInfo[];
}

export interface AbsenceDetails extends AbsenceRow {
  teacher_name: string;
  teacher_email: string;
  substitute_name: string | null;
  class_date: string;
  classification: ClassificationStatus | null;
  dispensation_id: string | null;
  suggestion_count: number;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subject_name: string;
  term_name: string;
  classes: CourseClassInfo[];
}

interface RawCourse {
  name: string;
  active: boolean;
}

interface RawClass {
  id: string;
  name: string;
  active: boolean;
  courses: Relation<RawCourse>;
}

interface RawOfferingClass {
  classes: Relation<RawClass>;
}

interface RawOccurrence {
  id: string;
  class_date: string;
  classification: ClassificationStatus | null;
  dispensation_id: string | null;
}

export interface SubstituteCandidate {
  teacher_id: string;
  full_name: string;
}

interface RawSchedule {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
  occurrences: Relation<RawOccurrence>;
}

interface RawTeacher extends TeacherOption {
  active: boolean;
  role: string | null;
}

interface RawOffering {
  id: string;
  teacher_id: string;
  active: boolean;
  teacher: Relation<RawTeacher>;
  subject: Relation<{ name: string; active: boolean }>;
  term: Relation<{
    name: string;
    start_date: string;
    end_date: string;
    active: boolean;
  }>;
  schedules: Relation<RawSchedule>;
  offering_classes: Relation<RawOfferingClass>;
}

function asArray<T>(value: Relation<T>): T[] {
  if (Array.isArray(value)) return value as T[];
  return value ? [value as T] : [];
}

function first<T>(value: Relation<T>): T | null {
  return asArray(value)[0] ?? null;
}

function getClasses(offeringClasses: Relation<RawOfferingClass>): CourseClassInfo[] {
  return asArray(offeringClasses)
    .map(({ classes }) => first(classes))
    .filter((classInfo): classInfo is RawClass => Boolean(classInfo?.active))
    .map((classInfo) => {
      const course = first(classInfo.courses);
      return course?.active
        ? { name: classInfo.name, courseName: course.name }
        : null;
    })
    .filter((classInfo): classInfo is CourseClassInfo => classInfo !== null)
    .sort((a, b) =>
      `${a.courseName} ${a.name}`.localeCompare(
        `${b.courseName} ${b.name}`,
        'pt-BR'
      )
    );
}

async function hydrateAbsences(rows: AbsenceRow[]): Promise<AbsenceDetails[]> {
  if (!supabase || rows.length === 0) return [];

  const occurrenceIds = [...new Set(rows.map(({ occurrence_id }) => occurrence_id))];
  const teacherIds = [...new Set(rows.flatMap(({ teacher_id, substitute_id }) =>
    substitute_id ? [teacher_id, substitute_id] : [teacher_id]
  ))];
  const [occurrencesResult, teachersResult, suggestionsResult] = await Promise.all([
    supabase
      .from('class_occurrences')
      .select('id, class_date, schedule_id, classification, dispensation_id')
      .in('id', occurrenceIds),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', teacherIds),
    supabase
      .from('substitute_suggestions')
      .select('absence_id')
      .in('absence_id', rows.map(({ id }) => id)),
  ]);
  if (occurrencesResult.error || teachersResult.error || suggestionsResult.error) {
    throw new Error('Não foi possível carregar os detalhes das ausências.');
  }

  const occurrences = occurrencesResult.data ?? [];
  const scheduleIds = [...new Set(occurrences.map(({ schedule_id }) => schedule_id))];
  if (scheduleIds.length === 0) return [];

  const schedulesResult = await supabase
    .from('offering_schedules')
    .select('id, offering_id, weekday, start_time, end_time, room')
    .in('id', scheduleIds);
  if (schedulesResult.error) {
    throw new Error('Não foi possível carregar os horários das aulas.');
  }

  const schedules = schedulesResult.data ?? [];
  const offeringIds = [...new Set(schedules.map(({ offering_id }) => offering_id))];
  if (offeringIds.length === 0) return [];

  const [offeringsResult, offeringClassesResult] = await Promise.all([
    supabase
      .from('offerings')
      .select('id, subject_id, term_id')
      .in('id', offeringIds),
    supabase
      .from('offering_classes')
      .select('offering_id, class_id')
      .in('offering_id', offeringIds),
  ]);
  if (offeringsResult.error || offeringClassesResult.error) {
    throw new Error('Não foi possível carregar as ofertas e turmas das aulas.');
  }

  const offerings = offeringsResult.data ?? [];
  const offeringClasses = offeringClassesResult.data ?? [];
  const classIds = [...new Set(offeringClasses.map(({ class_id }) => class_id))];
  const subjectIds = [...new Set(offerings.map(({ subject_id }) => subject_id))];
  const termIds = [...new Set(offerings.map(({ term_id }) => term_id))];
  const [classesResult, subjectsResult, termsResult] = await Promise.all([
    supabase.from('classes').select('id, name, course_id').in('id', classIds),
    supabase.from('subjects').select('id, name').in('id', subjectIds),
    supabase.from('academic_terms').select('id, name').in('id', termIds),
  ]);
  if (classesResult.error || subjectsResult.error || termsResult.error) {
    throw new Error('Não foi possível carregar os dados acadêmicos das aulas.');
  }

  const classes = classesResult.data ?? [];
  const courseIds = [...new Set(classes.map(({ course_id }) => course_id))];
  const coursesResult = await supabase
    .from('courses')
    .select('id, name')
    .in('id', courseIds);
  if (coursesResult.error) {
    throw new Error('Não foi possível carregar os cursos das turmas.');
  }

  const occurrenceById = new Map(occurrences.map((row) => [row.id, row]));
  const scheduleById = new Map(schedules.map((row) => [row.id, row]));
  const offeringById = new Map(offerings.map((row) => [row.id, row]));
  const classById = new Map(classes.map((row) => [row.id, row]));
  const courseById = new Map((coursesResult.data ?? []).map((row) => [row.id, row]));
  const subjectById = new Map((subjectsResult.data ?? []).map((row) => [row.id, row]));
  const termById = new Map((termsResult.data ?? []).map((row) => [row.id, row]));
  const teacherById = new Map((teachersResult.data ?? []).map((row) => [row.id, row]));
  const suggestionCounts = new Map<string, number>();
  for (const suggestion of suggestionsResult.data ?? []) {
    suggestionCounts.set(
      suggestion.absence_id,
      (suggestionCounts.get(suggestion.absence_id) ?? 0) + 1
    );
  }
  const classesByOffering = new Map<string, CourseClassInfo[]>();

  for (const offeringClass of offeringClasses) {
    const classRow = classById.get(offeringClass.class_id);
    const course = classRow ? courseById.get(classRow.course_id) : undefined;
    if (!classRow || !course) continue;
    const linkedClasses = classesByOffering.get(offeringClass.offering_id) ?? [];
    linkedClasses.push({ name: classRow.name, courseName: course.name });
    classesByOffering.set(offeringClass.offering_id, linkedClasses);
  }

  return rows.flatMap((row) => {
    const occurrence = occurrenceById.get(row.occurrence_id);
    const schedule = occurrence ? scheduleById.get(occurrence.schedule_id) : undefined;
    const offering = schedule ? offeringById.get(schedule.offering_id) : undefined;
    const teacher = teacherById.get(row.teacher_id);
    const substitute = row.substitute_id
      ? teacherById.get(row.substitute_id)
      : undefined;
    const subject = offering ? subjectById.get(offering.subject_id) : undefined;
    const term = offering ? termById.get(offering.term_id) : undefined;
    if (!occurrence || !schedule || !offering) {
      return [];
    }

    return [{
      ...row,
      teacher_name: teacher?.full_name ?? `Professor (ID ${row.teacher_id.slice(0, 8)})`,
      teacher_email: teacher?.email ?? '',
      substitute_name: substitute?.full_name ?? null,
      class_date: occurrence.class_date,
      classification: occurrence.classification,
      dispensation_id: occurrence.dispensation_id,
      suggestion_count: suggestionCounts.get(row.id) ?? 0,
      weekday: schedule.weekday,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      room: schedule.room,
      subject_name: subject?.name ?? 'Disciplina não disponível',
      term_name: term?.name ?? 'Período não disponível',
      classes: classesByOffering.get(offering.id) ?? [],
    }];
  });
}

const AVAILABLE_OCCURRENCE_SELECT = `
  id, teacher_id, active,
  teacher:profiles!offerings_teacher_id_fkey(id, full_name, email, active, role),
  subject:subjects!offerings_subject_id_fkey(name, active),
  term:academic_terms!offerings_term_id_fkey(name, start_date, end_date, active),
  schedules:offering_schedules!offering_schedules_offering_id_fkey(
    id, weekday, start_time, end_time, room,
    occurrences:class_occurrences!class_occurrences_schedule_id_fkey(
      id, class_date, classification, dispensation_id
    )
  ),
  offering_classes:offering_classes!offering_classes_offering_id_fkey(
    classes:classes!offering_classes_class_id_fkey(
      id, name, active,
      courses:courses!classes_course_id_fkey(name, active)
    )
  )
`;

export async function fetchAvailableSubstitutes(
  absenceId: string
): Promise<SubstituteCandidate[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  const { data, error } = await supabase.rpc(
    'substitution_v2_available_substitutes',
    { p_absence_id: absenceId }
  );

  if (error) {
    throw new Error('Não foi possível carregar os professores substitutos disponíveis.');
  }

  return data ?? [];
}

export async function recordSubstitutionDecision(
  absenceId: string,
  substituteId: string | null
): Promise<void> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  const { error } = await supabase.rpc('substitution_v2_record_decision', {
    p_absence_id: absenceId,
    p_substitute_id: substituteId,
  });

  if (error) {
    throw new Error(error.message || 'Não foi possível registrar a decisão de substituição.');
  }
}

export async function fetchSubstituteSuggestions(
  absenceId: string
): Promise<SubstituteSuggestionRow[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  const { data, error } = await supabase
    .from('substitute_suggestions')
    .select('*')
    .eq('absence_id', absenceId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Não foi possível carregar as sugestões de substituição.');
  }
  return data ?? [];
}

export async function createSubstituteSuggestions(
  absenceId: string,
  teacherIds: string[],
  suggestedBy: string
): Promise<SubstituteSuggestionRow[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  const uniqueTeacherIds = [...new Set(teacherIds)];
  if (uniqueTeacherIds.length === 0) return [];

  const [availableCandidates, existingSuggestions] = await Promise.all([
    fetchAvailableSubstitutes(absenceId),
    fetchSubstituteSuggestions(absenceId),
  ]);
  const availableIds = new Set(availableCandidates.map(({ teacher_id }) => teacher_id));
  if (uniqueTeacherIds.some((id) => !availableIds.has(id) || id === suggestedBy)) {
    throw new Error('Uma das sugestões não está disponível para esta ocorrência. Atualize a lista.');
  }

  const existingIds = new Set(
    existingSuggestions.map(({ suggested_teacher_id }) => suggested_teacher_id)
  );
  const newTeacherIds = uniqueTeacherIds.filter((id) => !existingIds.has(id));
  if (newTeacherIds.length === 0) {
    throw new Error('Esses professores já foram sugeridos para esta ausência.');
  }

  const payload: SubstituteSuggestionInsert[] = newTeacherIds.map((teacherId) => ({
    absence_id: absenceId,
    suggested_teacher_id: teacherId,
    suggested_by: suggestedBy,
  }));
  const { data, error } = await supabase
    .from('substitute_suggestions')
    .insert(payload)
    .select('*');

  if (error?.code === '23505') {
    throw new Error('Uma ou mais sugestões já foram registradas. Atualize a lista.');
  }
  if (error) {
    throw new Error('Não foi possível registrar as sugestões de substituição.');
  }
  return data ?? [];
}

export async function fetchActiveTeachers(): Promise<TeacherOption[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'PROFESSOR')
    .eq('active', true)
    .order('full_name', { ascending: true });

  if (error) throw new Error('Não foi possível carregar os professores ativos.');
  return data ?? [];
}

export async function fetchAvailableOccurrences(
  role: UserRole,
  currentUserId: string,
  selectedTeacherId?: string
): Promise<AvailableOccurrence[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  if (role === 'SECRETARIA' && !selectedTeacherId) return [];

  const teacherId = role === 'PROFESSOR' ? currentUserId : selectedTeacherId;
  let offeringsQuery = supabase
    .from('offerings')
    .select(AVAILABLE_OCCURRENCE_SELECT)
    .eq('active', true);

  if (teacherId) offeringsQuery = offeringsQuery.eq('teacher_id', teacherId);

  const { data: offeringsData, error: offeringsError } = await offeringsQuery;
  if (offeringsError) {
    throw new Error('Não foi possível carregar as ofertas de aula disponíveis.');
  }

  const offerings = (offeringsData ?? []) as unknown as RawOffering[];
  const candidates: AvailableOccurrence[] = [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const offering of offerings) {
    const teacher = first(offering.teacher);
    const subject = first(offering.subject);
    const term = first(offering.term);
    const classes = getClasses(offering.offering_classes);

    if (
      !offering.active ||
      !teacher?.active ||
      teacher.role !== 'PROFESSOR' ||
      !subject?.active ||
      !term?.active ||
      classes.length === 0
    ) {
      continue;
    }

    for (const schedule of asArray(offering.schedules)) {
      for (const occurrence of asArray(schedule.occurrences)) {
        const occurrenceDay = new Date(`${occurrence.class_date}T00:00:00Z`).getUTCDay();
        if (
          occurrence.classification !== null ||
          occurrence.dispensation_id !== null ||
          occurrence.class_date < today ||
          occurrence.class_date < term.start_date ||
          occurrence.class_date > term.end_date ||
          occurrenceDay !== schedule.weekday
        ) {
          continue;
        }

        candidates.push({
          id: occurrence.id,
          class_date: occurrence.class_date,
          teacher_id: offering.teacher_id,
          teacher_name: teacher.full_name,
          subject_name: subject.name,
          term_name: term.name,
          weekday: schedule.weekday,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          room: schedule.room,
          classes,
        });
      }
    }
  }

  if (candidates.length === 0) return [];

  const occurrenceIds = [...new Set(candidates.map(({ id }) => id))];
  const { data: linkedAbsences, error: absencesError } = await supabase
    .from('absences')
    .select('occurrence_id')
    .in('occurrence_id', occurrenceIds);

  if (absencesError) {
    throw new Error('Não foi possível verificar quais ocorrências já têm ausência.');
  }

  const unavailableIds = new Set(
    (linkedAbsences ?? []).map(({ occurrence_id }) => occurrence_id)
  );

  return candidates
    .filter(({ id }) => !unavailableIds.has(id))
    .sort((a, b) =>
      `${a.class_date} ${a.start_time}`.localeCompare(
        `${b.class_date} ${b.start_time}`
      )
    );
}

export async function fetchAbsences(
  role: UserRole,
  currentUserId: string
): Promise<AbsenceDetails[]> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  let query = supabase
    .from('absences')
    .select('*')
    .order('created_at', { ascending: false });

  if (role === 'PROFESSOR') query = query.eq('teacher_id', currentUserId);

  const { data, error } = await query;
  if (error) throw new Error('Não foi possível carregar os registros de ausência.');

  return hydrateAbsences(data ?? []);
}

export async function fetchAbsenceById(
  absenceId: string,
  role: UserRole,
  currentUserId: string
): Promise<AbsenceDetails | null> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  let query = supabase.from('absences').select('*').eq('id', absenceId);

  if (role === 'PROFESSOR') query = query.eq('teacher_id', currentUserId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Não foi possível carregar os detalhes da ausência.');
  if (!data) return null;

  const [absence] = await hydrateAbsences([data]);
  return absence ?? null;
}

export async function createAbsence(input: {
  occurrenceId: string;
  teacherId: string;
  createdBy: string;
  role: UserRole;
  reason: string;
}): Promise<string> {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');

  const { data: existingAbsence, error: existingError } = await supabase
    .from('absences')
    .select('id')
    .eq('occurrence_id', input.occurrenceId)
    .maybeSingle();

  if (existingError) {
    throw new Error('Não foi possível verificar se a ocorrência já possui ausência.');
  }
  if (existingAbsence) {
    throw new Error('Esta ocorrência já possui um registro de ausência. Atualize a lista de ocorrências.');
  }

  const payload: AbsenceInsert = {
    occurrence_id: input.occurrenceId,
    teacher_id: input.role === 'PROFESSOR' ? input.createdBy : input.teacherId,
    created_by: input.createdBy,
    reason: input.reason.trim() || null,
  };

  const { data, error } = await supabase
    .from('absences')
    .insert(payload)
    .select('id')
    .single();

  if (error?.code === '23505') {
    throw new Error('Esta ocorrência acabou de receber uma ausência. Atualize a lista e selecione outra ocorrência.');
  }
  if (error) {
    throw new Error('Não foi possível registrar a ausência. Verifique suas permissões e tente novamente.');
  }

  return data.id;
}
