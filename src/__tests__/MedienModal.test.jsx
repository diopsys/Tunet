import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MedienCard from '../components/cards/MedienCard';
import { satAktiv } from '../modals/MedienModal';

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
  it('detects the satellite receiver by the receiver input', () => {
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
    expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.vu', source: 'Das Erste HD' });
    fireEvent.click(screen.getByRole('button', { name: 'Programm hoch' }));
    expect(callService).toHaveBeenCalledWith('media_player', 'media_next_track', { entity_id: 'media_player.vu' });
    fireEvent.click(screen.getByRole('button', { name: /Netflix/ }));
    expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.tv', source: 'Netflix' });
    expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.surround', source: 'TV Audio' });
    fireEvent.click(screen.getByRole('button', { name: /Sat-TV/ }));
    expect(callService).toHaveBeenCalledWith('script', 'turn_on', { entity_id: 'script.sat_tv' });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(callService).toHaveBeenCalledWith('webostv', 'button', { entity_id: 'media_player.tv', button: 'ENTER' });
  });

  it('lists playlists, searches and plays in the room', async () => {
    const callService = oeffnen();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'Musik' }));
    expect(await screen.findByText('Sommer')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Musik suchen'), { target: { value: 'Beatles' } });
    await act(async () => { fireEvent.submit(screen.getByLabelText('Musik suchen').closest('form')); });
    fireEvent.click(await screen.findByText('Yesterday'));
    expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'HEOS Music' });
    expect(callService).toHaveBeenCalledWith('music_assistant', 'play_media', { entity_id: 'media_player.ma', media_id: 'spotify:track:1', media_type: 'track' });
    expect(conn.sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ service: 'search', service_data: { config_entry_id: 'ma1', name: 'Beatles', limit: 5 } }));
  });
});
