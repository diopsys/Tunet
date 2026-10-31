import { X } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

export default function SecurityContactsModal({ show, onClose, contactsInfo, entities }) {
  if (!show || !contactsInfo) return null;

  const { type, contacts } = contactsInfo;
  const isBewegung = type === 'bewegung';
  const title = type === 'tür' ? 'Türkontakte' : isBewegung ? 'Bewegungsmelder' : 'Fensterkontakte';

  const items = contacts.map(({ entityId, name }) => {
    const state = entities[entityId]?.state;
    const isOpen = state === 'on';
    const isUnavailable = !state || state === 'unavailable';
    return { entityId, name, isOpen, isUnavailable };
  });

  const openItems = items.filter((i) => i.isOpen);

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      panelClassName="w-full max-w-sm rounded-3xl border border-[var(--glass-border)] bg-[var(--card-bg)] shadow-2xl font-sans"
    >
      {(titleId) => (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--glass-border)]">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
              <p className={`text-xs mt-0.5 font-medium ${openItems.length > 0 ? (isBewegung ? 'text-yellow-400' : 'text-red-400') : 'text-green-400'}`}>
                {openItems.length > 0
                  ? isBewegung ? `${openItems.length} aktiv` : `${openItems.length} offen`
                  : isBewegung ? 'Keine Bewegung' : 'Alle geschlossen'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="modal-close flex h-8 w-8 items-center justify-center rounded-full bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] transition-all active:scale-90"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="px-5 py-4 flex flex-col gap-2 max-h-80 overflow-y-auto">
            {items.map(({ entityId, name, isOpen, isUnavailable }) => (
              <div
                key={entityId}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                  isOpen
                    ? 'border border-red-500/20 bg-red-500/8'
                    : isUnavailable
                    ? 'border border-[var(--glass-border)] bg-[var(--glass-bg)] opacity-40'
                    : 'border border-[var(--glass-border)] bg-[var(--glass-bg)]'
                }`}
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{name}</span>
                <span className={`text-xs font-bold ${
                  isUnavailable ? 'text-[var(--text-muted)]' : isOpen ? (isBewegung ? 'text-yellow-400' : 'text-red-400') : 'text-green-400'
                }`}>
                  {isUnavailable ? '–' : isOpen ? (isBewegung ? 'Aktiv' : 'Offen') : (isBewegung ? 'Ruhig' : 'Zu')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
