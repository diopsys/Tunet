import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeizungPanelCard, {
  erzeugerStatus,
  isActive,
  openHaPath,
  resolveHeizungConfig,
} from '../components/cards/HeizungPanelCard';

const settings = {
  heizung: {
    url: '/heizung',
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
    speicher: [{ name: 'Puffer oben', entity: 'sensor.s1' }, { name: 'Puffer unten', entity: 'sensor.s4' }],
    pumpen: [
      { name: 'Heizkreis', entity: 'binary_sensor.hk' },
      { name: 'Zirkulation', entity: 'binary_sensor.zirk' },
      { name: 'Kompressor', entity: 'sensor.leistung', above: 300 },
    ],
    modi: [
      { name: 'Warmwasser', entity: 'switch.ww' },
      { name: 'Heizkreis', entity: 'switch.hk_aus', invert: true },
      { name: 'Urlaub', entity: 'switch.urlaub' },
    ],
  },
};

const entities = {
  'sensor.ofen': { state: '43.2' },
  'binary_sensor.kesselpumpe': { state: 'off' },
  'binary_sensor.freigabe': { state: 'on' },
  'sensor.kessel': { state: '38.0' },
  'sensor.leistung': { state: '612' },
  'sensor.ww': { state: '51.4' },
  'sensor.s1': { state: '64.5' },
  'sensor.s4': { state: '41' },
  'binary_sensor.hk': { state: 'on' },
  'binary_sensor.zirk': { state: 'off' },
  'switch.ww': { state: 'on' },
  'switch.hk_aus': { state: 'off' },
  'switch.urlaub': { state: 'off' },
};

describe('Heizung – Logik', () => {
  it('evaluates on/off and thresholds', () => {
    expect(isActive({ state: 'on' })).toBe(true);
    expect(isActive({ state: '50' }, { min: 50 })).toBe(true);
    expect(isActive({ state: '50' }, { above: 50 })).toBe(false);
    expect(isActive({ state: 'unavailable' }, { above: 1 })).toBe(false);
    expect(isActive(undefined)).toBe(false);
  });

  it('picks the first matching stage', () => {
    const [ofen, gas, explorer] = settings.heizung.erzeuger;
    expect(erzeugerStatus(ofen, entities)).toMatchObject({ label: 'aus', active: false });
    expect(erzeugerStatus(gas, entities)).toMatchObject({ label: 'Freigabe', active: false, passive: true });
    expect(erzeugerStatus(explorer, entities)).toMatchObject({ label: 'Kompressor', active: true });
    expect(erzeugerStatus(explorer, { 'sensor.leistung': { state: '2100' } }).label).toBe('Heizstab');
    expect(erzeugerStatus(ofen, {})).toMatchObject({ label: '⚠', unavailable: true });
  });

  it('ignores incomplete config', () => {
    const config = resolveHeizungConfig({ heizung: { speicher: [{ name: 'ohne Entität' }], url: ' ' } });
    expect(config.speicher).toEqual([]);
    expect(config.url).toBeNull();
  });
});

describe('HeizungPanelCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows producers, storage, running pumps and modes', () => {
    render(<HeizungPanelCard cardId="heizung_panel_card_1" entities={entities} settings={settings} isMobile={false} />);
    // Ofen aus → keine Temperatur; Explorer zeigt immer die Temperatur
    expect(screen.queryByText('43,2 °C')).toBeNull();
    expect(screen.getByText('51,4 °C')).toBeTruthy();
    expect(screen.getByText('Freigabe')).toBeTruthy();
    expect(screen.getByText('64,5 °C')).toBeTruthy();
    expect(screen.getByText('41,0 °C')).toBeTruthy();
    // laufende Pumpen: Heizkreis und Kompressor, nicht Zirkulation
    expect(screen.queryByText('Zirkulation')).toBeNull();
    expect(screen.getByText('Kompressor', { selector: 'span.inline-flex' })).toBeTruthy();
    // Heizkreis-Modus ist invertiert: Schalter „aus“ = aktiv
    expect(screen.getAllByText('Heizkreis').length).toBe(2);
  });

  it('shows the temperature of a running producer', () => {
    render(<HeizungPanelCard cardId="heizung_panel_card_1" entities={{ ...entities, 'sensor.ofen': { state: '71.6' } }} settings={settings} />);
    expect(screen.getByText('71,6 °C')).toBeTruthy();
  });

  it('opens the configured page on tap, not in edit mode', () => {
    const pushState = vi.spyOn(globalThis.window.history, 'pushState');
    const { rerender } = render(<HeizungPanelCard cardId="c" entities={entities} settings={settings} editMode />);
    expect(screen.queryByRole('button', { name: 'Heizung öffnen' })).toBeNull();
    rerender(<HeizungPanelCard cardId="c" entities={entities} settings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heizung öffnen' }));
    // im Test gibt es kein Elternfenster → normale Navigation (jsdom ändert die Adresse nicht wirklich)
    expect(pushState).not.toHaveBeenCalled();
  });

  it('navigates the parent window when embedded', () => {
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    openHaPath('/heizung');
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/heizung');
    expect(top.dispatchEvent).toHaveBeenCalled();
  });
});
