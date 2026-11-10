// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheLeeren,
  caldavAktiv,
  kalenderIdAusUniqueId,
  multistatusLesen,
  terminLoeschen,
  veventsLesen,
  xmlText,
} from '../utils/caldav.js';

const ics = (uid, extra = '') =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Test\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;

const antwort = (href, daten) =>
  `<D:response><D:href>${href}</D:href><D:propstat><D:prop><C:calendar-data>${daten
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</C:calendar-data></D:prop></D:propstat></D:response>`;

const multistatus = (...antworten) =>
  `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${antworten.join('')}</D:multistatus>`;

describe('Hilfsfunktionen', () => {
  it('liest die Kalender-ID aus der unique_id der CalDAV-Integration', () => {
    expect(kalenderIdAusUniqueId('01M724HPQ5-personal')).toBe('personal');
    expect(kalenderIdAusUniqueId('01M724HPQ5-alexa_A_hillmann_D_pro_personal')).toBe(
      'alexa_A_hillmann_D_pro_personal'
    );
    expect(kalenderIdAusUniqueId('ohne')).toBeNull();
    expect(kalenderIdAusUniqueId('x-a/b')).toBeNull();
    expect(kalenderIdAusUniqueId(null)).toBeNull();
  });

  it('dekodiert XML-Entitäten', () => {
    expect(xmlText('a &lt;b&gt; &amp; &#13;&#x41;')).toBe('a <b> & \rA');
  });

  it('liest href und calendar-data aus einem multistatus', () => {
    const xml = multistatus(antwort('/dav/cal/1.ics', ics('eins')), antwort('/dav/cal/2.ics', ics('zwei')));
    const r = multistatusLesen(xml);
    expect(r.map((x) => x.href)).toEqual(['/dav/cal/1.ics', '/dav/cal/2.ics']);
    expect(r[0].daten).toContain('UID:eins');
  });

  it('erkennt UID (auch umbrochen) und Serien', () => {
    expect(veventsLesen(ics('abc'))).toEqual([{ uid: 'abc', serie: false }]);
    expect(veventsLesen('BEGIN:VEVENT\r\nUID:lang\r\n e-uid\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT')).toEqual([
      { uid: 'lange-uid', serie: true },
    ]);
  });
});

describe('terminLoeschen', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.CALDAV_URL = 'https://mail.example.org/SOGo/dav';
    process.env.CALDAV_USER = 'david@example.org';
    process.env.CALDAV_PASSWORD = 'geheim';
    cacheLeeren();
  });
  afterEach(() => {
    process.env = { ...env };
    cacheLeeren();
  });

  const register = vi.fn(async (entityId) =>
    entityId === 'calendar.alexa'
      ? { platform: 'caldav', unique_id: 'ENTRY-alexa_A_example_D_org_personal' }
      : { platform: 'local_calendar', unique_id: 'x' }
  );

  function davServer(termine) {
    const aufrufe = [];
    const fetchFn = vi.fn(async (url, opts) => {
      aufrufe.push({ url, method: opts.method, depth: opts.headers.Depth, auth: opts.headers.Authorization });
      const ok = (text, status = 207) => ({ ok: true, status, text: async () => text });
      if (opts.method === 'PROPFIND' && url === 'https://mail.example.org/SOGo/dav/') {
        return ok(multistatus('<D:response><D:href>/SOGo/dav/</D:href><D:propstat><D:prop><D:current-user-principal><D:href>/SOGo/dav/david@example.org/</D:href></D:current-user-principal></D:prop></D:propstat></D:response>'));
      }
      if (opts.method === 'PROPFIND') {
        return ok(multistatus('<D:response><D:href>/SOGo/dav/david@example.org/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>/SOGo/dav/david@example.org/Calendar/</D:href></C:calendar-home-set></D:prop></D:propstat></D:response>'));
      }
      if (opts.method === 'REPORT') return ok(multistatus(...termine));
      if (opts.method === 'DELETE') return ok('', 204);
      return { ok: false, status: 405, text: async () => '' };
    });
    return { fetchFn, aufrufe };
  }

  it('ist nur mit URL, Benutzer und Passwort aktiv', () => {
    expect(caldavAktiv()).toBe(true);
    delete process.env.CALDAV_PASSWORD;
    expect(caldavAktiv()).toBe(false);
  });

  it('löscht den Termin mit der UID in der Sammlung der Entität', async () => {
    const { fetchFn, aufrufe } = davServer([
      antwort('/SOGo/dav/david@example.org/Calendar/alexa_A_example_D_org_personal/a.ics', ics('andere')),
      antwort('/SOGo/dav/david@example.org/Calendar/alexa_A_example_D_org_personal/b.ics', ics('gesucht')),
    ]);
    const r = await terminLoeschen(
      { entityId: 'calendar.alexa', uid: 'gesucht', start: '2026-11-12T09:00:00+01:00' },
      { fetchFn, register }
    );
    expect(r).toEqual({ geloescht: 1 });
    const report = aufrufe.find((a) => a.method === 'REPORT');
    expect(report.url).toBe(
      'https://mail.example.org/SOGo/dav/david@example.org/Calendar/alexa_A_example_D_org_personal/'
    );
    expect(report.depth).toBe('1');
    const loeschen = aufrufe.filter((a) => a.method === 'DELETE');
    expect(loeschen.map((a) => a.url)).toEqual([
      'https://mail.example.org/SOGo/dav/david@example.org/Calendar/alexa_A_example_D_org_personal/b.ics',
    ]);
    expect(loeschen[0].auth).toBe(`Basic ${Buffer.from('david@example.org:geheim').toString('base64')}`);
  });

  it('verlangt bei Serien eine Bestätigung', async () => {
    const termine = [antwort('/c/s.ics', ics('serie', 'RRULE:FREQ=WEEKLY\r\n'))];
    let { fetchFn, aufrufe } = davServer(termine);
    expect(
      await terminLoeschen({ entityId: 'calendar.alexa', uid: 'serie', start: '2026-11-12' }, { fetchFn, register })
    ).toEqual({ serie: true });
    expect(aufrufe.some((a) => a.method === 'DELETE')).toBe(false);

    ({ fetchFn, aufrufe } = davServer(termine));
    expect(
      await terminLoeschen(
        { entityId: 'calendar.alexa', uid: 'serie', start: '2026-11-12', serie: true },
        { fetchFn, register }
      )
    ).toEqual({ geloescht: 1 });
  });

  it('meldet 404, wenn die UID fehlt, und 400 bei Nicht-CalDAV-Kalendern', async () => {
    const { fetchFn } = davServer([antwort('/c/a.ics', ics('andere'))]);
    await expect(
      terminLoeschen({ entityId: 'calendar.alexa', uid: 'fehlt', start: '2026-11-12' }, { fetchFn, register })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      terminLoeschen({ entityId: 'calendar.lokal', uid: 'x', start: '2026-11-12' }, { fetchFn, register })
    ).rejects.toMatchObject({ status: 400 });
  });
});
