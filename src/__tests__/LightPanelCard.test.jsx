import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LightPanelCard from '../components/cards/LightPanelCard';

const settings = {
  panelTabs: [
    {
      id: 'eg',
      title: 'EG',
      icon: 'mdi:home-floor-0',
      entities: [
        { entityId: 'light.couch', name: 'Couch' },
        { entityId: 'switch.stern', name: 'Stern', hideWhenUnavailable: true },
        { entityId: 'light.weg', name: 'Weg' },
      ],
    },
  ],
};

const renderCard = (entities) =>
  render(
    <LightPanelCard
      cardId="light_panel_card_1"
      entities={entities}
      callService={vi.fn()}
      optimisticLightBrightness={{}}
      setOptimisticLightBrightness={vi.fn()}
      settings={settings}
      isMobile={false}
    />
  );

describe('LightPanelCard', () => {
  it('hides entries flagged hideWhenUnavailable while unreachable', () => {
    renderCard({
      'light.couch': { state: 'off', attributes: {} },
      'switch.stern': { state: 'unavailable', attributes: {} },
      'light.weg': { state: 'unavailable', attributes: {} },
    });
    expect(screen.getByText('Couch')).toBeTruthy();
    expect(screen.queryByText('Stern')).toBeNull();
    // Without the flag an unavailable entry stays visible
    expect(screen.getByText('Weg')).toBeTruthy();
  });

  it('shows flagged entries once they are reachable', () => {
    renderCard({
      'light.couch': { state: 'off', attributes: {} },
      'switch.stern': { state: 'on', attributes: {} },
      'light.weg': { state: 'off', attributes: {} },
    });
    expect(screen.getByText('Stern')).toBeTruthy();
  });
});
