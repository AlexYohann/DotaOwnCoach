# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Scaffolded from the official Next.js + Supabase starter (`create-next-app --example with-supabase`). Versioned with SemVer: `version` in `package.json`, a `CHANGELOG.md` entry and an annotated git tag `vX.Y.Z` per release. The roadmap (what each next version contains and its "done when" criterion) lives in `README.md` — follow its numbering (renumbered from v1.3 because v1.1/v1.2 went beyond the original plan).

Dota features so far:
- `/` — Steam ID form (`components/steam-id-form.tsx`).
- `/player/[id]` — profile + last 20 matches; validates the ID with `toAccountId` (`lib/steam.ts`).
- `/match/[id]?player=` — match detail: both teams, items with hover preview, selected-hero stats panel (`components/match-view.tsx`, client).
- `lib/opendota.ts` (`server-only`) is the only place that calls OpenDota; it does no caching except the items list (`fetchItems`, `"use cache"` 1 day).
- `lib/data.ts` (`server-only`) is what pages call: Supabase-first cache (v1.3). Player + recent matches 10 min, heroes 1 day, match `detail` forever (bump `DETAIL_VERSION` if its JSON shape changes). DB errors fall back to API-only; API down with saved data → `freshness.source = "stale"`.
- Supabase tables (`supabase/migrations/`): `heroes`, `players`, `matches`, `player_matches` — RLS with public SELECT only, no write policies. Reads use `createReadClient()` (publishable key), writes `createAdminClient()` (`SUPABASE_SECRET_KEY`, returns `null` if unset → no writes). Both in `lib/supabase/admin.ts`.

**`"use cache"` gotcha:** an error thrown inside a cached function reaches the caller as a generic `Error` (it goes through React serialization), so `instanceof OpenDotaError` / `.kind` break. Return a status object and call `cacheLife` conditionally instead, or catch everything at the wrapper (as `getItems` does).

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
