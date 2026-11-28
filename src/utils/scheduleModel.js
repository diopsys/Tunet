// Tunet-Zeitschaltuhr im Browser: Vorlagen, Texte, Konflikte, Umzug vom HACS-Scheduler.
// Die Zeitberechnung kommt aus server/scheduler/scheduleTime.js, damit Vorschau und Ausführung
// garantiert dieselben Schaltzeiten ergeben.

import {
  activeInstance,
  dayKey,
  dayOf,
  instancesAround,
  nextEvents,
  sunTimes,
  zonedParts,
} from '../../server/scheduler/scheduleTime.js';

export { activeInstance, dayKey, dayOf, nextEvents, sunTimes, zonedParts };

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const WORKDAYS = [0, 1, 2, 3, 4];
export const WEEKEND = [5, 6];
const DAY_MS = 86_400_000;

/** Zeitzone und Standort aus der HA-Konfiguration. */
export function scheduleContext(haConfig) {
  return {
    lat: Number(haConfig?.latitude),
    lon: Number(haConfig?.longitude),
    tz: haConfig?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

let idCounter = 0;
export const newSlotId = () => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const domainOf = (entityId) => String(entityId || '').split('.')[0];

/** Welche Art Steuerung der Zeitplan anbietet (gemischte Auswahl → einfache Schaltung). */
export function targetKind(schedule) {
  const domains = new Set([
    ...(schedule?.targets?.entities || []).map(domainOf),
    ...(schedule?.targets?.areas || []).map((a) => a.domain || 'light'),
  ]);
  if (domains.size === 1) {
    const [only] = domains;
    if (['light', 'cover', 'climate', 'scene', 'script'].includes(only)) return only;
  }
  if ([...domains].every((d) => d === 'scene' || d === 'script')) return 'scene';
  return 'switch';
}

export function createDraft({ entities = [], areas = [], name = '' } = {}) {
  const draft = {
    name,
    enabled: true,
    mode: 'window',
    targets: { entities: [...new Set(entities)], areas },
    slots: [{ id: newSlotId(), start: { type: 'sunset', offset: 0 }, end: { type: 'time', time: '23:00' } }],
    weekdays: [...ALL_WEEKDAYS],
    action: { on: {}, off: {}, rampOnMinutes: 0, rampOffMinutes: 0 },
    conditions: { presence: null, darkOnly: false, luxEntity: null, luxBelow: null, skipEntity: null, onlyEntity: null },
    simulate: false,
  };
  const kind = targetKind(draft);
  if (kind === 'cover') {
    draft.slots = [{ id: newSlotId(), start: { type: 'sunrise', offset: 0 }, end: { type: 'sunset', offset: 0 } }];
  } else if (kind === 'scene') {
    draft.mode = 'on';
    draft.slots = [{ id: newSlotId(), start: { type: 'sunset', offset: 0 }, end: null }];
  }
  return draft;
}

/* ── Texte ──────────────────────────────────────────────────────────────── */

export function formatOffset(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return '';
  const abs = Math.abs(m);
  const text = abs >= 60 && abs % 60 === 0 ? `${abs / 60} h` : abs > 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs} min`;
  return `${m > 0 ? '+' : '−'}${text}`;
}

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  if (!h) return `${m} min`;
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function describePoint(point, t) {
  if (!point) return '–';
  if (point.type === 'duration') return `${t('schedule.after')} ${formatDuration(point.minutes)}`;
  if (point.type === 'sunrise' || point.type === 'sunset') {
    const base = t(point.type === 'sunrise' ? 'schedule.sunrise' : 'schedule.sunset');
    const offset = formatOffset(point.offset);
    return offset ? `${base} ${offset}` : base;
  }
  return point.time || '–';
}

export function describeWeekdays(weekdays, t) {
  const days = [...(weekdays || [])].sort();
  const same = (list) => days.length === list.length && list.every((d, i) => days[i] === d);
  if (same(ALL_WEEKDAYS)) return t('schedule.daily');
  if (same(WORKDAYS)) return t('schedule.workdays');
  if (same(WEEKEND)) return t('schedule.weekend');
  return days.map((d) => t(`schedule.day.${d}`)).join(', ');
}

export const formatClock = (ms, tz) =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: tz });

/** „heute 17:12“, „morgen 06:30“ oder „Fr 22:00“. */
export function formatWhen(ms, now, tz, t) {
  const day = dayKey(dayOf(ms, tz));
  const today = dayKey(dayOf(now, tz));
  const tomorrow = dayKey(dayOf(now + DAY_MS, tz));
  const clock = formatClock(ms, tz);
  if (day === today) return `${t('schedule.today')} ${clock}`;
  if (day === tomorrow) return `${t('schedule.tomorrow')} ${clock}`;
  const { y, m, d } = dayOf(ms, tz);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${t(`schedule.day.${weekday}`)} ${clock}`;
}

/** „an“/„aus“ bzw. „öffnen“/„schließen“ für ein Ereignis. */
export function eventVerb(schedule, kind, t) {
  const mode = schedule.mode || 'window';
  const phase = mode === 'on' ? 'start' : mode === 'off' ? 'end' : kind;
  const k = targetKind(schedule);
  if (k === 'cover') return t(phase === 'start' ? 'schedule.verb.open' : 'schedule.verb.close');
  if (k === 'climate') return t(phase === 'start' ? 'schedule.verb.comfort' : 'schedule.verb.eco');
  if (k === 'scene') return t('schedule.verb.activate');
  return t(phase === 'start' ? 'schedule.verb.on' : 'schedule.verb.off');
}

export function targetNames(schedule, entities) {
  const names = (schedule.targets?.entities || []).map(
    (id) => entities?.[id]?.attributes?.friendly_name || id.split('.')[1]
  );
  const areas = (schedule.targets?.areas || []).map((a) => a.name || a.id);
  return [...areas, ...names];
}

export const scheduleTitle = (schedule, entities) =>
  schedule.name || targetNames(schedule, entities).slice(0, 2).join(', ') || 'Zeitplan';

/* ── Zustand für Karten und Pill ─────────────────────────────────────────── */

/** Nächster Schaltpunkt je Entität über alle aktiven Zeitpläne: Map entityId → { at, schedule, kind }. */
export function nextSwitchByEntity(schedules, now, ctx, { vacation = false } = {}) {
  const out = new Map();
  for (const schedule of schedules || []) {
    if (!schedule.enabled) continue;
    const [event] = nextEvents(schedule, now, ctx, { vacation }, { limit: 1, days: 8 });
    if (!event) continue;
    for (const id of schedule.targets?.entities || []) {
      const current = out.get(id);
      if (!current || event.at < current.at) out.set(id, { at: event.at, schedule, kind: event.kind });
    }
  }
  return out;
}

/** Nächstes Schaltereignis überhaupt (für die Status-Pill). */
export function nextSwitchOverall(schedules, now, ctx, { vacation = false } = {}) {
  let best = null;
  for (const schedule of schedules || []) {
    if (!schedule.enabled) continue;
    const [event] = nextEvents(schedule, now, ctx, { vacation }, { limit: 1, days: 8 });
    if (event && (!best || event.at < best.at)) best = { ...event, schedule };
  }
  return best;
}

/** Ist der Zeitplan für das Ereignis ausgesetzt (heute oder dieses eine Mal)? */
export const isSkipped = (schedule, event) =>
  Boolean(event && ((schedule.skipDay && schedule.skipDay === event.day) || schedule.skipInstance === event.instanceKey));

/**
 * Überschneidungen: zwei aktive Zeitpläne steuern dieselbe Entität in sich überlappenden Fenstern
 * in den nächsten 7 Tagen. Liefert [{ a, b, entityId }].
 */
export function findConflicts(schedules, now, ctx) {
  const active = (schedules || []).filter((s) => s.enabled && (s.mode || 'window') === 'window');
  const windows = new Map(active.map((s) => [s.id, instancesAround(s, now, now + 7 * DAY_MS, ctx).filter((i) => i.end != null)]));
  const out = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const shared = (a.targets?.entities || []).find((id) => (b.targets?.entities || []).includes(id));
      if (!shared) continue;
      const overlap = windows.get(a.id).some((x) => windows.get(b.id).some((y) => x.start < y.end && y.start < x.end));
      if (overlap) out.push({ a, b, entityId: shared });
    }
  }
  return out;
}

