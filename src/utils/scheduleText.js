// Zeitplan aus einem Satz: „Flur Mo–Fr ab Sonnenuntergang bis 23 Uhr“.
// Feste Regeln für deutsche Formulierungen, ohne KI und ohne Cloud. Erkannt werden Geräte und
// Bereiche (über ihre Namen), Wochentage, Uhrzeiten, Sonnenauf-/-untergang mit Versatz, Helligkeit,
// Position, Temperatur, Dimm-Verläufe und Bedingungen.

import { ALL_WEEKDAYS, WEEKEND, WORKDAYS, createDraft, isPickable, newSlotId } from './scheduleModel';

const DAY_WORDS = [
  ['montag', 'mo'],
  ['dienstag', 'di'],
  ['mittwoch', 'mi'],
  ['donnerstag', 'do'],
  ['freitag', 'fr'],
  ['samstag', 'sa'],
  ['sonntag', 'so'],
];

const dayIndex = (word) => DAY_WORDS.findIndex(([long, short]) => word.startsWith(long) || word === short);
const DAY_TOKEN = '(montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?|mo|di|mi|do|fr|sa|so)';

const normalize = (text) =>
  ` ${String(text || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()} `;

const fold = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseWeekdays(text, found) {
  if (/ (täglich|jeden tag|immer|alle tage) /.test(text)) {
    found.push('täglich');
    return [...ALL_WEEKDAYS];
  }
  if (/ (werktags|wochentags|unter der woche|mo ?- ?fr|montag bis freitag) /.test(text)) {
    found.push('Mo–Fr');
    return [...WORKDAYS];
  }
  if (/ (am )?(wochenende|sa ?- ?so|samstag bis sonntag|sa und so) /.test(text)) {
    found.push('Sa–So');
    return [...WEEKEND];
  }
  const range = new RegExp(` ${DAY_TOKEN} ?(?:-|bis) ?${DAY_TOKEN} `).exec(text);
  if (range) {
    const a = dayIndex(range[1]);
    const b = dayIndex(range[2]);
    if (a >= 0 && b >= 0) {
      const days = [];
      for (let d = a; ; d = (d + 1) % 7) {
        days.push(d);
        if (d === b || days.length > 7) break;
      }
      found.push(range[0].trim());
      return days.sort();
    }
  }
  const list = [...text.matchAll(new RegExp(`(?<=[ ,])${DAY_TOKEN}(?=[ ,])`, 'g'))]
    .map((m) => dayIndex(m[1]))
    .filter((d) => d >= 0);
  if (list.length) {
    found.push('Wochentage');
    return [...new Set(list)].sort();
  }
  return null;
}

const DOMAIN_ORDER = ['light', 'cover', 'climate', 'switch', 'fan', 'media_player', 'input_boolean', 'scene', 'script'];
const domainRank = (entityId) => {
  const i = DOMAIN_ORDER.indexOf(String(entityId || '').split('.')[0]);
  return i < 0 ? DOMAIN_ORDER.length : i;
};

const NAME_PREFIX = /^(eg|og|ug|dg|kg|eg |og |licht|lampe|beleuchtung|leuchte|steckdose|rollladen|rollo|jalousie) +/;

const UNIT_MIN = '(min|minuten|minute|m|h|std|stunden|stunde)';
const toMinutes = (value, unit) => (/^(h|std|stunde|stunden)$/.test(unit) ? Number(value) * 60 : Number(value));

/** Alle Zeitpunkte im Satz in ihrer Reihenfolge, mit Hinweis ob Beginn („ab“) oder Ende („bis“). */
function parsePoints(text) {
  const points = [];
  const sunWord = '(sonnenuntergang|sonnenaufgang|dämmerung|abenddämmerung|morgendämmerung)';
  const sunType = (w) => (/aufgang|morgen/.test(w) ? 'sunrise' : 'sunset');
  const patterns = [
    [new RegExp(`(\\d+) ?${UNIT_MIN} (vor|nach) ${sunWord}`, 'g'), (m) => ({
      type: sunType(m[4]),
      offset: (m[3] === 'vor' ? -1 : 1) * toMinutes(m[1], m[2]),
    })],
    [new RegExp(`${sunWord} ?([+-]) ?(\\d+) ?${UNIT_MIN}?`, 'g'), (m) => ({
      type: sunType(m[1]),
      offset: (m[2] === '-' ? -1 : 1) * toMinutes(m[3], m[4] || 'min'),
    })],
    [new RegExp(sunWord, 'g'), (m) => ({ type: sunType(m[1]), offset: 0 })],
    [/(?<![\d.,])(\d{1,2})[:.](\d{2})(?: ?uhr)?/g, (m) => clock(m[1], m[2])],
    [/(?<![\d.,:])(\d{1,2}) ?uhr/g, (m) => clock(m[1], '00')],
    [/ mitternacht /g, () => clock('0', '00')],
  ];
  const taken = [];
  for (const [regex, build] of patterns) {
    for (const m of text.matchAll(regex)) {
      const from = m.index;
      const to = m.index + m[0].length;
      if (taken.some(([a, b]) => from < b && a < to)) continue;
      const point = build(m);
      if (!point) continue;
      taken.push([from, to]);
      const before = text.slice(Math.max(0, from - 8), from);
      const role = /(bis|-) ?$/.test(before) ? 'end' : /(ab|von|um|bei|zum|zur) ?$/.test(before) ? 'start' : null;
      points.push({ point, role, at: from, text: m[0].trim() });
    }
  }
  return points.sort((a, b) => a.at - b.at);
}

