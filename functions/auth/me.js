import { corsHeaders, getSessionToken } from '../_auth_utils.js';

export async function onRequestGet({ request, env }) {
  const token = getSessionToken(request);
  if (!token) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: corsHeaders('application/json'),
    });
  }

  const row = await env.SPECIMEN_DB.prepare(
    `SELECT u.id, u.username, u.first_name, u.xp, u.level, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!row || new Date(row.expires_at) < new Date()) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: corsHeaders('application/json'),
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    user: {
      username:   row.username,
      first_name: row.first_name || '',
      xp:         row.xp   || 0,
      level:      row.level || 1,
    }
  }), {
    status: 200, headers: corsHeaders('application/json'),
  });
}
