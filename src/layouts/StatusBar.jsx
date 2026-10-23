import { Edit2, Droplets } from '../icons';
import StatusPill from '../components/cards/StatusPill';
import { useHomeAssistant, useModalActions, usePages } from '../contexts';
import { isSonosMediaEntity, resolveStatusGroupPill, STATUS_GROUP_PILL_TYPE } from '../utils';

const BEREGNUNG_ZONES = [
  { key: 'z1', name: 'Terrasse R', sensorId: 'binary_sensor.irrigation_unlimited_c1_z1' },
  { key: 'z3', name: 'Terrasse L', sensorId: 'binary_sensor.irrigation_unlimited_c1_z3' },
  { key: 'z2', name: 'Rasen',      sensorId: 'binary_sensor.irrigation_unlimited_c1_z2' },
  { key: 'z4', name: 'Vorgarten R',sensorId: 'binary_sensor.irrigation_unlimited_c1_z4' },
  { key: 'z5', name: 'Vorgarten L',sensorId: 'binary_sensor.irrigation_unlimited_c1_z5' },
];

/**
 * StatusBar component showing various status indicators
 * @param {Object} props
 * @param {boolean} [props.editMode] - Whether in edit mode
 * @param {Function} props.t - Translation function
 * @param {(entity: any) => boolean} [props.isSonosActive] - Check if Sonos is active
 * @param {(entity: any) => boolean} [props.isMediaActive] - Check if media is active
 * @param {(entityId: string, attr: string, fallback?: any) => any} [props.getA] - Get entity attribute
 * @param {(url?: string) => string|null} [props.getEntityImageUrl] - Get entity image URL
 * @param {boolean} [props.isMobile] - Whether on mobile viewport
 */
