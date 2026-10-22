import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GenericPvCard, { PV_ENTITY_IDS, readPv, resolvePvIds } from '../components/cards/GenericPvCard';

describe('PV-Belegung', () => {
  it('keeps the defaults and overrides single keys', () => {
    const ids = resolvePvIds({ pvEntities: { pvW: 'sensor.wr_pv', heatPumpW: null } });
    expect(ids.pvW).toBe('sensor.wr_pv');
    expect(ids.heatPumpW).toBeNull();
    expect(ids.batterySoc).toBe(PV_ENTITY_IDS.batterySoc);
    expect(resolvePvIds(undefined)).toEqual(PV_ENTITY_IDS);
  });

  it('converts values to W and kWh by unit', () => {
    const entities = {
      'sensor.a': { state: '28830', attributes: { unit_of_measurement: 'Wh' } },
      'sensor.b': { state: '1.5', attributes: { unit_of_measurement: 'kW' } },
      'sensor.c': { state: '43.87', attributes: { unit_of_measurement: 'kWh' } },
      'sensor.d': { state: '29.5', attributes: { unit_of_measurement: '%' } },
      'sensor.e': { state: 'unavailable', attributes: {} },
    };
    expect(readPv(entities, 'sensor.a')).toBeCloseTo(28.83);
    expect(readPv(entities, 'sensor.b')).toBe(1500);
    expect(readPv(entities, 'sensor.c')).toBe(43.87);
    expect(readPv(entities, 'sensor.d')).toBe(29.5);
    expect(readPv(entities, 'sensor.e')).toBeNull();
    expect(readPv(entities, null)).toBeNull();
  });

  it('renders the card with an own mapping', () => {
    const settings = {
      pvEntities: {
        pvW: 'sensor.wr_pv',
        pvDaily: 'sensor.wr_tag',
        batterySoc: 'sensor.akku_soc',
        gridImportW: 'sensor.bezug',
        gridExportW: 'sensor.einspeisung',
      },
    };
    const entities = {
      'sensor.wr_pv': { state: '2.4', attributes: { unit_of_measurement: 'kW' } },
      'sensor.wr_tag': { state: '12300', attributes: { unit_of_measurement: 'Wh' } },
      'sensor.akku_soc': { state: '64', attributes: { unit_of_measurement: '%' } },
      'sensor.bezug': { state: '0', attributes: { unit_of_measurement: 'W' } },
      'sensor.einspeisung': { state: '800', attributes: { unit_of_measurement: 'W' } },
    };
    render(<GenericPvCard cardId="pv_card_1" entities={entities} settings={settings} />);
    expect(screen.getAllByText(/2400/).length).toBeGreaterThan(0);
  });
});
