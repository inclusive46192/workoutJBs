# Momentum Journal (Offline PWA)

Mobil-first Journal fuer Morgenroutine, Yoga, HIT (inkl. Tabata) und
Bodybuilding. Die App laeuft **komplett offline** – ohne Login, ohne Server.
Alle Daten liegen im `localStorage` des Geraets. Ein Cloud-Backup ist optional
zuschaltbar (siehe unten).

- Workout-Flow mit Timer, Audio-Signalen und Vollbild-Fokus
- Bewegungs-Anleitung je Uebung: Form-Hinweise, bei der Morgenroutine
  zusaetzlich eine animierte Strichfigur
- Builder: Uebungen waehlen, Reihenfolge festlegen, Saetze und Satzart pflegen
  (max. 3 Saetze als Standard, Gewicht in 1-kg-Schritten)
- Morgenroutine mit Standard- und **Extended**-Variante (Extended ergaenzt die
  taeglichen Gewohnheiten: Journal Check-in, Kaffee & Wasser, Tagesfokus)
- Evidenzbasierte Preset-Routinen (Tabata bringt sein 20/10-Timing selbst mit)
- Bodybuilding Satz-Logging (Reps + Gewicht pro Satz, DONE pro Satz)
- Taeglicher Check-in (0-10 Smiley + Freitext)
- Activity Tracker mit Zielen, PRs, Tonnage und Stimmungs-Trend
- Ziele optional auf eine Kategorie begrenzt ("10 Tage Morgenroutine")
- Eigene Uebungen hinzufuegen, ausblenden und verwalten
- **Autosave**: Aenderungen werden automatisch gespeichert
- Sicherung per JSON-Export/Import (auf iOS direkt in iCloud Drive)
- Optionales Cloud-Backup mit Login (Magic Link, Code, Google/GitHub)

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

Der aktuelle Tag wird **automatisch** gespeichert (Autosave), es gibt keinen
Speichern-Knopf mehr. Fuer alles darueber hinaus:

- **Datei exportieren** schreibt den kompletten Datenbestand in eine JSON-Datei.
  Auf iOS oeffnet sich das Teilen-Menue, sodass du direkt in
  **Dateien → iCloud Drive** sichern kannst.
- **Datei laden** liest eine solche Datei wieder ein und laedt die App neu.

Da alles lokal liegt, ist der Export die einzige Sicherung – vor dem Loeschen
der Website-Daten oder einem Geraetewechsel unbedingt exportieren.

### Fortlaufende Historie

Damit ueber Geraetewechsel und Neuinstallationen hinweg keine Tage fehlen:

- **Startabfrage:** Ist auf einem Geraet noch kein Training gespeichert (frische
  Installation, geleerter Safari-Speicher, neues Handy), fragt die App beim
  Start, ob ein Backup geladen werden soll. Danach wird nicht mehr gefragt.
- **Import fuehrt zusammen, statt zu ueberschreiben.** Tage werden per
  `dateKey` + `category` vereinigt, Ziele per `id`, Routinen per Name. Ein
  aelteres Backup kann neuere lokale Sessions also nicht loeschen.
- **Konfliktregel:** Bei demselben Tag auf beiden Seiten gewinnt der Datensatz
  mit mehr erledigten Uebungen; erst bei Gleichstand entscheidet `updatedAt`.
  So wird ein geloggtes Training nie gegen einen leeren Tag getauscht.
- **Export-Erinnerung:** Sammeln sich Trainingstage seit dem letzten Backup an,
  weist die App darauf hin. Ansonsten zeigt sie den Umfang der Historie
  (Anzahl Tage, Zeitraum, letzte Sicherung).

### Backup-Format (cloud-faehig)

Der Export ist bewusst *domaenenorientiert* statt ein roher `localStorage`-Dump,
damit derselbe Payload spaeter als Wire-Format fuer einen Cloud-Account dienen
kann (siehe [src/lib/backup.ts](./src/lib/backup.ts)):

```jsonc
{
  "schemaVersion": 3,
  "app": "momentum-journal",
  "exportedAt": "2026-09-03T07:14:00.000Z",
  "owner": { "userId": null, "deviceId": "device-ab12cd34" },
  "data": {
    "days":       [ { "dateKey": "...", "category": "...", "payload": {}, "updatedAt": "..." } ],
    "bodyWeight": [ { "dateKey": "...", "value": "82.4",   "updatedAt": "..." } ],
    "documents":  { "momentum-goals:v1": [], "momentum-profile:v1": {} }
  }
}
```

