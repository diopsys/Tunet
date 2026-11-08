import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MedienCard from '../components/cards/MedienCard';
import { satAktiv } from '../modals/MedienModal';
import { isIdleHeld } from '../utils/idleHold';
import {
  auswahlKlick, ausblendenKonfig, blockSchieben, dauerErgaenzen, fehlendeDauer, laufenderIndex, maAbspielen, ohneAuswahl, spAbspielen, spSpringen, spTitel, zeit,
} from '../modals/medien/musik';
import {
  fetchMedienDauer, fetchMedienGenreAlben, fetchMedienGenreTitel, fetchMedienGenres, fetchMedienPlaylist, saveMedienPlaylist,
} from '../services/settingsApi';

vi.mock('../services/settingsApi', () => ({
  fetchMedienPlaylist: vi.fn(async () => ({ items: [], index: 0 })),
  saveMedienPlaylist: vi.fn(async () => ({})),
  fetchMedienListen: vi.fn(async () => []),
  deleteMedienPlaylist: vi.fn(async () => ({})),
  fetchMedienDauer: vi.fn(async () => ({ aktiv: false, dauer: {} })),
  fetchMedienGenres: vi.fn(async () => ({ aktiv: false, items: [] })),
  fetchMedienGenreAlben: vi.fn(async () => ({ aktiv: false, items: [] })),
  fetchMedienGenreTitel: vi.fn(async () => ({ aktiv: false, items: [] })),
}));

const medien = {
  zone: 'media_player.zone2',
  player: 'media_player.ma',
  name: 'Wohnzimmer',
  quellen: [
    { name: 'Musik', source: 'HEOS Music' },
    { name: 'Platte', source: 'Phono' },
    { name: 'Aus', aus: true },
  ],
  tv: {
    entity: 'media_player.tv',
    surround: 'media_player.surround',
    surroundTvQuelle: 'TV Audio',
    apps: [{ name: 'Netflix', source: 'Netflix' }],
    sat: { entity: 'media_player.vu', surroundQuelle: 'Vu-Plus Duo', script: 'script.sat_tv' },
    fernbedienung: 'webostv',
  },
  musik: { maEintrag: 'ma1', zoneQuelle: 'HEOS Music' },
};

const basis = {
  'media_player.zone2': { state: 'off', attributes: {} },
  'media_player.ma': { state: 'idle', attributes: {} },
  'media_player.tv': { state: 'on', attributes: { source: 'HDMI 2', friendly_name: 'Fernseher' } },
  'media_player.surround': { state: 'on', attributes: { source: 'Vu-Plus Duo', volume_level: 0.3 } },
  'media_player.vu': { state: 'on', attributes: { media_channel: 'ZDF HD', media_series_title: 'heute journal', media_start_time: '21:45', media_end_time: '22:15', source: 'ZDF HD', source_list: ['Das Erste HD', 'ZDF HD'] } },
};

const conn = {
  sendMessagePromise: vi.fn(async (msg) => {
    if (msg.service === 'get_library') return { response: { items: [{ uri: 'library://playlist/1', name: 'Sommer', media_type: 'playlist' }] } };
    if (msg.service === 'search') return { response: { tracks: [{ uri: 'spotify:track:1', name: 'Yesterday', media_type: 'track', artists: [{ name: 'The Beatles' }] }], albums: [] } };
    return {};
  }),
};

const oeffnen = (callService = vi.fn(), entities = basis) => {
  const r = render(<MedienCard cardId="m" entities={entities} settings={{ medien }} callService={callService} conn={conn} getEntityImageUrl={(u) => u} />);
  fireEvent.click(r.container.firstChild);
  return callService;
};

