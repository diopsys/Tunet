import { memo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from '../../icons';
import { getSettings } from '../helpers';

const LABEL_DE = {
  person: 'Person',
  car: 'Auto',
  dog: 'Hund',
  cat: 'Katze',
  bicycle: 'Fahrrad',
  motorcycle: 'Motorrad',
  truck: 'LKW',
  bird: 'Vogel',
  deer: 'Reh',
  package: 'Paket',
};

const LABEL_COLOR = {
  person: '#60a5fa',
  car: '#f59e0b',
  dog: '#a78bfa',
  cat: '#f472b6',
  bicycle: '#34d399',
  motorcycle: '#fb923c',
  truck: '#facc15',
};

function relativeTime(ts) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'Jetzt';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)}h`;
  return `vor ${Math.floor(diff / 86400)}d`;
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const DEFAULT_FRIGATE_URL = 'http://192.168.50.140:5000';

function FrigateClipModal({ event, proxyUrl, onClose }) {
  const [clipBlobUrl, setClipBlobUrl] = useState(null);
  const [clipLoading, setClipLoading] = useState(!!event.has_clip);
  const [clipError, setClipError] = useState(false);
  const labelDe = LABEL_DE[event.label] || event.label;
  const color = LABEL_COLOR[event.label] || '#94a3b8';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!event.has_clip) return;
    let blobUrl = null;
    const controller = new AbortController();
    fetch(proxyUrl(`/api/events/${event.id}/clip.mp4`), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob);
        setClipBlobUrl(blobUrl);
        setClipLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setClipError(true);
          setClipLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [event.id, event.has_clip, proxyUrl]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--glass-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase text-white" style={{ backgroundColor: color }}>
              {labelDe}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{event.camera}</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {formatDate(event.start_time)} · {formatTime(event.start_time)}
                {event.end_time && ` – ${formatTime(event.end_time)}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Media */}
        <div className="bg-black">
          {event.has_clip && !clipError ? (
            clipLoading ? (
              <div className="flex items-center justify-center" style={{ height: '40vh' }}>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent opacity-60" />
              </div>
            ) : (
              <video
                key={clipBlobUrl}
                src={clipBlobUrl}
                controls
                autoPlay
                playsInline
                className="w-full"
                style={{ maxHeight: '70vh' }}
                onError={() => setClipError(true)}
              />
            )
          ) : (
            <img
              src={proxyUrl(`/api/events/${event.id}/snapshot.jpg`)}
              alt={labelDe}
              className="w-full object-contain"
              style={{ maxHeight: '70vh' }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const FrigateEventsCard = memo(function FrigateEventsCard({
  dragProps,
  controls,
  cardStyle,
  editMode,
  settings,
}) {
  const frigateUrl = (settings?.frigateUrl || DEFAULT_FRIGATE_URL).replace(/\/$/, '');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const proxyUrl = useCallback(
    (path) => `./api/go2rtc-proxy?url=${encodeURIComponent(`${frigateUrl}${path}`)}`,
    [frigateUrl]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(proxyUrl('/api/events?limit=20&has_snapshot=1'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setEvents(Array.isArray(data) ? data : []);
          setError(false);
        }
      } catch (_e) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [proxyUrl]);

  const handleEventClick = (e, event) => {
    e.stopPropagation();
    if (!editMode) setSelectedEvent(event);
  };

  return (
    <>
      <div
        {...dragProps}
        className={`glass-texture relative flex h-full flex-col overflow-hidden rounded-3xl border font-sans transition-all duration-300 ${editMode ? 'cursor-move' : ''}`}
        style={{ ...cardStyle, backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', padding: '12px 14px' }}
      >
        {controls}

        {/* Header */}
        <div className="mb-2 flex flex-shrink-0 items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-[var(--text-secondary)] opacity-60" />
            <span className="text-[9px] font-bold tracking-[0.18em] text-[var(--text-secondary)] uppercase opacity-60">
              Frigate Ereignisse
            </span>
          </div>
          {loading && (
            <div className="h-3 w-3 animate-spin rounded-full border border-[var(--text-muted)] border-t-transparent opacity-40" />
          )}
          {error && !loading && (
            <span className="text-[9px] text-[var(--status-error-fg)] opacity-70">Offline</span>
          )}
        </div>

        {/* Events strip */}
        <div
          className="flex flex-1 items-stretch gap-2 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {!loading && events.length === 0 && (
            <p className="self-center text-[11px] text-[var(--text-muted)] opacity-50">
              {error ? 'Frigate nicht erreichbar' : 'Keine Ereignisse'}
            </p>
          )}
          {events.map((event) => {
            const color = LABEL_COLOR[event.label] || '#94a3b8';
            const labelDe = LABEL_DE[event.label] || event.label;
            return (
              <button
                key={event.id}
                className={`flex w-28 flex-shrink-0 flex-col gap-1 text-left ${!editMode ? 'cursor-pointer' : 'cursor-move'}`}
                onClick={(e) => handleEventClick(e, event)}
              >
                <div className="relative flex-1 overflow-hidden rounded-xl bg-[var(--glass-bg)] transition-transform active:scale-95">
                  <img
                    src={proxyUrl(`/api/events/${event.id}/thumbnail.jpg`)}
                    alt={labelDe}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {/* Play icon overlay if clip available */}
                  {event.has_clip && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
                      <div className="rounded-full bg-black/60 p-2">
                        <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  )}
                  {/* Label chip */}
                  <div
                    className="absolute bottom-1 left-1 rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase leading-none text-white"
                    style={{ backgroundColor: `${color}dd` }}
                  >
                    {labelDe}
                  </div>
                  {/* Score */}
                  {event.top_score != null && (
                    <div className="absolute top-1 right-1 rounded-full bg-black/50 px-1 py-[2px] text-[8px] font-bold text-white leading-none">
                      {Math.round(event.top_score * 100)}%
                    </div>
                  )}
                </div>
                <div style={{ width: 112 }}>
                  <p className="truncate text-[9px] font-medium leading-none text-[var(--text-secondary)]">
                    {event.camera}
                  </p>
                  <p className="text-[9px] leading-none text-[var(--text-muted)] opacity-60">
                    {relativeTime(event.start_time)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <FrigateClipModal
          event={selectedEvent}
          proxyUrl={proxyUrl}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
});

export function renderFrigateEventsCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { editMode, cardSettings } = ctx;
  const settings = getSettings(cardSettings, settingsKey, cardId);
  return (
    <FrigateEventsCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      settings={settings}
    />
  );
}
