# Task 003: adapter-pg — WKB Parser/Serializer (Pure Units)

## Overview

Port the WKB/EWKB layer: `wkb-primitives.ts` (byte-level readers/writers),
`wkb-parser.ts` (EWKB → GeoJSON), `wkb-serializer.ts` (GeoJSON → EWKB), and the
geometry error classes. This layer has no pg or engines dependency — the ideal
TDD entry point, and the PR ships a full unit-test spec for it.

## Changes to port

- `packages/adapter-pg/src/wkb-primitives.ts` (+219)
- `packages/adapter-pg/src/wkb-parser.ts` (+55)
- `packages/adapter-pg/src/wkb-serializer.ts` (+95)
- `packages/adapter-pg/src/errors.ts` additions: `GeometryError`, `WKBParseError`,
  `InvalidGeometryError`, `SRIDError`, `BufferError`.
- Test files (port these FIRST):
  - `src/__tests__/wkb-parser.test.ts` (+180)
  - `src/__tests__/wkb-serializer.test.ts` (+183)
  - `src/__tests__/wkb-performance.test.ts` (+200)
  - `src/__tests__/test-utils.ts` (+54, shared fixtures/builders)

## v7 adaptation notes

- Error classes: current `adapter-pg/src/errors.ts` is oriented around
  `convertDriverError` → `MappedError`. The PR's geometry errors are plain `Error`
  subclasses thrown from the conversion layer. Check how they surface to users in v7:
  errors thrown inside `queryRaw` argument mapping bubble through
  `rethrowAsUserFacing()` only if shaped as `DriverAdapterError`/`MappedError`.
  Decide: either (a) wrap geometry validation failures as a `MappedError` kind (e.g.
  reuse `InvalidInputValue`) so users get a proper P2xxx instead of an opaque crash,
  or (b) keep plain errors for programmer mistakes. Encode the choice in a test that
  asserts the user-facing error for an invalid GeoJSON input through the public
  adapter API.
- Class fields: use `#field` style where the PR uses `private`/`public readonly`
  patterns that deviate from repo conventions (keep `readonly` public data members
  where they are part of the error contract).
- The performance test (`wkb-performance.test.ts`) asserts timing budgets — flaky by
  nature in CI. Port it but convert hard timing assertions into either generous
  sanity bounds or skip-in-CI benchmarks; raw perf tracking belongs to the bench
  infrastructure (`docs/benchmarking.md`), not Jest.

## TDD steps

1. Copy the four test files (adjusting imports to kebab-case module names) and run
   `pnpm --filter @prisma/adapter-pg test wkb` → all red (modules missing).
2. Port `wkb-primitives.ts`, then `wkb-parser.ts`, then `wkb-serializer.ts`, running
   the suite after each to watch sections flip green.
3. Round-trip property: add one test the PR lacks — `parse(serialize(g)) ≅ g` over a
   catalog of representative geometries (incl. 3D coordinates, SRID 0/absent,
   polygon holes, negative/extreme coordinates) to lock the two codecs together.
4. If task 002 decided to support Multi\*/GeometryCollection, extend both codecs and
   tests here; otherwise add explicit rejection tests.

## Acceptance criteria

- `pnpm --filter @prisma/adapter-pg test wkb` green.
- Round-trip property test present.
- No imports from `pg` or engines in this layer (keeps it unit-pure).
