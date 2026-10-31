import { useState, useEffect } from 'react';
import { X, Battery, Play, Pause, Home } from '../icons';
import { Icon as MdiIcon } from '@mdi/react';
import { mdiRobotMower } from '@mdi/js';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import { getHistory, getHistoryRest } from '../services/haClient';

const HIST_DAYS = 14;
const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function getTs(item) {
  const ts = item.last_changed ?? item.lu ?? item.lc ?? item.last_updated;
  if (typeof ts === 'number') return new Date(ts * 1000);
  return new Date(ts);
}

function getMowerStateLabel(state) {
  const s = String(state || '').toLowerCase();
  if (s === 'mowing') return 'Mäht';
  if (s === 'paused') return 'Pausiert';
  if (s === 'docked') return 'Docked';
  if (s === 'returning') return 'Kehrt zurück';
  if (s === 'error') return 'Fehler';
  return state;
}

function fmtDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} Min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function parseMowingSessions(histData) {
  if (!Array.isArray(histData) || histData.length === 0) return [];
  const sessions = [];
  let sessionStart = null;
  let lastMowingTs = null;

  for (const item of histData) {
    const t = getTs(item);
    if (isNaN(t.getTime())) continue;
    const s = (item.state ?? item.s ?? '').toLowerCase();

    if (s === 'mowing') {
      if (!sessionStart) sessionStart = t;
      lastMowingTs = t;
    } else if ((s === 'docked' || s === 'returning') && sessionStart) {
      sessions.push({ start: sessionStart, end: t, durationMs: t - sessionStart });
      sessionStart = null;
      lastMowingTs = null;
    } else if (s === 'error' && sessionStart) {
      const end = lastMowingTs || t;
      sessions.push({ start: sessionStart, end, durationMs: end - sessionStart, hadError: true });
      sessionStart = null;
      lastMowingTs = null;
    }
  }
  if (sessionStart && lastMowingTs) {
    sessions.push({ start: sessionStart, end: lastMowingTs, durationMs: lastMowingTs - sessionStart, ongoing: true });
  }

  return sessions.reverse();
}

/** Build an array of {date, label, totalMs, sessions} for the last HIST_DAYS days */
function buildDailyBars(sessions) {
  const days = [];
  const now = new Date();
  for (let i = HIST_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const nextD = new Date(d);
    nextD.setDate(nextD.getDate() + 1);
    const daySessions = sessions.filter((s) => s.start >= d && s.start < nextD);
    const totalMs = daySessions.reduce((sum, s) => sum + s.durationMs, 0);
    days.push({
      label: DAY_SHORT[d.getDay()],
      dayNum: d.getDate(),
      totalMs,
      sessions: daySessions,
      isToday: i === 0,
    });
  }
  return days;
}

async function fetchMowerHistory(conn, haUrl, haToken, mowerId) {
  const start = new Date();
  start.setDate(start.getDate() - HIST_DAYS);
  const end = new Date();
  const opts = {
    entityId: mowerId,
    start,
    end,
    minimal_response: false,
    no_attributes: false,
    significant_changes_only: true,
  };
  if (conn) {
    try {
      const wsData = await getHistory(conn, opts);
      const raw = Array.isArray(wsData?.[0]) ? wsData[0] : Array.isArray(wsData) ? wsData : [];
      if (raw.length > 0) return raw;
    } catch (_e) {}
  }
  try {
    const data = await getHistoryRest(haUrl, haToken, opts);
    return Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : [];
  } catch (_e2) {
    return [];
  }
}

