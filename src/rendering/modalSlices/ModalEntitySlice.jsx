import { lazyWithRetry } from '../../utils/appUpdate';
import { ModalSuspense } from '../../components';
import { prepareNordpoolData } from '../../services';
import { prepareOctopusData } from '../../services/octopusUtils';

const CalendarModal = lazyWithRetry(() => import('../../modals/CalendarModal'));
const CostModal = lazyWithRetry(() => import('../../modals/CostModal'));
const GenericAndroidTVModal = lazyWithRetry(() => import('../../modals/GenericAndroidTVModal'));
const GenericAppleTVModal = lazyWithRetry(() => import('../../modals/GenericAppleTVModal'));
const GenericClimateModal = lazyWithRetry(() => import('../../modals/GenericClimateModal'));
const GenericFanModal = lazyWithRetry(() => import('../../modals/GenericFanModal'));
const CoverModal = lazyWithRetry(() => import('../../modals/CoverModal'));
const AlarmModal = lazyWithRetry(() => import('../../modals/AlarmModal'));
const AlarmActionPinModal = lazyWithRetry(() => import('../../modals/AlarmActionPinModal'));
const CameraModal = lazyWithRetry(() => import('../../modals/CameraModal'));
const WeatherModal = lazyWithRetry(() => import('../../modals/WeatherModal'));
const LeafModal = lazyWithRetry(() => import('../../modals/LeafModal'));
const LightModal = lazyWithRetry(() => import('../../modals/LightModal'));
const NordpoolModal = lazyWithRetry(() => import('../../modals/NordpoolModal'));
const PersonModal = lazyWithRetry(() => import('../../modals/PersonModal'));
const SensorModal = lazyWithRetry(() => import('../../modals/SensorModal'));
const TodoModal = lazyWithRetry(() => import('../../modals/TodoModal'));
const RoomModal = lazyWithRetry(() => import('../../modals/RoomModal'));
const VacuumModal = lazyWithRetry(() => import('../../modals/VacuumModal'));
const MowerModal = lazyWithRetry(() => import('../../modals/MowerModal'));
const WaermepumpeModal = lazyWithRetry(() => import('../../modals/WaermepumpeModal'));
const LuftungsanlageModal = lazyWithRetry(() => import('../../modals/LuftungsanlageModal'));
const PvModal = lazyWithRetry(() => import('../../modals/PvModal'));
const BeregnungModal = lazyWithRetry(() => import('../../modals/BeregnungModal'));
const NavimowModal = lazyWithRetry(() => import('../../modals/NavimowModal'));
const EntityCountModal = lazyWithRetry(() => import('../../modals/EntityCountModal'));
const SecurityLockModal = lazyWithRetry(() => import('../../modals/SecurityLockModal'));
const SecurityContactsModal = lazyWithRetry(() => import('../../modals/SecurityContactsModal'));
const PoolModal = lazyWithRetry(() => import('../../modals/PoolModal'));

