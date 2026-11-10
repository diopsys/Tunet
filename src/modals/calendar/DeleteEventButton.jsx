import { Trash2 } from '../../icons';

/**
 * Löschen-Knopf eines Termins: erster Klick fragt nach, zweiter löscht.
 * Bei Serienterminen (series) fragt er ausdrücklich nach der ganzen Serie.
 */
export default function DeleteEventButton({
  confirming,
  series,
  deleting,
  onRequest,
  onConfirm,
  onCancel,
  translate,
  compact = false,
}) {
  const asking = confirming || series;
  return (
    <button
      type="button"
      disabled={deleting}
      onClick={(e) => {
        e.stopPropagation();
        if (asking) onConfirm();
        else onRequest();
      }}
      onBlur={() => {
        if (asking && !deleting) onCancel();
      }}
      aria-label={translate('calendar.deleteEvent')}
      className={`flex flex-shrink-0 items-center gap-1.5 self-center rounded-full ${compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5'} text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-40 ${asking ? 'bg-[var(--status-error-bg)] text-[var(--status-error-fg)]' : 'text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
    >
      <Trash2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {series
        ? translate('calendar.deleteSeries')
        : confirming && translate('calendar.confirmDelete')}
    </button>
  );
}
