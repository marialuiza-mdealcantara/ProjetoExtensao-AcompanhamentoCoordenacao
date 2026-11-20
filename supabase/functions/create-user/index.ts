import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.49.1';

type UserRole = 'PROFESSOR' | 'SECRETARIA' | 'COORDENADOR';

interface CreateUserRequestBody {
  full_name?: unknown;
  email?: unknown;
  role?: unknown;
  course_ids?: unknown;
  redirect_to?: unknown;
}

interface RollbackReport {
  userCoursesDeleted: boolean;
  userCoursesError: string | null;
  profileDeleted: boolean;
  profileError: string | null;
  authUserDeleted: boolean;
  authDeleteError: string | null;
  fullyRolledBack: boolean;
}

type OrphanLookupStatus =
  | 'RESOLVED'
  | 'NOT_FOUND_IN_PAGES'
  | 'LOOKUP_QUERY_FAILED'
  | 'MAX_PAGES_REACHED';

interface OrphanLookupResult {
  userId: string | null;
  status: OrphanLookupStatus;
  pagesScanned: number;
  errorCode: string | null;
}

const VALID_ROLES: readonly UserRole[] = [
  'PROFESSOR',
  'SECRETARIA',
  'COORDENADOR',
] as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ORPHAN_LOOKUP_PER_PAGE = 200;
const ORPHAN_LOOKUP_MAX_PAGES = 25;

/**
 * Sentinela explícita (RFC 4122 Nil UUID) para a coluna `public.audit_logs.entity_id` (UUID NOT NULL).
 *
 * Finalidade:
 * - Utilizada EXCLUSIVAMENTE como fallback quando um registro órfão é detectado em `auth.users`
 *   e a busca paginada em `auth.admin.listUsers` não consegue recuperar o UUID real daquela conta.
 * - Quando acionada, `entity_name` é gravado como `'auth.users_unresolved'` e `new_data.email`
 *   preserva o endereço investigado.
 * - NUNCA se utiliza o `id` da Secretaria solicitante (`callerProfile.id`) em `entity_id`, pois
 *   `callerProfile.id` representa o autor da ação (`user_id`) e não a entidade alvo.
 */
const UNRESOLVED_ENTITY_NIL_UUID = '00000000-0000-0000-0000-000000000000';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(
  status: number,
  payload: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function isValidRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' && VALID_ROLES.includes(value as UserRole)
  );
}

/**
 * Realiza busca paginada controlada em `auth.admin.listUsers()` para localizar o UUID real
 * de um usuário órfão em `auth.users` pelo e-mail normalizado.
 *
 * - Utiliza exclusivamente o array `data.users` efetivamente retornado pelo SDK (sem presumir
 *   a disponibilidade do cabeçalho HTTP `x-total-count` ou do campo `data.total`, que no
 *   `@supabase/auth-js` depende da presença do header `Link`).
 * - Evita consultas desnecessárias interrompendo imediatamente ao encontrar o usuário
 *   (`RESOLVED`) ou ao receber uma página com `pageUsers.length < ORPHAN_LOOKUP_PER_PAGE`
 *   (`NOT_FOUND_IN_PAGES`).
 * - Diferencia explicitamente falha na consulta (`LOOKUP_QUERY_FAILED`), esgotamento das
 *   páginas existentes (`NOT_FOUND_IN_PAGES`) e limite máximo de páginas (`MAX_PAGES_REACHED`).
 */
