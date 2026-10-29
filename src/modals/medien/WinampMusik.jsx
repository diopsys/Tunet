import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from '../../icons';
import { beideZonenAktionen, playAktionen } from '../../components/cards/MedienCard';
import { fetchMedienPlaylist, saveMedienPlaylist } from '../../services/settingsApi';
import {
  browseTitel, istSpotifyUri, laufenderIndex, maAbspielen, maEinreihen, maRestErsetzen, maTitel, position,
  spAbspielen, spListe, spSpringen, spTitel, spWarteschlange, zeit,
} from './musik';
import './winamp.css';

/*
 * Musik-Reiter des Medien-Fensters im Winamp-Stil:
 *   Hauptfenster  – Lauftext, Zeit, Spulen, Lautstärke des Raums, Steuerung, Shuffle/Repeat
 *   Zonen         – an Stelle des Equalizers: Quellen des Raums, „Beide Zonen“, Lautstärken
 *   Playlist      – Spotify: Warteschlange; sonst die Liste, die über Music Assistant läuft
 *                   (gemeinsam für alle Geräte auf dem Tunet-Server gespeichert)
 *   Media Library – Lokale Bibliothek (Music Assistant) und Spotify (SpotifyPlus) mit Suche
 * Wie in Winamp: Antippen wählt, Doppeltippen spielt – aus der Library die ganze angezeigte
 * Liste ab diesem Titel.
 */

const AN = ['on', 'playing', 'paused', 'idle', 'buffering'];
const istAn = (e) => Boolean(e) && AN.includes(e.state);
const idAus = (uri) => String(uri || '').split(':').pop();

async function dienst(conn, domain, service, data) {
  if (!conn?.sendMessagePromise) return null;
  const r = await conn.sendMessagePromise({ type: 'call_service', domain, service, service_data: data, return_response: true });
  return r?.response ?? r?.service_response ?? null;
}
const spDienst = async (conn, service, data) => (await dienst(conn, 'spotifyplus', service, data))?.result ?? null;
const maDienst = (conn, service, data) => dienst(conn, 'music_assistant', service, data);
async function aufklappen(conn, entityId, item) {
  if (!conn?.sendMessagePromise || !entityId) return [];
  const r = await conn.sendMessagePromise({
    type: 'media_player/browse_media', entity_id: entityId, media_content_id: item.uri, media_content_type: item.media_type,
  });
  return (r?.children || []).map(browseTitel).filter(Boolean);
}

// Ordner der Media Library: [Schlüssel, Name, Gruppe]
const MA_ORDNER = [['ma_titel', 'Alle Titel'], ['ma_kuenstler', 'Künstler'], ['ma_alben', 'Alben'], ['ma_playlists', 'Playlists']];
const SP_ORDNER = [
  ['sp_playlists', 'Playlists', 'get_playlist_favorites', 50],
  ['sp_songs', 'Lieblingssongs', 'get_track_favorites', 200],
  ['sp_zuletzt', 'Zuletzt gehört', 'get_player_recent_tracks', 50],
  ['sp_top', 'Top-Titel', 'get_users_top_tracks', 50],
  ['sp_alben', 'Alben', 'get_album_favorites', 50],
  ['sp_kuenstler', 'Künstler', 'get_artists_followed', 50],
];
const MA_ART = { ma_titel: 'track', ma_kuenstler: 'artist', ma_alben: 'album', ma_playlists: 'playlist' };
const SEITE = 200;
const ART_NAME = { album: 'Album', playlist: 'Playlist', artist: 'Künstler', folder: 'Ordner', radio: 'Radio' };

