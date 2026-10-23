import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GenericPvCard, {
  PV_ENTITY_IDS,
  fetchPeriodChange,
  forecastFromCurve,
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

  it('opens its own page from the icon without opening the popup', () => {
    const onOpen = vi.fn();
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    const spy = vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    render(<GenericPvCard cardId="pv_card_1" entities={{}} settings={{ iconUrl: '/energy-panel' }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Solar öffnen' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/energy-panel');
    spy.mockRestore();
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

describe('Prognose aus der Leistungskurve', () => {
  // 3 Tage im 15-min-Raster: 10–14 Uhr 4000 W, sonst 0 W
  const start = new Date(2026, 9, 22, 0, 0, 0);
  const kurve = Array.from({ length: 3 * 96 }, (_, i) => {
    const t = new Date(start.getTime() + i * 15 * 60e3);
    const h = t.getHours();
    return { datetime: t.toISOString(), watts: h >= 10 && h < 14 ? 4000 : 0, p10: null, p90: null };
  });

  it('sums energy per day, peak and hours', () => {
    const r = forecastFromCurve(kurve, new Date(2026, 9, 22, 11, 20));
    expect(r.days.map((d) => Math.round(d * 10) / 10)).toEqual([16, 16, 16]); // 4 h × 4 kW
    expect(r.peakToday).toBe(4000);
    expect(r.thisHour).toBeCloseTo(4, 5); // 11–12 Uhr
    expect(r.nextHour).toBeCloseTo(4, 5); // 12–13 Uhr
    expect(r.remainingToday).toBeCloseTo((2 + 40 / 60) * 4, 5); // 11:20–14:00 bei 4 kW
  });

  it('handles the evening and missing data', () => {
    const r = forecastFromCurve(kurve, new Date(2026, 9, 22, 13, 30));
    expect(r.thisHour).toBeCloseTo(4, 5);
    expect(r.nextHour).toBe(0);
    expect(r.remainingToday).toBeCloseTo(0.5 * 4, 5); // 13:30–14:00
    expect(forecastFromCurve([], new Date())).toEqual({ days: [], peakToday: null, thisHour: null, nextHour: null, remainingToday: null });
  });
});