async function resolveOrphanAuthUserByEmail(
  supabaseAdmin: SupabaseClient,
  normalizedEmail: string
): Promise<OrphanLookupResult> {
  for (let page = 1; page <= ORPHAN_LOOKUP_MAX_PAGES; page += 1) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: ORPHAN_LOOKUP_PER_PAGE,
      });

      if (error) {
        const errCode =
          (error as { code?: string }).code ??
          error.message ??
          'LIST_USERS_ERROR';
        console.error(
          '[OrphanLookup] Erro na consulta paginada auth.admin.listUsers:',
          {
            page,
            errCode,
          }
        );
        return {
          userId: null,
          status: 'LOOKUP_QUERY_FAILED',
          pagesScanned: page,
          errorCode: errCode,
        };
      }

      const pageUsers = Array.isArray(data?.users) ? data.users : [];
      const matchedUser = pageUsers.find(
        (u) =>
          (u.email ?? '').trim().toLowerCase() === normalizedEmail &&
          typeof u.id === 'string' &&
          UUID_REGEX.test(u.id)
      );

      if (matchedUser) {
        return {
          userId: matchedUser.id,
          status: 'RESOLVED',
          pagesScanned: page,
          errorCode: null,
        };
      }

      // Se a página retornou menos registros que `ORPHAN_LOOKUP_PER_PAGE`, chegamos ao fim real da lista
      if (pageUsers.length < ORPHAN_LOOKUP_PER_PAGE) {
        return {
          userId: null,
          status: 'NOT_FOUND_IN_PAGES',
          pagesScanned: page,
          errorCode: null,
        };
      }
    } catch {
      console.error(
        '[OrphanLookup] Exceção inesperada durante consulta paginada auth.admin.listUsers:',
        { page }
      );
      return {
        userId: null,
        status: 'LOOKUP_QUERY_FAILED',
        pagesScanned: page,
        errorCode: 'LIST_USERS_EXCEPTION',
      };
    }
  }

  return {
    userId: null,
    status: 'MAX_PAGES_REACHED',
    pagesScanned: ORPHAN_LOOKUP_MAX_PAGES,
    errorCode: null,
  };
}

