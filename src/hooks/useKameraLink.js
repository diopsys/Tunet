import { useCallback, useEffect, useState } from 'react';

const KAMERA = /^camera\.[a-z0-9_]+$/;
const EREIGNIS = /^[A-Za-z0-9._-]+$/;

/**
 * Liest `?kamera=camera.x[:<frigate-ereignis>]` aus dem Query-Teil einer Adresse. Der Clip
 * hängt mit `:` am selben Parameter, weil die iPhone-App bei mehreren Parametern aus einer
 * Nachricht das `&` verfälscht (`&amp;`) und die Adresse dann im Browser öffnet.
 * `&clip=<ereignis>` wird ebenfalls verstanden.
 */
export function leseKameraLink(search) {
  const p = new URLSearchParams(search || '');
  const [kamera, angehaengt] = (p.get('kamera') || p.get('amp;kamera') || '').split(':', 2);
  if (!kamera || !KAMERA.test(kamera)) return null;
  const clip = angehaengt || p.get('clip') || p.get('amp;clip');
  return { kamera, clip: clip && EREIGNIS.test(clip) ? clip : null };
}

/** Adresse des Frigate-Clips zu einem Ereignis (Frigate-Integration, ohne Anmeldung abrufbar). */
export function clipAdresse(ereignis, basis = '') {
  return ereignis ? `${String(basis || '').replace(/\/+$/, '')}/api/frigate/notifications/${ereignis}/clip.mp4` : null;
}

// Tunet läuft per Ingress in einem iframe derselben Herkunft wie HA: dann zählt die
// Adresse des HA-Fensters, sonst (eigenständig geöffnet) die eigene
function adressFenster() {
  try {
    const top = globalThis.window.top;
    void top.location.search;
    return top;
  } catch {
    return globalThis.window;
  }
}

/**
 * Öffnet das Kamera-Fenster aus der Adresse, z. B. beim Tippen auf eine Klingel-Nachricht:
 * `/local_tunet_casa?kamera=camera.haustuer:<frigate-ereignis>`. Die Parameter werden
 * danach aus der Adresse entfernt. HA verwendet das Panel beim erneuten Aufruf wieder,
 * deshalb wird auch auf Adresswechsel im HA-Fenster gehört.
 * Rückgabe: [{ kamera, clip, basis } | null, schliessen]
 */
export function useKameraLink() {
  const [link, setLink] = useState(null);

  useEffect(() => {
    const win = adressFenster();
    if (!win) return undefined;
    const pruefen = () => {
      const gefunden = leseKameraLink(win.location.search);
      if (!gefunden) return;
      setLink({ ...gefunden, basis: win === globalThis.window ? '' : win.location.origin });
      try {
        const url = new URL(win.location.href);
        url.searchParams.delete('kamera');
        url.searchParams.delete('clip');
        url.searchParams.delete('amp;clip');
        url.searchParams.delete('amp;kamera');
        win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Adresse bleibt stehen – schadet nicht
      }
    };
    pruefen();
    win.addEventListener('location-changed', pruefen);
    win.addEventListener('popstate', pruefen);
    return () => {
      win.removeEventListener('location-changed', pruefen);
      win.removeEventListener('popstate', pruefen);
    };
  }, []);

  const schliessen = useCallback(() => setLink(null), []);
  return [link, schliessen];
}

/**
 * Seite mit einer Kamera-Karte für diese Kamera (z. B. „sicherheit“) oder null –
 * dorthin wechselt das Dashboard hinter dem Fenster, damit man nach dem Schließen dort ist.
 */
export function seiteFuerKamera(kamera, cardSettings, pagesConfig) {
  for (const [schluessel, werte] of Object.entries(cardSettings || {})) {
    if (werte?.cameraId !== kamera || !schluessel.includes('::')) continue;
    const [seite, karte] = schluessel.split('::');
    if (Array.isArray(pagesConfig?.[seite]) && pagesConfig[seite].includes(karte)) return seite;
  }
  return null;
}
