import { Lock, Unlock, X, AlertTriangle } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

export default function SecurityLockModal({ show, onClose, lockInfo, entities, callService }) {
  if (!show || !lockInfo) return null;

  const { entityId, contactId, name } = lockInfo;
  const entity  = entities[entityId];
  const contact = entities[contactId];

  const state = entity?.state;
  const isLocked     = state === 'locked';
  const isUnlocked   = state === 'unlocked';
  const isJammed     = state === 'jammed';
  const isLocking    = state === 'locking';
  const isUnlocking  = state === 'unlocking';
  const isTransition = isLocking || isUnlocking;
  const isUnavailable = !state || state === 'unavailable' || state === 'unknown';

  const isDoorOpen = contact?.state === 'on';

  const lock   = () => callService('lock', 'lock',   { entity_id: entityId });
  const unlock = () => callService('lock', 'unlock', { entity_id: entityId });

  const stateLabel = isUnavailable ? 'Nicht verfügbar'
    : isLocking    ? 'Sperrt…'
    : isUnlocking  ? 'Öffnet…'
    : isJammed     ? 'Blockiert'
    : isLocked     ? 'Gesperrt'
    : 'Offen';

  const stateColor = isUnavailable || isJammed ? 'text-red-400'
    : isLocked   ? 'text-green-400'
    : isTransition ? 'text-blue-400'
    : 'text-orange-400';

  const iconStyle = isUnavailable || isJammed
    ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }
    : isLocked
    ? { backgroundColor: 'rgba(34,197,94,0.12)',  color: '#22c55e' }
    : isTransition
    ? { backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
    : { backgroundColor: 'rgba(251,146,60,0.12)', color: '#fb923c' };

  const Icon = isLocked || isLocking ? Lock : Unlock;

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
            <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">{name}</h2>
            <button
              type="button"
              onClick={onClose}
              className="modal-close flex h-8 w-8 items-center justify-center rounded-full bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] transition-all active:scale-90"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status */}
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl transition-all"
              style={iconStyle}
            >
              {isUnavailable
                ? <AlertTriangle className="h-9 w-9 stroke-[1.5px]" />
                : <Icon className={`h-9 w-9 stroke-[1.5px] ${isTransition ? 'animate-pulse' : ''}`} />
              }
            </div>
            <p className={`text-2xl font-semibold ${stateColor}`}>{stateLabel}</p>
            {isDoorOpen && (
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-400">
                Tür steht offen
              </span>
            )}
          </div>

          {/* Actions */}
          {!isUnavailable && (
            <div className="grid grid-cols-2 gap-3 px-5 pb-5">
              <button
                type="button"
                data-haptic="card"
                disabled={isLocked || isLocking || isDoorOpen}
                onClick={lock}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--glass-bg-hover)] active:scale-95 disabled:opacity-30 disabled:cursor-default"
              >
                <Lock className="h-4 w-4 stroke-[1.5px]" />
                Sperren
              </button>
              <button
                type="button"
                data-haptic="card"
                disabled={isUnlocked || isUnlocking}
                onClick={unlock}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--glass-bg-hover)] active:scale-95 disabled:opacity-30 disabled:cursor-default"
              >
                <Unlock className="h-4 w-4 stroke-[1.5px]" />
                Öffnen
              </button>
            </div>
          )}
        </>
      )}
    </AccessibleModalShell>
  );
}
