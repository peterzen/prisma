# PostGIS Support v7 Adaptation — Task Index

## Overview

This directory contains the execution plan for adapting the community PostGIS PR
[prisma/prisma#29365](https://github.com/prisma/prisma/pull/29365) (and its engines
counterpart [prisma/prisma-engines#5797](https://github.com/prisma/prisma-engines/pull/5797))
to the current Prisma 7 codebase, using a test-driven workflow: each task lands the
ported tests first (red), then the implementation (green), then refactors to v7
conventions.

What the original PR delivers:

- `Geometry(Point, 4326)`-style native geometry fields in PSL (PostgreSQL/PostGIS only).
- GeoJSON-based input/output (`Point`, `LineString`, `Polygon`, with `srid`).
- Spatial filters `near` (ST_DWithin), `within` (ST_Within), `intersects` (ST_Intersects)
  and `orderBy: { position: { distanceFrom: ... } }` (ST_Distance).
- WKB/EWKB serialization in `@prisma/adapter-pg` plus PostGIS OID discovery.
- A `withSpatialOptimization()` helper for a PostgreSQL 16 planner regression.
- ~1085-line functional test suite plus 86 adapter unit tests.

## Analysis Snapshot (2026-07-21)

Upstream status: prisma/prisma#29365 was **closed by maintainers** while clearing the
PR backlog ahead of the codebase's move to a v7 branch — explicitly because it
depends on the unmerged prisma-engines#5797 and touches 60+ files, not on the merits
of the feature. This plan is the revival of that work against v7.

All refs below were fetched and diffed locally; numbers are from `git diff --stat`.

| Item                                                       | Value                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| PR head (`refs/pull/29365/head`)                           | `a4acec8cb`                                                            |
| PR merge base with `prisma/prisma` main                    | `ab2b847b9` (2026-05-15)                                               |
| PR size                                                    | 62 files, +3058 / −49                                                  |
| Current main (= this repo's base)                          | `3005a01fc` (39 commits past merge base)                               |
| Dry-run merge into main                                    | Auto-merges except 2 trivial conflicts: `.prettierignore`, `AGENTS.md` |
| Engines PR head (`prisma-engines` `refs/pull/5797/head`)   | `6f45c313`                                                             |
| Engines PR base                                            | `3c6e1927` (= the npm build the PR pins)                               |
| Engines PR size                                            | 110 files, +4170 / −155                                                |
| Engines main (`e922089b`, = version pinned by prisma main) | 4 commits past engines PR base; dry-run merge is conflict-free         |

### The critical blocker: engines support is not published

Verified experimentally by running `prisma_schema_build.wasm` `validate()` on a schema
containing `position Geometry(Point, 4326)?`:

- `@prisma/prisma-schema-wasm@7.8.0-6.3c6e1927...` (what the PR pins): **rejects** the schema.
- `@prisma/prisma-schema-wasm@7.9.0-1.e922089b...` (what main pins): **rejects** the schema.

The PSL keyword, DMMF output, query-schema types, spatial query planning (quaint
`ST_*` functions), and schema-engine (migrate/introspection) support all live only in
the **unmerged** engines PR #5797. The published `7.8.0-6.3c6e1927` build the PR pins
is built from the engines PR's _base_, not from the PR branch — which is why the PR
cannot pass CI as-is. The author developed against locally built engines.

Consequence: **Task 001 (engines) gates everything else.** Client-side work can start
in parallel only for the pure-unit layers (WKB, types) that do not need a schema to
validate.

Note that three engine artifacts are affected, not two:

1. `@prisma/prisma-schema-wasm` (PSL validation + DMMF) — Wasm, consumed by `@prisma/internals`.
2. `@prisma/query-compiler-wasm` (query planning) — Wasm, consumed by `@prisma/client`.
3. **Schema engine native binary** (`db push` / migrations / introspection) — consumed via
   `@prisma/engines`; overridable with `PRISMA_SCHEMA_ENGINE_BINARY`. The functional
   test harness runs `db push` on schemas containing `Geometry(...)`, so a locally
   built schema-engine binary is required too.

### v7 breaking changes / semantic drift the adaptation must handle

1. **Engines pin** — see above. Local dev uses the `AGENTS.md` workflow
   (`make build-schema-wasm`, `make build-qc-wasm`, `pnpm upgrade -r ...@file:...`)
   plus `PRISMA_SCHEMA_ENGINE_BINARY`; landing requires engines PR merge + a new
   pinned engines version (`scripts/bump-engines.ts`).
2. **`adapter-pg/src/pg.ts` drift** — #29650 removed a duplicate `values` parameter in
   `PgQueryable.queryRaw`; #29287 (already in the PR's base) added connection-string
   URL support to the `PrismaPg` factory. The PR's OID-cache key is derived from
   `client.options.connectionString ?? host:port/database`; both options can be
   absent → the key can collapse to `':undefined/undefined'` for distinct databases.
   Fix as part of task 004.
3. **Lazy OID discovery misses transactions and `executeRaw`** — the PR only overrides
   `PrismaPgAdapter.queryRaw`. The first geometry query issued inside an interactive
   transaction (`PgTransaction`) or via `executeRaw` bypasses initialization, so
   geometry columns come back unparsed. v7's `PrismaPgAdapterFactory.connect()` is the
   correct lifecycle hook — initialize there (task 004).
4. **Module-global mutable state** — `registerGeometryParser` mutates the shared
   `customParsers` map and the OID cache is keyed per connection string but stored
   globally. OIDs differ per database; two adapters against different databases can
   poison each other. Scope per adapter instance (task 004; also flagged in the
   original PR's review).
5. **Geometry args typed as `bytes` by the query compiler** — the PR added `'geometry'`
   to `ArgScalarType`, but its own `mapArg` comment admits the compiler emits `bytes`
   placeholders and the adapter sniffs UTF-8 JSON byte arrays to detect GeoJSON. When
   adapting the engines PR, prefer emitting `arity/scalarType = geometry` from the
   query compiler so the adapter does not have to guess (tasks 001 + 004). Keep the
   sniffing fallback only if the engines side cannot express it.
6. **Generated-type drift** — main gained `PrismaClientConstructorArgs` and the
   `XOR ... & object` fix in both generators' `common.ts` (#29592, #29735). Auto-merge
   handles the text; regenerate snapshots and re-run type tests (task 007).
7. **DMMF sniffing via `type.startsWith('geometry(')`** — generator code detects
   geometry scalars by string prefix on the DMMF type name. Verify the adapted engines
   DMMF actually emits `geometry(Point, 4326)` scalars, and centralize detection
   (task 007) instead of duplicating the prefix check in 6 call sites.
8. **`serialize-sql` / remote executor** — the new `'geometry'`/`'geometry-array'`
   column-type strings flow to the query-plan-executor (Accelerate) protocol.
   `packages/query-plan-executor` has no geometry handling in the PR; the functional
   suite must opt out of the remote-executor path until QPE support is decided
   (tasks 005, 008).
9. **CI wiring is missing in the PR** — the PR adds the `js_pg_postgis` adapter flavor
   to `adaptersForProvider[postgresql]` (which expands _every_ postgres functional
   suite), a new `TEST_FUNCTIONAL_POSTGIS_URI` (port 5433), and a separate
   `docker/postgis-test.yml`, but changes **no workflow files**. Decide gating
   (dedicated CI job + `TEST_SKIP_PG_POSTGIS` elsewhere) in task 008/010.
10. **pnpm 11 / repo conventions** — main migrated to pnpm 11; the PR adds no new
    dependencies so no lockfile surgery is expected, but any new package scripts must
    respect current conventions (kebab-case files, `#private` fields, no useless
    comments, "Wasm" capitalization).
11. **Drive-by changes to drop** — the PR removes eslint-disable comments in unrelated
    files (`packages/cli/src/utils/simpleDebounce.ts`, `buffer-small.test.ts`,
    `sanitizeEvents.ts`, `default-index.d.ts`) and has trivial conflicts in
    `.prettierignore`/`AGENTS.md`. Exclude these from the port; write fresh
    `AGENTS.md` notes instead.
12. **Type-model inconsistency** — `driver-adapter-utils` `Geometry` covers only
    `Point | LineString | Polygon`, while the client's `isGeometry` accepts `Multi*`
    and `GeometryCollection`. Resolve deliberately (task 002): either extend the WKB
    layer to Multi\*/collections or restrict input validation to what round-trips.
13. **PSL syntax and DMMF rendering differ from what the prisma-side PR assumes**
    (verified against the adapted engines branch, 2026-07-21). The engines PR's
    syntax is `position Geometry? @db.Geometry(Point, 4326)` — first-class
    `Geometry`/`Geography` scalar types paired with native-type attributes — **not**
    the inline `Geometry(Point, 4326)?` form used by the prisma-side PR's functional
    test schema (which does not parse). DMMF renders `field_type: "Geometry"` /
    `"Geography"` with the native args in `native_type` (e.g.
    `["Point", "4326"]`), and the query-schema DMMF output types are also plain
    `"Geometry"`/`"Geography"` (per the engines PR's own
    `geometry_fields_in_datamodel_and_schema_dmmf` test). Consequences: the
    functional test schema must switch to the attribute form (task 008), and the
    generators' `type.startsWith('geometry(')` sniffing will never match — detection
    must key on `type === 'Geometry' || type === 'Geography'` at scalar location
    (task 007), including a `Geography` story the prisma-side PR does not have.

## Implementation Status (2026-07-21)

The port is implemented on this branch:

- Squash-port of the original PR (56 files, minus drive-by edits), then v7
  corrections as separate commits (generator detection via `Geometry`/`Geography`
  DMMF names, functional schema rewritten to the attribute form, postgis suite
  gated to the `js_pg_postgis` flavor only).
- Local test results (all of the PR's own runnable suites): `adapter-pg`
  93 passed / 1 skipped (WKB, spatial-optimizer, conversion), `client-engine-runtime`
  209 passed, client `deserializeRawResults` 14 passed, generator suites
  18 + 39 passed, full root `pnpm build` green.
- With locally built engines wired in (dev-only, not committed): `prisma generate`
  works for **both** generators on a `Geometry`/`Geography` schema, and a strict
  consumer typechecks create with GeoJSON input, `near` filter,
  `distanceFrom: { point, direction }` orderBy, and `Prisma.Geometry` outputs.
- Not runnable here (needs Docker/PostGIS + local engines): the functional postgis
  suite execution and schema-engine DB suites — next environment with Docker.
- The engines gate stands: CI cannot exercise geometry schemas until
  prisma-engines#5797 (rebased: conflict-free, all suites green) is merged and a
  published engines version is pinned.

## Task Summary

| ID  | Task                                                                                                | Priority | Status  | Dependencies |
| --- | --------------------------------------------------------------------------------------------------- | -------- | ------- | ------------ |
| 001 | [Engines: rebase PR 5797, build & wire local engines](./001-engines-rebase-and-local-build.md)      | Critical | Planned | None         |
| 002 | [driver-adapter-utils: geometry types & column types](./002-driver-adapter-utils-geometry-types.md) | High     | Planned | None         |
| 003 | [adapter-pg: WKB parser/serializer (pure units)](./003-adapter-pg-wkb.md)                           | High     | Planned | 002          |
| 004 | [adapter-pg: OID discovery, conversion & lifecycle fixes](./004-adapter-pg-oid-discovery.md)        | High     | Planned | 002, 003     |
| 005 | [client-engine-runtime: protocol & plan types](./005-client-engine-runtime.md)                      | High     | Planned | 002          |
| 006 | [client runtime: serialization & exported types](./006-client-runtime.md)                           | High     | Planned | 002          |
| 007 | [Generators (JS/TS): geometry type emission](./007-generators.md)                                   | High     | Planned | 001, 006     |
| 008 | [Functional test harness & postgis suite](./008-functional-tests.md)                                | High     | Planned | 001–007      |
| 009 | [spatial-optimizer helper (PG16 workaround)](./009-spatial-optimizer.md)                            | Low      | Planned | 004          |
| 010 | [CI, docs, AGENTS.md, cleanup](./010-ci-docs-cleanup.md)                                            | Medium   | Planned | 008          |

## Recommended Execution Order

### Phase 0 — Unblock engines (serial, gates everything schema-dependent)

- **001**: Rebase engines PR onto engines main (verified conflict-free), run Rust test
  suites, build the two Wasm modules and the schema-engine binary, wire them into this
  repo via `file:` deps + `PRISMA_SCHEMA_ENGINE_BINARY`. Exit criterion: the PR's
  test schema validates and `db push` works against dockerized PostGIS.

### Phase 1 — Pure client-side units (parallelizable, no engines needed)

- **002** driver-adapter-utils types → **003** WKB (test-first: port the 5 unit-test
  files, watch them fail, port implementation).
- **005** client-engine-runtime and **006** client runtime unit layers (their Jest
  suites run without a database or schema).

### Phase 2 — Integration

- **004** adapter-pg OID discovery + lifecycle fixes (needs a real PostGIS container
  for integration coverage; unit-testable parts stay unit tests).
- **007** generators (needs task 001's DMMF to emit geometry scalars for snapshots).

### Phase 3 — End-to-end

- **008** functional harness changes + the ported postgis suite, run with
  `pnpm --filter @prisma/client test:functional:code --adapter js_pg_postgis postgis`.
- **009** spatial-optimizer helper (optional; consider dropping — see task file).
- **010** CI jobs, docs, AGENTS.md learnings, removal of drive-by changes.

## Mergeability caveat

The prisma-side work can only be **merged** once the engines PR is merged upstream and
a published engines version (`7.x.y-N.<hash>`) containing it is pinned via
`scripts/bump-engines.ts`. Until then the branch stays on `file:` engine deps and is
CI-red on engine-dependent jobs by construction. Plan reviews accordingly: land
tasks 002/003/005/006 (engine-independent, dead-code-until-engines) early if desired,
or keep everything on one feature branch mirroring the original PR.
