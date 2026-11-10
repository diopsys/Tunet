import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarModal from '../modals/CalendarModal';
import { callService, getCalendarEvents, getCalendarEventsWithIds } from '../services';
import { fetchKalenderStatus, kalenderTerminLoeschen } from '../services/settingsApi';
import { termintage } from '../modals/calendar/PersonenAnsicht';

vi.mock('../services', () => ({
  callService: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getCalendarEvents: vi.fn(),
  getCalendarEventsWithIds: vi.fn(),
}));
vi.mock('../services/settingsApi', () => ({
  fetchKalenderStatus: vi.fn(),
  kalenderTerminLoeschen: vi.fn(),
}));

const kalender = (name) => ({
  entity_id: `calendar.${name.toLowerCase()}`,
  state: 'off',
  attributes: { friendly_name: name, supported_features: 1 },
});
const entities = {
  'calendar.alexa': kalender('Alexa'),
  'calendar.david': kalender('David'),
  'calendar.titus': kalender('Titus'),
  'calendar.felizitas': kalender('Felizitas'),
  'calendar.muell': kalender('Müll'),
};
const PERSONEN = ['calendar.alexa', 'calendar.david', 'calendar.titus', 'calendar.felizitas'];

const pad = (n) => String(n).padStart(2, '0');
const tag = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function renderModal(props = {}) {
  return render(
    <CalendarModal
      show
      onClose={vi.fn()}
      conn={{ sendMessagePromise: vi.fn(), subscribeMessage: vi.fn() }}
      entities={entities}
      language="de"
      t={(key) => key}
      personCalendars={PERSONEN}
      {...props}
    />
  );
}

describe('Kalender: Personen-Ansicht', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    fetchKalenderStatus.mockResolvedValue({ aktiv: true });
    getCalendarEvents.mockResolvedValue({
      'calendar.titus': { events: [{ summary: 'Fußball', start: tag(2), end: tag(3) }] },
      'calendar.alexa': { events: [{ summary: 'Zahnarzt', start: tag(2), end: tag(3) }] },
    });
  });

  it('zeigt die Personen in der eingestellten Reihenfolge und lädt nur deren Kalender', async () => {
    renderModal();
    const ansicht = await screen.findByTestId('calendar-people-view');
    const namen = within(ansicht)
      .getAllByText(/^(Alexa|David|Titus|Felizitas)$/)
      .map((el) => el.textContent);
    expect(namen).toEqual(['Alexa', 'David', 'Titus', 'Felizitas']);
    await screen.findByText('Fußball');
    expect(getCalendarEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityIds: PERSONEN })
    );
  });

  it('ohne Personen-Kalender bleibt es bei der Liste', async () => {
    renderModal({ personCalendars: [] });
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalled());
    expect(screen.queryByTestId('calendar-people-view')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'calendar.viewPeople' })).not.toBeInTheDocument();
  });

  it('schaltet auf die Liste um und merkt sich das', async () => {
    renderModal();
    await screen.findByTestId('calendar-people-view');
    fireEvent.click(screen.getByRole('button', { name: 'calendar.viewList' }));
    expect(screen.queryByTestId('calendar-people-view')).not.toBeInTheDocument();
    expect(localStorage.getItem('tunet_calendar_modal_view')).toBe('list');
  });

  it('„+“ in der Spalte trägt für diese Person ein', async () => {
    callService.mockResolvedValue({});
    renderModal();
    await screen.findByText('Fußball');
    fireEvent.click(screen.getAllByRole('button', { name: 'calendar.addFor' })[2]);
    const select = await screen.findByRole('combobox');
    expect(select).toHaveValue('calendar.titus');
  });

  it('löscht CalDAV-Termine über den Tunet-Server, bei Serien erst nach zweiter Bestätigung', async () => {
    getCalendarEventsWithIds.mockResolvedValue([{ uid: 'u-1', summary: 'Fußball', start: tag(2) }]);
    const serie = Object.assign(new Error('Serientermin'), { status: 409, body: { serie: true } });
    kalenderTerminLoeschen.mockRejectedValueOnce(serie).mockResolvedValueOnce({ geloescht: 1 });
    renderModal();
    await screen.findByText('Fußball');
    await waitFor(() => expect(fetchKalenderStatus).toHaveBeenCalled());

    const knoepfe = await screen.findAllByRole('button', { name: 'calendar.deleteEvent' });
    expect(knoepfe).toHaveLength(2); // Alexa und Titus
    const titus = knoepfe[1];
    fireEvent.click(titus);
    fireEvent.click(titus);
    await screen.findByText('calendar.deleteSeries');
    expect(kalenderTerminLoeschen).toHaveBeenLastCalledWith({
      entityId: 'calendar.titus',
      uid: 'u-1',
      start: tag(2),
      serie: false,
    });
    fireEvent.click(screen.getByText('calendar.deleteSeries').closest('button'));
    await waitFor(() =>
      expect(kalenderTerminLoeschen).toHaveBeenLastCalledWith(
        expect.objectContaining({ serie: true })
      )
    );
  });
});

describe('termintage', () => {
  const ganztags = (e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  it('verteilt mehrtägige ganztägige Termine auf jeden Tag vor dem Ende', () => {
    expect(termintage({ start: '2026-11-10', end: '2026-11-13' }, ganztags)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
  });
  it('setzt Termine mit Uhrzeit auf den Tag ihres Beginns', () => {
    expect(
      termintage({ start: '2026-11-10T22:00:00', end: '2026-11-11T02:00:00' }, ganztags)
    ).toEqual(['2026-11-10']);
  });
});

describe('Kalenderfarben', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    fetchKalenderStatus.mockResolvedValue({ aktiv: false });
    getCalendarEvents.mockResolvedValue({});
  });

  it('nimmt die eingestellte Farbe für die Spalte', async () => {
    renderModal({ calendarColors: { 'calendar.titus': '#123456', 'calendar.david': 'kaputt' } });
    const ansicht = await screen.findByTestId('calendar-people-view');
    const punkt = (name) => within(ansicht).getByText(name).previousElementSibling;
    expect(punkt('Titus')).toHaveStyle({ backgroundColor: '#123456' });
    // ungültige Angabe: Standardfarbe
    expect(punkt('David').style.backgroundColor).not.toBe('');
  });

  it('meldet abgelehnte Anmeldung beim Löschen verständlich', async () => {
    fetchKalenderStatus.mockResolvedValue({ aktiv: true });
    getCalendarEvents.mockResolvedValue({
      'calendar.titus': { events: [{ summary: 'Test', start: tag(1), end: tag(2) }] },
    });
    getCalendarEventsWithIds.mockResolvedValue([{ uid: 'u', summary: 'Test', start: tag(1) }]);
    kalenderTerminLoeschen.mockRejectedValue(
      Object.assign(new Error('CalDAV PROPFIND 401'), { status: 502, body: { code: 'anmeldung' } })
    );
    renderModal();
    await screen.findByText('Test');
    await waitFor(() => expect(fetchKalenderStatus).toHaveBeenCalled());
    const knopf = await screen.findByRole('button', { name: 'calendar.deleteEvent' });
    fireEvent.click(knopf);
    fireEvent.click(knopf);
    expect(await screen.findByText('calendar.deleteAuthFailed')).toBeInTheDocument();
  });
});
