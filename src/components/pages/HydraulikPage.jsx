import { memo, useEffect, useState } from 'react';

const E = {
  ta: 'sensor.daikin_heizung_aussentemperatur',
  fan: 'sensor.daikin_heizung_ventilatordrehzahl',
  rpm: 'sensor.daikin_heizung_kompressor_drehzahl',
  amp: 'sensor.daikin_heizung_inv_primary_current',
  evap: 'sensor.daikin_heizung_temperatur_lamellenw_rmetauscher',
  eev: 'sensor.daikin_heizung_expansionsventil',
  hg: 'sensor.daikin_heizung_temperatur_nach_k_ltemittelverdichter',
  kond: 'sensor.daikin_heizung_temperatur_fl_ssigkeitsleitung',
  vl: 'sensor.daikin_heizung_vorlauftemeratur_tv',
  vlbh: 'sensor.daikin_heizung_vorlauftemeratur_tvbh',
  rl: 'sensor.daikin_heizung_r_cklauftemperatur',
  vls: 'sensor.daikin_heizung_vorlauf_soll',
  flow: 'sensor.daikin_3_r_ech2o_seriell_can_durchfluss_uart',
  bar: 'sensor.daikin_heizung_wasserdruck',
  bpv: 'sensor.daikin_heizung_bpv',
  mix: 'sensor.daikin_heizung_dhw_mischer_position',
  dt: 'sensor.daikin_3_r_ech2o_seriell_can_spreizung_uart',
  q: 'sensor.daikin_3_r_ech2o_seriell_can_thermische_leistung_uart',
  p: 'sensor.daikin_heizung_leistung',
  cop: 'sensor.daikin_heizung_cop',
  mode: 'sensor.daikin_3_r_ech2o_seriell_can_betriebsart_uart',
  opMode: 'select.daikin_heizung_betriebsmodus',
  err: 'sensor.daikin_heizung_fehlercode',
  room: 'sensor.klima_durchschnittliche_temperatur_haus',
  st: 'sensor.daikin_heizung_dhw_tank_temp',
  sts: 'select.daikin_heizung_t_ww_soll1',
  buhPower: 'sensor.daikin_3_r_ech2o_seriell_can_heizstab_speicher_leistung_live',
  defrost: 'binary_sensor.daikin_heizung_abtauvorgang',
  defrosts: 'sensor.abtauungen_heute',
  progStart: 'select.daikin_3_r_ech2o_seriell_can_ww_programm_beginn',
  progEnd: 'select.daikin_3_r_ech2o_seriell_can_ww_programm_ende',
  kwh: 'sensor.warmepumpe_elektrische_energie_dhw_taglich',
};

// 450 pulses = fully open (parking position); larger values are ESP read glitches
const EEV_MAX = 450;
const NOMINAL_FLOW = 900;

const COLORS = {
  hot: 'var(--hyd-hot)',
  cold: 'var(--hyd-cold)',
  gas: 'var(--hyd-gas)',
  liq: 'var(--hyd-liq)',
  suc: 'var(--hyd-suc)',
  fbh: 'url(#hyd-fbh-grad)',
};

const COIL = (() => {
  let d = 'M692 330';
  for (let i = 1; i <= 11; i++) d += `L${i % 2 ? 520 : 700} ${330 + i * 24}`;
  return d;
})();

const dhwWave = (cx, from, to) => {
  let d = '';
  for (let y = from; y > to; y -= 20) d += `Q${y % 40 ? cx - 52 : cx + 52} ${y - 10} ${cx} ${y - 20}`;
  return d;
};

const OUTDOOR_SEGMENTS = [
  { d: 'M190 110H238', c: 'suc', ref: true },
  { d: 'M240 210H190', c: 'suc', ref: true },
];

const INDOOR_SEGMENTS = [
  { d: 'M524 84H676', c: 'hot', share: 'all' },
  { d: 'M708 84H760', c: 'hot', share: 'direct' },
  { d: 'M692 102V330', c: 'hot', share: 'tank' },
  { d: COIL, c: 'hot', share: 'tank' },
  { d: 'M520 594H470V56H740V84H760', c: 'cold', share: 'tank' },
  { d: 'M760 84V214', c: 'bypass', share: 'bypass' },
  { d: 'M744 230H600V186', c: 'cold', share: 'all' },
  { d: 'M584 170H524', c: 'cold', share: 'all' },
];

