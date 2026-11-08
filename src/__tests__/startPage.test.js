import { beforeEach, describe, expect, it } from 'vitest';
import { isAwayLongerThan, markActive, startPage } from '../utils/startPage';

describe('startPage', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the last page after a short break', () => {
    localStorage.setItem('tunet_active_page', 'kitchen');
    markActive(1_000_000);
    expect(startPage(1_000_000 + 30_000)).toBe('kitchen');
  });

  it('starts on the home page after more than the idle timeout', () => {
    localStorage.setItem('tunet_active_page', 'kitchen');
    markActive(1_000_000);
    expect(startPage(1_000_000 + 60_000)).toBe('home');
    expect(localStorage.getItem('tunet_active_page')).toBe('home');
  });

  it('uses the configured idle timeout and keeps the page without a timeout', () => {
    localStorage.setItem('tunet_active_page', 'kitchen');
    markActive(1_000_000);
    localStorage.setItem('tunet_inactivity_timeout', '300');
    expect(startPage(1_000_000 + 120_000)).toBe('kitchen');
    localStorage.setItem('tunet_inactivity_timeout', '0');
    expect(startPage(1_000_000 + 10_000_000)).toBe('kitchen');
  });

  it('keeps the last page while no activity has been recorded yet', () => {
    localStorage.setItem('tunet_active_page', 'kitchen');
    expect(startPage()).toBe('kitchen');
    expect(isAwayLongerThan(60)).toBe(false);
  });
});
