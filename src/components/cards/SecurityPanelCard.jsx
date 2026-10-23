import { memo, useCallback } from 'react';
import { Shield, Lock, Unlock, AlertTriangle, Camera, Activity, Bell, Home, LogOut, Moon, Sun, UserCheck } from '../../icons';

/* ── Entity config (defaults, overridable via card settings) ─────────── */

const DETECTION_SWITCH    = 'switch.sicherheit_detection';
const SIMULATION_SWITCH   = 'switch.anwesenheitssimulation';
const ALARM_ENTITY        = 'alarm_control_panel.alarmo';

const LOCKS = [
  { entityId: 'lock.nuki_nuki_lock',               contactId: 'binary_sensor.turkontakt_haustur_contact', name: 'Haustür' },
  { entityId: 'lock.aqara_smart_lock_u200_schloss', contactId: 'binary_sensor.turkontakt_hwr_contact',     name: 'HWR Tür' },
];

const TUR_KONTAKTE = [
  { entityId: 'binary_sensor.turkontakt_haustur_contact',       name: 'Haustür'        },
  { entityId: 'binary_sensor.turkontakt_hwr_contact',           name: 'HWR'            },
  { entityId: 'binary_sensor.turkontakt_dach_contact',          name: 'Dach'           },
  { entityId: 'binary_sensor.turkontakt_terasse_kuche_contact', name: 'Terrasse Küche' },
  { entityId: 'binary_sensor.turkontakt_esszimmer_contact',     name: 'Esszimmer'      },
];
const TUR_SUMMARY_ID = 'binary_sensor.sicherheit_turkontakte';

const FENSTER_KONTAKTE = [
  { entityId: 'binary_sensor.fensterkontakt_kinderzimmer_contact', name: 'Kinderzimmer' },
  { entityId: 'binary_sensor.fensterkontakt_gaste_wc_contact',     name: 'Gäste WC'     },
  { entityId: 'binary_sensor.fensterkontakt_schlafzimmer_contact',  name: 'Schlafzimmer' },
  { entityId: 'binary_sensor.fensterkontakt_badezimmer_contact',    name: 'Badezimmer'   },
];
const FENSTER_SUMMARY_ID = 'binary_sensor.sicherheit_fensterkontakte';

const MOTION_SENSORS = [
  { entityId: 'binary_sensor.bewegung_flur',                              name: 'Flur EG'     },
  { entityId: 'binary_sensor.bewegung_flur_og',                           name: 'Flur OG'     },
  { entityId: 'binary_sensor.bewegung_hwr',                               name: 'HWR'         },
  { entityId: 'binary_sensor.bewegung_gaste_wc',                          name: 'Gäste WC'    },
  { entityId: 'binary_sensor.bewegung_buro_eg',                           name: 'Büro EG'     },
  { entityId: 'binary_sensor.bewegungsmelder_treppe_unten_occupancy',     name: 'Treppe unten'},
  { entityId: 'binary_sensor.bewegungsmelder_treppe_oben_occupancy',      name: 'Treppe oben' },
  { entityId: 'binary_sensor.presence_sensor_fp2_f2b3_presence_sensor_2', name: 'Küche'       },
  { entityId: 'binary_sensor.presence_sensor_fp2_bfb8_presence_sensor_3', name: 'Sofa'        },
  { entityId: 'binary_sensor.presence_sensor_fp2_bfb8_wohnzimmer_presence_sensor_2', name: 'Esstisch'  },
  { entityId: 'binary_sensor.presence_sensor_fp2_bfb8_presence_sensor_4', name: 'Durchgang'   },
  { entityId: 'binary_sensor.bewegung_bad_og_dusche',                     name: 'Dusche OG'   },
  { entityId: 'binary_sensor.bewegung_bad_og_wc',                         name: 'WC OG'       },
  { entityId: 'binary_sensor.fp300_schuppen_presence',                    name: 'Schuppen'    },
];

/**
 * Resolve the panel configuration from card settings (`settings.security`).
 * Every key is optional; a missing key keeps the built-in default. An empty
 * list or `null` hides the matching section.
 *
 * settings.security = {
 *   detectionSwitches: ['switch.a', 'switch.b'],   // toggled together; on = any on
 *   simulationSwitch: 'switch.x' | null,
 *   alarmEntity: 'alarm_control_panel.x' | null,
 *   locks: [{ entityId, contactId?, name }],
 *   doorContacts: [{ entityId, name }], doorSummaryId: 'binary_sensor.x' | null,
 *   windowContacts: [{ entityId, name }], windowSummaryId: 'binary_sensor.x' | null,
 *   motionSensors: [{ entityId, name }],
 * }
 */
