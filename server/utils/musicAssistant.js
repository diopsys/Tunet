/*
 * Längen von Titeln und Genres aus Music Assistant. Die HA-Dienste der Integration (search,
 * get_library) liefern beides nicht, die API von Music Assistant schon: Befehle
 * music/item_by_uri und music/genres/* (ab Music Assistant 2.10).
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

const MAX_SEITE = 500;
const ganz = (v, std, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : std;
};

/** Befehl mit Sortierung; kennt Music Assistant die Sortierung nicht, ohne sie wiederholen. */
async function sortiert(command, args, fetchFn) {
  try {
    return await befehl(command, { ...args, order_by: 'sort_name' }, fetchFn);
  } catch {
    return befehl(command, args, fetchFn);
  }
}

const liste = (r) => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []);

/**
 * Genres mit mindestens einem Album: [{ id, name, alben }], seitenweise, optional nach Namen
 * gefiltert. alben ist die Zahl der Alben (null, wenn Music Assistant sie nicht liefert).
 */
export async function genres({ suche, offset, limit } = {}, fetchFn = fetch) {
  const args = { media_type: 'album', limit: ganz(limit, 200, MAX_SEITE), offset: ganz(offset, 0, 1e6) };
  if (typeof suche === 'string' && suche.trim()) args.search = suche.trim().slice(0, 100);
  const items = liste(await sortiert('music/genres/library_items', args, fetchFn))
    .filter((g) => g?.item_id !== undefined && g?.name)
    .map((g) => ({ id: String(g.item_id), name: String(g.name) }));
  let zahlen = {};
  if (items.length) {
    try {
      zahlen = await befehl('music/genres/media_counts', { genre_ids: items.map((g) => g.id) }, fetchFn) || {};
    } catch {
      /* ohne Anzahl */
    }
  }
  return items.map((g) => {
    const n = Number(zahlen[g.id]?.album ?? zahlen[g.id]?.albums);
    return { ...g, alben: Number.isFinite(n) ? n : null };
  });
}

/** Alben eines Genres in der Form der HA-Dienste ({ uri, name, artists, media_type }). */
export async function genreAlben(id, { offset, limit } = {}, fetchFn = fetch) {
  const args = { item_id: String(id), limit: ganz(limit, MAX_SEITE, MAX_SEITE), offset: ganz(offset, 0, 1e6) };
  return liste(await sortiert('music/genres/albums', args, fetchFn))
    .filter((a) => a?.uri && a?.name)
    .map((a) => ({
      uri: a.uri,
      name: a.name,
      artists: (Array.isArray(a.artists) ? a.artists : []).filter((k) => k?.name).map((k) => ({ name: k.name })),
      year: Number.isInteger(a.year) ? a.year : null,
      media_type: 'album',
    }));
}

/** Nur für Tests. */
export function cacheLeeren() {
  cache.clear();
}
