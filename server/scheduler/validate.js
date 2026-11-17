// Eingehende Zeitpläne prüfen und auf das bekannte Format zurechtstutzen.

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const AREA_ID = /^[a-z0-9_]+$/;
const MODES = ['window', 'on', 'off'];
const MAX_SLOTS = 12;
const MAX_TARGETS = 100;

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const entityId = (v) => (typeof v === 'string' && ENTITY_ID.test(v) ? v : null);

function point(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.type === 'sunrise' || p.type === 'sunset') {
    return { type: p.type, offset: Math.round(num(p.offset, -360, 360) ?? 0) };
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(str(p.time, 5));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return { type: 'time', time: `${match[1].padStart(2, '0')}:${match[2]}` };
}

function duration(p) {
  const minutes = Math.round(num(p?.minutes, 1, 1439) ?? 0);
  return minutes ? { type: 'duration', minutes } : null;
}

function phaseValues(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  const brightness = num(v.brightness, 1, 100);
  const colorTemp = num(v.colorTemp, 1500, 9000);
  const position = num(v.position, 0, 100);
  const temperature = num(v.temperature, 5, 35);
  if (brightness != null) out.brightness = Math.round(brightness);
  if (colorTemp != null) out.colorTemp = Math.round(colorTemp);
  if (position != null) out.position = Math.round(position);
  if (temperature != null) out.temperature = Math.round(temperature * 2) / 2;
  return out;
}

/** Liefert { value } mit bereinigtem Zeitplan oder { error }. */
export function sanitizeSchedule(input) {
  if (!input || typeof input !== 'object') return { error: 'Schedule must be an object' };

  const entities = [...new Set((input.targets?.entities || []).map(entityId).filter(Boolean))].slice(0, MAX_TARGETS);
  const areas = (input.targets?.areas || [])
    .filter((a) => a && AREA_ID.test(a.id || ''))
    .map((a) => ({ id: a.id, name: str(a.name, 80) || a.id, domain: /^[a-z_]+$/.test(a.domain || '') ? a.domain : 'light' }))
    .slice(0, 20);
  if (!entities.length && !areas.length) return { error: 'Schedule needs at least one entity or area' };

  const mode = MODES.includes(input.mode) ? input.mode : 'window';
  const slots = (Array.isArray(input.slots) ? input.slots : [])
    .slice(0, MAX_SLOTS)
    .map((s, i) => {
      const start = point(s?.start);
      if (!start) return null;
      const end = mode === 'window' ? (s?.end?.type === 'duration' ? duration(s.end) : point(s?.end)) : null;
      if (mode === 'window' && !end) return null;
      return { id: str(s?.id, 40) || `s${i + 1}`, start, end };
    })
    .filter(Boolean);
  if (!slots.length) return { error: 'Schedule needs at least one valid time slot' };

  const weekdays = [...new Set((input.weekdays || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!weekdays.length) return { error: 'Schedule needs at least one weekday' };

  const action = input.action || {};
  const conditions = input.conditions || {};
  const presence = ['home', 'away'].includes(conditions.presence) ? conditions.presence : null;

  return {
    value: {
      name: str(input.name, 80),
      icon: str(input.icon, 60) || null,
      enabled: input.enabled !== false,
      mode,
      targets: { entities, areas },
      slots,
      weekdays,
      action: {
        on: phaseValues(action.on),
        off: phaseValues(action.off),
        rampOnMinutes: Math.round(num(action.rampOnMinutes, 0, 120) ?? 0),
        rampOffMinutes: Math.round(num(action.rampOffMinutes, 0, 120) ?? 0),
      },
      conditions: {
        presence,
        darkOnly: Boolean(conditions.darkOnly),
        luxEntity: entityId(conditions.luxEntity),
        luxBelow: num(conditions.luxBelow, 0, 100000),
        skipEntity: entityId(conditions.skipEntity),
        onlyEntity: entityId(conditions.onlyEntity),
      },
      simulate: Boolean(input.simulate),
      skipDay: /^\d{4}-\d{2}-\d{2}$/.test(input.skipDay || '') ? input.skipDay : null,
      skipInstance: str(input.skipInstance, 200) || null,
      source: str(input.source, 200) || null,
    },
  };
}
