import { describe, it, expect } from 'vitest';
import { en, de, SUPPORTED_LANGUAGES, getLocaleForLanguage, normalizeLanguage } from '../i18n';

const getPlaceholders = (value) => {
  const matches = String(value).match(/\{[^}]+\}/g) || [];
  return [...new Set(matches)].sort();
};

const expectParityWithEnglish = (targetTranslations, languageCode) => {
  const enKeys = Object.keys(en).sort();
  const targetKeys = Object.keys(targetTranslations).sort();
  const missingInTarget = enKeys.filter((key) => !targetKeys.includes(key));
  const extraInTarget = targetKeys.filter((key) => !enKeys.includes(key));

  expect(
    missingInTarget,
    `Keys in en.json missing from ${languageCode}.json: ${missingInTarget.join(', ')}`
  ).toHaveLength(0);
  expect(
    extraInTarget,
    `Keys in ${languageCode}.json missing from en.json: ${extraInTarget.join(', ')}`
  ).toHaveLength(0);

  enKeys.forEach((key) => {
    const enPlaceholders = getPlaceholders(en[key]);
    const targetPlaceholders = getPlaceholders(targetTranslations[key]);
    expect(
      targetPlaceholders,
      `${languageCode}.json key "${key}" has placeholder mismatch. Expected: ${enPlaceholders.join(', ') || '(none)'}; Actual: ${targetPlaceholders.join(', ') || '(none)'}`
    ).toEqual(enPlaceholders);
  });
};

describe('i18n', () => {
  it('offers only English and German', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'de']);
    expect(typeof en).toBe('object');
    expect(typeof de).toBe('object');
  });

  it('falls back to English for removed languages', () => {
    expect(normalizeLanguage('de')).toBe('de');
    expect(normalizeLanguage('fr')).toBe('en');
    expect(getLocaleForLanguage('de')).toBe('de-DE');
    expect(getLocaleForLanguage('en')).toBe('en-US');
  });

  it('fan keys exist in English and German', () => {
    const fanKeys = [
      'addCard.available.fans',
      'addCard.item.fans',
      'addCard.type.fan',
      'fan.direction',
      'fan.direction.forward',
      'fan.direction.reverse',
      'fan.directionNotAvailable',
      'fan.oscillate',
      'fan.preset',
      'fan.presetNotAvailable',
      'fan.speed',
      'fan.disableAnimation',
      'fan.disableAnimationHint',
      'fan.turnOff',
      'fan.turnOn',
    ];

    const locales = { en, de };
    Object.entries(locales).forEach(([code, locale]) => {
      fanKeys.forEach((key) => {
        expect(locale[key], `${code}.json is missing fan key "${key}"`).toBeDefined();
      });
    });
  });

  it('en is source-of-truth for key and placeholder parity', () => {
    expectParityWithEnglish(de, 'de');
  });

  it('no empty translation values', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.json key "${key}" is empty`).not.toBe('');
    }
    for (const [key, value] of Object.entries(de)) {
      expect(value, `de.json key "${key}" is empty`).not.toBe('');
    }
  });
});
