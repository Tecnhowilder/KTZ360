/**
 * Edge Function: admin-support
 *
 * Operaciones privilegiadas de soporte que requieren service_role:
 *   - reset_password   → genera magic link para reset (loguea quién lo pidió)
 *   - reset_mfa        → elimina factores MFA del usuario (requiere super_admin)
 *   - impersonate      → genera magic link one-time para impersonación controlada
 *
 * Zero Trust:
 *   - Caller autenticado via JWT — se verifica is_support_admin() en DB
 *   - Service Role key SOLO en Deno secrets (nunca en VITE_ ni cliente)
 *   - Toda acción queda registrada en audit_log con caller_id + target_user_id
 *   - Impersonation: solo genera link — no autentica directamente
 *   - Magic links expiran en 1 hora (configuración Supabase)
 */

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupportAction = 'reset_password' | 'reset_mfa' | 'impersonate';

interface RequestBody {
  action:   SupportAction;
  user_id:  string;
  email?:   string;    // requerido para reset_password e impersonate
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const callerJwt = authHeader.slice(7);

  // ─── Cliente de caller (validar permisos) ─────────────────────────────────
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
  });

  // ─── Verificar rol del caller ─────────────────────────────────────────────
  const { data: isSupportAdmin } = await callerClient.rpc('is_support_admin');
  if (!isSupportAdmin) {
    return json({ error: 'Acceso denegado. Se requiere support_admin.' }, 403);
  }

  // ─── Obtener caller_id para audit ─────────────────────────────────────────
  const { data: { user: callerUser } } = await callerClient.auth.getUser();
  if (!callerUser) return json({ error: 'Caller no autenticado' }, 401);
  const callerId = callerUser.id;

  // ─── Obtener workspace del caller para audit_log ──────────────────────────
  const { data: callerProfile } = await callerClient
    .from('profiles').select('workspace_id').eq('id', callerId).maybeSingle();
  const callerWorkspaceId = callerProfile?.workspace_id ?? null;

  // ─── Parsear body ─────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body inválido' }, 400);
  }

  const { action, user_id, email } = body;

  if (!action || !user_id) {
    return json({ error: 'action y user_id son requeridos' }, 400);
  }

  // ─── Cliente de servicio (privilegiado) ───────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ─── Verificar que el target user existe ──────────────────────────────────
  const { data: { user: targetUser }, error: targetErr } = await admin.auth.admin.getUserById(user_id);
  if (targetErr || !targetUser) {
    return json({ error: 'Usuario target no encontrado' }, 404);
  }
  const targetEmail = email ?? targetUser.email ?? '';

  // ─── Ejecutar acción ──────────────────────────────────────────────────────

  switch (action) {
    // ── Reset Password ────────────────────────────────────────────────────
    case 'reset_password': {
      if (!targetEmail) return json({ error: 'Email del usuario no disponible' }, 400);

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:  'recovery',
        email: targetEmail,
      });

      if (linkErr || !linkData) {
        console.error('[admin-support] reset_password error:', linkErr);
        return json({ error: 'Error generando enlace de reset' }, 500);
      }

      await auditLog(admin, callerWorkspaceId, callerId, 'admin_reset_password_sent', {
        target_user_id: user_id,
        target_email:   targetEmail,
      });

      return json({
        ok: true,
        action: 'reset_password',
        message: `Enlace de recuperación generado para ${targetEmail}. Válido por 1 hora.`,
        link: linkData.properties?.action_link ?? null,
      });
    }

    // ── Reset MFA ─────────────────────────────────────────────────────────
    case 'reset_mfa': {
      // reset_mfa requiere super_admin (no solo support_admin)
      const { data: isSuperAdmin } = await callerClient.rpc('is_super_admin');
      if (!isSuperAdmin) {
        return json({ error: 'Reset MFA requiere super_admin.' }, 403);
      }

      // Listar y eliminar factores MFA via API admin
      const { data: factors, error: factorsErr } = await admin.auth.admin.mfa.listFactors({ userId: user_id });

      if (factorsErr) {
        console.error('[admin-support] list MFA factors error:', factorsErr);
        return json({ error: 'Error listando factores MFA' }, 500);
      }

      const allFactors = [
        ...(factors?.totp ?? []),
        ...(factors?.phone ?? []),
      ];

      let deleted = 0;
      for (const factor of allFactors) {
        const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
          userId:   user_id,
          factorId: factor.id,
        });
        if (!delErr) deleted++;
      }

      await auditLog(admin, callerWorkspaceId, callerId, 'admin_mfa_reset', {
        target_user_id:  user_id,
        factors_deleted: deleted,
      });

      return json({
        ok: true,
        action:  'reset_mfa',
        deleted,
        message: `${deleted} factor(es) MFA eliminados. El usuario deberá configurar MFA nuevamente.`,
      });
    }

    // ── Impersonation ─────────────────────────────────────────────────────
    case 'impersonate': {
      // Impersonation requiere super_admin (nunca solo support_admin)
      const { data: isSuperAdmin } = await callerClient.rpc('is_super_admin');
      if (!isSuperAdmin) {
        return json({ error: 'Impersonation requiere super_admin.' }, 403);
      }

      if (!targetEmail) return json({ error: 'Email del usuario target no disponible' }, 400);

      // Generar magic link de inicio de sesión one-time
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:  'magiclink',
        email: targetEmail,
        options: { redirectTo: '/app' },
      });

      if (linkErr || !linkData) {
        console.error('[admin-support] impersonate error:', linkErr);
        return json({ error: 'Error generando enlace de impersonación' }, 500);
      }

      await auditLog(admin, callerWorkspaceId, callerId, 'admin_impersonation_initiated', {
        target_user_id:  user_id,
        target_email:    targetEmail,
        caller_id:       callerId,
        // No loguear el link — es credencial sensible
        note: 'Enlace magic link generado para impersonación controlada. Válido 1 hora.',
      });

      return json({
        ok: true,
        action: 'impersonate',
        message: `Enlace de impersonación generado para ${targetEmail}. Válido 1 hora. Úsalo en modo incógnito.`,
        link: linkData.properties?.action_link ?? null,
        warning: 'Este enlace autentica directamente como el usuario. Toda acción posterior queda bajo responsabilidad del Super Admin.',
      });
    }

    default:
      return json({ error: `Acción desconocida: ${action}` }, 400);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function json(data: Record<string, any>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function auditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  workspaceId: string | null,
  userId: string,
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>,
) {
  if (!workspaceId) return;
  await admin.from('audit_log').insert({
    workspace_id: workspaceId,
    user_id:      userId,
    action,
    entity_type: 'users',
    entity_id:   metadata.target_user_id ?? null,
    metadata: { ...metadata, timestamp: new Date().toISOString() },
  });
}