export function resolveSecurityConfig(settings) {
  const s = settings?.security && typeof settings.security === 'object' ? settings.security : {};
  const pick = (key, fallback) => (key in s ? s[key] : fallback);
  const list = (value) => (Array.isArray(value) ? value.filter((e) => e && e.entityId) : []);
  const detection = pick('detectionSwitches', [DETECTION_SWITCH]);
  return {
    detectionSwitches: (Array.isArray(detection) ? detection : [detection]).filter(Boolean),
    simulationSwitch: pick('simulationSwitch', SIMULATION_SWITCH) || null,
    alarmEntity: pick('alarmEntity', ALARM_ENTITY) || null,
    locks: list(pick('locks', LOCKS)),
    doorContacts: list(pick('doorContacts', TUR_KONTAKTE)),
    doorSummaryId: pick('doorSummaryId', 'doorContacts' in s ? null : TUR_SUMMARY_ID) || null,
    windowContacts: list(pick('windowContacts', FENSTER_KONTAKTE)),
    windowSummaryId: pick('windowSummaryId', 'windowContacts' in s ? null : FENSTER_SUMMARY_ID) || null,
    motionSensors: list(pick('motionSensors', MOTION_SENSORS)),
  };
}

const isUnavailableState = (state) => !state || state === 'unavailable' || state === 'unknown';

/** On = any switch on; unavailable = all switches unavailable. */
function detectionStatus(ids, entities) {
  const states = ids.map((id) => entities[id]?.state);
  return {
    isOn: states.some((st) => st === 'on'),
    isUnavailable: states.length === 0 || states.every(isUnavailableState),
  };
}

/** Uses the summary sensor when configured, otherwise the contacts themselves. */
function contactStatus(contacts, summaryId, entities) {
  const openCount = contacts.filter(({ entityId }) => entities[entityId]?.state === 'on').length;
  if (summaryId) {
    const summary = entities[summaryId]?.state;
    return { openCount, isOpen: summary === 'on', isUnavailable: !summary || summary === 'unavailable' };
  }
  const unavailable = contacts.length > 0 && contacts.every(({ entityId }) => isUnavailableState(entities[entityId]?.state));
  return { openCount, isOpen: openCount > 0, isUnavailable: unavailable };
}

/* ── Alarm state helpers ─────────────────────────────────────────────── */

const ALARM_STATES = {
  disarmed:           { label: 'Deaktiviert', color: 'text-[var(--text-muted)]',  Icon: Bell,    bg: 'var(--glass-bg-hover)',       fg: 'var(--text-muted)'  },
  armed_home:         { label: 'Zuhause',     color: 'text-blue-400',             Icon: Home,    bg: 'rgba(96,165,250,0.12)',        fg: '#60a5fa'             },
  armed_away:         { label: 'Abwesend',    color: 'text-orange-400',           Icon: LogOut,  bg: 'rgba(251,146,60,0.12)',        fg: '#fb923c'             },
  armed_night:        { label: 'Nacht',       color: 'text-indigo-400',           Icon: Moon,    bg: 'rgba(129,140,248,0.12)',       fg: '#818cf8'             },
  armed_vacation:     { label: 'Urlaub',      color: 'text-purple-400',           Icon: Sun,     bg: 'rgba(192,132,252,0.12)',       fg: '#c084fc'             },
  armed_custom_bypass:{ label: 'Custom',      color: 'text-blue-400',             Icon: Shield,  bg: 'rgba(96,165,250,0.12)',        fg: '#60a5fa'             },
  arming:             { label: 'Aktiviert…',  color: 'text-yellow-400',           Icon: Bell,    bg: 'rgba(234,179,8,0.12)',         fg: '#facc15'             },
  pending:            { label: 'Ausstehend',  color: 'text-yellow-400',           Icon: Bell,    bg: 'rgba(234,179,8,0.12)',         fg: '#facc15'             },
  triggered:          { label: 'ALARM!',      color: 'text-red-400 animate-pulse',Icon: Bell,    bg: 'rgba(239,68,68,0.15)',         fg: '#ef4444'             },
};

/* ── Shared layout helpers ───────────────────────────────────────────── */

const SectionLabel = ({ children }) => (
  <p className="mb-2 text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50">
    {children}
  </p>
);

/* ── Detection section ───────────────────────────────────────────────── */

