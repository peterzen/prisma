# Task 001: Engines — Rebase PR 5797, Build & Wire Local Engines

## Overview

Bring [prisma-engines#5797](https://github.com/prisma/prisma-engines/pull/5797) up to
date with engines main and produce local artifacts this repo can consume. This is the
gate for every schema-dependent task.

Verified facts (2026-07-21):

- Engines PR head `6f45c313`, base `3c6e1927`; engines main `e922089b` is only
  4 commits ahead (openssl bump, schema-engine constraint-rename fix, typedSql
  preview unhide, schema-engine rolled-back-migrations fix).
- `git merge-tree` dry-run of PR → main: **zero conflicts**.
- Neither published Wasm build (`7.8.0-6.3c6e1927`, `7.9.0-1.e922089b`) accepts
  `Geometry(Point, 4326)` — the support exists only on the PR branch.

## Scope of the engines PR (for orientation)

- **PSL**: `Geometry(<type>, <srid>)` field syntax (`psl/schema-ast` grammar +
  parser-database types), Postgres connector native types & validations, new
  capability flag, validation fixtures.
- **DMMF**: renders geometry scalars (`query-compiler/dmmf`).
- **Query schema/structure**: GeoJSON filter parsing (`filter/geojson.rs`,
  `filter/geometry.rs`), `near`/`within`/`intersects` input types, `distanceFrom`
  order-by, JSON protocol adapter support.
- **Quaint**: `ST_DWithin`/`ST_Within`/`ST_Intersects`/`ST_Distance`/
  `ST_GeomFromGeoJSON` render functions (`quaint/src/ast/function/postgis.rs`).
- **Query compiler**: data mapper geometry output, 15 SQL snapshot tests, 2 graph
  build test suites.
- **Schema engine**: Postgres describer/differ/renderer support for `geometry`
  columns, introspection tests, migration tests.

## Steps (TDD: run the Rust suites at every stage)

1. Clone `prisma-engines` next to this repo (`../prisma-engines`, per `AGENTS.md`),
   fetch `refs/pull/5797/head`, create branch `postgis-v7` from engines main and
   merge/rebase the PR (expected clean).
2. Run the touched Rust test suites and make them green:
   - `psl` validation tests (incl. the two new `.prisma` fixtures).
   - `query-compiler/core-tests` geometry graph-build suites.
   - `query-compiler/query-compiler` snapshot tests (`geometry-*.json` +
     `.snap` files); note one test is checked in disabled as
     `geometry-filter-intersects.json.skip` — investigate why and either fix or
     document.
   - `dmmf` tests (geometry rendering).
   - Schema-engine Postgres migration/introspection tests against a PostGIS
     container (`postgis/postgis` image).
3. Decide on the `bytes` vs `geometry` placeholder question (index item 5): make the
   query compiler emit `scalarType: 'geometry'` for geometry placeholders in query
   plans if feasible, so the prisma-side adapter (task 004) can drop UTF-8-JSON
   sniffing. Add/adjust a query-plan snapshot proving the arg type.
4. Build artifacts:
   ```sh
   make build-schema-wasm
   make build-qc-wasm
   cargo build --release -p schema-engine-cli   # native schema engine
   ```
5. Wire into this repo:
   ```sh
   pnpm upgrade -r @prisma/prisma-schema-wasm@file:$PRISMA_ENGINES_ROOT/target/prisma-schema-wasm
   pnpm upgrade -r @prisma/query-compiler-wasm@file:$PRISMA_ENGINES_ROOT/query-compiler/query-compiler-wasm/pkg
   pnpm build
   export PRISMA_SCHEMA_ENGINE_BINARY=$PRISMA_ENGINES_ROOT/target/release/schema-engine
   ```
   Do **not** commit the `file:` pins to the feature branch's final history; they are
   a dev-time device. Track the eventual published engines version via
   `scripts/bump-engines.ts` once the engines PR merges.

## Status (2026-07-21) — merge done, PR's own suites green

Executed locally at `/home/user/prisma-engines`, branch `postgis-v7` = engines main
`e922089b` + merge of PR 5797 head `6f45c313` (merge commit; zero conflicts).

Test results (`CLICOLOR_FORCE=1` required — the expect-test error snapshots embed
ANSI colors, and a non-TTY environment otherwise fails ~580 pre-existing negative
tests identically on unmodified main):

- `psl` (217 validation fixtures incl. both new postgis ones + 1063 datamodel
  tests), `prisma-fmt`, `dmmf` (incl. `geometry_fields_in_datamodel_and_schema_dmmf`),
  `query-structure` (all GeoJSON filter units), `core-tests` (all geometry
  graph-build tests), `query-compiler` (snapshot suite incl. all 15 geometry
  snapshots): **all green**.
- `request-handlers --all-features`: **28/28 green** (includes the PR's new JSON
  protocol adapter geometry tests; without `--all-features` the whole target fails
  on main too because the fixture schema needs the `mongodb` feature).
- `sql-query-builder`, `schema`, `query-core`: green.
- `quaint`: DB-free units green; 651 tests require live databases
  (`TEST_MYSQL` etc.) and fail identically on unmodified main — not PR-related,
  and the PR adds no quaint tests.
- Schema-engine PostGIS introspection/migration tests: **not run** — they need a
  live PostGIS database and this environment has no Docker. Must be covered in an
  environment with `postgis/postgis` available.

Remaining from this task: Wasm artifact builds (`wasm-bindgen` 0.2.105 CLI and
binaryen installed), prisma-side validate smoke test, schema-engine binary build.

## Acceptance criteria

- All engines test suites touched by the PR pass on top of engines main.
- Smoke test in this repo: `validate()` accepts the postgis functional test schema;
  `db push` of that schema succeeds against a `postgis/postgis:15-3.3` container with
  the local schema-engine binary.
- A written note in this directory (update the index) recording the engines branch
  commit hash used for the local build, so results are reproducible.
