import { memo, useCallback, useMemo, useState } from 'react';
import EintragDialog, {
  FaecherDialog,
  PlanDialog,
  StundeDialog,
  addPlan,
  nextRowTimes,
  removePlan,
  setAfternoonEntry,
  setCellEntry,
  setRow,
  setWholeDay,
  updateFach,
  updatePlanMeta,
  usedFaecher,
} from './StundenplanEditor';

// ── Standard-Stundenplan (ohne Seiteneinstellungen) ──────────────────────

const STUNDEN = [
  { nr: 1, von: '07:51', bis: '08:40' },
  { nr: 2, von: '08:45', bis: '09:35' },
  { nr: 'P1', von: '09:35', bis: '09:55', isPause: true },
  { nr: 3, von: '09:55', bis: '10:40' },
  { nr: 4, von: '10:45', bis: '11:30' },
  { nr: 'P2', von: '11:30', bis: '11:45', isPause: true },
  { nr: 5, von: '11:45', bis: '12:30' },
];

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

// Mo=0, Di=1, Mi=2, Do=3, Fr=4
const FAECHER = {
  // 1. Stunde
  '1-0': 'Lernzeit', '1-1': 'Lernzeit', '1-2': 'Lernzeit', '1-3': 'Lernzeit', '1-4': 'Religion',
  // 2. Stunde
  '2-0': 'Lernzeit', '2-1': 'Musik', '2-2': 'Sport', '2-3': 'Lernzeit', '2-4': 'Lernzeit',
  // 3. Stunde
  '3-0': 'Lernzeit', '3-1': 'Lernzeit', '3-2': 'Sachunterricht', '3-3': 'Sachunterricht', '3-4': 'Kunst',
  // 4. Stunde
  '4-0': 'Kunst', '4-1': 'Lernzeit', '4-2': 'Religion', '4-3': 'Lernzeit', '4-4': 'SichBasis',
  // 5. Stunde (nur Dienstag)
  '5-0': null, '5-1': 'Sport', '5-2': null, '5-3': null, '5-4': null,
};

const FACH_META = {
  Lernzeit:       { emoji: '📚', label: 'Lernzeit',       color: '#6366f1', bg: 'rgba(99,102,241,0.13)'  },
  Musik:          { emoji: '🎵', label: 'Musik',           color: '#a855f7', bg: 'rgba(168,85,247,0.13)'  },
  Sport:          { emoji: '⚽', label: 'Sport',           color: '#22c55e', bg: 'rgba(34,197,94,0.13)'   },
  Sachunterricht: { emoji: '🔭', label: 'Sachunterricht',  color: '#f59e0b', bg: 'rgba(245,158,11,0.13)'  },
  Religion:       { emoji: '✝️', label: 'Religion',        color: '#f43f5e', bg: 'rgba(244,63,94,0.13)'   },
  Kunst:          { emoji: '🎨', label: 'Kunst',           color: '#ec4899', bg: 'rgba(236,72,153,0.13)'  },
  SichBasis:      { emoji: '🤝', label: 'Sichere Basis',   color: '#14b8a6', bg: 'rgba(20,184,166,0.13)'  },
};

const DEFAULT_PLAN = {
  id: 'standard',
  name: 'Stundenplan',
  subtitle: 'Grundschule',
  stunden: STUNDEN,
  eintraege: FAECHER,
  faecher: FACH_META,
};

/**
 * Pläne aus den Seiteneinstellungen (`pageSettings[page].plans`), sonst der
 * Standardplan. Ein Plan:
 * {
 *   id, name, subtitle?,
 *   stunden: [{ nr, von: 'HH:MM', bis: 'HH:MM', isPause?, label? }],   // label ersetzt die Nummer
 *   eintraege: { '<nr>-<tag 0..4>': 'Fach' | { fach, info?, optional?, von?, bis? } },  // von/bis: eigene Zeit
 *   ganztag?: { '<tag 0..4>': 'Fach' | { fach, info? } },   // gilt für alle Stunden des Tages
 *   nachmittag?: { '<tag 0..4>': [{ fach, von, bis, info? }] },  // Hobbys, eigener Bereich unter dem Plan
 *   faecher?: { Fach: { emoji, label?, color, bg? } },
 * }
 */
