// Bedarfssteuerung der Blauberg-Lüftung (Blueprint v6), im Browser nachgerechnet.
// Spiegelt die Regelkette des Blueprints `blauberg_bedarfslueftung.yaml`, damit das Modal zeigen
// kann, welche Regel gerade greift und wie weit die Werte von den Schwellen entfernt sind.

export const LUEFTUNG_DEFAULTS = {
  co2LowEin: 900,
  co2Aus: 750,
  co2Schwelle: 1200,
  feuchteSchwelle: 60,
  vocSchwelle: 350,
  pm25Schwelle: 25,
  dauerbetriebAb: 12,
  frostAus: -10,
  mindestStufendauer: 20,
};

// Feste Blueprint-Eingaben der Automation
const FROST_HYSTERESIS = 2;
const MILD_HYSTERESIS = 1;
const HUMIDITY_HYSTERESIS = 4;
const SUMMER_HYSTERESIS = 0.5;
export const NIGHT = { start: 22 * 60, end: 6 * 60, interval: 120, run: 20 };

export const REASONS = {
  frost_off: { label: 'Frostschutz', stage: 'off' },
  aq_medium: { label: 'Luftqualitäts-Vorrang', stage: 'medium' },
  mild_low: { label: 'Mild – Dauerbetrieb', stage: 'low' },
  co2_low: { label: 'CO₂-Bedarf', stage: 'low' },
  night_low: { label: 'Nacht-Grundlüftung', stage: 'low' },
  off: { label: 'Kein Bedarf', stage: 'off' },
  summer_on: { label: 'Sommer – Kühlen', stage: 'summer' },
  summer_off: { label: 'Sommer – Außen zu warm', stage: 'off' },
};

const STAGE_LABELS = { off: 'Aus', low: 'Low', medium: 'Medium', high: 'High' };
export const stageLabel = (stage) => STAGE_LABELS[stage] || stage || '';

const fmt = (v, digits = 0) => (v == null ? '—' : v.toFixed(digits).replace('.', ','));
const clock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const maxOf = (values) => {
  const list = values.filter((v) => v != null && Number.isFinite(v));
  return list.length ? Math.max(...list) : null;
};

/** Nacht-Slot zur Minute des Tages: null oder { end } (Minute des Tages, an der der Slot endet). */
export function nightSlot(minuteOfDay, enabled) {
  if (!enabled) return null;
  const inWindow = minuteOfDay >= NIGHT.start || minuteOfDay < NIGHT.end;
  if (!inWindow || minuteOfDay % NIGHT.interval >= NIGHT.run) return null;
  return { end: minuteOfDay - (minuteOfDay % NIGHT.interval) + NIGHT.run };
}

/**
 * Wertet die Regelkette aus.
 * @param {object} input  Messwerte (co2: Liste, humidity/pm25/voc: Listen), Schwellen, Saison, lastMode …
 * @returns {{ reason, stage, values, rules, explanation }}
 */
