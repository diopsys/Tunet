import { memo } from 'react';
import { Flame, Thermometer, Activity, Settings } from '../../icons';
import { getIconComponent } from '../../icons';

/*
 * Heizungs-Übersicht, vollständig über die Kartenoptionen belegt (settings.heizung):
 *
 * {
 *   url: '/heizung',                       // Tippen öffnet diese HA-Seite (optional)
 *   erzeuger: [{
 *     name, icon?,                         // z. B. 'mdi:fireplace'
 *     stufen: [{ entity, label, above?, min?, passive? }],  // erste zutreffende Stufe = Zustand
 *     tempEntity?, tempAlways?,            // Temperatur nur im Betrieb bzw. immer
 *   }],
 *   speicher: [{ name, entity }],          // z. B. Puffer oben / unten
 *   pumpen:   [{ name, entity, above?, min? }],   // laufend = an bzw. Wert über Schwelle
 *   modi:     [{ name, entity, invert? }], // Betriebsarten (Anzeige), invert: aus = aktiv
 * }
 *
 * Eine Stufe trifft zu, wenn die Entität „on“ ist oder ihr Zahlenwert über
 * `above` (>) bzw. ab `min` (≥) liegt. `passive` zeigt den Zustand, ohne den
 * Erzeuger als „in Betrieb“ zu markieren (z. B. Kessel-Freigabe).
 */

