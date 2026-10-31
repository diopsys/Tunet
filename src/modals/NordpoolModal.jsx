import { useState, useEffect, useRef } from 'react';
import { X, Zap, ToggleLeft, ToggleRight } from '../icons';
import InteractivePowerGraph from '../components/charts/InteractivePowerGraph';
import { useHomeAssistantMeta } from '../contexts';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import { getHistory } from '../services/haClient';

// ── Entity IDs ────────────────────────────────────────────────────────
const OCTOPUS_ID      = 'sensor.octopus_a_c856c4a4_electricity_price';
const HELIOS_ID       = 'sensor.pv_anlage_predicted_battery_state_of_charge';
const HAUSVERBRAUCH_ID = 'sensor.hausverbrauch_mittel_1h';
const WIRKUNGSGRAD_ID  = 'input_number.netzladung_sim_wirkungsgrad';
const EINSPEISE_ID     = 'input_number.netzladung_sim_einspeisevergutung';
const ECHTER_SOC_ID   = 'sensor.solaredge_b1_state_of_energy';

const SIM_VARIANTS = [
  { key: '0ct', label: '0 ct' },
  { key: '4ct', label: '4 ct' },
  { key: '8ct', label: '8 ct' },
];

const MERGE_GAP_LADEN_MS  = 20 * 60_000;
const MERGE_GAP_NUTZEN_MS =  2 * 60_000;
const RESET_TS = new Date(2026, 9, 18, 15, 5).getTime(); // 18.10.2026 15:05 Zähler-Reset
const SUN_ID           = 'sun.sun';
const PV_REMAINING_ID  = 'sensor.pv_anlage_energy_today_remaining';
const PV_DAY1_ID       = 'sensor.pv_anlage_energy_day_1';
const PV_DAY2_ID       = 'sensor.pv_anlage_energy_day_2';

