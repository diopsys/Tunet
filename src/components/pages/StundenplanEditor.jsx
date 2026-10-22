import { memo, useEffect, useState } from 'react';

// ── Reine Hilfsfunktionen: geben jeweils eine neue Plan-Liste zurück ──────

const FARBEN = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#a855f7', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

const clone = (value) => JSON.parse(JSON.stringify(value));

function updatePlan(plans, planId, change) {
  return plans.map((plan) => (plan.id === planId ? change(clone(plan)) : plan));
}

/** Legt ein unbekanntes Fach mit Symbol und Farbe an bzw. ändert das Symbol. */
function ensureFach(plan, fach, emoji) {
  const faecher = { ...(plan.faecher || {}) };
  const bekannt = faecher[fach];
  if (!bekannt) {
    const farbe = FARBEN[Object.keys(faecher).length % FARBEN.length];
    faecher[fach] = { emoji: emoji || '📘', color: farbe };
  } else if (emoji && emoji !== bekannt.emoji) {
    faecher[fach] = { ...bekannt, emoji };
  }
  return { ...plan, faecher };
}

/** Eintrag einer Stunde setzen; null leert die Zelle. */
export function setCellEntry(plans, planId, nr, dayIdx, entry, emoji) {
  return updatePlan(plans, planId, (plan) => {
    const eintraege = { ...(plan.eintraege || {}) };
    const key = `${nr}-${dayIdx}`;
    if (!entry || !entry.fach) {
      delete eintraege[key];
      return { ...plan, eintraege };
    }
    const clean = { fach: entry.fach.trim() };
    if (entry.info?.trim()) clean.info = entry.info.trim();
    if (entry.optional) clean.optional = true;
    if (entry.von && entry.bis) Object.assign(clean, { von: entry.von, bis: entry.bis });
    eintraege[key] = Object.keys(clean).length === 1 ? clean.fach : clean;
    return ensureFach({ ...plan, eintraege }, clean.fach, emoji);
  });
}

/** Nachmittagstermin hinzufügen (index = null) oder ändern; termin = null löscht. */
export function setAfternoonEntry(plans, planId, dayIdx, index, termin, emoji) {
  return updatePlan(plans, planId, (plan) => {
    const nachmittag = { ...(plan.nachmittag || {}) };
    const tag = Array.isArray(nachmittag[dayIdx]) ? [...nachmittag[dayIdx]] : [];
    if (!termin || !termin.fach) {
      if (index != null) tag.splice(index, 1);
    } else {
      const clean = { fach: termin.fach.trim(), von: termin.von, bis: termin.bis };
      if (termin.info?.trim()) clean.info = termin.info.trim();
      if (index == null) tag.push(clean);
      else tag[index] = clean;
    }
    if (tag.length > 0) nachmittag[dayIdx] = tag;
    else delete nachmittag[dayIdx];
    const next = { ...plan, nachmittag };
    return termin?.fach ? ensureFach(next, termin.fach.trim(), emoji) : next;
  });
}

// ── Pläne (Personen) verwalten ───────────────────────────────────────────

/** Generische Zeiten für eine neue Person ohne Vorlage. */
export const STANDARD_STUNDEN = [
  { nr: 1, von: '08:00', bis: '08:45' },
  { nr: 2, von: '08:50', bis: '09:35' },
  { nr: 'P1', von: '09:35', bis: '09:55', isPause: true, label: 'Pause' },
  { nr: 3, von: '09:55', bis: '10:40' },
  { nr: 4, von: '10:45', bis: '11:30' },
  { nr: 'P2', von: '11:30', bis: '11:45', isPause: true, label: 'Pause' },
  { nr: 5, von: '11:45', bis: '12:30' },
  { nr: 6, von: '12:35', bis: '13:20' },
];

function uniqueId(plans, name) {
  const base = name.trim().toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c])
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'plan';
  const ids = new Set(plans.map((p) => p.id));
  let id = base;
  for (let i = 2; ids.has(id); i += 1) id = `${base}_${i}`;
  return id;
}

/** Neue Person anhängen; Stundenzeiten aus der Vorlage (Plan-ID) oder Standardzeiten, Einträge leer. */
export function addPlan(plans, { name, subtitle, vorlageId }) {
  const vorlage = plans.find((p) => p.id === vorlageId);
  const plan = {
    id: uniqueId(plans, name),
    name: name.trim(),
    stunden: clone(vorlage?.stunden || STANDARD_STUNDEN),
    eintraege: {},
  };
  if (subtitle?.trim()) plan.subtitle = subtitle.trim();
  return [...plans, plan];
}

