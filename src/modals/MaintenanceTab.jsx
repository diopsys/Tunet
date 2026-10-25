import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, HardDrive, RefreshCw } from '../icons';
import { getMaintenanceStatus, pruneBuildCache } from '../services/maintenanceApi';

const ACCESS_HINTS = {
  NO_SUPERVISOR: 'Nur verfügbar, wenn Tunet als Home-Assistant-Add-on läuft.',
  NOT_INGRESS: 'Nur über die Home-Assistant-Oberfläche (Seitenleiste) verfügbar.',
  NOT_ADMIN: 'Nur für Home-Assistant-Administratoren.',
};

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2).replace('.', ',')} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const STATE_LABEL = { started: 'läuft', stopped: 'gestoppt' };

export default function MaintenanceTab() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const next = await getMaintenanceStatus();
      setStatus(next);
      if (next.running) setRunning(true);
    } catch (error) {
      setStatus(null);
      setStatusError(error);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const runPrune = async () => {
    setConfirming(false);
    setRunning(true);
    setResult(null);
    setRunError(null);
    try {
      setResult(await pruneBuildCache());
    } catch (error) {
      setRunError(error);
    } finally {
      setRunning(false);
      loadStatus();
    }
  };

  const portainer = status?.portainer;
  const accessHint = statusError ? ACCESS_HINTS[statusError.code] : null;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 font-sans duration-300">
      <div className="rounded-2xl bg-[var(--glass-bg)] p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-lg bg-[var(--accent-bg)] p-2 text-[var(--accent-color)]">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Docker-Build-Cache leeren</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Gibt Speicher frei, den Add-on-Builds (z. B. Tunet-Updates) auf dem Host belegen.
            </p>
          </div>
        </div>

        {statusError ? (
          <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--status-warning-fg,#f59e0b)]" />
            {accessHint || `Status konnte nicht geladen werden: ${statusError.message}`}
          </p>
        ) : !status ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <RefreshCw className="h-4 w-4 animate-spin" /> Prüfe Portainer …
          </p>
        ) : !portainer?.installed ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--status-warning-fg,#f59e0b)]" />
              Portainer ist nicht installiert. Installiere das Add-on „Portainer“ manuell in Home Assistant, danach
              lässt sich der Cache hier leeren.
            </p>
            <button
              type="button"
              onClick={loadStatus}
              className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-4 py-2 text-xs font-bold tracking-wide text-[var(--text-primary)] uppercase hover:bg-[var(--glass-bg-hover)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Erneut prüfen
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {portainer.name || 'Portainer'}: <span className="font-semibold text-[var(--text-primary)]">{STATE_LABEL[portainer.state] || portainer.state}</span>
              {portainer.state !== 'started' && ' – wird für die Bereinigung kurz gestartet und danach wieder gestoppt.'}
            </p>

            {running ? (
              <p className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <RefreshCw className="h-4 w-4 animate-spin" /> Bereinigung läuft … das kann einige Minuten dauern.
              </p>
            ) : confirming ? (
              <div className="space-y-3 rounded-xl border border-[var(--glass-border)] p-4">
                <p className="text-sm text-[var(--text-primary)]">
                  Build-Cache wirklich leeren? Das nächste Add-on-Update baut dann etwas länger.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-xs font-bold tracking-wide text-[var(--text-secondary)] uppercase hover:bg-[var(--glass-bg-hover)]"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={runPrune}
                    className="flex-1 rounded-xl bg-[var(--accent-color)] py-2.5 text-xs font-bold tracking-wide text-white uppercase hover:opacity-90"
                  >
                    Leeren
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full rounded-xl border border-[var(--accent-color)] bg-[var(--accent-bg)] py-3 text-sm font-bold tracking-widest text-[var(--accent-color)] uppercase hover:opacity-90"
              >
                Build-Cache leeren
              </button>
            )}

            {result && (
              <p className="flex items-start gap-2 text-sm text-[var(--status-success-fg)]">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {formatBytes(result.spaceReclaimed)} freigegeben · {result.cachesDeleted} Cache-Einträge gelöscht
                {result.portainerStarted && (result.portainerStopped ? ' · Portainer wieder gestoppt' : ' · Portainer konnte nicht gestoppt werden')}
              </p>
            )}
            {runError && (
              <p className="flex items-start gap-2 text-sm text-[var(--status-error-fg,#f87171)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {runError.message}
                {runError.body?.portainerStarted && !runError.body?.portainerStopped && ' – Portainer läuft noch.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
