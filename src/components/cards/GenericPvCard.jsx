import { memo, useEffect, useState } from 'react';
import { Sun } from '../../icons';
import { getIconComponent } from '../../icons';
import { openHaPath, safeHaUrl } from './HeizungCard';

export const PV_ENTITY_IDS = {
  pvW: 'sensor.solar_panel_production_w',
  pvDaily: 'sensor.solar_panel_production_daily',
  pvMonthly: 'sensor.solar_panel_production_monthly',
  pvYearly: 'sensor.solar_panel_production_yearly',
  houseW: 'sensor.solar_house_consumption_w',
  houseDaily: 'sensor.solar_house_consumption_daily',
  batteryDcPower: 'sensor.solaredge_b1_dc_power',
  batteryInW: 'sensor.solar_battery_in_w',
  batterySoc: 'sensor.solaredge_b1_state_of_energy',
  batteryInDaily: 'sensor.solar_battery_in_daily',
  batteryOutDaily: 'sensor.solar_battery_out_daily',
  gridW: 'sensor.solaredge_m1_ac_power',
  gridImportW: 'sensor.solar_imported_power_w',
  gridExportW: 'sensor.solar_exported_power_w',
  gridImportDaily: 'sensor.solar_imported_power_daily',
  gridExportDaily: 'sensor.solar_exported_power_daily',
  forecastToday: 'sensor.pv_anlage_energy_day_1',
  forecastTomorrow: 'sensor.pv_anlage_energy_day_2',
  forecastDay3: 'sensor.pv_anlage_energy_day_3',
  forecastDay4: 'sensor.pv_anlage_energy_day_4',
  forecastDay5: 'sensor.pv_anlage_energy_day_5',
  forecastCurrent: 'sensor.pv_anlage_power_now',
  forecastPeakToday: 'sensor.pv_anlage_peak_power_day_1',
  forecastRemaining: 'sensor.pv_anlage_energy_today_remaining',
  forecastThisHour: 'sensor.pv_anlage_energy_this_hour',
  forecastNextHour: 'sensor.pv_anlage_energy_next_hour',
  pvToHouseDaily: 'sensor.solar_panel_to_house_daily',
  batteryMaxEnergy: 'sensor.solaredge_b1_maximum_energy',
  // nur im Dialog: Verbraucher im Energiefluss; Speicher-Entladung (leer = aus Bilanz berechnet)
  heatPumpW: 'sensor.daikin_heizung_leistung',
  batteryOutW: null,
  // Gesamtzähler (Liste): Monat/Jahr aus der HA-Statistik, wenn pvMonthly/pvYearly fehlen
  pvTotals: null,
};

/** Belegung: Standard (oben) mit settings.pvEntities überschrieben; null schaltet einen Wert ab. */
export function resolvePvIds(settings) {
  const eigene = settings?.pvEntities && typeof settings.pvEntities === 'object' ? settings.pvEntities : {};
  return { ...PV_ENTITY_IDS, ...eigene };
}

const FAKTOR = { W: 1, kW: 1000, MW: 1e6, Wh: 0.001, kWh: 1, MWh: 1000 };

const STATISTIK_INTERVALL_MS = 15 * 60 * 1000;

/** Änderung einer Statistik seit Beginn des Kalenderzeitraums (month | year), in kWh. */
export async function fetchPeriodChange(conn, statisticId, period, unit) {
  const res = await conn.sendMessagePromise({
    type: 'recorder/statistic_during_period',
    statistic_id: statisticId,
    calendar: { period },
    types: ['change'],
  });
  const wert = Number(res?.change);
  if (!Number.isFinite(wert)) return null;
  const faktor = FAKTOR[unit];
  return faktor ? wert * faktor : wert;
}

/**
 * Ertrag seit Monats- und Jahresbeginn als Summe der Gesamtzähler (kWh),
 * alle 15 Minuten neu aus der Langzeitstatistik.
 */
export function usePvPeriodTotals(conn, totalIds, entities, active = true) {
  const [werte, setWerte] = useState({ month: null, year: null });
  const ids = Array.isArray(totalIds) ? totalIds.filter(Boolean) : [];
  const key = ids.join('|');
  const units = ids.map((id) => entities?.[id]?.attributes?.unit_of_measurement || '').join('|');

  useEffect(() => {
    if (!active || !conn || typeof conn.sendMessagePromise !== 'function' || !key) return undefined;
    let aus = false;
    const liste = key.split('|');
    const einheiten = units.split('|');
    const summe = async (period) => {
      const teile = await Promise.all(liste.map((id, i) => fetchPeriodChange(conn, id, period, einheiten[i]).catch(() => null)));
      return teile.some((t) => t == null) ? null : teile.reduce((a, b) => a + b, 0);
    };
    const laden = async () => {
      const [month, year] = await Promise.all([summe('month'), summe('year')]);
      if (!aus) setWerte({ month, year });
    };
    laden();
    const timer = setInterval(laden, STATISTIK_INTERVALL_MS);
    return () => { aus = true; clearInterval(timer); };
  }, [conn, key, units, active]);

  return werte;
}

