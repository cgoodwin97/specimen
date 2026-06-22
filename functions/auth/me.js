import { corsHeaders, getSessionToken } from '../_auth_utils.js';

export async function onRequestGet({ request, env }) {
  const token = getSessionToken(request);

  if (!token) {
    return new Response(JSON.stringify({ ok: false, user: null }), {
      status: 401,
      headers: corsHeaders('application/json'),
    });
  }

  const session = await env.SPECIMEN_DB.prepare(
    `SELECT s.token, s.expires_at, u.id, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!session) {
    return new Response(JSON.stringify({ ok: false, user: null }), {
      status: 401,
      headers: corsHeaders('application/json'),
    });
  }

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    await env.SPECIMEN_DB.prepare(
      'DELETE FROM sessions WHERE token = ?'
    ).bind(token).run();
    return new Response(JSON.stringify({ ok: false, user: null }), {
      status: 401,
      headers: corsHeaders('application/json'),
    });
  }

  return new Response(JSON.stringify({ ok: true, user: { id: session.id, username: session.username } }), {
    status: 200,
    headers: corsHeaders('application/json'),
  });
}
