# Momentum (Planner App)

A lightweight, web-first calendar, task, and notes workspace — plain HTML/CSS/JS,
no build step, syncs through Supabase (or runs fully offline in demo mode).

## Features

- **Today / Calendar / Tasks / Notes** views
- **Theming** — light, dark, or follow system, saved per device
- **Tags** — add tags to any task, event, or note; items sharing a tag show up
  as "Related items" in the edit dialog, and clicking a tag filters the current view
- **Unlimited subtasks** on any task, with a done/total progress indicator
- **Markdown notes** — rendered and sanitized (via `marked` + `DOMPurify`)
- Works without any backend: falls back to `localStorage` if Supabase isn't configured

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. In the SQL editor, run `supabase/schema.sql` (new project) — or, if you already
   have data from an earlier version of this app, run `supabase/migration_v2.sql`
   instead to add the new columns without losing anything.
3. Copy `config.example.js` to `config.js` and fill in your project's URL and
   **publishable/anon** key (Project Settings → API). This key is safe to expose in
   client code — access is enforced by the Row Level Security policy in the schema,
   not by keeping the key secret.
4. Open `index.html` in a browser, or deploy the folder as-is (e.g. GitHub Pages —
   see `.github/workflows/deploy.yml`).

Skip step 3 to run in demo mode: the app stores everything in `localStorage`
on that device, with no account needed.

> **Why is `config.js` committed to the repo?** Because this is a static site
> deployed straight to GitHub Pages with no build step, there's nowhere to inject
> a secret at deploy time — `config.js` has to ship as a plain file for the site
> to work at all. That's fine here specifically because it only contains the
> Supabase **publishable/anon** key, which is designed to be public; real
> protection comes from the Row Level Security policy in `schema.sql`. Never put
> a service-role key or any other secret in this file.

## Local development

No build step — just serve the folder statically, e.g.:

```
python3 -m http.server 8080
```

then open `http://localhost:8080`.

## Project structure

```
index.html   Sign-in screen
app.html     Main app shell (dialog markup lives here)
app.js       All app logic: state, rendering, persistence
auth.js      Supabase auth flow for the sign-in screen
styles.css   Design tokens (CSS variables) + component styles
config.js    Your Supabase project details — committed intentionally; see note below
supabase/    Database schema + migration script
```
