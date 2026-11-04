import { lazy } from 'react';

// Erkennt einen neuen Tunet-Stand, während die Seite noch die alte Version ausführt
// (z. B. HA-App aus dem Hintergrund nach einem Add-on-Update). Ohne Neuladen würden
// nachgeladene Modals aus dem neuen Build mit dem alten Hauptbundle gemischt.
// Zweiter Fall: Nach längerer Zeit im Hintergrund ist die Ingress-Sitzung abgelaufen;
// HA erneuert sie erst einige Sekunden nach der Rückkehr, bis dahin antwortet der
// Supervisor mit 401 und das Nachladen eines Modals schlägt fehl.

const ENTRY_PATTERN = /<script[^>]+type="module"[^>]+src="([^"]*assets\/index-[^"]+\.js)"/;
const RELOAD_KEY = 'tunet_chunk_reload_at';
export const RELOAD_GUARD_MS = 30_000;

export function isChunkLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('unable to preload css') ||
    message.includes('loading chunk')
  );
}

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wartet, bis der Server wieder normal antwortet (z. B. erneuerte Ingress-Sitzung). */
export async function waitForServer(fetchFn = globalThis.fetch, { timeoutMs = 20_000, intervalMs = 1_000 } = {}) {
  if (typeof fetchFn !== 'function') return false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetchFn('./', { cache: 'no-store', credentials: 'same-origin' });
      if (res?.ok) return true;
    } catch {
      // offline oder Proxy noch nicht bereit
    }
    if (Date.now() + intervalMs > deadline) return false;
    await wait(intervalMs);
  }
}

/** Neu laden, sobald der Server wieder erreichbar ist, damit kein 401 im Frame landet. */
export async function reloadWhenReachable() {
  await waitForServer();
  return reloadWithGuard();
}

/**
 * Wie React.lazy, aber ein fehlgeschlagenes Nachladen wird nach Erholung des Servers
 * einmal wiederholt. React.lazy merkt sich sonst den Fehler, und das Modal bleibt bis
 * zum Neuladen der Seite kaputt.
 */
export function lazyWithRetry(factory, waitFn = waitForServer) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      await waitFn();
      return factory();
    }
  });
}
