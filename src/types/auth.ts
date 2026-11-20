import type { Session, User } from '@supabase/supabase-js';
import type { CourseRow, ProfileRow, UserRole } from './database';

export const VALID_USER_ROLES: readonly UserRole[] = [
  'PROFESSOR',
  'SECRETARIA',
  'COORDENADOR',
] as const;

export interface AuthorizedUserProfile extends Omit<ProfileRow, 'role'> {
  role: UserRole;
  courses: Pick<CourseRow, 'id' | 'name' | 'active'>[];
}

export type AccessDenialReason =
  | 'ENV_NOT_CONFIGURED'
  | 'SESSION_EXPIRED'
  | 'PROFILE_FETCH_ERROR'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_INACTIVE'
  | 'ROLE_MISSING_OR_INVALID'
  | 'ROLE_UNAUTHORIZED';

export interface SignInResult {
  success: boolean;
  role: UserRole | null;
  errorMessage: string | null;
  denialReason: AccessDenialReason | null;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AuthorizedUserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  isConfigured: boolean;
  sessionExpired: boolean;
  isPasswordRecovery: boolean;
  accessDenialReason: AccessDenialReason | null;
  errorMessage: string | null;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
  hasRole: (allowedRoles?: readonly UserRole[]) => boolean;
}
