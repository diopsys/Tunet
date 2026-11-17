import { memo, useMemo } from 'react';
import { Plus } from '../../icons';
import { useHomeAssistantMeta } from '../../contexts';
import { useSchedules } from '../../hooks/useSchedules';
import { scheduleContext } from '../../utils/scheduleModel';
import { openScheduleEditor } from '../../utils/scheduleEvents';
import ScheduleEntry, { sortSchedules } from './ScheduleEntry';

/** Zeitpläne der Zeitschaltuhr als Kacheln im Licht-Panel (Bereich „Zeitsteuerung“). */
function PanelSchedules({ entities, editMode, t }) {
  const { haConfig } = useHomeAssistantMeta();
  const { schedules, settings, loaded } = useSchedules();
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const vacation = Boolean(settings?.vacation);
  const sorted = useMemo(() => sortSchedules(schedules, minute * 60_000, ctx, vacation), [schedules, ctx, vacation, minute]);

  if (!loaded) return null;
  return (
    <div className={`col-span-full grid gap-3 ${editMode ? 'pointer-events-none' : ''}`} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
      {sorted.map((s) => (
        <ScheduleEntry key={s.id} schedule={s} entities={entities} ctx={ctx} now={now} vacation={vacation} t={t} variant="tile" />
      ))}
      <button
        type="button"
        onClick={() => openScheduleEditor({})}
        className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--glass-border)] text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Plus className="h-4 w-4" />
        {t('schedule.new')}
      </button>
    </div>
  );
}

export default memo(PanelSchedules);
