import { verifyPassword, generateToken, corsHeaders } from '../_auth_utils.js';

const SESSION_DAYS = 30;

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return error(400, 'Username and password are required.', request);
    }

    // Look up user
    const user = await env.SPECIMEN_DB.prepare(
      'SELECT id, username, hashed_password FROM users WHERE username = ?'
    ).bind(username).first();

    if (!user) {
      return error(401, 'Incorrect username or password.', request);
    }

    // Verify password
    const valid = await verifyPassword(password, user.hashed_password);
    if (!valid) {
      return error(401, 'Incorrect username or password.', request);
    }

    // Create session
    const token = generateToken();
    const expires = new Date();
    expires.setDate(expires.getDate() + SESSION_DAYS);

    await env.SPECIMEN_DB.prepare(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
    ).bind(user.id, token, expires.toISOString()).run();

    return new Response(JSON.stringify({ ok: true, username: user.username }), {
      status: 200,
      headers: {
        ...corsHeaders('application/json', request),
        'Set-Cookie': `specimen_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`,
      },
    });
  } catch (e) {
    return error(500, 'Something went wrong. Please try again.', request);
  }
}

function error(status, message, request) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: corsHeaders('application/json', request),
  });
}