export function evaluateLueftung(input) {
  const th = { ...LUEFTUNG_DEFAULTS, ...Object.fromEntries(Object.entries(input.thresholds || {}).filter(([, v]) => v != null)) };
  const co2 = maxOf(input.co2 || []);
  const hum = maxOf(input.humidity || []);
  const voc = maxOf(input.voc || []);
  const pm25 = maxOf(input.pm25 || []);
  const outside = input.outsideTemp ?? null;
  const inside = input.insideTemp ?? null;
  const last = input.lastMode || '';
  const season = String(input.season || '').toLowerCase();
  const n = (v) => v ?? 0;

  const aqHits = {
    co2: co2 != null && co2 >= th.co2Schwelle,
    hum: hum != null && hum >= th.feuchteSchwelle,
    voc: voc != null && voc >= th.vocSchwelle,
    pm25: pm25 != null && pm25 >= th.pm25Schwelle,
  };
  const aqBad = Object.values(aqHits).some(Boolean);
  const aqGood =
    n(co2) < th.co2Schwelle - 150 && n(hum) < th.feuchteSchwelle - HUMIDITY_HYSTERESIS && n(voc) < th.vocSchwelle * 0.85 && n(pm25) < th.pm25Schwelle * 0.8;
  const frost = outside != null && (outside < th.frostAus || (last === 'frost_off' && outside < th.frostAus + FROST_HYSTERESIS));
  const aq = aqBad || (last === 'aq_medium' && !aqGood);
  const mild = outside != null && (outside >= th.dauerbetriebAb || (last === 'mild_low' && outside >= th.dauerbetriebAb - MILD_HYSTERESIS));
  const co2Need = co2 != null && (co2 >= th.co2LowEin || (last === 'co2_low' && co2 > th.co2Aus));
  const slot = nightSlot(input.minuteOfDay ?? 0, Boolean(input.nightEnabled));

  let reason = null;
  if (season.startsWith('som')) {
    if (outside != null && inside != null) {
      if (outside > inside) reason = 'summer_off';
      else if (outside <= inside - SUMMER_HYSTERESIS) reason = 'summer_on';
      else reason = ['summer_off', 'summer_on'].includes(last) ? last : 'summer_off';
    }
  } else if (season.startsWith('win')) {
    reason = frost ? 'frost_off' : aq ? 'aq_medium' : mild ? 'mild_low' : co2Need ? 'co2_low' : slot ? 'night_low' : 'off';
  }

  const aqParts = [
    aqHits.co2 && `CO₂ ${fmt(co2)} ppm ≥ ${fmt(th.co2Schwelle)}`,
    aqHits.hum && `Feuchte ${fmt(hum)} % ≥ ${fmt(th.feuchteSchwelle)}`,
    aqHits.voc && `VOC ${fmt(voc)} ≥ ${fmt(th.vocSchwelle)}`,
    aqHits.pm25 && `PM2.5 ${fmt(pm25, 1)} ≥ ${fmt(th.pm25Schwelle)}`,
  ].filter(Boolean);

  const rules = [
    {
      id: 'frost_off',
      matched: frost,
      condition: `Außen < ${fmt(th.frostAus)} °C`,
      live: `Außen ${fmt(outside, 1)} °C`,
      hint: last === 'frost_off' ? `aus ab ${fmt(th.frostAus + FROST_HYSTERESIS)} °C` : null,
    },
    {
      id: 'aq_medium',
      matched: aq,
      condition: 'CO₂, Feuchte, VOC oder PM2.5 über Schwelle',
      live: aqParts.length ? aqParts.join(' · ') : last === 'aq_medium' && !aqGood ? 'Werte noch nicht deutlich darunter' : 'alle Werte unter Schwelle',
      hint: null,
    },
    {
      id: 'mild_low',
      matched: mild,
      condition: `Außen ≥ ${fmt(th.dauerbetriebAb)} °C`,
      live: `Außen ${fmt(outside, 1)} °C`,
      hint: last === 'mild_low' ? `aus unter ${fmt(th.dauerbetriebAb - MILD_HYSTERESIS)} °C` : null,
    },
    {
      id: 'co2_low',
      matched: co2Need,
      condition: `CO₂ ≥ ${fmt(th.co2LowEin)} ppm`,
      live: `CO₂ ${fmt(co2)} ppm`,
      hint: `aus unter ${fmt(th.co2Aus)} ppm`,
    },
    {
      id: 'night_low',
      matched: Boolean(slot),
      condition: input.nightEnabled ? '22–6 Uhr, je 20 min alle 2 h' : 'deaktiviert',
      live: slot ? `Slot bis ${clock(slot.end)}` : input.nightEnabled ? 'kein Slot' : '—',
      hint: null,
      disabled: !input.nightEnabled,
    },
    { id: 'off', matched: true, condition: 'sonst', live: `CO₂ ${fmt(co2)} ppm`, hint: null },
  ].map((r) => ({ ...r, ...REASONS[r.id], active: r.id === reason }));

  const explanations = {
    frost_off: `Außen ${fmt(outside, 1)} °C < ${fmt(th.frostAus)} °C`,
    aq_medium: aqParts.join(' · ') || 'Luftqualität noch nicht deutlich besser',
    mild_low: `Außen ${fmt(outside, 1)} °C ≥ ${fmt(th.dauerbetriebAb)} °C`,
    co2_low: co2 != null && co2 >= th.co2LowEin ? `CO₂ ${fmt(co2)} ppm ≥ ${fmt(th.co2LowEin)}` : `CO₂ ${fmt(co2)} ppm · aus unter ${fmt(th.co2Aus)}`,
    night_low: slot ? `Nacht-Slot bis ${clock(slot.end)}` : 'Nacht-Grundlüftung',
    off: `Kein Bedarf · CO₂ ${fmt(co2)} ppm`,
    summer_on: `Außen ${fmt(outside, 1)} °C ≤ Innen ${fmt(inside, 1)} °C`,
    summer_off: `Außen ${fmt(outside, 1)} °C > Innen ${fmt(inside, 1)} °C`,
  };

  return {
    reason,
    stage: reason ? REASONS[reason].stage : null,
    values: { co2, hum, voc, pm25, outside, inside },
    thresholds: th,
    rules,
    explanation: reason ? explanations[reason] : null,
  };
}