export function updatePlanMeta(plans, planId, { name, subtitle }) {
  return updatePlan(plans, planId, (plan) => {
    const next = { ...plan, name: name.trim() };
    if (subtitle?.trim()) next.subtitle = subtitle.trim();
    else delete next.subtitle;
    return next;
  });
}

/** Person entfernen; die letzte bleibt immer erhalten. */
export function removePlan(plans, planId) {
  if (plans.length <= 1) return plans;
  return plans.filter((p) => p.id !== planId);
}

const DIALOG_CSS = `
  .spe-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  .spe-dialog {
    width: 100%; max-width: 380px;
    background: var(--modal-bg, var(--card-bg, #1e293b));
    border: 1px solid var(--glass-border);
    border-radius: 1.25rem;
    padding: 1.25rem;
    display: flex; flex-direction: column; gap: 0.75rem;
    color: var(--text-primary);
    box-shadow: 0 20px 50px rgba(0,0,0,0.4);
  }
  .spe-title { font-size: 0.95rem; font-weight: 600; }
  .spe-field { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
  .spe-field > span, .spe-check > span { font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.04em; }
  .spe-field input, .spe-field select {
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    border-radius: 0.6rem; padding: 0.5rem 0.65rem;
    color: var(--text-primary); font-size: 0.85rem;
  }
  .spe-field-small input { width: 5rem; }
  .spe-row { display: flex; gap: 0.75rem; }
  .spe-check { display: flex; align-items: center; gap: 0.5rem; }
  .spe-hint { font-size: 0.65rem; color: #f87171; }
  .spe-actions { display: flex; gap: 0.5rem; margin-top: 0.25rem; }
  .spe-spacer { flex: 1; }
  .spe-btn {
    border-radius: 0.7rem; padding: 0.5rem 0.9rem;
    font-size: 0.75rem; font-weight: 600;
    background: var(--glass-bg); border: 1px solid var(--glass-border);
    color: var(--text-secondary); cursor: pointer;
  }
  .spe-btn:disabled { opacity: 0.4; cursor: default; }
  .spe-btn-primary { background: var(--accent-color, #6366f1); border-color: transparent; color: #fff; }
  .spe-btn-danger { color: #f87171; }
`;

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.window?.addEventListener('keydown', onKey);
    return () => globalThis.window?.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * Person anlegen (plan = null) oder bearbeiten.
 * Beim Anlegen: Stundenzeiten von einer vorhandenen Person oder Standardzeiten.
 */
