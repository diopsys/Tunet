import { memo } from 'react';
import { Flame } from '../../icons';
import { getIconComponent } from '../../icons';

export const WAERMEPUMPE_ENTITY_IDS = {
  kompressor: 'binary_sensor.daikin_heizung_status_kompressor',
  aussentemp: 'sensor.daikin_heizung_aussentemperatur',
  vorlauf: 'sensor.daikin_heizung_vorlauftemeratur_tv',
  ruecklauf: 'sensor.daikin_heizung_r_cklauftemperatur',
  warmwasser: 'sensor.daikin_heizung_warmwassertemperatur',
  stromTaglich: 'sensor.warmepumpe_elektrische_energie_taglich',
  waermeTaglich: 'sensor.warmepumpe_thermische_energie_taglich',
  stromMonatlich: 'sensor.warmepumpe_elektrische_energie_monatlich',
  waermeMonatlich: 'sensor.warmepumpe_thermische_energie_monatlich',
  heizstab: 'input_number.warmepumpe_heizstab',
  heizstabTaglich: 'sensor.warmepumpe_heizstab_verbrauch_taglich',
  heizstabAktiv: 'binary_sensor.wp_heizstab_aktiv',
  heizstabEnergieTaglich: 'sensor.wp_heizstab_energie_taglich',
  heizstabEnergieGesamt: 'sensor.wp_heizstab_energie_gesamt',
  wwSoll: 'select.daikin_heizung_t_ww_soll1',
  betriebsmodus: 'select.daikin_heizung_betriebsmodus',
  heizstabSelect: 'select.daikin_heizung_heizst_be_f_r_pumpen_nach_oktober_2018',
  betriebsart: 'sensor.daikin_3_r_ech2o_seriell_can_betriebsart_can',
  raumsoll: 'select.daikin_heizung_raumsoll_1',
  saison: 'input_select.warmepumpe_saison',
  automationWp: 'automation.pv_wp_steuerung_v2_3_3_phasen_logik_daikin',
  tagesmodus: 'input_select.wp_tagesmodus',
  entscheidungslog: 'input_text.wp_entscheidungslog',
  kompressorStart: 'input_datetime.wp_kompressor_startzeit',
  letzterWechsel: 'input_datetime.wp_letzter_wechsel',
  minusPreisBoolean: 'input_boolean.wp_minus_preis_modus_aktiv',
  octopusPreis: 'sensor.octopus_a_c856c4a4_electricity_price',
  leistungWw: 'number.daikin_heizung_leistung_ww',
  bohWartezeit: 'number.daikin_heizung_wartezeit_boh',
  kuehlung: 'input_boolean.wp_kuhlung_aktiv',
  socSensor: 'sensor.solaredge_b1_state_of_energy',
  pvProduktion: 'sensor.solar_panel_production_w',
  hausverbrauch: 'sensor.solar_house_consumption_w',
  raumTemp: 'sensor.durchschnittstemperatur_haus',
  pvRestprognose: 'sensor.pv_anlage_energy_today_remaining',
  hausMaxBonus: 'input_number.wp_bonus_max_hausverbrauch',
};

export const MODUS_META = {
  Standby:   { color: '#94a3b8', label: 'Standby' },
  WW_Heizen: { color: '#60a5fa', label: 'WW Heizen' },
  WW_Pause:  { color: '#fbbf24', label: 'WW Pause' },
  WW_Boost:  { color: '#c084fc', label: 'WW Boost' },
  WW_Fertig: { color: '#4ade80', label: 'WW Fertig' },
  Kühlen:    { color: '#38bdf8', label: 'Kühlen' },
};