// ── Helpers ───────────────────────────────────────────────────────────
const fmt2 = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => { const d = new Date(ts); return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`; };

function dayLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.getTime() === today.getTime()) return 'heute';
  if (d.getTime() === tomorrow.getTime()) return 'morgen';
  return new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
}

function formatWindow(w) {
  const sl = dayLabel(w.start);
  const el = dayLabel(w.end - 1); // -1 ms → day of last minute
  if (sl === el) return `${sl} ${hhmm(w.start)}–${hhmm(w.end)}`;
  return `${sl} ${hhmm(w.start)}–${el} ${hhmm(w.end)}`;
}

// ── "Hält für …" computation ──────────────────────────────────────────
function computeEntladefenster(v, entities) {
  const num = (id) => { const n = parseFloat(entities?.[id]?.state); return isNaN(n) ? null : n; };

  const speicherKwh   = num(`input_number.netzladung_sim_${v}_speicher`);
  const wirkungsgrad  = num(WIRKUNGSGRAD_ID) ?? 0.85;
  const hausW         = Math.max(200, num(HAUSVERBRAUCH_ID) ?? 200);

  if (speicherKwh == null || speicherKwh <= 0.05) return null;

  // PV-Sperre: Sonne über Horizont + noch > 1 kWh PV heute → keine Haltephase
  const sunAbove    = entities?.[SUN_ID]?.state === 'above_horizon';
  const pvRemaining = parseFloat(entities?.[PV_REMAINING_ID]?.state);
  if (sunAbove && !isNaN(pvRemaining) && pvRemaining > 1) {
    return { type: 'pv_active', pvRemaining };
  }

  const rates    = entities?.[OCTOPUS_ID]?.attributes?.rates;
  const forecast = entities?.[HELIOS_ID]?.attributes?.forecast;
  if (!Array.isArray(rates) || !Array.isArray(forecast) || forecast.length === 0) return null;

  const now   = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmrw  = new Date(today.getTime() + 86_400_000);

  // Halte-Horizont: bis nächster Sonnenaufgang + 2 h, wenn PV-Tag ≥ 3 kWh; sonst 24 h
  let horizonTs = now + 24 * 3_600_000;
  const nextRisingStr = entities?.[SUN_ID]?.attributes?.next_rising;
  if (nextRisingStr) {
    const nextRising = new Date(nextRisingStr).getTime();
    if (!isNaN(nextRising)) {
      const risingDay = new Date(nextRising); risingDay.setHours(0, 0, 0, 0);
      const pvId  = risingDay.getTime() === today.getTime() ? PV_DAY1_ID : PV_DAY2_ID;
      const pvKwh = parseFloat(entities?.[pvId]?.state);
      if (!isNaN(pvKwh) && pvKwh >= 3) horizonTs = nextRising + 2 * 3_600_000;
    }
  }

  // Build forecast map: timestamp → soc
  const fcMap = new Map();
  forecast.forEach(f => {
    const t = new Date(f.datetime).getTime();
    if (!isNaN(t)) fcMap.set(t, f.soc);
  });

  let hasTomorrowRates = false;
  const leerSlots = [];

  for (const r of rates) {
    const slotStart = new Date(r.start).getTime();
    const slotEnd   = new Date(r.end).getTime();
    if (slotStart >= tmrw.getTime()) hasTomorrowRates = true;
    if (slotStart < now || slotStart > horizonTs || r.value_inc_vat == null) continue;

    // Match forecast: exact, then ±15 min
    const soc = fcMap.get(slotStart)
      ?? fcMap.get(slotStart - 900_000)
      ?? fcMap.get(slotStart + 900_000);
    if (soc === undefined || soc > 11) continue;

    leerSlots.push({ start: slotStart, end: slotEnd, price: r.value_inc_vat * 100 });
  }

  if (leerSlots.length === 0) return { type: 'no_leer_slots', hasTomorrowRates };

  const K = Math.max(1, Math.ceil(speicherKwh * wirkungsgrad / (hausW / 1000 * 0.25)));
  const sortedDesc = [...leerSlots].sort((a, b) => b.price - a.price);
  const schwelle   = sortedDesc[Math.min(K - 1, sortedDesc.length - 1)].price;

  const fensterSlots = leerSlots.filter(s => s.price >= schwelle).sort((a, b) => a.start - b.start);

  // Merge consecutive slots (≤ 1 min tolerance at boundaries)
  const merged = [];
  for (const s of fensterSlots) {
    if (!merged.length || s.start > merged[merged.length - 1].end + 60_000) {
      merged.push({ start: s.start, end: s.end });
    } else {
      merged[merged.length - 1].end = s.end;
    }
  }

  const currentInFenster = fensterSlots.some(s => now >= s.start && now < s.end);
  const formattedWindows = merged.map(formatWindow);

  return { fenster: merged, schwelle, K, currentInFenster, formattedWindows, hasTomorrowRates };
}

// ── History parsing ───────────────────────────────────────────────────
function parseHistoryPoints(raw) {
  return raw
    .map(d => {
      const val = parseFloat(d.state ?? d.s);
      // WS compact format: lc/lu are Unix seconds; lc only present when ≠ lu
      const secToMs = (v) => v < 1e12 ? v * 1000 : v;
      const t = d.last_changed  ? new Date(d.last_changed).getTime()
              : d.lc != null    ? secToMs(d.lc)
              : d.lu != null    ? secToMs(d.lu)
              : null;
      return { val, t };
    })
    .filter(d => !isNaN(d.val) && d.t !== null && d.val >= 0)
    .sort((a, b) => a.t - b.t);
}

// Extract rising-value phases, merging gaps ≤ gapMs
function extractRisingPhases(pts, gapMs) {
  const events = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].val - pts[i - 1].val > 0.001)
      events.push({ prevT: pts[i - 1].t, t: pts[i].t, delta: pts[i].val - pts[i - 1].val });
  }
  if (!events.length) return [];

  const phases = [];
  let ph = { startT: events[0].prevT, endT: events[0].t, totalDelta: events[0].delta };
  for (let i = 1; i < events.length; i++) {
    if (events[i].prevT - ph.endT <= gapMs) {
      ph.endT = events[i].t;
      ph.totalDelta += events[i].delta;
    } else {
      phases.push({ ...ph });
      ph = { startT: events[i].prevT, endT: events[i].t, totalDelta: events[i].delta };
    }
  }
  phases.push(ph);
  return phases;
}

function speicherAt(pts, t) {
  let last = null;
  for (const p of pts) { if (p.t <= t) last = p; else break; }
  return last?.val ?? null;
}

function buildVorgaenge(speicherPts, kostenPts, erlosPts, einspeiseCt, wirkungsgrad) {
  const eEur = einspeiseCt / 100;
  const tol  = 0.005;
  const vorgaenge = [];

  // Laden: kosten rising → speicher rising (großer Gap: voller Speicher lädt kurz nach)
  for (const ph of extractRisingPhases(kostenPts, MERGE_GAP_LADEN_MS)) {
    const s0 = speicherAt(speicherPts, ph.startT);
    const s1 = speicherAt(speicherPts, ph.endT);
    const geladenKwh = s0 != null && s1 != null ? Math.max(0, s1 - s0) : null;
    const avgCt = geladenKwh != null && geladenKwh > 0.001
      ? (ph.totalDelta / geladenKwh) * 100 : null;
    vorgaenge.push({ type: 'laden', startT: ph.startT, endT: ph.endT,
      kwh: geladenKwh, deltaKosten: ph.totalDelta, avgCt });
  }

  // Nutzen / PV-verdrängt: erlos rising AND speicher falling
  for (const ph of extractRisingPhases(erlosPts, MERGE_GAP_NUTZEN_MS)) {
    const s0 = speicherAt(speicherPts, ph.startT);
    const s1 = speicherAt(speicherPts, ph.endT);
    const sDelta = s0 != null && s1 != null ? s0 - s1 : null; // positive = falling
    if (sDelta == null || sDelta < 0.001) continue;

    const ratio = ph.totalDelta / sDelta;
    if (Math.abs(ratio - eEur) <= tol) {
      // PV-verdrängt: erlös ≈ speicher_rückgang × einspeisevergütung
      vorgaenge.push({ type: 'pv', startT: ph.startT, endT: ph.endT,
        kwh: sDelta, avgCt: einspeiseCt });
    } else {
      // Nutzen: genutzte kWh = speicher_rückgang × wirkungsgrad
      const genutztKwh = sDelta * wirkungsgrad;
      const avgCt = genutztKwh > 0.001 ? (ph.totalDelta / genutztKwh) * 100 : null;
      vorgaenge.push({ type: 'nutzen', startT: ph.startT, endT: ph.endT,
        kwh: genutztKwh, deltaErloes: ph.totalDelta, avgCt });
    }
  }

  vorgaenge.sort((a, b) => b.startT - a.startT);
  return vorgaenge;
}

function checkConsistency(vorgaenge, kostenPts, erlosPts, rangeStartTs) {
  if (kostenPts.length < 2 || erlosPts.length < 2) return null;

  // Actual delta in _kosten / _erlos since range start
  const valAtRangeStart = (pts) => {
    let last = pts[0].val;
    for (const p of pts) { if (p.t <= rangeStartTs) last = p.val; else break; }
    return last;
  };
  const actualKosten = kostenPts[kostenPts.length - 1].val - valAtRangeStart(kostenPts);
  const actualErloes = erlosPts[erlosPts.length - 1].val - valAtRangeStart(erlosPts);

  const inRange = vorgaenge.filter(v => v.startT >= rangeStartTs);
  const listKosten = inRange.filter(v => v.type === 'laden')
    .reduce((s, v) => s + (v.deltaKosten ?? 0), 0);
  const listErloes = inRange.filter(v => v.type !== 'laden')
    .reduce((s, v) => s + (v.deltaErloes ?? (v.type === 'pv' ? v.kwh * (v.avgCt / 100) : 0)), 0);

  const dK = Math.abs(listKosten - actualKosten);
  const dE = Math.abs(listErloes - actualErloes);
  if (dK > 0.10 || dE > 0.10) {
    const parts = [];
    if (dK > 0.10) parts.push(`Kosten Δ ${(dK * 100).toFixed(0)} ct`);
    if (dE > 0.10) parts.push(`Erlös Δ ${(dE * 100).toFixed(0)} ct`);
    return `Summe weicht vom Helfer-Wert ab (${parts.join(', ')}) – lückenhafte History möglich.`;
  }
  return null;
}

// ── State derivation ──────────────────────────────────────────────────
function getVariantState(v, entities, statusRaw) {
  const e   = (id) => entities?.[id];
  const now = Date.now();
  const changedMs = (id) => {
    const lc = e(id)?.last_changed;
    return lc ? now - new Date(lc).getTime() : Infinity;
  };
  const speicher = parseFloat(e(`input_number.netzladung_sim_${v}_speicher`)?.state);
  if (statusRaw?.startsWith('Pausiert')) return 'pausiert';
  if (changedMs(`input_number.netzladung_sim_${v}_kosten`) < 90_000) return 'laden';
  if (changedMs(`input_number.netzladung_sim_${v}_erlos`) < 90_000) return 'nutzen';
  if (!isNaN(speicher) && speicher > 0.05) return 'halten';
  return 'inaktiv';
}

function getSimVariantData(v, entities) {
  const num = (id) => { const n = parseFloat(entities?.[id]?.state); return isNaN(n) ? null : n; };
  return {
    ersparnis:       num(`sensor.netzladung_sim_${v}_ersparnis`),
    kosten:          num(`input_number.netzladung_sim_${v}_kosten`),
    erlos:           num(`input_number.netzladung_sim_${v}_erlos`),
    speicherstandPct: num(`sensor.netzladung_sim_${v}_speicherstand`),
  };
}

function parseSimStatus(raw) {
  if (!raw || raw === 'unavailable' || raw === 'unknown')
    return { type: 'unavailable', label: '—', detail: '' };
  if (raw.startsWith('Pausiert'))
    return { type: 'pausiert', label: 'Pausiert', detail: raw.replace(/^Pausiert\s*[–-]\s*/, '') };
  if (raw.startsWith('Kein Laden:')) {
    const parts = raw.replace('Kein Laden:', '').trim().split('·');
    return { type: 'idle', label: 'Kein Laden', detail: parts[0].trim(), sub: parts.slice(1).join('·').trim() };
  }
  if (raw.startsWith('Ladefenster:'))
    return { type: 'ladefenster', label: 'Ladefenster', detail: raw.replace('Ladefenster:', '').trim() };
  return { type: 'neutral', label: raw, detail: '' };
}

// ── Styled atoms ──────────────────────────────────────────────────────
const STATE_STYLE = {
  pausiert: { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)', color: '#9ca3af', label: 'Pausiert', pulse: false },
  inaktiv:  { bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', color: '#6b7280', label: 'Inaktiv',  pulse: false },
  laden:    { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  color: '#60a5fa', label: 'Lädt',     pulse: true  },
  halten:   { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  color: '#fbbf24', label: 'Hält',     pulse: false },
  nutzen:   { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   color: '#4ade80', label: 'Nutzt',    pulse: true  },
};

function StateChip({ state, small = false }) {
  const s = STATE_STYLE[state] || STATE_STYLE.inaktiv;
  return (
    <span
      className={`rounded-full font-bold tracking-wide uppercase ${s.pulse ? 'animate-pulse' : ''} ${small ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function FensterText({ state, v, entities }) {
  // No window info for pausiert or inaktiv
  if (state === 'pausiert' || state === 'inaktiv') {
    return state === 'inaktiv'
      ? <span className="text-[10px] text-[var(--text-muted)]">Leer</span>
      : null;
  }

  const currentPriceCt = parseFloat(entities?.[OCTOPUS_ID]?.state) * 100;
  const priceStr = !isNaN(currentPriceCt) ? `${currentPriceCt.toFixed(1)} ct` : null;

  if (state === 'laden') {
    return (
      <span className="text-[10px] text-[var(--text-secondary)]">
        Lädt jetzt{priceStr ? ` · ${priceStr}` : ''}
      </span>
    );
  }

  const fenster = computeEntladefenster(v, entities);
  const windowStr = fenster?.formattedWindows?.slice(0, 2).join(' · ') || null;
  const schwelleStr = fenster?.schwelle != null ? `ab ${fenster.schwelle.toFixed(1)} ct` : null;
  const noTmrw = fenster?.hasTomorrowRates === false;

  if (state === 'nutzen') {
    return (
      <span className="text-[10px] text-[var(--text-secondary)]">
        Entlädt jetzt{priceStr ? ` · ${priceStr}` : ''}
        {windowStr ? ` · Fenster: ${windowStr}` : ''}
      </span>
    );
  }

  if (state === 'halten') {
    if (fenster?.type === 'pv_active') {
      return (
        <span className="text-[10px] text-[var(--text-secondary)]">
          Schattenenergie – sobald Speicher leer · {fenster.pvRemaining.toFixed(1)} kWh PV noch heute
        </span>
      );
    }
    if (!fenster || fenster.type === 'no_leer_slots') {
      return <span className="text-[10px] text-[var(--text-muted)]">Hält – kein Entladefenster gefunden</span>;
    }
    if (fenster.currentInFenster) {
      return (
        <span className="text-[10px] text-[var(--text-secondary)]">
          Reserve – wird genutzt, sobald Speicher leer
          {windowStr ? ` · Fenster: ${windowStr}` : ''}
        </span>
      );
    }
    return (
      <span className="text-[10px] text-[var(--text-secondary)]">
        Hält für: {windowStr || '—'}
        {schwelleStr ? ` (${schwelleStr})` : ''}
        {noTmrw && <span className="text-[var(--text-muted)]"> · Preise f. morgen n. verf.</span>}
      </span>
    );
  }

  return null;
}

function SimStatusBadge({ raw }) {
  const { type, label, detail, sub } = parseSimStatus(raw);
  const C = {
    pausiert:    { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)', dot: '#6b7280',  text: '#9ca3af' },
    idle:        { bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.3)',  dot: '#60a5fa',  text: '#93c5fd' },
    ladefenster: { bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.3)',   dot: '#22c55e',  text: '#4ade80' },
    unavailable: { bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', dot: '#4b5563', text: '#6b7280' },
    neutral:     { bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.2)', dot: '#9ca3af',  text: '#d1d5db' },
  };
  const c = C[type] || C.neutral;
  return (
    <div className="flex w-full items-start gap-3 rounded-2xl border p-3 sm:p-4"
      style={{ backgroundColor: c.bg, borderColor: c.border }}>
      <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${type === 'ladefenster' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: c.dot }} />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: c.text }}>{label}</span>
        {detail && <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">{detail}</p>}
        {sub    && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p>}
      </div>
    </div>
  );
}

function SpeicherBar({ pct, color = '#38bdf8' }) {
  const w = pct != null ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--glass-border)]">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${w}%`, backgroundColor: w > 5 ? color : 'rgba(56,189,248,0.25)' }} />
    </div>
  );
}

