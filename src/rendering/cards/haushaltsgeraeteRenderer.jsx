import { memo, useState, useEffect } from 'react';
import { Icon as MdiIcon } from '@mdi/react';
import { mdiWashingMachine, mdiDishwasher } from '@mdi/js';
import { getSettings } from '../helpers';

const ACTIVE_STATES = new Set(['run', 'pause', 'actionrequired', 'delayedstart']);

const PROGRAM_LABELS = {
  // Waschmaschine
  laundry_care_washer_program_cotton: 'Baumwolle',
  laundry_care_washer_program_cotton_cotton_eco: 'Baumwolle Eco',
  laundry_care_washer_program_easy_care: 'Pflegeleicht',
  laundry_care_washer_program_mix: 'Mix',
  laundry_care_washer_program_delicates_silk: 'Seide / Feinwäsche',
  laundry_care_washer_program_wool: 'Wolle',
  laundry_care_washer_program_rinse_rinse_spin_drain: 'Spülen / Schleudern',
  laundry_care_washer_program_drum_clean: 'Trommelreinigung',
  laundry_care_washer_program_super_153045_super_15: 'Super 15',
  laundry_care_washer_program_sensitive: 'Sensitive',
  laundry_care_washer_program_sport_fitness: 'Sport / Fitness',
  laundry_care_washer_program_mix_night_wash: 'Mix Nacht',
  laundry_care_washer_program_down_duvet_duvet: 'Daunen / Bettdecke',
  laundry_care_washer_program_auto_40: 'Auto 40',
  // Geschirrspüler
  dishcare_dishwasher_program_intensiv_70: 'Intensiv 70°',
  dishcare_dishwasher_program_auto_2: 'Auto',
  dishcare_dishwasher_program_auto: 'Auto',
  dishcare_dishwasher_program_eco_50: 'Eco 50°',
  dishcare_dishwasher_program_glas_40: 'Glas 40°',
  dishcare_dishwasher_program_quick_45: 'Schnell 45°',
  dishcare_dishwasher_program_pre_rinse: 'Vorspülen',
  dishcare_dishwasher_program_night_wash: 'Nacht',
  dishcare_dishwasher_program_kurz_60: 'Kurz 60°',
  dishcare_dishwasher_program_machine_care: 'Maschinenpflege',
};

const STATE_LABELS = {
  run: 'Läuft',
  pause: 'Pausiert',
  actionrequired: 'Aktion nötig',
  delayedstart: 'Startet später',
  finished: 'Fertig',
  ready: 'Bereit',
};

