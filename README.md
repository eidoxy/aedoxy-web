# aedoxy-web

Next.js app for aedoxy.com: public marketing site now, panel and admin later. Specs live in `docs/` (start with `docs/README.md`, `docs/UI-GUIDE.md`, `docs/TRD.md`).

## Status

Wave 1: design system, marketing layout, `/`, `/models`, `/pricing`, mock catalog, env validation, Drizzle schema. Auth, Poketo, worker, panel and admin are not built yet.

## Commands (Bun)

```
bun install
bun run dev          # http://127.0.0.1:3000
bun run typecheck
bun run lint
bun run test         # Vitest, pure logic only
bun run build        # output: standalone
bun run db:generate  # Drizzle migrations from src/server/db/schema.ts (no DB needed)
bun run db:seed-catalog  # example plans + pool row (SEED_POOL_USD=500 sets the opening balance once; an existing pool is never changed)
                          # also syncs unsynced plans to New API: needs the console running + NEWAPI_INTERNAL_URL/NEWAPI_BRIDGE_TOKEN; rerun after a failure
bun run worker       # outbox, order sweeper, expiry reconciliation, pool invariant (needs DATABASE_URL + New API/Poketo env)
```

Copy `.env.example` to `.env.local`. All integration variables are optional until `ENV_STRICT=true`.

## Layout

```
src/app/(marketing)/   landing, models, pricing, [stub] placeholders
src/app/api/public/    activity feed (mock)
src/components/        brand/, marketing/, ui/ (shadcn)
src/lib/               pure helpers (format, fx, models, activity) + tests
src/server/catalog/    typed contracts + mock source (swap in ./index.ts)
src/server/db/         Drizzle schema (TRD section 6, without Better Auth tables)
src/env.ts             Zod-validated environment
```

## Rules to keep

- No prices, counts or stats in components. They come from `src/server/catalog`.
- Rupiah from dollars only through `<UsdIdr>` (display hint, never an order amount).
- Provider logos come from `src/components/brand/icons.ts` (see the comment there).
- Mock data in `src/server/catalog/mock.ts` is illustrative. Do not ship it.
