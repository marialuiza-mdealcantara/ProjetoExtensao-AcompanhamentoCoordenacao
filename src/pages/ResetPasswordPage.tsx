import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  clearInitialAuthUrlSnapshot,
  initialAuthUrlSnapshot,
} from '../services/supabaseClient';
import {
  evaluatePasswordPolicy,
  PASSWORD_POLICY,
  resolvePostLoginRedirect,
  updatePasswordFromRecovery,
  validatePasswordInput,
} from '../services/authService';

export type PasswordSetupFlowType = 'invite' | 'recovery';

export interface RecoveryLinkDiagnostics {
  hasUrlError: boolean;
  errorMessage: string | null;
  flowType: PasswordSetupFlowType;
  hasFlowType: boolean;
}

function stripLeadingHashOrQuestion(raw: string): string {
  if (raw.startsWith('#') || raw.startsWith('?')) {
    return raw.slice(1);
  }
  return raw;
}

/**
 * Inspeciona parâmetros de query e fragmento hash da URL (atuais e capturados no bootstrap
 * em `initialAuthUrlSnapshot` antes da limpeza automática do GoTrueClient) para:
 * 1. Diferenciar o fluxo de convite inicial (`type=invite` no hash do link do Supabase Auth)
 *    do fluxo de recuperação de senha (`type=recovery`).
 * 2. Detectar imediatamente links inválidos ou expirados (`otp_expired`, `access_denied` — CA06).
 */
export function inspectRecoveryOrInviteUrl(
  customSearch?: string,
  customHash?: string
): RecoveryLinkDiagnostics {
  const currentSearch =
    customSearch ??
    (typeof window !== 'undefined' ? window.location.search : '');
  const currentHash =
    customHash ?? (typeof window !== 'undefined' ? window.location.hash : '');

  const searchParams = new URLSearchParams(
    stripLeadingHashOrQuestion(currentSearch)
  );
  const hashParams = new URLSearchParams(
    stripLeadingHashOrQuestion(currentHash)
  );
  const initialSearchParams = new URLSearchParams(
    stripLeadingHashOrQuestion(initialAuthUrlSnapshot.search)
  );
  const initialHashParams = new URLSearchParams(
    stripLeadingHashOrQuestion(initialAuthUrlSnapshot.hash)
  );

  const getParam = (key: string): string =>
    hashParams.get(key) ??
    initialHashParams.get(key) ??
    searchParams.get(key) ??
    initialSearchParams.get(key) ??
    '';

  const typeParam = getParam('type').toLowerCase();
  const hasFlowType = typeParam === 'invite' || typeParam === 'recovery';
  const flowType: PasswordSetupFlowType =
    typeParam === 'invite' ? 'invite' : 'recovery';

  const errorCode = getParam('error_code');
  const errorParam = getParam('error');
  const errorDescription = getParam('error_description');

  if (errorCode || errorParam || errorDescription) {
    const normalizedCode = errorCode.toLowerCase();
    const normalizedDesc = errorDescription.toLowerCase();

    if (
      normalizedCode === 'otp_expired' ||
      normalizedDesc.includes('expired') ||
      normalizedDesc.includes('invalid')
    ) {
      return {
        hasUrlError: true,
        flowType,
        hasFlowType,
        errorMessage:
          flowType === 'invite'
            ? 'Este link de convite é inválido ou já expirou (CA06). Utilize a opção "Recuperar Senha" na tela de login para receber um novo link de definição de senha.'
            : 'Este link de recuperação de senha é inválido ou já expirou (CA06). Solicite um novo link para redefinir sua senha.',
      };
    }

    return {
      hasUrlError: true,
      flowType,
      hasFlowType,
      errorMessage:
        flowType === 'invite'
          ? 'Não foi possível validar o link de convite institucional. Utilize a recuperação de senha por e-mail para definir sua senha.'
          : 'Não foi possível validar o link de recuperação de senha. Solicite um novo link por e-mail.',
    };
  }

  return { hasUrlError: false, errorMessage: null, flowType, hasFlowType };
}

