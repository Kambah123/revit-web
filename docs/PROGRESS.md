# Progress log

Latest state first. Record only executed commands/results; historical sessions follow current status.

## Session 2026-10-12 — PR #4 branch synchronization with M4 elevation work

**Branch:** `arena/11b23c70-revit-web`. The wall-material/audit commit `4843cc7` was synchronized with `origin/main` at `9a28692` (including elevation implementation commit `1ad8a1d`) so PR #4 can be merged against current `main`.

**Conflict resolution:** preserved the wall material test hook and the elevation view-state hook in `src/App.tsx`/`src/vite-env.d.ts`; retained the upstream elevation decision and added the wall-material/APS decision as D14; reconciled limitations, testing and progress docs. M4 north/south/east/west derived read-only SVG elevations and their unit/browser tests are now present on this branch. `npm run e2e:all` covers five suites.

**Current feature work on this branch:**
- Wall type material assignment uses existing `WallType.materialId`; native Three.js walls resolve the project's display color. Selected and below-level appearance precedence remains intact. Schema stays v4.
- Official Autodesk Revit API/SDK and APS audit, mapping, prioritized plan, optional isolated APS POC design and no-go recommendation are in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).
- README, scope, architecture, roadmap, testing and limitations now include current M4 elevation capabilities without implying RVT editing.

**Verification after syncing main:**

| Command | Outcome |
| --- | --- |
| `npm test` | 11 files, **95 tests passed**. |
| `npm run typecheck` | Passed (`tsc --noEmit`). |
| `npm run build` | Passed. Main JS chunk **774.50 kB** / **208.81 kB gzip**; Vite's >500 kB advisory remains. |
| `LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium APP_URL=http://localhost:5173 npm run e2e:all` | Five suites passed: slice1 18, slice2 11, slice3 14, slice4 9, slice5 11 — **63 checks total**, no console/page/request errors. |
| `npm audit --omit=dev` | `found 0 vulnerabilities`. |

The full dependency audit previously reported 13 development-tree advisories (3 moderate, 8 high, 2 critical); `npm audit --omit=dev` reported zero production dependency vulnerabilities. No dependency upgrades or APS services/credentials were added. The browser environment uses the temporary Chromium binary at `/tmp/chromium` and libraries at `/tmp/al2023/lib`.

**Next product work:** M4 sections, view ranges, annotations and later sheets/exports. APS integration remains no-go without the documented approvals.

---

## Historical session — Revit/APS audit and wall material UI

Started from `ce68041c55cb47d950bf22d084ec54b326c44e19`. Inspected the schema v4 source, validation, commands, geometry, quantities, history, persistence and UI; wrote the official Autodesk API/SDK and APS audit; added the wall type material selector, color rendering, command test, browser test, and `npm run e2e:all`. Initial verification was 90 unit tests and 52 browser checks before main's elevation suite was integrated. The source commit was `4843cc734c126e2f259d9806c3bad18c659fdd05`.

---

## Historical main session — M4 elevations (2026-10-12)

Added `src/geometry/elevation.ts` and `src/ui/ElevationView.tsx`: generated north/south/east/west projections from canonical-derived geometry, level datums, read-only view tabs and ribbon commands. Added five projection unit tests and `e2e/slice5.e2e.mjs` (11 checks). At that point, upstream main reported 94 unit tests and 62 browser checks.

---

## Earlier historical session — M0–M3 foundation and schema v4

Earlier work implemented schema v3 materials/floors/rooms/columns, the professional workspace and schema v4 ceilings/hip roofs. At that stage the model was at 89 unit tests and 51 browser checks (17/11/14/9 across slices 1–4); wall material editing and the slice-5 elevation suite were added later.

## Earlier historical session — Slice 1

Implemented the initial integer-mm BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave and project JSON. See historical decisions in [`DECISIONS.md`](DECISIONS.md).
