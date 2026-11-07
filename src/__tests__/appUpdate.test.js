import { describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import {
  entryScriptFromHtml,
  isNewBuildAvailable,
  lazyWithRetry,
  reloadWithGuard,
  RELOAD_GUARD_MS,
  waitForServer,
} from '../utils/appUpdate';

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

  it('waits until the server answers again', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true });
    await expect(waitForServer(fetchFn, { timeoutMs: 1000, intervalMs: 1 })).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    await expect(waitForServer(vi.fn(async () => ({ ok: false })), { timeoutMs: 5, intervalMs: 1 })).resolves.toBe(false);
  });

  it('retries a failed modal import once the server is reachable', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: ./assets/X.js'))
      .mockResolvedValueOnce({ default: () => createElement('p', null, 'Modal da') });
    const waitFn = vi.fn(async () => true);
    const Modal = lazyWithRetry(factory, { waitFn });
    render(createElement(Suspense, { fallback: null }, createElement(Modal)));
    expect(await screen.findByText('Modal da')).toBeTruthy();
    expect(waitFn).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('reloads instead of spinning forever when a modal import hangs', async () => {
    const factory = vi.fn(() => new Promise(() => {}));
    const reloadFn = vi.fn(async () => true);
    const Modal = lazyWithRetry(factory, { reloadFn, timeoutMs: 10 });
    render(createElement(Suspense, { fallback: createElement('p', null, 'lädt') }, createElement(Modal)));
    await vi.waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(screen.getByText('lädt')).toBeTruthy();
  });

  it('renews an expired ingress session while waiting for the server', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: true });
    const renewFn = vi.fn(async () => true);
    await expect(waitForServer(fetchFn, { timeoutMs: 1000, intervalMs: 500, renewFn })).resolves.toBe(true);
    expect(renewFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reloads when the retried import fails again (Safari keeps the failure)', async () => {
    const fehler = () => new TypeError('Importing a module script failed.');
    const factory = vi.fn().mockRejectedValueOnce(fehler()).mockRejectedValueOnce(fehler());
    const reloadFn = vi.fn(async () => true);
    const Modal = lazyWithRetry(factory, { waitFn: vi.fn(async () => true), reloadFn });
    render(createElement(Suspense, { fallback: null }, createElement(Modal)));
    await vi.waitFor(() => expect(reloadFn).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
