export const STATUS_GROUP_PILL_TYPE = 'group_status';
export const STATUS_GROUP_SELECTION_ALL = 'all';
export const STATUS_GROUP_SELECTION_INCLUDE = 'include';
export const STATUS_GROUP_SELECTION_EXCLUDE = 'exclude';
export const DEFAULT_LOW_BATTERY_THRESHOLD = 20;

const VALID_GROUP_SELECTION_MODES = new Set([
  STATUS_GROUP_SELECTION_ALL,
  STATUS_GROUP_SELECTION_INCLUDE,
  STATUS_GROUP_SELECTION_EXCLUDE,
]);

const OPENING_DEVICE_CLASSES = new Set(['door', 'garage_door', 'opening', 'window']);
const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

const toEntityRows = (entities) =>
  Object.entries(entities || {})
    .map(([id, entity]) => ({ id, entity }))
    .filter(({ entity }) => entity && typeof entity === 'object');

const sortByFriendlyName = (left, right) => {
  const leftName = left.entity?.attributes?.friendly_name || left.id;
  const rightName = right.entity?.attributes?.friendly_name || right.id;
  return leftName.localeCompare(rightName);
};

const isUnavailable = (entity) => UNAVAILABLE_STATES.has(String(entity?.state || '').toLowerCase());

const isOpeningSensor = (id, entity) => {
  if (!id.startsWith('binary_sensor.')) return false;
  const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase();
  return OPENING_DEVICE_CLASSES.has(deviceClass);
};

const isBatteryEntity = (_id, entity) =>
  String(entity?.attributes?.device_class || '').toLowerCase() === 'battery';

const getBatteryLevel = (entity) => {
  const level = Number.parseFloat(entity?.state);
  return Number.isFinite(level) ? level : null;
};

const normalizeGroupSelectionMode = (mode) =>
  VALID_GROUP_SELECTION_MODES.has(mode) ? mode : STATUS_GROUP_SELECTION_ALL;

const getGroupEntityIdSet = (pill) =>
  new Set(
    Array.isArray(pill?.groupEntityIds)
      ? pill.groupEntityIds.filter((id) => typeof id === 'string' && id.trim())
      : []
  );

const isAllowedBySelection = (pill, id) => {
  const mode = normalizeGroupSelectionMode(pill?.groupSelectionMode);
  if (mode === STATUS_GROUP_SELECTION_ALL) return true;

  const selectedIds = getGroupEntityIdSet(pill);
  if (mode === STATUS_GROUP_SELECTION_INCLUDE) return selectedIds.has(id);
  return !selectedIds.has(id);
};

