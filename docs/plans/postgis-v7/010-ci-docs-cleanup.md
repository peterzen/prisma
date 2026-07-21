# Task 010: CI, Docs, AGENTS.md, Cleanup

## Overview

Finish the adaptation: CI wiring the original PR omitted, documentation/knowledge
updates, and removal of drive-by changes that should not ship with the feature.

## CI

- The PR added `TEST_FUNCTIONAL_POSTGIS_URI` (port 5433) and
  `docker/postgis-test.yml` but changed **no workflow files** — postgis tests would
  never run in CI, or worse, would run and fail wherever flavors are unfiltered.
- Per the task 008 gating decision:
  - Add a postgis service (or the separate compose file) to the functional-test job
    that runs the `js_pg_postgis` flavor in `.github/workflows/test-template.yml`.
  - Set `TEST_SKIP_PG_POSTGIS` (or rely on flavor selection) in every other job.
  - Keep `standalone: true` on any new `pnpm/action-setup` usage (pnpm 11 rule).
- Adapter unit tests (WKB, conversion) are DB-free — confirm `adapter-pg` already
  runs in the `driver-adapter-unit-tests` job (it does; no change expected, but the
  new test files must not require Docker).
- **Engines gate**: the workflow can only go green after the engines PR merges and
  `scripts/bump-engines.ts` pins a version containing it. Until then, keep the
  branch draft / clearly marked.

## Docs & knowledge base

- Update `AGENTS.md` (single source; `CLAUDE.md`/`GEMINI.md` are symlinks) with:
  - the postgis functional-test flavor and how to run it
    (`--adapter js_pg_postgis`, `docker compose -f docker/postgis-test.yml up -d`),
  - the DB-hook semantics if task 008 keeps the callbacks (the PR's own AGENTS.md
    paragraph about `beforeDbPushCallback` vs `afterForceResetCallback` under
    `TEST_REUSE_DATABASE` is good raw material — rewrite against the final design),
  - geometry protocol summary (tagged value `$type: 'Geometry'`, ColumnTypeEnum
    16–19/79–82, `ArgScalarType 'geometry'`) for future adapter work
    (adapter-neon/adapter-ppg are natural follow-ups and share `conversion.ts`
    patterns).
- `docker/README.md` postgis section (from the PR, adjusted to final compose setup).
- Note for follow-up (out of scope here): user-facing docs live in prisma/web
  (upstream tracks this as prisma/web#7685).

## Cleanup (exclusions from the port)

Do **not** carry these PR hunks:

- `packages/cli/src/utils/simpleDebounce.ts` — eslint comment removal.
- `packages/client/src/__tests__/buffer-small.test.ts` — eslint comment removals.
- `packages/client/src/__tests__/integration/__helpers__/sanitizeEvents.ts` — same.
- `packages/client/scripts/default-index.d.ts` — same.
- `.prettierignore` — PR hunk conflicts with main and is unrelated.
- The PR's `AGENTS.md` hunk verbatim (superseded by the docs work above).
- Engines `file:` dependency pins and any local-path artifacts (dev-only, task 001).

## Final verification checklist

- Root `pnpm build` clean; `pnpm lint` / `pnpm format` clean.
- `pnpm --filter @prisma/driver-adapter-utils --filter @prisma/adapter-pg
--filter @prisma/client-engine-runtime test` green (DB-free).
- Generator suites green with regenerated snapshots.
- Functional postgis suite green locally (js_pg + js_pg_postgis flavors).
- No references to unpublished engines versions left in `package.json` files.

## Acceptance criteria

- CI configuration merged and green on the feature branch (modulo the engines gate,
  which must be explicitly tracked in the PR description).
- AGENTS.md updated; drive-by changes absent from the final diff.
