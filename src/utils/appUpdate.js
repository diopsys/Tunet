import { lazy } from 'react';
import { renewIngressSession } from './ingressSession';

// Erkennt einen neuen Tunet-Stand, während die Seite noch die alte Version ausführt
// (z. B. HA-App aus dem Hintergrund nach einem Add-on-Update). Ohne Neuladen würden
// nachgeladene Modals aus dem neuen Build mit dem alten Hauptbundle gemischt.
// Zweiter Fall: Nach längerer Zeit im Hintergrund ist die Ingress-Sitzung abgelaufen und
// der Supervisor antwortet mit 401. HA erneuert sie oft erst spät oder gar nicht, deshalb
// erneuert Tunet sie bei einem 401 selbst (siehe ingressSession.js).

const ENTRY_PATTERN = /<script[^>]+type="module"[^>]+src="([^"]*assets\/index-[^"]+\.js)"/;
const RELOAD_KEY = 'tunet_chunk_reload_at';
export const RELOAD_GUARD_MS = 30_000;

const REQUEST_TIMEOUT_MS = 5_000;

// Mit Zeitlimit: Nach dem Hintergrund kann eine Anfrage über eine tote Verbindung sonst minutenlang hängen
const requestOptions = () => ({
  cache: 'no-store',
  credentials: 'same-origin',
  ...(typeof globalThis.AbortSignal?.timeout === 'function' ? { signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS) } : {}),
});

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
export async function isNewBuildAvailable(
  fetchFn = globalThis.fetch,
  doc = globalThis.document,
  renewFn = renewIngressSession
) {
  const current = currentEntryScript(doc);
  if (!current || typeof fetchFn !== 'function') return false;
  try {
    const res = await fetchFn('./', requestOptions());
    if (res?.status === 401) renewFn(); // zurück aus dem Hintergrund: Sitzung erneuern, bevor ein Klick nachlädt
    if (!res?.ok) return false;
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

/** Wartet, bis der Server wieder normal antwortet; eine abgelaufene Ingress-Sitzung wird erneuert. */
export async function waitForServer(
  fetchFn = globalThis.fetch,
  { timeoutMs = 20_000, intervalMs = 1_000, renewFn = renewIngressSession } = {}
) {
  if (typeof fetchFn !== 'function') return false;
  const deadline = Date.now() + timeoutMs;
  let renewed = false;
  for (;;) {
    try {
      const res = await fetchFn('./', requestOptions());
      if (res?.ok) return true;
      if (res?.status === 401 && !renewed) {
        renewed = await renewFn();
        if (renewed) continue; // neue Sitzung gesetzt: gleich nochmal
      }
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

export const IMPORT_TIMEOUT_MS = 10_000;

class ImportTimeoutError extends Error {}

const withTimeout = (promise, ms) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ImportTimeoutError('Loading chunk timed out')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Wie React.lazy, aber robust nach Rückkehr aus dem Hintergrund:
 * - Schlägt das Nachladen fehl, wird nach Erholung des Servers einmal wiederholt. React.lazy merkt
 *   sich sonst den Fehler, und das Modal bleibt bis zum Neuladen der Seite kaputt. Scheitert auch
 *   der zweite Versuch, wird die Seite neu geladen.
 * - Hängt das Nachladen (tote Verbindung), hilft kein zweiter Versuch, weil der Browser denselben
 *   hängenden Import zurückgibt. Dann wird die Seite neu geladen statt ewig den Ladekreis zu zeigen.
 */
export function lazyWithRetry(
  factory,
  { waitFn = waitForServer, reloadFn = reloadWhenReachable, timeoutMs = IMPORT_TIMEOUT_MS } = {}
) {
  const reloadOrFail = async (error) => {
    if (await reloadFn()) return new Promise(() => {}); // Seite lädt neu, Ladekreis bleibt bis dahin
    throw error;
  };
  return lazy(async () => {
    try {
      return await withTimeout(factory(), timeoutMs);
    } catch (error) {
      if (error instanceof ImportTimeoutError) return reloadOrFail(error);
      if (!isChunkLoadError(error)) throw error;
      await waitFn();
      try {
        return await withTimeout(factory(), timeoutMs);
      } catch (retryError) {
        // Safari merkt sich einen fehlgeschlagenen Import; dann hilft nur Neuladen
        if (retryError instanceof ImportTimeoutError || isChunkLoadError(retryError)) {
          return reloadOrFail(retryError);
        }
        throw retryError;
      }
    }
  });
}
