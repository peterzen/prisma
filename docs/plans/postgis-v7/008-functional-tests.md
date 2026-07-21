# Task 008: Functional Test Harness & PostGIS Suite

## Overview

Port the functional-test infrastructure (new `js_pg_postgis` adapter flavor, DB
lifecycle hooks for `CREATE EXTENSION postgis`, docker service, env plumbing) and the
1085-line `postgis` functional suite. This is the end-to-end proof and the final TDD
layer: the suite is the executable spec for the whole feature.

## Changes to port

- `_utils/providers.ts`: `AdapterProviders.JS_PG_POSTGIS`, added to
  `adaptersForProvider[postgresql]` and `relationModesForAdapter`.
- `_utils/types.ts`: `MatrixOptions.skipProviderFlavorExpansion`,
  `beforeDbPushCallback`, `afterForceResetCallback`.
- `_utils/getTestSuitePlan.ts`: honor `skipProviderFlavorExpansion`;
  `TEST_SKIP_PG_POSTGIS` exclusion env.
- `_utils/setupTestSuiteClient.ts` / `setupTestSuiteMatrix.ts`: thread the callbacks;
  route `JS_PG_POSTGIS` to `@prisma/adapter-pg`.
- `_utils/setupTestSuiteEnv.ts`: `dbPushWithAfterForceReset` — a programmatic
  `db push` that runs `migrate.reset()`, then the callback (re-create the postgis
  extension), then `migrate.push()`; plus `TEST_FUNCTIONAL_POSTGIS_URI` routing.
- `docker/postgis-test.yml` (postgis/postgis:15-3.3 on port 5433), `docker/README.md`,
  `.db.env` / `.envrc` additions.
- `tests/functional/postgis/{_matrix.ts, prisma/_schema.ts, test.ts}` — 39 tests
  covering CRUD, SRID handling, all spatial filters, orderBy distance, edge cases.

## v7 adaptation notes / risks

- **`setupTestSuiteEnv.ts` is the riskiest port**: `dbPushWithAfterForceReset`
  reimplements half of `DbPush` using `@prisma/internals`/`@prisma/migrate`
  internals. All symbols it imports were verified to still exist on main
  (`loadSchemaContext`, `createSchemaPathInput`, `validatePrismaConfigWithDatasource`,
  `checkUnsupportedDataProxy`, `inferDirectoryConfig`, `getSchemaDatasourceProvider`,
  `Migrate.setup`, `migrate.reset/push`, `ensureDatabaseExists(root, provider,
config)`, `DbPushIgnoreWarningsWithFlagError`) — but signatures must be re-checked
  at port time; this private-API surface is what will silently drift. Consider the
  simpler alternative first: teach `DbPush` (or the harness) to run
  `CREATE EXTENSION IF NOT EXISTS postgis` via `DbExecute` between reset and push,
  or rely on the PSL `extensions = [postgis]` datasource property (engines PR
  touches `extensions` migration rendering — check whether declaring the extension
  in the test schema removes the need for the callback machinery entirely; if so,
  the harness changes shrink dramatically).
- **Matrix expansion side effect**: adding `JS_PG_POSTGIS` to
  `adaptersForProvider[postgresql]` makes _every_ postgres functional suite expand
  into a postgis flavor. Verify how CI selects flavors (`--flavor` per job in
  `test-template.yml`); locally, unset flavors all run. Options: keep the flavor out
  of `adaptersForProvider` and reference it only from the postgis `_matrix.ts`
  (preferred — avoids a repo-wide matrix explosion), or set `TEST_SKIP_PG_POSTGIS`
  everywhere except a dedicated job. Decide here, wire CI in task 010.
- **Remote executor**: opt the suite out of the Accelerate/remote-executor path per
  the task 005 decision (see existing patterns for `--remote-executor` opt-outs).
- Generated clients import the built runtime — run root `pnpm build` after tasks
  002–007 before running this suite.
- The schema uses `generator client { provider = "prisma-client-js" }` with an
  `output` path — match current functional-test schema conventions (the harness now
  injects generator blocks; compare with a freshly written suite's `_schema.ts` and
  use `idForProvider` where applicable).
- Engines prerequisites: local Wasm + `PRISMA_SCHEMA_ENGINE_BINARY` (task 001), and
  a running `docker compose -f docker/postgis-test.yml up -d`.

## TDD steps

1. Land harness changes with a **trivial smoke suite** first (a postgis
   `_matrix.ts` plus a schema with one geometry model and a single findMany test):
   proves flavor routing, extension creation, db push, and client generation end
   to end.
2. Port the full `test.ts` in thematic slices (CRUD → filters → orderBy → edge
   cases), running
   `pnpm --filter @prisma/client test:functional:code --adapter js_pg_postgis postgis`
   after each slice. Expect and record engines-behavior differences (e.g. the
   `intersects` snapshot disabled upstream — see task 001 step 2).
3. Run the postgres suites once with the postgis flavor enabled to catch collateral
   damage, then apply the chosen gating.
4. Full typecheck pass: `pnpm --filter @prisma/client test:functional postgis`
   (with types) to validate the generated type surface.

## Acceptance criteria

- Smoke suite and full ported suite green against dockerized PostGIS on both `js_pg`
  (plain postgres behavior unchanged) and `js_pg_postgis`.
- No unintended matrix expansion for unrelated suites.
- Harness diff minimized relative to the PR (callback machinery only if the
  `extensions = [postgis]` route proves insufficient).
