import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GenericClimateModal from '../modals/GenericClimateModal';
import NordpoolModal from '../modals/NordpoolModal';

vi.mock('../contexts', () => ({
  useConfig: () => ({ unitsMode: 'follow_ha' }),
  useHomeAssistantMeta: () => ({
    haConfig: { currency: 'øre', unit_system: { temperature: '°C' } },
  }),
}));

vi.mock('../components/ui/AccessibleModalShell', () => ({
  default: ({ open, children, panelClassName, overlayClassName }) =>
    open ? (
      <div
        data-testid="modal-shell"
        data-panel-class={panelClassName}
        data-overlay-class={overlayClassName}
      >
        {children()}
      </div>
    ) : null,
}));

vi.mock('../components/ui/M3Slider', () => ({
  default: () => <input aria-label="temperature" type="range" />,
}));

vi.mock('../components/charts/InteractivePowerGraph', () => ({
  default: () => <div data-testid="power-graph" />,
}));

const t = (key) => key;

describe('mobile card modal layout', () => {
  it('uses the full mobile viewport for climate while restoring desktop spacing', () => {
    render(
      <GenericClimateModal
        entityId="climate.living_room"
        entity={{
          state: 'heat',
          attributes: {
            friendly_name: 'Living room',
            current_temperature: 20,
            temperature: 21,
            hvac_modes: [],
            fan_modes: [],
            swing_modes: [],
          },
        }}
        onClose={vi.fn()}
        callService={vi.fn()}
        hvacMap={{}}
        fanMap={{}}
        swingMap={{}}
        t={t}
      />
    );

    const shell = screen.getByTestId('modal-shell');
    expect(shell.dataset.panelClass).toContain('max-h-[calc(100dvh-1rem)]');
    expect(shell.dataset.panelClass).toContain('sm:max-h-[90vh]');
    expect(shell.dataset.overlayClass).toContain('p-2 sm:p-4');
  });

  it('packs Nordpool statistics into the compact mobile layout', () => {
    render(
      <NordpoolModal
        show
        onClose={vi.fn()}
        entity={{}}
        fullPriceData={[{ start: '2026-08-16T00:00:00', value: 50 }]}
        currentPriceIndex={0}
        priceStats={{ min: 30, avg: 50, max: 80 }}
        name="Straumpris"
        t={t}
        language="de"
        saveCardSetting={vi.fn()}
        cardId="sensor.price"
        settings={{}}
      />
    );

    expect(screen.getByTestId('modal-shell').dataset.panelClass).toContain(
      'max-h-[calc(100dvh-1rem)]'
    );
    expect(screen.getByText('power.avg').parentElement?.parentElement).toHaveClass(
      'grid-cols-3',
      'lg:grid-cols-2'
    );
  });
});
