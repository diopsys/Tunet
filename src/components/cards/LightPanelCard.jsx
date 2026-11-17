import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Lightbulb, ChevronRight, Zap, ToggleLeft, Workflow, Lock, Unlock } from '../../icons';
import { getIconComponent } from '../../icons';
import M3Slider from '../ui/M3Slider';
import { DEFAULT_LIGHT_PANEL_TABS as DEFAULT_TABS, tabShowsSchedules } from './lightPanelDefaults';
import PanelSchedules from '../schedule/PanelSchedules';

const DEBOUNCE_MS = 200;

const DOMAIN_FALLBACK_ICON = {
  light: Lightbulb,
  switch: Zap,
  input_boolean: ToggleLeft,
  automation: Workflow,
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
  t,
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
  const regularEntities = entities_;
  const showSchedules = tabShowsSchedules(activeTab) && typeof t === 'function';
  const hasBothGroups = showSchedules && regularEntities.length > 0;
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
        {showSchedules && (
          <>
            {hasBothGroups && (
              <div className="col-span-full flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-60">Zeitsteuerung</span>
                <div className="h-px flex-1 bg-[var(--glass-border)]" />
              </div>
            )}
            <PanelSchedules entities={entities} editMode={editMode} t={t} />
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
