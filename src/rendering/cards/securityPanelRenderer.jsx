import SecurityPanelCard from '../../components/cards/SecurityPanelCard';
import { getSettings } from '../helpers';

export function renderSecurityPanelCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const {
    entities,
    editMode,
    cardSettings,
    callService,
    isMobile,
    setShowSecurityLockModal,
    setShowSecurityContactsModal,
    setShowAlarmModal,
  } = ctx;
  const settings = getSettings(cardSettings, settingsKey, cardId);

  return (
    <SecurityPanelCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      callService={callService}
      settings={settings}
      isMobile={isMobile}
      setShowSecurityLockModal={setShowSecurityLockModal}
      setShowSecurityContactsModal={setShowSecurityContactsModal}
      setShowAlarmModal={setShowAlarmModal}
    />
  );
}
