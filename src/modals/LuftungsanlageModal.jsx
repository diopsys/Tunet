import { useState, useEffect } from 'react';
import { Fan, Thermometer, X } from '../icons';
import { LUFTUNGSANLAGE_ENTITY_IDS, co2Max } from '../components/cards/GenericLuftungsanlageCard';
import { REASONS, co2Color, evaluateLueftung, lockUntil, parseLastMode, stageLabel } from '../utils/lueftungLogic';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import LuftungFlowView from '../components/LuftungFlowView';
import { getHistoryRest, getHistory } from '../services/haClient';

const ACCENT = '#38bdf8';

function getThresholdColor(value, thresholds) {
  for (const t of thresholds) {
    if (t.max == null || value < t.max) return t.color;
  }
  return thresholds[thresholds.length - 1].color;
}

function ColoredHistoryGraph({ data, height = 120, thresholds, noDataLabel = 'Keine Verlaufsdaten' }) {
  if (!Array.isArray(data) || data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs" style={{ height, color: 'var(--text-muted)' }}>
        {noDataLabel}
      </div>
    );
  }
  const pad = { top: 16, right: 16, bottom: 24, left: 38 };
  const vbW = 600;
  const gW = vbW - pad.left - pad.right;
  const gH = height - pad.top - pad.bottom;
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const toX = (i) => pad.left + (i / (data.length - 1)) * gW;
  const toY = (v) => pad.top + gH - ((v - min) / (max - min)) * gH;
  const yLabels = [
    { value: max, y: pad.top },
    { value: (max + min) / 2, y: pad.top + gH / 2 },
    { value: min, y: pad.top + gH },
  ];
  const xIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const xLabels = xIdx.map((i, k) => ({
    x: toX(i),
    label: new Date(data[i].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    anchor: k === 0 ? 'start' : k === 2 ? 'end' : 'middle',
  }));
  return (
    <div className="relative w-full select-none">
      <svg viewBox={`0 0 ${vbW} ${height}`} className="h-full w-full overflow-visible" preserveAspectRatio="none">
        {yLabels.map((l, i) => (
          <line key={i} x1={pad.left} y1={l.y} x2={vbW - pad.right} y2={l.y}
            stroke="currentColor" strokeOpacity="0.06" strokeDasharray="4 4" />
        ))}
        {data.slice(0, -1).map((d, i) => {
          const mid = (d.value + data[i + 1].value) / 2;
          return (
            <line key={i}
              x1={toX(i)} y1={toY(d.value)}
              x2={toX(i + 1)} y2={toY(data[i + 1].value)}
              stroke={getThresholdColor(mid, thresholds)}
              strokeWidth="2.5" strokeLinecap="round" opacity="0.9"
            />
          );
        })}
        {yLabels.map((l, i) => (
          <text key={i} x={pad.left - 6} y={l.y} textAnchor="end" dominantBaseline="middle"
            style={{ fill: 'var(--text-secondary)', fontSize: '10px', opacity: 0.55, fontFamily: 'monospace' }}>
            {l.value.toFixed(0)}
          </text>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 4} textAnchor={l.anchor}
            style={{ fill: 'var(--text-secondary)', fontSize: '10px', opacity: 0.55, fontFamily: 'monospace' }}>
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function ThresholdRow({ label, value, unit, onDec, onInc }) {
  const display = value != null
    ? `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`
    : '—';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-[56px] text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={onDec}
          className="flex h-6 w-6 items-center justify-center rounded-lg border text-sm font-bold transition-colors"
          style={{ borderColor: 'var(--glass-border)', color: ACCENT, background: 'var(--glass-bg)' }}>
          −
        </button>
        <span className="min-w-[64px] text-center text-xs font-mono" style={{ color: ACCENT }}>
          {display}
        </span>
        <button onClick={onInc}
          className="flex h-6 w-6 items-center justify-center rounded-lg border text-sm font-bold transition-colors"
          style={{ borderColor: 'var(--glass-border)', color: ACCENT, background: 'var(--glass-bg)' }}>
          +
        </button>
      </div>
    </div>
  );
}

function SelectPills({ options, current, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className="rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all"
            style={
              isActive
                ? {
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    borderColor: ACCENT,
                    color: ACCENT,
                  }
                : {
                    backgroundColor: 'var(--glass-bg)',
                    borderColor: 'var(--glass-border)',
                    color: 'var(--text-secondary)',
                  }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LuftungsanlageModal({
  show,
  onClose,
  entities,
  customNames,
  cardId,
  callService,
  conn,
  haUrl,
  haToken,
  t,
}) {
  const translate = t || ((key) => key);
  const [mainTab, setMainTab] = useState('betrieb');
  const [co2History, setCo2History] = useState([]);
  const [vocHistory, setVocHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modeHistory, setModeHistory] = useState([]);
  const [modeHistoryOpen, setModeHistoryOpen] = useState(false);
  const [modeHistoryLoading, setModeHistoryLoading] = useState(false);
  const [schwelleOpen, setSchwelleOpen] = useState(false);
  const modalTitleId = 'luftungsanlage-modal-title';

  useEffect(() => {
    if (!show || mainTab !== 'luftqualitaet') return;
    if (!conn && !haUrl) return;

    const fetchHistories = async () => {
      setHistoryLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const fetchOne = async (entityId) => {
        try {
          const data = await getHistoryRest(haUrl, haToken, {
            entityId,
            start,
            end,
            minimal_response: false,
            no_attributes: false,
            significant_changes_only: false,
          });
          const raw = Array.isArray(data?.[0]) ? data[0] : (Array.isArray(data) ? data : []);
          return raw
            .filter((d) => !isNaN(parseFloat(d?.state)))
            .map((d) => ({
              value: parseFloat(d.state),
              time: new Date(d.last_changed || d.last_updated || d.lu || d.lc),
            }))
            .filter((d) => !isNaN(d.time.getTime()));
        } catch (_e) {
          try {
            const wsData = await getHistory(conn, { entityId, start, end });
            const raw = Array.isArray(wsData?.[0]) ? wsData[0] : (Array.isArray(wsData) ? wsData : []);
            return raw
              .filter((d) => !isNaN(parseFloat(d?.state)))
              .map((d) => ({
                value: parseFloat(d.state),
                time: new Date(d.last_changed || d.last_updated || d.lu || d.lc),
              }))
              .filter((d) => !isNaN(d.time.getTime()));
          } catch (_e2) {
            return [];
          }
        }
      };

      const [co2, voc] = await Promise.all([
        fetchOne(LUFTUNGSANLAGE_ENTITY_IDS.co2Eg),
        fetchOne(LUFTUNGSANLAGE_ENTITY_IDS.vocOg),
      ]);
      setCo2History(co2);
      setVocHistory(voc);
      setHistoryLoading(false);
    };

    fetchHistories();
  }, [show, mainTab, conn, haUrl, haToken]);

  useEffect(() => {
    if (!show || mainTab !== 'automatik') return;
    if (!conn && !haUrl) return;

    const fetchModeHistory = async () => {
      setModeHistoryLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
      try {
        let raw = [];
        try {
          const data = await getHistoryRest(haUrl, haToken, {
            entityId: LUFTUNGSANLAGE_ENTITY_IDS.lastMode,
            start,
            end,
            minimal_response: false,
            no_attributes: false,
            significant_changes_only: false,
          });
          raw = Array.isArray(data?.[0]) ? data[0] : (Array.isArray(data) ? data : []);
        } catch (_e) {
          const wsData = await getHistory(conn, { entityId: LUFTUNGSANLAGE_ENTITY_IDS.lastMode, start, end });
          raw = Array.isArray(wsData?.[0]) ? wsData[0] : (Array.isArray(wsData) ? wsData : []);
        }
        const toMs = (v) => (v != null && v < 1e12 ? v * 1000 : v);
        const parsed = raw
          .map((d) => ({
            state: d.state ?? d.s,
            time: new Date(d.last_changed ?? d.last_updated ?? toMs(d.lc) ?? toMs(d.lu)),
          }))
          .filter((d) => d.state && d.state !== 'unknown' && d.state !== 'unavailable' && !isNaN(d.time.getTime()))
          .reverse();
        setModeHistory(parsed);
      } catch (_e) {
        setModeHistory([]);
      }
      setModeHistoryLoading(false);
    };

    fetchModeHistory();
  }, [show, mainTab, conn, haUrl, haToken]);

  if (!show) return null;

  const name = customNames?.[cardId] || translate('luftungsanlage.title');

  const e = (id) => entities?.[id];
  const val = (id) => {
    const v = parseFloat(e(id)?.state);
    return Number.isFinite(v) ? v : null;
  };
  const str = (id) => e(id)?.state || null;

  const setHvacMode = (mode) => {
    callService?.('climate', 'set_hvac_mode', {
      entity_id: LUFTUNGSANLAGE_ENTITY_IDS.climate,
      hvac_mode: mode,
    });
  };

  const setFanMode = (mode) => {
    callService?.('climate', 'set_fan_mode', {
      entity_id: LUFTUNGSANLAGE_ENTITY_IDS.climate,
      fan_mode: mode,
    });
  };

  const setTemperature = (temp) => {
    callService?.('climate', 'set_temperature', {
      entity_id: LUFTUNGSANLAGE_ENTITY_IDS.climate,
      temperature: temp,
    });
  };

  const hvacState = str(LUFTUNGSANLAGE_ENTITY_IDS.climate);
  const fanMode = e(LUFTUNGSANLAGE_ENTITY_IDS.climate)?.attributes?.fan_mode || null;
  const targetTemp = e(LUFTUNGSANLAGE_ENTITY_IDS.climate)?.attributes?.temperature ?? null;
  const currentTemp = e(LUFTUNGSANLAGE_ENTITY_IDS.climate)?.attributes?.current_temperature ?? null;
  const minTemp = e(LUFTUNGSANLAGE_ENTITY_IDS.climate)?.attributes?.min_temp ?? 15;
  const maxTemp = e(LUFTUNGSANLAGE_ENTITY_IDS.climate)?.attributes?.max_temp ?? 30;
  const tempActive = hvacState === 'heat' || hvacState === 'cool' || hvacState === 'auto';
  const FAN_MODE_LABELS = { low: 'Low', medium: 'Medium', high: 'High', off: 'Aus', auto: 'Auto' };
  const luftstufe = fanMode ? (FAN_MODE_LABELS[fanMode] || fanMode) : null;
  const kaminmodusAktiv = e(LUFTUNGSANLAGE_ENTITY_IDS.kaminmodus)?.state === 'on';
  const lastMode = str(LUFTUNGSANLAGE_ENTITY_IDS.lastMode);
  const outsideTemp = val(LUFTUNGSANLAGE_ENTITY_IDS.outsideTemp);
  const insideTemp = val(LUFTUNGSANLAGE_ENTITY_IDS.insideTemp);
  const automationState = str(LUFTUNGSANLAGE_ENTITY_IDS.automation);
  const saisonState = str(LUFTUNGSANLAGE_ENTITY_IDS.saison);
  const lockTs = str(LUFTUNGSANLAGE_ENTITY_IDS.lockTimestamp);

  // CO2 / air quality
  const co2Eg = val(LUFTUNGSANLAGE_ENTITY_IDS.co2Eg);
  const feuchteEg = val(LUFTUNGSANLAGE_ENTITY_IDS.feuchteEg);
  const pm25Eg = val(LUFTUNGSANLAGE_ENTITY_IDS.pm25Eg);
  const luftqualitaetEg = str(LUFTUNGSANLAGE_ENTITY_IDS.luftqualitaetEg);
  const vocOg = val(LUFTUNGSANLAGE_ENTITY_IDS.vocOg);
  const feuchteOg = val(LUFTUNGSANLAGE_ENTITY_IDS.feuchteOg);
  const pm25Og = val(LUFTUNGSANLAGE_ENTITY_IDS.pm25Og);
  const tempOg = val(LUFTUNGSANLAGE_ENTITY_IDS.tempOg);

  const STATE_LABELS = {
    off: 'Aus',
    auto: 'Auto',
    fan_only: 'Lüften',
  };
  // Im Kaminmodus ist climate „off“, die Ventilatoren laufen aber weiter
  const fansRunning = (val(LUFTUNGSANLAGE_ENTITY_IDS.zuluftRpm) ?? 0) > 0 || (val(LUFTUNGSANLAGE_ENTITY_IDS.abluftRpm) ?? 0) > 0;
  const hvacLabel = hvacState === 'off' && fansRunning ? 'Lüftet' : hvacState ? (STATE_LABELS[hvacState] ?? hvacState) : '—';
  const isActive = (hvacState !== 'off' && hvacState != null) || fansRunning;

  const hvacOptions = [
    { value: 'off', label: 'Aus' },
    { value: 'auto', label: 'Auto' },
    { value: 'fan_only', label: 'Lüften' },
  ];

  const fanOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const mainTabs = [
    { key: 'betrieb', label: translate('luftungsanlage.betrieb') || 'Betrieb' },
    { key: 'luftqualitaet', label: translate('luftungsanlage.luftqualitaet') || 'Luftqualität' },
    { key: 'automatik', label: 'Automatik' },
  ];

  const nightEnabled = str(LUFTUNGSANLAGE_ENTITY_IDS.nachtGrundlueftung) === 'on';
  const mindestStufendauer = val(LUFTUNGSANLAGE_ENTITY_IDS.mindestStufendauer) ?? 20;
  const summerStage = fanMode;
  const nowDate = new Date();
  const evaluation = evaluateLueftung({
    co2: [val(LUFTUNGSANLAGE_ENTITY_IDS.co2Eg), LUFTUNGSANLAGE_ENTITY_IDS.co2Og ? val(LUFTUNGSANLAGE_ENTITY_IDS.co2Og) : null],
    humidity: [feuchteEg, feuchteOg],
    voc: [vocOg],
    pm25: [pm25Eg, pm25Og],
    outsideTemp,
    insideTemp,
    season: saisonState,
    lastMode,
    nightEnabled,
    minuteOfDay: nowDate.getHours() * 60 + nowDate.getMinutes(),
    thresholds: {
      co2LowEin: val(LUFTUNGSANLAGE_ENTITY_IDS.co2LowEin),
      co2Aus: val(LUFTUNGSANLAGE_ENTITY_IDS.co2Aus),
      co2Schwelle: val(LUFTUNGSANLAGE_ENTITY_IDS.co2Schwelle),
      feuchteSchwelle: val(LUFTUNGSANLAGE_ENTITY_IDS.feuchteSchwelle),
      vocSchwelle: val(LUFTUNGSANLAGE_ENTITY_IDS.vocSchwelle),
      pm25Schwelle: val(LUFTUNGSANLAGE_ENTITY_IDS.pm25Schwelle),
      dauerbetriebAb: val(LUFTUNGSANLAGE_ENTITY_IDS.dauerbetriebAb),
      frostAus: val(LUFTUNGSANLAGE_ENTITY_IDS.frostAus),
    },
  });
  const th = evaluation.thresholds;
  const co2 = co2Max(entities);
  const co2OgAvailable = Boolean(LUFTUNGSANLAGE_ENTITY_IDS.co2Og && val(LUFTUNGSANLAGE_ENTITY_IDS.co2Og) != null);
  const co2ColorFor = (ppm) => co2Color(ppm, th);
  const isSummer = String(saisonState || '').toLowerCase().startsWith('som');

  const { src: modeSrc, lvl: modeLvl, kind: modeKind } = parseLastMode(lastMode, summerStage);
  // Erklärung zum aktuellen Grund mit Live-Werten; nur wenn der gespeicherte Grund zur Nachrechnung passt
  const statusExplanation = REASONS[lastMode] && evaluation.reason === lastMode ? evaluation.explanation : null;
  const evalMismatch = automationState === 'on' && REASONS[lastMode] && evaluation.reason && evaluation.reason !== lastMode;

  const co2Top = Math.max(th.co2Schwelle * 1.25, (co2 ?? 0) * 1.05, 400);
  const co2Bottom = 400;
  const co2Scale = (v) => (v == null ? 0 : Math.min(100, Math.max(0, ((v - co2Bottom) / (co2Top - co2Bottom)) * 100)));
  const co2Markers = [
    { value: th.co2Aus, label: 'Aus', color: '#4ade80' },
    { value: th.co2LowEin, label: 'Low', color: '#fb923c' },
    { value: th.co2Schwelle, label: 'Medium', color: '#f87171' },
  ];
  const limitColor = (v, limit, warnFactor) => (v == null ? 'var(--text-muted)' : v >= limit ? '#ef9a9a' : v >= limit * warnFactor ? '#ffb74d' : '#81c784');
  const { hum, voc, pm25 } = evaluation.values;
  const aqValues = [
    { label: 'CO₂', value: co2 != null ? co2.toFixed(0) : '—', limit: th.co2Schwelle.toFixed(0), color: limitColor(co2, th.co2Schwelle, 0.85) },
    { label: 'Feuchte', value: hum != null ? `${hum.toFixed(0)}%` : '—', limit: `${th.feuchteSchwelle.toFixed(0)}%`, color: limitColor(hum, th.feuchteSchwelle, 0.93) },
    { label: 'VOC', value: voc != null ? voc.toFixed(0) : '—', limit: th.vocSchwelle.toFixed(0), color: limitColor(voc, th.vocSchwelle, 0.85) },
    { label: 'PM2.5', value: pm25 != null ? pm25.toFixed(1) : '—', limit: th.pm25Schwelle.toFixed(0), color: limitColor(pm25, th.pm25Schwelle, 0.8) },
  ];
  const lockEnd = lockUntil(lockTs, mindestStufendauer);
  const formatHm = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const autoOn = automationState === 'on';
  const saisonColor = saisonState?.startsWith('Win') ? '#64b5f6' : saisonState?.startsWith('Som') ? '#ffb74d' : '#81c784';

  const setThreshold = (entityId, value) => {
    callService?.('input_number', 'set_value', { entity_id: entityId, value });
  };

  const step = (entityId, current, delta, min, max) => {
    const next = Math.round((current + delta) * 10) / 10;
    setThreshold(entityId, Math.min(max, Math.max(min, next)));
  };
  const toggleNight = () => {
    callService?.('input_boolean', 'toggle', { entity_id: LUFTUNGSANLAGE_ENTITY_IDS.nachtGrundlueftung });
  };

  const toggleAutomation = () => {
    callService?.('automation', 'toggle', { entity_id: LUFTUNGSANLAGE_ENTITY_IDS.automation });
  };
  const setSaison = (option) => {
    callService?.('input_select', 'select_option', {
      entity_id: LUFTUNGSANLAGE_ENTITY_IDS.saison,
      option,
    });
  };

  const InfoTile = ({ label, value, color = 'var(--text-primary)', unit = '' }) => (
    <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-4">
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-xl font-light" style={{ color }}>
        {value != null ? `${value}${unit}` : '—'}
      </p>
    </div>
  );

  const isCompact = window.innerHeight < 900 ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

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
          {/* ── Fixed header: close + icon/title + tabs ── */}
          <div
            className={`flex-shrink-0 border-b ${isCompact ? 'p-4 pb-3' : 'p-8 pb-5'}`}
            style={{ borderColor: 'var(--glass-border)' }}
          >
          {/* Close button */}
          <div className="absolute top-4 right-4 z-20">
            <button onClick={onClose} className="modal-close" aria-label={translate('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Header */}
          <div className="mb-4 flex items-center gap-3 pr-10 font-sans">
            <div
              className="rounded-2xl p-3 transition-all duration-500"
              style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: ACCENT }}
            >
              <Fan className="h-6 w-6" />
            </div>
            <div>
              <h3
                id={modalTitleId}
                className="text-xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic"
              >
                {name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {kaminmodusAktiv && (
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 animate-pulse"
                    style={{ backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.5)' }}
                  >
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                    <p className="text-[10px] font-bold tracking-widest uppercase italic" style={{ color: '#f97316' }}>
                      🔥 Kaminmodus aktiv
                    </p>
                  </div>
                )}
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-all duration-500"
                  style={{
                    backgroundColor: isActive ? 'var(--status-success-bg)' : 'var(--glass-bg)',
                    borderColor: isActive ? 'var(--status-success-border)' : 'var(--glass-border)',
                  }}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${isActive ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--text-muted)]'}`}
                  />
                  <p
                    className="text-[10px] font-bold tracking-widest uppercase italic"
                    style={{ color: isActive ? 'var(--status-success-fg)' : 'var(--text-secondary)' }}
                  >
                    {hvacLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-2xl p-1" style={{ backgroundColor: 'var(--glass-bg)' }}>
            {mainTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMainTab(key)}
                className="flex-1 rounded-xl py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                style={
                  mainTab === key
                    ? {
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        borderColor: ACCENT,
                        color: ACCENT,
                        border: `1px solid ${ACCENT}`,
                      }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
          </div>{/* end fixed header */}

          {/* ── Scrollable content ── */}
          <div className={`flex-1 overflow-y-auto ${isCompact ? 'p-4' : 'p-8'}`}>

          {/* Tab: Betrieb */}
          {mainTab === 'betrieb' && (
            <>
              <div className="mb-6">
                <LuftungFlowView entities={entities} isMobile={isCompact} modeSrc={modeSrc} modeLvl={hvacState !== 'off' ? luftstufe : null} />
              </div>

              {/* Controls */}
              <div
                className="space-y-5 border-t pt-6 font-sans"
                style={{ borderColor: 'var(--glass-border)' }}
              >
                <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  {translate('luftungsanlage.steuerung') || 'Steuerung'}
                </p>

                <div className="flex flex-wrap gap-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                      {translate('luftungsanlage.hvacMode') || 'Betriebsmodus'}
                    </p>
                    <SelectPills
                      options={hvacOptions}
                      current={hvacState}
                      onSelect={setHvacMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                      {translate('luftungsanlage.fanMode') || 'Lüftungsstufe'}
                    </p>
                    <SelectPills
                      options={fanOptions}
                      current={fanMode}
                      onSelect={setFanMode}
                    />
                  </div>

                  {/* Temperature control — only for heat/cool/auto modes */}
                  <div className="space-y-2" style={{ opacity: tempActive ? 1 : 0.35 }}>
                    <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                      Zieltemperatur
                      {currentTemp != null && (
                        <span className="ml-2 font-normal normal-case opacity-60">
                          (Ist: {currentTemp}°C)
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => tempActive && targetTemp != null && targetTemp > minTemp && setTemperature(targetTemp - 1)}
                        disabled={!tempActive || targetTemp == null || targetTemp <= minTemp}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border text-lg font-bold transition-colors"
                        style={{ borderColor: 'var(--glass-border)', color: ACCENT, background: 'var(--glass-bg)' }}
                      >
                        −
                      </button>
                      <div className="flex min-w-[56px] items-center justify-center gap-1 rounded-xl border px-3 py-1.5"
                        style={{ borderColor: ACCENT, background: 'rgba(56,189,248,0.08)' }}>
                        <Thermometer className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                        <span className="text-sm font-bold" style={{ color: ACCENT }}>
                          {targetTemp != null ? `${targetTemp}°C` : '—'}
                        </span>
                      </div>
                      <button
                        onClick={() => tempActive && targetTemp != null && targetTemp < maxTemp && setTemperature(targetTemp + 1)}
                        disabled={!tempActive || targetTemp == null || targetTemp >= maxTemp}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border text-lg font-bold transition-colors"
                        style={{ borderColor: 'var(--glass-border)', color: ACCENT, background: 'var(--glass-bg)' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Tab: Automatik */}
          {mainTab === 'automatik' && (
            <div className="space-y-6 font-sans">
              {/* Header row: Automatik toggle + Saison */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleAutomation}
                    className="rounded-full border px-4 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all"
                    style={
                      autoOn
                        ? { backgroundColor: 'rgba(74,222,128,0.15)', borderColor: '#4ade80', color: '#4ade80' }
                        : { backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-muted)' }
                    }
                  >
                    Automatik {autoOn ? 'Ein' : 'Aus'}
                  </button>
                  <span
                    className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase"
                    style={{ backgroundColor: `${saisonColor}22`, borderColor: `${saisonColor}66`, color: saisonColor }}
                  >
                    {saisonState || '—'}
                  </span>
                </div>
                {/* Saison selector */}
                <div className="flex gap-2">
                  {['Winter', 'Sommer'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSaison(opt)}
                      className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-all"
                      style={
                        saisonState === opt
                          ? { backgroundColor: `${saisonColor}22`, borderColor: saisonColor, color: saisonColor }
                          : { backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }
                      }
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kaminmodus: Automation ist pausiert */}
              {kaminmodusAktiv && !autoOn && (
                <div
                  className="rounded-2xl border px-4 py-3 text-[12px] font-medium"
                  style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.4)', color: '#f97316' }}
                >
                  🔥 Smartsteuerung pausiert (Kaminmodus)
                </div>
              )}

              {/* Status card */}
              <div className="popup-surface rounded-2xl p-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{modeLvl || '—'}</p>
                  <p className="text-right text-[11px]" style={{ color: 'var(--text-secondary)' }}>{modeSrc}</p>
                </div>
                {statusExplanation && (
                  <p className="text-[12px] font-medium" style={{ color: modeKind === 'aq' ? '#ef9a9a' : '#64b5f6' }}>
                    {statusExplanation}
                  </p>
                )}
                {evalMismatch && (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Nächste Prüfung: {REASONS[evaluation.reason]?.label} ({stageLabel(evaluation.stage === 'summer' ? summerStage : evaluation.stage)})
                  </p>
                )}
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {outsideTemp != null ? outsideTemp.toFixed(1).replace('.', ',') : '—'} °C außen
                  {insideTemp != null ? ` / ${insideTemp.toFixed(1).replace('.', ',')} °C innen` : ''}
                </div>
                {lockEnd && (
                  <div className="text-[12px] font-medium" style={{ color: '#fb923c' }}>
                    Stufe gesperrt bis {formatHm(lockEnd)} (Mindest-Stufendauer {mindestStufendauer.toFixed(0)} min)
                  </div>
                )}
              </div>

              {/* CO₂ mit Schwellen */}
              <div className="popup-surface rounded-2xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                    CO₂{co2OgAvailable ? ' (max. EG/OG)' : ''}
                  </p>
                  <p className="text-sm font-light" style={{ color: co2ColorFor(co2) }}>
                    {co2 != null ? `${co2.toFixed(0)} ppm` : '—'}
                  </p>
                </div>
                <div className="relative h-2 rounded-full" style={{ backgroundColor: 'var(--glass-border)' }}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${co2Scale(co2)}%`, backgroundColor: co2ColorFor(co2) }} />
                  {co2Markers.map((m) => (
                    <div key={m.label} className="absolute -top-1 -bottom-1 w-0.5 rounded" style={{ left: `${co2Scale(m.value)}%`, backgroundColor: m.color }} />
                  ))}
                </div>
                <div className="relative h-7 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {co2Markers.map((m) => (
                    <div key={m.label} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: `${co2Scale(m.value)}%` }}>
                      <div className="font-mono" style={{ color: m.color }}>{m.value.toFixed(0)}</div>
                      <div>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regelkette */}
              <div className="popup-surface rounded-2xl p-4 space-y-1">
                <p className="mb-2 text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                  {isSummer ? 'Sommer-Logik' : 'Regelkette Winter · erste zutreffende gewinnt'}
                </p>
                {isSummer ? (
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    Lüften ({stageLabel(summerStage) || 'Sommer-Stufe'}), wenn außen mindestens 0,5 °C kühler als innen; aus, sobald außen wärmer ist.
                  </p>
                ) : (
                  evaluation.rules.map((rule, i) => {
                    const color = rule.active ? (rule.id === 'aq_medium' || rule.id === 'frost_off' ? '#ef9a9a' : ACCENT) : 'var(--text-secondary)';
                    return (
                      <div
                        key={rule.id}
                        className="flex items-start gap-3 rounded-xl px-3 py-2"
                        style={{
                          backgroundColor: rule.active ? 'rgba(56,189,248,0.1)' : 'transparent',
                          border: `1px solid ${rule.active ? 'rgba(56,189,248,0.35)' : 'transparent'}`,
                          opacity: rule.disabled ? 0.45 : 1,
                        }}
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: rule.active ? color : 'var(--glass-bg)', color: rule.active ? '#0b1220' : 'var(--text-muted)' }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="text-[12px] font-semibold" style={{ color: rule.active ? color : 'var(--text-primary)' }}>
                              {rule.label}
                            </span>
                            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                              {stageLabel(rule.stage)}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{rule.condition}</p>
                          {rule.id === 'aq_medium' ? (
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                              {aqValues.map((v) => (
                                <span key={v.label} style={{ color: v.color }}>
                                  {v.label} {v.value} / {v.limit}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[11px] font-mono" style={{ color: rule.matched && !rule.disabled ? color : 'var(--text-secondary)' }}>
                              {rule.live}
                              {rule.hint && rule.matched ? ` · ${rule.hint}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Schwellenwerte Editor */}
              <div className="popup-surface rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSchwelleOpen((o) => !o)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                    Schwellenwerte
                  </p>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {schwelleOpen ? '▲' : '▼'}
                  </span>
                </button>
                {schwelleOpen && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4" style={{ borderColor: 'var(--glass-border)' }}>
                    <div className="space-y-2">
                      <p className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>Luftqualitäts-Vorrang (Medium)</p>
                      <ThresholdRow label="CO₂" value={th.co2Schwelle} unit=" ppm"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2Schwelle, th.co2Schwelle, -50, 500, 2000)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2Schwelle, th.co2Schwelle, 50, 500, 2000)} />
                      <ThresholdRow label="Feuchte" value={th.feuchteSchwelle} unit="%"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.feuchteSchwelle, th.feuchteSchwelle, -1, 40, 90)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.feuchteSchwelle, th.feuchteSchwelle, 1, 40, 90)} />
                      <ThresholdRow label="VOC" value={th.vocSchwelle} unit=""
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.vocSchwelle, th.vocSchwelle, -10, 100, 500)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.vocSchwelle, th.vocSchwelle, 10, 100, 500)} />
                      <ThresholdRow label="PM2.5" value={th.pm25Schwelle} unit=" µg"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.pm25Schwelle, th.pm25Schwelle, -1, 5, 100)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.pm25Schwelle, th.pm25Schwelle, 1, 5, 100)} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>CO₂-Bedarf (Low)</p>
                      <ThresholdRow label="Low ein" value={th.co2LowEin} unit=" ppm"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2LowEin, th.co2LowEin, -50, 500, 2000)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2LowEin, th.co2LowEin, 50, 500, 2000)} />
                      <ThresholdRow label="Aus unter" value={th.co2Aus} unit=" ppm"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2Aus, th.co2Aus, -50, 400, 2000)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.co2Aus, th.co2Aus, 50, 400, 2000)} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>Außentemperatur</p>
                      <ThresholdRow label="Dauer-Low ab" value={th.dauerbetriebAb} unit="°C"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.dauerbetriebAb, th.dauerbetriebAb, -0.5, 0, 25)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.dauerbetriebAb, th.dauerbetriebAb, 0.5, 0, 25)} />
                      <ThresholdRow label="Frost aus unter" value={th.frostAus} unit="°C"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.frostAus, th.frostAus, -1, -25, 5)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.frostAus, th.frostAus, 1, -25, 5)} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>Sperre &amp; Nacht</p>
                      <ThresholdRow label="Mindest-Stufendauer" value={mindestStufendauer} unit=" min"
                        onDec={() => step(LUFTUNGSANLAGE_ENTITY_IDS.mindestStufendauer, mindestStufendauer, -5, 0, 120)}
                        onInc={() => step(LUFTUNGSANLAGE_ENTITY_IDS.mindestStufendauer, mindestStufendauer, 5, 0, 120)} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nacht-Grundlüftung</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={nightEnabled}
                          onClick={toggleNight}
                          className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-all"
                          style={
                            nightEnabled
                              ? { backgroundColor: 'rgba(56,189,248,0.15)', borderColor: ACCENT, color: ACCENT }
                              : { backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-muted)' }
                          }
                        >
                          {nightEnabled ? 'Ein' : 'Aus'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Schalt-Verlauf */}
              <div className="popup-surface rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setModeHistoryOpen((o) => !o)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                    Schalt-Verlauf (48h)
                  </p>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {modeHistoryOpen ? '▲' : '▼'}
                  </span>
                </button>
                {modeHistoryOpen && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-1" style={{ borderColor: 'var(--glass-border)' }}>
                    {modeHistoryLoading ? (
                      <div className="flex h-12 items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 opacity-30" style={{ borderColor: ACCENT }} />
                      </div>
                    ) : modeHistory.length === 0 ? (
                      <p className="py-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Keine Daten</p>
                    ) : (
                      modeHistory.map((entry, i) => {
                        const { src, lvl, detail } = parseLastMode(entry.state, summerStage);
                        const now = new Date();
                        const isToday = entry.time.toDateString() === now.toDateString();
                        const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
                        const isYesterday = entry.time.toDateString() === yesterday.toDateString();
                        const timeStr = isToday
                          ? entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : isYesterday
                          ? `gestern ${entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : entry.time.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const kind = parseLastMode(entry.state).kind;
                        const dotColor = kind === 'aq' ? '#ef9a9a' : kind === 'off' ? 'var(--text-muted)' : '#64b5f6';
                        return (
                          <div key={i} className="flex items-start gap-3 py-1.5">
                            <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  {lvl || '—'}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                  {src}
                                </span>
                              </div>
                              {detail && (
                                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{detail}</p>
                              )}
                            </div>
                            <span className="flex-shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                              {timeStr}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Luftqualität */}
          {mainTab === 'luftqualitaet' && (
            <div className="space-y-8 font-sans">
              {/* EG */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  {translate('luftungsanlage.eg') || 'EG'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-4">
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      {translate('luftungsanlage.co2') || 'CO₂'}
                    </p>
                    <p className="text-xl font-light" style={{ color: co2ColorFor(co2Eg) }}>
                      {co2Eg != null ? `${co2Eg.toFixed(0)} ppm` : '—'}
                    </p>
                  </div>
                  <InfoTile
                    label={translate('luftungsanlage.feuchte') || 'Feuchte'}
                    value={feuchteEg != null ? `${feuchteEg.toFixed(0)} %` : null}
                  />
                  <InfoTile
                    label="PM2.5"
                    value={pm25Eg != null ? `${pm25Eg.toFixed(1)} µg/m³` : null}
                  />
                  <InfoTile
                    label={translate('luftungsanlage.luftqualitaet') || 'Luftqualität'}
                    value={luftqualitaetEg}
                  />
                </div>
                {/* CO₂ 24h chart */}
                <div className="popup-surface rounded-2xl p-4">
                  <p className="mb-2 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                    CO₂ — 24h
                  </p>
                  {historyLoading ? (
                    <div className="flex h-[80px] items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 opacity-30" style={{ borderColor: ACCENT }} />
                    </div>
                  ) : (
                    <ColoredHistoryGraph
                      data={co2History}
                      height={isCompact ? 75 : 120}
                      thresholds={[
                        { max: th.co2LowEin, color: '#4ade80' },
                        { max: th.co2Schwelle, color: '#fb923c' },
                        { color: '#f87171' },
                      ]}
                    />
                  )}
                </div>
              </div>

              {/* OG */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                  {translate('luftungsanlage.og') || 'OG'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-4">
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      VOC
                    </p>
                    <p className="text-xl font-light" style={{ color: vocOg != null && vocOg > 200 ? '#fb923c' : 'var(--text-primary)' }}>
                      {vocOg != null ? vocOg.toFixed(0) : '—'}
                    </p>
                  </div>
                  <InfoTile
                    label={translate('luftungsanlage.feuchte') || 'Feuchte'}
                    value={feuchteOg != null ? `${feuchteOg.toFixed(0)} %` : null}
                  />
                  <InfoTile
                    label="PM2.5"
                    value={pm25Og != null ? `${pm25Og.toFixed(1)} µg/m³` : null}
                  />
                  <InfoTile
                    label={translate('luftungsanlage.temp') || 'Temperatur'}
                    value={tempOg != null ? `${tempOg.toFixed(1)} °C` : null}
                  />
                </div>
                {/* VOC 24h chart */}
                <div className="popup-surface rounded-2xl p-4">
                  <p className="mb-2 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                    VOC — 24h
                  </p>
                  {historyLoading ? (
                    <div className="flex h-[80px] items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 opacity-30" style={{ borderColor: ACCENT }} />
                    </div>
                  ) : (
                    <ColoredHistoryGraph
                      data={vocHistory}
                      height={isCompact ? 75 : 120}
                      thresholds={[
                        { max: 300, color: '#4ade80' },
                        { max: 400, color: '#fb923c' },
                        { color: '#f87171' },
                      ]}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          </div>{/* end scrollable content */}
        </>
      )}
    </AccessibleModalShell>
  );
}
