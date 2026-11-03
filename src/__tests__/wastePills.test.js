import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WASTE_BINS,
  getWasteBins,
  getWasteDaysAhead,
  isWasteDue,
  wasteDaysUntil,
} from '../utils/wastePills';

describe('wastePills', () => {
  it('reads Heute, Morgen and "in N Tagen"', () => {
    expect(wasteDaysUntil('Heute')).toBe(0);
    expect(wasteDaysUntil('Morgen')).toBe(1);
    expect(wasteDaysUntil('in 9 Tagen')).toBe(9);
    expect(wasteDaysUntil('kein Termin')).toBeNull();
    expect(wasteDaysUntil(undefined)).toBeNull();
  });

  it('keeps two days lead time by default', () => {
    expect(getWasteDaysAhead({})).toBe(2);
    expect(isWasteDue('in 2 Tagen')).toBe(true);
    expect(isWasteDue('in 3 Tagen')).toBe(false);
  });

  it('honours a configured lead time', () => {
    const pill = { wasteDaysAhead: 1 };
    expect(getWasteDaysAhead(pill)).toBe(1);
    expect(isWasteDue('Morgen', 1)).toBe(true);
    expect(isWasteDue('Heute', 1)).toBe(true);
    expect(isWasteDue('in 2 Tagen', 1)).toBe(false);
    expect(getWasteDaysAhead({ wasteDaysAhead: -1 })).toBe(2);
  });

  it('uses the three default bins without own selection', () => {
    expect(getWasteBins({ entityIds: [] })).toBe(DEFAULT_WASTE_BINS);
    expect(getWasteBins({}).map((b) => b.name)).toEqual(['Gelbe Tonne', 'Restmüll', 'Papier']);
  });

  it('takes selected sensors with names from Home Assistant', () => {
    const entities = {
      'sensor.gelbe_tonne': { attributes: { friendly_name: 'Gelber Sack' } },
      'sensor.papier_sportverein': { attributes: { friendly_name: 'Papier Sportverein' } },
    };
    const bins = getWasteBins(
      { entityIds: ['sensor.gelbe_tonne', 'sensor.papier_sportverein', 'sensor.bio'] },
      entities
    );
    expect(bins.map((b) => b.name)).toEqual(['Gelber Sack', 'Papier Sportverein', 'sensor.bio']);
    expect(bins[0].color).toBe(DEFAULT_WASTE_BINS[0].color);
    expect(bins[1].color).toBe(DEFAULT_WASTE_BINS[2].color);
    expect(bins[2].color).toBe(DEFAULT_WASTE_BINS[1].color);
  });
});
