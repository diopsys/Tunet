import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_HEARTBEAT_MS,
  probeAndRecoverConnection,
  useMobileConnectionRecovery,
} from '../hooks/useMobileConnectionRecovery';

describe('useMobileConnectionRecovery', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('probes the connection when the mobile app becomes visible', async () => {
    const conn = {
      connected: true,
      ping: vi.fn().mockResolvedValue(undefined),
      reconnect: vi.fn(),
    };
    const onHealthy = vi.fn();

    renderHook(() => useMobileConnectionRecovery({ conn, onHealthy, onRecovering: vi.fn() }));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(conn.ping).toHaveBeenCalledOnce();
    expect(onHealthy).toHaveBeenCalledOnce();
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('forces a reconnect when the resumed socket is disconnected', async () => {
    const conn = {
      connected: false,
      ping: vi.fn(),
      reconnect: vi.fn(),
    };
    const onRecovering = vi.fn();

    renderHook(() => useMobileConnectionRecovery({ conn, onHealthy: vi.fn(), onRecovering }));

    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
      await Promise.resolve();
    });

    expect(onRecovering).toHaveBeenCalledOnce();
    expect(conn.reconnect).toHaveBeenCalledWith(true);
    expect(conn.ping).not.toHaveBeenCalled();
  });

  it('also probes on desktop widths when the window regains focus', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const conn = {
      connected: true,
      ping: vi.fn().mockResolvedValue(undefined),
      reconnect: vi.fn(),
    };

    renderHook(() =>
      useMobileConnectionRecovery({ conn, onHealthy: vi.fn(), onRecovering: vi.fn() })
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(conn.ping).toHaveBeenCalledOnce();
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('detects a silently dead socket through the heartbeat', async () => {
    vi.useFakeTimers();
    const conn = {
      connected: true,
      ping: vi.fn(() => new Promise(() => {})),
      reconnect: vi.fn(),
    };
    const onRecovering = vi.fn();

    renderHook(() => useMobileConnectionRecovery({ conn, onHealthy: vi.fn(), onRecovering }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECTION_HEARTBEAT_MS + 3000);
    });

    expect(conn.ping).toHaveBeenCalledOnce();
    expect(onRecovering).toHaveBeenCalledOnce();
    expect(conn.reconnect).toHaveBeenCalledWith(true);
  });

  it('skips the heartbeat while the page is hidden', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const conn = { connected: true, ping: vi.fn(), reconnect: vi.fn() };

    renderHook(() =>
      useMobileConnectionRecovery({ conn, onHealthy: vi.fn(), onRecovering: vi.fn() })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECTION_HEARTBEAT_MS * 2);
    });

    expect(conn.ping).not.toHaveBeenCalled();
  });

  it('forces a reconnect when the health probe times out', async () => {
    vi.useFakeTimers();
    const conn = {
      connected: true,
      ping: vi.fn(() => new Promise(() => {})),
      reconnect: vi.fn(),
    };
    const onRecovering = vi.fn();

    const recoveryPromise = probeAndRecoverConnection(conn, {
      timeoutMs: 100,
      onRecovering,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(recoveryPromise).resolves.toBe('reconnecting');
    expect(onRecovering).toHaveBeenCalledOnce();
    expect(conn.reconnect).toHaveBeenCalledWith(true);
  });
});
