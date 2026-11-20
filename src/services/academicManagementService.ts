import { supabase } from './supabaseClient';
import {
  buildTermOccurrences,
  filterNewOccurrences,
  scheduleHasSupportedPeriod,
  splitIntoHourlyPeriods,
  type CalendarSchedule,
} from './academicCalendar';
import type { AcademicShift, ClassOccurrenceInsert } from '../types/database';

export interface AcademicOption {
  id: string;
  name: string;
}

export interface AcademicTeacherOption extends AcademicOption {
  email: string;
}

export interface AcademicCatalogOption extends AcademicOption {
  active: boolean;
}

export interface AcademicTermOption extends AcademicOption {
  start_date: string;
  end_date: string;
  active: boolean;
}

export interface AcademicClassOption extends AcademicOption {
  course_id: string;
  course_name: string;
  term_id: string;
  semester_number: number;
  shift: AcademicShift;
  active: boolean;
}

export interface AcademicCoordinatorSummary {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  courses: AcademicCatalogOption[];
}

export interface AcademicClassInput {
  course_id: string;
  term_id: string;
  name: string;
  semester_number: number;
  shift: AcademicShift;
  active: boolean;
}

export interface AcademicSchedule extends CalendarSchedule {
  offering_id: string;
  room: string;
}

export interface AcademicOfferingSummary {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  subject_name: string;
  term_id: string;
  term_name: string;
  shift: AcademicShift;
  active: boolean;
  class_ids: string[];
  class_names: string[];
  schedules: AcademicSchedule[];
}

export interface AcademicManagementData {
  teachers: AcademicTeacherOption[];
  subjects: AcademicOption[];
  subjectCatalog: AcademicCatalogOption[];
  terms: AcademicTermOption[];
  classes: AcademicClassOption[];
  classCatalog: AcademicClassOption[];
  courses: AcademicCatalogOption[];
  coordinators: AcademicCoordinatorSummary[];
  offerings: AcademicOfferingSummary[];
}

export interface OccurrenceGenerationResult {
  inserted: number;
  alreadyExisted: number;
  unsupportedSchedules: number;
}

function requireSupabase() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.');
  return supabase;
}

