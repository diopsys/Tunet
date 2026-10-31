import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ArrowUpDown, Lock } from '../../icons';
import { getIconComponent } from '../../icons';

const DEFAULT_TABS = [
  {
    id: 'eg',
    title: 'EG',
    icon: 'mdi:home-floor-0',
    entities: [
      { entityId: 'cover.eg_kuche_fenster',    name: 'Küche Fenster' },
      { entityId: 'cover.eg_kuche_tur',         name: 'Küche Tür' },
      { entityId: 'cover.eg_esstisch_tur',      name: 'Esstisch Tür' },
      { entityId: 'cover.eg_wohnzimmer_fenster',name: 'Wohnzimmer' },
      { entityId: 'cover.eg_gaste_wc',          name: 'Gäste WC' },
      { entityId: 'cover.eg_buro',              name: 'Büro' },
    ],
  },
  {
    id: 'og',
    title: 'OG',
    icon: 'mdi:home-floor-1',
    entities: [
      { entityId: 'cover.og_schlafzimmer',  name: 'Schlafzimmer' },
      { entityId: 'cover.og_kinderzimmer',  name: 'Kinderzimmer' },
      { entityId: 'cover.og_badezimmer',    name: 'Badezimmer' },
      { entityId: 'cover.og_buro_rechts',   name: 'Büro rechts' },
      { entityId: 'cover.eg_buro_links',    name: 'Büro links' },
      { entityId: 'cover.og_flur',          name: 'Flur' },
    ],
  },
  {
    id: 'automatik',
    title: 'Automatik',
    icon: 'mdi:auto-mode',
    entities: [
      { entityId: 'switch.sperre_automatische_beschattung_eg', name: 'Sperre EG' },
      { entityId: 'switch.sperre_automatische_beschattung_og', name: 'Sperre OG' },
    ],
  },
];

/* ── Cover Tile ──────────────────────────────────────────────────────── */
const CoverTile = memo(({ entityId, name, entity, callService, isMobile, onOpen }) => {
  const state = entity?.state;
  const isUnavailable = !state || state === 'unavailable' || state === 'unknown';
  const isOpening = state === 'opening';
  const isClosing = state === 'closing';
  const isMoving = isOpening || isClosing;

  const supportedFeatures = entity?.attributes?.supported_features ?? 0;
  const supportsPosition = (supportedFeatures & 4) !== 0;
  const position = entity?.attributes?.current_position;

  const [localPos, setLocalPos] = useState(position ?? 0);
  const isDraggingRef = useRef(false);
  const lastMovingDirectionRef = useRef(null); // 'up' | 'down' | null

  useEffect(() => {
    if (!isDraggingRef.current && typeof position === 'number') setLocalPos(position);
  }, [position]);

  useEffect(() => {
    if (isOpening) lastMovingDirectionRef.current = 'up';
    if (isClosing) lastMovingDirectionRef.current = 'down';
  }, [isOpening, isClosing]);

  const TileIcon = ArrowUpDown;

  // Smart toggle: moving → stop → next tap reverses direction
  const handleToggle = useCallback(() => {
    if (isUnavailable) return;
    if (isMoving) {
      callService('cover', 'stop_cover', { entity_id: entityId });
    } else if (state === 'closed') {
      callService('cover', 'open_cover', { entity_id: entityId });
      lastMovingDirectionRef.current = 'up';
    } else if (lastMovingDirectionRef.current === 'down') {
      callService('cover', 'open_cover', { entity_id: entityId });
      lastMovingDirectionRef.current = 'up';
    } else {
      callService('cover', 'close_cover', { entity_id: entityId });
      lastMovingDirectionRef.current = 'down';
    }
  }, [isUnavailable, isMoving, state, entityId, callService]);

  const stateLabel = isUnavailable ? '⚠'
    : isOpening ? 'öffnet'
    : isClosing ? 'schließt'
    : supportsPosition && typeof position === 'number' ? `${localPos}%`
    : state === 'closed' ? 'Zu'
    : 'Offen';

  const px = isMobile ? 'px-3' : 'px-4';
  const py = isMobile ? 'py-3' : 'py-4';
  const iconSize = isMobile ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl';
  const iconInner = isMobile ? 'h-5 w-5' : 'h-6 w-6';
  const stateSize = isMobile ? 'text-base' : 'text-lg';

  const iconStyle = isUnavailable
    ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }
    : isMoving
    ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
    : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' };

  return (
    <div className={`glass-texture overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] transition-all duration-300 ${isUnavailable ? 'opacity-50' : ''}`}>
      <div className={`flex w-full items-center ${px} ${py} gap-3`}>
        {/* Icon — tap opens modal */}
        <button
          type="button"
          data-haptic="light"
          disabled={isUnavailable}
          onClick={() => { if (!isUnavailable && onOpen) onOpen(); }}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...iconStyle }}
          className={`flex flex-shrink-0 items-center justify-center ${iconSize} transition-all duration-300 hover:opacity-80 active:scale-90 ${isUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <TileIcon className={`${iconInner} stroke-[1.5px] ${isMoving ? 'animate-pulse' : ''}`} />
        </button>

        {/* Name + state — tap toggles */}
        <button
          type="button"
          data-haptic="card"
          disabled={isUnavailable}
          onClick={handleToggle}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          className={`min-w-0 flex-1 text-left transition-all active:scale-[0.97] ${isUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <p className={`mb-1.5 text-[10px] font-bold leading-tight tracking-widest uppercase text-[var(--text-secondary)] opacity-60 ${isMobile ? 'line-clamp-2 hyphens-auto' : 'truncate'}`} lang={isMobile ? 'de' : undefined}>
            {name}
          </p>
          <p className={`${stateSize} font-medium leading-none ${
            isUnavailable ? 'text-red-400' : isMoving ? 'text-blue-400' : 'text-[var(--text-primary)]'
          }`}>
            {stateLabel}
          </p>
        </button>
      </div>
    </div>
  );
});

