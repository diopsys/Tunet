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
 *   ventile: { name?, icon?, url?, entities: [...] },  // Anzahl offener Ventile (Wert > 0 bzw. „on“);
 *                                          // Symbol Standard Heizkörper, url = eigenes Ziel beim Tippen
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

const SectionLabel = ({ children }) => (
  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-50">{children}</p>
);

const MODUS_ICON = {
  warmwasser: 'mdi:water-boiler',
  heizkreis: 'mdi:heating-coil',
  'explorer-boost': 'mdi:rocket-launch-outline',
  boost: 'mdi:rocket-launch-outline',
  urlaub: 'mdi:palm-tree',
};

const ErzeugerZeile = memo(({ item, entities }) => {
  const status = erzeugerStatus(item, entities);
  const Icon = item.icon ? getIconComponent(item.icon, Flame) : Flame;
  const temp = item.tempEntity ? entities[item.tempEntity] : null;
  const showTemp = temp && (status.active || item.tempAlways);
  const farbe = status.active ? '#fb923c' : status.passive ? '#60a5fa' : 'var(--text-muted)';
  // Zustand neben der Temperatur nur, wenn er mehr sagt als „an“
  const zusatz = status.active && status.label !== 'an' ? status.label : null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 stroke-[1.5px] ${status.active ? 'animate-pulse' : ''}`} style={{ color: farbe }} />
      <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">{item.name}</span>
      <span className="flex-shrink-0 whitespace-nowrap text-[11px] font-semibold" style={{ color: showTemp ? 'var(--text-primary)' : farbe }}>
        {showTemp ? formatTemp(temp) : status.label}
      </span>
      {zusatz && <span className="flex-shrink-0 text-[9px] font-bold text-orange-400">{zusatz}</span>}
    </div>
  );
});

const PumpenZeile = ({ name, on }) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${on ? 'animate-pulse bg-green-400' : 'bg-gray-500 opacity-60'}`} />
    <span className={`truncate text-[11px] font-medium ${on ? 'text-green-400' : 'text-[var(--text-muted)] opacity-70'}`}>{name}</span>
  </div>
);

const PumpenKurz = ({ pumpen, entities }) => {
  const laufen = pumpen.filter((p) => isActive(entities[p.entity], p)).map((p) => p.name);
  return (
    <div className="flex min-w-0 items-center gap-1.5 @min-[15rem]:hidden">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${laufen.length ? 'animate-pulse bg-green-400' : 'bg-gray-500 opacity-60'}`} />
      <span className={`truncate text-[11px] font-medium ${laufen.length ? 'text-green-400' : 'text-[var(--text-muted)] opacity-70'}`}>
        Pumpen: {laufen.length ? laufen.join(', ') : 'aus'}
      </span>
    </div>
  );
};

const HeizungCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, settings, name }) => {
  const config = resolveHeizungConfig(settings);
  const ventile = config.ventile ? ventileStatus(config.ventile, entities) : null;
  const warnungen = config.zustaende.filter((z) => z.warn && isActive(entities[z.entity]));
  const VentilIcon = getIconComponent(config.ventile?.icon || 'mdi:radiator', Settings);
  const leer = config.erzeuger.length + config.pumpen.length + config.modi.length === 0 && !ventile;
  const titel = name || 'Heizung';

  return (
    <div
      key={cardId}
      {...dragProps}
      className={`glass-texture touch-feedback @container relative flex h-full flex-col gap-1.5 overflow-hidden rounded-3xl border p-3 font-sans @min-[15rem]:gap-2 @min-[15rem]:p-3.5 select-none ${editMode ? 'cursor-move' : config.url ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      style={cardStyle}
      {...openProps(config.url, editMode, `${titel} öffnen`)}
    >
      {controls}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{titel}</p>
        {ventile && (() => {
          const ventilUrl = !editMode && config.ventile.url ? config.ventile.url : null;
          const inhalt = (
            <>
              <VentilIcon className="h-3 w-3" />
              {ventile.offen}/{ventile.bekannt}
            </>
          );
          const cls = `flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold ${ventile.offen > 0 ? 'text-orange-400' : 'text-[var(--text-muted)]'}`;
          const titel = `${config.ventile.name || 'Ventile'}: ${ventile.offen} von ${ventile.bekannt} offen`;
          // Eigenes Ziel (z. B. Räume) – der Klick soll nicht zusätzlich die Kachel öffnen
          return ventilUrl ? (
            <button type="button" className={`${cls} -m-1 rounded-md p-1 hover:bg-[var(--glass-bg-hover)]`} title={titel}
              aria-label={`${config.ventile.name || 'Ventile'} öffnen`}
              onClick={(e) => { e.stopPropagation(); openHaPath(ventilUrl); }}
              onKeyDown={(e) => e.stopPropagation()}>
              {inhalt}
            </button>
          ) : (
            <span className={cls} title={titel}>{inhalt}</span>
          );
        })()}
      </div>

      {leer ? (
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Settings className="h-4 w-4" /> Keine Entitäten eingestellt
        </div>
      ) : (
        // Schmale Kachel (Handy): Erzeuger über die volle Breite, statt der Pumpenliste
        // eine Zeile mit den laufenden Pumpen
        <div className={`grid min-h-0 flex-1 items-center gap-3 grid-cols-1 ${config.pumpen.length > 0 ? '@min-[15rem]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-1 @min-[15rem]:gap-1.5">
            {config.erzeuger.map((item) => <ErzeugerZeile key={item.name} item={item} entities={entities} />)}
            {config.pumpen.length > 0 && <PumpenKurz pumpen={config.pumpen} entities={entities} />}
          </div>
          {config.pumpen.length > 0 && (
            <div className="hidden min-w-0 flex-col gap-1 @min-[15rem]:flex">
              <SectionLabel>Pumpen</SectionLabel>
              {config.pumpen.map((p) => <PumpenZeile key={p.name} name={p.name} on={isActive(entities[p.entity], p)} />)}
            </div>
          )}
        </div>
      )}

      {warnungen.length > 0 ? (
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.14)' }}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 animate-pulse" />
          <span className="truncate">{warnungen.map((w) => w.name).join(', ')} aktiv</span>
        </div>
      ) : config.modi.length > 0 && (
        <div className="flex items-center gap-1.5">
          {config.modi.map((m) => {
            const e = entities[m.entity];
            const on = isUnavailable(e) ? false : (e.state === 'on') !== !!m.invert;
            const Icon = getIconComponent(m.icon || MODUS_ICON[m.name.toLowerCase()] || 'mdi:toggle-switch-outline', Settings);
            return (
              <span key={m.name} title={`${m.name}: ${on ? 'an' : 'aus'}`} aria-label={`${m.name} ${on ? 'an' : 'aus'}`}
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={on ? { backgroundColor: 'rgba(34,197,94,0.14)', color: '#4ade80' } : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)', opacity: 0.6 }}>
                <Icon className="h-3 w-3" />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default memo(HeizungCard);
