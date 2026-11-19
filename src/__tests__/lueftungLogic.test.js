import { describe, expect, it } from 'vitest';
import { co2Color, evaluateLueftung, lockUntil, nightSlot, parseLastMode, qualityLabel } from '../utils/lueftungLogic';

const base = {
  co2: [620],
  humidity: [50, 48],
  pm25: [5, 4],
  outsideTemp: 4,
  insideTemp: 21,
  season: 'Winter',
  lastMode: 'off',
  nightEnabled: true,
  minuteOfDay: 14 * 60,
};
const run = (extra) => evaluateLueftung({ ...base, ...extra });

describe('evaluateLueftung (Winter)', () => {
  it('follows the rule chain in order', () => {
    expect(run({ outsideTemp: -11 }).reason).toBe('frost_off');
    expect(run({ outsideTemp: -11, co2: [1500] }).reason).toBe('frost_off');
    expect(run({ co2: [1250] }).reason).toBe('aq_medium');
    expect(run({ pm25: [3, 30] }).reason).toBe('aq_medium');
    expect(run({ outsideTemp: 13 }).reason).toBe('mild_low');
    expect(run({ co2: [930] }).reason).toBe('co2_low');
    expect(run({ minuteOfDay: 2 * 60 + 5 }).reason).toBe('night_low');
    expect(run({}).reason).toBe('off');
  });

  it('applies the hysteresis of the blueprint', () => {
    expect(run({ outsideTemp: -9, lastMode: 'frost_off' }).reason).toBe('frost_off');
    expect(run({ outsideTemp: -7.9, lastMode: 'frost_off' }).reason).toBe('off');
    expect(run({ outsideTemp: 11.5, lastMode: 'mild_low' }).reason).toBe('mild_low');
    expect(run({ co2: [800], lastMode: 'co2_low' }).reason).toBe('co2_low');
    expect(run({ co2: [740], lastMode: 'co2_low' }).reason).toBe('off');
    // Luftqualität: erst wieder frei, wenn alle Werte deutlich darunter liegen
    expect(run({ humidity: [58], lastMode: 'aq_medium' }).reason).toBe('aq_medium');
    expect(run({ humidity: [55], lastMode: 'aq_medium' }).reason).toBe('off');
  });

  it('explains the result with live values and the active rule', () => {
    expect(run({ co2: [930] }).explanation).toBe('CO₂ 930 ppm ≥ 900');
    expect(run({ outsideTemp: 13.2 }).explanation).toBe('Außen 13,2 °C ≥ 12 °C');
    expect(run({ minuteOfDay: 2 * 60 + 5 }).explanation).toBe('Nacht-Slot bis 02:20');
    expect(run({}).explanation).toBe('Kein Bedarf · CO₂ 620 ppm');
    const rules = run({ co2: [930] }).rules;
    expect(rules.map((r) => r.id)).toEqual(['frost_off', 'aq_medium', 'mild_low', 'co2_low', 'night_low', 'off']);
    expect(rules.filter((r) => r.active).map((r) => r.id)).toEqual(['co2_low']);
  });

  it('ignores VOC (no longer evaluated by the automation)', () => {
    expect(run({ voc: [999] }).reason).toBe('off');
  });

  it('uses the maximum of several sensors and the helper thresholds', () => {
    expect(run({ co2: [620, 950] }).reason).toBe('co2_low');
    expect(run({ co2: [930], thresholds: { co2LowEin: 1000 } }).reason).toBe('off');
  });
});

describe('evaluateLueftung (Sommer)', () => {
  it('cools when outside is cooler than inside', () => {
    expect(run({ season: 'Sommer', outsideTemp: 18, insideTemp: 23 }).reason).toBe('summer_on');
    expect(run({ season: 'Sommer', outsideTemp: 25, insideTemp: 23 }).reason).toBe('summer_off');
    expect(run({ season: 'Sommer', outsideTemp: 22.8, insideTemp: 23, lastMode: 'summer_on' }).reason).toBe('summer_on');
  });
});

describe('helpers', () => {
  it('finds night slots only inside the window', () => {
    expect(nightSlot(22 * 60 + 10, true)).toEqual({ end: 22 * 60 + 20 });
    expect(nightSlot(22 * 60 + 25, true)).toBeNull();
    expect(nightSlot(4 * 60, true)).toEqual({ end: 4 * 60 + 20 });
    expect(nightSlot(6 * 60, true)).toBeNull();
    expect(nightSlot(0, false)).toBeNull();
  });

  it('reads new and old last-mode values', () => {
    expect(parseLastMode('co2_low')).toMatchObject({ src: 'CO₂-Bedarf', lvl: 'Low' });
    expect(parseLastMode('summer_on', 'medium')).toMatchObject({ src: 'Sommer – Kühlen', lvl: 'Medium' });
    expect(parseLastMode('frost_off')).toMatchObject({ lvl: 'Aus', kind: 'off' });
    expect(parseLastMode('winter_airquality_medium')).toMatchObject({ src: 'Luftqualitäts-Override', lvl: 'Medium', kind: 'aq' });
    expect(parseLastMode('boost_3')).toMatchObject({ src: 'Boost-Modus' });
    expect(parseLastMode('manual')).toMatchObject({ src: 'Manuell' });
  });

  it('translates the air quality text', () => {
    expect(qualityLabel('poor')).toBe('Schlecht');
    expect(qualityLabel('good')).toBe('Gut');
    expect(qualityLabel('unavailable')).toBeNull();
  });

  it('colours CO₂ by the automation thresholds', () => {
    const th = { co2LowEin: 900, co2Schwelle: 1200 };
    expect(co2Color(850, th)).toBe('#4ade80');
    expect(co2Color(950, th)).toBe('#fb923c');
    expect(co2Color(1200, th)).toBe('#f87171');
  });

  it('derives the lock end from the last change and the minimum runtime', () => {
    const now = Date.parse('2026-11-17T10:10:00');
    expect(lockUntil('2026-11-17 10:00:00', 20, now)).toBe(Date.parse('2026-11-17T10:20:00'));
    expect(lockUntil('2026-11-17 09:40:00', 20, now)).toBeNull();
  });
});
