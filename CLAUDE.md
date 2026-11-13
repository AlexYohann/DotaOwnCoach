# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Scaffolded from the official Next.js + Supabase starter (`create-next-app --example with-supabase`). Versioned with SemVer: `version` in `package.json`, a `CHANGELOG.md` entry and an annotated git tag `vX.Y.Z` per release. The roadmap (what each next version contains and its "done when" criterion) lives in `README.md` — follow its numbering (renumbered from v1.3 because v1.1/v1.2 went beyond the original plan).

Dota features so far (v1.4 visual: design in `docs/superpowers/specs/2026-11-08-v1-4-visual-design.md`):
- `/` — cover with a random animated hero (`components/home-hero.tsx`, client-side pick so the page stays static) + Steam ID form with the Steam friend-code link (`components/steam-id-form.tsx`).
- `/player/[id]` — last match highlighted (hero animation, result · side · K/D/A), most-played card with that hero's averages (`mostPlayed().avg`, `formatDecimal` pt-BR in `lib/player-summary.ts`), match table with side column; validates the ID with `toAccountId` (`lib/steam.ts`).
- Every page's header (`SiteHeader`): "Pro players" link + search (`components/header-search.tsx`) + account slot ("Entrar com a Steam" or avatar menu). See Auth architecture. `search={false}` (also on `PageShell`) hides the box — `/pros` has the big one in its body.
- **Pro players (v2.1, design in `docs/superpowers/specs/2026-11-12-v2-1-pro-players-design.md`):**
  - `HeaderSearch` is a combobox (`size="sm" | "lg"`): digits + Enter → `/player/<id>` as before; text → suggestions from `GET /pros/search?q=` after 150 ms, in two groups (verified / homonyms), rows in `components/pro-suggestion-row.tsx` (also exports `ProAvatar`, `VerifiedBadge`), crest in `components/team-crest.tsx` (https only; falls back to the tag). Loading a page never calls `/pros/search`. It clears its text on navigation, because Next keeps the previous page's state and the old text came back.
  - `/pros` (`app/pros/page.tsx`): big search + 6 featured teams with the whole current roster; `RatingHelp` ("?" popover). Player links use `prefetch={false}`.
  - `/pros/example` → 307 to a random verified player of a featured team with a match in the last 30 days (plain `<a>` on the cover, never `<Link>`). `/pros/refresh` → daily Vercel cron (`vercel.json`, 09:00 UTC), requires `Authorization: Bearer $CRON_SECRET` (`lib/cron-auth.ts`, constant-time; unset secret never authorizes).
  - Pure rules in `lib/pros.ts` (no `server-only`, the client uses it): `normalizeNick` (keeps letters/digits of any alphabet), `cleanQuery` (null = don't search; output has no SQL wildcards), `featuredTeams`, `currentRoster`, `lastPlayedLabel`, `safeLogoUrl`, `submitTarget`.
  - `lib/pros-data.ts` (`server-only`): `refreshPros` (10-min lock in `pros_refresh`; refuses a tiny/empty list, zero active teams or an empty roster from OpenDota instead of wiping the good data), `getFeaturedTeams` (DB first; stale → answers and refreshes inside `after()`), `searchPros`, `getExampleAccountId`, `getVerifiedPro` (never throws; used by `/player/[id]` for the "Pro: nick ✓ · team" line — verified only).
  - Player page also has "Perfil na Steam ↗" (`steamProfileUrl` in `lib/steam.ts`); match page has a dismissable tip (`components/match-tip.tsx`, `lib/match-tip.ts`, `localStorage` `dota-own-coach:match-tip`).
- `/match/[id]?player=` — selected hero animated in the header, stats panel, cosmetics, team tables in two modes (full / compact, saved in `localStorage` `dota-own-coach:team-mode`) sortable per team (`lib/team-sort.ts`) (`components/match-view.tsx`, `team-tables.tsx`, `match-items.tsx`, client).
- OpenDota's copy of the Steam profile (name/avatar) goes stale for days. When a logged-in user opens their **own** `/player/<id>`, the page calls `refreshOwnProfile` (`lib/profile-refresh.ts`) inside `after()`: conditional UPDATE on `profiles.profile_refreshed_at` (at most once a day), `POST /players/{id}/refresh` (`requestPlayerRefresh`), ~6 s wait, then name/avatar written to `players` (not `fetched_at`). Don't do this for every visited player — each request makes OpenDota reprocess the account's history. `getViewerAccountId()` (`lib/account.ts`) gives the viewer from the JWT.
- Lone Druid's items live on the bear: OpenDota sends them in `additional_units`, parsed into `MatchPlayer.units` (`lib/opendota.ts`), labelled by `unitLabel` (`lib/match.ts`) and shown in the hero panel and as a second line in the team tables (label above the icons — beside them the row overflowed the table).
- Shared visual pieces: `HeroBanner` (illustration + hero animation + content, never overlapping) and `HeroRender` (webm with fade-in; always animates — even with prefers-reduced-motion, Alex decided 2026-11-08 — with a pause/play button in `HeroBanner` saved in `localStorage` `dota-own-coach:hero-motion`; whoever changes it (banner or account menu) dispatches a `CustomEvent` named `HERO_MOTION_EVENT` (`lib/hero-art.ts`) with the new value in `detail`, and both listen to it; saveData/404/unknown hero → static image) in `components/`; Valve CDN URLs and rarity colors in `lib/hero-art.ts`. Dark theme only (no `next-themes`); palette as Tailwind colors `panel`, `line`, `ink`, `ember`, `win`, `loss`, `side` + `font-display` (Barlow Condensed). Side (Radiant/Dire) is always neutral text — never win/loss colors.
- `lib/opendota.ts` (`server-only`) is the only place that calls OpenDota; it does no caching except the items list (`fetchItems`, `"use cache"` 1 day).
- `lib/data.ts` (`server-only`) is what pages call: Supabase-first cache (v1.3). Player + recent matches 10 min, heroes 1 day, match `detail` forever (bump `DETAIL_VERSION` if its JSON shape changes). DB errors fall back to API-only; API down with saved data → `freshness.source = "stale"`.
- Supabase tables (`supabase/migrations/`): `heroes`, `players`, `matches`, `player_matches` — RLS with public SELECT only, no write policies; `profiles` (v2.0) — SELECT own row only, no write policies; `pro_teams`, `pro_players` (v2.1) — public SELECT only; `pros_refresh` (v2.1, lock + last refresh) — RLS on with **no policy on purpose** (server only; the advisor's INFO "RLS enabled no policy" is expected). SQL function `search_pros(q)` (`pg_trgm`) is callable by `anon` straight from `/rest/v1/rpc`, so it validates `q` itself (2–32 chars, no `%`, `_`, `\`) — never rely only on `cleanQuery` in the Next server. Reads use `createReadClient()` (publishable key), writes `createAdminClient()` (`SUPABASE_SECRET_KEY`, returns `null` if unset → no writes). Both in `lib/supabase/admin.ts`.

**`"use cache"` gotcha:** an error thrown inside a cached function reaches the caller as a generic `Error` (it goes through React serialization), so `instanceof OpenDotaError` / `.kind` break. Return a status object and call `cacheLife` conditionally instead, or catch everything at the wrapper (as `getItems` does).

**Layout gotcha:** inside an `overflow-x-auto` wrapper, give the wrapper `relative` — absolutely positioned `sr-only` labels otherwise escape it and widen the whole page on mobile.

## Regras do projeto

- Sempre explique o que mudou e por quê, em português.
- Nunca use a secret key em variável NEXT_PUBLIC_ nem em código do cliente.
- Toda tabela nova deve ter RLS com políticas explícitas; explique cada política.
- Chamadas à OpenDota só no servidor.

## Deploy

Vercel project `dota-own-coach` → https://dota-own-coach.vercel.app, linked to GitHub `AlexYohann/DotaOwnCoach`: **every push to `main` deploys to production** (ask before pushing). Functions pinned to `gru1` in `vercel.json` (Supabase is `sa-east-1`). Env vars are set in the Vercel dashboard (same three as `.env.local`, plus `CRON_SECRET` since v2.1 — server-only, long random value; Vercel sends it as `Authorization: Bearer …` to the cron in `vercel.json`). Do not add the Vercel Marketplace "Supabase" integration — it would create/override a different database.

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

Env: copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a legacy anon key value also works in that variable), plus `SUPABASE_SECRET_KEY` (`sb_secret_…`, server-only) for cache writes. A `.env.local` created before v1.3 lacks that line. `CRON_SECRET` is only needed locally to call `/pros/refresh` by hand.

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

**Login is Steam only (v2.0, design in `docs/superpowers/specs/2026-11-10-v2-0-login-steam-design.md`).** Steam is OpenID 2.0, which Supabase Auth doesn't support, so:
- Both routes first check `trustedOrigin(request.nextUrl.origin, process.env)` (`lib/site-origin.ts`): on Vercel only `https://` + `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`/`VERCEL_BRANCH_URL`; elsewhere only `http://localhost|127.0.0.1`. Never trust the Host header alone.
- `app/auth/steam/route.ts` sets a random `state` in the `steam_login_state` cookie (HttpOnly, Lax, 10 min, path `/auth/steam`) and redirects to Steam (`buildSteamLoginUrl(origin, state)`; the state goes inside the signed `return_to`). This blocks login CSRF. `app/auth/steam/callback/route.ts` runs `verifySteamResponse(params, origin, cookieState)` (`lib/steam-openid.ts`). It checks: every `openid.*` key appears **exactly once** (a duplicated `claimed_id` once allowed logging in as anyone, found in the final review); `openid.signed` covers op_endpoint/claimed_id/identity/return_to/response_nonce/assoc_handle; op_endpoint; `return_to` = our origin + path + the cookie state; `claimed_id` = `identity`; and `check_authentication` with Steam, with the body built from the same validated values. Any doubt → `null`. The callback always clears the state cookie. Then `prepareSteamSession` (`lib/steam-session.ts`, secret key) and `verifyOtp({ type: "email", token_hash })` on the cookie client, then redirects to `/player/<account_id>`. `openid.mode=cancel` → `/`; failures → `/auth/error?reason=steam|session`.
- `prepareSteamSession`: `createUser` with internal email `<SteamID64>@steam.invalid`, **no password**, `app_metadata: { steam_id64, account_id }` (`email_exists` = returning user), then `generateLink({ type: "magiclink" })` and an upsert into `profiles`. **`account_id` lives only in `app_metadata`** (server-only); never read it from `user_metadata`, which the user can edit. It reaches the JWT, so `accountIdFromClaims(claims)` (`lib/auth-routing.ts`) gives it without a DB query.
- Steam already rejects a replayed response (2nd `check_authentication` → `is_valid:false`, checked 2026-11-10), so there is no nonce table.
- Supabase dashboard (set by Alex): "Allow new users to sign up" **off** and the Email provider **off**. The admin API still creates users; public `signUp`/`signInWithPassword`/`signInWithOtp` fail. Don't turn the Email provider back on.
- `profiles` (`id` → `auth.users`, `account_id`, `steam_id64`): RLS lets a user SELECT only their own row; no write policies.
- Header: `HeaderAccountSlot` (`components/header-account.tsx`, server, in `Suspense`) uses `getHeaderAccount()` (`lib/account.ts`): claims → `account_id` → name/avatar from `players`. It **never calls OpenDota**. `SiteHeader`/`PageShell` require an `account` prop so no page forgets it. The menu (`components/account-menu.tsx`, v2.1) has the friend code with a copy button, own Steam profile, Pro players and the hero-animation toggle. Logout does `signOut({ scope: "local" })` (this device only) + `window.location.assign("/")`. A full reload is needed because `router.push("/")` reused the logged-in redirect cached by the brand link's prefetch.
- Links to `/auth/steam` are plain `<a>`, not `<Link>`, so there is no prefetch of an external redirect.

**Route protection is global, not per-page:** `routeFor()` in `lib/auth-routing.ts` (pure, tested) is called by `updateSession`. Rules:
- logged in with `account_id` on `/` → `/player/<account_id>`;
- logged out outside the public routes → `/`.

Public routes are `/` plus the prefixes `/auth`, `/player`, `/match` and `/pros`, matched per segment (`/players-x` is not public). A new public route goes in `PUBLIC_PREFIXES`. Redirects copy the `supabaseResponse` cookies.
