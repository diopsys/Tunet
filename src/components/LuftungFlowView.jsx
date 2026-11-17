import { memo } from 'react';
import { LUFTUNGSANLAGE_ENTITY_IDS as E } from './cards/GenericLuftungsanlageCard';

// Animiertes Schema der Lüftungsanlage (Blauberg S21) im Stil des Wärmepumpen-Hydraulikschemas:
// Außenluft → Filter → Wärmetauscher → Zuluftventilator → Wohnräume, Abluft → Filter → Wärmetauscher →
// Fortluftventilator → außen. Farben nach Temperatur, Tempo nach Ventilatorleistung, Bypass als Umgehung.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, digits = 1) => (v == null ? '–' : v.toFixed(digits).replace('.', ','));
const deg = (v) => (v == null ? '–' : `${fmt(v)}\u202f°C`);

/** −10 °C blau … 25 °C rot */
function tempColor(t) {
  const k = t == null ? 0.5 : clamp((t + 10) / 35, 0, 1);
  const a = [78, 168, 255];
  const b = [255, 106, 77];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`;
}

// Leitungen (viewBox 480 × 340)
const SUPPLY_IN = 'M96 74H150L240 170';
const SUPPLY_OUT = 'M240 170L330 74H384';
const BYPASS = 'M150 74Q240 34 330 74';
const EXHAUST_IN = 'M384 266H330L240 170';
const EXHAUST_OUT = 'M240 170L150 266H96';

function Tag({ x, y, w, label, value, warn }) {
  return (
    <g className="lft-tag">
      <rect x={x} y={y} width={w} height={36} rx={8} />
      <text className="lft-tl" x={x + 8} y={y + 14}>{label}</text>
      <text className="lft-tv" x={x + 8} y={y + 29} style={warn ? { fill: 'var(--lft-warn)' } : undefined}>{value}</text>
    </g>
  );
}

function Metric({ label, children, wide, text }) {
  return (
    <div className={`lft-metric ${wide ? 'lft-wide' : ''}`}>
      <div className="lft-metric-label">{label}</div>
      <div className={`lft-metric-value ${text ? '' : 'lft-mono'}`}>{children}</div>
    </div>
  );
}

function Fan({ cx, cy, rpm, on }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="19" className="lft-fan-ring" />
      <g
        className={`lft-spin ${on ? 'lft-go' : ''}`}
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box', animationDuration: on ? `${clamp(900 / rpm, 0.25, 3).toFixed(2)}s` : undefined }}
      >
        {[0, 90, 180, 270].map((r) => (
          <path
            key={r}
            d={`M${cx} ${cy}C${cx - 4} ${cy - 10} ${cx + 2} ${cy - 16} ${cx + 7} ${cy - 15}C${cx + 8} ${cy - 8} ${cx + 4} ${cy - 3} ${cx} ${cy}Z`}
            className="lft-blade"
            transform={`rotate(${r} ${cx} ${cy})`}
          />
        ))}
        <circle cx={cx} cy={cy} r="3.5" className="lft-hub" />
      </g>
    </g>
  );
}

function Filter({ x, y, warn }) {
  return (
    <g className={warn ? 'lft-filter-warn' : ''}>
      <rect x={x - 6} y={y - 16} width="12" height="32" rx="3" className="lft-filter" />
      {[-10, -4, 2, 8].map((dy) => (
        <path key={dy} d={`M${x - 6} ${y + dy}l12 4`} className="lft-filter-line" />
      ))}
    </g>
  );
}

function LuftungFlowView({ entities, isMobile = false, modeSrc, modeLvl }) {
  const val = (id) => {
    const v = parseFloat(entities?.[id]?.state);
    return Number.isFinite(v) ? v : null;
  };
  const climate = entities?.[E.climate];
  const hvac = climate?.state;
  const fanMode = climate?.attributes?.fan_mode;
  const aussen = val(E.aussenluft);
  const zuluft = val(E.zuluft);
  const abluft = val(E.abluft);
  const fortluft = val(E.fortluft);
  const bypassPct = val(E.bypass) ?? 0;
  const zuRpm = val(E.zuluftRpm) ?? 0;
  const abRpm = val(E.abluftRpm) ?? 0;
  const zuPct = val(E.zuluftLeistung);
  const abPct = val(E.abluftLeistung);
  const feuchte = val(E.luftfeuchtigkeit);
  const filterWarn = entities?.[E.filter]?.state === 'on';
  const kamin = entities?.[E.kaminmodus]?.state === 'on';
  const alarmEntity = entities?.[E.alarm];
  const alarmState = alarmEntity?.state;
  const alarmCodes = Array.isArray(alarmEntity?.attributes?.alarm_codes) ? alarmEntity.attributes.alarm_codes : [];
  const alarmText = alarmState === 'alarm' || alarmState === 'warning'
    ? `${alarmState === 'alarm' ? 'Alarm' : 'Warnung'}${alarmCodes.length ? ` · Code ${alarmCodes.join(', ')}` : ''}`
    : null;

  // Maßgeblich sind die Ventilatoren: im Kaminmodus meldet climate „off“, die Anlage läuft aber
  // mit eigenen Zu-/Abluftwerten (Überdruck) weiter.
  const supplyOn = zuRpm > 0;
  const exhaustOn = abRpm > 0;
  const running = supplyOn || exhaustOn;
  const bp = clamp(bypassPct / 100, 0, 1);
  const isBypass = bp > 0.01;

  let efficiency = null;
  if (!isBypass && aussen != null && zuluft != null && abluft != null && Math.abs(abluft - aussen) > 0.5) {
    efficiency = clamp(Math.round(((zuluft - aussen) / (abluft - aussen)) * 100), 0, 100);
  }
  const gain = aussen != null && zuluft != null ? zuluft - aussen : null;

  const dur = (pct, share = 1) => `${(1.7 - clamp(((pct ?? 50) / 100) * share, 0.1, 1) * 1.1).toFixed(2)}s`;
  const segment = (d, color, on, pct, share = 1, key) => (
    <g key={key || d} className={on && share > 0.01 ? 'lft-on' : ''} style={{ '--share': Math.max(0.25, share).toFixed(2), '--dur': dur(pct, share) }}>
      <path className="lft-pipe" d={d} />
      <path className="lft-glow" d={d} style={{ stroke: color }} />
      <path className="lft-flow" d={d} style={{ stroke: color }} />
    </g>
  );

  const hvacOn = hvac != null && hvac !== 'off';
  const stageText = !running
    ? 'Aus'
    : kamin
      ? 'Kaminmodus'
      : !hvacOn
        ? 'Läuft'
        : modeLvl || (fanMode ? fanMode[0].toUpperCase() + fanMode.slice(1) : 'An');
  const stageSub = kamin && running ? `Zuluft ${Math.round(zuPct ?? 0)} % · Abluft ${Math.round(abPct ?? 0)} %` : modeSrc;
  const stateColor = kamin ? '#f97316' : running ? 'var(--lft-ok)' : 'var(--text-muted)';
  const levels = ['low', 'medium', 'high'];
  const level = running && hvacOn && !kamin ? levels.indexOf(fanMode) + 1 : 0;

  return (
    <div className={`lft-root ${isMobile ? 'lft-mobile' : ''}`}>
      <style>{CSS}</style>
      <div className="lft-card lft-schema">
        <svg viewBox="0 0 480 340" role="img" aria-label="Schema Lüftungsanlage">
          <defs>
            <pattern id="lft-plates" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M0 4H8" stroke="var(--lft-pipe)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Außen / Fortluft */}
          <rect className="lft-box" x="6" y="34" width="90" height="80" rx="14" />
          <text className="lft-lbl" x="18" y="56">Außenluft</text>
          <text className="lft-big" x="18" y="84" style={{ fill: tempColor(aussen) }}>{deg(aussen)}</text>
          <rect className="lft-box" x="6" y="226" width="90" height="80" rx="14" />
          <text className="lft-lbl" x="18" y="248">Fortluft</text>
          <text className="lft-big" x="18" y="276" style={{ fill: tempColor(fortluft) }}>{deg(fortluft)}</text>

          {/* Wohnräume */}
          <rect className="lft-box" x="384" y="34" width="90" height="80" rx="14" />
          <text className="lft-lbl" x="396" y="56">Zuluft</text>
          <text className="lft-big" x="396" y="84" style={{ fill: tempColor(zuluft) }}>{deg(zuluft)}</text>
          <rect className="lft-box" x="384" y="226" width="90" height="80" rx="14" />
          <text className="lft-lbl" x="396" y="248">Abluft</text>
          <text className="lft-big" x="396" y="276" style={{ fill: tempColor(abluft) }}>{deg(abluft)}</text>
          <path d="M415 166l14-12 14 12v18h-28z" className="lft-house" />
          <text className="lft-lbl lft-lbl-plain" x="429" y="202" textAnchor="middle">Wohnräume</text>

          {/* Gerät */}
          <rect x="108" y="16" width="264" height="308" rx="22" className="lft-unit" />
          <text className="lft-lbl" x="240" y="312" textAnchor="middle">Blauberg S21</text>

          {/* Leitungen */}
          {segment(SUPPLY_IN, tempColor(aussen), supplyOn, zuPct, 1 - bp)}
          {segment(SUPPLY_OUT, tempColor(zuluft), supplyOn, zuPct, 1)}
          {segment(BYPASS, tempColor(aussen), supplyOn && isBypass, zuPct, bp)}
          {segment(EXHAUST_IN, tempColor(abluft), exhaustOn, abPct, 1)}
          {segment(EXHAUST_OUT, tempColor(fortluft), exhaustOn, abPct, 1)}

          {/* Wärmetauscher */}
          <g className={supplyOn && exhaustOn && !isBypass ? 'lft-xchg-on' : ''}>
            <path d="M240 112L298 170L240 228L182 170Z" className="lft-xchg" />
            <path d="M240 112L298 170L240 228L182 170Z" fill="url(#lft-plates)" opacity=".7" />
            <g className="lft-heat">
              {[[210, 0], [258, 0.5], [210, 1], [258, 1.5]].map(([x, delay], i) => (
                <path key={i} d={`M${x} 200l6-8 6 8`} className="lft-heat-arrow" style={{ animationDelay: `${delay}s` }} />
              ))}
            </g>
          </g>
          <text className="lft-tl lft-halo" x="240" y="164" textAnchor="middle">{isBypass ? 'Bypass' : 'WRG'}</text>
          <text className="lft-tv lft-halo" x="240" y="182" textAnchor="middle">
            {isBypass ? `${Math.round(bypassPct)} %` : efficiency != null && running ? `${efficiency} %` : '–'}
          </text>

          {/* Filter & Ventilatoren */}
          <Filter x={128} y={74} warn={filterWarn} />
          <Filter x={354} y={266} warn={filterWarn} />
          <Fan cx={352} cy={74} rpm={zuRpm} on={supplyOn} />
          <Fan cx={128} cy={266} rpm={abRpm} on={exhaustOn} />

          <Tag x={308} y={102} w={60} label="Zuluft" value={supplyOn ? `${Math.round(zuPct ?? 0)} %` : 'aus'} />
          <Tag x={112} y={202} w={60} label="Abluft" value={exhaustOn ? `${Math.round(abPct ?? 0)} %` : 'aus'} />
          <Tag x={112} y={100} w={58} label="Filter" value={filterWarn ? 'Wechsel' : 'OK'} warn={filterWarn} />

          {kamin && (
            <g className="lft-badge">
              <rect x="182" y="246" width="116" height="24" rx="12" />
              <text x="240" y="262" textAnchor="middle">🔥 KAMINMODUS</text>
            </g>
          )}
        </svg>
      </div>

      <div className="lft-card lft-metrics">
        <Metric label="Stufe" wide text>
          <span className="lft-state">
            <span className="lft-dot" style={{ background: stateColor, boxShadow: `0 0 10px ${stateColor}` }} />
            {stageText}
            <span className="lft-levels" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= level ? 'lft-level-on' : ''} />
              ))}
            </span>
          </span>
          {stageSub && stageSub !== '—' && <span className="lft-sub">{stageSub}</span>}
        </Metric>
        <Metric label="Wirkungsgrad">
          {efficiency != null && running ? efficiency : '–'}
          <small>%</small>
        </Metric>
        <Metric label="Wärmegewinn">
          {gain != null && running ? `${gain >= 0 ? '+' : ''}${fmt(gain)}` : '–'}
          <small>K</small>
        </Metric>
        <Metric label="Ventilatoren">
          {running ? `${Math.round(zuRpm)}/${Math.round(abRpm)}` : '–'}
          <small>rpm</small>
        </Metric>
        <Metric label="Luftfeuchte">
          {fmt(feuchte, 0)}
          <small>%</small>
        </Metric>
        <Metric label="Bypass">
          {Math.round(bypassPct)}
          <small>%</small>
        </Metric>
        <Metric label="Filter" text>
          <span style={{ color: filterWarn ? 'var(--lft-warn)' : undefined }}>{filterWarn ? 'Wechseln' : 'OK'}</span>
        </Metric>
        {alarmText && (
          <Metric label="Gerätemeldung" wide text>
            <span style={{ color: alarmState === 'alarm' ? '#f87171' : 'var(--lft-warn)' }}>{alarmText}</span>
          </Metric>
        )}
      </div>
    </div>
  );
}

const CSS = `
.lft-root{--lft-ok:#4ade80;--lft-warn:#fb923c;--lft-dim:rgba(127,140,163,.45);--lft-pipe:rgba(127,140,163,.22);display:grid;gap:14px}
.lft-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:24px}
.lft-schema svg{display:block;width:100%;height:auto}
.lft-metrics{padding:14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.lft-mobile .lft-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:640px){.lft-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
.lft-metric{border:1px solid var(--glass-border);border-radius:14px;padding:10px 12px;min-width:0}
.lft-wide{grid-column:span 2}
.lft-metric-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
.lft-metric-value{font-size:19px;font-weight:600;margin-top:4px;color:var(--text-primary);font-variant-numeric:tabular-nums}
.lft-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
.lft-mobile .lft-metric-value{font-size:17px}
.lft-metric-value small{font-size:12px;color:var(--text-secondary);font-weight:400;margin-left:3px}
.lft-state{display:flex;align-items:center;gap:8px;font-size:16px}
.lft-sub{display:block;margin-top:2px;font-size:12px;font-weight:500;color:var(--text-secondary)}
.lft-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.lft-levels{display:flex;gap:3px;margin-left:auto}
.lft-levels i{width:6px;height:14px;border-radius:3px;background:var(--glass-border);display:block}
.lft-levels i.lft-level-on{background:#38bdf8;box-shadow:0 0 6px #38bdf8}
.lft-root .lft-box{fill:var(--glass-bg);stroke:var(--glass-border);stroke-width:1.5}
.lft-root .lft-unit{fill:none;stroke:var(--glass-border);stroke-width:1.5;stroke-dasharray:6 6}
.lft-root .lft-house{fill:none;stroke:var(--text-secondary);stroke-width:1.5;stroke-linejoin:round;opacity:.6}
.lft-root .lft-lbl{fill:var(--text-secondary);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase}
.lft-root .lft-lbl-plain{letter-spacing:.04em;text-transform:none;font-size:11px}
.lft-root .lft-big{font-size:17px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lft-root .lft-tag rect{fill:var(--glass-bg);stroke:var(--glass-border)}
.lft-root .lft-tl{fill:var(--text-secondary);font-size:8.5px;letter-spacing:.06em;text-transform:uppercase}
.lft-root .lft-tv{fill:var(--text-primary);font-size:13px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lft-root .lft-pipe{fill:none;stroke:var(--lft-pipe);stroke-width:12;stroke-linecap:round;stroke-linejoin:round}
.lft-root .lft-glow{fill:none;stroke-width:12;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .5s,stroke .8s}
.lft-root .lft-flow{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:.1 14;opacity:0;transition:opacity .5s,stroke .8s}
.lft-root .lft-on .lft-glow{opacity:calc(.25 * var(--share,1))}
.lft-root .lft-on .lft-flow{opacity:var(--share,1);animation:lft-flow var(--dur,1s) linear infinite}
@keyframes lft-flow{to{stroke-dashoffset:-14.1}}
.lft-root .lft-xchg{fill:var(--card-bg);stroke:var(--lft-dim);stroke-width:2}
.lft-root .lft-halo{paint-order:stroke;stroke:var(--card-bg);stroke-width:5px;stroke-linejoin:round}
.lft-root .lft-heat{opacity:0;transition:opacity .5s}
.lft-root .lft-xchg-on .lft-heat{opacity:1}
.lft-root .lft-xchg-on .lft-xchg{stroke:#f59e0b;filter:drop-shadow(0 0 6px rgba(245,158,11,.45))}
.lft-root .lft-heat-arrow{fill:none;stroke:#f59e0b;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;animation:lft-rise 2s ease-in infinite}
@keyframes lft-rise{from{transform:translateY(0);opacity:0}30%{opacity:.9}to{transform:translateY(-52px);opacity:0}}
.lft-root .lft-fan-ring{fill:var(--card-bg);stroke:var(--glass-border);stroke-width:2}
.lft-root .lft-blade{fill:var(--text-secondary);opacity:.75}
.lft-root .lft-hub{fill:var(--text-secondary)}
.lft-root .lft-spin{animation:lft-rot 1s linear infinite;animation-play-state:paused}
.lft-root .lft-spin.lft-go{animation-play-state:running}
@keyframes lft-rot{to{transform:rotate(360deg)}}
.lft-root .lft-filter{fill:var(--card-bg);stroke:var(--lft-dim);stroke-width:1.5}
.lft-root .lft-filter-line{stroke:var(--lft-dim);stroke-width:1}
.lft-root .lft-filter-warn .lft-filter{stroke:var(--lft-warn);animation:lft-pulse 1.4s ease-in-out infinite alternate}
@keyframes lft-pulse{from{opacity:.5}to{opacity:1}}
.lft-root .lft-badge rect{fill:var(--card-bg);stroke:#f97316;stroke-width:1.5}
.lft-root .lft-badge text{fill:#f97316;font-size:10.5px;font-weight:600;letter-spacing:.1em}
.lft-root .lft-badge{animation:lft-pulse 1.6s ease-in-out infinite alternate}
@media (prefers-reduced-motion:reduce){.lft-root .lft-on .lft-flow,.lft-root .lft-spin,.lft-root .lft-heat-arrow,.lft-root .lft-badge{animation:none}}
`;

export default memo(LuftungFlowView);
