import type { CourseRow, ProfileRow, UserRole } from './database';

export type UserCourseInfo = Pick<CourseRow, 'id' | 'name' | 'active'>;

export interface UserListItem {
  id: ProfileRow['id'];
  full_name: ProfileRow['full_name'];
  email: ProfileRow['email'];
  role: ProfileRow['role'];
  active: ProfileRow['active'];
  created_at: ProfileRow['created_at'];
  updated_at: ProfileRow['updated_at'];
  /**
   * Cursos vinculados em `public.user_courses` (exclusivo para o perfil COORDENADOR nesta etapa).
   */
  courses: UserCourseInfo[];
}

export type AccountStatusFilter = 'TODOS' | 'ATIVOS' | 'INATIVOS';
export type RoleFilter = 'TODOS' | UserRole;

export interface UserListFilters {
  searchQuery: string;
  role: RoleFilter;
  status: AccountStatusFilter;
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  role: UserRole;
  /**
   * IDs dos cursos ativos vinculados (obrigatório e exclusivo para COORDENADOR nesta etapa).
   */
  course_ids: string[];
  redirect_to?: string;
}

export interface CreateUserResult {
  success: boolean;
  errorCode: string | null;
  message: string;
  createdUserId?: string;
  /**
   * Indica que a conta e o perfil foram criados com sucesso, porém o registro em
   * `public.audit_logs` falhou e requer verificação técnica (RNF06).
   */
  auditPending?: boolean;
  auditErrorCode?: string | null;
}

export interface ManageUserPayload {
  user_id: string;
  full_name?: string;
  active?: boolean;
}

export interface ManageUserResult {
  success: boolean;
  errorCode: string | null;
  message: string;
  auditPending?: boolean;
  auditErrorCode?: string | null;
}