function MowingChart({ bars }) {
  const [hovered, setHovered] = useState(null);
  const maxMs = Math.max(...bars.map((b) => b.totalMs), 1);
  const CHART_H = 80;

  return (
    <div className="select-none">
      {/* Bars */}
      <div className="relative flex items-end gap-[3px]" style={{ height: CHART_H }}>
        {bars.map((bar, i) => {
          const barH = bar.totalMs > 0 ? Math.max((bar.totalMs / maxMs) * CHART_H, 5) : 0;
          const isHov = hovered === i;
          return (
            <div
              key={i}
              className="relative flex-1 cursor-default"
              style={{ height: CHART_H }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHov && bar.totalMs > 0 && (
                <div
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-lg"
                  style={{
                    bottom: barH + 6,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--card-bg)',
                    borderColor: 'var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {fmtDuration(bar.totalMs)}
                </div>
              )}

              {/* Bar */}
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md transition-colors duration-100"
                style={{
                  height: barH || 2,
                  background: bar.totalMs > 0
                    ? (isHov ? '#22c55e' : 'color-mix(in srgb, #22c55e 55%, transparent)')
                    : 'var(--glass-border)',
                  borderRadius: bar.totalMs > 0 ? '4px 4px 0 0' : '2px',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="mt-1 flex gap-[3px]">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <span
              className="text-[9px] font-bold leading-none"
              style={{ color: bar.isToday ? 'var(--accent-color)' : 'var(--text-muted)' }}
            >
              {bar.label}
            </span>
            <span
              className="text-[9px] leading-none mt-0.5 opacity-60"
              style={{ color: bar.isToday ? 'var(--accent-color)' : 'var(--text-muted)' }}
            >
              {bar.dayNum}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NavimowModal({ show, onClose, mowerId, entities, callService, conn, haUrl, haToken }) {
  const [sessions, setSessions] = useState(null);
  const [loading, setLoading] = useState(false);

  const entity = entities?.[mowerId];
  const state = entity?.state;
  const battery = entity?.attributes?.battery;
  const name = entity?.attributes?.friendly_name || 'Navimow';
  const isMowing = state === 'mowing';
  const isUnavailable = state === 'unavailable' || state === 'unknown' || !state;

  useEffect(() => {
    if (!show || !mowerId) return;
    if (!haUrl && !conn) return;
    setLoading(true);
    setSessions(null);
    fetchMowerHistory(conn, haUrl, haToken, mowerId).then((data) => {
      setSessions(parseMowingSessions(data));
      setLoading(false);
    });
  }, [show, mowerId, conn, haUrl, haToken]);

  const bars = sessions ? buildDailyBars(sessions) : null;

  const lastSession = sessions?.[0];
  const totalThisWeek = sessions
    ? sessions
        .filter((s) => s.start > new Date(Date.now() - 7 * 86400000))
        .reduce((sum, s) => sum + s.durationMs, 0)
    : 0;
  const sessionCountThisWeek = sessions
    ? sessions.filter((s) => s.start > new Date(Date.now() - 7 * 86400000)).length
    : 0;

  const handleStart = () => {
    if (isUnavailable) return;
    if (isMowing) {
      callService('lawn_mower', 'pause', { entity_id: mowerId });
    } else {
      callService('lawn_mower', 'start_mowing', { entity_id: mowerId });
    }
  };

  const handleDock = () => {
    if (isUnavailable) return;
    callService('lawn_mower', 'dock', { entity_id: mowerId });
  };

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId="navimow-modal-title"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border font-sans backdrop-blur-xl"
      panelStyle={{
        background: 'var(--card-bg)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--glass-border)' }}>
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 ${isMowing ? 'animate-pulse bg-[color-mix(in_srgb,#22c55e_15%,transparent)]' : 'bg-[var(--glass-bg)]'}`}>
                <MdiIcon path={mdiRobotMower} size={0.9} color={isMowing ? '#22c55e' : 'var(--text-secondary)'} />
              </div>
              <div>
                <h2 id="navimow-modal-title" className="text-base font-bold text-[var(--text-primary)]">{name}</h2>
                <p className="text-xs text-[var(--text-secondary)]">{getMowerStateLabel(state)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {typeof battery === 'number' && (
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1">
                  <Battery className="h-3 w-3 text-[var(--text-secondary)]" />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{battery}%</span>
                </div>
              )}
              <button onClick={onClose} className="modal-close rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3 border-b px-6 py-4" style={{ borderColor: 'var(--glass-border)' }}>
            <button
              onClick={handleStart}
              disabled={isUnavailable}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--glass-bg)] py-3 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--glass-bg-hover)] active:scale-95 disabled:opacity-40"
            >
              {isMowing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
              {isMowing ? 'Pausieren' : 'Starten'}
            </button>
            <button
              onClick={handleDock}
              disabled={isUnavailable}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--glass-bg)] py-3 text-sm font-bold text-[var(--text-secondary)] transition-all hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] active:scale-95 disabled:opacity-40"
            >
              <Home className="h-4 w-4" />
              Zur Station
            </button>
          </div>

          {/* Stats */}
          {sessions && sessions.length > 0 && (
            <div className="grid grid-cols-3 gap-3 border-b px-6 py-4" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex flex-col items-center rounded-2xl bg-[var(--glass-bg)] py-3">
                <span className="text-xl font-thin text-[var(--text-primary)]">{sessionCountThisWeek}</span>
                <span className="mt-1 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">Einsätze</span>
                <span className="text-[9px] text-[var(--text-muted)]">diese Woche</span>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-[var(--glass-bg)] py-3">
                <span className="text-xl font-thin text-[var(--text-primary)]">{totalThisWeek > 0 ? fmtDuration(totalThisWeek) : '—'}</span>
                <span className="mt-1 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">Gesamt</span>
                <span className="text-[9px] text-[var(--text-muted)]">diese Woche</span>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-[var(--glass-bg)] py-3">
                <span className="text-xl font-thin text-[var(--text-primary)]">{lastSession ? fmtDuration(lastSession.durationMs) : '—'}</span>
                <span className="mt-1 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">Dauer</span>
                <span className="text-[9px] text-[var(--text-muted)]">letzter Einsatz</span>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="overflow-y-auto px-6 py-4">
            <p className="mb-4 text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
              Mähzeiten — letzte {HIST_DAYS} Tage
            </p>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
              </div>
            )}

            {!loading && sessions?.length === 0 && (
              <p className="py-6 text-center text-sm italic text-[var(--text-muted)]">
                Keine Mähsitzungen in den letzten {HIST_DAYS} Tagen
              </p>
            )}

            {!loading && bars && sessions && sessions.length > 0 && (
              <MowingChart bars={bars} />
            )}
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
