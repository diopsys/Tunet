import { Router } from 'express';
import { createConnection, createLongLivedTokenAuth } from 'home-assistant-js-websocket';

const SUPERVISOR_URL = 'http://supervisor';
const PORTAINER_READY_TIMEOUT_MS = 120_000;
const PRUNE_TIMEOUT_MS = 15 * 60_000;
const ADMIN_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_PORTAINER_PORT = 9000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function supervisorRequest(fetchImpl, token, path, { method = 'GET' } = {}) {
  const res = await fetchImpl(`${SUPERVISOR_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.result === 'error') {
    throw new Error(body.message || `Supervisor ${method} ${path} failed (${res.status})`);
  }
  return body.data ?? {};
}

export function findPortainerAddon(addons) {
  return (addons || []).find(
    (a) => /(^|_)portainer$/i.test(a?.slug || '') || /^portainer$/i.test(a?.name || '')
  );
}

/** Container port of the Portainer web UI, taken from the add-on's network map. */
export function portainerPort(info) {
  const network = info?.network || {};
  const descriptions = info?.network_description || {};
  const keys = Object.keys(network).filter((k) => k.endsWith('/tcp'));
  const web = keys.find((k) => /web/i.test(descriptions[k] || '')) || keys.find((k) => !k.startsWith('8000'));
  const port = web ? Number.parseInt(web, 10) : NaN;
  return Number.isFinite(port) ? port : DEFAULT_PORTAINER_PORT;
}

async function loadIsAdminFromSupervisor(token, userId) {
  const connection = await createConnection({
    auth: createLongLivedTokenAuth(`${SUPERVISOR_URL}/core`, token),
  });
  try {
    const users = await connection.sendMessagePromise({ type: 'config/auth/list' });
    const user = (users || []).find((u) => u.id === userId);
    return Boolean(user && (user.is_admin || user.group_ids?.includes('system-admin')));
  } finally {
    try {
      connection.close();
    } catch {
      // ignore close errors
    }
  }
}

export function createMaintenanceRouter({
  fetchImpl = globalThis.fetch,
  getToken = () => process.env.SUPERVISOR_TOKEN,
  getPortainerPassword = () => process.env.PORTAINER_PASSWORD,
  resolveIsAdmin = loadIsAdminFromSupervisor,
  wait = sleep,
  readyTimeoutMs = PORTAINER_READY_TIMEOUT_MS,
} = {}) {
  const router = Router();
  const adminCache = new Map();
  let pruneRunning = false;

  // Only real HA users coming through the supervisor ingress, and only admins
  router.use(async (req, res, next) => {
    const token = getToken();
    if (!token) {
      res.status(503).json({ error: 'Nur im Home-Assistant-Add-on verfügbar', code: 'NO_SUPERVISOR' });
      return;
    }
    const user = req.authenticatedHaUser;
    if (!user || user.source !== 'supervisor-ingress') {
      res.status(403).json({ error: 'Nur über die Home-Assistant-Oberfläche verfügbar', code: 'NOT_INGRESS' });
      return;
    }
    try {
      const cached = adminCache.get(user.id);
      let isAdmin = cached && cached.expires > Date.now() ? cached.value : null;
      if (isAdmin == null) {
        isAdmin = await resolveIsAdmin(token, user.id);
        adminCache.set(user.id, { value: isAdmin, expires: Date.now() + ADMIN_CACHE_TTL_MS });
      }
      if (!isAdmin) {
        res.status(403).json({ error: 'Nur für Home-Assistant-Administratoren', code: 'NOT_ADMIN' });
        return;
      }
    } catch (error) {
      res.status(502).json({ error: `Rechteprüfung fehlgeschlagen: ${error.message}`, code: 'ADMIN_CHECK_FAILED' });
      return;
    }
    req.supervisorToken = token;
    next();
  });

  const loadPortainer = async (token) => {
    const { addons } = await supervisorRequest(fetchImpl, token, '/addons');
    const addon = findPortainerAddon(addons);
    if (!addon) return null;
    const info = await supervisorRequest(fetchImpl, token, `/addons/${addon.slug}/info`);
    return { slug: addon.slug, name: info.name || addon.name, state: info.state, info };
  };

  router.get('/status', async (req, res) => {
    try {
      const portainer = await loadPortainer(req.supervisorToken);
      res.json({
        running: pruneRunning,
        portainer: portainer
          ? { installed: true, slug: portainer.slug, name: portainer.name, state: portainer.state }
          : { installed: false },
      });
    } catch (error) {
      res.status(502).json({ error: error.message, code: 'SUPERVISOR_ERROR' });
    }
  });

  router.post('/build-prune', async (req, res) => {
    if (pruneRunning) {
      res.status(409).json({ error: 'Es läuft bereits eine Bereinigung', code: 'BUSY' });
      return;
    }
    pruneRunning = true;
    const token = req.supervisorToken;
    let portainer = null;
    let startedByUs = false;
    let result = null;
    let failure = null;
    try {
      portainer = await loadPortainer(token);
      if (!portainer) {
        failure = { status: 404, error: 'Portainer ist nicht installiert', code: 'PORTAINER_MISSING' };
      } else {
        const host = portainer.info.hostname || portainer.slug.replace(/_/g, '-');
        const base = `http://${host}:${portainerPort(portainer.info)}`;

        if (portainer.state !== 'started') {
          await supervisorRequest(fetchImpl, token, `/addons/${portainer.slug}/start`, { method: 'POST' });
          startedByUs = true;
        }

        const deadline = Date.now() + readyTimeoutMs;
        for (;;) {
          const ok = await fetchImpl(`${base}/api/system/status`).then((r) => r.ok).catch(() => false);
          if (ok) break;
          if (Date.now() > deadline) throw new Error('Portainer ist nicht rechtzeitig erreichbar');
          await wait(2000);
        }

        const password = getPortainerPassword() || portainer.info.options?.password;
        if (!password) throw new Error('Kein Portainer-Passwort gefunden');
        const authRes = await fetchImpl(`${base}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Username: process.env.PORTAINER_USERNAME || 'admin', Password: password }),
        });
        const auth = await authRes.json().catch(() => ({}));
        if (!authRes.ok || !auth.jwt) throw new Error('Anmeldung bei Portainer fehlgeschlagen');

        // `all=true` must be a query parameter; in the body it is ignored and nothing is reclaimed
        const pruneRes = await fetchImpl(`${base}/api/endpoints/1/docker/build/prune?all=true`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.jwt}` },
          signal: AbortSignal.timeout(PRUNE_TIMEOUT_MS),
        });
        const pruned = await pruneRes.json().catch(() => ({}));
        if (!pruneRes.ok) throw new Error(pruned.message || `Prune fehlgeschlagen (${pruneRes.status})`);
        result = {
          spaceReclaimed: Number(pruned.SpaceReclaimed) || 0,
          cachesDeleted: Array.isArray(pruned.CachesDeleted) ? pruned.CachesDeleted.length : 0,
        };
      }
    } catch (error) {
      failure = { status: 502, error: error.message, code: 'PRUNE_FAILED' };
    }

    let portainerStopped = false;
    if (startedByUs) {
      try {
        await supervisorRequest(fetchImpl, token, `/addons/${portainer.slug}/stop`, { method: 'POST' });
        portainerStopped = true;
      } catch (error) {
        console.warn(`[maintenance] Portainer konnte nicht gestoppt werden: ${error.message}`);
      }
    }
    pruneRunning = false;

    if (failure) {
      res.status(failure.status).json({ ...failure, portainerStarted: startedByUs, portainerStopped });
      return;
    }
    res.json({ ...result, portainerStarted: startedByUs, portainerStopped });
  });

  return router;
}

export default createMaintenanceRouter();