export const STATUS_GROUP_PRESETS = [
  {
    id: 'lights_on',
    labelKey: 'statusPills.groupPresetLightsOn',
    fallbackLabel: 'Lights on',
    emptyLabelKey: 'statusPills.groupPresetLightsOnEmpty',
    fallbackEmptyLabel: 'No lights on',
    icon: 'Lightbulb',
    iconBgColor: 'rgba(245, 158, 11, 0.14)',
    iconColor: 'text-amber-300',
    actionDomain: 'light',
    actionService: 'turn_off',
    actionLabelKey: 'statusPills.groupActionTurnOffAll',
    fallbackActionLabel: 'Turn off all',
    rowActionLabelKey: 'statusPills.groupActionTurnOff',
    fallbackRowActionLabel: 'Turn off',
    candidates: (id) => id.startsWith('light.'),
    matches: (id, entity) => id.startsWith('light.') && entity?.state === 'on',
  },
  {
    id: 'openings_open',
    labelKey: 'statusPills.groupPresetOpeningsOpen',
    fallbackLabel: 'Open doors/windows',
    emptyLabelKey: 'statusPills.groupPresetOpeningsOpenEmpty',
    fallbackEmptyLabel: 'All doors/windows closed',
    icon: 'DoorOpen',
    iconBgColor: 'rgba(14, 165, 233, 0.14)',
    iconColor: 'text-sky-300',
    candidates: isOpeningSensor,
    matches: (id, entity) => {
      if (entity?.state !== 'on') return false;
      return isOpeningSensor(id, entity);
    },
  },
  {
    id: 'covers_open',
    labelKey: 'statusPills.groupPresetCoversOpen',
    fallbackLabel: 'Open covers',
    emptyLabelKey: 'statusPills.groupPresetCoversOpenEmpty',
    fallbackEmptyLabel: 'All covers closed',
    icon: 'Columns',
    iconBgColor: 'rgba(16, 185, 129, 0.14)',
    iconColor: 'text-emerald-300',
    actionDomain: 'cover',
    actionService: 'close_cover',
    actionLabelKey: 'statusPills.groupActionCloseAll',
    fallbackActionLabel: 'Close all',
    rowActionLabelKey: 'statusPills.groupActionClose',
    fallbackRowActionLabel: 'Close',
    candidates: (id) => id.startsWith('cover.'),
    matches: (id, entity) =>
      id.startsWith('cover.') && !isUnavailable(entity) && entity?.state !== 'closed',
  },
  {
    id: 'heating_on',
    labelKey: 'statusPills.groupPresetHeatingOn',
    fallbackLabel: 'Heating on',
    emptyLabelKey: 'statusPills.groupPresetHeatingOnEmpty',
    fallbackEmptyLabel: 'No heating active',
    icon: 'mdi:radiator',
    iconBgColor: 'rgba(249, 115, 22, 0.14)',
    iconColor: 'text-orange-300',
    // Dialog listet alle Thermostate, heizende zuerst und hervorgehoben
    listAll: true,
    candidates: (id) => id.startsWith('climate.'),
    matches: (id, entity) =>
      id.startsWith('climate.') && !isUnavailable(entity) && entity?.attributes?.hvac_action === 'heating',
  },
  {
    id: 'low_battery',
    labelKey: 'statusPills.groupPresetLowBattery',
    fallbackLabel: 'Low battery',
    emptyLabelKey: 'statusPills.groupPresetLowBatteryEmpty',
    fallbackEmptyLabel: 'No low batteries',
    icon: 'Battery',
    iconBgColor: 'rgba(239, 68, 68, 0.14)',
    iconColor: 'text-red-400',
    defaultThreshold: DEFAULT_LOW_BATTERY_THRESHOLD,
    minThreshold: 0,
    maxThreshold: 100,
    candidates: isBatteryEntity,
    matches: (id, entity, pill) => {
      if (!isBatteryEntity(id, entity) || isUnavailable(entity)) return false;
      if (id.startsWith('binary_sensor.')) return entity?.state === 'on';
      const level = getBatteryLevel(entity);
      return level !== null && level <= getStatusGroupThreshold(pill);
    },
  },
];

export const DEFAULT_STATUS_GROUP_PRESET = STATUS_GROUP_PRESETS[0].id;

export function getStatusGroupPreset(presetId) {
  return STATUS_GROUP_PRESETS.find((preset) => preset.id === presetId) || STATUS_GROUP_PRESETS[0];
}

export function getStatusGroupThreshold(pill) {
  const preset = getStatusGroupPreset(pill?.groupPreset);
  if (!Number.isFinite(preset.defaultThreshold)) return undefined;

  const parsed = Number.parseFloat(pill?.groupThreshold);
  const threshold = Number.isFinite(parsed) ? parsed : preset.defaultThreshold;
  return Math.min(preset.maxThreshold, Math.max(preset.minThreshold, threshold));
}

export function getStatusGroupPresetText(presetId, t, mode = 'label') {
  const preset = getStatusGroupPreset(presetId);
  const key = mode === 'empty' ? preset.emptyLabelKey : preset.labelKey;
  const fallback = mode === 'empty' ? preset.fallbackEmptyLabel : preset.fallbackLabel;
  const translated = typeof t === 'function' ? t(key) : key;
  return translated && translated !== key ? String(translated) : fallback;
}

