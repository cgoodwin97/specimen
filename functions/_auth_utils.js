// ---------- Password hashing (PBKDF2 via Web Crypto API) ----------
const ITERATIONS = 100000;
const HASH_ALGO = 'SHA-256';
const KEY_LENGTH = 32;

export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const hashArr = new Uint8Array(bits);
  const saltHex = bufToHex(salt);
  const hashHex = bufToHex(hashArr);
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  const [, iterStr, saltHex, hashHex] = stored.split(':');
  const iterations = parseInt(iterStr, 10);
  const salt = hexToBuf(saltHex);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH_ALGO },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const attemptHex = bufToHex(new Uint8Array(bits));
  return timingSafeEqual(attemptHex, hashHex);
}

// ---------- Token generation ----------
export function generateToken() {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return bufToHex(arr);
}

// ---------- Cookie parsing ----------
export function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)specimen_session=([^;]+)/);
  return match ? match[1] : null;
}

// ---------- CORS headers ----------
const ALLOWED_ORIGINS = [
  'https://specimen.site',
  'https://learn.specimen.site',
];

export function corsHeaders(contentType, request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
  };
}

// ---------- Helpers ----------
function bufToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
