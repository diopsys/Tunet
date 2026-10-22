import { useState, useEffect } from 'react';
import { getHistory, getHistoryRest, canUseHistoryRest } from '../services/haClient';
import { Sun, X } from '../icons';
import { readPv, resolvePvIds, usePvPeriodTotals } from '../components/cards/GenericPvCard';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

const SOLAR_COLOR = '#fb923c';
const BATT_COLOR = '#f06292';
const GRID_COLOR = '#64b5f6';
const HOUSE_COLOR = '#81c784';
const ACCENT = SOLAR_COLOR;

function getBattSocColor(soc) {
  if (soc == null) return 'var(--text-muted)';
  if (soc >= 60) return '#4ade80';
  if (soc >= 30) return '#fb923c';
  return '#f87171';
}

// ─── SVG Power Flow Diagram ────────────────────────────────────────────────

// Animated dashed line — values="26;0" flows in drawing direction, "0;26" reverses
function AnimatedLine({ x1, y1, x2, y2, color, active, reverse = false }) {
  if (!active) {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" strokeOpacity="0.12" />;
  }
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color} strokeWidth="2.5" strokeOpacity="0.75" strokeDasharray="8 5">
      <animate attributeName="stroke-dashoffset" values={reverse ? '0;26' : '26;0'} dur="1.2s" repeatCount="indefinite" />
    </line>
  );
}

// Arrowhead placed at 58% along the line so it's clearly mid-line, not touching boxes
function MidArrow({ x1, y1, x2, y2, color, active }) {
  if (!active) return null;
  const mx = x1 + (x2 - x1) * 0.58;
  const my = y1 + (y2 - y1) * 0.58;
  const dx = x2 - x1, dy = y2 - y1;
  const s = 7;
  let pts;
  if (Math.abs(dy) > Math.abs(dx)) {
    pts = dy > 0
      ? `${mx},${my + s} ${mx - s * 0.55},${my - s * 0.45} ${mx + s * 0.55},${my - s * 0.45}`
      : `${mx},${my - s} ${mx - s * 0.55},${my + s * 0.45} ${mx + s * 0.55},${my + s * 0.45}`;
  } else {
    pts = dx > 0
      ? `${mx + s},${my} ${mx - s * 0.45},${my - s * 0.55} ${mx - s * 0.45},${my + s * 0.55}`
      : `${mx - s},${my} ${mx + s * 0.45},${my - s * 0.55} ${mx + s * 0.45},${my + s * 0.55}`;
  }
  return <polygon points={pts} fill={color} opacity="0.9" />;
}

// Battery icon with fill level + SOC% and optional charge indicator inside
function BatteryIcon({ x, y, w, h, soc, color, charging }) {
  const nibH = Math.round(h * 0.5);
  const nibY = y + (h - nibH) / 2;
  const innerW = w - 3;
  const fillW = soc != null ? Math.max(0, Math.min(innerW * soc / 100, innerW)) : 0;
  // Use white text when battery is more than 1/3 full (fill covers center), else use color
  const textFill = fillW > innerW / 3 ? 'white' : color;
  const label = soc != null
    ? `${soc.toFixed(0)}%${charging ? ' ⚡' : ''}`
    : '—';
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
      <rect x={x + w} y={nibY} width={4} height={nibH} rx="1" fill={color} opacity="0.45" />
      {soc != null && (
        <rect x={x + 1.5} y={y + 1.5} width={fillW} height={h - 3} rx="2" fill={color} opacity={charging ? 0.9 : 0.65} />
      )}
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill={textFill} opacity="0.95">
        {label}
      </text>
    </>
  );
}

