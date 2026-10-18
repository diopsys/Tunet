import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCurrentSettings as apiFetchCurrentSettings,
  fetchSettingsHistory as apiFetchSettingsHistory,
  deleteSettingsHistory as apiDeleteSettingsHistory,
  deleteSettingsDevice as apiDeleteSettingsDevice,
  updateSettingsDeviceLabel as apiUpdateSettingsDeviceLabel,
  saveCurrentSettings as apiSaveCurrentSettings,
  fetchCurrentDevices as apiFetchCurrentDevices,
  publishCurrentSettings as apiPublishCurrentSettings,
} from '../services/settingsApi';
import { collectSnapshot, applySnapshot, isValidSnapshot } from '../services/snapshot';

// All devices share a single settings slot so the dashboard is
// automatically in sync across PC, phone and tablet without any
// manual "publish to device" step.
const SHARED_DEVICE_ID = 'shared';
const getOrCreateDeviceId = () => SHARED_DEVICE_ID;

// Returns true if the data has at least one card on any page or in the header.
// Used to avoid pushing an empty/default state to the server from a fresh device.
const hasMeaningfulContent = (data) => {
  if (!data || typeof data !== 'object') return false;
  const pagesConfig = data.layout?.pagesConfig ?? data.pagesConfig;
  if (!pagesConfig || typeof pagesConfig !== 'object') return false;
  const pages = Array.isArray(pagesConfig.pages) ? pagesConfig.pages : [];
  return (
    pages.some((id) => Array.isArray(pagesConfig[id]) && pagesConfig[id].length > 0) ||
    (Array.isArray(pagesConfig.header) && pagesConfig.header.length > 0)
  );
};

const clampHistoryKeepLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 5), 500);
};

const getStoredDeviceLabel = () => {
  try {
    return (localStorage.getItem('tunet_device_label') || '').trim();
  } catch {
    return '';
  }
};

const hasDefaultDashboardLayout = (snapshot) => {
  const layout = snapshot?.layout;
  if (!layout) return false;
  const pagesConfig = layout.pagesConfig || {};
  const pages = Array.isArray(pagesConfig.pages) ? pagesConfig.pages : [];
  const header = Array.isArray(pagesConfig.header) ? pagesConfig.header : [];
  const homeCards = Array.isArray(pagesConfig.home) ? pagesConfig.home : [];
  if (pages.length !== 1 || pages[0] !== 'home' || header.length > 0 || homeCards.length > 0) {
    return false;
  }
  const isEmptyObject = (value) =>
    value == null || (typeof value === 'object' && Object.keys(value).length === 0);
  const isEmptyArray = (value) => value == null || (Array.isArray(value) && value.length === 0);
  return (
    isEmptyObject(layout.cardSettings) &&
    isEmptyObject(layout.customNames) &&
    isEmptyObject(layout.customIcons) &&
    isEmptyObject(layout.pageSettings) &&
    isEmptyArray(layout.hiddenCards)
  );
};

const READ_CURRENT_FAILED = Symbol('READ_CURRENT_FAILED');
const isServiceUnavailableError = (error) => Number(error?.status) === 503;

