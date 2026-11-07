import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const origin = request.headers.get('origin');
  try {
    const source = new URL(origin || '');
    if (!['http:', 'https:'].includes(source.protocol) || source.host !== request.headers.get('host')) return reply({ error: 'Origem inválida.' }, 403);
  } catch { return reply({ error: 'Origem inválida.' }, 403); }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return reply({ error: 'Entre na conta de administrador.' }, 401);
    const { data: admin, error } = await supabase.rpc('summer_is_admin');
    if (error || admin !== true) return reply({ error: 'Acesso restrito.' }, 403);
    const { data: settings, error: settingsError } = await supabase.rpc('summer_admin_assessment_account');
    if (settingsError) return reply({ error: 'Ative a estrutura de avaliações no banco antes de criar a conta.' }, 503);
    if (settings?.user_id) return reply({ error: 'Já existe uma conta de avaliações ativa.' }, 409);
    if (Number(request.headers.get('content-length')) > 4096) return reply({ error: 'Dados muito grandes.' }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: 'Dados muito grandes.' }, 413);
    const body = JSON.parse(raw);
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.length > 254 || body.password.length < 12 || body.password.length > 128) return reply({ error: 'Informe um e-mail válido e uma senha de 12 a 128 caracteres.' }, 400);
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return reply({ error: 'A criação de contas precisa ser configurada no servidor.' }, 503);
    const service = createSupabaseClient(getSupabaseConfig().url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const created = await service.auth.admin.createUser({ email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true, user_metadata: { name: 'Equipe de avaliações' } });
    if (created.error || !created.data.user) return reply({ error: 'Não foi possível criar a conta. Use um e-mail exclusivo, que ainda não esteja cadastrado, e uma senha forte.' }, 400);
    const { error: grantError } = await supabase.rpc('summer_admin_assessment_account', { p_user_id: created.data.user.id, p_change: true });
    if (grantError) {
      // Only clean up the new, unused account created by this request.
      await service.auth.admin.deleteUser(created.data.user.id);
      return reply({ error: 'Não foi possível liberar a conta. Atualize a página e tente novamente.' }, 409);
    }
    return reply({ email: created.data.user.email }, 201);
  } catch { return reply({ error: 'Não foi possível criar a conta. Confira a conexão e tente novamente.' }, 400); }
}
