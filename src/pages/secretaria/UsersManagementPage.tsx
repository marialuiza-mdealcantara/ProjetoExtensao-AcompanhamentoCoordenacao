import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { ROLE_LABELS } from '../../services/authService';
import {
  addCoordinatorCourseLink,
  removeCoordinatorCourseLink,
} from '../../services/academicManagementService';
import {
  createUserViaEdgeFunction,
  fetchActiveCourses,
  fetchUsersList,
  manageUserViaEdgeFunction,
  validateCreateUserInput,
} from '../../services/userService';
import type { UserRole } from '../../types/database';
import type {
  AccountStatusFilter,
  RoleFilter,
  UserCourseInfo,
  UserListItem,
} from '../../types/user';

export function UsersManagementPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [activeCourses, setActiveCourses] = useState<UserCourseInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<{
    code: string | null;
    message: string;
  } | null>(null);
  const [userActionFeedback, setUserActionFeedback] = useState<{
    message: string;
    auditPending: boolean;
    auditErrorCode: string | null;
  } | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedFullName, setEditedFullName] = useState<string>('');
  const editUserSectionRef = useRef<HTMLElement | null>(null);
  const editUserNameInputRef = useRef<HTMLInputElement | null>(null);
  const [isManagingUser, setIsManagingUser] = useState<boolean>(false);
  const [selectedCoordinatorId, setSelectedCoordinatorId] =
    useState<string>('');
  const [selectedCoordinatorCourseId, setSelectedCoordinatorCourseId] =
    useState<string>('');
  const [isManagingCourseLinks, setIsManagingCourseLinks] =
    useState<boolean>(false);

  // Filtros da listagem
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('TODOS');
  const [statusFilter, setStatusFilter] =
    useState<AccountStatusFilter>('TODOS');

  // Estado do formulário de Cadastro de Usuário
  const [isCreateFormOpen, setIsCreateFormOpen] = useState<boolean>(false);
  const [newFullName, setNewFullName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('PROFESSOR');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);
  const [createError, setCreateError] = useState<{
    code: string | null;
    message: string;
  } | null>(null);
  const [createFeedback, setCreateFeedback] = useState<{
    message: string;
    auditPending: boolean;
    auditErrorCode: string | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [usersResult, coursesResult] = await Promise.all([
        fetchUsersList(),
        fetchActiveCourses(),
      ]);

      if (usersResult.errorMessage) {
        setErrorMessage(usersResult.errorMessage);
        setUsers([]);
      } else {
        setUsers(usersResult.users);
        setSelectedCoordinatorId((currentId) => {
          if (
            currentId &&
            usersResult.users.some(
              (user) =>
                user.id === currentId && user.role === 'COORDENADOR'
            )
          ) {
            return currentId;
          }
          return (
            usersResult.users.find((user) => user.role === 'COORDENADOR')
              ?.id ?? ''
          );
        });
      }

      if (coursesResult.errorMessage) {
        setActiveCourses([]);
        if (!usersResult.errorMessage) {
          setErrorMessage(coursesResult.errorMessage);
        }
      } else {
        setActiveCourses(coursesResult.courses);
      }
    } catch {
      setErrorMessage(
        'Ocorreu um erro inesperado ao consultar os usuários cadastrados.'
      );
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!editingUserId) return;
    editUserSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    editUserNameInputRef.current?.focus({ preventScroll: true });
  }, [editingUserId]);

  const handleRoleChange = (nextRole: UserRole) => {
    setNewRole(nextRole);
    if (nextRole !== 'COORDENADOR') {
      setSelectedCourseIds([]);
    }
    if (createError) setCreateError(null);
  };

  const handleToggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
    if (createError) setCreateError(null);
  };

  const resetCreateFormFields = () => {
    setNewFullName('');
    setNewEmail('');
    setNewRole('PROFESSOR');
    setSelectedCourseIds([]);
    setCreateError(null);
  };

  const handleCreateUserSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateFeedback(null);

    const payload = {
      full_name: newFullName,
      email: newEmail,
      role: newRole,
      course_ids: newRole === 'COORDENADOR' ? selectedCourseIds : [],
    };

    const validationError = validateCreateUserInput(payload);
    if (validationError) {
      setCreateError({
        code: 'CLIENT_VALIDATION_ERROR',
        message: validationError,
      });
      return;
    }

    setIsCreatingUser(true);
    try {
      const result = await createUserViaEdgeFunction(payload);

      if (!result.success) {
        setCreateError({
          code: result.errorCode,
          message: result.message,
        });
        return;
      }

      const createdEmail = newEmail.trim().toLowerCase();
      setCreateFeedback({
        message: `${result.message} Destinatário: ${createdEmail}.`,
        auditPending: Boolean(result.auditPending),
        auditErrorCode: result.auditErrorCode ?? null,
      });
      resetCreateFormFields();
      setIsCreateFormOpen(false);
      await loadData();
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleEditUser = (user: UserListItem) => {
    setEditingUserId(user.id);
    setEditedFullName(user.full_name);
    setUserActionError(null);
    setUserActionFeedback(null);
  };

  const handleSaveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUserId) return;

    setUserActionError(null);
    setUserActionFeedback(null);
    setIsManagingUser(true);
    try {
      const result = await manageUserViaEdgeFunction({
        user_id: editingUserId,
        full_name: editedFullName,
      });

      if (!result.success) {
        setUserActionError({
          code: result.errorCode,
          message: result.message,
        });
        return;
      }

      setUserActionFeedback({
        message: result.message,
        auditPending: Boolean(result.auditPending),
        auditErrorCode: result.auditErrorCode ?? null,
      });
      setEditingUserId(null);
      setEditedFullName('');
      await loadData();
    } catch (error) {
      setUserActionError({
        code: null,
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar as alterações do usuário.',
      });
    } finally {
      setIsManagingUser(false);
    }
  };

  const handleSetUserActive = async (
    user: UserListItem,
    active: boolean
  ) => {
    if (
      !active &&
      !window.confirm(
        `Desativar a conta de ${user.full_name}? O acesso será bloqueado e os registros históricos serão preservados.`
      )
    ) {
      return;
    }

    setUserActionError(null);
    setUserActionFeedback(null);
    setIsManagingUser(true);
    try {
      const result = await manageUserViaEdgeFunction({
        user_id: user.id,
        active,
      });

      if (!result.success) {
        setUserActionError({
          code: result.errorCode,
          message: result.message,
        });
        return;
      }

      setUserActionFeedback({
        message: result.message,
        auditPending: Boolean(result.auditPending),
        auditErrorCode: result.auditErrorCode ?? null,
      });
      await loadData();
    } catch (error) {
      setUserActionError({
        code: null,
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a situação da conta.',
      });
    } finally {
      setIsManagingUser(false);
    }
  };

  const handleAddCoordinatorCourse = async () => {
    if (!selectedCoordinatorId || !selectedCoordinatorCourseId) return;
    setUserActionError(null);
    setUserActionFeedback(null);
    setIsManagingCourseLinks(true);
    try {
      await addCoordinatorCourseLink(
        selectedCoordinatorId,
        selectedCoordinatorCourseId
      );
      setUserActionFeedback({
        message: 'Curso vinculado ao Coordenador.',
        auditPending: false,
        auditErrorCode: null,
      });
      setSelectedCoordinatorCourseId('');
      await loadData();
    } catch (error) {
      setUserActionError({
        code: null,
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível vincular o curso ao Coordenador.',
      });
    } finally {
      setIsManagingCourseLinks(false);
    }
  };

  const handleRemoveCoordinatorCourse = async (
    user: UserListItem,
    courseId: string,
    courseName: string
  ) => {
    if (
      !window.confirm(
        `Remover o vínculo de ${courseName} do Coordenador ${user.full_name}?`
      )
    ) {
      return;
    }

    setUserActionError(null);
    setUserActionFeedback(null);
    setIsManagingCourseLinks(true);
    try {
      await removeCoordinatorCourseLink(user.id, courseId);
      setUserActionFeedback({
        message: `Vínculo com ${courseName} removido.`,
        auditPending: false,
        auditErrorCode: null,
      });
      await loadData();
    } catch (error) {
      setUserActionError({
        code: null,
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível remover o vínculo do curso.',
      });
    } finally {
      setIsManagingCourseLinks(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return users.filter((item) => {
      if (roleFilter !== 'TODOS' && item.role !== roleFilter) {
        return false;
      }

      if (statusFilter === 'ATIVOS' && !item.active) {
        return false;
      }

      if (statusFilter === 'INATIVOS' && item.active) {
        return false;
      }

      if (normalizedQuery) {
        const matchesName = item.full_name
          .toLowerCase()
          .includes(normalizedQuery);
        const matchesEmail = item.email
          .toLowerCase()
          .includes(normalizedQuery);
        const matchesCourse = item.courses.some((course) =>
          course.name.toLowerCase().includes(normalizedQuery)
        );
        if (!matchesName && !matchesEmail && !matchesCourse) {
          return false;
        }
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery]);

  const summaryCounts = useMemo(() => {
    let activeCount = 0;
    let professorCount = 0;
    let coordenadorCount = 0;
    let secretariaCount = 0;

    for (const u of users) {
      if (u.active) activeCount += 1;
      if (u.role === 'PROFESSOR') professorCount += 1;
      if (u.role === 'COORDENADOR') coordenadorCount += 1;
      if (u.role === 'SECRETARIA') secretariaCount += 1;
    }

    return {
      total: users.length,
      activeCount,
      professorCount,
      coordenadorCount,
      secretariaCount,
    };
  }, [users]);

  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('TODOS');
    setStatusFilter('TODOS');
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    roleFilter !== 'TODOS' ||
    statusFilter !== 'TODOS';

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="section-header-row">
          <div>
            <span className="badge-stage">
              Área da Secretaria de Coordenação
            </span>
            <h2>Gestão de Usuários</h2>
            <p className="lead-text" style={{ marginBottom: 0 }}>
              Cadastro e acompanhamento das contas institucionais do sistema,
              seus perfis de acesso (<code>PROFESSOR</code>,{' '}
              <code>COORDENADOR</code> e <code>SECRETARIA</code>), situação
              cadastral e vínculo com cursos.
            </p>
          </div>
          <div className="header-actions-inline">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setIsCreateFormOpen((prev) => !prev);
                setCreateError(null);
              }}
            >
              {isCreateFormOpen ? 'Fechar Cadastro' : 'Novo Usuário'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadData()}
              disabled={isLoading || isCreatingUser}
            >
              {isLoading ? 'Atualizando...' : 'Atualizar Lista'}
            </button>
          </div>
        </div>
      </section>

      {createFeedback && (
        <div
          className={`alert-box ${
            createFeedback.auditPending ? 'alert-warn' : 'alert-ok'
          }`}
          role={createFeedback.auditPending ? 'alert' : 'status'}
        >
          <div className="section-header-row">
            <div>
              <strong>
                {createFeedback.auditPending
                  ? 'Cadastro concluído com pendência de auditoria (RNF06):'
                  : 'Cadastro concluído (RF02 / CA07):'}
              </strong>{' '}
              {createFeedback.message}
              {createFeedback.auditPending && createFeedback.auditErrorCode && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.82rem' }}>
                  Código de diagnóstico da auditoria:{' '}
                  <code>{createFeedback.auditErrorCode}</code>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setCreateFeedback(null)}
            >
              Fechar aviso
            </button>
          </div>
        </div>
      )}

      {userActionError && (
        <div className="alert-box alert-danger" role="alert">
          <strong>Não foi possível concluir a operação:</strong>{' '}
          {userActionError.message}
          {userActionError.code && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>
              Código: <code>{userActionError.code}</code>
            </div>
          )}
        </div>
      )}

      {userActionFeedback && (
        <div
          className={`alert-box ${
            userActionFeedback.auditPending ? 'alert-warn' : 'alert-ok'
          }`}
          role={userActionFeedback.auditPending ? 'alert' : 'status'}
        >
          <strong>
            {userActionFeedback.auditPending
              ? 'Alteração concluída com pendência de auditoria:'
              : 'Operação concluída:'}
          </strong>{' '}
          {userActionFeedback.message}
          {userActionFeedback.auditPending &&
            userActionFeedback.auditErrorCode && (
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem' }}>
                Código de diagnóstico da auditoria:{' '}
                <code>{userActionFeedback.auditErrorCode}</code>
              </div>
            )}
        </div>
      )}

      {/* Formulário de Cadastro de Usuário via Edge Function */}
      {isCreateFormOpen && (
        <section
          className="info-card create-user-card"
          aria-labelledby="create-user-heading"
        >
          <div className="section-header-row">
            <div>
              <span className="badge-stage">
                Provisionamento Institucional (RF02 / RF05 / RF06)
              </span>
              <h3 id="create-user-heading">Cadastrar Novo Usuário</h3>
              <p className="text-muted" style={{ marginTop: 0 }}>
                A conta será criada no Supabase Auth com perfil autoritativo em{' '}
                <code>public.profiles</code> e um convite por e-mail será
                enviado para o usuário configurar sua própria senha.
              </p>
            </div>
          </div>

          {createError && (
            <div className="alert-box alert-danger" role="alert">
              <strong>Não foi possível concluir o cadastro:</strong>{' '}
              {createError.message}
              {createError.code && (
                <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>
                  Código: <code>{createError.code}</code>
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={handleCreateUserSubmit}
            className="create-user-form"
            noValidate
          >
            <div className="form-grid-three">
              <div className="form-group">
                <label htmlFor="create-user-name" className="form-label">
                  Nome completo *
                </label>
                <input
                  id="create-user-name"
                  type="text"
                  className="form-input"
                  placeholder="Ex.: Profa. Maria Silva"
                  value={newFullName}
                  onChange={(e) => {
                    setNewFullName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  disabled={isCreatingUser}
                  maxLength={160}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-user-email" className="form-label">
                  E-mail institucional *
                </label>
                <input
                  id="create-user-email"
                  type="email"
                  className="form-input"
                  placeholder="nome@impacta.edu.br"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  disabled={isCreatingUser}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="create-user-role" className="form-label">
                  Perfil de acesso (único por conta) *
                </label>
                <select
                  id="create-user-role"
                  className="form-input"
                  value={newRole}
                  onChange={(e) =>
                    handleRoleChange(e.target.value as UserRole)
                  }
                  disabled={isCreatingUser}
                >
                  <option value="PROFESSOR">
                    PROFESSOR — {ROLE_LABELS.PROFESSOR}
                  </option>
                  <option value="COORDENADOR">
                    COORDENADOR — {ROLE_LABELS.COORDENADOR}
                  </option>
                  <option value="SECRETARIA">
                    SECRETARIA — {ROLE_LABELS.SECRETARIA}
                  </option>
                </select>
              </div>
            </div>

            {newRole === 'COORDENADOR' ? (
              <div className="course-selection-block">
                <div className="form-label-row">
                  <span className="form-label">
                    Cursos vinculados ao Coordenador (selecione pelo menos 1
                    curso ativo) *
                  </span>
                  <span className="text-muted">
                    Selecionados: <strong>{selectedCourseIds.length}</strong>
                  </span>
                </div>

                {activeCourses.length === 0 ? (
                  <div className="alert-box alert-warn">
                    Nenhum curso ativo encontrado em <code>public.courses</code>.
                    É necessário haver pelo menos um curso ativo para cadastrar um
                    Coordenador.
                  </div>
                ) : (
                  <div
                    className="course-checkbox-grid"
                    role="group"
                    aria-label="Cursos ativos disponíveis para vínculo"
                  >
                    {activeCourses.map((course) => {
                      const isChecked = selectedCourseIds.includes(course.id);
                      return (
                        <label
                          key={course.id}
                          className={`course-checkbox-card ${
                            isChecked ? 'course-checkbox-card-selected' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              handleToggleCourseSelection(course.id)
                            }
                            disabled={isCreatingUser}
                          />
                          <span>{course.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
                <strong>Nota de escopo:</strong> O vínculo direto em{' '}
                <code>public.user_courses</code> é exclusivo para o perfil{' '}
                <code>COORDENADOR</code>. Para <code>{newRole}</code>, nenhum
                vínculo em <code>user_courses</code> será criado.
              </p>
            )}

            <div className="card-footer-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  isCreatingUser ||
                  (newRole === 'COORDENADOR' && activeCourses.length === 0)
                }
              >
                {isCreatingUser
                  ? 'Criando conta e enviando convite...'
                  : 'Cadastrar Usuário e Enviar Convite'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetCreateFormFields();
                  setIsCreateFormOpen(false);
                }}
                disabled={isCreatingUser}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Indicadores Rápidos da Listagem */}
      <section className="summary-grid" aria-label="Resumo de contas cadastradas">
        <div className="summary-card">
          <span className="summary-label">Total de Contas</span>
          <strong className="summary-value">{summaryCounts.total}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Contas Ativas</span>
          <strong className="summary-value text-ok">
            {summaryCounts.activeCount}
          </strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Professores</span>
          <strong className="summary-value">
            {summaryCounts.professorCount}
          </strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Coordenadores</span>
          <strong className="summary-value">
            {summaryCounts.coordenadorCount}
          </strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Secretaria</span>
          <strong className="summary-value">
            {summaryCounts.secretariaCount}
          </strong>
        </div>
      </section>

      {editingUserId && (
        <section
          ref={editUserSectionRef}
          className="info-card"
          aria-labelledby="edit-user-heading"
        >
          <div className="section-header-row">
            <div>
              <h3 id="edit-user-heading" style={{ marginBottom: 0 }}>
                Editar usuário
              </h3>
              <p className="text-muted" style={{ marginBottom: 0 }}>
                Atualize o nome cadastral da conta sem criar outro usuário.
              </p>
            </div>
          </div>
          <form onSubmit={handleSaveUser} className="create-user-form">
            <div className="form-group">
              <label htmlFor="edit-user-name" className="form-label">
                Nome completo *
              </label>
              <input
                ref={editUserNameInputRef}
                id="edit-user-name"
                type="text"
                className="form-input"
                value={editedFullName}
                onChange={(event) => setEditedFullName(event.target.value)}
                maxLength={160}
                required
                disabled={isManagingUser}
              />
            </div>
            <div className="card-footer-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={isManagingUser}
              >
                {isManagingUser ? 'Salvando...' : 'Salvar alterações'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingUserId(null);
                  setEditedFullName('');
                }}
                disabled={isManagingUser}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      {users.some((user) => user.role === 'COORDENADOR') && (
        <section
          className="info-card"
          aria-labelledby="coordinator-courses-heading"
        >
          <div className="section-header-row">
            <div>
              <h3
                id="coordinator-courses-heading"
                style={{ marginBottom: 0 }}
              >
                Vínculos de Coordenação
              </h3>
              <p className="text-muted" style={{ marginBottom: 0 }}>
                Um Coordenador pode estar vinculado a vários cursos e deve
                manter pelo menos um curso ativo.
              </p>
            </div>
          </div>

          <div className="filters-bar">
            <div className="filter-field">
              <label
                htmlFor="coordinator-course-user"
                className="form-label"
              >
                Coordenador
              </label>
              <select
                id="coordinator-course-user"
                className="form-input"
                value={selectedCoordinatorId}
                onChange={(event) => {
                  setSelectedCoordinatorId(event.target.value);
                  setSelectedCoordinatorCourseId('');
                }}
                disabled={isManagingCourseLinks}
              >
                {users
                  .filter((user) => user.role === 'COORDENADOR')
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="filter-field filter-field-grow">
              <label
                htmlFor="coordinator-course-to-add"
                className="form-label"
              >
                Curso ativo para vincular
              </label>
              <select
                id="coordinator-course-to-add"
                className="form-input"
                value={selectedCoordinatorCourseId}
                onChange={(event) =>
                  setSelectedCoordinatorCourseId(event.target.value)
                }
                disabled={
                  isManagingCourseLinks ||
                  activeCourses.filter(
                    (course) =>
                      !users
                        .find((user) => user.id === selectedCoordinatorId)
                        ?.courses.some((linked) => linked.id === course.id)
                  ).length === 0
                }
              >
                <option value="">Selecione um curso</option>
                {activeCourses
                  .filter(
                    (course) =>
                      !users
                        .find((user) => user.id === selectedCoordinatorId)
                        ?.courses.some((linked) => linked.id === course.id)
                  )
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleAddCoordinatorCourse()}
              disabled={
                isManagingCourseLinks ||
                !selectedCoordinatorId ||
                !selectedCoordinatorCourseId
              }
            >
              {isManagingCourseLinks ? 'Salvando...' : 'Vincular curso'}
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Coordenador</th>
                  <th scope="col">Cursos vinculados</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((user) => user.role === 'COORDENADOR')
                  .map((user) => (
                    <tr key={user.id}>
                      <td data-label="Coordenador">{user.full_name}</td>
                      <td data-label="Cursos vinculados">
                        {user.courses.length > 0 ? (
                          <div className="course-tags-list">
                            {user.courses.map((course) => {
                              const hasAnotherActiveCourse =
                                user.courses.some(
                                  (linked) =>
                                    linked.id !== course.id && linked.active
                                );
                              return (
                                <span
                                  key={course.id}
                                  className={`course-tag ${
                                    !course.active
                                      ? 'course-tag-inactive'
                                      : ''
                                  }`}
                                >
                                  {course.name}
                                  {!course.active ? ' (Inativo)' : ''}
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() =>
                                      void handleRemoveCoordinatorCourse(
                                        user,
                                        course.id,
                                        course.name
                                      )
                                    }
                                    disabled={
                                      isManagingCourseLinks ||
                                      !hasAnotherActiveCourse
                                    }
                                    title={
                                      hasAnotherActiveCourse
                                        ? 'Remover este vínculo'
                                        : 'O Coordenador deve manter ao menos um curso ativo'
                                    }
                                  >
                                    Remover
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-warn">
                            Nenhum curso vinculado; associe um curso ativo.
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Filtros e Tabela de Usuários */}
      <section className="info-card" aria-labelledby="users-list-heading">
        <div className="section-header-row">
          <h3 id="users-list-heading" style={{ marginBottom: 0 }}>
            Usuários Cadastrados ({filteredUsers.length})
          </h3>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={clearFilters}
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="filters-bar" role="search" aria-label="Filtros de usuários">
          <div className="filter-field filter-field-grow">
            <label htmlFor="user-search-input" className="form-label">
              Buscar por nome, e-mail ou curso
            </label>
            <input
              id="user-search-input"
              type="search"
              className="form-input"
              placeholder="Ex.: nome, nome@impacta.edu.br ou curso..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="user-role-filter" className="form-label">
              Perfil
            </label>
            <select
              id="user-role-filter"
              className="form-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="TODOS">Todos os perfis</option>
              <option value="PROFESSOR">Professor</option>
              <option value="COORDENADOR">Coordenador</option>
              <option value="SECRETARIA">Secretaria</option>
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="user-status-filter" className="form-label">
              Situação da conta
            </label>
            <select
              id="user-status-filter"
              className="form-input"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as AccountStatusFilter)
              }
            >
              <option value="TODOS">Todas</option>
              <option value="ATIVOS">Somente ativas</option>
              <option value="INATIVOS">Somente inativas</option>
            </select>
          </div>
        </div>

        {errorMessage && (
          <div className="alert-box alert-danger" role="alert">
            <strong>Erro ao carregar usuários:</strong> {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="state-box" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p>Carregando usuários cadastrados...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="state-box">
            <p className="text-muted" style={{ margin: 0 }}>
              {hasActiveFilters
                ? 'Nenhum usuário encontrado para os filtros selecionados.'
                : 'Nenhum usuário cadastrado na base de dados.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nome completo</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Curso vinculado</th>
                  <th scope="col">Situação da conta</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((userItem) => (
                  <tr key={userItem.id}>
                    <td data-label="Nome completo">
                      <span className="user-name-cell">
                        {userItem.full_name}
                      </span>
                    </td>
                    <td data-label="E-mail">
                      <span className="user-email-cell">{userItem.email}</span>
                    </td>
                    <td data-label="Perfil">
                      {userItem.role ? (
                        <span
                          className={`role-badge role-badge-${userItem.role.toLowerCase()}`}
                          title={ROLE_LABELS[userItem.role]}
                        >
                          {userItem.role}
                        </span>
                      ) : (
                        <span className="status-badge status-danger">
                          Sem perfil
                        </span>
                      )}
                    </td>
                    <td data-label="Curso vinculado">
                      {userItem.role === 'COORDENADOR' ? (
                        userItem.courses.length > 0 ? (
                          <div className="course-tags-list">
                            {userItem.courses.map((course) => (
                              <span
                                key={course.id}
                                className={`course-tag ${
                                  !course.active ? 'course-tag-inactive' : ''
                                }`}
                              >
                                {course.name}
                                {!course.active ? ' (Inativo)' : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-warn">
                            Nenhum curso vinculado
                          </span>
                        )
                      ) : (
                        <span className="text-muted">Não aplicável</span>
                      )}
                    </td>
                    <td data-label="Situação da conta">
                      <span
                        className={`status-badge ${
                          userItem.active ? 'status-ok' : 'status-danger'
                        }`}
                      >
                        {userItem.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td data-label="Ações">
                      <div className="header-actions-inline">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleEditUser(userItem)}
                          disabled={isManagingUser || isManagingCourseLinks}
                        >
                          Editar nome
                        </button>
                        <button
                          type="button"
                          className={
                            userItem.active
                              ? 'btn-secondary btn-sm'
                              : 'btn-primary btn-sm'
                          }
                          onClick={() =>
                            void handleSetUserActive(
                              userItem,
                              !userItem.active
                            )
                          }
                          disabled={isManagingUser || isManagingCourseLinks}
                        >
                          {userItem.active ? 'Desativar' : 'Reativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
