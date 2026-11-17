// Zeitlogik der Tunet-Zeitschaltuhr. Rein funktional und ohne Node-Abhängigkeiten, damit Server
// (Ausführung) und Browser (Vorschau, Tagesring) exakt dieselben Schaltzeitpunkte berechnen.
//
// Ein Zeitplan beschreibt Zeitfenster („slots“) an bestimmten Wochentagen. Jeder Fensterrand ist
// ein Punkt: feste Uhrzeit oder Sonnenauf-/-untergang mit Versatz in Minuten. Alle Zeiten gelten in
// der Zeitzone von Home Assistant, nicht in der des Servers.

const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

/* ── Sonnenstand (Sunrise equation, NOAA-Näherung, ~1 min genau) ─────────── */

/** Sonnenauf- und -untergang eines Kalendertags als UTC-Millisekunden, null bei Polartag/-nacht. */
export function sunTimes(y, m, d, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { sunrise: null, sunset: null };
  const jd = Date.UTC(y, m - 1, d, 12) / DAY_MS + 2440587.5;
  const n = Math.round(jd - 2451545.0);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosW > 1 || cosW < -1) return { sunrise: null, sunset: null };
  const w = Math.acos(cosW) / RAD;
  const toMs = (j) => Math.round((j - 2440587.5) * DAY_MS);
  return { sunrise: toMs(jTransit - w / 360), sunset: toMs(jTransit + w / 360) };
}

/* ── Zeitzonen ───────────────────────────────────────────────────────────── */

const formatters = new Map();
const formatterFor = (tz) => {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return formatters.get(tz);
};

/** Kalenderdatum und Uhrzeit eines Zeitpunkts in der Zeitzone tz. */
export function zonedParts(ms, tz) {
  const out = {};
  for (const p of formatterFor(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, hour: out.hour, minute: out.minute, second: out.second };
}

const offsetAt = (ms, tz) => {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};

/** UTC-Zeitpunkt für „Tag y-m-d, minutes nach Mitternacht“ in tz (Sommerzeit-fest). */
export function zonedToUtc(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetAt(guess, tz);
  return guess - offsetAt(first, tz);
}

/* ── Kalendertage ────────────────────────────────────────────────────────── */

export const dayKey = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function addDays({ y, m, d }, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Wochentag 0 = Montag … 6 = Sonntag. */
export const weekdayOf = ({ y, m, d }) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

export const dayOf = (ms, tz) => {
  const { y, m, d } = zonedParts(ms, tz);
  return { y, m, d };
};

/* ── Schaltpunkte ────────────────────────────────────────────────────────── */

export const parseClock = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

/** Zeitpunkt eines Punkts ({type:'time',time} | {type:'sunrise'|'sunset',offset}) an einem Tag. */
export function resolvePoint(point, day, ctx) {
  if (!point) return null;
  if (point.type === 'sunrise' || point.type === 'sunset') {
    const sun = sunTimes(day.y, day.m, day.d, ctx.lat, ctx.lon);
    const base = sun[point.type];
    return base == null ? null : base + (Number(point.offset) || 0) * 60_000;
  }
  const minutes = parseClock(point.time);
  return minutes == null ? null : zonedToUtc(day.y, day.m, day.d, minutes, ctx.tz);
}

// Deterministischer Zufall: dieselbe Verschiebung auch nach einem Neustart des Servers
const hash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const JITTER_MINUTES = 15;

/** Verschiebung für die Anwesenheitssimulation, ±JITTER_MINUTES, stabil je Schlüssel. */
export const jitterMinutes = (key) => (hash(key) % (2 * JITTER_MINUTES + 1)) - JITTER_MINUTES;

export const usesWindow = (schedule) => (schedule?.mode || 'window') === 'window';

/**
 * Alle Fenster eines Zeitplans, die an `day` beginnen.
 * opts.vacation: Urlaubsmodus aktiv → Zeitpläne mit simulate bekommen eine Zufallsverschiebung.
 */
export function instancesForDay(schedule, day, ctx, opts = {}) {
  const weekdays = Array.isArray(schedule?.weekdays) ? schedule.weekdays : [];
  if (!weekdays.includes(weekdayOf(day))) return [];
  const key = dayKey(day);
  const jitter = Boolean(opts.vacation && schedule.simulate);
  const out = [];
  for (const slot of schedule.slots || []) {
    const instanceKey = `${schedule.id}|${slot.id}|${key}`;
    let start = resolvePoint(slot.start, day, ctx);
    if (start == null) continue;
    let end = null;
    if (usesWindow(schedule) && slot.end?.type === 'duration') {
      // „Ausschalten nach Dauer“: gerechnet ab dem tatsächlichen Einschalten
      end = start + Math.max(1, Number(slot.end.minutes) || 0) * 60_000;
    } else if (usesWindow(schedule) && slot.end) {
      end = resolvePoint(slot.end, day, ctx);
      if (end != null && end <= start) end = resolvePoint(slot.end, addDays(day, 1), ctx);
    }
    if (jitter) {
      const shift = jitterMinutes(`${instanceKey}|start`) * 60_000;
      start += shift;
      if (slot.end?.type === 'duration') end += shift;
      if (end != null) end = Math.max(start + 60_000, end + jitterMinutes(`${instanceKey}|end`) * 60_000);
    }
    out.push({ scheduleId: schedule.id, slotId: slot.id, day: key, instanceKey, start, end });
  }
  return out;
}

/** Fenster, die an einem der Tage rund um [from, to] beginnen (für laufende und kommende Fenster). */
export function instancesAround(schedule, from, to, ctx, opts = {}) {
  const out = [];
  let day = addDays(dayOf(from, ctx.tz), -1);
  const last = dayKey(addDays(dayOf(to, ctx.tz), 1));
  for (let i = 0; i < 400 && dayKey(day) <= last; i++) {
    out.push(...instancesForDay(schedule, day, ctx, opts));
    day = addDays(day, 1);
  }
  return out;
}

/** Schaltereignisse mit from < at ≤ to, chronologisch. */
export function eventsBetween(schedule, from, to, ctx, opts = {}) {
  const events = [];
  for (const inst of instancesAround(schedule, from, to, ctx, opts)) {
    if (inst.start > from && inst.start <= to) events.push({ ...inst, kind: 'start', at: inst.start });
    if (inst.end != null && inst.end > from && inst.end <= to) events.push({ ...inst, kind: 'end', at: inst.end });
  }
  return events.sort((a, b) => a.at - b.at);
}

/** Die nächsten Schaltereignisse ab now (höchstens `limit`, innerhalb von `days` Tagen). */
export function nextEvents(schedule, now, ctx, opts = {}, { limit = 6, days = 8 } = {}) {
  return eventsBetween(schedule, now, now + days * DAY_MS, ctx, opts).slice(0, limit);
}

/** Läuft gerade ein Fenster? Liefert die Instanz oder null. */
export function activeInstance(schedule, now, ctx, opts = {}) {
  if (!usesWindow(schedule)) return null;
  return (
    instancesAround(schedule, now - DAY_MS, now, ctx, opts).find(
      (inst) => inst.end != null && inst.start <= now && now < inst.end
    ) || null
  );
}
