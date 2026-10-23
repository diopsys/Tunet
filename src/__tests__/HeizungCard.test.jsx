import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeizungCard, {
  erzeugerStatus,
  isActive,
  openHaPath,
  resolveHeizungConfig,
  ventileStatus,
} from '../components/cards/HeizungCard';
import PufferCard, { pufferKwh, resolvePufferConfig } from '../components/cards/PufferCard';

const heizung = {
  url: '/heizung?tab=anlage',
  erzeuger: [
    { name: 'Ofen', stufen: [{ entity: 'sensor.ofen', min: 50, label: 'an' }], tempEntity: 'sensor.ofen' },
    {
      name: 'Gaskessel',
      stufen: [{ entity: 'binary_sensor.kesselpumpe', label: 'an' }, { entity: 'binary_sensor.freigabe', label: 'Freigabe', passive: true }],
      tempEntity: 'sensor.kessel',
    },
    {
      name: 'Explorer',
      stufen: [{ entity: 'sensor.leistung', above: 1000, label: 'Heizstab' }, { entity: 'sensor.leistung', above: 300, label: 'Kompressor' }],
      tempEntity: 'sensor.ww',
      tempAlways: true,
    },
  ],
  zustaende: [{ name: 'Notkühlung', entity: 'binary_sensor.notkuehlung', warn: true }],
  ventile: { entities: ['sensor.v1', 'sensor.v2', 'sensor.v3', 'sensor.v4'] },
  pumpen: [
    { name: 'Heizkreis', entity: 'binary_sensor.hk' },
    { name: 'Zirkulation', entity: 'binary_sensor.zirk' },
    { name: 'Kompressor', entity: 'sensor.leistung', above: 300 },
  ],
  modi: [
    { name: 'Warmwasser', entity: 'switch.ww' },
    { name: 'Heizkreis', entity: 'switch.hk_aus', invert: true },
  ],
};

const entities = {
  'sensor.ofen': { state: '43.2' },
  'binary_sensor.kesselpumpe': { state: 'off' },
  'binary_sensor.freigabe': { state: 'on' },
  'sensor.kessel': { state: '38.0' },
  'sensor.leistung': { state: '612' },
  'sensor.ww': { state: '51.4' },
  'binary_sensor.notkuehlung': { state: 'off' },
  'sensor.v1': { state: '0' },
  'sensor.v2': { state: '35' },
  'sensor.v3': { state: '12' },
  'sensor.v4': { state: 'unavailable' },
  'binary_sensor.hk': { state: 'on' },
  'binary_sensor.zirk': { state: 'off' },
  'switch.ww': { state: 'on' },
  'switch.hk_aus': { state: 'off' },
};

describe('Heizung – Logik', () => {
  it('evaluates on/off and thresholds', () => {
    expect(isActive({ state: 'on' })).toBe(true);
    expect(isActive({ state: '50' }, { min: 50 })).toBe(true);
    expect(isActive({ state: '50' }, { above: 50 })).toBe(false);
    expect(isActive({ state: 'unavailable' }, { above: 1 })).toBe(false);
  });

  it('picks the first matching stage', () => {
    const [ofen, gas, explorer] = heizung.erzeuger;
    expect(erzeugerStatus(ofen, entities)).toMatchObject({ label: 'aus', active: false });
    expect(erzeugerStatus(gas, entities)).toMatchObject({ label: 'Freigabe', passive: true });
    expect(erzeugerStatus(explorer, entities)).toMatchObject({ label: 'Kompressor', active: true });
    expect(erzeugerStatus(explorer, { 'sensor.leistung': { state: '2100' } }).label).toBe('Heizstab');
  });

  it('counts open valves among reachable ones', () => {
    expect(ventileStatus(heizung.ventile, entities)).toEqual({ offen: 2, bekannt: 3, gesamt: 4 });
  });

  it('ignores incomplete config', () => {
    const config = resolveHeizungConfig({ heizung: { pumpen: [{ name: 'ohne' }], ventile: { entities: [] } } });
    expect(config.pumpen).toEqual([]);
    expect(config.ventile).toBeNull();
  });
});