// Returns "voll in Xh Ym" or "leer in Xh Ym" or null
function fmtBattTime(soc, maxKwh, powerW, charging) {
  if (soc == null || maxKwh == null || maxKwh <= 0 || !powerW || powerW < 10) return null;
  const powerKw = powerW / 1000;
  const hrs = charging
    ? (maxKwh * (1 - soc / 100)) / powerKw          // charge to 100%
    : (maxKwh * Math.max(0, soc - 10) / 100) / powerKw; // discharge to 10% min
  if (hrs <= 0 || hrs > 48) return null;
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  const time = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}min`;
  return `${charging ? 'voll' : 'leer'} in ${time}`;
}

function PowerFlowSvg({ pvW, houseW, heatPumpW, batteryInW, batteryOutW, gridImportW, gridExportW, batterySoc, batteryMaxEnergy, pvDaily }) {
  const solarActive = pvW != null && pvW > 10;
  const battCharge = batteryInW != null && batteryInW > 10;
  const battDischarge = !battCharge && batteryOutW != null && batteryOutW > 10;
  const gridExport = gridExportW != null && gridExportW > 10;
  const gridImport = !gridExport && gridImportW != null && gridImportW > 10;
  const houseActive = houseW != null && houseW > 10;

  const socColor = getBattSocColor(batterySoc);
  const fmt = (w) => w != null ? (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`) : '—';

  // Time to full / empty
  const battTimeStr = battCharge
    ? fmtBattTime(batterySoc, batteryMaxEnergy, batteryInW, true)
    : battDischarge
      ? fmtBattTime(batterySoc, batteryMaxEnergy, batteryOutW, false)
      : null;

  // Layout — viewBox 340 × 226
  // Middle row boxes h=58 so battery icon + time line fits cleanly
  const CX = 170;
  const SOLAR = { x: 120, y: 8,   w: 100, h: 44, cx: 170, cy: 30  };
  const BATT  = { x: 5,   y: 88,  w: 82,  h: 58, cx: 46,  cy: 117 };
  const INV   = { x: 130, y: 88,  w: 80,  h: 58, cx: 170, cy: 117 };
  const GRID  = { x: 253, y: 88,  w: 82,  h: 58, cx: 294, cy: 117 };
  const HOUSE = { x: 120, y: 172, w: 100, h: 44, cx: 170, cy: 194 };
  const WP    = { x: 253, y: 172, w: 82,  h: 44, cx: 294, cy: 194 };
  const wpActive = heatPumpW != null && heatPumpW > 10;
  const WP_COLOR = '#f472b6';

  // Battery icon: tall enough to fit SOC% inside, centered in upper part of BATT box
  const battIconW = 60, battIconH = 26;
  const battIconX = BATT.x + Math.round((BATT.w - battIconW) / 2);
  const battIconY = BATT.y + 14;

  return (
    <svg viewBox="0 0 340 226" className="w-full" style={{ fontFamily: 'inherit' }}>
      {/* ── Connecting lines + mid-arrows ── */}

      {/* Solar → Inverter (down) */}
      <AnimatedLine x1={CX} y1={SOLAR.y + SOLAR.h} x2={CX} y2={INV.y} color={SOLAR_COLOR} active={solarActive} />
      <MidArrow x1={CX} y1={SOLAR.y + SOLAR.h} x2={CX} y2={INV.y} color={SOLAR_COLOR} active={solarActive} />

      {/* Battery ↔ Inverter: line drawn left→right; charge = reverse */}
      <AnimatedLine
        x1={BATT.x + BATT.w} y1={INV.cy} x2={INV.x} y2={INV.cy}
        color={BATT_COLOR} active={battCharge || battDischarge} reverse={battCharge}
      />
      <MidArrow
        x1={battCharge ? INV.x : BATT.x + BATT.w} y1={INV.cy}
        x2={battCharge ? BATT.x + BATT.w : INV.x} y2={INV.cy}
        color={BATT_COLOR} active={battCharge || battDischarge}
      />
      {(battCharge || battDischarge) && (() => {
        const lx = Math.round((BATT.x + BATT.w + INV.x) / 2);
        const pw = fmt(battCharge ? batteryInW : batteryOutW);
        return (
          <>
            <rect x={lx - 18} y={INV.cy - 14} width={36} height={11} rx="3"
              fill="var(--card-bg)" opacity="0.85" />
            <text x={lx} y={INV.cy - 6} textAnchor="middle" fontSize="7.5" fontWeight="bold" fill={socColor}>
              {battCharge ? '+' : '−'}{pw}
            </text>
          </>
        );
      })()}

      {/* Inverter ↔ Grid: line drawn left→right; import = reverse */}
      <AnimatedLine
        x1={INV.x + INV.w} y1={INV.cy} x2={GRID.x} y2={INV.cy}
        color={GRID_COLOR} active={gridImport || gridExport} reverse={gridImport}
      />
      <MidArrow
        x1={gridExport ? INV.x + INV.w : GRID.x} y1={INV.cy}
        x2={gridExport ? GRID.x : INV.x + INV.w} y2={INV.cy}
        color={GRID_COLOR} active={gridImport || gridExport}
      />

      {/* Inverter → House (down) */}
      <AnimatedLine x1={CX} y1={INV.y + INV.h} x2={CX} y2={HOUSE.y} color={HOUSE_COLOR} active={houseActive} />
      <MidArrow x1={CX} y1={INV.y + INV.h} x2={CX} y2={HOUSE.y} color={HOUSE_COLOR} active={houseActive} />

      {/* ── Solar box ── */}
      <rect x={SOLAR.x} y={SOLAR.y} width={SOLAR.w} height={SOLAR.h} rx="8" fill="rgba(251,146,60,0.08)" stroke={SOLAR_COLOR} strokeWidth="1" strokeOpacity="0.5" />
      <text x={SOLAR.cx} y={SOLAR.y + 14} textAnchor="middle" fontSize="7" fontWeight="bold" fill={SOLAR_COLOR} letterSpacing="0.08em" opacity="0.7">SOLAR</text>
      <text x={SOLAR.cx} y={SOLAR.y + 30} textAnchor="middle" fontSize="14" fontWeight="300" fill={SOLAR_COLOR}>{fmt(pvW)}</text>
      {pvDaily != null && (
        <text x={SOLAR.cx} y={SOLAR.y + 42} textAnchor="middle" fontSize="7" fill={SOLAR_COLOR} opacity="0.5">{pvDaily.toFixed(1)} kWh heute</text>
      )}

      {/* ── Inverter box ── */}
      <rect x={INV.x} y={INV.y} width={INV.w} height={INV.h} rx="8" fill="var(--glass-bg)" stroke="var(--glass-border)" strokeWidth="1" />
      <text x={INV.cx} y={INV.y + 16} textAnchor="middle" fontSize="7" fontWeight="bold" fill="var(--text-secondary)" letterSpacing="0.08em" opacity="0.6">INVERTER</text>
      <text x={INV.cx} y={INV.y + 31} textAnchor="middle" fontSize="8" fill="var(--text-secondary)" opacity="0.5">SolarEdge</text>
      <text x={INV.cx} y={INV.y + 44} textAnchor="middle" fontSize="7" fill="var(--text-muted)" opacity="0.4">SE5K</text>

      {/* ── Battery box ── */}
      <rect x={BATT.x} y={BATT.y} width={BATT.w} height={BATT.h} rx="8" fill="rgba(240,98,146,0.08)" stroke={BATT_COLOR} strokeWidth="1" strokeOpacity="0.4" />
      <text x={BATT.cx} y={BATT.y + 12} textAnchor="middle" fontSize="7" fontWeight="bold" fill={BATT_COLOR} letterSpacing="0.08em" opacity="0.7">BATT</text>
      <BatteryIcon
        x={battIconX} y={battIconY} w={battIconW} h={battIconH}
        soc={batterySoc} color={socColor} charging={battCharge}
      />
      {battTimeStr && (
        <text x={BATT.cx} y={BATT.y + BATT.h - 6} textAnchor="middle" fontSize="7" fill={socColor} opacity="0.8">
          {battTimeStr}
        </text>
      )}

      {/* ── Grid box ── */}
      <rect x={GRID.x} y={GRID.y} width={GRID.w} height={GRID.h} rx="8" fill="rgba(100,181,246,0.08)" stroke={GRID_COLOR} strokeWidth="1" strokeOpacity="0.4" />
      <text x={GRID.cx} y={GRID.y + 14} textAnchor="middle" fontSize="7" fontWeight="bold" fill={GRID_COLOR} letterSpacing="0.08em" opacity="0.7">NETZ</text>
      <text x={GRID.cx} y={GRID.y + 32} textAnchor="middle" fontSize="13" fontWeight="300"
        fill={gridExport ? '#4ade80' : gridImport ? '#f87171' : 'var(--text-secondary)'}>
        {gridExport ? `+${fmt(gridExportW)}` : gridImport ? `-${fmt(gridImportW)}` : '0 W'}
      </text>
      <text x={GRID.cx} y={GRID.y + 46} textAnchor="middle" fontSize="7" fill={GRID_COLOR} opacity="0.5">
        {gridExport ? 'Einspeisung' : gridImport ? 'Bezug' : 'Ausgeglichen'}
      </text>

      {/* House → WP */}
      <AnimatedLine x1={HOUSE.x + HOUSE.w} y1={HOUSE.cy} x2={WP.x} y2={WP.cy} color={WP_COLOR} active={wpActive} />
      <MidArrow x1={HOUSE.x + HOUSE.w} y1={HOUSE.cy} x2={WP.x} y2={WP.cy} color={WP_COLOR} active={wpActive} />

      {/* ── House box ── */}
      <rect x={HOUSE.x} y={HOUSE.y} width={HOUSE.w} height={HOUSE.h} rx="8" fill="rgba(129,199,132,0.08)" stroke={HOUSE_COLOR} strokeWidth="1" strokeOpacity="0.4" />
      <text x={HOUSE.cx} y={HOUSE.y + 14} textAnchor="middle" fontSize="7" fontWeight="bold" fill={HOUSE_COLOR} letterSpacing="0.08em" opacity="0.7">HAUS</text>
      <text x={HOUSE.cx} y={HOUSE.y + 30} textAnchor="middle" fontSize="14" fontWeight="300" fill={HOUSE_COLOR}>{fmt(houseW)}</text>
      <text x={HOUSE.cx} y={HOUSE.y + 41} textAnchor="middle" fontSize="7" fill={HOUSE_COLOR} opacity="0.5">Verbrauch</text>

      {/* ── WP box ── */}
      <rect x={WP.x} y={WP.y} width={WP.w} height={WP.h} rx="8" fill="rgba(244,114,182,0.08)" stroke={WP_COLOR} strokeWidth="1" strokeOpacity={wpActive ? 0.6 : 0.25} />
      <text x={WP.cx} y={WP.y + 14} textAnchor="middle" fontSize="7" fontWeight="bold" fill={WP_COLOR} letterSpacing="0.08em" opacity="0.7">WÄRMEPUMPE</text>
      <text x={WP.cx} y={WP.y + 30} textAnchor="middle" fontSize="13" fontWeight="300" fill={wpActive ? WP_COLOR : 'var(--text-secondary)'}>
        {wpActive ? fmt(heatPumpW) : '—'}
      </text>
      <text x={WP.cx} y={WP.y + 41} textAnchor="middle" fontSize="7" fill={WP_COLOR} opacity="0.5">
        {wpActive ? 'aktiv' : 'inaktiv'}
      </text>
    </svg>
  );
}

