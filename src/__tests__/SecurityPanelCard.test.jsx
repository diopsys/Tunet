import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SecurityPanelCard, { resolveSecurityConfig } from '../components/cards/SecurityPanelCard';

describe('resolveSecurityConfig', () => {
  it('keeps the built-in defaults without settings', () => {
    const config = resolveSecurityConfig({});
    expect(config.detectionSwitches).toEqual(['switch.sicherheit_detection']);
    expect(config.alarmEntity).toBe('alarm_control_panel.alarmo');
    expect(config.locks).toHaveLength(2);
    expect(config.doorSummaryId).toBe('binary_sensor.sicherheit_turkontakte');
    expect(config.windowSummaryId).toBe('binary_sensor.sicherheit_fensterkontakte');
  });

  it('uses configured entities and hides empty sections', () => {
    const config = resolveSecurityConfig({
      security: {
        detectionSwitches: ['switch.a_detect', 'switch.b_detect'],
        simulationSwitch: null,
        locks: [],
        windowContacts: [{ entityId: 'binary_sensor.fenster', name: 'Fenster' }],
        doorContacts: [{ entityId: 'binary_sensor.tur', name: 'Tür' }, { name: 'ohne ID' }],
      },
    });
    expect(config.detectionSwitches).toEqual(['switch.a_detect', 'switch.b_detect']);
    expect(config.simulationSwitch).toBeNull();
    expect(config.locks).toEqual([]);
    expect(config.doorContacts).toEqual([{ entityId: 'binary_sensor.tur', name: 'Tür' }]);
    // Own contact lists drop the default summary sensors
    expect(config.doorSummaryId).toBeNull();
    expect(config.windowSummaryId).toBeNull();
    // Untouched keys keep their defaults
    expect(config.alarmEntity).toBe('alarm_control_panel.alarmo');
  });

  it('accepts a single detection switch as string', () => {
    expect(resolveSecurityConfig({ security: { detectionSwitches: 'switch.x' } }).detectionSwitches).toEqual(['switch.x']);
  });
});

describe('SecurityPanelCard', () => {
  const settings = {
    security: {
      detectionSwitches: ['switch.a_detect', 'switch.b_detect'],
      simulationSwitch: null,
      locks: [],
      doorContacts: [{ entityId: 'binary_sensor.tur', name: 'Tür' }],
      windowContacts: [
        { entityId: 'binary_sensor.fenster_1', name: 'Fenster 1' },
        { entityId: 'binary_sensor.fenster_2', name: 'Fenster 2' },
      ],
      motionSensors: [{ entityId: 'binary_sensor.bewegung', name: 'Garage' }],
    },
  };
  const entities = {
    'switch.a_detect': { state: 'off' },
    'switch.b_detect': { state: 'on' },
    'binary_sensor.tur': { state: 'off' },
    'binary_sensor.fenster_1': { state: 'on' },
    'binary_sensor.fenster_2': { state: 'off' },
    'binary_sensor.bewegung': { state: 'off' },
    'alarm_control_panel.alarmo': { state: 'disarmed' },
  };

  it('renders configured sections without locks or simulation (desktop)', () => {
    render(<SecurityPanelCard cardId="security_panel_card_1" entities={entities} callService={vi.fn()} settings={settings} isMobile={false} />);
    expect(screen.queryByText('Schlösser')).toBeNull();
    expect(screen.queryByText('Simulation')).toBeNull();
    expect(screen.getByText('Kamera Detection')).toBeTruthy();
    // Window count comes from the contacts themselves (no summary sensor)
    expect(screen.getByText('1 offen')).toBeTruthy();
    expect(screen.getByText('Alle zu')).toBeTruthy();
    expect(screen.getByText('Aktiv')).toBeTruthy();
  });

  it('toggles all detection switches together', () => {
    const callService = vi.fn();
    render(<SecurityPanelCard cardId="security_panel_card_1" entities={entities} callService={callService} settings={settings} isMobile={false} />);
    screen.getByText('Kamera Detection').closest('button').click();
    expect(callService).toHaveBeenCalledWith('switch', 'turn_off', { entity_id: ['switch.a_detect', 'switch.b_detect'] });
  });

  it('renders only configured tiles on mobile', () => {
    render(<SecurityPanelCard cardId="security_panel_card_1" entities={entities} callService={vi.fn()} settings={settings} isMobile />);
    expect(screen.queryByText('Simulation')).toBeNull();
    expect(screen.getByText('Fenster')).toBeTruthy();
    expect(screen.getByText('Bewegung')).toBeTruthy();
    expect(screen.getByText('Alarm')).toBeTruthy();
  });
});
