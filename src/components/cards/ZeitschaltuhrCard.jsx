import { memo, useMemo } from 'react';
import { Clock, Plane, Plus } from '../../icons';
import { useHomeAssistantMeta } from '../../contexts';
import { useSchedules } from '../../hooks/useSchedules';
import { scheduleContext } from '../../utils/scheduleModel';
import { openScheduleEditor, openScheduleOverview } from '../../utils/scheduleEvents';
import ScheduleEntry, { sortSchedules } from '../schedule/ScheduleEntry';

/** Karte „Zeitschaltuhr“: alle Zeitpläne mit Tagesleiste und Schalter; Tippen auf einen Eintrag bearbeitet ihn. */
function ZeitschaltuhrCard({ cardId, dragProps, controls, cardStyle, editMode, entities, t }) {
  const { haConfig } = useHomeAssistantMeta();
  const { schedules, settings, loaded, error } = useSchedules();
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const vacation = Boolean(settings?.vacation);

  const sorted = useMemo(() => sortSchedules(schedules, minute * 60_000, ctx, vacation), [schedules, ctx, vacation, minute]);

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback relative flex h-full flex-col gap-1.5 overflow-hidden rounded-3xl border p-3 font-sans select-none ${editMode ? 'cursor-move' : 'cursor-pointer'}`}
      style={cardStyle}
      {...(!editMode
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': t('schedule.title'),
            onClick: openScheduleOverview,
            onKeyDown: (e) => e.key === 'Enter' && e.target === e.currentTarget && openScheduleOverview(),
          }
        : {})}
    >
      {controls}
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          {t('schedule.title')}
        </p>
        <div className="flex items-center gap-1.5">
          {vacation && <Plane className="h-3.5 w-3.5 text-amber-400" aria-label={t('schedule.vacation')} />}
          {!editMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openScheduleEditor({});
              }}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label={t('schedule.new')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!loaded ? (
        <span className="text-xs text-[var(--text-muted)]">…</span>
      ) : error ? (
        <span className="text-xs text-[var(--status-error-fg)]">{t('schedule.loadError')}</span>
      ) : sorted.length === 0 ? (
        <div className="flex flex-1 items-center">
          <span className="text-sm text-[var(--text-muted)]">{t('schedule.emptyHint')}</span>
        </div>
      ) : (
        <div className={`-mx-1.5 grid min-h-0 flex-1 content-start gap-x-3 gap-y-0.5 ${editMode ? 'pointer-events-none overflow-hidden' : 'overflow-y-auto'}`} style={{ scrollbarWidth: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))' }}>
          {sorted.map((s) => (
            <ScheduleEntry key={s.id} schedule={s} entities={entities} ctx={ctx} now={now} vacation={vacation} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(ZeitschaltuhrCard);
