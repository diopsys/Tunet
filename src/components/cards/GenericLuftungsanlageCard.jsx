import { memo } from 'react';
import { Fan } from '../../icons';
import { getIconComponent } from '../../icons';
import { co2Color as co2Color_ } from '../../utils/lueftungLogic';

export const LUFTUNGSANLAGE_ENTITY_IDS = {
  climate: 'climate.blauberg_s21',
  automation: 'automation.blauberg_luftung_smartsteuerung_mit_push_luftqualitats_override',
  saison: 'input_select.luftung_saison',
  lastMode: 'input_text.luftung_letzter_modus',
  outsideTemp: 'sensor.wetterstation_temperatur',
  insideTemp: 'sensor.durchschnittstemperatur_haus',
  aussenluft: 'sensor.blauberg_s21_aussenlufttemperatur',
  zuluft: 'sensor.blauberg_s21_zulufttemperatur',
  abluft: 'sensor.blauberg_s21_ablufttemperatur',
  fortluft: 'sensor.blauberg_s21_fortlufttemperatur',
  bypass: 'sensor.blauberg_s21_bypassposition',
  zuluftRpm: 'sensor.blauberg_s21_zuluftventilator_drehzahl',
  abluftRpm: 'sensor.blauberg_s21_abluftventilator_drehzahl',
  zuluftLeistung: 'sensor.blauberg_s21_zuluftventilator_leistung',
  abluftLeistung: 'sensor.blauberg_s21_abluftventilator_leistung',
  // luftstufe wird aus climate.fan_mode abgeleitet (kein eigener Sensor mehr)
  filter: 'binary_sensor.blauberg_s21_filterwartung_erforderlich',
  kaminmodus: 'binary_sensor.blauberg_s21_kaminmodus_aktiv',
  alarm: 'sensor.blauberg_s21_alarm',
  lockTimestamp: 'input_datetime.luftung_lock_timestamp',
  co2Schwelle: 'input_number.luftung_co2_schwelle',
  vocSchwelle: 'input_number.luftung_voc_schwelle',
  feuchteSchwelle: 'input_number.luftung_feuchte_schwelle',
  pm25Schwelle: 'input_number.luftung_pm2_5_schwelle',
  co2LowEin: 'input_number.luftung_co2_low_ein',
  co2Aus: 'input_number.luftung_co2_aus',
  dauerbetriebAb: 'input_number.luftung_dauerbetrieb_ab_aussentemperatur',
  frostAus: 'input_number.luftung_frostschutz_aus_temperatur',
  mindestStufendauer: 'input_number.luftung_mindest_stufendauer',
  nachtGrundlueftung: 'input_boolean.luftung_nacht_grundluftung',
  luftfeuchtigkeit: 'sensor.blauberg_s21_luftfeuchtigkeit',
  feuchtigkeitsDiff: 'sensor.innen_aussen_luftfeuchtigkeit_differenz',
  co2Eg: 'sensor.alpstuga_air_quality_monitor_kohlendioxid',
  // Zweiter CO₂-Sensor (OG) folgt; die Automation nimmt das Maximum. Bis dahin leer.
  co2Og: null,
  coMelder: 'sensor.co_melder_co_lesung',
  feuchteEg: 'sensor.alpstuga_air_quality_monitor_luftfeuchtigkeit',
  pm25Eg: 'sensor.alpstuga_air_quality_monitor_pm25',
  luftqualitaetEg: 'sensor.alpstuga_air_quality_monitor_luftqualitat',
  vocOg: 'sensor.luftqualitatssensor_voc_index',
  feuchteOg: 'sensor.luftqualitatssensor_humidity',
  pm25Og: 'sensor.luftqualitatssensor_pm25',
  tempOg: 'sensor.luftqualitatssensor_temperature',
};

const num = (entity) => {
  const v = parseFloat(entity?.state);
  return Number.isFinite(v) ? v : null;
};

/** Höchster CO₂-Wert aus EG und (falls vorhanden) OG – wie in der Automation. */
export function co2Max(entities) {
  const values = [LUFTUNGSANLAGE_ENTITY_IDS.co2Eg, LUFTUNGSANLAGE_ENTITY_IDS.co2Og]
    .filter(Boolean)
    .map((id) => num(entities?.[id]))
    .filter((v) => v != null);
  return values.length ? Math.max(...values) : null;
}

