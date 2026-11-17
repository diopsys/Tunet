// Öffnen von Zeitschaltuhr-Übersicht und -Editor von überall (Karte, Pill, langer Druck auf Karten).
// Angezeigt werden beide vom ScheduleHost, der einmal in der App hängt.

export const OPEN_OVERVIEW_EVENT = 'tunet:schedule-overview';
export const OPEN_EDITOR_EVENT = 'tunet:schedule-editor';

export const openScheduleOverview = () => globalThis.window?.dispatchEvent(new globalThis.CustomEvent(OPEN_OVERVIEW_EVENT));

/** detail: { schedule } zum Bearbeiten oder { entities: [...] } für einen neuen Zeitplan. */
export const openScheduleEditor = (detail = {}) =>
  globalThis.window?.dispatchEvent(new globalThis.CustomEvent(OPEN_EDITOR_EVENT, { detail }));