export function resolvePlans(settings) {
  const plans = Array.isArray(settings?.plans)
    ? settings.plans.filter((plan) => plan && Array.isArray(plan.stunden) && plan.stunden.length > 0)
    : [];
  return plans.length > 0 ? plans.map((plan, i) => ({ id: plan.id || `plan_${i}`, ...plan })) : [DEFAULT_PLAN];
}

/** Zelleninhalt: ganztägiger Eintrag vor Einzelstunde; leer = null. */
export function resolveCell(plan, nr, dayIdx) {
  const raw = plan.ganztag?.[dayIdx] ?? plan.eintraege?.[`${nr}-${dayIdx}`] ?? null;
  if (!raw) return null;
  const entry = typeof raw === 'string' ? { fach: raw } : raw;
  if (!entry.fach) return null;
  return { ...entry, ganztag: plan.ganztag?.[dayIdx] != null };
}

/** Nachmittagstermine eines Tages, nach Beginn sortiert (_index = Position in den Daten). */
export function resolveAfternoon(plan, dayIdx) {
  const raw = plan.nachmittag?.[dayIdx];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e, i) => (typeof e === 'string' ? { fach: e, _index: i } : e && { ...e, _index: i }))
    .filter((e) => e && e.fach)
    .sort((a, b) => (a.von || '').localeCompare(b.von || ''));
}

/** Bearbeitbare Kopie der Pläne; der eingebaute Standardplan wird dabei zu einem normalen Plan. */
function editablePlans(settings) {
  return JSON.parse(JSON.stringify(resolvePlans(settings)));
}

