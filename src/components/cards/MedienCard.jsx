import { lazy, memo, Suspense, useState } from 'react';
import { Music, Pause, Play, Power, SkipBack, SkipForward, Volume2 } from '../../icons';
import { getIconComponent } from '../../icons';
import { openHaPath, safeHaUrl } from './HeizungCard';

const MedienModal = lazy(() => import('../../modals/MedienModal'));

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
 *   tv?: { entity, surround? },             // läuft der Fernseher (und die Zone nicht), zeigt die
 *                                           // Kachel ihn (App/Quelle); Lautstärke dann am Surround
 *   url?: '/music-assistant',               // Link „Bibliothek öffnen“ im Medien-Fenster
 *   musik?: { maEintrag, zoneQuelle? },     // Music Assistant im Reiter Musik (siehe MedienModal)
 * }
 * Tippen auf die Kachel öffnet das Medien-Fenster (Reiter Fernseher/Musik).
 * Weitere tv-Felder (apps, sat, surroundTvQuelle, fernbedienung) siehe MedienModal.
 *
 * Ein Knopf gilt als aktiv, wenn die Zone an ist und seine `source` gewählt ist bzw. das
 * erste Gerät aus `einschalten` an ist. „Aus“ schaltet im TV-Betrieb Fernseher und Surround
 * aus, sonst die Zone.
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
    tv: m.tv && typeof m.tv.entity === 'string'
      ? {
          entity: m.tv.entity,
          surround: typeof m.tv.surround === 'string' ? m.tv.surround : null,
          surroundTvQuelle: typeof m.tv.surroundTvQuelle === 'string' ? m.tv.surroundTvQuelle : null,
          apps: (Array.isArray(m.tv.apps) ? m.tv.apps : []).filter((a) => a && typeof a.name === 'string' && typeof a.source === 'string'),
          sat: m.tv.sat && typeof m.tv.sat.entity === 'string' ? m.tv.sat : null,
          fernbedienung: m.tv.fernbedienung || null,
        }
      : null,
    musik: m.musik && typeof m.musik === 'object' ? m.musik : null,
    url: safeHaUrl(m.url),
  };
}

/** Was die Kachel zeigt: 'zone' (Raum läuft), 'tv' (nur der Fernseher läuft),
 *  'sat' (nur der Sat-Receiver ist noch an) oder 'aus'. */
export function medienModus(config, entities) {
  if (istAn(config.zone ? entities[config.zone] : null)) return 'zone';
  if (config.tv && istAn(entities[config.tv.entity])) return 'tv';
  if (config.tv?.sat?.entity && istAn(entities[config.tv.sat.entity])) return 'sat';
  return 'aus';
}

/** Aktiv-Zustand eines Quellen-Knopfs. */
export function quelleAktiv(quelle, zone, entities) {
  if (quelle.aus) return zone ? zone.state === 'off' : false;
  if (quelle.source) return istAn(zone) && zone.attributes?.source === quelle.source;
  if (Array.isArray(quelle.einschalten) && quelle.einschalten.length) return istAn(entities[quelle.einschalten[0]]);
  return false;
}

/** Abspielen/Pause: ist der Raum aus, erst auf den Eingang des Players stellen – sonst
 *  weckt der Player (z. B. HEOS) die Hauptzone des Receivers statt des Raums. */
export function playAktionen(config, entities, playerId = config.player) {
  const zone = config.zone ? entities[config.zone] : null;
  const vorher = config.zone && config.musik?.zoneQuelle && !istAn(zone)
    ? [
        ['media_player', 'turn_on', { entity_id: config.zone }],
        ['media_player', 'select_source', { entity_id: config.zone, source: config.musik.zoneQuelle }],
      ]
    : [];
  return [...vorher, ['media_player', 'media_play_pause', { entity_id: playerId }]];
}

// Quelle der laufenden Zone in der anderen Zone: HEOS heißt in der Hauptzone „NET“;
// kennt die Zielzone die Quelle nicht, folgt Zone 2 per „SOURCE“ der Hauptzone
function quelleFuer(ziel, quelle) {
  const liste = ziel?.attributes?.source_list || [];
  const name = quelle === 'NET' && !liste.includes('NET') ? 'HEOS Music' : quelle;
  if (name && liste.includes(name)) return name;
  return liste.includes('SOURCE') ? 'SOURCE' : null;
}

/** „Beide Zonen“: die ausgeschaltete Zone übernimmt die Quelle der laufenden. Laufen beide,
 *  wird die dazugeholte wieder abgeschaltet – die Hauptzone, außer Fernseher/Sat laufen. */
export function beideZonenAktionen(zoneId, hauptId, entities, hauptZuerst = false) {
  const zone = entities[zoneId];
  const haupt = entities[hauptId];
  const an = (id, quelle) => [
    ['media_player', 'turn_on', { entity_id: id }],
    ...(quelle ? [['media_player', 'select_source', { entity_id: id, source: quelle }]] : []),
  ];
  if (istAn(zone) && istAn(haupt)) return [['media_player', 'turn_off', { entity_id: hauptZuerst ? zoneId : hauptId }]];
  if (istAn(zone)) return an(hauptId, quelleFuer(haupt, zone.attributes?.source));
  if (istAn(haupt)) return an(zoneId, quelleFuer(zone, haupt.attributes?.source));
  return [];
}

