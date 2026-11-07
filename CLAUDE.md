# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Scaffolded from the official Next.js + Supabase starter (`create-next-app --example with-supabase`). Versioned with SemVer: `version` in `package.json`, a `CHANGELOG.md` entry and an annotated git tag `vX.Y.Z` per release. The roadmap (what each next version contains and its "done when" criterion) lives in `README.md` — follow its numbering (renumbered from v1.3 because v1.1/v1.2 went beyond the original plan).

Dota features so far (no Supabase persistence yet):
- `/` — Steam ID form (`components/steam-id-form.tsx`).
- `/player/[id]` — profile + last 20 matches; validates the ID with `toAccountId` (`lib/steam.ts`).
- `/match/[id]?player=` — match detail: both teams, items with hover preview, selected-hero stats panel (`components/match-view.tsx`, client).
- `lib/opendota.ts` (`server-only`) is the only place that calls OpenDota. Heroes/items constants are cached 1 day, matches for weeks via `"use cache"`.

**`"use cache"` gotcha:** an error thrown inside a cached function reaches the caller as a generic `Error` (it goes through React serialization), so `instanceof OpenDotaError` / `.kind` break. Return a status object and call `cacheLife` conditionally instead — see `fetchMatch`.

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
```

There is no test framework or test script configured.

Env: copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a legacy anon key value also works in that variable).

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