/**
 * Prognosewerte aus einer Leistungskurve (Attribut „forecast“: [{datetime, watts}],
 * z. B. Helios): Energie je Kalendertag (kWh, Index 0 = heute), Spitzenleistung heute (W),
 * Energie in dieser und der nächsten vollen Stunde und Rest des Tages ab jetzt (kWh).
 * Jeder Punkt gilt bis zum nächsten.
 */
export function forecastFromCurve(forecast, now = new Date()) {
  const leer = { days: [], peakToday: null, thisHour: null, nextHour: null, remainingToday: null };
  if (!Array.isArray(forecast) || forecast.length < 2) return leer;
  const punkte = forecast
    .map((p) => ({ t: new Date(p.datetime).getTime(), w: Number(p.watts) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.w))
    .sort((a, b) => a.t - b.t);
  if (punkte.length < 2) return leer;

  const tagesbeginn = new Date(now);
  tagesbeginn.setHours(0, 0, 0, 0);
  const stunde = new Date(now);
  stunde.setMinutes(0, 0, 0);
  const h0 = stunde.getTime();
  const h1 = h0 + 3600e3;
  const h2 = h1 + 3600e3;
  const tagIndex = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - tagesbeginn) / 86400e3);
  };

  const days = [];
  let peakToday = null;
  let thisHour = 0;
  let nextHour = 0;
  let stundenAbgedeckt = false;
  let remainingToday = 0;
  const jetzt = now.getTime();
  const schritt = punkte[1].t - punkte[0].t;
  punkte.forEach((p, i) => {
    const ende = i + 1 < punkte.length ? punkte[i + 1].t : p.t + schritt;
    const kwh = (p.w * (ende - p.t)) / 3600e3 / 1000;
    const tag = tagIndex(p.t);
    if (tag >= 0) days[tag] = (days[tag] || 0) + kwh;
    if (tag === 0) peakToday = peakToday == null ? p.w : Math.max(peakToday, p.w);
    if (p.t >= h0 && p.t < h1) { thisHour += kwh; stundenAbgedeckt = true; }
    if (p.t >= h1 && p.t < h2) nextHour += kwh;
    // Rest des Tages: laufendes Intervall anteilig, spätere ganz
    if (tag === 0 && ende > jetzt) {
      const ab = Math.max(p.t, jetzt);
      remainingToday += (p.w * (ende - ab)) / 3600e3 / 1000;
    }
  });
  return {
    days: Array.from({ length: days.length }, (_, i) => (days[i] == null ? null : days[i])),
    peakToday,
    thisHour: stundenAbgedeckt ? thisHour : null,
    nextHour: stundenAbgedeckt ? nextHour : null,
    remainingToday: days[0] == null ? null : remainingToday,
  };
}

/** Zahlenwert in W bzw. kWh – Wh/MWh und kW werden anhand der Einheit umgerechnet. */
export function readPv(entities, id) {
  if (!id) return null;
  const entity = entities?.[id];
  const s = parseFloat(entity?.state);
  if (!Number.isFinite(s)) return null;
  const faktor = FAKTOR[entity?.attributes?.unit_of_measurement];
  return faktor ? s * faktor : s;
}

function getBattSocColor(soc) {
  if (soc == null) return 'var(--text-muted)';
  if (soc >= 60) return '#4ade80';
  if (soc >= 30) return '#fb923c';
  return '#f87171';
}

