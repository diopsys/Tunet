import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Lautstärke-Regler, der langsame Geräte (z. B. Receiver über HEOS) nicht überflutet:
 * beim Ziehen zeigt er sofort den eigenen Wert, schickt aber höchstens alle `abstandMs`
 * den jeweils neuesten Wert und beim Loslassen sicher den letzten. Bis das Gerät den neuen
 * Wert meldet (oder nach `haltenMs`), bleibt der eigene Wert stehen statt zurückzuspringen.
 */
export const LAUTSTAERKE_ABSTAND_MS = 400;

export default function useLautstaerke(entity, entityId, setzen, { abstandMs = LAUTSTAERKE_ABSTAND_MS, haltenMs = 4000 } = {}) {
  const gemeldet = Math.round((entity?.attributes?.volume_level ?? 0) * 100);
  const [eigen, setEigen] = useState(null);
  const r = useRef({ zuletzt: 0, timer: null, offen: null, bis: 0 });

  const senden = useCallback((wert) => {
    r.current.zuletzt = Date.now();
    r.current.offen = null;
    setzen?.(entityId, wert / 100);
  }, [entityId, setzen]);

  const aendern = useCallback((wert) => {
    const s = r.current;
    setEigen(wert);
    s.bis = Date.now() + haltenMs;
    const warten = abstandMs - (Date.now() - s.zuletzt);
    if (warten <= 0 && !s.timer) { senden(wert); return; }
    s.offen = wert;
    if (!s.timer) {
      s.timer = setTimeout(() => {
        s.timer = null;
        if (s.offen !== null) senden(s.offen);
      }, Math.max(0, warten));
    }
  }, [abstandMs, haltenMs, senden]);

  const loslassen = useCallback(() => {
    const s = r.current;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.offen !== null) senden(s.offen);
  }, [senden]);

  // eigener Wert gilt, bis das Gerät ihn (ungefähr) meldet oder die Haltezeit um ist
  useEffect(() => {
    if (eigen === null) return undefined;
    if (Math.abs(gemeldet - eigen) <= 1 && !r.current.timer && r.current.offen === null) { setEigen(null); return undefined; }
    const t = setTimeout(() => setEigen(null), Math.max(0, r.current.bis - Date.now()));
    return () => clearTimeout(t);
  }, [eigen, gemeldet]);

  useEffect(() => () => { if (r.current.timer) clearTimeout(r.current.timer); }, []);

  return {
    wert: eigen ?? gemeldet,
    props: {
      value: eigen ?? gemeldet,
      onChange: (e) => aendern(Number(e.target.value)),
      onPointerUp: loslassen,
      onKeyUp: loslassen,
      onTouchEnd: loslassen,
    },
  };
}