const num = (entity) => {
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

const isUnavailable = (entity) => !entity || entity.state === 'unavailable' || entity.state === 'unknown';

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

const formatTemp = (entity) => {
  const v = num(entity);
  return v == null ? '–' : `${v.toFixed(1).replace('.', ',')} °C`;
};

export function resolveHeizungConfig(settings) {
  const h = settings?.heizung && typeof settings.heizung === 'object' ? settings.heizung : {};
  const list = (value) => (Array.isArray(value) ? value.filter((e) => e && (e.entity || e.stufen)) : []);
  return {
    url: typeof h.url === 'string' && h.url.trim() ? h.url.trim() : null,
    erzeuger: list(h.erzeuger),
    speicher: list(h.speicher),
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

const SectionLabel = ({ children }) => (
  <p className="mb-2 text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)] opacity-50">
    {children}
  </p>
);

const ErzeugerRow = memo(({ item, entities }) => {
  const status = erzeugerStatus(item, entities);
  const Icon = item.icon ? getIconComponent(item.icon, Flame) : Flame;
  const temp = item.tempEntity ? entities[item.tempEntity] : null;
  const showTemp = temp && (status.active || item.tempAlways);
  const iconStyle = status.active
    ? { backgroundColor: 'rgba(251,146,60,0.14)', color: '#fb923c' }
    : status.passive
      ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
      : { backgroundColor: 'var(--glass-bg-hover)', color: 'var(--text-muted)' };
  const stateCls = status.active
    ? 'text-orange-400'
    : status.passive
      ? 'text-blue-400'
      : status.unavailable
        ? 'text-red-400'
        : 'text-[var(--text-muted)] opacity-60';

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={iconStyle}>
        <Icon className={`h-3.5 w-3.5 stroke-[1.5px] ${status.active ? 'animate-pulse' : ''}`} />
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">{item.name}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {showTemp && <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{formatTemp(temp)}</span>}
        <span className={`text-[10px] font-bold ${stateCls}`}>{status.label}</span>
      </div>
    </div>
  );
});

const SpeicherRow = memo(({ item, entities }) => (
  <div className="flex items-center gap-2 w-full">
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
      <Thermometer className="h-3.5 w-3.5 stroke-[1.5px]" />
    </div>
    <span className="text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate text-left">{item.name}</span>
    <span className="text-[10px] font-semibold text-[var(--text-secondary)] flex-shrink-0">{formatTemp(entities[item.entity])}</span>
  </div>
));

const Chip = ({ label, on }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? 'text-green-400' : 'text-[var(--text-muted)] opacity-60'}`}
    style={{ backgroundColor: on ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg-hover)' }}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
    {label}
  </span>
);

const HeizungPanelCard = ({ cardId, dragProps, controls, cardStyle, editMode, entities, settings, isMobile }) => {
  const config = resolveHeizungConfig(settings);
  const layoutStyle = cardStyle ? {
    transform: cardStyle.transform,
    opacity: cardStyle.opacity,
    zIndex: cardStyle.zIndex,
    pointerEvents: cardStyle.pointerEvents,
    transition: cardStyle.transition,
  } : {};

  const laufend = config.pumpen.filter((p) => isActive(entities[p.entity], p));
  const sections = [];
  if (config.erzeuger.length > 0) {
    sections.push(['erzeuger', 'Wärmeerzeuger', config.erzeuger.map((item) => (
      <ErzeugerRow key={item.name} item={item} entities={entities} />
    ))]);
  }
  if (config.speicher.length > 0) {
    sections.push(['speicher', 'Speicher', config.speicher.map((item) => (
      <SpeicherRow key={item.name} item={item} entities={entities} />
    ))]);
  }
  if (config.pumpen.length > 0) {
    sections.push(['pumpen', 'Pumpen', [
      <div key="chips" className="flex flex-wrap gap-1.5">
        {laufend.length > 0
          ? laufend.map((p) => <Chip key={p.name} label={p.name} on />)
          : <span className="text-[10px] font-semibold text-[var(--text-muted)] opacity-60">Keine aktiv</span>}
      </div>,
    ]]);
  }
  if (config.modi.length > 0) {
    sections.push(['modi', 'Betriebsarten', [
      <div key="chips" className="flex flex-wrap gap-1.5">
        {config.modi.map((m) => {
          const entity = entities[m.entity];
          const on = isUnavailable(entity) ? false : (entity.state === 'on') !== !!m.invert;
          return <Chip key={m.name} label={m.name} on={on} />;
        })}
      </div>,
    ]]);
  }

  const open = !editMode && config.url ? () => openHaPath(config.url) : undefined;
  const p = isMobile ? 'px-3 py-3' : 'px-4 py-3';

  return (
    <div key={cardId} {...dragProps} className={`relative font-sans select-none ${editMode ? 'cursor-move' : ''}`} style={layoutStyle}>
      {controls}
      <div
        className={`glass-texture rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] overflow-hidden ${open ? 'cursor-pointer active:scale-[0.995] transition-transform' : ''}`}
        {...(open ? {
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Heizung öffnen',
          'data-haptic': 'card',
          onClick: open,
          onKeyDown: (e) => e.key === 'Enter' && open(),
        } : {})}
      >
        {sections.length === 0 ? (
          <div className={`${p} flex items-center gap-2 text-xs text-[var(--text-muted)]`}>
            <Settings className="h-4 w-4" /> Heizung: keine Entitäten eingestellt
          </div>
        ) : isMobile ? (
          <div className="grid grid-cols-2">
            {sections.map(([key, label, content], i) => (
              <div key={key}
                className={`${p} flex flex-col gap-2 border-[var(--glass-border)] ${i % 2 === 0 ? 'border-r' : ''} ${i < sections.length - 2 ? 'border-b' : ''}`}>
                <SectionLabel>{label}</SectionLabel>
                {content}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-stretch">
            {sections.map(([key, label, content], i) => (
              <div key={key}
                className={`${p} flex flex-col gap-2 ${i === sections.length - 1 ? 'flex-1' : 'border-r border-[var(--glass-border)]'}`}
                style={{ minWidth: 180, flex: key === 'erzeuger' ? 1.4 : 1 }}>
                <SectionLabel>{label}</SectionLabel>
                {content}
              </div>
            ))}
          </div>
        )}
        {open && (
          <div className="pointer-events-none absolute right-3 top-2 opacity-40">
            <Activity className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(HeizungPanelCard);
