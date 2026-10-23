import React, { useState } from 'react';
import { X, Plus, LayoutGrid, Music, Speaker, Lightbulb, Battery, Home, BookOpen, Flame } from 'lucide-react';
import IconPicker from '../components/ui/IconPicker';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

const SELECTED_CONTAINER = 'bg-[var(--accent-bg)] border-[var(--accent-color)]';
const SELECTED_TEXT = 'text-[var(--accent-color)]';

const PageTypeButton = ({ type, icon: Icon, label, isActive, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(type)}
    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold tracking-widest whitespace-nowrap uppercase transition-colors duration-150 ease-out focus-visible:outline-none ${isActive ? `${SELECTED_CONTAINER} ${SELECTED_TEXT}` : 'border-transparent bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
  >
    <Icon className="h-4 w-4" /> {label}
  </button>
);

export default function AddPageModal({
  isOpen,
  onClose,
  t,
  newPageLabel,
  setNewPageLabel,
  newPageIcon,
  setNewPageIcon,
  onCreate,
  onCreateMedia,
  onCreateSonos,
  onCreateLights,
  onCreateBattery,
  onCreateRoomExplorer,
  onCreateStundenplan,
  onCreateHydraulik,
}) {
  const [activeTab, setActiveTab] = useState('standard');
  const modalTitleId = 'add-page-modal-title';

  if (!isOpen) return null;

  return (
    <AccessibleModalShell
      open={isOpen}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-[130] flex items-center justify-center p-6"
      overlayStyle={{
        backdropFilter: 'blur(20px)',
        backgroundColor: 'rgba(0,0,0,0.3)',
      }}
      panelClassName="popup-anim relative w-full max-w-lg rounded-3xl border p-6 font-sans shadow-2xl backdrop-blur-xl md:rounded-[3rem] md:p-10"
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
          className="modal-close absolute top-6 right-6 md:top-10 md:right-10"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
        <h3
          id={modalTitleId}
          className="mb-6 text-2xl font-light tracking-widest text-[var(--text-primary)] uppercase italic"
        >
          {t('modal.addPage.title')}
        </h3>

        <div className="mb-6">
          <p className="mb-2 ml-4 text-xs font-bold text-[var(--text-muted)] uppercase">
            {t('addCard.cardType') || 'Type'}
          </p>
          <div className="flex flex-wrap gap-2">
            <PageTypeButton
              type="standard"
              icon={LayoutGrid}
              label={t('page.create')}
              isActive={activeTab === 'standard'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="media"
              icon={Music}
              label={t('addCard.type.media')}
              isActive={activeTab === 'media'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="sonos"
              icon={Speaker}
              label={t('addCard.type.sonos')}
              isActive={activeTab === 'sonos'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="lights"
              icon={Lightbulb}
              label={t('addCard.type.light')}
              isActive={activeTab === 'lights'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="battery"
              icon={Battery}
              label={t('addCard.type.battery')}
              isActive={activeTab === 'battery'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="roomExplorer"
              icon={Home}
              label={t('addCard.type.roomExplorer')}
              isActive={activeTab === 'roomExplorer'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="stundenplan"
              icon={BookOpen}
              label="Stundenplan"
              isActive={activeTab === 'stundenplan'}
              onSelect={setActiveTab}
            />
            <PageTypeButton
              type="hydraulik"
              icon={Flame}
              label="Wärmepumpe"
              isActive={activeTab === 'hydraulik'}
              onSelect={setActiveTab}
            />
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'standard' ? (
            <>
              <div className="space-y-2">
                <label className="ml-4 text-xs font-bold text-[var(--text-muted)] uppercase">
                  {t('form.name')}
                </label>
                <input
                  type="text"
                  className="popup-surface w-full rounded-2xl px-6 py-4 text-[var(--text-primary)] transition-colors outline-none focus:border-[var(--glass-border)]"
                  value={newPageLabel}
                  onChange={(e) => setNewPageLabel(e.target.value)}
                  placeholder={t('form.exampleName')}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="ml-4 text-xs font-bold text-[var(--text-muted)] uppercase">
                  {t('form.chooseIcon')}
                </label>
                <IconPicker
                  value={newPageIcon}
                  onSelect={setNewPageIcon}
                  onClear={() => setNewPageIcon(null)}
                  t={t}
                  maxHeightClass="max-h-60"
                />
              </div>

              <button
                onClick={onCreate}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'media' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('addCard.type.media')}
                </p>
                <p className="leading-relaxed">{t('media.chooseMedia')}</p>
              </div>
              <button
                onClick={onCreateMedia}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'sonos' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('sonos.createTitle')}
                </p>
                <p className="leading-relaxed">{t('sonos.createDescription')}</p>
              </div>
              <button
                onClick={onCreateSonos}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('sonos.createPage')}
              </button>
            </>
          ) : activeTab === 'lights' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('addCard.type.light')}
                </p>
                <p className="leading-relaxed">{t('lights.createDescription') || 'Control all your lights from one place with brightness and color controls.'}</p>
              </div>
              <button
                onClick={onCreateLights}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'battery' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('addCard.type.battery')}
                </p>
                <p className="leading-relaxed">{t('battery.createDescription') || 'Monitor all battery-powered device levels, get low battery warnings and track offline devices.'}</p>
              </div>
              <button
                onClick={onCreateBattery}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'roomExplorer' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('addCard.type.roomExplorer')}
                </p>
                <p className="leading-relaxed">{t('roomExplorer.createDescription') || 'Browse all rooms and control every entity from one place.'}</p>
              </div>
              <button
                onClick={onCreateRoomExplorer}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'stundenplan' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  Stundenplan
                </p>
                <p className="leading-relaxed">Zeigt den Schulstundenplan mit aktiver Stunde und Tageshervorhebung.</p>
              </div>
              <button
                onClick={onCreateStundenplan}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : activeTab === 'hydraulik' ? (
            <>
              <div className="popup-surface rounded-2xl p-4 text-sm text-[var(--text-secondary)]">
                <p className="mb-2 text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  Wärmepumpe
                </p>
                <p className="leading-relaxed">Animiertes Hydraulikschema der Daikin Altherma 3 R ECH₂O mit Live-Werten.</p>
              </div>
              <button
                onClick={onCreateHydraulik}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-4 font-bold tracking-widest text-[var(--accent-color)] uppercase transition-colors hover:opacity-90"
              >
                <Plus className="h-5 w-5" /> {t('page.create')}
              </button>
            </>
          ) : null}
        </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
