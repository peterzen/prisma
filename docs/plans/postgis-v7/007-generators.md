# Task 007: Generators (JS/TS) — Geometry Type Emission

## Overview

Port the generated-code changes in both `client-generator-js` and
`client-generator-ts`: geometry input/output field types, select/omit inclusion,
namespace re-exports, and typedSQL mappings. Requires the task 001 engines build so
DMMF actually contains geometry scalars.

## Changes to port (mirrored in both generators)

- `TSClient/Input.ts`: geometry scalar input refs → `InputGeometry` /
  `runtime.InputGeometry`.
- `TSClient/Output.ts`: geometry scalar outputs → `Prisma.Geometry` /
  `runtime.Geometry`.
- `TSClient/SelectIncludeOmit.ts`: include geometry scalars in select/omit unions via
  `isGeometryScalarTypeRef`.
- `TSClient/common.ts`: export `Geometry`, `InputGeometry` (+ `Point`, `LineString`,
  `Polygon` in the JS generator's namespace).
- `typedSql/mapTypes.ts`: `geometry` / `geometry-array` mappings.
- `utils/common.ts`: `isGeometryScalarTypeRef`, `GraphQLScalarToJSTypeTable.Geometry`,
  `JSOutputTypeToInputType.Geometry`, `needNamespace` additions (JS generator).

## v7 adaptation notes / risks

- **Merge drift**: main's `common.ts` gained `PrismaClientConstructorArgs` (#29592)
  and the `XOR ... & object` fix (#29735) since the PR's base. Auto-merge handles it;
  regenerate all generator snapshots afterwards.
- **DMMF detection is string sniffing**: `ref.location === 'scalar' &&
ref.type.startsWith('geometry(')`. Verify against task 001's DMMF exactly what the
  scalar type name is (`geometry(Point, 4326)`? lowercase? spacing?) and write a
  DMMF-fixture test that pins it. Centralize the check — the PR defines
  `isGeometryScalarTypeRef` in `utils/common.ts` but still inlines the prefix check
  in `Input.ts`/`Output.ts`; use the helper everywhere so the format is asserted in
  one place.
- The TS generator emits four `PrismaClientOptions` types and keeps `@ts-nocheck` in
  `prismaNamespace.ts` — union-order rules from `AGENTS.md` are unaffected by this
  task, but regenerated snapshots will include the geometry exports; review the
  snapshot diff for accidental churn.
- Check `packages/client-generator-registry` needs nothing (it manages generators,
  not type emission).

## TDD steps

1. Generate DMMF for the postgis test schema with the task 001 engines build; commit
   it as a test fixture in both generator packages.
2. Write failing snapshot tests: generated model types for a schema with
   `Geometry(Point, 4326)?` field — expect `position: Prisma.Geometry | null` in
   outputs, `InputGeometry` in create/update inputs, field present in
   `ModelSelect`/`ModelOmit`.
3. Port the implementation; snapshots green.
4. Type-level check: compile a small consumer (`tsd` or the generators' existing
   type-test harness) asserting `Prisma.Geometry` narrows by `type` and that create
   inputs accept a GeoJSON literal.
5. `pnpm --filter @prisma/client-generator-js --filter @prisma/client-generator-ts test`.

## Acceptance criteria

- Both generator test suites green, snapshots regenerated deliberately.
- Geometry DMMF type-name format pinned by a fixture test in one shared helper path.
