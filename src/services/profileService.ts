import { supabase } from './supabaseClient';
import {
  VALID_USER_ROLES,
  type AccessDenialReason,
  type AuthorizedUserProfile,
} from '../types/auth';
import type { CourseRow, UserRole } from '../types/database';

export type CourseSummary = Pick<CourseRow, 'id' | 'name' | 'active'>;

export interface ProfileVerificationResult {
  authorizedProfile: AuthorizedUserProfile | null;
  denialReason: AccessDenialReason | null;
  errorMessage: string | null;
  /**
   * Indica se a falha é um erro definitivo de validação do perfil (inexistente, inativo ou role inválida),
   * exigindo o encerramento da sessão local (CA10), em contraste com falhas transitórias de rede.
   */
  shouldTerminateLocalSession: boolean;
}

export function isValidUserRole(role: unknown): role is UserRole {
  return (
    typeof role === 'string' &&
    VALID_USER_ROLES.includes(role as UserRole)
  );
}

function isCourseSummary(value: unknown): value is CourseSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.active === 'boolean'
  );
}

/**
 * Carrega o perfil autoritativo em `public.profiles` e os cursos vinculados em
 * `public.user_courses` pelo UUID de `auth.users` (nunca via user_metadata).
 *
 * Regras de segurança (Especificação Técnica do Banco, Seções 3.1, 10 e 11; CA10, CA11):
 * - Diferencia erros de rede/consulta (`PROFILE_FETCH_ERROR`, sem encerrar sessão)
 *   de erros definitivos de validação (`PROFILE_NOT_FOUND`, `PROFILE_INACTIVE`, `ROLE_MISSING_OR_INVALID`).
 * - O acesso falha fechado (fail-closed) em todos os cenários de erro ou invalidação.
 */
export async function fetchAndValidateUserProfile(
  userId: string
): Promise<ProfileVerificationResult> {
  if (!supabase) {
    return {
      authorizedProfile: null,
      denialReason: 'ENV_NOT_CONFIGURED',
      errorMessage:
        'A conexão com o Supabase ainda não foi configurada no ambiente local.',
      shouldTerminateLocalSession: false,
    };
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, active, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    return {
      authorizedProfile: null,
      denialReason: 'PROFILE_FETCH_ERROR',
      errorMessage:
        'Não foi possível verificar o perfil de acesso no momento. Verifique sua conexão e tente novamente.',
      shouldTerminateLocalSession: false,
    };
  }

  if (!profileData) {
    return {
      authorizedProfile: null,
      denialReason: 'PROFILE_NOT_FOUND',
      errorMessage:
        'Perfil de usuário não localizado na base institucional. Contate a Secretaria de Coordenação.',
      shouldTerminateLocalSession: true,
    };
  }

  if (!profileData.active) {
    return {
      authorizedProfile: null,
      denialReason: 'PROFILE_INACTIVE',
      errorMessage:
        'Esta conta está desativada. O acesso ao sistema não é permitido (CA10).',
      shouldTerminateLocalSession: true,
    };
  }

  if (!isValidUserRole(profileData.role)) {
    return {
      authorizedProfile: null,
      denialReason: 'ROLE_MISSING_OR_INVALID',
      errorMessage:
        'A conta não possui um perfil de acesso válido atribuído (PROFESSOR, SECRETARIA ou COORDENADOR).',
      shouldTerminateLocalSession: true,
    };
  }

  // Consulta os cursos vinculados ao usuário (user_courses -> courses), respeitando RLS
  const { data: userCoursesData, error: userCoursesError } = await supabase
    .from('user_courses')
    .select('course_id, courses ( id, name, active )')
    .eq('user_id', userId);

  if (userCoursesError) {
    return {
      authorizedProfile: null,
      denialReason: 'PROFILE_FETCH_ERROR',
      errorMessage:
        'Não foi possível validar os vínculos de curso do perfil. Tente novamente.',
      shouldTerminateLocalSession: false,
    };
  }

  const courses: CourseSummary[] = [];
  if (Array.isArray(userCoursesData)) {
    for (const row of userCoursesData) {
      const joinedCourses: unknown = row.courses;
      if (Array.isArray(joinedCourses)) {
        for (const item of joinedCourses) {
          if (isCourseSummary(item) && item.active) {
            courses.push(item);
          }
        }
      } else if (isCourseSummary(joinedCourses) && joinedCourses.active) {
        courses.push(joinedCourses);
      }
    }
  }

  return {
    authorizedProfile: {
      ...profileData,
      role: profileData.role,
      courses,
    },
    denialReason: null,
    errorMessage: null,
    shouldTerminateLocalSession: false,
  };
}
