import { useState, useEffect } from 'react';
import { Flame, X, Thermometer, Zap } from '../icons';
import { WAERMEPUMPE_ENTITY_IDS, MODUS_META } from '../components/cards/GenericWaermepumpeCard';
import { HpsuHydraulicView } from '../components/HpsuHydraulicView';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import { getHistoryRest, getHistory, getStatistics } from '../services/haClient';

const ACCENT = '#fb923c';

function SelectDropdown({ entityId, entity, onSelect }) {
  if (!entity) return null;
  const current = entity.state;
  const options = entity.attributes?.options || [];

  return (
    <select
      value={current}
      onChange={(e) => onSelect(entityId, e.target.value)}
      className="w-full rounded-xl border px-3 py-2 text-sm font-medium transition-all"
      style={{
        backgroundColor: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt} style={{ backgroundColor: 'var(--card-bg)' }}>
          {opt}
        </option>
      ))}
    </select>
  );
}

const MODUS_SUB = {
  Standby:   'Kein aktiver Betrieb',
  WW_Heizen: 'Kompressor heizt WW bis 55°C',
  WW_Pause:  'BOH-Pause · Kompressor gestoppt (10 min)',
  WW_Boost:  'Daikin intern heizt WW bis 63°C',
  WW_Fertig: 'WW abgeschlossen · Tagesziel erreicht',
  Kühlen:    'Kompressor kühlt Gebäude',
};

// Configured thresholds from automation instance
const WP_CFG = {
  pvStart: 2,       // phase_a_start_min_ueberschuss_kw
  pvBoost: 3,       // ueberschuss_heizstab_min_kw
  socNotaus: 20,    // soc_notabschaltung
  socOhne: 60,      // soc_start_ohne_ueberschuss
  kuehlTemp: 24,    // kuehl_temp_schwelle
  kuehlPv: 1.2,     // kuehl_pv_min / 1000
  wwStart: 54,      // ww_heiz_start_temp
  wwFertig: 63,     // phase_c_fertig_temp
  bohSchutz: 75,    // boh_schutz_min
  bohPause: 10,     // boh_pause_min
  mindestlaufzeit: 45, // mindestlaufzeit_min
  mlzHeiss: 10,        // mindestlaufzeit_heiss_neustart_min
  wwFensterStart: '11:00',
  wwFensterEnde:   '19:30',
};

function buildLogBullets(reason, curState) {
  let processed = (reason || '').trim();
  let hvSubNote = null;

  // Extract "HV-ohne-WP X (roh Y − Komp Z − Heizstab W)" before tokenizing.
  // roh = Hausverbrauch gesamt, Komp = WP Live-W, Heizstab = konfigurierter HS-Sollwert (kein Messwert)
  const hvRx = /HV-ohne-WP (\S+)\s+\(roh (\S+)\s+[−-]\s+Komp (\S+)\s+[−-]\s+Heizstab ([^)]+)\)/;
  const hvMatch = processed.match(hvRx);
  if (hvMatch) {
    hvSubNote = `Haus ${hvMatch[2]}  WP-Ist ${hvMatch[3]}  HS-Soll ${hvMatch[4].trim()}`;
    processed = processed.replace(hvMatch[0], `HV-ohne-WP ${hvMatch[1]}`);
  }

  const tokens = processed.split(/\s+/);
  const pairs = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) pairs.push([tokens[i], tokens[i + 1]]);
  if (tokens.length % 2 !== 0 && tokens.length > 0) pairs.push([tokens[tokens.length - 1], '']);

  return pairs
    .filter(([key]) => !['≥', '≤', '<', '>'].includes(key))
    .map(([key, val]) => {
    // Automation uses 'ÜS' for Überschuss and 'WW-Ist' for WW temperature
    const k = key === 'ÜS' ? 'PV' : key === 'WW-Ist' ? 'WW' : key;
    switch (k) {
      case 'WW':
        if (curState === 'WW_Heizen') return { label: 'WW-Ist', val, op: '<',  ziel: 'Ziel 55°C', aktion: '→ Kompressor startet' };
        if (curState === 'WW_Boost')  return { label: 'WW-Ist', val, op: '≥',  ziel: 'Ziel 55°C' };
        if (curState === 'WW_Fertig') return { label: 'WW-Ist', val, op: '≥',  ziel: `Ziel ${WP_CFG.wwFertig}°C` };
        if (curState === 'Standby')   return { label: 'WW-Ist', val, op: '≥',  ziel: `Start-Temp ${WP_CFG.wwStart}°C — kein Heizen nötig` };
        return { label: 'WW-Ist', val };
      case 'PV':
        if (curState === 'Kühlen')    return { label: 'PV-Überschuss', val, op: '≥', ziel: `Startschwelle ${WP_CFG.kuehlPv}kW` };
        if (curState === 'WW_Heizen') return { label: 'PV-Überschuss', val, op: '≥', ziel: `Startschwelle ${WP_CFG.pvStart}kW` };
        if (curState === 'WW_Boost')  return { label: 'PV-Überschuss', val, op: '≥', ziel: `Heizstab-Min ${WP_CFG.pvBoost}kW` };
        if (curState === 'Standby')   return { label: 'PV-Überschuss', val, op: '<',  ziel: `Ausschaltschwelle ${WP_CFG.pvStart}kW` };
        return { label: 'PV-Überschuss', val };
      case 'SOC':
        if (curState === 'Standby')   return { label: 'SOC', val, op: '<', ziel: `Minimum ${WP_CFG.socNotaus}%` };
        return { label: 'SOC', val, op: '>', ziel: `Minimum ${WP_CFG.socNotaus}%` };
      case 'Raum':
        if (curState === 'Standby' || curState === 'WW_Heizen' || curState === 'WW_Boost' || curState === 'WW_Fertig')
          return { label: 'Raumtemp', val };
        return { label: 'Raumtemp', val, op: '≥', ziel: `Kühlschwelle ${WP_CFG.kuehlTemp}°C` };
      case 'Akku-bis-voll':
        return { label: 'Akku bis voll', val };
      case 'Puffer': {
        const pufferNum = parseFloat(val);
        const pufferOk = pufferNum >= 3.0;
        return {
          label: 'WW-Puffer',
          val,
          op: pufferOk ? '≥' : '<',
          ziel: 'Min 3,0 kWh',
          aktion: pufferOk ? '→ Bonus möglich' : undefined,
        };
      }
      case 'Laufzeit':
        return { label: 'Kompressor-Laufzeit', val, op: '≥', ziel: `BOH-Schutz ${WP_CFG.bohSchutz}min` };
      case 'Fenster': {
        const inWindow = val === 'True' || val === 'true' || val === '1' || val === 'ja';
        return { label: `WW-Fenster (${WP_CFG.wwFensterStart}–${WP_CFG.wwFensterEnde})`, val: '', aktion: inWindow ? '→ freigegeben' : '→ gesperrt' };
      }
      case 'Forecast':
        return { label: 'Restprognose', val };
      case 'Heizstab':
        return { label: 'Heizstab', val: null, aktion: `→ ${val || 'intern'} zugeschaltet` };
      case 'HV-ohne-WP':
        // Hausverbrauch nach Abzug von WP-Last + HS-Sollwert (Schwelle für hausverbrauch_niedrig ≤ 800W)
        return { label: 'Haus bereinigt', val, subNote: hvSubNote };
      default:
        return { label: key, val };
    }
  });
}

