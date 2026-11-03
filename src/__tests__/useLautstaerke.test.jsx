import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useLautstaerke from '../modals/medien/useLautstaerke';

const geraet = (v) => ({ attributes: { volume_level: v } });

describe('useLautstaerke', () => {
  it('sends a waiting value to the device it was set on, even if the entity changes', async () => {
    const fertig = [];
    const setzen = vi.fn(() => new Promise((r) => { fertig.push(r); }));
    const { result, rerender } = renderHook(({ e, id }) => useLautstaerke(e, id, setzen, { abstandMs: 0 }), {
      initialProps: { e: geraet(0.2), id: 'media_player.a' },
    });
    act(() => { result.current.props.onChange({ target: { value: '30' } }); });
    act(() => { result.current.props.onChange({ target: { value: '60' } }); });
    // Kachel schaltet um (z. B. Raum → TV), während der erste Befehl noch unterwegs ist
    rerender({ e: geraet(0.1), id: 'media_player.b' });
    expect(result.current.wert).toBe(10);
    await act(async () => { fertig[0](); });
    await waitFor(() => expect(setzen).toHaveBeenCalledTimes(2));
    expect(setzen.mock.calls).toEqual([['media_player.a', 0.3], ['media_player.a', 0.6]]);
  });
});
