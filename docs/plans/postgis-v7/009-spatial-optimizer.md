# Task 009: spatial-optimizer Helper (PG16 Workaround)

## Overview

The PR ships `withSpatialOptimization()` in `@prisma/adapter-pg`: detects
PostgreSQL 16 via `SELECT version()` and wraps callbacks in a transaction with
`SET LOCAL enable_nestloop = off`, working around a PG16 planner regression that
makes spatial CTE joins pick nested loops (40–50x slowdown). Exported from the
adapter's public API.

## Recommendation: reconsider before porting

This helper is qualitatively different from the rest of the PR:

- It is a **user-facing public API** (`export { withSpatialOptimization }`) shaped
  around a `PrismaClientLike` structural interface (`$queryRaw`, `$executeRaw`,
  `$transaction`) — an unusual dependency direction for a driver adapter package,
  and a compatibility surface Prisma would have to maintain long after the PG16
  planner issue is gone (PG17 reportedly fixed it; PG16 will age out).
- `SET LOCAL enable_nestloop = off` is a blunt instrument applied to the entire
  transaction, not only to spatial statements.
- Its `WeakMap` version cache keys on the client instance and does a `version()`
  round-trip on first use — behavior that belongs, if anywhere, in documentation
  ("if you are on PG16 and see slow spatial joins, run `SET enable_nestloop = off`")
  or in a docs recipe, not in the adapter API.

Proposed default: **do not port** the helper or its export; document the PG16
caveat in the feature's docs (tracked in prisma/web#7685 upstream) and in this plan.
If maintainers want it kept, port it as-is under a clearly experimental name.

## If ported anyway (TDD steps)

1. Port `src/__tests__/spatial-optimizer.test.ts` (+110) first — it uses a mock
   client, no DB required.
2. Port `src/spatial-optimizer.ts` + the `index.ts` export; suite green.
3. Add a caveat test: nested `withSpatialOptimization` calls and non-PG16 pass-through.

## Acceptance criteria

- Explicit maintainer decision recorded here (port / drop).
- If ported: unit suite green and the export documented as PG16-specific.
