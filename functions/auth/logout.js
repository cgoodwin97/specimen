import { corsHeaders, getSessionToken } from '../_auth_utils.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);

  if (token) {
    await env.SPECIMEN_DB.prepare(
      'DELETE FROM sessions WHERE token = ?'
    ).bind(token).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      ...corsHeaders('application/json', request),
      'Set-Cookie': 'specimen_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
}
