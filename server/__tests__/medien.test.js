// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playlistBereinigen } from '../routes/medien.js';
import {
  albumTitel, cacheLeeren, genreAlben, interpretenOrdnen, genreTitel, genres, gueltigeUri, titelDauer,
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
  afterEach(() => { cacheLeeren(); vi.unstubAllEnvs(); });
  const antwort = (daten) => ({ ok: true, json: async () => daten });

  it('lists genres with tracks and their track and album count', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/library_items') {
        expect(args).toMatchObject({ media_type: 'track', search: 'ro', limit: 200, offset: 0, order_by: 'sort_name' });
        return antwort([{ item_id: 3, name: 'Rock' }, { item_id: '7', name: 'Prog Rock' }, { name: 'ohne ID' }]);
      }
      expect(command).toBe('music/genres/media_counts');
      expect(args.genre_ids).toEqual(['3', '7']);
      return antwort({ 3: { album: 42, track: 500 } });
    });
    expect(await genres({ suche: ' ro ' }, fetchFn)).toEqual([
      { id: '3', name: 'Rock', titel: 500, alben: 42 }, { id: '7', name: 'Prog Rock', titel: null, alben: null },
    ]);
  });

  it('retries without sorting and keeps the genres when the counts fail', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/library_items') return args.order_by ? { ok: false, status: 500 } : antwort([{ item_id: 1, name: 'Jazz' }]);
      return { ok: false, status: 500 };
    });
    expect(await genres({ limit: '9999' }, fetchFn)).toEqual([{ id: '1', name: 'Jazz', titel: null, alben: null }]);
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
    expect(await genres({}, nurOhneArt)).toEqual([{ id: '2', name: 'Pop', titel: null, alben: null }]);
    const immer = vi.fn(async () => antwort({ error_code: 999, details: 'kaputt' }));
    await expect(genres({}, immer)).rejects.toThrow('Music Assistant 999: kaputt');
    const http = vi.fn(async () => fehler);
    await expect(genres({}, http)).rejects.toThrow('Music Assistant 400: invalid media_type');
  });

  it('returns the tracks of a genre sorted by artist, then title, page by page', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      expect(command).toBe('music/genres/tracks');
      expect(args).toMatchObject({ item_id: '3', offset: 0, limit: 0 });
      return antwort([
        { uri: 'library://track/1', name: 'Zug', duration: 100, artists: [{ name: 'Too Strong' }] },
        { uri: 'library://track/2', name: 'Locomotive Breath', duration: 263, artists: [{ name: 'Jethro Tull' }] },
        { uri: 'library://track/3', name: 'Ohne Länge', duration: 0, artists: [] },
        { uri: 'library://track/4', name: 'Abend', duration: 90, artists: [{ name: 'Too Strong' }] },
        { uri: 'library://track/5', name: 'Paint It Black', duration: 200, artists: [{ name: 'The Rolling Stones' }] },
      ]);
    });
    expect((await genreTitel('3', {}, fetchFn)).map((t) => t.uri)).toEqual([
      'library://track/3', 'library://track/2', 'library://track/5', 'library://track/4', 'library://track/1',
    ]);
    expect(await genreTitel('3', { offset: '1', limit: '2' }, fetchFn)).toEqual([
      { uri: 'library://track/2', name: 'Locomotive Breath', artists: [{ name: 'Jethro Tull' }], duration: 263, media_type: 'track' },
      { uri: 'library://track/5', name: 'Paint It Black', artists: [{ name: 'The Rolling Stones' }], duration: 200, media_type: 'track' },
    ]);
    // zweite Seite kommt aus der gemerkten Liste (ein Abruf, mit Sortierung)
    expect(fetchFn).toHaveBeenCalledTimes(1);
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

  it('builds the albums of a genre from its tracks when Music Assistant maps none', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const seite = (n, start) => Array.from({ length: n }, (_, i) => ({
      uri: `library://track/${start + i}`, name: `T${start + i}`, artists: [{ name: 'Interpret' }],
      album: (start + i) % 2 ? { uri: `library://album/${(start + i) % 3}`, name: ['Zebra', 'Apfel', 'Mitte'][(start + i) % 3] } : null,
    }));
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      if (command === 'music/genres/albums') return antwort([]);
      expect(command).toBe('music/genres/tracks');
      return antwort(args.offset === 0 ? seite(500, 0) : seite(3, 500));
    });
    expect(await genreAlben('235', {}, fetchFn)).toEqual([
      { uri: 'library://album/1', name: 'Apfel', artists: [{ name: 'Interpret' }], year: null, media_type: 'album' },
      { uri: 'library://album/2', name: 'Mitte', artists: [{ name: 'Interpret' }], year: null, media_type: 'album' },
      { uri: 'library://album/0', name: 'Zebra', artists: [{ name: 'Interpret' }], year: null, media_type: 'album' },
    ]);
    // zwei Seiten Titel (500 + 3), dann Schluss
    expect(fetchFn.mock.calls.filter(([, o]) => JSON.parse(o.body).command === 'music/genres/tracks')).toHaveLength(2);
  });
});

