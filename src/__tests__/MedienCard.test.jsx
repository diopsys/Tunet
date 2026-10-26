import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MedienCard, { medienModus, quelleAktiv, quellenAktionen, resolveMedienConfig } from '../components/cards/MedienCard';

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
  it('resolves config and ignores invalid entries', () => {
    const c = resolveMedienConfig({ medien: { ...medien, quellen: [...medien.quellen, null, { icon: 'x' }], url: 'javascript:x' } });
    expect(c.quellen).toHaveLength(4);
    expect(c.url).toBeNull();
    expect(resolveMedienConfig({}).quellen).toEqual([]);
  });

  it('knows which source is active', () => {
    const zone = entities['media_player.zone2'];
    expect(quelleAktiv(medien.quellen[0], zone, entities)).toBe(true);
    expect(quelleAktiv(medien.quellen[1], zone, entities)).toBe(false);
    expect(quelleAktiv(medien.quellen[2], zone, entities)).toBe(false); // TV aus
    expect(quelleAktiv(medien.quellen[3], { state: 'off' }, entities)).toBe(true);
  });

  it('builds the actions of a source button', () => {
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

  it('shows what plays, volume and controls the zone and player', () => {
    const callService = vi.fn();
    render(<MedienCard cardId="medien_card_1" entities={entities} settings={{ medien }} callService={callService} getEntityImageUrl={(u) => u} />);
    expect(screen.getByText('Song')).toBeTruthy();
    expect(screen.getByText('Band')).toBeTruthy();
    expect(screen.getByText('Wohnzimmer')).toBeTruthy();
    expect(screen.getByText('35 %')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Musik/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(callService).toHaveBeenCalledWith('media_player', 'media_play_pause', { entity_id: 'media_player.ma' });

    fireEvent.click(screen.getByRole('button', { name: /Platte/ }));
    expect(callService).toHaveBeenCalledWith('media_player', 'select_source', { entity_id: 'media_player.zone2', source: 'Phono' });

    fireEvent.change(screen.getByLabelText('Lautstärke'), { target: { value: '50' } });
    expect(callService).toHaveBeenCalledWith('media_player', 'volume_set', { entity_id: 'media_player.zone2', volume_level: 0.5 });
  });

  it('shows the TV with its app and controls the surround while only the TV runs', () => {
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
    expect(callService).toHaveBeenCalledWith('media_player', 'volume_set', { entity_id: 'media_player.surround', volume_level: 0.3 });
    fireEvent.click(screen.getByRole('button', { name: /Aus/ }));
    expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.tv' });
    expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.surround' });
  });

  it('shows a forgotten satellite receiver and switches it off with the rest', () => {
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
    expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.vu' });
    expect(callService).toHaveBeenCalledWith('media_player', 'turn_off', { entity_id: 'media_player.tv' });
  });

  it('shows the zone as off without player title', () => {
    render(<MedienCard cardId="m" entities={{ 'media_player.zone2': { state: 'off', attributes: {} } }} settings={{ medien: { ...medien, player: null } }} />);
    expect(screen.getAllByText('Aus')).toHaveLength(2); // Zustand und Knopf
    expect(screen.queryByLabelText('Lautstärke')).toBeNull();
  });
});