export function buildStatusGroupPillVisuals(presetId) {
  const preset = getStatusGroupPreset(presetId);
  return {
    icon: preset.icon,
    iconBgColor: preset.iconBgColor,
    iconColor: preset.iconColor,
  };
}

export function getStatusGroupSelectionMode(pill) {
  return normalizeGroupSelectionMode(pill?.groupSelectionMode);
}

export function resolveStatusGroupCandidates(presetId, entities) {
  const preset = getStatusGroupPreset(presetId);
  const candidates = toEntityRows(entities).filter(({ id, entity }) =>
    typeof preset.candidates === 'function'
      ? preset.candidates(id, entity)
      : preset.matches(id, entity)
  );
  candidates.sort(sortByFriendlyName);
  return candidates;
}

/**
 * Einträge für den Dialog: bei Vorlagen mit `listAll` alle passenden Kandidaten
 * (aktive zuerst, `active` markiert), sonst nur die aktiven.
 */
export function resolveStatusGroupListItems(pill, entities) {
  const preset = getStatusGroupPreset(pill?.groupPreset);
  const rows = preset.listAll
    ? toEntityRows(entities).filter(
        ({ id, entity }) => preset.candidates(id, entity) && isAllowedBySelection(pill, id)
      )
    : toEntityRows(entities).filter(
        ({ id, entity }) => preset.matches(id, entity, pill) && isAllowedBySelection(pill, id)
      );
  return rows
    .map((row) => ({ ...row, active: Boolean(preset.matches(row.id, row.entity, pill)) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || sortByFriendlyName(a, b));
}

/**
 * Soll-/Ist-Temperatur und Ventilöffnung eines Thermostats. Das Ventil kommt aus
 * dem Attribut `valve_position` oder einem Begleitsensor
 * `sensor.<objekt-id><pill.valveEntitySuffix>` (z. B. „_ventilzustand“).
 */
export function getHeatingDetails(id, entity, entities, pill) {
  const attrs = entity?.attributes || {};
  const zahl = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  let valve = zahl(attrs.valve_position);
  const suffix = typeof pill?.valveEntitySuffix === 'string' ? pill.valveEntitySuffix.trim() : '';
  if (valve === null && suffix) {
    const sensor = entities?.[`sensor.${id.split('.')[1]}${suffix}`];
    if (sensor && !isUnavailable(sensor)) valve = zahl(sensor.state);
  }
  return { target: zahl(attrs.temperature), current: zahl(attrs.current_temperature), valve };
}

export function resolveStatusGroupPill(pill, entities, t) {
  const preset = getStatusGroupPreset(pill?.groupPreset);
  const matchedEntities = toEntityRows(entities).filter(
    ({ id, entity }) => preset.matches(id, entity, pill) && isAllowedBySelection(pill, id)
  );
  matchedEntities.sort(sortByFriendlyName);

  const count = matchedEntities.length;
  const customLabel = typeof pill?.label === 'string' ? pill.label.trim() : '';
  const customName = typeof pill?.name === 'string' ? pill.name.trim() : '';
  const customSublabel = typeof pill?.sublabel === 'string' ? pill.sublabel.trim() : '';
  const label = customLabel || customName || getStatusGroupPresetText(preset.id, t);
  const emptyLabel = getStatusGroupPresetText(preset.id, t, 'empty');

  return {
    preset,
    count,
    matchedEntities,
    shouldRender: pill?.hideWhenEmpty === false || count > 0,
    syntheticEntity: {
      entity_id: `status_group.${preset.id}`,
      state: String(count),
      attributes: {
        friendly_name: label,
        statusPillSublabel: customSublabel || (count > 0 ? String(count) : emptyLabel),
        statusPillCount: count,
        statusPillPreset: preset.id,
      },
    },
  };
}
