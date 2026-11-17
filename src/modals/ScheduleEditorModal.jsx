import { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Sparkles, Trash2, X } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import DayRing from '../components/schedule/DayRing';
import {
  ALL_WEEKDAYS,
  WEEKEND,
  WORKDAYS,
  eventVerb,
  formatWhen,
  isPickable,
  nextEvents,
  newSlotId,
  scheduleContext,
  targetKind,
} from '../utils/scheduleModel';
import { parseScheduleText } from '../utils/scheduleText';
import { parseClock } from '../../server/scheduler/scheduleTime.js';

const clockOf = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function DurationEditor({ minutes, onChange, t }) {
  const total = Math.max(1, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const setParts = (hours, mins) => onChange({ type: 'duration', minutes: Math.min(1439, Math.max(1, hours * 60 + mins)) });
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
      <input type="number" min="0" max="23" value={h} onChange={(e) => setParts(Number(e.target.value) || 0, m)} className={`${inputBase} w-20`} aria-label={t('schedule.hours')} />
      <span>{t('schedule.hoursShort')}</span>
      <input type="number" min="0" max="55" step="5" value={m} onChange={(e) => setParts(h, Number(e.target.value) || 0)} className={`${inputBase} w-20`} aria-label={t('schedule.minutes')} />
      <span>min</span>
    </div>
  );
}

const RAMP_STEPS = [0, 5, 10, 15, 20, 30, 45, 60];

