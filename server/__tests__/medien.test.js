// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playlistBereinigen } from '../routes/medien.js';
import { cacheLeeren, gueltigeUri, titelDauer } from '../utils/musicAssistant.js';

describe('playlistBereinigen', () => {
  it('keeps only titles with an uri and the known fields', () => {
    expect(playlistBereinigen({
      items: [{ uri: 'library://track/1', name: 'Eins', artist: 'Band', dauer: 200, extra: 'x' }, { name: 'ohne uri' }, null],
      index: 0,
    })).toEqual({ items: [{ uri: 'library://track/1', name: 'Eins', artist: 'Band', dauer: 200, media_type: 'track' }], index: 0 });
  });

  it('falls back to the first title for an invalid position', () => {
    const items = [{ uri: 'a' }, { uri: 'b' }];
    expect(playlistBereinigen({ items, index: 1 }).index).toBe(1);
    expect(playlistBereinigen({ items, index: 5 }).index).toBe(0);
    expect(playlistBereinigen({ items, index: '1' }).index).toBe(0);
    expect(playlistBereinigen(null)).toEqual({ items: [], index: 0 });
  });
});

describe('playlistBereinigen: Längen', () => {
  it('stores a missing length as null, not 0', () => {
    const { items } = playlistBereinigen({ items: [{ uri: 'a', dauer: null }, { uri: 'b', dauer: 0 }, { uri: 'c' }, { uri: 'd', dauer: '161' }] });
    expect(items.map((t) => t.dauer)).toEqual([null, null, null, 161]);
  });
});

describe('titelDauer', () => {
  afterEach(() => { cacheLeeren(); vi.unstubAllEnvs(); });

  it('accepts only Music Assistant uris', () => {
    expect(gueltigeUri('library://track/1')).toBe(true);
    expect(gueltigeUri('filesystem_smb--abc://track/x.mp3')).toBe(true);
    expect(gueltigeUri('spotify:track:1')).toBe(false);
    expect(gueltigeUri(42)).toBe(false);
  });

  it('asks Music Assistant once per uri and caches the length', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    vi.stubEnv('MA_URL', 'http://ma:8095/');
    const fetchFn = vi.fn(async (url, opts) => {
      const { args } = JSON.parse(opts.body);
      expect(url).toBe('http://ma:8095/api');
      expect(opts.headers.Authorization).toBe('Bearer geheim');
      if (args.uri === 'library://track/9') return { ok: false, status: 404 };
      return { ok: true, json: async () => ({ duration: args.uri === 'library://track/1' ? 160.4 : 0 }) };
    });
    const uris = ['library://track/1', 'library://track/2', 'library://track/9', 'spotify:track:3', 'library://track/1'];
    expect(await titelDauer(uris, fetchFn)).toEqual({ 'library://track/1': 160 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await titelDauer(['library://track/1'], fetchFn)).toEqual({ 'library://track/1': 160 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