function VariantCard({ variant, entities, statusRaw }) {
  const d     = getSimVariantData(variant.key, entities);
  const state = getVariantState(variant.key, entities, statusRaw);
  const ersparnisColor = d.ersparnis == null ? 'var(--text-muted)'
    : d.ersparnis >= 0 ? '#4ade80' : '#f87171';

  return (
    <div className="popup-surface flex flex-col gap-2 rounded-2xl p-3 sm:rounded-3xl sm:p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">{variant.label}</span>
        <StateChip state={state} />
      </div>

      <FensterText state={state} v={variant.key} entities={entities} />

      <div>
        <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Ersparnis</p>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-light leading-none sm:text-2xl" style={{ color: ersparnisColor }}>
            {d.ersparnis != null ? `${d.ersparnis >= 0 ? '+' : ''}${d.ersparnis.toFixed(2)}` : '—'}
          </span>
          {d.ersparnis != null && <span className="text-xs text-[var(--text-muted)]">€</span>}
        </div>
      </div>

      <div className="flex gap-3 border-t border-[var(--glass-border)] pt-2">
        <div>
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Kosten</p>
          <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
            {d.kosten != null ? `${d.kosten.toFixed(2)} €` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Erlös</p>
          <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
            {d.erlos != null ? `${d.erlos.toFixed(2)} €` : '—'}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Sim. Speicher</p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {d.speicherstandPct != null ? `${d.speicherstandPct.toFixed(0)} %` : '—'}
          </p>
        </div>
        <SpeicherBar pct={d.speicherstandPct} />
      </div>
    </div>
  );
}

function SpeicherVergleich({ entities }) {
  const num = (id) => { const n = parseFloat(entities?.[id]?.state); return isNaN(n) ? null : n; };
  const echtPct = num(ECHTER_SOC_ID);
  const simPct  = num('sensor.netzladung_sim_4ct_speicherstand');
  const diff    = echtPct != null && simPct != null ? simPct - echtPct : null;

  const Row = ({ label, pct, color }) => (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">{label}</span>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {pct != null ? `${pct.toFixed(0)} %` : '—'}
        </span>
      </div>
      <SpeicherBar pct={pct} color={color} />
    </div>
  );
  return (
    <div className="popup-surface flex flex-col gap-3 rounded-2xl p-3 sm:rounded-3xl sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Speicher-Vergleich</p>
        {diff != null && diff > 0.5 && (
          <span className="text-[10px] font-medium" style={{ color: '#38bdf8' }}>
            +{diff.toFixed(0)} % durch Netzladung
          </span>
        )}
      </div>
      <Row label="Echt"     pct={echtPct} color="#94a3b8" />
      <Row label="Mit 4 ct" pct={simPct}  color="#38bdf8" />
    </div>
  );
}

// ── Vorgangsliste ─────────────────────────────────────────────────────
function formatVorgangDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function VorgangRow({ v }) {
  const start = hhmm(v.startT);
  const end   = hhmm(v.endT);
  const date  = formatVorgangDate(v.startT);
  const kwhStr = v.kwh != null ? `${v.kwh.toFixed(2)} kWh` : '? kWh';
  const priceStr = v.avgCt != null ? `Ø ${v.avgCt.toFixed(1)} ct` : '';

  const TYPE_STYLE = {
    laden:  { color: '#60a5fa', label: 'geladen'    },
    nutzen: { color: '#4ade80', label: 'genutzt'    },
    pv:     { color: '#94a3b8', label: 'PV-verdrängt' },
  };
  const ts = TYPE_STYLE[v.type] || TYPE_STYLE.pv;

  return (
    <div className="flex items-start gap-2 border-b border-[var(--glass-border)] py-2 last:border-0">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ts.color }} />
      <div className="min-w-0 flex-1 text-[10px] text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">
          {date} {start}–{end}
        </span>
        {' · '}
        <span style={{ color: ts.color }}>{ts.label}</span>
        {' '}
        {kwhStr}
        {priceStr && <span className="text-[var(--text-muted)]"> · {priceStr}</span>}
      </div>
    </div>
  );
}

