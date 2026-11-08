# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Scaffolded from the official Next.js + Supabase starter (`create-next-app --example with-supabase`). Versioned with SemVer: `version` in `package.json`, a `CHANGELOG.md` entry and an annotated git tag `vX.Y.Z` per release. The roadmap (what each next version contains and its "done when" criterion) lives in `README.md` — follow its numbering (renumbered from v1.3 because v1.1/v1.2 went beyond the original plan).

Dota features so far (v1.4 visual: design in `docs/superpowers/specs/2026-11-08-v1-4-visual-design.md`):
- `/` — cover with a random animated hero (`components/home-hero.tsx`, client-side pick so the page stays static) + Steam ID form with the Steam friend-code link (`components/steam-id-form.tsx`).
- `/player/[id]` — last match highlighted (hero animation, result · side · K/D/A), most-played card (`lib/player-summary.ts`), match table with side column; validates the ID with `toAccountId` (`lib/steam.ts`).
- `/match/[id]?player=` — selected hero animated in the header, stats panel, cosmetics, team tables in two modes (full / compact, saved in `localStorage` `dota-own-coach:team-mode`) sortable per team (`lib/team-sort.ts`) (`components/match-view.tsx`, `team-tables.tsx`, `match-items.tsx`, client).
- Shared visual pieces: `HeroBanner` (illustration + hero animation + content, never overlapping) and `HeroRender` (webm with fade-in; always animates — even with prefers-reduced-motion, Alex decided 2026-11-08 — with a pause/play button in `HeroBanner` saved in `localStorage` `dota-own-coach:hero-motion`; saveData/404/unknown hero → static image) in `components/`; Valve CDN URLs and rarity colors in `lib/hero-art.ts`. Dark theme only (no `next-themes`); palette as Tailwind colors `panel`, `line`, `ink`, `ember`, `win`, `loss`, `side` + `font-display` (Barlow Condensed). Side (Radiant/Dire) is always neutral text — never win/loss colors.
- `lib/opendota.ts` (`server-only`) is the only place that calls OpenDota; it does no caching except the items list (`fetchItems`, `"use cache"` 1 day).
- `lib/data.ts` (`server-only`) is what pages call: Supabase-first cache (v1.3). Player + recent matches 10 min, heroes 1 day, match `detail` forever (bump `DETAIL_VERSION` if its JSON shape changes). DB errors fall back to API-only; API down with saved data → `freshness.source = "stale"`.
- Supabase tables (`supabase/migrations/`): `heroes`, `players`, `matches`, `player_matches` — RLS with public SELECT only, no write policies. Reads use `createReadClient()` (publishable key), writes `createAdminClient()` (`SUPABASE_SECRET_KEY`, returns `null` if unset → no writes). Both in `lib/supabase/admin.ts`.

**`"use cache"` gotcha:** an error thrown inside a cached function reaches the caller as a generic `Error` (it goes through React serialization), so `instanceof OpenDotaError` / `.kind` break. Return a status object and call `cacheLife` conditionally instead, or catch everything at the wrapper (as `getItems` does).

**Layout gotcha:** inside an `overflow-x-auto` wrapper, give the wrapper `relative` — absolutely positioned `sr-only` labels otherwise escape it and widen the whole page on mobile.

Template leftovers still present: auth pages, `/protected`, and tutorial pieces (`components/tutorial/`, `hero.tsx`, `deploy-button.tsx`, `env-var-warning.tsx`, `hasEnvVars`) — meant to be removed.

## Regras do projeto

- Sempre explique o que mudou e por quê, em português.
- Nunca use a secret key em variável NEXT_PUBLIC_ nem em código do cliente.
- Toda tabela nova deve ter RLS com políticas explícitas; explique cada política.
- Chamadas à OpenDota só no servidor.

## Commands

```bash
npm run dev        # dev server on http://localhost:3000
npm run build      # production build (also type-checks)
npm run lint       # eslint . (next/core-web-vitals + next/typescript)
npx tsc --noEmit   # type-check only
npm test           # vitest run (tests/**/*.test.ts)
```

