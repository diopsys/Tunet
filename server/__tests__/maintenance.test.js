// @vitest-environment node

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaintenanceRouter, findPortainerAddon, portainerPort } from '../routes/maintenance.js';

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

function fakeSupervisor({ installed = true, state = 'stopped' } = {}) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push(`${method} ${url}`);
    if (url === 'http://supervisor/addons') {
      return json({ result: 'ok', data: { addons: installed ? [{ slug: 'db21ed7f_portainer', name: 'Portainer' }] : [] } });
    }
    if (url === 'http://supervisor/addons/db21ed7f_portainer/info') {
      return json({
        result: 'ok',
        data: {
          name: 'Portainer',
          state,
          hostname: 'db21ed7f-portainer',
          network: { '8000/tcp': null, '9099/tcp': 9000 },
          network_description: { '8000/tcp': 'Edge Agent Api', '9099/tcp': 'Web UI port' },
          options: { password: 'secret-pass' },
        },
      });
    }
    if (url.endsWith('/start') || url.endsWith('/stop')) return json({ result: 'ok', data: {} });
    if (url === 'http://db21ed7f-portainer:9099/api/system/status') return json({});
    if (url === 'http://db21ed7f-portainer:9099/api/auth') return json({ jwt: 'jwt-1' });
    if (url === 'http://db21ed7f-portainer:9099/api/endpoints/1/docker/build/prune?all=true') {
      return json({ CachesDeleted: ['a', 'b'], SpaceReclaimed: 2048 });
    }
    return json({ message: `unexpected ${url}` }, 500);
  });
  return { fetchImpl, calls };
}

const servers = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function startApp({ user, isAdmin = true, ...supervisor } = {}) {
  const fake = fakeSupervisor(supervisor);
  const app = express();
  app.use((req, _res, next) => {
    req.authenticatedHaUser = user;
    next();
  });
  app.use(
    '/m',
    createMaintenanceRouter({
      fetchImpl: fake.fetchImpl,
      getToken: () => 'sup-token',
      getPortainerPassword: () => '',
      resolveIsAdmin: async () => isAdmin,
      wait: async () => {},
    })
  );
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  const { port } = server.address();
  return { ...fake, url: (p) => `http://127.0.0.1:${port}/m${p}` };
}

const ingressAdmin = { id: 'u1', source: 'supervisor-ingress' };

describe('maintenance helpers', () => {
  it('finds the Portainer add-on and its web port', () => {
    expect(findPortainerAddon([{ slug: 'core_ssh' }, { slug: 'db21ed7f_portainer' }])?.slug).toBe('db21ed7f_portainer');
    expect(findPortainerAddon([{ slug: 'a0d7b954_vscode' }])).toBeUndefined();
    expect(portainerPort({ network: { '8000/tcp': null, '9099/tcp': 9000 }, network_description: { '9099/tcp': 'Web UI port' } })).toBe(9099);
  });
});

describe('maintenance route', () => {
  it('rejects shared-token and non-admin users', async () => {
    const shared = await startApp({ user: { id: '__shared__', source: 'shared-token' } });
    expect((await fetch(shared.url('/status'))).status).toBe(403);
    const nonAdmin = await startApp({ user: ingressAdmin, isAdmin: false });
    expect((await fetch(nonAdmin.url('/status'))).status).toBe(403);
  });

  it('reports a missing Portainer and refuses to prune', async () => {
    const app = await startApp({ user: ingressAdmin, installed: false });
    expect(await (await fetch(app.url('/status'))).json()).toMatchObject({ portainer: { installed: false } });
    const res = await fetch(app.url('/build-prune'), { method: 'POST' });
    expect(res.status).toBe(404);
    expect(app.calls.some((c) => c.includes('/start'))).toBe(false);
  });

  it('starts a stopped Portainer, prunes with all=true and stops it again', async () => {
    const app = await startApp({ user: ingressAdmin, state: 'stopped' });
    const res = await fetch(app.url('/build-prune'), { method: 'POST' });
    expect(await res.json()).toEqual({ spaceReclaimed: 2048, cachesDeleted: 2, portainerStarted: true, portainerStopped: true });
    const order = app.calls.filter((c) => /start|auth|prune|stop/.test(c));
    expect(order).toEqual([
      'POST http://supervisor/addons/db21ed7f_portainer/start',
      'POST http://db21ed7f-portainer:9099/api/auth',
      'POST http://db21ed7f-portainer:9099/api/endpoints/1/docker/build/prune?all=true',
      'POST http://supervisor/addons/db21ed7f_portainer/stop',
    ]);
    const authCall = app.fetchImpl.mock.calls.find(([u]) => u.endsWith('/api/auth'));
    expect(JSON.parse(authCall[1].body)).toEqual({ Username: 'admin', Password: 'secret-pass' });
  });

  it('leaves an already running Portainer running', async () => {
    const app = await startApp({ user: ingressAdmin, state: 'started' });
    const res = await fetch(app.url('/build-prune'), { method: 'POST' });
    expect(await res.json()).toMatchObject({ portainerStarted: false, portainerStopped: false });
    expect(app.calls.some((c) => c.endsWith('/stop') || c.endsWith('/start'))).toBe(false);
  });
});
