import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StundenplanPage, { resolveCell, resolvePlans } from '../components/pages/StundenplanPage';

const settings = {
  type: 'stundenplan',
  plans: [
    {
      id: 'kind',
      name: 'Kind',
      subtitle: 'Klasse 2a',
      stunden: [
        { nr: 1, von: '07:40', bis: '08:25' },
        { nr: 'P1', von: '08:25', bis: '08:30', isPause: true, label: 'Hofpause' },
        { nr: 2, von: '08:30', bis: '09:15' },
      ],
      eintraege: {
        '1-0': { fach: 'Frühbetreuung', optional: true },
        '1-1': 'Musik',
        '2-1': { fach: 'Deutsch', info: 'Raum 06' },
      },
      faecher: { Deutsch: { emoji: '📖', color: '#3b82f6' } },
    },
    {
      id: 'lehrerin',
      name: 'Lehrerin',
      stunden: [{ nr: 1, von: '08:00', bis: '08:45' }],
      eintraege: { '1-1': { fach: 'Französisch', info: '7abcdef' } },
      ganztag: { 0: 'Studientag' },
    },
  ],
};

describe('resolvePlans / resolveCell', () => {
  it('falls back to the built-in plan without settings', () => {
    const plans = resolvePlans({});
    expect(plans).toHaveLength(1);
    expect(plans[0].subtitle).toBe('Grundschule');
  });

  it('ignores plans without lessons', () => {
    expect(resolvePlans({ plans: [{ id: 'leer', stunden: [] }] })[0].id).toBe('standard');
  });

  it('resolves strings, objects and whole-day entries', () => {
    const [kind, lehrerin] = resolvePlans(settings);
    expect(resolveCell(kind, 1, 1)).toEqual({ fach: 'Musik', ganztag: false });
    expect(resolveCell(kind, 2, 1)).toEqual({ fach: 'Deutsch', info: 'Raum 06', ganztag: false });
    expect(resolveCell(kind, 2, 4)).toBeNull();
    expect(resolveCell(lehrerin, 1, 0)).toEqual({ fach: 'Studientag', ganztag: true });
  });
});

describe('StundenplanPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('renders the first plan with info, pause label and plan switcher', () => {
    render(<StundenplanPage pageId="stundenplan" settings={settings} />);
    expect(screen.getByText('Stundenplan · Kind')).toBeTruthy();
    expect(screen.getAllByText('Deutsch').length).toBeGreaterThan(0);
    expect(screen.getByText('Raum 06')).toBeTruthy();
    expect(screen.getByText('Hofpause')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lehrerin' })).toBeTruthy();
  });

  it('switches plans and remembers the choice', () => {
    const { unmount } = render(<StundenplanPage pageId="stundenplan" settings={settings} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lehrerin' }));
    expect(screen.getByText('Stundenplan · Lehrerin')).toBeTruthy();
    expect(screen.getByText('7abcdef')).toBeTruthy();
    unmount();

    render(<StundenplanPage pageId="stundenplan" settings={settings} />);
    expect(screen.getByText('Stundenplan · Lehrerin')).toBeTruthy();
  });

  it('keeps the built-in timetable without plans', () => {
    render(<StundenplanPage pageId="stundenplan" settings={{ type: 'stundenplan' }} />);
    expect(screen.getByText('Stundenplan')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByText('Lernzeit').length).toBeGreaterThan(0);
  });
});
