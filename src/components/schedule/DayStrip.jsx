import { memo } from 'react';
import { nextEvents, sunTimes, zonedParts } from '../../utils/scheduleModel';

/** Schmale 24-h-Leiste: Nacht dunkel, Zeitfenster bzw. Schaltpunkte farbig. */
function DayStrip({ schedule, ctx, now, vacation = false, className = 'h-2.5', dim = false }) {
  const p = zonedParts(now, ctx.tz);
  const sun = sunTimes(p.y, p.m, p.d, ctx.lat, ctx.lon);
  const pct = (ms) => {
    const z = zonedParts(ms, ctx.tz);
    return ((z.hour * 60 + z.minute) / 1440) * 100;
  };
  const today = nextEvents(schedule, now - 86_400_000, ctx, { vacation }, { limit: 12, days: 2 });
  const items = [];
  for (const e of today) {
    if (e.kind !== 'start') continue;
    const end = today.find((x) => x.kind === 'end' && x.instanceKey === e.instanceKey);
    const from = pct(e.at);
    if (end) {
      const to = pct(end.at);
      if (to > from) items.push({ left: from, width: to - from });
      else items.push({ left: from, width: 100 - from }, { left: 0, width: to });
    } else items.push({ left: from, width: 0.8, point: true });
  }
  return (
    <div className={`relative ${className} overflow-hidden rounded-full bg-[rgba(250,204,21,.15)]`}>
      {sun.sunrise != null && <div className="absolute inset-y-0 left-0 bg-[rgba(99,102,241,.3)]" style={{ width: `${pct(sun.sunrise)}%` }} />}
      {sun.sunset != null && <div className="absolute inset-y-0 right-0 bg-[rgba(99,102,241,.3)]" style={{ left: `${pct(sun.sunset)}%` }} />}
      {items.map((it, i) => (
        <div
          key={i}
          className={`absolute inset-y-0 rounded-full ${dim ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-color)]'}`}
          style={{ left: `${it.left}%`, width: `${Math.max(it.width, 0.8)}%` }}
        />
      ))}
      <div className="absolute inset-y-0 w-0.5 bg-[var(--text-primary)]" style={{ left: `${pct(now)}%` }} />
    </div>
  );
}

export default memo(DayStrip);
