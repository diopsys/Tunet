// Übersetzt „Fenster beginnt/endet“ in Home-Assistant-Dienstaufrufe, passend zur Domain jeder Entität.

const NO_END = new Set(['scene', 'script', 'button', 'input_button']);

const domainOf = (entityId) => entityId.split('.')[0];

/**
 * phase: 'start' (Fenster beginnt bzw. „einschalten“) oder 'end' (Fenster endet bzw. „ausschalten“).
 * level: optionaler Helligkeitswert (1–100) während eines Dimm-Verlaufs.
 * Liefert [{ domain, service, data }], gleiche Aufrufe für mehrere Entitäten zusammengefasst.
 */
export function buildServiceCalls(entityIds, phase, action = {}, { level = null, transition = null } = {}) {
  const on = action.on || {};
  const off = action.off || {};
  const calls = new Map();
  const add = (domain, service, entityId, data = {}) => {
    const key = `${domain}.${service}|${JSON.stringify(data)}`;
    if (!calls.has(key)) calls.set(key, { domain, service, data: { ...data, entity_id: [] } });
    calls.get(key).data.entity_id.push(entityId);
  };

  for (const entityId of entityIds) {
    const domain = domainOf(entityId);
    if (phase === 'end' && NO_END.has(domain)) continue;

    if (domain === 'light') {
      if (phase === 'end' && level == null) {
        add('light', 'turn_off', entityId, transition ? { transition } : {});
        continue;
      }
      const data = {};
      const brightness = level ?? on.brightness;
      if (brightness != null) data.brightness_pct = brightness;
      if (on.colorTemp != null) data.color_temp_kelvin = on.colorTemp;
      if (transition) data.transition = transition;
      add('light', 'turn_on', entityId, data);
    } else if (domain === 'cover') {
      const position = phase === 'start' ? on.position : off.position;
      if (position != null) add('cover', 'set_cover_position', entityId, { position });
      else add('cover', phase === 'start' ? 'open_cover' : 'close_cover', entityId);
    } else if (domain === 'climate') {
      const temperature = phase === 'start' ? on.temperature : off.temperature;
      if (temperature != null) add('climate', 'set_temperature', entityId, { temperature });
      else add('climate', phase === 'start' ? 'turn_on' : 'turn_off', entityId);
    } else if (domain === 'scene' || domain === 'script') {
      add(domain, 'turn_on', entityId);
    } else if (domain === 'button' || domain === 'input_button') {
      add(domain, 'press', entityId);
    } else {
      add('homeassistant', phase === 'start' ? 'turn_on' : 'turn_off', entityId);
    }
  }
  return [...calls.values()];
}

/** Welche Phase ein Schaltereignis auslöst, abhängig vom Modus des Zeitplans. */
export function phaseForEvent(schedule, kind) {
  const mode = schedule.mode || 'window';
  if (mode === 'on') return 'start';
  if (mode === 'off') return 'end';
  return kind;
}

/** Helligkeit während eines Dimm-Verlaufs: progress 0…1 von 1 % bis zum Zielwert. */
export const rampLevel = (target, progress) =>
  Math.max(1, Math.min(100, Math.round(1 + ((target ?? 100) - 1) * Math.min(1, Math.max(0, progress)))));
