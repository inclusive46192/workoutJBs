# Momentum Journal (Next.js + Supabase + PWA)

Mobil-first Journal fuer Morgenroutine, HIT und Running/Cardio:
- Cloud Journal mit Magic-Link Login
- Offline Lite Modus ohne Login
- Overall Timer + Start/Stop pro Uebung
- Zielzeit pro Uebung
- Stimmungsabfrage mit vorausgefuelltem Tagebuchtext
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

## Routen

- `/` Cloud Journal
- `/lite` Offline-Lite Journal
