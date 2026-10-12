# Roadmap

**Reverified:** 2026-10-12 (UTC). Current implementation status is summarized in [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md); Autodesk API findings and integration recommendation are in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md). Milestone history and command outcomes are in [`PROGRESS.md`](PROGRESS.md).

Milestones are ordered so new work is built on a stable canonical model. Every slice adds tests; every user-visible slice runs the full browser regression suite (`npm run e2e:all`) in addition to typecheck, unit tests and production build.

## Dependency graph

```text
M0 audit ──► M1 BIM core ──► M2 workspace ──► M3 arch modelling ──► M4 views/docs ──► M5 schedules/exports
                    │              │                  │
                    └──────────────┴──────────────────┴──► M6 advanced arch (families, phases, stairs…)
M1 also gates M7 structural, M8 MEP, M9 open BIM, M10 rendering, M11 collaboration, M12 hardening
```

## Milestones

### M0 — Audit and planning (complete)

- Repository inventory, current feature scope, test baseline, architecture, decisions, limitations and roadmap.
- Revit API/SDK and APS references audited in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md); local app JSON and native Three.js editing remain distinct from RVT and derivative viewing.
- **DoD:** documents describe actual source/schema state; unsupported file formats and external APIs are not presented as implemented.

### M1 — BIM core (complete)

- Canonical model, integer millimetres, versioned JSON, migration/validation, typed edit commands, hosted openings, derived geometry, history, autosave/recovery, save/open.
- Current schema is v4; v1/v2/v3 projects migrate to v4.
- **DoD:** unit/integration tests plus core browser workflows cover editing, invalid placements, undo/redo, persistence, migration and cascades.

### M2 — Professional workspace (complete)

- Eleven-tab ribbon and command registry; implemented commands enabled and unsupported commands explicitly disabled; Quick Access Toolbar; contextual Modify ribbon; Project Browser; per-level plan and 3D view tabs; view control bar; status; `Ctrl+K` command launcher; shortcut dialog; resizable/collapsible panels.
- **DoD:** implemented workspace commands are wired to the app; browser workflow and no-console/network-error checks pass. This does not mean all Revit ribbon commands exist.

### M3 — Architectural modelling (complete for the documented subset)

- Levels, materials, wall types/walls, hosted door/window openings, polygon floors, explicit polygon rooms, rectangular columns, ceilings, simple hip roofs and derived quantities.
- Wall properties now expose type-level material assignment and native 3D color rendering. Materials remain display colors, not physical/thermal Revit material assets.
- **DoD:** supported model elements have commands/validation, derived geometry and properties, undo/redo and JSON compatibility. Boundaries and limitations are documented; v1/v2/v3 migration to schema v4 remains covered.

### M4 — Views and documentation (next)

- Persisted, model-derived elevation/section views and view ranges; reflected ceiling plans; dimensions and text annotations; sheets/title blocks/viewports; measured-scale PDF and scoped 2D DXF output.
- **DoD:** plan/elevation/section/3D agree from the same model; annotations are model-positioned; PDF scale is verified by measurement; DXF fixtures parse and preserve supported entities.

### M5 — Schedules, quantities and costing

- Door/window/room/element schedules with typed fields, filters/sorting/grouping and calculated values; material take-offs; configurable BOQ cost/waste; CSV/XLSX output; grids, datum tools, view templates and visibility filters.
- **DoD:** each quantity traces to canonical model data and hand-calculated fixtures; schedule updates and exports are regression-tested.

### M6 — Advanced architecture and semantic foundation

- General parameter definitions/bindings and stable external identity; family/type/instance/hosting framework; richer wall assemblies/joins; stairs/railings/ramps, curtain walls, terrain, phases and design options.
- Schema evolution must preserve integer-mm values and migrate existing files before any new required invariant is enforced.
- **DoD:** placement/regeneration and constraints are validated, joins have known-geometry tests, and phase rules affect views/schedules consistently.

### M7 — Structural BIM

- Structural foundations, framing/bracing, structural floors/openings, analytical representation and load concepts; validated exchange where feasible. No code-compliance or structural adequacy claims without independently verified calculations.
- **DoD:** explicit structural semantics are distinct from appearance meshes; views and schedules derive from the model.

### M8 — MEP BIM

- Duct/pipe/conduit/cable tray with connectors, networks and systems; fixtures/equipment and slopes; calculation engines remain separately tested and labelled as unverified engineering estimates until validated.
- **DoD:** connectivity is validated; routing edits revalidate systems; quantities/schedules are model-derived.

### M9 — Open BIM and coordination

- IFC import/export for a declared subset; BCF issues; linked models; clash/clearance checks; duplicate/disconnected element checks; revision comparison and issue UI.
- **DoD:** schema validation and round-trip tests; known clash fixtures; unmatched external objects remain explicitly external/unmapped.

### M10 — Rendering and presentation

- Material appearance/textures, shadows/sun/location, camera/walkthrough, sectioned/exploded 3D, image export and lightweight GLB sharing.
- **DoD:** view/render state is separate from semantic model; output is reproducible and documented.

### M11 — Collaboration and scale (approval-gated)

- Only after an architecture/security audit and explicit approval for infrastructure: accounts, projects/permissions, cloud save, version history, concurrent editing/locking, conflicts and audit trail.
- **DoD:** define privacy, ownership, operational and cost requirements with the user before implementation.

### M12 — Professional hardening

- Accessibility, security, performance budgets, large-project tests, interoperability matrix, user documentation and a reviewed extension API.
- **DoD:** measurable budgets and a documented test matrix pass.

## Optional APS research (not a milestone dependency)

A read-only APS Model Derivative/Viewer experiment is a separately deployable, opt-in route; it does not replace the native editor or create app-native editable BIM elements. **Current recommendation: no-go for integration** until a sample RVT, upload rights/retention policy, server-side credentials, browser token policy and hard cost cap are approved. Revit Automation would be a separate later evaluation only if native RVT authoring becomes an approved requirement. See [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md) for the isolated prototype design, setup, current published pricing and limitations.

## Testing strategy

- Unit/integration: integer-mm units, schema/migrations, commands/validation, geometry/quantities, history and autosave.
- Browser: `npm run e2e` for core workflow; `npm run e2e:all` for all four suites against a running dev server and Chromium.
- Verify no console/page/request errors and visually inspect screenshots for geometry/color defects.
- Every schema change has migration coverage; every file-format adapter has positive/negative fixtures and identity rules.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Geometry kernel demands exceed current prism/polygon representation | Keep `src/geometry/` pure/replaceable; introduce heavier kernels only for a defined tested feature. |
| Revit concepts are mistaken for equivalent current app concepts | Maintain explicit schema mapping and limitations; use stable type/spec identities at an adapter boundary. |
| View/schedule results drift from canonical model | Derive from one semantic source and add cross-view/quantity integration fixtures. |
| File-format complexity | Implement declared standards subsets with fixtures and honest import/export boundaries; do not claim RVT support from translated viewing. |
| Scope or cloud cost grows without approval | Keep APS/collaboration optional, isolated and approval-gated; credentials remain server-side. |
