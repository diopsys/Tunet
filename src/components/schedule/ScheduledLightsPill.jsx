import { memo } from 'react';
import { Lightbulb } from '../../icons';
import { openScheduleOverview } from '../../utils/scheduleEvents';
import { formatClock, scheduleContext, scheduleTitle } from '../../utils/scheduleModel';
import { useHomeAssistantEntities, useHomeAssistantMeta } from '../../contexts';

/**
 * Status-Pill „Zeitsteuerung“: Lichter, die gerade über die Zeitschaltuhr an sind.
 * Ist sie konfiguriert, zählt die Pill „Lichter an“ diese Lichter nicht mehr mit.
 */
function ScheduledLightsPill({ items, isMobile, t }) {
  const entities = useHomeAssistantEntities();
  const { haConfig } = useHomeAssistantMeta();
  if (!items?.length) return null;

  const schedules = [...new Map(items.map((it) => [it.schedule.id, it])).values()];
  const title = schedules.length === 1 ? scheduleTitle(schedules[0].schedule, entities) : t('schedule.lightsPill');
  const latestEnd = Math.max(...items.map((it) => it.end ?? 0));
  const { tz } = scheduleContext(haConfig);
  const sub = [
    `${items.length} ${items.length === 1 ? t('schedule.lightsPillOne') : t('schedule.lightsPillMany')}`,
    latestEnd ? `${t('schedule.cardUntil')} ${formatClock(latestEnd, tz)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Mobil wie die übrigen Pills nur Symbol mit Zähler
  if (isMobile) {
    return (
      <button
        type="button"
        onClick={openScheduleOverview}
        className="relative flex shrink-0 items-center justify-center rounded-2xl p-1.5 pr-6 transition-all active:scale-95"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        aria-label={`${title}: ${sub}`}
      >
        <span className="rounded-xl p-1" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)' }}>
          <Lightbulb className="h-3 w-3" />
        </span>
        <span className="absolute top-1 right-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent-color)] px-1.5 text-[10px] font-bold text-white shadow-sm">
          {items.length}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openScheduleOverview}
      className={`flex items-center rounded-2xl text-left ${isMobile ? 'shrink-0 gap-1.5 px-1.5 py-0.5' : 'gap-2 px-2.5 py-1'}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      aria-label={t('schedule.lightsPill')}
    >
      <span className={`relative flex-shrink-0 rounded-xl ${isMobile ? 'p-1' : 'p-1.5'}`} style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)' }}>
        <Lightbulb style={{ width: '1.4em', height: '1.4em' }} />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-[var(--accent-color)]" />
      </span>
      <span className="flex min-w-0 flex-col items-start">
        <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} block max-w-[9rem] truncate leading-tight font-bold text-[var(--text-primary)]`}>{title}</span>
        <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} block max-w-[9rem] truncate font-medium text-[var(--text-muted)]`}>{sub}</span>
      </span>
    </button>
  );
}

export default memo(ScheduledLightsPill);
