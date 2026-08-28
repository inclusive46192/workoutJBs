# Momentum Journal (Next.js + Supabase + PWA)

Mobil-first Journal fuer Morgenroutine, HIT und Running/Cardio:
- Cloud Journal mit Magic-Link Login
- Cloud-Profil-Sync (Name, Ziel, Kategorien, Einheit, Reminder)
- Offline Lite Modus ohne Login
- Overall Timer + Start/Stop pro Uebung
- Zielzeit pro Uebung
- Morning-Flow Check-in (0-10 + Freitext) mit Tracking
- Bodybuilding Satz-Logging (Reps + Gewicht pro Satz, DONE pro Satz)
- Eigene Uebungen hinzufuegen, ausblenden und verwalten
- Uebungsuebersicht ueber alle Kategorien

## Lokaler Start

```bash
npm install
npm run dev
```

In PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Danach [http://localhost:3000](http://localhost:3000) oeffnen.

## Supabase einrichten

1. Projekt in Supabase erstellen.
2. In **Authentication > Sign In / Providers** E-Mail (Magic Link/OTP) aktivieren.
3. SQL aus [supabase/schema.sql](./supabase/schema.sql) ausfuehren.
4. In `.env.local` setzen:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Netlify Deployment

1. Repo in GitLab pushen.
2. In Netlify: **Add new site > Import an existing project > GitLab**.
3. Build:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Env Vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Deployment

Die App ist ein reiner Client (localStorage). Für `/lite` wird **kein Server**
benötigt – jedes statische Hosting genügt.

### Vercel (empfohlen für Hosting)

`vercel.json` ist enthalten:

- Build command: `npm run build:offline`
- Output directory: `out`

Import des Repos genügt; Vercel erkennt die Konfiguration automatisch.

### Netlify

Zwei Varianten:

**a) Statisch (empfohlen, spart Build-Minuten)**

```bash
npm run build:offline
npx netlify-cli deploy --prod --dir=out
```

Der Upload nutzt **keine Build-Minuten**, da lokal gebaut wird.

**b) Mit Server-Build** (nur nötig für Supabase Cloud-Sync)

Siehe `netlify.toml`. Achtung: Jeder Push auf den Produktionszweig verbraucht
Build-Minuten.

### Build-Minuten sparen

- Nur den finalen Stand pushen, nicht jeden Zwischenschritt
- Oder lokal bauen und `out/` hochladen (Variante a)

## Routen

- `/` Cloud Journal
- `/lite` Offline-Lite Journal

## Offline-Version ohne Netlify und Supabase

Die App lässt sich als reine statische Seite bauen. Es wird **kein Server, kein
Netlify und kein Supabase** benötigt – alle Daten liegen im `localStorage` des
Geräts.

```bash
npm run build:offline
```

Ergebnis: Ordner `out/` (~2 MB, 53 Dateien). Diesen Ordner kannst du auf einen
USB-Stick, ins Heimnetz oder auf ein beliebiges Hosting kopieren.

### Starten

Ein einfacher lokaler Webserver genügt, z. B.:

```bash
cd out
python -m http.server 8080
# danach im Browser: http://localhost:8080/lite/
```

> Ein Webserver ist nötig, weil Browser Service Worker und PWA-Installation
> unter `file://` nicht erlauben. Beim ersten Aufruf cached der Service Worker
> die App; danach funktioniert sie auch **ohne laufenden Server**.

### Was funktioniert offline

- Alle Kategorien, Presets, Builder und der Workout-Flow
- Timer, Signale, Satz-Logging, Ziele, Activity Tracker
- Speichern via `localStorage`, Export/Import als JSON-Datei

### Was in dieser Variante entfällt

- Cloud-Sync und Login per Magic Link (`/` Cloud Journal ist ohne Supabase
  funktionslos – nutze `/lite/`)
- Geräteübergreifende Synchronisierung; Datensicherung erfolgt über
  „Datei exportieren“
