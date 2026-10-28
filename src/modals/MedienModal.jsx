import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Music, Pause, Play, Power, Search, SkipBack, SkipForward, Speaker, Tv, Volume2, X,
} from '../icons';
import { getIconComponent } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import { beideZonenAktionen, playAktionen } from '../components/cards/MedienCard';

/*
 * Medien-Fenster der Medien-Kachel mit den Reitern „Fernseher“, „Spotify“ und „Bibliothek“
 * (eigene Musik über Music Assistant; ohne Spotify heißt der Reiter „Musik“).
 * Belegung aus settings.medien (siehe MedienCard), zusätzlich:
 *   tv: { entity, surround?, surroundTvQuelle?: 'TV Audio',
 *         apps?: [{ name, icon?, source }],             // Schnellwahl am Fernseher
 *         sat?: { entity, surroundQuelle, script? },    // Sat-Receiver über den Receiver-Eingang
 *         fernbedienung?: 'webostv' }                   // Steuerkreuz über webostv.button
 *   musik: { maEintrag, zoneQuelle?: 'HEOS Music',      // Music Assistant (config_entry_id)
 *            spotify?: { entity, geraet? } }            // SpotifyPlus-Player; spielt per Connect
 *                                                       // auf dem Gerät (z. B. 'Marantz SR7015')
 * Das Fenster hängt am <body> (Portal): die Kachel ist verschiebbar und schneidet ab.
 */

const AN = ['on', 'playing', 'paused', 'idle', 'buffering'];
const istAn = (e) => Boolean(e) && AN.includes(e.state);

/** Music-Assistant-Dienst mit Antwort (get_library, search). */
export async function maDienst(conn, service, data) {
  if (!conn?.sendMessagePromise) return null;
  const r = await conn.sendMessagePromise({
    type: 'call_service', domain: 'music_assistant', service, service_data: data, return_response: true,
  });
  return r?.response ?? r?.service_response ?? null;
}

/** SpotifyPlus-Dienst mit Antwort (Suche, Favoriten …); liefert response.result. */
async function spDienst(conn, service, data) {
  if (!conn?.sendMessagePromise) return null;
  const r = await conn.sendMessagePromise({
    type: 'call_service', domain: 'spotifyplus', service, service_data: data, return_response: true,
  });
  return (r?.response ?? r?.service_response)?.result ?? null;
}

/** Eintrag einer SpotifyPlus-Liste (Track, Album, Playlist, Künstler; auch {track}/{album}) vereinheitlichen. */
export function spEintrag(x) {
  const o = x?.track || x?.album || x;
  if (!o?.uri) return null;
  return { uri: o.uri, name: o.name, image: o.image_url || o.images?.[0]?.url || null, artists: o.artists, media_type: o.type };
}
const spListe = (r) => {
  const gesehen = new Set();
  return (r?.items || []).map(spEintrag).filter((e) => e && e.name && !gesehen.has(e.uri) && gesehen.add(e.uri));
};
const istSpotify = (item) => /^spotify/.test(item?.uri || '');

// Listen im Spotify-Reiter: [Schlüssel, Name, SpotifyPlus-Dienst, Anzahl]
const SP_LISTEN = [
  ['playlists', 'Playlists', 'get_playlist_favorites', 50],
  ['songs', 'Lieblingssongs', 'get_track_favorites', 30],
  ['zuletzt', 'Zuletzt gehört', 'get_player_recent_tracks', 20],
  ['top', 'Top-Titel', 'get_users_top_tracks', 20],
  ['alben', 'Alben', 'get_album_favorites', 30],
  ['kuenstler', 'Künstler', 'get_artists_followed', 30],
];

/** Läuft gerade der Sat-Receiver über den Receiver (statt einer App am Fernseher)? */
export function satAktiv(tvCfg, entities) {
  const sat = tvCfg?.sat;
  if (!sat?.entity) return false;
  const surround = tvCfg.surround ? entities[tvCfg.surround] : null;
  return istAn(entities[sat.entity]) && (!sat.surroundQuelle || surround?.attributes?.source === sat.surroundQuelle);
}

