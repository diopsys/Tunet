import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SearchableSelect } from './CarMappingsSection';
import { DEFAULT_LIGHT_PANEL_TABS, tabShowsSchedules } from '../../components/cards/lightPanelDefaults';

export function LightPanelSettingsSection({
  editSettings,
  editSettingsKey,
  saveCardSetting,
  entities,
  t,
}) {
  const [activeTabId, setActiveTabId] = useState(null);

  const tabs = editSettings?.panelTabs || DEFAULT_LIGHT_PANEL_TABS;
  const resolvedActiveTabId = activeTabId || tabs[0]?.id;
  const activeTab = tabs.find((tab) => tab.id === resolvedActiveTabId) || tabs[0];

  const saveTabs = (newTabs) => {
    saveCardSetting(editSettingsKey, 'panelTabs', newTabs);
  };

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
            onClick={() => setActiveTabId(tab.id)}
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
