# Roadmap

Date: 2026-10-12. Status of each milestone is kept current in `PROGRESS.md`. Feature audit: `PRODUCT_SCOPE.md`. Decisions: `DECISIONS.md`.

Milestones are ordered so that nothing advanced is built on an unstable foundation. Each milestone is split into independently testable slices; every slice ends with type-check + unit tests + production build, and browser e2e when a user-visible workflow changes.

## Dependency graph

```
M0 audit ──► M1 BIM core ──► M2 workspace ──► M3 arch modelling ──► M4 views/docs ──► M5 schedules/exports
                    │              │                  │
                    └──────────────┴──────────────────┴──► M6 advanced arch (families, phases, stairs…)
M1 also gates M7 structural, M8 MEP, M9 open BIM, M10 rendering, M11 collaboration, M12 hardening
```

## Milestones

### M0 — Audit and planning (done this session)
- Reference audit (`REFERENCE_AUDIT.md`), feature inventory (`PRODUCT_SCOPE.md`), baseline run, architecture and roadmap docs.
- **DoD:** docs exist and match the actual repository; baseline results recorded honestly.

### M1 — BIM core (done: slice 1)
- Canonical model in integer mm, schema versioning + migrations, commands with whole-project validation, hosted openings, derived geometry, undo/redo, autosave/recovery, save/reopen.
- **DoD (met):** unit tests over model/geometry/history/schema/autosave/units; e2e covers draw/edit/undo/save/reopen/migration.

### M2 — Professional workspace
- Ribbon tabs (Architecture, Structure, Steel, Insert, Annotate, Analyze, Massing & Site, Collaborate, View, Manage, Add-Ins) with real commands enabled and unsupported tools disabled with tooltips.
- Quick Access Toolbar; contextual ribbon for selection; Project Browser (levels, views); Properties palette upgraded (type selector, view properties); multiple view tabs; View Control Bar (scale, visual style, detail level placeholders wired to actual view state); status bar (snap, selection count, tool hint); searchable command launcher (Ctrl+K); resizable/collapsible panels; shortcut map dialog.
- **DoD:** every enabled ribbon button performs a working command; disabled buttons show why; browser tests drive the ribbon; no console errors; screenshots inspected.

### M3 — Architectural modelling
- Materials library (identity + appearance) assigned to types. Floors (type + boundary sketch + thickness) and ceilings. Rooms (boundary, name/number, computed area) with placement and properties. Rectangular columns. Simple roofs with overhang offset. Quantities computed from geometry (room area, floor area/perimeter/volume, wall net volume, column volume) shown in properties.
- **DoD:** each element kind has commands, validation, derived geometry in plan and 3D, properties editing, undo/redo, persistence across save/reopen + migration from schema v2, unit tests for geometry/quantities, e2e drawing workflow, documented limitations (e.g. rectangular rooms only until sketch tools generalise).

### M4 — Views and documentation
- Elevation and section views generated from model geometry + view rules (not screenshots); view ranges; RCP; dimension and text annotation; sheets with title blocks and viewports; correctly scaled PDF export; DXF export of 2D content.
- **DoD:** plan/elevation/section/3D agree on the same model; annotations derive from model positions; PDF at real-world scale verified by measurement test; DXF opens in a parser test.

### M5 — Schedules, quantities, costing
- Door/window/room/element schedules with fields, filters, sorting, grouping, calculated values; material take-offs; BOQ with price/waste configuration; CSV/XLSX export; schedules auto-update from the model; grids and datum tools; view templates/visibility filters.
- **DoD:** every quantity traces to model data (tests assert against hand-computed values); exports round-trip.

### M6 — Advanced architecture
- Parametric family framework generalisation (family documents, parameters/constraints, placement hosts), stair/railing/ramp tools, curtain walls, improved wall joins (T-joins, miters), layered wall assemblies, site/terrain, phases, design options.
- **DoD:** family regeneration is validated; joins tested; phase filters affect views/schedules.

### M7 — Structural BIM
- Foundations, structural columns/beams/bracing, structural floors/openings, analytical model representation, loads/BCs, bar schedules; exchange with analysis tools as feasible. **No code-compliance claims.**
- **DoD:** structural elements share the canonical model; analytical representation derived; views/schedules update.

### M8 — MEP BIM
- Duct/pipe/conduit/cable-tray routing with connectors and system connectivity, fixtures/equipment, slopes, schedules; calculation engines kept separate from display geometry and clearly labelled as engineering estimates until validated.
- **DoD:** connectivity graph validated; routing edits revalidate systems; schedules derive from model.

### M9 — Open BIM and coordination
- IFC export (tested schema subset) and import; BCF issues; linked models; clash/clearance detection; duplicate/disconnected element checks; revision comparison; issue tracker UI.
- **DoD:** exported IFC validated against the schema and round-trip tests; clash detection tested on known-intersecting fixtures.

### M10 — Rendering and presentation
- Material textures/appearance, shadows, sun/location, camera views, walkthroughs, exploded/section 3D, image export, lightweight GLB sharing.
- **DoD:** rendering state separate from model; image export reproducible.

### M11 — Collaboration and scale
- Only after a backend audit and user approval for consequential infrastructure: accounts, projects/permissions, cloud save, version history, worksharing-style locks, conflicts, audit logs.
- **DoD:** defined with the user before implementation (approval-gated per master prompt §12).

### M12 — Professional hardening
- Accessibility pass, security review, large-project performance budgets, interoperability test matrix, user documentation, extension API.
- **DoD:** test matrix green; performance budgets documented and measured.

## Testing strategy (summary; details in `TESTING.md`)

- Unit: geometry, units, joins, openings fit, polygon area, quantities, commands/validation, schema migrations, history.
- Integration: commands → derived geometry; views agree; schedules react; save/reopen; autosave recovery.
- Browser e2e (puppeteer-core + Chromium): create/edit/undo/save/reopen workflows, ribbon/panels, exports; console/network error detection; screenshot inspection.
- Regression suite grows with each slice; failures block commits.

## Risks

| Risk | Mitigation |
| --- | --- |
| Geometry kernel needs (boolean ops, complex joins) exceed box/prism representations | Keep `src/geometry/` pure and replaceable; evaluate Open CASCADE/WASM only when a concrete feature demands it (DECISIONS). |
| Scope explosion across 12 milestones | Slice discipline: each slice small, tested, committable; PROGRESS.md updated every slice. |
| View derivation drift (plan vs 3D vs schedules) | Single derived-geometry source; integration tests assert agreement. |
| File-format complexity (IFC/DXF/PDF) | Spec-based implementations, fixture files, round-trip tests; never claim full RVT support. |
