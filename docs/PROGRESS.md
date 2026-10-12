# Progress log

Latest state first. Every slice: intent, work, verification (real results only), commit, next task.

## Session 2026-10-12 — Phases 0–2 done (slices 2 and 3), verified

**Branch/commit at start:** `arena/63a6b55e-revit-web` @ `bd42fa0` (squash-merge of the previous session's slice 1; historical `4035013`/`ddec16a` absent from this clone — see DECISIONS D4).

**Baseline measured (before any change):**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npx vitest run` | 6 files, 46 tests pass |
| `npm run build` | pass (chunk-size warning: three.js ≈ 671 kB) |
| System Chrome | none; portable Chromium 153 via `@sparticuz/chromium` works headless with WebGL (DECISIONS D6) |
| Reference PDF/screenshot | not present in environment (DECISIONS D5) |

**Phase 0 (commit `7a558a8`):** `PRODUCT_SCOPE.md` (feature audit A–L), `REFERENCE_AUDIT.md`, `ROADMAP.md` (M0–M12 with DoD), `DECISIONS.md`, `KNOWN_LIMITATIONS.md`, `TESTING.md`, this log.

**Slice 2a (commit `4170662`): canonical model — materials, floors, rooms, columns (schema v3).**
- Polygon helpers (integer-safe shoelace area/centroid, self-intersection checks); quantities module (all values derived); commands + validation for materials, floor/column types, floors, rooms, columns; level-delete cascade; schema v3 with v2 and v1 migrations.
- Verified: `tsc` clean, 75 unit tests pass (29 new), `npm run build` passes.

**Slice 2b (commit `82eb07f`): viewer + UI for the new elements.**
- Derived element geometry; floor slabs (extruded boundaries, material colours), columns, plan-only room fills with name+area labels; polygon-chain drawing (Floor F / Room R / Enter or click-first closes; Column C); properties editors; derived quantities in the palette.
- Verified: `slice1.e2e.mjs` 17/17 and `slice2.e2e.mjs` 11/11 pass in headless Chromium; screenshots inspected (plan/3D show slabs, labels, columns; no defects found beyond grey-on-grey unselected columns noted in KNOWN_LIMITATIONS).

**Slice 3 (this commit): professional workspace (roadmap M2).**
- Command registry (`src/app/ribbon.ts`) as the single source of truth for ribbon, launcher (Ctrl+K) and shortcuts; 11 ribbon tabs (Architecture…Add-Ins) with grouped commands; implemented commands wired to real behaviour; 40+ unimplemented commands listed **disabled** with "Not implemented yet" tooltips (never fake buttons).
- Quick Access Toolbar (New/Open/Save/Undo/Redo/Search/Help), contextual "Modify | …" ribbon on selection (Delete, Zoom to selection), Project Browser (plans per level, 3D, honest empty states for Sheets/Schedules/Links, family type catalogues), multiple view tabs (open/close/switch), View Control Bar (Plan/3D, annotation scale, detail level, visual style shaded/hidden-line/wireframe, shadows — all drive real view state), status bar, shortcut map (F1), resizable/collapsible docked panels.
- Verified: `tsc` clean, 75 unit tests pass, `npm run build` passes, `slice1` 17/17, `slice2` 11/11, `slice3` 14/14 checks pass (ribbon wiring, disabled tooltips, contextual tab, browser/tabs, control bar state, launcher search+run, F1 dialog, panel collapse); screenshots `slice3-workspace.png` and `slice3-wireframe.png` inspected — workspace layout, contextual tab, properties, control bar and status bar all render and reflect live state.

**Next task:** ROADMAP M3 remainder (ceilings, simple roofs with overhang, wall material editing UI) → M4 views and documentation (elevations/sections generated from the model, dimensions, sheets, PDF/DXF export).

---

## Session (previous) — Slice 1 (merged as `bd42fa0`)

BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave; 46 unit tests + 17-step e2e (verified on that branch). See `ARCHITECTURE.md` §4 for its verification record.
