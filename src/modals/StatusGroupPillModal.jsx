import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Check, X, getIconComponent } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import {
  getHeatingDetails,
  resolveStatusGroupListItems,
  resolveStatusGroupPill,
} from '../utils/statusGroupPills';

const translate = (t, key, fallback) => {
  const value = typeof t === 'function' ? t(key) : key;
  return value && value !== key ? String(value) : fallback;
};

const getEntityName = (id, entity) => entity?.attributes?.friendly_name || id;

const getStateLabel = (entity, t) => {
  const state = String(entity?.state || 'unknown');
  const domain = String(entity?.entity_id || '').split('.')[0];
  const domainKey = domain ? `${domain}.${state}` : '';
  const translated = domainKey ? translate(t, domainKey, '') : '';
  if (translated) return translated;
  const commonKey = `common.${state}`;
  return translate(t, commonKey, state);
};

export default function StatusGroupPillModal({
  show,
  onClose,
  modalState,
  entities,
  callService,
  t,
}) {
  const pill = modalState?.pill || null;
  const groupData = useMemo(
    () => (pill ? resolveStatusGroupPill(pill, entities, t) : null),
    [entities, pill, t]
  );
  const preset = groupData?.preset || null;
  const items = useMemo(() => (pill ? resolveStatusGroupListItems(pill, entities) : []), [entities, pill]);
  const isHeating = preset?.id === 'heating_on';
  const activeCount = groupData?.count ?? 0;
  const title = groupData?.syntheticEntity?.attributes?.friendly_name || '';
  const Icon =
    getIconComponent(pill?.icon || preset?.icon || 'Activity') || getIconComponent('Activity');
  const hasAction = Boolean(preset?.actionDomain && preset?.actionService && callService);
  const actionLabel = preset
    ? translate(t, preset.actionLabelKey, preset.fallbackActionLabel || '')
    : '';
  const rowActionLabel = preset
    ? translate(t, preset.rowActionLabelKey, preset.fallbackRowActionLabel || '')
    : '';
  const modalTitleId = 'status-group-pill-modal-title';

  const runAction = (entityIds) => {
    if (!hasAction || !entityIds.length) return;
    callService(preset.actionDomain, preset.actionService, { entity_id: entityIds });
  };

  if (!show || !pill || !groupData || !preset) return null;

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border p-5 font-sans shadow-2xl backdrop-blur-xl md:rounded-[3rem] md:p-6"
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
            className="modal-close absolute top-5 right-5 z-10 md:top-6 md:right-6"
            aria-label={translate(t, 'common.close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-4 pr-12">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${pill.iconColor || preset.iconColor}`}
                style={{ backgroundColor: pill.iconBgColor || preset.iconBgColor }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2
                  id={modalTitleId}
                  className="truncate text-2xl leading-tight font-bold tracking-wide text-[var(--text-primary)]"
                >
                  {title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
                    {activeCount} {translate(t, 'statusPills.groupMatchedEntities', 'matching')}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {groupData.syntheticEntity.attributes.statusPillSublabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {hasAction && activeCount > 0 && (
            <div className="mt-5">
              <button
                onClick={() => runAction(items.filter((item) => item.active).map(({ id }) => id))}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm font-bold text-[var(--status-success-fg)] transition-opacity hover:opacity-90"
              >
                <Check className="h-4 w-4" />
                {actionLabel}
              </button>
            </div>
          )}

          <div className="custom-scrollbar -mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1">
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map(({ id, entity, active }) => {
                  const details = isHeating ? getHeatingDetails(id, entity, entities, pill) : null;
                  const grad = (v) => (v == null ? '–' : `${v.toFixed(1).replace('.', ',')} °C`);
                  return (
                    <div
                      key={id}
                      className={`popup-surface flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${isHeating && active ? 'ring-1 ring-orange-400/50' : ''} ${isHeating && !active ? 'opacity-60' : ''}`}
                      style={isHeating && active ? { backgroundColor: 'rgba(249,115,22,0.10)' } : undefined}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                          {getEntityName(id, entity)}
                        </p>
                        {details ? (
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {translate(t, 'statusPills.groupHeatingTarget', 'Target')} {grad(details.target)} ·{' '}
                            {translate(t, 'statusPills.groupHeatingCurrent', 'Current')} {grad(details.current)}
                          </p>
                        ) : (
                          <p className="truncate text-xs text-[var(--text-muted)]">{id}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {details ? (
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${active ? 'text-orange-300' : 'text-[var(--text-secondary)]'}`}
                            style={{ backgroundColor: active ? 'rgba(249,115,22,0.18)' : 'var(--glass-bg)' }}
                            title={translate(t, 'statusPills.groupHeatingValve', 'Valve')}
                          >
                            {translate(t, 'statusPills.groupHeatingValve', 'Valve')} {details.valve == null ? '–' : `${Math.round(details.valve)} %`}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--glass-bg)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] uppercase">
                            {getStateLabel({ ...entity, entity_id: id }, t)}
                          </span>
                        )}
                        {hasAction && rowActionLabel && active && (
                          <button
                            onClick={() => runAction([id])}
                            className="rounded-full bg-[var(--accent-bg)] px-3 py-1.5 text-[10px] font-bold text-[var(--accent-color)] transition-opacity hover:opacity-90"
                          >
                            {rowActionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="popup-surface rounded-2xl p-6 text-center text-sm text-[var(--text-muted)]">
                {translate(t, preset.emptyLabelKey, preset.fallbackEmptyLabel)}
              </div>
            )}
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}

StatusGroupPillModal.propTypes = {
  show: PropTypes.bool,
  onClose: PropTypes.func,
  modalState: PropTypes.shape({
    pill: PropTypes.object,
    presetId: PropTypes.string,
  }),
  entities: PropTypes.object,
  callService: PropTypes.func,
  t: PropTypes.func,
};
