import { memo } from 'react';
import { Droplets } from '../../icons';
import { getSettings } from '../helpers';
import { openHaPath } from '../../components/cards/HeizungCard';
import { beregnungAktiv, beregnungWert, resolveBeregnungConfig, zonenName } from '../../utils/beregnungConfig';

const BeregnungCard = memo(function BeregnungCard({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode,
  customNames,
  entities,
  onOpen,
  isTwoColMobile = false,
  settings,
}) {
  const name = customNames?.[cardId] || 'Beregnung';
  const isUltraCompact = isTwoColMobile;
  const config = resolveBeregnungConfig(settings);

  const masterActive = beregnungAktiv(entities, config);
  const rain = beregnungWert(entities, config.regen);
  const bucket = beregnungWert(entities, config.vorrat);
  const totalMin = beregnungWert(entities, config.gesamt);
  const evaporation = beregnungWert(entities, config.verdunstung);

  const activeZones = config.zonen.filter((z) => entities?.[z.entity]?.state === 'on').map((z) => ({
    key: z.entity,
    name: zonenName(entities, z),
    color: z.color,
    timeRemaining: entities?.[z.entity]?.attributes?.time_remaining,
  }));

  const smartMax = Math.max(
    0,
    ...config.zonen.map((z) => (z.smartMin ? parseFloat(entities?.[z.smartMin]?.state) || 0 : 0))
  );
  // Tropfen-Symbol öffnet ein eigenes Ziel (z. B. das Beregnungs-Panel), die Karte den Dialog
  const panelUrl = !editMode ? config.url : null;

  const iconColor = masterActive ? '#34d399' : 'var(--text-muted)';
  const iconBg = masterActive ? 'rgba(52,211,153,0.12)' : 'rgba(127,127,127,0.1)';
  const statusDotColor = masterActive ? 'bg-emerald-400' : 'bg-gray-500';

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={`glass-texture touch-feedback group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border font-sans transition-colors duration-500 ${isUltraCompact ? 'p-3' : 'p-7'} ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
      style={cardStyle}
      onClick={(e) => { e.stopPropagation(); if (!editMode) onOpen?.(); }}
    >
      {controls}

      <div className="relative z-10">
        {/* Top row: icon + status badge */}
        <div className="flex items-start justify-between">
          <div
            className={`transition-transform duration-500 group-hover:scale-110 ${isUltraCompact ? 'rounded-lg p-2' : 'rounded-2xl p-3'}`}
            style={{ backgroundColor: iconBg, color: iconColor }}
            {...(panelUrl ? {
              role: 'button',
              tabIndex: 0,
              title: `${name} – Dashboard öffnen`,
              'aria-label': `${name} – Dashboard öffnen`,
              onClick: (e) => { e.stopPropagation(); openHaPath(panelUrl); },
              onKeyDown: (e) => { e.stopPropagation(); if (e.key === 'Enter') openHaPath(panelUrl); },
            } : {})}
          >
            <Droplets className={isUltraCompact ? 'h-3 w-3' : 'h-5 w-5'} style={{ strokeWidth: 1.5 }} />
          </div>
          <div
            className={`flex items-center gap-1 rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-3 py-1'}`}
            style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
          >
            <span className={`rounded-full ${isUltraCompact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${masterActive ? 'animate-pulse ' : ''}${statusDotColor}`} />
            <span className={`font-bold uppercase text-[var(--text-secondary)] ${isUltraCompact ? 'text-[9px] tracking-wide' : 'text-xs tracking-widest'}`}>
              {masterActive ? 'Aktiv' : 'Aus'}
            </span>
          </div>
        </div>

        {/* Card name */}
        <div className={isUltraCompact ? 'mt-1.5' : 'mt-2'}>
          <p className={`${isUltraCompact ? 'mb-0.5 text-[9px]' : 'mb-0.5 text-xs'} leading-none font-bold text-[var(--text-secondary)] uppercase opacity-60`} style={{ letterSpacing: '0.05em' }}>
            {name}
          </p>
        </div>

        {/* Active zones or idle state */}
        {activeZones.length > 0 ? (
          <div className={`flex flex-col ${isUltraCompact ? 'mt-1.5 gap-1' : 'mt-3 gap-1.5'}`}>
            {activeZones.map((z) => (
              <div
                key={z.key}
                className={`flex items-center justify-between rounded-xl text-xs ${isUltraCompact ? 'px-1.5 py-1' : 'px-2.5 py-1.5'}`}
                style={{ backgroundColor: `${z.color}15` }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: z.color }} />
                  <span className={`font-semibold ${isUltraCompact ? 'text-[10px]' : ''}`} style={{ color: z.color }}>{z.name}</span>
                </div>
                {z.timeRemaining && (
                  <span className="text-[10px]" style={{ color: z.color }}>{z.timeRemaining}</span>
                )}
              </div>
            ))}
            {totalMin != null && Number(totalMin) > 0 && (
              <p className="text-[10px] text-orange-400 mt-0.5">{totalMin} min gesamt</p>
            )}
          </div>
        ) : (
          <div className={isUltraCompact ? 'mt-1.5' : 'mt-3'}>
            {smartMax > 0 ? (
              <p className={`${isUltraCompact ? 'text-[10px]' : 'text-xs'} text-[var(--text-secondary)]`}>
                <span className="font-bold text-green-400">{smartMax} min</span> Smart-Empfehlung
              </p>
            ) : (
              <p className={`${isUltraCompact ? 'text-[10px]' : 'text-xs'} text-[var(--text-secondary)]`}>Keine aktiven Zonen</p>
            )}
          </div>
        )}

        {/* Footer chips */}
        <div className={`flex items-center gap-3 border-t border-[var(--glass-border)] flex-wrap ${isUltraCompact ? 'mt-2 pt-2 gap-y-1' : 'mt-4 pt-3 gap-4 gap-y-1.5'}`}>
          {rain != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Regen</span>
              <span className={`font-light text-blue-400 ${isUltraCompact ? 'text-sm' : 'text-lg'}`}>{rain} mm</span>
            </div>
          )}
          {evaporation != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Verdunstung</span>
              <span className={`font-light text-amber-400 ${isUltraCompact ? 'text-sm' : 'text-lg'}`}>{evaporation} mm</span>
            </div>
          )}
          {bucket != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Vorrat</span>
              <span className={`font-light text-cyan-400 ${isUltraCompact ? 'text-sm' : 'text-lg'}`}>{bucket} mm</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export function renderBeregnungCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { editMode, cardSettings, customNames, entities, setShowBeregnungModal, isTwoColMobile, t } = ctx;
  const settings = getSettings(cardSettings, settingsKey, cardId);

  return (
    <BeregnungCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      customNames={customNames}
      entities={entities}
      onOpen={() => setShowBeregnungModal?.(cardId)}
      isTwoColMobile={isTwoColMobile}
      settings={settings}
      t={t}
    />
  );
}
