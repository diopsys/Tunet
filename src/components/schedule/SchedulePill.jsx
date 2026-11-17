import { memo, useMemo } from 'react';
import { Clock } from '../../icons';
import { useHomeAssistantEntities, useHomeAssistantMeta } from '../../contexts';
import { useSchedules } from '../../hooks/useSchedules';
import { eventVerb, formatWhen, isSkipped, nextSwitchOverall, scheduleContext, scheduleTitle } from '../../utils/scheduleModel';
import { openScheduleOverview } from '../../utils/scheduleEvents';

/** Status-Pill „Nächste Schaltung“ der Zeitschaltuhr; Tippen öffnet die Übersicht. */
function SchedulePill({ isMobile, t }) {
  const entities = useHomeAssistantEntities();
  const { haConfig } = useHomeAssistantMeta();
  const { schedules, settings } = useSchedules();
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const now = Date.now();
  const next = nextSwitchOverall(schedules, now, ctx, { vacation: Boolean(settings?.vacation) });
  if (!next) return null;
  const skipped = isSkipped(next.schedule, next);

  return (
    <button
      type="button"
      onClick={openScheduleOverview}
      className={`flex items-center rounded-2xl text-left ${isMobile ? 'shrink-0 gap-1.5 px-1.5 py-0.5' : 'gap-2 px-2.5 py-1'}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      aria-label={t('schedule.nextSwitch')}
    >
      <span className={`flex-shrink-0 rounded-xl ${isMobile ? 'p-1' : 'p-1.5'}`} style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)' }}>
        <Clock style={{ width: '1.4em', height: '1.4em' }} />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} block max-w-[9rem] truncate leading-tight font-bold text-[var(--text-primary)]`}>
          {scheduleTitle(next.schedule, entities)} {eventVerb(next.schedule, next.kind, t)}
        </span>
        <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} block max-w-[9rem] truncate font-medium text-[var(--text-muted)] ${skipped ? 'line-through' : ''}`}>
          {formatWhen(next.at, now, ctx.tz, t)}
        </span>
      </span>
    </button>
  );
}

export default memo(SchedulePill);