- jede Sammlung hat einen stabilen natuerlichen Schluessel (Tag: `dateKey` +
  `category`, Ziel: `id`, Routine: `category` + `name`) → ein Server kann
  *upserten* statt einen Blob zu ersetzen
- jeder Datensatz traegt `updatedAt` → Grundlage fuer Konfliktaufloesung
  (last-write-wins) bei spaeterer Synchronisierung
- `owner.userId` ist reserviert, damit ein Export spaeter einem Konto
  zugeordnet werden kann, ohne das Schema zu aendern
- aeltere Backups (v1/v2) bleiben importierbar

## Uebungs-Anleitungen

Jede Uebung hat Setup- und Ausfuehrungs-Hinweise. Visuals gibt es bewusst nur
dort, wo sie ehrlich funktionieren:

- **Morgenroutine:** animierte Strichfiguren (siehe
  [exercise-animation.tsx](./src/components/exercise-animation.tsx) und die
  Keyframes in [globals.css](./src/app/globals.css)). Diese Bewegungen kommen in
  keiner freien Mediendatenbank vor, und gerade hier hilft es, den *Uebergang*
  zu sehen.
- **Yoga:** keine Grafik. Es sind statische Haltungen, fuer die eine Animation
  das falsche Mittel waere. Das einzige verifizierte CC0-Set (6 Openclipart-
  Zeichnungen) enthaelt keine der hier verwendeten Posen.
- **HIT:** keine Grafik. Es existiert keine frei lizenzierte Animation fuer
  diese Bewegungen – Wikimedia Commons hat dafuer nicht einmal eine Kategorie,
  und kommerzielle GIF-Bibliotheken sind proprietaer oder ohne belegbare
  Herkunft.

Zwei Morgenroutine-Uebungen (World's Best Stretch, Lunge Front Reach) haben
ebenfalls keine Figur: ihre 3D-Rotation laesst sich als flache Strichfigur nicht
verstaendlich darstellen. Lieber nichts als etwas Irrefuehrendes.

## Cloud-Backup (optional)

Die App funktioniert vollstaendig ohne Konto. Wer die Daten geraeteuebergreifend
sichern will, kann ein Supabase-Projekt anbinden – dann ersetzt der Login das
manuelle Exportieren.

**Wichtig:** Lokal bleibt die Wahrheit, die Cloud ist nur ein Spiegel. Ohne Netz
laeuft die App unveraendert weiter.

### Einrichtung

1. Projekt auf [supabase.com](https://supabase.com) anlegen (Free Tier genuegt).
2. Im SQL-Editor [supabase/schema.sql](./supabase/schema.sql) ausfuehren. Das
   legt die Tabelle `backups` an und aktiviert Row Level Security, sodass jeder
   Nutzer ausschliesslich seine eigene Zeile sieht.
3. Unter **Authentication → Providers** aktivieren, was du nutzen willst:
   - **Email** – liefert Magic Link *und* 6-stelligen Code in derselben Mail
   - **Google / GitHub** – jeweils Client-ID und Secret hinterlegen
4. Unter **Authentication → URL Configuration** die Site-URL und die Redirect-
   URLs eintragen, z. B. `https://<projekt>.vercel.app` und
   `http://localhost:3000` fuer die lokale Entwicklung.
5. `.env.local` anlegen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<projekt-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

6. Dieselben zwei Variablen in Vercel unter **Settings → Environment Variables**
   hinterlegen und neu deployen.

Fehlen die Variablen, blendet die App den Cloud-Bereich einfach aus und
verhaelt sich wie der reine Offline-Build.

### Wie der Abgleich funktioniert

- Nach dem Login wird **erst geladen, dann hochgeladen**, damit beide Seiten
  konvergieren.
- Der Download **fuehrt zusammen** und ueberschreibt nicht: es gilt dieselbe
  Konfliktregel wie beim Datei-Import (mehr erledigte Uebungen gewinnt, erst
  bei Gleichstand entscheidet `updatedAt`). Eine veraltete Cloud-Kopie kann
  also keine offline geloggte Einheit loeschen.
- Aenderungen werden verzoegert hochgeladen, damit nicht jeder Tastendruck
  eine Anfrage ausloest.
- Die Anmeldung bleibt bestehen, bis man sich aktiv abmeldet.
- Der Datei-Export bleibt unveraendert verfuegbar und ist weiterhin die
  Sicherung, die unabhaengig von einem Dienst funktioniert.

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
