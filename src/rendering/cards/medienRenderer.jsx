import MedienCard from '../../components/cards/MedienCard';
import { getSettings } from '../helpers';

export function renderMedienCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { entities, editMode, cardSettings, customNames, callService, getEntityImageUrl, conn } = ctx;
  return (
    <MedienCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      settings={getSettings(cardSettings, settingsKey, cardId)}
      name={customNames?.[cardId] || ''}
      callService={callService}
      getEntityImageUrl={getEntityImageUrl}
      conn={conn}
    />
  );
}
