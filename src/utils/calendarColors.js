// Farben der Kalender: eingestellt (Karteneinstellung calendarColors) oder aus der Entity-ID
const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Eingestellte Farbe eines Kalenders oder null. */
export function customCalendarColor(calendarId, calendarColors) {
  const color = calendarColors?.[calendarId];
  return typeof color === 'string' && HEX.test(color) ? color : null;
}

/** Farbe eines Kalenders: eingestellt oder fest aus der Entity-ID abgeleitet. */
export function getCalendarColor(calendarId, calendarColors) {
  const custom = customCalendarColor(calendarId, calendarColors);
  if (custom) return custom;
  let hash = 0;
  const id = String(calendarId || '');
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
