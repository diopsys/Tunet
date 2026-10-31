import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Lightbulb, ChevronRight, Zap, ToggleLeft, Workflow, Lock, Unlock, Edit2, Check, X } from '../../icons';
import { getIconComponent } from '../../icons';
import M3Slider from '../ui/M3Slider';

const DEBOUNCE_MS = 200;

const DOMAIN_FALLBACK_ICON = {
  light: Lightbulb,
  switch: Zap,
  input_boolean: ToggleLeft,
  automation: Workflow,
};

const DEFAULT_TABS = [
  {
    id: 'eg',
    title: 'EG',
    icon: 'mdi:home-floor-0',
    entities: [
      { entityId: 'light.kuche', name: 'Küche', sperreEntityId: 'input_boolean.sperre_beleuchtung_kuche' },
      { entityId: 'light.beleuchtung_esstisch', name: 'Esstisch', sperreEntityId: 'input_boolean.sperre_beleuchtung_esstisch' },
      { entityId: 'light.eg_flur', name: 'Flur', sperreEntityId: 'switch.sperre_flur_eg' },
      { entityId: 'light.wohnzimmer', name: 'Wohnzimmer' },
      { entityId: 'light.gaste_wc', name: 'Gäste WC' },
      { entityId: 'light.eg_hwr', name: 'HWR', sperreEntityId: 'switch.sperre_hwr' },
      { entityId: 'light.wohnzimmer_schattenfuge', name: 'Schattenfuge', sperreEntityId: 'input_boolean.sperre_beleuchtung_schattenfuge_wz' },
      { entityId: 'light.bogenlampe', name: 'Bogenlampe' },
      { entityId: 'light.kuche_essen', name: 'Durchgang', sperreEntityId: 'input_boolean.sperre_beleuchtung_durchgang' },
      { entityId: 'light.eg_buro', name: 'Büro', sperreEntityId: 'switch.sperre_buro_eg_wled' },
    ],
  },
  {
    id: 'og',
    title: 'OG',
    icon: 'mdi:home-floor-1',
    entities: [
      { entityId: 'light.schlafzimmer', name: 'Schlafzimmer' },
      { entityId: 'light.schlafzimmer_stripe', name: 'Stripe' },
      { entityId: 'light.kinderzimmer', name: 'Kinderzimmer' },
      { entityId: 'light.og_flur', name: 'Flur', sperreEntityId: 'switch.sperre_flur_og' },
      { entityId: 'light.og_buro', name: 'Büro' },
      { entityId: 'light.og_badezimmer_decke', name: 'Badezimmer' },
      { entityId: 'light.og_badezimmer_dusche', name: 'Dusche' },
      { entityId: 'light.og_badezimmer_wc', name: 'WC' },
    ],
  },
  {
    id: 'aussen',
    title: 'Außen',
    icon: 'mdi:outdoor-lamp',
    entities: [
      { entityId: 'light.terasse', name: 'Terrasse' },
      { entityId: 'light.eingang', name: 'Eingang' },
      { entityId: 'light.beleuchtung_schuppen', name: 'Schuppen' },
      { entityId: 'light.wled_anpentaplus', name: 'Vordach' },
      { entityId: 'light.wled_anpentaplus_segment_1', name: 'Weg' },
      { entityId: 'light.wled_anpentaplus_segment_2', name: 'Einfahrt' },
    ],
  },
  {
    id: 'automatik',
    title: 'Automatik',
    icon: 'mdi:auto-mode',
    entities: [
      { entityId: 'switch.schedule_789cd8', name: 'Carport Ein' },
      { entityId: 'switch.schedule_0cc89b', name: 'Carport Aus' },
      { entityId: 'automation.treppenbeleuchtung_blueprint', name: 'Treppenbeleuchtung' },
    ],
  },
];

/* ── Scheduler helpers ────────────────────────────────────────────── */
function formatTimeslot(slot) {
  if (!slot) return '';
  const parseSunOffset = (base, rest) => {
    const m = rest.match(/([+-])(\d{2}):(\d{2})/);
    if (!m || (m[2] === '00' && m[3] === '00')) return base;
    const h = parseInt(m[2]), min = parseInt(m[3]);
    if (h > 0) return `${base} ${m[1]}${h}h`;
    if (min > 0) return `${base} ${m[1]}${min}min`;
    return base;
  };
  if (slot.startsWith('sunset')) return parseSunOffset('Sonnenuntergang', slot.slice(6));
  if (slot.startsWith('sunrise')) return parseSunOffset('Sonnenaufgang', slot.slice(7));
  return slot.substring(0, 5); // HH:MM
}

