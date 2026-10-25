import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Music, Pause, Play, Power, Search, SkipBack, SkipForward, Tv, Volume2, X,
} from '../icons';
import { getIconComponent } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

/*
 * Medien-Fenster der Medien-Kachel mit den Reitern „Fernseher“ und „Musik“.
 * Belegung aus settings.medien (siehe MedienCard), zusätzlich:
 *   tv: { entity, surround?, surroundTvQuelle?: 'TV Audio',
 *         apps?: [{ name, icon?, source }],             // Schnellwahl am Fernseher
 *         sat?: { entity, surroundQuelle, script? },    // Sat-Receiver über den Receiver-Eingang
 *         fernbedienung?: 'webostv' }                   // Steuerkreuz über webostv.button
 *   musik: { maEintrag, zoneQuelle?: 'HEOS Music' }     // Music Assistant (config_entry_id)
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
  const surround = tvCfg.surround ? entities[tvCfg.surround] : null;
  const jetzt = sat || tv;
  const ja = jetzt?.attributes || {};
  const titel = sat ? ja.media_channel || ja.source : tvAn ? ja.source || 'Fernseher' : 'Aus';
  const unter = sat ? [ja.media_series_title, ja.media_start_time && ja.media_end_time ? `${ja.media_start_time}–${ja.media_end_time}` : null].filter(Boolean).join(' · ') : '';
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
          label={tvAn ? 'Fernseher ausschalten' : 'Fernseher einschalten'}
          aktiv={tvAn}
          onClick={() => {
            const dienst = tvAn ? 'turn_off' : 'turn_on';
            [tvCfg.entity, tvCfg.surround].filter(Boolean).forEach((id) => callService('media_player', dienst, { entity_id: id }));
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

function MusikReiter({ config, entities, callService, conn, bild }) {
  const zone = config.zone ? entities[config.zone] : null;
  const player = config.player ? entities[config.player] : null;
  const pa = player?.attributes || {};
  const spielt = player?.state === 'playing';
  const eintrag = config.musik?.maEintrag;
  const [playlists, setPlaylists] = useState([]);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState(null);

  useEffect(() => {
    if (!eintrag) return;
    let aus = false;
    maDienst(conn, 'get_library', { config_entry_id: eintrag, media_type: 'playlist', limit: 40, order_by: 'name' })
      .then((r) => { if (!aus) setPlaylists((r?.items || []).filter((p) => p.name)); })
      .catch(() => {});
    return () => { aus = true; };
  }, [conn, eintrag]);

  const suchen = async (e) => {
    e.preventDefault();
    if (!eintrag || !suche.trim()) return;
    try {
      setTreffer(await maDienst(conn, 'search', { config_entry_id: eintrag, name: suche.trim(), limit: 5 }));
    } catch { setTreffer({}); }
  };
  const abspielen = (item) => {
    // Raum einschalten und auf den Eingang des Players stellen, dann abspielen
    if (config.zone && config.musik?.zoneQuelle) {
      callService('media_player', 'turn_on', { entity_id: config.zone });
      callService('media_player', 'select_source', { entity_id: config.zone, source: config.musik.zoneQuelle });
    }
    callService('music_assistant', 'play_media', { entity_id: config.player, media_id: item.uri, media_type: item.media_type });
  };
  const raumQuellen = config.quellen.filter((q) => q.source || q.aus);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--glass-bg-hover)' }}>
          {pa.entity_picture ? <img src={bild(pa.entity_picture)} alt="" className="h-full w-full object-cover" /> : <Music className="h-8 w-8 text-[var(--text-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-[var(--text-primary)]">{pa.media_title || 'Nichts ausgewählt'}</p>
          <p className="truncate text-sm text-[var(--text-secondary)]">{[pa.media_artist, pa.media_album_name].filter(Boolean).join(' · ')}</p>
          {player && (
            <div className="mt-2 flex items-center gap-2">
              <Knopf label="Zurück" onClick={() => callService('media_player', 'media_previous_track', { entity_id: config.player })}><SkipBack className="h-4 w-4" /></Knopf>
              <Knopf label={spielt ? 'Pause' : 'Abspielen'} aktiv={spielt} onClick={() => callService('media_player', 'media_play_pause', { entity_id: config.player })}>
                {spielt ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Knopf>
              <Knopf label="Weiter" onClick={() => callService('media_player', 'media_next_track', { entity_id: config.player })}><SkipForward className="h-4 w-4" /></Knopf>
            </div>
          )}
        </div>
      </div>

      {zone && (
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
          </div>
          {istAn(zone) && <Lautstaerke entity={zone} entityId={config.zone} callService={callService} />}
        </Abschnitt>
      )}

      {eintrag && (
        <Abschnitt titel="Suchen">
          <form onSubmit={suchen} className="flex gap-2">
            <input
              value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Künstler, Album, Titel …" aria-label="Musik suchen"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
            />
            <Knopf label="Suchen"><Search className="h-4 w-4" /></Knopf>
          </form>
          {treffer && (
            <div className="flex flex-col gap-3">
              {SUCH_ARTEN.map(([art, name]) => (treffer[art]?.length ? (
                <div key={art} className="flex flex-col">
                  <p className="mb-1 text-[11px] font-semibold text-[var(--text-secondary)]">{name}</p>
                  {treffer[art].map((t) => <Treffer key={t.uri} item={t} onPlay={abspielen} bild={bild} />)}
                </div>
              ) : null))}
              {!SUCH_ARTEN.some(([art]) => treffer[art]?.length) && <p className="text-xs text-[var(--text-muted)]">Nichts gefunden.</p>}
            </div>
          )}
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
  const reiter = [config.tv && ['tv', 'Fernseher'], (config.player || config.zone) && ['musik', 'Musik']].filter(Boolean);
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
            {tab === 'musik' && <MusikReiter config={config} entities={entities} callService={ruf} conn={conn} bild={bild} />}
          </div>
        </>
      )}
    </AccessibleModalShell>,
    document.body,
  );
}
