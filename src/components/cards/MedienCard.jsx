import { memo } from 'react';
import { Music, Pause, Play, Power, SkipBack, SkipForward, Volume2 } from '../../icons';
import { getIconComponent } from '../../icons';
import { openHaPath, safeHaUrl } from './HeizungCard';

/*
 * Medien-Kachel für einen Raum, vollständig über die Kartenoptionen belegt (settings.medien):
 *
 * {
 *   zone: 'media_player.receiver_zone2',   // Raum/Zone: Ein/Aus, Lautstärke, aktuelle Quelle
 *   player?: 'media_player.music_assistant',// zeigt, was läuft (Titel, Cover, ⏮ ⏯ ⏭)
 *   name?: 'Wohnzimmer',                    // Anzeige oben rechts (Standard: Name der Zone)
 *   quellen: [{                             // Knöpfe unten
 *     name, icon?,
 *     source?,                              // Eingang der Zone (Zone einschalten + Quelle wählen)
 *     script?,                              // oder ein Skript starten
 *     einschalten?: ['media_player.tv', …], // oder Geräte einschalten (z. B. Fernseher + Surround)
 *     aus?: true,                           // oder die Zone ausschalten
 *   }],
 *   url?: '/music-assistant',               // Tippen auf die Kachel öffnet diese HA-Seite
 * }
 *
 * Ein Knopf gilt als aktiv, wenn die Zone an ist und seine `source` gewählt ist bzw. das
 * erste Gerät aus `einschalten` an ist.
 */

const AN = ['on', 'playing', 'paused', 'idle', 'buffering'];
const istAn = (e) => Boolean(e) && AN.includes(e.state);

export function resolveMedienConfig(settings) {
  const m = settings?.medien && typeof settings.medien === 'object' ? settings.medien : {};
  return {
    zone: typeof m.zone === 'string' ? m.zone : null,
    player: typeof m.player === 'string' ? m.player : null,
    name: typeof m.name === 'string' ? m.name : null,
    quellen: (Array.isArray(m.quellen) ? m.quellen : []).filter((q) => q && typeof q.name === 'string'),
    url: safeHaUrl(m.url),
  };
}

/** Aktiv-Zustand eines Quellen-Knopfs. */
export function quelleAktiv(quelle, zone, entities) {
  if (quelle.aus) return zone ? zone.state === 'off' : false;
  if (quelle.source) return istAn(zone) && zone.attributes?.source === quelle.source;
  if (Array.isArray(quelle.einschalten) && quelle.einschalten.length) return istAn(entities[quelle.einschalten[0]]);
  return false;
}

/** Aktionen eines Quellen-Knopfs als Liste von [domain, service, data]. */
export function quellenAktionen(quelle, zoneId) {
  if (quelle.aus) return zoneId ? [['media_player', 'turn_off', { entity_id: zoneId }]] : [];
  if (quelle.script) return [['script', 'turn_on', { entity_id: quelle.script }]];
  if (quelle.source && zoneId) {
    return [
      ['media_player', 'turn_on', { entity_id: zoneId }],
      ['media_player', 'select_source', { entity_id: zoneId, source: quelle.source }],
    ];
  }
  if (Array.isArray(quelle.einschalten)) {
    return quelle.einschalten.map((id) => [id.split('.')[0], 'turn_on', { entity_id: id }]);
  }
  return [];
}

const MedienCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, settings, name, callService, getEntityImageUrl }) => {
  const config = resolveMedienConfig(settings);
  const zone = config.zone ? entities[config.zone] : null;
  const player = config.player ? entities[config.player] : null;
  const titel = name || 'Medien';
  const raum = config.name || zone?.attributes?.friendly_name || '';
  const zoneAn = istAn(zone);
  const spielt = player?.state === 'playing';
  const pa = player?.attributes || {};
  const medienTitel = player && pa.media_title ? pa.media_title : zoneAn ? zone?.attributes?.source || 'An' : 'Aus';
  const medienUnter = player && pa.media_title ? pa.media_artist || pa.media_album_name || '' : '';
  const cover = player && pa.entity_picture && getEntityImageUrl ? getEntityImageUrl(pa.entity_picture) : null;
  const lautstaerke = Math.round((zone?.attributes?.volume_level ?? 0) * 100);
  const ruf = (aktionen) => aktionen.forEach(([d, s, data]) => callService?.(d, s, data));
  const stop = (fn) => (e) => { e.stopPropagation(); if (!editMode) fn(); };
  const url = !editMode ? config.url : null;

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback relative flex h-full flex-col gap-2 overflow-hidden rounded-3xl border p-3.5 font-sans select-none ${editMode ? 'cursor-move' : url ? 'cursor-pointer' : ''}`}
      style={cardStyle}
      {...(url ? { role: 'button', tabIndex: 0, 'aria-label': `${titel} öffnen`, onClick: () => openHaPath(url), onKeyDown: (e) => e.key === 'Enter' && openHaPath(url) } : {})}
    >
      {controls}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">{titel}</p>
        {raum && (
          <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${zoneAn ? 'bg-green-400' : 'bg-gray-500 opacity-60'}`} />
            {raum}
          </span>
        )}
      </div>

      {/* Was läuft */}
      <div className="flex min-h-0 flex-1 items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ backgroundColor: 'var(--glass-bg-hover)' }}>
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Music className="h-5 w-5 text-[var(--text-muted)]" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{medienTitel}</span>
          {medienUnter && <span className="truncate text-[11px] text-[var(--text-secondary)]">{medienUnter}</span>}
          {player && (
            <div className="mt-1 flex items-center gap-2 text-[var(--text-secondary)]">
              <button type="button" aria-label="Zurück" onClick={stop(() => callService?.('media_player', 'media_previous_track', { entity_id: config.player }))}><SkipBack className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={spielt ? 'Pause' : 'Abspielen'} onClick={stop(() => callService?.('media_player', 'media_play_pause', { entity_id: config.player }))}>
                {spielt ? <Pause className="h-4 w-4 text-[var(--text-primary)]" /> : <Play className="h-4 w-4 text-[var(--text-primary)]" />}
              </button>
              <button type="button" aria-label="Weiter" onClick={stop(() => callService?.('media_player', 'media_next_track', { entity_id: config.player }))}><SkipForward className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Lautstärke der Zone */}
      {zone && zoneAn && (
        <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Volume2 className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" />
          <input
            type="range" min={0} max={100} step={1} value={lautstaerke} aria-label="Lautstärke"
            onChange={(e) => callService?.('media_player', 'volume_set', { entity_id: config.zone, volume_level: Number(e.target.value) / 100 })}
            className="min-w-0 flex-1 accent-[var(--accent-color)]"
            disabled={editMode}
          />
          <span className="w-8 text-right text-[10px] text-[var(--text-muted)]">{lautstaerke} %</span>
        </label>
      )}

      {/* Quellen */}
      {config.quellen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {config.quellen.map((q) => {
            const aktiv = quelleAktiv(q, zone, entities);
            const Icon = q.aus ? Power : getIconComponent(q.icon || 'mdi:music', Music);
            return (
              <button
                key={q.name}
                type="button"
                aria-pressed={aktiv}
                onClick={stop(() => ruf(quellenAktionen(q, config.zone)))}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold"
                style={aktiv && !q.aus
                  ? { backgroundColor: 'rgba(34,197,94,0.14)', color: '#4ade80' }
                  : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-secondary)' }}
              >
                <Icon className="h-3 w-3" />
                {q.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(MedienCard);
