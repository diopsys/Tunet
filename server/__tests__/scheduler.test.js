// @vitest-environment node

import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { buildServiceCalls, rampLevel } from '../scheduler/actions.js';
import { createSchedulerEngine } from '../scheduler/engine.js';
import { activeInstance, eventsBetween, jitterMinutes, nextEvents, sunTimes } from '../scheduler/scheduleTime.js';
import { createScheduleStore } from '../scheduler/store.js';
import { sanitizeSchedule } from '../scheduler/validate.js';

const ctx = { lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' };
const berlin = (iso) => Date.parse(iso);
const local = (ms) => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const schedule = (extra = {}) => ({
  id: 'flur',
  name: 'Flur',
  enabled: true,
  mode: 'window',
  targets: { entities: ['light.flur'], areas: [] },
  slots: [{ id: 's1', start: { type: 'sunset', offset: -15 }, end: { type: 'time', time: '23:00' } }],
  weekdays: ALL_DAYS,
  action: { on: {}, off: {}, rampOnMinutes: 0, rampOffMinutes: 0 },
  conditions: {},
  ...extra,
});

describe('scheduleTime', () => {
  it('computes sunrise and sunset within a few minutes', () => {
    const { sunrise, sunset } = sunTimes(2026, 11, 12, ctx.lat, ctx.lon);
    expect(local(sunrise)).toMatch(/12\.11\.2026, 07:2[0-5]/);
    expect(local(sunset)).toMatch(/12\.11\.2026, 16:1[5-9]/);
  });

  it('lists window start and end events in Home Assistant time', () => {
    const events = nextEvents(schedule(), berlin('2026-11-12T11:00:00Z'), ctx, {}, { limit: 2 });
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    expect(local(events[0].at)).toMatch(/12\.11\.2026, 16:0\d/);
    expect(local(events[1].at)).toBe('12.11.2026, 23:00:00');
  });

  it('lets a window run past midnight and respects weekdays', () => {
    const s = schedule({ weekdays: [4], slots: [{ id: 'a', start: { type: 'time', time: '22:00' }, end: { type: 'time', time: '01:30' } }] });
    const events = nextEvents(s, berlin('2026-11-09T00:00:00Z'), ctx, {}, { limit: 2 });
    expect(events.map((e) => local(e.at))).toEqual(['13.11.2026, 22:00:00', '14.11.2026, 01:30:00']);
    expect(activeInstance(s, berlin('2026-11-14T00:00:00Z'), ctx)).toBeTruthy();
  });

  it('switches off after a duration counted from the actual start', () => {
    const s = schedule({ slots: [{ id: 'd', start: { type: 'sunset', offset: 0 }, end: { type: 'duration', minutes: 150 } }] });
    const [on, off] = nextEvents(s, berlin('2026-11-12T11:00:00Z'), ctx, {}, { limit: 2 });
    expect(off.at - on.at).toBe(150 * 60_000);
    expect(sanitizeSchedule({ ...s, slots: [{ start: { type: 'time', time: '06:00' }, end: { type: 'duration', minutes: 45 } }] }).value.slots[0].end).toEqual({ type: 'duration', minutes: 45 });
  });

  it('shifts simulated schedules by a stable random offset in vacation mode', () => {
    const s = schedule({ simulate: true });
    const from = berlin('2026-11-12T11:00:00Z');
    const a = nextEvents(s, from, ctx, { vacation: true }, { limit: 1 })[0].at;
    const b = nextEvents(s, from, ctx, { vacation: true }, { limit: 1 })[0].at;
    const plain = nextEvents(s, from, ctx, {}, { limit: 1 })[0].at;
    expect(a).toBe(b);
    expect(Math.abs(a - plain)).toBeLessThanOrEqual(15 * 60_000);
    expect(Math.abs(jitterMinutes('x'))).toBeLessThanOrEqual(15);
  });
});

describe('validate', () => {
  it('cleans up a schedule and rejects incomplete ones', () => {
    const { value } = sanitizeSchedule({
      name: '  Flur  ',
      targets: { entities: ['light.flur', 'kaputt', 'light.flur'] },
      slots: [{ start: { type: 'time', time: '7:05' }, end: { type: 'sunset', offset: 999 } }],
      weekdays: [0, 9, 0],
      action: { on: { brightness: 300 } },
    });
    expect(value.name).toBe('Flur');
    expect(value.targets.entities).toEqual(['light.flur']);
    expect(value.slots[0]).toEqual({ id: 's1', start: { type: 'time', time: '07:05' }, end: { type: 'sunset', offset: 360 } });
    expect(value.weekdays).toEqual([0]);
    expect(value.action.on.brightness).toBe(100);
    expect(sanitizeSchedule({ targets: { entities: [] } }).error).toBeTruthy();
  });
});

describe('actions', () => {
  it('maps phases to services per domain', () => {
    const action = { on: { brightness: 40, position: 30 }, off: { temperature: 17 } };
    const calls = buildServiceCalls(['light.a', 'light.b', 'cover.c', 'climate.d', 'switch.e', 'scene.f'], 'start', action);
    expect(calls).toContainEqual({ domain: 'light', service: 'turn_on', data: { brightness_pct: 40, entity_id: ['light.a', 'light.b'] } });
    expect(calls).toContainEqual({ domain: 'cover', service: 'set_cover_position', data: { position: 30, entity_id: ['cover.c'] } });
    expect(calls).toContainEqual({ domain: 'homeassistant', service: 'turn_on', data: { entity_id: ['switch.e'] } });
    const end = buildServiceCalls(['climate.d', 'scene.f', 'cover.c'], 'end', action);
    expect(end).toEqual([
      { domain: 'climate', service: 'set_temperature', data: { temperature: 17, entity_id: ['climate.d'] } },
      { domain: 'cover', service: 'close_cover', data: { entity_id: ['cover.c'] } },
    ]);
    expect(rampLevel(80, 0)).toBe(1);
    expect(rampLevel(80, 0.5)).toBe(41);
    expect(rampLevel(80, 1)).toBe(80);
  });
});

const setup = ({ schedules = [schedule()], states = [], start }) => {
  const store = createScheduleStore(new Database(':memory:'));
  schedules.forEach((s) => store.create(s));
  const saved = store.list();
  let clock = start;
  const ha = {
    getConfig: vi.fn(async () => ({ latitude: ctx.lat, longitude: ctx.lon, time_zone: ctx.tz })),
    getStates: vi.fn(async () => states),
    callService: vi.fn(async () => []),
    areaEntities: vi.fn(async () => ['light.wz1', 'light.wz2']),
  };
  const engine = createSchedulerEngine({ store, ha, now: () => clock, logger: { warn: () => {} } });
  return { store, ha, engine, saved, advance: (ms) => (clock += ms), set: (ms) => (clock = ms) };
};

describe('engine', () => {
  it('switches at the window edges and logs it', async () => {
    const t = setup({ start: berlin('2026-11-12T21:59:50Z') });
    t.store.setState('lastTick', berlin('2026-11-12T21:59:40Z'));
    t.store.setInstanceState(`${t.saved[0].id}|s1|2026-11-12`, 'started', berlin('2026-11-12T15:00:00Z'));
    await t.engine.tick();
    expect(t.ha.callService).not.toHaveBeenCalled();
    t.advance(15_000);
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: ['light.flur'] });
    expect(t.store.listRuns()[0]).toMatchObject({ kind: 'Ende', status: 'ok' });
  });

  it('switches on once when a schedule is created in the middle of its window', async () => {
    const t = setup({ start: berlin('2026-11-12T18:00:00Z') });
    t.store.setState('lastTick', berlin('2026-11-12T17:59:45Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledTimes(1);
    expect(t.ha.callService).toHaveBeenCalledWith('light', 'turn_on', { entity_id: ['light.flur'] });
    expect(t.store.listRuns()[0]).toMatchObject({ kind: 'Beginn', status: 'ok' });
    expect(t.store.listRuns()[0].message).toMatch(/nachgeholt/);
    // von Hand ausgeschaltet: nicht erneut einschalten, Ende läuft normal
    t.advance(15_000);
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledTimes(1);
    t.set(berlin('2026-11-12T22:00:05Z'));
    t.store.setState('lastTick', berlin('2026-11-12T21:59:50Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenLastCalledWith('light', 'turn_off', { entity_id: ['light.flur'] });
  });

  it('catches up only the latest missed edge per window after downtime', async () => {
    const t = setup({ start: berlin('2026-11-12T22:30:00Z') });
    t.store.setState('lastTick', berlin('2026-11-12T14:00:00Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledTimes(1);
    expect(t.ha.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: ['light.flur'] });
    expect(t.store.listRuns()[0].message).toMatch(/nachgeholt/);
  });

  it('skips a start when a condition fails, and then also its end', async () => {
    const s = schedule({ conditions: { presence: 'home' }, slots: [{ id: 's1', start: { type: 'time', time: '18:00' }, end: { type: 'time', time: '18:01' } }] });
    const t = setup({ schedules: [s], states: [{ entity_id: 'person.jakob', state: 'not_home' }], start: berlin('2026-11-12T17:00:05Z') });
    t.store.setState('lastTick', berlin('2026-11-12T16:59:55Z'));
    await t.engine.tick();
    t.set(berlin('2026-11-12T17:01:05Z'));
    t.store.setState('lastTick', berlin('2026-11-12T17:00:55Z'));
    await t.engine.tick();
    expect(t.ha.callService).not.toHaveBeenCalled();
    expect(t.store.listRuns().map((r) => r.status)).toEqual(['skipped', 'skipped']);
  });

  it('honours "skip once" and resolves areas', async () => {
    const s = schedule({ targets: { entities: [], areas: [{ id: 'wohnzimmer', domain: 'light' }] }, slots: [{ id: 's1', start: { type: 'time', time: '18:00' }, end: { type: 'time', time: '19:00' } }] });
    const t = setup({ schedules: [s], start: berlin('2026-11-12T17:00:05Z') });
    const id = t.saved[0].id;
    t.store.patch(id, { skipInstance: `${id}|s1|2026-11-12` });
    t.store.setState('lastTick', berlin('2026-11-12T16:59:55Z'));
    await t.engine.tick();
    expect(t.ha.callService).not.toHaveBeenCalled();
    expect(t.store.get(id).skipInstance).toBeNull();
    t.set(berlin('2026-11-13T17:00:05Z'));
    t.store.setState('lastTick', berlin('2026-11-13T16:59:55Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledWith('light', 'turn_on', { entity_id: ['light.wz1', 'light.wz2'] });
  });

  it('ramps brightness up and stops for a lamp switched off by hand', async () => {
    const s = schedule({
      slots: [{ id: 's1', start: { type: 'time', time: '06:00' }, end: { type: 'time', time: '08:00' } }],
      action: { on: { brightness: 100 }, off: {}, rampOnMinutes: 10, rampOffMinutes: 0 },
    });
    const states = [{ entity_id: 'light.flur', state: 'on' }];
    const t = setup({ schedules: [s], states, start: berlin('2026-11-12T05:00:05Z') });
    t.store.setState('lastTick', berlin('2026-11-12T04:59:55Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenLastCalledWith('light', 'turn_on', expect.objectContaining({ brightness_pct: expect.any(Number) }));
    t.advance(5 * 60_000);
    await t.engine.tick();
    const mid = t.ha.callService.mock.calls.at(-1)[2].brightness_pct;
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(60);
    states[0].state = 'off';
    const count = t.ha.callService.mock.calls.length;
    t.advance(60_000);
    await t.engine.tick();
    expect(t.ha.callService.mock.calls.length).toBe(count);
  });

  it('only acts on future edges for single switch points', async () => {
    const s = schedule({ mode: 'off', slots: [{ id: 's1', start: { type: 'time', time: '23:00' } }] });
    expect(eventsBetween(s, berlin('2026-11-12T21:00:00Z'), berlin('2026-11-12T23:00:00Z'), ctx).map((e) => e.kind)).toEqual(['start']);
    const t = setup({ schedules: [s], start: berlin('2026-11-12T22:00:05Z') });
    t.store.setState('lastTick', berlin('2026-11-12T21:59:55Z'));
    await t.engine.tick();
    expect(t.ha.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: ['light.flur'] });
  });
});

describe('schedules API', () => {
  it('creates, skips, lists and deletes schedules', async () => {
    const { default: express } = await import('express');
    const { createSchedulesRouter } = await import('../routes/schedules.js');
    const store = createScheduleStore(new Database(':memory:'));
    const app = express();
    app.use(express.json());
    app.use('/api/schedules', createSchedulesRouter({ store, engineInfo: { reason: 'dev' } }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}/api/schedules`;
    const send = (path, method = 'GET', body) =>
      fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    try {
      expect((await send('', 'POST', { name: 'leer' })).status).toBe(400);
      const created = await (await send('', 'POST', schedule())).json();
      const id = created.schedule.id;
      expect(created.schedule.name).toBe('Flur');
      expect((await send(`/${id}/skip`, 'POST', { mode: 'instance', instanceKey: 'fremd|s1|2026-11-12' })).status).toBe(400);
      const skipped = await (await send(`/${id}/skip`, 'POST', { mode: 'day', day: '2026-11-12' })).json();
      expect(skipped.schedule.skipDay).toBe('2026-11-12');
      await send('/settings', 'PUT', { vacation: true });
      const list = await (await send('')).json();
      expect(list).toMatchObject({ settings: { vacation: true }, engine: { active: false, reason: 'dev' } });
      expect(list.schedules).toHaveLength(1);
      expect((await send(`/${id}/run`, 'POST', { kind: 'start' })).status).toBe(409);
      expect((await send(`/${id}`, 'DELETE')).status).toBe(200);
      expect((await (await send('')).json()).schedules).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
