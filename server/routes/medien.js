import { Router } from 'express';
import db from '../db.js';
import { genreAlben, genres, maAktiv, titelDauer } from '../utils/musicAssistant.js';

/*
 * Playlist der Medien-Kachel (Winamp-Fenster) je Raum: die Liste, die gerade über Music
 * Assistant läuft, samt Position. Im gemeinsamen Modus (HA_TOKEN) für alle Geräte und
 * Benutzer dieselbe, sonst je HA-Benutzer.
 */

const router = Router();
const MAX_TITEL = 1000;
const MAX_BYTES = 512 * 1024;

const besitzer = (req) => (process.env.HA_TOKEN ? '__shared__' : req.authenticatedHaUser?.id);
// Schlüssel: Kachel-ID für die laufende Playlist, „<Kachel-ID>/listen/<Name>“ für gespeicherte
const gueltigerRaum = (raum) => typeof raum === 'string' && raum.length > 0 && raum.length <= 240;
const LISTEN = '/listen/';
const MAX_DAUER_URIS = 200;

// Länge in Sekunden; fehlt sie (früher als 0 gespeichert), null
function dauerWert(d) {
  const n = d === null || d === '' ? NaN : Number(d);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Eingehende Playlist auf das Nötige beschränken (Titel, Position). */
export function playlistBereinigen(body) {
  const items = (Array.isArray(body?.items) ? body.items : [])
    .slice(0, MAX_TITEL)
    .filter((t) => t && typeof t.uri === 'string')
    .map((t) => ({
      uri: t.uri,
      name: typeof t.name === 'string' ? t.name : '',
      artist: typeof t.artist === 'string' ? t.artist : '',
      dauer: dauerWert(t.dauer),
      media_type: typeof t.media_type === 'string' ? t.media_type : 'track',
    }));
  const index = Number.isInteger(body?.index) && body.index >= 0 && body.index < items.length ? body.index : 0;
  return { items, index };
}

router.get('/playlist', (req, res) => {
  const owner = besitzer(req);
  if (!owner) return res.status(401).json({ error: 'Missing authenticated Home Assistant user' });
  const { raum } = req.query;
  if (!gueltigerRaum(raum)) return res.status(400).json({ error: 'raum is required' });
  const row = db.prepare('SELECT data, updated_at FROM medien_playlists WHERE ha_user_id = ? AND raum = ?').get(owner, raum);
  if (!row) return res.json({ raum, items: [], index: 0, updated_at: null });
  let data = { items: [], index: 0 };
  try { data = playlistBereinigen(JSON.parse(row.data)); } catch { /* defekte Zeile: leer */ }
  return res.json({ raum, ...data, updated_at: row.updated_at });
});

router.put('/playlist', (req, res) => {
  const owner = besitzer(req);
  if (!owner) return res.status(401).json({ error: 'Missing authenticated Home Assistant user' });
  const { raum } = req.body || {};
  if (!gueltigerRaum(raum)) return res.status(400).json({ error: 'raum is required' });
  const data = playlistBereinigen(req.body);
  const text = JSON.stringify(data);
  if (text.length > MAX_BYTES) return res.status(413).json({ error: 'Playlist too large' });
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO medien_playlists (ha_user_id, raum, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (ha_user_id, raum) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(owner, raum, text, updatedAt);
  return res.json({ raum, ...data, updated_at: updatedAt });
});

router.delete('/playlist', (req, res) => {
  const owner = besitzer(req);
  if (!owner) return res.status(401).json({ error: 'Missing authenticated Home Assistant user' });
  const { raum } = req.query;
  if (!gueltigerRaum(raum)) return res.status(400).json({ error: 'raum is required' });
  const info = db.prepare('DELETE FROM medien_playlists WHERE ha_user_id = ? AND raum = ?').run(owner, raum);
  return res.json({ raum, deleted: info.changes > 0 });
});

// Gespeicherte Playlists eines Raums (Name, Anzahl Titel), nach Name sortiert
router.get('/listen', (req, res) => {
  const owner = besitzer(req);
  if (!owner) return res.status(401).json({ error: 'Missing authenticated Home Assistant user' });
  const { raum } = req.query;
  if (!gueltigerRaum(raum)) return res.status(400).json({ error: 'raum is required' });
  const praefix = `${raum}${LISTEN}`;
  const rows = db
    .prepare('SELECT raum, data, updated_at FROM medien_playlists WHERE ha_user_id = ? AND substr(raum, 1, ?) = ?')
    .all(owner, praefix.length, praefix);
  const listen = rows
    .map((r) => {
      let anzahl = 0;
      try { anzahl = playlistBereinigen(JSON.parse(r.data)).items.length; } catch { /* leer */ }
      return { schluessel: r.raum, name: r.raum.slice(praefix.length), anzahl, updated_at: r.updated_at };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return res.json(listen);
});

// Längen von Titeln aus Music Assistant (die HA-Dienste liefern keine); ohne ma_token leer
router.post('/dauer', async (req, res) => {
  const uris = Array.isArray(req.body?.uris) ? req.body.uris.slice(0, MAX_DAUER_URIS) : [];
  if (!maAktiv()) return res.json({ aktiv: false, dauer: {} });
  const dauer = await titelDauer(uris);
  return res.json({ aktiv: true, dauer });
});

// Genres aus Music Assistant (Winamp: Lokale Bibliothek → Genres); ohne ma_token aktiv: false
router.get('/genres', async (req, res) => {
  if (!maAktiv()) return res.json({ aktiv: false, items: [] });
  try {
    const items = await genres({ suche: req.query.suche, offset: req.query.offset, limit: req.query.limit });
    return res.json({ aktiv: true, items });
  } catch {
    return res.status(502).json({ error: 'Music Assistant nicht erreichbar' });
  }
});

router.get('/genres/:id/alben', async (req, res) => {
  if (!maAktiv()) return res.json({ aktiv: false, items: [] });
  if (!/^[\w-]{1,64}$/.test(req.params.id)) return res.status(400).json({ error: 'Ungültige Genre-ID' });
  try {
    const items = await genreAlben(req.params.id, { offset: req.query.offset, limit: req.query.limit });
    return res.json({ aktiv: true, items });
  } catch {
    return res.status(502).json({ error: 'Music Assistant nicht erreichbar' });
  }
});

export default router;
