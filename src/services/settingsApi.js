const API_BASE = './api';

import {
  getStoredAuthMethod,
  getValidatedHomeAssistantRequestHeadersAsync,
  notifyHomeAssistantApiUnauthorized,
} from './apiAuth';
import { isIngressPage, renewIngressSession } from '../utils/ingressSession';

async function request(
  path,
  options = {},
  { retryOnOAuthUnauthorized = true, authHeadersOverride = null } = {}
) {
  const authHeaders = authHeadersOverride ?? (await getValidatedHomeAssistantRequestHeadersAsync());
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: mergedHeaders,
  });

  if (!res.ok) {
    if (res.status === 401 && retryOnOAuthUnauthorized && getStoredAuthMethod() === 'oauth') {
      const retryHeaders = await getValidatedHomeAssistantRequestHeadersAsync({
        forceRefreshOAuth: true,
      });
      return request(
        path,
        {
          ...options,
        },
        {
          retryOnOAuthUnauthorized: false,
          authHeadersOverride: retryHeaders,
        }
      );
    }

    // Im Ingress kommt ein 401 vom Supervisor (Sitzung abgelaufen), nicht von HA: erneuern und nochmal
    if (res.status === 401 && retryOnOAuthUnauthorized && isIngressPage() && (await renewIngressSession())) {
      return request(path, { ...options }, { retryOnOAuthUnauthorized: false });
    }

    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw notifyHomeAssistantApiUnauthorized(body.error || 'Home Assistant authentication failed');
    }
    const error = /** @type {any} */ (new Error(body.error || `API error ${res.status}`));
    error.status = res.status;
    error.body = body;
    throw error;
  }

  return res.json();
}

export function fetchCurrentSettings(haUserId, deviceId, revision) {
  const revisionQuery = Number.isFinite(Number(revision))
    ? `&revision=${encodeURIComponent(revision)}`
    : '';
  return request(
    `/settings/current?ha_user_id=${encodeURIComponent(haUserId)}&device_id=${encodeURIComponent(deviceId)}${revisionQuery}`,
    {}
  );
}

export function fetchSettingsHistory(haUserId, deviceId, limit = 20) {
  return request(
    `/settings/history?ha_user_id=${encodeURIComponent(haUserId)}&device_id=${encodeURIComponent(deviceId)}&limit=${encodeURIComponent(limit)}`,
    {}
  );
}

export function deleteSettingsHistory(haUserId, deviceId, keepLatest = true) {
  const keepLatestQuery = keepLatest ? '1' : '0';
  return request(
    `/settings/history?ha_user_id=${encodeURIComponent(haUserId)}&device_id=${encodeURIComponent(deviceId)}&keep_latest=${keepLatestQuery}`,
    {
      method: 'DELETE',
    }
  );
}

export function saveCurrentSettings(
  { ha_user_id, device_id, data, base_revision, history_keep_limit, device_label },
  fetchOptions = {}
) {
  return request('/settings/current', {
    method: 'PUT',
    body: JSON.stringify({
      ha_user_id,
      device_id,
      data,
      base_revision,
      history_keep_limit,
      device_label,
    }),
    ...fetchOptions,
  });
}

export function fetchCurrentDevices(haUserId) {
  return request(`/settings/devices?ha_user_id=${encodeURIComponent(haUserId)}`, {});
}

export function deleteSettingsDevice(haUserId, deviceId) {
  return request(
    `/settings/devices?ha_user_id=${encodeURIComponent(haUserId)}&device_id=${encodeURIComponent(deviceId)}`,
    {
      method: 'DELETE',
    }
  );
}

export function updateSettingsDeviceLabel(haUserId, deviceId, deviceLabel) {
  return request('/settings/devices/label', {
    method: 'PUT',
    body: JSON.stringify({
      ha_user_id: haUserId,
      device_id: deviceId,
      device_label: deviceLabel,
    }),
  });
}

export function publishCurrentSettings({
  ha_user_id,
  source_device_id,
  target_device_id,
  history_keep_limit,
}) {
  return request('/settings/publish', {
    method: 'POST',
    body: JSON.stringify({ ha_user_id, source_device_id, target_device_id, history_keep_limit }),
  });
}

/** Playlist der Medien-Kachel (Winamp-Fenster) eines Raums lesen. */
export function fetchMedienPlaylist(raum) {
  return request(`/medien/playlist?raum=${encodeURIComponent(raum)}`);
}

/** Playlist der Medien-Kachel eines Raums speichern ({ items, index }). */
export function saveMedienPlaylist(raum, { items, index }) {
  return request('/medien/playlist', {
    method: 'PUT',
    body: JSON.stringify({ raum, items, index }),
  });
}

/** Gespeicherte Playlists eines Raums: [{ schluessel, name, anzahl, updated_at }]. */
export function fetchMedienListen(raum) {
  return request(`/medien/listen?raum=${encodeURIComponent(raum)}`);
}

/** Playlist (laufend oder gespeichert, über ihren Schlüssel) löschen. */
export function deleteMedienPlaylist(schluessel) {
  return request(`/medien/playlist?raum=${encodeURIComponent(schluessel)}`, { method: 'DELETE' });
}

/** Längen von Music-Assistant-Titeln über den Tunet-Server: { dauer: { uri: Sekunden }, aktiv }. */
/** Genres aus Music Assistant: { aktiv, items: [{ id, name, alben }] } */
export function fetchMedienGenres({ suche, offset, limit } = {}) {
  const q = new URLSearchParams();
  if (suche) q.set('suche', suche);
  if (offset) q.set('offset', String(offset));
  if (limit) q.set('limit', String(limit));
  const qs = q.toString();
  return request(`/medien/genres${qs ? `?${qs}` : ''}`);
}

/** Alben eines Genres: { aktiv, items: [{ uri, name, artists, year, media_type }] } */
export function fetchMedienGenreAlben(id) {
  return request(`/medien/genres/${encodeURIComponent(id)}/alben`);
}

/** Titel eines Genres (je 500, ab offset): { aktiv, items: [{ uri, name, artists, duration, media_type }] } */
export function fetchMedienGenreTitel(id, offset = 0) {
  return request(`/medien/genres/${encodeURIComponent(id)}/titel${offset ? `?offset=${offset}` : ''}`);
}

export function fetchMedienDauer(uris) {
  return request('/medien/dauer', {
    method: 'POST',
    body: JSON.stringify({ uris }),
  });
}

// Kalender: Termine in CalDAV-Kalendern löschen (kann die HA-Integration nicht)
export function fetchKalenderStatus() {
  return request('/kalender/status');
}

export function kalenderTerminLoeschen({ entityId, uid, start, serie = false }) {
  return request('/kalender/loeschen', {
    method: 'POST',
    body: JSON.stringify({ entityId, uid, start, serie }),
  });
}
