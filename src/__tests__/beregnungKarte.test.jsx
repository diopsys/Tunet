import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beregnungWert, renderBeregnungCard, resolveBeregnungConfig } from '../rendering/cards/beregnungRenderer';

const eigene = {
  beregnung: {
    master: 'binary_sensor.iu_c1_m',
    zonen: [{ entity: 'binary_sensor.iu_c1_z1' }, { entity: 'binary_sensor.iu_c1_z2', name: 'Beete' }],
    regen: { entity: 'sensor.verdunstung', attribute: 'regen_heute' },
    verdunstung: 'sensor.verdunstung',
    url: '/irrigation',
  },
};

const entities = {
  'binary_sensor.iu_c1_m': { state: 'on', attributes: {} },
  'binary_sensor.iu_c1_z1': { state: 'on', attributes: { friendly_name: 'Rasen 1/3', time_remaining: '0:12:00' } },
  'binary_sensor.iu_c1_z2': { state: 'off', attributes: { friendly_name: 'Beete/Hinterhof' } },
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

  it('keeps the original layout without settings', () => {
    const config = resolveBeregnungConfig({});
    expect(config.masterStatus).toBe('binary_sensor.beregung_master_status');
    expect(config.zonen).toHaveLength(5);
    expect(config.url).toBeNull();
  });

  it('reads entity states and attributes', () => {
    expect(beregnungWert(entities, 'sensor.verdunstung')).toBe('0.54');
    expect(beregnungWert(entities, { entity: 'sensor.verdunstung', attribute: 'regen_heute' })).toBe(2.8);
    expect(beregnungWert(entities, 'sensor.fehlt')).toBeNull();
    expect(beregnungWert(entities, null)).toBeNull();
  });

  it('shows an own installation: active zones, rain from an attribute, evaporation', () => {
    render(karte(eigene));
    expect(screen.getByText('Aktiv')).toBeTruthy();
    expect(screen.getByText('Rasen 1/3')).toBeTruthy(); // Name aus friendly_name
    expect(screen.getByText('0:12:00')).toBeTruthy();
    expect(screen.queryByText('Beete')).toBeNull(); // Zone aus
    expect(screen.getByText('2.8 mm')).toBeTruthy();
    expect(screen.getByText('0.54 mm')).toBeTruthy();
  });

  it('opens its own page instead of the dialog', () => {
    const top = { history: { pushState: vi.fn() }, dispatchEvent: vi.fn(), CustomEvent: globalThis.CustomEvent };
    vi.spyOn(globalThis.window, 'top', 'get').mockReturnValue(top);
    const setShowBeregnungModal = vi.fn();
    const { container } = render(karte(eigene, { setShowBeregnungModal }));
    fireEvent.click(container.firstChild);
    expect(top.history.pushState).toHaveBeenCalledWith(null, '', '/irrigation');
    expect(setShowBeregnungModal).not.toHaveBeenCalled();
  });
});
