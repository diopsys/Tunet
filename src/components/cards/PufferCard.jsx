import { memo, useEffect, useId, useMemo, useState } from 'react';
import { getHistory, getStatistics } from '../../services';
import { AlertTriangle } from '../../icons';
import { formatTemp, isActive, num, openProps } from './HeizungCard';

/*
 * Puffer-Kachel (settings.puffer):
 * {
 *   name?: 'Puffer',
 *   schichten: [s1, s2, s3, s4],   // Temperaturen von oben nach unten (Energieinhalt)
 *   oben?, unten?,                 // Verlauf und Anzeige; Standard: erste/letzte Schicht
 *   liter: 749, bezug: 30, voll: 90,   // Energie über „bezug“, 100 % bei „voll“
 *   stunden?: 24, url?: '/heizung?tab=anlage',
 *   zustaende?: [{ name, entity }],   // z. B. Notkühlung: roter Hinweis, solange an
 * }
 */

const WH_JE_LITER_K = 1.163;
const REFRESH_MS = 5 * 60 * 1000;

/** Energieinhalt in kWh über der Bezugstemperatur; gleich große Schichten. */
export function pufferKwh(temps, liter, bezug) {
  if (!temps.length || temps.some((t) => t == null) || !(liter > 0)) return null;
  const l = liter / temps.length;
  return temps.reduce((sum, t) => sum + (l * WH_JE_LITER_K * Math.max(0, t - bezug)) / 1000, 0);
}

export function resolvePufferConfig(settings) {
  const p = settings?.puffer && typeof settings.puffer === 'object' ? settings.puffer : {};
  const schichten = Array.isArray(p.schichten) ? p.schichten.filter(Boolean) : [];
  const zahl = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    name: p.name || 'Puffer',
    schichten,
    oben: p.oben || schichten[0] || null,
    unten: p.unten || schichten[schichten.length - 1] || null,
    liter: zahl(p.liter, 0),
    bezug: zahl(p.bezug, 30),
    voll: zahl(p.voll, 90),
    stunden: zahl(p.stunden, 24),
    url: typeof p.url === 'string' && p.url.trim() ? p.url.trim() : null,
    zustaende: Array.isArray(p.zustaende) ? p.zustaende.filter((z) => z && z.entity) : [],
  };
}

/** Verlauf als [{t: ms, v: Zahl}] – 5-Minuten-Statistik, sonst Zustandsverlauf. */
async function ladeVerlauf(conn, entityId, stunden) {
  const end = new Date();
  const start = new Date(end.getTime() - stunden * 3600 * 1000);
  const stats = await getStatistics(conn, { start, end, statisticId: entityId, period: '5minute' });
  if (Array.isArray(stats) && stats.length > 1) {
    return stats
      .map((s) => ({ t: new Date(s.start).getTime(), v: Number(s.mean ?? s.state) }))
      .filter((p) => Number.isFinite(p.v));
  }
  const hist = await getHistory(conn, { start, end, entityId, minimal_response: true, no_attributes: true });
  return hist
    .map((h) => ({ t: new Date(h.last_updated ?? h.lu * 1000).getTime(), v: Number.parseFloat(h.state ?? h.s) }))
    .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t));
}

function usePufferVerlauf(conn, ids, stunden) {
  const [verlauf, setVerlauf] = useState({});
  const key = ids.join('|');
  useEffect(() => {
    if (!conn || !key) return undefined;
    let aus = false;
    const laden = () => {
      key.split('|').forEach((id) => {
        ladeVerlauf(conn, id, stunden)
          .then((punkte) => { if (!aus) setVerlauf((prev) => ({ ...prev, [id]: punkte })); })
          .catch(() => {});
      });
    };
    laden();
    const timer = setInterval(laden, REFRESH_MS);
    return () => { aus = true; clearInterval(timer); };
  }, [conn, key, stunden]);
  return verlauf;
}