function VorgangSummen({ vorgaenge, rangeStartTs }) {
  const inRange = vorgaenge.filter(v => v.startT >= rangeStartTs);
  const laden   = inRange.filter(v => v.type === 'laden');
  const nutzen  = inRange.filter(v => v.type === 'nutzen');
  const pv      = inRange.filter(v => v.type === 'pv');

  const sumKwh = (arr) => arr.reduce((s, v) => s + (v.kwh ?? 0), 0);
  const sumEur = (arr, key) => arr.reduce((s, v) => s + (v[key] ?? 0), 0);
  const avgCt  = (arr, eurKey, kwhArr) => {
    const eur = sumEur(arr, eurKey);
    const kwh = sumKwh(kwhArr);
    return kwh > 0.001 ? (eur / kwh * 100).toFixed(1) : null;
  };

  const ladenKwh  = sumKwh(laden);
  const nutzenKwh = sumKwh(nutzen);
  const pvKwh     = sumKwh(pv);

  const ladenAvg  = avgCt(laden, 'deltaKosten', laden);
  const nutzenAvg = avgCt(nutzen, 'deltaErloes', nutzen);

  if (!inRange.length) return (
    <p className="text-[10px] text-[var(--text-muted)]">Keine Vorgänge im Zeitraum.</p>
  );

  return (
    <div className="mt-2 flex flex-wrap gap-3 border-t border-[var(--glass-border)] pt-2">
      {ladenKwh > 0.001 && (
        <div>
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Geladen</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {ladenKwh.toFixed(2)} kWh{ladenAvg ? ` @ Ø ${ladenAvg} ct` : ''}
          </p>
        </div>
      )}
      {nutzenKwh > 0.001 && (
        <div>
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Genutzt</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {nutzenKwh.toFixed(2)} kWh{nutzenAvg ? ` @ Ø ${nutzenAvg} ct` : ''}
          </p>
        </div>
      )}
      {pvKwh > 0.001 && (
        <div>
          <p className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">PV-verdrängt</p>
          <p className="text-xs text-[var(--text-secondary)]">{pvKwh.toFixed(2)} kWh</p>
        </div>
      )}
    </div>
  );
}

