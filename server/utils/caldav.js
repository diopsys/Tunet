import { WebSocket } from 'ws';

/*
 * Termine in CalDAV-Kalendern löschen. Die CalDAV-Integration von Home Assistant kann Termine
 * nur anlegen (CalendarEntityFeature.CREATE_EVENT), nicht löschen. Der Server spricht dafür
 * direkt mit dem CalDAV-Server.
 *
 * Zugang über die App-Optionen caldav_url (z. B. https://mail.example.org/SOGo/dav/),
 * caldav_user und caldav_password – am besten dasselbe Konto wie in der HA-Integration,
 * damit dieselben Kalender sichtbar sind.
 *
 * Welcher Kalender zu einer Entität gehört, steht in deren unique_id im Entity-Register
 * („<config_entry_id>-<Kalender-ID>“, die Kalender-ID ist der letzte Pfadteil der
 * Kalender-Sammlung). Das Register liest der Server über die Supervisor-API.
 */

const ZEITLIMIT_MS = 10000;
const ENTITY_ID = /^calendar\.[a-z0-9_]+$/;

export const caldavAktiv = () =>
  Boolean(process.env.CALDAV_URL && process.env.CALDAV_USER && process.env.CALDAV_PASSWORD);

const basisUrl = () => {
  const url = String(process.env.CALDAV_URL || '').trim();
  return url.endsWith('/') ? url : `${url}/`;
};

const authHeader = () =>
  `Basic ${Buffer.from(`${process.env.CALDAV_USER}:${process.env.CALDAV_PASSWORD}`).toString('base64')}`;

export const gueltigeEntityId = (id) => typeof id === 'string' && ENTITY_ID.test(id);

/* ─── Home Assistant: Entity-Register ─────────────────────────────────────── */

function haWebsocketZugang() {
  if (process.env.SUPERVISOR_TOKEN) {
    return { url: 'ws://supervisor/core/websocket', token: process.env.SUPERVISOR_TOKEN };
  }
  if (process.env.HA_URL && process.env.HA_TOKEN) {
    const url = process.env.HA_URL.replace(/\/+$/, '').replace(/^http/, 'ws');
    return { url: `${url}/api/websocket`, token: process.env.HA_TOKEN };
  }
  return null;
}

/** Eintrag einer Entität im Entity-Register (platform, unique_id …). */
export function registerEintrag(entityId, { zugang = haWebsocketZugang(), WebSocketImpl = WebSocket } = {}) {
  if (!zugang) return Promise.reject(new Error('Kein Zugang zu Home Assistant'));
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(zugang.url);
    let fertig = false;
    const ende = (fn) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* egal */ }
      fn();
    };
    const timer = setTimeout(() => ende(() => reject(new Error('Home Assistant antwortet nicht'))), ZEITLIMIT_MS);
    ws.on('error', (err) => ende(() => reject(err)));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: zugang.token }));
      } else if (msg.type === 'auth_ok') {
        ws.send(JSON.stringify({ id: 1, type: 'config/entity_registry/get', entity_id: entityId }));
      } else if (msg.type === 'auth_invalid') {
        ende(() => reject(new Error('Home Assistant: Anmeldung abgelehnt')));
      } else if (msg.id === 1) {
        if (msg.success) ende(() => resolve(msg.result));
        else ende(() => reject(new Error(msg.error?.message || 'Entität nicht gefunden')));
      }
    });
  });
}

/** Kalender-ID (letzter Pfadteil der Sammlung) aus der unique_id der CalDAV-Integration. */
export function kalenderIdAusUniqueId(uniqueId) {
  if (typeof uniqueId !== 'string') return null;
  const pos = uniqueId.indexOf('-');
  const id = pos >= 0 ? uniqueId.slice(pos + 1) : '';
  return id && !id.includes('/') ? id : null;
}

/* ─── CalDAV ─────────────────────────────────────────────────────────────── */

async function dav(method, url, { body, depth, fetchFn = fetch } = {}) {
  const headers = { Authorization: authHeader() };
  if (body) headers['Content-Type'] = 'application/xml; charset=utf-8';
  if (depth !== undefined) headers.Depth = String(depth);
  const res = await fetchFn(url, { method, headers, body, signal: AbortSignal.timeout(ZEITLIMIT_MS) });
  if (!res.ok) throw new Error(`CalDAV ${method} ${res.status}`);
  return res.status === 204 ? '' : res.text();
}

const XML_ENTITAETEN = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function xmlText(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (ganz, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : ganz;
    }
    return XML_ENTITAETEN[e] ?? ganz;
  });
}

const tag = (name) => `(?:[\\w-]+:)?${name}`;
const ersterWert = (xml, name) => {
  const m = xml.match(new RegExp(`<${tag(name)}\\b[^>]*>([\\s\\S]*?)</${tag(name)}>`, 'i'));
  return m ? m[1] : null;
};