describe('HeizungCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows producers, valves, modes and running pumps compactly', () => {
    render(<HeizungCard cardId="heizung_card_1" entities={entities} settings={{ heizung }} />);
    expect(screen.queryByText('43,2 °C')).toBeNull(); // Ofen aus → Zustand statt Temperatur
    expect(screen.getByText('51,4 °C')).toBeTruthy(); // Explorer immer mit Temperatur
    expect(screen.getAllByText('Kompressor').some((el) => el.className.includes('text-orange-400'))).toBe(true); // Zusatz beim Explorer
    expect(screen.getByText('Freigabe')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy(); // offene von erreichbaren Ventilen
    expect(screen.getByLabelText('Warmwasser an')).toBeTruthy();
    expect(screen.getByLabelText('Heizkreis an')).toBeTruthy(); // invertiert: Schalter aus = an
    // alle Pumpen gelistet, laufende grün
    expect(screen.getByText('Pumpen')).toBeTruthy();
    expect(screen.getAllByText('Heizkreis').some((el) => el.className.includes('text-green-400'))).toBe(true);
    expect(screen.getByText('Zirkulation').className).not.toContain('text-green-400');
    expect(screen.queryByText(/Notkühlung/)).toBeNull(); // nur sichtbar, wenn aktiv
    // schmale Kachel: Kurzzeile mit den laufenden Pumpen (per Container-Query statt Liste)
    expect(screen.getByText('Pumpen: Heizkreis, Kompressor')).toBeTruthy();
  });

  it('replaces the bottom row with a warning while emergency cooling is active', () => {
    render(<HeizungCard cardId="c" entities={{ ...entities, 'binary_sensor.notkuehlung': { state: 'on' } }} settings={{ heizung }} />);
    expect(screen.getByText('Notkühlung aktiv')).toBeTruthy();
    expect(screen.queryByLabelText('Warmwasser an')).toBeNull();
  });

  it('opens the configured page, not in edit mode', () => {
    const { rerender } = render(<HeizungCard cardId="c" entities={entities} settings={{ heizung }} editMode />);
    expect(screen.queryByRole('button', { name: 'Heizung öffnen' })).toBeNull();
    rerender(<HeizungCard cardId="c" entities={entities} settings={{ heizung }} />);
    expect(screen.getByRole('button', { name: 'Heizung öffnen' })).toBeTruthy();
  });

  it('opens its own page from the valve indicator without opening the card', () => {
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    const mitUrl = { ...heizung, ventile: { ...heizung.ventile, url: '/heizung?tab=raeume' } };
    render(<HeizungCard cardId="c" entities={entities} settings={{ heizung: mitUrl }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ventile öffnen' }));
    expect(top.history.pushState).toHaveBeenCalledTimes(1);
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/heizung?tab=raeume');
  });

  it('navigates the parent window when embedded', () => {
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    openHaPath('/heizung?tab=anlage');
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/heizung?tab=anlage');
    expect(top.dispatchEvent).toHaveBeenCalled();
  });
});

describe('PufferCard', () => {
  const puffer = { schichten: ['sensor.s1', 'sensor.s2', 'sensor.s3', 'sensor.s4'], liter: 749, bezug: 30, voll: 90 };
  const temps = { 'sensor.s1': { state: '73.8' }, 'sensor.s2': { state: '73.5' }, 'sensor.s3': { state: '73.0' }, 'sensor.s4': { state: '72.7' } };

  it('computes the energy like the heating panel', () => {
    // 749 l / 4 × 1,163 Wh/(l·K) × Σ(T − 30 K) / 1000
    expect(pufferKwh([73.8, 73.5, 73.0, 72.7], 749, 30)).toBeCloseTo(37.67, 2);
    expect(pufferKwh([20, 20, 20, 20], 749, 30)).toBe(0);
    expect(pufferKwh([70, null, 60, 50], 749, 30)).toBeNull();
  });

  it('defaults top/bottom to the first/last layer', () => {
    const c = resolvePufferConfig({ puffer });
    expect([c.oben, c.unten, c.stunden]).toEqual(['sensor.s1', 'sensor.s4', 24]);
  });

  it('shows kWh, percent, temperatures and loads the 24 h history', async () => {
    const now = Date.now();
    const sendMessagePromise = vi.fn(async (msg) => {
      const id = msg.statistic_ids[0];
      return { [id]: [{ start: now - 3600e3, mean: 60 }, { start: now - 600e3, mean: id === 'sensor.s1' ? 73 : 70 }] };
    });
    const { container } = render(<PufferCard cardId="puffer_card_1" entities={temps} conn={{ sendMessagePromise }} settings={{ puffer }} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '37,7kWh72 %')).toBeTruthy();
    // 37,67 kWh von 52,27 kWh (749 l × 1,163 × 60 K) = 72 %
    expect(screen.getByText('73,8 °C')).toBeTruthy();
    expect(screen.getByText('72,7 °C')).toBeTruthy();
    await waitFor(() => expect(container.querySelectorAll('svg path[stroke]').length).toBe(2));
    expect(sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ type: 'recorder/statistics_during_period', period: '5minute' }));
  });

  it('shows emergency cooling only while it is active', () => {
    const mit = { ...puffer, zustaende: [{ name: 'Notkühlung', entity: 'binary_sensor.notk' }] };
    const { rerender } = render(<PufferCard cardId="p" entities={{ ...temps, 'binary_sensor.notk': { state: 'off' } }} settings={{ puffer: mit }} />);
    expect(screen.queryByText('Notkühlung aktiv')).toBeNull();
    rerender(<PufferCard cardId="p" entities={{ ...temps, 'binary_sensor.notk': { state: 'on' } }} settings={{ puffer: mit }} />);
    expect(screen.getByText('Notkühlung aktiv')).toBeTruthy();
  });

  it('opens the configured page', () => {
    render(<PufferCard cardId="p" entities={temps} settings={{ puffer: { ...puffer, url: '/heizung' } }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Puffer öffnen' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Puffer öffnen' })).toBeTruthy();
  });
});