function Vorgangsliste({ entities, conn }) {
  const [varKey, setVarKey] = useState(() => {
    const variants = ['0ct', '4ct', '8ct'];
    let best = null;
    let bestT = -Infinity;
    for (const v of variants) {
      for (const suffix of ['_kosten', '_erlos']) {
        const e = entities?.[`input_number.netzladung_sim_${v}${suffix}`];
        if (e?.last_changed) {
          const t = new Date(e.last_changed).getTime();
          if (t > bestT) { bestT = t; best = v; }
        }
      }
    }
    return best ?? '0ct';
  });
  const [range, setRange]         = useState('today');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [vorgaenge, setVorgaenge] = useState([]);
  const [warnMsg, setWarnMsg]     = useState(null);

  // Stable ref so the fetch effect doesn't re-trigger on every entity push
  const entitiesRef = useRef(entities);
  useEffect(() => { entitiesRef.current = entities; });

  useEffect(() => {
    if (!conn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVorgaenge([]);
    setWarnMsg(null);

    const now   = new Date();
    const start = range === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getTime() - 7 * 86_400_000);

    const fetchOne = (id) =>
      getHistory(conn, { entityId: id, start, end: now, minimal_response: true, no_attributes: true })
        .catch(() => []);

    Promise.all([
      fetchOne(`input_number.netzladung_sim_${varKey}_speicher`),
      fetchOne(`input_number.netzladung_sim_${varKey}_kosten`),
      fetchOne(`input_number.netzladung_sim_${varKey}_erlos`),
    ]).then(([rawS, rawK, rawE]) => {
      if (cancelled) return;

      const speicherPts = parseHistoryPoints(rawS);
      const kostenPts   = parseHistoryPoints(rawK);
      const erlosPts    = parseHistoryPoints(rawE);

      // Read params from ref at fetch time, not from reactive entities
      const ent = entitiesRef.current;
      const einspeiseCt  = parseFloat(ent?.[EINSPEISE_ID]?.state) || 8;
      const wirkungsgrad = parseFloat(ent?.[WIRKUNGSGRAD_ID]?.state) || 0.85;

      const list = buildVorgaenge(speicherPts, kostenPts, erlosPts, einspeiseCt, wirkungsgrad);
      const warn = checkConsistency(list, kostenPts, erlosPts, Math.max(start.getTime(), RESET_TS));

      setVorgaenge(list);
      setWarnMsg(warn);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setError('History konnte nicht geladen werden.'); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [conn, varKey, range]); // entities absichtlich nicht hier — würde bei jedem HA-Push neu feuern

  const rangeStartTs = Math.max(
    range === 'today'
      ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
      : Date.now() - 7 * 86_400_000,
    RESET_TS
  );

  const tabCls = (active) =>
    `px-3 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase transition-all ${
      active ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border border-[var(--glass-border)]'
             : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
    }`;

  return (
    <div className="popup-surface flex flex-col gap-3 rounded-2xl p-3 sm:rounded-3xl sm:p-5">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">Vorgänge</p>
        <div className="flex gap-1">
          {SIM_VARIANTS.map(v => (
            <button key={v.key} className={tabCls(varKey === v.key)} onClick={() => setVarKey(v.key)}>
              {v.label}
            </button>
          ))}
          <span className="text-[var(--glass-border)] mx-1 self-center">|</span>
          <button className={tabCls(range === 'today')} onClick={() => setRange('today')}>Heute</button>
          <button className={tabCls(range === '7d')}   onClick={() => setRange('7d')}>7 Tage</button>
        </div>
      </div>

      {loading && (
        <p className="text-[10px] text-[var(--text-muted)] animate-pulse">Lade History …</p>
      )}
      {error && (
        <p className="text-[10px]" style={{ color: '#f87171' }}>{error}</p>
      )}
      {warnMsg && (
        <p className="text-[10px]" style={{ color: '#fb923c' }}>⚠ {warnMsg}</p>
      )}

      {!loading && !error && (
        <>
          {(() => {
            const shown = vorgaenge.filter(v => v.startT >= rangeStartTs);
            return shown.length === 0
              ? <p className="text-[10px] text-[var(--text-muted)]">Noch keine Vorgänge erfasst.</p>
              : shown.map((v, i) => <VorgangRow key={i} v={v} />);
          })()}
          <VorgangSummen vorgaenge={vorgaenge} rangeStartTs={rangeStartTs} />
        </>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────
export default function NordpoolModal({
  show, onClose,
  entity: _entity,
  fullPriceData, currentPriceIndex, priceStats,
  name, t, language,
  saveCardSetting, cardId, settings,
  hideSupport,
  entities,
  conn,
}) {
  const { haConfig } = useHomeAssistantMeta();
  const translate    = t || ((key) => key);
  const currency     = settings?.currency || haConfig?.currency || 'kr';
  const [showWithSupport, setShowWithSupport] = useState(settings?.showWithSupport ?? false);
  const [tab, setTab] = useState('preise');
  const modalTitleId = 'nordpool-modal-title';

  useEffect(() => { if (!show) return; setShowWithSupport(settings?.showWithSupport ?? false); },
    [show, settings?.showWithSupport]);
  useEffect(() => { if (!show) setTab('preise'); }, [show]);

  if (!show) return null;

  const applyElStøtte = (p) => {
    if (p <= 93.75) return p;
    return p - (p / 1.25 - 75) * 0.9 * 1.25;
  };

  const displayData  = fullPriceData.map(d => ({ ...d, value: showWithSupport ? applyElStøtte(d.value) : d.value }));
  const displayStats = {
    min: showWithSupport ? applyElStøtte(priceStats.min) : priceStats.min,
    avg: showWithSupport ? applyElStøtte(priceStats.avg) : priceStats.avg,
    max: showWithSupport ? applyElStøtte(priceStats.max) : priceStats.max,
  };

  const simStatusRaw = entities?.['input_text.netzladung_sim_status']?.state || '';
  const sim4ctData   = getSimVariantData('4ct', entities);
  const sim4ctState  = getVariantState('4ct', entities, simStatusRaw);

  const tabBtnCls = (active) =>
    `px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
      active ? 'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border border-[var(--glass-border)]'
             : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
    }`;

  return (
    <AccessibleModalShell
      open={show} onClose={onClose} titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative max-h-[calc(100dvh-1rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border p-4 font-sans backdrop-blur-xl sm:max-h-[90vh] sm:p-6 md:rounded-[3rem] md:p-12"
      panelStyle={{ background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
    >
      {() => (
        <>
          {/* Close + support toggle */}
          <div className="absolute top-4 right-4 z-20 flex gap-2 sm:top-6 sm:right-6 sm:gap-3 md:top-10 md:right-10">
            {!hideSupport && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const v = !showWithSupport;
                  setShowWithSupport(v);
                  if (saveCardSetting && cardId) saveCardSetting(cardId, 'showWithSupport', v);
                }}
                className={`flex h-9 items-center gap-2 rounded-full border px-4 shadow-lg backdrop-blur-md transition-all ${showWithSupport ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
              >
                {showWithSupport ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                <span className="hidden text-[10px] font-bold tracking-widest uppercase sm:inline">
                  {showWithSupport ? t('nordpool.withSupport') : t('nordpool.withoutSupport')}
                </span>
              </button>
            )}
            <button onClick={onClose} className="modal-close" aria-label={translate('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Header */}
          <div className="mb-4 flex items-center gap-3 pr-24 font-sans sm:mb-6 sm:gap-4 sm:pr-0">
            <div className="rounded-2xl p-3 transition-all duration-500 sm:p-4"
              style={{ backgroundColor: 'rgba(217,119,6,0.15)', color: '#fbbf24' }}>
              <Zap className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div>
              <h3 id={modalTitleId}
                className="text-xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic sm:text-2xl">
                {name}
              </h3>
              <div className="mt-2 inline-block rounded-full border px-3 py-1"
                style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}>
                <p className="text-[10px] font-bold tracking-widest uppercase italic">{translate('power.title')}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-2 sm:mb-6">
            <button className={tabBtnCls(tab === 'preise')} onClick={() => setTab('preise')}>Preise</button>
            <button className={tabBtnCls(tab === 'automatisierung')} onClick={() => setTab('automatisierung')}>Automatisierung</button>
          </div>

          {/* ── Tab: Preise ── */}
          {tab === 'preise' && (
            <div className="grid grid-cols-1 items-start gap-4 font-sans sm:gap-12 lg:grid-cols-5">
              <div className="lg:col-span-3">
                {displayData?.length > 0 && (
                  <InteractivePowerGraph
                    key={`graph-${showWithSupport}`}
                    data={displayData} currentIndex={currentPriceIndex} priceStats={displayStats}
                    t={translate} language={language} unit={currency}
                  />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:col-span-2 lg:grid-cols-2">
                <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3 sm:gap-2 sm:rounded-3xl sm:p-8 lg:col-span-2">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--accent-color)] uppercase sm:text-xs">{translate('power.avg')}</p>
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <span className="text-2xl leading-none font-light text-[var(--accent-color)] italic sm:text-6xl">{displayStats.avg.toFixed(2)}</span>
                    <span className="text-[10px] font-medium text-[var(--text-muted)] sm:text-xl">{currency}</span>
                  </div>
                </div>
                <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3 sm:rounded-3xl sm:p-6">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--status-success-fg)] uppercase sm:text-xs">{translate('power.low')}</p>
                  <p className="text-2xl font-light text-[var(--text-primary)] sm:text-3xl">{displayStats.min.toFixed(2)}</p>
                </div>
                <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3 sm:rounded-3xl sm:p-6">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--status-error-fg)] uppercase sm:text-xs">{translate('power.high')}</p>
                  <p className="text-2xl font-light text-[var(--text-primary)] sm:text-3xl">{displayStats.max.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Automatisierung ── */}
          {tab === 'automatisierung' && (
            <div className="flex flex-col gap-4 font-sans">
              {/* Simulation label */}
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-3 py-1 text-[9px] font-bold tracking-widest uppercase"
                  style={{ backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
                  Simulation
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">— kein Eingriff am Wechselrichter</span>
              </div>

              {/* Status + Ersparnis 4ct */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="flex-1"><SimStatusBadge raw={simStatusRaw} /></div>
                <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3 sm:w-40 sm:rounded-3xl sm:p-5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">4 ct · Ersparnis</p>
                    <StateChip state={sim4ctState} small />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-light leading-none"
                      style={{ color: sim4ctData.ersparnis == null ? 'var(--text-muted)' : sim4ctData.ersparnis >= 0 ? '#4ade80' : '#f87171' }}>
                      {sim4ctData.ersparnis != null ? `${sim4ctData.ersparnis >= 0 ? '+' : ''}${sim4ctData.ersparnis.toFixed(2)}` : '—'}
                    </span>
                    {sim4ctData.ersparnis != null && <span className="text-sm text-[var(--text-muted)]">€</span>}
                  </div>
                </div>
              </div>

              {/* Speicher-Vergleich */}
              <SpeicherVergleich entities={entities} />

              {/* Varianten-Vergleich */}
              <div>
                <p className="mb-2 text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">Varianten-Vergleich</p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {SIM_VARIANTS.map(v => (
                    <VariantCard key={v.key} variant={v} entities={entities} statusRaw={simStatusRaw} />
                  ))}
                </div>
              </div>

              {/* Vorgangsliste */}
              <Vorgangsliste entities={entities} conn={conn} />

              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                Läuft seit 09.10.2026 — belastbare Zahlen ab ca. November (weniger PV).
              </p>
            </div>
          )}
        </>
      )}
    </AccessibleModalShell>
  );
}
