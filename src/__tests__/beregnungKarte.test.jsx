import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderBeregnungCard } from '../rendering/cards/beregnungRenderer';
import { beregnungWert, resolveBeregnungConfig } from '../utils/beregnungConfig';
import BeregnungModal from '../modals/BeregnungModal';

const eigene = {
  beregnung: {
    master: 'binary_sensor.iu_c1_m',
    zonen: [{ entity: 'binary_sensor.iu_c1_z1' }, { entity: 'binary_sensor.iu_c1_z2', name: 'Beete' }],
    regen: 'sensor.regen_tag',
    regenRate: 'sensor.regen_rate',
    verdunstung: 'sensor.verdunstung',
    url: '/irrigation',
  },
};

const entities = {
  'binary_sensor.iu_c1_m': { state: 'on', attributes: { enabled: true } },
  'binary_sensor.iu_c1_z1': { state: 'on', attributes: { friendly_name: 'Rasen 1/3', time_remaining: '0:12:00' } },
  'binary_sensor.iu_c1_z2': { state: 'off', attributes: { friendly_name: 'Beete/Hinterhof' } },
  'sensor.regen_tag': { state: '2.8', attributes: {} },
  'sensor.regen_rate': { state: '0.0', attributes: {} },
  'sensor.verdunstung': { state: '0.54', attributes: { regen_heute: 2.8 } },
};

const karte = (settings, extra = {}) =>
  renderBeregnungCard('beregnung_card_1', {}, () => null, {}, 'garten::beregnung_card_1', {
    editMode: false,
    cardSettings: { 'garten::beregnung_card_1': settings },
    customNames: {},
    entities,
    setShowBeregnungModal: vi.fn(),
    isTwoColMobile: false,
    t: (k) => k,
    ...extra,
  });

describe('Beregnungs-Karte', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the original installation without settings', () => {
    const config = resolveBeregnungConfig({});
    expect(config.masterStatus).toBe('binary_sensor.beregung_master_status');
    expect(config.zonen).toHaveLength(5);
    expect(config.ventile).toHaveLength(6);
    expect(config.url).toBeNull();
  });

  it('reads entity states and attributes', () => {
    expect(beregnungWert(entities, 'sensor.verdunstung')).toBe('0.54');
    expect(beregnungWert(entities, { entity: 'sensor.verdunstung', attribute: 'regen_heute' })).toBe(2.8);
    expect(beregnungWert(entities, 'sensor.fehlt')).toBeNull();
    expect(beregnungWert(entities, null)).toBeNull();
  });

  it('shows an own installation: active zones, rain, evaporation', () => {
    render(karte(eigene));
    expect(screen.getByText('Aktiv')).toBeTruthy();
    expect(screen.getByText('Rasen 1/3')).toBeTruthy(); // Name aus friendly_name
    expect(screen.getByText('0:12:00')).toBeTruthy();
    expect(screen.queryByText('Beete')).toBeNull(); // Zone aus
    expect(screen.getByText('2.8 mm')).toBeTruthy();
    expect(screen.getByText('0.54 mm')).toBeTruthy();
  });

  it('opens the statistics from the card and the dashboard from the drop icon', () => {
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    const setShowBeregnungModal = vi.fn();
    const { container } = render(karte(eigene, { setShowBeregnungModal }));

    fireEvent.click(container.firstChild);
    expect(setShowBeregnungModal).toHaveBeenCalledWith('beregnung_card_1');
    expect(top.history.pushState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Beregnung – Dashboard öffnen' }));
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/irrigation');
    expect(setShowBeregnungModal).toHaveBeenCalledTimes(1);
  });
});

describe('Beregnungs-Dialog mit eigener Anlage', () => {
  it('lists own zones, hides valves without config and starts zones via Irrigation Unlimited', () => {
    const callService = vi.fn();
    render(<BeregnungModal show onClose={() => {}} entities={entities} callService={callService} settings={eigene} />);
    expect(screen.queryByRole('button', { name: 'Ventile' })).toBeNull();
    expect(screen.getByText('Verdunstung (ET₀)')).toBeTruthy();
    expect(screen.queryByText('Smart Irrigation')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Zonen' }));
    expect(screen.getByText('Rasen 1/3')).toBeTruthy();
    expect(screen.getByText('Beete')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    expect(callService).toHaveBeenCalledWith('irrigation_unlimited', 'manual_run', {
      entity_id: 'binary_sensor.iu_c1_z2',
      time: '00:10:00',
    });
    fireEvent.click(screen.getByRole('button', { name: /Stopp/ }));
    expect(callService).toHaveBeenCalledWith('irrigation_unlimited', 'cancel', { entity_id: 'binary_sensor.iu_c1_z1' });
  });
});