// ─── ForecastAreaChart ────────────────────────────────────────────────────

function ForecastAreaChart({ forecastData, dayOffset = 0, pvHistory = [] }) {
  if (!Array.isArray(forecastData) || forecastData.length === 0) return null;

  const W = 400, H = 114, PAD_L = 34, PAD_R = 6, PAD_T = 8, PAD_B = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Target calendar date (local)
  const target = new Date();
  target.setDate(target.getDate() + dayOffset);
  const tY = target.getFullYear(), tM = target.getMonth(), tD = target.getDate();

  // Parse + filter to this day, 5:00–21:00
  const dayPoints = forecastData
    .map(d => ({ ...d, dt: new Date(d.datetime) }))
    .filter(d =>
      d.dt.getFullYear() === tY && d.dt.getMonth() === tM && d.dt.getDate() === tD &&
      d.dt.getHours() >= 5 && d.dt.getHours() <= 21
    );

  if (dayPoints.length === 0)
    return <div className="py-6 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Keine Daten für diesen Tag</div>;

  // X: 5:00–21:00 fixed window
  const xStart = new Date(tY, tM, tD, 5, 0);
  const xEnd   = new Date(tY, tM, tD, 21, 0);
  const xSpan  = xEnd - xStart;

  // Y: 0..maxW with 10% headroom, rounded to 500 W
  const histMax = dayOffset === 0 ? Math.max(...pvHistory.map(h => h.watts), 0) : 0;
  const maxW = Math.max(...dayPoints.map(d => Math.max(d.watts || 0, d.p90 || 0)), histMax, 200);
  const yMax = Math.ceil(maxW * 1.1 / 500) * 500;

  const xp = dt  => PAD_L + Math.max(0, Math.min(1, (dt - xStart) / xSpan)) * chartW;
  const yp = w   => PAD_T + chartH - Math.max(0, Math.min(1, w / yMax)) * chartH;

  // Forecast paths
  const coords = dayPoints.map(d => [xp(d.dt), yp(d.watts || 0)]);
  const lineD   = 'M' + coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
  const areaD   = lineD
    + `L${xp(dayPoints.at(-1).dt).toFixed(1)},${(PAD_T + chartH).toFixed(1)}`
    + `L${xp(dayPoints[0].dt).toFixed(1)},${(PAD_T + chartH).toFixed(1)}Z`;

  // Confidence band (p10/p90)
  const hasConf = dayPoints.some(d => d.p10 != null && d.p90 != null);
  let bandD = '';
  if (hasConf) {
    const top = dayPoints.map(d => `${xp(d.dt).toFixed(1)},${yp(d.p90 ?? d.watts ?? 0).toFixed(1)}`);
    const bot = [...dayPoints].reverse().map(d => `${xp(d.dt).toFixed(1)},${yp(d.p10 ?? d.watts ?? 0).toFixed(1)}`);
    bandD = `M${top.join('L')}L${bot.join('L')}Z`;
  }

  // Actual production history — bucket into 5-min averages for a smooth line
  const showHistory = dayOffset === 0 && pvHistory.length > 1;
  let histLineD = '';
  if (showHistory) {
    const BUCKET_MS = 5 * 60 * 1000;
    const buckets = {};
    for (const h of pvHistory) {
      if (h.dt < xStart || h.dt > xEnd) continue;
      const key = Math.floor(h.dt.getTime() / BUCKET_MS);
      if (!buckets[key]) buckets[key] = { sum: 0, n: 0, t: key * BUCKET_MS };
      buckets[key].sum += h.watts;
      buckets[key].n += 1;
    }
    const pts = Object.values(buckets)
      .sort((a, b) => a.t - b.t)
      .map(b => ({ dt: new Date(b.t + BUCKET_MS / 2), watts: b.sum / b.n }));
    if (pts.length > 1) {
      histLineD = 'M' + pts.map(p => `${xp(p.dt).toFixed(1)},${yp(p.watts).toFixed(1)}`).join('L');
    }
  }

  // Current-time hairline
  const now = new Date();
  const nowInRange = dayOffset === 0 && now >= xStart && now <= xEnd;
  const nowX = nowInRange ? xp(now) : null;

  // Y-axis ticks
  const yStep = yMax <= 2000 ? 1000 : yMax <= 4000 ? 2000 : 2500;
  const yTicks = [];
  for (let w = yStep; w < yMax; w += yStep) yTicks.push(w);

  // X-axis hour labels
  const xHours = [6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="pv-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fb923c" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="pv-band-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fb923c" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Gridlines + Y labels */}
      {yTicks.map(w => (
        <g key={w}>
          <line x1={PAD_L} y1={yp(w)} x2={W - PAD_R} y2={yp(w)}
            stroke="var(--glass-border)" strokeWidth="0.5" />
          <text x={PAD_L - 3} y={yp(w) + 3.5} textAnchor="end" fontSize="7.5"
            fill="var(--text-muted)" fontFamily="var(--mono, monospace)">
            {`${(w / 1000).toFixed(0)}kW`}
          </text>
        </g>
      ))}

      {/* Baseline */}
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
        stroke="var(--glass-border)" strokeWidth="0.8" />

      {/* Confidence band (p10/p90) — Helios Unsicherheitsbereich */}
      {hasConf && <path d={bandD} fill="url(#pv-band-grad)" />}

      {/* Forecast area fill */}
      <path d={areaD} fill="url(#pv-area-grad)" />

      {/* Forecast line */}
      <path d={lineD} fill="none" stroke="#fb923c" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Actual production (history) */}
      {histLineD && (
        <path d={histLineD} fill="none" stroke="rgba(148,210,255,0.75)" strokeWidth="1.2"
          strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* Current-time hairline */}
      {nowX != null && (
        <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + chartH}
          stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="2 3" />
      )}

      {/* X labels */}
      {xHours.map(h => {
        const dt = new Date(tY, tM, tD, h, 0);
        const x  = xp(dt);
        return (
          <text key={h} x={x.toFixed(1)} y={H - 3} textAnchor="middle" fontSize="7.5"
            fill="var(--text-muted)" fontFamily="var(--mono, monospace)">
            {h}
          </text>
        );
      })}
    </svg>
  );
}

