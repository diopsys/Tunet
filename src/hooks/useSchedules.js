// Zeitpläne der Tunet-Zeitschaltuhr, geteilt zwischen Seite, Editor, Karten-Markierung und Pill.
// Ein gemeinsamer Zwischenspeicher, der regelmäßig und nach jeder Änderung neu geladen wird.

import { useEffect, useSyncExternalStore } from 'react';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  runScheduleNow,
  skipSchedule,
  updateSchedule,
  updateScheduleSettings,
} from '../services/schedulesApi';

const REFRESH_MS = 60_000;

let snapshot = { loaded: false, schedules: [], settings: { vacation: false }, engine: null, error: null };
const listeners = new Set();
let subscribers = 0;
let timer = null;
let inflight = null;

const emit = (next) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((fn) => fn());
};

export function refreshSchedules() {
  inflight ||= fetchSchedules()
    .then((data) =>
      emit({
        loaded: true,
        schedules: Array.isArray(data?.schedules) ? data.schedules : [],
        settings: data?.settings || { vacation: false },
        engine: data?.engine || null,
        error: null,
      })
    )
    .catch((error) => emit({ loaded: true, error: error?.message || String(error) }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const after = (promise) =>
  promise.then(async (result) => {
    await refreshSchedules();
    return result;
  });

export const scheduleActions = {
  save: (schedule) =>
    after(schedule.id ? updateSchedule(schedule.id, schedule) : createSchedule(schedule)).then((r) => r?.schedule),
  remove: (id) => after(deleteSchedule(id)),
  setEnabled: (schedule, enabled) => after(updateSchedule(schedule.id, { ...schedule, enabled })),
  skip: (id, body) => after(skipSchedule(id, body)),
  runNow: (id, kind) => after(runScheduleNow(id, kind)),
  setVacation: (vacation) => after(updateScheduleSettings({ vacation })),
};

/** Zeitpläne lesen; hält sie aktuell, solange mindestens eine Komponente sie nutzt. */
export function useSchedules({ enabled = true } = {}) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  useEffect(() => {
    if (!enabled) return undefined;
    subscribers += 1;
    if (subscribers === 1) {
      refreshSchedules();
      timer = setInterval(refreshSchedules, REFRESH_MS);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [enabled]);
  return state;
}
