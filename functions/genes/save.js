import { corsHeaders, getSessionToken } from '../../_auth_utils.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (!token) return unauth(request);

  const session = await env.SPECIMEN_DB.prepare(
    `SELECT s.expires_at, u.id as user_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!session || new Date(session.expires_at) < new Date()) return unauth(request);

  try {
    const { gene, accession, name, organism } = await request.json();

    if (!gene || !accession) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required gene data.' }), {
        status: 400, headers: corsHeaders('application/json', request),
      });
    }

    await env.SPECIMEN_DB.prepare(
      `INSERT OR IGNORE INTO saved_genes (user_id, gene, accession, name, organism)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(session.user_id, gene, accession, name || '', organism || '').run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: corsHeaders('application/json', request),
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Something went wrong.' }), {
      status: 500, headers: corsHeaders('application/json', request),
    });
  }
}

function unauth(request) {
  return new Response(JSON.stringify({ ok: false, error: 'Not signed in.' }), {
    status: 401, headers: corsHeaders('application/json', request),
  });
}
