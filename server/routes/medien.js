import { Router } from 'express';
import db from '../db.js';

/*
 * Playlist der Medien-Kachel (Winamp-Fenster) je Raum: die Liste, die gerade über Music
 * Assistant läuft, samt Position. Im gemeinsamen Modus (HA_TOKEN) für alle Geräte und
 * Benutzer dieselbe, sonst je HA-Benutzer.
 */

const router = Router();
const MAX_TITEL = 1000;
const MAX_BYTES = 512 * 1024;

const besitzer = (req) => (process.env.HA_TOKEN ? '__shared__' : req.authenticatedHaUser?.id);
const gueltigerRaum = (raum) => typeof raum === 'string' && raum.length > 0 && raum.length <= 120;

/** Eingehende Playlist auf das Nötige beschränken (Titel, Position). */
export function playlistBereinigen(body) {
  const items = (Array.isArray(body?.items) ? body.items : [])
    .slice(0, MAX_TITEL)
    .filter((t) => t && typeof t.uri === 'string')
    .map((t) => ({
      uri: t.uri,
      name: typeof t.name === 'string' ? t.name : '',
      artist: typeof t.artist === 'string' ? t.artist : '',
      dauer: Number.isFinite(Number(t.dauer)) ? Number(t.dauer) : null,
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

export default router;