/* ── Karten → Entitäten ─────────────────────────────────────────────────── */

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const SCHEDULABLE = new Set([
  'light', 'switch', 'cover', 'climate', 'fan', 'input_boolean', 'media_player', 'scene', 'script',
  'humidifier', 'water_heater', 'automation', 'button', 'input_button', 'siren', 'valve', 'lock',
]);

export const isSchedulable = (entityId) => ENTITY_ID.test(entityId || '') && SCHEDULABLE.has(domainOf(entityId));

// Die Oberfläche bietet Lichter und Schalter (z. B. Steckdosen) an; Server und Datenformat können mehr.
// Zeitplan-Schalter der HACS-Komponente (switch.schedule_*) sind selbst Zeitpläne, keine Geräte.
export const PICKABLE_DOMAINS = new Set(['light', 'switch']);
export const isPickable = (entityId) =>
  isSchedulable(entityId) && PICKABLE_DOMAINS.has(domainOf(entityId)) && !String(entityId).startsWith('switch.schedule_');

/** Alle schaltbaren Entitäten, die eine Karte zeigt (Karten-ID und Karteneinstellungen). */
export function entityIdsForCard(cardId, settings) {
  const found = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (typeof value === 'string') {
      if (isPickable(value)) found.add(value);
    } else if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (typeof value === 'object') Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit(cardId);
  visit(settings);
  return [...found];
}

/* ── Umzug vom HACS-Scheduler ───────────────────────────────────────────── */

