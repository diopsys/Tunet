import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Edit2, History, Plane, Play, Plus, SkipForward, Sparkles, X } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import { fetchScheduleRuns } from '../services/schedulesApi';
import { scheduleActions } from '../hooks/useSchedules';
import {
  dayKey,
  dayOf,
  describePoint,
  describeWeekdays,
  eventVerb,
  findConflicts,
  formatWhen,
  hacsImportItems,
  hacsScheduleEntities,
  isSkipped,
  nextEvents,
  scheduleContext,
  scheduleTitle,
  targetNames,
} from '../utils/scheduleModel';
import { parseScheduleText } from '../utils/scheduleText';
import DayStrip from '../components/schedule/DayStrip';

const pillButton =
  'inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]';

function ScheduleRow({ schedule, entities, ctx, now, vacation, engineActive, onEdit, t }) {
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const events = nextEvents(schedule, now, ctx, { vacation }, { limit: 2 });
  const next = events[0];
  const skipped = schedule.skipDay || schedule.skipInstance;
  const run = (fn) => async () => {
    setBusy(true);
    setMenu(false);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const windowed = (schedule.mode || 'window') === 'window';
  const times = schedule.slots
    .map((s) => (windowed ? `${describePoint(s.start, t)} – ${describePoint(s.end, t)}` : describePoint(s.start, t)))
    .join(' · ');

  return (
    <div className={`popup-surface space-y-2.5 rounded-2xl p-3.5 ${schedule.enabled ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-[var(--text-primary)]">{scheduleTitle(schedule, entities)}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {windowed ? '' : `${eventVerb(schedule, 'start', t)} · `}
            {times}
          </p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            {describeWeekdays(schedule.weekdays, t)} · {targetNames(schedule, entities).join(', ')}
          </p>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={schedule.enabled}
          aria-label={t('schedule.enabled')}
          disabled={busy}
          onClick={run(() => scheduleActions.setEnabled(schedule, !schedule.enabled))}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${schedule.enabled ? 'bg-[var(--accent-color)]' : 'bg-[var(--glass-bg-hover)]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${schedule.enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      <DayStrip schedule={schedule} ctx={ctx} now={now} vacation={vacation} />

      <div className="flex flex-wrap items-center gap-1.5">
        {schedule.enabled && next && (
          <span className={`text-xs ${isSkipped(schedule, next) ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
            {t('schedule.next')}: <b>{eventVerb(schedule, next.kind, t)}</b> {formatWhen(next.at, now, ctx.tz, t)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {skipped ? (
            <button type="button" disabled={busy} className={pillButton} onClick={run(() => scheduleActions.skip(schedule.id, { mode: 'clear' }))}>
              {t('schedule.unskip')}
            </button>
          ) : (
            schedule.enabled && (
              <div className="relative">
                <button type="button" disabled={busy} className={pillButton} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                  <SkipForward className="h-3 w-3" />
                  {t('schedule.skip')}
                </button>
                {menu && (
                  <div className="popup-surface absolute right-0 z-10 mt-1 w-48 rounded-xl border border-[var(--glass-border)] p-1 shadow-2xl">
                    <button
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--glass-bg-hover)]"
                      onClick={run(() => scheduleActions.skip(schedule.id, { mode: 'day', day: dayKey(dayOf(now, ctx.tz)) }))}
                    >
                      {t('schedule.skipToday')}
                    </button>
                    {events.find((e) => e.kind === 'start') && (
                      <button
                        type="button"
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--glass-bg-hover)]"
                        onClick={run(() =>
                          scheduleActions.skip(schedule.id, {
                            mode: 'instance',
                            instanceKey: nextEvents(schedule, now, ctx, { vacation }, { limit: 4 }).find((e) => e.kind === 'start')?.instanceKey,
                          })
                        )}
                      >
                        {t('schedule.skipNext')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
          {engineActive && (
            <>
              <button type="button" disabled={busy} className={pillButton} onClick={run(() => scheduleActions.runNow(schedule.id, 'start'))} title={t('schedule.testStart')}>
                <Play className="h-3 w-3" />
                {eventVerb(schedule, 'start', t)}
              </button>
              {windowed && (
                <button type="button" disabled={busy} className={pillButton} onClick={run(() => scheduleActions.runNow(schedule.id, 'end'))} title={t('schedule.testEnd')}>
                  <Play className="h-3 w-3" />
                  {eventVerb(schedule, 'end', t)}
                </button>
              )}
            </>
          )}
          <button type="button" className={pillButton} onClick={onEdit}>
            <Edit2 className="h-3 w-3" />
            {t('schedule.edit')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleOverviewModal({ open, onClose, onEdit, onNew, state, entities, areas, haConfig, callService, t }) {
  const { schedules, settings, engine, error } = state;
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState('');
  const [runs, setRuns] = useState(null);
  const [showRuns, setShowRuns] = useState(false);
  const [turnOffHacs, setTurnOffHacs] = useState(true);
  const [importing, setImporting] = useState(null);
  const vacation = Boolean(settings?.vacation);

  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open || !showRuns) return;
    fetchScheduleRuns(60)
      .then((r) => setRuns(r?.runs || []))
      .catch(() => setRuns([]));
  }, [open, showRuns, schedules]);

  const conflicts = useMemo(() => findConflicts(schedules, now, ctx), [schedules, now, ctx]);
  const migrated = new Set(schedules.flatMap((s) => String(s.source || '').split(',')).filter(Boolean));
  const hacs = hacsImportItems(hacsScheduleEntities(entities).filter(([id]) => !migrated.has(id)));

  if (!open) return null;

  const importHacs = async ({ sourceIds, draft }) => {
    setImporting(sourceIds[0]);
    try {
      await scheduleActions.save(draft);
      if (turnOffHacs) await callService('switch', 'turn_off', { entity_id: sourceIds });
    } finally {
      setImporting(null);
    }
  };

  const engineNote = !engine?.active
    ? t(`schedule.engine.${engine?.reason || 'off'}`)
    : engine?.lastError
      ? `${t('schedule.engine.error')}: ${engine.lastError}`
      : null;

  return (
    <AccessibleModalShell
      open={open}
      onClose={onClose}
      titleId="schedule-overview-title"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border font-sans backdrop-blur-xl md:rounded-[2.5rem]"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4 py-4 md:px-7">
            <div className="rounded-2xl bg-[var(--accent-bg)] p-3 text-[var(--accent-color)]">
              <Clock className="h-6 w-6" />
            </div>
            <h2 id="schedule-overview-title" className="min-w-0 flex-1 truncate text-xl font-bold md:text-2xl">
              {t('schedule.title')}
            </h2>
            <button
              type="button"
              onClick={() => scheduleActions.setVacation(!vacation)}
              aria-pressed={vacation}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${vacation ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-[var(--glass-border)] text-[var(--text-secondary)]'}`}
              title={t('schedule.vacationHint')}
            >
              <Plane className="h-3.5 w-3.5" />
              {t('schedule.vacation')}
            </button>
            <button onClick={onClose} className="modal-close" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-7">
            {engineNote && (
              <div className="flex gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {engineNote}
              </div>
            )}
            {error && <div className="rounded-2xl bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error-fg)]">{t('schedule.loadError')}: {error}</div>}

            <form
              className="popup-surface flex gap-2 rounded-2xl p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                const { draft } = parseScheduleText(text, { entities, areas });
                setText('');
                onNew(draft, text);
              }}
            >
              <Sparkles className="mt-2 ml-1 h-4 w-4 flex-shrink-0 text-[var(--accent-color)]" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={t('schedule.textPlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
              />
              <button type="submit" className="rounded-full bg-[var(--accent-color)] px-3 py-1.5 text-xs font-bold text-white">
                {text.trim() ? t('schedule.apply') : <Plus className="h-4 w-4" />}
              </button>
            </form>

            {conflicts.map(({ a, b, entityId }) => (
              <div key={`${a.id}-${b.id}`} className="flex gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {t('schedule.conflict')
                  .replace('{a}', scheduleTitle(a, entities))
                  .replace('{b}', scheduleTitle(b, entities))
                  .replace('{entity}', entities?.[entityId]?.attributes?.friendly_name || entityId)}
              </div>
            ))}

            {schedules.length === 0 && (
              <button type="button" onClick={() => onNew(null)} className="popup-surface w-full rounded-2xl p-6 text-center text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Plus className="mx-auto mb-2 h-6 w-6" />
                {t('schedule.emptyHint')}
              </button>
            )}

            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                entities={entities}
                ctx={ctx}
                now={now}
                vacation={vacation}
                engineActive={Boolean(engine?.active)}
                onEdit={() => onEdit(schedule)}
                t={t}
              />
            ))}

            {hacs.length > 0 && (
              <div className="popup-surface space-y-2 rounded-2xl p-3.5">
                <p className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">{t('schedule.import.title')}</p>
                <p className="text-xs text-[var(--text-secondary)]">{t('schedule.import.hint')}</p>
                {hacs.map((item) => {
                  const { draft, sourceIds } = item;
                  const windowed = draft.mode === 'window';
                  return (
                    <div key={sourceIds.join()} className="flex items-center gap-2 border-t border-[var(--glass-border)] pt-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{draft.name}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {windowed ? '' : `${eventVerb(draft, 'start', t)} · `}
                          {draft.slots.map((s) => (windowed ? `${describePoint(s.start, t)} – ${describePoint(s.end, t)}` : describePoint(s.start, t))).join(', ')} · {describeWeekdays(draft.weekdays, t)}
                          {sourceIds.length > 1 ? ` · ${t('schedule.import.merged')}` : ''}
                        </p>
                      </div>
                      <button type="button" disabled={importing === sourceIds[0]} className={pillButton} onClick={() => importHacs(item)}>
                        {t('schedule.import.action')}
                      </button>
                    </div>
                  );
                })}
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" checked={turnOffHacs} onChange={(e) => setTurnOffHacs(e.target.checked)} />
                  {t('schedule.import.turnOff')}
                </label>
              </div>
            )}

            <div>
              <button type="button" onClick={() => setShowRuns((s) => !s)} className={pillButton} aria-expanded={showRuns}>
                <History className="h-3 w-3" />
                {t('schedule.log')}
              </button>
              {showRuns && (
                <ul className="popup-surface mt-2 max-h-72 space-y-1 overflow-y-auto rounded-2xl p-3 text-xs">
                  {runs == null ? (
                    <li className="text-[var(--text-muted)]">…</li>
                  ) : runs.length === 0 ? (
                    <li className="text-[var(--text-muted)]">{t('schedule.logEmpty')}</li>
                  ) : (
                    runs.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-24 flex-shrink-0 tabular-nums text-[var(--text-muted)]">{formatWhen(r.at, now, ctx.tz, t)}</span>
                        <span className={`w-2 flex-shrink-0 ${r.status === 'ok' ? 'text-green-400' : r.status === 'error' ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>●</span>
                        <span className="min-w-0 flex-1 truncate">
                          <b>{r.scheduleName}</b> · {r.kind} · {r.message}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
