// Lichter der Licht-Panel-Kachel, solange in den Karteneinstellungen keine eigene Liste gespeichert ist.
// Auch Ausgangspunkt im Bearbeiten-Dialog, damit eine Änderung dort nicht alle Lichter verwirft.
export const DEFAULT_LIGHT_PANEL_TABS = [
  {
    id: 'eg',
    title: 'EG',
    icon: 'mdi:home-floor-0',
    entities: [
      { entityId: 'light.kuche', name: 'Küche', sperreEntityId: 'input_boolean.sperre_beleuchtung_kuche' },
      { entityId: 'light.beleuchtung_esstisch', name: 'Esstisch', sperreEntityId: 'input_boolean.sperre_beleuchtung_esstisch' },
      { entityId: 'light.eg_flur', name: 'Flur', sperreEntityId: 'switch.sperre_flur_eg' },
      { entityId: 'light.wohnzimmer', name: 'Wohnzimmer' },
      { entityId: 'light.gaste_wc', name: 'Gäste WC', sperreEntityId: 'switch.sperre_gaste_wc' },
      { entityId: 'light.eg_hwr', name: 'HWR', sperreEntityId: 'switch.sperre_hwr' },
      { entityId: 'light.wohnzimmer_schattenfuge', name: 'Schattenfuge', sperreEntityId: 'input_boolean.sperre_beleuchtung_schattenfuge_wz' },
      { entityId: 'light.bogenlampe', name: 'Bogenlampe' },
      { entityId: 'light.kuche_essen', name: 'Durchgang', sperreEntityId: 'input_boolean.sperre_beleuchtung_durchgang' },
      { entityId: 'light.eg_buro', name: 'Büro', sperreEntityId: 'switch.sperre_buro_eg_wled' },
    ],
  },
  {
    id: 'og',
    title: 'OG',
    icon: 'mdi:home-floor-1',
    entities: [
      { entityId: 'light.schlafzimmer', name: 'Schlafzimmer' },
      { entityId: 'light.schlafzimmer_stripe', name: 'Stripe' },
      { entityId: 'light.kinderzimmer', name: 'Kinderzimmer' },
      { entityId: 'light.og_flur', name: 'Flur', sperreEntityId: 'switch.sperre_flur_og' },
      { entityId: 'light.og_buro', name: 'Büro' },
      { entityId: 'light.og_badezimmer_decke', name: 'Badezimmer' },
      { entityId: 'light.og_badezimmer_dusche', name: 'Dusche' },
      { entityId: 'light.og_badezimmer_wc', name: 'WC' },
    ],
  },
  {
    id: 'aussen',
    title: 'Außen',
    icon: 'mdi:outdoor-lamp',
    entities: [
      { entityId: 'light.terasse', name: 'Terrasse' },
      { entityId: 'light.eingang', name: 'Eingang' },
      { entityId: 'light.beleuchtung_schuppen', name: 'Schuppen' },
      { entityId: 'light.wled_anpentaplus', name: 'Vordach' },
      { entityId: 'light.wled_anpentaplus_segment_1', name: 'Weg' },
      { entityId: 'light.wled_anpentaplus_segment_2', name: 'Einfahrt' },
    ],
  },
  {
    id: 'automatik',
    title: 'Automatik',
    icon: 'mdi:auto-mode',
    entities: [
      { entityId: 'automation.treppenbeleuchtung_blueprint', name: 'Treppenbeleuchtung' },
    ],
  },
];

/** Zeitschaltuhr im Tab zeigen? Ohne Einstellung nur im Tab „Automatik“. */
export const tabShowsSchedules = (tab) => (typeof tab?.showSchedules === 'boolean' ? tab.showSchedules : tab?.id === 'automatik');

/**
 * Welche Zeitpläne ein Tab zeigt: „Automatik“ alle, jeder andere Tab nur die,
 * die mindestens ein Gerät des Tabs schalten. null = keine Einschränkung.
 */
export const scheduleEntityFilter = (tab) =>
  tab?.id === 'automatik' ? null : (tab?.entities || []).map((e) => e.entityId);

/** Neue, eindeutige Tab-ID aus dem Titel (z. B. „Weihnachten“ → „weihnachten“, sonst „tab_2“). */
export function newTabId(title, tabs) {
  const base =
    String(title || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'tab';
  const used = new Set((tabs || []).map((t) => t.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
