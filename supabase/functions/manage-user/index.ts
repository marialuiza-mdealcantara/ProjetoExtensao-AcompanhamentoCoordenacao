import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

interface ManageUserRequestBody {
  user_id?: unknown;
  full_name?: unknown;
  active?: unknown;
}

interface ProfileUpdates {
  full_name?: string;
  active?: boolean;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
          'Configuração interna do servidor de gerenciamento incompleta.',
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

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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

    const { data: callerProfile, error: callerProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, role, active')
        .eq('id', callerUser.id)
        .maybeSingle();

    if (callerProfileError) {
      console.error('[manage-user] Failed to load caller profile:', {
        code:
          (callerProfileError as { code?: string }).code ??
          callerProfileError.message,
      });
      return jsonResponse(500, {
        success: false,
        errorCode: 'CALLER_PROFILE_LOOKUP_FAILED',
        message: 'Não foi possível validar o perfil da sessão.',
      });
    }

    if (
      !callerProfile ||
      !callerProfile.active ||
      callerProfile.role !== 'SECRETARIA'
    ) {
      return jsonResponse(403, {
        success: false,
        errorCode: 'FORBIDDEN_NOT_SECRETARIA',
        message:
          'Acesso negado. Somente usuários ativos com perfil SECRETARIA podem gerenciar contas.',
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_JSON_BODY',
        message: 'O corpo da requisição é inválido.',
      });
    }

    if (
      !requestBody ||
      typeof requestBody !== 'object' ||
      Array.isArray(requestBody)
    ) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_JSON_BODY',
        message: 'O corpo da requisição deve ser um objeto válido.',
      });
    }

    const body = requestBody as ManageUserRequestBody;
    const unsupportedField = Object.keys(requestBody).find(
      (key) => !['user_id', 'full_name', 'active'].includes(key)
    );
    if (unsupportedField) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'UNSUPPORTED_FIELD',
        message: `O campo ${unsupportedField} não pode ser alterado por esta operação.`,
      });
    }

    const userId =
      typeof body.user_id === 'string' ? body.user_id.trim() : '';
    if (!UUID_REGEX.test(userId)) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_USER_ID',
        message: 'O identificador do usuário é inválido.',
      });
    }

    if (
      body.full_name !== undefined &&
      typeof body.full_name !== 'string'
    ) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_FULL_NAME',
        message: 'O nome completo informado é inválido.',
      });
    }

    if (body.active !== undefined && typeof body.active !== 'boolean') {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_ACCOUNT_STATUS',
        message: 'A situação da conta informada é inválida.',
      });
    }

    if (body.full_name === undefined && body.active === undefined) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'EMPTY_UPDATE',
        message: 'Informe ao menos uma alteração para o usuário.',
      });
    }

    const fullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : undefined;
    if (
      fullName !== undefined &&
      (fullName.length < 3 || fullName.length > 160)
    ) {
      return jsonResponse(400, {
        success: false,
        errorCode: 'INVALID_FULL_NAME',
        message:
          'O nome completo deve conter entre 3 e 160 caracteres.',
      });
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, full_name, active')
        .eq('id', userId)
        .maybeSingle();

    if (targetProfileError) {
      console.error('[manage-user] Failed to load target profile:', {
        code:
          (targetProfileError as { code?: string }).code ??
          targetProfileError.message,
      });
      return jsonResponse(500, {
        success: false,
        errorCode: 'PROFILE_LOOKUP_FAILED',
        message: 'Não foi possível consultar os dados da conta selecionada.',
      });
    }

    if (!targetProfile) {
      return jsonResponse(404, {
        success: false,
        errorCode: 'PROFILE_NOT_FOUND',
        message: 'A conta selecionada não foi encontrada.',
      });
    }

    if (
      userId === callerUser.id &&
      targetProfile.active &&
      body.active === false
    ) {
      return jsonResponse(409, {
        success: false,
        errorCode: 'SELF_DEACTIVATION_NOT_ALLOWED',
        message: 'Não é permitido desativar a própria conta da Secretaria.',
      });
    }

    const updates: ProfileUpdates = {};
    if (fullName !== undefined && fullName !== targetProfile.full_name) {
      updates.full_name = fullName;
    }
    if (
      typeof body.active === 'boolean' &&
      body.active !== targetProfile.active
    ) {
      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse(200, {
        success: true,
        errorCode: null,
        message: 'Nenhuma alteração necessária.',
        auditPending: false,
        auditErrorCode: null,
      });
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('id, full_name, active')
      .maybeSingle();

    if (updateError || !updatedProfile) {
      console.error('[manage-user] Failed to update profile:', {
        userId,
        code:
          (updateError as { code?: string } | null)?.code ??
          updateError?.message ??
          'PROFILE_UPDATE_FAILED',
      });
      return jsonResponse(500, {
        success: false,
        errorCode: 'PROFILE_UPDATE_FAILED',
        message: 'Não foi possível atualizar a conta selecionada.',
      });
    }

    const activeChanged =
      typeof updates.active === 'boolean' &&
      updates.active !== targetProfile.active;
    if (activeChanged) {
      const { error: authStatusError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: updates.active ? 'none' : '876000h',
        });

      if (authStatusError) {
        const rollbackUpdates: ProfileUpdates = {
          active: targetProfile.active,
        };
        if (updates.full_name !== undefined) {
          rollbackUpdates.full_name = targetProfile.full_name;
        }

        const { data: rolledBackProfile, error: rollbackError } =
          await supabaseAdmin
            .from('profiles')
            .update(rollbackUpdates)
            .eq('id', userId)
            .select('id')
            .maybeSingle();

        if (rollbackError || !rolledBackProfile) {
          console.error('[manage-user] Profile rollback failed:', {
            userId,
            code:
              (rollbackError as { code?: string } | null)?.code ??
              rollbackError?.message ??
              'PROFILE_ROLLBACK_FAILED',
          });
          return jsonResponse(500, {
            success: false,
            errorCode: 'PARTIAL_ACCOUNT_STATUS_UPDATE',
            message:
              'O status do Supabase Auth não foi atualizado e também não foi possível reverter o perfil. A conta pode estar parcialmente atualizada; solicite verificação técnica.',
          });
        }

        return jsonResponse(502, {
          success: false,
          errorCode: 'AUTH_STATUS_UPDATE_FAILED',
          message:
            'Não foi possível atualizar o acesso no Supabase Auth. As alterações no perfil foram revertidas.',
        });
      }
    }

    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    if (updates.full_name !== undefined) {
      oldData.full_name = targetProfile.full_name;
      newData.full_name = updatedProfile.full_name;
    }
    if (updates.active !== undefined) {
      oldData.active = targetProfile.active;
      newData.active = updatedProfile.active;
    }

    const auditAction =
      updates.active === false
        ? 'DEACTIVATE_USER'
        : updates.active === true
          ? 'REACTIVATE_USER'
          : 'UPDATE_USER_PROFILE';
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: callerUser.id,
        entity_name: 'profiles',
        entity_id: userId,
        action: auditAction,
        old_data: oldData,
        new_data: newData,
      });

    if (auditError) {
      console.error('[manage-user] Audit insert failed:', {
        userId,
        action: auditAction,
        code:
          (auditError as { code?: string }).code ?? auditError.message,
      });
    }

    const message =
      updates.active === false
        ? 'Conta desativada. O acesso foi bloqueado sem excluir os registros.'
        : updates.active === true
          ? 'Conta reativada com sucesso.'
          : 'Nome do usuário atualizado com sucesso.';

    return jsonResponse(200, {
      success: true,
      errorCode: null,
      message,
      auditPending: Boolean(auditError),
      auditErrorCode:
        auditError
          ? (auditError as { code?: string }).code ?? 'AUDIT_INSERT_FAILED'
          : null,
    });
  } catch (error) {
    console.error('[manage-user] Unexpected error:', error);
    return jsonResponse(500, {
      success: false,
      errorCode: 'UNEXPECTED_SERVER_ERROR',
      message: 'Ocorreu um erro interno ao gerenciar a conta.',
    });
  }
});
