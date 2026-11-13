import { describe, expect, it } from 'vitest';
import { scheduledLightsOn } from '../utils/scheduleModel';
import { resolveStatusGroupPill } from '../utils/statusGroupPills';

const ctx = { lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' };
const ALL = [0, 1, 2, 3, 4, 5, 6];
const sched = (id, entities, start, end, extra = {}) => ({
  id,
  name: id,
  enabled: true,
  mode: 'window',
  targets: { entities, areas: [] },
  slots: [{ id: 's1', start: { type: 'time', time: start }, end: { type: 'time', time: end } }],
  weekdays: ALL,
  action: { on: {}, off: {} },
  conditions: {},
  ...extra,
});
const entities = {
  'light.carport': { entity_id: 'light.carport', state: 'on', attributes: { friendly_name: 'Carport' } },
  'light.flur': { entity_id: 'light.flur', state: 'on', attributes: { friendly_name: 'Flur' } },
  'light.kueche': { entity_id: 'light.kueche', state: 'off', attributes: { friendly_name: 'Küche' } },
};
const at = Date.parse('2026-11-13T17:00:00Z'); // 18:00 Berlin

describe('scheduledLightsOn', () => {
  it('lists lights that are on inside a running window', () => {
    const list = scheduledLightsOn(
      [sched('a', ['light.carport', 'light.kueche'], '17:00', '19:00'), sched('b', ['light.flur'], '20:00', '22:00')],
      entities,
      at,
      ctx
    );
    expect(list.map((it) => it.id)).toEqual(['light.carport']);
    expect(list[0].schedule.id).toBe('a');
  });

  it('ignores disabled and skipped schedules', () => {
    const list = scheduledLightsOn(
      [
        sched('a', ['light.carport'], '17:00', '19:00', { enabled: false }),
        sched('b', ['light.flur'], '17:00', '19:00', { skipDay: '2026-11-13' }),
      ],
      entities,
      at,
      ctx
    );
    expect(list).toEqual([]);
  });
});

describe('lights_on group with excluded scheduled lights', () => {
  it('does not count excluded entities', () => {
    const pill = { type: 'group_status', groupPreset: 'lights_on', groupSelectionMode: 'all' };
    expect(resolveStatusGroupPill(pill, entities, (k) => k).count).toBe(2);
    expect(resolveStatusGroupPill({ ...pill, excludeEntityIds: ['light.carport'] }, entities, (k) => k).count).toBe(1);
  });
});
