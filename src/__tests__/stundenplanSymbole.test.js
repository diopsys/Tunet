import { describe, expect, it } from 'vitest';
import { symbolVorschlag } from '../components/pages/stundenplanSymbole';

describe('Symbol-Vorschlag im Stundenplan', () => {
  it('finds symbols by name, case-insensitive and in compounds', () => {
    expect(symbolVorschlag('Schwimmen')).toBe('🏊');
    expect(symbolVorschlag('Schwimmtraining')).toBe('🏊');
    expect(symbolVorschlag('mathematik')).toBe('➗');
    expect(symbolVorschlag('Latein')).toBe('🏛️');
    expect(symbolVorschlag('Kinderturnen')).toBe('🤸');
    expect(symbolVorschlag('Schulband')).toBe('🎸');
    expect(symbolVorschlag('Basketball')).toBe('🏀');
    expect(symbolVorschlag('Sport')).toBe('⚽');
  });

  it('matches short words only as whole words', () => {
    expect(symbolVorschlag('Robotik-AG')).toBe('🤖');
    expect(symbolVorschlag('Schach AG')).toBe('🧩');
    expect(symbolVorschlag('Nachmittag')).toBeNull();
  });

  it('returns null for unknown or empty names', () => {
    expect(symbolVorschlag('Xyz')).toBeNull();
    expect(symbolVorschlag('')).toBeNull();
    expect(symbolVorschlag(undefined)).toBeNull();
  });
});