export function ResetPasswordPage() {
  const {
    session,
    profile,
    isLoading,
    isPasswordRecovery,
    isConfigured,
    signOut,
    refreshProfile,
  } = useAuth();
  const navigate = useNavigate();

  const urlDiagnostics = useMemo(() => inspectRecoveryOrInviteUrl(), []);
  const isInviteFlow = urlDiagnostics.flowType === 'invite';

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gracePeriodComplete, setGracePeriodComplete] =
    useState<boolean>(false);
  const [invitePasswordSaved, setInvitePasswordSaved] = useState(false);

  useEffect(() => {
    if (urlDiagnostics.hasFlowType || urlDiagnostics.hasUrlError) {
      clearInitialAuthUrlSnapshot();
    }
  }, [urlDiagnostics]);

  useEffect(() => {
    if (!invitePasswordSaved || isLoading) return;
    if (profile?.active && profile.role) {
      navigate(resolvePostLoginRedirect(profile.role), { replace: true });
      return;
    }
    setInvitePasswordSaved(false);
    setFormError('A senha foi salva, mas não foi possível validar seu perfil para concluir o acesso. Tente entrar novamente ou contate a Secretaria.');
  }, [invitePasswordSaved, isLoading, navigate, profile]);

  // Aguarda um breve intervalo para que o Supabase Auth processe o token da URL (detectSessionInUrl)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGracePeriodComplete(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const policyEvaluation = useMemo(
    () => evaluatePasswordPolicy(password),
    [password]
  );

  const hasValidRecoverySession =
    !urlDiagnostics.hasUrlError && Boolean(session || isPasswordRecovery);

  const isCheckingLink =
    !urlDiagnostics.hasUrlError &&
    !hasValidRecoverySession &&
    (isLoading || !gracePeriodComplete);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const passwordError = validatePasswordInput(password, {
      enforcePolicy: true,
    });
    if (passwordError) {
      setFormError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setFormError('A confirmação de senha não coincide com a nova senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updatePasswordFromRecovery(password);
      if (!result.success) {
        setFormError(
          result.errorMessage ?? 'Não foi possível salvar sua senha.'
        );
        return;
      }

      if (isInviteFlow) {
        await refreshProfile();
        setInvitePasswordSaved(true);
        return;
      }

      // Preserva o fluxo de recuperação existente, que solicita novo login.
      await signOut();
      navigate('/login', {
        replace: true,
        state: {
          passwordResetSuccess: true,
          isInviteActivation: isInviteFlow,
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCriterionClass = (met: boolean) => {
    if (!password) return 'policy-item-neutral';
    return met ? 'policy-item-ok' : 'policy-item-pending';
  };

  return (
    <div className="auth-container">
      <section
        className="info-card auth-card"
        aria-labelledby="reset-password-heading"
      >
        <div className="auth-header">
          <span className="badge-stage">
            {isInviteFlow
              ? 'Ativação de Conta Institucional (Convite)'
              : 'Redefinição de Senha (RF10)'}
          </span>
          <h2 id="reset-password-heading">
            {isInviteFlow
              ? 'Configurar Senha de Acesso'
              : 'Definir Nova Senha'}
          </h2>
          <p className="text-muted">
            {isInviteFlow
              ? 'Bem-vindo(a)! Defina sua senha pessoal para concluir a ativação da sua conta institucional.'
              : 'Crie uma nova senha segura para sua conta institucional.'}
          </p>
        </div>

        {isCheckingLink ? (
          <div className="state-box" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p>
              {isInviteFlow
                ? 'Validando link de convite institucional...'
                : 'Validando link temporário de recuperação...'}
            </p>
          </div>
        ) : !hasValidRecoverySession ? (
          <div>
            <div className="alert-box alert-danger" role="alert">
              <strong>Link inválido ou expirado (CA06):</strong>{' '}
              {urlDiagnostics.errorMessage ??
                'Este endereço só pode ser utilizado a partir de um link temporário válido e ativo enviado ao seu e-mail institucional.'}
            </div>
            <div className="card-footer-actions">
              <Link to="/recuperar-senha" className="btn-primary">
                Solicitar Novo Link por E-mail
              </Link>
              <Link to="/login" className="btn-secondary">
                Ir para o Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div
              className="password-policy-box"
              aria-label="Requisitos da política de senhas"
            >
              <p className="password-policy-title">Sua senha deve conter:</p>
              <ul className="password-policy-list">
                <li className={getCriterionClass(policyEvaluation.hasMinLength)}>
                  Pelo menos {PASSWORD_POLICY.MIN_LENGTH} caracteres
                </li>
                <li className={getCriterionClass(policyEvaluation.hasUppercase)}>
                  Pelo menos uma letra maiúscula (A–Z)
                </li>
                <li className={getCriterionClass(policyEvaluation.hasLowercase)}>
                  Pelo menos uma letra minúscula (a–z)
                </li>
                <li className={getCriterionClass(policyEvaluation.hasNumber)}>
                  Pelo menos um número (0–9)
                </li>
                <li
                  className={getCriterionClass(policyEvaluation.hasSpecialChar)}
                >
                  Pelo menos um caractere especial (ex.: !@#$%&amp;*)
                </li>
              </ul>
            </div>

            {formError && (
              <div className="alert-box alert-danger" role="alert">
                {formError}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="new-password" className="form-label">
                {isInviteFlow ? 'Senha de acesso' : 'Nova senha'}
              </label>
              <div className="password-input-wrapper">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Digite sua senha segura"
                  autoComplete="new-password"
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
                  disabled={isSubmitting || !isConfigured}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-new-password" className="form-label">
                {isInviteFlow ? 'Confirmar senha de acesso' : 'Confirmar nova senha'}
              </label>
              <input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Repita a senha digitada"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                disabled={isSubmitting || !isConfigured}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={isSubmitting || !isConfigured}
            >
              {isSubmitting
                ? 'Salvando senha...'
                : isInviteFlow
                ? 'Definir Senha e Ativar Acesso'
                : 'Salvar Nova Senha'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
