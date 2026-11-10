import { Calendar, Plus } from '../../icons';
import DeleteEventButton from './DeleteEventButton';

const MAX_TAGE = 30;
const pad = (n) => String(n).padStart(2, '0');
export const tagSchluessel = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ausSchluessel = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Tage, an denen ein Termin angezeigt wird: ganztägige (auch mehrtägige) an jedem Tag bis
 * vor das Ende, Termine mit Uhrzeit am Tag ihres Beginns.
 */
export function termintage(event, isAllDay) {
  if (isAllDay(event)) {
    const start = ausSchluessel(event.start);
    const ende =
      typeof event.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.end)
        ? ausSchluessel(event.end)
        : null;
    const tage = [tagSchluessel(start)];
    if (!ende) return tage;
    const d = new Date(start);
    d.setDate(d.getDate() + 1);
    while (d < ende && tage.length < MAX_TAGE) {
      tage.push(tagSchluessel(d));
      d.setDate(d.getDate() + 1);
    }
    return tage;
  }
  const start = new Date(event.start);
  return Number.isNaN(start.getTime()) ? [] : [tagSchluessel(start)];
}

/**
 * Tage als Zeilen, je Person (Kalender) eine Spalte. Angezeigt werden heute und alle Tage mit
 * Terminen; „+“ im Kopf oder in einer Zelle trägt für diese Person (und diesen Tag) ein.
 */
export default function PersonenAnsicht({
  persons,
  events,
  loading,
  locale,
  translate,
  canDelete,
  isAllDay,
  isPast,
  onAdd,
  deleteState,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const heuteKey = tagSchluessel(heute);
  const morgen = new Date(heute);
  morgen.setDate(morgen.getDate() + 1);
  const morgenKey = tagSchluessel(morgen);

  // { Tag: { Kalender: [Termine] } }
  const nachTag = {};
  persons.forEach((person) => {
    (events?.[person.id]?.events || []).forEach((event) => {
      termintage(event, isAllDay).forEach((tag) => {
        if (tag < heuteKey) return;
        nachTag[tag] ??= {};
        (nachTag[tag][person.id] ??= []).push({ ...event, calendarId: person.id });
      });
    });
  });
  nachTag[heuteKey] ??= {};
  const tage = Object.keys(nachTag).sort();

  const tagTitel = (key) => {
    const datum = ausSchluessel(key).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    if (key === heuteKey) return `${translate('calendar.today')} · ${datum}`;
    if (key === morgenKey) return `${translate('calendar.tomorrow')} · ${datum}`;
    return datum;
  };

  const sortiert = (liste) =>
    [...liste].sort((a, b) => {
      const ga = isAllDay(a) ? 0 : 1;
      const gb = isAllDay(b) ? 0 : 1;
      if (ga !== gb) return ga - gb;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

  const spalten = { gridTemplateColumns: `repeat(${persons.length}, minmax(0, 1fr))` };

  return (
    <div data-testid="calendar-people-view">
      {/* Kopf: eine Spalte je Person */}
      <div
        className="sticky top-0 z-10 grid gap-2 bg-[var(--modal-bg)] pb-3 sm:gap-3"
        style={spalten}
      >
        {persons.map((person) => (
          <div
            key={person.id}
            className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-2 sm:px-3"
          >
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: person.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
              {person.name}
            </span>
            {person.writable && (
              <button
                type="button"
                onClick={() => onAdd(person.id, heuteKey)}
                aria-label={translate('calendar.addFor').replace('{name}', person.name)}
                className="flex-shrink-0 rounded-full p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm tracking-widest text-[var(--text-secondary)] uppercase">
            {translate('common.loading')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tage.map((tag) => (
            <div key={tag}>
              <h4 className="mb-2 text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-60">
                {tagTitel(tag)}
              </h4>
              <div className="grid gap-2 sm:gap-3" style={spalten}>
                {persons.map((person) => {
                  const liste = sortiert(nachTag[tag]?.[person.id] || []);
                  return (
                    <div
                      key={person.id}
                      className="flex min-h-[3rem] min-w-0 flex-col gap-1.5 rounded-2xl border border-[var(--glass-border)] p-1.5 sm:p-2"
                      style={{ borderLeft: `3px solid ${person.color}` }}
                    >
                      {liste.map((event, idx) => {
                        const eventKey = `${event.calendarId}|${event.start}|${event.summary}`;
                        const past = isPast(event);
                        return (
                          <div
                            key={`${eventKey}-${idx}`}
                            data-past-event={past ? 'true' : 'false'}
                            className={`flex min-w-0 items-start gap-1 rounded-xl bg-[var(--glass-bg)] px-2 py-1.5 ${past ? 'opacity-40 saturate-50' : ''}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold tracking-wider text-[var(--text-secondary)] uppercase tabular-nums">
                                {isAllDay(event)
                                  ? translate('calendar.allDay')
                                  : new Date(event.start).toLocaleTimeString(locale, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                              </p>
                              <p className="text-sm leading-snug font-medium break-words text-[var(--text-primary)]">
                                {event.summary}
                              </p>
                              {event.location && (
                                <p className="truncate text-[11px] text-[var(--text-secondary)] opacity-70">
                                  📍 {event.location}
                                </p>
                              )}
                              {deleteState.deleteError === eventKey && (
                                <p className="text-[11px] font-medium text-[var(--status-error-fg)]">
                                  {translate('calendar.deleteFailed')}
                                </p>
                              )}
                            </div>
                            {canDelete(event.calendarId) && (
                              <DeleteEventButton
                                compact
                                confirming={deleteState.confirmDeleteKey === eventKey}
                                series={deleteState.seriesDeleteKey === eventKey}
                                deleting={deleteState.deletingKey === eventKey}
                                onRequest={() => onRequestDelete(eventKey)}
                                onConfirm={() => onConfirmDelete(event, eventKey)}
                                onCancel={onCancelDelete}
                                translate={translate}
                              />
                            )}
                          </div>
                        );
                      })}
                      {person.writable && (
                        <button
                          type="button"
                          onClick={() => onAdd(person.id, tag)}
                          aria-label={translate('calendar.addFor').replace('{name}', person.name)}
                          className={`flex items-center justify-center rounded-xl text-[var(--text-muted)] opacity-40 transition-opacity hover:bg-[var(--glass-bg-hover)] hover:opacity-100 ${liste.length ? 'py-0.5' : 'flex-1 py-2'}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {tage.length === 1 && Object.keys(nachTag[heuteKey]).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="mb-4 h-12 w-12 text-[var(--text-muted)] opacity-30" />
              <p className="text-sm tracking-widest text-[var(--text-secondary)] uppercase">
                {translate('calendar.noEvents')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
