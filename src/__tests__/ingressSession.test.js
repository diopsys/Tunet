import { describe, expect, it, vi } from 'vitest';
import { addonSlugFrom, renewIngressSession } from '../utils/ingressSession';

const fenster = ({ hass, path = '/api/hassio_ingress/abc/', parentPath = '/app/58136f5e_tunet' } = {}) => {
  const parent = {
    location: { pathname: parentPath },
    document: { querySelector: () => (hass ? { hass } : null) },
  };
  return { location: { pathname: path, protocol: 'https:' }, parent, document: { cookie: '' } };
};

describe('ingressSession', () => {
  it('takes the add-on slug from the panel config, else from the parent path', () => {
    expect(addonSlugFrom({ panelUrl: 'casa', panels: { casa: { config: { addon: 'x_tunet' } } } })).toBe('x_tunet');
    expect(addonSlugFrom({}, '/app/58136f5e_tunet-gorbi87')).toBe('58136f5e_tunet-gorbi87');
    expect(addonSlugFrom({}, '/lovelace/0')).toBeNull();
  });

  it('asks the surrounding HA page for a new session and sets the cookie', async () => {
    const hass = { callWS: vi.fn(async () => ({ session: 'neu' })) };
    const win = fenster({ hass });
    await expect(renewIngressSession(win)).resolves.toBe(true);
    expect(hass.callWS).toHaveBeenCalledWith({ type: 'supervisor/ingress/session', slug: '58136f5e_tunet' });
    expect(win.document.cookie).toBe('ingress_session=neu;path=/api/hassio_ingress/;SameSite=Strict;Secure');
  });

  it('does nothing outside ingress or without access to HA', async () => {
    const hass = { callWS: vi.fn() };
    await expect(renewIngressSession(fenster({ hass, path: '/' }))).resolves.toBe(false);
    await expect(renewIngressSession(fenster({}))).resolves.toBe(false);
    const fremd = fenster({ hass });
    Object.defineProperty(fremd.parent, 'document', { get: () => { throw new Error('cross-origin'); } });
    await expect(renewIngressSession(fremd)).resolves.toBe(false);
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it('returns false when HA refuses', async () => {
    const hass = { callWS: vi.fn(async () => { throw new Error('Unauthorized'); }) };
    await expect(renewIngressSession(fenster({ hass }))).resolves.toBe(false);
  });
});