function fmtRemaining(endtimeStr) {
  if (!endtimeStr || endtimeStr === 'unavailable' || endtimeStr === 'unknown') return null;
  const end = new Date(endtimeStr);
  if (isNaN(end.getTime())) return null;
  const diffMs = end - Date.now();
  if (diffMs <= 0) return 'gleich fertig';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `noch ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `noch ${h}h${m > 0 ? ` ${m}m` : ''}`;
}

const WASHER = {
  stateId: 'sensor.waschmaschine_betriebszustand',
  progressId: 'sensor.waschmaschine_programm_fortschritt',
  endtimeId: 'sensor.waschmaschine_programm_endzeit',
  programId: 'select.waschmaschine_aktives_programm',
  label: 'Waschmaschine',
  color: '#60a5fa',
  icon: mdiWashingMachine,
};

const DISHWASHER = {
  stateId: 'sensor.geschirrspuler_betriebszustand',
  progressId: 'sensor.geschirrspuler_programm_fortschritt',
  endtimeId: 'sensor.geschirrspuler_programm_endzeit',
  programId: 'select.geschirrspuler_aktives_programm',
  label: 'Geschirrspüler',
  color: '#34d399',
  icon: mdiDishwasher,
};

const HaushaltsgeraeteCard = memo(function HaushaltsgeraeteCard({
  dragProps,
  controls,
  cardStyle,
  editMode,
  entities,
  isMobile,
}) {
  const washerState = entities[WASHER.stateId]?.state;
  const dishState = entities[DISHWASHER.stateId]?.state;

  const washerActive = ACTIVE_STATES.has(washerState);
  const dishActive = ACTIVE_STATES.has(dishState);
  const both = washerActive && dishActive;

  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!both) { setSlide(0); return; }
    const timer = setInterval(() => setSlide((s) => (s === 0 ? 1 : 0)), 4000);
    return () => clearInterval(timer);
  }, [both]);

  if (!washerActive && !dishActive) {
    if (!editMode) return null;
    return (
      <div
        {...dragProps}
        className="glass-texture relative flex h-full flex-col items-center justify-center overflow-hidden rounded-3xl border p-4 font-sans"
        style={cardStyle}
      >
        {controls}
        <MdiIcon path={mdiWashingMachine} size={1.2} color="var(--text-muted)" />
        <p className="mt-2 text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
          Haushaltsgeräte
        </p>
        <p className="mt-1 text-[10px] text-[var(--text-muted)] opacity-60">Erscheint nur wenn aktiv</p>
      </div>
    );
  }

  const active = [];
  if (washerActive) active.push(WASHER);
  if (dishActive) active.push(DISHWASHER);
  const current = active[both ? slide % active.length : 0];

  const stateRaw = entities[current.stateId]?.state ?? '';
  const stateLabel = STATE_LABELS[stateRaw] || stateRaw;
  const isRunning = stateRaw === 'run' || stateRaw === 'delayedstart';
  const progress = entities[current.progressId]?.state;
  const pct = progress != null && !isNaN(Number(progress)) ? Number(progress) : null;
  const endtime = entities[current.endtimeId]?.state;
  const programRaw = entities[current.programId]?.state;
  const programLabel = PROGRAM_LABELS[programRaw] ?? null;
  const remaining = fmtRemaining(endtime);
  const { color, icon } = current;

  return (
    <div
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      className={`glass-texture touch-feedback group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border font-sans transition-all duration-500 ${isMobile ? 'p-5' : 'p-7'} ${editMode ? 'cursor-move' : 'cursor-default'}`}
      style={cardStyle}
    >
      {controls}

      {/* Dot indicators when both active */}
      {both && (
        <div className="absolute top-3 right-3 flex gap-1.5">
          {active.map((a, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-all duration-500"
              style={{
                backgroundColor: slide === i ? a.color : 'var(--text-muted)',
                opacity: slide === i ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      )}

      {/* Top: icon + status badge */}
      <div className="flex items-start justify-between">
        <div
          className={`rounded-2xl p-3 transition-all group-hover:scale-110 ${isRunning ? '' : 'opacity-60'}`}
          style={{ backgroundColor: `${color}18`, color }}
        >
          <MdiIcon path={icon} size={0.9} color={color} />
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full border px-3 py-1"
          style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
        >
          {isRunning && (
            <span
              className="h-2 w-2 animate-pulse rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
          )}
          <span className="text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase">
            {stateLabel}
          </span>
        </div>
      </div>

      {/* Bottom: name + program + progress */}
      <div>
        <p className="mb-1 text-xs font-bold tracking-widest text-[var(--text-secondary)] uppercase opacity-60">
          {current.label}
        </p>
        {programLabel && (
          <p className={`${isMobile ? 'text-base' : 'text-lg'} font-light text-[var(--text-primary)]`}>
            {programLabel}
          </p>
        )}
        {pct != null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--glass-bg)]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>{pct}%</span>
              {remaining && <span style={{ color }}>{remaining}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export function renderHaushaltsgeraeteCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { editMode, cardSettings, entities, isMobile } = ctx;
  getSettings(cardSettings, settingsKey, cardId);
  return (
    <HaushaltsgeraeteCard
      key={cardId}
      cardId={cardId}
      dragProps={dragProps}
      controls={getControls(cardId)}
      cardStyle={cardStyle}
      editMode={editMode}
      entities={entities}
      isMobile={isMobile}
    />
  );
}
