/*
 * Längen von Titeln aus Music Assistant. Die HA-Dienste der Integration (search, get_library)
 * liefern keine Dauer, die API von Music Assistant schon: Befehl music/item_by_uri.
 * Zugang über die App-Optionen ma_url (Standard: Host der App, Music Assistant läuft im
 * Host-Netz auf Port 8095) und ma_token (langlebiger Token aus Music Assistant).
 */

const STANDARD_URL = 'http://172.30.32.1:8095';
const MAX_CACHE = 20000;
const PARALLEL = 8;
const ZEITLIMIT_MS = 5000;

const cache = new Map();

export const maAktiv = () => Boolean(process.env.MA_TOKEN);
const maUrl = () => (process.env.MA_URL || STANDARD_URL).replace(/\/+$/, '');

/** Nur URIs, die Music Assistant selbst auflöst (keine Spotify-URIs, keine Ordner). */
export function gueltigeUri(uri) {
  return typeof uri === 'string' && uri.length <= 500 && /^[a-z][a-z0-9_-]*:\/\/[a-z]+\//i.test(uri);
}

async function befehl(command, args, fetchFn) {
  const res = await fetchFn(`${maUrl()}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MA_TOKEN}` },
    body: JSON.stringify({ command, args }),
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (!res.ok) throw new Error(`Music Assistant ${res.status}`);
  return res.json();
}

function merken(uri, sekunden) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(uri, sekunden);
}

/** { uri: Sekunden } für alle URIs, deren Länge Music Assistant kennt. */
export async function titelDauer(uris, fetchFn = fetch) {
  const ergebnis = {};
  const offen = [];
  for (const uri of new Set(uris.filter(gueltigeUri))) {
    if (cache.has(uri)) ergebnis[uri] = cache.get(uri);
    else offen.push(uri);
  }
  let pos = 0;
  const arbeiter = async () => {
    while (pos < offen.length) {
      const uri = offen[pos];
      pos += 1;
      try {
        const item = await befehl('music/item_by_uri', { uri }, fetchFn);
        const d = Math.round(Number(item?.duration));
        if (d > 0) {
          merken(uri, d);
          ergebnis[uri] = d;
        }
      } catch {
        /* unbekannt oder nicht erreichbar: ohne Länge */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, offen.length) }, arbeiter));
  return ergebnis;
}

/** Nur für Tests. */
export function cacheLeeren() {
  cache.clear();
}