// ─── InfoTile ─────────────────────────────────────────────────────────────

const InfoTile = ({ label, value, color = 'var(--text-primary)', sub = '' }) => (
  <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-4">
    <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
      {label}
    </p>
    <p className="text-xl font-light leading-tight" style={{ color }}>
      {value ?? '—'}
    </p>
    {sub && <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────

export default function PvModal({
  show,
  onClose,
  entities,
  customNames,
  cardId,
  conn,
  haUrl,
  haToken,
  settings,
  t,
}) {
  const ids = resolvePvIds(settings);
  // Monat/Jahr aus der Statistik der Gesamtzähler, wenn keine eigenen Sensoren eingetragen sind
  const periodTotals = usePvPeriodTotals(conn, ids.pvMonthly && ids.pvYearly ? null : ids.pvTotals, entities, show);
  const [mainTab, setMainTab] = useState('leistung');
  const [forecastChartDay, setForecastChartDay] = useState(0);
  const [pvHistory, setPvHistory] = useState([]);
  const modalTitleId = 'pv-modal-title';

  useEffect(() => {
    if (!show) { setPvHistory([]); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const opts = {
      entityId: ids.pvW,
      start: today,
      end: new Date(),
      minimal_response: true,
      no_attributes: true,
    };

    function parseRaw(raw) {
      return (Array.isArray(raw) ? raw : [])
        .map(s => {
          const ts = s.lu != null ? new Date(s.lu * 1000) : new Date(s.last_changed ?? s.last_updated ?? 0);
          const w = parseFloat(s.s ?? s.state);
          return { dt: ts, watts: w };
        })
        .filter(s => Number.isFinite(s.watts) && s.watts >= 0);
    }

    async function load() {
      if (conn) {
        try {
          const wsData = await getHistory(conn, opts);
          const raw = Array.isArray(wsData?.[0]) ? wsData[0] : Array.isArray(wsData) ? wsData : [];
          if (raw.length > 0) { setPvHistory(parseRaw(raw)); return; }
        } catch (_) {}
      }
      if (canUseHistoryRest(haUrl) && haToken) {
        try {
          const restData = await getHistoryRest(haUrl, haToken, opts);
          const raw = Array.isArray(restData?.[0]) ? restData[0] : Array.isArray(restData) ? restData : [];
          setPvHistory(parseRaw(raw));
        } catch (_) {}
      }
    }
    load();
  }, [show, conn, haUrl, haToken, ids.pvW]);

  if (!show) return null;

  const name = customNames?.[cardId] || 'Solar';

  const v = (id) => readPv(entities, id);

  const pvW = v(ids.pvW);
  const pvDaily = v(ids.pvDaily);
  const pvMonthly = v(ids.pvMonthly) ?? periodTotals.month;
  const pvYearly = v(ids.pvYearly) ?? periodTotals.year;
  const houseW = v(ids.houseW);
  const houseDaily = v(ids.houseDaily);
  const heatPumpW = v(ids.heatPumpW);
  const batteryInW = v(ids.batteryInW);
  const batterySoc = v(ids.batterySoc);
  const batteryInDaily = v(ids.batteryInDaily);
  const batteryOutDaily = v(ids.batteryOutDaily);
  const gridImportW = v(ids.gridImportW);
  const gridExportW = v(ids.gridExportW);
  const gridImportDaily = v(ids.gridImportDaily);
  const gridExportDaily = v(ids.gridExportDaily);
  const pvToHouseDaily = v(ids.pvToHouseDaily);
  const batteryMaxEnergy = v(ids.batteryMaxEnergy);
  const forecastRemaining = v(ids.forecastRemaining);
  const forecastPeakToday = v(ids.forecastPeakToday);
  const forecastData = (ids.forecastCurrent && entities?.[ids.forecastCurrent]?.attributes?.forecast) ?? [];

  // Compute battery discharge estimate
  // Entladung aus eigenem Sensor, sonst aus der Bilanz Haus − PV − Netzbezug
  const batteryOutW = ids.batteryOutW ? (v(ids.batteryOutW) ?? 0) : Math.max(0, (houseW ?? 0) - (pvW ?? 0) - (gridImportW ?? 0));
  const batteryDischarging = (batteryInW ?? 0) < 1 && batteryOutW > 10;

  // Self-consumption & self-sufficiency
  const selfConsumption = pvDaily != null && pvDaily > 0 && pvToHouseDaily != null
    ? Math.round((pvToHouseDaily / pvDaily) * 100)
    : null;
  const autarkie = houseDaily != null && houseDaily > 0 && gridImportDaily != null
    ? Math.round(((houseDaily - gridImportDaily) / houseDaily) * 100)
    : null;

  const isProducing = pvW != null && pvW > 10;

  const isCompact = window.innerHeight < 900 ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const mainTabs = [
    { key: 'leistung', label: 'Leistung' },
    { key: 'prognose', label: 'Prognose' },
    { key: 'statistik', label: 'Statistik' },
  ];

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName={isCompact
        ? 'fixed inset-0 z-50 flex items-stretch justify-center'
        : 'fixed inset-0 z-50 flex items-center justify-center p-6'}
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName={isCompact
        ? 'popup-anim relative flex flex-col w-full max-w-2xl h-full overflow-hidden rounded-none border font-sans backdrop-blur-xl'
        : 'popup-anim relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border font-sans backdrop-blur-xl'}
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          {/* ── Fixed header ── */}
          <div
            className={`flex-shrink-0 border-b ${isCompact ? 'p-4 pb-3' : 'p-8 pb-5'}`}
            style={{ borderColor: 'var(--glass-border)' }}
          >
          {/* Close */}
          <div className="absolute top-4 right-4 z-20">
            <button onClick={onClose} className="modal-close" aria-label="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Header */}
          <div className="mb-4 flex items-center gap-3 pr-10 font-sans">
            <div className="rounded-2xl p-3 transition-all duration-500"
              style={{ backgroundColor: 'rgba(251,146,60,0.15)', color: SOLAR_COLOR }}>
              <Sun className="h-6 w-6" />
            </div>
            <div>
              <h3 id={modalTitleId}
                className="text-xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic">
                {name}
              </h3>
              <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-all duration-500"
                style={{
                  backgroundColor: isProducing ? 'var(--status-success-bg)' : 'var(--glass-bg)',
                  borderColor: isProducing ? 'var(--status-success-border)' : 'var(--glass-border)',
                }}>
                <span className={`h-2 w-2 rounded-full ${isProducing ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--text-muted)]'}`} />
                <p className="text-[10px] font-bold tracking-widest uppercase italic"
                  style={{ color: isProducing ? 'var(--status-success-fg)' : 'var(--text-secondary)' }}>
                  {isProducing ? `${Math.round(pvW)} W` : 'Standby'}
                </p>
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-2xl p-1" style={{ backgroundColor: 'var(--glass-bg)' }}>
            {mainTabs.map(({ key, label }) => (
              <button key={key} onClick={() => setMainTab(key)}
                className="flex-1 rounded-xl py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                style={mainTab === key
                  ? { backgroundColor: 'rgba(251,146,60,0.15)', borderColor: ACCENT, color: ACCENT, border: `1px solid ${ACCENT}` }
                  : { color: 'var(--text-secondary)' }
                }>
                {label}
              </button>
            ))}
          </div>
          </div>{/* end fixed header */}

          {/* ── Scrollable content ── */}
          <div className={`flex-1 overflow-y-auto ${isCompact ? 'p-4' : 'p-8'}`}>

          {/* ── Tab: Leistung ── */}
          {mainTab === 'leistung' && (
            <>
              {/* Power flow SVG */}
              <div className="mb-6">
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  Energiefluss
                </p>
                <div className="popup-surface rounded-2xl p-4">
                  <PowerFlowSvg
                    pvW={pvW}
                    houseW={houseW}
                    heatPumpW={heatPumpW}
                    batteryInW={batteryInW}
                    batteryOutW={batteryDischarging ? batteryOutW : 0}
                    gridImportW={gridImportW}
                    gridExportW={gridExportW}
                    batterySoc={batterySoc}
                    batteryMaxEnergy={batteryMaxEnergy}
                    pvDaily={pvDaily}
                  />
                </div>
              </div>

              {/* Today stats */}
              <div>
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  Heute
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <InfoTile label="PV Ertrag" value={pvDaily != null ? `${pvDaily.toFixed(2)} kWh` : null} color={SOLAR_COLOR} />
                  <InfoTile
                    label="Batterie"
                    value={batteryInDaily != null ? `+${batteryInDaily.toFixed(2)}` : null}
                    sub={batteryOutDaily != null ? `-${batteryOutDaily.toFixed(2)} kWh` : ''}
                    color={BATT_COLOR}
                  />
                  <InfoTile label="Einspeisung" value={gridExportDaily != null ? `${gridExportDaily.toFixed(2)} kWh` : null} color="#4ade80" />
                  <InfoTile label="Bezug" value={gridImportDaily != null ? `${gridImportDaily.toFixed(2)} kWh` : null} color="#f87171" />
                </div>
              </div>
            </>
          )}

          {/* ── Tab: Prognose ── */}
          {mainTab === 'prognose' && (
            <div className="space-y-6 font-sans">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3">
                <InfoTile
                  label="Heute gesamt"
                  value={v(ids.forecastToday) != null ? `${v(ids.forecastToday).toFixed(1)} kWh` : null}
                  color={SOLAR_COLOR}
                />
                <InfoTile
                  label="Morgen"
                  value={v(ids.forecastTomorrow) != null ? `${v(ids.forecastTomorrow).toFixed(1)} kWh` : null}
                  color="#fbbf24"
                />
                <InfoTile
                  label="Peak heute"
                  value={forecastPeakToday != null ? `${(forecastPeakToday / 1000).toFixed(2)} kW` : null}
                  color={SOLAR_COLOR}
                  sub={forecastRemaining != null ? `noch ${forecastRemaining.toFixed(1)} kWh` : ''}
                />
              </div>

              {/* Tagesverlauf Chart */}
              <div>
                {/* Day tabs */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                    Tagesverlauf
                  </p>
                  <div className="flex gap-1">
                    {['Heute', 'Morgen', '+2'].map((label, i) => (
                      <button
                        key={i}
                        onClick={() => setForecastChartDay(i)}
                        className="rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all"
                        style={forecastChartDay === i
                          ? { backgroundColor: 'rgba(251,146,60,0.15)', color: SOLAR_COLOR, border: `1px solid rgba(251,146,60,0.4)` }
                          : { color: 'var(--text-muted)', border: '1px solid transparent' }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="popup-surface rounded-2xl p-3">
                  <ForecastAreaChart forecastData={forecastData} dayOffset={forecastChartDay} pvHistory={pvHistory} />
                  {/* Diese/Nächste Stunde below chart */}
                  {forecastChartDay === 0 && (
                    <div className="mt-2 flex gap-3 border-t border-[var(--glass-border)] pt-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>Diese Stunde</span>
                        <span className="text-sm font-light" style={{ color: SOLAR_COLOR }}>
                          {v(ids.forecastThisHour) != null ? `${v(ids.forecastThisHour).toFixed(2)} kWh` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>Nächste Stunde</span>
                        <span className="text-sm font-light" style={{ color: '#fbbf24' }}>
                          {v(ids.forecastNextHour) != null ? `${v(ids.forecastNextHour).toFixed(2)} kWh` : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 5-day forecast tiles */}
              <div>
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  5-Tage Prognose
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {[
                    { key: 'forecastToday',    label: 'Heute' },
                    { key: 'forecastTomorrow', label: 'Morgen' },
                    { key: 'forecastDay3',     label: '+2' },
                    { key: 'forecastDay4',     label: '+3' },
                    { key: 'forecastDay5',     label: '+4' },
                  ].map(({ key, label }, i) => {
                    const val = v(ids[key]);
                    return (
                      <div key={key} className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-4">
                        <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p>
                        <p className="text-xl font-light" style={{ color: i === 0 ? SOLAR_COLOR : i === 1 ? '#fbbf24' : 'var(--text-secondary)' }}>
                          {val != null ? val.toFixed(1) : '—'}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>kWh</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Statistik ── */}
          {mainTab === 'statistik' && (
            <div className="space-y-6 font-sans">
              {/* Eigenverbrauch / Autarkie */}
              <div>
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  Heute · Effizienz
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="popup-surface rounded-2xl p-4">
                    <p className="mb-1 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Eigenverbrauch
                    </p>
                    <p className="text-2xl font-light" style={{ color: selfConsumption != null && selfConsumption >= 70 ? '#4ade80' : SOLAR_COLOR }}>
                      {selfConsumption != null ? `${selfConsumption}%` : '—'}
                    </p>
                    <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      PV direkt genutzt
                    </p>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--glass-border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${selfConsumption ?? 0}%`, backgroundColor: selfConsumption != null && selfConsumption >= 70 ? '#4ade80' : SOLAR_COLOR }} />
                    </div>
                  </div>
                  <div className="popup-surface rounded-2xl p-4">
                    <p className="mb-1 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Autarkie
                    </p>
                    <p className="text-2xl font-light" style={{ color: autarkie != null && autarkie >= 80 ? '#4ade80' : '#fb923c' }}>
                      {autarkie != null ? `${autarkie}%` : '—'}
                    </p>
                    <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Unabhängigkeit vom Netz
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--glass-border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${autarkie ?? 0}%`, backgroundColor: autarkie != null && autarkie >= 80 ? '#4ade80' : '#fb923c' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Production stats */}
              <div>
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  Ertrag
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <InfoTile label="Heute" value={pvDaily != null ? `${pvDaily.toFixed(2)} kWh` : null} color={SOLAR_COLOR} />
                  <InfoTile label="Monat" value={pvMonthly != null ? `${pvMonthly.toFixed(1)} kWh` : null} color={SOLAR_COLOR} />
                  <InfoTile label="Jahr" value={pvYearly != null ? `${(pvYearly / 1000).toFixed(2)} MWh` : null} color={SOLAR_COLOR} />
                  <InfoTile label="Verbrauch heute" value={houseDaily != null ? `${houseDaily.toFixed(2)} kWh` : null} color={HOUSE_COLOR} />
                </div>
              </div>

              {/* Battery */}
              <div>
                <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  Batterie
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <InfoTile label="SOC" value={batterySoc != null ? `${batterySoc.toFixed(0)} %` : null} color={getBattSocColor(batterySoc)} />
                  <InfoTile label="Geladen heute" value={batteryInDaily != null ? `${batteryInDaily.toFixed(2)} kWh` : null} color={BATT_COLOR} />
                  <InfoTile label="Entladen heute" value={batteryOutDaily != null ? `${batteryOutDaily.toFixed(2)} kWh` : null} color={BATT_COLOR} />
                  <InfoTile label="Netz Export" value={gridExportDaily != null ? `${gridExportDaily.toFixed(2)} kWh` : null} color="#4ade80" />
                </div>
              </div>
            </div>
          )}
          {/* ── Tab: Energy Dashboard ── */}
          </div>{/* end scrollable content */}
        </>
      )}
    </AccessibleModalShell>
  );
}
