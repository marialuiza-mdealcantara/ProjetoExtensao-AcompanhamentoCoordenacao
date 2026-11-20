import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  activateOffering,
  addClassesToOffering,
  addCoordinatorCourseLink,
  addHourlySchedule,
  createAcademicClass,
  createAcademicCourse,
  createAcademicOffering,
  createAcademicSubject,
  fetchAcademicManagementData,
  generateOccurrencesForTerm,
  removeCoordinatorCourseLink,
  updateAcademicClass,
  updateAcademicCourse,
  updateAcademicSubject,
  type AcademicClassInput,
  type AcademicClassOption,
  type AcademicCoordinatorSummary,
  type AcademicCatalogOption,
  type AcademicManagementData,
  type AcademicOfferingSummary,
} from '../../services/academicManagementService';
import type { AcademicShift } from '../../types/database';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function AcademicManagementPage() {
  const [data, setData] = useState<AcademicManagementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [shift, setShift] = useState<AcademicShift>('MATUTINO');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [extraClassIds, setExtraClassIds] = useState<string[]>([]);
  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [room, setRoom] = useState('');
  const [courseName, setCourseName] = useState('');
  const [editingCourseId, setEditingCourseId] = useState('');
  const [courseActive, setCourseActive] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState('');
  const [subjectActive, setSubjectActive] = useState(true);
  const [classCourseId, setClassCourseId] = useState('');
  const [classTermId, setClassTermId] = useState('');
  const [className, setClassName] = useState('');
  const [classSemesterNumber, setClassSemesterNumber] = useState('1');
  const [classShift, setClassShift] = useState<AcademicShift>('MATUTINO');
  const [classActive, setClassActive] = useState(true);
  const [editingClassId, setEditingClassId] = useState('');
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('');
  const [coordinatorCourseId, setCoordinatorCourseId] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchAcademicManagementData();
      setData(next);
      setSelectedTermId((current) => current || next.terms.find((term) => term.active)?.id || next.terms[0]?.id || '');
      setSelectedOfferId((current) => current && next.offerings.some((offering) => offering.id === current) ? current : next.offerings[0]?.id || '');
      setClassCourseId((current) => current && next.courses.some((course) => course.id === current) ? current : next.courses.find((course) => course.active)?.id || '');
      setClassTermId((current) => current && next.terms.some((term) => term.id === current) ? current : next.terms.find((term) => term.active)?.id || next.terms[0]?.id || '');
      setSelectedCoordinatorId((current) => current && next.coordinators.some((coordinator) => coordinator.id === current) ? current : next.coordinators[0]?.id || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a gestão acadêmica.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const runAdministrativeAction = async (
    action: () => Promise<void>,
    successMessage: string,
    afterSuccess?: () => void,
  ) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await action();
      afterSuccess?.();
      setFeedback(successMessage);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar os dados acadêmicos.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = editingCourseId
      ? () => updateAcademicCourse(editingCourseId, { name: courseName, active: courseActive })
      : () => createAcademicCourse(courseName);
    void runAdministrativeAction(action, editingCourseId ? 'Curso atualizado.' : 'Curso cadastrado.', () => {
      setCourseName('');
      setEditingCourseId('');
      setCourseActive(true);
    });
  };

  const handleSaveSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = editingSubjectId
      ? () => updateAcademicSubject(editingSubjectId, { name: subjectName, active: subjectActive })
      : () => createAcademicSubject(subjectName);
    void runAdministrativeAction(action, editingSubjectId ? 'Disciplina atualizada.' : 'Disciplina cadastrada.', () => {
      setSubjectName('');
      setEditingSubjectId('');
      setSubjectActive(true);
    });
  };

  const handleSaveClass = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: AcademicClassInput = {
      course_id: classCourseId,
      term_id: classTermId,
      name: className,
      semester_number: Number(classSemesterNumber),
      shift: classShift,
      active: classActive,
    };
    const action = editingClassId
      ? () => updateAcademicClass(editingClassId, input)
      : () => createAcademicClass(input);
    void runAdministrativeAction(action, editingClassId ? 'Turma atualizada.' : 'Turma cadastrada.', () => {
      setClassName('');
      setClassSemesterNumber('1');
      setClassShift('MATUTINO');
      setClassActive(true);
      setEditingClassId('');
    });
  };

  const handleToggleCourse = (course: AcademicCatalogOption) => {
    if (course.active && !window.confirm(`Desativar o curso "${course.name}"?`)) return;
    void runAdministrativeAction(
      () => updateAcademicCourse(course.id, { name: course.name, active: !course.active }),
      course.active ? 'Curso desativado.' : 'Curso ativado.',
    );
  };

  const handleToggleSubject = (subject: AcademicCatalogOption) => {
    if (subject.active && !window.confirm(`Desativar a disciplina "${subject.name}"?`)) return;
    void runAdministrativeAction(
      () => updateAcademicSubject(subject.id, { name: subject.name, active: !subject.active }),
      subject.active ? 'Disciplina desativada.' : 'Disciplina ativada.',
    );
  };

  const handleToggleClass = (item: AcademicClassOption) => {
    if (item.active && !window.confirm(`Desativar a turma "${item.name}"?`)) return;
    void runAdministrativeAction(
      () => updateAcademicClass(item.id, {
        course_id: item.course_id,
        term_id: item.term_id,
        name: item.name,
        semester_number: item.semester_number,
        shift: item.shift,
        active: !item.active,
      }),
      item.active ? 'Turma desativada.' : 'Turma ativada.',
    );
  };

  const handleAddCoordinatorCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCoordinatorId || !coordinatorCourseId) return;
    void runAdministrativeAction(
      () => addCoordinatorCourseLink(selectedCoordinatorId, coordinatorCourseId),
      'Curso vinculado ao Coordenador.',
      () => setCoordinatorCourseId(''),
    );
  };

  const handleRemoveCoordinatorCourse = (coordinator: AcademicCoordinatorSummary, course: AcademicCatalogOption) => {
    if (!window.confirm(`Remover o vínculo de ${coordinator.full_name} com o curso "${course.name}"?`)) return;
    void runAdministrativeAction(
      () => removeCoordinatorCourseLink(coordinator.id, course.id),
      'Vínculo removido.',
    );
  };

  const selectedOffering = useMemo(
    () => data?.offerings.find((offering) => offering.id === selectedOfferId) ?? null,
    [data, selectedOfferId]
  );
  const selectedCoordinator = useMemo(
    () => data?.coordinators.find((coordinator) => coordinator.id === selectedCoordinatorId) ?? null,
    [data, selectedCoordinatorId]
  );
  const availableCoordinatorCourses = useMemo(() => data?.courses.filter((course) =>
    course.active && !selectedCoordinator?.courses.some(({ id }) => id === course.id)
  ) ?? [], [data, selectedCoordinator]);
  const eligibleClasses = useMemo(() => data?.classes.filter((item) => item.term_id === selectedTermId && item.shift === shift) ?? [], [data, selectedTermId, shift]);
  const availableExtraClasses = useMemo(() => data?.classes.filter((item) =>
    item.term_id === selectedOffering?.term_id && item.shift === selectedOffering.shift && !selectedOffering.class_ids.includes(item.id)
  ) ?? [], [data, selectedOffering]);

  const handleCreateOffering = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || !selectedTermId) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const id = await createAcademicOffering({ teacherId, subjectId, termId: selectedTermId, shift, classIds });
      setSelectedOfferId(id);
      setClassIds([]);
      setFeedback('Oferta criada como inativa. Cadastre os horários e depois ative-a para incluí-la na geração do semestre.');
      await loadData();
      setSelectedOfferId(id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível criar a oferta.');
      await loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddClasses = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || !selectedOffering) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await addClassesToOffering(selectedOffering.id, extraClassIds);
      setExtraClassIds([]);
      setFeedback('Turmas vinculadas à oferta.');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível vincular as turmas.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || !selectedOffering) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const count = await addHourlySchedule({ offeringId: selectedOffering.id, weekday: Number(weekday), startTime, endTime, room });
      setFeedback(count ? `${count} período(s) de uma hora cadastrado(s).` : 'Esses períodos já estavam cadastrados.');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível cadastrar o horário.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async (offering: AcademicOfferingSummary) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await activateOffering(offering.id);
      setFeedback('Oferta ativada. Ela será considerada na geração de ocorrências.');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível ativar a oferta.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (isSaving || !selectedTermId) return;
    setIsSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await generateOccurrencesForTerm(selectedTermId);
      const warnings = result.unsupportedSchedules
        ? ` ${result.unsupportedSchedules} horário(s) com duração diferente de uma hora foram ignorados; divida-os em períodos de uma hora.`
        : '';
      setFeedback(`Geração concluída: ${result.inserted} ocorrência(s) criada(s), ${result.alreadyExisted} já existente(s) preservada(s).${warnings} Não há calendário de feriados/recessos cadastrado para aplicar exclusões.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível gerar as ocorrências.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClass = (id: string, setIds: (value: string[]) => void, current: string[]) => {
    setIds(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  if (isLoading && !data) {
    return <div className="state-box" role="status"><div className="spinner" aria-hidden="true" /><p>Carregando dados acadêmicos...</p></div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-card">
        <span className="badge-stage">Área da Secretaria de Coordenação</span>
        <h2>Gestão Acadêmica</h2>
        <p className="lead-text" style={{ marginBottom: 0 }}>
          Configure ofertas e horários. As ocorrências são geradas por semestre a partir das ofertas ativas.
        </p>
      </section>

      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {feedback && <div className="alert-box alert-ok" role="status">{feedback}</div>}

      <section className="info-card" aria-labelledby="academic-courses-heading">
        <h3 id="academic-courses-heading">Cursos</h3>
        <form className="create-user-form" onSubmit={handleSaveCourse}>
          <div className="form-grid-three">
            <div className="form-group">
              <label className="form-label" htmlFor="academic-course-name">Nome do curso</label>
              <input id="academic-course-name" className="form-input" value={courseName} onChange={(event) => setCourseName(event.target.value)} required />
            </div>
            {editingCourseId && <label className="course-checkbox-card">
              <input type="checkbox" checked={courseActive} onChange={(event) => setCourseActive(event.target.checked)} />
              <span>Curso ativo</span>
            </label>}
          </div>
          <div className="card-footer-actions">
            <button className="btn-primary" type="submit" disabled={isSaving}>{editingCourseId ? 'Salvar curso' : 'Cadastrar curso'}</button>
            {editingCourseId && <button className="btn-secondary" type="button" disabled={isSaving} onClick={() => { setEditingCourseId(''); setCourseName(''); setCourseActive(true); }}>Cancelar edição</button>}
          </div>
        </form>
        {data?.courses.length ? <div className="table-responsive"><table className="data-table">
          <thead><tr><th>Curso</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{data.courses.map((course) => <tr key={course.id}>
            <td>{course.name}</td>
            <td><span className={`status-badge ${course.active ? 'status-ok' : 'status-danger'}`}>{course.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><div className="header-actions-inline">
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => { setEditingCourseId(course.id); setCourseName(course.name); setCourseActive(course.active); }}>Editar</button>
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => handleToggleCourse(course)}>{course.active ? 'Desativar' : 'Ativar'}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="state-box"><p className="text-muted">Nenhum curso cadastrado.</p></div>}
      </section>

      <section className="info-card" aria-labelledby="academic-subjects-heading">
        <h3 id="academic-subjects-heading">Disciplinas</h3>
        <form className="create-user-form" onSubmit={handleSaveSubject}>
          <div className="form-grid-three">
            <div className="form-group">
              <label className="form-label" htmlFor="academic-subject-name">Nome da disciplina</label>
              <input id="academic-subject-name" className="form-input" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required />
            </div>
            {editingSubjectId && <label className="course-checkbox-card">
              <input type="checkbox" checked={subjectActive} onChange={(event) => setSubjectActive(event.target.checked)} />
              <span>Disciplina ativa</span>
            </label>}
          </div>
          <div className="card-footer-actions">
            <button className="btn-primary" type="submit" disabled={isSaving}>{editingSubjectId ? 'Salvar disciplina' : 'Cadastrar disciplina'}</button>
            {editingSubjectId && <button className="btn-secondary" type="button" disabled={isSaving} onClick={() => { setEditingSubjectId(''); setSubjectName(''); setSubjectActive(true); }}>Cancelar edição</button>}
          </div>
        </form>
        {data?.subjectCatalog.length ? <div className="table-responsive"><table className="data-table">
          <thead><tr><th>Disciplina</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{data.subjectCatalog.map((subject) => <tr key={subject.id}>
            <td>{subject.name}</td>
            <td><span className={`status-badge ${subject.active ? 'status-ok' : 'status-danger'}`}>{subject.active ? 'Ativa' : 'Inativa'}</span></td>
            <td><div className="header-actions-inline">
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => { setEditingSubjectId(subject.id); setSubjectName(subject.name); setSubjectActive(subject.active); }}>Editar</button>
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => handleToggleSubject(subject)}>{subject.active ? 'Desativar' : 'Ativar'}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="state-box"><p className="text-muted">Nenhuma disciplina cadastrada.</p></div>}
      </section>

      <section className="info-card" aria-labelledby="academic-classes-heading">
        <h3 id="academic-classes-heading">Turmas</h3>
        <form className="create-user-form" onSubmit={handleSaveClass}>
          <div className="form-grid-three">
            <div className="form-group">
              <label className="form-label" htmlFor="academic-class-course">Curso</label>
              <select id="academic-class-course" className="form-input" value={classCourseId} onChange={(event) => setClassCourseId(event.target.value)} required>
                <option value="">Selecione</option>
                {data?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}{course.active ? '' : ' — inativo'}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="academic-class-term">Período letivo</label>
              <select id="academic-class-term" className="form-input" value={classTermId} onChange={(event) => setClassTermId(event.target.value)} required>
                <option value="">Selecione</option>
                {data?.terms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.active ? '' : ' — inativo'}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="academic-class-name">Nome da turma</label>
              <input id="academic-class-name" className="form-input" value={className} onChange={(event) => setClassName(event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="academic-class-semester">Semestre</label>
              <input id="academic-class-semester" className="form-input" type="number" step="1" value={classSemesterNumber} onChange={(event) => setClassSemesterNumber(event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="academic-class-shift">Turno</label>
              <select id="academic-class-shift" className="form-input" value={classShift} onChange={(event) => setClassShift(event.target.value as AcademicShift)}>
                <option value="MATUTINO">Matutino</option><option value="NOTURNO">Noturno</option>
              </select>
            </div>
            <label className="course-checkbox-card">
              <input type="checkbox" checked={classActive} onChange={(event) => setClassActive(event.target.checked)} />
              <span>Turma ativa</span>
            </label>
          </div>
          <div className="card-footer-actions">
            <button className="btn-primary" type="submit" disabled={isSaving || !data?.courses.length || !data.terms.length}>{editingClassId ? 'Salvar turma' : 'Cadastrar turma'}</button>
            {editingClassId && <button className="btn-secondary" type="button" disabled={isSaving} onClick={() => { setEditingClassId(''); setClassName(''); setClassSemesterNumber('1'); setClassShift('MATUTINO'); setClassActive(true); }}>Cancelar edição</button>}
          </div>
        </form>
        {data?.classCatalog.length ? <div className="table-responsive"><table className="data-table">
          <thead><tr><th>Turma</th><th>Curso</th><th>Período</th><th>Semestre</th><th>Turno</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{data.classCatalog.map((item) => <tr key={item.id}>
            <td>{item.name}</td>
            <td>{item.course_name}</td>
            <td>{data.terms.find((term) => term.id === item.term_id)?.name ?? 'Período indisponível'}</td>
            <td>{item.semester_number}</td>
            <td>{item.shift === 'MATUTINO' ? 'Matutino' : 'Noturno'}</td>
            <td><span className={`status-badge ${item.active ? 'status-ok' : 'status-danger'}`}>{item.active ? 'Ativa' : 'Inativa'}</span></td>
            <td><div className="header-actions-inline">
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => {
                setEditingClassId(item.id);
                setClassCourseId(item.course_id);
                setClassTermId(item.term_id);
                setClassName(item.name);
                setClassSemesterNumber(String(item.semester_number));
                setClassShift(item.shift);
                setClassActive(item.active);
              }}>Editar</button>
              <button className="btn-secondary btn-sm" type="button" disabled={isSaving} onClick={() => handleToggleClass(item)}>{item.active ? 'Desativar' : 'Ativar'}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="state-box"><p className="text-muted">Nenhuma turma cadastrada.</p></div>}
      </section>

      <section className="info-card" aria-labelledby="academic-coordinators-heading">
        <h3 id="academic-coordinators-heading">Vínculos de Coordenação</h3>
        {data?.coordinators.length ? <>
          <form className="create-user-form" onSubmit={handleAddCoordinatorCourse}>
            <div className="form-grid-three">
              <div className="form-group">
                <label className="form-label" htmlFor="academic-coordinator">Coordenador</label>
                <select id="academic-coordinator" className="form-input" value={selectedCoordinatorId} onChange={(event) => { setSelectedCoordinatorId(event.target.value); setCoordinatorCourseId(''); }} required>
                  {data.coordinators.map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.full_name}{coordinator.active ? '' : ' — conta inativa'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="academic-coordinator-course">Curso ativo</label>
                <select id="academic-coordinator-course" className="form-input" value={coordinatorCourseId} onChange={(event) => setCoordinatorCourseId(event.target.value)} required>
                  <option value="">Selecione</option>
                  {availableCoordinatorCourses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button className="btn-primary" type="submit" disabled={isSaving || !selectedCoordinatorId || !coordinatorCourseId}>Vincular curso</button>
              </div>
            </div>
            <p className="text-muted">Um Coordenador pode ter vários cursos vinculados e deve permanecer com pelo menos um curso associado.</p>
            {selectedCoordinator && availableCoordinatorCourses.length === 0 && <p className="text-muted">Não há outros cursos ativos disponíveis para esse Coordenador.</p>}
          </form>
          <div className="table-responsive"><table className="data-table">
            <thead><tr><th>Coordenador</th><th>Situação da conta</th><th>Cursos vinculados</th></tr></thead>
            <tbody>{data.coordinators.map((coordinator) => <tr key={coordinator.id}>
              <td><span className="user-name-cell">{coordinator.full_name}</span><br /><span className="user-email-cell">{coordinator.email}</span></td>
              <td><span className={`status-badge ${coordinator.active ? 'status-ok' : 'status-danger'}`}>{coordinator.active ? 'Ativa' : 'Inativa'}</span></td>
              <td>{coordinator.courses.length ? <div className="course-tags-list">
                {coordinator.courses.map((course) => <span className={`course-tag${course.active ? '' : ' course-tag-inactive'}`} key={course.id}>
                  {course.name}{course.active ? '' : ' (Inativo)'}
                  <button
                    className="btn-secondary btn-sm coordinator-course-remove"
                    type="button"
                    title={coordinator.courses.length === 1 ? 'O Coordenador deve permanecer vinculado a pelo menos um curso.' : 'Remover vínculo'}
                    aria-label={`Remover vínculo de ${coordinator.full_name} com ${course.name}`}
                    disabled={isSaving || coordinator.courses.length <= 1}
                    onClick={() => handleRemoveCoordinatorCourse(coordinator, course)}
                    style={{ marginInlineStart: '0.45rem' }}
                  >Remover</button>
                </span>)}
              </div> : <span className="text-warn">Nenhum curso vinculado</span>}</td>
            </tr>)}</tbody>
          </table></div>
        </> : <div className="state-box"><p className="text-muted">Nenhum Coordenador cadastrado.</p></div>}
      </section>

      <section className="info-card">
        <h3>Nova oferta de disciplina</h3>
        {!data?.terms.length || !data.teachers.length || !data.subjects.length || !data.classes.length ? (
          <p className="text-muted">Para cadastrar ofertas, é necessário haver semestres, professores ativos, disciplinas e turmas já cadastrados.</p>
        ) : (
          <form className="create-user-form" onSubmit={handleCreateOffering}>
            <div className="form-grid-three">
              <div className="form-group"><label className="form-label" htmlFor="academic-term">Semestre letivo</label>
                <select id="academic-term" className="form-input" value={selectedTermId} onChange={(event) => { setSelectedTermId(event.currentTarget.value); setClassIds([]); }} required>
                  {data.terms.map((term) => <option key={term.id} value={term.id}>{term.name} ({formatDate(term.start_date)} a {formatDate(term.end_date)}){term.active ? ' — ativo' : ''}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="academic-teacher">Professor responsável</label>
                <select id="academic-teacher" className="form-input" value={teacherId} onChange={(event) => setTeacherId(event.currentTarget.value)} required>
                  <option value="">Selecione</option>{data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="academic-subject">Disciplina</label>
                <select id="academic-subject" className="form-input" value={subjectId} onChange={(event) => setSubjectId(event.currentTarget.value)} required>
                  <option value="">Selecione</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="academic-shift">Turno</label>
                <select id="academic-shift" className="form-input" value={shift} onChange={(event) => { setShift(event.currentTarget.value as AcademicShift); setClassIds([]); }}>
                  <option value="MATUTINO">Matutino</option><option value="NOTURNO">Noturno</option>
                </select>
              </div>
            </div>
            <fieldset className="course-selection-block">
              <legend className="form-label">Turmas vinculadas à oferta</legend>
              {eligibleClasses.length ? <div className="course-checkbox-grid">{eligibleClasses.map((item) => <label key={item.id} className={`course-checkbox-card ${classIds.includes(item.id) ? 'course-checkbox-card-selected' : ''}`}>
                <input type="checkbox" checked={classIds.includes(item.id)} onChange={() => toggleClass(item.id, setClassIds, classIds)} />
                <span>{item.course_name} — {item.name} (semestre {item.semester_number})</span>
              </label>)}</div> : <p className="text-muted">Nenhuma turma cadastrada para esse semestre e turno.</p>}
            </fieldset>
            <button className="btn-primary" type="submit" disabled={isSaving || !classIds.length}>{isSaving ? 'Salvando...' : 'Criar oferta inativa'}</button>
          </form>
        )}
      </section>

      <section className="info-card">
        <h3>Horários e ativação</h3>
        {!data?.offerings.length ? <div className="state-box"><p className="text-muted">Nenhuma oferta cadastrada.</p></div> : <>
          <div className="form-group"><label className="form-label" htmlFor="schedule-offer">Oferta selecionada</label>
            <select id="schedule-offer" className="form-input" value={selectedOfferId} onChange={(event) => { setSelectedOfferId(event.currentTarget.value); setExtraClassIds([]); }}>
              {data.offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.subject_name} — {offering.teacher_name} — {offering.term_name}{offering.active ? ' (ativa)' : ' (inativa)'}</option>)}
            </select>
          </div>
          {selectedOffering && <>
            <p className="text-muted">Turmas: {selectedOffering.class_names.join(', ') || 'Nenhuma vinculada'}.</p>
            {selectedOffering.schedules.length > 0 && <div className="table-responsive"><table className="data-table"><thead><tr><th>Dia</th><th>Período</th><th>Sala</th></tr></thead><tbody>
              {selectedOffering.schedules.map((schedule) => <tr key={schedule.id}><td>{WEEKDAYS[schedule.weekday]?.label ?? 'Dia inválido'}</td><td>{schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)}</td><td>{schedule.room}</td></tr>)}
            </tbody></table></div>}
            {availableExtraClasses.length > 0 && <form className="create-user-form" onSubmit={handleAddClasses}>
              <fieldset className="course-selection-block"><legend className="form-label">Adicionar turmas a esta oferta</legend><div className="course-checkbox-grid">
                {availableExtraClasses.map((item) => <label key={item.id} className={`course-checkbox-card ${extraClassIds.includes(item.id) ? 'course-checkbox-card-selected' : ''}`}>
                  <input type="checkbox" checked={extraClassIds.includes(item.id)} onChange={() => toggleClass(item.id, setExtraClassIds, extraClassIds)} /><span>{item.course_name} — {item.name}</span>
                </label>)}
              </div></fieldset><button className="btn-secondary" type="submit" disabled={isSaving || !extraClassIds.length}>Vincular turmas</button>
            </form>}
            <form className="create-user-form" onSubmit={handleAddSchedule}>
              <div className="form-grid-three">
                <div className="form-group"><label className="form-label" htmlFor="schedule-weekday">Dia da semana</label><select id="schedule-weekday" className="form-input" value={weekday} onChange={(event) => setWeekday(event.currentTarget.value)}>{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></div>
                <div className="form-group"><label className="form-label" htmlFor="schedule-start">Horário inicial</label><input id="schedule-start" className="form-input" type="time" value={startTime} onChange={(event) => setStartTime(event.currentTarget.value)} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="schedule-end">Horário final</label><input id="schedule-end" className="form-input" type="time" value={endTime} onChange={(event) => setEndTime(event.currentTarget.value)} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="schedule-room">Sala</label><input id="schedule-room" className="form-input" value={room} onChange={(event) => setRoom(event.currentTarget.value)} maxLength={120} required /></div>
              </div>
              <p className="text-muted">Intervalos de várias horas serão divididos em períodos consecutivos de uma hora, cada um com sua própria ocorrência.</p>
              <button className="btn-primary" type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Adicionar horário(s)'}</button>
            </form>
            {!selectedOffering.active && <button className="btn-secondary" type="button" disabled={isSaving || !selectedOffering.class_ids.length || !selectedOffering.schedules.length} onClick={() => void handleActivate(selectedOffering)}>Ativar oferta</button>}
          </>}
        </>}
      </section>

      <section className="info-card">
        <h3>Gerar ocorrências do semestre</h3>
        <p className="text-muted">A geração considera ofertas ativas, o período letivo e o dia da semana. Ocorrências existentes nunca são atualizadas; o comando pode ser executado novamente com segurança.</p>
        <div className="form-grid-three">
          <div className="form-group"><label className="form-label" htmlFor="generation-term">Semestre letivo</label><select id="generation-term" className="form-input" value={selectedTermId} onChange={(event) => setSelectedTermId(event.currentTarget.value)} disabled={!data?.terms.length}>
            {data?.terms.map((term) => <option key={term.id} value={term.id}>{term.name} ({formatDate(term.start_date)} a {formatDate(term.end_date)})</option>)}
          </select></div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}><button className="btn-primary" type="button" onClick={() => void handleGenerate()} disabled={isSaving || !selectedTermId}>{isSaving ? 'Processando...' : 'Gerar ocorrências'}</button></div>
        </div>
      </section>

      <section className="info-card">
        <h3>Ofertas cadastradas ({data?.offerings.length ?? 0})</h3>
        {data?.offerings.length ? <div className="table-responsive"><table className="data-table"><thead><tr><th>Disciplina</th><th>Professor</th><th>Semestre</th><th>Turmas</th><th>Horários</th><th>Status</th></tr></thead><tbody>
          {data.offerings.map((offering) => <tr key={offering.id}><td>{offering.subject_name}</td><td>{offering.teacher_name}</td><td>{offering.term_name}</td><td>{offering.class_names.join(', ') || '—'}</td><td>{offering.schedules.length}</td><td><span className={`status-badge ${offering.active ? 'status-ok' : 'status-pending'}`}>{offering.active ? 'Ativa' : 'Inativa'}</span></td></tr>)}
        </tbody></table></div> : <div className="state-box"><p className="text-muted">Nenhuma oferta cadastrada.</p></div>}
      </section>
    </div>
  );
}
