import { getValidatedHomeAssistantRequestHeadersAsync } from './apiAuth';

async function call(path, method = 'GET') {
  const headers = await getValidatedHomeAssistantRequestHeadersAsync();
  const res = await fetch(`./api/maintenance${path}`, { method, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = /** @type {any} */ (new Error(body.error || `Fehler ${res.status}`));
    error.code = body.code;
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export const getMaintenanceStatus = () => call('/status');
export const pruneBuildCache = () => call('/build-prune', 'POST');