/** CO₂-Schwellen der Automation aus den Helfern. */
export function co2Thresholds(entities) {
  return {
    co2LowEin: num(entities?.[LUFTUNGSANLAGE_ENTITY_IDS.co2LowEin]) ?? undefined,
    co2Aus: num(entities?.[LUFTUNGSANLAGE_ENTITY_IDS.co2Aus]) ?? undefined,
    co2Schwelle: num(entities?.[LUFTUNGSANLAGE_ENTITY_IDS.co2Schwelle]) ?? undefined,
  };
}

const GenericLuftungsanlageCard = memo(function GenericLuftungsanlageCard({
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
  const name = customNames?.[cardId] || translate('luftungsanlage.title');
  const Icon = customIcons?.[cardId] ? getIconComponent(customIcons[cardId]) || Fan : Fan;
  const isUltraCompact = isTwoColMobile && settings.size !== 'small';
  const isDenseMobile = isMobile && settings.size !== 'small';

  const climateEntity = entities?.[LUFTUNGSANLAGE_ENTITY_IDS.climate];
  const zuluftEntity = entities?.[LUFTUNGSANLAGE_ENTITY_IDS.zuluft];

  const hvacState = climateEntity?.state || null;
  const zuluftTemp = zuluftEntity ? parseFloat(zuluftEntity.state) : null;
  const co2Ppm = co2Max(entities);
  const FAN_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
  const luftstufe = FAN_LABELS[climateEntity?.attributes?.fan_mode] || null;

  // Im Kaminmodus ist climate „off“, die Ventilatoren laufen aber weiter
  const fansRunning =
    (num(entities?.[LUFTUNGSANLAGE_ENTITY_IDS.zuluftRpm]) ?? 0) > 0 || (num(entities?.[LUFTUNGSANLAGE_ENTITY_IDS.abluftRpm]) ?? 0) > 0;

  const STATE_LABELS = {
    off: translate('luftungsanlage.state.off') || 'Aus',
    auto: translate('luftungsanlage.state.auto') || 'Auto',
    fan_only: translate('luftungsanlage.state.fanOnly') || 'Lüften',
  };
  const statusLabel = hvacState === 'off' ? (fansRunning ? 'Lüftet' : STATE_LABELS.off) : luftstufe || (hvacState ? (STATE_LABELS[hvacState] ?? hvacState) : '—');

  const isActive = (hvacState !== 'off' && hvacState != null) || fansRunning;
  const iconColor = isActive ? '#4ade80' : 'var(--text-muted)';
  const iconBg = isActive ? 'rgba(74,222,128,0.1)' : 'rgba(127,127,127,0.1)';

  const statusDotColor =
    !isActive
      ? 'bg-[var(--text-muted)]'
      : 'bg-[var(--status-success-fg)]';

  const co2Color = co2Color_(co2Ppm, co2Thresholds(entities));
  const coEntity = entities?.[LUFTUNGSANLAGE_ENTITY_IDS.coMelder];
  const coPpm = coEntity ? parseFloat(coEntity.state) : null;
  const coColor = coPpm == null ? 'var(--text-primary)' : coPpm >= 50 ? '#f87171' : coPpm >= 10 ? '#fb923c' : '#4ade80';
  const kaminmodusAktiv = entities?.[LUFTUNGSANLAGE_ENTITY_IDS.kaminmodus]?.state === 'on';

  if (settings.size === 'small') {
    return (
      <div
        key={cardId}
        {...dragProps}
        data-haptic={editMode ? undefined : 'card'}
        onClick={(e) => {
          e.stopPropagation();
          if (!editMode && onOpen) onOpen();
        }}
        className={`glass-texture touch-feedback group relative flex h-full items-center justify-between gap-4 overflow-hidden rounded-3xl border p-4 pl-5 font-sans transition-colors duration-500 ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
        style={cardStyle}
      >
        {controls}
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-110"
            style={{
              backgroundColor: kaminmodusAktiv ? 'rgba(249,115,22,0.15)' : iconBg,
              color: kaminmodusAktiv ? '#f97316' : iconColor,
            }}
          >
            <Icon className={`h-6 w-6 stroke-[1.5px] ${kaminmodusAktiv ? 'animate-pulse' : ''}`} />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="truncate text-xs leading-none font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-70">
                {kaminmodusAktiv ? '🔥 Kaminmodus' : name}
              </p>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ${kaminmodusAktiv ? 'bg-orange-500' : statusDotColor}`}
                title={kaminmodusAktiv ? 'Kaminmodus aktiv' : statusLabel}
              />
            </div>
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-xl font-bold text-[var(--text-primary)]">
                {zuluftTemp != null ? zuluftTemp.toFixed(1) : '—'}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)]">°C</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={cardId}
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      onClick={(e) => {
        e.stopPropagation();
        if (!editMode && onOpen) onOpen();
      }}
      className={`glass-texture touch-feedback group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border font-sans transition-colors duration-500 ${isUltraCompact ? 'p-3' : isDenseMobile ? 'p-5' : 'p-7'} ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
      style={cardStyle}
    >
      {controls}
      <div className="relative z-10">
        {/* Top row: icon + status badge(s) */}
        <div className="flex items-start justify-between">
          <div
            className={`transition-transform duration-500 group-hover:scale-110 ${isUltraCompact ? 'rounded-lg p-2' : isDenseMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'}`}
            style={{
              backgroundColor: kaminmodusAktiv ? 'rgba(249,115,22,0.15)' : iconBg,
              color: kaminmodusAktiv ? '#f97316' : iconColor,
            }}
          >
            <Icon
              className={`${isUltraCompact ? 'h-3 w-3' : isDenseMobile ? 'h-4 w-4' : 'h-5 w-5'} ${kaminmodusAktiv ? 'animate-pulse' : ''}`}
              style={{ strokeWidth: 1.5 }}
            />
          </div>
          {kaminmodusAktiv ? (
            <div
              className={`flex items-center gap-1 rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-3 py-1'}`}
              style={{ backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.5)' }}
            >
              <span className={`font-bold uppercase ${isUltraCompact ? 'text-[9px] tracking-wide' : 'text-xs tracking-widest'}`} style={{ color: '#f97316' }}>
                🔥 Kaminmodus
              </span>
            </div>
          ) : (
            <div
              className={`flex items-center gap-1 rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-3 py-1'}`}
              style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
            >
              <span className={`rounded-full ${isUltraCompact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${statusDotColor}`} />
              <span className={`font-bold uppercase text-[var(--text-secondary)] ${isUltraCompact ? 'text-[9px] tracking-wide' : 'text-xs tracking-widest'}`}>
                {statusLabel}
              </span>
            </div>
          )}
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

        {/* Zuluft temp (large) */}
        <div className={`flex items-end justify-between ${isUltraCompact ? 'mt-1' : isDenseMobile ? 'mt-2' : 'mt-3'}`}>
          <div className="flex items-baseline gap-1 leading-none">
            <span
              className={`leading-none font-thin text-[var(--text-primary)] ${isUltraCompact ? 'text-2xl' : isDenseMobile ? 'text-3xl' : 'text-4xl'}`}
            >
              {zuluftTemp != null ? zuluftTemp.toFixed(1) : '—'}
            </span>
            <span className={`ml-0.5 font-medium text-[var(--text-muted)] ${isUltraCompact ? 'text-xs' : 'text-sm'}`}>
              °C {translate('luftungsanlage.zuluft') || 'Zuluft'}
            </span>
          </div>
        </div>

        {/* Bottom row: CO2 + CO */}
        <div className={`flex items-center gap-4 border-t border-[var(--glass-border)] ${isUltraCompact ? 'mt-2 pt-2' : 'mt-4 pt-3'}`}>
          {co2Ppm != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">
                {translate('luftungsanlage.co2') || 'CO₂'}
              </span>
              <span className={`font-light ${isUltraCompact ? 'text-sm' : 'text-lg'}`} style={{ color: co2Color }}>
                {co2Ppm.toFixed(0)} ppm
              </span>
            </div>
          )}
          {coPpm != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">CO</span>
              <span className={`font-light ${isUltraCompact ? 'text-sm' : 'text-lg'}`} style={{ color: coColor }}>
                {coPpm.toFixed(0)} ppm
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default GenericLuftungsanlageCard;