function formatWeekdays(weekdays) {
  if (!weekdays?.length) return '';
  if (weekdays.includes('daily')) return 'täglich';
  if (weekdays.includes('workday')) return 'Mo–Fr';
  if (weekdays.includes('weekend')) return 'Sa–So';
  const MAP = { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' };
  return weekdays.map((d) => MAP[d] || d).join(', ');
}

function formatNextTrigger(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function parseOffsetMinutes(rest) {
  const m = rest.match(/([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 60 + parseInt(m[3]));
}

function offsetMinutesToString(base, minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const min = String(abs % 60).padStart(2, '0');
  return `${base}${sign}${h}:${min}:00`;
}

function formatOffsetLabel(minutes) {
  if (minutes === 0) return '±0';
  const abs = Math.abs(minutes);
  const sign = minutes > 0 ? '+' : '−';
  if (abs < 60) return `${sign}${abs}min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}h${m}` : `${sign}${h}h`;
}

const OFFSET_STEPS = [-180, -120, -60, -30, 0, 30, 60, 120, 180]; // minutes
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* ── Scheduler Tile ───────────────────────────────────────────────── */
const SchedulerTile = ({ entityId, name, entity, callService, allEntities }) => {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState('sunset');   // 'time' | 'sunset' | 'sunrise'
  const [timeValue, setTimeValue] = useState('00:00');
  const [offsetMin, setOffsetMin] = useState(0);
  const [weekdays, setWeekdays] = useState(['daily']);

  const isOn = entity?.state === 'on';
  const isUnavailable = !entity?.state || entity.state === 'unavailable';
  const attrs = useMemo(() => entity?.attributes || {}, [entity?.attributes]);

  const timeslotStr = attrs.timeslots?.[0] || '';
  const timeslotLabel = formatTimeslot(timeslotStr);
  const weekdaysLabel = formatWeekdays(attrs.weekdays);
  const nextTime = formatNextTrigger(attrs.next_trigger);
  const controlledNames = (attrs.entities || [])
    .map((id) => allEntities[id]?.attributes?.friendly_name || id.split('.')[1])
    .join(', ');
  const action = attrs.actions?.[0]?.service?.includes('turn_on') ? 'Ein' : 'Aus';
  const iconName = attrs.icon;
  const TileIcon = (iconName ? getIconComponent(iconName) : null) || Workflow;

  const openEditor = useCallback(() => {
    if (timeslotStr.startsWith('sunset')) {
      setMode('sunset');
      setOffsetMin(parseOffsetMinutes(timeslotStr.slice(6)));
    } else if (timeslotStr.startsWith('sunrise')) {
      setMode('sunrise');
      setOffsetMin(parseOffsetMinutes(timeslotStr.slice(7)));
    } else {
      setMode('time');
      setTimeValue(timeslotStr.substring(0, 5) || '00:00');
    }
    setWeekdays(attrs.weekdays?.length ? [...attrs.weekdays] : ['daily']);
    setEditing(true);
  }, [timeslotStr, attrs.weekdays]);

  const handleSave = useCallback(() => {
    const start = mode === 'time'
      ? `${timeValue}:00`
      : offsetMinutesToString(mode, offsetMin);
    const actions = (attrs.entities || []).map((eid) => ({
      service: attrs.actions?.[0]?.service || 'switch.turn_on',
      entity_id: eid,
    }));
    callService('scheduler', 'edit', {
      entity_id: entityId,
      timeslots: [{ start, actions }],
      weekdays,
    });
    setEditing(false);
  }, [mode, timeValue, offsetMin, weekdays, entityId, attrs, callService]);

  const toggleWeekday = (key) => {
    setWeekdays((prev) => {
      const preset = ['daily', 'workday', 'weekend'];
      const filtered = prev.filter((d) => !preset.includes(d));
      if (filtered.includes(key)) return filtered.filter((d) => d !== key) || ['daily'];
      return [...filtered, key];
    });
  };

  const setPreset = (preset) => setWeekdays([preset]);

  const isPreset = (p) => weekdays.length === 1 && weekdays[0] === p;
  const isDayActive = (key) => {
    if (weekdays.includes('daily')) return true;
    if (weekdays.includes('workday') && ['mon','tue','wed','thu','fri'].includes(key)) return true;
    if (weekdays.includes('weekend') && ['sat','sun'].includes(key)) return true;
    return weekdays.includes(key);
  };

  return (
    <div className={`glass-texture col-span-full overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--card-bg)] transition-all duration-300 ${isUnavailable ? 'opacity-50' : ''}`}>
      {/* Header row */}
      <div className="flex items-center">
        <button
          type="button"
          data-haptic="card"
          disabled={isUnavailable}
          onClick={() => { if (!isUnavailable) callService('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }); }}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition-all active:scale-[0.97] ${isUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-all duration-300"
            style={isOn ? { backgroundColor: 'rgba(59,130,246,0.12)', color: 'rgb(96,165,250)' } : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' }}
          >
            <TileIcon className="h-6 w-6 stroke-[1.5px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 truncate text-xs font-bold leading-none tracking-widest uppercase text-[var(--text-secondary)] opacity-60">
              {name}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className={`text-lg font-medium leading-none ${isOn ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-40'}`}>
                {isOn ? 'Aktiv' : 'Inaktiv'}
              </span>
              {timeslotLabel && <span className="text-xs text-[var(--text-muted)] opacity-60">{timeslotLabel}</span>}
              {weekdaysLabel && <span className="text-xs text-[var(--text-muted)] opacity-40">· {weekdaysLabel}</span>}
            </div>
            {(controlledNames || nextTime) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5">
                {controlledNames && <span className="truncate text-[10px] text-[var(--text-muted)] opacity-50">{action}: {controlledNames}</span>}
                {nextTime && <span className="text-[10px] text-blue-400/70">· {nextTime} Uhr</span>}
              </div>
            )}
          </div>
        </button>

        {/* Edit button */}
        <button
          type="button"
          data-haptic="card"
          onClick={() => editing ? setEditing(false) : openEditor()}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl mr-3 transition-all active:scale-90 ${
            editing ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--text-muted)] opacity-25 hover:opacity-60'
          }`}
        >
          <Edit2 className="h-4 w-4" />
        </button>
      </div>

      {/* Inline editor */}
      {editing && (
        <div className="border-t border-[var(--glass-border)] px-3 pb-3 pt-3 space-y-3">

          {/* Mode selector */}
          <div className="flex gap-1.5">
            {[['time', 'Uhrzeit'], ['sunset', 'Sonnenuntergang'], ['sunrise', 'Sonnenaufgang']].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${
                  mode === m ? 'bg-[var(--accent-color)] text-white' : 'bg-[var(--glass-bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Time input or offset selector */}
          {mode === 'time' ? (
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="w-full rounded-xl bg-[var(--glass-bg-hover)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none border border-[var(--glass-border)]"
            />
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {OFFSET_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setOffsetMin(step)}
                  className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                    offsetMin === step
                      ? 'bg-[var(--accent-color)] text-white'
                      : 'bg-[var(--glass-bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {formatOffsetLabel(step)}
                </button>
              ))}
            </div>
          )}

          {/* Weekday selector */}
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              {[['daily', 'Täglich'], ['workday', 'Mo–Fr'], ['weekend', 'Sa–So']].map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold tracking-wide transition-all ${
                    isPreset(p) ? 'bg-[var(--accent-color)] text-white' : 'bg-[var(--glass-bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {WEEKDAY_KEYS.map((key, i) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleWeekday(key)}
                  className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all ${
                    isDayActive(key) ? 'bg-[var(--accent-color)]/80 text-white' : 'bg-[var(--glass-bg-hover)] text-[var(--text-muted)]'
                  }`}
                >
                  {WEEKDAY_LABELS[i]}
                </button>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-[var(--text-muted)] bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-all"
            >
              <X className="h-3.5 w-3.5" /> Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold bg-[var(--accent-color)] text-white hover:opacity-90 transition-all"
            >
              <Check className="h-3.5 w-3.5" /> Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Light Tile ───────────────────────────────────────────────────── */
const LightTile = memo(({
  entityId, name, entity, callService,
  optimisticBrightness, setOptimisticBrightness,
  onOpenModal,
  sperreEntityId, sperreEntity,
  isMobile,
}) => {
  const domain = entityId.split('.')[0];
  const state = entity?.state;
  const isOn = state === 'on';
  const isUnavailable = !state || state === 'unavailable' || state === 'unknown';
  const isLight = domain === 'light';

  const isDimmable = isLight && (() => {
    const modes = entity?.attributes?.supported_color_modes;
    if (modes) return !modes.includes('onoff') || modes.length > 1;
    return (entity?.attributes?.supported_features & 1) === 1;
  })();

  const brightness = entity?.attributes?.brightness || 0;
  const displayBrightness = optimisticBrightness[entityId] ?? brightness;
  const displayPct = Math.round((displayBrightness / 255) * 100);

  const debounceRef = useRef(null);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleToggle = useCallback(() => {
    if (isUnavailable) return;
    callService(domain, isOn ? 'turn_off' : 'turn_on', { entity_id: entityId });
  }, [entityId, domain, isOn, isUnavailable, callService]);

  const handleBrightness = useCallback((e) => {
    const val = parseInt(e.target.value);
    setOptimisticBrightness((prev) => ({ ...prev, [entityId]: val }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      callService('light', 'turn_on', { entity_id: entityId, brightness: val });
    }, DEBOUNCE_MS);
  }, [entityId, callService, setOptimisticBrightness]);

  const stateLabel = isUnavailable ? '⚠' : isOn ? (isDimmable ? `${displayPct}%` : 'An') : 'Aus';

  const iconName = entity?.attributes?.icon;
  const TileIcon = (iconName ? getIconComponent(iconName) : null) || DOMAIN_FALLBACK_ICON[domain] || Lightbulb;

  // Sperre state
  const sperreOn = sperreEntity?.state === 'on';
  const sperreUnavailable = sperreEntityId && (!sperreEntity?.state || sperreEntity.state === 'unavailable');
  const handleToggleSperre = useCallback((e) => {
    e.stopPropagation();
    if (!sperreEntityId || sperreUnavailable) return;
    const sperreDomain = sperreEntityId.split('.')[0];
    callService(sperreDomain, sperreOn ? 'turn_off' : 'turn_on', { entity_id: sperreEntityId });
  }, [sperreEntityId, sperreOn, sperreUnavailable, callService]);

  const px = isMobile ? 'px-3' : 'px-4';
  const py = isMobile ? 'py-3' : 'py-4';
  const iconSize = isMobile ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl';
  const iconInner = isMobile ? 'h-5 w-5' : 'h-6 w-6';
  const stateText = isMobile ? 'text-base' : 'text-lg';
  const btnSize = isMobile ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl';
  const btnIcon = isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className={`glass-texture overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] transition-all duration-300 ${isUnavailable ? 'opacity-50' : ''}`}>
      <div className="flex items-center">
        <button
          type="button"
          data-haptic="card"
          disabled={isUnavailable}
          onClick={handleToggle}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`flex min-w-0 flex-1 items-center gap-3 ${px} ${py} text-left transition-all active:scale-[0.97] ${isUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div
            className={`flex flex-shrink-0 items-center justify-center ${iconSize} transition-all duration-300`}
            style={isOn ? { backgroundColor: 'rgba(245,158,11,0.15)', color: 'rgb(251,191,36)' } : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' }}
          >
            <TileIcon className={`${iconInner} stroke-[1.5px] ${isOn && isLight ? 'fill-amber-400/15' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              lang={isMobile ? 'de' : undefined}
              className={`mb-1.5 text-[10px] font-bold leading-tight tracking-widest uppercase text-[var(--text-secondary)] opacity-60 ${isMobile ? 'line-clamp-2 hyphens-auto' : 'truncate'}`}
            >
              {name}
            </p>
            <p className={`${stateText} font-medium leading-none ${
              isUnavailable ? 'text-red-400' : isOn ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-40'
            }`}>
              {stateLabel}
            </p>
          </div>
        </button>

        <div className={`flex flex-shrink-0 items-center ${isMobile ? 'pr-2' : 'pr-3'} gap-0.5`}>
          {sperreEntityId && (
            <button
              type="button"
              data-haptic="card"
              onClick={handleToggleSperre}
              disabled={sperreUnavailable}
              title={sperreOn ? 'Sperre aktiv' : 'Automatik aktiv'}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className={`flex items-center justify-center ${btnSize} transition-all active:scale-90 ${
                sperreOn ? 'bg-orange-500/15 text-orange-400' : 'text-[var(--text-muted)] opacity-25 hover:opacity-60'
              }`}
            >
              {sperreOn ? <Lock className={btnIcon} /> : <Unlock className={btnIcon} />}
            </button>
          )}
          {onOpenModal && isLight && (
            <button
              type="button"
              data-haptic="card"
              onClick={(e) => { e.stopPropagation(); onOpenModal(entityId); }}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className={`flex items-center justify-center ${btnSize} text-[var(--text-muted)] opacity-25 transition-all hover:opacity-70 active:scale-90`}
            >
              <ChevronRight className={btnIcon} />
            </button>
          )}
        </div>
      </div>

      {isDimmable && isOn && (
        <div className={`${px} pb-3`}>
          <M3Slider
            variant="thinLg"
            min={0} max={255} step={1}
            value={displayBrightness}
            disabled={isUnavailable}
            onChange={handleBrightness}
            colorClass="bg-amber-500"
            ariaLabel="Helligkeit"
          />
        </div>
      )}
    </div>
  );
});

/* ── Light Panel Card ─────────────────────────────────────────────── */
const LightPanelCard = ({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode,
  entities,
  callService,
  optimisticLightBrightness,
  setOptimisticLightBrightness,
  settings,
  onOpenLightModal,
  isMobile,
}) => {
  const tabs = settings?.panelTabs || DEFAULT_TABS;
  const [activeTabId, setActiveTabId] = useState(null);
  const resolvedActiveTabId = activeTabId || tabs[0]?.id;
  const activeTab = tabs.find((t) => t.id === resolvedActiveTabId) || tabs[0];

  const cols = isMobile ? 2 : 3;
  // Entries flagged hideWhenUnavailable (e.g. seasonal plugs) only show while reachable
  const entities_ = (activeTab?.entities || []).filter(({ entityId, hideWhenUnavailable }) => {
    if (!hideWhenUnavailable) return true;
    const state = entities[entityId]?.state;
    return !!state && state !== 'unavailable' && state !== 'unknown';
  });
  const schedulerEntities = entities_.filter(({ entityId }) => !!entities[entityId]?.attributes?.timeslots);
  const regularEntities = entities_.filter(({ entityId }) => !entities[entityId]?.attributes?.timeslots);
  const hasBothGroups = schedulerEntities.length > 0 && regularEntities.length > 0;
  const remainder = regularEntities.length % cols;
  const spacers = remainder === 0 ? 0 : cols - remainder;

  // Strip card surface styles — background/border handled by individual tiles
  const layoutStyle = cardStyle ? {
    transform: cardStyle.transform,
    opacity: cardStyle.opacity,
    zIndex: cardStyle.zIndex,
    pointerEvents: cardStyle.pointerEvents,
    transition: cardStyle.transition,
  } : {};

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`relative flex flex-col gap-3 font-sans select-none ${editMode ? 'cursor-move' : ''}`}
      style={layoutStyle}
    >
      {controls}

      {/* Tab bar — full-width grid on desktop, horizontal scroll on mobile */}
      {isMobile ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const TabIcon = getIconComponent(tab.icon) || Lightbulb;
            const isActive = resolvedActiveTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-haptic={editMode ? undefined : 'card'}
                disabled={editMode}
                onClick={() => setActiveTabId(tab.id)}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-2 text-[10px] font-bold tracking-widest whitespace-nowrap uppercase transition-all active:scale-95 ${
                  isActive
                    ? 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]'
                    : 'border-transparent bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const TabIcon = getIconComponent(tab.icon) || Lightbulb;
            const isActive = resolvedActiveTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-haptic={editMode ? undefined : 'card'}
                disabled={editMode}
                onClick={() => setActiveTabId(tab.id)}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2 text-[10px] font-bold tracking-widest whitespace-nowrap uppercase transition-all active:scale-95 ${
                  isActive
                    ? 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]'
                    : 'border-transparent bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tile grid */}
      <div className={`grid gap-3 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {/* Zeitsteuerung section */}
        {schedulerEntities.length > 0 && (
          <>
            {hasBothGroups && (
              <div className="col-span-full flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Zeitsteuerung</span>
                <div className="h-px flex-1 bg-[var(--glass-border)]" />
              </div>
            )}
            {schedulerEntities.map(({ entityId, name }) => (
              <SchedulerTile
                key={entityId}
                entityId={entityId}
                name={name}
                entity={entities[entityId]}
                callService={callService}
                allEntities={entities}
              />
            ))}
          </>
        )}

        {/* Licht / Automatik section */}
        {regularEntities.length > 0 && (
          <>
            {hasBothGroups && (
              <div className="col-span-full flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Automatik</span>
                <div className="h-px flex-1 bg-[var(--glass-border)]" />
              </div>
            )}
            {regularEntities.map(({ entityId, name, sperreEntityId }) => (
              <LightTile
                key={entityId}
                entityId={entityId}
                name={name}
                entity={entities[entityId]}
                callService={callService}
                optimisticBrightness={optimisticLightBrightness}
                setOptimisticBrightness={setOptimisticLightBrightness}
                onOpenModal={!editMode && onOpenLightModal ? onOpenLightModal : null}
                sperreEntityId={sperreEntityId || null}
                sperreEntity={sperreEntityId ? entities[sperreEntityId] : null}
                isMobile={isMobile}
              />
            ))}
            {Array.from({ length: spacers }, (_, i) => <div key={`sp-${i}`} />)}
          </>
        )}
      </div>
    </div>
  );
};

export default memo(LightPanelCard);
