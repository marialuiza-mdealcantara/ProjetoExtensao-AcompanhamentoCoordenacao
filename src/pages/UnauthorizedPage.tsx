import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getDefaultRouteForRole, ROLE_LABELS } from '../services/authService';
import type { AccessDenialReason } from '../types/auth';

interface UnauthorizedLocationState {
  reason?: AccessDenialReason;
  from?: { pathname?: string };
}

const DENIAL_DESCRIPTIONS: Record<
  AccessDenialReason,
  { title: string; detail: string }
> = {
  PROFILE_INACTIVE: {
    title: 'Conta Desativada (CA10)',
    detail:
      'Sua conta institucional encontra-se desativada. O acesso ao sistema não é permitido. Caso necessário, entre em contato com a Secretaria de Coordenação.',
  },
  PROFILE_NOT_FOUND: {
    title: 'Perfil Institucional Não Localizado',
    detail:
      'Não foi encontrado um perfil ativo vinculado a esta conta na base do sistema (public.profiles). Solicite a regularização junto à Secretaria de Coordenação.',
  },
  ROLE_MISSING_OR_INVALID: {
    title: 'Perfil de Acesso Não Atribuído',
    detail:
      'Esta conta ainda não possui um perfil operacional válido atribuído (PROFESSOR, SECRETARIA ou COORDENADOR). O sistema bloqueia o acesso por segurança (fail-closed).',
  },
  ROLE_UNAUTHORIZED: {
    title: 'Permissão Insuficiente para esta Área (RN57 / CA13)',
    detail:
      'O seu perfil atual não possui permissão para acessar a rota solicitada. Utilize a área correspondente ao seu perfil de acesso.',
  },
  PROFILE_FETCH_ERROR: {
    title: 'Falha na Verificação de Permissões',
    detail:
      'Não foi possível consultar seu perfil ou vínculos de curso no momento. Por segurança (fail-closed), o acesso permanece bloqueado até que a verificação seja concluída.',
  },
  SESSION_EXPIRED: {
    title: 'Sessão Expirada',
    detail:
      'Sua sessão expirou por inatividade ou segurança. Realize um novo login para continuar.',
  },
  ENV_NOT_CONFIGURED: {
    title: 'Ambiente Não Configurado',
    detail:
      'As variáveis públicas de conexão com o Supabase não estão configuradas no ambiente local.',
  },
};

export function UnauthorizedPage() {
  const {
    accessDenialReason,
    errorMessage,
    profile,
    user,
    refreshProfile,
    signOut,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState =
    (location.state as UnauthorizedLocationState | null) ?? null;

  const effectiveReason: AccessDenialReason =
    routeState?.reason ?? accessDenialReason ?? 'ROLE_UNAUTHORIZED';

  const descriptor = DENIAL_DESCRIPTIONS[effectiveReason];
  const attemptedPath = routeState?.from?.pathname ?? null;

  const handleSignOutAndLogin = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-container">
      <section
        className="info-card auth-card"
        aria-labelledby="unauthorized-heading"
      >
        <span className="badge-stage badge-danger">
          Controle de Acesso (Fail-Closed)
        </span>
        <h2 id="unauthorized-heading">{descriptor.title}</h2>
        <p>{errorMessage ?? descriptor.detail}</p>

        <div className="meta-box">
          <div>
            <strong>Código de verificação:</strong>{' '}
            <code>{effectiveReason}</code>
          </div>
          {attemptedPath && (
            <div>
              <strong>Rota solicitada:</strong> <code>{attemptedPath}</code>
            </div>
          )}
          {profile && (
            <div>
              <strong>Perfil autenticado:</strong>{' '}
              <code>{profile.role}</code> ({ROLE_LABELS[profile.role]})
            </div>
          )}
        </div>

        <div className="card-footer-actions">
          {profile && profile.active && profile.role ? (
            <>
              <Link
                to={getDefaultRouteForRole(profile.role)}
                className="btn-primary"
              >
                Ir para Minha Área ({ROLE_LABELS[profile.role]})
              </Link>
              <Link to="/painel" className="btn-secondary">
                Acessar Dashboard
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn-primary">
              Ir para a Tela de Login
            </Link>
          )}

          {effectiveReason === 'PROFILE_FETCH_ERROR' && user && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void refreshProfile()}
            >
              Tentar Novamente
            </button>
          )}

          {(user || profile) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleSignOutAndLogin()}
            >
              Encerrar Sessão
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
