import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  resolvePostLoginRedirect,
  ROLE_LABELS,
  validateEmailInput,
  validatePasswordInput,
} from '../services/authService';

interface LoginLocationState {
  from?: { pathname?: string };
  sessionExpired?: boolean;
  passwordResetSuccess?: boolean;
  isInviteActivation?: boolean;
}

export function LoginPage() {
  const {
    isConfigured,
    user,
    profile,
    isLoading,
    sessionExpired,
    accessDenialReason,
    errorMessage: contextErrorMessage,
    signInWithPassword,
    clearAuthFeedback,
  } = useAuth();

  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state as LoginLocationState | null) ?? null;

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fromPathname = locationState?.from?.pathname ?? null;

  // Se já estiver autenticado com perfil ativo e válido, redireciona conforme o perfil
  if (!isLoading && user && profile && profile.active && profile.role) {
    const targetRoute = resolvePostLoginRedirect(profile.role, fromPathname);
    return <Navigate to={targetRoute} replace />;
  }

  const isSessionExpiredBannerVisible =
    !formError &&
    (sessionExpired ||
      Boolean(locationState?.sessionExpired) ||
      accessDenialReason === 'SESSION_EXPIRED');

  const isPasswordResetSuccessVisible =
    !formError &&
    !contextErrorMessage &&
    Boolean(locationState?.passwordResetSuccess);

  const displayedError =
    formError ??
    (accessDenialReason !== 'SESSION_EXPIRED' ? contextErrorMessage : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    clearAuthFeedback();

    const emailError = validateEmailInput(email);
    if (emailError) {
      setFormError(emailError);
      return;
    }

    const passwordError = validatePasswordInput(password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signInWithPassword(email, password);

      if (!result.success || !result.role) {
        setFormError(
          result.errorMessage ??
            'Não foi possível autenticar. Verifique suas credenciais.'
        );
        return;
      }

      const destination = resolvePostLoginRedirect(result.role, fromPathname);
      navigate(destination, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <section className="info-card auth-card" aria-labelledby="login-heading">
        <div className="auth-header">
          <span className="badge-stage">Autenticação Institucional</span>
          <h2 id="login-heading">Acesso ao Sistema</h2>
          <p className="text-muted">
            Entre com seu e-mail e senha cadastrados pela Secretaria de
            Coordenação para acessar os módulos conforme seu perfil (
            {ROLE_LABELS.PROFESSOR}, {ROLE_LABELS.SECRETARIA} ou{' '}
            {ROLE_LABELS.COORDENADOR}).
          </p>
        </div>

        {!isConfigured && (
          <div className="alert-box alert-warn" role="alert">
            <strong>Configuração pendente:</strong> O arquivo <code>.env</code>{' '}
            local ainda não contém as variáveis públicas do Supabase (
            <code>VITE_SUPABASE_URL</code> e{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>).
          </div>
        )}

        {isSessionExpiredBannerVisible && (
          <div className="alert-box alert-warn" role="alert">
            <strong>Sessão expirada:</strong> Sua sessão anterior expirou por
            inatividade ou segurança. Faça login novamente para continuar.
          </div>
        )}

        {isPasswordResetSuccessVisible && (
          <div className="alert-box alert-ok" role="status">
            {locationState?.isInviteActivation ? (
              <>
                <strong>Conta ativada e senha configurada com sucesso!</strong>{' '}
                Agora você pode entrar utilizando seu e-mail e a senha definida.
              </>
            ) : (
              <>
                <strong>Senha redefinida com sucesso!</strong> Agora você pode
                entrar utilizando sua nova senha.
              </>
            )}
          </div>
        )}

        {displayedError && (
          <div className="alert-box alert-danger" role="alert">
            {displayedError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              E-mail institucional
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="nome@impacta.edu.br"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (formError) setFormError(null);
              }}
              disabled={isSubmitting || !isConfigured}
              required
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="login-password" className="form-label">
                Senha
              </label>
              <Link to="/recuperar-senha" className="text-link">
                Esqueceu sua senha?
              </Link>
            </div>
            <div className="password-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Digite sua senha"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                disabled={isSubmitting || !isConfigured}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? 'Ocultar senha digitada' : 'Mostrar senha digitada'
                }
                disabled={isSubmitting || !isConfigured}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={isSubmitting || !isConfigured}
          >
            {isSubmitting ? 'Autenticando e verificando perfil...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="auth-footer-note">
          <p>
            <strong>Acesso restrito (CA08):</strong> Não existe cadastro público.
            A criação de contas, atribuição de perfil e vínculo com cursos são
            realizados exclusivamente pela <strong>Secretaria de Coordenação</strong>.
          </p>
        </div>
      </section>
    </div>
  );
}