const Knopf = ({ aktiv, onClick, children, label, klein }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={aktiv}
    onClick={onClick}
    className={`flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${klein ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}
    style={aktiv
      ? { backgroundColor: 'rgba(34,197,94,0.14)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.4)' }
      : { backgroundColor: 'var(--glass-bg)', color: 'var(--text-secondary)', borderColor: 'var(--glass-border)' }}
  >
    {children}
  </button>
);

const Lautstaerke = ({ entity, entityId, callService }) => {
  const wert = Math.round((entity?.attributes?.volume_level ?? 0) * 100);
  return (
    <label className="flex items-center gap-3">
      <Volume2 className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
      <input
        type="range" min={0} max={100} step={1} value={wert} aria-label="Lautstärke"
        onChange={(e) => callService('media_player', 'volume_set', { entity_id: entityId, volume_level: Number(e.target.value) / 100 })}
        className="min-w-0 flex-1 accent-[var(--accent-color)]"
      />
      <span className="w-10 text-right text-xs text-[var(--text-muted)]">{wert} %</span>
    </label>
  );
};

const Abschnitt = ({ titel, children }) => (
  <div className="flex flex-col gap-2">
    <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">{titel}</p>
    {children}
  </div>
);

function FernseherReiter({ config, entities, callService, bild }) {
  const tvCfg = config.tv;
  const tv = entities[tvCfg.entity];
  const tvAn = istAn(tv);
  const sat = satAktiv(tvCfg, entities) ? entities[tvCfg.sat.entity] : null;
  // Sat-Receiver an, obwohl der Fernseher aus ist (z. B. vergessen) – Ausschalten muss trotzdem gehen
  const satBox = tvCfg.sat?.entity ? entities[tvCfg.sat.entity] : null;
  const satAn = istAn(satBox);
  const etwasAn = tvAn || satAn;
  const surround = tvCfg.surround ? entities[tvCfg.surround] : null;
  const jetzt = sat || tv;
  const ja = jetzt?.attributes || {};
  const titel = sat ? ja.media_channel || ja.source : tvAn ? ja.source || 'Fernseher' : satAn ? 'Sat-Receiver an' : 'Aus';
  const unter = sat
    ? [ja.media_series_title, ja.media_start_time && ja.media_end_time ? `${ja.media_start_time}–${ja.media_end_time}` : null].filter(Boolean).join(' · ')
    : !tvAn && satAn ? [satBox.attributes?.media_channel || satBox.attributes?.source, 'Fernseher aus'].filter(Boolean).join(' · ') : '';
  const app = (a) => {
    callService('media_player', 'turn_on', { entity_id: tvCfg.entity });
    callService('media_player', 'select_source', { entity_id: tvCfg.entity, source: a.source });
    if (surround && tvCfg.surroundTvQuelle) {
      callService('media_player', 'turn_on', { entity_id: tvCfg.surround });
      callService('media_player', 'select_source', { entity_id: tvCfg.surround, source: tvCfg.surroundTvQuelle });
    }
  };
  const taste = (button) => callService('webostv', 'button', { entity_id: tvCfg.entity, button });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--glass-bg-hover)' }}>
          {bild(ja.entity_picture) ? <img src={bild(ja.entity_picture)} alt="" className="h-full w-full object-contain" /> : <Tv className="h-7 w-7 text-[var(--text-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">{titel}</p>
          {unter && <p className="truncate text-sm text-[var(--text-secondary)]">{unter}</p>}
        </div>
        <Knopf
          label={etwasAn ? 'Fernseher ausschalten' : 'Fernseher einschalten'}
          aktiv={etwasAn}
          onClick={() => {
            if (etwasAn) {
              [tvCfg.entity, tvCfg.surround, satAn ? tvCfg.sat.entity : null].filter(Boolean)
                .forEach((id) => callService('media_player', 'turn_off', { entity_id: id }));
            } else {
              [tvCfg.entity, tvCfg.surround].filter(Boolean).forEach((id) => callService('media_player', 'turn_on', { entity_id: id }));
            }
          }}
        >
          <Power className="h-4 w-4" />
        </Knopf>
      </div>

      {sat && (
        <Abschnitt titel="Sender">
          <div className="flex gap-2">
            <Knopf label="Programm runter" onClick={() => callService('media_player', 'media_previous_track', { entity_id: tvCfg.sat.entity })}><ChevronDown className="h-4 w-4" /></Knopf>
            <Knopf label="Programm hoch" onClick={() => callService('media_player', 'media_next_track', { entity_id: tvCfg.sat.entity })}><ChevronUp className="h-4 w-4" /></Knopf>
          </div>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {(sat.attributes?.source_list || []).map((s) => (
              <Knopf key={s} klein aktiv={s === sat.attributes?.source} onClick={() => callService('media_player', 'select_source', { entity_id: tvCfg.sat.entity, source: s })}>{s}</Knopf>
            ))}
          </div>
        </Abschnitt>
      )}

      {(tvCfg.sat?.script || tvCfg.apps?.length > 0) && (
        <Abschnitt titel="Schnellwahl">
          <div className="flex flex-wrap gap-2">
            {tvCfg.sat?.script && (
              <Knopf aktiv={Boolean(sat)} onClick={() => callService('script', 'turn_on', { entity_id: tvCfg.sat.script })}><Tv className="h-4 w-4" />Sat-TV</Knopf>
            )}
            {(tvCfg.apps || []).map((a) => {
              const Icon = getIconComponent(a.icon || 'mdi:television', Tv);
              return (
                <Knopf key={a.name} aktiv={!sat && tvAn && tv?.attributes?.source === a.source} onClick={() => app(a)}>
                  <Icon className="h-4 w-4" />{a.name}
                </Knopf>
              );
            })}
          </div>
        </Abschnitt>
      )}

      {surround && istAn(surround) && (
        <Abschnitt titel="Lautstärke"><Lautstaerke entity={surround} entityId={tvCfg.surround} callService={callService} /></Abschnitt>
      )}

      {tvCfg.fernbedienung === 'webostv' && tvAn && (
        <Abschnitt titel="Fernbedienung">
          <div className="grid w-44 grid-cols-3 gap-1.5 self-center">
            <span />
            <Knopf label="Hoch" onClick={() => taste('UP')}><ChevronUp className="h-4 w-4" /></Knopf>
            <span />
            <Knopf label="Links" onClick={() => taste('LEFT')}><ChevronLeft className="h-4 w-4" /></Knopf>
            <Knopf label="OK" onClick={() => taste('ENTER')}>OK</Knopf>
            <Knopf label="Rechts" onClick={() => taste('RIGHT')}><ChevronRight className="h-4 w-4" /></Knopf>
            <Knopf label="Zurück" klein onClick={() => taste('BACK')}>Zurück</Knopf>
            <Knopf label="Runter" onClick={() => taste('DOWN')}><ChevronDown className="h-4 w-4" /></Knopf>
            <Knopf label="Home" klein onClick={() => taste('HOME')}>Home</Knopf>
          </div>
        </Abschnitt>
      )}
    </div>
  );
}

const Treffer = ({ item, onPlay, bild }) => (
  <button
    type="button"
    onClick={() => onPlay(item)}
    className="flex items-center gap-3 rounded-xl p-1.5 text-left hover:bg-[var(--glass-bg-hover)]"
  >
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ backgroundColor: 'var(--glass-bg-hover)' }}>
      {item.image ? <img src={bild(item.image)} alt="" className="h-full w-full object-cover" /> : <Music className="h-4 w-4 text-[var(--text-muted)]" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-[var(--text-primary)]">{item.name || item.uri}</span>
      {item.artists?.length > 0 && <span className="block truncate text-[11px] text-[var(--text-secondary)]">{item.artists.map((a) => a.name).join(', ')}</span>}
    </span>
    <Play className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
  </button>
);

const SUCH_ARTEN = [['tracks', 'Titel'], ['albums', 'Alben'], ['playlists', 'Playlists'], ['artists', 'Künstler'], ['radio', 'Radio']];

// Was läuft, mit Zurück / Abspielen / Weiter für den angegebenen Player
function JetztLaeuft({ config, entities, callService, bild, playerId }) {
  const player = playerId ? entities[playerId] : null;
  const pa = player?.attributes || {};
  const spielt = player?.state === 'playing';
  const ruf = (aktionen) => aktionen.forEach(([d, s, data]) => callService(d, s, data));
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--glass-bg-hover)' }}>
        {pa.entity_picture ? <img src={bild(pa.entity_picture)} alt="" className="h-full w-full object-cover" /> : <Music className="h-8 w-8 text-[var(--text-muted)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-[var(--text-primary)]">{pa.media_title || 'Nichts ausgewählt'}</p>
        <p className="truncate text-sm text-[var(--text-secondary)]">{[pa.media_artist, pa.media_album_name].filter(Boolean).join(' · ')}</p>
        {player && (
          <div className="mt-2 flex items-center gap-2">
            <Knopf label="Zurück" onClick={() => callService('media_player', 'media_previous_track', { entity_id: playerId })}><SkipBack className="h-4 w-4" /></Knopf>
            <Knopf label={spielt ? 'Pause' : 'Abspielen'} aktiv={spielt} onClick={() => ruf(playAktionen(config, entities, playerId))}>
              {spielt ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Knopf>
            <Knopf label="Weiter" onClick={() => callService('media_player', 'media_next_track', { entity_id: playerId })}><SkipForward className="h-4 w-4" /></Knopf>
          </div>
        )}
      </div>
    </div>
  );
}

// Raum: Quellen, „Beide Zonen“ und Lautstärke
function Raum({ config, entities, callService }) {
  const zone = config.zone ? entities[config.zone] : null;
  if (!zone) return null;
  const raumQuellen = config.quellen.filter((q) => q.source || q.aus);
  const ruf = (aktionen) => aktionen.forEach(([d, s, data]) => callService(d, s, data));
  // „Beide Zonen“: Raum und Hauptzone (Surround) mit derselben Quelle
  const haupt = config.tv?.surround;
  const beideAn = haupt && istAn(zone) && istAn(entities[haupt]);
  const hauptZuerst = Boolean(config.tv && (istAn(entities[config.tv.entity]) || istAn(entities[config.tv.sat?.entity])));
  const beideMoeglich = haupt && (istAn(zone) || istAn(entities[haupt]));
  return (
    <Abschnitt titel={config.name || 'Raum'}>
      <div className="flex flex-wrap gap-2">
        {raumQuellen.map((q) => {
          const Icon = q.aus ? Power : getIconComponent(q.icon || 'mdi:music', Music);
          const aktiv = q.aus ? !istAn(zone) : istAn(zone) && zone.attributes?.source === q.source;
          return (
            <Knopf key={q.name} aktiv={aktiv && !q.aus} onClick={() => (q.aus
              ? callService('media_player', 'turn_off', { entity_id: config.zone })
              : (callService('media_player', 'turn_on', { entity_id: config.zone }), callService('media_player', 'select_source', { entity_id: config.zone, source: q.source })))}
            >
              <Icon className="h-4 w-4" />{q.name}
            </Knopf>
          );
        })}
        {beideMoeglich && (
          <Knopf aktiv={beideAn} onClick={() => ruf(beideZonenAktionen(config.zone, haupt, entities, hauptZuerst))}>
            <Speaker className="h-4 w-4" />Beide Zonen
          </Knopf>
        )}
      </div>
      {istAn(zone) && <Lautstaerke entity={zone} entityId={config.zone} callService={callService} />}
    </Abschnitt>
  );
}

// Raum einschalten und auf den Eingang des Players stellen (HEOS), damit nicht die Hauptzone angeht
function raumVorbereiten(config, callService) {
  if (config.zone && config.musik?.zoneQuelle) {
    callService('media_player', 'turn_on', { entity_id: config.zone });
    callService('media_player', 'select_source', { entity_id: config.zone, source: config.musik.zoneQuelle });
  }
}

function Suche({ onSuche }) {
  const [text, setText] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSuche(text.trim()); }} className="flex gap-2">
      <input
        value={text} onChange={(e) => setText(e.target.value)} placeholder="Künstler, Album, Titel …" aria-label="Musik suchen"
        className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
        style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
      />
      <Knopf label="Suchen"><Search className="h-4 w-4" /></Knopf>
    </form>
  );
}

const Trefferliste = ({ treffer, onPlay, bild }) => (
  <div className="flex flex-col gap-3">
    {SUCH_ARTEN.map(([art, name]) => (treffer[art]?.length ? (
      <div key={art} className="flex flex-col">
        <p className="mb-1 text-[11px] font-semibold text-[var(--text-secondary)]">{name}</p>
        {treffer[art].map((t) => <Treffer key={t.uri} item={t} onPlay={onPlay} bild={bild} />)}
      </div>
    ) : null))}
    {!SUCH_ARTEN.some(([art]) => treffer[art]?.length) && <p className="text-xs text-[var(--text-muted)]">Nichts gefunden.</p>}
  </div>
);

// nur Treffer einer Herkunft behalten (Spotify bzw. eigene Bibliothek)
const filtern = (treffer, spotify) => Object.fromEntries(
  Object.entries(treffer || {}).map(([k, v]) => [k, Array.isArray(v) ? v.filter((t) => istSpotify(t) === spotify) : v]),
);

// Spotify über SpotifyPlus: Suche und Listen auch im Leerlauf, Abspielen per Spotify Connect
// gezielt auf dem Gerät (Receiver), vorher der Raum auf HEOS
function SpotifyReiter({ config, entities, callService, conn, bild }) {
  const sp = config.musik.spotify;
  const [ansicht, setAnsicht] = useState('playlists');
  const [listen, setListen] = useState({});
  const [treffer, setTreffer] = useState(null);

  useEffect(() => {
    if (listen[ansicht]) return undefined;
    const def = SP_LISTEN.find(([k]) => k === ansicht);
    let aus = false;
    spDienst(conn, def[2], { entity_id: sp.entity, limit_total: def[3] })
      .then((r) => { if (!aus) setListen((l) => ({ ...l, [ansicht]: spListe(r) })); })
      .catch(() => { if (!aus) setListen((l) => ({ ...l, [ansicht]: [] })); });
    return () => { aus = true; };
  }, [conn, sp.entity, ansicht, listen]);

  const geraet = sp.geraet ? { device_id: sp.geraet } : {};
  const abspielen = (item) => {
    raumVorbereiten(config, callService);
    if (item.media_type === 'track' || /^spotify:track:/.test(item.uri)) {
      callService('spotifyplus', 'player_media_play_tracks', { entity_id: sp.entity, uris: item.uri, ...geraet });
    } else {
      callService('spotifyplus', 'player_media_play_context', { entity_id: sp.entity, context_uri: item.uri, ...geraet });
    }
  };
  const alleSongs = () => {
    raumVorbereiten(config, callService);
    callService('spotifyplus', 'player_media_play_track_favorites', { entity_id: sp.entity, shuffle: true, ...geraet });
  };
  const suchen = async (text) => {
    try {
      const r = await spDienst(conn, 'search_all', { entity_id: sp.entity, criteria: text, criteria_type: 'track,album,artist,playlist', limit_total: 5 });
      setTreffer({ tracks: spListe(r?.tracks), albums: spListe(r?.albums), artists: spListe(r?.artists), playlists: spListe(r?.playlists) });
    } catch { setTreffer({}); }
  };
  const liste = listen[ansicht];

  return (
    <div className="flex flex-col gap-5">
      <JetztLaeuft config={config} entities={entities} callService={callService} bild={bild} playerId={sp.entity} />
      <Raum config={config} entities={entities} callService={callService} />
      <Abschnitt titel="Auf Spotify suchen">
        <Suche onSuche={suchen} />
        {treffer && <Trefferliste treffer={treffer} onPlay={abspielen} bild={bild} />}
      </Abschnitt>
      <Abschnitt titel="Meine Musik">
        <div className="flex flex-wrap gap-1.5">
          {SP_LISTEN.map(([k, name]) => <Knopf key={k} klein aktiv={ansicht === k} onClick={() => setAnsicht(k)}>{name}</Knopf>)}
        </div>
        {ansicht === 'songs' && (
          <div><Knopf onClick={alleSongs}><Play className="h-4 w-4" />Alle Lieblingssongs (Zufall)</Knopf></div>
        )}
        {!liste && <p className="text-xs text-[var(--text-muted)]">Lädt …</p>}
        {liste && liste.length === 0 && <p className="text-xs text-[var(--text-muted)]">Nichts gefunden.</p>}
        {liste && liste.length > 0 && (
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {liste.map((p) => <Treffer key={p.uri} item={p} onPlay={abspielen} bild={bild} />)}
          </div>
        )}
      </Abschnitt>
    </div>
  );
}

function MusikReiter({ config, entities, callService, conn, bild }) {
  const eintrag = config.musik?.maEintrag;
  // mit eigenem Spotify-Reiter zeigt die Bibliothek nur die eigene Musik (NAS, Radio)
  const ohneSpotify = Boolean(config.musik?.spotify);
  const [playlists, setPlaylists] = useState([]);
  const [treffer, setTreffer] = useState(null);

  useEffect(() => {
    if (!eintrag) return;
    let aus = false;
    maDienst(conn, 'get_library', { config_entry_id: eintrag, media_type: 'playlist', limit: 40, order_by: 'name' })
      .then((r) => { if (!aus) setPlaylists((r?.items || []).filter((p) => p.name && !(ohneSpotify && istSpotify(p)))); })
      .catch(() => {});
    return () => { aus = true; };
  }, [conn, eintrag, ohneSpotify]);

  const suchen = async (text) => {
    try {
      const r = await maDienst(conn, 'search', { config_entry_id: eintrag, name: text, limit: 5 });
      setTreffer(ohneSpotify ? filtern(r, false) : r);
    } catch { setTreffer({}); }
  };
  const abspielen = (item) => {
    raumVorbereiten(config, callService);
    callService('music_assistant', 'play_media', { entity_id: config.player, media_id: item.uri, media_type: item.media_type });
  };

  return (
    <div className="flex flex-col gap-5">
      <JetztLaeuft config={config} entities={entities} callService={callService} bild={bild} playerId={config.player} />
      <Raum config={config} entities={entities} callService={callService} />

      {eintrag && (
        <Abschnitt titel="Suchen">
          <Suche onSuche={suchen} />
          {treffer && <Trefferliste treffer={treffer} onPlay={abspielen} bild={bild} />}
        </Abschnitt>
      )}

      {playlists.length > 0 && (
        <Abschnitt titel="Playlists">
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {playlists.map((p) => <Treffer key={p.uri} item={p} onPlay={abspielen} bild={bild} />)}
          </div>
        </Abschnitt>
      )}

      {config.url && (
        <a href={config.url} className="text-xs text-[var(--accent-color)]" onClick={(e) => { e.preventDefault(); config.oeffneUrl?.(); }}>
          Ganze Bibliothek in Music Assistant öffnen →
        </a>
      )}
    </div>
  );
}

export default function MedienModal({ show, onClose, config, entities, callService, conn, getEntityImageUrl, titel }) {
  const spotify = config.musik?.spotify?.entity;
  const reiter = [
    config.tv && ['tv', 'Fernseher'],
    spotify && ['spotify', 'Spotify'],
    (config.player || config.zone) && ['musik', spotify ? 'Bibliothek' : 'Musik'],
  ].filter(Boolean);
  const [aktiv, setAktiv] = useState(null);
  const tab = aktiv || reiter[0]?.[0];
  const bild = (url) => (url && getEntityImageUrl ? getEntityImageUrl(url) : url || null);
  const ruf = (d, s, data) => callService?.(d, s, data);
  if (!show) return null;
  return createPortal(
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId="medien-modal-title"
      overlayClassName="fixed inset-0 z-[120] flex items-stretch justify-center sm:items-center sm:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.35)' }}
      panelClassName="popup-anim relative flex h-full w-full max-w-2xl flex-col overflow-hidden border font-sans backdrop-blur-xl sm:h-auto sm:max-h-[90vh] sm:rounded-[2rem]"
      panelStyle={{ background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
    >
      {() => (
        <>
          <div className="flex-shrink-0 border-b p-4 pb-3 sm:p-6 sm:pb-4" style={{ borderColor: 'var(--glass-border)' }}>
            <button type="button" onClick={onClose} className="modal-close absolute top-4 right-4" aria-label="Schließen"><X className="h-4 w-4" /></button>
            <h3 id="medien-modal-title" className="mb-3 text-xl font-light tracking-tight uppercase italic">{titel}</h3>
            {reiter.length > 1 && (
              <div className="flex rounded-2xl p-1" style={{ backgroundColor: 'var(--glass-bg)' }} role="tablist">
                {reiter.map(([key, name]) => (
                  <button
                    key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setAktiv(key)}
                    className="flex-1 rounded-xl py-2 text-[11px] font-bold tracking-widest uppercase"
                    style={tab === key ? { backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)', border: '1px solid var(--accent-color)' } : { color: 'var(--text-secondary)' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'tv' && <FernseherReiter config={config} entities={entities} callService={ruf} bild={bild} />}
            {tab === 'spotify' && <SpotifyReiter config={config} entities={entities} callService={ruf} conn={conn} bild={bild} />}
            {tab === 'musik' && <MusikReiter config={config} entities={entities} callService={ruf} conn={conn} bild={bild} />}
          </div>
        </>
      )}
    </AccessibleModalShell>,
    document.body,
  );
}