/* ── Switch Tile (for Automatik tab) ─────────────────────────────────── */
const SwitchTile = memo(({ entityId, name, entity, callService, isMobile }) => {
  const isOn = entity?.state === 'on';
  const isUnavailable = !entity?.state || entity.state === 'unavailable';

  const toggle = useCallback(() => {
    if (isUnavailable) return;
    const domain = entityId.split('.')[0];
    callService(domain, isOn ? 'turn_off' : 'turn_on', { entity_id: entityId });
  }, [entityId, isOn, isUnavailable, callService]);

  const px = isMobile ? 'px-3' : 'px-4';
  const py = isMobile ? 'py-3' : 'py-4';
  const iconSize = isMobile ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl';
  const iconInner = isMobile ? 'h-5 w-5' : 'h-6 w-6';
  const stateSize = isMobile ? 'text-base' : 'text-lg';

  return (
    <div className={`glass-texture col-span-full overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] transition-all duration-300 ${isUnavailable ? 'opacity-50' : ''}`}>
      <button
        type="button"
        data-haptic="card"
        disabled={isUnavailable}
        onClick={toggle}
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        className={`flex w-full items-center gap-3 ${px} ${py} text-left transition-all active:scale-[0.97] ${isUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div
          className={`flex flex-shrink-0 items-center justify-center ${iconSize} transition-all duration-300`}
          style={isOn ? { backgroundColor: 'rgba(251,146,60,0.15)', color: '#fb923c' } : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' }}
        >
          <Lock className={`${iconInner} stroke-[1.5px]`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`mb-1.5 text-[10px] font-bold leading-tight tracking-widest uppercase text-[var(--text-secondary)] opacity-60 ${isMobile ? 'line-clamp-2 hyphens-auto' : 'truncate'}`} lang={isMobile ? 'de' : undefined}>
            {name}
          </p>
          <p className={`${stateSize} font-medium leading-none ${isOn ? 'text-orange-400' : 'text-[var(--text-muted)] opacity-40'}`}>
            {isOn ? 'Gesperrt' : 'Automatik'}
          </p>
        </div>
      </button>
    </div>
  );
});

/* ── Beschattungs-Status Panel ───────────────────────────────────────── */
const azimutToDirection = (az) => {
  if (az === null) return '–';
  if (az < 22.5 || az >= 337.5) return 'N';
  if (az < 67.5) return 'NO';
  if (az < 112.5) return 'O';
  if (az < 157.5) return 'SO';
  if (az < 202.5) return 'S';
  if (az < 247.5) return 'SW';
  if (az < 292.5) return 'W';
  return 'NW';
};

const parseDiagnose = (state) => {
  if (!state) return { mValue: -1, sValue: -1, azimut: null, elevation: null };
  const mMatch = state.match(/M(\d+)/);
  const sMatch = state.match(/S(\d+)/);
  const aMatch = state.match(/A(\d+)/);
  const eMatch = state.match(/E(\d+)/);
  return {
    mValue:    mMatch ? parseInt(mMatch[1]) : -1,
    sValue:    sMatch ? parseInt(sMatch[1]) : -1,
    azimut:    aMatch ? parseInt(aMatch[1]) : null,
    elevation: eMatch ? parseInt(eMatch[1]) : null,
  };
};

// Rooms with their KNX-configured azimut windows
const BESCHATTUNGS_ROOMS = [
  { name: 'Kinderzimmer', dir: 'West', azFrom: 200, azTo: 330, actor: '8fach' },
  { name: 'Esszimmer',    dir: 'Süd',  azFrom: 115, azTo: 250, actor: '8fach' },
  { name: 'Küche',        dir: 'West', azFrom: 210, azTo: 330, actor: '8fach' },
  { name: 'OG Tür Dach',  dir: 'Ost',  azFrom: 30,  azTo: 150, actor: '4fach' },
  { name: 'Schlafzimmer', dir: 'Süd',  azFrom: 115, azTo: 250, actor: '4fach' },
];

const BeschattungsStatusPanel = memo(({ entities, isMobile }) => {
  const raw8 = entities['text.diagnose_beschattung_8fach']?.state || '';
  const raw4 = entities['text.diagnose_beschattung_4fach']?.state || '';

  // Both actors share sun position — prefer 8fach, fallback to 4fach
  const primary = parseDiagnose(raw8 || raw4);
  const d4 = parseDiagnose(raw4);

  const { azimut, elevation } = primary;
  const direction = azimutToDirection(azimut);

  const getActorDiag = (actor) => actor === '8fach' ? primary : d4;

  const px = isMobile ? 'px-3' : 'px-4';
  const py = isMobile ? 'py-3' : 'py-4';

  return (
    <div className="col-span-full glass-texture overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)]">
      <div className={`${px} ${py} flex flex-col gap-3`}>

        {/* Sun position */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-60">Sonne</p>
          <p className="text-[10px] font-mono text-[var(--text-secondary)] opacity-30">{raw8 || raw4}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[var(--glass-bg)] px-2 py-2">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50 mb-1">Azimut</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{azimut !== null ? `${azimut}°` : '–'}</p>
          </div>
          <div className="rounded-xl bg-[var(--glass-bg)] px-2 py-2">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50 mb-1">Richtung</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{direction}</p>
          </div>
          <div className="rounded-xl bg-[var(--glass-bg)] px-2 py-2">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50 mb-1">Elevation</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{elevation !== null ? `${elevation}°` : '–'}</p>
          </div>
        </div>

        {/* Per-room status */}
        <div className="flex flex-col gap-1.5">
          {BESCHATTUNGS_ROOMS.map(({ name, dir, azFrom, azTo, actor }) => {
            const { mValue, sValue } = getActorDiag(actor);

            const sunInRange = azimut !== null && elevation !== null
              && azimut >= azFrom && azimut <= azTo && elevation >= 2;

            const isLocked   = mValue >= 0 && (mValue & 2) !== 0;
            const isTempLock = mValue >= 0 && (mValue & 4) !== 0;
            const schwelleOk = sValue > 0;

            // Determine room status
            let dotColor, label;
            if (!sunInRange) {
              dotColor = 'bg-gray-600'; label = `außerhalb (${azFrom}°–${azTo}°)`;
            } else if (isLocked) {
              dotColor = 'bg-orange-500'; label = 'Gesperrt';
            } else if (isTempLock) {
              dotColor = 'bg-yellow-500'; label = 'AT-Sperre';
            } else if (!schwelleOk) {
              dotColor = 'bg-gray-400'; label = 'Zu dunkel';
            } else {
              dotColor = 'bg-blue-500'; label = 'Beschattet';
            }

            const inRange = sunInRange;

            return (
              <div key={name} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${inRange ? 'bg-[var(--glass-bg-hover)]' : 'bg-[var(--glass-bg)] opacity-50'}`}>
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
                <span className="text-xs font-semibold text-[var(--text-primary)] w-24 flex-shrink-0">{name}</span>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-60 w-8">{dir}</span>
                <span className={`text-[10px] font-medium ${inRange ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
});

/* ── Group Action Bar ────────────────────────────────────────────────── */

const GROUP_ACTIONS = {
  eg: [
    { entityId: 'cover.gruppe_rolladen_eg',   label: 'EG runter',   icon: '↓', action: 'close_cover' },
    { entityId: 'cover.eg_komplett_ohne_tur',  label: 'EG ohne Tür', icon: '↓', action: 'close_cover' },
    { entityId: 'cover.gruppe_rolladen_eg',   label: 'EG hoch',     icon: '↑', action: 'open_cover' },
  ],
  og: [
    { entityId: 'cover.gruppe_rolladen_og',   label: 'OG runter',   icon: '↓', action: 'close_cover' },
    { entityId: 'cover.gruppe_rolladen_og',   label: 'OG hoch',     icon: '↑', action: 'open_cover' },
  ],
};

const ALL_ROLLADEN_ENTITY = 'cover.alle_rolladen';

const GroupActionBar = memo(({ tabId, callService }) => {
  const tabActions = GROUP_ACTIONS[tabId] || [];
  if (tabActions.length === 0) return null;

  const btn = (entityId, label, icon, action) => (
    <button
      key={`${entityId}-${action}`}
      type="button"
      data-haptic="card"
      onClick={() => callService('cover', action, { entity_id: entityId })}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className="flex items-center gap-1.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] transition-all hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] active:scale-95"
    >
      <span className="text-xs leading-none">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="col-span-full flex flex-wrap items-center gap-2">
      {btn(ALL_ROLLADEN_ENTITY, 'Alle runter', '↓', 'close_cover')}
      {btn(ALL_ROLLADEN_ENTITY, 'Alle hoch',   '↑', 'open_cover')}
      {tabActions.map((a) => btn(a.entityId, a.label, a.icon, a.action))}
    </div>
  );
});

/* ── Cover Panel Card ────────────────────────────────────────────────── */
const CoverPanelCard = ({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode,
  entities,
  callService,
  settings,
  isMobile,
  setShowCoverModal,
}) => {
  const tabs = settings?.panelTabs || DEFAULT_TABS;
  const [activeTabId, setActiveTabId] = useState(null);
  const resolvedActiveTabId = activeTabId || tabs[0]?.id;
  const activeTab = tabs.find((t) => t.id === resolvedActiveTabId) || tabs[0];

  const cols = isMobile ? 2 : 3;
  const tabEntities = activeTab?.entities || [];
  const isAutomatikTab = resolvedActiveTabId === 'automatik';

  const remainder = tabEntities.length % cols;
  const spacers = !isAutomatikTab && remainder !== 0 ? cols - remainder : 0;

  // Strip card surface from outer container — bg handled per tile
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

      {/* Tab bar */}
      {isMobile ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const TabIcon = getIconComponent(tab.icon) || ArrowUpDown;
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
            const TabIcon = getIconComponent(tab.icon) || ArrowUpDown;
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
        {isAutomatikTab && (
          <BeschattungsStatusPanel entities={entities} isMobile={isMobile} />
        )}
        {!isAutomatikTab && (
          <GroupActionBar tabId={resolvedActiveTabId} callService={callService} />
        )}
        {tabEntities.map(({ entityId, name }) => {
          const entity = entities[entityId];
          const domain = entityId.split('.')[0];
          if (domain === 'cover') {
            return (
              <CoverTile
                key={entityId}
                entityId={entityId}
                name={name}
                entity={entity}
                callService={callService}
                isMobile={isMobile}
                onOpen={setShowCoverModal ? () => setShowCoverModal(entityId) : undefined}
              />
            );
          }
          return (
            <SwitchTile
              key={entityId}
              entityId={entityId}
              name={name}
              entity={entity}
              callService={callService}
              isMobile={isMobile}
            />
          );
        })}
        {Array.from({ length: spacers }, (_, i) => <div key={`sp-${i}`} />)}
      </div>
    </div>
  );
};

export default memo(CoverPanelCard);
