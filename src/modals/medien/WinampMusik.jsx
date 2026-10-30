import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from '../../icons';
import { beideZonenAktionen, playAktionen } from '../../components/cards/MedienCard';
import {
  deleteMedienPlaylist, fetchMedienListen, fetchMedienPlaylist, saveMedienPlaylist,
} from '../../services/settingsApi';
import {
  auswahlKlick, ausblendenKonfig, blockSchieben, browseTitel, istSpotifyUri, laufenderIndex, maAbspielen, maEinreihen,
  maRestErsetzen, maTitel, ohneAuswahl, position, spAbspielen, spListe, spSpringen, spTitel, spWarteschlange, zeit,
} from './musik';
import useLautstaerke from './useLautstaerke';
import './winamp.css';

/*
 * Musik-Reiter des Medien-Fensters im Winamp-Stil:
 *   Hauptfenster  – Lauftext, Zeit, Spulen, Lautstärke, Steuerung, Shuffle/Repeat
 *   Zonen         – an Stelle des Equalizers: Quellen des Raums, „Beide Zonen“, Lautstärken
 *   Playlist      – Spotify: Warteschlange; sonst die Liste, die über Music Assistant läuft
 *                   (gemeinsam auf dem Tunet-Server, auch unter einem Namen speicherbar)
 *   Media Library – Lokale Bibliothek (Music Assistant), Meine Playlists, Spotify (SpotifyPlus)
 * Wie in Winamp: Antippen wählt (Shift/Strg bzw. „Sel“ für mehrere), Doppeltippen spielt –
 * aus der Library die ganze angezeigte Liste ab diesem Titel. Shift+V blendet aus und
 * stoppt, Enter (auch währenddessen) spielt danach den gewählten Titel; „Fade“ macht beides.
 * Ausgeblendet wird die Lautstärke des Players (settings.medien.musik.ausblenden:
 * { sekunden: 4, ueber: 'player' | 'zone' }), damit es auch ohne steuerbaren Verstärker geht.
 */

const AN = ['on', 'playing', 'paused', 'idle', 'buffering'];
const istAn = (e) => Boolean(e) && AN.includes(e.state);
const idAus = (uri) => String(uri || '').split(':').pop();
const schlaf = (ms) => new Promise((r) => { setTimeout(r, ms); });
const istTitel = (t) => Boolean(t) && (!t.media_type || t.media_type === 'track');

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
const listenSchluessel = (raum, name) => `${raum}/listen/${name}`;
async function gespeicherteLaden(schluessel) {
  const r = await fetchMedienPlaylist(schluessel);
  return (r?.items || []).map((t) => ({ ...t, quelle: 'ma' }));
}

// Ordner der Media Library: [Schlüssel, Name, …]
const MA_ORDNER = [['ma_titel', 'Alle Titel'], ['ma_kuenstler', 'Künstler'], ['ma_alben', 'Alben'], ['ma_playlists', 'Playlists']];
const MEINE = ['ma_meine', 'Meine Playlists'];
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
const ART_NAME = { album: 'Album', playlist: 'Playlist', artist: 'Künstler', folder: 'Ordner', radio: 'Radio', gespeichert: 'Liste' };
const TASTEN_AUS = ['INPUT', 'TEXTAREA', 'SELECT'];

