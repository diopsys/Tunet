// Zugriff des Servers auf Home Assistant für die Zeitschaltuhr (REST).
// Im Add-on über den Supervisor-Proxy mit SUPERVISOR_TOKEN, sonst über HA_URL + HA_TOKEN.

const REQUEST_TIMEOUT_MS = 10_000;

export function resolveHomeAssistantTarget(env = process.env) {
  if (env.SUPERVISOR_TOKEN) {
    return { baseUrl: 'http://supervisor/core/api', token: env.SUPERVISOR_TOKEN, via: 'supervisor' };
  }
  const url = env.TUNET_INTERNAL_HA_URL || env.HA_URL;
  const token = env.TUNET_SCHEDULER_HA_TOKEN || env.HA_TOKEN;
  if (url && token) {
    return { baseUrl: `${String(url).replace(/\/+$/, '').replace(/\/api$/, '')}/api`, token, via: 'token' };
  }
  return null;
}

export function createHomeAssistantApi(target, fetchImpl = globalThis.fetch) {
  const request = async (path, { method = 'GET', body } = {}) => {
    const res = await fetchImpl(`${target.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HA ${method} ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    const type = res.headers.get?.('content-type') || '';
    return type.includes('application/json') ? res.json() : res.text();
  };

  return {
    getConfig: () => request('/config'),
    getStates: () => request('/states'),
    callService: (domain, service, data) => request(`/services/${domain}/${service}`, { method: 'POST', body: data }),
    /** Entitäten eines Bereichs, optional auf eine Domain beschränkt. */
    async areaEntities(areaId, domain) {
      const text = await request('/template', {
        method: 'POST',
        body: { template: `{{ area_entities(${JSON.stringify(areaId)}) | tojson }}` },
      });
      const ids = JSON.parse(typeof text === 'string' ? text : JSON.stringify(text));
      return Array.isArray(ids) ? ids.filter((id) => !domain || id.startsWith(`${domain}.`)) : [];
    },
  };
}
