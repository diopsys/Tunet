import { describe, expect, it } from 'vitest';
import { parseScheduleText } from '../utils/scheduleText';
import {
  entityIdsForCard,
  findConflicts,
  fromHacsSchedule,
  hacsImportItems,
  nextSwitchByEntity,
} from '../utils/scheduleModel';

const entities = {
  'light.eg_flur': { attributes: { friendly_name: 'Flur' } },
  'light.og_flur': { attributes: { friendly_name: 'Flur OG' } },
  'light.schlafzimmer': { attributes: { friendly_name: 'Schlafzimmer' } },
  'cover.wohnzimmer': { attributes: { friendly_name: 'Rollladen Wohnzimmer' } },
  'switch.kaffee': { attributes: { friendly_name: 'Kaffeemaschine' } },
  'light.terrasse': { attributes: { friendly_name: 'Terrasse' } },
  'calendar.feiertage': { attributes: { friendly_name: 'Feiertage' } },
  'sensor.temperatur': { attributes: { friendly_name: 'Flur Temperatur' } },
};
const areas = [{ area_id: 'wohnzimmer', name: 'Wohnzimmer' }];

describe('parseScheduleText', () => {
  it('reads device, weekdays, sun start and clock end', () => {
    const { draft, missing } = parseScheduleText('Flur Mo–Fr ab Sonnenuntergang bis 23 Uhr', { entities, areas });
    expect(missing).toEqual([]);
    expect(draft.targets.entities).toEqual(['light.eg_flur']);
    expect(draft.weekdays).toEqual([0, 1, 2, 3, 4]);
    expect(draft.mode).toBe('window');
    expect(draft.slots[0].start).toEqual({ type: 'sunset', offset: 0 });
    expect(draft.slots[0].end).toEqual({ type: 'time', time: '23:00' });
  });

  it('prefers the longest name and understands offsets before the sun', () => {
    const { draft } = parseScheduleText('Flur OG täglich 15 min vor Sonnenuntergang an bis 23:30', { entities, areas });
    expect(draft.targets.entities).toEqual(['light.og_flur']);
    expect(draft.slots[0].start).toEqual({ type: 'sunset', offset: -15 });
    expect(draft.slots[0].end).toEqual({ type: 'time', time: '23:30' });
  });

  it('creates single switch points with an off verb', () => {
    const { draft } = parseScheduleText('Terrasse werktags um 9 Uhr aus, nicht an Feiertagen', { entities, areas });
    expect(draft.targets.entities).toEqual(['light.terrasse']);
    expect(draft.mode).toBe('off');
    expect(draft.slots[0]).toMatchObject({ start: { type: 'time', time: '09:00' }, end: null });
    expect(draft.conditions.skipEntity).toBe('calendar.feiertage');
  });

  it('builds a wake-up light with brightness and a room target', () => {
    const { draft } = parseScheduleText('Schlafzimmer Mo, Mi, Fr 6:30 bis 8 Uhr 80% Wecker', { entities, areas });
    expect(draft.weekdays).toEqual([0, 2, 4]);
    expect(draft.action.on.brightness).toBe(80);
    expect(draft.action.rampOnMinutes).toBe(20);
    const room = parseScheduleText('Licht im Wohnzimmer abends ab Sonnenuntergang +30 min bis Mitternacht nur wenn jemand zu Hause', { entities, areas }).draft;
    expect(room.targets.areas).toEqual([{ id: 'wohnzimmer', name: 'Wohnzimmer', domain: 'light' }]);
    expect(room.slots[0].start).toEqual({ type: 'sunset', offset: 30 });
    expect(room.slots[0].end).toEqual({ type: 'time', time: '00:00' });
    expect(room.conditions.presence).toBe('home');
  });

  it('matches names without the floor prefix, taking equally good matches together', () => {
    const real = {
      'light.eg_flur': { attributes: { friendly_name: 'EG Flur' } },
      'light.og_flur': { attributes: { friendly_name: 'OG Flur' } },
      'light.kuche': { attributes: { friendly_name: 'Küche' } },
    };
    expect(parseScheduleText('Flur ab 18 Uhr bis 22 Uhr', { entities: real }).draft.targets.entities).toEqual(['light.eg_flur', 'light.og_flur']);
    expect(parseScheduleText('EG Flur und Küche um 6:30 an', { entities: real }).draft.targets.entities).toEqual(['light.eg_flur', 'light.kuche']);
  });

  it('picks one entity per name, preferring lights', () => {
    const dup = {
      'switch.eg_flur': { attributes: { friendly_name: 'EG Flur' } },
      'light.eg_flur': { attributes: { friendly_name: 'EG Flur' } },
    };
    expect(parseScheduleText('EG Flur um 18 Uhr an', { entities: dup }).draft.targets.entities).toEqual(['light.eg_flur']);
  });

  it('offers only lights for now and understands a duration', () => {
    expect(parseScheduleText('Kaffeemaschine um 6 Uhr an', { entities, areas }).missing).toContain('target');
    const { draft } = parseScheduleText('Terrasse täglich ab Sonnenuntergang für 2,5 Stunden', { entities, areas });
    expect(draft.slots[0]).toMatchObject({ start: { type: 'sunset', offset: 0 }, end: { type: 'duration', minutes: 150 } });
    expect(parseScheduleText('Schlafzimmer 6:30 bis 8 Uhr 10 min lang aufdimmen', { entities, areas }).draft.slots[0].end).toEqual({ type: 'time', time: '08:00' });
  });

  it('reports what is missing', () => {
    expect(parseScheduleText('irgendwann mal', { entities, areas }).missing).toEqual(['target', 'time']);
  });
});

