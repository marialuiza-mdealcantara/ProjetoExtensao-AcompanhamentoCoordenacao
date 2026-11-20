import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const rawPublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

/**
 * Captura os parâmetros originais da URL antes que o GoTrueClient limpe
 * `window.location.hash` durante a inicialização (`detectSessionInUrl: true`).
 * Permite identificar com precisão fluxos `type=invite`, `type=recovery` e erros de OTP.
 */
export const initialAuthUrlSnapshot = {
  search: typeof window !== 'undefined' ? window.location.search : '',
  hash: typeof window !== 'undefined' ? window.location.hash : '',
};

export function clearInitialAuthUrlSnapshot(): void {
  initialAuthUrlSnapshot.search = '';
  initialAuthUrlSnapshot.hash = '';
}

/**
 * Decodifica com segurança o segmento de payload (Base64URL) de um token JWT
 * para verificar se a claim `role` corresponde a um papel administrativo/privilegiado.
 */
function hasPrivilegedJwtRole(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64Payload.padEnd(
      base64Payload.length + ((4 - (base64Payload.length % 4)) % 4),
      '='
    );
    const decodedJson = atob(padded);
    const payload = JSON.parse(decodedJson) as Record<string, unknown>;
    const roleClaim =
      typeof payload.role === 'string' ? payload.role.toLowerCase() : '';

    return (
      roleClaim === 'service_role' ||
      roleClaim === 'supabase_admin' ||
      roleClaim === 'postgres'
    );
  } catch {
    return false;
  }
}

/**
 * Defesa em profundidade: verifica se uma chave ou variável de ambiente exposta ao bundle
 * corresponde a uma chave secreta ou administrativa (service_role / sb_secret_).
 *
 * IMPORTANTE: Esta verificação é apenas uma camada adicional de proteção contra configuração
 * acidental e NUNCA autoriza a inclusão de segredos ou chaves administrativas no frontend.
 */
export function isForbiddenSecretKey(key: string): boolean {
  if (!key) return false;
  const normalized = key.trim().toLowerCase();

  if (
    normalized.startsWith('sb_secret_') ||
    normalized.includes('service_role') ||
    normalized.includes('supabase_admin')
  ) {
    return true;
  }

  return hasPrivilegedJwtRole(key.trim());
}

/**
 * Verifica se qualquer variável VITE_* no ambiente expõe nomes ou valores de chaves administrativas.
 */
function hasForbiddenEnvVariable(): boolean {
  const envEntries = Object.entries(import.meta.env);
  for (const [envName, envValue] of envEntries) {
    const upperName = envName.toUpperCase();
    if (!upperName.startsWith('VITE_')) continue;

    if (
      upperName.includes('SERVICE_ROLE') ||
      upperName.includes('SECRET_KEY') ||
      upperName.includes('SB_SECRET')
    ) {
      if (typeof envValue === 'string' && envValue.trim().length > 0) {
        return true;
      }
    }

    if (typeof envValue === 'string' && isForbiddenSecretKey(envValue)) {
      return true;
    }
  }
  return false;
}

function isPlaceholderValue(value: string): boolean {
  if (!value) return true;
  return (
    value.includes('<project-ref>') ||
    value.includes('<sb_publishable_') ||
    value.includes('YOUR_')
  );
}

const forbiddenSecretDetected =
  isForbiddenSecretKey(rawPublishableKey) || hasForbiddenEnvVariable();

export const supabaseEnvStatus = {
  hasUrl: Boolean(rawUrl) && !isPlaceholderValue(rawUrl),
  hasPublishableKey:
    Boolean(rawPublishableKey) &&
    !isPlaceholderValue(rawPublishableKey) &&
    !forbiddenSecretDetected,
  hasForbiddenSecretKey: forbiddenSecretDetected,
  get isConfigured(): boolean {
    return (
      this.hasUrl &&
      this.hasPublishableKey &&
      !this.hasForbiddenSecretKey
    );
  },
};

if (supabaseEnvStatus.hasForbiddenSecretKey) {
  console.error(
    '[Segurança] Chave privilegiada (service_role / sb_secret_) detectada nas variáveis de ambiente do frontend. ' +
      'A inicialização do cliente Supabase foi bloqueada. Utilize exclusivamente VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase: SupabaseClient<Database> | null =
  supabaseEnvStatus.isConfigured
    ? createClient<Database>(rawUrl, rawPublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