export const PlanDialog = memo(function PlanDialog({ plan, plans, canDelete, onSave, onDelete, onClose }) {
  const isNew = !plan;
  const [name, setName] = useState(plan?.name || '');
  const [subtitle, setSubtitle] = useState(plan?.subtitle || '');
  const [vorlageId, setVorlageId] = useState(plans[0]?.id || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEscape(onClose);

  const nameVergeben = plans.some((p) => p.id !== plan?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const kannSpeichern = name.trim() && !nameVergeben;

  const submit = (e) => {
    e.preventDefault();
    if (kannSpeichern) onSave({ name, subtitle, vorlageId: vorlageId || null });
  };

  return (
    <div className="spe-backdrop" onClick={onClose} role="presentation">
      <form className="spe-dialog" role="dialog" aria-modal="true" aria-label={isNew ? 'Person hinzufügen' : 'Person bearbeiten'}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="spe-title">{isNew ? 'Person hinzufügen' : `${plan.name} bearbeiten`}</h3>

        <label className="spe-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Felizitas" />
        </label>
        {nameVergeben && <p className="spe-hint">Diesen Namen gibt es schon.</p>}

        <label className="spe-field">
          <span>Untertitel</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="z. B. Klasse 2a" />
        </label>

        {isNew && (
          <label className="spe-field">
            <span>Stundenzeiten übernehmen von</span>
            <select value={vorlageId} onChange={(e) => setVorlageId(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="">Standardzeiten (ab 08:00)</option>
            </select>
          </label>
        )}

        {confirmDelete ? (
          <div className="spe-actions">
            <span className="spe-hint" style={{ alignSelf: 'center' }}>{plan.name} mit allen Einträgen entfernen?</span>
            <span className="spe-spacer" />
            <button type="button" className="spe-btn" onClick={() => setConfirmDelete(false)}>Nein</button>
            <button type="button" className="spe-btn spe-btn-danger" onClick={onDelete}>Entfernen</button>
          </div>
        ) : (
          <div className="spe-actions">
            {!isNew && canDelete && (
              <button type="button" className="spe-btn spe-btn-danger" onClick={() => setConfirmDelete(true)}>Entfernen</button>
            )}
            <span className="spe-spacer" />
            <button type="button" className="spe-btn" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="spe-btn spe-btn-primary" disabled={!kannSpeichern}>Speichern</button>
          </div>
        )}
      </form>
      <style>{DIALOG_CSS}</style>
    </div>
  );
});

// ── Dialog für Einträge ──────────────────────────────────────────────────

/**
 * Bearbeitungsdialog für eine Stunde oder einen Nachmittagstermin.
 * mode: 'stunde' (Fach, Zusatz, freiwillig) | 'nachmittag' (Fach, von, bis, Notiz)
 */
function EintragDialog({ mode, title, initial, faecher, onSave, onDelete, onClose }) {
  const [fach, setFach] = useState(initial?.fach || '');
  const [info, setInfo] = useState(initial?.info || '');
  const [optional, setOptional] = useState(!!initial?.optional);
  const [von, setVon] = useState(initial?.von || '');
  const [bis, setBis] = useState(initial?.bis || '');
  const [emoji, setEmoji] = useState(initial?.fach ? faecher?.[initial.fach]?.emoji || '' : '');

  // Symbol des gewählten Fachs vorschlagen, solange keins eingegeben wurde
  useEffect(() => {
    const bekannt = faecher?.[fach.trim()]?.emoji;
    if (bekannt) setEmoji(bekannt);
  }, [fach, faecher]);

  useEscape(onClose);

  const zeitFehlt = mode === 'nachmittag' && (!von || !bis);
  const zeitFalsch = mode === 'nachmittag' && von && bis && bis <= von;
  const kannSpeichern = fach.trim() && !zeitFehlt && !zeitFalsch;

  const submit = (e) => {
    e.preventDefault();
    if (!kannSpeichern) return;
    onSave({ fach, info, optional, von, bis }, emoji.trim());
  };

  return (
    <div className="spe-backdrop" onClick={onClose} role="presentation">
      <form
        className="spe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3 className="spe-title">{title}</h3>

        <label className="spe-field">
          <span>Fach / Aktivität</span>
          <input
            autoFocus
            list="spe-faecher"
            value={fach}
            onChange={(e) => setFach(e.target.value)}
            placeholder="z. B. Mathematik"
          />
          <datalist id="spe-faecher">
            {Object.keys(faecher || {}).map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>

        <label className="spe-field spe-field-small">
          <span>Symbol</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📘" maxLength={8} />
        </label>

        {mode === 'nachmittag' && (
          <div className="spe-row">
            <label className="spe-field">
              <span>von</span>
              <input type="time" value={von} onChange={(e) => setVon(e.target.value)} />
            </label>
            <label className="spe-field">
              <span>bis</span>
              <input type="time" value={bis} onChange={(e) => setBis(e.target.value)} />
            </label>
          </div>
        )}
        {zeitFalsch && <p className="spe-hint">„bis“ muss nach „von“ liegen.</p>}

        <label className="spe-field">
          <span>{mode === 'nachmittag' ? 'Notiz' : 'Zusatz (Klasse, Raum)'}</span>
          <input value={info} onChange={(e) => setInfo(e.target.value)} placeholder={mode === 'nachmittag' ? 'z. B. Halle 2' : 'z. B. Raum 06'} />
        </label>

        {mode === 'stunde' && (
          <label className="spe-check">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} />
            <span>freiwillig / nach Anmeldung (abgesetzt darstellen)</span>
          </label>
        )}

        <div className="spe-actions">
          {onDelete && (
            <button type="button" className="spe-btn spe-btn-danger" onClick={onDelete}>
              {mode === 'nachmittag' ? 'Löschen' : 'Leeren'}
            </button>
          )}
          <span className="spe-spacer" />
          <button type="button" className="spe-btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="spe-btn spe-btn-primary" disabled={!kannSpeichern}>Speichern</button>
        </div>
      </form>

      <style>{DIALOG_CSS}</style>
    </div>
  );
}

export default memo(EintragDialog);
