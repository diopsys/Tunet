import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EintragDialog, {
  STANDARD_STUNDEN,
  updateFach,
  addPlan,
  removePlan,
  setAfternoonEntry,
  setCellEntry,
  updatePlanMeta,
} from '../components/pages/StundenplanEditor';
import StundenplanPage from '../components/pages/StundenplanPage';

const basePlans = () => [
  {
    id: 'kind',
    name: 'Kind',
    stunden: [{ nr: 1, von: '08:00', bis: '08:45' }],
    eintraege: { '1-0': 'Deutsch' },
    faecher: { Deutsch: { emoji: '📖', color: '#ef4444' } },
    nachmittag: { 0: [{ fach: 'Klavier', von: '14:30', bis: '15:00' }] },
  },
  { id: 'andere', name: 'Andere', stunden: [{ nr: 1, von: '08:00', bis: '08:45' }], eintraege: {} },
];

describe('setCellEntry', () => {
  it('sets, simplifies and clears entries without touching other plans', () => {
    const plans = basePlans();
    const next = setCellEntry(plans, 'kind', 1, 1, { fach: ' Mathematik ', info: 'Raum 06', optional: false }, '🔢');
    expect(next[0].eintraege['1-1']).toEqual({ fach: 'Mathematik', info: 'Raum 06' });
    expect(next[0].faecher.Mathematik.emoji).toBe('🔢');
    expect(next[1]).toBe(plans[1]);
    expect(plans[0].eintraege['1-1']).toBeUndefined(); // original unverändert

    const simple = setCellEntry(next, 'kind', 1, 1, { fach: 'Musik' });
    expect(simple[0].eintraege['1-1']).toBe('Musik');

    const cleared = setCellEntry(simple, 'kind', 1, 0, null);
    expect(cleared[0].eintraege['1-0']).toBeUndefined();
  });

  it('keeps optional and own times', () => {
    const next = setCellEntry(basePlans(), 'kind', 'G', 1, { fach: 'Ganztag', optional: true, von: '13:05', bis: '16:00' });
    expect(next[0].eintraege['G-1']).toEqual({ fach: 'Ganztag', optional: true, von: '13:05', bis: '16:00' });
  });
});

describe('setAfternoonEntry', () => {
  it('adds, edits and deletes afternoon entries', () => {
    const added = setAfternoonEntry(basePlans(), 'kind', 0, null, { fach: 'Kinderturnen', von: '17:15', bis: '18:15' }, '🤸');
    expect(added[0].nachmittag[0]).toHaveLength(2);
    expect(added[0].faecher.Kinderturnen.emoji).toBe('🤸');

    const edited = setAfternoonEntry(added, 'kind', 0, 0, { fach: 'Klavier', von: '14:00', bis: '14:30', info: 'Musikschule' });
    expect(edited[0].nachmittag[0][0]).toEqual({ fach: 'Klavier', von: '14:00', bis: '14:30', info: 'Musikschule' });

    const deleted = setAfternoonEntry(setAfternoonEntry(edited, 'kind', 0, 1, null), 'kind', 0, 0, null);
    expect(deleted[0].nachmittag[0]).toBeUndefined();
  });
});

describe('Personen verwalten', () => {
  it('adds a person with copied times and empty entries', () => {
    const next = addPlan(basePlans(), { name: 'Jörg', subtitle: ' Klasse 3b ', vorlageId: 'kind' });
    const neu = next[2];
    expect(neu.id).toBe('joerg');
    expect(neu.subtitle).toBe('Klasse 3b');
    expect(neu.stunden).toEqual(basePlans()[0].stunden);
    expect(neu.eintraege).toEqual({});
    expect(neu.nachmittag).toBeUndefined();
  });

  it('uses standard times without template and keeps ids unique', () => {
    const next = addPlan(basePlans(), { name: 'Kind', vorlageId: null });
    expect(next[2].id).toBe('kind_2');
    expect(next[2].stunden).toEqual(STANDARD_STUNDEN);
  });

  it('renames and removes, but never the last person', () => {
    const renamed = updatePlanMeta(basePlans(), 'kind', { name: 'Kind A', subtitle: '' });
    expect(renamed[0].name).toBe('Kind A');
    expect(renamed[0].subtitle).toBeUndefined();
    expect(removePlan(renamed, 'kind').map((p) => p.id)).toEqual(['andere']);
    const one = [basePlans()[0]];
    expect(removePlan(one, 'kind')).toBe(one);
  });
});