function clock(h, m) {
  const hour = Number(h);
  const minute = Number(m);
  if (hour > 23 || minute > 59) return null;
  return { type: 'time', time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

/** Geräte und Bereiche, deren Name im Satz vorkommt (längste Treffer zuerst, keine Überlappung). */
function matchTargets(text, entities, areas) {
  const haystack = ` ${fold(text)} `;
  const candidates = [];
  for (const area of areas || []) {
    const name = fold(area.name);
    if (name.length >= 3) candidates.push({ name, area });
  }
  for (const [id, entity] of Object.entries(entities || {})) {
    if (!isPickable(id)) continue;
    const name = fold(entity?.attributes?.friendly_name);
    if (name.length >= 3) candidates.push({ name, entityId: id });
    // „EG Flur“ soll auch auf „Flur“ passen (Stockwerk oder Gattungswort vorne weglassen)
    const short = name.replace(NAME_PREFIX, '');
    if (short !== name && short.length >= 3) candidates.push({ name: short, entityId: id, loose: true });
  }
  candidates.sort((a, b) => b.name.length - a.name.length || Number(Boolean(a.loose)) - Number(Boolean(b.loose)));
  const used = [];
  const hits = [];
  for (const c of candidates) {
    const idx = haystack.indexOf(` ${c.name} `);
    if (idx < 0) continue;
    const span = [idx, idx + c.name.length + 2];
    const overlap = used.find((u) => span[0] < u.span[1] && u.span[0] < span[1]);
    // Gleich gute lose Treffer (z. B. „Flur“ → EG Flur und OG Flur) gemeinsam nehmen
    if (overlap && !(overlap.name === c.name && Boolean(overlap.loose) === Boolean(c.loose))) continue;
    if (hits.some((h) => h.entityId && h.entityId === c.entityId)) continue;
    used.push({ span, loose: c.loose, name: c.name });
    hits.push(c);
  }
  // Mehrere Entitäten mit gleichem Namen (z. B. Lampe und Schalter): nur die passendste nehmen
  const best = new Map();
  for (const h of hits) {
    const key = h.area ? `area:${h.area.area_id}` : fold(entities[h.entityId]?.attributes?.friendly_name);
    const current = best.get(key);
    if (!current || domainRank(h.entityId) < domainRank(current.entityId)) best.set(key, h);
  }
  return [...best.values()];
}

/**
 * Liefert { draft, found: [erkannte Teile], missing: [fehlende Angaben] }.
 * areas: [{ area_id, name }] aus der Bereichsliste von HA.
 */
export function parseScheduleText(input, { entities = {}, areas = [] } = {}) {
  const text = normalize(input);
  const found = [];
  const missing = [];

  const hits = matchTargets(input, entities, areas);
  const domainHint = /licht|lampe|leuchte|beleuchtung/.test(text)
    ? 'light'
    : /rollladen|rolllade|rollo|jalousie|markise/.test(text)
      ? 'cover'
      : /heizung|thermostat|klima/.test(text)
        ? 'climate'
        : null;
  const entityIds = hits.filter((h) => h.entityId).map((h) => h.entityId);
  const areaTargets = hits
    .filter((h) => h.area)
    .map((h) => ({ id: h.area.area_id, name: h.area.name, domain: domainHint || 'light' }));
  hits.forEach((h) => found.push(h.area ? h.area.name : entities[h.entityId]?.attributes?.friendly_name || h.entityId));
  if (!entityIds.length && !areaTargets.length) missing.push('target');

  const draft = createDraft({ entities: entityIds, areas: areaTargets });

  const weekdays = parseWeekdays(text, found);
  if (weekdays?.length) draft.weekdays = weekdays;

  const verbs = text.replace(/ (nicht )?an (feiertagen|wochenenden?)/g, ' ');
  const offWord = / (aus|ausschalten|abschalten|schließen|zu|runter|zufahren)(?=[ ,.!;]|$)/.test(verbs);
  const onWord = / (an|ein|einschalten|anschalten|öffnen|auf|hoch|hochfahren)(?=[ ,.!;]|$)/.test(verbs);
  const points = parsePoints(text);
  const start = points.find((p) => p.role === 'start') || points.find((p) => p.role !== 'end');
  const end = points.find((p) => p.role === 'end' && p !== start) || points.find((p) => p !== start);
  points.forEach((p) => found.push(p.text));

  const lasting = new RegExp(`(?:für|fuer) (\\d+(?:[.,]5)?) ?${UNIT_MIN}|(\\d+(?:[.,]5)?) ?${UNIT_MIN} lang(?! (?:auf|ab|runter)?dimmen| heller| wecker)`).exec(text);
  const lastingMinutes = lasting
    ? Math.round(toMinutes(Number((lasting[1] || lasting[3]).replace(',', '.')), lasting[2] || lasting[4]))
    : 0;
  if (lasting) found.push(lasting[0].trim());

  if (start && lastingMinutes > 0) {
    draft.mode = 'window';
    draft.slots = [{ id: newSlotId(), start: start.point, end: { type: 'duration', minutes: Math.min(1439, lastingMinutes) } }];
  } else if (start && end) {
    draft.mode = 'window';
    draft.slots = [{ id: newSlotId(), start: start.point, end: end.point }];
  } else if (start) {
    draft.mode = offWord && !onWord ? 'off' : draft.mode === 'window' ? 'on' : draft.mode;
    draft.slots = [{ id: newSlotId(), start: start.point, end: null }];
  } else {
    missing.push('time');
  }

  const percent = /(\d{1,3}) ?%/.exec(text);
  if (percent) {
    const value = Math.min(100, Math.max(1, Number(percent[1])));
    if (/rollladen|rollo|jalousie|markise|position/.test(text) || draft.targets.entities.some((id) => id.startsWith('cover.'))) {
      draft.action.on.position = value;
    } else draft.action.on.brightness = value;
    found.push(percent[0]);
  }
  const temperature = /(\d{1,2}(?:[.,]5)?) ?(°|grad)/.exec(text);
  if (temperature) {
    draft.action.on.temperature = Number(temperature[1].replace(',', '.'));
    found.push(temperature[0].trim());
  }
  const kelvin = /(\d{4}) ?k(elvin)? /.exec(text);
  if (kelvin) draft.action.on.colorTemp = Number(kelvin[1]);
  else if (/warmweiß|warmes licht|gemütlich/.test(text)) draft.action.on.colorTemp = 2700;

  const wake = /wecker|aufwachen|sonnenaufgangs?-?simulation|langsam (heller|aufdimmen)|aufdimmen/.test(text);
  const ramp = new RegExp(`(\\d+) ?${UNIT_MIN} (lang )?(aufdimmen|heller|wecker|dimmen|abdimmen|runterdimmen)`).exec(text);
  if (ramp) {
    const minutes = Math.min(120, toMinutes(ramp[1], ramp[2]));
    if (/abdimmen|runterdimmen|^dimmen$/.test(ramp[4]) && !wake) draft.action.rampOffMinutes = minutes;
    else draft.action.rampOnMinutes = minutes;
    found.push(ramp[0]);
  } else if (wake) {
    draft.action.rampOnMinutes = 20;
    found.push('Wecker');
  } else if (/abends? langsam dunkler|langsam ausdimmen|ausdimmen/.test(text)) {
    draft.action.rampOffMinutes = 15;
  }

  if (/nur wenn (jemand|wer|wir) (zu ?hause|da|daheim)/.test(text)) {
    draft.conditions.presence = 'home';
    found.push('nur wenn jemand zu Hause');
  } else if (/nur wenn niemand|wenn keiner (zu ?hause|da)/.test(text)) {
    draft.conditions.presence = 'away';
    found.push('nur wenn niemand zu Hause');
  }
  if (/nur wenn (es )?dunkel|bei dunkelheit/.test(text)) {
    draft.conditions.darkOnly = true;
    found.push('nur bei Dunkelheit');
  }
  if (/feiertag/.test(text)) {
    const holiday = Object.keys(entities).find((id) => /^(calendar|binary_sensor|input_boolean)\..*feiertag/.test(id));
    if (holiday) {
      draft.conditions.skipEntity = holiday;
      found.push('nicht an Feiertagen');
    }
  }
  if (/urlaub|anwesenheitssimulation|simulation|zufällig/.test(text)) {
    draft.simulate = true;
    found.push('Urlaubs-Simulation');
  }

  const names = [...areaTargets.map((a) => a.name), ...entityIds.map((id) => entities[id]?.attributes?.friendly_name || id)];
  draft.name = names.slice(0, 2).join(', ');
  return { draft, found: [...new Set(found)], missing };
}
