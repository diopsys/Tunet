import HeizungCard from '../../components/cards/HeizungCard';
import PufferCard from '../../components/cards/PufferCard';
import { getSettings } from '../helpers';

export function renderHeizungCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { entities, editMode, cardSettings, customNames } = ctx;
  return (
    <HeizungCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      settings={getSettings(cardSettings, settingsKey, cardId)}
      name={customNames?.[cardId] || ''}
    />
  );
}

export function renderPufferCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { entities, editMode, cardSettings, customNames, conn } = ctx;
  return (
    <PufferCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      conn={conn}
      settings={getSettings(cardSettings, settingsKey, cardId)}
      name={customNames?.[cardId] || ''}
    />
  );
}