const DetectionSection = memo(({ switchIds, entities, callService }) => {
  const { isOn, isUnavailable } = detectionStatus(switchIds, entities);

  const toggle = useCallback(() => {
    if (isUnavailable) return;
    callService('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: switchIds });
  }, [isOn, isUnavailable, callService, switchIds]);

  return (
    <button
      type="button"
      data-haptic="card"
      disabled={isUnavailable}
      onClick={toggle}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className={`flex items-center gap-2 w-full transition-all active:scale-[0.97] ${isUnavailable ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={isUnavailable
          ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }
          : isOn
          ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
          : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' }}
      >
        <Camera className="h-3.5 w-3.5 stroke-[1.5px]" />
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 text-left">Kamera Detection</span>
      <span className={`text-[10px] font-bold ${isUnavailable ? 'text-red-400' : isOn ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-60'}`}>
        {isUnavailable ? '⚠' : isOn ? 'Aktiv' : 'Inaktiv'}
      </span>
    </button>
  );
});

/* ── Lock row ────────────────────────────────────────────────────────── */

const LockRow = memo(({ entityId, contactId, name, entities, onOpen }) => {
  const entity  = entities[entityId];
  const contact = contactId ? entities[contactId] : null;
  const state = entity?.state;
  const isLocked     = state === 'locked';
  const isJammed     = state === 'jammed';
  const isTransition = state === 'locking' || state === 'unlocking';
  const isUnavailable = isUnavailableState(state);
  const isDoorOpen = contact?.state === 'on';

  const iconStyle = isUnavailable || isJammed
    ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }
    : isLocked
    ? { backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }
    : isTransition
    ? { backgroundColor: 'rgba(96,165,250,0.1)', color: '#60a5fa' }
    : { backgroundColor: 'rgba(251,146,60,0.1)', color: '#fb923c' };

  const stateLabel = isUnavailable ? '⚠' : isJammed ? 'Blockiert' : isTransition ? '…' : isLocked ? 'Gesperrt' : 'Offen';
  const stateColor = isUnavailable || isJammed ? 'text-red-400' : isTransition ? 'text-blue-400' : isLocked ? 'text-green-400' : 'text-orange-400';
  const Icon = isLocked || state === 'locking' ? Lock : Unlock;

  return (
    <button
      type="button"
      data-haptic="card"
      onClick={() => onOpen?.({ entityId, contactId, name })}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className="flex items-center gap-2 w-full transition-all active:scale-[0.98] cursor-pointer"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={iconStyle}>
        {isUnavailable
          ? <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5px]" />
          : <Icon className={`h-3.5 w-3.5 stroke-[1.5px] ${isTransition ? 'animate-pulse' : ''}`} />}
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">{name}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isDoorOpen && <span className="text-[9px] font-bold text-orange-400">Tür auf</span>}
        <span className={`text-[10px] font-bold ${stateColor}`}>{stateLabel}</span>
      </div>
    </button>
  );
});

/* ── Contact summary row ─────────────────────────────────────────────── */

const ContactRow = memo(({ label, summaryId, contacts, entities, onClick }) => {
  const { openCount, isOpen, isUnavailable } = contactStatus(contacts, summaryId, entities);

  const dotColor = isUnavailable ? 'bg-gray-500' : isOpen ? 'bg-red-500' : 'bg-green-500';
  const stateLabel = isUnavailable ? '⚠' : isOpen ? `${openCount} offen` : 'Alle zu';
  const stateColor = isUnavailable ? 'text-red-400' : isOpen ? 'text-red-400' : 'text-green-400';

  return (
    <button
      type="button"
      data-haptic="card"
      onClick={onClick}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className="flex items-center gap-2 w-full transition-all active:scale-[0.98] cursor-pointer"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={isOpen
          ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }
          : { backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
      >
        <Shield className="h-3.5 w-3.5 stroke-[1.5px]" />
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">{label}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className={`text-[10px] font-bold ${stateColor}`}>{stateLabel}</span>
      </div>
    </button>
  );
});

/* ── Motion summary row ──────────────────────────────────────────────── */

const MotionRow = memo(({ sensors, entities, onClick }) => {
  const activeCount = sensors.filter(({ entityId }) => entities[entityId]?.state === 'on').length;
  const isActive = activeCount > 0;

  return (
    <button
      type="button"
      data-haptic="card"
      onClick={onClick}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className="flex items-center gap-2 w-full transition-all active:scale-[0.98] cursor-pointer"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={isActive
          ? { backgroundColor: 'rgba(234,179,8,0.12)', color: '#facc15' }
          : { backgroundColor: 'rgba(34,197,94,0.1)',  color: '#22c55e' }}
      >
        <Activity className={`h-3.5 w-3.5 stroke-[1.5px] ${isActive ? 'animate-pulse' : ''}`} />
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">Bewegungsmelder</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`} />
        <span className={`text-[10px] font-bold ${isActive ? 'text-yellow-400' : 'text-green-400'}`}>
          {isActive ? `${activeCount} aktiv` : 'Keine'}
        </span>
      </div>
    </button>
  );
});

/* ── Alarm row ───────────────────────────────────────────────────────── */

const AlarmRow = memo(({ entity, onOpen }) => {
  const state = entity?.state;
  const isUnavailable = isUnavailableState(state);
  const cfg = (!isUnavailable && ALARM_STATES[state]) || ALARM_STATES.disarmed;
  const { label, color, Icon, bg, fg } = cfg;

  return (
    <button
      type="button"
      data-haptic="card"
      onClick={onOpen}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className="flex items-center gap-2 w-full transition-all active:scale-[0.98] cursor-pointer"
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={isUnavailable
          ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }
          : { backgroundColor: bg, color: fg }}
      >
        {isUnavailable
          ? <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5px]" />
          : <Icon className="h-3.5 w-3.5 stroke-[1.5px]" />}
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">Alarmo</span>
      <span className={`text-[10px] font-bold flex-shrink-0 ${isUnavailable ? 'text-red-400' : color}`}>
        {isUnavailable ? '⚠' : label}
      </span>
    </button>
  );
});

