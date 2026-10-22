import HeizungPanelCard from '../../components/cards/HeizungPanelCard';
import { getSettings } from '../helpers';

export function renderHeizungPanelCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { entities, editMode, cardSettings, isMobile } = ctx;
  const settings = getSettings(cardSettings, settingsKey, cardId);

  return (
    <HeizungPanelCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      settings={settings}
      isMobile={isMobile}
    />
  );
}