const FALLBACK_META = { emoji: '📘', color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' };

// Übliche Schul-Kürzel für die schmale (mobile) Ansicht
const KUERZEL = {
  Deutsch: 'De', Mathematik: 'Ma', Mathe: 'Ma', Englisch: 'En', Französisch: 'Frz', Latein: 'La',
  Spanisch: 'Spa', Musik: 'Mu', Sport: 'Sp', Kunst: 'Ku', Religion: 'Re', Sachunterricht: 'SU',
  Erdkunde: 'Ek', Geschichte: 'Ge', Physik: 'Ph', Chemie: 'Ch', Biologie: 'Bio', Informatik: 'Inf',
  Politik: 'Po', 'Werte und Normen': 'WuN', Verfügungsstunde: 'Verf', Lernzeit: 'LZ',
  SichBasis: 'SB', 'Sichere Basis': 'SB', Frühbetreuung: 'Früh', 'Chor/Frühbetreuung': 'Chor',
  Ganztag: 'GT', Schulband: 'Band', Studientag: 'Studientag',
};

/** Abkürzung: eigene (kurz), bekannte, sonst gekürzt auf 4 Zeichen. */
export function kurzName(fach, meta) {
  if (meta?.kurz) return meta.kurz;
  if (KUERZEL[fach]) return KUERZEL[fach];
  const label = meta?.label || fach;
  return label.length <= 5 ? label : `${label.slice(0, 4)}.`;
}

function metaFor(plan, fach) {
  const meta = plan.faecher?.[fach] || FACH_META[fach] || FALLBACK_META;
  const bg = meta.bg || `color-mix(in srgb, ${meta.color} 13%, transparent)`;
  return { ...meta, label: meta.label || fach, kurz: kurzName(fach, meta), bg };
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function useNow() {
  const now = new Date();
  return {
    day:     now.getDay(),        // 0=So, 1=Mo … 5=Fr, 6=Sa
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

function isStundeActive(stunde, minutes) {
  return minutes >= timeToMinutes(stunde.von) && minutes < timeToMinutes(stunde.bis);
}

/** Eintrag mit eigener Zeit (z. B. Freizeit) läuft nach seiner Zeit, sonst nach der Zeile. */
export function isEntryActive(entry, stunde, minutes) {
  if (entry?.von && entry?.bis) return isStundeActive(entry, minutes);
  return isStundeActive(stunde, minutes);
}

function entryInfo(entry) {
  const zeit = entry.von && entry.bis ? `${entry.von}–${entry.bis}` : null;
  return [zeit, entry.info].filter(Boolean).join(' · ') || null;
}

const storageKey = (pageId) => `tunet_stundenplan_plan_${pageId || 'default'}`;

function readStoredPlan(pageId) {
  try {
    return localStorage.getItem(storageKey(pageId));
  } catch {
    return null;
  }
}

function storePlan(pageId, planId) {
  try {
    localStorage.setItem(storageKey(pageId), planId);
  } catch {
    // Speicher nicht verfügbar – Auswahl gilt dann nur für diese Sitzung
  }
}

// ── Sub-Komponenten ──────────────────────────────────────────────────────

const FachCell = memo(function FachCell({ entry, meta, isToday, isActive, onEdit }) {
  const editProps = onEdit
    ? { onClick: onEdit, role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && onEdit() }
    : {};

  if (!entry) {
    return (
      <td className={`sp-cell sp-empty${onEdit ? ' sp-editable' : ''}`} {...editProps}>
        {onEdit && <span className="sp-add" aria-label="Eintrag hinzufügen">+</span>}
      </td>
    );
  }

  const classes = [
    'sp-cell',
    isToday ? 'sp-today' : '',
    isActive ? 'sp-active' : '',
    entry.optional || entry.ganztag ? 'sp-muted' : '',
    onEdit ? 'sp-editable' : '',
  ].filter(Boolean).join(' ');

  return (
    <td className={classes} style={{ '--fach-color': meta.color, '--fach-bg': meta.bg }} {...editProps}>
      <div className="sp-fach">
        <span className="sp-fach-emoji">{meta.emoji}</span>
        <span className="sp-fach-text">
          <span className="sp-fach-label">{meta.label}</span>
          <span className="sp-fach-kurz">{meta.kurz}</span>
          {entryInfo(entry) && <span className="sp-fach-info">{entryInfo(entry)}</span>}
        </span>
        {isActive && <span className="sp-live-dot" aria-hidden="true" />}
      </div>
    </td>
  );
});

const PauseRow = memo(function PauseRow({ stunde, onEdit }) {
  const editProps = onEdit
    ? { onClick: onEdit, role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && onEdit() }
    : {};
  return (
    <tr className="sp-pause-row">
      <td colSpan={6} className={`sp-pause-bar-cell${onEdit ? ' sp-editable' : ''}`} {...editProps}>
        <span className="sp-pause-badge">
          {stunde.label || 'Pause'}
          {onEdit && ` · ${stunde.von}–${stunde.bis}`}
        </span>
      </td>
    </tr>
  );
});

// ── Haupt-Komponente ─────────────────────────────────────────────────────

function StundenplanPage({ isMobile = false, pageId, settings, editMode = false, onSavePlans }) {
  const { day, minutes } = useNow();
  // day: 1=Mo,2=Di,3=Mi,4=Do,5=Fr → colIdx 0–4
  const todayColIdx = useMemo(() => (day >= 1 && day <= 5 ? day - 1 : -1), [day]);

  const plans = useMemo(() => resolvePlans(settings), [settings]);
  const [selectedId, setSelectedId] = useState(() => readStoredPlan(pageId));
  const plan = plans.find((p) => p.id === selectedId) || plans[0];

  const selectPlan = (planId) => {
    setSelectedId(planId);
    storePlan(pageId, planId);
  };

  // ── Bearbeiten (nur im Bearbeiten-Modus und wenn gespeichert werden kann) ──
  const canEdit = editMode && typeof onSavePlans === 'function';
  const [dialog, setDialog] = useState(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const saveDialog = (value, emoji) => {
    const base = editablePlans(settings);
    let next;
    if (dialog.mode === 'stunde') next = setCellEntry(base, plan.id, dialog.nr, dialog.day, value, emoji);
    else if (dialog.mode === 'ganztag') next = setWholeDay(base, plan.id, dialog.day, value, emoji);
    else next = setAfternoonEntry(base, plan.id, dialog.day, dialog.index, value, emoji);
    onSavePlans(next);
    setDialog(null);
  };

  // Zeilen (Zeiten) und Fächer
  const [rowDialog, setRowDialog] = useState(null);
  const closeRowDialog = useCallback(() => setRowDialog(null), []);
  const saveRow = (row) => {
    onSavePlans(setRow(editablePlans(settings), plan.id, rowDialog.index, row));
    setRowDialog(null);
  };
  const deleteRow = () => {
    onSavePlans(setRow(editablePlans(settings), plan.id, rowDialog.index, null));
    setRowDialog(null);
  };
  const newRow = (isPause) => setRowDialog({
    index: null,
    row: null,
    vorschlag: { ...nextRowTimes(plan, isPause), art: isPause ? 'pause' : 'stunde' },
  });

  const [faecherOpen, setFaecherOpen] = useState(false);
  const closeFaecher = useCallback(() => setFaecherOpen(false), []);
  const saveFach = (alt, werte) => onSavePlans(updateFach(editablePlans(settings), plan.id, alt, werte));

  const openWholeDay = (di) => {
    const raw = plan.ganztag?.[di];
    setDialog({
      mode: 'ganztag',
      day: di,
      initial: typeof raw === 'string' ? { fach: raw } : raw || null,
      title: `${TAGE[di]} – ganzer Tag`,
    });
  };

  // Personen (Pläne) anlegen, umbenennen, entfernen
  const [planDialog, setPlanDialog] = useState(null);
  const closePlanDialog = useCallback(() => setPlanDialog(null), []);

  const savePlanDialog = ({ name, subtitle, vorlageId }) => {
    const base = editablePlans(settings);
    if (planDialog.plan) {
      onSavePlans(updatePlanMeta(base, planDialog.plan.id, { name, subtitle }));
    } else {
      const next = addPlan(base, { name, subtitle, vorlageId });
      onSavePlans(next);
      selectPlan(next[next.length - 1].id);
    }
    setPlanDialog(null);
  };

  const deletePlan = () => {
    const next = removePlan(editablePlans(settings), planDialog.plan.id);
    onSavePlans(next);
    selectPlan(next[0].id);
    setPlanDialog(null);
  };

  const deleteDialog = () => {
    const base = editablePlans(settings);
    let next;
    if (dialog.mode === 'stunde') next = setCellEntry(base, plan.id, dialog.nr, dialog.day, null);
    else if (dialog.mode === 'ganztag') next = setWholeDay(base, plan.id, dialog.day, null);
    else next = setAfternoonEntry(base, plan.id, dialog.day, dialog.index, null);
    onSavePlans(next);
    setDialog(null);
  };

  // Legende: nur Fächer, die im Plan vorkommen
  const legend = useMemo(() => {
    const used = new Set();
    Object.values(plan.eintraege || {}).forEach((raw) => {
      const fach = typeof raw === 'string' ? raw : raw?.fach;
      if (fach) used.add(fach);
    });
    Object.values(plan.ganztag || {}).forEach((raw) => {
      const fach = typeof raw === 'string' ? raw : raw?.fach;
      if (fach) used.add(fach);
    });
    TAGE.forEach((_, di) => resolveAfternoon(plan, di).forEach((e) => used.add(e.fach)));
    return [...used].map((fach) => [fach, metaFor(plan, fach)]);
  }, [plan]);

  const hasAfternoon = TAGE.some((_, di) => resolveAfternoon(plan, di).length > 0);

  const subtitleDate = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="sp-root">
      <div className="sp-header">
        <h2 className="sp-title">{plans.length > 1 ? `Stundenplan · ${plan.name}` : 'Stundenplan'}</h2>
        <p className="sp-subtitle">{plan.subtitle ? `${plan.subtitle} · ${subtitleDate}` : subtitleDate}</p>
      </div>

      {(plans.length > 1 || canEdit) && (
        <div className="sp-switch">
          <div className="sp-switch" role="tablist" aria-label="Stundenplan auswählen">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === plan.id}
                data-haptic="card"
                onClick={() => selectPlan(p.id)}
                className={`sp-switch-btn${p.id === plan.id ? ' sp-switch-active' : ''}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          {canEdit && (
            <>
              <button
                type="button"
                className="sp-switch-btn sp-switch-tool"
                aria-label={`${plan.name} bearbeiten`}
                onClick={() => setPlanDialog({ plan })}
              >
                ✎
              </button>
              <button
                type="button"
                className="sp-switch-btn sp-switch-tool"
                onClick={() => setPlanDialog({ plan: null })}
              >
                + Person
              </button>
              <button
                type="button"
                className="sp-switch-btn sp-switch-tool"
                onClick={() => setFaecherOpen(true)}
              >
                Fächer
              </button>
            </>
          )}
        </div>
      )}

      <div className="sp-table-wrap">
        <table className="sp-table">
          <thead>
            <tr>
              <th className="sp-th sp-th-time">Zeit</th>
              {TAGE.map((tag, di) => (
                <th
                  key={tag}
                  className={`sp-th${di === todayColIdx ? ' sp-th-today' : ''}${canEdit ? ' sp-editable' : ''}`}
                  {...(canEdit ? {
                    onClick: () => openWholeDay(di),
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${tag} – ganzer Tag`,
                    onKeyDown: (e) => e.key === 'Enter' && openWholeDay(di),
                  } : {})}
                >
                  <span className="sp-day-full">{tag}</span>
                  <span className="sp-day-short">{tag.slice(0, 2)}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {plan.stunden.map((stunde, rowIndex) => {
              const editRow = canEdit ? () => setRowDialog({ index: rowIndex, row: stunde }) : null;
              if (stunde.isPause) {
                return <PauseRow key={stunde.nr} stunde={stunde} onEdit={editRow} />;
              }

              const isRowActive = isStundeActive(stunde, minutes);

              return (
                <tr key={stunde.nr} className={`sp-row${isRowActive ? ' sp-row-active' : ''}`}>
                  <td
                    className={`sp-time-cell${canEdit ? ' sp-editable' : ''}`}
                    {...(editRow ? {
                      onClick: editRow,
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `Zeit ${stunde.label || `${stunde.nr}. Stunde`} bearbeiten`,
                      onKeyDown: (e) => e.key === 'Enter' && editRow(),
                    } : {})}
                  >
                    {stunde.label ? (
                      <span className="sp-stunde-nr sp-stunde-label">{stunde.label}</span>
                    ) : isMobile ? (
                      <>
                        <span className="sp-stunde-nr sp-stunde-nr-block">{stunde.nr}.</span>
                        <span className="sp-time-stacked">{stunde.von}</span>
                        <span className="sp-time-stacked">{stunde.bis}</span>
                      </>
                    ) : (
                      <span className="sp-time-inline">{stunde.nr}. {stunde.von}–{stunde.bis}</span>
                    )}
                  </td>
                  {TAGE.map((_, di) => {
                    const entry = resolveCell(plan, stunde.nr, di);
                    const isToday = di === todayColIdx;
                    const isActive = isToday && !!entry && !entry.ganztag && isEntryActive(entry, stunde, minutes);
                    return (
                      <FachCell
                        key={di}
                        entry={entry}
                        meta={entry ? metaFor(plan, entry.fach) : null}
                        isToday={isToday}
                        isActive={isActive}
                        onEdit={canEdit && !entry?.ganztag ? () => {
                          const raw = plan.eintraege?.[`${stunde.nr}-${di}`];
                          setDialog({
                            mode: 'stunde',
                            nr: stunde.nr,
                            day: di,
                            initial: typeof raw === 'string' ? { fach: raw } : raw || null,
                            title: `${TAGE[di]}, ${stunde.nr}. Stunde`,
                          });
                        } : null}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {canEdit && (
          <div className="sp-row-tools">
            <button type="button" className="sp-add-btn" onClick={() => newRow(false)}>+ Stunde</button>
            <button type="button" className="sp-add-btn" onClick={() => newRow(true)}>+ Pause</button>
          </div>
        )}
      </div>

      {/* Nachmittag (Hobbys) – eigener Bereich, Uhrzeit steht im Eintrag */}
      {(hasAfternoon || canEdit) && (
        <div className="sp-table-wrap">
          <table className="sp-table">
            <tbody>
              <tr>
                <td className="sp-time-cell sp-th-time">
                  <span className="sp-stunde-nr sp-stunde-label">Nachmittag</span>
                </td>
                {TAGE.map((_, di) => {
                  const termine = resolveAfternoon(plan, di);
                  const isToday = di === todayColIdx;
                  // „Heute“ nur hervorheben, wenn es auch Termine gibt – eine leere helle Fläche wirkt wie ein Fehler
                  return (
                    <td key={di} className={`sp-cell sp-afternoon${isToday && termine.length > 0 ? ' sp-today' : ''}`}>
                      {termine.map((termin, ti) => {
                        const meta = metaFor(plan, termin.fach);
                        const isActive = isToday && !!termin.von && !!termin.bis && isStundeActive(termin, minutes);
                        const openEdit = () => setDialog({
                          mode: 'nachmittag',
                          day: di,
                          index: termin._index,
                          initial: termin,
                          title: `${TAGE[di]}, Nachmittag`,
                        });
                        return (
                          <div
                            key={ti}
                            className={`sp-fach sp-termin${isActive ? ' sp-termin-active' : ''}${canEdit ? ' sp-editable' : ''}`}
                            style={{ '--fach-color': meta.color, '--fach-bg': meta.bg }}
                            {...(canEdit ? { onClick: openEdit, role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && openEdit() } : {})}
                          >
                            <span className="sp-fach-emoji">{meta.emoji}</span>
                            <span className="sp-fach-text">
                              <span className="sp-fach-label">{meta.label}</span>
                              <span className="sp-fach-kurz">{meta.kurz}</span>
                              {entryInfo(termin) && <span className="sp-fach-info">{entryInfo(termin)}</span>}
                            </span>
                            {isActive && <span className="sp-live-dot" aria-hidden="true" />}
                          </div>
                        );
                      })}
                      {canEdit && (
                        <button
                          type="button"
                          className="sp-add-btn"
                          aria-label={`Termin am ${TAGE[di]} hinzufügen`}
                          onClick={() => setDialog({ mode: 'nachmittag', day: di, index: null, initial: null, title: `${TAGE[di]}, Nachmittag` })}
                        >
                          +
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {rowDialog && (
        <StundeDialog
          row={rowDialog.row}
          vorschlag={rowDialog.vorschlag}
          onSave={saveRow}
          onDelete={rowDialog.row && plan.stunden.length > 1 ? deleteRow : null}
          onClose={closeRowDialog}
        />
      )}

      {faecherOpen && (
        <FaecherDialog
          faecher={usedFaecher(plan)}
          metaFor={(fach) => metaFor(plan, fach)}
          onSave={saveFach}
          onClose={closeFaecher}
        />
      )}

      {planDialog && (
        <PlanDialog
          plan={planDialog.plan}
          plans={plans}
          canDelete={plans.length > 1}
          onSave={savePlanDialog}
          onDelete={deletePlan}
          onClose={closePlanDialog}
        />
      )}

      {dialog && (
        <EintragDialog
          mode={dialog.mode}
          title={dialog.title}
          initial={dialog.initial}
          faecher={{ ...FACH_META, ...(plan.faecher || {}) }}
          onSave={saveDialog}
          onDelete={dialog.initial ? deleteDialog : null}
          onClose={closeDialog}
        />
      )}

      {/* Legende */}
      <div className="sp-legend">
        {legend.map(([key, meta]) => (
          <div
            key={key}
            className="sp-legend-item"
            style={{ '--fach-color': meta.color, '--fach-bg': meta.bg }}
          >
            <span className="sp-legend-emoji">{meta.emoji}</span>
            <span className="sp-legend-label">{meta.label}</span>
          </div>
        ))}
      </div>

      <style>{`
        .sp-root {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .sp-header { display: flex; flex-direction: column; gap: 0.25rem; }
        .sp-title {
          font-size: 1.5rem;
          font-weight: 300;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .sp-subtitle { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.05em; }

        /* Table wrapper */
        .sp-table-wrap {
          overflow-x: auto;
          border-radius: 1.25rem;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          padding: 0.5rem;
        }
        .sp-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 3px;
          table-layout: fixed;
        }
        /* Time column subtle tint */
        .sp-time-cell,
        .sp-th-time {
          background: color-mix(in srgb, var(--glass-bg) 60%, transparent);
          border-radius: 0.5rem;
        }

        /* Header */
        .sp-th {
          padding: 0.6rem 0.5rem;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
          text-align: center;
        }
        .sp-th-time { width: 130px; text-align: left; }
        .sp-th-today {
          color: var(--accent-color, #6366f1);
          background: var(--accent-bg, rgba(99,102,241,0.08));
          border-radius: 0.75rem 0.75rem 0 0;
        }

        /* Responsive day names */
        .sp-day-short { display: none; }
        @media (max-width: 768px) {
          .sp-day-full { display: none; }
          .sp-day-short { display: inline; }
          .sp-th-time { width: 52px; }
          .sp-time-cell { white-space: normal; padding: 0.4rem 0.3rem; }
          .sp-stunde-nr { display: block; margin-right: 0; }
          .sp-time-sep { display: none; }
          .sp-time-von, .sp-time-bis { display: block; font-size: 0.55rem; line-height: 1.3; }
        }

        /* Time cell */
        .sp-time-cell {
          padding: 0.5rem 0.6rem;
          text-align: left;
          vertical-align: middle;
          white-space: nowrap;
        }
        .sp-stunde-nr {
          display: inline;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          margin-right: 0.3rem;
        }
        .sp-time-inline {
          font-size: 0.62rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .sp-stunde-nr-block { display: block; margin-right: 0; }
        .sp-time-stacked {
          display: block;
          font-size: 0.55rem;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          line-height: 1.3;
        }

        /* Subject cells */
        .sp-cell {
          padding: 0.35rem;
          vertical-align: middle;
          border-radius: 0.75rem;
          transition: background 0.2s;
        }
        .sp-cell.sp-today {
          background: color-mix(in srgb, var(--glass-bg) 80%, transparent);
        }
        .sp-cell.sp-active {
          background: var(--fach-bg, rgba(99,102,241,0.13));
          outline: 1.5px solid color-mix(in srgb, var(--fach-color, #6366f1) 50%, transparent);
        }
        .sp-empty { background: transparent; }

        /* Fach pill */
        .sp-fach {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--fach-bg, var(--glass-bg));
          border-radius: 0.6rem;
          padding: 0.45rem 0.5rem;
          min-height: 2.4rem;
        }
        .sp-cell.sp-active .sp-fach {
          background: var(--fach-bg, rgba(99,102,241,0.13));
        }
        .sp-fach-emoji { font-size: 0.95rem; flex-shrink: 0; line-height: 1; }
        .sp-fach-label {
          font-size: 0.62rem;
          font-weight: 600;
          color: var(--fach-color, var(--text-secondary));
          letter-spacing: 0.02em;
          line-height: 1.2;
          flex: 1;
        }
        @media (max-width: 768px) {
          .sp-fach-label { display: none; }
          .sp-fach { justify-content: center; padding: 0.4rem; min-height: 2rem; }
          .sp-fach-emoji { font-size: 1.1rem; }
        }

        /* Live dot */
        .sp-live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--fach-color, #6366f1);
          flex-shrink: 0;
          animation: sp-pulse 1.4s ease-in-out infinite;
        }
        @keyframes sp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }

        /* Row highlight */
        .sp-row { transition: background 0.2s; }
        .sp-row-active > .sp-time-cell .sp-stunde-nr {
          color: var(--accent-color, #6366f1);
        }

        /* Pause row */
        .sp-pause-row { height: 2.6rem; }
        .sp-pause-row .sp-time-cell { padding: 0.5rem 0.6rem; vertical-align: middle; }
        .sp-time-range {
          display: block;
          font-size: 0.62rem;
          font-weight: 400;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          padding-left: 1.5ch;
        }
        .sp-pause-bar-cell {
          padding: 0;
          background: var(--glass-bg);
          border-radius: 0.5rem;
          text-align: center;
          vertical-align: middle;
        }
        .sp-pause-badge {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        /* Legend — nur auf Mobile (Desktop: Fachname steht in der Zelle) */
        .sp-legend {
          display: none;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        @media (max-width: 768px) {
          .sp-legend { display: flex; }
        }
        .sp-legend-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--fach-bg);
          border-radius: 999px;
          padding: 0.25rem 0.6rem;
        }
        .sp-legend-emoji {
          font-size: 0.75rem;
          flex-shrink: 0;
          line-height: 1;
        }
        .sp-legend-label {
          font-size: 0.6rem;
          font-weight: 600;
          color: var(--fach-color);
          letter-spacing: 0.04em;
        }

        /* Plan-Umschalter */
        .sp-switch { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .sp-switch-btn {
          border-radius: 999px;
          border: 1px solid transparent;
          background: var(--glass-bg);
          color: var(--text-secondary);
          padding: 0.45rem 1rem;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          touch-action: manipulation;
        }
        .sp-switch-btn:hover { background: var(--glass-bg-hover); color: var(--text-primary); }
        .sp-switch-active {
          border-color: var(--glass-border);
          background: var(--glass-bg-hover);
          color: var(--text-primary);
        }

        /* Fach mit Zusatzangabe (Klasse, Raum) */
        .sp-fach-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .sp-fach-info {
          font-size: 0.55rem;
          color: var(--text-muted);
          letter-spacing: 0.02em;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 768px) {
          .sp-fach { flex-direction: column; gap: 0.15rem; }
          .sp-fach-text { align-items: center; }
          .sp-fach-info { font-size: 0.5rem; }
        }

        /* Abkürzung nur in der schmalen Ansicht */
        .sp-fach-kurz { display: none; }
        @media (max-width: 768px) {
          .sp-root { padding: 0.75rem 0; gap: 1rem; }
          .sp-table-wrap { padding: 0.2rem; border-radius: 0.9rem; }
          .sp-table { border-spacing: 2px; }
          .sp-th { padding: 0.45rem 0.1rem; font-size: 0.6rem; letter-spacing: 0.04em; }
          .sp-th-time { width: 40px; }
          .sp-time-cell { padding: 0.3rem 0.15rem; }
          .sp-cell { padding: 0.1rem; border-radius: 0.5rem; }
          .sp-fach { padding: 0.3rem 0.1rem; min-height: 2.6rem; gap: 0.1rem; border-radius: 0.45rem; }
          .sp-fach-emoji { font-size: 0.75rem; }
          .sp-fach-kurz {
            display: block;
            font-size: 0.66rem;
            font-weight: 700;
            color: var(--fach-color, var(--text-secondary));
            line-height: 1.15;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sp-fach-info { font-size: 0.48rem; text-align: center; max-width: 100%; }
          .sp-live-dot { display: none; }
        }

        /* Zeilen hinzufügen */
        .sp-row-tools { display: flex; gap: 0.5rem; padding: 0.25rem 3px 0; }
        .sp-row-tools .sp-add-btn { width: auto; flex: 1; margin-top: 0; }

        /* Werkzeuge neben den Personen (nur im Bearbeiten-Modus) */
        .sp-switch-tool { border-style: dashed; border-color: var(--glass-border); }

        /* Bearbeiten */
        .sp-editable { cursor: pointer; }
        .sp-editable:hover .sp-fach, .sp-termin.sp-editable:hover { outline: 1.5px dashed var(--glass-border); }
        .sp-cell.sp-empty.sp-editable:hover { background: var(--glass-bg); }
        .sp-add {
          display: flex; align-items: center; justify-content: center;
          min-height: 2rem; color: var(--text-muted); opacity: 0.5; font-size: 1rem;
        }
        .sp-add-btn {
          width: 100%; margin-top: 3px; padding: 0.3rem;
          border: 1px dashed var(--glass-border); border-radius: 0.6rem;
          background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.9rem;
        }
        .sp-add-btn:hover { background: var(--glass-bg); color: var(--text-primary); }

        /* Nachmittag: mehrere Termine je Tag untereinander */
        .sp-afternoon { vertical-align: top; }
        .sp-termin + .sp-termin { margin-top: 3px; }
        .sp-termin-active { outline: 1.5px solid color-mix(in srgb, var(--fach-color, #6366f1) 50%, transparent); }

        /* Zeile mit Bezeichnung statt Nummer (z. B. Ganztag) */
        .sp-stunde-label { display: block; font-size: 0.62rem; white-space: normal; }

        /* Freiwillige / ganztägige Einträge abgesetzt */
        .sp-cell.sp-muted .sp-fach { opacity: 0.55; }
        .sp-cell.sp-muted .sp-fach-label { font-style: italic; }
      `}</style>
    </div>
  );
}

export default memo(StundenplanPage);
