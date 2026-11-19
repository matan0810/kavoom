// Which room this device was in, so a reload, a closed tab or a long drop can
// return the player to the same seat instead of making a second one.
// Kept in localStorage for a while; nothing here is secret beyond the seat itself.

const STORE_KEY = 'kavoom.session.v1';
export const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

const valid = (s) =>
  !!s &&
  typeof s.code === 'string' &&
  /^[A-Z]{4}$/.test(s.code) &&
  typeof s.token === 'string' &&
  s.token.length > 0 &&
  s.token.length <= 64 &&
  Number.isFinite(s.at);

// Remember the seat (again): call on joining, and now and then while playing.
export function saveSession({ code, token }, now = Date.now()) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ code, token, at: now }));
  } catch {
    // No storage: returning after a reload will not work, everything else does.
  }
}

// The remembered seat, { code, token }, or null if there is none or it is too old.
export function loadSession(now = Date.now()) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!valid(s) || now - s.at > SESSION_MAX_AGE_MS || s.at > now) return null;
    return { code: s.code, token: s.token };
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing to clear.
  }
}
