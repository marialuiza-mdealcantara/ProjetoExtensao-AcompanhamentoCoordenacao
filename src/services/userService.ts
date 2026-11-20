import { supabase } from './supabaseClient';
import { VALID_USER_ROLES } from '../types/auth';
import { validateEmailInput } from './authService';
import type {
  CreateUserPayload,
  CreateUserResult,
  ManageUserPayload,
  ManageUserResult,
  UserCourseInfo,
  UserListItem,
} from '../types/user';
import type { UserRole } from '../types/database';

export interface FetchUsersListResult {
  users: UserListItem[];
  errorMessage: string | null;
}

export interface FetchActiveCoursesResult {
  courses: UserCourseInfo[];
  errorMessage: string | null;
}

function isUserCourseInfo(value: unknown): value is UserCourseInfo {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.active === 'boolean'
  );
}

/**
 * Valida localmente os campos do formulário de cadastro de usuário antes de acionar a Edge Function.
 * - E-mail validado pelo formato padrão (sem bloqueio por domínio).
 * - Vínculo com cursos ativos obrigatório e exclusivo para COORDENADOR nesta etapa.
 */
export function validateCreateUserInput(
  payload: CreateUserPayload
): string | null {
  const trimmedName = payload.full_name.trim();
  if (!trimmedName) {
    return 'Informe o nome completo do usuário.';
  }
  if (trimmedName.length < 3) {
    return 'O nome completo deve conter pelo menos 3 caracteres.';
  }
  if (trimmedName.length > 160) {
    return 'O nome completo deve conter no máximo 160 caracteres.';
  }

  const emailError = validateEmailInput(payload.email);
  if (emailError) {
    return emailError;
  }

  if (
    !payload.role ||
    !VALID_USER_ROLES.includes(payload.role as UserRole)
  ) {
    return 'Selecione um perfil de acesso válido (PROFESSOR, SECRETARIA ou COORDENADOR).';
  }

  if (payload.role === 'COORDENADOR') {
    if (!Array.isArray(payload.course_ids) || payload.course_ids.length === 0) {
      return 'Selecione pelo menos um curso ativo para vincular ao Coordenador.';
    }
  } else if (
    Array.isArray(payload.course_ids) &&
    payload.course_ids.length > 0
  ) {
    return 'O vínculo com cursos nesta etapa é exclusivo para o perfil Coordenador.';
  }

  return null;
}

/**
 * Consulta a listagem de usuários em `public.profiles` e os respectivos vínculos de curso
 * em `public.user_courses` -> `public.courses`.
 *
 * Segurança:
 * - Utiliza exclusivamente o cliente autenticado com a chave pública (publishable key).
 * - O controle de acesso é garantido pelas políticas RLS do banco (somente SECRETARIA
 *   possui escopo transversal de leitura sobre todos os perfis e vínculos).
 */
export async function fetchUsersList(): Promise<FetchUsersListResult> {
  if (!supabase) {
    return {
      users: [],
      errorMessage:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const [profilesResponse, userCoursesResponse] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, active, created_at, updated_at')
      .order('full_name', { ascending: true }),
    supabase
      .from('user_courses')
      .select('user_id, course_id, courses ( id, name, active )'),
  ]);

  if (profilesResponse.error) {
    return {
      users: [],
      errorMessage:
        'Não foi possível carregar a lista de usuários. Verifique sua permissão ou tente novamente.',
    };
  }

  if (userCoursesResponse.error) {
    return {
      users: [],
      errorMessage:
        'Não foi possível carregar os vínculos de cursos dos usuários. Tente novamente.',
    };
  }

  const coursesByUserId = new Map<string, UserCourseInfo[]>();

  for (const row of userCoursesResponse.data ?? []) {
    const userId = row.user_id;
    const joinedCourses: unknown = row.courses;
    const existingList = coursesByUserId.get(userId) ?? [];

    if (Array.isArray(joinedCourses)) {
      for (const item of joinedCourses) {
        if (isUserCourseInfo(item)) {
          existingList.push(item);
        }
      }
    } else if (isUserCourseInfo(joinedCourses)) {
      existingList.push(joinedCourses);
    }

    coursesByUserId.set(userId, existingList);
  }

  const users: UserListItem[] = (profilesResponse.data ?? []).map((profile) => {
    const linkedCourses = coursesByUserId.get(profile.id) ?? [];
    linkedCourses.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      active: profile.active,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      courses: profile.role === 'COORDENADOR' ? linkedCourses : [],
    };
  });

  return {
    users,
    errorMessage: null,
  };
}

/**
 * Consulta os cursos ativos em `public.courses` para associação obrigatória
 * no cadastro de Coordenadores.
 */