const chip = (active) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? 'border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]'
      : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
  }`;
const label = 'mb-2 block text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase';
const inputBase =
  'rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]';
const input = `w-full ${inputBase}`;

function Section({ title, children }) {
  return (
    <section className="popup-surface space-y-3 rounded-2xl p-4">
      <h3 className={label}>{title}</h3>
      {children}
    </section>
  );
}

function PointEditor({ point, onChange, title, t }) {
  const type = point?.type || 'time';
  return (
    <div className="min-w-0 flex-1">
      <span className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)] uppercase">
        {title}
      </span>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) =>
            onChange(
              e.target.value === 'time'
                ? { type: 'time', time: point?.time || '18:00' }
                : { type: e.target.value, offset: 0 }
            )
          }
          className={`${inputBase} min-w-0 flex-1`}
        >
          <option value="time">{t('schedule.clockTime')}</option>
          <option value="sunrise">{t('schedule.sunrise')}</option>
          <option value="sunset">{t('schedule.sunset')}</option>
        </select>
        {type === 'time' ? (
          <input
            type="time"
            value={point?.time || ''}
            onChange={(e) => onChange({ type: 'time', time: e.target.value })}
            className={`${inputBase} w-28 flex-shrink-0`}
          />
        ) : (
          <input
            type="number"
            step="5"
            min="-360"
            max="360"
            value={point?.offset || 0}
            onChange={(e) => onChange({ type, offset: Number(e.target.value) || 0 })}
            className={`${inputBase} w-28 flex-shrink-0`}
            aria-label={t('schedule.minutesOffset')}
            title={t('schedule.minutesOffset')}
          />
        )}
        {type !== 'time' && <span className="self-center text-xs text-[var(--text-muted)]">min</span>}
      </div>
    </div>
  );
}

function EntityPicker({ entities, selected, onAdd, t }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.entries(entities || {})
      .filter(([id]) => isPickable(id) && !selected.includes(id))
      .filter(
        ([id, e]) =>
          id.includes(q) ||
          String(e?.attributes?.friendly_name || '')
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 8);
  }, [query, entities, selected]);
  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('schedule.searchDevice')}
        className={input}
      />
      {matches.length > 0 && (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1">
          {matches.map(([id, e]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onAdd(id);
                setQuery('');
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--glass-bg-hover)]"
            >
              <span className="truncate text-[var(--text-primary)]">
                {e?.attributes?.friendly_name || id}
              </span>
              <span className="truncate text-[10px] text-[var(--text-muted)]">{id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntitySelect({ value, onChange, entities, filter, placeholder }) {
  const options = useMemo(
    () =>
      Object.entries(entities || {})
        .filter(([id]) => filter(id))
        .sort((a, b) => a[0].localeCompare(b[0])),
    [entities, filter]
  );
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={input}
    >
      <option value="">{placeholder}</option>
      {options.map(([id, e]) => (
        <option key={id} value={id}>
          {e?.attributes?.friendly_name ? `${e.attributes.friendly_name} (${id})` : id}
        </option>
      ))}
    </select>
  );
}

const isLux = (id) =>
  id.startsWith('sensor.') && /lux|illuminance|helligkeit|beleuchtungsst/.test(id);
const isFlag = (id) => /^(calendar|binary_sensor|input_boolean)\./.test(id);

export default function ScheduleEditorModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
  entities,
  areas,
  haConfig,
  t,
}) {
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const now = Date.now();

  useEffect(() => {
    setDraft(initial);
    setText('');
    setParsed(null);
    setError('');
    setConfirmDelete(false);
  }, [initial]);

  if (!open || !draft) return null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setAction = (phase, key, value) =>
    setDraft((d) => {
      const next = { ...d.action[phase] };
      if (value == null || value === '') delete next[key];
      else next[key] = value;
      return { ...d, action: { ...d.action, [phase]: next } };
    });
  const setCond = (patch) => setDraft((d) => ({ ...d, conditions: { ...d.conditions, ...patch } }));
  const kind = targetKind(draft);
  const windowed = (draft.mode || 'window') === 'window';
  const targetsEmpty = !draft.targets.entities.length && !draft.targets.areas.length;
  const preview = targetsEmpty
    ? []
    : nextEvents({ ...draft, id: draft.id || 'neu' }, now, ctx, {}, { limit: 5 });

  const applyText = () => {
    const result = parseScheduleText(text, { entities, areas });
    const keepsTargets =
      !result.draft.targets.entities.length && !result.draft.targets.areas.length && !targetsEmpty;
    setParsed(
      keepsTargets ? { ...result, missing: result.missing.filter((m) => m !== 'target') } : result
    );
    setDraft((d) => ({
      ...result.draft,
      id: d.id,
      name: d.name || result.draft.name,
      targets:
        result.draft.targets.entities.length || result.draft.targets.areas.length
          ? result.draft.targets
          : d.targets,
    }));
  };

  // Ausschalten: zu einer Uhrzeit, nach einer Dauer oder gar nicht – alles in einem Zeitplan
  const offStyle =
    draft.mode === 'on' || draft.mode === 'off'
      ? 'none'
      : draft.slots[0]?.end?.type === 'duration'
        ? 'duration'
        : 'time';
  const setOffStyle = (style) =>
    setDraft((d) => ({
      ...d,
      mode: style === 'none' ? 'on' : 'window',
      slots: d.slots.map((slot) => {
        // „Nur ausschalten“ aus dem HACS-Umzug: bisheriger Schaltpunkt wird zum Ausschalten
        const legacyOff = d.mode === 'off';
        const start = legacyOff ? { type: 'sunset', offset: 0 } : slot.start;
        const previousEnd = legacyOff ? slot.start : slot.end;
        if (style === 'none') return { ...slot, start, end: null };
        if (style === 'duration') {
          if (previousEnd?.type === 'duration') return { ...slot, start, end: previousEnd };
          const a = parseClock(start?.time);
          const b = parseClock(previousEnd?.time);
          const minutes = start?.type === 'time' && previousEnd?.type === 'time' && a != null && b != null ? (b - a + 1440) % 1440 || 60 : 120;
          return { ...slot, start, end: { type: 'duration', minutes } };
        }
        if (previousEnd && previousEnd.type !== 'duration') return { ...slot, start, end: previousEnd };
        const a = parseClock(start?.time);
        const end = start?.type === 'time' && a != null && previousEnd?.type === 'duration'
          ? clockOf(a + previousEnd.minutes)
          : '23:00';
        return { ...slot, start, end: { type: 'time', time: end } };
      }),
    }));

  const toggleDay = (day) =>
    set({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((d) => d !== day)
        : [...draft.weekdays, day].sort(),
    });
  const sameDays = (list) =>
    draft.weekdays.length === list.length && list.every((d) => draft.weekdays.includes(d));

  const toggleArea = (area) => {
    const exists = draft.targets.areas.some((a) => a.id === area.area_id);
    const domain = 'light';
    set({
      targets: {
        ...draft.targets,
        areas: exists
          ? draft.targets.areas.filter((a) => a.id !== area.area_id)
          : [...draft.targets.areas, { id: area.area_id, name: area.name, domain }],
      },
    });
  };

  const save = async () => {
    setError('');
    if (targetsEmpty) return setError(t('schedule.error.noTarget'));
    if (!draft.weekdays.length) return setError(t('schedule.error.noDay'));
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name?.trim() || '' });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccessibleModalShell
      open={open}
      onClose={onClose}
      titleId="schedule-editor-title"
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.35)' }}
      panelClassName="popup-anim relative flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border font-sans backdrop-blur-xl md:rounded-[2.5rem]"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4 py-4 md:px-8">
            <div className="rounded-2xl bg-[var(--accent-bg)] p-3 text-[var(--accent-color)]">
              <Clock className="h-6 w-6" />
            </div>
            <input
              id="schedule-editor-title"
              value={draft.name || ''}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={t('schedule.namePlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-xl font-bold text-[var(--text-primary)] outline-none md:text-2xl"
            />
            <button onClick={onClose} className="modal-close" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8">
            <div className="popup-surface mb-4 rounded-2xl p-3">
              <div className="flex gap-2">
                <Sparkles className="mt-2.5 h-4 w-4 flex-shrink-0 text-[var(--accent-color)]" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && text.trim()) applyText();
                  }}
                  placeholder={t('schedule.textPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--text-primary)] outline-none"
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={applyText}
                  className={`${chip(true)} disabled:opacity-40`}
                >
                  {t('schedule.apply')}
                </button>
              </div>
              {parsed && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                  {parsed.found.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[11px] text-[var(--accent-color)]"
                    >
                      {f}
                    </span>
                  ))}
                  {parsed.missing.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-[var(--status-warning-bg,rgba(245,158,11,.15))] px-2 py-0.5 text-[11px] text-[var(--status-warning-fg,#f59e0b)]"
                    >
                      {t(`schedule.missing.${m}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-4">
                <Section title={t('schedule.when')}>
                  <DayRing
                    slots={draft.slots}
                    mode={draft.mode === 'off' ? 'on' : draft.mode}
                    onChange={(slots) => set({ slots })}
                    ctx={ctx}
                    now={now}
                    t={t}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => set({ weekdays: [...ALL_WEEKDAYS] })}
                      className={chip(sameDays(ALL_WEEKDAYS))}
                    >
                      {t('schedule.daily')}
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ weekdays: [...WORKDAYS] })}
                      className={chip(sameDays(WORKDAYS))}
                    >
                      {t('schedule.workdays')}
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ weekdays: [...WEEKEND] })}
                      className={chip(sameDays(WEEKEND))}
                    >
                      {t('schedule.weekend')}
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {ALL_WEEKDAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`${chip(draft.weekdays.includes(d))} px-0`}
                      >
                        {t(`schedule.day.${d}`)}
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title={t('schedule.times')}>
                  {draft.slots.map((slot, i) => {
                    const setSlot = (patch) => set({ slots: draft.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
                    return (
                      <div key={slot.id} className={`flex flex-col gap-3 ${i ? 'border-t border-[var(--glass-border)] pt-3' : ''}`}>
                        <PointEditor
                          title={draft.mode === 'off' ? t('schedule.switchOffAt') : t('schedule.switchOnAt')}
                          point={slot.start}
                          onChange={(p) => setSlot({ start: p })}
                          t={t}
                        />
                        {i === 0 && (
                          <div>
                            <span className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)] uppercase">{t('schedule.switchOff')}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {['time', 'duration', 'none'].map((style) => (
                                <button key={style} type="button" onClick={() => setOffStyle(style)} className={chip(offStyle === style)}>
                                  {t(`schedule.offStyle.${style}`)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {offStyle === 'time' && (
                          <PointEditor title={t('schedule.switchOffAt')} point={slot.end} onChange={(p) => setSlot({ end: p })} t={t} />
                        )}
                        {offStyle === 'duration' && (
                          <div>
                            <span className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)] uppercase">{t('schedule.switchOffAfter')}</span>
                            <DurationEditor minutes={slot.end?.minutes} onChange={(p) => setSlot({ end: p })} t={t} />
                          </div>
                        )}
                        {draft.slots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => set({ slots: draft.slots.filter((_, j) => j !== i) })}
                            className="inline-flex items-center gap-1 self-end text-xs text-[var(--text-muted)] hover:text-[var(--status-error-fg)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('schedule.removeSlot')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        slots: [
                          ...draft.slots,
                          {
                            id: newSlotId(),
                            start: { type: 'time', time: '06:00' },
                            end: offStyle === 'time' ? { type: 'time', time: '08:00' } : offStyle === 'duration' ? { type: 'duration', minutes: 60 } : null,
                          },
                        ],
                      })
                    }
                    className={`${chip(false)} inline-flex items-center gap-1`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('schedule.addSlot')}
                  </button>
                </Section>
              </div>

              <div className="min-w-0 space-y-4">
                <Section title={t('schedule.what')}>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.targets.areas.map((a) => (
                      <span
                        key={`a-${a.id}`}
                        className={`${chip(true)} inline-flex items-center gap-1.5`}
                      >
                        {a.name}
                        <button
                          type="button"
                          onClick={() => toggleArea({ area_id: a.id })}
                          aria-label={t('common.remove')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {draft.targets.entities.map((id) => (
                      <span key={id} className={`${chip(true)} inline-flex items-center gap-1.5`}>
                        {entities?.[id]?.attributes?.friendly_name || id}
                        <button
                          type="button"
                          onClick={() =>
                            set({
                              targets: {
                                ...draft.targets,
                                entities: draft.targets.entities.filter((x) => x !== id),
                              },
                            })
                          }
                          aria-label={t('common.remove')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {targetsEmpty && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {t('schedule.noTargets')}
                      </span>
                    )}
                  </div>
                  <EntityPicker
                    entities={entities}
                    selected={draft.targets.entities}
                    onAdd={(id) =>
                      set({
                        targets: { ...draft.targets, entities: [...draft.targets.entities, id] },
                      })
                    }
                    t={t}
                  />
                  {areas?.length > 0 && (
                    <div>
                      <span className={label}>{t('schedule.wholeRoom')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {areas.map((area) => (
                          <button
                            key={area.area_id}
                            type="button"
                            onClick={() => toggleArea(area)}
                            className={chip(draft.targets.areas.some((a) => a.id === area.area_id))}
                          >
                            {area.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>


                {(kind === 'light' || kind === 'cover' || kind === 'climate') && (
                  <Section title={t('schedule.how')}>
                    {kind === 'light' && (
                      <>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.action.on.brightness != null}
                            onChange={(e) =>
                              setAction('on', 'brightness', e.target.checked ? 80 : null)
                            }
                          />
                          {t('schedule.brightness')}
                          {draft.action.on.brightness != null && (
                            <>
                              <input
                                type="range"
                                min="1"
                                max="100"
                                value={draft.action.on.brightness}
                                onChange={(e) =>
                                  setAction('on', 'brightness', Number(e.target.value))
                                }
                                className="flex-1"
                              />
                              <span className="w-10 text-right tabular-nums">
                                {draft.action.on.brightness} %
                              </span>
                            </>
                          )}
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.action.on.colorTemp != null}
                            onChange={(e) =>
                              setAction('on', 'colorTemp', e.target.checked ? 2700 : null)
                            }
                          />
                          {t('schedule.colorTemp')}
                          {draft.action.on.colorTemp != null && (
                            <>
                              <input
                                type="range"
                                min="2000"
                                max="6500"
                                step="100"
                                value={draft.action.on.colorTemp}
                                onChange={(e) =>
                                  setAction('on', 'colorTemp', Number(e.target.value))
                                }
                                className="flex-1"
                              />
                              <span className="w-14 text-right tabular-nums">
                                {draft.action.on.colorTemp} K
                              </span>
                            </>
                          )}
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm">
                            <span className={label}>{t('schedule.rampOn')}</span>
                            <select
                              value={draft.action.rampOnMinutes || 0}
                              onChange={(e) =>
                                set({
                                  action: {
                                    ...draft.action,
                                    rampOnMinutes: Number(e.target.value),
                                  },
                                })
                              }
                              className={input}
                            >
                              {RAMP_STEPS.map((m) => (
                                <option key={m} value={m}>
                                  {m ? `${m} min` : t('schedule.off')}
                                </option>
                              ))}
                            </select>
                          </label>
                          {windowed && (
                            <label className="text-sm">
                              <span className={label}>{t('schedule.rampOff')}</span>
                              <select
                                value={draft.action.rampOffMinutes || 0}
                                onChange={(e) =>
                                  set({
                                    action: {
                                      ...draft.action,
                                      rampOffMinutes: Number(e.target.value),
                                    },
                                  })
                                }
                                className={input}
                              >
                                {RAMP_STEPS.map((m) => (
                                  <option key={m} value={m}>
                                    {m ? `${m} min` : t('schedule.off')}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </>
                    )}
                    {kind === 'cover' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['on', ...(windowed ? ['off'] : [])].map((phase) => (
                          <label key={phase} className="text-sm">
                            <span className={label}>
                              {t(
                                phase === 'on' ? 'schedule.positionStart' : 'schedule.positionEnd'
                              )}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              placeholder={phase === 'on' ? '100' : '0'}
                              value={draft.action[phase].position ?? ''}
                              onChange={(e) =>
                                setAction(
                                  phase,
                                  'position',
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className={input}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {kind === 'climate' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['on', ...(windowed ? ['off'] : [])].map((phase) => (
                          <label key={phase} className="text-sm">
                            <span className={label}>
                              {t(phase === 'on' ? 'schedule.tempStart' : 'schedule.tempEnd')}
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min="5"
                              max="35"
                              value={draft.action[phase].temperature ?? ''}
                              onChange={(e) =>
                                setAction(
                                  phase,
                                  'temperature',
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className={input}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                <Section title={t('schedule.onlyIf')}>
                  <div className="flex flex-wrap gap-1.5">
                    {[null, 'home', 'away'].map((p) => (
                      <button
                        key={String(p)}
                        type="button"
                        onClick={() => setCond({ presence: p })}
                        className={chip((draft.conditions.presence || null) === p)}
                      >
                        {t(`schedule.presence.${p || 'any'}`)}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.conditions.darkOnly)}
                      onChange={(e) => setCond({ darkOnly: e.target.checked })}
                    />
                    {t('schedule.darkOnly')}
                  </label>
                  {draft.conditions.darkOnly && (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                      <EntitySelect
                        value={draft.conditions.luxEntity}
                        onChange={(v) => setCond({ luxEntity: v })}
                        entities={entities}
                        filter={isLux}
                        placeholder={t('schedule.luxNone')}
                      />
                      {draft.conditions.luxEntity && (
                        <input
                          type="number"
                          min="0"
                          placeholder="50 lx"
                          value={draft.conditions.luxBelow ?? ''}
                          onChange={(e) =>
                            setCond({
                              luxBelow: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className={input}
                        />
                      )}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className={label}>{t('schedule.skipIf')}</span>
                      <EntitySelect
                        value={draft.conditions.skipEntity}
                        onChange={(v) => setCond({ skipEntity: v })}
                        entities={entities}
                        filter={isFlag}
                        placeholder={t('schedule.none')}
                      />
                    </label>
                    <label className="text-sm">
                      <span className={label}>{t('schedule.onlyIfOn')}</span>
                      <EntitySelect
                        value={draft.conditions.onlyEntity}
                        onChange={(v) => setCond({ onlyEntity: v })}
                        entities={entities}
                        filter={isFlag}
                        placeholder={t('schedule.none')}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.simulate)}
                      onChange={(e) => set({ simulate: e.target.checked })}
                    />
                    {t('schedule.simulate')}
                  </label>
                </Section>

                <Section title={t('schedule.preview')}>
                  {preview.length ? (
                    <ul className="space-y-1.5 text-sm">
                      {preview.map((e) => (
                        <li
                          key={`${e.instanceKey}-${e.kind}`}
                          className="flex justify-between gap-3"
                        >
                          <span className="text-[var(--text-secondary)]">
                            {formatWhen(e.at, now, ctx.tz, t)}
                          </span>
                          <span className="font-semibold">{eventVerb(draft, e.kind, t)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">{t('schedule.noPreview')}</p>
                  )}
                </Section>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] px-4 py-3 md:px-8">
            {draft.id && onDelete && (
              <button
                type="button"
                onClick={() => (confirmDelete ? onDelete(draft.id) : setConfirmDelete(true))}
                className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${confirmDelete ? 'bg-[var(--status-error-bg)] text-[var(--status-error-fg)]' : 'text-[var(--text-muted)] hover:text-[var(--status-error-fg)]'}`}
              >
                {confirmDelete ? t('schedule.confirmDelete') : t('schedule.delete')}
              </button>
            )}
            {error && <span className="text-xs text-[var(--status-error-fg)]">{error}</span>}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--glass-border)] px-4 py-2 text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-full bg-[var(--accent-color)] px-5 py-2 text-xs font-bold tracking-widest text-white uppercase disabled:opacity-50"
              >
                {t('schedule.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
