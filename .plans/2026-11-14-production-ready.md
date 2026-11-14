# Production-ready PR (Phase 1 of taking Plotpal live)

Status: done (2026-11-14). Region: database in Seoul (Supabase `ap-northeast-2`), API in Tokyo (Fly `nrt`; Fly has no Seoul region). Changed from Frankfurt on 2026-11-14. Free tiers, free
`*.vercel.app` address, AI off at first (`AI_ENABLED=false`).

Stack: Vercel (frontend) + Fly.io (API) + Supabase (Postgres). The browser must see ONE address: login
cookies are SameSite=Strict, host-only (`__Host-` in production) and the web app reads the CSRF cookie of
its own host, so Vercel rewrites `/auth/*` and `/projects/*` to Fly (the dev proxy's list, per the comment in
`dev-proxy.ts`).

## This PR (branch `feat/production-ready`), no live service is touched

1. `TRUST_PROXY` (hops, default 0, 2 on Fly): the real visitor IP for rate limits and login limits.
2. `DOCS_ENABLED`: `/docs` and the OpenAPI document off in production unless switched on.
3. Database TLS for Supabase (`DATABASE_SSL_CA`, pool size setting).
4. Graceful shutdown on SIGTERM/SIGINT.
5. Migration enabling Row Level Security on every table, plus a test that fails for a future table that forgets it.
6. `apps/api/Dockerfile` + `.dockerignore` (multi-stage, non-root, pinned, healthcheck).
7. `fly.toml` (health check, one machine always on, release command runs migrations, AI off, TRUST_PROXY=2).
8. `apps/web/vercel.json` (rewrites, then SPA fallback, security headers, asset caching) + a test that every dev-proxy API path has a rewrite.
9. README runbook and `.env.example`.

## Checks

Tests first for 1-5 and 8; integration test for the RLS guard; real Docker build and run against the local
database (non-root, /health, migrations through the Fly command, no secrets in the image); gitleaks on the
repo; lint, typecheck, `bun audit`, full browser suite, mutation checks on the new logic.

## Risks

The Vercel->Fly IP chain (hop count) can only be proven on a real deploy; `vercel.json` needs the Fly app
name (one follow-up commit); the Supabase pooler certificate may need the CA step.

## Outcome

Built and verified. Beyond the plan, testing found and fixed: (1) the first time-zone approach (a command
run in the background on each new connection) would break with pg 9, which refuses two queries on one
connection at once: the time zone is now set by a client class before the connection is handed out, with a
regression test and tests on a database that defaults to New York time (the local default, UTC, hid a
missing setting); (2) under the production Content Security Policy Zod probed for eval: fixed with
`z.config({ jitless: true })`, loaded first in `main.tsx`; (3) the browser tests now bypass the policy by
default (the accessibility checker injects a script) and `csp.e2e.ts` enforces it and walks the app.

Verified: API 1293 unit + 961 integration tests, web 2442 unit + 605 browser tests (3 skipped for browser
capability), lint, typecheck, build and `bun audit` clean, 36 of 36 deliberate breakages caught, a real
Docker build run against a throwaway database (non-root, health check, migration command, production
cookies, visitor address, `docker stop` exits 0), gitleaks clean (history) with a precise allowlist.

Region changed after approval: database in Seoul, API in Tokyo (Fly has no Seoul region).

Left for the next steps: the real Fly app name (the file says `plotpal-api`; it is also in the two
`vercel.json` destinations), `fly launch --no-deploy --copy-config`, the secrets, the Supabase pooler
certificate (the `DATABASE_SSL_CA` step), and the real hop count of `TRUST_PROXY` (proved on a deploy).
