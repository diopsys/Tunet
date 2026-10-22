import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusGroupPillModal from '../modals/StatusGroupPillModal';
import {
  getHeatingDetails,
  resolveStatusGroupListItems,
  resolveStatusGroupPill,
} from '../utils/statusGroupPills';

const pill = {
  id: 'pill_heizung',
  type: 'group_status',
  groupPreset: 'heating_on',
  groupSelectionMode: 'all',
  valveEntitySuffix: '_ventilzustand',
  label: 'Heizungen an',
};

const entities = {
  'climate.bad': { state: 'heat', attributes: { friendly_name: 'Bad', hvac_action: 'idle', temperature: 17, current_temperature: 18 } },
  'climate.kind': { state: 'heat', attributes: { friendly_name: 'Kind', hvac_action: 'heating', temperature: 18, current_temperature: 17.4 } },
  'climate.weg': { state: 'unavailable', attributes: { friendly_name: 'Weg', hvac_action: 'heating' } },
  'sensor.bad_ventilzustand': { state: '0' },
  'sensor.kind_ventilzustand': { state: '35' },
  'light.x': { state: 'on', attributes: {} },
};

describe('Heizungen an', () => {
  it('counts heating thermostats for the pill badge', () => {
    const data = resolveStatusGroupPill(pill, entities);
    expect(data.count).toBe(1);
    expect(data.syntheticEntity.attributes.friendly_name).toBe('Heizungen an');
  });

  it('lists all thermostats, heating first', () => {
    const items = resolveStatusGroupListItems(pill, entities);
    expect(items.map((i) => [i.id, i.active])).toEqual([
      ['climate.kind', true],
      ['climate.bad', false],
      ['climate.weg', false],
    ]);
  });

  it('reads target, current and valve from attribute or companion sensor', () => {
    expect(getHeatingDetails('climate.kind', entities['climate.kind'], entities, pill)).toEqual({ target: 18, current: 17.4, valve: 35 });
    const mitAttribut = { attributes: { valve_position: 60, temperature: 20 } };
    expect(getHeatingDetails('climate.x', mitAttribut, {}, {}).valve).toBe(60);
    expect(getHeatingDetails('climate.bad', entities['climate.bad'], entities, {}).valve).toBeNull();
  });

  it('keeps the old behaviour for other presets', () => {
    const lichter = { groupPreset: 'lights_on', groupSelectionMode: 'all' };
    expect(resolveStatusGroupListItems(lichter, entities).map((i) => i.id)).toEqual(['light.x']);
  });

  it('shows target, current and valve in the dialog', () => {
    render(<StatusGroupPillModal show onClose={() => {}} modalState={{ pill }} entities={entities} t={(k) => k} />);
    expect(screen.getByText('Kind')).toBeTruthy();
    expect(screen.getByText(/Target 18,0 °C/)).toBeTruthy();
    expect(screen.getByText('Valve 35 %')).toBeTruthy();
    expect(screen.getByText('Valve 0 %')).toBeTruthy();
  });
});