const Knopf = ({ onClick, label, aktiv, led, gross, disabled, children, ...rest }) => (
  <button
    type="button" className={`wa-knopf${gross ? ' gross' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}
    aria-pressed={aktiv === undefined ? undefined : Boolean(aktiv)} {...rest}
  >
    {led && <span className="wa-led" />}
    {children}
  </button>
);

// aktiv: Fenster mit Tastaturfokus (Winamp: helle Titelleiste)
const Fenster = ({ titel, className = '', aktiv, onFokus, children }) => (
  <section className={`wa-fenster ${className}${aktiv ? ' wa-aktiv' : ''}`} aria-label={titel} onPointerDown={onFokus}>
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
      aria-selected={gewaehlt}
    >
      {nr !== undefined && <span className="nr">{nr}.</span>}
      <span className="name">{[item.artist, item.name].filter(Boolean).join(' - ') || item.uri}</span>
      {ART_NAME[item.media_type] && <span className="art">{ART_NAME[item.media_type]}{item.anzahl ? ` · ${item.anzahl}` : ''}</span>}
      <span className="dauer">{zeit(item.dauer)}</span>
    </button>
  );
}

// Klick in einer Liste: Auswahl nach Winamp-Regeln (Shift, Strg/Cmd, Mehrfach-Modus)
function klickAuswahl(e, i, liste, mehrfach) {
  const neu = auswahlKlick(liste.auswahl, i, { shift: e?.shiftKey, mehrfach: mehrfach || e?.ctrlKey || e?.metaKey }, liste.anker);
  return { auswahl: neu, anker: e?.shiftKey && liste.anker >= 0 ? liste.anker : i };
}

function Hauptfenster({ config, entities, ruf, lautSetzen, playerId, index, onEject, onAusblenden, faded, aktiv, onFokus, apiRef }) {
  const player = playerId ? entities[playerId] : null;
  const pa = player?.attributes || {};
  // ohne Zone regelt der Lautstärke-Regler den Player selbst
  const lautId = config.zone || playerId;
  const laut = lautId ? entities[lautId] : null;
  const [, setTakt] = useState(0);
  useEffect(() => {
    if (player?.state !== 'playing') return undefined;
    const t = setInterval(() => setTakt((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [player?.state]);
  const lang = useRef(null);
  const pos = position(player);
  const spielt = player?.state === 'playing';
  const nr = index >= 0 ? `${index + 1}. ` : '';
  const text = pa.media_title ? `${nr}${[pa.media_artist, pa.media_title].filter(Boolean).join(' - ')}` : 'Nichts ausgewählt';
  const zeichen = faded ? '↘' : spielt ? '▶' : player?.state === 'paused' ? '❚❚' : '■';
  const regler = useLautstaerke(laut, lautId, lautSetzen);
  const p = (service, data = {}) => ruf([['media_player', service, { entity_id: playerId, ...data }]]);
  // Winamp: ↑/↓ Lautstärke, ←/→ spulen, solange das Hauptfenster aktiv ist
  apiRef.current = {
    lauter: (d) => { if (istAn(laut)) regler.schritt(d); },
    spulen: (d) => {
      if (player && pa.media_duration) p('media_seek', { seek_position: Math.max(0, Math.min(pa.media_duration, Math.round((pos || 0) + d))) });
    },
  };
  const shuffle = Boolean(pa.shuffle);
  const repeat = pa.repeat && pa.repeat !== 'off';
  // ■ lange drücken: ausblenden und stoppen
  const stoppDruck = () => { lang.current = setTimeout(() => { lang.current = 'lang'; onAusblenden(); }, 600); };
  const stoppLos = () => { if (lang.current && lang.current !== 'lang') clearTimeout(lang.current); };
  const stoppKlick = () => { if (lang.current === 'lang') { lang.current = null; return; } lang.current = null; p('media_stop'); };
  return (
    <Fenster titel="Winamp" className="wa-haupt" aktiv={aktiv} onFokus={onFokus}>
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
            type="range" className={`wa-regler${aktiv ? ' markiert' : ''}`} min={0} max={100} aria-label="Lautstärke (↑/↓)"
            title="Lautstärke – Pfeiltasten ↑/↓" disabled={!istAn(laut)} {...regler.props}
          />
        </div>
      </div>
      <input
        type="range" className="wa-regler spulen" style={{ marginTop: 6 }} min={0} max={Math.max(1, Math.round(pa.media_duration || 0))}
        value={Math.round(pos || 0)} aria-label="Spulen" disabled={!player || !pa.media_duration}
        onChange={(e) => p('media_seek', { seek_position: Number(e.target.value) })}
      />
      <div className="wa-knopfreihe" style={{ marginTop: 6 }}>
        <Knopf gross label="Zurück (Z)" disabled={!player} onClick={() => p('media_previous_track')}><SkipBack /></Knopf>
        <Knopf gross label="Abspielen (X)" disabled={!player} onClick={() => (spielt ? null : ruf(playAktionen(config, entities, playerId)))}><Play /></Knopf>
        <Knopf gross label="Pause (C)" disabled={!player} onClick={() => p('media_pause')}><Pause /></Knopf>
        <Knopf
          gross label="Stopp (V), lange drücken: ausblenden (Shift+V)" disabled={!player}
          onPointerDown={stoppDruck} onPointerUp={stoppLos} onPointerLeave={stoppLos} onClick={stoppKlick}
        >
          <span style={{ width: 10, height: 10, background: 'currentColor' }} />
        </Knopf>
        <Knopf gross label="Weiter (B)" disabled={!player} onClick={() => p('media_next_track')}><SkipForward /></Knopf>
        <Knopf gross label="Library" onClick={onEject}><span style={{ fontSize: 12 }}>⏏︎</span></Knopf>
        <span style={{ flex: 1 }} />
        <Knopf label="Shuffle" led aktiv={shuffle} disabled={!player} onClick={() => p('shuffle_set', { shuffle: !shuffle })}><Shuffle /></Knopf>
        <Knopf label="Repeat" led aktiv={repeat} disabled={!player} onClick={() => p('repeat_set', { repeat: repeat ? 'off' : 'all' })}><Repeat /></Knopf>
      </div>
    </Fenster>
  );
}

function Fader({ name, entityId, entities, lautSetzen }) {
  const e = entityId ? entities[entityId] : null;
  const regler = useLautstaerke(e, entityId, lautSetzen);
  if (!e) return null;
  return (
    <label className="wa-fader">
      <input type="range" min={0} max={100} aria-label={`Lautstärke ${name}`} disabled={!istAn(e)} {...regler.props} />
      <span className="wa-lcd">{istAn(e) ? regler.wert : '--'}</span>
      <span>{name}</span>
    </label>
  );
}

// Zonen: Quellen des Raums, „Beide Zonen“ und die Lautstärken als Equalizer-Regler
function ZonenFenster({ config, entities, ruf, lautSetzen }) {
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
        <Fader name={config.name || 'Raum'} entityId={config.zone} entities={entities} lautSetzen={lautSetzen} />
        {haupt && <Fader name="Haupt" entityId={haupt} entities={entities} lautSetzen={lautSetzen} />}
      </div>
    </Fenster>
  );
}

function PlaylistEditor({
  spotify, liste, laufend, auswahl, mehrfach, setMehrfach, onKlick, onSpielen, onEntfernen, onSchieben, onLeeren, onAdd,
  onFade, onSpeichern, onFokus, aktiv,
}) {
  const gesamt = liste.reduce((s, t) => s + (t.dauer || 0), 0);
  const listeRef = useRef(null);
  const [name, setName] = useState(null);
  useEffect(() => {
    listeRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [laufend]);
  const erster = auswahl.length ? auswahl[0] : -1;
  const speichern = (e) => {
    e.preventDefault();
    if (!name?.trim()) return;
    onSpeichern(name.trim());
    setName(null);
  };
  return (
    <Fenster titel={spotify ? 'Playlist Editor · Spotify' : 'Playlist Editor'} className="wa-playlist" aktiv={aktiv} onFokus={onFokus}>
      <div ref={listeRef} className="wa-lcd wa-liste" role="listbox" aria-label="Playlist" aria-multiselectable="true">
        {liste.length === 0 && <div className="wa-hinweis">{spotify ? 'Spotify-Warteschlange ist leer.' : 'Leer – in der Media Library doppelt tippen.'}</div>}
        {liste.map((t, i) => (
          <Zeile
            key={`${t.uri}-${i}`} nr={i + 1} item={t} laeuft={i === laufend} gewaehlt={auswahl.includes(i)}
            onWaehlen={(e) => onKlick(e, i)} onSpielen={() => onSpielen(i)}
          />
        ))}
      </div>
      {name !== null && (
        <form className="wa-suche" style={{ paddingTop: 5 }} onSubmit={speichern}>
          <span>Name:</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name der Playlist" maxLength={80} />
          <Knopf label="Speichern" type="submit" onClick={undefined}>OK</Knopf>
          <Knopf label="Abbrechen" onClick={() => setName(null)}>×</Knopf>
        </form>
      )}
      <div className="wa-fuss">
        <Knopf label="Hinzufügen" onClick={onAdd}>Add</Knopf>
        <Knopf label="Entfernen (Entf)" disabled={spotify || !auswahl.length} onClick={onEntfernen}>Rem</Knopf>
        <Knopf label="Mehrere wählen" led aktiv={mehrfach} onClick={() => setMehrfach(!mehrfach)}>Sel</Knopf>
        <Knopf label="Nach oben" disabled={spotify || !auswahl.length || auswahl[0] <= 0} onClick={() => onSchieben(-1)}>▲</Knopf>
        <Knopf label="Nach unten" disabled={spotify || !auswahl.length || auswahl[auswahl.length - 1] >= liste.length - 1} onClick={() => onSchieben(1)}>▼</Knopf>
        <Knopf label="Leeren" disabled={spotify || liste.length === 0} onClick={onLeeren}>Clr</Knopf>
        <Knopf label="Als Playlist speichern" disabled={spotify || liste.length === 0} onClick={() => setName('')}>Save</Knopf>
        <Knopf label="Abspielen (Enter)" disabled={erster < 0} onClick={() => onSpielen(erster)}>Play</Knopf>
        <Knopf label="Ausblenden und Gewählten spielen" onClick={onFade}>Fade</Knopf>
        <span className="wa-lcd">{liste.length} · {zeit(gesamt) || '0:00'}</span>
      </div>
    </Fenster>
  );
}

function MediaLibrary({ config, conn, raum, apiRef, suchRef, mehrfach, setMehrfach, listenStand, onAbspielen, onEinreihen, onFade, onFokus, aktiv }) {
  const maEintrag = config.musik?.maEintrag;
  const sp = config.musik?.spotify;
  const start = maEintrag ? 'ma_titel' : sp?.entity ? 'sp_playlists' : null;
  const [ordner, setOrdner] = useState(start);
  // Ansicht: { titel, items, kontext, quelle, mehr, ordner } – Stapel für „Zurück“ beim Aufklappen
  const [stapel, setStapel] = useState([]);
  const [ansicht, setAnsicht] = useState(null);
  const [laedt, setLaedt] = useState(false);
  const [wahl, setWahl] = useState({ auswahl: [], anker: -1 });
  const [text, setText] = useState('');
  const [loeschen, setLoeschen] = useState(null);

  const zeigen = useCallback((a, neu = true) => {
    setAnsicht(a);
    setWahl({ auswahl: [], anker: -1 });
    setLoeschen(null);
    if (neu) setStapel([]);
  }, []);

  const ordnerLaden = useCallback(async (key, offset = 0) => {
    setLaedt(true);
    try {
      if (key === MEINE[0]) {
        const listen = raum ? await fetchMedienListen(raum) : [];
        zeigen({
          titel: MEINE[1], quelle: 'ma', ordner: key, mehr: null,
          items: (listen || []).map((l) => ({ uri: l.schluessel, name: l.name, artist: '', dauer: null, media_type: 'gespeichert', quelle: 'ma', anzahl: l.anzahl })),
        });
      } else if (MA_ART[key]) {
        const r = await maDienst(conn, 'get_library', { config_entry_id: maEintrag, media_type: MA_ART[key], limit: SEITE, offset, order_by: 'sort_name' });
        // mit eigenem Spotify-Ordner zeigt die lokale Bibliothek nur die eigene Musik
        const items = (r?.items || []).map(maTitel).filter((t) => t && !(sp?.entity && istSpotifyUri(t.uri)));
        const name = MA_ORDNER.find(([k]) => k === key)[1];
        setAnsicht((alt) => ({
          titel: name, quelle: 'ma', kontext: null, ordner: key,
          items: offset && alt?.ordner === key ? [...alt.items, ...items] : items,
          mehr: (r?.items || []).length === SEITE ? offset + SEITE : null,
        }));
        if (!offset) { setStapel([]); setWahl({ auswahl: [], anker: -1 }); }
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
  }, [conn, maEintrag, raum, sp?.entity, zeigen]);

  useEffect(() => { if (ordner) ordnerLaden(ordner); }, [ordner, ordnerLaden]);
  // neu gespeicherte Playlist sofort in „Meine Playlists“ zeigen
  useEffect(() => { if (listenStand && ordner === MEINE[0] && !stapel.length) ordnerLaden(MEINE[0]); }, [listenStand]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Album, Playlist, Künstler oder gespeicherte Liste öffnen
  const oeffnet = useRef(null);
  const oeffnen = async (item) => {
    // Klick + Doppelklick lösen beides aus – dasselbe nur einmal öffnen
    if (oeffnet.current === item.uri) return;
    oeffnet.current = item.uri;
    setLaedt(true);
    try {
      let items = [];
      let kontext = null;
      if (item.media_type === 'gespeichert') {
        items = await gespeicherteLaden(item.uri);
      } else if (item.quelle === 'spotify') {
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
      setWahl({ auswahl: [], anker: -1 });
      setLoeschen(null);
    } catch {
      /* bleibt auf der bisherigen Ansicht */
    } finally {
      setLaedt(false);
      oeffnet.current = null;
    }
  };
  const zurueck = () => {
    const vorher = stapel[stapel.length - 1];
    setStapel((s) => s.slice(0, -1));
    if (vorher) { setAnsicht(vorher); setWahl({ auswahl: [], anker: -1 }); }
  };

  const items = ansicht?.items || [];
  const auswahl = wahl.auswahl;
  const erster = auswahl.length ? auswahl[0] : -1;
  const gewaehlteTitel = auswahl.map((i) => items[i]).filter(istTitel);
  const klick = (e, i) => {
    const t = items[i];
    const einfach = !mehrfach && !e?.shiftKey && !e?.ctrlKey && !e?.metaKey;
    // zweites Antippen eines Albums/einer Playlist öffnet sie
    if (einfach && auswahl.length === 1 && auswahl[0] === i && t && !istTitel(t) && t.aufklappbar !== false) oeffnen(t);
    else setWahl(klickAuswahl(e, i, wahl, mehrfach));
  };
  const spielen = (i) => onAbspielen(ansicht, i);
  // Doppelklick: Titel spielen, Album/Playlist/Künstler nur öffnen (gespielt wird erst ein Titel daraus)
  const doppelklick = (i) => {
    const t = items[i];
    if (!t) return;
    if (istTitel(t)) spielen(i);
    else if (t.aufklappbar !== false) oeffnen(t);
  };
  const loeschKnopf = async () => {
    const t = items[erster];
    if (!t || t.media_type !== 'gespeichert') return;
    if (loeschen !== t.uri) { setLoeschen(t.uri); return; }
    await deleteMedienPlaylist(t.uri).catch(() => {});
    ordnerLaden(MEINE[0]);
  };

  // für Tasten (Enter, Pfeile) und „Fade“ aus dem übergeordneten Fenster
  apiRef.current = {
    // Enter wie Doppelklick: Titel spielen, Album & Co. öffnen
    spielen: () => (erster >= 0 ? () => doppelklick(erster) : null),
    bewegen: (d) => {
      if (!items.length) return;
      const z = Math.max(0, Math.min(items.length - 1, (erster < 0 ? -1 : auswahl[auswahl.length - 1]) + d));
      setWahl({ auswahl: [z], anker: z });
    },
  };

  const ordnerKnopf = ([k, name]) => (
    <button key={k} type="button" aria-pressed={ordner === k} onClick={() => (ordner === k ? ordnerLaden(k) : setOrdner(k))}>{name}</button>
  );

  return (
    <Fenster titel="Media Library" className="wa-lib" aktiv={aktiv} onFokus={onFokus}>
      <div className="wa-lib-innen">
        <nav className="wa-lcd wa-baum" aria-label="Library">
          {maEintrag && <div className="gruppe">Lokale Bibliothek</div>}
          {maEintrag && MA_ORDNER.map(ordnerKnopf)}
          {raum && ordnerKnopf(MEINE)}
          {sp?.entity && <div className="gruppe">Spotify</div>}
          {sp?.entity && SP_ORDNER.map(ordnerKnopf)}
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
          <div className="wa-lcd wa-liste" role="listbox" aria-label="Media Library" aria-multiselectable="true">
            {laedt && <div className="wa-hinweis">Lädt …</div>}
            {!laedt && items.length === 0 && <div className="wa-hinweis">{ansicht?.ordner === MEINE[0] ? 'Noch keine – im Playlist Editor „Save“.' : 'Nichts gefunden.'}</div>}
            {items.map((t, i) => (
              <Zeile key={`${t.uri}-${i}`} item={t} gewaehlt={auswahl.includes(i)} onWaehlen={(e) => klick(e, i)} onSpielen={() => doppelklick(i)} />
            ))}
            {!laedt && ansicht?.mehr && (
              <button type="button" className="wa-zeile" onClick={() => ordnerLaden(ansicht.ordner, ansicht.mehr)}><span className="name">… weitere laden</span></button>
            )}
          </div>
          <div className="wa-fuss">
            <Knopf label="Abspielen (Enter)" disabled={erster < 0} onClick={() => spielen(erster)}>Play</Knopf>
            <Knopf label="Als Nächstes" disabled={!gewaehlteTitel.length} onClick={() => onEinreihen(gewaehlteTitel, 'next')}>Enqueue</Knopf>
            <Knopf label="Anhängen" disabled={!gewaehlteTitel.length} onClick={() => onEinreihen(gewaehlteTitel, 'add')}>Add</Knopf>
            <Knopf label="Alle anhängen" disabled={!items.some(istTitel)} onClick={() => onEinreihen(items.filter(istTitel), 'add')}>Add all</Knopf>
            <Knopf label="Mehrere wählen" led aktiv={mehrfach} onClick={() => setMehrfach(!mehrfach)}>Sel</Knopf>
            <Knopf label="Ausblenden und Gewählten spielen" onClick={() => onFade(erster >= 0 ? () => spielen(erster) : null)}>Fade</Knopf>
            {erster >= 0 && items[erster] && !istTitel(items[erster]) && (
              <Knopf label="Öffnen" onClick={() => oeffnen(items[erster])}>Open</Knopf>
            )}
            {erster >= 0 && items[erster]?.media_type === 'gespeichert' && (
              <Knopf label="Playlist löschen" onClick={loeschKnopf}>{loeschen === items[erster].uri ? 'Del?' : 'Del'}</Knopf>
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
  const [mehrfach, setMehrfach] = useState(false);
  // Fenster mit Tastaturfokus: 'haupt' (↑/↓ Lautstärke), 'liste' (Playlist), 'lib'
  const [fokus, setFokus] = useState('haupt');
  const [listenStand, setListenStand] = useState(0);
  const suchRef = useRef(null);
  const libApi = useRef(null);
  const hauptApi = useRef(null);
  // Lautstärke mit Rückmeldung (Promise), damit der Regler nur einen Befehl gleichzeitig schickt
  const lautSetzen = useCallback((id, v) => callService?.('media_player', 'volume_set', { entity_id: id, volume_level: v }), [callService]);

  // Playlist über Music Assistant: gemeinsam auf dem Tunet-Server
  const [pl, setPl] = useState({ items: [], index: 0 });
  const [plWahl, setPlWahl] = useState({ auswahl: [], anker: -1 });
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
  useEffect(() => { setPlWahl({ auswahl: [], anker: -1 }); }, [spotify]);

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
  const aendern = (neu) => {
    speichern({ items: neu.items, index: neu.index });
    if (laufend >= 0) ruf(maRestErsetzen(config, neu.items, neu.index));
  };
  const entfernen = () => {
    if (spotify || !plWahl.auswahl.length) return;
    aendern(ohneAuswahl(pl.items, plWahl.auswahl, index));
    setPlWahl({ auswahl: [], anker: -1 });
  };
  const schieben = (d) => {
    if (spotify) return;
    const neu = blockSchieben(pl.items, plWahl.auswahl, index, d);
    if (!neu) return;
    aendern(neu);
    setPlWahl({ auswahl: neu.auswahl, anker: neu.auswahl[0] });
  };
  const leeren = () => {
    speichern({ items: [], index: 0 });
    setPlWahl({ auswahl: [], anker: -1 });
    if (config.player) ruf([['media_player', 'clear_playlist', { entity_id: config.player }]]);
  };
  const alsListeSpeichern = (name) => {
    if (!raum || !pl.items.length) return;
    saveMedienPlaylist(listenSchluessel(raum, name), { items: pl.items, index: 0 })
      .then(() => setListenStand((x) => x + 1)).catch(() => {});
  };

  // Aus der Library: ganze Ansicht ab Titel i abspielen (Winamp)
  const abspielen = async (a, i) => {
    const t = a?.items?.[i];
    if (!t) return;
    if (t.media_type === 'gespeichert') {
      const items = await gespeicherteLaden(t.uri).catch(() => []);
      if (!items.length) return;
      ruf(maAbspielen(config, items, 0));
      speichern({ items, index: 0 });
      return;
    }
    if (t.quelle === 'spotify') {
      ruf(spAbspielen(config, a.items, i, a.kontext));
      return;
    }
    ruf(maAbspielen(config, a.items, i));
    if (istTitel(t)) {
      const titelListe = a.items.filter(istTitel);
      speichern({ items: titelListe, index: titelListe.indexOf(t) });
    } else {
      speichern({ items: [], index: 0 });
    }
  };
  const einreihen = (items, art) => {
    if (!items.length) return;
    if (items[0].quelle === 'spotify') {
      ruf([['spotifyplus', 'add_player_queue_items', { entity_id: sp.entity, uris: items.map((t) => t.uri).join(','), ...(sp.geraet ? { device_id: sp.geraet } : {}) }]]);
      return;
    }
    ruf(maEinreihen(config, items, art));
    const pos = art === 'next' ? index + 1 : pl.items.length;
    const neu = [...pl.items.slice(0, pos), ...items, ...pl.items.slice(pos)];
    speichern({ items: neu, index: pl.items.length ? pl.index : 0 });
  };

  // Ausblenden über die Lautstärke des Players (oder der Zone), danach stoppen und ggf. weiter
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const fade = useRef({ laeuft: false, danach: null, weg: false });
  const [faded, setFaded] = useState(false);
  useEffect(() => () => { fade.current.weg = true; }, []);
  const ausblenden = useCallback(async (danach = null) => {
    const f = fade.current;
    if (f.laeuft) { if (danach) f.danach = danach; return; }
    const { sekunden, ueber } = ausblendenKonfig(config);
    const ziel = ueber === 'zone' ? config.zone : playerId;
    const istSp = playerId && playerId === sp?.entity;
    const vol = ziel ? entitiesRef.current[ziel]?.attributes?.volume_level : null;
    const spielt = entitiesRef.current[playerId]?.state === 'playing';
    const setzen = (v) => callService?.('media_player', 'volume_set', { entity_id: ziel, volume_level: Math.round(v * 1000) / 1000 });
    // wenige Schritte: langsame Geräte (HEOS) und die Spotify-Web-API stauen sonst Befehle auf
    const proSek = istSp ? 2 : 3;
    const rampe = async (von, bis, sek) => {
      const n = Math.max(1, Math.round(sek * proSek));
      for (let k = 1; k <= n; k += 1) {
        await schlaf(1000 / proSek);
        setzen(von + ((bis - von) * k) / n);
      }
    };
    f.laeuft = true;
    f.danach = danach;
    setFaded(true);
    const mitLautstaerke = spielt && ziel && Number.isFinite(vol) && vol > 0;
    if (mitLautstaerke) await rampe(vol, 0, sekunden);
    if (spielt) callService?.('media_player', istSp ? 'media_pause' : 'media_stop', { entity_id: playerId });
    const weiter = f.weg ? null : f.danach;
    f.laeuft = false;
    f.danach = null;
    if (!f.weg) setFaded(false);
    if (weiter) {
      weiter();
      if (mitLautstaerke) { await schlaf(1500); await rampe(0, vol, 1); }
    } else if (mitLautstaerke) {
      // still zurück, damit der nächste Start nicht bei 0 beginnt
      await schlaf(800);
      setzen(vol);
    }
  }, [callService, config, playerId, sp?.entity]);

  const playlistAuswahlSpielen = () => (plWahl.auswahl.length ? () => playlistSpielen(plWahl.auswahl[0]) : null);
  const gewaehltesSpielen = () => (fokus === 'lib' ? libApi.current?.spielen() : playlistAuswahlSpielen());

  // Winamp-Tasten (nur außerhalb von Eingabefeldern)
  const tastenRef = useRef(null);
  tastenRef.current = (e) => {
    if (TASTEN_AUS.includes(e.target?.tagName) || e.target?.isContentEditable || e.altKey) return;
    const k = e.key;
    const p = (service) => playerId && ruf([['media_player', service, { entity_id: playerId }]]);
    if (e.shiftKey && (k === 'V' || k === 'v')) { e.preventDefault(); ausblenden(null); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (k === 'Enter') {
      const los = gewaehltesSpielen();
      if (!los) return;
      e.preventDefault();
      if (fade.current.laeuft) fade.current.danach = los; else los();
    } else if (k === 'z' || k === 'Z') p('media_previous_track');
    else if (k === 'x' || k === 'X') { if (player?.state !== 'playing') ruf(playAktionen(config, entities, playerId)); }
    else if (k === 'c' || k === 'C') p('media_pause');
    else if (k === 'v') p('media_stop');
    else if (k === 'b' || k === 'B') p('media_next_track');
    else if (fokus === 'haupt' && (k === 'ArrowUp' || k === 'ArrowDown')) {
      e.preventDefault();
      hauptApi.current?.lauter(k === 'ArrowUp' ? 2 : -2);
    } else if (fokus === 'haupt' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault();
      hauptApi.current?.spulen(k === 'ArrowRight' ? 5 : -5);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      const d = k === 'ArrowDown' ? 1 : -1;
      if (fokus === 'lib') { libApi.current?.bewegen(d); return; }
      if (!liste.length) return;
      const z = Math.max(0, Math.min(liste.length - 1, (plWahl.auswahl.length ? plWahl.auswahl[plWahl.auswahl.length - 1] : -1) + d));
      setPlWahl({ auswahl: [z], anker: z });
    } else if (k === 'Delete' && fokus === 'liste') entfernen();
  };
  useEffect(() => {
    const h = (e) => tastenRef.current?.(e);
    // Capture: die Medien-Kachel stoppt Tastendrücke aus dem Fenster (Verschieben), deshalb vorher mithören
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  const zurLibrary = () => { setAnsicht('lib'); setFokus('lib'); setTimeout(() => suchRef.current?.focus(), 0); };

  return (
    <div className="wa" data-ansicht={ansicht}>
      <Hauptfenster
        config={config} entities={entities} ruf={ruf} lautSetzen={lautSetzen} playerId={playerId} index={laufend} onEject={zurLibrary}
        onAusblenden={() => ausblenden(null)} faded={faded} aktiv={fokus === 'haupt'} onFokus={() => setFokus('haupt')} apiRef={hauptApi}
      />
      <ZonenFenster config={config} entities={entities} ruf={ruf} lautSetzen={lautSetzen} />
      <div className="wa-umschalter">
        <Knopf led aktiv={ansicht === 'liste'} onClick={() => { setAnsicht('liste'); setFokus('liste'); }}>Playlist</Knopf>
        <Knopf led aktiv={ansicht === 'lib'} onClick={() => { setAnsicht('lib'); setFokus('lib'); }}>Library</Knopf>
      </div>
      <PlaylistEditor
        spotify={spotify} liste={liste} laufend={laufend} auswahl={plWahl.auswahl} mehrfach={mehrfach} setMehrfach={setMehrfach}
        onKlick={(e, i) => setPlWahl(klickAuswahl(e, i, plWahl, mehrfach))}
        onSpielen={playlistSpielen} onEntfernen={entfernen} onSchieben={schieben} onLeeren={leeren} onAdd={zurLibrary}
        onFade={() => ausblenden(playlistAuswahlSpielen())} onSpeichern={alsListeSpeichern} onFokus={() => setFokus('liste')} aktiv={fokus === 'liste'}
      />
      <MediaLibrary
        config={config} conn={conn} raum={raum} apiRef={libApi} suchRef={suchRef} mehrfach={mehrfach} setMehrfach={setMehrfach}
        listenStand={listenStand} onAbspielen={abspielen} onEinreihen={einreihen} onFade={(los) => ausblenden(los)}
        onFokus={() => setFokus('lib')} aktiv={fokus === 'lib'}
      />
    </div>
  );
}