Tests (Vitest, `vitest.config.mts`) cover the pure helpers (`lib/steam.ts`, `lib/match.ts`), `lib/opendota.ts` with a stubbed `fetch`, and the cache rules in `lib/data.ts` with fake Supabase/OpenDota/`after()`. `server-only` is aliased to `tests/server-only-stub.ts`. Run `npm test` before every commit; when changing `lib/data.ts`, add a case for the new branch. Measure load time with `npm run build && npx next start` — dev-server timings include on-demand compilation and are not representative.

Writes to Supabase in `lib/data.ts` run inside `after()` (from `next/server`) so the page never waits for them; keep it that way.

Env: copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a legacy anon key value also works in that variable), plus `SUPABASE_SECRET_KEY` (`sb_secret_…`, server-only) for cache writes. A `.env.local` created before v1.3 lacks that line.

Supabase MCP is configured for this project (same project as `NEXT_PUBLIC_SUPABASE_URL`): apply new migrations with `apply_migration`, keep the `.sql` file in `supabase/migrations/` as the source, and run `get_advisors` (security) after DDL.

`npm run dev` (Next 16) generates an untracked `AGENTS.md` at the root.

## Stack notes that affect how code must be written

- **`npx shadcn add` generates Tailwind v4 code** in this v3 project (`components.json` has `tailwind.config: ""`). After adding a component: import `cn` from `@/lib/utils` (not the `cn` npm package — uninstall it if added) and convert v4 syntax like `origin-(--var)` to `origin-[--var]`.
- **Next.js 16** (`next: "latest"`, installed 16.x). Middleware lives in root `proxy.ts` exporting `proxy()` — the Next 16 name for `middleware.ts`. Don't create a `middleware.ts`.
- **`cacheComponents: true`** in `next.config.ts`. Anything that reads request-time data (cookies, `createClient()` from `lib/supabase/server`, `getClaims()`) must sit inside a `<Suspense>` boundary, which is why the template wraps `AuthButton` and `UserDetails` in `Suspense`. Follow that pattern or the build fails.
- **Tailwind CSS v3** with `tailwind.config.ts` and CSS variables in `app/globals.css`; shadcn/ui (new-york style, neutral base, lucide icons) — add components with `npx shadcn@latest add <name>`, they land in `components/ui/`. Use `cn()` from `lib/utils.ts` for class merging.
- Path alias `@/*` → repo root.
- `eslint-config-next` is pinned at 15.3.1 while `next` floats to latest; `@supabase/ssr` and `@supabase/supabase-js` also float on `latest`.

## Auth architecture (Supabase SSR, cookie-based)

Three Supabase client factories in `lib/supabase/`, each for a different runtime — pick by where the code runs:

| File | Use in | Notes |
|---|---|---|
| `client.ts` | Client Components (`"use client"`) | browser client |
| `server.ts` | Server Components, Route Handlers, Server Actions | async; reads `cookies()`. `setAll` silently fails in Server Components — the proxy handles session refresh |
| `proxy.ts` | only `proxy.ts` at root via `updateSession()` | refreshes the session cookie on every matched request |

Rules carried over from the template (breaking them causes random logouts):
- Never cache a Supabase client in a module-level variable; create one per request/function.
- In `updateSession`, nothing may run between `createServerClient(...)` and `supabase.auth.getClaims()`, and the returned `supabaseResponse` must be returned as-is (or its cookies copied onto any new response).
- Use `auth.getClaims()` to check the user server-side (not `getSession()`).

**Route protection is global, not per-page:** `updateSession` redirects any unauthenticated request to `/auth/login` unless the path is `/` or starts with `/login`, `/auth`, `/player` or `/match` (the last two are public while the app has no login). A new public route must be added to that allowlist in `lib/supabase/proxy.ts`. Pages still re-check with `getClaims()` and `redirect()` as defense in depth (see `app/protected/page.tsx`).

Auth flow: forms in `components/*-form.tsx` call the browser client directly; email confirmation / password-reset links hit `app/auth/confirm/route.ts`, which calls `verifyOtp` and redirects to `?next=` (default `/`) or `/auth/error`.
