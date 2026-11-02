import { describe, expect, it, vi } from 'vitest';
import { entryScriptFromHtml, isNewBuildAvailable, reloadWithGuard, RELOAD_GUARD_MS } from '../utils/appUpdate';

const html = (hash) => `<html><head><script type="module" crossorigin src="./assets/index-${hash}.js"></script></head></html>`;
const doc = (hash) => ({
  querySelector: () => ({ getAttribute: () => `./assets/index-${hash}.js` }),
});
const antwort = (body, ok = true) => vi.fn(async () => ({ ok, text: async () => body }));

const speicher = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('appUpdate', () => {
  it('reads the entry script from index.html', () => {
    expect(entryScriptFromHtml(html('abc'))).toBe('./assets/index-abc.js');
    expect(entryScriptFromHtml('<html></html>')).toBeNull();
  });

  it('detects a new build only when the entry script changed', async () => {
    expect(await isNewBuildAvailable(antwort(html('neu')), doc('alt'))).toBe(true);
    expect(await isNewBuildAvailable(antwort(html('alt')), doc('alt'))).toBe(false);
  });

  it('decides nothing when the server does not answer properly', async () => {
    expect(await isNewBuildAvailable(antwort('', false), doc('alt'))).toBe(false);
    expect(await isNewBuildAvailable(vi.fn(async () => { throw new Error('offline'); }), doc('alt'))).toBe(false);
  });

  it('reloads again after the guard time instead of only once per session', () => {
    const s = speicher();
    const reload = vi.fn();
    expect(reloadWithGuard(s, 1_000_000, reload)).toBe(true);
    expect(reloadWithGuard(s, 1_000_000 + 1_000, reload)).toBe(false);
    expect(reloadWithGuard(s, 1_000_000 + RELOAD_GUARD_MS + 1, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
