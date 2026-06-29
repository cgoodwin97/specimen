import { corsHeaders, getSessionToken } from '../_auth_utils.js';

export async function onRequestGet({ request, env }) {
  const token = getSessionToken(request);
  if (!token) return unauth(request);

  const session = await env.SPECIMEN_DB.prepare(
    `SELECT s.expires_at, u.id as user_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!session || new Date(session.expires_at) < new Date()) return unauth(request);

  const { results } = await env.SPECIMEN_DB.prepare(
    `SELECT go_id, name, structure_type, definition, saved_at
     FROM saved_structures WHERE user_id = ?
     ORDER BY saved_at DESC`
  ).bind(session.user_id).all();

  return new Response(JSON.stringify({ ok: true, structures: results || [] }), {
    status: 200, headers: corsHeaders('application/json', request),
  });
}

function unauth(request) {
  return new Response(JSON.stringify({ ok: false, error: 'Not signed in.' }), {
    status: 401, headers: corsHeaders('application/json', request),
  });
}
