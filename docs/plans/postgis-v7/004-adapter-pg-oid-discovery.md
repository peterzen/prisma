# Task 004: adapter-pg — OID Discovery, Conversion & Lifecycle Fixes

## Overview

Port the PostGIS runtime integration in `@prisma/adapter-pg`: discovering the
database-specific `geometry`/`geography` type OIDs, registering result parsers
(EWKB hex → GeoJSON), and mapping GeoJSON args to EWKB on the way in. This task
also **fixes three design problems** in the original PR that its review already
flagged; do not port them as-is.

## Changes to port

- `src/conversion.ts`: `fieldToColumnType` fallback consults registered geometry
  OIDs before defaulting unknown user-defined OIDs to `Text`; `mapArg` handles
  geometry inputs (GeoJSON / `$type: 'Geometry'` tagged values / byte payloads) by
  serializing to EWKB.
- `src/pg.ts`: OID discovery query against `pg_type`/`pg_namespace`/`pg_extension`,
  caching, `mapGeometryTypeName`.
- `src/index.ts`: no changes here beyond task 009's export.
- Test: `src/__tests__/conversion.test.ts` additions (+29).

## Required design changes vs the original PR

1. **Initialize at `connect()`, not lazily in `queryRaw`.** The PR overrides only
   `PrismaPgAdapter.queryRaw`; queries executed through `startTransaction`'s
   `PgTransaction` or via `executeRaw` never trigger discovery, so the first
   geometry read inside a transaction returns unparsed hex. In v7,
   `PrismaPgAdapterFactory.connect()` is the natural lifecycle point: perform (or
   await) OID discovery there once per adapter instance. Write the failing test
   first: an interactive-transaction-first geometry read.
2. **No module-global mutable state.** The PR mutates the shared `customParsers`
   object (`registerGeometryParser`) and keys a global cache by connection string
   (`connectionString.split('?')[0]` with a `host:port/database` fallback that can
   collapse to `':undefined/undefined'`). OIDs are per-database; keep the OID→type
   map and parser registry **per adapter instance** (the `getTypeParser` closure in
   `queryRaw` already receives the instance's state). If cross-instance caching is
   ever needed, key it by something that cannot collide — but per-instance is enough:
   discovery is one cheap catalog query per `connect()`.
3. **Prefer typed geometry args over byte-sniffing.** If task 001 makes the query
   compiler emit `scalarType: 'geometry'` for geometry placeholders, `mapArg` can
   dispatch on the arg type alone and `tryWkbFromUtf8JsonGeometryBytes` (heuristic
   UTF-8 JSON detection inside `bytes` args) can be dropped or reduced to a
   defensive fallback with a test documenting exactly when it triggers.

## v7 adaptation notes

- `PgQueryable.queryRaw` was reformatted on main (#29650 removed a duplicated
  `values` argument) — rebase the conversion wiring onto the current shape.
- The discovery SQL uses `argTypes: [{ scalarType: 'unknown', arity: 'list' }]` —
  confirm against current `SqlQuery` type; run through `super.queryRaw` equivalent
  available at factory/connect level (a plain client query is fine and avoids
  recursion concerns entirely).
- The discovery query searches `nspname = 'public'` or the postgis extension's
  namespace; add a test fixture where PostGIS is installed in a non-public schema
  (matches the `extensions = [postgis]` datasource property behavior).
- Failure mode: PostGIS absent → cache negative result, never retry per instance,
  and geometry OIDs simply stay unmapped (columns fall back to `Text`). Test this.

## TDD steps

1. Port `conversion.test.ts` additions; add new failing tests for:
   - transaction-first geometry read (integration, dockerized PostGIS),
   - two adapters against two databases with different OIDs (isolation),
   - PostGIS-not-installed fallback,
   - `mapArg` with `'geometry'`-typed arg (pending task 001 decision) and with
     tagged `$type: 'Geometry'` values.
2. Implement per-instance discovery at `connect()`; flip tests green.
3. Run the full adapter suite: `pnpm --filter @prisma/adapter-pg test`.

## Acceptance criteria

- All new + existing adapter-pg tests green.
- No module-level mutable registries; no `queryRaw` override for initialization.
- Documented behavior when PostGIS is missing.
