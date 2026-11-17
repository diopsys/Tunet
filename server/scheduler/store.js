// Ablage der Zeitschaltuhr in SQLite: Zeitpläne, Protokoll, Zustand je Fenster und Engine-Zustand.

import { randomUUID } from 'crypto';

export const MAX_RUNS = 500;
const INSTANCE_TTL_MS = 4 * 86_400_000;

export function ensureScheduleTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id TEXT NOT NULL,
      schedule_name TEXT,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_runs_at ON schedule_runs(at DESC);

    CREATE TABLE IF NOT EXISTS schedule_instances (
      instance_key TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduler_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function createScheduleStore(db) {
  ensureScheduleTables(db);

  const parse = (row) => {
    try {
      return { ...JSON.parse(row.data), id: row.id };
    } catch {
      return null;
    }
  };

  const store = {
    list() {
      return db
        .prepare('SELECT id, data FROM schedules ORDER BY created_at, id')
        .all()
        .map(parse)
        .filter(Boolean);
    },

    get(id) {
      const row = db.prepare('SELECT id, data FROM schedules WHERE id = ?').get(id);
      return row ? parse(row) : null;
    },

    create(schedule, userId = null) {
      const id = randomUUID();
      const data = { ...schedule, id };
      db.prepare('INSERT INTO schedules (id, data, created_by) VALUES (?, ?, ?)').run(id, JSON.stringify(data), userId);
      return data;
    },

    update(id, schedule) {
      const data = { ...schedule, id };
      const result = db
        .prepare("UPDATE schedules SET data = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(data), id);
      return result.changes ? data : null;
    },

    /** Teilweise ändern, ohne einen gleichzeitigen Schreibvorgang zu überschreiben. */
    patch(id, changes) {
      const current = store.get(id);
      if (!current) return null;
      return store.update(id, { ...current, ...changes });
    },

    remove(id) {
      return db.prepare('DELETE FROM schedules WHERE id = ?').run(id).changes > 0;
    },

    addRun({ scheduleId, scheduleName, at, kind, status, message = null }) {
      db.prepare(
        'INSERT INTO schedule_runs (schedule_id, schedule_name, at, kind, status, message) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(scheduleId, scheduleName || null, at, kind, status, message);
      db.prepare(
        'DELETE FROM schedule_runs WHERE id NOT IN (SELECT id FROM schedule_runs ORDER BY at DESC, id DESC LIMIT ?)'
      ).run(MAX_RUNS);
    },

    listRuns(limit = 100) {
      return db
        .prepare(
          'SELECT schedule_id AS scheduleId, schedule_name AS scheduleName, at, kind, status, message FROM schedule_runs ORDER BY at DESC, id DESC LIMIT ?'
        )
        .all(Math.max(1, Math.min(MAX_RUNS, Number(limit) || 100)));
    },

    getInstanceState(instanceKey) {
      return db.prepare('SELECT state FROM schedule_instances WHERE instance_key = ?').get(instanceKey)?.state || null;
    },

    setInstanceState(instanceKey, state, at = Date.now()) {
      db.prepare(
        'INSERT INTO schedule_instances (instance_key, state, at) VALUES (?, ?, ?) ON CONFLICT(instance_key) DO UPDATE SET state = excluded.state, at = excluded.at'
      ).run(instanceKey, state, at);
    },

    pruneInstances(now = Date.now()) {
      db.prepare('DELETE FROM schedule_instances WHERE at < ?').run(now - INSTANCE_TTL_MS);
    },

    getState(key, fallback = null) {
      const row = db.prepare('SELECT value FROM scheduler_state WHERE key = ?').get(key);
      if (!row) return fallback;
      try {
        return JSON.parse(row.value);
      } catch {
        return fallback;
      }
    },

    setState(key, value) {
      db.prepare(
        'INSERT INTO scheduler_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, JSON.stringify(value));
    },
  };

  return store;
}