// Building blocks are drawn in landscape coordinates and shifted per layout;
// only the connecting pipes, the floor-heating box and outer tags differ.
const LAYOUTS = {
  landscape: {
    viewBox: '0 0 1000 660',
    outdoor: [0, 0],
    indoor: [0, 0],
    water: [0, 0],
    pipeLabelsInWaterBox: true,
    segments: [
      { d: 'M282 110H480', c: 'gas', ref: true },
      { d: 'M480 170H350V210H280', c: 'liq', ref: true },
      { d: 'M760 84H958V270', c: 'hot', share: 'fbh' },
      { d: 'M958 270V330H812V346H958V362H812V378H958V394H790', c: 'fbh', share: 'fbh' },
      { d: 'M790 394H760V246', c: 'cold', share: 'fbh' },
    ],
    dhw: `M330 600H612${dhwWave(612, 600, 360)}H330`,
    fbhGradient: [330, 394],
    fbhBox: { x: 790, y: 270, w: 190, h: 146 },
    labels: [],
    tags: [
      ['hg', 'Heißgas', 352, 62, 92],
      ['kond', 'Kondensat', 362, 180, 88],
      ['vlbh', 'Vorlauf BH', 790, 118, 84],
      ['vls', 'Vorlauf-Soll', 790, 166, 84],
      ['bar', 'Druck', 790, 214, 84],
      ['rl', 'Rücklauf', 790, 428, 90],
      ['dt', 'Spreizung', 890, 428, 90],
    ],
  },
  portrait: {
    viewBox: '0 0 420 1556',
    outdoor: [45, 0],
    indoor: [-402, 380],
    water: [0, 720],
    pipeLabelsInWaterBox: false,
    segments: [
      { d: 'M327 110H410V374H108V450', c: 'gas', ref: true },
      { d: 'M92 450V356H392V210H325', c: 'liq', ref: true },
      { d: 'M358 464H392V1478', c: 'hot', share: 'fbh' },
      { d: 'M392 1478H40V1462H352V1446H40V1430H372', c: 'fbh', share: 'fbh' },
      { d: 'M372 1430V650H358V626', c: 'cold', share: 'fbh' },
    ],
    dhw: `M300 1050V980H210${dhwWave(210, 980, 740)}H44V1050`,
    fbhGradient: [1478, 1430],
    fbhBox: { x: 20, y: 1380, w: 390, h: 114 },
    labels: [
      ['Warmwasser', 52, 1042, 'start'],
      ['Kaltwasser', 292, 1042, 'end'],
    ],
    tags: [
      ['hg', 'Heißgas', 130, 308, 92],
      ['kond', 'Kondensat', 236, 308, 86],
      ['vlbh', 'Vorlauf BH', 20, 1504, 74],
      ['vls', 'Vorlauf-Soll', 98, 1504, 74],
      ['bar', 'Druck', 176, 1504, 74],
      ['rl', 'Rücklauf', 254, 1504, 74],
      ['dt', 'Spreizung', 332, 1504, 74],
    ],
  },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, digits = 1) => (v == null ? '–' : v.toFixed(digits).replace('.', ','));
const deg = (v) => (v == null ? '–' : `${fmt(v)}\u202f°C`);

