import { memo } from 'react';
import { qualityColor, qualityLabel } from '../utils/lueftungLogic';

// Luftqualitäts-Ansicht der Lüftung: je Etage CO₂-Ring mit den Schwellen der Automation, Feuchte und
// PM2.5 als Balken mit Komfortbereich, dazu ein gemeinsamer 24-h-Verlauf beider CO₂-Sensoren.

const C = { eg: '#38bdf8', og: '#c084fc', ok: '#4ade80', warn: '#fb923c', bad: '#f87171' };
const WHO_PM25 = 15; // WHO-Richtwert 24-h-Mittel (2021)
const COMFORT = [40, 60];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, digits = 0) => (v == null ? '–' : v.toFixed(digits).replace('.', ','));

function co2State(ppm, th) {
  if (ppm == null) return { label: '–', color: 'var(--text-muted)' };
  if (ppm < th.co2Aus) return { label: 'Frisch', color: C.ok };
  if (ppm < th.co2LowEin) return { label: 'Gut', color: C.ok };
  if (ppm < th.co2Schwelle) return { label: 'Erhöht', color: C.warn };
  return { label: 'Schlecht', color: C.bad };
}

function co2Hint(ppm, th) {
  if (ppm == null) return null;
  if (ppm < th.co2LowEin) return `noch ${Math.round(th.co2LowEin - ppm)} ppm bis Lüftung Low`;
  if (ppm < th.co2Schwelle) return `noch ${Math.round(th.co2Schwelle - ppm)} ppm bis Medium`;
  return 'über der Luftqualitäts-Schwelle → Medium';
}

/* ── CO₂-Ring ─────────────────────────────────────────────────────────── */

const RING = { cx: 80, cy: 80, r: 62, start: 135, sweep: 270, min: 400, max: 1600 };
const ringPoint = (deg, r = RING.r) => {
  const a = (deg * Math.PI) / 180;
  return [RING.cx + r * Math.cos(a), RING.cy + r * Math.sin(a)];
};
const ringDeg = (ppm) => RING.start + clamp((ppm - RING.min) / (RING.max - RING.min), 0, 1) * RING.sweep;
const ARC_LEN = (2 * Math.PI * RING.r * RING.sweep) / 360;
const arcD = (() => {
  const [x1, y1] = ringPoint(RING.start);
  const [x2, y2] = ringPoint(RING.start + RING.sweep);
  return `M${x1} ${y1}A${RING.r} ${RING.r} 0 1 1 ${x2} ${y2}`;
})();

function Co2Ring({ ppm, th, color }) {
  const frac = ppm == null ? 0 : clamp((ppm - RING.min) / (RING.max - RING.min), 0, 1);
  const ticks = [
    { v: th.co2Aus, c: C.ok },
    { v: th.co2LowEin, c: C.warn },
    { v: th.co2Schwelle, c: C.bad },
  ];
  return (
    <svg viewBox="0 0 160 150" className="aq-ring" role="img" aria-label={`CO₂ ${fmt(ppm)} ppm`}>
      <path d={arcD} className="aq-ring-track" />
      <path d={arcD} className="aq-ring-val" style={{ stroke: color, color, strokeDasharray: ARC_LEN, strokeDashoffset: ARC_LEN * (1 - frac), '--len': ARC_LEN }} />
      {ticks.map((t) => {
        const d = ringDeg(t.v);
        const [x1, y1] = ringPoint(d, RING.r - 11);
        const [x2, y2] = ringPoint(d, RING.r + 11);
        return <line key={t.v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.c} strokeWidth="2.5" strokeLinecap="round" />;
      })}
      <text x="80" y="78" textAnchor="middle" className="aq-ring-num" style={{ fill: color }}>{fmt(ppm)}</text>
      <text x="80" y="96" textAnchor="middle" className="aq-ring-unit">ppm CO₂</text>
      <text x="26" y="142" textAnchor="middle" className="aq-ring-scale">{RING.min}</text>
      <text x="134" y="142" textAnchor="middle" className="aq-ring-scale">{RING.max}</text>
    </svg>
  );
}