describe('Medien-Fenster', () => {
  it('detects the satellite receiver by the receiver input', async () => {
    expect(satAktiv(medien.tv, basis)).toBe(true);
    expect(satAktiv(medien.tv, { ...basis, 'media_player.surround': { state: 'on', attributes: { source: 'TV Audio' } } })).toBe(false);
  });

  it('opens from the card, shows the channel and closes again', async () => {
    oeffnen();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('ZDF HD').length).toBeGreaterThan(0);
    expect(screen.getByText('heute journal · 21:45–22:15')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('switches channels, starts apps on the TV and uses the remote', async () => {
    const callService = oeffnen();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Das Erste HD' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.vu', source: 'Das Erste HD' }));
    fireEvent.click(screen.getByRole('button', { name: 'Programm hoch' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'media_next_track', { entity_id: 'media_player.vu' }));
    fireEvent.click(screen.getByRole('button', { name: /Netflix/ }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.tv', source: 'Netflix' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.surround', source: 'TV Audio' }));
    fireEvent.click(screen.getByRole('button', { name: /Sat-TV/ }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('script', 'turn_on', { entity_id: 'script.sat_tv' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('webostv', 'button', { entity_id: 'media_player.tv', button: 'ENTER' }));
  });

  it('normalises SpotifyPlus entries and formats times like Winamp', async () => {
    expect(spTitel({ added_at: 'x', track: { uri: 'spotify:track:1', name: 'A', type: 'track', image_url: 'b', duration_ms: 164750, artists: [{ name: 'X' }] } }))
      .toEqual({ uri: 'spotify:track:1', name: 'A', artist: 'X', dauer: 165, image: 'b', media_type: 'track', quelle: 'spotify' });
    expect(spTitel({})).toBeNull();
    expect(zeit(162)).toBe('2:42');
    expect(zeit(34665)).toBe('9:37:45');
  });

  it('plays a list from the clicked title on, like Winamp', async () => {
    const cfg = { ...medien, musik: { ...medien.musik, spotify: { entity: 'media_player.sp', geraet: 'Marantz' } } };
    const items = [{ uri: 'library://track/1', name: 'Eins' }, { uri: 'library://track/2', name: 'Zwei' }, { uri: 'library://track/3', name: 'Drei' }];
    expect(maAbspielen(cfg, items, 1).at(-1)).toEqual(['music_assistant', 'play_media', {
      entity_id: 'media_player.ma', media_id: ['library://track/2', 'library://track/3'], media_type: 'track', enqueue: 'replace',
    }]);
    expect(spAbspielen(cfg, [{ uri: 'spotify:track:1' }, { uri: 'spotify:track:2' }], 1, 'spotify:playlist:9').at(-1))
      .toEqual(['spotifyplus', 'player_media_play_context', { entity_id: 'media_player.sp', context_uri: 'spotify:playlist:9', offset_position: 1, device_id: 'Marantz' }]);
    expect(spAbspielen(cfg, [{ uri: 'spotify:track:1' }, { uri: 'spotify:track:2' }], 0).at(-1)[2].uris).toBe('spotify:track:1,spotify:track:2');
    expect(spSpringen(cfg, 2)).toHaveLength(2);
    expect(laufenderIndex(items, { attributes: { media_title: 'drei' } }, 0)).toBe(2);
  });

  it('switches the room to the player input only when needed', async () => {
    const items = [{ uri: 'library://track/1', name: 'Eins' }];
    const zone = (state, source) => ({ 'media_player.zone2': { state, attributes: { source } } });
    const dienste = (ents) => maAbspielen(medien, items, 0, ents).map(([, s]) => s);
    expect(dienste(zone('off'))).toEqual(['turn_on', 'select_source', 'play_media']);
    expect(dienste(zone('on', 'Phono'))).toEqual(['turn_on', 'select_source', 'play_media']);
    expect(dienste(zone('on', 'HEOS Music'))).toEqual(['play_media']);
    // HEOS heißt in der Hauptzone „NET“ – derselbe Eingang
    expect(dienste(zone('on', 'NET'))).toEqual(['play_media']);
  });

  it('fills in missing track lengths from Music Assistant', async () => {
    const items = [
      { uri: 'library://track/1', dauer: null },
      { uri: 'library://track/2', dauer: 0 },
      { uri: 'library://track/3', dauer: 180 },
      { uri: 'spotify:track:4', dauer: null },
      { uri: 'library://album/5', media_type: 'album', dauer: null },
      { uri: 'library://track/1', dauer: null },
    ];
    expect(fehlendeDauer(items)).toEqual(['library://track/1', 'library://track/2']);
    const neu = dauerErgaenzen(items, { 'library://track/1': 200, 'library://track/2': 150 });
    expect(neu.map((t) => t.dauer)).toEqual([200, 150, 180, null, null, 200]);
    expect(dauerErgaenzen(items, { 'library://track/9': 99 })).toBe(items);
  });

  it('selects, removes and moves several titles like Winamp', async () => {
    expect(auswahlKlick([], 2)).toEqual([2]);
    expect(auswahlKlick([2], 4, { shift: true }, 2)).toEqual([2, 3, 4]);
    expect(auswahlKlick([2, 4], 4, { mehrfach: true })).toEqual([2]);
    const items = ['a', 'b', 'c', 'd', 'e'].map((uri) => ({ uri }));
    expect(ohneAuswahl(items, [0, 1], 3)).toEqual({ items: [{ uri: 'c' }, { uri: 'd' }, { uri: 'e' }], index: 1 });
    const hoch = blockSchieben(items, [2, 3], 3, -1);
    expect(hoch.items.map((t) => t.uri)).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(hoch.index).toBe(2);
    expect(hoch.auswahl).toEqual([1, 2]);
    expect(blockSchieben(items, [0], 0, -1)).toBeNull();
    expect(ausblendenKonfig({ zone: 'z', musik: { ausblenden: { sekunden: 2, ueber: 'zone' } } })).toEqual({ sekunden: 2, ueber: 'zone' });
    expect(ausblendenKonfig({ musik: { ausblenden: { ueber: 'zone' } } })).toEqual({ sekunden: 4, ueber: 'player' });
  });

  it('fades the player out with Shift+V and plays the selected title after Enter', async () => {
    fetchMedienPlaylist.mockResolvedValue({ items: [{ uri: 'library://track/1', name: 'Eins' }, { uri: 'library://track/2', name: 'Zwei' }], index: 0 });
    const callService = vi.fn();
    const cfg = { ...medien, musik: { ...medien.musik, ausblenden: { sekunden: 0.25 } } };
    const ents = {
      ...basis,
      'media_player.tv': { state: 'off', attributes: {} },
      'media_player.vu': { state: 'off', attributes: {} },
      'media_player.zone2': { state: 'on', attributes: { source: 'HEOS Music', volume_level: 0.4 } },
      'media_player.ma': { state: 'playing', attributes: { media_title: 'Eins', volume_level: 0.5 } },
    };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien: cfg }} callService={callService} conn={{ sendMessagePromise: vi.fn(async () => ({ response: { items: [] } })) }} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByText('Zwei', { selector: '.wa-playlist .name' }));
    // Tasten aus dem Fenster heraus (die Kachel stoppt sie beim Hochblubbern)
    fireEvent.keyDown(screen.getByLabelText('Playlist Editor'), { key: 'V', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('Playlist Editor'), { key: 'Enter' });
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'media_stop', { entity_id: 'media_player.ma' }), { timeout: 2000 });
    const lautstaerken = callService.mock.calls.filter(([, s, d]) => s === 'volume_set' && d.entity_id === 'media_player.ma').map(([, , d]) => d.volume_level);
    expect(lautstaerken[0]).toBe(0);
    // Zone bleibt unberührt, danach startet der gewählte Titel
    expect(callService.mock.calls.some(([, s, d]) => s === 'volume_set' && d.entity_id === 'media_player.zone2')).toBe(false);
    await waitFor(() => expect(callService).toHaveBeenCalledWith('music_assistant', 'play_media', {
      entity_id: 'media_player.ma', media_id: ['library://track/2'], media_type: 'track', enqueue: 'replace',
    }), { timeout: 2000 });
    // alte Lautstärke ist schon vor dem Start des neuen Titels zurück
    const reihenfolge = callService.mock.calls.map(([, s, d]) => (s === 'volume_set' ? `vol:${d.volume_level}` : s));
    expect(reihenfolge.indexOf('vol:0.5')).toBeGreaterThan(reihenfolge.indexOf('media_stop'));
    expect(reihenfolge.indexOf('vol:0.5')).toBeLessThan(reihenfolge.lastIndexOf('play_media'));
    fetchMedienPlaylist.mockResolvedValue({ items: [], index: 0 });
  });

  it('holds the return to the start page while the Winamp window is open', async () => {
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={vi.fn()} conn={{ sendMessagePromise: vi.fn(async () => ({ response: { items: [] } })) }} getEntityImageUrl={(u) => u} />);
    expect(isIdleHeld()).toBe(false);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.querySelector('.wa-playlist')).not.toBeNull());
    expect(isIdleHeld()).toBe(true);
    r.unmount();
    expect(isIdleHeld()).toBe(false);
  });

  it('saves the playlist under a name', async () => {
    fetchMedienPlaylist.mockResolvedValue({ items: [{ uri: 'library://track/1', name: 'Eins' }], index: 0 });
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={vi.fn()} conn={{ sendMessagePromise: vi.fn(async () => ({ response: { items: [] } })) }} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    await screen.findByText('Eins', { selector: '.wa-playlist .name' });
    fireEvent.click(screen.getByRole('button', { name: 'Als Playlist speichern' }));
    fireEvent.change(screen.getByLabelText('Name der Playlist'), { target: { value: 'Party' } });
    fireEvent.submit(screen.getByLabelText('Name der Playlist').closest('form'));
    await waitFor(() => expect(saveMedienPlaylist).toHaveBeenCalledWith('m/listen/Party', { items: [{ uri: 'library://track/1', name: 'Eins' }], index: 0 }));
    fetchMedienPlaylist.mockResolvedValue({ items: [], index: 0 });
  });

  it('controls the volume with the arrow keys while the main window is active', async () => {
    const callService = vi.fn();
    const ents = {
      ...basis,
      'media_player.tv': { state: 'off', attributes: {} },
      'media_player.vu': { state: 'off', attributes: {} },
      'media_player.zone2': { state: 'on', attributes: { source: 'HEOS Music', volume_level: 0.4 } },
    };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={callService} conn={{ sendMessagePromise: vi.fn(async () => ({ response: { items: [] } })) }} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('Winamp').className).toContain('wa-aktiv');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'volume_set', { entity_id: 'media_player.zone2', volume_level: 0.42 }));
    // Playlist anklicken: Pfeiltasten wählen dort, die Lautstärke bleibt
    fireEvent.pointerDown(screen.getByLabelText('Playlist Editor'));
    callService.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(callService).not.toHaveBeenCalled();
  });

  it('shows the Winamp windows and plays from the local library and Spotify playlists', async () => {
    const callService = vi.fn();
    const mitSpotify = { ...medien, musik: { ...medien.musik, spotify: { entity: 'media_player.spotifyplus', geraet: 'Marantz' } } };
    const spConn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.domain === 'spotifyplus' && msg.service === 'get_playlist_favorites') {
          return { response: { result: { items: [{ uri: 'spotify:playlist:5G', name: 'Deutscher Rock', type: 'playlist' }] } } };
        }
        if (msg.domain === 'spotifyplus' && msg.service === 'get_playlist_items') {
          return { response: { result: { items: [{ track: { uri: 'spotify:track:7', name: 'Lieblingslied', type: 'track', duration_ms: 200000 } }] } } };
        }
        if (msg.service === 'get_library') {
          return { response: { items: [
            { uri: 'library://track/1', name: 'Vom NAS', media_type: 'track', artists: [{ name: 'Band' }] },
            { uri: 'library://track/2', name: 'Auch vom NAS', media_type: 'track' },
            { uri: 'spotify--x://track/9', name: 'Importiert', media_type: 'track' },
          ] } };
        }
        return {};
      }),
    };
    const ents = {
      ...basis,
      'media_player.tv': { state: 'off', attributes: {} },
      'media_player.vu': { state: 'off', attributes: {} },
      'media_player.spotifyplus': { state: 'idle', attributes: {} },
    };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien: mitSpotify }} callService={callService} conn={spConn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    expect(screen.getByRole('tab', { name: 'Musik' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Playlist Editor')).toBeTruthy();

    // Lokale Bibliothek: Spotify-Importe ausgeblendet, Doppeltippen spielt ab dort
    fireEvent.doubleClick(await screen.findByText('Band - Vom NAS'));
    expect(screen.queryByText('Importiert')).toBeNull();
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'HEOS Music' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('music_assistant', 'play_media', {
      entity_id: 'media_player.ma', media_id: ['library://track/1', 'library://track/2'], media_type: 'track', enqueue: 'replace',
    }));
    expect(await screen.findByText('Auch vom NAS', { selector: '.wa-playlist .name' })).toBeTruthy();

    // Spotify-Playlist öffnen (zweimal antippen) und Titel im Kontext abspielen
    const spOrdner = screen.getAllByRole('button', { name: 'Playlists' }).at(-1);
    fireEvent.click(spOrdner);
    const pl = await screen.findByText('Deutscher Rock');
    // echter Doppelklick (Klick, Klick, Doppelklick) öffnet nur – kein Abspielen
    fireEvent.click(pl);
    fireEvent.click(pl);
    fireEvent.doubleClick(pl);
    const titel = await screen.findByText('Lieblingslied');
    expect(callService.mock.calls.some(([d]) => d === 'spotifyplus')).toBe(false);
    // Doppelklick auf den Titel erst nach der Sperre nach dem Öffnen
    const uhr = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    fireEvent.doubleClick(titel);
    uhr.mockRestore();
    await waitFor(() => expect(callService).toHaveBeenCalledWith('spotifyplus', 'player_media_play_context', {
      entity_id: 'media_player.spotifyplus', context_uri: 'spotify:playlist:5G', offset_position: 0, device_id: 'Marantz',
    }));
  });

  it('searches while typing and shows the track lengths from Music Assistant', async () => {
    const suchConn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.service === 'search') {
          return { response: { tracks: [{ uri: 'library://track/7', name: 'Danke', media_type: 'track', artists: [{ name: 'Wise Guys' }] }], albums: [] } };
        }
        return { response: { items: [] } };
      }),
    };
    fetchMedienDauer.mockImplementation(async (uris) => ({ aktiv: true, dauer: uris.includes('library://track/7') ? { 'library://track/7': 158 } : {} }));
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={vi.fn()} conn={suchConn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Musik suchen'), { target: { value: 'W' } });
    fireEvent.change(screen.getByLabelText('Musik suchen'), { target: { value: 'Wise' } });
    // ohne Enter: Suche nach kurzer Pause, nur einmal und mit dem ganzen Text
    expect(await screen.findByText('Wise Guys - Danke')).toBeTruthy();
    const suchen = suchConn.sendMessagePromise.mock.calls.filter(([m]) => m.service === 'search');
    expect(suchen.map(([m]) => m.service_data.name)).toEqual(['Wise']);
    expect(await screen.findByText('2:38')).toBeTruthy();

    // im Ordner „Künstler“ nur Künstler suchen
    fireEvent.click(screen.getAllByRole('button', { name: 'Künstler' })[0]);
    await waitFor(() => expect(suchConn.sendMessagePromise.mock.calls.filter(([m]) => m.service === 'search')).toHaveLength(2));
    const kuenstler = suchConn.sendMessagePromise.mock.calls.filter(([m]) => m.service === 'search').at(-1)[0].service_data;
    expect(kuenstler).toMatchObject({ name: 'Wise', media_type: ['artist'] });
    expect(await screen.findByText('Suche: Wise in Künstler')).toBeTruthy();
    expect(screen.queryByText('Wise Guys - Danke')).toBeNull();
    fetchMedienDauer.mockImplementation(async () => ({ aktiv: false, dauer: {} }));
  });

  it('browses genres: genre opens its albums, an album its tracks', async () => {
    fetchMedienGenres.mockImplementation(async ({ suche } = {}) => ({
      aktiv: true,
      items: [{ id: '3', name: 'Rock', alben: 2 }, { id: '8', name: 'Reggae', alben: 1 }].filter((g) => !suche || g.name.includes(suche)),
    }));
    fetchMedienGenreAlben.mockImplementation(async () => ({
      aktiv: true, items: [{ uri: 'library://album/4', name: 'Aqualung', artists: [{ name: 'Jethro Tull' }], media_type: 'album' }],
    }));
    const callService = vi.fn();
    const gConn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.type === 'media_player/browse_media') {
          return { children: [{ media_content_id: 'library://track/40', title: 'Jethro Tull - Aqualung', media_class: 'track', can_expand: false }] };
        }
        return { response: { items: [] } };
      }),
    };
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={callService} conn={gConn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByRole('button', { name: 'Genres' }));
    expect(await screen.findByText('Reggae')).toBeTruthy();
    expect(screen.getByText('Genre · 2')).toBeTruthy();

    // Suche im Ordner filtert die Genres
    fireEvent.change(screen.getByLabelText('Musik suchen'), { target: { value: 'Ro' } });
    expect(await screen.findByText('Suche: Ro in Genres')).toBeTruthy();
    expect(screen.queryByText('Reggae')).toBeNull();

    // „Play“ auf einem Genre öffnet es (abspielen lässt sich nur ein Titel)
    fireEvent.click(screen.getByText('Rock'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Media Library' })).getByRole('button', { name: 'Abspielen (Enter)' }));
    const album = await screen.findByText('Jethro Tull - Aqualung');
    expect(fetchMedienGenreAlben).toHaveBeenCalledWith('3');
    expect(fetchMedienGenreTitel).toHaveBeenCalledWith('3');
    expect(callService.mock.calls.some(([d, s]) => d === 'music_assistant' && s === 'play_media')).toBe(false);
    fireEvent.click(album);
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    await waitFor(() => expect(gConn.sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'library://album/4' })));
    const lib = within(screen.getByRole('region', { name: 'Media Library' }));
    fireEvent.click(await lib.findByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText('Jethro Tull - Aqualung')).toBeTruthy();
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: false, items: [] }));
    fetchMedienGenreAlben.mockImplementation(async () => ({ aktiv: false, items: [] }));
  });

  it('lists the tracks of a genre below its albums and loads more', async () => {
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: true, items: [{ id: '3', name: 'Rock', alben: 1 }] }));
    fetchMedienGenreAlben.mockImplementation(async () => ({
      aktiv: true, items: [{ uri: 'library://album/4', name: 'Aqualung', artists: [{ name: 'Jethro Tull' }], media_type: 'album' }],
    }));
    const seite = Array.from({ length: 500 }, (_, i) => ({
      uri: `library://track/${i}`, name: `Titel ${i}`, artists: [{ name: 'Band' }], duration: 200, media_type: 'track',
    }));
    fetchMedienGenreTitel.mockImplementation(async (id, offset = 0) => ({
      aktiv: true, items: offset ? [{ uri: 'library://track/999', name: 'Letzter', artists: [{ name: 'Band' }], duration: 61, media_type: 'track' }] : seite,
    }));
    const callService = vi.fn();
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={callService} conn={conn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByRole('button', { name: 'Genres' }));
    fireEvent.click(await screen.findByText('Rock'));
    fireEvent.click(screen.getByText('Rock'));
    expect(await screen.findByText('Band - Titel 0')).toBeTruthy();
    const lib = within(screen.getByRole('region', { name: 'Media Library' }));
    const zeilen = lib.getAllByRole('button').map((b) => b.textContent);
    expect(zeilen.findIndex((t) => t.includes('Aqualung'))).toBeLessThan(zeilen.findIndex((t) => t.includes('Titel 0')));
    expect(lib.getAllByText('3:20').length).toBe(500);
    fireEvent.click(lib.getByText('… weitere laden'));
    expect(await lib.findByText('Band - Letzter')).toBeTruthy();
    expect(fetchMedienGenreTitel).toHaveBeenLastCalledWith('3', 500);
    expect(lib.queryByText('… weitere laden')).toBeNull();
    const jetzt = Date.now();
    const uhr = vi.spyOn(Date, 'now').mockReturnValue(jetzt + 1000);
    fireEvent.doubleClick(lib.getByText('Band - Titel 1'));
    uhr.mockRestore();
    await waitFor(() => expect(callService).toHaveBeenCalledWith('music_assistant', 'play_media', expect.objectContaining({ media_id: expect.arrayContaining(['library://track/1']) })));
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: false, items: [] }));
    fetchMedienGenreAlben.mockImplementation(async () => ({ aktiv: false, items: [] }));
    fetchMedienGenreTitel.mockImplementation(async () => ({ aktiv: false, items: [] }));
  });

  it('shows the error of Music Assistant in the genre folder', async () => {
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: true, items: [], fehler: 'Music Assistant 400: invalid media_type' }));
    oeffnen(vi.fn(), { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } });
    await screen.findByRole('dialog');
    fireEvent.click(await screen.findByRole('button', { name: 'Genres' }));
    expect(await screen.findByText('Fehler: Music Assistant 400: invalid media_type')).toBeTruthy();
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: false, items: [] }));
  });

  it('hides the genres without Music Assistant access on the server', async () => {
    fetchMedienGenres.mockClear();
    fetchMedienGenres.mockImplementation(async () => ({ aktiv: false, items: [] }));
    oeffnen(vi.fn(), { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fetchMedienGenres).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Alben' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Genres' })).toBeNull();
  });

  it('opens an album without playing the track under the second click', async () => {
    const callService = vi.fn();
    const albumConn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.service === 'search') return { response: { albums: [{ uri: 'library://album/1', name: 'Gern geschehen', media_type: 'album' }] } };
        if (msg.type === 'media_player/browse_media') {
          return { children: [
            { media_content_id: 'library://track/1', title: 'Blumentopf - Eins', media_class: 'track', can_expand: false },
            { media_content_id: 'library://track/2', title: 'Blumentopf - Zwei', media_class: 'track', can_expand: false },
          ] };
        }
        return { response: { items: [] } };
      }),
    };
    const ents = { ...basis, 'media_player.tv': { state: 'off', attributes: {} }, 'media_player.vu': { state: 'off', attributes: {} } };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien }} callService={callService} conn={albumConn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Alben' })[0]);
    fireEvent.change(screen.getByLabelText('Musik suchen'), { target: { value: 'Gern' } });
    const album = await screen.findByText('Gern geschehen');
    // Album ist schon markiert: der erste Klick des Doppelklicks öffnet es
    fireEvent.click(album);
    fireEvent.click(album);
    const titel = await screen.findByText('Blumentopf - Zwei');
    fireEvent.click(titel);
    fireEvent.doubleClick(titel);
    await new Promise((ok) => { setTimeout(ok, 50); });
    expect(callService.mock.calls.some(([d, s]) => d === 'music_assistant' && s === 'play_media')).toBe(false);
    // ein späterer Doppelklick spielt den Titel
    const jetzt = Date.now();
    const uhr = vi.spyOn(Date, 'now').mockReturnValue(jetzt + 1000);
    fireEvent.doubleClick(screen.getByText('Blumentopf - Zwei'));
    uhr.mockRestore();
    await waitFor(() => expect(callService).toHaveBeenCalledWith('music_assistant', 'play_media', expect.objectContaining({ media_id: ['library://track/2'] })));
  });

  it('shows the Spotify queue as playlist and jumps there with skip', async () => {
    const callService = vi.fn();
    const mitSpotify = { ...medien, musik: { ...medien.musik, spotify: { entity: 'media_player.spotifyplus', geraet: 'Marantz' } } };
    const spConn = {
      sendMessagePromise: vi.fn(async (msg) => {
        if (msg.service === 'get_player_queue_info') {
          return { response: { result: {
            currently_playing: { uri: 'spotify:track:1', name: 'Jetzt', type: 'track' },
            queue: [{ uri: 'spotify:track:2', name: 'Danach', type: 'track' }, { uri: 'spotify:track:3', name: 'Später', type: 'track' }],
          } } };
        }
        return { response: { items: [] } };
      }),
    };
    const ents = {
      ...basis,
      'media_player.tv': { state: 'off', attributes: {} },
      'media_player.vu': { state: 'off', attributes: {} },
      'media_player.spotifyplus': { state: 'playing', attributes: { source: 'Marantz', media_title: 'Jetzt' } },
    };
    const r = render(<MedienCard cardId="m" entities={ents} settings={{ medien: mitSpotify }} callService={callService} conn={spConn} getEntityImageUrl={(u) => u} />);
    fireEvent.click(r.container.firstChild);
    await screen.findByRole('dialog');
    fireEvent.doubleClick(await screen.findByText('Später'));
    await waitFor(() => expect(callService.mock.calls.filter(([d, s]) => d === 'spotifyplus' && s === 'player_media_skip_next')).toHaveLength(2));
  });
});