/** Zwei Linien (oben/unten) mit Fläche unter der oberen, Stil wie die Wetterkurve. */
export const PufferGraph = memo(function PufferGraph({ reihen, stunden }) {
  const id = useId().replace(/:/g, '');
  const W = 300;
  const H = 90;
  const bis = Date.now();
  const von = bis - stunden * 3600 * 1000;
  const gefiltert = reihen.map((r) => ({ ...r, punkte: (r.punkte || []).filter((p) => p.t >= von) }));
  const alle = gefiltert.flatMap((r) => r.punkte.map((p) => p.v));
  if (alle.length < 2) {
    return <div className="flex h-full items-center justify-center text-[10px] text-[var(--text-muted)] opacity-60">Verlauf wird geladen …</div>;
  }
  const min = Math.floor(Math.min(...alle) - 2);
  const max = Math.ceil(Math.max(...alle) + 2);
  const x = (t) => ((t - von) / (bis - von)) * W;
  const y = (v) => H - ((v - min) / (max - min || 1)) * (H - 12) - 6;
  const pfad = (punkte) => punkte.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        {gefiltert.map((r, i) => (
          <linearGradient key={i} id={`${id}-f${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={r.farbe} stopOpacity="0.28" />
            <stop offset="100%" stopColor={r.farbe} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {gefiltert.map((r, i) => r.punkte.length > 1 && (
        <g key={i}>
          {r.flaeche && (
            <path d={`${pfad(r.punkte)} L${x(r.punkte.at(-1).t).toFixed(1)},${H} L${x(r.punkte[0].t).toFixed(1)},${H} Z`} fill={`url(#${id}-f${i})`} />
          )}
          <path d={pfad(r.punkte)} fill="none" stroke={r.farbe} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
});

const PufferCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, conn, settings, name }) => {
  const config = resolvePufferConfig(settings);
  const temps = config.schichten.map((sid) => num(entities[sid]));
  const kwh = pufferKwh(temps, config.liter, config.bezug);
  const maxKwh = config.liter > 0 ? (config.liter * WH_JE_LITER_K * (config.voll - config.bezug)) / 1000 : null;
  const prozent = kwh != null && maxKwh ? Math.min(100, Math.round((kwh / maxKwh) * 100)) : null;

  const ids = useMemo(() => [config.oben, config.unten].filter(Boolean), [config.oben, config.unten]);
  const verlauf = usePufferVerlauf(conn, ids, config.stunden);
  const reihen = [
    { punkte: verlauf[config.oben], farbe: '#fb923c', flaeche: true },
    config.unten !== config.oben && { punkte: verlauf[config.unten], farbe: '#60a5fa', flaeche: false },
  ].filter(Boolean);

  const titel = name || config.name;
  const aktiv = config.zustaende.filter((z) => isActive(entities[z.entity]));
  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback relative flex h-full flex-col overflow-hidden rounded-3xl border p-3.5 font-sans select-none ${editMode ? 'cursor-move' : config.url ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      style={cardStyle}
      {...openProps(config.url, editMode, `${titel} öffnen`)}
    >
      {controls}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{titel}</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-light leading-none text-[var(--text-primary)]">
            {kwh == null ? '–' : kwh.toFixed(1).replace('.', ',')}
            <span className="ml-1 text-[11px] text-[var(--text-secondary)]">kWh</span>
            {prozent != null && <span className="ml-1.5 text-[11px] font-semibold text-[var(--text-muted)]">{prozent} %</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-[10px] text-[var(--text-secondary)]">
          {config.oben && (
            <span className="flex items-center gap-1 whitespace-nowrap" title="oben">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#fb923c' }} />
              <b className="font-semibold text-[var(--text-primary)]">{formatTemp(entities[config.oben])}</b>
            </span>
          )}
          {config.unten && config.unten !== config.oben && (
            <span className="flex items-center gap-1 whitespace-nowrap" title="unten">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#60a5fa' }} />
              <b className="font-semibold text-[var(--text-primary)]">{formatTemp(entities[config.unten])}</b>
            </span>
          )}
        </div>
      </div>
      {aktiv.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 self-start rounded-lg px-2 py-0.5 text-[10px] font-bold text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.14)' }}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 animate-pulse" />
          <span className="truncate">{aktiv.map((z) => z.name).join(', ')} aktiv</span>
        </div>
      )}
      {/* Verlauf bis an die Kachelränder wie bei der Wetter-Kachel (Ecken schneidet overflow-hidden ab) */}
      <div className="-mx-3.5 -mb-3.5 mt-2 min-h-0 flex-1" title={`Verlauf der letzten ${config.stunden} h`}>
        <PufferGraph reihen={reihen} stunden={config.stunden} />
      </div>
    </div>
  );
};

export default memo(PufferCard);
