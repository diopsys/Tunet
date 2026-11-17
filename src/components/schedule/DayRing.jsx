import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { parseClock } from '../../../server/scheduler/scheduleTime.js';
import { describePoint, newSlotId, sunTimes, zonedParts } from '../../utils/scheduleModel';

// 24-Stunden-Ring: Zeitfenster als Bögen, Griffe zum Ziehen, Nacht als dunkles Band.
// Ein Griff in der Nähe von Sonnenauf-/-untergang rastet dort ein und hält danach den Versatz zur
// Sonne, bis man ihn weit genug wegzieht.

const SIZE = 320;
const C = SIZE / 2;
const R = 118;
const STROKE = 26;
const SNAP_SUN = 10;
const SUN_RANGE = 180;
const STEP = 5;

const toAngle = (minutes) => (minutes / 1440) * 360 - 90;
const polar = (minutes, r = R) => {
  const a = (toAngle(minutes) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

function arcPath(from, to, r = R) {
  const span = (to - from + 1440) % 1440 || 1440;
  if (span >= 1439) {
    const [x1, y1] = polar(from, r);
    const [x2, y2] = polar(from + 720, r);
    return `M${x1} ${y1}A${r} ${r} 0 1 1 ${x2} ${y2}A${r} ${r} 0 1 1 ${x1} ${y1}`;
  }
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(from + span, r);
  return `M${x1} ${y1}A${r} ${r} 0 ${span > 720 ? 1 : 0} 1 ${x2} ${y2}`;
}

const minutesOfDay = (ms, tz) => {
  const p = zonedParts(ms, tz);
  return p.hour * 60 + p.minute;
};

const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function DayRing({ slots, mode = 'window', onChange, ctx, now = Date.now(), t, color = 'var(--accent-color)', readOnly = false }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [selected, setSelected] = useState(0);
  const windowed = mode === 'window';

  const sun = useMemo(() => {
    const p = zonedParts(now, ctx.tz);
    const s = sunTimes(p.y, p.m, p.d, ctx.lat, ctx.lon);
    return {
      sunrise: s.sunrise == null ? null : minutesOfDay(s.sunrise, ctx.tz),
      sunset: s.sunset == null ? null : minutesOfDay(s.sunset, ctx.tz),
    };
  }, [now, ctx]);

  const pointMinutes = useCallback(
    (point) => {
      if (!point) return null;
      if (point.type === 'sunrise' || point.type === 'sunset') {
        const base = sun[point.type];
        return base == null ? null : (((base + (point.offset || 0)) % 1440) + 1440) % 1440;
      }
      return parseClock(point.time);
    },
    [sun]
  );

  const minutesFromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SIZE - C;
    const y = ((event.clientY - rect.top) / rect.height) * SIZE - C;
    const angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    return Math.round((((angle + 360) % 360) / 360) * 1440 / STEP) * STEP % 1440;
  };

  // Neuer Punkt aus der Zeigerposition, unter Berücksichtigung der Sonne
  const pointFor = (minutes, previous) => {
    // Abstand zur Sonnenzeit im Bereich −720…+719 Minuten (über Mitternacht hinweg)
    const diff = (base) => ((minutes - base + 2160) % 1440) - 720;
    const near = (base) => base != null && Math.abs(diff(base)) <= SUN_RANGE;
    if (previous && (previous.type === 'sunrise' || previous.type === 'sunset') && near(sun[previous.type])) {
      return { type: previous.type, offset: Math.round(diff(sun[previous.type]) / STEP) * STEP };
    }
    for (const type of ['sunset', 'sunrise']) {
      if (sun[type] != null && Math.abs(diff(sun[type])) <= SNAP_SUN) return { type, offset: 0 };
    }
    return { type: 'time', time: fmt(minutes) };
  };

  const update = (index, edge, point) => {
    onChange(slots.map((s, i) => (i === index ? { ...s, [edge]: point } : s)));
  };

  const onPointerMove = (event) => {
    if (!drag) return;
    event.preventDefault();
    const minutes = minutesFromEvent(event);
    const slot = slots[drag.index];
    if (!slot) return;
    const previous = slot[drag.edge];
    if (drag.edge === 'end' && previous?.type === 'duration') {
      // Dauer bleibt Dauer: Abstand zum Einschalten
      const from = pointMinutes(slot.start);
      const span = Math.max(STEP, ((minutes - from + 1440) % 1440) || 1440);
      update(drag.index, 'end', { type: 'duration', minutes: Math.min(1439, span) });
      return;
    }
    update(drag.index, drag.edge, pointFor(minutes, previous));
  };

  const startDrag = (index, edge) => (event) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelected(index);
    setDrag({ index, edge });
  };

  const addAt = (event) => {
    if (readOnly || drag) return;
    const minutes = minutesFromEvent(event);
    const start = pointFor(minutes, null);
    const durationStyle = slots[0]?.end?.type === 'duration';
    const end = windowed ? (durationStyle ? { type: 'duration', minutes: 60 } : { type: 'time', time: fmt((minutes + 60) % 1440) }) : null;
    onChange([...slots, { id: newSlotId(), start, end }]);
    setSelected(slots.length);
  };

  const removeSelected = () => {
    if (slots.length <= 1) return;
    onChange(slots.filter((_, i) => i !== selected));
    setSelected(0);
  };

  const nightFrom = sun.sunset;
  const nightTo = sun.sunrise;
  const nowMin = minutesOfDay(now, ctx.tz);
  const current = slots[selected] || slots[0];
  const label = drag ? describePoint(slots[drag.index]?.[drag.edge], t) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[320px] select-none"
        style={{ touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        role="group"
        aria-label={t('schedule.ring')}
      >
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--glass-bg-hover)" strokeWidth={STROKE} onClick={addAt} style={{ cursor: readOnly ? 'default' : 'copy' }} />
        {nightFrom != null && nightTo != null && (
          <path d={arcPath(nightFrom, nightTo, R + STROKE / 2 + 7)} fill="none" stroke="rgba(99,102,241,.45)" strokeWidth="4" strokeLinecap="round" />
        )}
        {nightFrom != null && nightTo != null && (
          <path d={arcPath(nightTo, nightFrom, R + STROKE / 2 + 7)} fill="none" stroke="rgba(250,204,21,.4)" strokeWidth="4" strokeLinecap="round" />
        )}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = polar(h * 60, R - STROKE / 2 - 4);
          const [x2, y2] = polar(h * 60, R - STROKE / 2 - (h % 6 ? 8 : 13));
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-muted)" strokeOpacity={h % 6 ? 0.35 : 0.7} strokeWidth="1.5" />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = polar(h * 60, R - STROKE / 2 - 24);
          return (
            <text key={h} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {h}
            </text>
          );
        })}
        {[['sunrise', '☀'], ['sunset', '☾']].map(([type, glyph]) =>
          sun[type] == null ? null : (
            <text key={type} x={polar(sun[type], R + STROKE / 2 + 18)[0]} y={polar(sun[type], R + STROKE / 2 + 18)[1] + 5} textAnchor="middle" fontSize="13" fill={type === 'sunrise' ? '#facc15' : '#a5b4fc'}>
              {glyph}
            </text>
          )
        )}

        {slots.map((slot, i) => {
          const from = pointMinutes(slot.start);
          const to = !windowed || !slot.end
            ? null
            : slot.end.type === 'duration'
              ? (from + Math.round(slot.end.minutes || 0)) % 1440
              : pointMinutes(slot.end);
          if (from == null) return null;
          const active = i === selected;
          return (
            <g key={slot.id || i} onClick={(e) => { e.stopPropagation(); setSelected(i); }}>
              {windowed && to != null && (
                <path d={arcPath(from, to)} fill="none" stroke={color} strokeOpacity={active ? 0.95 : 0.55} strokeWidth={STROKE - 6} strokeLinecap="round" />
              )}
              {[['start', from], ...(windowed && to != null ? [['end', to]] : [])].map(([edge, m]) => {
                const [x, y] = polar(m);
                const sunny = slot[edge]?.type === 'sunrise' || slot[edge]?.type === 'sunset';
                return (
                  <g key={edge} onPointerDown={startDrag(i, edge)} style={{ cursor: readOnly ? 'default' : 'grab' }}>
                    <circle cx={x} cy={y} r={22} fill="transparent" />
                    <circle cx={x} cy={y} r={active ? 12 : 10} fill="var(--modal-bg, #0f172a)" stroke={color} strokeWidth="3" />
                    {sunny && <circle cx={x} cy={y} r={4} fill={slot[edge].type === 'sunrise' ? '#facc15' : '#a5b4fc'} />}
                    {!windowed && <circle cx={x} cy={y} r={4} fill={color} />}
                  </g>
                );
              })}
            </g>
          );
        })}

        <circle cx={polar(nowMin, R - STROKE / 2 - 2)[0]} cy={polar(nowMin, R - STROKE / 2 - 2)[1]} r="3.5" fill="var(--text-primary)" />

        <text x={C} y={C - 22} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          {label ? t('schedule.dragging') : windowed ? t('schedule.window') : t('schedule.switchPoint')}
        </text>
        {(label ? [label] : current ? [describePoint(current.start, t), ...(windowed && current.end ? [`– ${describePoint(current.end, t)}`] : [])] : ['–']).map((line, i) => (
          <text key={i} x={C} y={C + 2 + i * 20} textAnchor="middle" fontSize={line.length > 18 ? 11.5 : 16} fontWeight="700" fill="var(--text-primary)">
            {line}
          </text>
        ))}
        {!readOnly && slots.length > 1 && !drag && (
          <text x={C} y={C + 50} textAnchor="middle" fontSize="11" fill="var(--status-error-fg, #f87171)" style={{ cursor: 'pointer' }} onClick={removeSelected}>
            {t('schedule.removeSlot')}
          </text>
        )}
      </svg>
      {!readOnly && <p className="text-center text-[11px] text-[var(--text-muted)]">{t('schedule.ringHint')}</p>}
    </div>
  );
}

export default memo(DayRing);