describe('Album-Titel', () => {
  const antwort = (daten) => ({ ok: true, json: async () => daten });
  afterEach(() => { vi.unstubAllEnvs(); cacheLeeren(); });

  it('puts the album artists first, guests after them', () => {
    expect(interpretenOrdnen([{ name: 'Ferris MC' }, { name: 'Das Bo' }, { name: 'Beginner' }], [{ name: 'beginner' }])).toEqual({
      artists: [{ name: 'Beginner' }, { name: 'Ferris MC' }, { name: 'Das Bo' }], hauptanzahl: 1,
    });
    // Sampler: Album-Interpret nicht unter den Titel-Interpreten → Reihenfolge bleibt
    expect(interpretenOrdnen([{ name: 'A' }, { name: 'B' }], [{ name: 'Various Artists' }])).toEqual({
      artists: [{ name: 'A' }, { name: 'B' }], hauptanzahl: 0,
    });
  });

  it('loads the tracks of an album in track order with the album artist first', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command, args } = JSON.parse(opts.body);
      expect(args).toMatchObject({ item_id: '2067', provider_instance_id_or_domain: 'library' });
      if (command === 'music/albums/get') return antwort({ uri: 'library://album/2067', name: 'Bambule', artists: [{ name: 'Beginner' }] });
      expect(command).toBe('music/albums/album_tracks');
      return antwort([
        { uri: 'library://track/24384', name: 'Füchse', track_number: 5, disc_number: 1, duration: 275, artists: [{ name: 'Samy Deluxe' }, { name: 'Beginner' }] },
        { uri: 'library://track/24376', name: 'Hammerhart', track_number: 2, disc_number: 1, duration: 205, artists: [{ name: 'Beginner' }] },
      ]);
    });
    expect(await albumTitel('library://album/2067', fetchFn)).toEqual([
      { uri: 'library://track/24376', name: 'Hammerhart', artists: [{ name: 'Beginner' }], hauptanzahl: 1, duration: 205, media_type: 'track' },
      { uri: 'library://track/24384', name: 'Füchse', artists: [{ name: 'Beginner' }, { name: 'Samy Deluxe' }], hauptanzahl: 1, duration: 275, media_type: 'track' },
    ]);
  });

  it('appends the version to the track name unless it is already part of it', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const fetchFn = vi.fn(async (url, opts) => {
      const { command } = JSON.parse(opts.body);
      if (command === 'music/albums/get') return antwort({ uri: 'library://album/7', name: 'Bohème', artists: [{ name: 'Annett Louisan' }] });
      return antwort([
        { uri: 'library://track/1', name: 'Das Spiel', version: '', track_number: 1, artists: [{ name: 'Annett Louisan' }] },
        { uri: 'library://track/13', name: 'Das Spiel', version: 'Radiomix', track_number: 13, artists: [{ name: 'Annett Louisan' }] },
        { uri: 'library://track/14', name: 'Das Spiel (Live)', version: 'live', track_number: 14, artists: [{ name: 'Annett Louisan' }] },
      ]);
    });
    expect((await albumTitel('library://album/7', fetchFn)).map((t) => t.name)).toEqual([
      'Das Spiel', 'Das Spiel (Radiomix)', 'Das Spiel (Live)',
    ]);
  });

  it('rejects other uris and works without the album itself', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    expect(await albumTitel('library://track/1', vi.fn())).toBeNull();
    expect(await albumTitel('spotify:album:1', vi.fn())).toBeNull();
    const fetchFn = vi.fn(async (url, opts) => {
      const { command } = JSON.parse(opts.body);
      if (command === 'music/albums/get') return { ok: false, status: 404, text: async () => 'not found' };
      return antwort([{ uri: 'library://track/1', name: 'X', artists: [{ name: 'B' }, { name: 'A' }], album: { artists: [{ name: 'A' }] } }]);
    });
    expect((await albumTitel('library://album/9', fetchFn))[0]).toMatchObject({ artists: [{ name: 'A' }, { name: 'B' }], hauptanzahl: 1 });
  });
});

describe('Genre-Titel: Alben vor Einzeltiteln', () => {
  const antwort = (daten) => ({ ok: true, json: async () => daten });
  afterEach(() => { vi.unstubAllEnvs(); cacheLeeren(); });

  it('lists per artist the albums (oldest first) in track order, then the single tracks', async () => {
    vi.stubEnv('MA_TOKEN', 'geheim');
    const x = [{ name: 'Xavier Naidoo' }];
    const nvdw = { uri: 'library://album/2173', name: 'Nicht von dieser Welt', year: 1997 };
    const live = { uri: 'library://album/2174', name: 'Live', year: 2008 };
    const wett = { uri: 'library://album/2175', name: 'Wettsingen in Schwetzingen', year: null };
    const fetchFn = vi.fn(async () => antwort([
      { uri: 'u:1', name: 'Abschied nehmen', artists: x, album: wett, track_number: 14, disc_number: 0 },
      { uri: 'u:2', name: '20.000 Meilen', artists: x, album: live, track_number: 2, disc_number: 1 },
      { uri: 'u:3', name: 'Zu Hause', artists: x, album: null },
      { uri: 'u:4', name: 'Sie sieht mich nicht', artists: x, album: nvdw, track_number: 5, disc_number: 0 },
      { uri: 'u:5', name: '20.000 Meilen', artists: x, album: nvdw, track_number: 2, disc_number: 0 },
      { uri: 'u:6', name: 'Ich kenne nichts', artists: x, album: live, track_number: 1, disc_number: 2 },
      { uri: 'u:7', name: 'Abgrund', artists: x },
      { uri: 'u:8', name: 'Wir kiffen', artists: [{ name: 'Stefan Raab' }], album: null },
    ]));
    expect((await genreTitel('5', {}, fetchFn)).map((t) => t.uri)).toEqual([
      'u:8', 'u:5', 'u:4', 'u:2', 'u:6', 'u:1', 'u:7', 'u:3',
    ]);
  });
});
