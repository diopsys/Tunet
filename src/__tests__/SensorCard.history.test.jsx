import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SensorCard from '../components/cards/SensorCard';

const { getHistory, getStatistics } = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getStatistics: vi.fn(),
}));
vi.mock('../services/haClient', async (original) => ({
  ...(await original()),
  getHistory,
  getStatistics,
}));
vi.mock('../contexts', () => ({
  useConfig: () => ({ unitsMode: 'follow_ha' }),
  useHomeAssistantMeta: () => ({ haConfig: {} }),
}));
vi.mock('../components/charts/SparkLine', () => ({
  default: ({ data }) => <output>{JSON.stringify(data.map((point) => point.value))}</output>,
}));

const entity = (id, state) => ({ entity_id: id, state, attributes: {} });
const props = {
  entity: entity('sensor.power', '100'),
  entities: {},
  conn: {},
  settings: { size: 'large', showGraph: true },
  t: (key) => key,
};
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

describe('sensor history responses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getHistory.mockReset();
    getStatistics.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it.each(['resolve', 'reject'])(
    'ignores a stale history %s after changing entity',
    async (outcome) => {
      let resolveOld;
      let rejectOld;
      getHistory.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveOld = resolve;
            rejectOld = reject;
          })
      );
      getHistory.mockResolvedValueOnce([{ s: '200', lc: 1700000000 }]);
      const { rerender } = render(<SensorCard {...props} />);
      await tick();
      rerender(<SensorCard {...props} entity={entity('sensor.other', '200')} />);
      await tick();
      expect(screen.getByRole('status')).toHaveTextContent('[200,200]');
      await act(async () => {
        if (outcome === 'reject') rejectOld(new Error('Old request failed'));
        else resolveOld([{ s: '1', lc: 1700000000 }]);
      });
      expect(screen.getByRole('status')).toHaveTextContent('[200,200]');
      expect(getStatistics).not.toHaveBeenCalled();
    }
  );

  it('uses the latest state for the fallback without fetching history again', async () => {
    let finishHistory;
    getHistory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishHistory = resolve;
        })
    );
    getStatistics.mockResolvedValue([]);
    const { rerender } = render(<SensorCard {...props} />);
    await tick();
    rerender(<SensorCard {...props} entity={entity('sensor.power', '105')} />);
    await act(async () => finishHistory([]));
    await tick();
    expect(getHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('[105,105]');
  });
});
