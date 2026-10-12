# Architecture

**Verified:** 2026-10-12 (UTC), branch `arena/11b23c70-revit-web`. Historical slice-by-slice changes are recorded in [`PROGRESS.md`](PROGRESS.md); current scope is in [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md).

## Product boundary

This is a browser BIM editor with an app-owned semantic model and native Three.js rendering. The current project file is versioned `revit-web` JSON, schema v4. It does not parse, edit, import or export RVT. Revit API and APS integration boundaries are audited separately in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).

## Architecture layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Canonical model | `src/model/types.ts`, `project.ts` | Schema v4; project, levels, display materials, types, instances, rooms and supported element fields. Lengths/elevations are integer mm. |
| Invariants and edits | `src/model/validation.ts`, `commands.ts`, `geometry.ts`, `joins.ts`, `queries.ts` | Validate the whole project, immutable domain commands, polygon/math and derived relationships. Invalid command results are rejected before history commit. |
| Serialization | `src/model/schema.ts` | Versioned JSON parse/serialize; v1/v2/v3 migrate to v4. No geometry mesh is persisted. |
| Derived geometry | `src/geometry/` | Pure functions generate supported wall/opening, floor, room, column, ceiling and hip-roof shapes from model data. |
| Derived quantities | `src/model/quantities.ts` | App-defined quantities from canonical values/geometries; not stored as authoritative inputs and not asserted to match Revit schedules. |
| Rendering and picking | `src/viewer/BimScene.ts` | Native Three.js plan/3D scene, projection, pointer selection/editing, visual style and display colors. It renders app geometry, not an Autodesk derivative. |
| History | `src/app/history.ts` | Immutable project snapshots for in-memory undo/redo. |
| Browser persistence | `src/persistence/autosave.ts` | Single-slot localStorage autosave/recovery. File open/save use versioned app JSON. |
| Command registry | `src/app/ribbon.ts` | One registry for ribbon, search launcher, shortcuts and enabled/disabled command state. |
| UI and orchestration | `src/App.tsx`, `src/ui/` | Workspace and selection/tool state; runs domain commands and commits valid results to history. |
| Tests | `src/__tests__/`, `e2e/` | Unit/integration regressions plus four Puppeteer browser suites. |

## Data and edit flow

1. UI/scene interaction proposes a domain change (e.g. wall placement or property edit).
2. `src/App.tsx` calls a command from `src/model/commands.ts` against the current `Project`.
3. The command creates an immutable candidate, increments revision where appropriate and validates references/invariants. Failure leaves the previous project intact and reports a message.
4. A successful candidate is committed to `historyReducer`; undo/redo restores snapshots.
5. React passes the new canonical `Project` to `BimScene`. `src/geometry/` derives meshes/plan graphics and `src/model/quantities.ts` derives current quantities.
6. Autosave serializes the versioned model to local storage. Explicit save writes app JSON; opening parses/migrates/validates before replacing the active project.

## Invariants and extension rules

- **Canonical units:** store all lengths/elevations as integer millimetres. Convert only for display or at an explicit, tested external adapter. Revit API internal length is feet; do not leak it into this schema.
- **Model first:** do not read mesh buffers, screen pixels, APS Viewer `dbId`s or imported geometry as authoritative app elements.
- **Command boundary:** mutations go through validated model commands. Extend schema, migration, commands, derived geometry, UI and tests together.
- **Type/instance scope:** type changes affect all instances referencing that type. The wall material selector updates the existing `WallType.materialId`; it does not change each wall independently.
- **Derived display:** normal active-level wall color follows its type's referenced project material. Selection highlighting and the below-level plan tint retain precedence. This is display color only, not a Revit physical/thermal material.
- **Persistence compatibility:** current save/open remains JSON schema v4 with v1/v2/v3 migrations. Schema migrations must preserve existing valid projects.
- **External identity:** app IDs, source RVT IDs and derivative object IDs are distinct domains. Any future external mapping belongs in an explicit integration sidecar and must not overwrite native IDs.

## Native Revit and APS integration boundary

The TypeScript/Vite frontend cannot execute Revit's .NET API. A future native RVT adapter would need a separate Revit/Automation runtime, an explicit mapping to native Revit types/parameters, transactions, migrations, error reporting and tests with real RVT fixtures. Model Derivative/Viewer can supply a read-only translated view and extracted metadata; it does not make those objects editable in this app.

No APS service, SDK, backend, credential or file upload is part of the current architecture. The optional isolated prototype proposal, account setup, pricing, token policy and no-go decision are documented in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).

## Verification snapshot

| Command | Result on this revision |
| --- | --- |
| `npm test` | 10 files, 90 tests passed. |
| `npm run typecheck` | Passed (`tsc --noEmit`). |
| `npm run build` | Passed; Vite reports the main 769.75 kB JS chunk exceeds its 500 kB advisory threshold (207.12 kB gzip). |
| `LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium APP_URL=http://localhost:5173 npm run e2e:all` | 4 browser suites, 52 checks passed; no console/page/request failures. |

The precise scenarios and sandbox prerequisites are in [`TESTING.md`](TESTING.md); dependency audit status and the bundle warning are in [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
