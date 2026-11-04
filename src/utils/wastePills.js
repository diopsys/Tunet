// Müllabholung-Pill: welche Sensoren sie zeigt und ab wann eine Abholung „bald“ ist.
// Die Sensoren liefern „Heute“, „Morgen“ oder „in N Tagen“ (Waste Collection Schedule).

const MDI_SACK = 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z';
const MDI_TONNE = 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M9,8H11V17H9V8M13,8H15V17H13V8Z';
const MDI_PAPIER = 'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z';

const STYLE_GELB = { color: '#FFD700', iconBg: 'rgba(255,215,0,0.15)', mdiPath: MDI_SACK };
const STYLE_REST = { color: '#A9A9A9', iconBg: 'rgba(169,169,169,0.15)', mdiPath: MDI_TONNE };
const STYLE_PAPIER = { color: '#60a5fa', iconBg: 'rgba(96,165,250,0.15)', mdiPath: MDI_PAPIER };

// Ohne eigene Auswahl (pill.entityIds leer) gelten diese drei Tonnen mit festen Namen.
export const DEFAULT_WASTE_BINS = [
  { entityId: 'sensor.gelbe_tonne', name: 'Gelbe Tonne', ...STYLE_GELB },
  { entityId: 'sensor.restmull', name: 'Restmüll', ...STYLE_REST },
  { entityId: 'sensor.papier', name: 'Papier', ...STYLE_PAPIER },
];

export const DEFAULT_WASTE_DAYS_AHEAD = 2;

const styleFor = (entityId) => {
  const id = entityId.toLowerCase();
  if (id.includes('papier') || id.includes('paper')) return STYLE_PAPIER;
  if (id.includes('gelb') || id.includes('yellow')) return STYLE_GELB;
  return STYLE_REST;
};

/** Tonnen der Pill: eigene Auswahl (Name aus HA) oder die drei Standardtonnen. */
export const getWasteBins = (pill, entities = {}) => {
  const ids = Array.isArray(pill?.entityIds) ? pill.entityIds.filter(Boolean) : [];
  if (ids.length === 0) return DEFAULT_WASTE_BINS;
  return ids.map((entityId) => {
    const known = DEFAULT_WASTE_BINS.find((b) => b.entityId === entityId);
    const name = entities[entityId]?.attributes?.friendly_name || known?.name || entityId;
    return { ...(known || styleFor(entityId)), entityId, name };
  });
};

/** Tage bis zur Abholung aus „Heute“/„Morgen“/„in N Tagen“, sonst null. */
export const wasteDaysUntil = (state) => {
  if (state === 'Heute') return 0;
  if (state === 'Morgen') return 1;
  const match = /^in (\d+) Tagen$/.exec(state || '');
  return match ? Number(match[1]) : null;
};

export const getWasteDaysAhead = (pill) => {
  const days = Number(pill?.wasteDaysAhead);
  return Number.isInteger(days) && days >= 0 ? days : DEFAULT_WASTE_DAYS_AHEAD;
};

export const isWasteDue = (state, daysAhead = DEFAULT_WASTE_DAYS_AHEAD) => {
  const days = wasteDaysUntil(state);
  return days !== null && days <= daysAhead;
};
