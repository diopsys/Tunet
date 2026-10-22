import { memo } from 'react';
import { Flame, Settings, AlertTriangle } from '../../icons';
import { getIconComponent } from '../../icons';

/*
 * Heizungs-Kachel, vollständig über die Kartenoptionen belegt (settings.heizung):
 *
 * {
 *   url: '/heizung?tab=anlage',            // Tippen öffnet diese HA-Seite (optional)
 *   erzeuger: [{
 *     name, icon?,
 *     stufen: [{ entity, label, above?, min?, passive? }],  // erste zutreffende Stufe = Zustand
 *     tempEntity?, tempAlways?,            // Temperatur nur im Betrieb bzw. immer
 *   }],
 *   zustaende: [{ name, entity, warn? }],  // z. B. Notkühlung; warn = rot, solange an
 *   ventile: { name?, entities: [...] },   // Anzahl offener Ventile (Wert > 0 bzw. „on“)
 *   pumpen:   [{ name, entity, above?, min? }],   // laufend = an bzw. Wert über Schwelle
 *   modi:     [{ name, entity, invert? }], // Betriebsarten (Anzeige), invert: aus = aktiv
 * }
 *
 * Eine Stufe trifft zu, wenn die Entität „on“ ist oder ihr Zahlenwert über
 * `above` (>) bzw. ab `min` (≥) liegt. `passive` zeigt den Zustand, ohne den
 * Erzeuger als „in Betrieb“ zu markieren (z. B. Kessel-Freigabe).
 */

export const num = (entity) => {
  const v = Number.parseFloat(entity?.state);
  return Number.isFinite(v) ? v : null;
};

export function isActive(entity, { above, min } = {}) {
  if (!entity) return false;
  if (above != null || min != null) {
    const v = num(entity);
    if (v == null) return false;
    if (above != null && !(v > above)) return false;
    if (min != null && !(v >= min)) return false;
    return true;
  }
  return entity.state === 'on';
}

export const isUnavailable = (entity) => !entity || entity.state === 'unavailable' || entity.state === 'unknown';

/** Zustand eines Erzeugers: erste zutreffende Stufe oder „aus“. */
export function erzeugerStatus(item, entities) {
  const stufen = Array.isArray(item?.stufen) ? item.stufen : [];
  for (const stufe of stufen) {
    if (isActive(entities[stufe.entity], stufe)) {
      return { label: stufe.label || 'an', active: !stufe.passive, passive: !!stufe.passive };
    }
  }
  const unavailable = stufen.length > 0 && stufen.every((s) => isUnavailable(entities[s.entity]));
  return { label: unavailable ? '⚠' : 'aus', active: false, passive: false, unavailable };
}

/** Offene Ventile: Zahlenwert > 0 oder „on“; nicht erreichbare zählen nicht mit. */
export function ventileStatus(ventile, entities) {
  const ids = Array.isArray(ventile?.entities) ? ventile.entities : [];
  const bekannt = ids.filter((id) => !isUnavailable(entities[id]));
  const offen = bekannt.filter((id) => {
    const e = entities[id];
    const v = num(e);
    return v != null ? v > 0 : e.state === 'on';
  });
  return { offen: offen.length, bekannt: bekannt.length, gesamt: ids.length };
}

export const formatTemp = (entity) => {
  const v = num(entity);
  return v == null ? '–' : `${v.toFixed(1).replace('.', ',')} °C`;
};

export function resolveHeizungConfig(settings) {
  const h = settings?.heizung && typeof settings.heizung === 'object' ? settings.heizung : {};
  const list = (value) => (Array.isArray(value) ? value.filter((e) => e && (e.entity || e.stufen)) : []);
  const ventile = h.ventile && Array.isArray(h.ventile.entities) && h.ventile.entities.length > 0 ? h.ventile : null;
  return {
    url: typeof h.url === 'string' && h.url.trim() ? h.url.trim() : null,
    erzeuger: list(h.erzeuger),
    zustaende: list(h.zustaende),
    ventile,
    pumpen: list(h.pumpen),
    modi: list(h.modi),
  };
}

/** Öffnet eine HA-Seite; im HA-Rahmen (Ingress) ohne Neuladen über das Elternfenster. */
export function openHaPath(url) {
  if (!url) return;
  const win = globalThis.window;
  if (!win) return;
  if (/^https?:\/\//i.test(url)) {
    win.open(url, '_blank', 'noopener');
    return;
  }
  try {
    const top = win.top;
    if (top && top !== win && top.history) {
      top.history.pushState(null, '', url);
      top.dispatchEvent(new top.CustomEvent('location-changed', { detail: { replace: false } }));
      return;
    }
  } catch {
    // anderer Ursprung – normale Navigation
  }
  win.location.href = url;
}

/** Klick-Eigenschaften für eine Kachel, die eine HA-Seite öffnet. */
export function openProps(url, editMode, label) {
  if (editMode || !url) return {};
  const open = () => openHaPath(url);
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'data-haptic': 'card',
    onClick: open,
    onKeyDown: (e) => e.key === 'Enter' && open(),
  };
}

