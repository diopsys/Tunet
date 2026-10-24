import { memo, useEffect, useRef, useState } from 'react';
import { symbolVorschlag } from './stundenplanSymbole';

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
    faecher[fach] = { emoji: emoji || symbolVorschlag(fach) || '📘', color: farbe };
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

// ── Zeilen (Stunden, Pausen, benannte Zeilen) ────────────────────────────

export function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(Math.max(h * 60 + m + minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const isLesson = (row) => !row.isPause && !row.label;

/**
 * Zeilen nach Beginn sortieren, Stunden 1…n und Pausen P1…n neu nummerieren
 * und die Einträge auf die neuen Nummern umhängen. Einträge gelöschter
 * Zeilen fallen weg; benannte Zeilen behalten ihre Kennung.
 */
export function sortAndRenumber(plan) {
  const rows = (plan.stunden || []).map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.von.localeCompare(b.row.von) || a.i - b.i)
    .map(({ row }) => row);

  const mapping = {};
  let lesson = 0;
  let pause = 0;
  const used = new Set(rows.filter((r) => r.label && !r.isPause).map((r) => String(r.nr)));
  const stunden = rows.map((row) => {
    if (row.isPause) {
      pause += 1;
      return { ...row, nr: `P${pause}` };
    }
    if (row.label) {
      return row;
    }
    lesson += 1;
    while (used.has(String(lesson))) lesson += 1;
    if (row.nr != null) mapping[String(row.nr)] = lesson;
    return { ...row, nr: lesson };
  });

  const keep = new Set(stunden.filter((r) => r.label && !r.isPause).map((r) => String(r.nr)));
  const eintraege = {};
  Object.entries(plan.eintraege || {}).forEach(([key, value]) => {
    const cut = key.lastIndexOf('-');
    const nr = key.slice(0, cut);
    const day = key.slice(cut + 1);
    if (mapping[nr] != null) eintraege[`${mapping[nr]}-${day}`] = value;
    else if (keep.has(nr)) eintraege[key] = value;
  });
  return { ...plan, stunden, eintraege };
}

/**
 * Zeile ändern (index), anhängen (index = null) oder löschen (row = null).
 * Neue Zeilen ohne Kennung bekommen eine vorläufige; die Nummern vergibt sortAndRenumber.
 */
export function setRow(plans, planId, index, row) {
  return updatePlan(plans, planId, (plan) => {
    const stunden = [...(plan.stunden || [])];
    if (row == null) {
      stunden.splice(index, 1);
    } else {
      const clean = { von: row.von, bis: row.bis };
      if (row.isPause) {
        clean.isPause = true;
        clean.label = row.label?.trim() || 'Pause';
      } else if (row.label?.trim()) {
        clean.label = row.label.trim();
      }
      const before = index == null ? null : stunden[index];
      // Kennung behalten, solange die Art gleich bleibt (Einträge hängen daran)
      if (before && !!before.isPause === !!clean.isPause && !!before.label === !!clean.label && !clean.isPause) {
        clean.nr = before.nr;
      } else if (clean.label && !clean.isPause) {
        const ids = new Set(stunden.map((s) => String(s.nr)));
        let id = clean.label.slice(0, 1).toUpperCase();
        for (let i = 2; ids.has(id); i += 1) id = `${clean.label.slice(0, 1).toUpperCase()}${i}`;
        clean.nr = id;
      } else if (before && isLesson(before) && isLesson(clean)) {
        clean.nr = before.nr;
      }
      if (index == null) stunden.push(clean);
      else stunden[index] = clean;
    }
    return sortAndRenumber({ ...plan, stunden });
  });
}

/** Vorschlag für eine neue Zeile direkt nach der letzten. */
export function nextRowTimes(plan, isPause) {
  const last = [...(plan.stunden || [])].sort((a, b) => a.bis.localeCompare(b.bis)).pop();
  const von = last ? addMinutes(last.bis, isPause ? 0 : 5) : '08:00';
  return { von, bis: addMinutes(von, isPause ? 15 : 45) };
}

/** Ganztägigen Eintrag eines Wochentags setzen oder (entry = null) entfernen. */
export function setWholeDay(plans, planId, dayIdx, entry, emoji) {
  return updatePlan(plans, planId, (plan) => {
    const ganztag = { ...(plan.ganztag || {}) };
    if (!entry || !entry.fach?.trim()) {
      delete ganztag[dayIdx];
      const next = { ...plan, ganztag };
      if (Object.keys(ganztag).length === 0) delete next.ganztag;
      return next;
    }
    const clean = { fach: entry.fach.trim() };
    if (entry.info?.trim()) clean.info = entry.info.trim();
    ganztag[dayIdx] = Object.keys(clean).length === 1 ? clean.fach : clean;
    return ensureFach({ ...plan, ganztag }, clean.fach, emoji);
  });
}

/** Fach ändern: Symbol, Farbe, Abkürzung; ein neuer Name wird in allen Einträgen des Plans übernommen. */
export function updateFach(plans, planId, alt, { name, emoji, color, kurz }) {
  return updatePlan(plans, planId, (plan) => {
    const neu = name.trim();
    const rename = (value) => {
      if (typeof value === 'string') return value === alt ? neu : value;
      return value && value.fach === alt ? { ...value, fach: neu } : value;
    };
    const eintraege = Object.fromEntries(Object.entries(plan.eintraege || {}).map(([k, v]) => [k, rename(v)]));
    const next = { ...plan, eintraege };
    if (plan.ganztag) next.ganztag = Object.fromEntries(Object.entries(plan.ganztag).map(([k, v]) => [k, rename(v)]));
    if (plan.nachmittag) {
      next.nachmittag = Object.fromEntries(Object.entries(plan.nachmittag).map(([k, v]) => [k, v.map(rename)]));
    }
    const faecher = { ...(plan.faecher || {}) };
    const meta = { ...(faecher[alt] || {}) };
    delete faecher[alt];
    if (emoji?.trim()) meta.emoji = emoji.trim();
    if (color) meta.color = color;
    if (kurz?.trim()) meta.kurz = kurz.trim();
    else delete meta.kurz;
    if (neu !== alt) delete meta.label;
    faecher[neu] = meta;
    next.faecher = faecher;
    return next;
  });
}

/** Alle im Plan verwendeten Fächer (für die Fächerliste). */
export function usedFaecher(plan) {
  const used = new Set();
  const add = (v) => {
    const fach = typeof v === 'string' ? v : v?.fach;
    if (fach) used.add(fach);
  };
  Object.values(plan.eintraege || {}).forEach(add);
  Object.values(plan.ganztag || {}).forEach(add);
  Object.values(plan.nachmittag || {}).forEach((termine) => termine.forEach(add));
  return [...used].sort((a, b) => a.localeCompare(b, 'de'));
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

const SYMBOLE = [
  '📘', '📚', '📖', '✏️', '📝', '📐', '➗', '🔢', '🔤', '🗣️', '🇬🇧', '🇫🇷',
  '🔭', '🔬', '🧪', '🌍', '🌱', '💻', '🤖', '🧩', '🎨', '🖌️', '🎵', '🎹',
  '🎸', '🥁', '🎤', '🎭', '🩰', '⚽', '🏀', '🏐', '🎾', '🏊', '🤸', '🚴',
  '🏃', '🐴', '🐎', '🐴🤸', '🧘', '🥋', '🤝', '✝️', '🤔', '🍳', '🔨', '🧵',
  '🏛️', '📜', '🇪🇸', '🗳️', '🏠', '🏫', '🏖️', '📅', '⭐', '🎉', '😴',
];

function SymbolPicker({ value, onPick }) {
  return (
    <div className="spe-emoji-grid" role="group" aria-label="Symbol wählen">
      {SYMBOLE.map((s) => (
        <button
          key={s}
          type="button"
          className={`spe-emoji${value === s ? ' spe-emoji-active' : ''}`}
          aria-label={s}
          aria-pressed={value === s}
          onClick={() => onPick(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

const DIALOG_CSS = `
  .spe-emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow-y: auto; }
  .spe-emoji {
    min-width: 34px; height: 34px; padding: 0 6px; border-radius: 0.6rem; font-size: 18px; line-height: 1;
    background: var(--glass-bg); border: 1px solid transparent; cursor: pointer;
  }
  .spe-emoji:hover { border-color: var(--glass-border); }
  .spe-emoji-active { border-color: var(--accent-color, #6366f1); }
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Anna" />
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

// ── Dialog für Zeilen ────────────────────────────────────────────────────

const ARTEN = [
  ['stunde', 'Stunde'],
  ['pause', 'Pause'],
  ['zeile', 'Benannte Zeile (z. B. Ganztag)'],
];

/** Zeile bearbeiten (row) oder neu anlegen (row = null, vorschlag = {von, bis, art}). */
export const StundeDialog = memo(function StundeDialog({ row, vorschlag, onSave, onDelete, onClose }) {
  const startArt = row ? (row.isPause ? 'pause' : row.label ? 'zeile' : 'stunde') : vorschlag?.art || 'stunde';
  const [art, setArt] = useState(startArt);
  const [label, setLabel] = useState(row?.label || (startArt === 'pause' ? 'Pause' : ''));
  const [von, setVon] = useState(row?.von || vorschlag?.von || '');
  const [bis, setBis] = useState(row?.bis || vorschlag?.bis || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEscape(onClose);

  const zeitFalsch = von && bis && bis <= von;
  const kannSpeichern = von && bis && !zeitFalsch && (art !== 'zeile' || label.trim());

  const submit = (e) => {
    e.preventDefault();
    if (!kannSpeichern) return;
    onSave({ von, bis, isPause: art === 'pause', label: art === 'stunde' ? '' : label });
  };

  return (
    <div className="spe-backdrop" onClick={onClose} role="presentation">
      <form className="spe-dialog" role="dialog" aria-modal="true" aria-label={row ? 'Zeile bearbeiten' : 'Zeile hinzufügen'}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="spe-title">{row ? 'Zeile bearbeiten' : 'Zeile hinzufügen'}</h3>

        <label className="spe-field">
          <span>Art</span>
          <select value={art} onChange={(e) => {
            setArt(e.target.value);
            if (e.target.value === 'pause' && !label) setLabel('Pause');
          }}>
            {ARTEN.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>

        {art !== 'stunde' && (
          <label className="spe-field">
            <span>Bezeichnung</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={art === 'pause' ? 'z. B. Mittagspause' : 'z. B. Ganztag'} />
          </label>
        )}

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
        {zeitFalsch && <p className="spe-hint">„bis“ muss nach „von“ liegen.</p>}
        {row && art !== startArt && startArt === 'stunde' && (
          <p className="spe-hint">Die Einträge dieser Stunde gehen dabei verloren.</p>
        )}

        {confirmDelete ? (
          <div className="spe-actions">
            <span className="spe-hint" style={{ alignSelf: 'center' }}>Zeile mit ihren Einträgen löschen?</span>
            <span className="spe-spacer" />
            <button type="button" className="spe-btn" onClick={() => setConfirmDelete(false)}>Nein</button>
            <button type="button" className="spe-btn spe-btn-danger" onClick={onDelete}>Löschen</button>
          </div>
        ) : (
          <div className="spe-actions">
            {row && onDelete && (
              <button type="button" className="spe-btn spe-btn-danger" onClick={() => setConfirmDelete(true)}>Löschen</button>
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

// ── Dialog für Fächer ────────────────────────────────────────────────────

/** Liste der Fächer eines Plans; ein Fach nach dem anderen bearbeiten. */
export const FaecherDialog = memo(function FaecherDialog({ faecher, metaFor, onSave, onClose }) {
  const [auswahl, setAuswahl] = useState(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [kurz, setKurz] = useState('');
  useEscape(onClose);

  const waehle = (fach) => {
    const meta = metaFor(fach);
    setAuswahl(fach);
    setName(fach);
    setEmoji(meta.emoji || '');
    setColor(/^#[0-9a-f]{6}$/i.test(meta.color || '') ? meta.color : '#6366f1');
    setKurz(meta.kurz || '');
  };

  const nameVergeben = auswahl && name.trim() !== auswahl && faecher.includes(name.trim());

  const submit = (e) => {
    e.preventDefault();
    if (!auswahl || !name.trim() || nameVergeben) return;
    onSave(auswahl, { name, emoji, color, kurz });
    setAuswahl(null);
  };

  return (
    <div className="spe-backdrop" onClick={onClose} role="presentation">
      <form className="spe-dialog" role="dialog" aria-modal="true" aria-label="Fächer"
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="spe-title">Fächer</h3>

        {!auswahl ? (
          <>
            {faecher.length === 0 && <p className="spe-hint" style={{ color: 'var(--text-muted)' }}>Noch keine Fächer eingetragen.</p>}
            <div className="spe-list">
              {faecher.map((fach) => {
                const meta = metaFor(fach);
                return (
                  <button key={fach} type="button" className="spe-list-item" onClick={() => waehle(fach)}>
                    <span>{meta.emoji}</span>
                    <span className="spe-list-name" style={{ color: meta.color }}>{fach}</span>
                    <span className="spe-list-kurz">{meta.kurz}</span>
                  </button>
                );
              })}
            </div>
            <div className="spe-actions">
              <span className="spe-spacer" />
              <button type="button" className="spe-btn" onClick={onClose}>Fertig</button>
            </div>
          </>
        ) : (
          <>
            <label className="spe-field">
              <span>Name (wird in allen Einträgen geändert)</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {nameVergeben && <p className="spe-hint">Dieses Fach gibt es schon.</p>}
            <div className="spe-row">
              <label className="spe-field">
                <span>Symbol</span>
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
              </label>
              <label className="spe-field">
                <span>Abkürzung</span>
                <input value={kurz} onChange={(e) => setKurz(e.target.value)} maxLength={10} placeholder="z. B. Ma" />
              </label>
              <label className="spe-field">
                <span>Farbe</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 2, height: 38 }} />
              </label>
            </div>
            <SymbolPicker value={emoji} onPick={setEmoji} />
            <div className="spe-actions">
              <span className="spe-spacer" />
              <button type="button" className="spe-btn" onClick={() => setAuswahl(null)}>Zurück</button>
              <button type="submit" className="spe-btn spe-btn-primary" disabled={!name.trim() || nameVergeben}>Speichern</button>
            </div>
          </>
        )}
      </form>
      <style>{`${DIALOG_CSS}
        .spe-list { display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }
        .spe-list-item {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 0.5rem 0.65rem; border-radius: 0.6rem;
          background: var(--glass-bg); border: 1px solid transparent;
          color: var(--text-primary); cursor: pointer; text-align: left; font-size: 0.8rem;
        }
        .spe-list-item:hover { border-color: var(--glass-border); }
        .spe-list-name { flex: 1; font-weight: 600; }
        .spe-list-kurz { font-size: 0.65rem; color: var(--text-muted); }
      `}</style>
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
  // Symbol selbst gewählt oder eingetippt: dann nicht mehr automatisch überschreiben
  const [eigenesSymbol, setEigenesSymbol] = useState(false);
  const symbolWaehlen = (s) => {
    setEigenesSymbol(true);
    setEmoji(s);
  };

  // `faecher` is a new object on every dashboard re-render; depending on it would overwrite typed symbols

  const faecherRef = useRef(faecher);
  faecherRef.current = faecher;
  // Bekanntes Fach: sein Symbol; neues Fach: Vorschlag aus dem Namen (z. B. Schwimmen → 🏊)
  const vorschlag = faecherRef.current?.[fach.trim()]?.emoji || symbolVorschlag(fach);
  useEffect(() => {
    if (!eigenesSymbol && vorschlag) setEmoji(vorschlag);
  }, [fach, vorschlag, eigenesSymbol]);

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
          <span>Symbol{!eigenesSymbol && vorschlag && emoji === vorschlag ? ' (automatisch)' : ''}</span>
          <input value={emoji} onChange={(e) => symbolWaehlen(e.target.value)} placeholder="📘" maxLength={8} />
        </label>
        <SymbolPicker value={emoji} onPick={symbolWaehlen} />

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
