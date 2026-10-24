import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHaKopfleiste } from '../hooks/useHaKopfleiste';

// MessageEvent in jsdom verlangt ein echtes Fenster als source – daher ein einfaches Event
const nachricht = (source, data) => {
  const ev = new Event('message');
  Object.defineProperty(ev, 'source', { value: source });
  Object.defineProperty(ev, 'data', { value: data });
  return ev;
};

describe('HA-Kopfleiste im App-Panel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for kiosk mode only while the panel is narrow', () => {
    const parent = { postMessage: vi.fn() };
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
    const { unmount } = renderHook(() => useHaKopfleiste());
    const typen = () => parent.postMessage.mock.calls.map(([m]) => `${m.type}${m.kioskMode ? '+kiosk' : ''}`);
    expect(typen()).toEqual(['home-assistant/subscribe-properties']);

    act(() => window.dispatchEvent(nachricht(parent, { type: 'home-assistant/properties', narrow: true })));
    expect(typen().at(-1)).toBe('home-assistant/subscribe-properties+kiosk');

    // gleiche Meldung erneut (Antwort auf das eigene subscribe): nichts weiter senden
    act(() => window.dispatchEvent(nachricht(parent, { type: 'home-assistant/properties', narrow: true })));
    expect(parent.postMessage).toHaveBeenCalledTimes(2);

    act(() => window.dispatchEvent(nachricht(parent, { type: 'home-assistant/properties', narrow: false })));
    expect(typen().slice(-2)).toEqual(['home-assistant/unsubscribe-properties', 'home-assistant/subscribe-properties']);

    unmount();
    expect(typen().at(-1)).toBe('home-assistant/unsubscribe-properties');
  });

  it('ignores messages from elsewhere and does nothing outside an iframe', () => {
    const parent = { postMessage: vi.fn() };
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
    renderHook(() => useHaKopfleiste());
    act(() => window.dispatchEvent(nachricht({}, { type: 'home-assistant/properties', narrow: true })));
    expect(parent.postMessage).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const eigen = vi.spyOn(window, 'postMessage');
    renderHook(() => useHaKopfleiste());
    expect(eigen).not.toHaveBeenCalled();
  });
});
