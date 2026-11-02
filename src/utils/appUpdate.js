// Erkennt einen neuen Tunet-Stand, während die Seite noch die alte Version ausführt
// (z. B. HA-App aus dem Hintergrund nach einem Add-on-Update). Ohne Neuladen würden
// nachgeladene Modals aus dem neuen Build mit dem alten Hauptbundle gemischt.

const ENTRY_PATTERN = /<script[^>]+type="module"[^>]+src="([^"]*assets\/index-[^"]+\.js)"/;
const RELOAD_KEY = 'tunet_chunk_reload_at';
export const RELOAD_GUARD_MS = 30_000;

export function entryScriptFromHtml(html) {
  return String(html || '').match(ENTRY_PATTERN)?.[1] || null;
}

export function currentEntryScript(doc = globalThis.document) {
  const src = doc?.querySelector?.('script[type="module"][src*="assets/index-"]')?.getAttribute('src');
  return src || null;
}

/** true, wenn der Server einen anderen Build ausliefert als den, der gerade läuft. */
export async function isNewBuildAvailable(fetchFn = globalThis.fetch, doc = globalThis.document) {
  const current = currentEntryScript(doc);
  if (!current || typeof fetchFn !== 'function') return false;
  try {
    const res = await fetchFn('./', { cache: 'no-store', credentials: 'same-origin' });
    if (!res?.ok) return false; // z. B. abgelaufene Ingress-Sitzung: nichts entscheiden
    const latest = entryScriptFromHtml(await res.text());
    return Boolean(latest) && latest !== current;
  } catch {
    return false;
  }
}

/** Neu laden, höchstens einmal je RELOAD_GUARD_MS (verhindert Schleifen, greift aber wieder). */
export function reloadWithGuard(storage = globalThis.sessionStorage, now = Date.now(), reload = () => globalThis.window.history.go(0)) {
  try {
    const last = Number(storage?.getItem(RELOAD_KEY)) || 0;
    if (now - last < RELOAD_GUARD_MS) return false;
    storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    // ohne Speicher trotzdem neu laden
  }
  reload();
  return true;
}