export async function fetchAcademicManagementData(): Promise<AcademicManagementData> {
  const client = requireSupabase();
  const [teachersResult, subjectsResult, termsResult, classesResult, coursesResult, offeringsResult, linksResult, schedulesResult, coordinatorsResult, coordinatorCoursesResult] = await Promise.all([
    client.from('profiles').select('id, full_name, email').eq('role', 'PROFESSOR').eq('active', true).order('full_name'),
    client.from('subjects').select('id, name, active').order('name'),
    client.from('academic_terms').select('id, name, start_date, end_date, active').order('start_date', { ascending: false }),
    client.from('classes').select('id, course_id, term_id, name, semester_number, shift, active').order('name'),
    client.from('courses').select('id, name, active').order('name'),
    client.from('offerings').select('id, teacher_id, subject_id, term_id, shift, active').order('created_at', { ascending: false }),
    client.from('offering_classes').select('offering_id, class_id'),
    client.from('offering_schedules').select('id, offering_id, weekday, start_time, end_time, room').order('weekday').order('start_time'),
    client.from('profiles').select('id, full_name, email, active').eq('role', 'COORDENADOR').order('full_name'),
    client.from('user_courses').select('user_id, course_id, courses ( id, name, active )'),
  ]);

  const queryResults = [teachersResult, subjectsResult, termsResult, classesResult, coursesResult, offeringsResult, linksResult, schedulesResult, coordinatorsResult, coordinatorCoursesResult];
  if (queryResults.some(({ error }) => error)) {
    throw new Error('Não foi possível carregar os dados da gestão acadêmica. Verifique as permissões e tente novamente.');
  }

  const coursesById = new Map((coursesResult.data ?? []).map((course) => [course.id, course.name]));
  const teachersById = new Map((teachersResult.data ?? []).map((teacher) => [teacher.id, teacher.full_name]));
  const subjectsById = new Map((subjectsResult.data ?? []).map((subject) => [subject.id, subject.name]));
  const termsById = new Map((termsResult.data ?? []).map((term) => [term.id, term.name]));
  const classCatalog: AcademicClassOption[] = (classesResult.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    course_id: item.course_id,
    course_name: coursesById.get(item.course_id) ?? 'Curso indisponível',
    term_id: item.term_id,
    semester_number: item.semester_number,
    shift: item.shift,
    active: item.active,
  }));
  const classMap = new Map(classCatalog.map((item) => [item.id, item]));
  const linksByOffer = new Map<string, string[]>();
  for (const link of linksResult.data ?? []) {
    const current = linksByOffer.get(link.offering_id) ?? [];
    current.push(link.class_id);
    linksByOffer.set(link.offering_id, current);
  }
  const schedulesByOffer = new Map<string, AcademicSchedule[]>();
  for (const schedule of schedulesResult.data ?? []) {
    const current = schedulesByOffer.get(schedule.offering_id) ?? [];
    current.push({ ...schedule, room: schedule.room ?? '' });
    schedulesByOffer.set(schedule.offering_id, current);
  }

  const courses: AcademicCatalogOption[] = coursesResult.data ?? [];
  const subjectCatalog: AcademicCatalogOption[] = subjectsResult.data ?? [];
  const coordinatorCoursesByUser = new Map<string, Map<string, AcademicCatalogOption>>();
  for (const row of coordinatorCoursesResult.data ?? []) {
    const relatedCourses: unknown = row.courses;
    const relatedRows = Array.isArray(relatedCourses) ? relatedCourses : [relatedCourses];
    for (const related of relatedRows) {
      if (!related || typeof related !== 'object') continue;
      const course = related as Partial<AcademicCatalogOption>;
      if (typeof course.id !== 'string' || typeof course.name !== 'string' || typeof course.active !== 'boolean') continue;
      const linked = coordinatorCoursesByUser.get(row.user_id) ?? new Map<string, AcademicCatalogOption>();
      linked.set(course.id, { id: course.id, name: course.name, active: course.active });
      coordinatorCoursesByUser.set(row.user_id, linked);
    }
  }
  const coordinators: AcademicCoordinatorSummary[] = (coordinatorsResult.data ?? []).map((coordinator) => ({
    ...coordinator,
    courses: [...(coordinatorCoursesByUser.get(coordinator.id)?.values() ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }));

  return {
    teachers: (teachersResult.data ?? []).map(({ id, full_name, email }) => ({ id, name: full_name, email })),
    subjects: subjectCatalog.filter(({ active }) => active).map(({ id, name }) => ({ id, name })),
    subjectCatalog,
    terms: termsResult.data ?? [],
    classes: classCatalog.filter(({ active }) => active),
    classCatalog,
    courses,
    coordinators,
    offerings: (offeringsResult.data ?? []).map((offering) => {
      const classIds = linksByOffer.get(offering.id) ?? [];
      return {
        ...offering,
        teacher_name: teachersById.get(offering.teacher_id) ?? 'Professor indisponível',
        subject_name: subjectsById.get(offering.subject_id) ?? 'Disciplina indisponível',
        term_name: termsById.get(offering.term_id) ?? 'Semestre indisponível',
        class_ids: classIds,
        class_names: classIds.map((id) => {
          const item = classMap.get(id);
          return item ? `${item.course_name} — ${item.name}` : 'Turma indisponível';
        }),
        schedules: schedulesByOffer.get(offering.id) ?? [],
      };
    }),
  };
}

function normalizedName(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function requireName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error(`Informe o nome ${label}.`);
  return name;
}

async function ensureUniqueCourseName(name: string, excludedId?: string): Promise<void> {
  const { data, error } = await requireSupabase().from('courses').select('id, name');
  if (error) throw new Error('Não foi possível verificar nomes de cursos existentes.');
  const existingRecord = (data ?? []).find((course) => course.id === excludedId);
  if (existingRecord && normalizedName(existingRecord.name) === normalizedName(name)) return;
  if ((data ?? []).some((course) => course.id !== excludedId && normalizedName(course.name) === normalizedName(name))) {
    throw new Error('Já existe um curso com esse nome.');
  }
}

async function ensureUniqueSubjectName(name: string, excludedId?: string): Promise<void> {
  const { data, error } = await requireSupabase().from('subjects').select('id, name');
  if (error) throw new Error('Não foi possível verificar nomes de disciplinas existentes.');
  const existingRecord = (data ?? []).find((subject) => subject.id === excludedId);
  if (existingRecord && normalizedName(existingRecord.name) === normalizedName(name)) return;
  if ((data ?? []).some((subject) => subject.id !== excludedId && normalizedName(subject.name) === normalizedName(name))) {
    throw new Error('Já existe uma disciplina com esse nome.');
  }
}

export async function createAcademicCourse(nameInput: string): Promise<void> {
  const name = requireName(nameInput, 'do curso');
  await ensureUniqueCourseName(name);
  const { error } = await requireSupabase().from('courses').insert({ name, active: true });
  if (error) throw new Error('Não foi possível cadastrar o curso.');
}

export async function updateAcademicCourse(
  id: string,
  input: { name: string; active: boolean },
): Promise<void> {
  const name = requireName(input.name, 'do curso');
  await ensureUniqueCourseName(name, id);
  const { data, error } = await requireSupabase().from('courses')
    .update({ name, active: input.active })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Não foi possível atualizar o curso.');
  if (!data) throw new Error('O curso não foi encontrado ou não pode ser atualizado.');
}

export async function createAcademicSubject(nameInput: string): Promise<void> {
  const name = requireName(nameInput, 'da disciplina');
  await ensureUniqueSubjectName(name);
  const { error } = await requireSupabase().from('subjects').insert({ name, active: true });
  if (error) throw new Error('Não foi possível cadastrar a disciplina.');
}

export async function updateAcademicSubject(
  id: string,
  input: { name: string; active: boolean },
): Promise<void> {
  const name = requireName(input.name, 'da disciplina');
  await ensureUniqueSubjectName(name, id);
  const { data, error } = await requireSupabase().from('subjects')
    .update({ name, active: input.active })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Não foi possível atualizar a disciplina.');
  if (!data) throw new Error('A disciplina não foi encontrada ou não pode ser atualizada.');
}

export async function createAcademicClass(input: AcademicClassInput): Promise<void> {
  const name = requireName(input.name, 'da turma');
  if (!Number.isInteger(input.semester_number)) {
    throw new Error('Informe um número inteiro para o semestre da turma.');
  }
  const { error } = await requireSupabase().from('classes').insert({ ...input, name });
  if (error) throw new Error('Não foi possível cadastrar a turma. Verifique o curso, o período letivo e os dados informados.');
}

export async function updateAcademicClass(
  id: string,
  input: AcademicClassInput,
): Promise<void> {
  const name = requireName(input.name, 'da turma');
  if (!Number.isInteger(input.semester_number)) {
    throw new Error('Informe um número inteiro para o semestre da turma.');
  }
  const { data, error } = await requireSupabase().from('classes')
    .update({ ...input, name })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Não foi possível atualizar a turma. Verifique o curso, o período letivo e os dados informados.');
  if (!data) throw new Error('A turma não foi encontrada ou não pode ser atualizada.');
}

export async function addCoordinatorCourseLink(userId: string, courseId: string): Promise<void> {
  const client = requireSupabase();
  const [profileResult, courseResult, linksResult] = await Promise.all([
    client.from('profiles').select('id, role').eq('id', userId).maybeSingle(),
    client.from('courses').select('id').eq('id', courseId).eq('active', true).maybeSingle(),
    client.from('user_courses').select('course_id').eq('user_id', userId),
  ]);
  if (profileResult.error || courseResult.error || linksResult.error) {
    throw new Error('Não foi possível validar o Coordenador, o curso e os vínculos existentes.');
  }
  if (!profileResult.data || profileResult.data.role !== 'COORDENADOR') {
    throw new Error('O usuário selecionado não é um Coordenador válido.');
  }
  if (!courseResult.data) throw new Error('Selecione um curso ativo.');
  if ((linksResult.data ?? []).some(({ course_id }) => course_id === courseId)) return;

  const { error } = await client.from('user_courses').insert({ user_id: userId, course_id: courseId });
  if (error) throw new Error('Não foi possível vincular o curso ao Coordenador.');
}

export async function removeCoordinatorCourseLink(userId: string, courseId: string): Promise<void> {
  const client = requireSupabase();
  const { data: links, error: linksError } = await client.from('user_courses')
    .select('course_id')
    .eq('user_id', userId);
  if (linksError) throw new Error('Não foi possível consultar os cursos vinculados ao Coordenador.');
  if (!(links ?? []).some(({ course_id }) => course_id === courseId)) return;
  const remainingCourseIds = (links ?? [])
    .filter(({ course_id }) => course_id !== courseId)
    .map(({ course_id }) => course_id);
  const { data: remainingActiveCourses, error: coursesError } = remainingCourseIds.length > 0
    ? await client.from('courses')
      .select('id')
      .in('id', remainingCourseIds)
      .eq('active', true)
    : { data: [], error: null };
  if (coursesError) {
    throw new Error('Não foi possível validar os cursos ativos restantes do Coordenador.');
  }
  if ((remainingActiveCourses ?? []).length === 0) {
    throw new Error('O Coordenador deve permanecer vinculado a pelo menos um curso ativo.');
  }

  const { error } = await client.from('user_courses').delete()
    .eq('user_id', userId)
    .eq('course_id', courseId);
  if (error) throw new Error('Não foi possível remover o vínculo do curso.');
}

export async function createAcademicOffering(input: {
  teacherId: string;
  subjectId: string;
  termId: string;
  shift: AcademicShift;
  classIds: string[];
}): Promise<string> {
  if (input.classIds.length === 0) throw new Error('Selecione ao menos uma turma.');
  const client = requireSupabase();
  const { data, error } = await client.from('offerings').insert({
    teacher_id: input.teacherId,
    subject_id: input.subjectId,
    term_id: input.termId,
    shift: input.shift,
    active: false,
  }).select('id').single();
  if (error || !data) throw new Error('Não foi possível criar a oferta.');

  const { error: linkError } = await client.from('offering_classes').insert(
    input.classIds.map((classId) => ({ offering_id: data.id, class_id: classId }))
  );
  if (linkError) {
    throw new Error(`A oferta ${data.id} foi criada como inativa, mas não foi possível vincular as turmas. Atualize os dados e tente vincular novamente.`);
  }
  return data.id;
}

export async function addClassesToOffering(offeringId: string, classIds: string[]): Promise<void> {
  if (!classIds.length) throw new Error('Selecione ao menos uma turma.');
  const client = requireSupabase();
  const { data: existing, error: queryError } = await client.from('offering_classes').select('class_id').eq('offering_id', offeringId);
  if (queryError) throw new Error('Não foi possível consultar as turmas já vinculadas.');
  const existingIds = new Set((existing ?? []).map(({ class_id }) => class_id));
  const missing = classIds.filter((id) => !existingIds.has(id));
  if (!missing.length) return;
  const { error } = await client.from('offering_classes').insert(missing.map((classId) => ({ offering_id: offeringId, class_id: classId })));
  if (error) throw new Error('Não foi possível vincular as turmas selecionadas.');
}

export async function addHourlySchedule(input: {
  offeringId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}): Promise<number> {
  const periods = splitIntoHourlyPeriods(input.startTime, input.endTime);
  const client = requireSupabase();
  const { data: current, error: queryError } = await client.from('offering_schedules').select('weekday, start_time, end_time').eq('offering_id', input.offeringId);
  if (queryError) throw new Error('Não foi possível validar os horários já cadastrados.');

  const existing = current ?? [];
  const candidates = periods.filter((period) => !existing.some((schedule) =>
    schedule.weekday === input.weekday && schedule.start_time.slice(0, 5) === period.start_time && schedule.end_time.slice(0, 5) === period.end_time
  ));
  for (const period of candidates) {
    const start = period.start_time;
    const end = period.end_time;
    const overlap = existing.some((schedule) => schedule.weekday === input.weekday &&
      schedule.start_time.slice(0, 5) < end && schedule.end_time.slice(0, 5) > start);
    if (overlap) throw new Error('O período se sobrepõe a outro horário desta oferta.');
  }
  if (!candidates.length) return 0;

  const { error } = await client.from('offering_schedules').insert(candidates.map((period) => ({
    offering_id: input.offeringId,
    weekday: input.weekday,
    start_time: period.start_time,
    end_time: period.end_time,
    room: input.room.trim(),
  })));
  if (error) throw new Error('Não foi possível salvar os horários. Verifique se já estão cadastrados e tente novamente.');
  return candidates.length;
}

export async function activateOffering(offeringId: string): Promise<void> {
  const client = requireSupabase();
  const { data: offering, error: loadError } = await client.from('offerings').select('id').eq('id', offeringId).single();
  if (loadError || !offering) throw new Error('Não foi possível localizar a oferta.');
  const [classesResult, schedulesResult] = await Promise.all([
    client.from('offering_classes').select('class_id').eq('offering_id', offeringId),
    client.from('offering_schedules').select('id').eq('offering_id', offeringId),
  ]);
  if (classesResult.error || schedulesResult.error) throw new Error('Não foi possível validar os dados da oferta.');
  if (!classesResult.data?.length || !schedulesResult.data?.length) {
    throw new Error('Vincule ao menos uma turma e cadastre ao menos um horário antes de ativar.');
  }
  const { error } = await client.from('offerings').update({ active: true }).eq('id', offeringId);
  if (error) throw new Error('Não foi possível ativar a oferta.');
}

export async function generateOccurrencesForTerm(termId: string): Promise<OccurrenceGenerationResult> {
  const client = requireSupabase();
  const { data: term, error: termError } = await client.from('academic_terms').select('id, start_date, end_date').eq('id', termId).single();
  if (termError || !term) throw new Error('Não foi possível carregar o período letivo selecionado.');

  const { data: offers, error: offerError } = await client.from('offerings').select('id').eq('term_id', termId).eq('active', true);
  if (offerError) throw new Error('Não foi possível consultar as ofertas ativas do semestre.');
  const offerIds = (offers ?? []).map(({ id }) => id);
  if (!offerIds.length) return { inserted: 0, alreadyExisted: 0, unsupportedSchedules: 0 };

  const { data: schedules, error: schedulesError } = await client.from('offering_schedules').select('id, offering_id, weekday, start_time, end_time').in('offering_id', offerIds);
  if (schedulesError) throw new Error('Não foi possível consultar os horários ativos.');
  const allSchedules = schedules ?? [];
  const supported = allSchedules.filter(scheduleHasSupportedPeriod);
  const generatedRows = buildTermOccurrences(supported, term.start_date, term.end_date);
  if (!generatedRows.length) {
    return { inserted: 0, alreadyExisted: 0, unsupportedSchedules: allSchedules.length - supported.length };
  }

  const scheduleIds = [...new Set(generatedRows.map(({ schedule_id }) => schedule_id))];
  const { data: existing, error: existingError } = await client.from('class_occurrences')
    .select('schedule_id, class_date')
    .in('schedule_id', scheduleIds)
    .gte('class_date', term.start_date)
    .lte('class_date', term.end_date);
  if (existingError) throw new Error('Não foi possível verificar ocorrências já existentes.');

  const missing = filterNewOccurrences(generatedRows, existing ?? []);
  let inserted = 0;
  for (let offset = 0; offset < missing.length; offset += 500) {
    const batch = missing.slice(offset, offset + 500) as ClassOccurrenceInsert[];
    const { data, error } = await client.from('class_occurrences')
      .upsert(batch, { onConflict: 'schedule_id,class_date', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error('A geração foi interrompida ao salvar ocorrências. Execute novamente para completar com segurança.');
    inserted += data?.length ?? 0;
  }

  return {
    inserted,
    alreadyExisted: (existing ?? []).length + Math.max(0, missing.length - inserted),
    unsupportedSchedules: allSchedules.length - supported.length,
  };
}