/** Aktionen eines Quellen-Knopfs als Liste von [domain, service, data]. */
export function quellenAktionen(quelle, zoneId, tvAus = null) {
  if (quelle.aus && tvAus) return tvAus.map((id) => [id.split('.')[0], 'turn_off', { entity_id: id }]);
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

const MedienCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, settings, name, callService, getEntityImageUrl, conn }) => {
  const config = resolveMedienConfig(settings);
  const [offen, setOffen] = useState(false);
  const zone = config.zone ? entities[config.zone] : null;
  const modus = medienModus(config, entities);
  const tv = modus === 'tv' ? entities[config.tv.entity] : null;
  const satBox = modus === 'sat' ? entities[config.tv.sat.entity] : null;
  // Im TV-Betrieb kommen Anzeige und Lautstärke vom Fernseher bzw. Surround
  // Läuft Spotify per Connect auf dem Receiver, zeigt und steuert die Kachel Spotify statt Music Assistant
  const sp = config.musik?.spotify;
  const spE = sp?.entity ? entities[sp.entity] : null;
  const spotifyLaeuft = spE?.state === 'playing' && (!sp.geraet || spE.attributes?.source === sp.geraet);
  const playerId = modus === 'tv' || modus === 'sat' ? null : spotifyLaeuft ? sp.entity : config.player;
  const player = playerId ? entities[playerId] : null;
  const lautId = modus === 'tv' ? config.tv.surround || config.tv.entity : config.zone;
  const lautEntity = lautId ? entities[lautId] : null;
  const titel = name || 'Medien';
  const raum = config.name || zone?.attributes?.friendly_name || '';
  const zoneAn = modus !== 'aus';
  const spielt = player?.state === 'playing';
  const pa = player?.attributes || {};
  const belegt = Boolean(config.zone || config.player || config.tv?.entity);
  const medienTitel = !belegt ? 'Noch nicht belegt'
    : tv ? tv.attributes?.friendly_name || 'Fernseher'
    : satBox ? 'Sat-Receiver an'
    : player && pa.media_title ? pa.media_title : modus === 'zone' ? zone?.attributes?.source || 'An' : 'Aus';
  const medienUnter = !belegt ? 'Zone, Player oder Fernseher in settings.medien eintragen'
    : tv
    ? tv.attributes?.source || tv.attributes?.media_title || ''
    : satBox ? [satBox.attributes?.media_channel || satBox.attributes?.source, 'Fernseher aus'].filter(Boolean).join(' · ')
    : player && pa.media_title ? pa.media_artist || pa.media_album_name || '' : '';
  const bild = tv ? tv.attributes?.entity_picture : player ? pa.entity_picture : null;
  const cover = bild && getEntityImageUrl ? getEntityImageUrl(bild) : null;
  const lautstaerke = Math.round((lautEntity?.attributes?.volume_level ?? 0) * 100);
  // „Aus“ im TV- bzw. Sat-Betrieb: Fernseher, Surround und ein noch laufender Sat-Receiver
  const satId = config.tv?.sat?.entity;
  const tvAus = tv || satBox
    ? [config.tv.entity, config.tv.surround, satId && istAn(entities[satId]) ? satId : null].filter(Boolean)
    : null;
  const ruf = (aktionen) => aktionen.forEach(([d, s, data]) => callService?.(d, s, data));
  const stop = (fn) => (e) => { e.stopPropagation(); if (!editMode) fn(); };
  const oeffnen = () => { if (!editMode && belegt) setOffen(true); };

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback relative flex h-full flex-col gap-2 overflow-hidden rounded-3xl border p-3.5 font-sans select-none ${editMode ? 'cursor-move' : 'cursor-pointer'}`}
      style={cardStyle}
      {...(!editMode ? { role: 'button', tabIndex: 0, 'aria-label': `${titel} öffnen`, onClick: oeffnen, onKeyDown: (e) => e.key === 'Enter' && oeffnen() } : {})}
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
              <button type="button" aria-label="Zurück" onClick={stop(() => callService?.('media_player', 'media_previous_track', { entity_id: playerId }))}><SkipBack className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={spielt ? 'Pause' : 'Abspielen'} onClick={stop(() => ruf(playAktionen(config, entities, playerId)))}>
                {spielt ? <Pause className="h-4 w-4 text-[var(--text-primary)]" /> : <Play className="h-4 w-4 text-[var(--text-primary)]" />}
              </button>
              <button type="button" aria-label="Weiter" onClick={stop(() => callService?.('media_player', 'media_next_track', { entity_id: playerId }))}><SkipForward className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Lautstärke der Zone */}
      {lautEntity && (modus === 'zone' || modus === 'tv') && (
        <label className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Volume2 className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" />
          <input
            type="range" min={0} max={100} step={1} value={lautstaerke} aria-label="Lautstärke"
            onChange={(e) => callService?.('media_player', 'volume_set', { entity_id: lautId, volume_level: Number(e.target.value) / 100 })}
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
            const aktiv = q.aus ? modus === 'aus' : quelleAktiv(q, zone, entities);
            const Icon = q.aus ? Power : getIconComponent(q.icon || 'mdi:music', Music);
            return (
              <button
                key={q.name}
                type="button"
                aria-pressed={aktiv}
                onClick={stop(() => ruf(quellenAktionen(q, config.zone, tvAus)))}
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
      {offen && (
        // React reicht Ereignisse aus dem Portal an die Kachel weiter – hier abfangen, sonst
        // öffnet „Schließen“ das Fenster gleich wieder bzw. startet das Verschieben
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Suspense fallback={null}>
          <MedienModal
            show
            onClose={() => setOffen(false)}
            config={{ ...config, oeffneUrl: config.url ? () => { setOffen(false); openHaPath(config.url); } : null }}
            entities={entities}
            callService={callService}
            conn={conn}
            getEntityImageUrl={getEntityImageUrl}
            titel={titel}
          />
        </Suspense>
        </div>
      )}
    </div>
  );
};

export default memo(MedienCard);
