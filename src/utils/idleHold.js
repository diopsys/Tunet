import { useEffect } from 'react';

/**
 * Hält den Rücksprung zur Startseite („Zurück zur Startseite“) an, solange etwas läuft,
 * das man nur anschaut, ohne den Bildschirm zu berühren – z. B. ein Kamera-Livebild.
 * Zähler statt Schalter, weil mehrere Kameras gleichzeitig sichtbar sein können.
 */
let holds = 0;
const listeners = new Set();

export function isIdleHeld() {
  return holds > 0;
}

/** Ruft `listener` auf, sobald kein Halt mehr besteht. Gibt eine Abmeldefunktion zurück. */
export function onIdleRelease(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function acquireIdleHold() {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (holds === 0) listeners.forEach((listener) => listener());
  };
}

/** Hält den Rücksprung an, solange `active` wahr ist und die Komponente eingehängt ist. */
export function useIdleHold(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    return acquireIdleHold();
  }, [active]);
}
