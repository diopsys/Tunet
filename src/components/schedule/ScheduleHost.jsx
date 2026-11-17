import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHomeAssistantEntities, useHomeAssistantMeta } from '../../contexts';
import { scheduleActions, useSchedules } from '../../hooks/useSchedules';
import { lazyWithRetry } from '../../utils/appUpdate';
import { OPEN_EDITOR_EVENT, OPEN_OVERVIEW_EVENT } from '../../utils/scheduleEvents';
import {
  createDraft,
  entityIdsForCard,
  formatClock,
  nextSwitchByEntity,
  scheduleContext,
} from '../../utils/scheduleModel';

const ScheduleEditorModal = lazyWithRetry(() => import('../../modals/ScheduleEditorModal'));
const ScheduleOverviewModal = lazyWithRetry(() => import('../../modals/ScheduleOverviewModal'));

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 10;
const BADGE_ATTR = 'data-schedule-next';

let areaCache = null;

/**
 * Zeitschaltuhr in der App: Übersicht und Editor, langer Druck auf eine Karte („Zeitplan für dieses
 * Gerät“) und das kleine Uhr-Symbol mit der nächsten Schaltzeit auf Karten, die einen Zeitplan haben.
 */
export default function ScheduleHost({ editMode, cardSettings, activePage, callService, t }) {
  const entities = useHomeAssistantEntities();
  const { conn, haConfig } = useHomeAssistantMeta();
  const state = useSchedules();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState(null);
  const [areas, setAreas] = useState(areaCache || []);
  const ctx = useMemo(() => scheduleContext(haConfig), [haConfig]);
  const anyOpen = overviewOpen || Boolean(editorDraft);

  useEffect(() => {
    if (!anyOpen || areaCache || !conn?.sendMessagePromise) return;
    conn
      .sendMessagePromise({ type: 'config/area_registry/list' })
      .then((list) => {
        areaCache = (Array.isArray(list) ? list : []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setAreas(areaCache);
      })
      .catch(() => {});
  }, [anyOpen, conn]);

  const settingsFor = useCallback(
    (cardId) => cardSettings?.[`${activePage}::${cardId}`] || cardSettings?.[cardId] || {},
    [cardSettings, activePage]
  );

  // Öffnen per Ereignis (Karte, Pill)
  useEffect(() => {
    const openOverview = () => setOverviewOpen(true);
    const openEditor = (event) => {
      const detail = event.detail || {};
      setEditorDraft(detail.schedule ? { ...detail.schedule } : createDraft({ entities: detail.entities || [] }));
    };
    window.addEventListener(OPEN_OVERVIEW_EVENT, openOverview);
    window.addEventListener(OPEN_EDITOR_EVENT, openEditor);
    return () => {
      window.removeEventListener(OPEN_OVERVIEW_EVENT, openOverview);
      window.removeEventListener(OPEN_EDITOR_EVENT, openEditor);
    };
  }, []);

  // Langer Druck auf eine Karte → Zeitplan für deren Geräte
  const pressRef = useRef(null);
  useEffect(() => {
    if (editMode) return undefined;
    const cancel = () => {
      if (pressRef.current) clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    };
    const onDown = (event) => {
      if (event.button !== 0) return;
      const card = event.target?.closest?.('[data-card-id]');
      if (!card) return;
      const cardId = card.getAttribute('data-card-id');
      if (cardId.startsWith('zeitschaltuhr_card_')) return;
      const ids = entityIdsForCard(cardId, settingsFor(cardId));
      if (!ids.length) return;
      cancel();
      pressRef.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          pressRef.current = null;
          navigator.vibrate?.(15);
          // Den Klick nach dem Loslassen schlucken, damit sich nicht zusätzlich die Karte öffnet
          const swallow = (e) => {
            e.stopPropagation();
            e.preventDefault();
          };
          window.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 800);
          setEditorDraft(createDraft({ entities: ids }));
        }, LONG_PRESS_MS),
      };
    };
    const onMove = (event) => {
      const p = pressRef.current;
      if (p && Math.hypot(event.clientX - p.x, event.clientY - p.y) > MOVE_TOLERANCE_PX) cancel();
    };
    const onContextMenu = (event) => {
      if (event.target?.closest?.('[data-card-id]') && pressRef.current) event.preventDefault();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cancel, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      cancel();
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cancel, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [editMode, settingsFor]);

  // Uhr-Symbol mit nächster Schaltzeit auf den Karten
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const id = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const vacation = Boolean(state.settings?.vacation);
    const byEntity = nextSwitchByEntity(state.schedules, minute * 60_000, ctx, { vacation });
    const apply = () => {
      document.querySelectorAll('[data-card-id]').forEach((card) => {
        const cardId = card.getAttribute('data-card-id');
        let best = null;
        if (!editMode && !cardId.startsWith('zeitschaltuhr_card_')) {
          for (const id of entityIdsForCard(cardId, settingsFor(cardId))) {
            const hit = byEntity.get(id);
            if (hit && (!best || hit.at < best.at)) best = hit;
          }
        }
        const value = best ? formatClock(best.at, ctx.tz) : null;
        if (value) {
          if (card.getAttribute(BADGE_ATTR) !== value) card.setAttribute(BADGE_ATTR, value);
        } else if (card.hasAttribute(BADGE_ATTR)) card.removeAttribute(BADGE_ATTR);
      });
    };
    apply();
    let pending = null;
    const observer = new globalThis.MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        apply();
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearTimeout(pending);
    };
  }, [state.schedules, state.settings, minute, ctx, editMode, settingsFor]);

  const save = async (draft) => {
    await scheduleActions.save(draft);
    setEditorDraft(null);
  };
  const remove = async (id) => {
    await scheduleActions.remove(id);
    setEditorDraft(null);
  };

  return (
    <Suspense fallback={null}>
      {overviewOpen && (
        <ScheduleOverviewModal
          open
          onClose={() => setOverviewOpen(false)}
          onEdit={(schedule) => setEditorDraft({ ...schedule })}
          onNew={(draft) => setEditorDraft(draft || createDraft())}
          state={state}
          entities={entities}
          areas={areas}
          haConfig={haConfig}
          callService={callService}
          t={t}
        />
      )}
      {editorDraft && (
        <ScheduleEditorModal
          open
          initial={editorDraft}
          onClose={() => setEditorDraft(null)}
          onSave={save}
          onDelete={remove}
          entities={entities}
          areas={areas}
          haConfig={haConfig}
          t={t}
        />
      )}
    </Suspense>
  );
}