/* ── Balken mit Zonen ─────────────────────────────────────────────────── */

function ZoneBar({ label, value, unit, digits = 0, min, max, zone, zoneLabel, marks = [], color }) {
  const pct = (v) => clamp(((v - min) / (max - min)) * 100, 0, 100);
  return (
    <div className="aq-bar">
      <div className="aq-bar-head">
        <span className="aq-bar-label">{label}</span>
        <span className="aq-bar-value" style={{ color }}>
          {fmt(value, digits)}
          <small>{unit}</small>
        </span>
      </div>
      <div className="aq-bar-track">
        {zone && <div className="aq-bar-zone" style={{ left: `${pct(zone[0])}%`, width: `${pct(zone[1]) - pct(zone[0])}%` }} title={zoneLabel} />}
        {marks.map((m) => (
          <div key={m.label} className="aq-bar-mark" style={{ left: `${pct(m.value)}%`, background: m.color }} title={`${m.label} ${m.value}`} />
        ))}
        {value != null && <div className="aq-bar-dot" style={{ left: `${pct(value)}%`, background: color, boxShadow: `0 0 10px ${color}` }} />}
      </div>
      <div className="aq-bar-legend">
        {zoneLabel && <span><i className="aq-swatch aq-swatch-zone" />{zoneLabel}</span>}
        {marks.map((m) => (
          <span key={m.label}><i className="aq-swatch" style={{ background: m.color }} />{m.label} {fmt(m.value)}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Etagen-Karte ─────────────────────────────────────────────────────── */

function FloorCard({ floor, th }) {
  const state = co2State(floor.co2, th);
  const hint = co2Hint(floor.co2, th);
  const humColor = floor.feuchte == null ? 'var(--text-muted)' : floor.feuchte >= th.feuchteSchwelle ? C.bad : floor.feuchte < COMFORT[0] || floor.feuchte > COMFORT[1] ? C.warn : C.ok;
  const pmColor = floor.pm25 == null ? 'var(--text-muted)' : floor.pm25 >= th.pm25Schwelle ? C.bad : floor.pm25 > WHO_PM25 ? C.warn : C.ok;
  const quality = qualityLabel(floor.quality);
  return (
    <section className={`aq-card aq-floor ${floor.leads ? 'aq-leads' : ''}`} style={{ '--floor': floor.color }}>
      <header className="aq-floor-head">
        <span className="aq-floor-name"><i style={{ background: floor.color }} />{floor.label}</span>
        {floor.temp != null && <span className="aq-floor-temp">{fmt(floor.temp, 1)} °C</span>}
        {floor.leads && <span className="aq-chip aq-chip-lead">führt</span>}
        {quality && (
          <span className="aq-chip" style={{ color: qualityColor(floor.quality), borderColor: 'currentColor' }}>
            Sensor: {quality}
          </span>
        )}
      </header>
      <div className="aq-floor-body">
        <div className="aq-ring-wrap">
          <Co2Ring ppm={floor.co2} th={th} color={state.color} />
          <div className="aq-ring-state" style={{ color: state.color }}>{state.label}</div>
        </div>
        <div className="aq-bars">
          <ZoneBar
            label="Luftfeuchte"
            value={floor.feuchte}
            unit="%"
            min={20}
            max={80}
            zone={COMFORT}
            zoneLabel="Komfort 40–60"
            marks={[{ label: 'Schwelle', value: th.feuchteSchwelle, color: C.bad }]}
            color={humColor}
          />
          <ZoneBar
            label="Feinstaub PM2.5"
            value={floor.pm25}
            unit="µg/m³"
            digits={1}
            min={0}
            max={Math.max(50, th.pm25Schwelle * 1.6)}
            marks={[
              { label: 'WHO', value: WHO_PM25, color: C.warn },
              { label: 'Schwelle', value: th.pm25Schwelle, color: C.bad },
            ]}
            color={pmColor}
          />
        </div>
      </div>
      {hint && <p className="aq-hint">{hint}</p>}
    </section>
  );
}

/* ── 24-h-Verlauf ─────────────────────────────────────────────────────── */

const CH = { w: 600, h: 200, l: 64, r: 12, t: 12, b: 24 };

function downsample(data, n = 160) {
  if (!Array.isArray(data) || data.length <= n) return data || [];
  const step = data.length / n;
  return Array.from({ length: n }, (_, i) => data[Math.floor(i * step)]).concat(data[data.length - 1]);
}

function stats(data) {
  if (!data?.length) return null;
  const v = data.map((d) => d.value);
  return { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length };
}

function Co2Chart({ series, th, loading }) {
  const now = Date.now();
  const from = now - 24 * 3600_000;
  const all = series.flatMap((s) => s.data);
  const hasData = series.some((s) => s.data.length > 1);
  const maxV = Math.max(th.co2Schwelle + 200, ...all.map((d) => d.value));
  const minV = Math.min(400, ...all.map((d) => d.value));
  const gw = CH.w - CH.l - CH.r;
  const gh = CH.h - CH.t - CH.b;
  const x = (t) => CH.l + clamp((t - from) / (now - from), 0, 1) * gw;
  const y = (v) => CH.t + gh - ((v - minV) / (maxV - minV)) * gh;
  const band = (lo, hi, color) => <rect x={CH.l} width={gw} y={y(Math.min(hi, maxV))} height={Math.max(0, y(Math.max(lo, minV)) - y(Math.min(hi, maxV)))} fill={color} opacity=".09" />;
  const hours = [0, 6, 12, 18, 24].map((h) => from + h * 3600_000);
  const lines = series
    .map((s) => {
      const pts = downsample(s.data.filter((d) => d.time.getTime() >= from));
      if (pts.length < 2) return null;
      const last = pts[pts.length - 1];
      return {
        key: s.key,
        color: s.color,
        d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.time.getTime()).toFixed(1)} ${y(p.value).toFixed(1)}`).join(''),
        firstX: x(pts[0].time.getTime()),
        lastX: x(last.time.getTime()),
        lastY: y(last.value),
      };
    })
    .filter(Boolean);

  return (
    <section className="aq-card aq-chart">
      <header className="aq-chart-head">
        <span className="aq-title">CO₂ · letzte 24 h</span>
        <span className="aq-legend">
          {series.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </span>
      </header>
      {loading ? (
        <div className="aq-empty"><span className="aq-spinner" /></div>
      ) : !hasData ? (
        <div className="aq-empty">Keine Verlaufsdaten</div>
      ) : (
        <div className="aq-chart-box">
          <svg viewBox={`0 0 ${CH.w} ${CH.h}`} className="aq-chart-svg" preserveAspectRatio="none">
            {band(minV, th.co2LowEin, C.ok)}
            {band(th.co2LowEin, th.co2Schwelle, C.warn)}
            {band(th.co2Schwelle, maxV, C.bad)}
            {[th.co2Aus, th.co2LowEin, th.co2Schwelle].map((v, i) => (
              <line key={v} x1={CH.l} x2={CH.w - CH.r} y1={y(v)} y2={y(v)} stroke={[C.ok, C.warn, C.bad][i]} strokeOpacity=".5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            ))}
            {lines.map((l) => (
              <g key={l.key}>
                <path d={`${l.d}L${l.lastX} ${CH.t + gh}L${l.firstX} ${CH.t + gh}Z`} fill={l.color} opacity=".08" />
                <path d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="aq-line" />
              </g>
            ))}
          </svg>
          {[th.co2Aus, th.co2LowEin, th.co2Schwelle].map((v) => (
            <span key={v} className="aq-axis aq-axis-y" style={{ top: `${(y(v) / CH.h) * 100}%`, width: `${((CH.l - 6) / CH.w) * 100}%` }}>{v}</span>
          ))}
          {hours.map((t, i) => (
            <span
              key={t}
              className="aq-axis aq-axis-x"
              style={{ left: `${(x(t) / CH.w) * 100}%`, transform: `translateX(${i === 0 ? '0' : i === 4 ? '-100%' : '-50%'})` }}
            >
              {i === 4 ? 'jetzt' : new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ))}
          {lines.map((l) => (
            <span key={l.key} className="aq-dot aq-pulse" style={{ left: `${(l.lastX / CH.w) * 100}%`, top: `${(l.lastY / CH.h) * 100}%`, background: l.color, boxShadow: `0 0 8px ${l.color}` }} />
          ))}
        </div>
      )}
      {hasData && !loading && (
        <div className="aq-stats">
          {series.map((s) => {
            const st = stats(s.data);
            return st ? (
              <div key={s.key} className="aq-stat">
                <span className="aq-stat-name"><i style={{ background: s.color }} />{s.label}</span>
                <span>Min <b>{fmt(st.min)}</b></span>
                <span>Ø <b>{fmt(st.avg)}</b></span>
                <span>Max <b>{fmt(st.max)}</b></span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}

/* ── Ansicht ──────────────────────────────────────────────────────────── */

function LuftqualitaetView({ floors, th, history, historyLoading, co, isMobile = false }) {
  const coColor = co == null ? 'var(--text-muted)' : co >= 50 ? C.bad : co >= 10 ? C.warn : C.ok;
  const coText = co == null ? '–' : co >= 50 ? 'Gefahr – lüften, Raum verlassen' : co >= 10 ? 'erhöht – Kamin prüfen' : 'unbedenklich';
  return (
    <div className={`aq-root ${isMobile ? 'aq-mobile' : ''}`}>
      <style>{CSS}</style>
      <div className="aq-floors">
        {floors.map((f) => (
          <FloorCard key={f.key} floor={f} th={th} />
        ))}
      </div>
      <Co2Chart
        series={floors.map((f) => ({ key: f.key, label: f.label, color: f.color, data: history[f.key] || [] }))}
        th={th}
        loading={historyLoading}
      />
      {co != null && (
        <section className="aq-card aq-co">
          <span className="aq-co-icon" style={{ color: coColor, borderColor: coColor }}>CO</span>
          <div className="aq-co-text">
            <span className="aq-title">CO-Melder</span>
            <span style={{ color: coColor }}>{coText}</span>
          </div>
          <span className="aq-co-value" style={{ color: coColor }}>
            {fmt(co)}
            <small>ppm</small>
          </span>
        </section>
      )}
    </div>
  );
}

export { C as AQ_COLORS };

const CSS = `
.aq-root{display:grid;gap:14px;font-variant-numeric:tabular-nums}
.aq-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:24px;padding:16px}
.aq-floors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.aq-mobile .aq-floors{grid-template-columns:minmax(0,1fr)}
@media (max-width:720px){.aq-floors{grid-template-columns:minmax(0,1fr)}}
.aq-floor{display:flex;flex-direction:column;gap:10px;transition:border-color .4s,box-shadow .4s}
.aq-leads{border-color:color-mix(in srgb,var(--floor) 55%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--floor) 25%,transparent),0 8px 30px -12px var(--floor)}
.aq-floor-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.aq-floor-name{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-primary)}
.aq-floor-name i{width:8px;height:8px;border-radius:50%;display:block}
.aq-floor-temp{font-size:12px;color:var(--text-secondary)}
.aq-chip{margin-left:auto;font-size:10.5px;font-weight:600;border:1px solid var(--glass-border);border-radius:999px;padding:2px 9px;letter-spacing:.04em}
.aq-chip-lead{margin-left:0;color:var(--floor);border-color:var(--floor);text-transform:uppercase;letter-spacing:.12em}
.aq-chip-lead+.aq-chip{margin-left:auto}
.aq-floor-body{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;align-items:center}
.aq-ring-wrap{display:flex;flex-direction:column;align-items:center;margin-top:-4px}
.aq-ring{width:150px;height:auto;display:block}
.aq-ring-track{fill:none;stroke:var(--glass-border);stroke-width:12;stroke-linecap:round}
.aq-ring-val{fill:none;stroke-width:12;stroke-linecap:round;transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1),stroke .6s;filter:drop-shadow(0 0 6px currentColor);animation:aq-ring-in 1.4s cubic-bezier(.2,.8,.2,1)}
@keyframes aq-ring-in{from{stroke-dashoffset:var(--len)}}
.aq-ring-num{font-size:30px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.aq-ring-unit{fill:var(--text-secondary);font-size:10px;letter-spacing:.08em}
.aq-ring-scale{fill:var(--text-muted);font-size:9px}
.aq-ring-state{margin-top:-14px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.aq-bars{display:grid;gap:14px;min-width:0}
.aq-bar-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.aq-bar-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
.aq-bar-value{font-size:18px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.aq-bar-value small{font-size:11px;font-weight:400;color:var(--text-secondary);margin-left:3px}
.aq-bar-track{position:relative;height:8px;margin-top:6px;border-radius:999px;background:var(--glass-border)}
.aq-bar-zone{position:absolute;top:0;bottom:0;border-radius:999px;background:rgba(74,222,128,.28)}
.aq-bar-mark{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:2px;transform:translateX(-1px)}
.aq-bar-dot{position:absolute;top:50%;width:14px;height:14px;border-radius:50%;border:2px solid var(--card-bg);transform:translate(-50%,-50%);transition:left 1s cubic-bezier(.2,.8,.2,1)}
.aq-bar-legend{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:10.5px;color:var(--text-muted)}
.aq-bar-legend span{display:flex;align-items:center;gap:4px}
.aq-swatch{width:8px;height:8px;border-radius:2px;display:inline-block}
.aq-swatch-zone{background:rgba(74,222,128,.45)}
.aq-hint{margin:0;font-size:12px;color:var(--text-secondary);border-top:1px solid var(--glass-border);padding-top:10px}
.aq-chart-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.aq-title{font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted)}
.aq-legend{display:flex;gap:12px;font-size:12px;color:var(--text-secondary)}
.aq-legend span,.aq-stat-name{display:flex;align-items:center;gap:6px}
.aq-legend i,.aq-stat-name i{width:14px;height:3px;border-radius:2px;display:block}
.aq-chart-box{position:relative;height:200px}
.aq-mobile .aq-chart-box{height:170px}
.aq-chart-svg{display:block;width:100%;height:100%}
.aq-axis-y{position:absolute;left:0;text-align:right;transform:translateY(-50%);line-height:1}
.aq-axis-x{position:absolute;bottom:0;line-height:1;white-space:nowrap}
.aq-dot{position:absolute;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%)}
.aq-axis{color:var(--text-muted);font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.aq-line{stroke-dasharray:3000;stroke-dashoffset:3000;animation:aq-draw 1.6s ease-out forwards}
@keyframes aq-draw{to{stroke-dashoffset:0}}
.aq-pulse{animation:aq-pulse 1.8s ease-in-out infinite}
@keyframes aq-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.aq-empty{height:160px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)}
.aq-spinner{width:22px;height:22px;border-radius:50%;border:2px solid var(--glass-border);border-top-color:${C.eg};animation:aq-spin .9s linear infinite}
@keyframes aq-spin{to{transform:rotate(360deg)}}
.aq-stats{display:grid;gap:6px;margin-top:10px;border-top:1px solid var(--glass-border);padding-top:10px}
.aq-stat{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--text-secondary)}
.aq-stat b{color:var(--text-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
.aq-stat-name{min-width:44px;font-weight:700;color:var(--text-primary)}
.aq-co{display:flex;align-items:center;gap:14px;padding:12px 16px}
.aq-co-icon{width:38px;height:38px;border-radius:12px;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.aq-co-text{display:flex;flex-direction:column;gap:2px;font-size:13px;min-width:0}
.aq-co-value{margin-left:auto;font-size:20px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.aq-co-value small{font-size:11px;font-weight:400;color:var(--text-secondary);margin-left:3px}
@media (max-width:420px){.aq-floor-body{grid-template-columns:120px minmax(0,1fr)}.aq-ring{width:120px}}
@media (prefers-reduced-motion:reduce){.aq-line,.aq-pulse,.aq-spinner,.aq-ring-val{animation:none}.aq-line{stroke-dashoffset:0}}
`;

export default memo(LuftqualitaetView);
