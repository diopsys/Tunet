import { useMemo } from 'react';
import { useHomeAssistantEntities, useHomeAssistantMeta } from '../contexts';
import { scheduleContext, scheduledLightsOn } from '../utils/scheduleModel';
import { useSchedules } from './useSchedules';

/** Lichter, die gerade über ein laufendes Zeitfenster der Zeitschaltuhr an sind. */
export function useScheduledLights() {
  const entities = useHomeAssistantEntities();
  const { haConfig } = useHomeAssistantMeta();
  const { schedules, settings } = useSchedules();
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const minute = Math.floor(Date.now() / 60_000);
  const vacation = Boolean(settings?.vacation);
  return useMemo(
    () => scheduledLightsOn(schedules, entities, minute * 60_000, ctx, { vacation }),
    [schedules, entities, ctx, vacation, minute]
  );
}