const HACS_DAYS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function hacsPoint(text) {
  const match = /^(sunrise|sunset)([+-])(\d{2}):(\d{2})/.exec(text || '');
  if (match) {
    const minutes = Number(match[3]) * 60 + Number(match[4]);
    return { type: match[1], offset: match[2] === '-' ? -minutes : minutes };
  }
  const clock = /^(\d{2}):(\d{2})/.exec(text || '');
  return clock ? { type: 'time', time: `${clock[1]}:${clock[2]}` } : null;
}

/** Zeitplan-Entitäten der HACS-Komponente (switch.schedule_*), die übernommen werden können. */
export const hacsScheduleEntities = (entities) =>
  Object.entries(entities || {}).filter(
    ([id, e]) => id.startsWith('switch.schedule_') && Array.isArray(e?.attributes?.timeslots)
  );

const sameList = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * HACS-Zeitpläne für den Umzug, fertig als Tunet-Entwürfe. Ein „Ein“- und ein „Aus“-Schaltpunkt für
 * dieselben Geräte an denselben Tagen werden zu einem Zeitfenster zusammengefasst.
 * Liefert [{ sourceIds: [...], draft }].
 */
export function hacsImportItems(list) {
  const drafts = list.map(([id, entity]) => ({ id, draft: fromHacsSchedule(id, entity) }));
  const used = new Set();
  const items = [];
  for (const on of drafts) {
    if (used.has(on.id) || on.draft.mode !== 'on' || on.draft.slots.length !== 1) continue;
    const off = drafts.find(
      (x) =>
        !used.has(x.id) &&
        x.draft.mode === 'off' &&
        x.draft.slots.length === 1 &&
        sameList(x.draft.targets.entities, on.draft.targets.entities) &&
        sameList(x.draft.weekdays, on.draft.weekdays)
    );
    if (!off) continue;
    used.add(on.id);
    used.add(off.id);
    const name = on.draft.name.replace(/\s+(ein|an|on)$/i, '') || on.draft.name;
    items.push({
      sourceIds: [on.id, off.id],
      draft: {
        ...on.draft,
        name,
        mode: 'window',
        slots: [{ ...on.draft.slots[0], end: off.draft.slots[0].start }],
        enabled: on.draft.enabled && off.draft.enabled,
        source: `${on.id},${off.id}`,
      },
    });
  }
  for (const d of drafts) if (!used.has(d.id)) items.push({ sourceIds: [d.id], draft: d.draft });
  return items;
}

export function fromHacsSchedule(entityId, entity) {
  const a = entity?.attributes || {};
  const weekdays = (a.weekdays || []).flatMap((d) =>
    d === 'daily' ? ALL_WEEKDAYS : d === 'workday' ? WORKDAYS : d === 'weekend' ? WEEKEND : HACS_DAYS[d] ?? []
  );
  const service = String(a.actions?.[0]?.service || '');
  const ranges = (a.timeslots || []).map((slot) => String(slot).split(' - '));
  const isRange = ranges.some((r) => r.length === 2);
  const slots = ranges
    .map(([start, end]) => ({ id: newSlotId(), start: hacsPoint(start), end: isRange ? hacsPoint(end) : null }))
    .filter((s) => s.start && (!isRange || s.end));
  const entities = (a.entities || []).filter((id) => ENTITY_ID.test(id));
  const mode = isRange ? 'window' : /turn_off|close/.test(service) ? 'off' : 'on';
  const data = a.actions?.[0]?.service_data || a.actions?.[0]?.data || {};
  return {
    ...createDraft({ entities, name: a.friendly_name?.replace(/^Scheduler\s+/i, '') || entityId }),
    mode,
    slots,
    weekdays: weekdays.length ? [...new Set(weekdays)].sort() : [...ALL_WEEKDAYS],
    action: {
      on: data.brightness_pct ? { brightness: Number(data.brightness_pct) } : {},
      off: {},
      rampOnMinutes: 0,
      rampOffMinutes: 0,
    },
    enabled: entity.state !== 'off',
    source: entityId,
  };
}

/* ── Gerade per Zeitschaltuhr eingeschaltet ─────────────────────────────── */

const SCHEDULED_LIGHT_DOMAINS = ['light.', 'switch.'];

/**
 * Lichter (und Schalter), die gerade an sind und zu einem laufenden Zeitfenster gehören.
 * Liefert `[{ id, schedule, end }]`, je Entität einmal (das am längsten laufende Fenster gewinnt).
 * Bereiche werden im Browser nicht aufgelöst, nur direkt gewählte Entitäten zählen.
 */
export function scheduledLightsOn(schedules, entities, now, ctx, opts = {}) {
  const byId = new Map();
  for (const schedule of schedules || []) {
    if (!schedule?.enabled) continue;
    const inst = activeInstance(schedule, now, ctx, opts);
    if (!inst || isSkipped(schedule, inst)) continue;
    for (const id of schedule.targets?.entities || []) {
      if (!SCHEDULED_LIGHT_DOMAINS.some((d) => id.startsWith(d)) || entities?.[id]?.state !== 'on') continue;
      const prev = byId.get(id);
      if (!prev || (inst.end ?? 0) > (prev.end ?? 0)) byId.set(id, { id, schedule, end: inst.end });
    }
  }
  return [...byId.values()];
}