export function useSettingsSync({ haUserId, contextSettersRef, autoBootstrap = true }) {
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const deviceLabelRef = useRef(getStoredDeviceLabel());
  const [enabled, setEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem('tunet_auto_sync_enabled');
      return raw == null ? true : raw !== '0';
    } catch {
      return true;
    }
  });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [currentRevision, setCurrentRevisionState] = useState(null);
  const [knownDevices, setKnownDevices] = useState([]);
  const [history, setHistory] = useState([]);
  const [backgroundSyncSuspended, setBackgroundSyncSuspendedState] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [removingDeviceId, setRemovingDeviceId] = useState('');
  const [updatingDeviceId, setUpdatingDeviceId] = useState('');
  const [historyKeepLimit, setHistoryKeepLimit] = useState(() => {
    try {
      const raw = localStorage.getItem('tunet_history_keep_limit');
      return clampHistoryKeepLimit(raw ?? 50);
    } catch {
      return 50;
    }
  });

  const autoSyncTimerRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const lastObservedHashRef = useRef('');
  const lastUploadedHashRef = useRef('');
  const pushCurrentToServerRef = useRef(null);
  const backgroundSyncSuspendedRef = useRef(false);
  const currentRevisionRef = useRef(null);

  const setCurrentRevision = useCallback((nextRevision) => {
    const normalized = Number.isFinite(Number(nextRevision)) ? Number(nextRevision) : null;
    currentRevisionRef.current = normalized;
    setCurrentRevisionState(normalized);
    return normalized;
  }, []);

  const setBackgroundSyncSuspended = useCallback((next) => {
    backgroundSyncSuspendedRef.current = next;
    setBackgroundSyncSuspendedState(next);
    if (next && autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
  }, []);

  const updateBackgroundSyncAvailability = useCallback(
    (isAvailable, error = null) => {
      if (isAvailable) {
        if (backgroundSyncSuspendedRef.current) {
          setBackgroundSyncSuspended(false);
        }
        return;
      }

      if (isServiceUnavailableError(error)) {
        setBackgroundSyncSuspended(true);
      }
    },
    [setBackgroundSyncSuspended]
  );

  useEffect(() => {
    try {
      localStorage.setItem('tunet_auto_sync_enabled', enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [enabled]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'tunet_history_keep_limit',
        String(clampHistoryKeepLimit(historyKeepLimit))
      );
    } catch {
      // ignore storage errors
    }
  }, [historyKeepLimit]);

  const refreshKnownDevices = useCallback(async () => {
    if (!haUserId) return;
    try {
      const rows = await apiFetchCurrentDevices(haUserId);
      setKnownDevices(Array.isArray(rows) ? rows : []);
    } catch {
      // ignore device list errors
    }
  }, [haUserId]);

  const refreshHistory = useCallback(async () => {
    if (!haUserId) return;
    try {
      const rows = await apiFetchSettingsHistory(haUserId, deviceIdRef.current, 30);
      setHistory(Array.isArray(rows) ? rows : []);
    } catch {
      setHistory([]);
    }
  }, [haUserId]);

  const readCurrentFromServer = useCallback(async () => {
    if (!haUserId) return null;
    try {
      const row = await apiFetchCurrentSettings(haUserId, deviceIdRef.current);
      updateBackgroundSyncAvailability(true);
      if (row && typeof row === 'object') {
        setCurrentRevision(Number.isFinite(Number(row.revision)) ? Number(row.revision) : null);
        if (typeof row.device_label === 'string') {
          deviceLabelRef.current = row.device_label.trim();
          try {
            localStorage.setItem('tunet_device_label', deviceLabelRef.current);
          } catch {
            // ignore storage errors
          }
        }
        const serialized = JSON.stringify(row.data || {});
        lastUploadedHashRef.current = serialized;
        lastObservedHashRef.current = serialized;
        setLastSyncedAt(row.updated_at || null);
        setStatus('synced');
      }
      return row;
    } catch (fetchError) {
      updateBackgroundSyncAvailability(false, fetchError);
      setStatus('error');
      setError(fetchError?.message || 'Failed to fetch current settings');
      return READ_CURRENT_FAILED;
    }
  }, [haUserId, setCurrentRevision, updateBackgroundSyncAvailability]);

  const applyServerRow = useCallback(
    async (row, options = {}) => {
      if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.revision))) return false;

      const forcedServerRevision = Number.isFinite(Number(options.forceServerRevision))
        ? Number(options.forceServerRevision)
        : null;
      const serverRevision = Number(row.revision);
      const localRevision = Number.isFinite(Number(currentRevisionRef.current))
        ? Number(currentRevisionRef.current)
        : 0;
      if (forcedServerRevision !== null && serverRevision < forcedServerRevision) return false;
      if (forcedServerRevision === null && serverRevision <= localRevision) return false;

      let localSerialized =
        typeof options.localSerializedOverride === 'string' ? options.localSerializedOverride : '';
      if (!localSerialized) {
        try {
          const snapshot = collectSnapshot();
          if (isValidSnapshot(snapshot)) {
            localSerialized = JSON.stringify(snapshot);
          }
        } catch {
          localSerialized = '';
        }
      }

      const hasKnownBaseline = Boolean(lastUploadedHashRef.current);
      if (hasKnownBaseline && localSerialized && localSerialized !== lastUploadedHashRef.current) {
        return false;
      }

      if (!row.data || typeof row.data !== 'object') return false;
      applySnapshot(row.data, contextSettersRef?.current || {});

      const serialized = JSON.stringify(row.data || {});
      lastUploadedHashRef.current = serialized;
      lastObservedHashRef.current = serialized;
      setCurrentRevision(serverRevision);
      setLastSyncedAt(row.updated_at || null);
      setStatus('synced');
      setError('');
      await refreshHistory();
      return true;
    },
    [contextSettersRef, refreshHistory, setCurrentRevision]
  );

  const reconcileFromServer = useCallback(
    async (options = {}) => {
      if (!haUserId) return false;

      const forcedServerRevision = Number.isFinite(Number(options.forceServerRevision))
        ? Number(options.forceServerRevision)
        : null;

      try {
        const row = await apiFetchCurrentSettings(haUserId, deviceIdRef.current);
        updateBackgroundSyncAvailability(true);
        return applyServerRow(row, { ...options, forceServerRevision: forcedServerRevision });
      } catch (error) {
        updateBackgroundSyncAvailability(false, error);
        // ignore reconciliation errors
        return false;
      }
    },
    [haUserId, applyServerRow, updateBackgroundSyncAvailability]
  );

  const pushCurrentToServer = useCallback(
    async (options = {}) => {
      if (!haUserId) return null;

      const snapshot = collectSnapshot();
      if (!isValidSnapshot(snapshot)) {
        const validationError = new Error('Invalid snapshot data');
        setStatus('error');
        setError(validationError.message);
        throw validationError;
      }

      const serialized = JSON.stringify(snapshot);
      if (!options.force && serialized === lastUploadedHashRef.current) {
        return null;
      }

      setStatus('syncing');
      setError('');

      const saveSnapshot = (baseRevision) =>
        apiSaveCurrentSettings(
          {
            ha_user_id: haUserId,
            device_id: deviceIdRef.current,
            data: snapshot,
            base_revision: baseRevision,
            history_keep_limit: clampHistoryKeepLimit(historyKeepLimit),
            device_label: deviceLabelRef.current || undefined,
          },
          options.fetchOptions || {}
        );

      const markSaveSynced = async (response) => {
        const resolvedRevision = Number.isFinite(Number(response?.revision))
          ? Number(response.revision)
          : currentRevisionRef.current;
        setCurrentRevision(resolvedRevision);
        setLastSyncedAt(response?.updated_at || new Date().toISOString());
        setStatus('synced');
        setError('');
        lastUploadedHashRef.current = serialized;
        lastObservedHashRef.current = serialized;
        await refreshKnownDevices();
        await refreshHistory();
        return response;
      };

      try {
        const response = await saveSnapshot(currentRevisionRef.current);

        updateBackgroundSyncAvailability(true);
        return markSaveSynced(response);
      } catch (saveError) {
        if (saveError?.status === 409 && Number.isFinite(Number(saveError?.body?.revision))) {
          const conflictRevision = Number(saveError.body.revision);
          setCurrentRevision(conflictRevision);
          setStatus('conflict');
          setError('Revision conflict');
          const hasLocalChanges =
            !lastUploadedHashRef.current || serialized !== lastUploadedHashRef.current;

          if (!hasLocalChanges) {
            const appliedServer = await reconcileFromServer({
              forceServerRevision: conflictRevision,
              localSerializedOverride: serialized,
            });
            if (appliedServer) return null;
          }

          try {
            const response = await saveSnapshot(conflictRevision);
            updateBackgroundSyncAvailability(true);
            return markSaveSynced(response);
          } catch (retryError) {
            if (retryError?.status === 409 && Number.isFinite(Number(retryError?.body?.revision))) {
              setCurrentRevision(Number(retryError.body.revision));
              setStatus('conflict');
              setError('Revision conflict');
            } else {
              setStatus('error');
              setError(retryError?.message || 'Failed to sync settings');
            }
            updateBackgroundSyncAvailability(false, retryError);
            throw retryError;
          }
        } else {
          setStatus('error');
          setError(saveError?.message || 'Failed to sync settings');
        }
        updateBackgroundSyncAvailability(false, saveError);
        throw saveError;
      }
    },
    [
      haUserId,
      historyKeepLimit,
      reconcileFromServer,
      refreshKnownDevices,
      refreshHistory,
      setCurrentRevision,
      updateBackgroundSyncAvailability,
    ]
  );

  pushCurrentToServerRef.current = pushCurrentToServer;

  const queueAutoSync = useCallback(
    (force = false, { ignoreEnabled = false, ignoreSuspended = false } = {}) => {
      if ((!enabled && !ignoreEnabled) || !haUserId) return;
      if (backgroundSyncSuspendedRef.current && !ignoreSuspended) return;

      const snapshot = collectSnapshot();
      if (!isValidSnapshot(snapshot)) return;
      const serialized = JSON.stringify(snapshot);

      if (!force && serialized === lastObservedHashRef.current) return;
      lastObservedHashRef.current = serialized;

      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = setTimeout(
        async () => {
          if (syncInFlightRef.current) return;
          syncInFlightRef.current = true;
          try {
            await pushCurrentToServer({ force });
          } catch {
            // state already handled
          } finally {
            syncInFlightRef.current = false;
          }
        },
        force ? 0 : 3500
      );
    },
    [enabled, haUserId, pushCurrentToServer]
  );

  // On mount: if local state has no cards and the server has a shared dashboard,
  // apply it immediately — before HA auth resolves. This ensures a fresh device
  // (e.g. iPhone first launch) gets the correct dashboard without waiting for
  // the full auth + bootstrap cycle.
  useEffect(() => {
    const localSnapshot = collectSnapshot();
    if (hasMeaningfulContent(localSnapshot?.layout)) return;

    fetch('./api/shared-dashboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !hasMeaningfulContent(data)) return;
        applySnapshot(data, contextSettersRef.current || {});
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoBootstrap || !haUserId) return;
    let disposed = false;

    const bootstrap = async () => {
      const row = await readCurrentFromServer();
      if (disposed) return;

      if (row === READ_CURRENT_FAILED) {
        if (!backgroundSyncSuspendedRef.current) {
          await refreshKnownDevices();
          await refreshHistory();
        }
        return;
      }

      const serverHasContent = row && typeof row.data === 'object' && hasMeaningfulContent(row.data);

      if (serverHasContent) {
        // Server has a real dashboard — apply it so all devices stay in sync.
        applySnapshot(row.data, contextSettersRef.current);
      } else if (row === null) {
        // Server has no row yet — register this device by saving current state.
        // We call the API directly (not pushCurrentToServer) so currentRevision
        // stays null, allowing the background interval to apply any published
        // shared config that arrives on the next poll.
        const localSnapshot = collectSnapshot();
        if (isValidSnapshot(localSnapshot)) {
          try {
            await apiSaveCurrentSettings({
              ha_user_id: haUserId,
              device_id: deviceIdRef.current,
              data: localSnapshot,
              base_revision: null,
              history_keep_limit: clampHistoryKeepLimit(historyKeepLimit),
              device_label: deviceLabelRef.current || undefined,
            });
          } catch {
            // ignore registration errors
          }
        }
      } else if (row.data) {
        // Fresh device (default dashboard) with existing server settings:
        // adopt them locally. readCurrentFromServer only records the
        // revision/baseline; without this the server config never reaches
        // the UI when it already differs from local state at bootstrap.
        let localSnapshot = null;
        try {
          localSnapshot = collectSnapshot();
        } catch {
          localSnapshot = null;
        }
        if (
          localSnapshot &&
          isValidSnapshot(localSnapshot) &&
          hasDefaultDashboardLayout(localSnapshot)
        ) {
          applySnapshot(row.data, contextSettersRef?.current || {});
        }
      }

      if (disposed) return;
      await refreshKnownDevices();
      await refreshHistory();
    };

    bootstrap();
    return () => {
      disposed = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- contextSettersRef identity is not stable across renders in all callers
  }, [
    autoBootstrap,
    haUserId,
    readCurrentFromServer,
    refreshKnownDevices,
    refreshHistory,
  ]);

  useEffect(() => {
    if (!autoBootstrap || !haUserId) return;
    const id = setInterval(() => {
      if (!backgroundSyncSuspendedRef.current) {
        reconcileFromServer();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [autoBootstrap, haUserId, reconcileFromServer]);

  useEffect(() => {
    if (!haUserId || typeof globalThis.window === 'undefined') return undefined;

    const handleEditDone = () => {
      queueAutoSync(true, { ignoreEnabled: true });
    };

    globalThis.window.addEventListener('tunet:edit-done', handleEditDone);
    return () => {
      globalThis.window.removeEventListener('tunet:edit-done', handleEditDone);
    };
  }, [haUserId, queueAutoSync]);

  const loadCurrentFromServer = useCallback(
    async (revision) => {
      const row = Number.isFinite(Number(revision))
        ? await apiFetchCurrentSettings(haUserId, deviceIdRef.current, Number(revision))
        : await readCurrentFromServer();
      if (row === READ_CURRENT_FAILED) return;
      if (!row?.data || typeof row.data !== 'object') return;

      if (Number.isFinite(Number(row.revision))) {
        setCurrentRevision(Number(row.revision));
      }
      if (row.updated_at) {
        setLastSyncedAt(row.updated_at);
      }

      applySnapshot(row.data, contextSettersRef?.current || {});
    },
    [haUserId, readCurrentFromServer, contextSettersRef, setCurrentRevision]
  );

  const publishCurrentToDevices = useCallback(
    async (targetDeviceIds) => {
      if (!haUserId) return;
      setPublishing(true);
      setError('');
      try {
        await pushCurrentToServer({ force: true });

        const normalizedTargets = Array.isArray(targetDeviceIds)
          ? [
              ...new Set(
                targetDeviceIds
                  .filter((id) => typeof id === 'string' && id.trim())
                  .map((id) => id.trim())
              ),
            ]
          : [];

        if (normalizedTargets.length === 0) {
          await apiPublishCurrentSettings({
            ha_user_id: haUserId,
            source_device_id: deviceIdRef.current,
            target_device_id: undefined,
            history_keep_limit: clampHistoryKeepLimit(historyKeepLimit),
          });
        } else {
          await Promise.all(
            normalizedTargets.map((targetDeviceId) =>
              apiPublishCurrentSettings({
                ha_user_id: haUserId,
                source_device_id: deviceIdRef.current,
                target_device_id: targetDeviceId,
                history_keep_limit: clampHistoryKeepLimit(historyKeepLimit),
              })
            )
          );
        }
        await refreshKnownDevices();
        await refreshHistory();
      } catch (publishError) {
        setStatus('error');
        setError(publishError?.message || 'Failed to publish settings');
        throw publishError;
      } finally {
        setPublishing(false);
      }
    },
    [haUserId, historyKeepLimit, pushCurrentToServer, refreshKnownDevices, refreshHistory]
  );

  const clearHistory = useCallback(async () => {
    if (!haUserId) return;
    setClearingHistory(true);
    setError('');
    try {
      await apiDeleteSettingsHistory(haUserId, deviceIdRef.current, true);
      await refreshHistory();
    } catch (historyError) {
      setStatus('error');
      setError(historyError?.message || 'Failed to clear revision history');
      throw historyError;
    } finally {
      setClearingHistory(false);
    }
  }, [haUserId, refreshHistory]);

  const removeKnownDevice = useCallback(
    async (targetDeviceId) => {
      if (!haUserId || !targetDeviceId) return;
      if (targetDeviceId === deviceIdRef.current) {
        const removeCurrentError = new Error('Cannot remove current device');
        setStatus('error');
        setError(removeCurrentError.message);
        throw removeCurrentError;
      }

      setRemovingDeviceId(targetDeviceId);
      setError('');
      try {
        await apiDeleteSettingsDevice(haUserId, targetDeviceId);
        await refreshKnownDevices();
      } catch (removeError) {
        setStatus('error');
        setError(removeError?.message || 'Failed to remove device');
        throw removeError;
      } finally {
        setRemovingDeviceId('');
      }
    },
    [haUserId, refreshKnownDevices]
  );

  const renameKnownDevice = useCallback(
    async (targetDeviceId, nextLabel) => {
      if (!haUserId || !targetDeviceId) return;

      setUpdatingDeviceId(targetDeviceId);
      setError('');
      try {
        await apiUpdateSettingsDeviceLabel(haUserId, targetDeviceId, nextLabel);
        if (targetDeviceId === deviceIdRef.current) {
          const normalized = typeof nextLabel === 'string' ? nextLabel.trim() : '';
          deviceLabelRef.current = normalized;
          try {
            localStorage.setItem('tunet_device_label', normalized);
          } catch {
            // ignore storage errors
          }
        }
        await refreshKnownDevices();
      } catch (renameError) {
        setStatus('error');
        setError(renameError?.message || 'Failed to rename device');
        throw renameError;
      } finally {
        setUpdatingDeviceId('');
      }
    },
    [haUserId, refreshKnownDevices]
  );

  return {
    enabled,
    setEnabled,
    status,
    error,
    backgroundSyncSuspended,
    lastSyncedAt,
    deviceId: deviceIdRef.current,
    currentRevision,
    knownDevices,
    history,
    publishing,
    clearingHistory,
    removingDeviceId,
    updatingDeviceId,
    historyKeepLimit,
    setHistoryKeepLimit,
    syncNow: () => queueAutoSync(true, { ignoreEnabled: true, ignoreSuspended: true }),
    loadCurrentFromServer,
    publishCurrentToDevices,
    clearHistory,
    removeKnownDevice,
    renameKnownDevice,
    refreshKnownDevices,
  };
}
