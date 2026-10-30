# Changelog

## 1.31.3

### Added
- Media card for a room with a window and TV, Spotify and library tabs (#11, by diopsys)
- Heat pump page: tank heater is detected live from its CAN power reading and shown in kW

### Changed
- Tunet is now available in German and English only; devices set to a removed language switch to English

### Fixed
- Edit dialog: fixed a crash on non-sensor cards with status settings
- Light panel card: settings are available in the edit dialog again
- Sensor and lock dialogs: fixed possible crashes caused by wrong hook order

## 1.31.2

### Added
- Settings → System → Maintenance: clear the Docker build cache with one button. Tunet starts Portainer, prunes the cache and stops Portainer again; shows a hint if Portainer is not installed. Admins only
- Heat pump page: dedicated portrait schema on phones instead of tabs

### Changed
- The add-on now requests Supervisor access (`hassio_api`, role `manager`) to start and stop Portainer for maintenance

## 1.31.1

### Added
- Timetable: symbol for new subjects is suggested automatically from the name; more symbols in the picker
- Irrigation card and dialog configurable via `settings.beregnung`; existing setup stays the default

### Changed
- Tunet panel is now available to non-admin users (`panel_admin: false`); you may need to toggle "Show in sidebar" once

## 1.31.0

### Added
- Open the camera dialog via URL, e.g. from a doorbell notification (`?kamera=camera.x`, optional `&clip=<frigate event>` with clip view)
- HA app on phones: the HA header above the Tunet panel is hidden (kiosk mode); the sidebar still opens by swiping
- Timetable: whole days can be edited directly via the cell

### Changed
- Group pills turn grey when nothing matches
- Weather tile on phones (2 columns): forecast page without header, three instead of two entries

### Fixed
- Camera snapshot stayed empty (403) because the cache parameter was appended after signing
- Card links (heating, buffer, PV icon) only accept HA paths or http(s)

## 1.30.4

### Added
- "Heating" and "Storage tank" tiles can now be added via "Add card", prefilled for the heat pump and the 500 l tank
- Timetable: tappable symbol picker in the dialogs

### Fixed
- Timetable: a typed symbol was overwritten on the next dashboard update
- Timetable: a subject's display name was lost when only its symbol was changed

## 1.30.3

### Added
- New "Heat pump" page: animated hydraulic schema of the Daikin Altherma 3 R ECH2O (outdoor unit, refrigerant circuit, DHW valve, bypass, tank with heater, floor heating, domestic hot water) driven by live values; tabs on mobile
- New "Heating" and "Buffer" tiles (PR #1 by diopsys)
- Timetable: multiple people, custom times, whole days, afternoon section and in-card editing (PR #1)
- "Heating on" status pill (PR #1)

### Changed
- PV card: configurable entities, month/year from long-term statistics, forecast values derived from the power curve (PR #1)
- Security and light panels configurable via settings (PR #1)

### Fixed
- Settings database now stored in /data and kept across add-on updates (PR #1)
- Add-on build no longer fails on a musl version conflict (PR #1)

## 1.30.2

### Fixed
- Mobile: page navigation pills restored to original compact style (upstream had added min-h-11 min-w-11 justify-center making them larger)

## 1.30.1

### Fixed
- Mobile: header title alignment restored to left (default was incorrectly set to center after upstream merge)
- Mobile: WeatherTempCard condition pill hidden on 2-column layout; temperature text reduced to smaller size

## 1.30.0

### Added
- Flexible entity cards with custom name, subtitle, icon, status source, layout, and tap action.
- Apple TV card and popup with media controls, remote, and linked speakers.
- Upstream updates: React 19.3, hls.js 1.7.3, home-assistant-js-websocket 9.7.0, express-rate-limit 8.7.0.

## 1.20.43

### Changed
- Netzladung-Simulation: Halte-Horizont dynamisch (nächster Sonnenaufgang + 2 h wenn PV ≥ 3 kWh, sonst 24 h)
- PV-Sperre: keine Haltephase wenn Sonne über Horizont und > 1 kWh PV noch erwartet
- Vorgangsliste: Auswertung erst ab Zähler-Reset 18.10. 15:05

## 1.20.42

### Fixed
- SensorModal: Räume-Sektion auf Mobile nach Graph, vor Zeitachse; Raumnamen abgekürzt

## 1.20.41

### Added
- SensorModal: Raum-Temperaturen mit farbigen Balken (blau/grün/orange) pro Etage; lange Raumnamen abgekürzt

## 1.20.40

### Changed
- Add release notes.

## 1.20.40

### Fixed
- Vorgangsliste findet jetzt Vorgänge: `lu`-Fallback für WS-Kompakt-History-Format
- Laden-Merge-Lücke auf 20 min (verhindert viele Kleinsteinträge bei vollem Speicher)
- Standard-Variante: jüngste Aktivität statt fest 4 ct

## 1.20.39

### Added
- Automatisierung-Tab: „Hält für …"-Fenster pro Variante + Vorgangsliste mit History-Auswertung (Laden/Nutzen/PV-verdrängt)

### Fixed
- Modal springt nicht mehr beim Tab-Wechsel (entities aus useEffect-Deps entfernt)

## 1.20.38

### Changed
- WP Hydraulik: thermische Leistung → UART-Sensor; Heizstab → binary_sensor.wp_heizstab_aktiv

## 1.20.37

### Changed
- Automatisierung-Tab: 5-stufige Zustandsableitung + korrekte Farben; Speicher-Balken zeigt simulierten % statt kWh

### Added
- Speicher-Vergleich: Echt vs. Mit 4 ct als Balken mit Differenz

## 1.20.36

### Added
- Strompreis-Modal: Tab „Automatisierung" mit Netzladungs-Simulation (Status-Badge, Varianten 0/4/8 ct, Speicher-Balken, Live-Chips)

## 1.20.35

### Added
- Lüftungskarte: Kaminmodus-Badge (orange, pulsierend) ersetzt Stufen-Badge bei aktivem Kaminmodus
- Lüftungsmodal: Kaminmodus-Badge im Modal-Header; Ventilator-Leistung (%) im SVG-Diagramm
- Lüftungskarte: CO-Melder-Wert neben CO₂ mit Farbkodierung
- WP-Modal: Heizstab-Monatswert via HA Statistics API

## 1.20.34

### Added
- WP-Karte: Heizstab aktiv → Badge "Heizstab" (orange) + WW-Fortschrittsbalken + kWh-Verbrauch
- WP-Modal: `binary_sensor.wp_heizstab_aktiv` + Heizstab-Energiekachel im Stats-Grid

## 1.20.33

### Added
- Beschattungsseite: "Alle hoch" + "EG/OG hoch"-Buttons
- Rollo-Modal: Fahrzeitmessung-Toggle für Kalibrierung

## 1.20.32

### Added
- WP-Modal Ablauf-Block: MLZ- und BOH-Pause-Countdowns als live Chips ("MLZ 23 / 45 min", "noch 7 min"); kürzere 10-Min-Sperre bei WW ≥ 55°C

## 1.20.31

### Added
- WP-Modal Ablauf-Block: Bedingungsanzeige als Chips (✓/✗) mit Sensorwerten je Folgezustand

### Changed
- WP-Modal: Label "Startschwelle" → "Ausschaltschwelle" im Entscheidungslog
- Lüftung: Modbus-Entitäten auf Blauberg-Integration umgestellt (`sensor.blauberg_s21_*`)

## 1.20.30

### Added
- WP-Modal: "Ablauf"-Visualisierung mit "Warum eingetreten" + "Als Nächstes" (Blueprint-korrekt, sensor-aware)
- Entscheidungsprotokoll: von–bis-Zeiten und Phasendauer je Eintrag

### Changed
- WP-Modal: WW-Startschwelle korrigiert auf 63°C; "Fenster" → "Zeitfenster"
- WP-Karte: Fortschrittsbalken bei aktiver Phase, COP/Strom im Standby
- Personenkarte: OSM-Tiles statt CARTO (kein API-Key mehr erforderlich)

## 1.20.29

### Added
- Solar-Modal: Prognose-Chart zeigt echte PV-Erzeugung als blaue Kurve (geglättet) über der Helios-Prognose

### Changed
- Prognose-Chart: Y-Achse mit kW-Einheit, X-Achse ohne h-Suffix

### Fixed
- WP-Karte: COP und Strom nicht mehr abgeschnitten wenn Fortschrittsbalken sichtbar

## 1.20.28

### Fixed
- WP-Karte: COP/Strom-Clipping durch Fortschrittsbalken behoben
- WP-Modal: HV-ohne-WP-Zeile im Entscheidungslog korrekt formatiert

## 1.20.27

### Changed
- Solar-Modal: Balkendiagramm durch Stunden-Tiles ersetzt (Diese/Nächste Stunde); Peak heute aus Helios peak_power_day_1

## 1.20.26

### Changed
- Stundenplan: Di 5. Stunde Kunst ↔ Fr 3. Stunde Sport getauscht
- Solar-Modal / WP-Modal: Solcast-Prognose-Entities durch Helios ersetzt

## 1.20.25

### Fixed
- Auth: Token-Injection über `data-ha-token` HTML-Attribut statt Inline-Script — CSP `script-src 'self'` hat das Inline-Script in iOS WebKit blockiert, weshalb der Token-Dialog weiterhin erschien

## 1.20.24

### Fixed
- Auth: Token wird jetzt direkt in die initiale HTML-Antwort eingebettet (`window.__HA_SERVER_CONFIG__`) — kein asynchroner Fetch mehr nötig; Token-Eingabe-Dialog erscheint nicht mehr wenn iOS den Browser-Cache leert, unabhängig von der Ingress-URL-Erkennung

## 1.20.23

### Changed
- WP-Modal: WW-Bonus-Puffer-Minimum von 1,0 auf 3,0 kWh erhöht — WP braucht ~2,5 kWh für WW-Zyklus (50→55°C), daher war 1 kWh zu knapp und führte zu unerwünschten Bonus-Auslösungen bei niedrigem Akku-SOC

## 1.20.22

### Changed
- WP-Modal: Hausverbrauch-Schwelle für WW-Bonus dynamisch aus `input_number.wp_bonus_max_hausverbrauch` lesen (war hardcodiert 600W)

## 1.20.21

### Added
- WP-Modal: Akku-Priorität / WW-Bonus Widget — Restprognose-Aufteilung (Akku-Reserve · WW-Puffer), Bonus-Bedingungen live prüfbar

## 1.20.20

### Fixed
- Ingress-Modus: Token-Eingabe-Dialog erscheint nicht mehr nach geleertem Browser-Cache — Ingress-Authentifizierung via HA Supervisor reicht aus, kein manueller Token nötig

## 1.20.19

### Fixed
- Addon-Optionen `ha_url` und `ha_token` wiederhergestellt (beim Upstream-Merge entfernt) — ohne diese Felder im Schema konnte HA den Shared-Token nicht speichern, Shared Mode war deaktiviert und jedes Gerät musste einzeln einloggen

## 1.20.18

### Fixed
- WP-Modal Hydraulik-Ansicht: "Therm. Leistung" zeigt jetzt den gefilterten Sensor statt der rohen Daikin-CAN-Werte — vermeidet Anzeige von Fehlmessungen durch Durchflusssensor-Glitches und PID-Ringing bei Kompressorstillstand

## 1.20.17

### Fixed
- Wetterkarte Mobile 2-Spalten: Condition-Pill (z.B. "Teilweise bewölkt") ausgeblendet — zu langer Text verschob die Temperaturanzeige

## 1.20.16

### Changed
- WP-Karte + WP-Modal: COP-Berechnung wieder auf Tagesdaten (Wärme/Strom) zurückgestellt

## 1.20.15

### Fixed
- Mobile: 2-Spalten-Layout wiederhergestellt — fehlerhafter Breakpoint `< 480px → 1 Spalte` in der Auto-Spalten-Berechnung hat alle Smartphones auf 1 Spalte gezwungen; revertiert

## 1.20.14

### Fixed
- Frigate Ereignisse: Clip-Wiedergabe funktioniert wieder — fehlende CSP-Direktive `media-src` blockierte blob:-URLs für `<video>` ohne sichtbaren Fehler; stattdessen wurde Snapshot angezeigt
- Server: `trust proxy` wiederhergestellt (Upstream-Merge-Verlust) — Rate-Limiting verwendet wieder die echte Client-IP

## 1.20.13

### Fixed
- Alle vorgelagerten Test-Fehler aus dem v1.20.9-Upstream-Merge behoben (i18n-Parität nb/nn/sv/fr, Test-Mocks, haAuth-Reihenfolge, StatusPill-Dezimalstellen/Badge/Mobile-Text)
- useSettingsSync: 503-Fehler beim Einlesen der Einstellungen sperrt nun korrekt die Hintergrund-Synchronisation; Gerät-Registrierung beim Erstverbinden blockiert nicht mehr das Anwenden einer veröffentlichten Konfiguration
- useResponsiveGrid: Auto-Spalten-Modus begrenzt auf 1 Spalte unter 480 px (entspricht Einstellungsmenü)

## 1.20.12

### Removed
- Benutzerdefinierte go2rtc_camera_card entfernt — ersetzt durch die Upstream-CameraCard mit nativem HA-Stream. Proxy-Endpunkte (go2rtc-proxy, go2rtc-ws) bleiben für FrigateEvents erhalten.

## 1.20.11

### Fixed
- WebSocket-Proxy (/api/go2rtc-ws) wiederhergestellt; Server nutzt jetzt httpServer.listen() für korrekte WS-Upgrade-Verarbeitung.
- hls.js-Abhängigkeit wiederhergestellt (war beim Merge-Konflikt weggefallen).

## 1.20.10

### Fixed
- Addon-Slug (tunet-gorbi87) und Name (Casa) in config.yaml wiederhergestellt — HA-Update-Erkennung funktioniert wieder.
- COP-Anzeige in der Wärmepumpen-Karte korrigiert: liest jetzt sensor.daikin_heizung_cop direkt aus (statt Berechnung aus kumulativen Zählern).
- /api/go2rtc-proxy wiederhergestellt (war durch Upstream-Merge entfernt worden).

## 1.18.64

### Added
- Entity-Count-Pills editierbar im StatusPill-Editor
- SecurityPanel: FP300 Schuppen Bewegungsmelder

## 1.18.63

### Changed
- WP-Karte: kompakter, kein Log-Reason, Standby-Tagesmodus ausgeblendet
- WP-Modal: Sperrzeiten (WW-Fenster) in Nächster-Zustand und Warum-Bullets
- Stundenplan: Glasfläche, Pausebalken volle Breite/Höhe, Legende mit Emojis

## 1.18.62

### Changed
- Stundenplan: Zeiten aus Pausen-Zeilen entfernt

## 1.18.61

### Changed
- Stundenplan: Pausen-Zeit eingerückt auf Höhe der Uhrzeiten in den Stunden-Zeilen

## 1.18.60

### Changed
- Stundenplan: Pausen-Zeile höher, Zeit eingerückt, "Pause" zentriert und fett

## 1.18.59

### Changed
- Stundenplan: Pausen-Zeile über gesamte Plan-Breite, Zeit links, Pause-Badge im Balken

## 1.18.58

### Fixed
- Stundenplan: Pausen-Zeiten nicht mehr fett/weiß/groß — sp-time-range CSS ergänzt

## 1.18.57

### Fixed
- Stundenplan: isMobile-Prop statt CSS-Breakpoint — Zeiten auf Mobile gestapelt, Desktop inline

## 1.18.56

### Fixed
- Stundenplan Mobile: Breakpoint 768px, Zeiten gestapelt; Desktop inline

## 1.18.55

### Fixed
- Stundenplan Mobile: Zeiten wirklich gestapelt (separate Spans)

## 1.18.54

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.53

### Changed
- Stundenplan: Zeiten inline, volle Breite, Legende nur Mobile, Icon-Fix

## 1.18.52

### Fixed
- App-Crash beim Laden behoben (fehlende Destrukturierung in useAppViewModels)

## 1.18.51

### Added
- Stundenplan-View: neuer Page-Typ mit Fach-Farben, aktiver Stunden-Hervorhebung und Pausen
- WP-Blueprint: Kühlen → WW_Heizen Transition (WW wird auch aus Kühlen heraus geheizt)
- WP-Log: WW-Ist-Temperatur bei WW_Heizen-Transitions

## 1.18.50

### Fixed
- WP-Modal: 'ÜS' und 'WW-Ist' als Log-Keys erkannt; Standby-Einträge zeigen korrekte Vergleichsrichtung

## 1.18.49

### Changed
- WP-Modal: Entscheidungsprotokoll zeigt Ist-vs-Soll-Vergleich pro Zeile (Ist ≥ Schwelle)

## 1.18.48

### Changed
- WP-Modal: Entscheidungsprotokoll zeigt Grund-Text pro Eintrag aus Entscheidungslog-History (PV, WW-Ist, Raum, SOC)

## 1.18.47

### Added
- WP-Modal: "Nächster Zustand" Box neben State Badge mit zustandsabhängiger Übergangs-Info

### Changed
- WP-Modal: "Warum?"-Block zeigt Ist-vs-Ziel-Sätze mit konfigurierten Schwellenwerten (PV, SOC, Temp)

## 1.18.46

### Added
- WP-Modal: 4 Live-Sensorkacheln (WW-Temp, SOC, PV-Überschuss, Raumtemp) mit Minibars
- WP-Modal: Entscheidungsprotokoll als formatierte Log-Zeilen mit Uhrzeit und Modus-Chip
- WP-Modal: "Warum?" parsed Entscheidungslog in Bullet-Points

### Changed
- WP-Modal: Sensor-Tiles und State Badge kompakter auf mobilen Geräten
- WP-Modal: Tagesverlauf-Timeline und Protokoll in einem Block zusammengefasst

## 1.18.45

### Changed
- WP-Modal: State Badge mit Border-Left-Akzent, "Warum?"-Block und Tagesverlauf-Timeline statt Badge-Grid
- WP-Karte: COP/Strom-Zeile nicht mehr abgeschnitten (Abstände kompakter)

## 1.18.44

### Changed
- WP State-Machine-Visualisierung: Tagesmodus (Standby/WW Heizen/WW Pause/WW Boost/WW Fertig/Kühlen) auf Karte und im Modal
- WP-Modal: Entscheidungslog der Automation sichtbar; Tagesmodus-Verlauf (48h) statt WW-Soll-Verlauf

## 1.18.43

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.42

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.41

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.40

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.39

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## patch

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.38

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.37

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.36

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.35

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.34

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.33

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.32

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.31

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.30

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.29

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.28

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.27

### Fixed
- Pool-Modal: Durchfluss korrekt in l/h (Sensor liefert l/min, Umrechnung ×60).

## 1.18.26

### Changed
- Dashboard: conditionally hidden cards no longer leave empty gaps — visible cards repack automatically.

### Fixed
- Haushaltsgeräte card correctly treated as hidden when washer and dishwasher are both inactive.

## 1.18.25

### Fixed
- Server: fix 403 "Forbidden: user mismatch" errors in shared mode caused by Express 5 `req.query` immutability — settings and profiles API endpoints now work correctly, restoring dashboard sync and profile access on all devices.

## 1.18.24

### Fixed
- Server: shared-slot migration no longer deletes encrypted dashboard data on addon restart.

## 1.18.23

### Changed
- Service worker cache-busting: cache names now include the app version so browsers detect updates on every release.

## 1.18.22

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.21

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.20

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.19

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.18

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.17

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.16

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.15

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.14

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.13

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.12

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.11

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.10

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.9

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.8

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.7

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.6

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.5

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.4

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.3

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.2

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.18.1

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.50

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.49

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.48

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.47

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.46

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.45

### Fixed
- WP-Karte: Kompressor-Status nutzt jetzt `binary_sensor.daikin_heizung_status_kompressor` statt Betriebsart (Betriebsart kann WW anzeigen obwohl Kompressor nicht läuft)

## 1.15.44

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.43

### Added
- WP-Karte: Countdown "⚡ in ~Xh" wenn negativer Octopus-Strompreis in den nächsten 12h erwartet wird
- WP-Modal: Banner mit Countdown und WW-Ziel 48°C Hinweis bei bevorstehendem negativem Slot

## 1.15.42

### Added
- Minus-Preis Modus: Heizstab 9kW bei negativem Octopus-Preis, Kompressor bleibt aus
- Vorausschauende Logik: WP begrenzt WW auf 48°C wenn negativer Slot innerhalb 12h kommt
- WP-Karte: Minus-Preis Anzeige als Pill (grün = Heizstab aktiv, gelb = WW voll/pausiert)
- WP-Modal: Banner für aktiven Minus-Preis Modus

### Fixed
- Octopus-Karte: Negative Preise werden korrekt angezeigt statt 0 €/kWh

## 1.15.41

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.40

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.39

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.38

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.37

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.36

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.35

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.34

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.33

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.32

### Added
- Frigate Events Card: Frigate-URL jetzt im Edit-Card-Modal konfigurierbar (kein Hardcode mehr).

### Fixed
- PvModal: Energy-Dashboard-Tab entfernt.
- Server: Energy-Dashboard-Proxy-Endpunkt entfernt.

## 1.15.31

### Fixed
- Energy Dashboard Proxy: Express v5 Wildcard-Syntax-Fix, behebt Server-Crash beim Start.

## 1.15.30

### Fixed
- Energy Dashboard: Proxy mit SUPERVISOR_TOKEN für HA-Auth-gesicherte Static Paths.

## 1.15.29

### Fixed
- Energy Dashboard: Pfad auf /ha-energy-dashboard/ korrigiert.

## 1.15.28

### Fixed
- Energy Dashboard Iframe: sandbox-Attribut entfernt.

## 1.15.27

### Fixed
- Energy Dashboard Fullscreen: JSX-Fragment-Fix, dev-Platzhalter im Iframe.

## 1.15.26

### Added
- PvModal: Tab "Energy Dashboard" mit Iframe auf /local/community/ha-energy-dashboard/index.html.

### Fixed
- CSP frame-src 'self' für HA-Panel-Iframes.

## 1.15.25

### Fixed
- Frigate-Clips in Produktion: CSP `media-src blob:` ergänzt für Blob-URL-Wiedergabe.

## 1.15.24

### Fixed
- Frigate-Clips: Laden per fetch+Blob statt direktem video src (Range-Request-Problem im Proxy).

## 1.15.23

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.22

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.21

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.20

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.19

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.18

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.17

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.16

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.15

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.14

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.13

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.12

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.11

### Fixed
- Profil-Import: Konfiguration blieb nach einem Seitenneuladen nicht erhalten.

## 1.15.10

### Fixed
- Header: Titel und Uhrzeit auf dem iPhone zu groß (Desktop-Schriftgröße statt Mobile).

## 1.15.9

### Fixed
- Status-Pills: Einheitliche Höhe für alle Pills.

## 1.15.8

### Fixed
- iOS: Doppel-Tap-Problem bei Buttons und Modals behoben.

## 1.15.7

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.6

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.15.5

### Changed
- Stundenplan Mobile: Zeitformat-Fix

## 1.20.9

### Changed

- Includes dashboard release `1.20.9` with redesigned settings sidebars, per-card mobile width controls, and configurable script status text.

### Fixed

- Improves Home Assistant reconnect feedback and mobile grid behavior.

## 1.20.8

### Changed

- Includes dashboard release `1.20.8` with a more compact mobile header and phone-optimized card popups, including TV and vacuum controls.

### Fixed

- Improves Home Assistant reconnection after returning to the app and delays premature offline or stale-data notices.
- Fixes PWA installation metadata when Tunet is served through Cloudflare Access.

## 1.20.7

### Added

- Adds the add-on store icon and logo, so Tunet is no longer shown without branding.

### Fixed

- Includes dashboard release `1.20.7`, fixing Roborock vacuum consumable percentages and the sensor reset action (#157).

### Security

- Patches advisories in ip-address, js-yaml, and react-router.

## 1.20.6

### Changed

- Includes dashboard release `1.20.6` with low-battery status pills, configurable Sensor-pill precision, and improved sensor charts.

## 1.20.5

### Changed

- Migrates deprecated build metadata into the Dockerfile and removes the unsupported `armv7` target.

### Fixed

- Restores App Store installs by updating the app base image to resolve the musl package conflict (#188).

## 1.20.4

### Changed

- Includes dashboard release `1.20.4` with current dependencies and the Node 26 builder.

### Fixed

- Adds the native build toolchain required to install better-sqlite3 13.

## 1.20.3

### Changed

- Includes dashboard release `1.20.3`.
- Improves vacuum maintenance reset button detection for consumable-style Home Assistant button names.

### Fixed

- Restores the Vacuum modal maintenance sensor reset action.

## 1.20.2

### Changed

- Add release notes.

## 1.20.1

### Changed

- Includes dashboard release `1.20.1`.
- Broadens vacuum map entity auto-detection to cover both camera and image domains with friendly-name token matching.
- Persists vacuum map zoom and pan per vacuum so the map view restores when reopening the modal.

### Fixed

- Fixes vacuum map detection for setups where the entity friendly name (but not the entity ID) references the vacuum.
- Adds Norwegian `kart` keyword to fallback map entity discovery.
- Fixes ModernDropdown portal click-outside handling.

## 1.20.0

### Changed

- Includes dashboard release `1.20.0` with full live map zooming/panning, customizable room select integration, modern minimalist history layout, responsive snug heights, and translation files.

## 1.19.0

### Added

- Includes dashboard release `1.19.0`.
- Adds smart Status Pills for lights that are on, open doors/windows, and open covers (#143).

### Changed

- Redesigns the Status Pills config modal with a cleaner layout and clearer smart-pill setup.
- Refines the smart pill popup and entity scoping controls.

<p>
  <img src="https://raw.githubusercontent.com/oyvhov/Tunet/v1.19.0/public/release-assets/Pills.png" alt="Redesigned Status Pills and smart pill preview" width="430" />
</p>

**Full Changelog**: https://github.com/oyvhov/Tunet/compare/v1.18.1...v1.19.0

## 1.18.1

### Added

- Includes dashboard release `1.18.1`.

### Changed

- Reduces idle dashboard background work for wall tablets and low-power displays.

### Fixed

- Fixes the add-on container healthcheck probe to use `127.0.0.1`.

### Security

- Clears the `ip-address` advisory through the `express-rate-limit` dependency update.

**Full Changelog**: https://github.com/oyvhov/Tunet/compare/v1.18.0...v1.18.1
