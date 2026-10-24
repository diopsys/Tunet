import { safeHaUrl } from '../components/cards/HeizungCard';

/*
 * Belegung der Beregnungs-Karte und ihres Dialogs über settings.beregnung. Ohne Einstellung
 * gilt die ursprüngliche Anlage (STANDARD). Werte sind Entitäten oder { entity, attribute }.
 * {
 *   master?, masterStatus?,              // aktiv, wenn eine der beiden „on“ ist; master = IU-Controller
 *   zonen: [{ entity, name?, color?, smartMin?, schalter?, minuten? }],
 *                                        // name fehlt → friendly_name; ohne schalter/minuten startet
 *                                        // der Dialog die Zone über irrigation_unlimited.manual_run
 *   regen?, regenStunde?, regenWoche?, regenJahr?, regenRate?,   // regen = heute (auch für den Verlauf)
 *   vorrat?, gesamt?, verdunstung?, wasser?,
 *   ventile?: [{ entity, name }],        // leer → Reiter „Ventile“ entfällt
 *   url?,                                // Tippen auf das Tropfen-Symbol öffnet diese HA-Seite
 * }
 */
export const BEREGNUNG_STANDARD = {
  master: 'binary_sensor.irrigation_unlimited_c1_m',
  masterStatus: 'binary_sensor.beregung_master_status',
  zonen: [
    { entity: 'binary_sensor.irrigation_unlimited_c1_z1', name: 'Terrasse rechts', color: '#34d399', schalter: 'switch.irrigation_manual_zone_1', minuten: 'input_number.manual_irrigation_z1_minutes', smartMin: 'sensor.smart_irrigation_terrasse_rechts_min' },
    { entity: 'binary_sensor.irrigation_unlimited_c1_z3', name: 'Terrasse links', color: '#60a5fa', schalter: 'switch.irrigation_manual_zone_3', minuten: 'input_number.manual_irrigation_z3_minutes', smartMin: 'sensor.smart_irrigation_terrasse_links_min' },
    { entity: 'binary_sensor.irrigation_unlimited_c1_z2', name: 'Rasenfläche', color: '#a78bfa', schalter: 'switch.irrigation_manual_zone_2', minuten: 'input_number.manual_irrigation_z2_minutes', smartMin: 'sensor.smart_irrigation_rasenflache_min' },
    { entity: 'binary_sensor.irrigation_unlimited_c1_z4', name: 'Vorgarten rechts', color: '#f59e0b', schalter: 'switch.irrigation_manual_zone_4', minuten: 'input_number.manual_irrigation_z4_minutes' },
    { entity: 'binary_sensor.irrigation_unlimited_c1_z5', name: 'Vorgarten links', color: '#fb923c', schalter: 'switch.irrigation_manual_zone_5', minuten: 'input_number.manual_irrigation_z5_minutes' },
  ],
  regen: 'sensor.gw2000a_daily_rain',
  regenStunde: 'sensor.gw2000a_hourly_rain',
  regenWoche: 'sensor.gw2000a_weekly_rain',
  regenJahr: 'sensor.gw2000a_yearly_rain',
  regenRate: 'sensor.gw2000a_rain_rate',
  vorrat: 'sensor.rasenflache_bucket',
  gesamt: 'sensor.beregnung_gesamtzeit_minuten',
  verdunstung: null,
  wasser: 'sensor.wasserzaehler_value',
  ventile: [
    { entity: 'switch.magnetventil_1', name: 'Terrasse rechts' },
    { entity: 'switch.magnetventil_4', name: 'Terrasse links' },
    { entity: 'switch.magnetventil_3', name: 'Rasenfläche' },
    { entity: 'switch.magnetventil_5', name: 'Vorgarten rechts' },
    { entity: 'switch.magnetventil_6', name: 'Vorgarten links' },
    { entity: 'switch.magnetventil_2', name: 'Wasserdose' },
  ],
  url: null,
};

const FARBEN = ['#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#fb923c', '#f472b6', '#22d3ee', '#a3e635', '#facc15'];
const WERTE = ['regen', 'regenStunde', 'regenWoche', 'regenJahr', 'regenRate', 'vorrat', 'gesamt', 'verdunstung', 'wasser'];

export function resolveBeregnungConfig(settings) {
  const b = settings?.beregnung && typeof settings.beregnung === 'object' ? settings.beregnung : null;
  if (!b) return BEREGNUNG_STANDARD;
  const zonen = (Array.isArray(b.zonen) ? b.zonen : [])
    .filter((z) => z && typeof z.entity === 'string')
    .map((z, i) => ({ ...z, color: z.color || FARBEN[i % FARBEN.length] }));
  const config = {
    master: b.master || null,
    masterStatus: b.masterStatus || null,
    zonen,
    ventile: (Array.isArray(b.ventile) ? b.ventile : []).filter((v) => v && typeof v.entity === 'string'),
    url: safeHaUrl(b.url),
  };
  for (const key of WERTE) config[key] = b[key] || null;
  return config;
}

/** Wert einer Entität oder eines ihrer Attribute ({ entity, attribute }); null, wenn nicht da. */
export function beregnungWert(entities, spec) {
  if (!spec) return null;
  const id = typeof spec === 'string' ? spec : spec.entity;
  const e = entities?.[id];
  if (!e) return null;
  const roh = typeof spec === 'string' || !spec.attribute ? e.state : e.attributes?.[spec.attribute];
  if (roh == null || roh === 'unavailable' || roh === 'unknown') return null;
  return roh;
}

/** Läuft die Anlage gerade? */
export function beregnungAktiv(entities, config) {
  return [config.masterStatus, config.master].some((id) => id && entities?.[id]?.state === 'on');
}

/** Anzeigename einer Zone. */
export function zonenName(entities, zone) {
  return zone.name || entities?.[zone.entity]?.attributes?.friendly_name || zone.entity;
}
