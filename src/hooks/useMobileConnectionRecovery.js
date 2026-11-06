import { useEffect, useRef } from 'react';

export const CONNECTION_PROBE_TIMEOUT_MS = 3000;
// Regelmäßige Prüfung, solange die Seite sichtbar ist: Nach dem Hintergrund (HA-App, Browser-Tab,
// Laptop im Ruhezustand) bleibt der WebSocket oft halb offen. Er meldet keinen Abbruch, liefert
// aber auch nichts mehr; Karten frieren ein und Dialoge warten ewig auf Antworten. Nicht jede
// WebView meldet die Rückkehr per visibilitychange, deshalb zusätzlich dieser Takt.
export const CONNECTION_HEARTBEAT_MS = 30_000;
const RESUME_EVENTS = ['pageshow', 'online', 'focus'];

export async function probeAndRecoverConnection(
  conn,
  { timeoutMs = CONNECTION_PROBE_TIMEOUT_MS, onHealthy = () => {}, onRecovering = () => {} } = {}
) {
  if (!conn) return 'unavailable';

  if (conn.connected === false) {
    onRecovering();
    conn.reconnect?.(true);
    return 'reconnecting';
  }

  let timeoutId;
  try {
    await Promise.race([
      Promise.resolve().then(() => conn.ping()),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error('Home Assistant connection probe timed out')),
          timeoutMs
        );
      }),
    ]);
    onHealthy();
    return 'healthy';
  } catch {
    onRecovering();
    conn.reconnect?.(true);
    return 'reconnecting';
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

export function useMobileConnectionRecovery({ conn, onHealthy, onRecovering }) {
  const recoveryPromiseRef = useRef(null);

  useEffect(() => {
    if (
      !conn ||
      typeof globalThis.window === 'undefined' ||
      typeof globalThis.document === 'undefined'
    ) {
      return undefined;
    }

    const recoverIfNeeded = () => {
      if (globalThis.document.visibilityState !== 'visible' || recoveryPromiseRef.current) {
        return;
      }

      const recoveryPromise = probeAndRecoverConnection(conn, {
        onHealthy,
        onRecovering,
      });
      recoveryPromiseRef.current = recoveryPromise;
      recoveryPromise.finally(() => {
        if (recoveryPromiseRef.current === recoveryPromise) {
          recoveryPromiseRef.current = null;
        }
      });
    };

    globalThis.document.addEventListener('visibilitychange', recoverIfNeeded);
    // „resume“: Chrome/Android, wenn eine eingefrorene Seite weiterläuft
    globalThis.document.addEventListener('resume', recoverIfNeeded);
    RESUME_EVENTS.forEach((name) => globalThis.window.addEventListener(name, recoverIfNeeded));
    const heartbeat = globalThis.setInterval(recoverIfNeeded, CONNECTION_HEARTBEAT_MS);

    return () => {
      globalThis.document.removeEventListener('visibilitychange', recoverIfNeeded);
      globalThis.document.removeEventListener('resume', recoverIfNeeded);
      RESUME_EVENTS.forEach((name) => globalThis.window.removeEventListener(name, recoverIfNeeded));
      globalThis.clearInterval(heartbeat);
      recoveryPromiseRef.current = null;
    };
  }, [conn, onHealthy, onRecovering]);
}
