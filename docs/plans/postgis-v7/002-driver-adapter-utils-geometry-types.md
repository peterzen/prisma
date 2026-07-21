# Task 002: driver-adapter-utils — Geometry Types & Column Types

## Overview

Port the foundational type additions from the PR. Pure type-level work plus enum
constants; no runtime behavior. Everything downstream imports from here.

## Changes to port (from PR `a4acec8cb`)

- New `packages/driver-adapter-utils/src/Geometry.ts`: `Point`, `LineString`,
  `Polygon`, `Geometry` union, `InputGeometry` (loose input shape). GeoJSON-compatible
  with optional `srid`.
- `src/const.ts`: `ColumnTypeEnum` additions — scalar `Point: 16`, `LineString: 17`,
  `Polygon: 18`, `Geometry: 19`; arrays `PointArray: 79` … `GeometryArray: 82`.
  **Verify these numbers are still free on current main before porting** (they were at
  the PR's base; main has not touched `const.ts` since, but re-check at port time —
  the values are a protocol shared with the engines-side column type mapping).
- `src/types.ts`: add `'geometry'` to `ArgScalarType`.
- `src/index.ts`: export the new types (type-only export, per existing style).

## v7 adaptation notes

- Resolve the **type-union inconsistency** now rather than later: the client's
  `isGeometry` (task 006) accepts `MultiPoint`/`MultiLineString`/`MultiPolygon`/
  `GeometryCollection`, but this union and the WKB layer (task 003) only implement
  the three basic types. Decision to encode in tests: **restrict input validation to
  the three basic types initially** (reject Multi*/collections with a clear error)
  unless task 003 extends WKB support — silently accepting inputs that cannot
  round-trip is worse than rejecting them. Revisit after the engines side is checked
  (its `geojson.rs` may already validate Multi* — align both sides).
- Keep files kebab-case? The PR adds `Geometry.ts` (PascalCase). Repo convention for
  new files is kebab-case → name it `geometry.ts` and import accordingly.

## TDD steps

1. Port/write `packages/driver-adapter-utils/src/__tests__` (or `*.test.ts` next to
   source, matching the package's existing layout) type tests first:
   - `ColumnTypeEnum` uniqueness test (no duplicate numeric values) — cheap guard for
     the protocol constants.
   - `tsd`-style or compile-time assertions that `Geometry` narrows on `type` and that
     `InputGeometry` accepts readonly GeoJSON literals.
2. Watch them fail (missing exports), then port the implementation.
3. `pnpm --filter @prisma/driver-adapter-utils test` and `pnpm --filter @prisma/driver-adapter-utils build`.

## Acceptance criteria

- Package builds and tests green; no other package changes required yet (additions are
  backwards-compatible).
- Decision on Multi\*/GeometryCollection recorded in this file and reflected in tests.
