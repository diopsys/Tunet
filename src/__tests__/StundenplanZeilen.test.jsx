import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMinutes,
  nextRowTimes,
  setRow,
  setWholeDay,
  sortAndRenumber,
  updateFach,
  usedFaecher,
} from '../components/pages/StundenplanEditor';
import StundenplanPage, { kurzName } from '../components/pages/StundenplanPage';

const plan = () => ({
  id: 'kind',
  name: 'Kind',
  stunden: [
    { nr: 1, von: '08:00', bis: '08:45' },
    { nr: 2, von: '08:50', bis: '09:35' },
    { nr: 'P1', von: '09:35', bis: '09:55', isPause: true, label: 'Pause' },
    { nr: 3, von: '09:55', bis: '10:40' },
    { nr: 'G', label: 'Ganztag', von: '13:00', bis: '16:00' },
  ],
  eintraege: { '1-0': 'Deutsch', '2-0': 'Mathematik', '3-0': { fach: 'Sport', info: 'Halle' }, 'G-1': 'Ganztag' },
  nachmittag: { 0: [{ fach: 'Mathematik', von: '15:00', bis: '16:00' }] },
  faecher: { Mathematik: { emoji: '🔢', color: '#3b82f6' } },
});

describe('Zeilen', () => {
  it('adds minutes within the day', () => {
    expect(addMinutes('09:35', 20)).toBe('09:55');
    expect(addMinutes('23:50', 30)).toBe('23:59');
  });

  it('inserting a lesson renumbers and moves the entries along', () => {
    const [next] = setRow([plan()], 'kind', null, { von: '08:45', bis: '08:50' });
    expect(next.stunden.map((s) => s.nr)).toEqual([1, 2, 3, 'P1', 4, 'G']);
    // Mathematik war Stunde 2 und ist jetzt Stunde 3, Sport von 3 nach 4
    expect(next.eintraege).toEqual({ '1-0': 'Deutsch', '3-0': 'Mathematik', '4-0': { fach: 'Sport', info: 'Halle' }, 'G-1': 'Ganztag' });
  });

  it('changing the time keeps the entries of the lesson', () => {
    const [next] = setRow([plan()], 'kind', 1, { von: '08:55', bis: '09:40' });
    expect(next.stunden[1]).toEqual({ nr: 2, von: '08:55', bis: '09:40' });
    expect(next.eintraege['2-0']).toBe('Mathematik');
  });

  it('deleting a lesson drops its entries and renumbers the rest', () => {
    const [next] = setRow([plan()], 'kind', 0, null);
    expect(next.stunden.map((s) => s.nr)).toEqual([1, 'P1', 2, 'G']);
    expect(next.eintraege).toEqual({ '1-0': 'Mathematik', '2-0': { fach: 'Sport', info: 'Halle' }, 'G-1': 'Ganztag' });
  });

  it('adds pauses and named rows', () => {
    const [mitPause] = setRow([plan()], 'kind', null, { von: '10:40', bis: '11:00', isPause: true, label: 'Mittagspause' });
    expect(mitPause.stunden.find((s) => s.label === 'Mittagspause')).toMatchObject({ isPause: true, nr: 'P2' });
    const [mitZeile] = setRow([plan()], 'kind', null, { von: '16:00', bis: '17:00', label: 'Gitarre' });
    expect(mitZeile.stunden.at(-1)).toMatchObject({ label: 'Gitarre', nr: 'G2' });
  });

  it('suggests the next row after the last one', () => {
    expect(nextRowTimes(plan(), false)).toEqual({ von: '16:05', bis: '16:50' });
    expect(nextRowTimes(plan(), true)).toEqual({ von: '16:00', bis: '16:15' });
  });

  it('sortAndRenumber sorts by start time', () => {
    const p = plan();
    p.stunden = [p.stunden[3], p.stunden[0], p.stunden[1]];
    expect(sortAndRenumber(p).stunden.map((s) => s.von)).toEqual(['08:00', '08:50', '09:55']);
  });
});

describe('Ganztägig und Fächer', () => {
  it('sets and clears whole-day entries', () => {
    const [mit] = setWholeDay([plan()], 'kind', 0, { fach: 'Studientag' }, '🏠');
    expect(mit.ganztag).toEqual({ 0: 'Studientag' });
    expect(mit.faecher.Studientag.emoji).toBe('🏠');
    const [ohne] = setWholeDay([mit], 'kind', 0, null);
    expect(ohne.ganztag).toBeUndefined();
  });

  it('renames a subject everywhere and updates its look', () => {
    const [next] = updateFach([plan()], 'kind', 'Mathematik', { name: 'Mathe', emoji: '➗', color: '#000000', kurz: 'M' });
    expect(next.eintraege['2-0']).toBe('Mathe');
    expect(next.nachmittag[0][0].fach).toBe('Mathe');
    expect(next.faecher.Mathe).toEqual({ emoji: '➗', color: '#000000', kurz: 'M' });
    expect(next.faecher.Mathematik).toBeUndefined();
  });

  it('lists used subjects', () => {
    expect(usedFaecher(plan())).toEqual(['Deutsch', 'Ganztag', 'Mathematik', 'Sport']);
  });

  it('abbreviates subjects', () => {
    expect(kurzName('Mathematik', {})).toBe('Ma');
    expect(kurzName('Französisch', {})).toBe('Frz');
    expect(kurzName('Tennis', {})).toBe('Tenn.');
    expect(kurzName('Chor', {})).toBe('Chor');
    expect(kurzName('Mathematik', { kurz: 'M' })).toBe('M');
  });
});

describe('Bearbeiten im Plan', () => {
  beforeEach(() => localStorage.clear());

  it('edits a lesson time via the time cell', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: [plan()] }} editMode onSavePlans={onSavePlans} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zeit 2. Stunde bearbeiten' }));
    fireEvent.change(screen.getByLabelText('von'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '09:45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(onSavePlans.mock.calls[0][0][0].stunden[1]).toEqual({ nr: 2, von: '09:00', bis: '09:45' });
  });

  it('adds a lesson with suggested times', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: [plan()] }} editMode onSavePlans={onSavePlans} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Stunde' }));
    expect(screen.getByLabelText('von').value).toBe('16:05');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(onSavePlans.mock.calls[0][0][0].stunden.map((s) => s.nr)).toEqual([1, 2, 'P1', 3, 'G', 4]);
  });

  it('sets a whole day via the day header', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: [plan()] }} editMode onSavePlans={onSavePlans} />);
    fireEvent.click(screen.getByRole('button', { name: 'Montag – ganzer Tag' }));
    fireEvent.change(screen.getByPlaceholderText('z. B. Mathematik'), { target: { value: 'Studientag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(onSavePlans.mock.calls[0][0][0].ganztag).toEqual({ 0: 'Studientag' });
  });

  it('shows abbreviations for the narrow view', () => {
    render(<StundenplanPage pageId="sp" settings={{ plans: [plan()] }} isMobile />);
    expect(screen.getAllByText('Ma').length).toBeGreaterThan(0);
    expect(screen.getByText('De')).toBeTruthy();
  });
});