export function ModalEntitySlice({ core, modals, cardConfig, entityHelpers, resolveCarSettings }) {
  const { entities, conn, activeUrl, authRef, config, t, language } = core;
  const {
    showNordpoolModal,
    setShowNordpoolModal,
    showCostModal,
    setShowCostModal,
    activeClimateEntityModal,
    setActiveClimateEntityModal,
    showLightModal,
    setShowLightModal,
    activeCarModal,
    setActiveCarModal,
    showPersonModal,
    setShowPersonModal,
    showAndroidTVModal,
    setShowAndroidTVModal,
    showAppleTVModal,
    setShowAppleTVModal,
    showVacuumModal,
    setShowVacuumModal,
    showMowerModal,
    setShowMowerModal,
    showFanModal,
    setShowFanModal,
    showSensorInfoModal,
    setShowSensorInfoModal,
    showCalendarModal,
    setShowCalendarModal,
    showTodoModal,
    setShowTodoModal,
    showRoomModal,
    setShowRoomModal,
    showCoverModal,
    setShowCoverModal,
    showAlarmModal,
    setShowAlarmModal,
    showAlarmActionModal,
    setShowAlarmActionModal,
    showCameraModal,
    setShowCameraModal,
    showWeatherModal,
    setShowWeatherModal,
    activeVacuumId,
    setActiveVacuumId,
    activeMowerId,
    setActiveMowerId,
    showWaermepumpeModal,
    setShowWaermepumpeModal,
    showLuftungsanlageModal,
    setShowLuftungsanlageModal,
    showPvModal,
    setShowPvModal,
    showBeregnungModal,
    setShowBeregnungModal,
    showNavimowModal,
    setShowNavimowModal,
    showEntityCountModal,
    setShowEntityCountModal,
    showSecurityLockModal,
    setShowSecurityLockModal,
    showSecurityContactsModal,
    setShowSecurityContactsModal,
    showPoolModal,
    setShowPoolModal,
  } = modals;
  const { cardSettings, saveCardSetting, customNames, customIcons, getCardSettingsKey } =
    cardConfig;
  const {
    callService,
    getEntityImageUrl,
    getA,
    getS,
    optimisticLightBrightness,
    setOptimisticLightBrightness,
    hvacMap,
    fanMap,
    swingMap,
  } = entityHelpers;

  return (
    <>
      {showNordpoolModal &&
        (() => {
          const isOctopus = showNordpoolModal.startsWith('octopus_card_');
          const data = isOctopus
            ? prepareOctopusData(showNordpoolModal, {
                getCardSettingsKey,
                cardSettings,
                entities,
                customNames,
              })
            : prepareNordpoolData(showNordpoolModal, {
                getCardSettingsKey,
                cardSettings,
                entities,
                customNames,
              });
          if (!data) return null;
          return (
            <ModalSuspense>
              <NordpoolModal
                show={true}
                onClose={() => setShowNordpoolModal(null)}
                entity={data.entity}
                fullPriceData={data.fullPriceData}
                currentPriceIndex={data.currentPriceIndex}
                priceStats={data.priceStats}
                name={data.name}
                t={t}
                language={language}
                saveCardSetting={saveCardSetting}
                cardId={showNordpoolModal}
                settings={data.settings}
                hideSupport={isOctopus}
                entities={entities}
                conn={conn}
              />
            </ModalSuspense>
          );
        })()}

      {showCostModal &&
        (() => {
          const settingsKey = getCardSettingsKey(showCostModal);
          const settings = cardSettings[settingsKey] || cardSettings[showCostModal] || {};
          const name = customNames?.[showCostModal] || t('energyCost.title');
          const iconName = customIcons?.[showCostModal] || null;
          return (
            <ModalSuspense>
              <CostModal
                show={true}
                onClose={() => setShowCostModal(null)}
                conn={conn}
                entities={entities}
                todayEntityId={settings.todayId}
                monthEntityId={settings.monthId}
                name={name}
                iconName={iconName}
                currency={settings.currency}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {activeClimateEntityModal &&
        (() => {
          const target =
            typeof activeClimateEntityModal === 'string'
              ? { entityId: activeClimateEntityModal }
              : activeClimateEntityModal;
          const climateEntity = entities[target.entityId];
          if (!climateEntity) return null;

          const settingsKey =
            target.settingsKey || (target.cardId ? getCardSettingsKey(target.cardId) : null);
          const settings = settingsKey
            ? cardSettings[settingsKey] || cardSettings[target.cardId] || {}
            : {};

          return (
            <ModalSuspense>
              <GenericClimateModal
                entityId={target.entityId}
                entity={climateEntity}
                onClose={() => setActiveClimateEntityModal(null)}
                callService={callService}
                hvacMap={hvacMap}
                fanMap={fanMap}
                swingMap={swingMap}
                settings={settings}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showLightModal && (
        <ModalSuspense>
          <LightModal
            show={!!showLightModal}
            onClose={() => setShowLightModal(null)}
            lightId={showLightModal}
            entities={entities}
            callService={callService}
            getA={getA}
            optimisticLightBrightness={optimisticLightBrightness}
            setOptimisticLightBrightness={setOptimisticLightBrightness}
            customIcons={customIcons}
            t={t}
          />
        </ModalSuspense>
      )}

      {showAndroidTVModal &&
        (() => {
          const settings = cardSettings[getCardSettingsKey(showAndroidTVModal)] || {};
          return (
            <ModalSuspense>
              <GenericAndroidTVModal
                show={true}
                onClose={() => setShowAndroidTVModal(null)}
                entities={entities}
                mediaPlayerId={settings.mediaPlayerId}
                remoteId={settings.remoteId}
                linkedMediaPlayers={settings.linkedMediaPlayers}
                callService={callService}
                getA={getA}
                getEntityImageUrl={getEntityImageUrl}
                customNames={customNames}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showAppleTVModal &&
        (() => {
          const settings = cardSettings[getCardSettingsKey(showAppleTVModal)] || {};
          return (
            <ModalSuspense>
              <GenericAppleTVModal
                show={true}
                cardId={showAppleTVModal}
                onClose={() => setShowAppleTVModal(null)}
                entities={entities}
                mediaPlayerId={settings.mediaPlayerId}
                remoteId={settings.remoteId}
                linkedMediaPlayers={settings.linkedMediaPlayers}
                callService={callService}
                getA={getA}
                getEntityImageUrl={getEntityImageUrl}
                customNames={customNames}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showVacuumModal && (
        <ModalSuspense>
          {(() => {
            const vacuumSettingsKey = getCardSettingsKey(activeVacuumId);
            const vacuumSettings =
              cardSettings[vacuumSettingsKey] || cardSettings[activeVacuumId] || {};

            return (
              <VacuumModal
                show={showVacuumModal}
                onClose={() => {
                  setShowVacuumModal(false);
                  setActiveVacuumId(null);
                }}
                entities={entities}
                callService={callService}
                getA={getA}
                t={t}
                vacuumId={activeVacuumId}
                vacuumSettings={vacuumSettings}
                conn={conn}
                getEntityImageUrl={getEntityImageUrl}
              />
            );
          })()}
        </ModalSuspense>
      )}

      {showMowerModal && activeMowerId && entities[activeMowerId] && (
        <ModalSuspense>
          <MowerModal
            show={showMowerModal}
            onClose={() => {
              setShowMowerModal(false);
              setActiveMowerId(null);
            }}
            entities={entities}
            callService={callService}
            getA={getA}
            t={t}
            mowerId={activeMowerId}
          />
        </ModalSuspense>
      )}

      {showFanModal && entities[showFanModal] && (
        <ModalSuspense>
          <GenericFanModal
            show={true}
            onClose={() => setShowFanModal(null)}
            entityId={showFanModal}
            entity={entities[showFanModal]}
            callService={callService}
            t={t}
          />
        </ModalSuspense>
      )}

      {activeCarModal &&
        (() => {
          const settingsKey = getCardSettingsKey(activeCarModal);
          const settings = resolveCarSettings(
            activeCarModal,
            cardSettings[settingsKey] || cardSettings[activeCarModal] || {}
          );
          const name = customNames[activeCarModal] || t('car.defaultName');
          return (
            <ModalSuspense>
              <LeafModal
                show={true}
                onClose={() => setActiveCarModal(null)}
                entities={entities}
                callService={callService}
                getS={getS}
                getA={getA}
                t={t}
                car={{ name, ...settings }}
              />
            </ModalSuspense>
          );
        })()}

      {showWeatherModal &&
        (() => {
          const settingsKey = getCardSettingsKey(showWeatherModal);
          const settings = cardSettings[settingsKey] || cardSettings[showWeatherModal] || {};
          const weatherEntity = settings.weatherId ? entities[settings.weatherId] : null;
          const tempEntity = settings.tempId ? entities[settings.tempId] : null;
          if (!weatherEntity) return null;
          return (
            <ModalSuspense>
              <WeatherModal
                show={true}
                onClose={() => setShowWeatherModal(null)}
                conn={conn}
                weatherEntity={weatherEntity}
                tempEntity={tempEntity}
                language={language}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showCalendarModal && (
        <ModalSuspense>
          <CalendarModal
            show={Boolean(showCalendarModal)}
            onClose={() => setShowCalendarModal(false)}
            conn={conn}
            entities={entities}
            language={language}
            t={t}
            personCalendars={
              typeof showCalendarModal === 'string'
                ? cardSettings[showCalendarModal]?.personCalendars || []
                : []
            }
          />
        </ModalSuspense>
      )}

      {showTodoModal &&
        (() => {
          const todoSettingsKey = getCardSettingsKey(showTodoModal);
          const todoSettings = cardSettings[todoSettingsKey] || cardSettings[showTodoModal] || {};
          return (
            <ModalSuspense>
              <TodoModal
                show={true}
                onClose={() => setShowTodoModal(null)}
                conn={conn}
                entities={entities}
                settings={todoSettings}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showRoomModal &&
        (() => {
          const roomSettingsKey = getCardSettingsKey(showRoomModal);
          const roomSettings = cardSettings[roomSettingsKey] || cardSettings[showRoomModal] || {};
          return (
            <ModalSuspense>
              <RoomModal
                show={true}
                onClose={() => setShowRoomModal(null)}
                settings={roomSettings}
                entities={entities}
                conn={conn}
                callService={(domain, service, data) => callService(domain, service, data)}
                getEntityImageUrl={getEntityImageUrl}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showCoverModal &&
        (() => {
          const isDirectCoverEntityId =
            typeof showCoverModal === 'string' && showCoverModal.startsWith('cover.');
          const coverSettingsKey = isDirectCoverEntityId ? null : getCardSettingsKey(showCoverModal);
          const coverSettings = isDirectCoverEntityId
            ? {}
            : cardSettings[coverSettingsKey] || cardSettings[showCoverModal] || {};
          const coverEntityId = isDirectCoverEntityId ? showCoverModal : coverSettings.coverId;
          const coverEntity = coverEntityId ? entities[coverEntityId] : null;
          if (!coverEntityId || !coverEntity) return null;
          return (
            <ModalSuspense>
              <CoverModal
                show={true}
                onClose={() => setShowCoverModal(null)}
                entityId={coverEntityId}
                entity={coverEntity}
                entities={entities}
                callService={callService}
                customIcons={customIcons}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showAlarmModal &&
        (() => {
          const isDirectEntityId =
            typeof showAlarmModal === 'string' && showAlarmModal.startsWith('alarm_control_panel.');
          const alarmSettingsKey = isDirectEntityId ? null : getCardSettingsKey(showAlarmModal);
          const alarmSettings = isDirectEntityId
            ? {}
            : cardSettings[alarmSettingsKey] || cardSettings[showAlarmModal] || {};
          const alarmEntityId = isDirectEntityId ? showAlarmModal : alarmSettings.alarmId;
          const alarmEntity = alarmEntityId ? entities[alarmEntityId] : null;
          if (!alarmEntityId || !alarmEntity) return null;
          return (
            <ModalSuspense>
              <AlarmModal
                show={true}
                onClose={() => setShowAlarmModal(null)}
                entityId={alarmEntityId}
                entity={alarmEntity}
                callService={callService}
                customName={isDirectEntityId ? null : customNames?.[showAlarmModal]}
                customIcon={isDirectEntityId ? null : customIcons?.[showAlarmModal]}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showAlarmActionModal &&
        (() => {
          const actionCardId = showAlarmActionModal.cardId;
          const actionKey = showAlarmActionModal.actionKey;
          const alarmSettingsKey = getCardSettingsKey(actionCardId);
          const alarmSettings = cardSettings[alarmSettingsKey] || cardSettings[actionCardId] || {};
          const alarmEntityId = alarmSettings.alarmId;
          const alarmEntity = alarmEntityId ? entities[alarmEntityId] : null;
          if (!alarmEntityId || !alarmEntity || !actionKey) return null;

          return (
            <ModalSuspense>
              <AlarmActionPinModal
                show={true}
                onClose={() => setShowAlarmActionModal(null)}
                actionKey={actionKey}
                entityId={alarmEntityId}
                entity={alarmEntity}
                callService={callService}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showCameraModal &&
        (() => {
          const cameraSettingsKey = getCardSettingsKey(showCameraModal);
          const cameraSettings =
            cardSettings[cameraSettingsKey] || cardSettings[showCameraModal] || {};
          const cameraEntityId = cameraSettings.cameraId;
          const cameraEntity = cameraEntityId ? entities[cameraEntityId] : null;
          if (!cameraEntityId || !cameraEntity) return null;
          return (
            <ModalSuspense>
              <CameraModal
                show={true}
                onClose={() => setShowCameraModal(null)}
                entityId={cameraEntityId}
                entity={cameraEntity}
                customName={customNames?.[showCameraModal]}
                customIcon={customIcons?.[showCameraModal]}
                conn={conn}
                getEntityImageUrl={getEntityImageUrl}
                settings={cameraSettings}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showSensorInfoModal &&
        (() => {
          const target =
            typeof showSensorInfoModal === 'string'
              ? { entityId: showSensorInfoModal }
              : showSensorInfoModal;
          return (
            <ModalSuspense>
              <SensorModal
                isOpen={true}
                onClose={() => setShowSensorInfoModal(null)}
                entityId={target.entityId}
                entity={entities[target.entityId]}
                entities={entities}
                customName={customNames[target.cardId || target.entityId]}
                conn={conn}
                haUrl={activeUrl}
                haToken={
                  config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token
                }
                callService={callService}
                t={t}
              />
            </ModalSuspense>
          );
        })()}

      {showWaermepumpeModal && (
        <ModalSuspense>
          <WaermepumpeModal
            show={true}
            onClose={() => setShowWaermepumpeModal(null)}
            entities={entities}
            customNames={customNames}
            cardId={showWaermepumpeModal}
            callService={callService}
            conn={conn}
            haUrl={activeUrl}
            haToken={config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token}
            onOpenSensorModal={setShowSensorInfoModal}
            t={t}
          />
        </ModalSuspense>
      )}

      {showLuftungsanlageModal && (
        <ModalSuspense>
          <LuftungsanlageModal
            show={true}
            onClose={() => setShowLuftungsanlageModal(null)}
            entities={entities}
            customNames={customNames}
            cardId={showLuftungsanlageModal}
            callService={callService}
            conn={conn}
            haUrl={activeUrl}
            haToken={
              config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token
            }
            t={t}
          />
        </ModalSuspense>
      )}

      {showPvModal && (
        <ModalSuspense>
          <PvModal
            show={true}
            onClose={() => setShowPvModal(null)}
            entities={entities}
            customNames={customNames}
            cardId={showPvModal}
            settings={cardSettings?.[getCardSettingsKey(showPvModal)] || cardSettings?.[showPvModal]}
            conn={conn}
            haUrl={activeUrl}
            haToken={
              config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token
            }
            t={t}
          />
        </ModalSuspense>
      )}

      {showBeregnungModal && (
        <ModalSuspense>
          <BeregnungModal
            show={true}
            onClose={() => setShowBeregnungModal(null)}
            settings={cardSettings?.[getCardSettingsKey(showBeregnungModal)] || cardSettings?.[showBeregnungModal]}
            entities={entities}
            callService={callService}
            conn={conn}
            haUrl={activeUrl}
            haToken={
              config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token
            }
          />
        </ModalSuspense>
      )}

      {showNavimowModal && (
        <ModalSuspense>
          <NavimowModal
            show={true}
            onClose={() => setShowNavimowModal(null)}
            mowerId={showNavimowModal}
            entities={entities}
            callService={callService}
            conn={conn}
            haUrl={activeUrl}
            haToken={
              config.authMethod === 'oauth' ? authRef?.current?.accessToken || '' : config.token
            }
          />
        </ModalSuspense>
      )}

      {showEntityCountModal !== null && (
        <ModalSuspense>
          <EntityCountModal
            show={true}
            onClose={() => setShowEntityCountModal(null)}
            entityIds={showEntityCountModal?.entityIds || []}
            activeState={showEntityCountModal?.activeState || 'on'}
            label={showEntityCountModal?.label || ''}
            singularLabel={showEntityCountModal?.singularLabel || ''}
          />
        </ModalSuspense>
      )}

      {showSecurityLockModal && (
        <ModalSuspense>
          <SecurityLockModal
            show={true}
            onClose={() => setShowSecurityLockModal(null)}
            lockInfo={showSecurityLockModal}
            entities={entities}
            callService={callService}
          />
        </ModalSuspense>
      )}

      {showSecurityContactsModal && (
        <ModalSuspense>
          <SecurityContactsModal
            show={true}
            onClose={() => setShowSecurityContactsModal(null)}
            contactsInfo={showSecurityContactsModal}
            entities={entities}
          />
        </ModalSuspense>
      )}

      {showPoolModal && (
        <ModalSuspense>
          <PoolModal
            show={true}
            onClose={() => setShowPoolModal(null)}
            entities={entities}
            callService={callService}
          />
        </ModalSuspense>
      )}

      {showPersonModal && (
        <ModalSuspense>
          <PersonModal
            show={!!showPersonModal}
            onClose={() => setShowPersonModal(null)}
            personId={showPersonModal}
            entity={showPersonModal ? entities[showPersonModal] : null}
            entities={entities}
            customName={showPersonModal ? customNames[showPersonModal] : null}
            getEntityImageUrl={getEntityImageUrl}
            conn={conn}
            t={t}
            settings={
              showPersonModal
                ? cardSettings[getCardSettingsKey(showPersonModal, 'header')] ||
                  cardSettings[showPersonModal] ||
                  {}
                : {}
            }
          />
        </ModalSuspense>
      )}
    </>
  );
}
