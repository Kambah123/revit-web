# Progress log

Latest state first. Record only executed commands/results; historical sessions follow current status.

## Session 2026-10-12 — Revit/APS audit, wall material UI, and schema/docs reconciliation

**Branch/base:** `arena/11b23c70-revit-web` from `ce68041c55cb47d950bf22d084ec54b326c44e19` (`main`). No APS dependency, credentials, server or upload flow was added.

**Repository/model audit:** inspected the React/TypeScript/Vite/Three.js source, model schema v4, migrations, validation, commands, derived geometry/quantities, history, local persistence, UI, tests and existing docs. Compared app concepts with official Autodesk Revit API/SDK, Model Derivative, Viewer, OAuth, Automation and pricing documentation. See [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md) for the schema mapping, integration boundary, APS cost/setup assumptions and explicit no-go recommendation.

**Implementation (small scope):**
- Added a wall type material selector to the existing Properties panel, wired to existing `updateWallType`/`WallType.materialId`; no schema bump.
- Native Three.js walls now use the referenced project's display color in the normal active-level state; selected-wall highlight and below-level tint keep precedence.
- Added a development-only wall-color e2e hook and regression coverage for assignment, invalid material rejection, rendered color and undo/redo.
- Added `npm run e2e:all` to run the four existing browser suites and corrected slice 2's stale label: the v2 fixture migrates to schema v4, not v3.
- Reconciled README, scope, architecture, roadmap, limitations, reference inventory and decision/progress docs with the checked-out schema/UI. APS remains a proposed isolated, read-only prototype only.

**Verification:**

| Command | Outcome |
| --- | --- |
| `npm ci` | 190 packages installed. Full dev dependency audit reported 13 advisories (3 moderate, 8 high, 2 critical); `npm audit --omit=dev` reports 0 production dependency vulnerabilities. No dependency upgrades attempted. |
| `npm test` | 10 files, **90 tests passed**. |
| `npm run typecheck` | Passed (`tsc --noEmit`). |
| `npm run build` | Passed. Main JS chunk 769.75 kB / 207.12 kB gzip; Vite's >500 kB advisory warning remains. |
| `LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium APP_URL=http://localhost:5173 npm run e2e:all` | All 4 browser suites passed: slice1 18, slice2 11, slice3 14, slice4 9 — **52 checks total**, no console/page/request errors. |
| `npm audit --omit=dev` | `found 0 vulnerabilities`. |

Portable Chromium was extracted from the test-only npm package to `/tmp/chromium`; its NSS/NSPR runtime libraries are under `/tmp/al2023/lib`. The dev server used port 5173. Build and full browser checks are green; warnings/issues are recorded in [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

**Next:** M4 model-derived views/documentation (sections/elevations/RCP, view ranges, annotations, sheets and tested PDF/DXF), after scope/acceptance criteria are reviewed. Any APS prototype requires the approvals listed in `REVIT_API_AUDIT.md`; recommendation remains no-go now.

---

## Historical session 2026-10-12 — M0–M3 foundation and schema v4 (prior branch)

**Starting branch/commit:** `arena/63a6b55e-revit-web` @ `bd42fa0` (prior session; not this session's current branch).

**Baseline at that time:** `npx tsc --noEmit` passed; Vitest 46 tests passed; build passed with a Three.js chunk warning. Portable Chromium was used for browser tests (see `DECISIONS.md` D6).

**Slice 2a:** materials, floors, rooms and columns (schema v3); polygon helpers, quantities, commands/validation, level-delete cascade, v1/v2 migrations. Verified typecheck, 75 unit tests and build.

**Slice 2b:** floor slabs, columns, plan-only room fills/name/area, polygon drawing tools, properties and quantities. Browser suites reported slice1 17/17 and slice2 11/11.

**Slice 3:** professional workspace: command registry; 11 ribbon tabs; Quick Access Toolbar; contextual Modify ribbon; Project Browser; view tabs; View Control Bar; status; Ctrl+K launcher; shortcut map; resizable/collapsible panels. Browser suites reported slice1 17/17, slice2 11/11 and slice3 14/14.

**Slice 4:** schema v4 ceilings and simple hip roofs; commands, validation, v3→v4 migration, boundary-chain tools, properties, picking, and fixes for polygon intersection and 3D all-level visibility. At that time, unit suite reported 89 tests and all four browser suites reported 51 checks (slice1 17, slice2 11, slice3 14, slice4 9). The current session adds wall material UI/rendering and expands slice1 to 18 checks.

Historical next-task note (superseded): finish M3 by adding wall material assignment. Completed in the current session above.

---

## Earlier historical session — Slice 1 (merged before the prior branch)

Implemented the initial BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave and project JSON. The prior session started from a squash-merged representation of this work; see historical decisions in [`DECISIONS.md`](DECISIONS.md).
