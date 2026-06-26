import { corsHeaders, getSessionToken } from '../_auth_utils.js';

// XP values per action
const XP_VALUES = {
  save_card:    10,
  search_term:   5,
  quiz_answer:  15,  // per correct answer; bonus handled client-side
};

// After this level, save_card and search_term no longer earn XP
// quiz_answer is never capped — it's the primary progression path
const PASSIVE_XP_CAP_LEVEL = 5;
const UNCAPPED_ACTIONS = new Set(['quiz_answer']);

// Level thresholds — XP required to reach each level
const LEVEL_THRESHOLDS = [
  0,     // 1 — Curious Mind
  100,   // 2 — Microscopist
  300,   // 3 — Lab Trainee
  600,   // 4 — Field Researcher
  1000,  // 5 — Lab Technician
  1500,  // 6 — Research Associate
  2200,  // 7 — Research Scientist
  3000,  // 8 — Senior Scientist
  4000,  // 9 — Research Fellow
  5500,  // 10 — Principal Scientist
];

const LEVEL_TITLES = [
  'Curious Mind',
  'Microscopist',
  'Lab Trainee',
  'Field Researcher',
  'Lab Technician',
  'Research Associate',
  'Research Scientist',
  'Senior Scientist',
  'Research Fellow',
  'Principal Scientist',
];

function calcLevel(xp) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  return Math.min(level, 10);
}

function xpForNextLevel(level) {
  if (level >= 10) return null;
  return LEVEL_THRESHOLDS[level]; // index = level (0-based), so level 1 next = index 1
}

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (!token) return unauth();

  const session = await env.SPECIMEN_DB.prepare(
    `SELECT s.expires_at, u.id as user_id, u.xp, u.level
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).bind(token).first();

  if (!session || new Date(session.expires_at) < new Date()) return unauth();

  try {
    const { action, term } = await request.json();

    if (!XP_VALUES[action]) {
      return new Response(JSON.stringify({ ok: false, error: 'Unknown action.' }), {
        status: 400, headers: corsHeaders('application/json'),
      });
    }

    const currentLevel = session.level || 1;
    const currentXp   = session.xp   || 0;

    // Enforce cap — passive actions earn no XP above level 5
    const isPassive = action === 'save_card' || action === 'search_term';
    if (isPassive && !UNCAPPED_ACTIONS.has(action) && currentLevel >= PASSIVE_XP_CAP_LEVEL) {
      return new Response(JSON.stringify({
        ok: true, xp_awarded: 0, xp: currentXp, level: currentLevel,
        title: LEVEL_TITLES[currentLevel - 1], capped: true,
      }), { status: 200, headers: corsHeaders('application/json') });
    }

    // For search_term, check if this term was already searched
    if (action === 'search_term' && term) {
      const existing = await env.SPECIMEN_DB.prepare(
        'SELECT id FROM searched_terms WHERE user_id = ? AND term = ?'
      ).bind(session.user_id, term.toLowerCase().trim()).first();

      if (existing) {
        return new Response(JSON.stringify({
          ok: true, xp_awarded: 0, xp: currentXp, level: currentLevel,
          title: LEVEL_TITLES[currentLevel - 1], already_searched: true,
        }), { status: 200, headers: corsHeaders('application/json') });
      }

      // Record this term
      await env.SPECIMEN_DB.prepare(
        'INSERT OR IGNORE INTO searched_terms (user_id, term) VALUES (?, ?)'
      ).bind(session.user_id, term.toLowerCase().trim()).run();
    }

    // Award XP
    const awarded = XP_VALUES[action];
    const newXp   = currentXp + awarded;
    const newLevel = calcLevel(newXp);

    await env.SPECIMEN_DB.prepare(
      'UPDATE users SET xp = ?, level = ? WHERE id = ?'
    ).bind(newXp, newLevel, session.user_id).run();

    const nextLevelXp = xpForNextLevel(newLevel);

    return new Response(JSON.stringify({
      ok:          true,
      xp_awarded:  awarded,
      xp:          newXp,
      level:       newLevel,
      title:       LEVEL_TITLES[newLevel - 1],
      level_up:    newLevel > currentLevel,
      next_level_xp: nextLevelXp,
    }), { status: 200, headers: corsHeaders('application/json') });

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
