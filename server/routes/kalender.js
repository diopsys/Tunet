import { Router } from 'express';
import { caldavAktiv, gueltigeEntityId, terminLoeschen } from '../utils/caldav.js';

/*
 * Kalender: Löschen von Terminen in CalDAV-Kalendern (die HA-Integration kann das nicht).
 * Ohne caldav_url/caldav_user/caldav_password meldet /status aktiv: false.
 */

const router = Router();

router.get('/status', (_req, res) => res.json({ aktiv: caldavAktiv() }));

router.post('/loeschen', async (req, res) => {
  if (!caldavAktiv()) return res.status(503).json({ error: 'CalDAV ist nicht eingerichtet' });
  const { entityId, uid, start, serie } = req.body || {};
  if (!gueltigeEntityId(entityId)) return res.status(400).json({ error: 'entityId fehlt' });
  if (typeof uid !== 'string' || !uid || uid.length > 1000) return res.status(400).json({ error: 'uid fehlt' });
  if (typeof start !== 'string' || !start || start.length > 64) return res.status(400).json({ error: 'start fehlt' });
  try {
    const ergebnis = await terminLoeschen({ entityId, uid, start, serie: serie === true });
    if (ergebnis.serie) return res.status(409).json({ error: 'Serientermin', serie: true });
    return res.json(ergebnis);
  } catch (err) {
    const status = err.status || 502;
    if (status >= 500) console.warn(`[kalender] Löschen in ${entityId}: ${err.message}`);
    // Anmeldung abgelehnt: caldav_user/caldav_password in den App-Optionen prüfen
    const code = err.davStatus === 401 || err.davStatus === 403 ? 'anmeldung' : undefined;
    return res.status(status).json({ error: err.message, ...(code ? { code } : {}) });
  }
});

export default router;
