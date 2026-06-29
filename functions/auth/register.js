import { hashPassword, generateToken, corsHeaders } from '../_auth_utils.js';

const SESSION_DAYS = 30;

export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return error(400, 'Username and password are required.', request);
    }
    if (username.includes(' ')) {
      return error(400, 'Username cannot contain spaces.', request);
    }
    if (username.length < 5) {
      return error(400, 'Username must be at least 5 characters.', request);
    }
    if (password.length < 8) {
      return error(400, 'Password must be at least 8 characters.', request);
    }

    // Check if username already taken (case-insensitive via COLLATE NOCASE on the column)
    const existing = await env.SPECIMEN_DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first();

    if (existing) {
      return error(409, 'That username is already taken.', request);
    }

    // Hash password
    const hashed = await hashPassword(password);

    // Insert user
    const result = await env.SPECIMEN_DB.prepare(
      'INSERT INTO users (username, hashed_password) VALUES (?, ?) RETURNING id'
    ).bind(username, hashed).first();

    const userId = result.id;

    // Create session
    const token = generateToken();
    const expires = new Date();
    expires.setDate(expires.getDate() + SESSION_DAYS);

    await env.SPECIMEN_DB.prepare(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
    ).bind(userId, token, expires.toISOString()).run();

    return new Response(JSON.stringify({ ok: true, username }), {
      status: 201,
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
