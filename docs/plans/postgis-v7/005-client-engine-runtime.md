# Task 005: client-engine-runtime — Protocol & Plan Types

## Overview

Port the geometry pass-through in the TypeScript query execution runtime: JSON
protocol tagged values, data mapper, SQL result serialization, and the query-plan
type contract with the Wasm query compiler.

## Changes to port

- `src/json-protocol.ts`: `GeometryTaggedValue` (`{ $type: 'Geometry', value }`) in
  input/output unions and `JsOutputValue`; `normalizeTaggedValue` /
  `deserializeTaggedValue` cases. The PR also fixes `assertNever(value, ...)` →
  `assertNever($type, ...)` in both functions — keep that (it is required for the
  unions to stay exhaustive-checkable).
- `src/interpreter/data-mapper.ts`: `case 'geometry'` in `mapValue` (identity).
- `src/interpreter/serialize-sql.ts`: map the 8 new `ColumnTypeEnum` members to
  `'geometry'` / `'geometry-array'` protocol strings.
- `src/query-plan.ts`: `FieldScalarType` gains
  `{ type: 'geometry'; geometryType: 'point' | 'linestring' | 'polygon' | 'geometry' }`.
  **This is a protocol contract with the query compiler** — cross-check the exact
  shape against the adapted engines build from task 001 (field names must match the
  serde output of the Rust `data_mapper.rs` changes).
- Tests to port first: `src/interpreter/serialize-sql.test.ts` and
  `src/json-protocol.test.ts` additions.
- `packages/json-protocol/src/index.ts`: mirror `GeometryTaggedValue` additions
  (this small package is the protocol's canonical type home; keep both in sync).

## v7 adaptation notes

- None of these files changed on main since the PR's merge base — the port is
  textual. The risk is entirely in the **cross-boundary contracts**:
  1. `query-plan.ts` ↔ Wasm query compiler serde output (task 001).
  2. `serialize-sql.ts` output strings ↔ `packages/query-plan-executor` /
     Accelerate protocol: QPE has **no geometry handling in the PR**. Grep confirmed
     no geometry references exist in `packages/query-plan-executor` today. Decide and
     document: either add geometry support to QPE result serialization in this task
     (preferred if trivial — it reuses `serialize-sql`), or explicitly leave remote
     execution unsupported and ensure functional tests opt out (task 008). An
     unknown `'geometry'` column type string reaching an old QPE deployment must
     fail loudly, not corrupt data.
- Run `pnpm --filter @prisma/client-engine-runtime test` (no DB needed).

## TDD steps

1. Port the two test files' additions → red (missing enum members / cases).
2. Port implementation → green; the `assertNever` exhaustiveness checks will drive
   out every missed switch case at compile time.
3. Add one new test: deserializing a query-plan JSON fixture (taken verbatim from an
   engines snapshot produced in task 001) containing a geometry field scalar type —
   locks the Rust↔TS contract with a real artifact instead of a hand-written shape.

## Acceptance criteria

- `pnpm --filter @prisma/client-engine-runtime test` green.
- Engines-snapshot-derived fixture test present.
- QPE decision recorded here and reflected in task 008's opt-out list.