describe('StundenplanPage im Bearbeiten-Modus', () => {
  beforeEach(() => localStorage.clear());

  it('adds an afternoon entry via dialog', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={onSavePlans} />);

    fireEvent.click(screen.getByRole('button', { name: 'Termin am Mittwoch hinzufügen' }));
    fireEvent.change(screen.getByPlaceholderText('z. B. Mathematik'), { target: { value: 'Schwimmen' } });
    fireEvent.change(screen.getByLabelText('von'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saved = onSavePlans.mock.calls[0][0];
    expect(saved[0].nachmittag[2]).toEqual([{ fach: 'Schwimmen', von: '15:00', bis: '16:00' }]);
  });

  it('rejects an end time before the start time', () => {
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Termin am Montag hinzufügen' }));
    fireEvent.change(screen.getByPlaceholderText('z. B. Mathematik'), { target: { value: 'Tennis' } });
    fireEvent.change(screen.getByLabelText('von'), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText('bis'), { target: { value: '15:00' } });
    expect(screen.getByText('„bis“ muss nach „von“ liegen.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Speichern' }).disabled).toBe(true);
  });

  it('clears a lesson cell', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={onSavePlans} />);
    // erster Treffer ist die Zelle, der zweite die Legende
    fireEvent.click(screen.getAllByText('Deutsch')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(onSavePlans.mock.calls[0][0][0].eintraege['1-0']).toBeUndefined();
  });

  it('adds a person via dialog and selects it', () => {
    const onSavePlans = vi.fn();
    const { rerender } = render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={onSavePlans} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Person' }));
    fireEvent.change(screen.getByPlaceholderText('z. B. Anna'), { target: { value: 'Neu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const saved = onSavePlans.mock.calls[0][0];
    expect(saved.map((p) => p.name)).toEqual(['Kind', 'Andere', 'Neu']);

    rerender(<StundenplanPage pageId="sp" settings={{ plans: saved }} editMode onSavePlans={onSavePlans} />);
    expect(screen.getByText('Stundenplan · Neu')).toBeTruthy();
  });

  it('asks before removing a person', () => {
    const onSavePlans = vi.fn();
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={onSavePlans} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kind bearbeiten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(onSavePlans).not.toHaveBeenCalled();
    expect(screen.getByText('Kind mit allen Einträgen entfernen?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(onSavePlans.mock.calls[0][0].map((p) => p.id)).toEqual(['andere']);
  });

  it('rejects a duplicate name', () => {
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} editMode onSavePlans={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Person' }));
    fireEvent.change(screen.getByPlaceholderText('z. B. Anna'), { target: { value: 'andere' } });
    expect(screen.getByText('Diesen Namen gibt es schon.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Speichern' }).disabled).toBe(true);
  });

  it('offers no editing outside edit mode', () => {
    render(<StundenplanPage pageId="sp" settings={{ plans: basePlans() }} onSavePlans={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /hinzufügen/ })).toBeNull();
  });
});

describe('Symbole', () => {
  it('keeps a typed symbol when the parent re-renders with a new subject list', () => {
    const faecher = () => ({ Mathe: { emoji: '➗', color: '#000' } });
    const props = { mode: 'stunde', title: 'Stunde', initial: { fach: 'Mathe' }, onSave: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<EintragDialog {...props} faecher={faecher()} />);
    const symbol = screen.getByPlaceholderText('📘');
    fireEvent.change(symbol, { target: { value: '🚀' } });
    rerender(<EintragDialog {...props} faecher={faecher()} />);
    expect(symbol).toHaveValue('🚀');
  });

  it('suggests a matching symbol for a new subject and keeps an own choice', () => {
    const onSave = vi.fn();
    render(<EintragDialog mode="nachmittag" title="Nachmittag" initial={null} faecher={{}} onSave={onSave} onClose={vi.fn()} />);
    const name = screen.getByPlaceholderText('z. B. Mathematik');
    const symbol = screen.getByPlaceholderText('📘');
    fireEvent.change(name, { target: { value: 'Schwimmen' } });
    expect(symbol).toHaveValue('🏊');
    expect(screen.getByText('Symbol (automatisch)')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Tennis' } });
    expect(symbol).toHaveValue('🎾'); // folgt dem Namen, solange nichts selbst gewählt ist
    fireEvent.click(screen.getByRole('button', { name: '⭐' }));
    fireEvent.change(name, { target: { value: 'Tennis-Turnier' } });
    expect(symbol).toHaveValue('⭐'); // eigene Wahl bleibt
    expect(screen.queryByText('Symbol (automatisch)')).toBeNull();
  });

  it('picks a symbol from the selection', () => {
    render(<EintragDialog mode="stunde" title="Stunde" initial={null} faecher={{}} onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '⚽' }));
    expect(screen.getByPlaceholderText('📘')).toHaveValue('⚽');
  });

  it('keeps the display label when only the symbol changes', () => {
    const plans = [{ id: 'p', stunden: [], eintraege: {}, faecher: { SichBasis: { emoji: '🤝', label: 'Sichere Basis', color: '#000' } } }];
    const next = updateFach(plans, 'p', 'SichBasis', { name: 'SichBasis', emoji: '🧩', color: '#000', kurz: '' });
    expect(next[0].faecher.SichBasis).toMatchObject({ emoji: '🧩', label: 'Sichere Basis' });
  });
});
