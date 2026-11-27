import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from '../../icons';
import { SearchableSelect } from './CarMappingsSection';
import IconPicker from '../../components/ui/IconPicker';
import { DEFAULT_LIGHT_PANEL_TABS, newTabId, tabShowsSchedules } from '../../components/cards/lightPanelDefaults';

export function LightPanelSettingsSection({
  editSettings,
  editSettingsKey,
  saveCardSetting,
  entities,
  t,
}) {
  const [activeTabId, setActiveTabId] = useState(null);
  const [newTabTitle, setNewTabTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const tabs = editSettings?.panelTabs || DEFAULT_LIGHT_PANEL_TABS;
  const resolvedActiveTabId = activeTabId || tabs[0]?.id;
  const activeTab = tabs.find((tab) => tab.id === resolvedActiveTabId) || tabs[0];

  const saveTabs = (newTabs) => {
    saveCardSetting(editSettingsKey, 'panelTabs', newTabs);
  };

  /* ── Tabs verwalten ── */
  const selectTab = (id) => {
    setActiveTabId(id);
    setConfirmDelete(null);
  };

  const updateTab = (patch) => {
    saveTabs(tabs.map((tab) => (tab.id === resolvedActiveTabId ? { ...tab, ...patch } : tab)));
  };

  const addTab = () => {
    const title = newTabTitle.trim();
    if (!title) return;
    const id = newTabId(title, tabs);
    saveTabs([...tabs, { id, title, icon: 'mdi:lightbulb-group', entities: [] }]);
    setNewTabTitle('');
    selectTab(id);
  };

  const deleteTab = () => {
    if (tabs.length <= 1) return;
    const index = tabs.findIndex((tab) => tab.id === resolvedActiveTabId);
    const rest = tabs.filter((tab) => tab.id !== resolvedActiveTabId);
    saveTabs(rest);
    selectTab(rest[Math.max(0, index - 1)]?.id || null);
  };

  const moveTab = (delta) => {
    const index = tabs.findIndex((tab) => tab.id === resolvedActiveTabId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= tabs.length) return;
    const next = [...tabs];
    [next[index], next[target]] = [next[target], next[index]];
    saveTabs(next);
  };

  const missingDefaults = DEFAULT_LIGHT_PANEL_TABS.filter((d) => !tabs.some((tab) => tab.id === d.id));
  const restoreDefaults = () => saveTabs([...tabs, ...missingDefaults]);
  const activeIndex = tabs.findIndex((tab) => tab.id === resolvedActiveTabId);

  const updateEntity = (entityId, patch) => {
    const newTabs = tabs.map((tab) =>
      tab.id === resolvedActiveTabId
        ? {
            ...tab,
            entities: tab.entities.map((e) =>
              e.entityId === entityId ? { ...e, ...patch } : e
            ),
          }
        : tab
    );
    saveTabs(newTabs);
  };

  const removeEntity = (entityId) => {
    const newTabs = tabs.map((tab) =>
      tab.id === resolvedActiveTabId
        ? { ...tab, entities: tab.entities.filter((e) => e.entityId !== entityId) }
        : tab
    );
    saveTabs(newTabs);
  };

  const addEntity = (entityId) => {
    if (!entityId) return;
    const already = activeTab.entities.some((e) => e.entityId === entityId);
    if (already) return;
    const friendlyName = entities[entityId]?.attributes?.friendly_name || '';
    const newTabs = tabs.map((tab) =>
      tab.id === resolvedActiveTabId
        ? { ...tab, entities: [...tab.entities, { entityId, name: friendlyName }] }
        : tab
    );
    saveTabs(newTabs);
  };

  const allOptions = Object.keys(entities || {}).filter(
    (id) =>
      id.startsWith('light.') ||
      id.startsWith('switch.') ||
      id.startsWith('input_boolean.') ||
      id.startsWith('automation.')
  );
  const usedIds = new Set((activeTab?.entities || []).map((e) => e.entityId));
  const addOptions = allOptions.filter((id) => !usedIds.has(id));

  // Options for sperre selector: input_boolean.sperre_*, switch.sperre_*, automation.*
  const sperreOptions = Object.keys(entities || {}).filter(
    (id) =>
      id.startsWith('input_boolean.sperre_') ||
      id.startsWith('switch.sperre_') ||
      id.startsWith('automation.')
  );

  return (
    <div className="space-y-4">
      <label className="ml-1 text-xs font-bold text-[var(--text-muted)] uppercase">
        Licht Panel Konfiguration
      </label>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition-all ${
              resolvedActiveTabId === tab.id
                ? 'bg-[var(--accent-color)] text-white'
                : 'popup-surface popup-surface-hover text-[var(--text-secondary)]'
            }`}
          >
            {tab.title}
            <span className="ml-1.5 opacity-60">({tab.entities.length})</span>
          </button>
        ))}
      </div>

      {/* Neuer Tab */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTabTitle}
          onChange={(e) => setNewTabTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTab(); }}
          placeholder="Name für neuen Tab …"
          aria-label="Name für neuen Tab"
          className="popup-surface min-w-0 flex-1 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="button"
          onClick={addTab}
          disabled={!newTabTitle.trim()}
          className="popup-surface popup-surface-hover flex flex-shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Tab hinzufügen
        </button>
      </div>

      {missingDefaults.length > 0 && (
        <button
          type="button"
          onClick={restoreDefaults}
          className="popup-surface popup-surface-hover flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Fehlende Standard-Tabs wiederherstellen: {missingDefaults.map((d) => d.title).join(', ')}
        </button>
      )}

      {/* Aktiven Tab bearbeiten: Name, Symbol, Reihenfolge, Löschen */}
      {activeTab && (
        <div className="popup-surface space-y-2 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              key={activeTab.id}
              type="text"
              defaultValue={activeTab.title}
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (title && title !== activeTab.title) updateTab({ title });
                else e.target.value = activeTab.title;
              }}
              aria-label="Name des Tabs"
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none"
            />
            <button
              type="button"
              onClick={() => moveTab(-1)}
              disabled={activeIndex <= 0}
              aria-label="Tab nach links"
              className="flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveTab(1)}
              disabled={activeIndex >= tabs.length - 1}
              aria-label="Tab nach rechts"
              className="flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {confirmDelete === activeTab.id ? (
              <button
                type="button"
                onClick={deleteTab}
                className="flex-shrink-0 rounded-lg bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-400"
              >
                Wirklich löschen?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(activeTab.id)}
                disabled={tabs.length <= 1}
                aria-label="Tab löschen"
                className="flex-shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <IconPicker
            key={activeTab.id}
            value={activeTab.icon || null}
            onSelect={(icon) => updateTab({ icon })}
            onClear={() => updateTab({ icon: undefined })}
            t={t || ((k) => k)}
            maxHeightClass="max-h-48"
          />
        </div>
      )}

      {/* Zeitschaltuhr im Tab */}
      {activeTab && (
        <div className="popup-surface flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)]">{t('schedule.panelToggle')}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{t('schedule.panelToggleHint')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tabShowsSchedules(activeTab)}
            aria-label={t('schedule.panelToggle')}
            onClick={() =>
              saveTabs(tabs.map((tab) => (tab.id === resolvedActiveTabId ? { ...tab, showSchedules: !tabShowsSchedules(tab) } : tab)))
            }
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${tabShowsSchedules(activeTab) ? 'bg-[var(--accent-color)]' : 'bg-[var(--glass-bg-hover)]'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${tabShowsSchedules(activeTab) ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      )}

      {/* Entity list for active tab */}
      <div className="space-y-2">
        {(activeTab?.entities || []).length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">Keine Entitäten in diesem Tab.</p>
        ) : (
          (activeTab?.entities || []).map(({ entityId, name, sperreEntityId }) => (
            <div
              key={entityId}
              className="popup-surface rounded-xl px-3 py-2 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[10px] text-[var(--text-muted)]">{entityId}</span>
                  <input
                    type="text"
                    defaultValue={name}
                    onBlur={(e) => updateEntity(entityId, { name: e.target.value })}
                    placeholder={entities[entityId]?.attributes?.friendly_name || entityId}
                    className="w-full bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] placeholder:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEntity(entityId)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Sperre entity */}
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  Sperre
                </span>
                {sperreEntityId ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-orange-400">
                      {sperreEntityId}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateEntity(entityId, { sperreEntityId: undefined })}
                      className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <SearchableSelect
                      label=""
                      value={null}
                      options={sperreOptions}
                      onChange={(id) => { if (id) updateEntity(entityId, { sperreEntityId: id }); }}
                      placeholder="Sperre verknüpfen..."
                      entities={entities}
                      t={t || ((k) => k)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add entity */}
      <SearchableSelect
        label={`Entität zu ${activeTab?.title || ''} hinzufügen`}
        value={null}
        options={addOptions}
        onChange={(id) => { if (id) addEntity(id); }}
        placeholder="Entität auswählen..."
        entities={entities}
        t={t || ((k) => k)}
      />
    </div>
  );
}
