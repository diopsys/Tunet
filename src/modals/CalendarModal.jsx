import { useState, useEffect } from 'react';
import { X, Calendar, Check, ChevronDown, ChevronUp, Plus, Trash2 } from '../icons';
import {
  callService,
  deleteCalendarEvent,
  getCalendarEvents,
  getCalendarEventsWithIds,
} from '../services';
import { getLocaleForLanguage } from '../i18n';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

/**
 * CalendarModal - Modal for displaying calendar with selectable calendars
 *
 * @param {Object} props
 * @param {boolean} props.show - Whether modal is visible
 * @param {(e?: any) => void} props.onClose - Function to close modal
 * @param {Object} props.conn - Home Assistant connection
 * @param {Object} props.entities - All HA entities
 * @param {string} [props.language] - Language code
 * @param {Function} props.t - Translation function
 */
export default function CalendarModal({ show, onClose, conn, entities, language, t }) {
  const translate = t || ((key) => key);
  const locale = getLocaleForLanguage(language);
  const modalTitleId = 'calendar-modal-title';

  // Get all calendar entities
  const allCalendars = Object.keys(entities || {})
    .filter((id) => id.startsWith('calendar.'))
    .map((id) => ({
      id,
      name: entities[id]?.attributes?.friendly_name || id,
      color: getCalendarColor(id),
    }));
  // Kalender, die Termine annehmen (CalendarEntityFeature.CREATE_EVENT)
  const writableCalendars = allCalendars.filter(
    (c) => (Number(entities[c.id]?.attributes?.supported_features) & 1) === 1
  );
  // … und solche, in denen man löschen darf (DELETE_EVENT)
  const canDelete = (calendarId) =>
    (Number(entities[calendarId]?.attributes?.supported_features) & 2) === 2;

  const [selectedCalendars, setSelectedCalendars] = useState(() => {
    const stored = localStorage.getItem('tunet_calendar_modal_selection');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return allCalendars.map((c) => c.id);
      }
    }
    return allCalendars.map((c) => c.id);
  });

  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (show) {
      setShowCalendarPicker(false);
      setShowAddForm(false);
      setConfirmDeleteKey(null);
      setDeleteError('');
    }
  }, [show]);

  // Fetch events for selected calendars
  useEffect(() => {
    if (!show || !conn || selectedCalendars.length === 0) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setDate(end.getDate() + 30);

        const result = await getCalendarEvents(conn, {
          start,
          end,
          entityIds: selectedCalendars,
        });

        setEvents(result || {});
      } catch (error) {
        console.error('Failed to fetch calendar events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [show, conn, selectedCalendars, reloadKey]);

  // Save selection to localStorage
  useEffect(() => {
    if (!show) return;
    try {
      localStorage.setItem('tunet_calendar_modal_selection', JSON.stringify(selectedCalendars));
    } catch (error) {
      console.error('Failed to save calendar selection:', error);
    }
  }, [show, selectedCalendars]);

  const toggleCalendar = (calendarId) => {
    setSelectedCalendars((prev) =>
      prev.includes(calendarId) ? prev.filter((id) => id !== calendarId) : [...prev, calendarId]
    );
  };

  // Termin löschen: uid über calendar/event/subscribe nachschlagen, dann calendar/event/delete
  const deleteEvent = async (event, key) => {
    setDeletingKey(key);
    setDeleteError('');
    try {
      const dayStart = new Date(isAllDayEvent(event) ? `${event.start}T00:00:00` : event.start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const candidates = await getCalendarEventsWithIds(conn, {
        entityId: event.calendarId,
        start: dayStart,
        end: dayEnd,
      });
      const match = candidates.find(
        (c) => c.uid && c.summary === event.summary && isSameStart(c.start, event.start)
      );
      if (!match) throw new Error('Event not found');
      await deleteCalendarEvent(conn, {
        entityId: event.calendarId,
        uid: match.uid,
        recurrenceId: match.recurrence_id,
      });
      setConfirmDeleteKey(null);
      setReloadKey((k) => k + 1);
    } catch (error) {
      console.error('Failed to delete calendar event:', error);
      setDeleteError(key);
    } finally {
      setDeletingKey(null);
    }
  };

  // Group events by date
  const groupedEvents = {};
  Object.entries(events).forEach(([calendarId, data]) => {
    if (!selectedCalendars.includes(calendarId)) return;
    const calendarEvents = data?.events || [];

    calendarEvents.forEach((event) => {
      const startDate = new Date(event.start);
      const dateKey = startDate.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!groupedEvents[dateKey]) {
        groupedEvents[dateKey] = [];
      }

      groupedEvents[dateKey].push({
        ...event,
        calendarId,
        calendarName: allCalendars.find((c) => c.id === calendarId)?.name || calendarId,
        calendarColor: getCalendarColor(calendarId),
      });
    });
  });

  // Sort dates
  const sortedDates = Object.keys(groupedEvents).sort((a, b) => {
    const dateA = groupedEvents[a][0]?.start;
    const dateB = groupedEvents[b][0]?.start;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  if (!show) return null;

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border p-4 font-sans backdrop-blur-xl sm:max-h-[88vh] sm:p-6 md:rounded-[3rem] md:p-10"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <button
            onClick={onClose}
            className="modal-close absolute top-6 right-6 z-20 md:top-10 md:right-10"
            aria-label={translate('common.close')}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 pr-12 font-sans sm:mb-7">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="rounded-2xl bg-[var(--accent-bg)] p-3 text-[var(--accent-color)] transition-all duration-500 sm:p-4">
                <Calendar className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0">
                <h3
                  id={modalTitleId}
                  className="truncate text-xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic sm:text-2xl"
                >
                  {translate('calendar.title')}
                </h3>
                <p className="mt-2 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase italic">
                  {translate('calendar.selectedCount').replace(
                    '{count}',
                    String(selectedCalendars.length)
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {writableCalendars.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm((current) => !current)}
                  aria-expanded={showAddForm}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${showAddForm ? 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {translate('calendar.addEvent')}
                </button>
              )}
              {allCalendars.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCalendarPicker((current) => !current)}
                  aria-expanded={showCalendarPicker}
                  aria-controls="calendar-picker-panel"
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${showCalendarPicker ? 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-primary)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  {showCalendarPicker
                    ? translate('common.hide')
                    : translate('calendar.selectCalendars')}
                  {showCalendarPicker ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden transition-[grid-template-columns] duration-300 ${showCalendarPicker ? 'grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-1' : 'grid-rows-1 lg:grid-cols-1'}`}
          >
            {/* Calendar Events */}
            <div className="scrollbar-hide min-h-0 overflow-y-auto pr-1 sm:pr-3">
              {showAddForm && writableCalendars.length > 0 && (
                <AddEventForm
                  calendars={writableCalendars}
                  defaultCalendarId={
                    writableCalendars.find((c) => selectedCalendars.includes(c.id))?.id
                  }
                  conn={conn}
                  translate={translate}
                  onCancel={() => setShowAddForm(false)}
                  onSaved={(calendarId) => {
                    setShowAddForm(false);
                    setSelectedCalendars((prev) =>
                      prev.includes(calendarId) ? prev : [...prev, calendarId]
                    );
                    setReloadKey((key) => key + 1);
                  }}
                />
              )}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <p className="text-sm tracking-widest text-[var(--text-secondary)] uppercase">
                    {translate('common.loading')}
                  </p>
                </div>
              ) : sortedDates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Calendar className="mb-4 h-16 w-16 text-[var(--text-muted)] opacity-30" />
                  <p className="text-sm tracking-widest text-[var(--text-secondary)] uppercase">
                    {translate('calendar.noEvents')}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {sortedDates.map((dateKey) => (
                    <div key={dateKey}>
                      <h4 className="sticky top-0 z-10 mb-4 bg-[var(--modal-bg)] py-2 text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-60">
                        {dateKey}
                      </h4>
                      <div className="space-y-3">
                        {groupedEvents[dateKey]
                          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                          .map((event, idx) => {
                            const startTime = new Date(event.start);
                            const isAllDay = isAllDayEvent(event);
                            const isPast = isEventFinishedToday(event);
                            const eventKey = `${event.calendarId}|${event.start}|${event.summary}`;
                            const confirming = confirmDeleteKey === eventKey;

                            return (
                              <div
                                key={`${event.calendarId}-${idx}`}
                                data-past-event={isPast ? 'true' : 'false'}
                                className={`group flex items-start gap-3 rounded-2xl px-2 py-3 transition-all sm:gap-4 sm:px-3 ${isPast ? 'opacity-40 saturate-50 hover:opacity-60' : 'hover:bg-[var(--glass-bg)]'}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-baseline justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="min-w-[3rem] flex-shrink-0 text-right">
                                        {isAllDay ? (
                                          <span className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-60">
                                            {translate('calendar.allDayShort')}
                                          </span>
                                        ) : (
                                          <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                                            {startTime.toLocaleTimeString(locale, {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </p>
                                        )}
                                      </div>
                                      <div
                                        className="h-8 w-1 flex-shrink-0 rounded-full opacity-80"
                                        style={{ backgroundColor: event.calendarColor }}
                                      />
                                      <h5 className="truncate leading-tight font-medium text-[var(--text-primary)]">
                                        {event.summary}
                                      </h5>
                                    </div>
                                  </div>
                                  {(event.description || event.location) && (
                                    <div className="mt-1 pl-[4.5rem] text-xs text-[var(--text-secondary)] opacity-70">
                                      {event.location && (
                                        <span className="mr-3 font-medium">
                                          📍 {event.location}
                                        </span>
                                      )}
                                      {event.description && (
                                        <span className="line-clamp-1">{event.description}</span>
                                      )}
                                    </div>
                                  )}
                                  {deleteError === eventKey && (
                                    <p className="mt-1 pl-[4.5rem] text-xs font-medium text-[var(--status-error-fg)]">
                                      {translate('calendar.deleteFailed')}
                                    </p>
                                  )}
                                </div>
                                {canDelete(event.calendarId) && (
                                  <button
                                    type="button"
                                    disabled={deletingKey === eventKey}
                                    onClick={() =>
                                      confirming
                                        ? deleteEvent(event, eventKey)
                                        : setConfirmDeleteKey(eventKey)
                                    }
                                    onBlur={() => {
                                      if (confirming && deletingKey !== eventKey)
                                        setConfirmDeleteKey(null);
                                    }}
                                    aria-label={translate('calendar.deleteEvent')}
                                    className={`flex flex-shrink-0 items-center gap-1.5 self-center rounded-full px-2.5 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-40 ${confirming ? 'bg-[var(--status-error-bg)] text-[var(--status-error-fg)]' : 'text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {confirming && translate('calendar.confirmDelete')}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar Selection */}
            {showCalendarPicker && (
              <aside
                id="calendar-picker-panel"
                className="popup-surface scrollbar-hide order-first max-h-64 min-h-0 overflow-y-auto rounded-3xl border border-[var(--glass-border)] p-4 lg:order-last lg:max-h-none"
              >
                <div className="space-y-2">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-70">
                      {translate('calendar.selectCalendars')}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCalendars.length === allCalendars.length) {
                          setSelectedCalendars([]);
                        } else {
                          setSelectedCalendars(allCalendars.map((c) => c.id));
                        }
                      }}
                      className="text-[10px] font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:text-[var(--accent-color)]"
                    >
                      {selectedCalendars.length === allCalendars.length
                        ? translate('calendar.removeAll')
                        : translate('calendar.selectAll')}
                    </button>
                  </div>

                  {allCalendars.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--text-muted)] italic">
                      {translate('calendar.noCalendarsFound')}
                    </p>
                  ) : (
                    allCalendars.map((calendar) => {
                      const isSelected = selectedCalendars.includes(calendar.id);
                      return (
                        <button
                          key={calendar.id}
                          type="button"
                          onClick={() => toggleCalendar(calendar.id)}
                          aria-pressed={isSelected}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-3 transition-all ${
                            isSelected
                              ? 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)]'
                              : 'border-transparent hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg)]'
                          }`}
                        >
                          <div
                            className="h-4 w-4 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: calendar.color }}
                          />
                          <span className="flex-1 truncate text-left text-sm font-medium text-[var(--text-primary)]">
                            {calendar.name}
                          </span>
                          {isSelected && (
                            <Check className="h-4 w-4 flex-shrink-0 text-[var(--accent-color)]" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            )}
          </div>
          <style>{`
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
            .scrollbar-hide {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}</style>
        </>
      )}
    </AccessibleModalShell>
  );
}

const inputClass =
  'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]';
const labelClass =
  'mb-1 block text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-70';

// Termin über calendar.create_event anlegen (ganztägig oder mit Uhrzeit)
function AddEventForm({ calendars, defaultCalendarId, conn, translate, onCancel, onSaved }) {
  const [calendarId, setCalendarId] = useState(defaultCalendarId || calendars[0]?.id);
  const [summary, setSummary] = useState('');
  const [date, setDate] = useState(() => toDateString(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!summary.trim() || !date || !calendarId) return;
    if (!allDay && endTime <= startTime) {
      setError(translate('calendar.timeOrder'));
      return;
    }
    const nextDay = new Date(`${date}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const times = allDay
      ? { start_date: date, end_date: toDateString(nextDay) }
      : { start_date_time: `${date} ${startTime}:00`, end_date_time: `${date} ${endTime}:00` };
    setSaving(true);
    setError('');
    try {
      await callService(conn, 'calendar', 'create_event', {
        target: { entity_id: calendarId },
        summary: summary.trim(),
        ...times,
      });
      onSaved(calendarId);
    } catch {
      setError(translate('calendar.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={save}
      onKeyDown={(e) => e.stopPropagation()}
      className="popup-surface mb-6 space-y-3 rounded-3xl border border-[var(--glass-border)] p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>{translate('calendar.eventTitle')}</span>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
            autoFocus
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{translate('calendar.select.title')}</span>
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className={inputClass}
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{translate('calendar.eventDate')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          {translate('calendar.allDay')}
        </label>
        {!allDay && (
          <>
            <label className="block">
              <span className={labelClass}>{translate('calendar.eventStart')}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{translate('calendar.eventEnd')}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className={inputClass}
              />
            </label>
          </>
        )}
      </div>
      {error && <p className="text-xs font-medium text-[var(--status-error-fg)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--glass-border)] px-4 py-2 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase hover:bg-[var(--glass-bg-hover)]"
        >
          {translate('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !summary.trim()}
          className="rounded-full bg-[var(--accent-color)] px-4 py-2 text-[10px] font-bold tracking-widest text-white uppercase disabled:opacity-40"
        >
          {translate('calendar.saveEvent')}
        </button>
      </div>
    </form>
  );
}

// Beginn aus calendar.get_events und aus calendar/event/subscribe vergleichen
function isSameStart(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(a) || dateOnly.test(b)) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

function toDateString(date) {
  return date.toLocaleDateString('sv-SE');
}

function isAllDayEvent(event) {
  return typeof event?.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.start);
}

function isEventFinishedToday(event, now = new Date()) {
  if (!event?.start || isAllDayEvent(event)) return false;

  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const startsToday =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();

  return startsToday && end.getTime() <= now.getTime();
}

// Generate consistent colors for calendars
function getCalendarColor(calendarId) {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#6366f1', // indigo
    '#14b8a6', // teal
  ];

  let hash = 0;
  for (let i = 0; i < calendarId.length; i++) {
    hash = calendarId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}