export const SectionLabel = ({ children }) => (
  <p className="mb-1.5 text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50">
    {children}
  </p>
);

const Row = ({ icon: Icon, iconStyle, pulse, name, value, valueCls }) => (
  <div className="flex items-center gap-2 w-full min-w-0">
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={iconStyle}>
      <Icon className={`h-3.5 w-3.5 stroke-[1.5px] ${pulse ? 'animate-pulse' : ''}`} />
    </div>
    <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">{name}</span>
    <span className={`text-[10px] font-bold flex-shrink-0 whitespace-nowrap ${valueCls}`}>{value}</span>
  </div>
);

const MUTED = { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' };

const ErzeugerRow = memo(({ item, entities }) => {
  const status = erzeugerStatus(item, entities);
  const Icon = item.icon ? getIconComponent(item.icon, Flame) : Flame;
  const temp = item.tempEntity ? entities[item.tempEntity] : null;
  const showTemp = temp && (status.active || item.tempAlways);
  const iconStyle = status.active
    ? { backgroundColor: 'rgba(251,146,60,0.14)', color: '#fb923c' }
    : status.passive ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' } : MUTED;
  const valueCls = status.active
    ? 'text-orange-400'
    : status.passive ? 'text-blue-400' : status.unavailable ? 'text-red-400' : 'text-[var(--text-muted)] opacity-60';
  return (
    <Row icon={Icon} iconStyle={iconStyle} pulse={status.active} name={item.name}
      value={<>{showTemp && <span className="mr-1.5 font-semibold text-[var(--text-secondary)]">{formatTemp(temp)}</span>}{status.label}</>}
      valueCls={valueCls} />
  );
});

const Chip = ({ label, on }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? 'text-green-400' : 'text-[var(--text-muted)] opacity-60'}`}
    style={{ backgroundColor: on ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg-hover)' }}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
    {label}
  </span>
);

const HeizungCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, settings, name }) => {
  const config = resolveHeizungConfig(settings);
  const laufend = config.pumpen.filter((p) => isActive(entities[p.entity], p));
  const ventile = config.ventile ? ventileStatus(config.ventile, entities) : null;
  const ValveIcon = getIconComponent('mdi:valve', Settings);
  const leer = config.erzeuger.length + config.pumpen.length + config.modi.length + config.zustaende.length === 0 && !ventile;

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border p-4 font-sans select-none ${editMode ? 'cursor-move' : config.url ? 'cursor-pointer active:scale-[0.99]' : ''}`}
      style={cardStyle}
      {...openProps(config.url, editMode, `${name || 'Heizung'} öffnen`)}
    >
      {controls}
      <div className="contents">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">{name || 'Heizung'}</p>
        {leer ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Settings className="h-4 w-4" /> Keine Entitäten eingestellt
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 overflow-hidden">
            <div className="flex min-w-0 flex-col gap-2">
              {config.erzeuger.length > 0 && <SectionLabel>Wärmeerzeuger</SectionLabel>}
              {config.erzeuger.map((item) => <ErzeugerRow key={item.name} item={item} entities={entities} />)}
              {config.zustaende.map((z) => {
                const on = isActive(entities[z.entity]);
                const warn = on && z.warn;
                return (
                  <Row key={z.name} icon={warn ? AlertTriangle : Settings} pulse={warn} name={z.name}
                    iconStyle={warn ? { backgroundColor: 'rgba(239,68,68,0.14)', color: '#ef4444' } : MUTED}
                    value={isUnavailable(entities[z.entity]) ? '⚠' : on ? 'aktiv' : 'aus'}
                    valueCls={warn ? 'text-red-400' : on ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-60'} />
                );
              })}
              {ventile && (
                <Row icon={ValveIcon} name={config.ventile.name || 'Ventile'}
                  iconStyle={ventile.offen > 0 ? { backgroundColor: 'rgba(251,146,60,0.14)', color: '#fb923c' } : MUTED}
                  value={`${ventile.offen} / ${ventile.bekannt} offen`}
                  valueCls={ventile.offen > 0 ? 'text-orange-400' : 'text-[var(--text-muted)] opacity-60'} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              {config.pumpen.length > 0 && (
                <div>
                  <SectionLabel>Pumpen</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {laufend.length > 0
                      ? laufend.map((p) => <Chip key={p.name} label={p.name} on />)
                      : <span className="text-[10px] font-semibold text-[var(--text-muted)] opacity-60">Keine aktiv</span>}
                  </div>
                </div>
              )}
              {config.modi.length > 0 && (
                <div>
                  <SectionLabel>Betriebsarten</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {config.modi.map((m) => {
                      const e = entities[m.entity];
                      const on = isUnavailable(e) ? false : (e.state === 'on') !== !!m.invert;
                      return <Chip key={m.name} label={m.name} on={on} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(HeizungCard);