export default function StatusBar({
  editMode,
  t,
  isSonosActive,
  isMediaActive,
  getA,
  getEntityImageUrl,
  isMobile = false,
}) {
  const { entities } = useHomeAssistant();
  const { statusPillsConfig = [] } = usePages();
  const {
    setActiveMediaId,
    setActiveMediaGroupKey,
    setActiveMediaGroupIds,
    setActiveMediaSessionSensorIds,
    setActiveMediaModal,
    setShowAlarmModal,
    setShowStatusGroupModal,
    setShowStatusPillsConfig,
    setShowEntityCountModal,
    setShowBeregnungModal,
  } = useModalActions();

  const getSonosEntities = () =>
    Object.keys(entities)
      .filter((id) => id.startsWith('media_player.'))
      .map((id) => entities[id])
      .filter(isSonosMediaEntity);

  const hasSonosMediaMetadata = (entity) => {
    if (!entity) return false;
    const attrs = entity.attributes || {};
    const hasText = Boolean(
      attrs.media_title || attrs.media_channel || attrs.media_artist || attrs.media_album_name
    );
    const hasImage = Boolean(attrs.entity_picture || attrs.media_image_url);
    return hasText || hasImage;
  };

  const normalizePattern = (pattern) => pattern.trim();

  const buildWildcardRegex = (pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const wildcard = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${wildcard}$`, 'i');
  };

  const matchesMediaFilter = (id, filter, mode) => {
    if (!filter) return true;
    const patterns = filter.split(',').map(normalizePattern).filter(Boolean);
    if (patterns.length === 0) return true;

    return patterns.some((pattern) => {
      if (mode === 'regex') {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(id);
        } catch {
          return false;
        }
      }

      if (pattern.includes('*')) {
        const wildcardRegex = buildWildcardRegex(pattern);
        return wildcardRegex.test(id);
      }

      if (mode === 'contains') return id.toLowerCase().includes(pattern.toLowerCase());
      return id.toLowerCase().startsWith(pattern.toLowerCase());
    });
  };

  const setMediaNameDisplayFilter = (pill) => {
    try {
      localStorage.setItem(
        'tunet_media_name_display_filter',
        typeof pill?.playerNameDisplayFilter === 'string' ? pill.playerNameDisplayFilter : ''
      );
    } catch {
      // ignore localStorage errors
    }
  };

  return (
    <div className="mt-0 flex w-full items-center justify-between font-sans">
      <div
        className={`flex min-w-0 items-center ${isMobile ? 'scrollbar-hide gap-2.5 overflow-x-auto overflow-y-hidden px-2 pt-2' : 'flex-wrap gap-2.5'}`}
      >
        {/* Edit button (only in edit mode) - at first position */}
        {editMode && (
          <button
            onClick={() => setShowStatusPillsConfig(true)}
            className={`flex items-center gap-1.5 rounded-full border border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--accent-color)] transition-all hover:bg-[var(--accent-bg)] ${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1'}`}
            title={t('statusBar.editPills')}
          >
            <Edit2 className="h-3 w-3" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase">
              {t('statusBar.pills')}
            </span>
          </button>
        )}

        {/* Beregnung-Pill: automatisch wenn mindestens eine Zone aktiv */}
        {(() => {
          const activeZones = BEREGNUNG_ZONES.filter(
            (z) => entities?.[z.sensorId]?.state === 'on'
          );
          if (activeZones.length === 0) return null;
          const label = activeZones.length === 1
            ? activeZones[0].name
            : `${activeZones.length} Zonen`;
          return (
            <button
              key="beregnung-pill"
              onClick={() => setShowBeregnungModal?.('beregnung')}
              className={`relative flex items-center rounded-2xl transition-all hover:opacity-80 active:scale-95 animate-pulse ${isMobile ? 'h-8 w-8 p-1.5 justify-center' : 'h-9 px-2.5 gap-1.5'}`}
              style={{ backgroundColor: 'rgba(52,211,153,0.12)' }}
            >
              <div
                className={`rounded-xl ${isMobile ? 'p-1' : 'p-1.5'}`}
                style={{ backgroundColor: 'rgba(52,211,153,0.2)' }}
              >
                <Droplets
                  className={isMobile ? 'h-3 w-3' : 'h-4 w-4'}
                  style={{ color: '#34d399', strokeWidth: 1.5 }}
                />
              </div>
              {!isMobile && (
                <div className="flex flex-col items-start">
                  <span
                    className="text-xs font-bold leading-tight text-left"
                    style={{ color: '#34d399' }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs font-medium leading-tight text-left"
                    style={{ color: 'rgba(52,211,153,0.7)' }}
                  >
                    Beregnung
                  </span>
                </div>
              )}
              {isMobile && activeZones.length > 1 && (
                <div className="absolute -top-2 -right-2 h-[18px] min-w-[18px] text-[10px] z-10 flex items-center justify-center rounded-full bg-gray-600 px-1.5 font-bold text-white shadow-sm">
                  {activeZones.length}
                </div>
              )}
            </button>
          );
        })()}

        {/* Configurable status pills */}
        {statusPillsConfig
          .filter((pill) => pill.visible !== false)
          .map((pill) => {
            if (pill.type === 'alarm') {
              const alarmEntityId =
                typeof pill.entityId === 'string' &&
                pill.entityId.startsWith('alarm_control_panel.')
                  ? pill.entityId
                  : '';
              const alarmEntity = alarmEntityId ? entities[alarmEntityId] : null;

              return (
                <StatusPill
                  key={pill.id}
                  entity={alarmEntity}
                  pill={pill}
                  getA={getA}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                  onClick={
                    pill.clickable !== false && alarmEntityId
                      ? () => setShowAlarmModal(alarmEntityId)
                      : undefined
                  }
                />
              );
            }

            // Handle different pill types
            if (pill.type === 'media_player' || pill.type === 'emby') {
              const mediaIds = (() => {
                if (pill.type === 'media_player') {
                  return pill.entityId
                    ? [pill.entityId]
                    : Object.keys(entities)
                        .filter((id) => id.startsWith('media_player.'))
                        .filter((id) =>
                          matchesMediaFilter(id, pill.mediaFilter, pill.mediaFilterMode)
                        );
                }

                if (Array.isArray(pill.mediaEntityIds) && pill.mediaEntityIds.length > 0) {
                  return pill.mediaEntityIds;
                }

                return Object.keys(entities)
                  .filter((id) => id.startsWith('media_player.'))
                  .filter((id) => matchesMediaFilter(id, pill.mediaFilter, pill.mediaFilterMode));
              })();
              const mediaEntities = mediaIds.map((id) => entities[id]).filter(Boolean);
              const playingCount = mediaEntities.filter((e) => e.state === 'playing').length;

              return (
                <StatusPill
                  key={pill.id}
                  entity={mediaEntities}
                  pill={pill}
                  getA={getA}
                  getEntityImageUrl={getEntityImageUrl}
                  isMediaActive={isMediaActive}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                  badge={
                    pill.showCount
                      ? pill.type === 'emby'
                        ? playingCount >= 2
                          ? playingCount
                          : undefined
                        : pill.type === 'media_player' && playingCount > 0
                          ? playingCount
                          : undefined
                      : undefined
                  }
                  onClick={
                    pill.clickable
                      ? () => {
                          const activeEntities = mediaEntities.filter(isMediaActive);
                          const firstActive = activeEntities[0];
                          if (!firstActive) return;
                          setMediaNameDisplayFilter(pill);
                          const activeMediaIds = activeEntities
                            .map((entity) => entity.entity_id)
                            .filter(Boolean);
                          setActiveMediaId(firstActive.entity_id);
                          setActiveMediaGroupKey(null);
                          setActiveMediaGroupIds(activeMediaIds);
                          if (pill.type === 'emby' && Array.isArray(pill.sessionSensorIds)) {
                            setActiveMediaSessionSensorIds(pill.sessionSensorIds);
                          } else {
                            setActiveMediaSessionSensorIds(null);
                          }
                          setActiveMediaModal('media');
                        }
                      : undefined
                  }
                />
              );
            }

            if (pill.type === 'sonos') {
              const selectedMediaIds = Array.isArray(pill.mediaEntityIds)
                ? pill.mediaEntityIds
                : [];
              const filteredMediaIds = Object.keys(entities)
                .filter((id) => id.startsWith('media_player.'))
                .filter((id) => matchesMediaFilter(id, pill.mediaFilter, pill.mediaFilterMode));
              const sourceMediaIds =
                pill.mediaSelectionMode === 'select' && selectedMediaIds.length > 0
                  ? selectedMediaIds
                  : filteredMediaIds;
              const detectedSonosIds = getSonosEntities()
                .map((entity) => entity.entity_id)
                .filter((id) => sourceMediaIds.includes(id));
              const sonosIds = detectedSonosIds.length > 0 ? detectedSonosIds : sourceMediaIds;
              const sonosEntities = sonosIds.map((id) => entities[id]).filter(Boolean);
              const sonosPlayingCount = sonosEntities.filter((e) => e.state === 'playing').length;

              return (
                <StatusPill
                  key={pill.id}
                  entity={sonosEntities}
                  pill={pill}
                  getA={getA}
                  getEntityImageUrl={getEntityImageUrl}
                  isMediaActive={isSonosActive}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                  badge={pill.showCount && sonosPlayingCount > 0 ? sonosPlayingCount : undefined}
                  onClick={
                    pill.clickable
                      ? () => {
                          const activeEntities = sonosEntities.filter(isSonosActive);
                          const playingEntities = activeEntities.filter(
                            (entity) => entity.state === 'playing'
                          );
                          const metadataEntities = sonosEntities.filter(hasSonosMediaMetadata);
                          const preferredEntity =
                            playingEntities[0] ||
                            metadataEntities[0] ||
                            activeEntities[0] ||
                            sonosEntities[0];
                          const selectedBase =
                            activeEntities.length > 0
                              ? activeEntities
                              : metadataEntities.length > 0
                                ? metadataEntities
                                : sonosEntities;
                          const selectedIds = selectedBase
                            .map((entity) => entity?.entity_id)
                            .filter(Boolean);

                          if (!preferredEntity) return;

                          setMediaNameDisplayFilter(pill);
                          setActiveMediaId(preferredEntity.entity_id);
                          setActiveMediaGroupKey(null);
                          setActiveMediaGroupIds(
                            selectedIds.length > 0 ? selectedIds : [preferredEntity.entity_id]
                          );
                          setActiveMediaSessionSensorIds(null);
                          setActiveMediaModal('sonos');
                        }
                      : undefined
                  }
                />
              );
            }

            if (pill.type === 'waste') {
              const WASTE_BINS = [
                { entityId: 'sensor.gelbe_tonne', name: 'Gelbe Tonne', color: '#FFD700', iconBg: 'rgba(255,215,0,0.15)', mdiPath: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z' },
                { entityId: 'sensor.restmull',    name: 'Restmüll',    color: '#A9A9A9', iconBg: 'rgba(169,169,169,0.15)', mdiPath: 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M9,8H11V17H9V8M13,8H15V17H13V8Z' },
                { entityId: 'sensor.papier',      name: 'Papier',      color: '#60a5fa', iconBg: 'rgba(96,165,250,0.15)', mdiPath: 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' },
              ];
              const SOON = ['Heute', 'Morgen', 'in 2 Tagen'];
              const dueBins = WASTE_BINS.filter((b) => SOON.includes(entities[b.entityId]?.state));
              if (dueBins.length === 0) return null;
              return dueBins.map((bin) => (
                <StatusPill
                  key={`${pill.id}-${bin.entityId}`}
                  entity={entities[bin.entityId]}
                  pill={{ ...pill, type: 'waste_bin', _wasteBin: bin }}
                  getA={getA}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                />
              ));
            }

            if (pill.type === 'entity_count') {
              const activeState = pill.activeState || 'on';
              const entityIds = Array.isArray(pill.entityIds) ? pill.entityIds : [];
              const count = entityIds.filter((id) => entities[id]?.state === activeState).length;
              return (
                <StatusPill
                  key={pill.id}
                  pill={{ ...pill, _entityCount: count }}
                  entity={null}
                  getA={getA}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                  onClick={entityIds.length > 0 ? () => setShowEntityCountModal({ entityIds, activeState, label: pill.label || '', singularLabel: pill.singularLabel || '' }) : undefined}
                />
              );
            }

            if (pill.type === STATUS_GROUP_PILL_TYPE) {
              const groupData = resolveStatusGroupPill(pill, entities, t);
              if (!groupData.shouldRender) return null;
              // Nichts trifft zu (z. B. keine Heizung an): grau statt in der Farbe der Gruppe
              const leer = groupData.count === 0;

              return (
                <StatusPill
                  key={pill.id}
                  entity={groupData.syntheticEntity}
                  pill={{
                    ...pill,
                    icon: pill.icon || groupData.preset.icon,
                    iconBgColor: leer ? 'rgba(127, 127, 127, 0.1)' : pill.iconBgColor || groupData.preset.iconBgColor,
                    iconColor: leer ? 'text-[var(--text-muted)]' : pill.iconColor || groupData.preset.iconColor,
                  }}
                  getA={getA}
                  t={t}
                  isMobile={isMobile}
                  iconOnly={isMobile}
                  badge={pill.showCount && groupData.count > 0 ? groupData.count : undefined}
                  onClick={
                    pill.clickable !== false
                      ? () =>
                          setShowStatusGroupModal({
                            pill,
                            presetId: groupData.preset.id,
                          })
                      : undefined
                  }
                />
              );
            }

            // Default conditional pill
            return (
              <StatusPill
                key={pill.id}
                entity={entities[pill.entityId]}
                pill={pill}
                getA={getA}
                t={t}
                isMobile={isMobile}
                iconOnly={isMobile}
              />
            );
          })}
      </div>
    </div>
  );
}