/** Eintrag von input_text.luftung_letzter_modus lesbar machen (neues und altes Format). */
export function parseLastMode(raw, summerFanMode = null) {
  if (!raw || raw === 'unknown' || raw === 'unavailable') return { src: '—', lvl: '', detail: '', kind: 'none' };
  if (REASONS[raw]) {
    const { label, stage } = REASONS[raw];
    const lvl = stage === 'summer' ? stageLabel(summerFanMode) || 'An' : stageLabel(stage);
    const kind = raw === 'aq_medium' ? 'aq' : stage === 'off' ? 'off' : 'on';
    return { src: label, lvl, detail: '', kind };
  }
  const parts = raw.split('_');
  if (parts[0] === 'boost') return { src: 'Boost-Modus', lvl: 'Stufe 3', detail: '', kind: 'on' };
  if (parts[0].startsWith('manual')) return { src: 'Manuell', lvl: '', detail: '', kind: 'on' };
  // Altes Format: <saison>_<quelle>_<stufe>
  const season = parts[0] === 'winter' ? 'Winter' : parts[0] === 'summer' ? 'Sommer' : '';
  const lvl = stageLabel(parts[2]) || '';
  if (parts[1] === 'auto') return { src: `Temp-Steuerung${season ? ` (${season})` : ''}`, lvl: lvl || 'An', detail: 'alte Logik', kind: 'on' };
  if (parts[1] === 'airquality' || parts[1] === 'aq') return { src: 'Luftqualitäts-Override', lvl: lvl || 'An', detail: 'alte Logik', kind: 'aq' };
  if (parts[1] === 'off') return { src: `Ausgeschaltet${season ? ` (${season})` : ''}`, lvl: 'Aus', detail: 'alte Logik', kind: 'off' };
  return { src: raw, lvl: '', detail: '', kind: 'none' };
}

/** CO₂-Farbe an den Schwellen der Automation: unter „Low ein“ grün, bis zur Luftqualitäts-Schwelle orange, darüber rot. */
export function co2Color(ppm, th = LUEFTUNG_DEFAULTS) {
  if (ppm == null) return 'var(--text-primary)';
  if (ppm < (th.co2LowEin ?? LUEFTUNG_DEFAULTS.co2LowEin)) return '#4ade80';
  if (ppm < (th.co2Schwelle ?? LUEFTUNG_DEFAULTS.co2Schwelle)) return '#fb923c';
  return '#f87171';
}

/** Ende der Mindest-Stufendauer (ms) oder null, wenn keine Sperre läuft. */
export function lockUntil(lockTimestamp, minutes, now = Date.now()) {
  if (!lockTimestamp) return null;
  const at = new Date(String(lockTimestamp).replace(' ', 'T')).getTime();
  if (!Number.isFinite(at)) return null;
  const until = at + (minutes ?? LUEFTUNG_DEFAULTS.mindestStufendauer) * 60_000;
  return until > now ? until : null;
}
