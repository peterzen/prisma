# Task 006: client runtime — Serialization & Exported Types

## Overview

Port the `@prisma/client` runtime pieces: GeoJSON detection when serializing query
arguments, the exported `Geometry` type surface, and raw-result deserialization for
typedSQL.

## Changes to port

- `src/runtime/core/jsonProtocol/serializeJsonQuery.ts`: `isGeometry()` structural
  check + `$type: 'Geometry'` tagging in `serializeArgumentsValue`.
- `src/runtime/core/types/exported/Geometry.ts` (new re-export from
  `@prisma/driver-adapter-utils`) + `exported/index.ts` entry.
- `src/runtime/utils/deserializeRawResults.ts`: `'geometry'`/`'geometry-array'`
  cases (identity).
- `packages/generator/src/typedSql.ts`: `QueryIntrospectionBuiltinType` gains
  `'geometry'` / `'geometry-array'`.
- Tests to port: `src/__tests__/deserializeRawResults.test.ts` additions.

## v7 adaptation notes / risks

- **`isGeometry` ordering risk**: `serializeArgumentsValue` applies the structural
  check to _every_ object argument. Any user object with `{ type: string,
coordinates: array }` — e.g. a JSON column value that happens to be GeoJSON —
  would be tagged `$type: 'Geometry'` even when the target field is `Json`. The PR
  places the check after Date/Uint8Array/BigInt/Decimal but before object-enum and
  plain-object handling. Write regression tests first:
  - storing a GeoJSON-shaped object into a `Json` field must survive unchanged
    (this may require the engines side to accept/unwrap the tag for JSON fields —
    verify against the adapted engines from task 001 and align; if the engines
    protocol adapter only interprets the tag for geometry fields, document that),
  - `isGeometry` accepts only shapes that the engines `geojson.rs` accepts
    (mirror its validation matrix: type strings, srid type, GeometryCollection).
- Align the accepted-type set with the task 002 decision (Multi\*/collections in or
  out) — currently the client accepts more than the WKB layer implements.
- `default-index.d.ts` eslint-comment removal from the PR: drop (drive-by).
- Functional generated clients import the built runtime bundle
  (`packages/client/runtime/client.js`) — rebuild (`pnpm --filter @prisma/client build`
  or root `pnpm build`) before functional tests exercise these changes.

## TDD steps

1. Port/extend `serializeJsonQuery` unit tests (the package has existing coverage in
   `src/__tests__` for serialization — follow its fixture style): geometry tagging,
   JSON-field non-tagging, invalid-shape pass-through. Red first.
2. Port `deserializeRawResults.test.ts` additions → red → port implementation.
3. `pnpm --filter @prisma/client test <patterns>` for the touched unit suites (avoid
   the full legacy suite).

## Acceptance criteria

- Unit suites green; `Prisma.Geometry`/`Prisma.InputGeometry` types exported from the
  runtime and visible in a generated client (verified properly in task 007/008).
- The JSON-field collision behavior is decided, tested, and documented here.