const Knopf = ({ onClick, label, aktiv, led, gross, disabled, children }) => (
  <button type="button" className={`wa-knopf${gross ? ' gross' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={aktiv === undefined ? undefined : Boolean(aktiv)}>
    {led && <span className="wa-led" />}
    {children}
  </button>
);

const Fenster = ({ titel, className = '', children }) => (
  <section className={`wa-fenster ${className}`} aria-label={titel}>
    <div className="wa-titelleiste"><span>{titel}</span></div>
    {children}
  </section>
);

function Zeile({ nr, item, laeuft, gewaehlt, onWaehlen, onSpielen }) {
  return (
    <button
      type="button"
      className={`wa-zeile${laeuft ? ' laeuft' : ''}${gewaehlt ? ' gewaehlt' : ''}`}
      onClick={onWaehlen}
      onDoubleClick={onSpielen}
      aria-current={laeuft ? 'true' : undefined}
    >
      {nr !== undefined && <span className="nr">{nr}.</span>}
      <span className="name">{[item.artist, item.name].filter(Boolean).join(' - ') || item.uri}</span>
      {ART_NAME[item.media_type] && <span className="art">{ART_NAME[item.media_type]}</span>}
      <span className="dauer">{zeit(item.dauer)}</span>
    </button>
  );
}

function Hauptfenster({ config, entities, ruf, playerId, liste, index, onEject }) {
  const player = playerId ? entities[playerId] : null;
  const pa = player?.attributes || {};
  const zone = config.zone ? entities[config.zone] : null;
  const [, setTakt] = useState(0);
  useEffect(() => {
    if (player?.state !== 'playing') return undefined;
    const t = setInterval(() => setTakt((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [player?.state]);
  const pos = position(player);
  const spielt = player?.state === 'playing';
  const nr = index >= 0 ? `${index + 1}. ` : '';
  const text = pa.media_title ? `${nr}${[pa.media_artist, pa.media_title].filter(Boolean).join(' - ')}` : liste.length ? 'Bereit' : 'Nichts ausgewählt';
  const zeichen = spielt ? '▶' : player?.state === 'paused' ? '❚❚' : '■';
  const lautstaerke = Math.round((zone?.attributes?.volume_level ?? 0) * 100);
  const p = (service, data = {}) => ruf([['media_player', service, { entity_id: playerId, ...data }]]);
  const shuffle = Boolean(pa.shuffle);
  const repeat = pa.repeat && pa.repeat !== 'off';
  return (
    <Fenster titel="Winamp" className="wa-haupt">
      <div className="wa-oben">
        <div className="wa-lcd wa-zeitfeld">
          <span className="wa-status" aria-hidden="true">{zeichen}</span>
          <span className="wa-zeit" aria-label="Zeit">{pos === null ? '0:00' : zeit(pos)}</span>
        </div>
        <div className="wa-info">
          <div className={`wa-lcd wa-lauftext${text.length < 34 ? ' kurz' : ''}`}><span>{text}</span></div>
          <div className="wa-werte">
            <span className="wa-lcd">{pa.media_duration ? zeit(pa.media_duration) : ''}</span>
            <span>Länge</span>
            <span className={spielt ? 'an' : 'aus'} style={{ marginLeft: 'auto' }}>mono</span>
            <span className={spielt ? 'an' : 'aus'}>stereo</span>
          </div>
          <input
            type="range" className="wa-regler" min={0} max={100} value={lautstaerke} aria-label="Lautstärke"
            disabled={!istAn(zone)}
            onChange={(e) => ruf([['media_player', 'volume_set', { entity_id: config.zone, volume_level: Number(e.target.value) / 100 }]])}
          />
        </div>
      </div>
      <input
        type="range" className="wa-regler spulen" style={{ marginTop: 6 }} min={0} max={Math.max(1, Math.round(pa.media_duration || 0))}
        value={Math.round(pos || 0)} aria-label="Spulen" disabled={!player || !pa.media_duration}
        onChange={(e) => p('media_seek', { seek_position: Number(e.target.value) })}
      />
      <div className="wa-knopfreihe" style={{ marginTop: 6 }}>
        <Knopf gross label="Zurück" disabled={!player} onClick={() => p('media_previous_track')}><SkipBack /></Knopf>
        <Knopf gross label="Abspielen" disabled={!player} onClick={() => (spielt ? null : ruf(playAktionen(config, entities, playerId)))}><Play /></Knopf>
        <Knopf gross label="Pause" disabled={!player} onClick={() => p('media_pause')}><Pause /></Knopf>
        <Knopf gross label="Stopp" disabled={!player} onClick={() => p('media_stop')}><span style={{ width: 10, height: 10, background: 'currentColor' }} /></Knopf>
        <Knopf gross label="Weiter" disabled={!player} onClick={() => p('media_next_track')}><SkipForward /></Knopf>
        <Knopf gross label="Library" onClick={onEject}><span style={{ fontSize: 12 }}>⏏︎</span></Knopf>
        <span style={{ flex: 1 }} />
        <Knopf label="Shuffle" led aktiv={shuffle} disabled={!player} onClick={() => p('shuffle_set', { shuffle: !shuffle })}><Shuffle /></Knopf>
        <Knopf label="Repeat" led aktiv={repeat} disabled={!player} onClick={() => p('repeat_set', { repeat: repeat ? 'off' : 'all' })}><Repeat /></Knopf>
      </div>
    </Fenster>
  );
}

function Fader({ name, entityId, entities, ruf }) {
  const e = entityId ? entities[entityId] : null;
  if (!e) return null;
  const wert = Math.round((e.attributes?.volume_level ?? 0) * 100);
  return (
    <label className="wa-fader">
      <input
        type="range" min={0} max={100} value={wert} aria-label={`Lautstärke ${name}`} disabled={!istAn(e)}
        onChange={(ev) => ruf([['media_player', 'volume_set', { entity_id: entityId, volume_level: Number(ev.target.value) / 100 }]])}
      />
      <span className="wa-lcd">{istAn(e) ? wert : '--'}</span>
      <span>{name}</span>
    </label>
  );
}

// Zonen: Quellen des Raums, „Beide Zonen“ und die Lautstärken als Equalizer-Regler
function ZonenFenster({ config, entities, ruf }) {
  const zone = config.zone ? entities[config.zone] : null;
  if (!zone) return null;
  const haupt = config.tv?.surround;
  const quellen = (config.quellen || []).filter((q) => q.source || q.aus);
  const beideAn = haupt && istAn(zone) && istAn(entities[haupt]);
  const hauptZuerst = Boolean(config.tv && (istAn(entities[config.tv.entity]) || istAn(entities[config.tv.sat?.entity])));
  const quelle = (q) => (q.aus
    ? ruf([['media_player', 'turn_off', { entity_id: config.zone }]])
    : ruf([['media_player', 'turn_on', { entity_id: config.zone }], ['media_player', 'select_source', { entity_id: config.zone, source: q.source }]]));
  return (
    <Fenster titel="Zonen" className="wa-raum">
      <div className="wa-raum-innen">
        <div className="wa-raum-quellen">
          <div className="wa-knopfreihe">
            {quellen.map((q) => (
              <Knopf key={q.name} led aktiv={q.aus ? !istAn(zone) : istAn(zone) && zone.attributes?.source === q.source} onClick={() => quelle(q)}>{q.name}</Knopf>
            ))}
          </div>
          {haupt && (
            <div className="wa-knopfreihe">
              <Knopf led aktiv={beideAn} disabled={!istAn(zone) && !istAn(entities[haupt])} onClick={() => ruf(beideZonenAktionen(config.zone, haupt, entities, hauptZuerst))}>Beide Zonen</Knopf>
            </div>
          )}
          <div className="wa-lcd wa-hinweis">{istAn(zone) ? `${config.name || 'Raum'}: ${zone.attributes?.source || 'an'}` : `${config.name || 'Raum'}: aus`}</div>
        </div>
        <Fader name={config.name || 'Raum'} entityId={config.zone} entities={entities} ruf={ruf} />
        {haupt && <Fader name="Haupt" entityId={haupt} entities={entities} ruf={ruf} />}
      </div>
    </Fenster>
  );
}

function PlaylistEditor({ spotify, liste, laufend, gewaehlt, setGewaehlt, onSpielen, onEntfernen, onSchieben, onLeeren, onAdd }) {
  const gesamt = liste.reduce((s, t) => s + (t.dauer || 0), 0);
  const listeRef = useRef(null);
  useEffect(() => {
    listeRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [laufend]);
  return (
    <Fenster titel={spotify ? 'Playlist Editor · Spotify' : 'Playlist Editor'} className="wa-playlist">
      <div ref={listeRef} className="wa-lcd wa-liste" role="listbox" aria-label="Playlist">
        {liste.length === 0 && <div className="wa-hinweis">{spotify ? 'Spotify-Warteschlange ist leer.' : 'Leer – in der Media Library doppelt tippen.'}</div>}
        {liste.map((t, i) => (
          <Zeile
            key={`${t.uri}-${i}`} nr={i + 1} item={t} laeuft={i === laufend} gewaehlt={i === gewaehlt}
            onWaehlen={() => setGewaehlt(i)} onSpielen={() => onSpielen(i)}
          />
        ))}
      </div>
      <div className="wa-fuss">
        <Knopf label="Hinzufügen" onClick={onAdd}>Add</Knopf>
        <Knopf label="Entfernen" disabled={spotify || gewaehlt < 0} onClick={onEntfernen}>Rem</Knopf>
        <Knopf label="Nach oben" disabled={spotify || gewaehlt <= 0} onClick={() => onSchieben(-1)}>▲</Knopf>
        <Knopf label="Nach unten" disabled={spotify || gewaehlt < 0 || gewaehlt >= liste.length - 1} onClick={() => onSchieben(1)}>▼</Knopf>
        <Knopf label="Leeren" disabled={spotify || liste.length === 0} onClick={onLeeren}>Clr</Knopf>
        <Knopf label="Abspielen" disabled={gewaehlt < 0} onClick={() => onSpielen(gewaehlt)}>Play</Knopf>
        <span className="wa-lcd">{liste.length} · {zeit(gesamt) || '0:00'}</span>
      </div>
    </Fenster>
  );
}

function MediaLibrary({ config, conn, suchRef, onAbspielen, onEinreihen }) {
  const maEintrag = config.musik?.maEintrag;
  const sp = config.musik?.spotify;
  const start = maEintrag ? 'ma_titel' : sp?.entity ? 'sp_playlists' : null;
  const [ordner, setOrdner] = useState(start);
  // Ansicht: { titel, items, kontext, quelle, mehr } – Stapel für „Zurück“ beim Aufklappen
  const [stapel, setStapel] = useState([]);
  const [ansicht, setAnsicht] = useState(null);
  const [laedt, setLaedt] = useState(false);
  const [gewaehlt, setGewaehlt] = useState(-1);
  const [text, setText] = useState('');

  const zeigen = useCallback((a, neu = true) => {
    setAnsicht(a);
    setGewaehlt(-1);
    if (neu) setStapel([]);
  }, []);

  const ordnerLaden = useCallback(async (key, offset = 0) => {
    setLaedt(true);
    try {
      if (MA_ART[key]) {
        const r = await maDienst(conn, 'get_library', { config_entry_id: maEintrag, media_type: MA_ART[key], limit: SEITE, offset, order_by: 'sort_name' });
        // mit eigenem Spotify-Ordner zeigt die lokale Bibliothek nur die eigene Musik
        const items = (r?.items || []).map(maTitel).filter((t) => t && !(sp?.entity && istSpotifyUri(t.uri)));
        const name = MA_ORDNER.find(([k]) => k === key)[1];
        setAnsicht((alt) => ({
          titel: name, quelle: 'ma', kontext: null, ordner: key,
          items: offset && alt?.ordner === key ? [...alt.items, ...items] : items,
          mehr: (r?.items || []).length === SEITE ? offset + SEITE : null,
        }));
        if (!offset) { setStapel([]); setGewaehlt(-1); }
      } else {
        const def = SP_ORDNER.find(([k]) => k === key);
        const r = await spDienst(conn, def[2], { entity_id: sp.entity, limit_total: def[3] });
        zeigen({ titel: def[1], quelle: 'spotify', kontext: null, ordner: key, items: spListe(r), mehr: null });
      }
    } catch {
      zeigen({ titel: 'Fehler', quelle: null, items: [], mehr: null });
    } finally {
      setLaedt(false);
    }
  }, [conn, maEintrag, sp?.entity, zeigen]);

  useEffect(() => { if (ordner) ordnerLaden(ordner); }, [ordner, ordnerLaden]);

  const quelle = ordner?.startsWith('sp_') ? 'spotify' : 'ma';
  const suchen = async (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setLaedt(true);
    try {
      if (quelle === 'spotify') {
        const r = await spDienst(conn, 'search_all', { entity_id: sp.entity, criteria: q, criteria_type: 'track,album,artist,playlist', limit_total: 20 });
        zeigen({ titel: `Suche: ${q}`, quelle, kontext: null, items: ['tracks', 'albums', 'playlists', 'artists'].flatMap((k) => spListe(r?.[k])), mehr: null });
      } else {
        const r = await maDienst(conn, 'search', { config_entry_id: maEintrag, name: q, limit: 25 });
        const items = ['tracks', 'albums', 'playlists', 'artists']
          .flatMap((k) => (r?.[k] || []).map(maTitel))
          .filter((t) => t && !(sp?.entity && istSpotifyUri(t.uri)));
        zeigen({ titel: `Suche: ${q}`, quelle, kontext: null, items, mehr: null });
      }
    } catch {
      zeigen({ titel: `Suche: ${q}`, quelle, items: [], mehr: null });
    } finally {
      setLaedt(false);
    }
  };

  // Album, Playlist oder Künstler öffnen (Winamp: einfacher Klick in der Ansicht)
  const oeffnen = async (item) => {
    setLaedt(true);
    try {
      let items = [];
      let kontext = null;
      if (item.quelle === 'spotify') {
        const id = idAus(item.uri);
        if (item.media_type === 'playlist') {
          items = spListe(await spDienst(conn, 'get_playlist_items', { entity_id: sp.entity, playlist_id: id, limit_total: 200 }));
          kontext = item.uri;
        } else if (item.media_type === 'album') {
          items = spListe(await spDienst(conn, 'get_album_tracks', { entity_id: sp.entity, album_id: id, limit_total: 50 }))
            .map((t) => ({ ...t, image: t.image || item.image }));
          kontext = item.uri;
        } else if (item.media_type === 'artist') {
          const r = await spDienst(conn, 'get_artist_top_tracks', { entity_id: sp.entity, artist_id: id });
          items = (Array.isArray(r) ? r : r?.items || r?.tracks || []).map(spTitel).filter(Boolean);
        }
      } else {
        items = await aufklappen(conn, config.player, item);
      }
      setStapel((s) => [...s, ansicht]);
      setAnsicht({ titel: [item.artist, item.name].filter(Boolean).join(' - '), quelle: item.quelle, kontext, items, mehr: null });
      setGewaehlt(-1);
    } catch {
      /* bleibt auf der bisherigen Ansicht */
    } finally {
      setLaedt(false);
    }
  };
  const zurueck = () => {
    const vorher = stapel[stapel.length - 1];
    setStapel((s) => s.slice(0, -1));
    if (vorher) { setAnsicht(vorher); setGewaehlt(-1); }
  };

  const items = ansicht?.items || [];
  const istTitel = (t) => !t.media_type || t.media_type === 'track';
  const waehlen = (i) => {
    const t = items[i];
    if (gewaehlt === i && t && !istTitel(t) && (t.aufklappbar !== false)) oeffnen(t);
    else setGewaehlt(i);
  };
  const spielen = (i) => onAbspielen(ansicht, i);

  return (
    <Fenster titel="Media Library" className="wa-lib">
      <div className="wa-lib-innen">
        <nav className="wa-lcd wa-baum" aria-label="Library">
          {maEintrag && <div className="gruppe">Lokale Bibliothek</div>}
          {maEintrag && MA_ORDNER.map(([k, name]) => (
            <button key={k} type="button" aria-pressed={ordner === k} onClick={() => (ordner === k ? ordnerLaden(k) : setOrdner(k))}>{name}</button>
          ))}
          {sp?.entity && <div className="gruppe">Spotify</div>}
          {sp?.entity && SP_ORDNER.map(([k, name]) => (
            <button key={k} type="button" aria-pressed={ordner === k} onClick={() => (ordner === k ? ordnerLaden(k) : setOrdner(k))}>{name}</button>
          ))}
        </nav>
        <div className="wa-lib-rechts">
          <form className="wa-suche" onSubmit={suchen}>
            <span>Search:</span>
            <input ref={suchRef} value={text} onChange={(e) => setText(e.target.value)} aria-label="Musik suchen" placeholder={quelle === 'spotify' ? 'auf Spotify' : 'in der Bibliothek'} />
          </form>
          <div className="wa-kopf">
            {stapel.length > 0 && <button type="button" className="wa-knopf" style={{ height: 14 }} onClick={zurueck} aria-label="Zurück">‹</button>}
            <span className="name">{ansicht?.titel || ''}</span>
            <span>Länge</span>
          </div>
          <div className="wa-lcd wa-liste" role="listbox" aria-label="Media Library">
            {laedt && <div className="wa-hinweis">Lädt …</div>}
            {!laedt && items.length === 0 && <div className="wa-hinweis">Nichts gefunden.</div>}
            {items.map((t, i) => (
              <Zeile key={`${t.uri}-${i}`} item={t} gewaehlt={i === gewaehlt} onWaehlen={() => waehlen(i)} onSpielen={() => spielen(i)} />
            ))}
            {!laedt && ansicht?.mehr && (
              <button type="button" className="wa-zeile" onClick={() => ordnerLaden(ansicht.ordner, ansicht.mehr)}><span className="name">… weitere laden</span></button>
            )}
          </div>
          <div className="wa-fuss">
            <Knopf label="Abspielen" disabled={gewaehlt < 0} onClick={() => spielen(gewaehlt)}>Play</Knopf>
            <Knopf label="Als Nächstes" disabled={gewaehlt < 0 || !istTitel(items[gewaehlt] || {})} onClick={() => onEinreihen(ansicht, [items[gewaehlt]], 'next')}>Enqueue</Knopf>
            <Knopf label="Anhängen" disabled={gewaehlt < 0 || !istTitel(items[gewaehlt] || {})} onClick={() => onEinreihen(ansicht, [items[gewaehlt]], 'add')}>Add</Knopf>
            <Knopf label="Alle anhängen" disabled={!items.some(istTitel)} onClick={() => onEinreihen(ansicht, items.filter(istTitel), 'add')}>Add all</Knopf>
            {gewaehlt >= 0 && items[gewaehlt] && !istTitel(items[gewaehlt]) && (
              <Knopf label="Öffnen" onClick={() => oeffnen(items[gewaehlt])}>Open</Knopf>
            )}
            <span className="wa-lcd">{items.length} items</span>
          </div>
        </div>
      </div>
    </Fenster>
  );
}

export default function WinampMusik({ config, entities, callService, conn, raum }) {
  const ruf = useCallback((aktionen) => aktionen.forEach(([d, s, data]) => callService?.(d, s, data)), [callService]);
  const sp = config.musik?.spotify;
  const spE = sp?.entity ? entities[sp.entity] : null;
  // Spotify spielt auf dem Gerät des Raums → Spotify steuern und seine Warteschlange zeigen
  const spotify = Boolean(spE && ['playing', 'paused'].includes(spE.state) && (!sp.geraet || spE.attributes?.source === sp.geraet));
  const playerId = spotify ? sp.entity : config.player;
  const player = playerId ? entities[playerId] : null;
  const [ansicht, setAnsicht] = useState('liste');
  const suchRef = useRef(null);

  // Playlist über Music Assistant: gemeinsam auf dem Tunet-Server
  const [pl, setPl] = useState({ items: [], index: 0 });
  const [gewaehlt, setGewaehlt] = useState(-1);
  const speichern = useCallback((neu) => {
    setPl(neu);
    if (raum) saveMedienPlaylist(raum, neu).catch(() => {});
  }, [raum]);
  useEffect(() => {
    if (!raum) return undefined;
    let aus = false;
    const laden = () => fetchMedienPlaylist(raum).then((r) => { if (!aus && r?.items) setPl({ items: r.items, index: r.index || 0 }); }).catch(() => {});
    laden();
    const t = setInterval(laden, 15000);
    return () => { aus = true; clearInterval(t); };
  }, [raum]);

  // Spotify-Warteschlange (neu laden bei Titelwechsel)
  const [schlange, setSchlange] = useState([]);
  const titel = player?.attributes?.media_title;
  useEffect(() => {
    if (!spotify) return undefined;
    let aus = false;
    const laden = () => spDienst(conn, 'get_player_queue_info', { entity_id: sp.entity })
      .then((r) => { if (!aus) setSchlange(spWarteschlange(r)); }).catch(() => {});
    laden();
    const t = setInterval(laden, 20000);
    return () => { aus = true; clearInterval(t); };
  }, [spotify, conn, sp?.entity, titel]);

  const liste = spotify ? schlange : pl.items;
  const laufend = spotify ? (liste.length ? 0 : -1) : laufenderIndex(pl.items, player, pl.index);
  // MA ist weitergesprungen → Position merken, damit alle Geräte denselben Stand zeigen
  useEffect(() => {
    if (!spotify && laufend >= 0 && laufend !== pl.index) speichern({ ...pl, index: laufend });
  }, [spotify, laufend, pl, speichern]);
  useEffect(() => { setGewaehlt(-1); }, [spotify]);

  const index = laufend >= 0 ? laufend : pl.index;
  const playlistSpielen = (i) => {
    if (i < 0 || i >= liste.length) return;
    if (spotify) {
      ruf(spSpringen(config, i));
    } else {
      ruf(maAbspielen(config, pl.items, i));
      speichern({ ...pl, index: i });
    }
  };
  const aendern = (items, neuIndex) => {
    const neu = { items, index: Math.max(0, Math.min(neuIndex, items.length - 1)) };
    speichern(neu);
    if (laufend >= 0) ruf(maRestErsetzen(config, items, neu.index));
  };
  const entfernen = () => {
    if (gewaehlt < 0) return;
    const items = pl.items.filter((_, i) => i !== gewaehlt);
    aendern(items, gewaehlt < index ? index - 1 : index);
    setGewaehlt(Math.min(gewaehlt, items.length - 1));
  };
  const schieben = (d) => {
    const z = gewaehlt + d;
    if (gewaehlt < 0 || z < 0 || z >= pl.items.length) return;
    const items = [...pl.items];
    [items[gewaehlt], items[z]] = [items[z], items[gewaehlt]];
    const neuIndex = index === gewaehlt ? z : index === z ? gewaehlt : index;
    aendern(items, neuIndex);
    setGewaehlt(z);
  };
  const leeren = () => {
    speichern({ items: [], index: 0 });
    if (config.player) ruf([['media_player', 'clear_playlist', { entity_id: config.player }]]);
  };

  // Aus der Library: ganze Ansicht ab Titel i abspielen (Winamp)
  const abspielen = (a, i) => {
    const t = a?.items?.[i];
    if (!t) return;
    if (t.quelle === 'spotify') {
      ruf(spAbspielen(config, a.items, i, a.kontext));
      return;
    }
    ruf(maAbspielen(config, a.items, i));
    if (!t.media_type || t.media_type === 'track') {
      const titelListe = a.items.filter((x) => !x.media_type || x.media_type === 'track');
      speichern({ items: titelListe, index: titelListe.indexOf(t) });
    } else {
      speichern({ items: [], index: 0 });
    }
  };
  const einreihen = (a, items, art) => {
    if (!items.length) return;
    if (items[0].quelle === 'spotify') {
      const sp2 = config.musik?.spotify;
      ruf([['spotifyplus', 'add_player_queue_items', { entity_id: sp2.entity, uris: items.map((t) => t.uri).join(','), ...(sp2.geraet ? { device_id: sp2.geraet } : {}) }]]);
      return;
    }
    ruf(maEinreihen(config, items, art));
    const pos = art === 'next' ? index + 1 : pl.items.length;
    const neu = [...pl.items.slice(0, pos), ...items, ...pl.items.slice(pos)];
    speichern({ items: neu, index: pl.items.length ? pl.index : 0 });
  };

  const zurLibrary = () => { setAnsicht('lib'); setTimeout(() => suchRef.current?.focus(), 0); };
  const umschalter = useMemo(() => (
    <div className="wa-umschalter">
      <Knopf led aktiv={ansicht === 'liste'} onClick={() => setAnsicht('liste')}>Playlist</Knopf>
      <Knopf led aktiv={ansicht === 'lib'} onClick={() => setAnsicht('lib')}>Library</Knopf>
    </div>
  ), [ansicht]);

  return (
    <div className="wa" data-ansicht={ansicht}>
      <Hauptfenster config={config} entities={entities} ruf={ruf} playerId={playerId} liste={liste} index={laufend} onEject={zurLibrary} />
      <ZonenFenster config={config} entities={entities} ruf={ruf} />
      {umschalter}
      <PlaylistEditor
        spotify={spotify} liste={liste} laufend={laufend} gewaehlt={gewaehlt} setGewaehlt={setGewaehlt}
        onSpielen={playlistSpielen} onEntfernen={entfernen} onSchieben={schieben} onLeeren={leeren} onAdd={zurLibrary}
      />
      <MediaLibrary config={config} conn={conn} suchRef={suchRef} onAbspielen={abspielen} onEinreihen={einreihen} />
    </div>
  );
}
