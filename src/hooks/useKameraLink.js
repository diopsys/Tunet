import { useCallback, useEffect, useState } from 'react';

const KAMERA = /^camera\.[a-z0-9_]+$/;
const EREIGNIS = /^[A-Za-z0-9._-]+$/;

/** Liest `?kamera=camera.x[&clip=<frigate-ereignis>]` aus dem Query-Teil einer Adresse. */
export function leseKameraLink(search) {
  const p = new URLSearchParams(search || '');
  const kamera = p.get('kamera');
  if (!kamera || !KAMERA.test(kamera)) return null;
  const clip = p.get('clip');
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
 * `/local_tunet_casa?kamera=camera.haustuer&clip=<frigate-ereignis>`. Die Parameter werden
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
