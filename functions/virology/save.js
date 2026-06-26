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
    const { taxon_id, name, common_name, genome_type } = await request.json();

    if (!taxon_id || !name) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required virus data.' }), {
        status: 400, headers: corsHeaders('application/json'),
      });
    }

    await env.SPECIMEN_DB.prepare(
      `INSERT OR IGNORE INTO saved_viruses (user_id, taxon_id, name, common_name, genome_type)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(session.user_id, taxon_id, name, common_name || '', genome_type || '').run();

    return new Response(JSON.stringify({ ok: true }), {
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
