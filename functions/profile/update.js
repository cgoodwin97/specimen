import { corsHeaders, getSessionToken } from '../_auth_utils.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (!token) return unauth();

  const session = await env.SPECIMEN_DB.prepare(
    `SELECT s.expires_at, u.id as user_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!session || new Date(session.expires_at) < new Date()) return unauth();

  try {
    const { first_name } = await request.json();
    const clean = (first_name || '').trim().slice(0, 50);

    await env.SPECIMEN_DB.prepare(
      'UPDATE users SET first_name = ? WHERE id = ?'
    ).bind(clean, session.user_id).run();

    return new Response(JSON.stringify({ ok: true, first_name: clean }), {
      status: 200, headers: corsHeaders('application/json'),
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Something went wrong.' }), {
      status: 500, headers: corsHeaders('application/json'),
    });
  }
}

function unauth() {
  return new Response(JSON.stringify({ ok: false, error: 'Not signed in.' }), {
    status: 401, headers: corsHeaders('application/json'),
  });
}
