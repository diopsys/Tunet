// Ausführung der Zeitschaltuhr im Tunet-Server.
//
// Geschaltet wird an den Fensterrändern (Beginn/Ende), nicht dauerhaft auf einen Zustand gedrückt:
// Wer zwischendurch von Hand schaltet, wird bis zum nächsten Schaltpunkt nicht überstimmt.
// War der Server aus (Update, Neustart), werden verpasste Schaltpunkte der letzten Stunden nachgeholt,
// je Fenster nur der letzte, damit am Ende der Soll-Zustand stimmt. Ein offenes Fenster, dessen Beginn nie
// verarbeitet wurde (Zeitplan erst mitten im Fenster angelegt oder eingeschaltet), wird ebenfalls nachgeholt.

import { buildServiceCalls, phaseForEvent, rampLevel } from './actions.js';
import { activeInstance, eventsBetween, instancesAround } from './scheduleTime.js';

const DAY_MS = 86_400_000;
const CONTEXT_TTL_MS = 3_600_000;
const AREA_TTL_MS = 600_000;
const DEFAULT_LUX_BELOW = 50;

export const DEFAULT_TICK_MS = 15_000;
export const CATCH_UP_MS = 6 * 3_600_000;

export function createSchedulerEngine({
  store,
  ha,
  now = () => Date.now(),
  tickMs = DEFAULT_TICK_MS,
  catchUpMs = CATCH_UP_MS,
  logger = console,
}) {
  let ctx = null;
  let ctxAt = 0;
  let timer = null;
  let running = false;
  let lastError = null;
  const areaCache = new Map();
  const rampSent = new Map();
  const rampAborted = new Set();

  async function context() {
    if (ctx && now() - ctxAt < CONTEXT_TTL_MS) return ctx;
    const cfg = await ha.getConfig();
    ctx = { lat: Number(cfg.latitude), lon: Number(cfg.longitude), tz: cfg.time_zone || 'UTC' };
    ctxAt = now();
    return ctx;
  }

  async function resolveTargets(schedule) {
    const ids = new Set(schedule.targets?.entities || []);
    for (const area of schedule.targets?.areas || []) {
      const key = `${area.id}|${area.domain}`;
      const cached = areaCache.get(key);
      let list = cached && now() - cached.at < AREA_TTL_MS ? cached.ids : null;
      if (!list) {
        try {
          list = await ha.areaEntities(area.id, area.domain);
          areaCache.set(key, { ids: list, at: now() });
        } catch (error) {
          list = cached?.ids || [];
          logger.warn?.(`[scheduler] Bereich ${area.id} nicht auflösbar: ${error.message}`);
        }
      }
      list.forEach((id) => ids.add(id));
    }
    return [...ids];
  }

  /** null = Bedingungen erfüllt, sonst der Grund fürs Aussetzen. */
  function failedCondition(schedule, states, vacation) {
    const c = schedule.conditions || {};
    const state = (id) => states.get(id)?.state;
    if (c.presence && !(vacation && schedule.simulate)) {
      const someoneHome = [...states.keys()].some((id) => id.startsWith('person.') && state(id) === 'home');
      if (c.presence === 'home' && !someoneHome) return 'niemand zu Hause';
      if (c.presence === 'away' && someoneHome) return 'jemand zu Hause';
    }
    if (c.darkOnly) {
      if (c.luxEntity) {
        const lux = Number(state(c.luxEntity));
        // 0 lx stammt aus einem leeren Feld (frühere Bereinigung machte null zu 0): Standard nehmen
        const limit = c.luxBelow > 0 ? c.luxBelow : DEFAULT_LUX_BELOW;
        if (Number.isFinite(lux) && lux >= limit) return `zu hell (${lux} lx)`;
      } else if (state('sun.sun') === 'above_horizon') {
        return 'Sonne über dem Horizont';
      }
    }
    if (c.skipEntity && state(c.skipEntity) === 'on') return `${c.skipEntity} ist an`;
    if (c.onlyEntity && state(c.onlyEntity) !== 'on') return `${c.onlyEntity} ist nicht an`;
    return null;
  }

  async function callAll(calls) {
    for (const call of calls) await ha.callService(call.domain, call.service, call.data);
  }

  const displayName = (s) => s.name || s.targets?.areas?.[0]?.name || s.targets?.entities?.[0] || 'Zeitplan';
  const log = (schedule, kind, status, message, at = now()) =>
    store.addRun({ scheduleId: schedule.id, scheduleName: displayName(schedule), at, kind, status, message });

  async function handleEvent(schedule, event, env) {
    const kindLabel = event.kind === 'start' ? 'Beginn' : 'Ende';
    const prefix = env.catchUp ? 'nachgeholt · ' : '';

    if (event.kind === 'start') {
      let reason = null;
      if (schedule.skipDay && schedule.skipDay === event.day) reason = 'heute ausgesetzt';
      else if (schedule.skipInstance && schedule.skipInstance === event.instanceKey) {
        reason = 'einmal ausgesetzt';
        store.patch(schedule.id, { skipInstance: null });
      } else reason = failedCondition(schedule, await env.states(), env.vacation);
      if (reason) {
        store.setInstanceState(event.instanceKey, 'skipped', now());
        log(schedule, kindLabel, 'skipped', prefix + reason);
        return;
      }
      store.setInstanceState(event.instanceKey, 'started', now());
    } else if (store.getInstanceState(event.instanceKey) === 'skipped') {
      log(schedule, kindLabel, 'skipped', `${prefix}Beginn war ausgesetzt`);
      return;
    }

    const phase = phaseForEvent(schedule, event.kind);
    const targets = await resolveTargets(schedule);
    const rampOn = phase === 'start' && schedule.action?.rampOnMinutes > 0 && !env.catchUp;
    try {
      await callAll(buildServiceCalls(targets, phase, schedule.action, rampOn ? { level: 1 } : {}));
      log(schedule, kindLabel, 'ok', `${prefix}${targets.length} ${targets.length === 1 ? 'Gerät' : 'Geräte'}`);
    } catch (error) {
      log(schedule, kindLabel, 'error', prefix + error.message);
    }
  }

  async function runRamps(schedule, at, env) {
    const action = schedule.action || {};
    const up = action.rampOnMinutes * 60_000;
    const down = action.rampOffMinutes * 60_000;
    if (!up && !down) return;
    for (const inst of instancesAround(schedule, at - DAY_MS, at, ctx, { vacation: env.vacation })) {
      let level = null;
      if (up && inst.start <= at && at < inst.start + up) level = rampLevel(action.on?.brightness, (at - inst.start) / up);
      else if (down && inst.end != null && inst.end - down <= at && at < inst.end) {
        level = rampLevel(action.on?.brightness, (inst.end - at) / down);
      }
      if (level == null || store.getInstanceState(inst.instanceKey) !== 'started') continue;

      const states = await env.states();
      const lights = (await resolveTargets(schedule)).filter((id) => id.startsWith('light.'));
      const due = [];
      for (const id of lights) {
        const key = `${inst.instanceKey}|${id}`;
        if (rampAborted.has(key)) continue;
        // Von Hand ausgeschaltet: Verlauf für diese Lampe beenden statt sie wieder einzuschalten
        if (rampSent.has(key) && states.get(id)?.state === 'off') {
          rampAborted.add(key);
          continue;
        }
        if (rampSent.get(key) === level) continue;
        rampSent.set(key, level);
        due.push(id);
      }
      if (!due.length) continue;
      try {
        await callAll(buildServiceCalls(due, 'start', action, { level, transition: Math.round(tickMs / 1000) }));
      } catch (error) {
        log(schedule, 'Verlauf', 'error', error.message);
      }
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const at = now();
      await context();
      const last = Number(store.getState('lastTick')) || at - tickMs;
      const from = Math.max(last, at - catchUpMs);
      const vacation = Boolean(store.getState('vacation', false));
      let statesPromise = null;
      const env = {
        vacation,
        catchUp: at - from > 3 * tickMs,
        states: () => {
          statesPromise ||= ha.getStates().then((list) => new Map(list.map((s) => [s.entity_id, s])));
          return statesPromise;
        },
      };

      for (const schedule of store.list()) {
        if (!schedule.enabled) continue;
        let events = eventsBetween(schedule, from, at, ctx, { vacation });
        if (env.catchUp) {
          const latest = new Map();
          for (const e of events) latest.set(e.slotId, e);
          events = [...latest.values()];
        }
        for (const event of events) await handleEvent(schedule, event, env);
        // Mitten im Fenster angelegt, eingeschaltet oder geändert: Beginn nachholen, damit der Soll-Zustand stimmt
        const open = activeInstance(schedule, at, ctx, { vacation });
        if (open && open.start <= from && !store.getInstanceState(open.instanceKey)) {
          await handleEvent(schedule, { ...open, kind: 'start', at: open.start }, { ...env, catchUp: true });
        }
        await runRamps(schedule, at, env);
      }

      store.setState('lastTick', at);
      if (Math.floor(at / tickMs) % 240 === 0) {
        store.pruneInstances(at);
        rampSent.clear();
        rampAborted.clear();
      }
      lastError = null;
    } catch (error) {
      lastError = error.message;
      logger.warn?.(`[scheduler] ${error.message}`);
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(tick, tickMs);
      tick();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    status: () => ({ active: Boolean(timer), lastTick: store.getState('lastTick'), lastError, context: ctx }),
    /** Zum Ausprobieren: Beginn oder Ende sofort ausführen, ohne Bedingungen. */
    async runNow(schedule, kind) {
      await context();
      const phase = phaseForEvent(schedule, kind);
      const targets = await resolveTargets(schedule);
      await callAll(buildServiceCalls(targets, phase, schedule.action));
      log(schedule, kind === 'start' ? 'Beginn' : 'Ende', 'ok', 'von Hand ausgelöst');
      return targets;
    },
  };
}