function tempColor(t) {
  const k = t == null ? 0.5 : clamp((t - 20) / 40, 0, 1);
  const a = [78, 168, 255];
  const b = [255, 106, 77];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`;
}

function parseClock(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function programInfo(start, end, now) {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s == null || e == null) return { range: '–', next: '' };
  const range = `${start}–${end}`;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= s && mins < e) return { range, next: 'läuft gerade' };
  const until = (s - mins + 1440) % 1440;
  return { range, next: `nächste Ladung in ${Math.floor(until / 60)} h ${until % 60} min` };
}

function Tag({ x, y, w, label, value }) {
  return (
    <g className="hyd-tag">
      <rect x={x} y={y} width={w} height={40} rx={8} />
      <text className="hyd-tl" x={x + 8} y={y + 15}>
        {label}
      </text>
      <text className="hyd-tv" x={x + 8} y={y + 32}>
        {value}
      </text>
    </g>
  );
}

function Metric({ label, children, wide, text }) {
  return (
    <div className={`hyd-metric ${wide ? 'hyd-wide' : ''}`}>
      <div className="hyd-metric-label">{label}</div>
      <div className={`hyd-metric-value ${text ? '' : 'hyd-mono'}`}>{children}</div>
    </div>
  );
}

function HydraulikPage({ entities, isMobile = false }) {
  const [now, setNow] = useState(() => new Date());
  const layout = LAYOUTS[isMobile ? 'portrait' : 'landscape'];
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const raw = (key) => entities?.[E[key]]?.state;
  const num = (key) => {
    const v = parseFloat(raw(key));
    return Number.isFinite(v) ? v : null;
  };

  const flow = num('flow') ?? 0;
  const rpm = num('rpm') ?? 0;
  const fan = num('fan') ?? 0;
  const mix = clamp((num('mix') ?? 0) / 100, 0, 1);
  const bp = clamp((num('bpv') ?? 100) / 100, 0, 1);
  const defrost = raw('defrost') === 'on';
  const buhPower = num('buhPower') ?? 0;
  const buh = buhPower > 0;
  const waterRuns = flow > 0;
  const refRuns = rpm > 0;

  const eevRaw = num('eev');
  const eevPct = eevRaw != null && eevRaw <= EEV_MAX ? Math.round((eevRaw / EEV_MAX) * 100) : null;
  const storage = num('st');
  const storageSet = num('sts');
  const modeText = raw('mode') || '–';
  const errText = raw('err') || '–';
  const powerW = num('p');
  const cop = num('cop');
  const program = programInfo(raw('progStart'), raw('progEnd'), now);

  const shares = { all: 1, direct: 1 - mix, tank: mix, fbh: 1 - bp, bypass: bp };
  const stateColor = defrost
    ? 'var(--hyd-ice)'
    : /warmwasser/i.test(modeText)
      ? 'var(--hyd-gas)'
      : /heiz/i.test(modeText)
        ? 'var(--hyd-hot)'
        : 'var(--text-muted)';

  const barY = (t) => 590 - 190 * clamp(((t ?? 10) - 10) / 50, 0, 1);
  const shift = ([x, y]) => (x || y ? `translate(${x} ${y})` : undefined);
  const tagValues = {
    hg: deg(num('hg')),
    kond: deg(num('kond')),
    vlbh: deg(num('vlbh')),
    vls: deg(num('vls')),
    bar: `${fmt(num('bar'))} bar`,
    rl: deg(num('rl')),
    dt: `${fmt(num('dt'))} K`,
  };

  const renderSegment = (s, i) => {
    const share = s.ref ? 1 : shares[s.share];
    const on = s.ref ? refRuns : waterRuns && share > 0.01;
    const speed = s.ref ? clamp(rpm / 2400, 0.6, 1.5) : clamp((flow / NOMINAL_FLOW) * share, 0.6, 1.5);
    const color = s.c === 'bypass' ? (mix >= 0.5 ? COLORS.cold : COLORS.hot) : COLORS[s.c];
    return (
      <g
        key={i}
        className={`${on ? 'hyd-on' : ''} ${s.ref ? 'hyd-ref' : ''}`}
        style={{ '--share': Math.max(0.25, share).toFixed(2), '--dur': `${(0.9 / speed).toFixed(2)}s` }}
      >
        <path className="hyd-pipe" d={s.d} />
        <path className="hyd-glow" d={s.d} style={{ stroke: color }} />
        <path className="hyd-flow" d={s.d} style={{ stroke: color }} />
      </g>
    );
  };

  const { fbhBox } = layout;

  return (
    <div className={`hyd-root ${isMobile ? 'hyd-mobile' : ''}`}>
      <style>{CSS}</style>
      <div className="hyd-grid">
        <div className="hyd-card hyd-schema">
          <svg
            viewBox={layout.viewBox}
            role="img"
            aria-label="Hydraulikschema Wärmepumpe"
            className={defrost ? 'hyd-defrost' : ''}
          >
            <defs>
              <linearGradient id="hyd-tank-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={tempColor(storage == null ? null : storage + 3)} />
                <stop offset="1" stopColor={tempColor(storage == null ? null : storage - 10)} />
              </linearGradient>
              <linearGradient
                id="hyd-fbh-grad"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={layout.fbhGradient[0]}
                x2="0"
                y2={layout.fbhGradient[1]}
              >
                <stop offset="0" stopColor="#ff6a4d" />
                <stop offset=".5" stopColor="#f59e0b" />
                <stop offset="1" stopColor="#4ea8ff" />
              </linearGradient>
              <pattern id="hyd-fins" width="6" height="10" patternUnits="userSpaceOnUse">
                <path d="M3 0V10" stroke="var(--hyd-pipe)" strokeWidth="2" />
              </pattern>
            </defs>

            {/* Außengerät */}
            <g transform={shift(layout.outdoor)}>
              <rect className="hyd-box" x="20" y="20" width="310" height="282" rx="16" />
              <text className="hyd-lbl" x="38" y="44">Außengerät</text>
              <text className="hyd-ttl" x="38" y="64">Altherma 3 R · R32</text>
              <text className="hyd-lbl" x="312" y="44" textAnchor="end">Außen</text>
              <text className="hyd-val" x="312" y="64" textAnchor="end">{deg(num('ta'))}</text>
              <rect x="40" y="88" width="150" height="144" rx="6" fill="url(#hyd-fins)" stroke="var(--glass-border)" />
              <circle cx="115" cy="160" r="56" className="hyd-fan-ring" />
              <g
                className={`hyd-spin ${fan > 0 ? 'hyd-go' : ''}`}
                style={{
                  transformOrigin: '115px 160px',
                  transformBox: 'view-box',
                  animationDuration: fan > 0 ? `${(600 / fan).toFixed(2)}s` : undefined,
                }}
              >
                {[0, 120, 240].map((r) => (
                  <path
                    key={r}
                    d="M115 160 C105 128 120 112 133 112 C136 135 125 150 115 160Z"
                    className="hyd-blade"
                    transform={`rotate(${r} 115 160)`}
                  />
                ))}
                <circle cx="115" cy="160" r="7" className="hyd-hub" />
              </g>
              <rect className="hyd-frost" x="40" y="88" width="150" height="144" rx="6" />
              <g className="hyd-defrost-badge">
                <rect x="72" y="148" width="86" height="24" rx="12" />
                <text x="115" y="164" textAnchor="middle">ABTAUEN</text>
              </g>
            </g>

            {/* Innengerät */}
            <g transform={shift(layout.indoor)}>
              <rect x="460" y="20" width="304" height="620" rx="22" className="hyd-indoor" />
              <text className="hyd-lbl" x="536" y="44">Innengerät ECH₂O</text>
              <rect x="484" y="296" width="256" height="330" rx="40" fill="url(#hyd-tank-grad)" opacity=".2" />
              <rect x="484" y="296" width="256" height="330" rx="40" fill="none" stroke="var(--glass-border)" strokeWidth="2" />
              <text className="hyd-lbl" x="612" y="614" textAnchor="middle">Speicher 500 l · drucklos</text>
              <circle cx="740" cy="460" r="5" className="hyd-sensor" />
              <text className="hyd-lbl" x="730" y="452" textAnchor="end">Fühler</text>
            </g>

            {/* Trinkwasser */}
            <g transform={shift(layout.water)}>
              <rect className="hyd-box" x="20" y="330" width="310" height="310" rx="16" />
              <text className="hyd-lbl" x="38" y="354">Trinkwasser</text>
              {layout.pipeLabelsInWaterBox && (
                <>
                  <text className="hyd-lbl" x="312" y="350" textAnchor="end">Warmwasser</text>
                  <text className="hyd-lbl" x="312" y="620" textAnchor="end">Kaltwasser</text>
                </>
              )}
              <rect x="40" y="400" width="22" height="190" rx="11" className="hyd-bar-bg" />
              {storage != null && (
                <rect
                  x="40"
                  y={barY(storage)}
                  width="22"
                  height={590 - barY(storage)}
                  rx="11"
                  fill={tempColor(storage)}
                  opacity=".85"
                />
              )}
              {storageSet != null && (
                <line
                  x1="34"
                  x2="68"
                  y1={barY(storageSet)}
                  y2={barY(storageSet)}
                  stroke="var(--text-primary)"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              )}
              <text className="hyd-lbl" x="84" y="420">Speicher Ist</text>
              <text className="hyd-big" x="84" y="458">{deg(storage)}</text>
              <text className="hyd-lbl" x="84" y="494">Soll</text>
              <text className="hyd-val" x="84" y="514">{deg(storageSet)}</text>
              <text className="hyd-lbl" x="196" y="494">Heizstab</text>
              <text className="hyd-val" x="196" y="514" style={buh ? { fill: 'var(--hyd-warn)' } : undefined}>
                {buh ? `An · ${fmt(buhPower / 1000)} kW` : 'Aus'}
              </text>
              <text className="hyd-lbl" x="84" y="550">Ladeprogramm</text>
              <text className="hyd-val" x="84" y="570">{program.range}</text>
              <text className="hyd-lbl hyd-lbl-plain" x="84" y="588">{program.next}</text>
              <text className="hyd-lbl" x="196" y="550">Strom heute</text>
              <text className="hyd-val" x="196" y="570">{`${fmt(num('kwh'))} kWh`}</text>
            </g>

            {/* Heizkreis */}
            <rect className="hyd-box" x={fbhBox.x} y={fbhBox.y} width={fbhBox.w} height={fbhBox.h} rx="16" />
            <text className="hyd-lbl" x={fbhBox.x + 18} y={fbhBox.y + 22}>Heizkreis</text>
            <text className="hyd-ttl" x={fbhBox.x + 18} y={fbhBox.y + 40}>Fußbodenheizung</text>
            {layout.labels.map(([text, x, y, anchor]) => (
              <text key={text} className="hyd-lbl" x={x} y={y} textAnchor={anchor}>{text}</text>
            ))}

            <g transform={shift(layout.outdoor)}>{OUTDOOR_SEGMENTS.map(renderSegment)}</g>
            <g transform={shift(layout.indoor)}>{INDOOR_SEGMENTS.map(renderSegment)}</g>
            <g>{layout.segments.map(renderSegment)}</g>
            <path d={layout.dhw} fill="none" stroke="var(--hyd-dhw)" strokeWidth="3" opacity=".8" />

            <g transform={shift(layout.indoor)}>
              {/* Heizstab im Speicher */}
              <g className={buh ? 'hyd-buh-on' : ''}>
                <path
                  className="hyd-buh-rod"
                  d="M660 296V330l-7 6 14 8-14 8 14 8-14 8 14 8-14 8 14 8-14 8 14 8-14 8 14 8-7 6V470"
                />
                <rect x="651" y="282" width="18" height="14" rx="3" className="hyd-part" />
                <g className="hyd-buh-heat">
                  <path className="hyd-heat" d="M644 440q-4-6 0-12q4-6 0-12" />
                  <path className="hyd-heat" d="M676 420q-4-6 0-12q4-6 0-12" style={{ animationDelay: '.6s' }} />
                  <path className="hyd-heat" d="M644 380q-4-6 0-12q4-6 0-12" style={{ animationDelay: '1.2s' }} />
                  <path className="hyd-heat" d="M676 460q-4-6 0-12q4-6 0-12" style={{ animationDelay: '.3s' }} />
                </g>
                <text className="hyd-lbl" x="645" y="292" textAnchor="end">Heizstab</text>
              </g>

              {/* Kondensator */}
              <rect x="480" y="70" width="44" height="120" rx="5" className="hyd-part" />
              <path d="M486 84h32M486 97h32M486 110h32M486 123h32M486 136h32M486 149h32M486 162h32M486 175h32" stroke="var(--glass-border)" />
              <text className="hyd-lbl" x="484" y="206">Kondensator</text>

              {/* Pumpe */}
              <circle cx="600" cy="170" r="16" className="hyd-part" />
              <g className={`hyd-spin ${waterRuns ? 'hyd-go' : ''}`} style={{ animationDuration: '.6s' }}>
                <path d="M600 157v26M587 170h26" className="hyd-part-line" />
              </g>

              {/* 3UV DHW (M1S) */}
              <path d="M676 74L692 84L676 94Z" style={{ fill: waterRuns ? COLORS.hot : 'var(--hyd-dim)' }} className="hyd-v3" />
              <path d="M708 74L692 84L708 94Z" style={{ fill: waterRuns && mix < 1 ? COLORS.hot : 'var(--hyd-dim)' }} className="hyd-v3" />
              <path d="M682 102L692 84L702 102Z" style={{ fill: waterRuns && mix > 0 ? COLORS.hot : 'var(--hyd-dim)' }} className="hyd-v3" />

              {/* Bypass (M2S) */}
              <path d="M744 220L760 230L744 240Z" style={{ fill: waterRuns ? COLORS.cold : 'var(--hyd-dim)' }} className="hyd-v3" />
              <path d="M750 214L760 230L770 214Z" style={{ fill: waterRuns && bp > 0 ? COLORS.cold : 'var(--hyd-dim)' }} className="hyd-v3" />
              <path d="M750 246L760 230L770 246Z" style={{ fill: waterRuns && bp < 1 ? COLORS.cold : 'var(--hyd-dim)' }} className="hyd-v3" />

              <Tag x={530} y={100} w={66} label="Vorlauf" value={deg(num('vl'))} />
              <Tag x={700} y={100} w={54} label="3UV DHW" value={`${Math.round(mix * 100)} %`} />
              <Tag x={700} y={150} w={54} label="Bypass" value={`${Math.round(bp * 100)} %`} />
              <Tag x={488} y={240} w={84} label="Durchfluss" value={`${Math.round(flow)} l/h`} />
            </g>

            <g transform={shift(layout.outdoor)}>
              {/* Kältekreis-Bauteile */}
              <circle cx="260" cy="110" r="22" className="hyd-part" />
              <path
                d="M248 122 L272 98 M248 98 L272 122"
                className={`hyd-part-line hyd-spin ${refRuns ? 'hyd-go' : ''}`}
                style={{ animationDuration: refRuns ? `${(2400 / rpm).toFixed(2)}s` : undefined }}
              />
              <text className="hyd-lbl" x="260" y="148" textAnchor="middle">Verdichter</text>
              <path d="M240 200L260 210L240 220Z M280 200L260 210L280 220Z" className="hyd-valve" />
              <text className="hyd-lbl" x="260" y="236" textAnchor="middle">EEV</text>

              <Tag x={222} y={156} w={84} label="Strom" value={`${fmt(num('amp'))} A`} />
              <Tag x={34} y={250} w={64} label="Lüfter" value={fan > 0 ? `${Math.round(fan)} rpm` : 'aus'} />
              <Tag x={104} y={250} w={72} label="Verdichter" value={rpm > 0 ? `${Math.round(rpm)} rpm` : 'aus'} />
              <Tag x={182} y={250} w={72} label="Verdampfer" value={deg(num('evap'))} />
              <Tag x={260} y={250} w={56} label="EEV" value={eevPct == null ? '–' : `${eevPct} %`} />
            </g>

            {layout.tags.map(([key, label, x, y, w]) => (
              <Tag key={key} x={x} y={y} w={w} label={label} value={tagValues[key]} />
            ))}
          </svg>
        </div>

        <aside className="hyd-card hyd-metrics">
          <Metric label="Betriebsart" wide text>
            <span className="hyd-state">
              <span className="hyd-dot" style={{ background: stateColor, boxShadow: `0 0 10px ${stateColor}` }} />
              {defrost ? 'Abtauen' : modeText}
            </span>
          </Metric>
          <Metric label="Modus" wide text>
            <span className="hyd-state hyd-state-plain">{raw('opMode') || '–'}</span>
          </Metric>
          <Metric label="Therm. Leistung">
            {fmt(num('q'))}
            <small>kW</small>
          </Metric>
          <Metric label="Elektr. Leistung">
            {powerW == null ? '–' : fmt(powerW / 1000, 2)}
            <small>kW</small>
          </Metric>
          <Metric label="COP">{cop ? fmt(cop, 2) : '–'}</Metric>
          <Metric label="Spreizung">
            {fmt(num('dt'))}
            <small>K</small>
          </Metric>
          <Metric label="Raum-Ist">
            {fmt(num('room'))}
            <small>°C</small>
          </Metric>
          <Metric label="Abtauungen heute">{raw('defrosts') ?? '–'}</Metric>
          <Metric label="Fehlercode" wide text>
            <span className="hyd-err">{errText}</span>
          </Metric>
          <div className="hyd-legend hyd-wide">
            <span><i style={{ background: 'var(--hyd-gas)' }} />Heißgas</span>
            <span><i style={{ background: 'var(--hyd-liq)' }} />Kältemittel flüssig</span>
            <span><i style={{ background: 'var(--hyd-suc)' }} />Sauggas</span>
            <span><i style={{ background: 'var(--hyd-hot)' }} />Vorlauf</span>
            <span><i style={{ background: 'var(--hyd-cold)' }} />Rücklauf</span>
            <span><i style={{ background: 'var(--hyd-dhw)' }} />Trinkwasser</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

const CSS = `
.hyd-root{--hyd-hot:#ff6a4d;--hyd-cold:#4ea8ff;--hyd-gas:#f5a524;--hyd-liq:#b28cff;--hyd-suc:#7dd3fc;--hyd-dhw:#b8c7dd;--hyd-ice:#cfe8ff;--hyd-warn:#facc15;--hyd-dim:rgba(127,140,163,.45);--hyd-pipe:rgba(127,140,163,.22);padding-bottom:24px}
.hyd-grid{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:18px}
@media (max-width:1024px){.hyd-grid{grid-template-columns:minmax(0,1fr)}}
.hyd-mobile .hyd-grid{grid-template-columns:minmax(0,1fr)}
.hyd-card{background:var(--card-bg);border:1px solid var(--card-border,var(--glass-border));border-radius:24px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.hyd-schema{overflow-x:auto}
.hyd-schema svg{display:block;width:100%;min-width:680px;height:auto}
.hyd-mobile .hyd-schema svg{min-width:0}
.hyd-metrics{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}
.hyd-metric{border:1px solid var(--glass-border);border-radius:14px;padding:10px 12px;min-width:0}
.hyd-metric-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
.hyd-wide{grid-column:1/-1}
.hyd-metric-value{font-size:19px;font-weight:600;margin-top:4px;color:var(--text-primary);font-variant-numeric:tabular-nums}
.hyd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.hyd-metric-value small{font-size:12px;color:var(--text-secondary);font-weight:400;margin-left:3px}
.hyd-state{display:flex;align-items:center;gap:8px;font-size:15px}
.hyd-state-plain{font-weight:500}
.hyd-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.hyd-err{font-size:13px;font-weight:500;word-break:break-word}
.hyd-legend{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:var(--text-secondary);border:1px solid var(--glass-border);border-radius:14px;padding:10px 12px}
.hyd-legend span{display:flex;align-items:center;gap:6px}
.hyd-legend i{width:18px;height:3px;border-radius:2px;display:block}
.hyd-root .hyd-box{fill:var(--glass-bg);stroke:var(--glass-border);stroke-width:1.5}
.hyd-root .hyd-indoor{fill:none;stroke:var(--glass-border);stroke-width:1.5;stroke-dasharray:6 6}
.hyd-root .hyd-lbl{fill:var(--text-secondary);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.hyd-root .hyd-lbl-plain{letter-spacing:.04em;text-transform:none}
.hyd-root .hyd-ttl{fill:var(--text-primary);font-size:15px;font-weight:600}
.hyd-root .hyd-val{fill:var(--text-primary);font-size:14px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.hyd-root .hyd-big{fill:var(--text-primary);font-size:34px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.hyd-root .hyd-tag rect{fill:var(--glass-bg);stroke:var(--glass-border)}
.hyd-root .hyd-tl{fill:var(--text-secondary);font-size:8.5px;letter-spacing:.06em;text-transform:uppercase}
.hyd-root .hyd-tv{fill:var(--text-primary);font-size:13px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.hyd-root .hyd-part{fill:var(--glass-bg);stroke:var(--hyd-dim);stroke-width:2}
.hyd-root .hyd-part-line{stroke:var(--text-secondary);stroke-width:3;stroke-linecap:round;fill:none}
.hyd-root .hyd-valve{fill:var(--hyd-dim)}
.hyd-root .hyd-v3{transition:fill .4s}
.hyd-root .hyd-fan-ring{fill:rgba(0,0,0,.25);stroke:var(--glass-border);stroke-width:2}
.hyd-root .hyd-blade{fill:var(--text-secondary);opacity:.7}
.hyd-root .hyd-hub{fill:var(--text-secondary)}
.hyd-root .hyd-sensor{fill:var(--text-primary)}
.hyd-root .hyd-bar-bg{fill:rgba(0,0,0,.25);stroke:var(--glass-border)}
.hyd-root .hyd-pipe{fill:none;stroke:var(--hyd-pipe);stroke-width:8;stroke-linecap:round;stroke-linejoin:round}
.hyd-root .hyd-glow{fill:none;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .5s}
.hyd-root .hyd-flow{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:.1 16;opacity:0;transition:opacity .5s}
.hyd-root .hyd-on .hyd-glow{opacity:calc(.28 * var(--share,1))}
.hyd-root .hyd-on .hyd-flow{opacity:var(--share,1);animation:hyd-flow var(--dur,.9s) linear infinite}
.hyd-root .hyd-defrost .hyd-ref .hyd-flow{animation-direction:reverse}
@keyframes hyd-flow{to{stroke-dashoffset:-16.1}}
.hyd-root .hyd-spin{transform-box:fill-box;transform-origin:center;animation:hyd-rot 1s linear infinite;animation-play-state:paused}
.hyd-root .hyd-spin.hyd-go{animation-play-state:running}
@keyframes hyd-rot{to{transform:rotate(360deg)}}
.hyd-root .hyd-frost{fill:var(--hyd-ice);opacity:0;transition:opacity .5s}
.hyd-root .hyd-defrost .hyd-frost{animation:hyd-frost 2.4s ease-in-out infinite}
@keyframes hyd-frost{0%,100%{opacity:.55}50%{opacity:.15}}
.hyd-root .hyd-defrost-badge{opacity:0;transition:opacity .5s}
.hyd-root .hyd-defrost .hyd-defrost-badge{opacity:1}
.hyd-root .hyd-defrost-badge rect{fill:var(--glass-bg);stroke:var(--hyd-ice);stroke-width:1.5}
.hyd-root .hyd-defrost-badge text{fill:var(--hyd-ice);font-size:11px;font-weight:600;letter-spacing:.1em}
.hyd-root .hyd-buh-rod{fill:none;stroke:var(--hyd-dim);stroke-width:3;stroke-linejoin:round;stroke-linecap:round;transition:stroke .4s}
.hyd-root .hyd-buh-on .hyd-buh-rod{stroke:var(--hyd-warn);filter:drop-shadow(0 0 6px var(--hyd-warn));animation:hyd-glow 1.1s ease-in-out infinite alternate}
@keyframes hyd-glow{from{opacity:.65}to{opacity:1}}
.hyd-root .hyd-buh-heat{opacity:0;transition:opacity .4s}
.hyd-root .hyd-buh-on .hyd-buh-heat{opacity:1}
.hyd-root .hyd-heat{fill:none;stroke:var(--hyd-warn);stroke-width:1.5;stroke-linecap:round;animation:hyd-rise 1.8s ease-in infinite}
@keyframes hyd-rise{from{transform:translateY(0);opacity:0}30%{opacity:.85}to{transform:translateY(-38px);opacity:0}}
@media (prefers-reduced-motion:reduce){.hyd-root .hyd-on .hyd-flow,.hyd-root .hyd-spin,.hyd-root .hyd-heat{animation:none}}
`;

export default memo(HydraulikPage);
