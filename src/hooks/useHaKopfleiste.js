import { useEffect } from 'react';

/**
 * Tunet als HA-App (Ingress-iframe): auf schmalen Bildschirmen (z. B. HA-App am Handy) die
 * Kopfleiste des HA-App-Panels („☰ Casa“) ausblenden. Das Panel kennt dafür das Protokoll
 * `home-assistant/subscribe-properties` mit `kioskMode`; es meldet `narrow` zurück, und nur
 * solange das zutrifft, wird der Kiosk-Modus angefordert. Die HA-Seitenleiste öffnet weiter
 * per Wischen bzw. `hass-toggle-menu`, das HA auch im Kiosk-Modus bedient.
 */
export function useHaKopfleiste() {
  useEffect(() => {
    const win = globalThis.window;
    const parent = win?.parent;
    if (!parent || parent === win) return undefined;

    const senden = (nachricht) => {
      try {
        parent.postMessage(nachricht, win.location.origin);
      } catch {
        // anderer Ursprung – dann gibt es auch kein HA-Panel zu steuern
      }
    };
    let kiosk = false;
    const empfangen = (event) => {
      if (event.source !== parent || event.data?.type !== 'home-assistant/properties') return;
      const schmal = Boolean(event.data.narrow);
      if (schmal === kiosk) return;
      kiosk = schmal;
      // Kiosk lässt sich nur über unsubscribe wieder abschalten
      if (!schmal) senden({ type: 'home-assistant/unsubscribe-properties' });
      senden({ type: 'home-assistant/subscribe-properties', kioskMode: schmal });
    };

    win.addEventListener('message', empfangen);
    senden({ type: 'home-assistant/subscribe-properties' });
    return () => {
      win.removeEventListener('message', empfangen);
      senden({ type: 'home-assistant/unsubscribe-properties' });
    };
  }, []);
}
