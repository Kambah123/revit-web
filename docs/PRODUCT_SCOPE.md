# Product scope and current feature inventory

**Reverified:** 2026-10-12 (UTC)
**Repository:** `arena/11b23c70-revit-web`, starting from `ce68041` and now including main's M4 elevation work; canonical model schema v4.
**Detailed Revit/APS comparison and recommendations:** [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).

## Product vision

A browser-based BIM editor with one authoritative, typed, serializable building model. Plans, generated elevations and 3D are projections of that model; rendering meshes are derived. The application can grow toward more model-driven views, schedules, quantities and exchange, but those future capabilities are not implied by the product name or by Autodesk file viewing.

## Status key

- **Implemented** — present in this checkout; verification is listed in [`TESTING.md`](TESTING.md).
- **Partial** — a deliberately limited version exists; the boundary is stated.
- **Not implemented** — no supported workflow or code in this repository.
- **Optional research only** — proposed integration, not implemented or required by the editor.

## A. Workspace and editing UI

| Feature | Status | Current boundary |
| --- | --- | --- |
| Ribbon, command registry, Quick Access Toolbar | Implemented | Eleven ribbon tabs; implemented commands are enabled, unsupported commands remain disabled with explanatory tooltips. |
| Contextual Modify ribbon | Implemented | Follows selection; does not imply every Revit contextual command exists. |
| Project Browser | Implemented | Levels and views; not a full Revit Browser tree or linked-project browser. |
| Properties palette | Partial | Supports the app's implemented elements and selected properties. It is not a generic Revit parameter palette. |
| Plan, 3D and elevation view tabs | Implemented | Per-level plan, one native Three.js 3D view and four read-only generated elevations. These are app UI views, not persisted Revit `View` elements. |
| View Control Bar | Partial | Scale, detail level, visual style and shadows affect the current view; these settings are not saved as view templates. |
| Status, snapping and tool hints | Implemented | Reports current app editing state; no worksharing or Revit status semantics. |
| Searchable command launcher / shortcut dialog | Implemented | `Ctrl+K` launcher and `F1` shortcut reference; disabled commands are discoverable but not executable. |
| Resizable/collapsible side panels | Implemented | Browser and Properties panels are adjustable in the current workspace. |
| Accessibility and professional polish | Partial | Keyboard commands exist; a full WCAG/accessibility and localization audit remains open. |

## B. Canonical model and architectural editing

| Feature | Status | Current boundary |
| --- | --- | --- |
| Project, levels, integer-mm units | Implemented | `src/model/types.ts`; linear values are integer millimetres relative to the project datum. |
| Walls and wall types | Partial | Straight centreline walls, basic endpoint joins, type thickness, height, level and coordinates. Not compound, curtain, stacked or fully constrained Revit walls. |
| Doors/windows and hosting | Partial | Rectangular openings hosted along straight walls; fit/overlap validation and wall-delete cascade. Not Revit family instances. |
| Floors and floor types | Partial | Explicit polygon slab extruded down from the level. No slope, floor openings, layer stack or boundary editing. |
| Rooms | Partial | Explicit polygon, name/number and derived shoelace area. Not room-bounding topology or net-of-wall Revit `Room.Area`. |
| Rectangular columns and types | Partial | Unrotated rectangular extrusion; no structural family, base/top offsets or analytical model. |
| Ceilings and types | Partial | Horizontal polygon panel at a level-relative height; no reflected ceiling plan. |
| Roofs and types | Partial | Derived hip roof on an axis-aligned rectangular footprint; no arbitrary/native Revit roof sketch. |
| Materials | Partial | Project has built-in material records with display colours. Wall type can now select a material; this is not a physical/thermal/appearance asset library and no material CRUD workflow exists. |
| Type/instance editing | Partial | Separate type and instance records for current categories; a few selectors and type edits. No generic parameter-definition/binding framework. |
| Stairs, railings, ramps, curtain walls, grids, reference planes, site/terrain | Not implemented | See [`ROADMAP.md`](ROADMAP.md); don't substitute generic boxes and call them native elements. |
| Structural or MEP systems/calculations | Not implemented | No structural/MEP connectivity, analysis, code checking or adequacy claims. |

