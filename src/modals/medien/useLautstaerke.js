import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Lautstärke-Regler, der langsame Geräte (z. B. Receiver über HEOS) nicht überflutet:
 * Es ist immer nur ein Befehl unterwegs. Erst wenn HA ihn ausgeführt hat (das Promise von
 * `setzen`), geht der jeweils neueste Wert hinterher – Zwischenwerte entfallen, egal wie
 * langsam das Gerät ist. Beim Ziehen zeigt der Regler sofort den eigenen Wert und hält ihn,
 * bis das Gerät ihn meldet (oder nach `haltenMs`), statt auf alte Werte zurückzuspringen.
 */
const LAUTSTAERKE_MIN_ABSTAND_MS = 150;
const HAENGT_MS = 4000;

export default function useLautstaerke(entity, entityId, setzen, { abstandMs = LAUTSTAERKE_MIN_ABSTAND_MS, haltenMs = 4000 } = {}) {
  const gemeldet = Math.round((entity?.attributes?.volume_level ?? 0) * 100);
  const [eigen, setEigen] = useState(null);
  // offen: { id, wert } – das Gerät wird mit dem Wert gemerkt, damit ein wartender Wert nicht an ein
  // anderes Gerät geht, wenn die Entität inzwischen wechselt (z. B. Kachel schaltet von Raum auf TV)
  const r = useRef({ unterwegs: false, offen: null, bis: 0, setzen, entityId });
  r.current.setzen = setzen;
  r.current.entityId = entityId;

  // neues Gerät: dessen gemeldeten Wert zeigen statt des gehaltenen vom vorigen
  useEffect(() => { setEigen(null); }, [entityId]);

  const weiter = useCallback(() => {
    const s = r.current;
    if (s.unterwegs || s.offen === null) return;
    const { id, wert } = s.offen;
    s.offen = null;
    s.unterwegs = true;
    let fertig = false;
    const frei = () => {
      if (fertig) return;
      fertig = true;
      // kurzer Mindestabstand, dann ggf. den neuesten Wert hinterher
      setTimeout(() => { s.unterwegs = false; weiter(); }, abstandMs);
    };
    // hängt ein Aufruf, nach HAENGT_MS trotzdem weitermachen
    const notfall = setTimeout(frei, HAENGT_MS);
    Promise.resolve(s.setzen?.(id, wert / 100))
      .catch(() => {})
      .finally(() => { clearTimeout(notfall); frei(); });
  }, [abstandMs]);

  const aendern = useCallback((wert) => {
    const s = r.current;
    setEigen(wert);
    s.bis = Date.now() + haltenMs;
    s.offen = { id: s.entityId, wert };
    weiter();
  }, [haltenMs, weiter]);

  // eigener Wert gilt, bis das Gerät ihn (ungefähr) meldet oder die Haltezeit um ist
  useEffect(() => {
    if (eigen === null) return undefined;
    const s = r.current;
    if (Math.abs(gemeldet - eigen) <= 1 && !s.unterwegs && s.offen === null) { setEigen(null); return undefined; }
    const t = setTimeout(() => setEigen(null), Math.max(250, s.bis - Date.now()));
    return () => clearTimeout(t);
  }, [eigen, gemeldet]);

  const wert = eigen ?? gemeldet;
  return {
    wert,
    props: {
      value: wert,
      onChange: (e) => aendern(Number(e.target.value)),
    },
  };
}
