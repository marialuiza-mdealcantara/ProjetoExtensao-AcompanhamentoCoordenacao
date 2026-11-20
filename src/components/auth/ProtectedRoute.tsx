import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../types/database';

interface ProtectedRouteProps {
  allowedRoles?: readonly UserRole[];
}

/**
 * Guardião de rotas com política Fail-Closed (Especificação Técnica do Banco, Seções 10 e 11; RN47, RN57, CA03, CA10, CA13).
 * - Exige sessão autenticada no Supabase Auth.
 * - Exige perfil ativo em `public.profiles` com `role` válido (não nulo).
 * - `allowedRoles === undefined`: permite qualquer perfil autenticado ativo e válido.
 * - `allowedRoles` vazio (`[]`): sempre nega acesso (fail-closed).
 * - `allowedRoles` com papéis: exige que `profile.role` pertença à lista.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const {
    user,
    profile,
    isLoading,
    sessionExpired,
    accessDenialReason,
    hasRole,
  } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="state-box" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p>Verificando sessão e permissões de perfil...</p>
      </div>
    );
  }

  if (!user) {
    if (
      accessDenialReason === 'PROFILE_INACTIVE' ||
      accessDenialReason === 'PROFILE_NOT_FOUND' ||
      accessDenialReason === 'ROLE_MISSING_OR_INVALID'
    ) {
      return (
        <Navigate
          to="/acesso-restrito"
          state={{ from: location, reason: accessDenialReason }}
          replace
        />
      );
    }
    return (
      <Navigate
        to="/login"
        state={{
          from: location,
          sessionExpired:
            sessionExpired || accessDenialReason === 'SESSION_EXPIRED',
        }}
        replace
      />
    );
  }

  if (!profile || !profile.active || !profile.role) {
    return (
      <Navigate
        to="/acesso-restrito"
        state={{
          from: location,
          reason: accessDenialReason ?? 'ROLE_MISSING_OR_INVALID',
        }}
        replace
      />
    );
  }

  if (!hasRole(allowedRoles)) {
    return (
      <Navigate
        to="/acesso-restrito"
        state={{ from: location, reason: 'ROLE_UNAUTHORIZED' }}
        replace
      />
    );
  }

  return <Outlet />;
}
