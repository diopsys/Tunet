import { memo } from 'react';
import { FaWaterLadder } from 'react-icons/fa6';

const VORLAUF    = 'sensor.poolsteuerung_d1_blueconnect_vorlauf';
const FILTERPUMPE = 'switch.poolsteuerung_d1_blueconnect_filterpumpe';
const WAERMEPUMPE = 'switch.poolsteuerung_d1_blueconnect_w_rmepumpe';
const BLUERIIOT_CONNECTION = 'binary_sensor.poolsteuerung_d1_blueconnect_blueriiot_connection_state';
const BLUERIIOT_PH  = 'sensor.poolsteuerung_d1_blueconnect_blueriiot_ph';
const BLUERIIOT_ORP = 'sensor.poolsteuerung_d1_blueconnect_blueriiot_orp';

const PH_STOPS  = [{ at: 6.8, color: '#ef4444' }, { at: 7.0, color: '#f97316' }, { at: 7.2, color: '#22c55e' }, { at: 7.4, color: '#22c55e' }, { at: 7.6, color: '#f97316' }, { at: 7.8, color: '#ef4444' }];
const ORP_STOPS = [{ at: 400, color: '#ef4444' }, { at: 550, color: '#f97316' }, { at: 650, color: '#22c55e' }, { at: 750, color: '#22c55e' }, { at: 850, color: '#f97316' }, { at: 900, color: '#ef4444' }];
function scaleColor(stops, v, min, max) {
  const c = Math.max(min, Math.min(max, v));
  for (let i = 0; i < stops.length - 1; i++) {
    if (c <= stops[i + 1].at) {
      const t = (c - stops[i].at) / (stops[i + 1].at - stops[i].at);
      return t < 0.5 ? stops[i].color : stops[i + 1].color;
    }
  }
  return stops[stops.length - 1].color;
}
const phColor  = (v) => scaleColor(PH_STOPS,  v, 6.8, 7.8);
const orpColor = (v) => scaleColor(ORP_STOPS, v, 400, 900);

function StatusChip({ label }) {
  return (
    <span className="rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--status-success-fg)]">
      {label}
    </span>
  );
}

const PoolCard = memo(function PoolCard({
  cardId,
  dragProps,
  controls,
  cardStyle,
  entities,
  editMode,
  customNames,
  isMobile,
  isTwoColMobile,
  onOpen,
}) {
  const name = customNames?.[cardId] || 'Pool';
  const isUltraCompact = isTwoColMobile;
  const isDenseMobile = isMobile && !isTwoColMobile;

  const vorlauf    = entities[VORLAUF];
  const filterpumpe = entities[FILTERPUMPE];
  const waermepumpe = entities[WAERMEPUMPE];
  const phVal  = parseFloat(entities[BLUERIIOT_PH]?.state);
  const orpVal = parseFloat(entities[BLUERIIOT_ORP]?.state);
  const blueConnected = entities[BLUERIIOT_CONNECTION]?.state === 'on' || Number.isFinite(phVal);

  const temp = vorlauf ? parseFloat(vorlauf.state) : null;
  const tempDisplay = Number.isFinite(temp) ? temp.toFixed(1) : '–';

  const filterOn = filterpumpe?.state === 'on';
  const waermeOn = waermepumpe?.state === 'on';

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
        <div className="flex items-start justify-between">
          <div
            className={`transition-transform duration-500 group-hover:scale-110 ${isUltraCompact ? 'rounded-lg p-2' : isDenseMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'}`}
            style={{ backgroundColor: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
          >
            <FaWaterLadder className={isUltraCompact ? 'h-3 w-3' : isDenseMobile ? 'h-4 w-4' : 'h-5 w-5'} />
          </div>
          {isUltraCompact ? (
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full transition-colors ${filterOn ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--glass-border)]'}`}
                title="Filterpumpe"
              />
              <span
                className={`h-2 w-2 rounded-full transition-colors ${waermeOn ? 'bg-[var(--status-success-fg)]' : 'bg-[var(--glass-border)]'}`}
                title="Wärmepumpe"
              />
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-1">
              {filterOn && <StatusChip label="Filter" />}
              {waermeOn && <StatusChip label="Heizung" />}
            </div>
          )}
        </div>

        <div className={isUltraCompact ? 'mt-1.5' : isDenseMobile ? 'mt-3' : 'mt-4'}>
          <p className={`${isUltraCompact ? 'mb-0.5 text-[9px]' : isDenseMobile ? 'mb-1 text-[10px]' : 'mb-0.5 text-xs'} leading-none font-bold text-[var(--text-secondary)] uppercase opacity-60`} style={{ letterSpacing: '0.05em' }}>
            {name}
          </p>
          <div className="flex items-baseline gap-1 leading-none">
            <span className={`font-thin text-[var(--text-primary)] ${isUltraCompact ? 'text-2xl' : isDenseMobile ? 'text-3xl' : 'text-4xl'}`}>{tempDisplay}</span>
            <span className={`font-medium text-[var(--text-muted)] ${isUltraCompact ? 'text-xs' : isDenseMobile ? 'text-sm' : 'text-base'}`}>°C</span>
          </div>
        </div>

        {blueConnected && (Number.isFinite(phVal) || Number.isFinite(orpVal)) && (
          <div className={`flex items-center gap-3 border-t border-[var(--glass-border)] ${isUltraCompact ? 'mt-2 pt-2' : isDenseMobile ? 'mt-3 pt-2' : 'mt-4 pt-3'}`}>
            {Number.isFinite(phVal) && (
              <div className="flex flex-col">
                <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">pH</span>
                <span className={`font-light ${isUltraCompact ? 'text-sm' : isDenseMobile ? 'text-sm' : 'text-lg'}`} style={{ color: phColor(phVal) }}>
                  {phVal.toFixed(1)}
                </span>
              </div>
            )}
            {Number.isFinite(orpVal) && (
              <div className="flex flex-col">
                <span className="text-[9px] font-bold tracking-wide text-[var(--text-muted)] uppercase">ORP</span>
                <span className={`font-light ${isUltraCompact ? 'text-sm' : isDenseMobile ? 'text-sm' : 'text-lg'}`} style={{ color: orpColor(orpVal) }}>
                  {Math.round(orpVal)} <span className="text-[10px] text-[var(--text-muted)]">mV</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default PoolCard;
