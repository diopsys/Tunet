import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MedienCard, { beideZonenAktionen, medienModus, nacheinander, playAktionen, quelleAktiv, quellenAktionen, resolveMedienConfig } from '../components/cards/MedienCard';

const medien = {
  zone: 'media_player.zone2',
  player: 'media_player.ma',
  name: 'Wohnzimmer',
  quellen: [
    { name: 'Musik', icon: 'mdi:music', source: 'HEOS Music' },
    { name: 'Platte', icon: 'mdi:album', source: 'Phono' },
    { name: 'TV', icon: 'mdi:television', einschalten: ['media_player.tv', 'media_player.surround'] },
    { name: 'Aus', aus: true },
  ],
  url: '/music-assistant',
};

const entities = {
  'media_player.zone2': { state: 'on', attributes: { source: 'HEOS Music', volume_level: 0.35, friendly_name: 'Marantz Wohnzimmer' } },
  'media_player.ma': { state: 'playing', attributes: { media_title: 'Song', media_artist: 'Band', entity_picture: '/api/bild' } },
  'media_player.tv': { state: 'off', attributes: {} },
};

describe('Medien-Kachel', () => {
  it('resolves config and ignores invalid entries', async () => {
    const c = resolveMedienConfig({ medien: { ...medien, quellen: [...medien.quellen, null, { icon: 'x' }], url: 'javascript:x' } });
    expect(c.quellen).toHaveLength(4);
    expect(c.url).toBeNull();
    expect(resolveMedienConfig({}).quellen).toEqual([]);
  });

  it('knows which source is active', async () => {
    const zone = entities['media_player.zone2'];
    expect(quelleAktiv(medien.quellen[0], zone, entities)).toBe(true);
    expect(quelleAktiv(medien.quellen[1], zone, entities)).toBe(false);
    expect(quelleAktiv(medien.quellen[2], zone, entities)).toBe(false); // TV aus
    expect(quelleAktiv(medien.quellen[3], { state: 'off' }, entities)).toBe(true);
  });

  it('builds the actions of a source button', async () => {
    expect(quellenAktionen(medien.quellen[1], 'media_player.zone2')).toEqual([
      ['media_player', 'turn_on', { entity_id: 'media_player.zone2' }],
      ['media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'Phono' }],
    ]);
    expect(quellenAktionen(medien.quellen[2], 'media_player.zone2')).toEqual([
      ['media_player', 'turn_on', { entity_id: 'media_player.tv' }],
      ['media_player', 'turn_on', { entity_id: 'media_player.surround' }],
    ]);
    expect(quellenAktionen({ name: 'S', script: 'script.x' }, null)).toEqual([['script', 'turn_on', { entity_id: 'script.x' }]]);
    expect(quellenAktionen(medien.quellen[3], 'media_player.zone2')).toEqual([['media_player', 'turn_off', { entity_id: 'media_player.zone2' }]]);
  });

  it('shows what plays, volume and controls the zone and player', async () => {
    const callService = vi.fn();
    render(<MedienCard cardId="medien_card_1" entities={entities} settings={{ medien }} callService={callService} getEntityImageUrl={(u) => u} />);
    expect(screen.getByText('Song')).toBeTruthy();
    expect(screen.getByText('Band')).toBeTruthy();
    expect(screen.getByText('Wohnzimmer')).toBeTruthy();
    expect(screen.getByText('35 %')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Musik/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'media_play_pause', { entity_id: 'media_player.ma' }));

    fireEvent.click(screen.getByRole('button', { name: /Platte/ }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'Phono' }));

    fireEvent.change(screen.getByLabelText('Lautstärke'), { target: { value: '50' } });
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'volume_set', { entity_id: 'media_player.zone2', volume_level: 0.5 }));
  });

  it('shows the TV with its app and controls the surround while only the TV runs', async () => {
    const callService = vi.fn();
    const mitTv = { ...medien, tv: { entity: 'media_player.tv', surround: 'media_player.surround' } };
    const tvAn = {
      'media_player.zone2': { state: 'off', attributes: {} },
      'media_player.ma': { state: 'idle', attributes: { media_title: 'Alter Titel' } },
      'media_player.tv': { state: 'on', attributes: { friendly_name: 'Fernseher', source: 'Prime Video', entity_picture: '/api/app' } },
      'media_player.surround': { state: 'on', attributes: { volume_level: 0.4 } },
    };
    expect(medienModus(resolveMedienConfig({ medien: mitTv }), tvAn)).toBe('tv');
    render(<MedienCard cardId='m' entities={tvAn} settings={{ medien: mitTv }} callService={callService} getEntityImageUrl={(u) => u} />);
    expect(screen.getByText('Fernseher')).toBeTruthy();
    expect(screen.getByText('Prime Video')).toBeTruthy();
    expect(screen.queryByText('Alter Titel')).toBeNull();
    expect(screen.getByText('40 %')).toBeTruthy();
    expect(screen.getByRole('button', { name: /TV/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Lautstärke'), { target: { value: '30' } });
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'volume_set', { entity_id: 'media_player.surround', volume_level: 0.3 }));
    fireEvent.click(screen.getByRole('button', { name: /Aus/ }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.tv' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.surround' }));
  });

  it('shows a forgotten satellite receiver and switches it off with the rest', async () => {
    const callService = vi.fn();
    const mitSat = { ...medien, tv: { entity: 'media_player.tv', surround: 'media_player.surround', sat: { entity: 'media_player.vu', surroundQuelle: 'Vu-Plus Duo' } } };
    const nurSat = {
      'media_player.zone2': { state: 'off', attributes: {} },
      'media_player.ma': { state: 'idle', attributes: { media_title: 'Alter Titel' } },
      'media_player.tv': { state: 'off', attributes: {} },
      'media_player.surround': { state: 'off', attributes: {} },
      'media_player.vu': { state: 'on', attributes: { media_channel: 'ZDF HD' } },
    };
    expect(medienModus(resolveMedienConfig({ medien: mitSat }), nurSat)).toBe('sat');
    render(<MedienCard cardId='m' entities={nurSat} settings={{ medien: mitSat }} callService={callService} getEntityImageUrl={(u) => u} />);
    expect(screen.getByText('Sat-Receiver an')).toBeTruthy();
    expect(screen.getByText('ZDF HD · Fernseher aus')).toBeTruthy();
    expect(screen.queryByLabelText('Lautstärke')).toBeNull();
    expect(screen.queryByText('Alter Titel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Aus/ }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.vu' }));
    await waitFor(() => expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.tv' }));
  });

  it('switches the room to the player input before playing', async () => {
    const cfg = resolveMedienConfig({ medien: { ...medien, musik: { zoneQuelle: 'HEOS Music' } } });
    expect(playAktionen(cfg, { 'media_player.zone2': { state: 'off' } })).toEqual([
      ['media_player', 'turn_on', { entity_id: 'media_player.zone2' }],
      ['media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'HEOS Music' }],
      ['media_player', 'media_play_pause', { entity_id: 'media_player.ma' }],
    ]);
    expect(playAktionen(cfg, entities)).toEqual([['media_player', 'media_play_pause', { entity_id: 'media_player.ma' }]]);
  });

  it('copies the running zone source to the other zone', async () => {
    const z2 = (state, source) => ({ state, attributes: { source, source_list: ['HEOS Music', 'NET', 'Phono', 'SOURCE'] } });
    const z1 = (state, source) => ({ state, attributes: { source, source_list: ['HEOS Music', 'Phono', 'TV Audio', 'Vu-Plus Duo'] } });
    expect(beideZonenAktionen('z2', 'z1', { z2: z2('on', 'Phono'), z1: z1('off') })).toEqual([
      ['media_player', 'turn_on', { entity_id: 'z1' }], ['media_player', 'select_source', { entity_id: 'z1', source: 'Phono' }],
    ]);
    expect(beideZonenAktionen('z2', 'z1', { z2: z2('on', 'NET'), z1: z1('off') })[1][2].source).toBe('HEOS Music');
    expect(beideZonenAktionen('z2', 'z1', { z2: z2('off'), z1: z1('on', 'Vu-Plus Duo') })[1][2].source).toBe('SOURCE');
    expect(beideZonenAktionen('z2', 'z1', { z2: z2('on', 'NET'), z1: z1('on', 'NET') })).toEqual([['media_player', 'turn_off', { entity_id: 'z1' }]]);
    expect(beideZonenAktionen('z2', 'z1', { z2: z2('on', 'SOURCE'), z1: z1('on', 'TV Audio') }, true)).toEqual([['media_player', 'turn_off', { entity_id: 'z2' }]]);
  });

  it('shows the zone as off without player title', async () => {
    render(<MedienCard cardId="m" entities={{ 'media_player.zone2': { state: 'off', attributes: {} } }} settings={{ medien: { ...medien, player: null } }} />);
    expect(screen.getAllByText('Aus')).toHaveLength(2); // Zustand und Knopf
    expect(screen.queryByLabelText('Lautstärke')).toBeNull();
  });

  it('shows a hint instead of an empty card while not configured', async () => {
    render(<MedienCard cardId="m" entities={{}} settings={{}} callService={vi.fn()} />);
    expect(screen.getByText('Noch nicht belegt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Medien öffnen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('pauses without waking the room', async () => {
    const cfg = resolveMedienConfig({ medien: { ...medien, musik: { zoneQuelle: 'HEOS Music' } } });
    const zoneAus = { ...entities, 'media_player.zone2': { state: 'off' } };
    // Player spielt (z. B. Spotify auf einem anderen Gerät): nur Pause, Receiver bleibt aus
    expect(playAktionen(cfg, zoneAus)).toEqual([['media_player', 'media_play_pause', { entity_id: 'media_player.ma' }]]);
  });

  it('waits for each action before the next one', async () => {
    let fertig;
    const callService = vi.fn((d, s) => (s === 'turn_on' ? new Promise((r) => { fertig = r; }) : Promise.resolve()));
    const lauf = nacheinander(callService, quellenAktionen(medien.quellen[1], 'media_player.zone2'));
    await Promise.resolve();
    expect(callService).toHaveBeenCalledTimes(1);
    fertig();
    await lauf;
    expect(callService).toHaveBeenLastCalledWith('media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'Phono' });
  });

  it('opens the window only for Enter on the card itself', async () => {
    const callService = vi.fn();
    const r = render(<MedienCard cardId="m" entities={entities} settings={{ medien }} callService={callService} getEntityImageUrl={(u) => u} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pause' }), { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(r.container.firstChild, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('sends only one volume command at a time', async () => {
    let fertig;
    const callService = vi.fn(() => new Promise((r) => { fertig = r; }));
    render(<MedienCard cardId="m" entities={entities} settings={{ medien }} callService={callService} getEntityImageUrl={(u) => u} />);
    const regler = screen.getByLabelText('Lautstärke');
    fireEvent.change(regler, { target: { value: '25' } });
    fireEvent.change(regler, { target: { value: '30' } });
    fireEvent.change(regler, { target: { value: '45' } });
    expect(callService).toHaveBeenCalledTimes(1);
    expect(screen.getByText('45 %')).toBeTruthy();
    fertig();
    await waitFor(() => expect(callService.mock.calls.map((c) => c[2].volume_level)).toEqual([0.25, 0.45]));
  });
});
