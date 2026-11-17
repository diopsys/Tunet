// REST-API der Tunet-Zeitschaltuhr.

import { Router } from 'express';
import { sanitizeSchedule } from '../scheduler/validate.js';

const userIdOf = (req) => req.authenticatedHaUser?.id || null;

export function createSchedulesRouter({ store, engine = null, engineInfo = {} }) {
  const router = Router();

  const status = () => ({
    active: false,
    ...engineInfo,
    ...(engine ? engine.status() : {}),
  });

  router.get('/', (_req, res) => {
    res.json({
      schedules: store.list(),
      settings: { vacation: Boolean(store.getState('vacation', false)) },
      engine: status(),
    });
  });

  router.get('/runs', (req, res) => {
    res.json({ runs: store.listRuns(req.query?.limit) });
  });

  router.put('/settings', (req, res) => {
    if (typeof req.body?.vacation === 'boolean') store.setState('vacation', req.body.vacation);
    res.json({ settings: { vacation: Boolean(store.getState('vacation', false)) } });
  });

  router.post('/', (req, res) => {
    const { value, error } = sanitizeSchedule(req.body);
    if (error) return res.status(400).json({ error });
    res.status(201).json({ schedule: store.create(value, userIdOf(req)) });
  });

  router.put('/:id', (req, res) => {
    const { value, error } = sanitizeSchedule(req.body);
    if (error) return res.status(400).json({ error });
    const schedule = store.update(req.params.id, value);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule });
  });

  router.delete('/:id', (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ ok: true });
  });

  // Aussetzen: mode 'day' (ganzer Tag, day = YYYY-MM-DD in HA-Zeitzone), 'instance' (nur das nächste
  // Fenster, instanceKey vom Client berechnet) oder 'clear'
  router.post('/:id/skip', (req, res) => {
    const { mode, day, instanceKey } = req.body || {};
    let changes;
    if (mode === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(day || '')) changes = { skipDay: day };
    else if (mode === 'instance' && typeof instanceKey === 'string' && instanceKey.startsWith(`${req.params.id}|`)) {
      changes = { skipInstance: instanceKey.slice(0, 200) };
    } else if (mode === 'clear') changes = { skipDay: null, skipInstance: null };
    else return res.status(400).json({ error: 'Invalid skip request' });
    const schedule = store.patch(req.params.id, changes);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule });
  });

  router.post('/:id/run', async (req, res) => {
    const schedule = store.get(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!engine) return res.status(409).json({ error: 'Scheduler is not running in this mode' });
    try {
      const targets = await engine.runNow(schedule, req.body?.kind === 'end' ? 'end' : 'start');
      res.json({ ok: true, targets });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  return router;
}