export default function WaermepumpeModal({
  show,
  onClose,
  entities,
  customNames,
  cardId,
  callService,
  conn,
  haUrl,
  haToken,
  onOpenSensorModal,
  t,
}) {
  const translate = t || ((key) => key);
  const [mainTab, setMainTab] = useState('overview');
  const [energyTab, setEnergyTab] = useState('today');
  const [heizstabMonatKwh, setHeizstabMonatKwh] = useState(null);
  const [wwHistory, setWwHistory] = useState([]);
  const [logHistory, setLogHistory] = useState([]);
  const [wwHistoryLoading, setWwHistoryLoading] = useState(false);
  const modalTitleId = 'waermepumpe-modal-title';

  useEffect(() => {
    if (!show || mainTab !== 'automatik') return;
    if (!conn && !haUrl) return;

    const fetchHistory = async () => {
      setWwHistoryLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
      const toMs = (v) => (v != null && v < 1e12 ? v * 1000 : v);

      const fetchEntity = async (entityId) => {
        try {
          const data = await getHistoryRest(haUrl, haToken, {
            entityId,
            start,
            end,
            minimal_response: false,
            no_attributes: false,
            significant_changes_only: false,
          });
          return Array.isArray(data?.[0]) ? data[0] : (Array.isArray(data) ? data : []);
        } catch (_e) {
          try {
            const wsData = await getHistory(conn, { entityId, start, end });
            return Array.isArray(wsData?.[0]) ? wsData[0] : (Array.isArray(wsData) ? wsData : []);
          } catch (_e2) {
            return [];
          }
        }
      };

      try {
        const [rawModus, rawLog] = await Promise.all([
          fetchEntity(WAERMEPUMPE_ENTITY_IDS.tagesmodus),
          fetchEntity(WAERMEPUMPE_ENTITY_IDS.entscheidungslog),
        ]);

        const parsedModus = rawModus
          .map((d) => ({
            state: d.state ?? d.s,
            time: new Date(d.last_changed ?? d.last_updated ?? toMs(d.lc) ?? toMs(d.lu)),
          }))
          .filter((d) => d.state && d.state !== 'unknown' && d.state !== 'unavailable' && !isNaN(d.time.getTime()))
          .reverse();
        setWwHistory(parsedModus);

        // Parse entscheidungslog history: "HH:MM PrevState→CurState | Key1 Val1 Key2 Val2"
        const parsedLog = rawLog
          .map((d) => {
            const raw = d.state ?? d.s;
            if (!raw || raw === 'unknown' || raw === 'unavailable') return null;
            const time = new Date(d.last_changed ?? d.last_updated ?? toMs(d.lc) ?? toMs(d.lu));
            if (isNaN(time.getTime())) return null;
            const [header, reason] = raw.split(' | ');
            const curStateMatch = header?.match(/→(\S+)/);
            const curState = curStateMatch ? curStateMatch[1] : null;
            if (!curState) return null;
            return { time, curState, reason: reason || '' };
          })
          .filter(Boolean)
          .reverse();
        setLogHistory(parsedLog);
      } catch (_e) {
        setWwHistory([]);
        setLogHistory([]);
      }
      setWwHistoryLoading(false);
    };

    fetchHistory();
  }, [show, mainTab, conn, haUrl, haToken]);

  useEffect(() => {
    if (!show || !conn || energyTab !== 'month') return;
    let cancelled = false;
    const now = new Date();
    // Go back to start of previous month to get a reference sum for diff
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    getStatistics(conn, {
      start,
      end: now,
      statisticId: WAERMEPUMPE_ENTITY_IDS.heizstabEnergieGesamt,
      period: 'month',
    }).then((stats) => {
      if (cancelled || !stats || stats.length === 0) return;
      const last = stats[stats.length - 1];
      const prev = stats.length >= 2 ? stats[stats.length - 2] : null;
      const monthKwh = prev != null ? last.sum - prev.sum : last.sum;
      setHeizstabMonatKwh(Math.max(0, monthKwh));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [show, conn, energyTab]);

  if (!show) return null;

  const name = customNames?.[cardId] || translate('waermepumpe.title');

  const e = (id) => entities?.[id];
  const val = (id) => {
    const v = parseFloat(e(id)?.state);
    return Number.isFinite(v) ? v : null;
  };
  const str = (id) => e(id)?.state || null;

  const selectOption = (entityId, option) => {
    callService?.('select', 'select_option', { entity_id: entityId, option });
  };

  // Overview values
  const kompressorAktiv = e(WAERMEPUMPE_ENTITY_IDS.kompressor)?.state === 'on';
  const wwTemp = val(WAERMEPUMPE_ENTITY_IDS.warmwasser);
  const vorlauf = val(WAERMEPUMPE_ENTITY_IDS.vorlauf);
  const ruecklauf = val(WAERMEPUMPE_ENTITY_IDS.ruecklauf);
  const aussentemp = val(WAERMEPUMPE_ENTITY_IDS.aussentemp);
  const stromHeute = val(WAERMEPUMPE_ENTITY_IDS.stromTaglich);
  const waermeHeute = val(WAERMEPUMPE_ENTITY_IDS.waermeTaglich);
  const stromMonat = val(WAERMEPUMPE_ENTITY_IDS.stromMonatlich);
  const waermeMonat = val(WAERMEPUMPE_ENTITY_IDS.waermeMonatlich);
  const heizstab = val(WAERMEPUMPE_ENTITY_IDS.heizstab);
  const heizstabTaglich = val(WAERMEPUMPE_ENTITY_IDS.heizstabTaglich);

  const copHeute =
    stromHeute != null && waermeHeute != null && stromHeute > 0
      ? (waermeHeute / stromHeute).toFixed(2)
      : null;
  const copMonat =
    stromMonat != null && waermeMonat != null && stromMonat > 0
      ? (waermeMonat / stromMonat).toFixed(2)
      : null;
  const aktivStrom = energyTab === 'today' ? stromHeute : stromMonat;
  const aktivWaerme = energyTab === 'today' ? waermeHeute : waermeMonat;
  const aktivCop = energyTab === 'today' ? copHeute : copMonat;

  // Automatik tab values
  const saisonState = str(WAERMEPUMPE_ENTITY_IDS.saison);
  const automationState = str(WAERMEPUMPE_ENTITY_IDS.automationWp);
  const tagesmodus = str(WAERMEPUMPE_ENTITY_IDS.tagesmodus) || 'Standby';
  const entscheidungslog = str(WAERMEPUMPE_ENTITY_IDS.entscheidungslog) || '';
  const modusColor = MODUS_META[tagesmodus]?.color || '#94a3b8';

  // Live sensor values for sensor tiles
  const socVal = val(WAERMEPUMPE_ENTITY_IDS.socSensor);
  const pvWatt = val(WAERMEPUMPE_ENTITY_IDS.pvProduktion);
  const hausWatt = val(WAERMEPUMPE_ENTITY_IDS.hausverbrauch);
  const pvUeberschussKw = pvWatt != null && hausWatt != null ? (pvWatt - hausWatt) / 1000 : null;
  const raumTempVal = val(WAERMEPUMPE_ENTITY_IDS.raumTemp);
  const minusPreisAktiv = e(WAERMEPUMPE_ENTITY_IDS.minusPreisBoolean)?.state === 'on';
  const kuehlungAktiv = e(WAERMEPUMPE_ENTITY_IDS.kuehlung)?.state === 'on';
  const octopusPreisVal = parseFloat(e(WAERMEPUMPE_ENTITY_IDS.octopusPreis)?.state);
  const octopusPreisAktuell = Number.isFinite(octopusPreisVal) ? octopusPreisVal : null;
  const kompressorStartStr = str(WAERMEPUMPE_ENTITY_IDS.kompressorStart);
  const wwSollState = str(WAERMEPUMPE_ENTITY_IDS.wwSoll);
  const betriebsartState = str(WAERMEPUMPE_ENTITY_IDS.betriebsart);
  const heizstabSelectState = str(WAERMEPUMPE_ENTITY_IDS.heizstabSelect);
  const heizstabLaeuft = heizstabSelectState != null && heizstabSelectState !== 'Aus';
  const heizstabAktivBin = e(WAERMEPUMPE_ENTITY_IDS.heizstabAktiv)?.state === 'on';
  const heizstabEnergieHeuteVal = val(WAERMEPUMPE_ENTITY_IDS.heizstabEnergieTaglich);
  const leistungWwVal = val(WAERMEPUMPE_ENTITY_IDS.leistungWw);
  const bohWartezeitVal = val(WAERMEPUMPE_ENTITY_IDS.bohWartezeit) ?? 95;
  const pvRestprognose = val(WAERMEPUMPE_ENTITY_IDS.pvRestprognose);
  const hausMaxBonus = val(WAERMEPUMPE_ENTITY_IDS.hausMaxBonus) ?? 600;

  // Batterie-Priorität (4,0 kWh Kapazität, SOC live aus sensor)
  const AKKU_KWH = 4.0;
  const PUFFER_MIN_KWH = 3.0;
  const akkuBisVoll = socVal != null ? AKKU_KWH * (100 - socVal) / 100 : null;
  const wwBonusPuffer = pvRestprognose != null && akkuBisVoll != null ? pvRestprognose - akkuBisVoll : null;
  const wwBonusPufferOk = wwBonusPuffer != null && wwBonusPuffer >= PUFFER_MIN_KWH;
  const wwBonusHausOk = hausWatt != null && hausWatt <= hausMaxBonus;
  const wwBonusWwOk = wwTemp != null && wwTemp >= 48;
  const wwBonusMoeglich = wwBonusPufferOk && wwBonusHausOk && wwBonusWwOk;
  const autoOn = automationState === 'on';

  // Upcoming negative price within 12h
  const octopusRatesModal = e(WAERMEPUMPE_ENTITY_IDS.octopusPreis)?.attributes?.rates;
  const minusPreisKommtInH = (() => {
    if (!Array.isArray(octopusRatesModal) || octopusPreisAktuell < 0) return null;
    const nowTs = Date.now();
    const lookaheadMs = 12 * 3600 * 1000;
    let earliest = null;
    for (const r of octopusRatesModal) {
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

  // WW-Zeitfenster (Sperrzeit)
  const imFenster = (() => {
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    return min >= 11 * 60 && min < 19 * 60 + 30;
  })();
  const fensterStatusText = imFenster
    ? `Zeitfenster offen (${WP_CFG.wwFensterStart}–${WP_CFG.wwFensterEnde})`
    : new Date().getHours() < 11
      ? `Gesperrt bis ${WP_CFG.wwFensterStart}`
      : `Gesperrt bis morgen ${WP_CFG.wwFensterStart}`;

  // Seit-letztem-Wechsel Timer (für MLZ + BOH-Pause Countdown)
  const letzterWechselTs = e(WAERMEPUMPE_ENTITY_IDS.letzterWechsel)?.attributes?.timestamp;
  const seitMinVal = letzterWechselTs != null
    ? Math.max(0, (Date.now() / 1000 - letzterWechselTs) / 60)
    : 0;

  // BOH Kompressor-Laufzeit
  let kompressorLaufzeitMin = 0;
  const istWWZyklus = betriebsartState === 'Warmwasserbereitung';
  if (kompressorStartStr && istWWZyklus && kompressorAktiv) {
    const startTs = new Date(kompressorStartStr.replace(' ', 'T')).getTime();
    if (!isNaN(startTs)) {
      kompressorLaufzeitMin = Math.max(0, (Date.now() - startTs) / 60000);
    }
  }
  // Blueprint re-triggers heizstab off at boh_wartezeit - 3 min so Daikin BOH takes over at boh_wartezeit
  const bohSchwelle = bohWartezeitVal - 3;
  const bohPct = Math.min(100, (kompressorLaufzeitMin / bohSchwelle) * 100);
  const bohColor =
    bohPct >= 100 ? '#ef9a9a' : bohPct >= 75 ? '#ffb74d' : '#64b5f6';

  // Minus-Preis BOH phase derivation
  const bohAblaufPhase = (() => {
    if (!minusPreisAktiv) return null;
    if (!istWWZyklus || !kompressorAktiv) return 'waiting';
    if (kompressorLaufzeitMin < bohSchwelle) return 'heizstab';
    if (kompressorLaufzeitMin < bohWartezeitVal) return 'uebergabe';
    return 'boh';
  })();

  const saisonColor = saisonState?.startsWith('Win') ? '#64b5f6' : '#ffb74d';

  const toggleAutomation = () => {
    callService?.('automation', 'toggle', {
      entity_id: WAERMEPUMPE_ENTITY_IDS.automationWp,
    });
  };
  const setSaison = (option) => {
    callService?.('input_select', 'select_option', {
      entity_id: WAERMEPUMPE_ENTITY_IDS.saison,
      option,
    });
  };
  const toggleKuehlung = () => {
    callService?.('input_boolean', kuehlungAktiv ? 'turn_off' : 'turn_on', {
      entity_id: WAERMEPUMPE_ENTITY_IDS.kuehlung,
    });
  };

  const TempRow = ({ label, value, color = 'var(--text-primary)' }) => (
    <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3">
      <p
        className="text-[10px] font-bold tracking-[0.15em] uppercase"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <p className="text-xl font-light" style={{ color }}>
        {value != null ? `${value.toFixed(1)} °C` : '—'}
      </p>
    </div>
  );

  const mainTabs = [
    { key: 'overview', label: translate('waermepumpe.tab.overview') || 'Übersicht' },
    { key: 'automatik', label: 'Automatik' },
    { key: 'hydraulik', label: translate('waermepumpe.tab.hydraulik') || 'Hydraulik' },
  ];

  const isCompact =
    window.innerHeight < 900 ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isPhone = window.innerWidth < 640;

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName={
        isCompact
          ? 'fixed inset-0 z-50 flex items-stretch justify-center'
          : 'fixed inset-0 z-50 flex items-center justify-center p-6'
      }
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName={
        isCompact
          ? 'popup-anim relative flex flex-col w-full max-w-2xl h-full overflow-hidden rounded-none border font-sans backdrop-blur-xl'
          : 'popup-anim relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[3rem] border font-sans backdrop-blur-xl'
      }
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          {/* ── Fixed header ── */}
          <div
            className={`flex-shrink-0 border-b ${isCompact ? 'p-4 pb-3' : 'p-8 pb-5'}`}
            style={{ borderColor: 'var(--glass-border)' }}
          >
            <div className="absolute top-4 right-4 z-20">
              <button onClick={onClose} className="modal-close" aria-label={translate('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3 pr-10 font-sans">
              <div
                className="rounded-2xl p-3 transition-all duration-500"
                style={{ backgroundColor: 'rgba(234, 88, 12, 0.15)', color: ACCENT }}
              >
                <Flame className="h-6 w-6" />
              </div>
              <div>
                <h3
                  id={modalTitleId}
                  className="text-xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic"
                >
                  {name}
                </h3>
                <div
                  className="mt-1.5 inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-all duration-500"
                  style={{
                    backgroundColor: kompressorAktiv
                      ? 'var(--status-success-bg)'
                      : 'var(--glass-bg)',
                    borderColor: kompressorAktiv
                      ? 'var(--status-success-border)'
                      : 'var(--glass-border)',
                  }}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${kompressorAktiv ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--text-muted)]'}`}
                  />
                  <p
                    className="text-[10px] font-bold tracking-widest uppercase italic"
                    style={{
                      color: kompressorAktiv
                        ? 'var(--status-success-fg)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    {kompressorAktiv
                      ? translate('waermepumpe.kompressor.on')
                      : translate('waermepumpe.kompressor.off')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex rounded-2xl p-1" style={{ backgroundColor: 'var(--glass-bg)' }}>
              {mainTabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMainTab(key)}
                  className="flex-1 rounded-xl py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                  style={
                    mainTab === key
                      ? {
                          backgroundColor: 'rgba(234,88,12,0.15)',
                          borderColor: ACCENT,
                          color: ACCENT,
                          border: `1px solid ${ACCENT}`,
                        }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Scrollable content ── */}
          <div className={`flex-1 overflow-y-auto ${isCompact ? 'p-4' : 'p-8'}`}>

            {/* ── Tab: Übersicht ── */}
            {mainTab === 'overview' && (
              <>
                <div
                  className={`grid items-start gap-4 font-sans ${
                    isPhone ? 'grid-cols-1' : isCompact ? 'grid-cols-5' : 'grid-cols-1 lg:grid-cols-5'
                  }`}
                >
                  <div className={`space-y-2 ${isPhone ? '' : 'md:col-span-3'}`}>
                    <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                      {translate('waermepumpe.temperatures')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => onOpenSensorModal?.(WAERMEPUMPE_ENTITY_IDS.warmwasser)}
                        className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3 transition-all hover:opacity-80 active:scale-[0.98]"
                      >
                        <p
                          className="text-[10px] font-bold tracking-[0.15em] uppercase"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {translate('waermepumpe.warmwasser')}
                        </p>
                        <p className="text-xl font-light" style={{ color: ACCENT }}>
                          {wwTemp != null ? `${wwTemp.toFixed(1)} °C` : '—'}
                        </p>
                        <span className="text-[9px] text-[var(--text-muted)] opacity-50">
                          ↗ Verlauf
                        </span>
                      </button>
                      <TempRow label={translate('waermepumpe.aussentemp')} value={aussentemp} />
                      <TempRow
                        label={translate('waermepumpe.vorlauf')}
                        value={vorlauf}
                        color="var(--status-error-fg)"
                      />
                      <TempRow
                        label={translate('waermepumpe.ruecklauf')}
                        value={ruecklauf}
                        color="var(--accent-color)"
                      />
                    </div>

                    {(heizstabAktivBin || (heizstab != null && heizstab > 0)) && (
                      <div
                        className="flex items-center gap-3 rounded-2xl border p-3"
                        style={{
                          backgroundColor: 'rgba(249,115,22,0.08)',
                          borderColor: 'rgba(249,115,22,0.3)',
                        }}
                      >
                        <Zap className="h-4 w-4 text-orange-400" />
                        <div>
                          <p className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">
                            {translate('waermepumpe.heizstab')} aktiv
                          </p>
                          <p className="text-sm font-light text-[var(--text-primary)]">
                            {heizstab != null && heizstab > 0 ? `${heizstab} W` : '—'}
                            {(() => {
                              const kwh = heizstabEnergieHeuteVal ?? heizstabTaglich;
                              return kwh != null ? (
                                <span className="ml-2 text-[var(--text-muted)]">
                                  · {kwh.toFixed(2)} kWh {translate('waermepumpe.heute')}
                                </span>
                              ) : null;
                            })()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={`space-y-2 ${isPhone ? '' : 'md:col-span-2'}`}>
                    <div
                      className="flex rounded-2xl p-1"
                      style={{ backgroundColor: 'var(--glass-bg)' }}
                    >
                      {['today', 'month'].map((key) => (
                        <button
                          key={key}
                          onClick={() => setEnergyTab(key)}
                          className="flex-1 rounded-xl py-2 text-[11px] font-bold tracking-widest uppercase transition-all"
                          style={
                            energyTab === key
                              ? {
                                  backgroundColor: 'var(--accent-bg)',
                                  borderColor: 'var(--accent-color)',
                                  color: 'var(--accent-color)',
                                  border: '1px solid var(--accent-color)',
                                }
                              : { color: 'var(--text-secondary)' }
                          }
                        >
                          {key === 'today'
                            ? translate('waermepumpe.heute')
                            : translate('waermepumpe.monat')}
                        </button>
                      ))}
                    </div>

                    <div
                      className={`popup-surface transition-all ${
                        isCompact
                          ? 'flex items-center justify-between gap-3 rounded-2xl px-4 py-3'
                          : 'flex flex-col items-center justify-center gap-2 rounded-3xl p-8'
                      }`}
                    >
                      <p className="text-xs font-bold tracking-[0.2em] text-[var(--accent-color)] uppercase">
                        COP
                      </p>
                      <span
                        className={`leading-none font-light text-[var(--accent-color)] italic ${
                          isCompact ? 'text-4xl' : 'text-6xl'
                        }`}
                      >
                        {aktivCop ?? '—'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3">
                        <Zap className="h-4 w-4 text-[var(--accent-color)]" />
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                          {translate('waermepumpe.strom')}
                        </p>
                        <p className="text-lg font-light text-[var(--text-primary)]">
                          {aktivStrom != null ? aktivStrom.toFixed(2) : '—'}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">kWh</p>
                      </div>
                      <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3">
                        <Thermometer className="h-4 w-4 text-orange-400" />
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                          {translate('waermepumpe.waerme')}
                        </p>
                        <p className="text-lg font-light text-[var(--text-primary)]">
                          {aktivWaerme != null ? aktivWaerme.toFixed(2) : '—'}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">kWh</p>
                      </div>
                      <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl p-3">
                        <Zap className="h-4 w-4 text-orange-400" />
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                          Heizstab
                        </p>
                        <p className="text-lg font-light text-[var(--text-primary)]">
                          {energyTab === 'today'
                            ? (heizstabEnergieHeuteVal != null ? heizstabEnergieHeuteVal.toFixed(2) : '—')
                            : (heizstabMonatKwh != null ? heizstabMonatKwh.toFixed(2) : '—')}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">kWh</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div
                  className="mt-3 border-t pt-3 font-sans"
                  style={{ borderColor: 'var(--glass-border)' }}
                >
                  <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                    {translate('waermepumpe.steuerung')}
                  </p>
                  <div className="flex flex-wrap gap-5">
                    {e(WAERMEPUMPE_ENTITY_IDS.betriebsmodus) && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                          {translate('waermepumpe.betriebsmodus')}
                        </p>
                        <SelectDropdown
                          entityId={WAERMEPUMPE_ENTITY_IDS.betriebsmodus}
                          entity={e(WAERMEPUMPE_ENTITY_IDS.betriebsmodus)}
                          onSelect={selectOption}
                        />
                      </div>
                    )}
                    {e(WAERMEPUMPE_ENTITY_IDS.wwSoll) && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                          {translate('waermepumpe.wwSoll')}
                        </p>
                        <SelectDropdown
                          entityId={WAERMEPUMPE_ENTITY_IDS.wwSoll}
                          entity={e(WAERMEPUMPE_ENTITY_IDS.wwSoll)}
                          onSelect={selectOption}
                        />
                      </div>
                    )}
                    {e(WAERMEPUMPE_ENTITY_IDS.heizstabSelect) && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                          {translate('waermepumpe.heizstab')}
                        </p>
                        <SelectDropdown
                          entityId={WAERMEPUMPE_ENTITY_IDS.heizstabSelect}
                          entity={e(WAERMEPUMPE_ENTITY_IDS.heizstabSelect)}
                          onSelect={selectOption}
                        />
                      </div>
                    )}
                    {e(WAERMEPUMPE_ENTITY_IDS.raumsoll) && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                          Raumsoll
                        </p>
                        <SelectDropdown
                          entityId={WAERMEPUMPE_ENTITY_IDS.raumsoll}
                          entity={e(WAERMEPUMPE_ENTITY_IDS.raumsoll)}
                          onSelect={selectOption}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Automatik ── */}
            {mainTab === 'automatik' && (
              <div className="space-y-5 font-sans">

                {/* Automation toggle + Saison */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleAutomation}
                      className="rounded-full border px-4 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all"
                      style={
                        autoOn
                          ? {
                              backgroundColor: 'rgba(74,222,128,0.15)',
                              borderColor: '#4ade80',
                              color: '#4ade80',
                            }
                          : {
                              backgroundColor: 'var(--glass-bg)',
                              borderColor: 'var(--glass-border)',
                              color: 'var(--text-muted)',
                            }
                      }
                    >
                      Automatik {autoOn ? 'Ein' : 'Aus'}
                    </button>
                    {saisonState === 'Sommer' && (
                      <button
                        type="button"
                        onClick={toggleKuehlung}
                        className="rounded-full border px-4 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all"
                        style={
                          kuehlungAktiv
                            ? {
                                backgroundColor: 'rgba(56,189,248,0.15)',
                                borderColor: '#38bdf8',
                                color: '#38bdf8',
                              }
                            : {
                                backgroundColor: 'var(--glass-bg)',
                                borderColor: 'var(--glass-border)',
                                color: 'var(--text-muted)',
                              }
                        }
                      >
                        Kühlung {kuehlungAktiv ? 'Ein' : 'Aus'}
                      </button>
                    )}
                    {saisonState && (
                      <span
                        className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase"
                        style={{
                          backgroundColor: `${saisonColor}22`,
                          borderColor: `${saisonColor}66`,
                          color: saisonColor,
                        }}
                      >
                        {saisonState}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {['Sommer', 'Winter'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSaison(opt)}
                        className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-all"
                        style={
                          saisonState === opt
                            ? {
                                backgroundColor: `${saisonColor}22`,
                                borderColor: saisonColor,
                                color: saisonColor,
                              }
                            : {
                                backgroundColor: 'var(--glass-bg)',
                                borderColor: 'var(--glass-border)',
                                color: 'var(--text-secondary)',
                              }
                        }
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Minus-Preis Banner */}
                {(minusPreisAktiv || (octopusPreisAktuell !== null && octopusPreisAktuell < 0)) && (() => {
                  const isBoh = bohAblaufPhase === 'boh' || bohAblaufPhase === 'uebergabe';
                  const pillColor = heizstabLaeuft ? '#4ade80' : isBoh ? '#38bdf8' : '#fbbf24';
                  const pillBg = heizstabLaeuft ? 'rgba(74,222,128,0.08)' : isBoh ? 'rgba(56,189,248,0.08)' : 'rgba(251,191,36,0.08)';
                  const pillBorder = heizstabLaeuft ? 'rgba(74,222,128,0.4)' : isBoh ? 'rgba(56,189,248,0.4)' : 'rgba(251,191,36,0.4)';
                  const pillLabel = heizstabLaeuft
                    ? `Heizstab ${heizstabSelectState}`
                    : isBoh
                    ? 'BOH aktiv · Daikin intern'
                    : bohAblaufPhase === 'waiting'
                    ? 'Kompressor startet …'
                    : 'WW voll · pausiert';
                  return (
                    <div className="rounded-2xl border p-4 space-y-2" style={{ backgroundColor: pillBg, borderColor: pillBorder }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: pillColor }}>
                          ⚡ Minus-Preis Modus aktiv
                        </span>
                        <span
                          className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                          style={{ backgroundColor: `${pillColor}26`, borderColor: pillColor, color: pillColor }}
                        >
                          {pillLabel}
                        </span>
                      </div>
                      {octopusPreisAktuell != null && (
                        <p className="text-sm font-light" style={{ color: pillColor }}>
                          {octopusPreisAktuell.toFixed(4)} €/kWh · WW-Soll {wwSollState} · Leistung WW {leistungWwVal ?? '—'} kW
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Minus-Preis BOH-Ablauf Timeline */}
                {minusPreisAktiv && (
                  <div className="popup-surface rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      Minus-Preis · BOH-Ablauf
                    </p>

                    {/* Three-phase indicator */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'heizstab', label: 'Heizstab', sub: `0 – ${bohSchwelle.toFixed(0)} min`, color: '#4ade80' },
                        { key: 'uebergabe', label: 'Übergabe', sub: `${bohSchwelle.toFixed(0)} – ${bohWartezeitVal} min`, color: '#fbbf24' },
                        { key: 'boh', label: 'BOH Daikin', sub: `${bohWartezeitVal} min+`, color: '#38bdf8' },
                      ].map(({ key, label, sub, color }) => {
                        const isActive = bohAblaufPhase === key;
                        const isDone =
                          (key === 'heizstab' && (bohAblaufPhase === 'uebergabe' || bohAblaufPhase === 'boh')) ||
                          (key === 'uebergabe' && bohAblaufPhase === 'boh');
                        return (
                          <div
                            key={key}
                            className="rounded-xl border p-2 text-center transition-all"
                            style={
                              isActive
                                ? { backgroundColor: `${color}22`, borderColor: color }
                                : isDone
                                ? { backgroundColor: `${color}10`, borderColor: `${color}44` }
                                : { backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }
                            }
                          >
                            <p className="text-[11px] font-bold" style={{ color: isActive ? color : isDone ? `${color}99` : 'var(--text-muted)' }}>
                              {label}
                            </p>
                            <p className="text-[9px] leading-tight mt-0.5" style={{ color: isActive ? color : 'var(--text-muted)' }}>
                              {sub}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar: 0 → boh_wartezeit, marker at bohSchwelle */}
                    {istWWZyklus && (
                      <div className="space-y-1">
                        <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--glass-border)' }}>
                          {/* Progress fill */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (kompressorLaufzeitMin / bohWartezeitVal) * 100)}%`,
                              backgroundColor:
                                bohAblaufPhase === 'boh' ? '#38bdf8' :
                                bohAblaufPhase === 'uebergabe' ? '#fbbf24' : '#4ade80',
                            }}
                          />
                          {/* Marker at Übergabe threshold */}
                          <div
                            className="absolute inset-y-0 w-0.5"
                            style={{
                              left: `${(bohSchwelle / bohWartezeitVal) * 100}%`,
                              backgroundColor: 'rgba(251,191,36,0.7)',
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          <span>{kompressorLaufzeitMin.toFixed(0)} min</span>
                          <span>/ {bohWartezeitVal} min BOH-Wartezeit</span>
                        </div>
                      </div>
                    )}
                    {!istWWZyklus && (
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {bohAblaufPhase === 'waiting'
                          ? 'Kompressor startet WW-Zyklus …'
                          : 'WW-Zyklus abgeschlossen · Kompressor Standby'}
                      </p>
                    )}

                    {/* Config summary */}
                    <div className="flex gap-4 pt-1 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                      <div>
                        <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Leistung WW</p>
                        <p className="text-sm font-light" style={{ color: leistungWwVal === 9 ? '#4ade80' : 'var(--text-primary)' }}>
                          {leistungWwVal ?? '—'} kW
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>BOH-Wartezeit</p>
                        <p className="text-sm font-light" style={{ color: bohWartezeitVal <= 20 ? '#4ade80' : 'var(--text-primary)' }}>
                          {bohWartezeitVal} min
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>WW-Soll</p>
                        <p className="text-sm font-light" style={{ color: '#38bdf8' }}>
                          {wwSollState || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Minus-Preis kommt bald */}
                {minusPreisKommtInH !== null && (
                  <div
                    className="rounded-2xl border p-4 space-y-1"
                    style={{ backgroundColor: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.4)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: '#fbbf24' }}>
                        ⚡ Minus-Preis in ~{minusPreisKommtInH}h
                      </span>
                      <span
                        className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                        style={{ backgroundColor: 'rgba(251,191,36,0.15)', borderColor: '#fbbf24', color: '#fbbf24' }}
                      >
                        WW-Ziel: 48°C
                      </span>
                    </div>
                    <p className="text-sm font-light" style={{ color: '#fbbf24' }}>
                      WP heizt nur bis 48°C mit PV – Heizstab 9kW startet beim negativen Slot.
                    </p>
                  </div>
                )}

                {/* ── Aktueller Modus + Nächster Zustand ── */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  {/* State Badge */}
                  <div
                    className="flex-1 rounded-2xl overflow-hidden"
                    style={{ borderLeft: `4px solid ${modusColor}`, backgroundColor: `${modusColor}0d`, padding: '16px 16px 16px 20px' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`font-bold tracking-tight ${isCompact ? 'text-base' : 'text-lg'}`} style={{ color: modusColor }}>
                          {MODUS_META[tagesmodus]?.label || tagesmodus}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: modusColor, opacity: 0.65 }}>
                          {MODUS_SUB[tagesmodus] || ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`font-light tabular-nums ${isCompact ? 'text-lg' : 'text-xl'}`} style={{ color: ACCENT }}>
                          {wwTemp != null ? `${wwTemp.toFixed(1)}°C` : '—'}
                        </p>
                        <p className="mt-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          Soll {wwSollState || '—'}
                        </p>
                      </div>
                    </div>

                    {(tagesmodus === 'WW_Heizen' || tagesmodus === 'WW_Boost') && wwTemp != null && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, Math.max(0, (wwTemp - 40) / 23 * 100))}%`, backgroundColor: modusColor }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between" style={{ fontSize: '9px', color: modusColor, opacity: 0.5 }}>
                          <span>40°C</span><span>63°C</span>
                        </div>
                      </div>
                    )}

                    {(betriebsartState || (heizstabSelectState && heizstabLaeuft)) && (
                      <div className="mt-2.5 flex items-center gap-2">
                        {betriebsartState && (
                          <>
                            <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: kompressorAktiv ? '#4ade80' : 'var(--text-muted)' }} />
                            <span className="text-[11px]" style={{ color: modusColor, opacity: 0.7 }}>{betriebsartState}</span>
                          </>
                        )}
                        {heizstabSelectState && heizstabLaeuft && (
                          <span className="ml-auto flex items-center gap-1 text-[11px]" style={{ color: '#ef9a9a' }}>
                            <Zap className="h-3 w-3" />{heizstabSelectState}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* ── Ablauf: Warum eingetreten + Als Nächstes ── */}
                {(() => {
                  const [header, reason] = (entscheidungslog || '').split(' | ');
                  const timeMatch = header?.match(/^(\d{2}:\d{2})/);
                  const transitionMatch = header?.match(/→(\S+)/);
                  const logCurState = transitionMatch ? transitionMatch[1] : tagesmodus;
                  const bullets = buildLogBullets(reason, logCurState);
                  const showFensterSperr = (tagesmodus === 'Standby' || tagesmodus === 'Kühlen') && !imFenster;

                  // ww_start_ok uses ww_ist < _ww_ziel (63°C = wwFertig), not wwStart
                  const wwHeizbarNow = wwTemp == null || wwTemp < WP_CFG.wwFertig;
                  // Einzelne Bedingungen als Chips für "Als Nächstes"
                  const chkFenster = { label: imFenster ? 'Zeitfenster offen' : 'Zeitfenster zu', met: imFenster };
                  const chkWwZiel  = { label: `WW ${wwTemp != null ? wwTemp.toFixed(0) + '°C' : '—'} < ${WP_CFG.wwFertig}°C`, met: wwTemp == null ? null : wwTemp < WP_CFG.wwFertig };
                  const chkSocOk   = { label: `SOC ${socVal != null ? socVal.toFixed(0) + '%' : '—'} > ${WP_CFG.socNotaus}%`, met: socVal == null ? null : socVal > WP_CFG.socNotaus };
                  const chkPufOk   = minusPreisAktiv
                    ? { label: 'Minus-Preis aktiv', met: true }
                    : { label: `Puffer ${wwBonusPuffer != null ? wwBonusPuffer.toFixed(1) + ' kWh' : '—'} ≥ ${PUFFER_MIN_KWH} kWh`, met: wwBonusPuffer == null ? null : wwBonusPufferOk };
                  const chkSaison  = { label: saisonState || 'Saison', met: saisonState !== 'Winter' };
                  const chkRaum    = { label: `Raum ${raumTempVal != null ? raumTempVal.toFixed(1) + '°C' : '—'} ≥ ${WP_CFG.kuehlTemp}°C`, met: raumTempVal == null ? null : raumTempVal >= WP_CFG.kuehlTemp };
                  const chkPvKuehl = { label: `PV ${pvWatt != null ? (pvWatt / 1000).toFixed(1) + ' kW' : '—'} ≥ ${WP_CFG.kuehlPv} kW`, met: pvWatt == null ? null : pvWatt >= WP_CFG.kuehlPv * 1000 };
                  const chkWw55    = { label: `WW ${wwTemp != null ? wwTemp.toFixed(0) + '°C' : '—'} ≥ 55°C`, met: wwTemp == null ? null : wwTemp >= 55 };
                  const chkWwFin   = { label: `WW ${wwTemp != null ? wwTemp.toFixed(0) + '°C' : '—'} ≥ ${WP_CFG.wwFertig}°C`, met: wwTemp == null ? null : wwTemp >= WP_CFG.wwFertig };
                  const chkBoh     = { label: `Komp. ${kompressorLaufzeitMin.toFixed(0)} / ${bohSchwelle.toFixed(0)} min`, met: kompressorLaufzeitMin >= bohSchwelle };
                  // MLZ (Mindestlaufzeit) — verhindert Moduswechsel zu Standby
                  const mlzOk       = seitMinVal >= WP_CFG.mindestlaufzeit;
                  const mlzHeissOk  = seitMinVal >= WP_CFG.mlzHeiss;
                  const mlzStartOk  = mlzOk || (wwTemp != null && wwTemp >= 55 && mlzHeissOk);
                  const mlzLabel    = wwTemp != null && wwTemp >= 55 && !mlzOk
                    ? `MLZ ${seitMinVal.toFixed(0)} / ${WP_CFG.mlzHeiss} min (heiß)`
                    : `MLZ ${seitMinVal.toFixed(0)} / ${WP_CFG.mindestlaufzeit} min`;
                  const chkMlz      = { label: `MLZ ${seitMinVal.toFixed(0)} / ${WP_CFG.mindestlaufzeit} min`, met: mlzOk };
                  const chkMlzStart = { label: mlzLabel, met: mlzStartOk };
                  // BOH-Pause Countdown
                  const bohPauseRest = Math.max(0, WP_CFG.bohPause - seitMinVal);
                  const chkBohPause  = {
                    label: bohPauseRest > 0.5 ? `noch ${Math.ceil(bohPauseRest)} min` : 'Pause beendet',
                    met: bohPauseRest <= 0.5,
                  };
                  const nextStateMap = {
                    Standby: [
                      ...(wwHeizbarNow ? [{ state: 'WW Heizen', c: '#60a5fa', checks: [chkSaison, chkFenster, chkWwZiel, chkSocOk, chkPufOk, chkMlzStart] }] : []),
                      ...(kuehlungAktiv ? [{ state: 'Kühlen', c: '#2dd4bf', checks: [chkRaum, chkPvKuehl, chkSocOk] }] : []),
                    ],
                    WW_Heizen: [
                      { state: 'WW Boost',  c: '#c084fc', checks: [chkWw55] },
                      // WW_Pause ist nur erreichbar wenn WW < 55°C (sonst feuert WW_Boost zuerst)
                      ...(wwTemp == null || wwTemp < 55 ? [{ state: 'WW Pause', c: '#fb923c', checks: [chkBoh] }] : []),
                      { state: 'Standby',   c: '#f87171', cond: 'Wenn PV/Puffer/SOC wegfällt oder Zeitfenster zu', checks: [chkMlz] },
                    ],
                    WW_Pause: [
                      { state: 'WW Heizen', c: '#60a5fa', checks: [chkBohPause] },
                    ],
                    WW_Boost: [
                      { state: 'WW Fertig', c: '#4ade80', checks: [chkWwFin] },
                      { state: 'Standby',   c: '#f87171', cond: 'Wenn PV/Puffer/SOC wegfällt', checks: [chkMlz] },
                    ],
                    WW_Fertig: [
                      ...(kuehlungAktiv ? [{ state: 'Kühlen', c: '#2dd4bf', checks: [chkRaum, chkPvKuehl, chkSocOk] }] : []),
                      { state: 'Standby', c: '#64748b', cond: `ab Zeitfenster-Ende ${WP_CFG.wwFensterEnde}`, checks: [chkMlz] },
                    ],
                    Kühlen: [
                      ...(wwHeizbarNow ? [{ state: 'WW Heizen', c: '#60a5fa', checks: [chkSaison, chkFenster, chkWwZiel, chkSocOk, chkPufOk, chkMlzStart] }] : []),
                      { state: 'Standby',   c: '#64748b', cond: `Raum < ${WP_CFG.kuehlTemp}°C oder PV < ${WP_CFG.kuehlPv} kW`, checks: [chkMlz] },
                    ],
                  };
                  const nextItems = nextStateMap[tagesmodus] || [];

                  if (!bullets.length && !showFensterSperr && !nextItems.length) return null;

                  return (
                    <div className="popup-surface rounded-2xl p-4">
                      {/* Header */}
                      <div className="flex items-center mb-3">
                        <p className="text-[8.5px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--text-muted)' }}>Ablauf</p>
                        {timeMatch && (
                          <span className="ml-auto font-mono text-[9.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {timeMatch[1]}
                          </span>
                        )}
                      </div>

                      {/* Warum eingetreten */}
                      {(bullets.length > 0 || showFensterSperr) && (
                        <div className="mb-1">
                          <p className="text-[7.5px] font-semibold tracking-[0.13em] uppercase mb-2" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>
                            Warum eingetreten
                          </p>
                          <div className="space-y-1.5">
                            {bullets.map((b, i) => {
                              const dotC = b.aktion?.includes('→') ? '#4ade80' : (b.op === '≥' ? '#fbbf24' : '#4ade80');
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotC, flexShrink: 0, marginTop: '5px' }} />
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.label}</span>
                                    {b.val && <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 500, color: modusColor, background: `${modusColor}1a`, padding: '0 5px', borderRadius: '4px', marginLeft: '5px' }}>{b.val}</span>}
                                    {b.op && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '4px' }}>{b.op} {b.ziel}</span>}
                                    {b.aktion && <span style={{ fontSize: '10px', color: '#4ade80', marginLeft: '4px' }}>{b.aktion}</span>}
                                    {b.subNote && <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{b.subNote}</div>}
                                  </div>
                                </div>
                              );
                            })}
                            {showFensterSperr && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
                                <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                                  WW-Zeitfenster <span style={{ color: '#f87171', fontWeight: 600 }}>gesperrt</span> — {fensterStatusText}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Connector */}
                      {(bullets.length > 0 || showFensterSperr) && nextItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0 8px' }}>
                          <div style={{ width: '1px', height: '8px', background: 'var(--glass-border)' }} />
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1 }}>▼</span>
                          <div style={{ width: '1px', height: '4px', background: 'var(--glass-border)' }} />
                        </div>
                      )}

                      {/* Als Nächstes */}
                      {nextItems.length > 0 && (
                        <div>
                          <p className="text-[7.5px] font-semibold tracking-[0.13em] uppercase mb-2" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>
                            Als Nächstes
                          </p>
                          <div className="space-y-1.5">
                            {nextItems.map((n, i) => {
                              const allMet = n.checks.length > 0 && n.checks.every(c => c.met === true);
                              const anyFail = n.checks.some(c => c.met === false);
                              return (
                                <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: `${n.c}10`, border: `1px solid ${n.c}38`, marginBottom: i < nextItems.length - 1 ? '6px' : 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: n.checks.length ? '5px' : 0 }}>
                                    <span style={{ fontSize: '10px', color: n.c, fontWeight: 700, flexShrink: 0 }}>→</span>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: n.c }}>{n.state}</span>
                                    {allMet && (
                                      <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 700, marginLeft: 'auto', background: '#4ade8015', padding: '1px 5px', borderRadius: '4px', border: '1px solid #4ade8030' }}>startklar</span>
                                    )}
                                    {!allMet && anyFail && (
                                      <span style={{ fontSize: '9px', color: '#f87171', fontWeight: 700, marginLeft: 'auto', background: '#f8717115', padding: '1px 5px', borderRadius: '4px', border: '1px solid #f8717130' }}>blockiert</span>
                                    )}
                                  </div>
                                  {n.checks.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                      {n.checks.map((c, j) => {
                                        const bg    = c.met === true ? '#4ade8015' : c.met === false ? '#f8717115' : '#ffffff08';
                                        const bd    = c.met === true ? '#4ade8035' : c.met === false ? '#f8717135' : '#ffffff18';
                                        const color = c.met === true ? '#4ade80'   : c.met === false ? '#f87171'   : '#64748b';
                                        const icon  = c.met === true ? '✓' : c.met === false ? '✗' : '·';
                                        return (
                                          <span key={j} style={{ fontSize: '9.5px', fontWeight: c.met === false ? 700 : 500, padding: '2px 6px', borderRadius: '4px', background: bg, border: `1px solid ${bd}`, color, whiteSpace: 'nowrap' }}>
                                            {icon} {c.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {n.cond && n.checks.length === 0 && (
                                    <p style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '1px', paddingLeft: '16px' }}>{n.cond}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Sensor Tiles: WW / SOC / PV / Raum ── */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'WW-Temp', value: wwTemp, unit: '°C', color: ACCENT, min: 20, max: 65 },
                    { label: 'SOC Akku', value: socVal, unit: '%', color: '#4ade80', min: 0, max: 100 },
                    { label: 'PV-Überschuss', value: pvUeberschussKw, unit: 'kW', color: '#facc15', min: -2, max: 8, decimals: 1 },
                    { label: 'Raumtemp', value: raumTempVal, unit: '°C', color: '#38bdf8', min: 18, max: 32 },
                  ].map(({ label, value, unit, color, min, max, decimals = 1 }) => {
                    const pct = value != null ? Math.min(100, Math.max(0, (value - min) / (max - min) * 100)) : 0;
                    return (
                      <div key={label} className="popup-surface rounded-2xl p-3 space-y-1">
                        <p className="text-[8.5px] font-bold tracking-[0.12em] uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p>
                        <p className={`font-bold leading-none tabular-nums ${isCompact ? 'text-lg' : 'text-xl'}`} style={{ color: value != null ? color : 'var(--text-muted)', letterSpacing: '-0.02em' }}>
                          {value != null ? value.toFixed(decimals) : '—'}<span className="text-[10px] font-normal opacity-50 ml-0.5">{unit}</span>
                        </p>
                        <div className="h-0.5 rounded-full" style={{ backgroundColor: 'var(--glass-border)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Akku-Priorität · WW-Bonus-Puffer ── */}
                {pvRestprognose != null && akkuBisVoll != null && (() => {
                  const barScale = Math.max(pvRestprognose, akkuBisVoll, 0.1);
                  const akkuBarPct = Math.min(100, (akkuBisVoll / barScale) * 100);
                  const pufferBarPct = wwBonusPuffer != null && wwBonusPuffer > 0
                    ? Math.min(100 - akkuBarPct, (wwBonusPuffer / barScale) * 100)
                    : 0;
                  const thresholdPct = Math.min(99, ((akkuBisVoll + PUFFER_MIN_KWH) / barScale) * 100);
                  const akkuColor = wwBonusPuffer != null && wwBonusPuffer < 0 ? '#ef9a9a' : '#fbbf24';
                  const pufferColor = wwBonusPufferOk ? '#4ade80' : '#f97316';
                  const summaryMsg = wwBonusPuffer == null
                    ? 'Keine Daten'
                    : wwBonusPuffer < 0
                    ? `Prognose reicht nicht für Akku (${Math.abs(wwBonusPuffer).toFixed(2)} kWh fehlen)`
                    : wwBonusMoeglich
                    ? 'WW-Bonus freigegeben'
                    : !wwBonusPufferOk
                    ? `Puffer ${wwBonusPuffer.toFixed(2)} kWh < ${PUFFER_MIN_KWH} kWh · kein WW-Bonus`
                    : 'Puffer ok · andere Bedingung nicht erfüllt';
                  const summaryColor = wwBonusMoeglich ? '#4ade80' : wwBonusPuffer != null && wwBonusPuffer < 0 ? '#ef9a9a' : 'var(--text-muted)';

                  return (
                    <div className="popup-surface rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                          Akku-Priorität · WW-Bonus
                        </p>
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          Restprognose <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{pvRestprognose.toFixed(2)} kWh</span>
                        </span>
                      </div>

                      {/* Stacked bar */}
                      <div className="space-y-1.5">
                        <div className="relative h-3.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--glass-border)' }}>
                          {/* Akku segment */}
                          <div
                            className="absolute inset-y-0 left-0 transition-all duration-500"
                            style={{ width: `${akkuBarPct}%`, backgroundColor: akkuColor }}
                          />
                          {/* Puffer segment */}
                          {pufferBarPct > 0 && (
                            <div
                              className="absolute inset-y-0 transition-all duration-500"
                              style={{ left: `${akkuBarPct}%`, width: `${pufferBarPct}%`, backgroundColor: pufferColor }}
                            />
                          )}
                          {/* Min-Puffer-Schwelle Marker */}
                          {thresholdPct < 99 && akkuBisVoll + PUFFER_MIN_KWH <= barScale * 1.01 && (
                            <div
                              className="absolute inset-y-0 w-0.5"
                              style={{ left: `${thresholdPct}%`, backgroundColor: 'rgba(255,255,255,0.4)' }}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[9px]">
                          <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: akkuColor }} />
                            <span style={{ color: 'var(--text-muted)' }}>Akku bis voll</span>
                            <span className="ml-0.5 tabular-nums font-bold" style={{ color: akkuColor }}>
                              {akkuBisVoll.toFixed(2)} kWh
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: wwBonusPuffer != null && wwBonusPuffer > 0 ? pufferColor : 'var(--glass-border)' }} />
                            <span style={{ color: 'var(--text-muted)' }}>WW-Puffer</span>
                            <span className="ml-0.5 tabular-nums font-bold" style={{ color: wwBonusPuffer != null && wwBonusPuffer > 0 ? pufferColor : 'var(--text-muted)' }}>
                              {wwBonusPuffer != null && wwBonusPuffer > 0 ? `${wwBonusPuffer.toFixed(2)} kWh` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Condition pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: `Puffer ≥${PUFFER_MIN_KWH} kWh`, ok: wwBonusPufferOk, detail: wwBonusPuffer != null ? `${wwBonusPuffer.toFixed(2)} kWh` : '—' },
                          { label: `Haus ≤${Math.round(hausMaxBonus)}W`, ok: wwBonusHausOk, detail: hausWatt != null ? `${Math.round(hausWatt)}W` : '—' },
                          { label: 'WW ≥48°C', ok: wwBonusWwOk, detail: wwTemp != null ? `${wwTemp.toFixed(1)}°C` : '—' },
                        ].map(({ label, ok, detail }) => (
                          <div
                            key={label}
                            className="flex items-center gap-1 rounded-full border px-2 py-0.5"
                            style={{
                              backgroundColor: ok ? 'rgba(74,222,128,0.08)' : 'rgba(239,154,154,0.08)',
                              borderColor: ok ? 'rgba(74,222,128,0.3)' : 'rgba(239,154,154,0.3)',
                            }}
                          >
                            <span style={{ color: ok ? '#4ade80' : '#ef9a9a', fontSize: '10px' }}>{ok ? '✓' : '✗'}</span>
                            <span className="text-[8.5px] font-bold" style={{ color: ok ? '#4ade80' : '#ef9a9a' }}>{label}</span>
                            <span className="text-[8.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>· {detail}</span>
                          </div>
                        ))}
                      </div>

                      <p className="text-[10px] font-semibold" style={{ color: summaryColor }}>
                        → {summaryMsg}
                      </p>
                    </div>
                  );
                })()}

                {/* ── Tagesverlauf + Entscheidungsprotokoll ── */}
                {wwHistory.length > 0 && (() => {
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  const now = Date.now();
                  const windowMs = now - todayStart.getTime();
                  const histAsc = [...wwHistory].reverse();

                  // Build timeline segments (today only)
                  const segs = [];
                  for (let i = 0; i < histAsc.length; i++) {
                    const startMs = Math.max(histAsc[i].time.getTime(), todayStart.getTime());
                    const endMs = Math.min(i < histAsc.length - 1 ? histAsc[i + 1].time.getTime() : now, now);
                    if (startMs < endMs && endMs > todayStart.getTime()) {
                      segs.push({ state: histAsc[i].state, startMs, endMs });
                    }
                  }

                  return (
                    <div className="popup-surface rounded-2xl p-4 space-y-3">
                      <p className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                        Tagesverlauf · heute
                      </p>

                      {/* Timeline bar */}
                      {segs.length > 0 && (
                        <>
                          <div style={{ display: 'flex', height: '20px', borderRadius: '3px', overflow: 'hidden', gap: '1px', backgroundColor: 'var(--glass-border)' }}>
                            {segs.map((seg, i) => {
                              const pct = (seg.endMs - seg.startMs) / windowMs * 100;
                              const col = MODUS_META[seg.state]?.color || '#94a3b8';
                              const label = MODUS_META[seg.state]?.label || seg.state;
                              const startTime = new Date(seg.startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              return (
                                <div key={i} style={{ width: `${pct}%`, background: col, height: '100%', minWidth: '3px' }} title={`${label} · ${startTime}`} />
                              );
                            })}
                          </div>
                          <div className="flex justify-between" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                            <span>00:00</span><span>jetzt</span>
                          </div>
                        </>
                      )}

                      {/* Decision log rows from entscheidungslog history */}
                      {(() => {
                        const todayStart2 = new Date(); todayStart2.setHours(0,0,0,0);
                        const todayLog = logHistory.filter(e => e.time.getTime() >= todayStart2.getTime());
                        if (!todayLog.length) return null;
                        return (
                          <div className="space-y-0 border-t pt-3" style={{ borderColor: 'var(--glass-border)' }}>
                            <p className="mb-2 text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-muted)' }}>
                              Entscheidungsprotokoll
                            </p>
                            {todayLog.map((entry, i) => {
                              const col = MODUS_META[entry.curState]?.color || '#94a3b8';
                              const label = MODUS_META[entry.curState]?.label || entry.curState;
                              const vonStr = entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              // newest-first: i-1 is the next state in time, i=0 is still active
                              const bisTime = i === 0 ? new Date() : todayLog[i - 1].time;
                              const bisStr = bisTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              const durMin = Math.max(0, Math.round((bisTime.getTime() - entry.time.getTime()) / 60000));
                              const durStr = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin / 60)}h ${durMin % 60}min`;
                              const bullets2 = buildLogBullets(entry.reason, entry.curState);
                              const reasonText = bullets2
                                .map(b => [b.label, b.val, b.op, b.ziel].filter(Boolean).join(' '))
                                .join(' · ');
                              return (
                                <div key={i} className="py-1.5 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{vonStr}</span>
                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.5 }}>–</span>
                                    <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{bisStr}</span>
                                    <span className="tabular-nums" style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                                      {durStr}
                                    </span>
                                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${col}22`, color: col }}>
                                      {label}
                                    </span>
                                  </div>
                                  {reasonText && (
                                    <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                      {reasonText}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* BOH-Schutz (Kompressor-Laufzeit) */}
                {autoOn && !minusPreisAktiv && (
                  <div className="popup-surface rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
                      BOH-Schutz · Kompressor-Laufzeit
                    </p>
                    <div className="flex items-center gap-3">
                      <div
                        className="relative flex-1 h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--glass-border)' }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all"
                          style={{ width: `${bohPct}%`, backgroundColor: bohColor }}
                        />
                      </div>
                      <span
                        className="flex-shrink-0 text-[11px] font-medium tabular-nums"
                        style={{ color: bohColor, minWidth: '80px', textAlign: 'right' }}
                      >
                        {kompressorLaufzeitMin.toFixed(0)} / {bohSchwelle} min
                      </span>
                    </div>
                    {bohPct >= 75 && (
                      <p className="text-[11px]" style={{ color: bohColor }}>
                        {bohPct >= 100
                          ? '⚠️ BOH-Schwelle erreicht – Heizstab-Schutz aktiv'
                          : `Noch ~${(bohSchwelle - kompressorLaufzeitMin).toFixed(0)} min bis BOH-Eingriff`}
                      </p>
                    )}
                    {!istWWZyklus && (
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Kein aktiver WW-Zyklus · Timer pausiert
                      </p>
                    )}
                  </div>
                )}

                {/* Loading state for history */}
                {wwHistoryLoading && (
                  <div className="flex h-12 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-b-2 opacity-30" style={{ borderColor: ACCENT }} />
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Hydraulik ── */}
            {mainTab === 'hydraulik' && <HpsuHydraulicView entities={entities} />}
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
