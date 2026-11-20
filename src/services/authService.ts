import { supabase } from './supabaseClient';
import type { UserRole } from '../types/database';

export const ROLE_LABELS: Record<UserRole, string> = {
  PROFESSOR: 'Professor',
  SECRETARIA: 'Secretaria de Coordenação',
  COORDENADOR: 'Coordenador de Curso',
};

/**
 * Política de senha efetivamente configurada no Supabase Auth do projeto:
 * - Comprimento mínimo: 8 caracteres
 * - Letras minúsculas (a-z)
 * - Letras maiúsculas (A-Z)
 * - Números (0-9)
 * - Caracteres especiais (!@#$%^&*()_+-=[]{};'\:"|<>?,./`~)
 */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  SPECIAL_CHARS_PATTERN: /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/,
} as const;

export interface PasswordPolicyEvaluation {
  hasMinLength: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
  missingCriteria: string[];
}

/**
 * Avalia uma senha frente à política real configurada no Supabase Auth.
 */
export function evaluatePasswordPolicy(
  password: string
): PasswordPolicyEvaluation {
  const hasMinLength = password.length >= PASSWORD_POLICY.MIN_LENGTH;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = PASSWORD_POLICY.SPECIAL_CHARS_PATTERN.test(password);

  const missingCriteria: string[] = [];
  if (!hasMinLength) {
    missingCriteria.push(
      `pelo menos ${PASSWORD_POLICY.MIN_LENGTH} caracteres`
    );
  }
  if (!hasUppercase) {
    missingCriteria.push('uma letra maiúscula (A–Z)');
  }
  if (!hasLowercase) {
    missingCriteria.push('uma letra minúscula (a–z)');
  }
  if (!hasNumber) {
    missingCriteria.push('um número (0–9)');
  }
  if (!hasSpecialChar) {
    missingCriteria.push('um caractere especial (ex.: !@#$%&*)');
  }

  return {
    hasMinLength,
    hasLowercase,
    hasUppercase,
    hasNumber,
    hasSpecialChar,
    isValid:
      hasMinLength &&
      hasLowercase &&
      hasUppercase &&
      hasNumber &&
      hasSpecialChar,
    missingCriteria,
  };
}

/**
 * Retorna a rota inicial padrão correspondente ao perfil autenticado.
 */
export function getDefaultRouteForRole(role: UserRole): string {
  switch (role) {
    case 'SECRETARIA':
      return '/secretaria';
    case 'COORDENADOR':
      return '/coordenacao';
    case 'PROFESSOR':
      return '/professor';
  }
}

/**
 * Verifica se um caminho interno é compatível com o perfil do usuário autenticado.
 */
export function isPathAllowedForRole(pathname: string, role: UserRole): boolean {
  if (!pathname || pathname === '/' || pathname === '/login') {
    return false;
  }
  if (pathname.startsWith('/acesso-restrito')) {
    return false;
  }
  if (pathname.startsWith('/secretaria')) {
    return role === 'SECRETARIA';
  }
  if (pathname.startsWith('/coordenacao')) {
    return role === 'COORDENADOR';
  }
  if (pathname.startsWith('/professor')) {
    return role === 'PROFESSOR';
  }
  if (pathname.startsWith('/painel')) {
    return (
      role === 'PROFESSOR' ||
      role === 'SECRETARIA' ||
      role === 'COORDENADOR'
    );
  }
  return false;
}

/**
 * Determina para qual rota redirecionar após o login:
 * - Se havia uma rota de destino anterior (`fromPathname`) compatível com o perfil, utiliza-a.
 * - Caso contrário, redireciona para a área padrão do perfil (`getDefaultRouteForRole`).
 */
export function resolvePostLoginRedirect(
  role: UserRole,
  fromPathname?: string | null
): string {
  if (fromPathname && isPathAllowedForRole(fromPathname, role)) {
    return fromPathname;
  }
  return getDefaultRouteForRole(role);
}

/**
 * Valida o formato básico de e-mail (sem impor restrição de domínio não prevista na especificação).
 */
export function validateEmailInput(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Informe seu endereço de e-mail.';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Informe um endereço de e-mail válido.';
  }
  return null;
}

/**
 * Valida o preenchimento de senha.
 * - Quando `enforcePolicy` é `true` (criação/redefinição de senha), exige todos os critérios
 *   configurados no Supabase Auth (mínimo 8 caracteres, maiúscula, minúscula, número e símbolo).
 */
export function validatePasswordInput(
  password: string,
  options?: { enforcePolicy?: boolean }
): string | null {
  if (!password) {
    return 'Informe sua senha.';
  }

  if (options?.enforcePolicy) {
    const evaluation = evaluatePasswordPolicy(password);
    if (!evaluation.isValid) {
      return `A senha não atende aos critérios de segurança: inclua ${evaluation.missingCriteria.join(', ')}.`;
    }
  }

  return null;
}

