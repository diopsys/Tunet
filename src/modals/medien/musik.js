/*
 * Daten und Abspiel-Aktionen des Winamp-Fensters der Medien-Kachel.
 * Titel einheitlich: { uri, name, artist, dauer (s|null), image, media_type, quelle }
 *   quelle 'spotify' (SpotifyPlus, Spotify Connect) oder 'ma' (Music Assistant, z. B. NAS).
 * Aktionen sind Listen [domain, service, data] – die Kachel ruft sie der Reihe nach auf.
 */

export const istSpotifyUri = (uri) => /^spotify/.test(uri || '');

const namen = (artists) => (Array.isArray(artists) ? artists.map((a) => a?.name).filter(Boolean).join(', ') : '');

/** Eintrag einer SpotifyPlus-Antwort (Track, Album, Playlist, Künstler; auch {track}/{album}). */
export function spTitel(x) {
  const o = x?.track || x?.album || x;
  if (!o?.uri || !o.name) return null;
  return {
    uri: o.uri,
    name: o.name,
    artist: namen(o.artists) || o.owner?.display_name || '',
    dauer: Number.isFinite(o.duration_ms) ? Math.round(o.duration_ms / 1000) : null,
    image: o.image_url || o.images?.[0]?.url || o.album?.image_url || x?.image_url || null,
    media_type: o.type || 'track',
    quelle: 'spotify',
  };
}

/** Liste einer SpotifyPlus-Antwort ohne Doppelte. */
export function spListe(r) {
  const gesehen = new Set();
  return (r?.items || []).map(spTitel).filter((t) => t && !gesehen.has(t.uri) && gesehen.add(t.uri));
}

/** Eintrag einer Music-Assistant-Antwort (get_library, search, get_queue). */
export function maTitel(x) {
  const o = x?.media_item || x;
  if (!o?.uri) return null;
  return {
    uri: o.uri,
    name: o.name || '',
    artist: namen(o.artists),
    dauer: Number.isFinite(x?.duration) ? x.duration : Number.isFinite(o.duration) ? o.duration : null,
    image: o.image || o.album?.image || null,
    media_type: o.media_type || 'track',
    quelle: 'ma',
  };
}

/** Kind aus media_player/browse_media (Titel „Künstler - Titel“). */
export function browseTitel(c) {
  if (!c?.media_content_id) return null;
  const track = c.media_class === 'track';
  const teile = track ? String(c.title || '').split(' - ') : [];
  return {
    uri: c.media_content_id,
    name: track && teile.length > 1 ? teile.slice(1).join(' - ') : c.title || '',
    artist: track && teile.length > 1 ? teile[0] : '',
    dauer: null,
    image: c.thumbnail || null,
    media_type: c.media_class === 'directory' ? 'folder' : c.media_class || 'track',
    quelle: 'ma',
    aufklappbar: Boolean(c.can_expand),
  };
}

