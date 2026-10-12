# revit-web architecture and plan

## 1. Audit of commit ddec16a (baseline)

Repository state: branch `arena/6a8161ff-revit-web`, commits `b21fe69` (initial) and `ddec16a` (scaffold). The working tree was clean before this work.

Baseline results (measured before changes):

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | passes |
| `npx vitest run` | 11 tests pass (model only) |
| `npx vite build` | passes; chunk-size warning (three.js bundle ~0.5 MB) |
| Headless browser smoke test | page loads, no console errors, one WebGL canvas |

### What works in ddec16a

- Create project, add/rename/delete levels, set level elevation.
- Draw walls in the 3D view by clicking the ground plane with snapping and chaining.
- Select a wall (click) and edit its level, height, thickness, start and end.
- Delete a wall; save/open project JSON with validation.

### What is missing or broken

- **No plan view.** Walls are drawn by raycasting onto the ground in a perspective view. There is no orthographic 2D plan, so precise drawing is awkward. The baseline screenshot shows the 3D view is almost empty.
- **No undo/redo, no autosave.** Every edit is final.
- **No hosted elements.** Doors and windows do not exist.
- **Walls are independent boxes.** Corners do not join; there is no wall type, no layers, and no join model.
- **Floats in the model.** Lengths are stored in meters as floats, so repeated edits can accumulate error.
- **Unstable identity.** IDs are random per session; no schema version beyond `version: 1`.
- **No invariants enforced by commands.** Edits mutate state directly in React handlers and only validate inputs locally.
- **Not implemented at all:** grids, reference planes, floors, roofs, ceilings, columns, stairs, rooms, families, views, sections, elevations, sheets, schedules, exports, IFC, structural/MEP, collaboration.
- **Tests cover the model only.** No UI, geometry, or end-to-end tests.

### Risks

- Changing the schema (meters -> integer millimetres) requires a migration for files saved in the v1 format. A migration is included and tested.
- Three.js rendering is the only geometry path. For walls with openings, straight boxes are sufficient; general solids (Open CASCADE/WASM) are deferred until a feature needs them.

## 2. Architecture (target)

| Layer | Location | Responsibility |
| --- | --- | --- |
| Canonical model | `src/model/` | Typed entities, integer-mm units, schema v3, validation, commands |
| Derived topology | `src/model/joins.ts`, `src/model/queries.ts` | Wall joins and lookups, computed from the model, never stored |
| Derived geometry | `src/geometry/` | Wall solids with openings cut; polygon helpers; floor/column/room geometry; pure functions |
| Derived quantities | `src/model/quantities.ts` | Areas, volumes, counts — always computed, never stored |
| Rendering | `src/viewer/` | Three.js scene: plan and 3D views of derived geometry, visual styles, shadows, labels |
| Editing state | `src/app/history.ts` | Undo/redo over immutable project snapshots |
| Persistence | `src/model/schema.ts`, `src/persistence/` | JSON save/open with v1/v2 migrations; autosave with recovery |
| Command registry | `src/app/ribbon.ts` | Single source of truth for ribbon, command launcher and shortcuts; unimplemented commands declared as disabled |
| UI | `src/App.tsx`, `src/ui/` | QAT, ribbon, view tabs, project browser, properties, view control bar, status bar, launcher; all edits via model commands |

Principles:

- Lengths are **integer millimetres** everywhere in the model. Display converts; input is parsed into integers.
- Every model edit goes through a command in `src/model/commands.ts`, which validates the whole project before returning. Invalid edits throw and leave the state unchanged.
- Geometry and render meshes are derived. They are never saved and never treated as authoritative.
- Undo/redo stores whole project snapshots. Snapshots are immutable, so restoring one is exact.

## 3. Implementation plan

Slices, in order. Each slice ends with tests and an end-to-end run.

1. **Slice 1 (done):** schema v2 in mm with migration; integer-mm validation; levels; connected walls with derived joins; wall types; hosted doors and windows that cut wall openings; plan and 3D views driven by the same derived geometry; properties; undo/redo; autosave and recovery; save/reopen; end-to-end browser test.
2. **Slice 2 (done):** schema v3 — materials assigned to types; floors (boundary sketches), rooms (computed areas), columns; derived quantities; polygon drawing tools; properties editors.
3. **Slice 3 (done):** professional workspace — ribbon with 11 tabs and a command registry, QAT, contextual ribbon, project browser, view tabs, view control bar (scale/detail/visual style/shadows), status bar, command launcher (Ctrl+K), shortcut map, resizable/collapsible panels.
4. **Slice 4 (next):** ceilings and simple roofs with overhang (M3 finish); wall material assignment UI.
5. **Slice 5:** sections and elevations generated from the model (orthographic cuts of the same derived geometry), view ranges, dimensions, and annotations (M4).
6. **Slice 6:** sheets, title blocks, PDF export at scale, DXF export of 2D entities, schedules from model data (M4/M5).
7. **Later, requires approval:** IFC import/export with a tested schema subset, structural and MEP systems, cloud persistence, and collaboration.

## 4. Slice 1 status

Verified by the commands below. Results are from the final run on this commit.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | passes |
| `npm test` (vitest) | 46 unit tests pass across model, commands, schema migration, geometry invariants, joins, history, autosave, units |
| `npm run build` | passes |
| `npm run e2e` (headless Chromium, dev server) | 17 checks pass, including no console errors, page errors or failed requests |

What the end-to-end test covers: draw three chained walls; snap a wall to an existing endpoint and undo it; place a door and a window in the correct walls; refuse a door outside its wall with a message; select and edit a door offset and a wall height in properties; undo and redo via buttons and shortcuts; render the 3D view; plan orientation matches the model; autosave recovery after reload; save to file, New, reopen, and check identities are preserved; migrate a version 1 file; delete a wall and its openings, then undo.

Visual checks were made from screenshots taken by the test. They caught a mirrored plan (fixed) and doors hidden in plan (fixed by a 1200 mm cut plane).

## 5. Known limitations after slice 1

- Wall joins are detected only where endpoints coincide exactly. T-joins and mitered corners at non-right angles are rendered by overlapping boxes, not mitered.
- Openings are rectangular and only in straight walls.
- Wall height is a single value; no base or top offsets, and no layered (compound) wall types.
- Undo history is in memory and is not saved with the project.
- Autosave holds one slot in local storage.
- Plan symbology is basic: windows show as solid sill walls with a thin glass line; there are no door swings, no break lines, and no hatching.
- Walls are only joined where endpoints coincide exactly. T-joins are not mitered.
- Wall snapping to an existing endpoint uses a 150 mm radius; there is no general object snapping yet.
- There is no temporary dimension while drawing (the length appears only in properties after the wall is placed).
