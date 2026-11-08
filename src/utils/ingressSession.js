// Ingress-Sitzung selbst erneuern. HA verlängert sie nur über seine eigene Verbindung, und das
// stockt, solange Tunet im Hintergrund liegt. Nach der Rückkehr antwortet der Supervisor dann mit
// 401, bis HA die Sitzung irgendwann neu anlegt. Tunet bittet deshalb die umgebende HA-Seite
// (gleicher Ursprung) um eine neue Sitzung, genau wie HA es selbst tut. Die Sitzung gehört damit
// dem dort angemeldeten Benutzer, nicht dem Token aus den Add-on-Optionen.

const INGRESS_PATH = /\/api\/hassio_ingress\//;
const RENEW_TIMEOUT_MS = 5_000;

export function isIngressPage(win = globalThis.window) {
  return INGRESS_PATH.test(win?.location?.pathname || '');
}

function parentHass(win) {
  try {
    if (!win?.parent || win.parent === win) return null;
    return win.parent.document?.querySelector?.('home-assistant')?.hass || null;
  } catch {
    return null; // anderer Ursprung: kein Zugriff
  }
}

/** Slug des Add-ons, wie ihn auch HAs App-Panel bestimmt (Panel-Config, sonst /app/<slug>). */
export function addonSlugFrom(hass, parentPath = '') {
  const fromPanel = hass?.panels?.[hass?.panelUrl]?.config?.addon;
  if (fromPanel) return fromPanel;
  const match = /^\/(?:app|hassio\/ingress)\/([^/?#]+)/.exec(parentPath);
  return match ? decodeURIComponent(match[1]) : null;
}

let pending = null;

/** true, wenn eine neue Sitzung gesetzt wurde. Gleichzeitige Aufrufe teilen sich eine Anfrage. */
export function renewIngressSession(win = globalThis.window) {
  if (pending) return pending;
  pending = (async () => {
    if (!isIngressPage(win)) return false;
    const hass = parentHass(win);
    if (typeof hass?.callWS !== 'function') return false;
    let parentPath = '';
    try {
      parentPath = win.parent.location.pathname;
    } catch {
      // ohne Pfad bleibt die Panel-Config
    }
    const slug = addonSlugFrom(hass, parentPath);
    if (!slug) return false;
    let timer;
    try {
      const result = await Promise.race([
        hass.callWS({ type: 'supervisor/ingress/session', slug }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Ingress session renewal timed out')), RENEW_TIMEOUT_MS);
        }),
      ]);
      if (!result?.session) return false;
      win.document.cookie = `ingress_session=${result.session};path=/api/hassio_ingress/;SameSite=Strict${
        win.location.protocol === 'https:' ? ';Secure' : ''
      }`;
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}