const GenericPvCard = memo(function GenericPvCard({
  cardId,
  dragProps,
  controls,
  cardStyle,
  editMode,
  entities,
  customNames,
  customIcons,
  onOpen,
  isMobile,
  isTwoColMobile = false,
  settings = {},
  t,
}) {
  const translate = t || ((key) => key);
  const name = customNames?.[cardId] || 'Solar';
  const Icon = customIcons?.[cardId] ? getIconComponent(customIcons[cardId]) || Sun : Sun;
  const isUltraCompact = isTwoColMobile && settings.size !== 'small';
  // Eigenes Ziel für das Symbol (z. B. Energie-Panel) – der Klick öffnet nicht zusätzlich das Popup
  const iconUrl = !editMode ? safeHaUrl(settings.iconUrl) : null;
  const iconLink = iconUrl
    ? {
        role: 'button',
        tabIndex: 0,
        title: `${name} öffnen`,
        'aria-label': `${name} öffnen`,
        onClick: (e) => { e.stopPropagation(); openHaPath(iconUrl); },
        onKeyDown: (e) => { e.stopPropagation(); if (e.key === 'Enter') openHaPath(iconUrl); },
      }
    : {};
  const isDenseMobile = isMobile && settings.size !== 'small';

  const ids = resolvePvIds(settings);
  const v = (id) => readPv(entities, id);

  const pvW = v(ids.pvW);
  const pvDaily = v(ids.pvDaily);
  const batterySoc = v(ids.batterySoc);
  const gridImportW = v(ids.gridImportW);
  const gridExportW = v(ids.gridExportW);

  const isProducing = pvW != null && pvW > 10;
  const netGrid = (gridExportW ?? 0) - (gridImportW ?? 0); // positive = exporting

  const iconColor = isProducing ? '#fb923c' : 'var(--text-muted)';
  const iconBg = isProducing ? 'rgba(251,146,60,0.12)' : 'rgba(127,127,127,0.1)';
  const statusLabel = isProducing ? `${pvW != null ? Math.round(pvW) : '—'} W` : 'Standby';
  const statusDotColor = isProducing ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--text-muted)]';
  const socColor = getBattSocColor(batterySoc);

  if (settings.size === 'small') {
    return (
      <div
        key={cardId}
        {...dragProps}
        data-haptic={editMode ? undefined : 'card'}
        onClick={(e) => { e.stopPropagation(); if (!editMode && onOpen) onOpen(); }}
        className={`glass-texture touch-feedback group relative flex h-full items-center justify-between gap-4 overflow-hidden rounded-3xl border p-4 pl-5 font-sans transition-colors duration-500 ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
        style={cardStyle}
      >
        {controls}
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-110"
            style={{ backgroundColor: iconBg, color: iconColor }}
            {...iconLink}
          >
            <Icon className="h-6 w-6 stroke-[1.5px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="truncate text-xs leading-none font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-70">
                {name}
              </p>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ${statusDotColor}`} />
            </div>
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-xl font-bold text-[var(--text-primary)]">
                {pvW != null ? Math.round(pvW) : '—'}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)]">W</span>
            </div>
          </div>
        </div>
        {batterySoc != null && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-bold" style={{ color: socColor }}>{batterySoc.toFixed(0)}%</span>
            <span className="text-[9px] text-[var(--text-muted)]">Batt</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      key={cardId}
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      onClick={(e) => { e.stopPropagation(); if (!editMode && onOpen) onOpen(); }}
      className={`glass-texture touch-feedback group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border font-sans transition-colors duration-500 ${isUltraCompact ? 'p-3' : isDenseMobile ? 'p-5' : 'p-7'} ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
      style={cardStyle}
    >
      {controls}
      <div className="relative z-10">
        {/* Top row: icon + status badge */}
        <div className="flex items-start justify-between">
          <div
            className={`transition-transform duration-500 group-hover:scale-110 ${isUltraCompact ? 'rounded-lg p-2' : isDenseMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'}`}
            style={{ backgroundColor: iconBg, color: iconColor }}
            {...iconLink}
          >
            <Icon className={isUltraCompact ? 'h-3 w-3' : isDenseMobile ? 'h-4 w-4' : 'h-5 w-5'} style={{ strokeWidth: 1.5 }} />
          </div>
          <div
            className={`flex items-center gap-1 rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-3 py-1'}`}
            style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
          >
            <span className={`rounded-full ${isUltraCompact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${statusDotColor}`} />
            <span className={`font-bold uppercase text-[var(--text-secondary)] ${isUltraCompact ? 'text-[9px] tracking-wide' : 'text-xs tracking-widest'}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Card name */}
        <div className={isUltraCompact ? 'mt-1.5' : isDenseMobile ? 'mt-3' : 'mt-2'}>
          <p
            className={`${isUltraCompact ? 'mb-0.5 text-[9px]' : isDenseMobile ? 'mb-1 text-[10px]' : 'mb-0.5 text-xs'} leading-none font-bold text-[var(--text-secondary)] uppercase opacity-60`}
            style={{ letterSpacing: '0.05em' }}
          >
            {name}
          </p>
        </div>

        {/* PV W large */}
        <div className={`flex items-end justify-between ${isUltraCompact ? 'mt-1' : isDenseMobile ? 'mt-2' : 'mt-3'}`}>
          <div className="flex items-baseline gap-1 leading-none">
            <span className={`leading-none font-thin text-[var(--text-primary)] ${isUltraCompact ? 'text-2xl' : isDenseMobile ? 'text-3xl' : 'text-4xl'}`}>
              {pvW != null ? Math.round(pvW) : '—'}
            </span>
            <span className={`ml-0.5 font-medium text-[var(--text-muted)] ${isUltraCompact ? 'text-xs' : 'text-sm'}`}>W</span>
          </div>
          {pvDaily != null && (
            <div className="flex items-baseline gap-0.5 text-right leading-none">
              <span className={`font-light text-[var(--text-secondary)] ${isUltraCompact ? 'text-base' : 'text-xl'}`}>
                {pvDaily.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)]">kWh</span>
            </div>
          )}
        </div>

        {/* Bottom: battery SOC + grid */}
        <div className={`flex items-center gap-3 border-t border-[var(--glass-border)] ${isUltraCompact ? 'mt-2 pt-2' : 'mt-4 pt-3'}`}>
          {batterySoc != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Batt</span>
              <span className={`font-light ${isUltraCompact ? 'text-sm' : 'text-lg'}`} style={{ color: socColor }}>{batterySoc.toFixed(0)}%</span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">Netz</span>
            <span className={`font-light ${isUltraCompact ? 'text-sm' : 'text-lg'}`} style={{ color: netGrid > 0 ? '#4ade80' : netGrid < -50 ? '#f87171' : 'var(--text-primary)' }}>
              {netGrid > 0 ? '+' : ''}{Math.round(netGrid)} W
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default GenericPvCard;
