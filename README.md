# Momentum Journal (Offline PWA)

Mobil-first Journal fuer Morgenroutine, Yoga, Tabata, HIT, Running/Cardio und
Bodybuilding. Die App laeuft **komplett offline** – kein Login, kein Server,
keine Cloud. Alle Daten liegen im `localStorage` des Geraets.

- Workout-Flow mit Timer, Audio-Signalen und Vollbild-Fokus
- Builder: Uebungen waehlen, Reihenfolge festlegen, Saetze und Satzart pflegen
- 23 evidenzbasierte Preset-Routinen
- Bodybuilding Satz-Logging (Reps + Gewicht pro Satz, DONE pro Satz)
- Taeglicher Check-in (0-10 Smiley + Freitext)
- Activity Tracker mit Zielen, PRs, Tonnage und Stimmungs-Trend
- Eigene Uebungen hinzufuegen, ausblenden und verwalten
- Sicherung per JSON-Export/Import (auf iOS direkt in iCloud Drive)

## Lokaler Start

```bash
npm install
npm run dev
```

Danach [http://localhost:3000](http://localhost:3000) oeffnen.

## Offline-Build

```bash
npm run build:offline
```

Ergebnis: Ordner `out/`. Diesen kannst du auf einen USB-Stick, ins Heimnetz oder
auf ein beliebiges statisches Hosting kopieren.

### Starten

Ein einfacher lokaler Webserver genuegt:

```bash
cd out
python -m http.server 8080
# danach im Browser: http://localhost:8080/
```

> Ein Webserver ist noetig, weil Browser Service Worker und PWA-Installation
> unter `file://` nicht erlauben. Beim ersten Aufruf cached der Service Worker
> die App; danach funktioniert sie auch **ohne laufenden Server**.

### Auf dem Handy

1. `npm run build:offline`
2. `out/` auf ein statisches Hosting legen (siehe unten) oder im WLAN per
   `python -m http.server` freigeben.
3. Seite in Safari oeffnen → Teilen → **Zum Home-Bildschirm**.

Danach laeuft die App als installierte PWA auch im Flugmodus.

## Daten sichern

- **Datei exportieren** schreibt alle `momentum-*` Schluessel in eine
  JSON-Datei. Auf iOS oeffnet sich das Teilen-Menue, sodass du direkt in
  **Dateien → iCloud Drive** sichern kannst.
- **Offline laden** liest eine solche Datei wieder ein und laedt die App neu.

Da alles lokal liegt, ist der Export die einzige Sicherung – vor dem Loeschen
der Website-Daten oder einem Geraetewechsel unbedingt exportieren.

## Optionales Hosting

Die App ist ein reiner Client. Jedes statische Hosting genuegt.

### Vercel

`vercel.json` ist enthalten:

- Build command: `npm run build:offline`
- Output directory: `out`

Hinweis: Der Projektname muss klein geschrieben sein (z. B. `momentum-journal`),
sonst lehnt Vercel den Import mit einem 400er ab.

### Netlify

```bash
npm run build:offline
npx netlify-cli deploy --prod --dir=out
```

Der Upload nutzt **keine Build-Minuten**, da lokal gebaut wird.

## Routen

- `/` Journal
- `/lite` identische Ansicht ohne Hero-Header