describe('scheduleModel', () => {
  const ctx = { lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' };
  const base = (id, entity, start, end) => ({
    id,
    enabled: true,
    mode: 'window',
    targets: { entities: [entity], areas: [] },
    slots: [{ id: 's', start: { type: 'time', time: start }, end: { type: 'time', time: end } }],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });

  it('finds schedulable entities on a card', () => {
    expect(entityIdsForCard('light.eg_flur', {})).toEqual(['light.eg_flur']);
    expect(
      entityIdsForCard('light_panel_card_1', { panelTabs: [{ entities: [{ entityId: 'light.a' }, { entityId: 'sensor.x' }] }] })
    ).toEqual(['light.a']);
  });

  it('detects overlapping windows on the same entity', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const conflicts = findConflicts([base('a', 'light.x', '18:00', '22:00'), base('b', 'light.x', '21:00', '23:00'), base('c', 'light.x', '06:00', '07:00')], now, ctx);
    expect(conflicts.map((c) => `${c.a.id}${c.b.id}`)).toEqual(['ab']);
  });

  it('knows the next switch per entity', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const map = nextSwitchByEntity([base('a', 'light.x', '18:00', '22:00')], now, ctx);
    expect(new Date(map.get('light.x').at).toISOString()).toBe('2026-11-12T17:00:00.000Z');
  });

  it('imports HACS scheduler entities', () => {
    const draft = fromHacsSchedule('switch.schedule_0cc89b', {
      state: 'on',
      attributes: {
        weekdays: ['daily'],
        timeslots: ['sunset+02:00:00'],
        entities: ['light.wled_anpentaplus'],
        actions: [{ service: 'light.turn_off' }],
        friendly_name: 'Scheduler Carport Aus',
      },
    });
    expect(draft).toMatchObject({ name: 'Carport Aus', mode: 'off', weekdays: [0, 1, 2, 3, 4, 5, 6], source: 'switch.schedule_0cc89b' });
    expect(draft.slots[0].start).toEqual({ type: 'sunset', offset: 120 });
    const range = fromHacsSchedule('switch.schedule_x', {
      state: 'off',
      attributes: { weekdays: ['mon', 'fri'], timeslots: ['06:30:00 - 08:00:00'], entities: ['light.a'], actions: [{ service: 'light.turn_on', service_data: { brightness_pct: 40 } }] },
    });
    expect(range).toMatchObject({ mode: 'window', weekdays: [0, 4], enabled: false, action: { on: { brightness: 40 } } });
    expect(range.slots[0]).toMatchObject({ start: { type: 'time', time: '06:30' }, end: { type: 'time', time: '08:00' } });
  });

  it('merges a HACS on/off pair into one window', () => {
    const hacs = (slot, service, name) => ({
      state: 'on',
      attributes: { weekdays: ['daily'], timeslots: [slot], entities: ['light.carport'], actions: [{ service }], friendly_name: name },
    });
    const items = hacsImportItems([
      ['switch.schedule_on', hacs('sunset+00:00:00', 'light.turn_on', 'Scheduler Carport Ein')],
      ['switch.schedule_off', hacs('sunset+02:00:00', 'light.turn_off', 'Scheduler Carport Aus')],
      ['switch.schedule_other', hacs('07:00:00', 'light.turn_off', 'Scheduler Hof Aus')],
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceIds: ['switch.schedule_on', 'switch.schedule_off'],
      draft: { name: 'Carport', mode: 'window', source: 'switch.schedule_on,switch.schedule_off' },
    });
    expect(items[0].draft.slots[0]).toMatchObject({ start: { type: 'sunset', offset: 0 }, end: { type: 'sunset', offset: 120 } });
    expect(items[1].sourceIds).toEqual(['switch.schedule_other']);
  });
});
