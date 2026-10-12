# Testing

The canonical app model is tested at three levels: pure commands/geometry/schema tests, a TypeScript check and production bundle, and browser workflows against the native Three.js editor. User-visible changes to the model/view/UI must preserve existing project files and workflows and have regression coverage.

## Commands

```bash
npm ci
npm test              # vitest run
npm run typecheck     # tsc --noEmit
npm run build         # tsc --noEmit && vite build
npm run e2e            # browser slice 1 only
npm run e2e:all        # slice 1 + slices 2–4
```

The Puppeteer suites require a running Vite dev server and a Chrome/Chromium executable. Start `npm run dev` in one terminal; in another:

```bash
CHROME_PATH=/path/to/chrome APP_URL=http://localhost:5173 npm run e2e:all
```

Optional E2E environment variables: `APP_URL`, `CHROME_PATH`, `CHROME_ARGS`, `E2E_SHOTS` (screenshot directory). In this sandbox, packaged Chromium required its extracted NSS/NSPR runtime libraries:

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium \
  APP_URL=http://localhost:5173 npm run e2e:all
```

The four suites are intentionally run serially by `e2e:all`; they reset/use browser project state independently.

## Unit and integration tests

`npm test` runs all Vitest files under `src/__tests__/`.

| Area | File | Coverage |
| --- | --- | --- |
| Units and integer-mm parsing | `units.test.ts` | Millimetre conversion, parsing and integer invariants. |
| Geometry and projections | `geometry.test.ts`, `elementGeometry.test.ts` | Wall/opening geometry, cut plane, projection, slab elevations, hip-roof ridge, rectangle constraints. |
| Commands and validation | `commands.test.ts`, `elements.test.ts` | Commands, invalid edit rejection, host/type/material references, deletion cascades and type updates. |
| Polygons and quantities | `polygon.test.ts`, `quantities.test.ts` | Area, centroid, self-intersection and derived floor/room/wall/column quantities. |
| Schema and migration | `schema.test.ts` | Stable JSON round trips, malformed files, v1/v2/v3 migration to schema v4. |
| History | `history.test.ts` | Immutable snapshot undo/redo, revisions and limits. |
| Autosave | `autosave.test.ts` | Save/read/clear and corrupt-slot handling. |

Integration assertions exercise command → canonical model → derived geometry/quantities and JSON serialize → parse identity. No test treats a rendered mesh as the canonical model.

## Browser end-to-end tests

All suites use `puppeteer-core` with Chromium, exercise the running app UI, and fail on browser console errors, page errors or failed requests.

| Suite | Main scenarios |
| --- | --- |
| `e2e/slice1.e2e.mjs` | New project, plan orientation, chained/snapped walls, door/window hosting and refusal, property edits, material selection/render colour, undo/redo, plan/3D rendering, autosave recovery, JSON save/open, v1 migration, deletion cascade. |
| `e2e/slice2.e2e.mjs` | Floor, room and column workflows, derived properties/quantities, persistence and validation. |
| `e2e/slice3.e2e.mjs` | Ribbon/workspace, command launcher, Project Browser, view tabs/controls, panel and shortcut workflows. |
| `e2e/slice4.e2e.mjs` | Ceiling/hip-roof creation and editing, geometry/rendering, invalid roof boundary, undo/redo. |

Screenshots are written to the ignored E2E screenshot directory. Visual review is part of the acceptance check; an assertion-only pass does not prove that geometry or colors render correctly.

## Current verification record

The latest verified numbers and exact command environment are maintained in [`PROGRESS.md`](PROGRESS.md). Baseline before the wall-material change: 89 unit tests and 51 browser checks. The material update adds a command regression and browser coverage; the latest full run passes 90 unit tests and 52 browser checks. The production build has an informational Vite warning when the main JS chunk exceeds 500 kB; see [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Regression policy

- Do not remove tests to make a slice pass. Update/add tests for deliberate behavior changes.
- Keep schema migration tests for every version bump; existing v1/v2/v3 JSON must continue to migrate to v4.
- Keep native editor workflows covered when adding optional external viewing; an APS derivative is not a substitute for app-native model editing.
- Record actual commands/results and remaining environment/dependency issues in `PROGRESS.md` before completion.