/** Antworten eines multistatus: [{ href, daten }] (daten = Inhalt von calendar-data). */
export function multistatusLesen(xml) {
  const antworten = String(xml).match(new RegExp(`<${tag('response')}\\b[\\s\\S]*?</${tag('response')}>`, 'gi')) || [];
  return antworten.map((r) => {
    const href = ersterWert(r, 'href');
    const daten = ersterWert(r, 'calendar-data');
    return {
      href: href ? xmlText(href.trim()) : null,
      daten: daten ? xmlText(daten.replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '',
    };
  });
}

/** Für jeden VEVENT eines iCalendar-Textes: { uid, serie }. */
export function veventsLesen(ics) {
  const zeilen = String(ics).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const ergebnis = [];
  let aktuell = null;
  for (const zeile of zeilen) {
    if (zeile === 'BEGIN:VEVENT') aktuell = { uid: null, serie: false };
    else if (zeile === 'END:VEVENT' && aktuell) {
      ergebnis.push(aktuell);
      aktuell = null;
    } else if (aktuell) {
      const name = zeile.split(/[;:]/, 1)[0].toUpperCase();
      if (name === 'UID') aktuell.uid = zeile.slice(zeile.indexOf(':') + 1);
      else if (name === 'RRULE' || name === 'RDATE') aktuell.serie = true;
    }
  }
  return ergebnis;
}

const zuUrl = (href, basis) => new URL(href, basis).toString();

let kalenderHeimCache = null;

/** Adresse der Kalender-Sammlungen des Kontos (calendar-home-set). */
export async function kalenderHeim({ fetchFn = fetch } = {}) {
  if (kalenderHeimCache) return kalenderHeimCache;
  const basis = basisUrl();
  const principalXml = await dav('PROPFIND', basis, {
    depth: 0,
    fetchFn,
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  });
  const principalTeil = ersterWert(principalXml, 'current-user-principal');
  const principalHref = principalTeil && ersterWert(principalTeil, 'href');
  if (!principalHref) throw new Error('CalDAV: current-user-principal fehlt');
  const principal = zuUrl(xmlText(principalHref.trim()), basis);
  const heimXml = await dav('PROPFIND', principal, {
    depth: 0,
    fetchFn,
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
  });
  const heimTeil = ersterWert(heimXml, 'calendar-home-set');
  const heimHref = heimTeil && ersterWert(heimTeil, 'href');
  if (!heimHref) throw new Error('CalDAV: calendar-home-set fehlt');
  const heim = zuUrl(xmlText(heimHref.trim()), principal);
  kalenderHeimCache = heim.endsWith('/') ? heim : `${heim}/`;
  return kalenderHeimCache;
}

export function cacheLeeren() {
  kalenderHeimCache = null;
}

const icalZeit = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Ressourcen der Sammlung mit Terminen zwischen von und bis: [{ href, daten }]. */
async function termineImZeitraum(sammlung, von, bis, fetchFn) {
  const xml = await dav('REPORT', sammlung, {
    depth: 1,
    fetchFn,
    body:
      '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      '<d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR">' +
      `<c:comp-filter name="VEVENT"><c:time-range start="${icalZeit(von)}" end="${icalZeit(bis)}"/>` +
      '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>',
  });
  return multistatusLesen(xml).filter((r) => r.href && r.daten);
}

/**
 * Termin mit der UID aus dem Kalender der Entität löschen.
 * start: Beginn des Termins (Datum oder Zeitpunkt), damit nur ein kleiner Zeitraum gesucht wird.
 * Bei Serien nur mit serie: true (gelöscht wird dann die ganze Serie).
 * Ergebnis: { geloescht: n } oder { serie: true } (Bestätigung nötig); wirft bei Fehlern.
 */
export async function terminLoeschen(
  { entityId, uid, start, serie = false },
  { fetchFn = fetch, register = registerEintrag } = {}
) {
  const eintrag = await register(entityId);
  if (eintrag?.platform !== 'caldav') {
    const err = new Error('Kein CalDAV-Kalender');
    err.status = 400;
    throw err;
  }
  const kalenderId = kalenderIdAusUniqueId(eintrag.unique_id);
  if (!kalenderId) throw new Error('Kalender-ID nicht erkennbar');

  const sammlung = `${await kalenderHeim({ fetchFn })}${encodeURIComponent(kalenderId)}/`;
  const beginn = new Date(/^\d{4}-\d{2}-\d{2}$/.test(start) ? `${start}T12:00:00Z` : start);
  if (Number.isNaN(beginn.getTime())) {
    const err = new Error('Ungültiger Beginn');
    err.status = 400;
    throw err;
  }
  // Einen Tag Spielraum zu beiden Seiten (Zeitzonen, ganztägige Termine)
  const von = new Date(beginn.getTime() - 36 * 3600 * 1000);
  const bis = new Date(beginn.getTime() + 36 * 3600 * 1000);

  const treffer = (await termineImZeitraum(sammlung, von, bis, fetchFn))
    .map((r) => ({ ...r, vevents: veventsLesen(r.daten) }))
    .filter((r) => r.vevents.some((v) => v.uid === uid));
  if (treffer.length === 0) {
    const err = new Error('Termin nicht gefunden');
    err.status = 404;
    throw err;
  }
  if (!serie && treffer.some((r) => r.vevents.some((v) => v.serie))) return { serie: true };

  for (const r of treffer) {
    await dav('DELETE', zuUrl(r.href, sammlung), { fetchFn });
  }
  return { geloescht: treffer.length };
}
