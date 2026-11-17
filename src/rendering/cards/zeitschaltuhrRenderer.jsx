import ZeitschaltuhrCard from '../../components/cards/ZeitschaltuhrCard';

export function renderZeitschaltuhrCard(cardId, dragProps, getControls, cardStyle, _settingsKey, ctx) {
  const { entities, editMode, t } = ctx;
  return (
    <ZeitschaltuhrCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      t={t}
    />
  );
}
