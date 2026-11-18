/**
 * Startseite nach längerer Pause: Wer das Dashboard nach mehr als der Wartezeit für
 * „Zurück zur Startseite“ öffnet oder (Smartphone, Tablet) aus dem Hintergrund holt,
 * landet auf der Startseite statt auf der zuletzt besuchten Seite. Kurz weg (App-Wechsel,
 * Neuladen nach einem Update) bleibt die Seite. Ohne Wartezeit (0) wie bisher.
 *
 * Die letzte Aktivität steht in localStorage, weil Timer im Hintergrund nicht laufen und
 * die App beim Öffnen neu startet.
 */
const LAST_ACTIVE_KEY = 'tunet_last_active';
const PAGE_KEY = 'tunet_active_page';
const TIMEOUT_KEY = 'tunet_inactivity_timeout';
const DEFAULT_TIMEOUT = 60;

/** Aktivität jetzt vermerken. */
export function markActive(now = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));
  } catch {}
}

function lastActive() {
  try {
    const n = Number(localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function storedTimeout() {
  try {
    const raw = localStorage.getItem(TIMEOUT_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_TIMEOUT;
  } catch {
    return DEFAULT_TIMEOUT;
  }
}

/** Liegt die letzte Aktivität länger als `timeoutSeconds` zurück? Ohne Vermerk: nein. */
export function isAwayLongerThan(timeoutSeconds, now = Date.now()) {
  if (!(timeoutSeconds > 0)) return false;
  const last = lastActive();
  return last !== null && now - last >= timeoutSeconds * 1000;
}

/** Seite beim Start: nach längerer Pause die Startseite, sonst die zuletzt besuchte. */
export function startPage(now = Date.now()) {
  let saved = 'home';
  try {
    saved = localStorage.getItem(PAGE_KEY) || 'home';
  } catch {}
  if (saved !== 'home' && isAwayLongerThan(storedTimeout(), now)) {
    try {
      localStorage.setItem(PAGE_KEY, 'home');
    } catch {}
    return 'home';
  }
  return saved;
}
