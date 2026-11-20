import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseEnvStatus } from '../services/supabaseClient';
import { fetchAndValidateUserProfile } from '../services/profileService';
import {
  mapSupabaseAuthError,
  validateEmailInput,
  validatePasswordInput,
} from '../services/authService';
import type {
  AccessDenialReason,
  AuthContextValue,
  AuthorizedUserProfile,
  SignInResult,
} from '../types/auth';
import type { UserRole } from '../types/database';

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthorizedUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(
    supabaseEnvStatus.isConfigured
  );
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [accessDenialReason, setAccessDenialReason] =
    useState<AccessDenialReason | null>(
      supabaseEnvStatus.isConfigured ? null : 'ENV_NOT_CONFIGURED'
    );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const requestIdRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(null);
  const inFlightUserIdRef = useRef<string | null>(null);
  const terminatedForInvalidProfileRef = useRef<boolean>(false);
  const manualSignOutInProgressRef = useRef<boolean>(false);
  const hadActiveSessionRef = useRef<boolean>(false);

  const loadProfileForUser = useCallback(
    async (
      currentUser: User | null,
      options?: { force?: boolean }
    ): Promise<AuthorizedUserProfile | null> => {
      if (!currentUser) {
        requestIdRef.current += 1;
        activeUserIdRef.current = null;
        inFlightUserIdRef.current = null;
        setProfile(null);

        if (terminatedForInvalidProfileRef.current) {
          terminatedForInvalidProfileRef.current = false;
        } else if (
          hadActiveSessionRef.current &&
          !manualSignOutInProgressRef.current
        ) {
          // Sessão anteriormente ativa encerrou involuntariamente (expiração de token)
          hadActiveSessionRef.current = false;
          setSessionExpired(true);
          setAccessDenialReason('SESSION_EXPIRED');
          setErrorMessage(
            'Sua sessão expirou por inatividade ou segurança. Faça login novamente para continuar.'
          );
        } else {
          setAccessDenialReason(
            supabaseEnvStatus.isConfigured ? null : 'ENV_NOT_CONFIGURED'
          );
          setErrorMessage(null);
        }

        manualSignOutInProgressRef.current = false;
        setIsLoading(false);
        return null;
      }

      // Evita requisição duplicada concorrente para o mesmo usuário (ex.: getSession + INITIAL_SESSION)
      if (!options?.force && inFlightUserIdRef.current === currentUser.id) {
        return null;
      }

      // Ao trocar de usuário, limpa imediatamente os dados do perfil anterior
      if (activeUserIdRef.current !== currentUser.id) {
        setProfile(null);
        setAccessDenialReason(null);
        setErrorMessage(null);
      }

      activeUserIdRef.current = currentUser.id;
      inFlightUserIdRef.current = currentUser.id;
      const currentRequestId = ++requestIdRef.current;
      setIsLoading(true);

      try {
        const result = await fetchAndValidateUserProfile(currentUser.id);

        if (
          !isMountedRef.current ||
          requestIdRef.current !== currentRequestId
        ) {
          return null;
        }

        if (result.shouldTerminateLocalSession) {
          terminatedForInvalidProfileRef.current = true;
          hadActiveSessionRef.current = false;
          activeUserIdRef.current = null;
          inFlightUserIdRef.current = null;
          setProfile(null);
          setSession(null);
          setUser(null);
          setAccessDenialReason(result.denialReason);
          setErrorMessage(result.errorMessage);

          if (supabase) {
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch {
              // Ignora falha no signOut local; estado em memória já foi bloqueado
            }
          }
          return null;
        }

        if (result.authorizedProfile) {
          hadActiveSessionRef.current = true;
          setSessionExpired(false);
        }

        setProfile(result.authorizedProfile);
        setAccessDenialReason(result.denialReason);
        setErrorMessage(result.errorMessage);
        return result.authorizedProfile;
      } catch {
        if (
          !isMountedRef.current ||
          requestIdRef.current !== currentRequestId
        ) {
          return null;
        }
        setProfile(null);
        setAccessDenialReason('PROFILE_FETCH_ERROR');
        setErrorMessage(
          'Ocorreu um erro inesperado ao verificar o perfil de acesso.'
        );
        return null;
      } finally {
        if (
          isMountedRef.current &&
          requestIdRef.current === currentRequestId
        ) {
          inFlightUserIdRef.current = null;
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;

    if (!supabase) {
      setIsLoading(false);
      return () => {
        isMountedRef.current = false;
      };
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMountedRef.current) return;
        if (error) {
          const rawMsg = (error.message ?? '').toLowerCase();
          const isExpiredError =
            rawMsg.includes('expired') ||
            rawMsg.includes('refresh_token') ||
            rawMsg.includes('invalid claim');

          setSession(null);
          setUser(null);
          setProfile(null);
          if (isExpiredError) {
            setSessionExpired(true);
            setAccessDenialReason('SESSION_EXPIRED');
            setErrorMessage(
              'Sua sessão expirou. Faça login novamente para continuar.'
            );
          } else {
            setAccessDenialReason('PROFILE_FETCH_ERROR');
            setErrorMessage('Não foi possível recuperar a sessão atual.');
          }
          setIsLoading(false);
          return;
        }
        const currentSession = data.session ?? null;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        void loadProfileForUser(currentSession?.user ?? null);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setAccessDenialReason('PROFILE_FETCH_ERROR');
        setErrorMessage('Erro ao inicializar a verificação de sessão.');
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMountedRef.current) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      void loadProfileForUser(nextSession?.user ?? null);
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const emailValidationError = validateEmailInput(email);
      if (emailValidationError) {
        return {
          success: false,
          role: null,
          errorMessage: emailValidationError,
          denialReason: null,
        };
      }

      const passwordValidationError = validatePasswordInput(password);
      if (passwordValidationError) {
        return {
          success: false,
          role: null,
          errorMessage: passwordValidationError,
          denialReason: null,
        };
      }

      if (!supabase) {
        return {
          success: false,
          role: null,
          errorMessage:
            'A conexão com o Supabase não está configurada no ambiente local.',
          denialReason: 'ENV_NOT_CONFIGURED',
        };
      }

      setSessionExpired(false);
      setErrorMessage(null);
      setAccessDenialReason(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user || !data.session) {
        const mappedError = mapSupabaseAuthError(error);
        if (isMountedRef.current) {
          setErrorMessage(mappedError);
        }
        return {
          success: false,
          role: null,
          errorMessage: mappedError,
          denialReason: null,
        };
      }

      // Valida o perfil autoritativo em public.profiles e vínculos em user_courses
      const result = await fetchAndValidateUserProfile(data.user.id);

      if (result.shouldTerminateLocalSession) {
        terminatedForInvalidProfileRef.current = true;
        hadActiveSessionRef.current = false;
        activeUserIdRef.current = null;
        inFlightUserIdRef.current = null;

        if (isMountedRef.current) {
          setProfile(null);
          setSession(null);
          setUser(null);
          setAccessDenialReason(result.denialReason);
          setErrorMessage(result.errorMessage);
          setIsLoading(false);
        }

        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignora erro no signOut local
        }

        return {
          success: false,
          role: null,
          errorMessage: result.errorMessage,
          denialReason: result.denialReason,
        };
      }

      if (!result.authorizedProfile) {
        if (isMountedRef.current) {
          setProfile(null);
          setAccessDenialReason(result.denialReason);
          setErrorMessage(result.errorMessage);
          setIsLoading(false);
        }
        return {
          success: false,
          role: null,
          errorMessage: result.errorMessage,
          denialReason: result.denialReason,
        };
      }

      if (isMountedRef.current) {
        hadActiveSessionRef.current = true;
        activeUserIdRef.current = data.user.id;
        setSession(data.session);
        setUser(data.user);
        setProfile(result.authorizedProfile);
        setAccessDenialReason(null);
        setErrorMessage(null);
        setIsLoading(false);
      }

      return {
        success: true,
        role: result.authorizedProfile.role,
        errorMessage: null,
        denialReason: null,
      };
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    await loadProfileForUser(user, { force: true });
  }, [loadProfileForUser, user]);

  const signOut = useCallback(async () => {
    requestIdRef.current += 1;
    manualSignOutInProgressRef.current = true;
    hadActiveSessionRef.current = false;
    activeUserIdRef.current = null;
    inFlightUserIdRef.current = null;
    terminatedForInvalidProfileRef.current = false;

    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
      // Mesmo se o signOut falhar, o bloco finally limpa o estado local com segurança
    } finally {
      if (isMountedRef.current) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setSessionExpired(false);
        setIsPasswordRecovery(false);
        setAccessDenialReason(
          supabaseEnvStatus.isConfigured ? null : 'ENV_NOT_CONFIGURED'
        );
        setErrorMessage(null);
        setIsLoading(false);
      }
    }
  }, []);

  const clearAuthFeedback = useCallback(() => {
    setErrorMessage(null);
    setSessionExpired(false);
    if (accessDenialReason === 'SESSION_EXPIRED') {
      setAccessDenialReason(null);
    }
  }, [accessDenialReason]);

  const hasRole = useCallback(
    (allowedRoles?: readonly UserRole[]): boolean => {
      if (!profile || !profile.active || !profile.role) {
        return false;
      }
      // allowedRoles undefined representa ausência de restrição específica por papel
      if (allowedRoles === undefined) {
        return true;
      }
      // allowedRoles [] deve sempre negar acesso (fail-closed)
      if (allowedRoles.length === 0) {
        return false;
      }
      return allowedRoles.includes(profile.role);
    },
    [profile]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      role: profile?.role ?? null,
      isLoading,
      isConfigured: supabaseEnvStatus.isConfigured,
      sessionExpired,
      isPasswordRecovery,
      accessDenialReason,
      errorMessage,
      signInWithPassword,
      refreshProfile,
      signOut,
      clearAuthFeedback,
      hasRole,
    }),
    [
      session,
      user,
      profile,
      isLoading,
      sessionExpired,
      isPasswordRecovery,
      accessDenialReason,
      errorMessage,
      signInWithPassword,
      refreshProfile,
      signOut,
      clearAuthFeedback,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
