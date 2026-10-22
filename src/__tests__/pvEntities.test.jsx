import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GenericPvCard, {
  PV_ENTITY_IDS,
  fetchPeriodChange,
  readPv,
  resolvePvIds,
  usePvPeriodTotals,
} from '../components/cards/GenericPvCard';

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

describe('Monat/Jahr aus der Statistik', () => {
  const changes = {
    'sensor.mppt1': { month: 324603.2, year: 5982129.9 },
    'sensor.mppt2': { month: 311291.4, year: 5851310.5 },
  };
  const conn = {
    sendMessagePromise: vi.fn(async (msg) => ({ change: changes[msg.statistic_id][msg.calendar.period] })),
  };
  const entities = {
    'sensor.mppt1': { state: '25583516', attributes: { unit_of_measurement: 'Wh' } },
    'sensor.mppt2': { state: '24981849', attributes: { unit_of_measurement: 'Wh' } },
  };

  it('reads the change of a calendar period and converts the unit', async () => {
    await expect(fetchPeriodChange(conn, 'sensor.mppt1', 'month', 'Wh')).resolves.toBeCloseTo(324.6, 1);
    expect(conn.sendMessagePromise).toHaveBeenCalledWith({
      type: 'recorder/statistic_during_period',
      statistic_id: 'sensor.mppt1',
      calendar: { period: 'month' },
      types: ['change'],
    });
  });

  it('sums all total meters for month and year', async () => {
    const { result } = renderHook(() => usePvPeriodTotals(conn, ['sensor.mppt1', 'sensor.mppt2'], entities));
    await waitFor(() => expect(result.current.year).not.toBeNull());
    expect(result.current.month).toBeCloseTo(635.9, 1);
    expect(result.current.year).toBeCloseTo(11833.4, 1);
  });

  it('stays empty without total meters or connection', () => {
    const { result } = renderHook(() => usePvPeriodTotals(null, ['sensor.mppt1'], entities));
    expect(result.current).toEqual({ month: null, year: null });
  });
});