## C. Geometry, views and quantities

| Feature | Status | Current boundary |
| --- | --- | --- |
| Native Three.js plan view | Implemented | Orthographic plan, fixed 1200 mm cut plane, one plan per level; simple symbology. |
| Native Three.js 3D view | Implemented | Derived app geometry, basic visual styles and shadows. Not Autodesk Viewer. |
| Generated elevations | Partial | North/south/east/west read-only SVG silhouettes derived from the same model geometry; flat faces, no hatching/material patterns or hidden-line depth. Not persisted Revit `View` elements. |
| Geometry regeneration | Implemented | `src/geometry/` builds from canonical data, including elevation projections; geometry is not saved as the source of truth. |
| Basic quantities | Partial | Room/floor area and wall, floor and column quantities are derived by app-specific formulae. They are not certified Revit schedules or quantity-takeoff parity. |
| RCP, sections, view ranges, dimensions, tags, sheets | Not implemented | Planned; current view tabs do not represent these native view objects. |
| Schedules, filters, formulas, material takeoffs, costing | Not implemented | Derived quantities in Properties are not schedules or a BOQ. |

## D. Commands, validation, history and persistence

| Feature | Status | Current boundary |
| --- | --- | --- |
| Immutable edit commands and validation | Implemented | Commands validate the complete app project; invalid edits leave current state unchanged. |
| Undo/redo | Implemented | In-memory snapshots; history is not saved to project JSON. |
| Autosave/recovery | Implemented | Single browser-local storage slot; no server backup or recovery history. |
| App JSON save/open | Implemented | Versioned `*.revit-web.json`; current schema v4; v1/v2/v3 inputs migrate to v4. This is the only implemented project file format. |
| Native RVT read/write | Not implemented | No Revit parser, Revit runtime, AppBundle, APS job or RVT exporter exists. |

## E. Interoperability, cloud and Autodesk integrations

| Feature | Status | Current boundary |
| --- | --- | --- |
| IFC/DXF/PDF/BCF/CSV/XLSX/GLB import/export | Not implemented | App JSON only. Any future format needs a declared subset and conversion/round-trip tests. |
| Linked models, clash detection, issues, project collaboration | Not implemented | No backend or cloud collaboration layer exists. |
| APS Model Derivative / Autodesk Viewer | Optional research only | See [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md). A translated RVT could be displayed/extracted in an isolated read-only prototype; this does not create editable app-native BIM elements. **No-go for integration now.** |
| Revit API / Revit Automation API | Not implemented | Revit API is .NET and must run in a supported Revit context. A future server-side Automation AppBundle would be a separate approved integration, not frontend TypeScript. |

## Scope boundaries

- Keep integer millimetres in the semantic model; convert only at explicit format/API boundaries.
- Keep model state authoritative, and preserve current editing, undo/redo, JSON save/open, autosave and Three.js workflows.
- Do not treat imported geometry, derivative object IDs, pixels or mesh names as editable native elements without an explicit, validated importer.
- Never imply that this application edits RVT or is Revit-compatible unless native RVT read/write is separately implemented and tested.
- No APS dependency, credentials, customer-model upload or paid Autodesk service is introduced by the current change.
- Keep clean-room implementation practices; use public API/specification documentation, not extracted proprietary code/assets.

## Definition of done

Every feature needs an end-user workflow, a canonical semantic representation, whole-model validation, derived geometry/view behavior where applicable, editing and error handling, undo/redo and save/reopen coverage, migration coverage for schema changes, tests, and documentation of remaining limits. External-format integrations additionally need explicit mapping/identity rules and fixtures. Native RVT claims additionally require a Revit/Automation runtime test; a browser render alone is insufficient.