const GenericWaermepumpeCard = memo(function GenericWaermepumpeCard({
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
  const name = customNames?.[cardId] || translate('waermepumpe.title');
  const Icon = customIcons?.[cardId] ? getIconComponent(customIcons[cardId]) || Flame : Flame;
  const isUltraCompact = isTwoColMobile && settings.size !== 'small';
  const isDenseMobile = isMobile && settings.size !== 'small';

  const kompressorEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.kompressor];
  const warmwasserEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.warmwasser];
  const aussentempEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.aussentemp];
  const stromEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.stromTaglich];
  const waermeEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.waermeTaglich];
  const betriebsartEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.betriebsart];
  const heizstabAktivEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.heizstabAktiv];
  const heizstabAktiv = heizstabAktivEntity?.state === 'on';
  const heizstabEnergieEntity = entities?.[WAERMEPUMPE_ENTITY_IDS.heizstabEnergieTaglich];
  const heizstabEnergieKwh = heizstabEnergieEntity ? parseFloat(heizstabEnergieEntity.state) : null;
  const kompressorAktiv = kompressorEntity?.state === 'on';
  const betriebsart = betriebsartEntity?.state || null;
  const wwTemp = warmwasserEntity ? parseFloat(warmwasserEntity.state) : null;
  const aussenTemp = aussentempEntity ? parseFloat(aussentempEntity.state) : null;
  const stromKwh = stromEntity ? parseFloat(stromEntity.state) : null;
  const waermeKwh = waermeEntity ? parseFloat(waermeEntity.state) : null;
  const cop =
    stromKwh != null && waermeKwh != null && stromKwh > 0
      ? (waermeKwh / stromKwh).toFixed(1)
      : null;

  const kompressorColor = kompressorAktiv
    ? 'bg-[var(--status-success-fg)]'
    : heizstabAktiv
    ? 'bg-orange-500'
    : 'bg-[var(--text-muted)]';

  const isWW = betriebsart === 'Warmwasserbereitung';
  const iconColor = !kompressorAktiv && !heizstabAktiv
    ? 'var(--text-muted)'
    : heizstabAktiv && !kompressorAktiv
    ? '#f97316'
    : isWW
    ? '#38bdf8'
    : '#fb923c';
  const iconBg = !kompressorAktiv && !heizstabAktiv
    ? 'rgba(127,127,127,0.1)'
    : heizstabAktiv && !kompressorAktiv
    ? 'rgba(249,115,22,0.15)'
    : isWW
    ? 'rgba(56,189,248,0.15)'
    : 'rgba(234,88,12,0.1)';
  const BETRIEBSART_SHORT = {
    'Warmwasserbereitung': 'DHW',
    'Heizen': 'Heizen',
    'Kühlen': 'Kühlen',
    'Bereitschaft': 'Standby',
    'Abtauen': 'Abtauen',
  };
  const betriebsartShort = betriebsart
    ? (BETRIEBSART_SHORT[betriebsart] ?? betriebsart)
    : null;
  // When active: show betriebsart text if available, else "Aktiv"
  const statusLabel = kompressorAktiv
    ? (betriebsartShort || translate('waermepumpe.kompressor.on'))
    : heizstabAktiv
    ? 'Heizstab'
    : translate('waermepumpe.kompressor.off');

  const minusPreisAktiv = entities?.[WAERMEPUMPE_ENTITY_IDS.minusPreisBoolean]?.state === 'on';

  // State Machine
  const tagesmodus = entities?.[WAERMEPUMPE_ENTITY_IDS.tagesmodus]?.state || 'Standby';
  const modusMeta = MODUS_META[tagesmodus] || { color: '#94a3b8', label: tagesmodus };
  const wwTarget = (tagesmodus === 'WW_Heizen' || tagesmodus === 'WW_Boost') ? 63 : null;
  const wwPct = wwTemp != null && wwTarget != null
    ? Math.min(100, Math.max(0, (wwTemp - 40) / (wwTarget - 40) * 100))
    : null;

  const octopusPreisVal = parseFloat(entities?.[WAERMEPUMPE_ENTITY_IDS.octopusPreis]?.state);
  const octopusPreisAktuell = Number.isFinite(octopusPreisVal) ? octopusPreisVal : null;
  const heizstabSelectState = entities?.[WAERMEPUMPE_ENTITY_IDS.heizstabSelect]?.state;
  const heizstabLaeuft = heizstabSelectState != null && heizstabSelectState !== 'Aus';
  const isMinusPreisVisible = minusPreisAktiv || (octopusPreisAktuell !== null && octopusPreisAktuell < 0);
  // BOH phase: minus-preis active, heizstab off, kompressor in WW → Daikin BOH has taken over
  const isBohPhase = isMinusPreisVisible && !heizstabLaeuft && kompressorAktiv && betriebsart === 'Warmwasserbereitung';
  // Target reached: minus-preis active, heizstab off, kompressor not in WW (or WW ≥ 64°C)
  const isMinusPreisPause = isMinusPreisVisible && !heizstabLaeuft && !isBohPhase;

  // Find next upcoming negative price slot within 12h
  const octopusRates = entities?.[WAERMEPUMPE_ENTITY_IDS.octopusPreis]?.attributes?.rates;
  const minusPreisKommtInH = (() => {
    if (!Array.isArray(octopusRates) || octopusPreisAktuell < 0) return null;
    const nowTs = Date.now();
    const lookaheadMs = 12 * 3600 * 1000;
    let earliest = null;
    for (const r of octopusRates) {
      if (typeof r.value_inc_vat === 'number' && r.value_inc_vat < 0) {
        const startTs = new Date(r.start).getTime();
        if (startTs > nowTs && startTs < nowTs + lookaheadMs) {
          if (earliest === null || startTs < earliest) earliest = startTs;
        }
      }
    }
    if (earliest === null) return null;
    return Math.ceil((earliest - nowTs) / 3600000 * 10) / 10;
  })();

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
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            <Icon className="h-6 w-6 stroke-[1.5px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="truncate text-xs leading-none font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-70">
                {name}
              </p>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ${kompressorColor}`}
                title={statusLabel}
              />
            </div>
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-xl font-bold text-[var(--text-primary)]">
                {wwTemp != null ? wwTemp.toFixed(1) : '—'}
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
      className={`glass-texture touch-feedback group relative flex h-full flex-col overflow-hidden rounded-3xl border font-sans transition-colors duration-500 ${isUltraCompact ? 'p-3' : isDenseMobile ? 'p-5' : 'p-6'} ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`}
      style={cardStyle}
    >
      {controls}

      {/* Main content — icon, name, temp */}
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div
            className={`transition-transform duration-500 group-hover:scale-110 ${isUltraCompact ? 'rounded-lg p-2' : isDenseMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'}`}
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            <Icon
              className={isUltraCompact ? 'h-3 w-3' : isDenseMobile ? 'h-4 w-4' : 'h-5 w-5'}
              style={{ strokeWidth: 1.5 }}
            />
          </div>
          <div className={`flex gap-1.5 ${isDenseMobile || isUltraCompact ? 'flex-col items-end gap-1' : 'flex-row items-center'}`}>
            {isMinusPreisVisible && (
              <div
                className={`flex items-center rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'}`}
                style={{
                  backgroundColor: heizstabLaeuft
                    ? 'rgba(74,222,128,0.12)'
                    : isBohPhase
                    ? 'rgba(56,189,248,0.12)'
                    : 'rgba(251,191,36,0.10)',
                  borderColor: heizstabLaeuft
                    ? 'rgba(74,222,128,0.5)'
                    : isBohPhase
                    ? 'rgba(56,189,248,0.5)'
                    : 'rgba(251,191,36,0.5)',
                }}
              >
                <span
                  className={`whitespace-nowrap font-bold ${isUltraCompact ? 'text-[8px]' : 'text-[10px]'}`}
                  style={{
                    color: heizstabLaeuft ? '#4ade80' : isBohPhase ? '#38bdf8' : '#fbbf24',
                  }}
                >
                  {heizstabLaeuft
                    ? `⚡ ${heizstabSelectState}`
                    : isBohPhase
                    ? '⚡ BOH'
                    : isMinusPreisPause
                    ? '⚡ voll'
                    : `⚡ ${octopusPreisAktuell != null ? octopusPreisAktuell.toFixed(2) : '−'}`}
                </span>
              </div>
            )}
            {minusPreisKommtInH !== null && (
              <div
                className={`flex items-center rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'}`}
                style={{ backgroundColor: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.5)' }}
              >
                <span
                  className={`whitespace-nowrap font-bold ${isUltraCompact ? 'text-[8px]' : 'text-[10px]'}`}
                  style={{ color: '#fbbf24' }}
                >
                  ⚡ ~{minusPreisKommtInH}h
                </span>
              </div>
            )}
            <div
              className={`flex items-center gap-1 rounded-full border ${isUltraCompact ? 'px-1.5 py-0.5' : 'px-3 py-1'}`}
              style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
            >
              <span
                className={`rounded-full ${isUltraCompact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${kompressorColor}`}
              />
              <span className={`font-bold uppercase text-[var(--text-secondary)] ${isUltraCompact ? 'text-[9px] tracking-wide' : 'text-xs tracking-widest'}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <div className={isUltraCompact ? 'mt-1.5' : isDenseMobile ? 'mt-3' : 'mt-2'}>
          <p
            className={`${isUltraCompact ? 'mb-0.5 text-[9px]' : isDenseMobile ? 'mb-1 text-[10px]' : 'mb-0.5 text-xs'} leading-none font-bold text-[var(--text-secondary)] uppercase opacity-60`}
            style={{ letterSpacing: '0.05em' }}
          >
            {name}
          </p>
        </div>

        <div className={`flex items-end justify-between ${isUltraCompact ? 'mt-1' : isDenseMobile ? 'mt-2' : 'mt-3'}`}>
          <div className="flex items-baseline gap-1 leading-none">
            <span
              className={`leading-none font-thin text-[var(--text-primary)] ${isUltraCompact ? 'text-2xl' : isDenseMobile ? 'text-3xl' : 'text-3xl'}`}
            >
              {wwTemp != null ? wwTemp.toFixed(1) : '—'}
            </span>
            <span className={`ml-0.5 font-medium text-[var(--text-muted)] ${isUltraCompact ? 'text-xs' : 'text-sm'}`}>°C WW</span>
          </div>
          {aussenTemp != null && (
            <div className="flex items-baseline gap-0.5 text-right leading-none">
              <span className={`font-light text-[var(--text-secondary)] ${isUltraCompact ? 'text-base' : 'text-xl'}`}>
                {aussenTemp.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)]">°C</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom slot: State Machine when phase active, Heizstab when standby+active, COP/Strom otherwise */}
      {!isUltraCompact && tagesmodus !== 'Standby' ? (
        <div className="relative z-10 mt-auto pt-2">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="text-[9px] font-bold tracking-widest uppercase"
              style={{ color: modusMeta.color }}
            >
              {modusMeta.label}
            </span>
          </div>
          {wwPct != null && (
            <>
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--glass-bg)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${wwPct}%`, backgroundColor: modusMeta.color }}
                />
              </div>
              <div
                className="mt-1 flex justify-between"
                style={{ fontSize: '9px', color: 'var(--text-muted)' }}
              >
                <span>{wwTemp?.toFixed(1)}°C</span>
                <span style={{ color: modusMeta.color }}>→ {wwTarget}°C</span>
              </div>
            </>
          )}
        </div>
      ) : !isUltraCompact && heizstabAktiv ? (
        <div className="relative z-10 mt-auto pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: '#f97316' }}>
              Heizstab
            </span>
            {heizstabEnergieKwh != null && Number.isFinite(heizstabEnergieKwh) && (
              <span className="text-[9px] text-[var(--text-muted)]">{heizstabEnergieKwh.toFixed(2)} kWh</span>
            )}
          </div>
          {wwTemp != null && (
            <>
              <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--glass-bg)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, (wwTemp - 40) / (63 - 40) * 100))}%`, backgroundColor: '#f97316' }}
                />
              </div>
              <div className="mt-1 flex justify-between" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                <span>{wwTemp.toFixed(1)}°C</span>
                <span style={{ color: '#f97316' }}>→ 63°C</span>
              </div>
            </>
          )}
        </div>
      ) : (cop != null || stromKwh != null) ? (
        <div className={`relative z-10 mt-auto flex items-center gap-3 border-t border-[var(--glass-border)] ${isUltraCompact ? 'pt-1.5' : 'pt-2'}`}>
          {cop != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">COP</span>
              <span className={`font-light text-[var(--accent-color)] ${isUltraCompact ? 'text-sm' : 'text-lg'}`}>{cop}</span>
            </div>
          )}
          {stromKwh != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">
                {translate('waermepumpe.strom')}
              </span>
              <span className={`font-light text-[var(--text-primary)] ${isUltraCompact ? 'text-sm' : 'text-lg'}`}>
                {stromKwh.toFixed(2)} kWh
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default GenericWaermepumpeCard;