export async function fetchActiveCourses(): Promise<FetchActiveCoursesResult> {
  if (!supabase) {
    return {
      courses: [],
      errorMessage:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const { data, error } = await supabase
    .from('courses')
    .select('id, name, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    return {
      courses: [],
      errorMessage:
        'Não foi possível carregar a lista de cursos ativos disponíveis.',
    };
  }

  return {
    courses: data ?? [],
    errorMessage: null,
  };
}

/**
 * Aciona a Edge Function `create-user` para criar o usuário no Supabase Auth,
 * gravar `public.profiles` e `public.user_courses` (se COORDENADOR) e enviar
 * o convite institucional por e-mail.
 *
 * - Utiliza exclusivamente `${window.location.origin}/redefinir-senha` como `redirect_to`.
 * - Nunca reporta sucesso se ocorrer falha parcial na persistência.
 * - Diferencia explicitamente sucesso integral de cadastro com auditoria pendente.
 */
export async function createUserViaEdgeFunction(
  payload: CreateUserPayload
): Promise<CreateUserResult> {
  const validationError = validateCreateUserInput(payload);
  if (validationError) {
    return {
      success: false,
      errorCode: 'CLIENT_VALIDATION_ERROR',
      message: validationError,
    };
  }

  if (!supabase) {
    return {
      success: false,
      errorCode: 'ENV_NOT_CONFIGURED',
      message:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const redirectTo =
    payload.redirect_to ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/redefinir-senha`
      : undefined);

  const normalizedBody = {
    full_name: payload.full_name.trim(),
    email: payload.email.trim().toLowerCase(),
    role: payload.role,
    course_ids: payload.role === 'COORDENADOR' ? payload.course_ids : [],
    redirect_to: redirectTo,
  };

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: normalizedBody,
  });

  if (error) {
    const contextResponse = (error as { context?: Response }).context;
    if (contextResponse && typeof contextResponse.json === 'function') {
      try {
        const errBody = (await contextResponse.json()) as {
          errorCode?: string;
          message?: string;
          auditPending?: boolean;
          auditErrorCode?: string | null;
        };
        if (errBody && typeof errBody.message === 'string') {
          return {
            success: false,
            errorCode: errBody.errorCode ?? 'EDGE_FUNCTION_HTTP_ERROR',
            message: errBody.message,
            auditPending: Boolean(errBody.auditPending),
            auditErrorCode: errBody.auditErrorCode ?? null,
          };
        }
      } catch {
        // Segue para fallback abaixo
      }
    }

    const rawErrMessage = (error.message ?? '').toLowerCase();
    if (
      rawErrMessage.includes('failed to send a request') ||
      rawErrMessage.includes('fetch') ||
      rawErrMessage.includes('not found')
    ) {
      return {
        success: false,
        errorCode: 'EDGE_FUNCTION_UNREACHABLE',
        message:
          'Não foi possível comunicar com a Edge Function create-user no Supabase. Verifique se a função já foi implantada (deploy) no projeto remoto.',
      };
    }

    return {
      success: false,
      errorCode: 'EDGE_FUNCTION_ERROR',
      message:
        'Não foi possível concluir o cadastro do usuário no servidor. Tente novamente.',
    };
  }

  const responseObj = data as {
    success?: boolean;
    auditPending?: boolean;
    auditErrorCode?: string | null;
    errorCode?: string | null;
    message?: string;
    user?: { id?: string };
  } | null;

  if (!responseObj || responseObj.success !== true) {
    return {
      success: false,
      errorCode: responseObj?.errorCode ?? 'CREATION_FAILED',
      message:
        responseObj?.message ??
        'A operação não pôde ser concluída com sucesso. Nenhum cadastro foi confirmado.',
    };
  }

  return {
    success: true,
    auditPending: Boolean(responseObj.auditPending),
    auditErrorCode: responseObj.auditErrorCode ?? null,
    errorCode: responseObj.errorCode ?? null,
    message:
      responseObj.message ??
      'Usuário cadastrado com sucesso. Um e-mail de convite foi enviado para configuração da senha.',
    createdUserId: responseObj.user?.id,
  };
}

export async function manageUserViaEdgeFunction(
  payload: ManageUserPayload
): Promise<ManageUserResult> {
  const fullName = payload.full_name?.trim();
  if (payload.full_name !== undefined && (!fullName || fullName.length < 3 || fullName.length > 160)) {
    return {
      success: false,
      errorCode: 'CLIENT_VALIDATION_ERROR',
      message: 'O nome completo deve conter entre 3 e 160 caracteres.',
    };
  }

  if (payload.full_name === undefined && payload.active === undefined) {
    return {
      success: false,
      errorCode: 'CLIENT_VALIDATION_ERROR',
      message: 'Informe ao menos uma alteração para o usuário.',
    };
  }

  if (!supabase) {
    return {
      success: false,
      errorCode: 'ENV_NOT_CONFIGURED',
      message:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: {
      user_id: payload.user_id,
      ...(fullName !== undefined ? { full_name: fullName } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
    },
  });

  if (error) {
    const contextResponse = (error as { context?: Response }).context;
    if (contextResponse && typeof contextResponse.json === 'function') {
      try {
        const errorBody = (await contextResponse.json()) as {
          errorCode?: string;
          message?: string;
        };
        if (typeof errorBody.message === 'string') {
          return {
            success: false,
            errorCode: errorBody.errorCode ?? 'EDGE_FUNCTION_HTTP_ERROR',
            message: errorBody.message,
          };
        }
      } catch {
        // Usa a mensagem explícita do SDK no fallback abaixo.
      }
    }

    return {
      success: false,
      errorCode: 'EDGE_FUNCTION_ERROR',
      message:
        error.message ||
        'Não foi possível concluir a operação de gerenciamento no servidor.',
    };
  }

  const response = data as {
    success?: boolean;
    errorCode?: string | null;
    message?: string;
    auditPending?: boolean;
    auditErrorCode?: string | null;
  } | null;

  if (!response || response.success !== true) {
    return {
      success: false,
      errorCode: response?.errorCode ?? 'USER_MANAGEMENT_FAILED',
      message:
        response?.message ??
        'A operação de gerenciamento não pôde ser concluída.',
    };
  }

  return {
    success: true,
    errorCode: response.errorCode ?? null,
    message: response.message ?? 'Usuário atualizado com sucesso.',
    auditPending: Boolean(response.auditPending),
    auditErrorCode: response.auditErrorCode ?? null,
  };
}
