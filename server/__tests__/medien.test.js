// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playlistBereinigen } from '../routes/medien.js';
import {
  cacheLeeren, genreAlben, genreTitel, genres, gueltigeUri, titelDauer,
} from '../utils/musicAssistant.js';

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

describe('Genres', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const antwort = (daten) => ({ ok: true, json: async () => daten });

  it('lists genres with albums and their album count', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/library_items') {
        expect(args).toMatchObject({ media_type: 'album', search: 'ro', limit: 200, offset: 0, order_by: 'sort_name' });
        return antwort([{ item_id: 3, name: 'Rock' }, { item_id: '7', name: 'Prog Rock' }, { name: 'ohne ID' }]);
      }
      expect(command).toBe('music/genres/media_counts');
      expect(args.genre_ids).toEqual(['3', '7']);
      return antwort({ 3: { album: 42, track: 500 } });
    });
    expect(await genres({ suche: ' ro ' }, fetchFn)).toEqual([
      { id: '3', name: 'Rock', alben: 42 }, { id: '7', name: 'Prog Rock', alben: null },
    ]);
  });

  it('retries without sorting and keeps the genres when the counts fail', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/library_items') return args.order_by ? { ok: false, status: 500 } : antwort([{ item_id: 1, name: 'Jazz' }]);
      return { ok: false, status: 500 };
    });
    expect(await genres({ limit: '9999' }, fetchFn)).toEqual([{ id: '1', name: 'Jazz', alben: null }]);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).args.limit).toBe(500);
  });

  it('falls back to all genres and reports the error text of Music Assistant', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fehler = { ok: false, status: 400, text: async () => 'invalid media_type' };
    const nurOhneArt = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/library_items') return args.media_type ? fehler : antwort([{ item_id: 2, name: 'Pop' }]);
      return antwort({});
    });
    expect(await genres({}, nurOhneArt)).toEqual([{ id: '2', name: 'Pop', alben: null }]);
    const immer = vi.fn(async () => antwort({ error_code: 999, details: 'kaputt' }));
    await expect(genres({}, immer)).rejects.toThrow('Music Assistant 999: kaputt');
    const http = vi.fn(async () => fehler);
    await expect(genres({}, http)).rejects.toThrow('Music Assistant 400: invalid media_type');
  });

  it('returns the tracks of a genre with their length', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      expect(command).toBe('music/genres/tracks');
      expect(args).toMatchObject({ item_id: '3', offset: 500, limit: 500 });
      return antwort([
        { uri: 'library://track/9', name: 'Locomotive Breath', duration: 263, artists: [{ name: 'Jethro Tull' }] },
        { uri: 'library://track/10', name: 'Ohne Länge', duration: 0, artists: [] },
      ]);
    });
    expect(await genreTitel('3', { offset: '500' }, fetchFn)).toEqual([
      { uri: 'library://track/9', name: 'Locomotive Breath', artists: [{ name: 'Jethro Tull' }], duration: 263, media_type: 'track' },
      { uri: 'library://track/10', name: 'Ohne Länge', artists: [], duration: null, media_type: 'track' },
    ]);
  });

  it('returns the albums of a genre in the shape of the HA services', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      expect(command).toBe('music/genres/albums');
      expect(args).toMatchObject({ item_id: '3', order_by: 'sort_name' });
      return antwort([
        { uri: 'library://album/1', name: 'Thick as a Brick', year: 1972, artists: [{ name: 'Jethro Tull', item_id: 5 }], metadata: {} },
        { name: 'ohne uri' },
      ]);
    });
    expect(await genreAlben(3, {}, fetchFn)).toEqual([
      { uri: 'library://album/1', name: 'Thick as a Brick', artists: [{ name: 'Jethro Tull' }], year: 1972, media_type: 'album' },
    ]);
  });
});
