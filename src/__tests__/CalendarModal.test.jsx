import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarModal from '../modals/CalendarModal';
import {
  callService,
  deleteCalendarEvent,
  getCalendarEvents,
  getCalendarEventsWithIds,
} from '../services';

vi.mock('../services', () => ({
  callService: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getCalendarEvents: vi.fn(),
  getCalendarEventsWithIds: vi.fn(),
}));

const entities = {
  'calendar.family': {
    entity_id: 'calendar.family',
    state: 'on',
    attributes: { friendly_name: 'Family' },
  },
  'calendar.work': {
    entity_id: 'calendar.work',
    state: 'off',
    attributes: { friendly_name: 'Work' },
  },
};

describe('CalendarModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setHours(0, 0, 0, 0);
    getCalendarEvents.mockResolvedValue({
      'calendar.family': {
        events: [
          {
            summary: 'Past meeting',
            start: pastStart.toISOString(),
            end: new Date(now.getTime() - 60_000).toISOString(),
          },
          {
            summary: 'Future meeting',
            start: new Date(now.getTime() + 60 * 60_000).toISOString(),
            end: new Date(now.getTime() + 120 * 60_000).toISOString(),
          },
        ],
      },
    });
  });

  it('opens with calendar selection hidden and reveals it on demand', async () => {
    render(
      <CalendarModal
        show
        onClose={vi.fn()}
        conn={{ sendMessagePromise: vi.fn() }}
        entities={entities}
        language="en"
        t={(key) => key}
      />
    );

    const pickerButton = screen.getByRole('button', { name: 'calendar.selectCalendars' });
    expect(pickerButton).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('calendar-picker-panel')).not.toBeInTheDocument();

    fireEvent.click(pickerButton);

    expect(pickerButton).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('calendar-picker-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Family' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('dims only events from today whose end time has passed', async () => {
    render(
      <CalendarModal
        show
        onClose={vi.fn()}
        conn={{ sendMessagePromise: vi.fn() }}
        entities={entities}
        language="en"
        t={(key) => key}
      />
    );

    await waitFor(() => expect(screen.getByText('Past meeting')).toBeInTheDocument());

    expect(screen.getByText('Past meeting').closest('[data-past-event]')).toHaveAttribute(
      'data-past-event',
      'true'
    );
    expect(screen.getByText('Future meeting').closest('[data-past-event]')).toHaveAttribute(
      'data-past-event',
      'false'
    );
  });

  it('offers adding events only when a calendar accepts them', () => {
    render(
      <CalendarModal
        show
        onClose={vi.fn()}
        conn={{ sendMessagePromise: vi.fn() }}
        entities={entities}
        language="en"
        t={(key) => key}
      />
    );
    expect(screen.queryByRole('button', { name: 'calendar.addEvent' })).not.toBeInTheDocument();
  });

  it('adds an all-day event to a writable calendar', async () => {
    callService.mockResolvedValue({});
    const writable = {
      ...entities,
      'calendar.verein': {
        entity_id: 'calendar.verein',
        state: 'off',
        attributes: { friendly_name: 'Verein', supported_features: 7 },
      },
    };
    render(
      <CalendarModal
        show
        onClose={vi.fn()}
        conn={{ sendMessagePromise: vi.fn() }}
        entities={writable}
        language="en"
        t={(key) => key}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'calendar.addEvent' }));
    fireEvent.change(screen.getByLabelText('calendar.eventTitle'), {
      target: { value: 'Papierabholung' },
    });
    fireEvent.change(screen.getByLabelText('calendar.eventDate'), {
      target: { value: '2026-11-14' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'calendar.saveEvent' }));

    await waitFor(() =>
      expect(callService).toHaveBeenCalledWith(expect.anything(), 'calendar', 'create_event', {
        target: { entity_id: 'calendar.verein' },
        summary: 'Papierabholung',
        start_date: '2026-11-14',
        end_date: '2026-11-15',
      })
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('calendar.eventTitle')).not.toBeInTheDocument()
    );
  });

  it('deletes an event after confirmation using its uid', async () => {
    getCalendarEvents.mockResolvedValue({
      'calendar.verein': {
        events: [{ summary: 'Papierabholung', start: '2026-11-14', end: '2026-11-15' }],
      },
    });
    getCalendarEventsWithIds.mockResolvedValue([
      { summary: 'Anderes', start: '2026-11-14', end: '2026-11-15', uid: 'x' },
      { summary: 'Papierabholung', start: '2026-11-14', end: '2026-11-15', uid: 'abc' },
    ]);
    deleteCalendarEvent.mockResolvedValue({});
    const writable = {
      'calendar.verein': {
        entity_id: 'calendar.verein',
        state: 'off',
        attributes: { friendly_name: 'Verein', supported_features: 7 },
      },
    };
    render(
      <CalendarModal
        show
        onClose={vi.fn()}
        conn={{ sendMessagePromise: vi.fn() }}
        entities={writable}
        language="en"
        t={(key) => key}
      />
    );

    const deleteButton = await screen.findByRole('button', { name: 'calendar.deleteEvent' });
    fireEvent.click(deleteButton);
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    fireEvent.click(deleteButton);

    await waitFor(() =>
      expect(deleteCalendarEvent).toHaveBeenCalledWith(expect.anything(), {
        entityId: 'calendar.verein',
        uid: 'abc',
        recurrenceId: undefined,
      })
    );
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalledTimes(2));
  });
});
