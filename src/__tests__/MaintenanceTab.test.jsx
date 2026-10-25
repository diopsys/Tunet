import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getMaintenanceStatus: vi.fn(), pruneBuildCache: vi.fn() }));
vi.mock('../services/maintenanceApi', () => api);

import MaintenanceTab, { formatBytes } from '../modals/MaintenanceTab';

describe('MaintenanceTab', () => {
  beforeEach(() => {
    api.getMaintenanceStatus.mockReset();
    api.pruneBuildCache.mockReset();
  });

  it('formats reclaimed space', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(512 * 1024 ** 2)).toBe('512 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,50 GB');
  });

  it('explains a missing Portainer and offers no prune button', async () => {
    api.getMaintenanceStatus.mockResolvedValue({ portainer: { installed: false } });
    render(<MaintenanceTab />);
    expect(await screen.findByText(/Portainer ist nicht installiert/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Build-Cache leeren' })).toBeNull();
  });

  it('shows the access hint for non-admins', async () => {
    api.getMaintenanceStatus.mockRejectedValue(Object.assign(new Error('x'), { code: 'NOT_ADMIN' }));
    render(<MaintenanceTab />);
    expect(await screen.findByText('Nur für Home-Assistant-Administratoren.')).toBeTruthy();
  });

  it('asks for confirmation, prunes and reports the result', async () => {
    api.getMaintenanceStatus.mockResolvedValue({ portainer: { installed: true, name: 'Portainer', state: 'stopped' } });
    api.pruneBuildCache.mockResolvedValue({ spaceReclaimed: 3 * 1024 ** 3, cachesDeleted: 7, portainerStarted: true, portainerStopped: true });
    render(<MaintenanceTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Build-Cache leeren' }));
    expect(api.pruneBuildCache).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(await screen.findByText(/3,00 GB freigegeben · 7 Cache-Einträge gelöscht · Portainer wieder gestoppt/)).toBeTruthy();
    expect(api.pruneBuildCache).toHaveBeenCalledTimes(1);
  });
});