/** Winamp-Zeit: m:ss bzw. h:mm:ss. */
export function zeit(sek) {
  if (!Number.isFinite(sek) || sek < 0) return '';
  const s = Math.floor(sek % 60);
  const m = Math.floor(sek / 60) % 60;
  const h = Math.floor(sek / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Abgelaufene Zeit eines Players aus media_position und media_position_updated_at. */
export function position(player, jetzt = Date.now()) {
  const a = player?.attributes || {};
  if (!Number.isFinite(a.media_position)) return null;
  if (player.state !== 'playing' || !a.media_position_updated_at) return a.media_position;
  const seit = (jetzt - Date.parse(a.media_position_updated_at)) / 1000;
  const p = a.media_position + Math.max(0, seit);
  return Number.isFinite(a.media_duration) ? Math.min(p, a.media_duration) : p;
}

/** Laufenden Titel in der Playlist finden (ab dem gemerkten Index, sonst überall). */
export function laufenderIndex(items, player, gemerkt = 0) {
  const titel = player?.attributes?.media_title;
  if (!titel || !items?.length) return -1;
  const gleich = (t) => t.name && t.name.localeCompare(titel, undefined, { sensitivity: 'base' }) === 0;
  for (let i = Math.max(0, gemerkt); i < items.length; i += 1) if (gleich(items[i])) return i;
  return items.findIndex(gleich);
}

/** Raum einschalten und auf den Eingang des Players stellen (HEOS), damit nicht die Hauptzone angeht. */
export function raumAktionen(config) {
  if (!config?.zone || !config.musik?.zoneQuelle) return [];
  return [
    ['media_player', 'turn_on', { entity_id: config.zone }],
    ['media_player', 'select_source', { entity_id: config.zone, source: config.musik.zoneQuelle }],
  ];
}

const nurTitel = (items) => items.filter((t) => !t.media_type || t.media_type === 'track');

/**
 * Music Assistant: Liste ab Titel `ab` abspielen (Winamp: Doppelklick in der Library).
 * Ist der Eintrag kein Titel (Album, Playlist …), spielt MA ihn als Ganzes.
 */
export function maAbspielen(config, items, ab = 0) {
  const t = items[ab];
  if (!t || !config?.player) return [];
  const media_id = t.media_type && t.media_type !== 'track' ? t.uri : nurTitel(items.slice(ab)).map((x) => x.uri);
  return [
    ...raumAktionen(config),
    ['music_assistant', 'play_media', { entity_id: config.player, media_id, media_type: t.media_type || 'track', enqueue: 'replace' }],
  ];
}

/** Music Assistant: Titel anhängen ('add') oder als Nächstes ('next'). */
export function maEinreihen(config, items, enqueue = 'add') {
  const uris = nurTitel(items).map((t) => t.uri);
  if (!uris.length || !config?.player) return [];
  return [['music_assistant', 'play_media', { entity_id: config.player, media_id: uris, media_type: 'track', enqueue }]];
}

/** Music Assistant: alles nach dem laufenden Titel durch die bearbeitete Playlist ersetzen. */
export function maRestErsetzen(config, items, index) {
  const rest = nurTitel(items.slice(index + 1)).map((t) => t.uri);
  if (!rest.length || !config?.player) return [];
  return [['music_assistant', 'play_media', { entity_id: config.player, media_id: rest, media_type: 'track', enqueue: 'replace_next' }]];
}

/**
 * Spotify: Liste ab Titel `ab` abspielen. Mit Kontext (Playlist, Album) startet Spotify den
 * Kontext an dieser Stelle, sonst die Titel selbst (höchstens 50).
 */
export function spAbspielen(config, items, ab = 0, kontext = null) {
  const sp = config?.musik?.spotify;
  const t = items[ab];
  if (!sp?.entity || !t) return [];
  const geraet = sp.geraet ? { device_id: sp.geraet } : {};
  let aufruf;
  if (t.media_type && t.media_type !== 'track') {
    aufruf = ['spotifyplus', 'player_media_play_context', { entity_id: sp.entity, context_uri: t.uri, ...geraet }];
  } else if (kontext && !/:artist:/.test(kontext)) {
    aufruf = ['spotifyplus', 'player_media_play_context', { entity_id: sp.entity, context_uri: kontext, offset_position: ab, ...geraet }];
  } else {
    const uris = nurTitel(items.slice(ab)).slice(0, 50).map((x) => x.uri).join(',');
    aufruf = ['spotifyplus', 'player_media_play_tracks', { entity_id: sp.entity, uris, ...geraet }];
  }
  return [...raumAktionen(config), aufruf];
}

/** Spotify-Warteschlange: zum k-ten Titel springen (Spotify erlaubt nur „weiter“). */
export function spSpringen(config, k) {
  const sp = config?.musik?.spotify;
  if (!sp?.entity || !(k > 0)) return [];
  return Array.from({ length: k }, () => ['spotifyplus', 'player_media_skip_next', { entity_id: sp.entity, delay: 0.25 }]);
}

/** Spotify-Warteschlange (get_player_queue_info) als Playlist: laufender Titel zuerst. */
export function spWarteschlange(r) {
  const jetzt = spTitel(r?.currently_playing);
  const rest = (r?.queue || []).map(spTitel).filter(Boolean);
  return jetzt ? [jetzt, ...rest] : rest;
}

/** Ausblenden: Dauer und worüber (Player-Lautstärke, auf Wunsch die Zone). */
export function ausblendenKonfig(config) {
  const a = config?.musik?.ausblenden || {};
  const sekunden = Number(a.sekunden) > 0 ? Number(a.sekunden) : 4;
  return { sekunden, ueber: a.ueber === 'zone' && config?.zone ? 'zone' : 'player' };
}

/**
 * Auswahl in einer Liste wie in Winamp: Klick wählt einen Titel, Shift wählt bis dorthin,
 * Strg/Cmd bzw. der Mehrfach-Modus (Touch) schaltet einzelne Titel dazu oder weg.
 */
export function auswahlKlick(auswahl, i, { shift = false, mehrfach = false } = {}, anker = -1) {
  if (shift && anker >= 0) {
    const [a, b] = anker < i ? [anker, i] : [i, anker];
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  }
  if (mehrfach) return auswahl.includes(i) ? auswahl.filter((x) => x !== i) : [...auswahl, i].sort((x, y) => x - y);
  return [i];
}

/** Gewählte Titel entfernen; liefert neue Liste und den verschobenen laufenden Index. */
export function ohneAuswahl(items, auswahl, index) {
  const weg = new Set(auswahl);
  const neu = items.filter((_, i) => !weg.has(i));
  const vorher = auswahl.filter((i) => i < index).length;
  return { items: neu, index: Math.max(0, Math.min(index - vorher, neu.length - 1)) };
}

/** Gewählte Titel als Block um d (−1/+1) verschieben; laufender Index wandert mit. */
export function blockSchieben(items, auswahl, index, d) {
  const sortiert = [...auswahl].sort((a, b) => a - b);
  if (!sortiert.length || sortiert[0] + d < 0 || sortiert[sortiert.length - 1] + d >= items.length) return null;
  const neu = [...items];
  const reihe = d < 0 ? sortiert : [...sortiert].reverse();
  let lauf = index;
  reihe.forEach((i) => {
    const z = i + d;
    [neu[i], neu[z]] = [neu[z], neu[i]];
    if (lauf === i) lauf = z;
    else if (lauf === z) lauf = i;
  });
  return { items: neu, index: lauf, auswahl: sortiert.map((i) => i + d) };
}
