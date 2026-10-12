# Progress log

Latest state first. Every slice: intent, work, verification (real results only), commit, next task.

## Session 2026-10-12 — Phases 0–2 done; M3 modelling expanded (slices 2–4)

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
- Polygon helpers (integer-safe shoelace area/centroid, self-intersection checks); quantities module (all values derived); commands + validation; level-delete cascade; schema v3 with v2 and v1 migrations.
- Verified: `tsc` clean, 75 unit tests pass (29 new), `npm run build` passes.

**Slice 2b (commit `82eb07f`): viewer + UI for the new elements.**
- Floor slabs (extruded boundaries, material colours), columns, plan-only room fills with name+area labels; polygon-chain drawing (Floor F / Room R / Column C); properties editors; derived quantities in the palette.
- Verified: `slice1` 17/17, `slice2` 11/11 in headless Chromium; screenshots inspected.

**Slice 3 (commit `135b331`): professional workspace (roadmap M2).**
- Command registry (`src/app/ribbon.ts`) as single source of truth for ribbon, Ctrl+K launcher and shortcuts; 11 ribbon tabs; 40+ unimplemented commands disabled with "Not implemented yet" tooltips; QAT; contextual Modify ribbon; Project Browser; view tabs; View Control Bar (scale/detail/visual style/shadows — real view state); status bar; F1 shortcut map; resizable/collapsible panels.
- Verified: `slice1` 17/17, `slice2` 11/11, `slice3` 14/14; screenshots `slice3-workspace.png`, `slice3-wireframe.png` inspected.

**Slice 4 (this commit): ceilings and hip roofs with overhangs (M3 finish).**
- Schema v4: `Ceiling` (boundary + height + type), `Roof` (rectangular footprint + overhang + rise + type) with hip-roof derived geometry (ridge along the longer axis, four slopes + soffit); commands, validation, migrations (v3→v4 plus chain); Ceiling (E) and Roof (O) tools share the boundary-chain workflow; properties editors; pick priorities.
- Fixed a real geometry bug found by tests: segment intersection compared orientation values instead of signs (D12); fixed 3D visibility so the 3D view shows all levels while plan keeps the underlay rule (D11 — caught by screenshot inspection).
- Verified: `tsc` clean, 89 unit tests pass (13 new incl. hip-roof ridge derivation, rectangle rules, ceiling/roof commands, cascade), `npm run build` passes; e2e `slice1` 17/17, `slice2` 11/11, `slice3` 14/14, `slice4` 9/9 (51 checks total; roof draw/edit/refusal, ceiling draw/edit, 3D render, undo/redo); screenshot `slice4-3d.png` inspected — hip roof with ridge renders correctly.

**Next task:** M4 views and documentation — sections and elevations generated from the model (orthographic cuts of the same derived geometry), view ranges, dimensions, annotations; then sheets and PDF/DXF export. Also small: wall material assignment in properties (type material dropdown).

---

## Session (previous) — Slice 1 (merged as `bd42fa0`)

BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave; 46 unit tests + 17-step e2e (verified on that branch). See `ARCHITECTURE.md` §4 for its verification record.