/* ── Simulation switch row ───────────────────────────────────────────── */

const SimulationRow = memo(({ entityId, entity, callService }) => {
  const state = entity?.state;
  const isOn = state === 'on';
  const isUnavailable = isUnavailableState(state);

  const toggle = useCallback(() => {
    if (isUnavailable) return;
    callService('switch', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId });
  }, [isOn, isUnavailable, callService, entityId]);

  return (
    <button
      type="button"
      data-haptic="card"
      disabled={isUnavailable}
      onClick={toggle}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className={`flex items-center gap-2 w-full transition-all active:scale-[0.98] ${isUnavailable ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={isOn
          ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
          : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' }}
      >
        <UserCheck className="h-3.5 w-3.5 stroke-[1.5px]" />
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">Simulation</span>
      <span className={`text-[10px] font-bold flex-shrink-0 ${isUnavailable ? 'text-red-400' : isOn ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-60'}`}>
        {isUnavailable ? '⚠' : isOn ? 'Aktiv' : 'Inaktiv'}
      </span>
    </button>
  );
});

/* ── Mobile tile ─────────────────────────────────────────────────────── */

const Tile = ({ icon: Icon, label, state, iconBg, iconFg, stateCls, onClick, pulse = false }) => (
  <button
    type="button"
    data-haptic="card"
    onClick={onClick}
    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
    className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 w-full h-full transition-all active:scale-[0.95] cursor-pointer"
  >
    <div className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
      style={{ backgroundColor: iconBg, color: iconFg }}>
      <Icon className={`h-3 w-3 stroke-[1.5px] ${pulse ? 'animate-pulse' : ''}`} />
    </div>
    <span className="text-[9px] font-semibold text-[var(--text-primary)] text-center leading-tight w-full truncate px-0.5 mt-0.5">{label}</span>
    <span className={`text-[9px] font-bold text-center truncate w-full px-0.5 ${stateCls}`}>{state}</span>
  </button>
);

/* ── Security Panel Card ─────────────────────────────────────────────── */

const SecurityPanelCard = ({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode,
  entities,
  callService,
  settings,
  isMobile,
  setShowSecurityLockModal,
  setShowSecurityContactsModal,
  setShowAlarmModal,
}) => {
  const config = resolveSecurityConfig(settings);
  const {
    detectionSwitches, simulationSwitch, alarmEntity, locks,
    doorContacts, doorSummaryId, windowContacts, windowSummaryId, motionSensors,
  } = config;

  const layoutStyle = cardStyle ? {
    transform: cardStyle.transform,
    opacity: cardStyle.opacity,
    zIndex: cardStyle.zIndex,
    pointerEvents: cardStyle.pointerEvents,
    transition: cardStyle.transition,
  } : {};

  const p = isMobile ? 'px-3 py-3' : 'px-4 py-3';

  if (isMobile) {
    const alarmState = alarmEntity ? entities[alarmEntity]?.state : undefined;
    const alarmCfg = (alarmState && ALARM_STATES[alarmState]) || ALARM_STATES.disarmed;
    const det = detectionStatus(detectionSwitches, entities);
    const simOn = simulationSwitch ? entities[simulationSwitch]?.state === 'on' : false;
    const tur = contactStatus(doorContacts, doorSummaryId, entities);
    const fen = contactStatus(windowContacts, windowSummaryId, entities);
    const motCount = motionSensors.filter(({ entityId }) => entities[entityId]?.state === 'on').length;
    const motActive = motCount > 0;

    const lockTile = (lock) => {
      const s = entities[lock.entityId]?.state;
      const locked = s === 'locked';
      const jammed = s === 'jammed';
      const transit = s === 'locking' || s === 'unlocking';
      const unavail = isUnavailableState(s);
      const doorOpen = lock.contactId ? entities[lock.contactId]?.state === 'on' : false;
      const Icon = locked || s === 'locking' ? Lock : (unavail || jammed ? AlertTriangle : Unlock);
      const bg = unavail || jammed ? 'rgba(239,68,68,0.1)' : locked ? 'rgba(34,197,94,0.1)' : transit ? 'rgba(96,165,250,0.1)' : 'rgba(251,146,60,0.1)';
      const fg = unavail || jammed ? '#ef4444' : locked ? '#22c55e' : transit ? '#60a5fa' : '#fb923c';
      const stLabel = unavail ? '⚠' : jammed ? 'Blockiert' : transit ? '…' : locked ? 'Gesperrt' : (doorOpen ? 'Tür auf' : 'Offen');
      const stCls = unavail || jammed ? 'text-red-400' : transit ? 'text-blue-400' : locked ? 'text-green-400' : 'text-orange-400';
      return (
        <Tile icon={Icon} label={lock.name} state={stLabel}
          iconBg={bg} iconFg={fg} stateCls={stCls} pulse={transit}
          onClick={() => setShowSecurityLockModal?.({ entityId: lock.entityId, contactId: lock.contactId, name: lock.name })} />
      );
    };

    const contactTile = (key, label, status, type, contacts) => (
      <Tile key={key} icon={Shield} label={label}
        iconBg={status.isOpen ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'}
        iconFg={status.isOpen ? '#ef4444' : '#22c55e'}
        state={status.isOpen ? `${status.openCount} offen` : 'Alle zu'}
        stateCls={status.isOpen ? 'text-red-400' : 'text-green-400'}
        onClick={() => setShowSecurityContactsModal?.({ type, contacts })}
      />
    );

    // Tiles in display order; sections without entities are left out.
    const tiles = [];
    if (detectionSwitches.length > 0) {
      tiles.push(
        <Tile key="detection" icon={Camera} label="Detection"
          iconBg={det.isUnavailable ? 'rgba(239,68,68,0.1)' : det.isOn ? 'rgba(96,165,250,0.12)' : 'var(--glass-bg-hover)'}
          iconFg={det.isUnavailable ? '#ef4444' : det.isOn ? '#60a5fa' : 'var(--text-muted)'}
          state={det.isUnavailable ? '⚠' : det.isOn ? 'Aktiv' : 'Inaktiv'}
          stateCls={det.isUnavailable ? 'text-red-400' : det.isOn ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-60'}
          onClick={() => !det.isUnavailable && callService('switch', det.isOn ? 'turn_off' : 'turn_on', { entity_id: detectionSwitches })}
        />
      );
    }
    locks.forEach((lock) => tiles.push(<div key={lock.entityId} className="h-full">{lockTile(lock)}</div>));
    if (doorContacts.length > 0) tiles.push(contactTile('doors', 'Türen', tur, 'tür', doorContacts));
    if (windowContacts.length > 0) tiles.push(contactTile('windows', 'Fenster', fen, 'fenster', windowContacts));
    if (motionSensors.length > 0) {
      tiles.push(
        <Tile key="motion" icon={Activity} label="Bewegung"
          iconBg={motActive ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.1)'}
          iconFg={motActive ? '#facc15' : '#22c55e'}
          state={motActive ? `${motCount} aktiv` : 'Keine'}
          stateCls={motActive ? 'text-yellow-400' : 'text-green-400'}
          pulse={motActive}
          onClick={() => setShowSecurityContactsModal?.({ type: 'bewegung', contacts: motionSensors })}
        />
      );
    }
    if (alarmEntity) {
      tiles.push(
        <Tile key="alarm" icon={alarmCfg.Icon} label="Alarm"
          iconBg={alarmState === 'unavailable' ? 'rgba(239,68,68,0.1)' : alarmCfg.bg}
          iconFg={alarmState === 'unavailable' ? '#ef4444' : alarmCfg.fg}
          state={alarmState === 'unavailable' ? '⚠' : alarmCfg.label}
          stateCls={alarmState === 'unavailable' ? 'text-red-400' : alarmCfg.color}
          pulse={alarmState === 'triggered'}
          onClick={() => setShowAlarmModal?.(alarmEntity)}
        />
      );
    }
    if (simulationSwitch) {
      tiles.push(
        <Tile key="simulation" icon={UserCheck} label="Simulation"
          iconBg={simOn ? 'rgba(96,165,250,0.12)' : 'var(--glass-bg-hover)'}
          iconFg={simOn ? '#60a5fa' : 'var(--text-muted)'}
          state={simOn ? 'Aktiv' : 'Inaktiv'}
          stateCls={simOn ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-60'}
          onClick={() => callService('switch', simOn ? 'turn_off' : 'turn_on', { entity_id: simulationSwitch })}
        />
      );
    }

    const columns = 4;
    const rows = Math.ceil(tiles.length / columns);
    const b = 'border-[var(--glass-border)]';

    return (
      <div key={cardId} {...dragProps} className={`relative font-sans select-none ${editMode ? 'cursor-move' : ''}`} style={layoutStyle}>
        {controls}
        <div className="glass-texture rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] overflow-hidden">
          <div className="grid grid-cols-4">
            {tiles.map((tile, i) => {
              const lastInRow = i % columns === columns - 1;
              const lastRow = Math.floor(i / columns) === rows - 1;
              return (
                <div key={tile.key ?? i} className={`${lastInRow ? '' : 'border-r'} ${lastRow ? '' : 'border-b'} ${b}`}>
                  {tile}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: single flex row; sections without entities are left out.
  const sections = [];
  if (detectionSwitches.length > 0) {
    sections.push(['detection', 'Detection',
      <DetectionSection key="d" switchIds={detectionSwitches} entities={entities} callService={callService} />]);
  }
  if (locks.length > 0) {
    sections.push(['locks', 'Schlösser', locks.map((lock) => (
      <LockRow key={lock.entityId} {...lock} entities={entities} onOpen={setShowSecurityLockModal} />
    ))]);
  }
  if (doorContacts.length > 0 || windowContacts.length > 0) {
    sections.push(['contacts', 'Kontakte', [
      doorContacts.length > 0 && (
        <ContactRow key="tur" label="Türkontakte" summaryId={doorSummaryId} contacts={doorContacts} entities={entities}
          onClick={() => setShowSecurityContactsModal?.({ type: 'tür', contacts: doorContacts })} />
      ),
      windowContacts.length > 0 && (
        <ContactRow key="fenster" label="Fensterkontakte" summaryId={windowSummaryId} contacts={windowContacts} entities={entities}
          onClick={() => setShowSecurityContactsModal?.({ type: 'fenster', contacts: windowContacts })} />
      ),
    ]]);
  }
  if (motionSensors.length > 0) {
    sections.push(['motion', 'Bewegung',
      <MotionRow key="m" sensors={motionSensors} entities={entities}
        onClick={() => setShowSecurityContactsModal?.({ type: 'bewegung', contacts: motionSensors })} />]);
  }
  if (alarmEntity || simulationSwitch) {
    sections.push(['alarm', 'Alarm', [
      alarmEntity && <AlarmRow key="a" entity={entities[alarmEntity]} onOpen={() => setShowAlarmModal?.(alarmEntity)} />,
      simulationSwitch && <SimulationRow key="s" entityId={simulationSwitch} entity={entities[simulationSwitch]} callService={callService} />,
    ]]);
  }

  return (
    <div key={cardId} {...dragProps} className={`relative font-sans select-none ${editMode ? 'cursor-move' : ''}`} style={layoutStyle}>
      {controls}
      <div className="glass-texture rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] overflow-hidden">
        <div className="flex items-stretch">
          {sections.map(([key, label, content], i) => {
            const last = i === sections.length - 1;
            return (
              <div key={key} className={`${p} flex flex-col gap-2 ${last ? 'flex-1' : 'border-r border-[var(--glass-border)]'}`} style={{ minWidth: 180 }}>
                <SectionLabel>{label}</SectionLabel>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(SecurityPanelCard);
