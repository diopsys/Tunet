import { createElement } from 'react';
import { MissingEntityCard } from '../components';
import { getSettings } from './helpers';
import {
  renderSensorCard,
  renderLightCard,
  renderLockCard,
  renderAutomationCard,
  renderCarCard,
  renderVacuumCard,
  renderMowerCard,
  renderNavimowCard,
  renderFanCard,
  renderMediaPlayerCard,
  renderMediaGroupCard,
  renderWeatherTempCard,
  renderGenericClimateCard,
  renderGenericCostCard,
  renderGenericAndroidTVCard,
  renderGenericAppleTVCard,
  renderCalendarCard,
  renderTodoCard,
  renderNordpoolCard,
  renderOctopusCard,
  renderWaermepumpeCard,
  renderLuftungsanlageCard,
  renderPvCard,
  renderCoverCard,
  renderAlarmCard,
  renderRoomCard,
  renderCameraCard,
  renderSpacerCard,
  renderBeregnungCard,
  renderLightPanelCard,
  renderCoverPanelCard,
  renderSecurityPanelCard,
  renderHaushaltsgeraeteCard,
  renderFrigateEventsCard,
  renderPoolCard,
} from './cards';

/**
 * Unified card renderer signature used by registry entries:
 * (cardId, dragProps, getControls, cardStyle, settingsKey, ctx) => JSX|null
 */
export const CARD_REGISTRY = [
  { prefix: 'light_panel_card_', renderer: renderLightPanelCard },
  { prefix: 'cover_panel_card_', renderer: renderCoverPanelCard },
  { prefix: 'security_panel_card_', renderer: renderSecurityPanelCard },
  { prefix: 'entity_card_', renderer: renderSensorCard },
  { prefix: 'light_', renderer: renderLightCard },
  { prefix: 'light.', renderer: renderLightCard },
  { prefix: 'lock_card_', renderer: renderLockCard },
  { prefix: 'lock.', renderer: renderLockCard },
  { prefix: 'vacuum.', renderer: renderVacuumCard },
  { prefix: 'lawn_mower.', renderer: renderNavimowCard },
  { prefix: 'fan.', renderer: renderFanCard },
  { prefix: 'media_player.', renderer: renderMediaPlayerCard },
  { prefix: 'media_group_', renderer: renderMediaGroupCard },
  { prefix: 'sonos_group_', renderer: renderMediaGroupCard },
  { prefix: 'calendar_card_', renderer: renderCalendarCard },
  { prefix: 'climate_card_', renderer: renderGenericClimateCard },
  { prefix: 'todo_card_', renderer: renderTodoCard },
  { prefix: 'cost_card_', renderer: renderGenericCostCard },
  { prefix: 'weather_temp_', renderer: renderWeatherTempCard },
  { prefix: 'androidtv_card_', renderer: renderGenericAndroidTVCard },
  { prefix: 'appletv_card_', renderer: renderGenericAppleTVCard },
  { prefix: 'car_card_', renderer: renderCarCard },
  { prefix: 'nordpool_card_', renderer: renderNordpoolCard },
  { prefix: 'octopus_card_', renderer: renderOctopusCard },
  { prefix: 'waermepumpe_card_', renderer: renderWaermepumpeCard },
  { prefix: 'luftungsanlage_card_', renderer: renderLuftungsanlageCard },
  { prefix: 'pv_card_', renderer: renderPvCard },
  { prefix: 'cover_card_', renderer: renderCoverCard },
  { prefix: 'room_card_', renderer: renderRoomCard },
  { prefix: 'camera_card_', renderer: renderCameraCard },
  { prefix: 'alarm_card_', renderer: renderAlarmCard },
  { prefix: 'spacer_card_', renderer: renderSpacerCard },
  { prefix: 'beregnung_card_', renderer: renderBeregnungCard },
  { prefix: 'haushaltsgeraete_card_', renderer: renderHaushaltsgeraeteCard },
  { prefix: 'frigate_events_card_', renderer: renderFrigateEventsCard },
  { prefix: 'pool_card_', renderer: renderPoolCard },
];

export function dispatchCardRender(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const { editMode, cardSettings, activePage } = ctx;

  if (cardId.startsWith('automation.')) {
    const settings = getSettings(cardSettings, settingsKey, cardId);
    if (['entity', 'toggle', 'sensor'].includes(settings.type)) {
      return renderSensorCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
    }
    return renderAutomationCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
  }

  for (const { prefix, renderer } of CARD_REGISTRY) {
    if (cardId.startsWith(prefix)) {
      return renderer(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
    }
  }

  const genericSettings = getSettings(cardSettings, settingsKey, cardId);
  if (['sensor', 'entity', 'toggle'].includes(genericSettings.type)) {
    return renderSensorCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
  }

  if (
    activePage === 'settings' &&
    !['car'].includes(cardId) &&
    !cardId.startsWith('light_') &&
    !cardId.startsWith('media_player')
  ) {
    return renderSensorCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
  }

  if (editMode && cardId === 'media_player') {
    return createElement(MissingEntityCard, {
      cardId,
      dragProps,
      controls: getControls(cardId),
      cardStyle,
      label: 'Legacy',
      t: ctx.t,
    });
  }

  if (editMode && (cardId.startsWith('media_group_') || cardId.startsWith('sonos_group_'))) {
    return createElement(MissingEntityCard, {
      cardId,
      dragProps,
      controls: getControls(cardId),
      cardStyle,
      t: ctx.t,
    });
  }

  if (cardId === 'car') {
    return renderCarCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx);
  }

  return null;
}