/**
 * Supabase Edge Function: create-user
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      errorCode: 'METHOD_NOT_ALLOWED',
      message: 'Método HTTP não permitido. Utilize POST.',
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, {
        success: false,
        errorCode: 'SERVER_CONFIG_ERROR',
        message:
          'Configuração interna do servidor de autenticação incompleta na Edge Function.',
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse(401, {
        success: false,
        errorCode: 'UNAUTHORIZED_MISSING_TOKEN',
        message: 'Sessão não autenticada. Faça login novamente.',
      });
    }

    const callerJwt = authHeader.slice(7).trim();
    if (!callerJwt) {
      return jsonResponse(401, {
        success: false,
        errorCode: 'UNAUTHORIZED_EMPTY_TOKEN',
        message: 'Token de autenticação ausente.',
      });
    }

    // Cliente administrativo isolado no ambiente da Edge Function
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 1. Valida o JWT do solicitante no Supabase Auth
    const {
      data: { user: callerUser },
      error: callerAuthError,
    } = await supabaseAdmin.auth.getUser(callerJwt);

    if (callerAuthError || !callerUser) {
      return jsonResponse(401, {
        success: false,
        errorCode: 'UNAUTHORIZED_INVALID_TOKEN',
        message: 'Sua sessão é inválida ou expirou. Faça login novamente.',
      });
    }

    // 2. Valida no servidor se o solicitante é SECRETARIA ativa em public.profiles
    const { data: callerProfile, error: callerProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, role, active')
        .eq('id', callerUser.id)
        .maybeSingle();

    if (
      callerProfileError ||
      !callerProfile ||
      !callerProfile.active ||
      callerProfile.role !== 'SECRETARIA'
    ) {
      return jsonResponse(403, {
        success: false,
        errorCode: 'FORBIDDEN_NOT_SECRETARIA',
        message:
          'Acesso negado. Somente usuários ativos com perfil SECRETARIA podem cadastrar contas (RN48 / CA07).',
      });
    }

    // 3. Leitura e validação estrita do payload
    let body: CreateUserRequestBody;
    try {
      body = (await req.json()) as CreateUserRequestBody;
    } catch {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_JSON_BODY',
        message: 'O corpo da requisição é inválido.',
      });
    }

    const fullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role;

    if (fullName.length < 3 || fullName.length > 160) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_FULL_NAME',
        message:
          'Informe o nome completo do usuário (entre 3 e 160 caracteres).',
      });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_EMAIL',
        message: 'Informe um endereço de e-mail válido.',
      });
    }

    if (!isValidRole(role)) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_ROLE',
        message:
          'Perfil inválido. Selecione PROFESSOR, SECRETARIA ou COORDENADOR.',
      });
    }

    const rawCourseIds = Array.isArray(body.course_ids) ? body.course_ids : [];
    const uniqueCourseIds = Array.from(
      new Set(
        rawCourseIds.filter(
          (id): id is string =>
            typeof id === 'string' && UUID_REGEX.test(id.trim())
        )
      )
    );

    if (role === 'COORDENADOR') {
      if (
        uniqueCourseIds.length === 0 ||
        uniqueCourseIds.length !== rawCourseIds.length
      ) {
        return jsonResponse(400, {
          success: false,
          errorCode: 'COORDINATOR_COURSE_REQUIRED',
          message:
            'Para o perfil COORDENADOR, é obrigatório selecionar pelo menos um curso ativo válido.',
        });
      }

      // Confirma no banco se todos os cursos informados existem e estão ativos
      const { data: validCourses, error: coursesError } = await supabaseAdmin
        .from('courses')
        .select('id, name, active')
        .in('id', uniqueCourseIds)
        .eq('active', true);

      if (
        coursesError ||
        !validCourses ||
        validCourses.length !== uniqueCourseIds.length
      ) {
        return jsonResponse(400, {
          success: false,
          errorCode: 'INVALID_OR_INACTIVE_COURSE',
          message:
            'Um ou mais cursos selecionados não foram encontrados ou estão inativos.',
        });
      }
    } else if (rawCourseIds.length > 0) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'COURSES_ONLY_FOR_COORDINATOR',
        message:
          'O vínculo em user_courses nesta etapa é exclusivo para o perfil COORDENADOR.',
      });
    }

    // Valida a URL de redirecionamento do convite estritamente para ${origin}/redefinir-senha
    const requestOrigin = req.headers.get('origin')?.trim() ?? '';
    let redirectTo = '';
    if (typeof body.redirect_to === 'string' && body.redirect_to.trim()) {
      try {
        const parsedUrl = new URL(body.redirect_to.trim());
        if (
          (parsedUrl.protocol === 'http:' ||
            parsedUrl.protocol === 'https:') &&
          parsedUrl.pathname.endsWith('/redefinir-senha')
        ) {
          redirectTo = `${parsedUrl.origin}${parsedUrl.pathname}`;
        }
      } catch {
        redirectTo = '';
      }
    }
    if (!redirectTo && requestOrigin) {
      redirectTo = `${requestOrigin.replace(/\/$/, '')}/redefinir-senha`;
    }

    // 4. Verificação prévia de duplicidade em public.profiles (e-mail já normalizado em minúsculas)
    const { data: existingProfile, error: existingProfileCheckError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();

    if (existingProfileCheckError) {
      return jsonResponse(500, {
        success: false,
        errorCode: 'PROFILE_CHECK_ERROR',
        message:
          'Não foi possível verificar a disponibilidade do e-mail no banco.',
      });
    }

    if (existingProfile) {
      return jsonResponse(409, {
        success: false,
        errorCode: 'EMAIL_ALREADY_EXISTS',
        message: 'Já existe um usuário cadastrado com este endereço de e-mail.',
      });
    }

    // 5. Criação da conta no Supabase Auth + Envio do convite por e-mail
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectTo || undefined,
        data: {
          full_name: fullName,
        },
      });

    if (inviteError || !inviteData?.user) {
      const rawMsg = (inviteError?.message ?? '').toLowerCase();
      const rawCode = (
        (inviteError as { code?: string } | null)?.code ?? ''
      ).toLowerCase();
      const status = (inviteError as { status?: number } | null)?.status ?? 400;

      // Identifica duplicidade somente por códigos e mensagens específicas do Supabase Auth
      const isDuplicateAuthEmail =
        rawCode === 'email_exists' ||
        rawCode === 'user_already_exists' ||
        rawMsg.includes('already been registered') ||
        rawMsg.includes('already registered') ||
        rawMsg.includes('user already exists');

      if (isDuplicateAuthEmail) {
        const { data: concurrentProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (concurrentProfile) {
          return jsonResponse(409, {
            success: false,
            errorCode: 'EMAIL_ALREADY_EXISTS',
            message:
              'Já existe um usuário cadastrado com este endereço de e-mail.',
          });
        }

        // Busca paginada controlada para recuperar o UUID real do usuário órfão em auth.users
        const orphanLookup = await resolveOrphanAuthUserByEmail(
          supabaseAdmin,
          email
        );

        const orphanEntityName = orphanLookup.userId
          ? 'auth.users'
          : 'auth.users_unresolved';
        const orphanEntityId =
          orphanLookup.userId ?? UNRESOLVED_ENTITY_NIL_UUID;

        let orphanAuditLogged = false;
        let orphanAuditErrorCode: string | null = null;

        try {
          const { error: orphanAuditErr } = await supabaseAdmin
            .from('audit_logs')
            .insert({
              user_id: callerProfile.id,
              entity_name: orphanEntityName,
              entity_id: orphanEntityId,
              action: 'CREATE_USER_AUTH_ORPHAN_DETECTED',
              old_data: null,
              new_data: {
                email,
                attempted_role: role,
                reason: 'AUTH_USER_EXISTS_WITHOUT_PROFILE',
                orphan_uuid_resolved: Boolean(orphanLookup.userId),
                orphan_auth_user_id: orphanLookup.userId,
                orphan_lookup_status: orphanLookup.status,
                orphan_lookup_pages_scanned: orphanLookup.pagesScanned,
                orphan_lookup_error_code: orphanLookup.errorCode,
                sentinel_nil_uuid_used: !orphanLookup.userId,
              },
            });

          if (orphanAuditErr) {
            orphanAuditLogged = false;
            orphanAuditErrorCode =
              (orphanAuditErr as { code?: string }).code ??
              orphanAuditErr.message ??
              'ORPHAN_AUDIT_INSERT_ERROR';
            console.error(
              '[Auditoria] Falha PostgREST ao gravar CREATE_USER_AUTH_ORPHAN_DETECTED:',
              {
                entity_name: orphanEntityName,
                entity_id: orphanEntityId,
                orphanAuditErrorCode,
              }
            );
          } else {
            orphanAuditLogged = true;
          }
        } catch {
          orphanAuditLogged = false;
          orphanAuditErrorCode = 'ORPHAN_AUDIT_NETWORK_EXCEPTION';
          console.error(
            '[Auditoria] Exceção de rede ao gravar CREATE_USER_AUTH_ORPHAN_DETECTED:',
            {
              entity_name: orphanEntityName,
              entity_id: orphanEntityId,
            }
          );
        }

        return jsonResponse(409, {
          success: false,
          errorCode: 'AUTH_USER_WITHOUT_PROFILE',
          auditPending: !orphanAuditLogged,
          auditErrorCode: orphanAuditErrorCode,
          orphanLookupStatus: orphanLookup.status,
          message: !orphanAuditLogged
            ? 'Este e-mail já consta no serviço de autenticação (Supabase Auth) sem um perfil correspondente em public.profiles. Atenção: a gravação deste evento diagnóstico em audit_logs também falhou e requer verificação técnica.'
            : 'Este e-mail já consta no serviço de autenticação (Supabase Auth) sem um perfil correspondente em public.profiles. Remova o registro órfão no painel de autenticação antes de recriar a conta.',
        });
      }

      if (
        rawCode === 'over_email_send_rate_limit' ||
        rawCode === 'over_request_rate_limit' ||
        rawMsg.includes('rate limit') ||
        status === 429
      ) {
        return jsonResponse(429, {
          success: false,
          errorCode: 'EMAIL_RATE_LIMIT_EXCEEDED',
          message:
            'O limite de envio de e-mails do servidor de autenticação foi atingido temporariamente. Aguarde alguns minutos ou utilize um provedor Custom SMTP.',
        });
      }

      return jsonResponse(500, {
        success: false,
        errorCode: 'AUTH_INVITE_FAILED',
        message:
          'Não foi possível criar a conta ou disparar o e-mail de convite no Supabase Auth.',
      });
    }

    const createdUserId = inviteData.user.id;

    /**
     * 6. Persistência em `public.profiles` e `public.user_courses` com verificação
     *    individualizada de cada etapa do rollback compensatório em caso de falha parcial.
     */
    const rollbackPartialCreation = async (
      failedStage: string,
      dbErrorCode?: string
    ): Promise<RollbackReport> => {
      let userCoursesDeleted = false;
      let userCoursesError: string | null = null;
      let profileDeleted = false;
      let profileError: string | null = null;
      let authUserDeleted = false;
      let authDeleteError: string | null = null;

      try {
        const { error: delCoursesErr } = await supabaseAdmin
          .from('user_courses')
          .delete()
          .eq('user_id', createdUserId);
        if (delCoursesErr) {
          userCoursesError =
            (delCoursesErr as { code?: string }).code ??
            delCoursesErr.message ??
            'DELETE_USER_COURSES_ERROR';
        } else {
          userCoursesDeleted = true;
        }
      } catch {
        userCoursesError = 'DELETE_USER_COURSES_EXCEPTION';
      }

      try {
        const { error: delProfileErr } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', createdUserId);
        if (delProfileErr) {
          profileError =
            (delProfileErr as { code?: string }).code ??
            delProfileErr.message ??
            'DELETE_PROFILE_ERROR';
        } else {
          profileDeleted = true;
        }
      } catch {
        profileError = 'DELETE_PROFILE_EXCEPTION';
      }

      try {
        const { error: delAuthErr } =
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        if (delAuthErr) {
          authDeleteError =
            (delAuthErr as { code?: string }).code ??
            delAuthErr.message ??
            'DELETE_AUTH_USER_ERROR';
        } else {
          authUserDeleted = true;
        }
      } catch {
        authDeleteError = 'DELETE_AUTH_USER_EXCEPTION';
      }

      const fullyRolledBack =
        userCoursesDeleted && profileDeleted && authUserDeleted;

      const report: RollbackReport = {
        userCoursesDeleted,
        userCoursesError,
        profileDeleted,
        profileError,
        authUserDeleted,
        authDeleteError,
        fullyRolledBack,
      };

      try {
        const { error: rollbackAuditErr } = await supabaseAdmin
          .from('audit_logs')
          .insert({
            user_id: callerProfile.id,
            entity_name: 'profiles',
            entity_id: createdUserId,
            action: 'CREATE_USER_PARTIAL_FAILURE_ROLLED_BACK',
            old_data: null,
            new_data: {
              email,
              full_name: fullName,
              role,
              course_ids: uniqueCourseIds,
              failed_stage: failedStage,
              db_error_code: dbErrorCode ?? null,
              rollback_report: report,
            },
          });

        if (rollbackAuditErr) {
          console.error(
            '[Auditoria] Falha ao gravar log CREATE_USER_PARTIAL_FAILURE_ROLLED_BACK:',
            {
              entity_id: createdUserId,
              code:
                (rollbackAuditErr as { code?: string }).code ??
                rollbackAuditErr.message,
            }
          );
        }
      } catch {
        console.error(
          '[Auditoria] Exceção ao gravar log CREATE_USER_PARTIAL_FAILURE_ROLLED_BACK:',
          { entity_id: createdUserId }
        );
      }

      if (!fullyRolledBack) {
        console.error(
          '[Rollback Incompleto] Falha parcial ao reverter criação de usuário:',
          {
            entity_id: createdUserId,
            failedStage,
            report,
          }
        );
      }

      return report;
    };

    try {
      // 6.1 Gravação do perfil autoritativo em public.profiles
      const { data: savedProfile, error: profileInsertError } =
        await supabaseAdmin
          .from('profiles')
          .insert({
            id: createdUserId,
            full_name: fullName,
            email,
            role,
            active: true,
          })
          .select('id, full_name, email, role, active, created_at, updated_at')
          .single();

      if (profileInsertError || !savedProfile) {
        const pgCode = (profileInsertError as { code?: string } | null)?.code;
        const rollbackReport = await rollbackPartialCreation(
          'INSERT_PUBLIC_PROFILES',
          pgCode
        );

        if (pgCode === '23505') {
          return jsonResponse(409, {
            success: false,
            errorCode: 'CONCURRENT_EMAIL_CONFLICT',
            rollbackReport,
            message:
              'Outra solicitação concorrente cadastrou este e-mail simultaneamente. A operação duplicada foi revertida.',
          });
        }

        return jsonResponse(500, {
          success: false,
          errorCode: 'PARTIAL_FAILURE_PROFILE_PERSISTENCE',
          rollbackReport,
          message: rollbackReport.fullyRolledBack
            ? 'O convite foi iniciado, mas houve falha ao gravar o perfil no banco de dados. A criação da conta foi revertida automaticamente e o convite invalidado. Tente novamente.'
            : 'Houve falha ao gravar o perfil no banco após a criação no Auth e uma ou mais etapas de reversão falharam. Verifique o relatório de rollback.',
        });
      }

      // 6.2 Gravação dos vínculos de curso em public.user_courses (exclusivo para COORDENADOR)
      if (role === 'COORDENADOR' && uniqueCourseIds.length > 0) {
        const userCoursesRows = uniqueCourseIds.map((courseId) => ({
          user_id: createdUserId,
          course_id: courseId,
        }));

        const { error: userCoursesInsertError } = await supabaseAdmin
          .from('user_courses')
          .insert(userCoursesRows);

        if (userCoursesInsertError) {
          const pgCode = (
            userCoursesInsertError as { code?: string } | null
          )?.code;
          const rollbackReport = await rollbackPartialCreation(
            'INSERT_PUBLIC_USER_COURSES',
            pgCode
          );

          return jsonResponse(500, {
            success: false,
            errorCode: 'PARTIAL_FAILURE_COURSES_PERSISTENCE',
            rollbackReport,
            message: rollbackReport.fullyRolledBack
              ? 'O convite foi iniciado, mas ocorreu falha ao vincular os cursos do coordenador. A criação da conta foi revertida automaticamente para evitar inconsistência. Tente novamente.'
              : 'Ocorreu falha ao vincular os cursos do coordenador e uma ou mais etapas da reversão automática falharam. Verifique o relatório de rollback.',
          });
        }
      }

      // 7. Registro na trilha de auditoria (RNF06) — verifica { error } e trata exceções sem excluir a conta já válida
      let auditLogged = false;
      let auditErrorCode: string | null = null;

      try {
        const { error: auditInsertError } = await supabaseAdmin
          .from('audit_logs')
          .insert({
            user_id: callerProfile.id,
            entity_name: 'profiles',
            entity_id: createdUserId,
            action: 'CREATE_USER',
            old_data: null,
            new_data: {
              full_name: fullName,
              email,
              role,
              active: true,
              course_ids: role === 'COORDENADOR' ? uniqueCourseIds : [],
            },
          });

        if (auditInsertError) {
          auditLogged = false;
          auditErrorCode =
            (auditInsertError as { code?: string }).code ??
            'AUDIT_INSERT_ERROR';
          console.error(
            '[Auditoria] Falha ao gravar log CREATE_USER em public.audit_logs:',
            {
              entity_id: createdUserId,
              auditErrorCode,
            }
          );
        } else {
          auditLogged = true;
        }
      } catch {
        auditLogged = false;
        auditErrorCode = 'AUDIT_NETWORK_EXCEPTION';
        console.error(
          '[Auditoria] Exceção de rede ao gravar log CREATE_USER em public.audit_logs:',
          {
            entity_id: createdUserId,
          }
        );
      }

      if (!auditLogged) {
        return jsonResponse(201, {
          success: true,
          userCreated: true,
          auditPending: true,
          auditErrorCode,
          errorCode: 'USER_CREATED_AUDIT_PENDING',
          message:
            'O usuário foi cadastrado e o convite enviado, porém o registro na trilha de auditoria (audit_logs) falhou e ficou pendente de verificação técnica.',
          user: {
            ...savedProfile,
            course_ids: role === 'COORDENADOR' ? uniqueCourseIds : [],
          },
        });
      }

      return jsonResponse(201, {
        success: true,
        userCreated: true,
        auditPending: false,
        auditErrorCode: null,
        errorCode: null,
        message:
          'Usuário cadastrado com sucesso. Um e-mail de convite foi enviado para configuração da senha.',
        user: {
          ...savedProfile,
          course_ids: role === 'COORDENADOR' ? uniqueCourseIds : [],
        },
      });
    } catch {
      const rollbackReport = await rollbackPartialCreation(
        'UNEXPECTED_EXCEPTION_DURING_PERSISTENCE'
      );
      return jsonResponse(500, {
        success: false,
        errorCode: 'PARTIAL_FAILURE_UNEXPECTED_EXCEPTION',
        rollbackReport,
        message: rollbackReport.fullyRolledBack
          ? 'Ocorreu um erro inesperado durante a gravação dos dados do usuário. A criação da conta foi revertida automaticamente.'
          : 'Ocorreu um erro inesperado durante a gravação dos dados do usuário e a reversão automática exigirá verificação administrativa.',
      });
    }
  } catch {
    return jsonResponse(500, {
      success: false,
      errorCode: 'UNEXPECTED_SERVER_ERROR',
      message:
        'Ocorreu um erro interno inesperado na Edge Function de criação de usuários.',
    });
  }
});