/**
 * Converte erros do Supabase Auth em mensagens claras em português,
 * sem expor detalhes técnicos internos ou sensíveis (CA02, RNF08, RNF17).
 */
export function mapSupabaseAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Não foi possível concluir a operação de autenticação. Tente novamente.';
  }

  const errObj = error as {
    message?: string;
    code?: string;
    status?: number;
    reasons?: string[];
  };
  const rawMessage = (errObj.message ?? '').toLowerCase();
  const rawCode = (errObj.code ?? '').toLowerCase();
  const reasons = Array.isArray(errObj.reasons) ? errObj.reasons : [];

  if (
    rawCode === 'invalid_credentials' ||
    rawMessage.includes('invalid login credentials')
  ) {
    return 'E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.';
  }

  if (rawMessage.includes('email not confirmed')) {
    return 'O endereço de e-mail desta conta ainda não foi confirmado.';
  }

  if (
    rawCode === 'over_request_rate_limit' ||
    rawCode === 'over_email_send_rate_limit' ||
    rawMessage.includes('rate limit') ||
    rawMessage.includes('too many requests') ||
    errObj.status === 429
  ) {
    return 'Muitas solicitações realizadas em sequência. Aguarde alguns instantes antes de tentar novamente.';
  }

  if (
    rawCode === 'same_password' ||
    rawMessage.includes('different from the old password')
  ) {
    return 'A nova senha deve ser diferente da senha anterior.';
  }

  if (
    rawCode === 'weak_password' ||
    rawMessage.includes('password should be at least') ||
    rawMessage.includes('password should contain at least one character of each')
  ) {
    const hasLengthFailure =
      reasons.includes('length') ||
      rawMessage.includes('password should be at least');
    const hasCharacterClassFailure =
      reasons.includes('characters') ||
      rawMessage.includes('contain at least one character of each');

    if (hasLengthFailure && !hasCharacterClassFailure) {
      return `A senha deve conter pelo menos ${PASSWORD_POLICY.MIN_LENGTH} caracteres, incluindo letra maiúscula, letra minúscula, número e caractere especial.`;
    }

    if (hasCharacterClassFailure) {
      return `A senha informada não atende aos critérios de complexidade: ela deve ter pelo menos ${PASSWORD_POLICY.MIN_LENGTH} caracteres e incluir letra maiúscula (A–Z), letra minúscula (a–z), número (0–9) e caractere especial (ex.: !@#$%&*).`;
    }

    return `A senha informada não atende à política de segurança: utilize pelo menos ${PASSWORD_POLICY.MIN_LENGTH} caracteres com letra maiúscula, letra minúscula, número e caractere especial.`;
  }

  if (
    rawCode === 'otp_expired' ||
    rawCode === 'flow_state_expired' ||
    rawCode === 'session_not_found' ||
    rawMessage.includes('expired') ||
    rawMessage.includes('invalidrecovery') ||
    rawMessage.includes('auth session missing')
  ) {
    return 'O link de recuperação é inválido ou expirou. Solicite um novo link de recuperação de senha.';
  }

  if (
    rawMessage.includes('fetch') ||
    rawMessage.includes('network') ||
    rawMessage.includes('failed to fetch')
  ) {
    return 'Falha de comunicação com o servidor. Verifique sua conexão com a internet.';
  }

  return 'Não foi possível concluir a autenticação. Verifique os dados informados ou tente novamente.';
}

/**
 * Envia e-mail com link temporário seguro para recuperação de senha (RF09, CA05).
 */
export async function requestPasswordRecoveryEmail(
  email: string
): Promise<{ success: boolean; errorMessage: string | null }> {
  const emailError = validateEmailInput(email);
  if (emailError) {
    return { success: false, errorMessage: emailError };
  }

  if (!supabase) {
    return {
      success: false,
      errorMessage:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const redirectTo = `${window.location.origin}/redefinir-senha`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    return {
      success: false,
      errorMessage: mapSupabaseAuthError(error),
    };
  }

  return { success: true, errorMessage: null };
}

/**
 * Define nova senha a partir de uma sessão válida de recuperação de senha (RF10, CA06).
 */
export async function updatePasswordFromRecovery(
  newPassword: string
): Promise<{ success: boolean; errorMessage: string | null }> {
  const passwordError = validatePasswordInput(newPassword, {
    enforcePolicy: true,
  });
  if (passwordError) {
    return { success: false, errorMessage: passwordError };
  }

  if (!supabase) {
    return {
      success: false,
      errorMessage:
        'A conexão com o Supabase não está configurada no ambiente local.',
    };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return {
      success: false,
      errorMessage:
        'O link de recuperação é inválido ou expirou. Solicite um novo link para redefinir sua senha.',
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return {
      success: false,
      errorMessage: mapSupabaseAuthError(error),
    };
  }

  return { success: true, errorMessage: null };
}
