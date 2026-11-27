import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { newTabId, scheduleEntityFilter } from '../components/cards/lightPanelDefaults';
import { filterSchedulesByEntities } from '../components/schedule/PanelSchedules';
import { LightPanelSettingsSection } from '../modals/editCard/LightPanelSettingsSection';

const tabs = [
  { id: 'eg', title: 'EG', entities: [{ entityId: 'light.couch', name: 'Couch' }] },
  { id: 'aussen', title: 'Außen', entities: [{ entityId: 'light.kette', name: 'Lichterkette' }] },
];

const renderSection = (saveCardSetting) =>
  render(
    <LightPanelSettingsSection
      editSettings={{ panelTabs: tabs }}
      editSettingsKey="k"
      saveCardSetting={saveCardSetting}
      entities={{}}
      t={(k) => k}
    />
  );

describe('Licht-Panel: Tabs verwalten', () => {
  it('bildet eindeutige Tab-IDs aus dem Namen', () => {
    expect(newTabId('Weihnachten', tabs)).toBe('weihnachten');
    expect(newTabId('Außen', tabs)).toBe('aussen_2');
    expect(newTabId('  ', tabs)).toBe('tab');
  });

  it('legt einen neuen Tab an', () => {
    const save = vi.fn();
    renderSection(save);
    fireEvent.change(screen.getByLabelText('Name für neuen Tab'), { target: { value: 'Weihnachten' } });
    fireEvent.click(screen.getByText('Tab hinzufügen'));
    const saved = save.mock.calls.at(-1)[2];
    expect(saved.map((t) => t.id)).toEqual(['eg', 'aussen', 'weihnachten']);
    expect(saved[2]).toMatchObject({ title: 'Weihnachten', entities: [] });
  });

  it('bietet fehlende Standard-Tabs (z. B. Automatik) zum Wiederherstellen an', () => {
    const save = vi.fn();
    renderSection(save);
    const button = screen.getByText(/Fehlende Standard-Tabs wiederherstellen/);
    expect(button.textContent).toContain('Automatik');
    fireEvent.click(button);
    expect(save.mock.calls.at(-1)[2].map((t) => t.id)).toEqual(['eg', 'aussen', 'og', 'automatik']);
  });

  it('löscht einen Tab erst nach Bestätigung', () => {
    const save = vi.fn();
    renderSection(save);
    fireEvent.click(screen.getByLabelText('Tab löschen'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Wirklich löschen?'));
    expect(save.mock.calls.at(-1)[2].map((t) => t.id)).toEqual(['aussen']);
  });
});

describe('Licht-Panel: Zeitpläne je Tab', () => {
  const schedules = [
    { id: 1, targets: { entities: ['light.kette'] } },
    { id: 2, targets: { entities: ['light.couch'] } },
    { id: 3, targets: { areas: [{ id: 'garten' }] } },
  ];

  it('Automatik zeigt alle, andere Tabs nur ihre Geräte', () => {
    expect(scheduleEntityFilter({ id: 'automatik', entities: [] })).toBeNull();
    expect(filterSchedulesByEntities(schedules, null)).toHaveLength(3);
    const ids = scheduleEntityFilter(tabs[1]);
    expect(filterSchedulesByEntities(schedules, ids).map((s) => s.id)).toEqual([1]);
  });
});
