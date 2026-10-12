# Product scope and feature inventory

Date: 2026-10-12. Baseline: branch `arena/63a6b55e-revit-web` at `bd42fa0` (slice 1 merged to main).

## 1. Product vision

A browser-based Building Information Modeling platform in which architectural, structural and MEP elements share one canonical, typed, serializable building model. The same model drives floor plans, reflected ceiling plans, 3D views, elevations, sections, schedules, sheets and exports; edits propagate consistently through every derived view. Rendered meshes are never the source of truth.

Users should be able to design a building, inspect it in 2D and 3D, edit parameters, generate views and documentation, calculate quantities, coordinate disciplines, and exchange data with other software (DXF, PDF, IFC, BCF, CSV/XLSX, GLB).

## 2. Feature inventory audit (master prompt §6)

Legend: **[V]** implemented and verified in this repository today · **[P]** partial · **[N]** not implemented (planned) · **[B]** blocked · **[O]** intentionally out of scope for now.

### A. Professional workspace and UI

| Feature | Status | Evidence / gap |
| --- | --- | --- |
| Ribbon tabs and grouped commands | [N] | Single flat toolbar exists (`src/App.tsx`); planned in roadmap milestone M2. |
| Quick Access Toolbar | [N] | Planned M2. |
| Contextual ribbon commands | [N] | Planned M2. |
| Project Browser | [N] | Only a levels panel (`src/ui/LevelsPanel.tsx`); planned M2. |
| Properties palette | [P] | `src/ui/PropertiesPanel.tsx` edits walls/openings; lacks type selector and other categories; M2/M3. |
| Multiple document/view tabs | [N] | One viewport; planned M2. |
| 2D and 3D workspace | [P] | Plan (orthographic cut) + 3D (orbit) of the same derived geometry; view system minimal. |
| View Control Bar | [N] | Planned M2/M4. |
| Status bar | [P] | Status message area only; planned M2. |
| Tooltips and keyboard shortcuts | [P] | Shortcuts S/W/D/N, Esc, Delete, Ctrl+Z/Y documented in README; tooltips are native `title`. |
| Searchable command launcher | [N] | Planned M2. |
| Resizable/collapsible panels | [N] | Panels fixed; planned M2. |
| Selection feedback and contextual controls | [P] | Highlight material + properties; no contextual ribbon yet. |
| Undo, redo, save, open, recovery | [V] | `src/app/history.ts`, `src/model/schema.ts`, `src/persistence/autosave.ts`; e2e verified. |
| Project units and settings dialogs | [P] | Units fixed to mm (`src/model/units.ts`); no dialogs; planned M2/M4. |
| Empty states and validation messages | [P] | Message area + command errors; needs polish. |

### B. Architectural modelling

| Feature | Status | Evidence / gap |
| --- | --- | --- |
| Levels and grids | [P] | Levels [V]; grids [N] (M3/M5). |
| Walls, wall types, layered assemblies, joins | [P] | Walls, wall types, endpoint joins [V]; no layered assemblies, joins only at exact endpoints (M6). |
| Doors, windows, hosted openings | [V] | Hosted in walls, validated fit, cascade delete; e2e verified. |
| Floors and ceilings | [N] | M3. |
| Roofs and overhangs | [N] | M3. |
| Columns, beams, structural framing | [N] | Columns M3; framing M7. |
| Stairs, railings, ramps | [N] | M6. |
| Curtain walls and facades | [N] | M6. |
| Rooms, room boundaries, areas | [N] | M3. |
| Materials and finishes | [N] | M3. |
| Building components / reusable families | [P] | Wall types and opening types act as simple families; general family system M6. |
| Constraints, alignments, reference planes | [P] | Referential validation [V]; explicit constraints/reference planes M5/M6. |
| Site boundaries and terrain | [N] | M6. |
| Phases (existing/demolished/new) | [N] | M6. |
| Design options | [N] | M6. |

### C. Parametric object and family system

| Feature | Status | Notes |
| --- | --- | --- |
| Element types and instances | [P] | WallType, OpeningType [V]; Floor/Column types planned with their elements. |
| Type and instance parameters | [P] | Basic parameters [V]; parameter framework generalisation M6. |
| Stable object identities | [V] | Deterministic ids preserved across save/reopen (e2e verified). |
| Hosted components | [V] | Doors/windows hosted in walls with lifetime cascade. |
| Constraints and reference relationships | [P] | Host + fit validation [V]. |
| Family placement and parameter editing | [P] | Opening placement by offset [V]. |
| Reusable project libraries | [N] | M6. |
| Validated geometry regeneration | [V] | Derived geometry recomputed from model on every change (`src/geometry/`). |
| Parameter-driven updates | [V] | Type edit updates all instances (e2e/unit verified). |
| Safe handling of invalid/deleted dependencies | [V] | Commands refuse invalid states; cascades documented (deleteLevel/deleteWall). |

### D. 2D drafting and views

| Feature | Status | Notes |
| --- | --- | --- |
| Floor plans | [P] | One plan per active level with cut plane at 1200 mm; no per-view settings yet. |
| Reflected ceiling plans | [N] | M4. |
| Elevations | [N] | M4 (generated from model + view rules). |
| Building and detail sections | [N] | M4. |
| 3D perspective and orthographic views | [P] | Orthographic plan + perspective 3D [V]. |
| Section boxes and clipping | [N] | M4. |
| View ranges and level-aware visibility | [P] | Levels below active shown translucent; cut height constant. |
| Dimensions and temporary dimensions | [N] | M4. |
| Text, leaders, tags, symbols, callouts | [N] | M4. |
| Detail components and drafting views | [N] | M4/M5. |
| View templates and visibility filters | [N] | M5. |
| Scale, line weights, detail levels, visual styles | [N] | M2 (view control bar) then M4. |
| Grids and datum visibility | [N] | M5. |
| Consistent view regeneration after model edits | [V] | All views rebuilt from derived geometry. |

### E. Structural engineering

| Feature | Status | Notes |
| --- | --- | --- |
| All items (foundations, framing, trusses, reinforcement, analytical model, loads, analysis) | [N] | M7. Engineering calculations will be labelled as unverified until implemented and validated. |

### F. MEP systems

| Feature | Status | Notes |
| --- | --- | --- |
| All items (ducts, pipes, fixtures, electrical, circuits, connectors, calculations) | [N] | M8. |

### G. Documentation and sheets

| Feature | Status | Notes |
| --- | --- | --- |
| All items (sheets, title blocks, viewports, legends, revisions, print sets, PDF output) | [N] | M4/M5. |

### H. Schedules, quantities and costing

| Feature | Status | Notes |
| --- | --- | --- |
| Schedules (room/door/window/element/material) | [N] | M5. |
| Filters, sorting, grouping, calculated fields | [N] | M5. |
| Quantities (area, length, volume, count, weight) | [N] | Computation lands with M3 (rooms/floors) and grows in M5. |
| Material take-offs, BOQ, pricing, waste, cost summaries | [N] | M5. |
| CSV/XLSX export | [N] | M5. |
| Automatic updates on model change | [N] | With schedule implementation. |

### I. Model coordination and validation

| Feature | Status | Notes |
| --- | --- | --- |
| Geometry and relationship validation | [V] | `src/model/validation.ts` (errors + warnings), enforced on every command and on load. |
| Model warnings and issue tracking | [P] | Issue records exist; no UI tracker yet (M2 status area / M9). |
| Linked models, clash detection, clearance checks, duplicate detection, revision comparison, comments, IFC, BCF | [N] | M9. |

### J. Rendering and presentation

| Feature | Status | Notes |
| --- | --- | --- |
| Basic materials and lighting | [P] | Solid materials + ambient/directional light [V]; no textures. |
| Lighting and shadows, sun/location, cameras, walkthroughs, exploded views, realistic style, image export, shareable viewing | [N] | M10. Rendering stays separate from the model. |

### K. Cloud projects and collaboration

| Feature | Status | Notes |
| --- | --- | --- |
| All items (accounts, orgs, permissions, cloud save, versioning, concurrent editing, worksets, audit) | [N] | M11. Existing backend audit required first; no backend exists in this repository (browser-local storage only). No infrastructure changes without approval. |

### L. Interoperability and extensibility

| Feature | Status | Notes |
| --- | --- | --- |
| Project JSON save/open + migrations | [V] | `src/model/schema.ts` with v1→v2 migration. |
| DXF, PDF, IFC, BCF, CSV/XLSX, GLB, extension API | [N] | M4 (PDF/DXF), M5 (CSV/XLSX), M9 (IFC/BCF), M10 (GLB), M12 (extension API). RVT is a separate research project and is not promised. |

## 3. Scope boundaries

- Integer millimetres remain the stored unit (README, `src/model/units.ts`).
- No code, formats or assets derived from Autodesk products (clean-room policy, README).
- Structural adequacy and code compliance will never be claimed without validated calculations (master prompt §12).
- No backend/infrastructure changes in this repository without need + approval.

## 4. Definition of done (applies to every feature)

A feature is complete only when its workflow exists in the application, the model represents it, geometry is generated and validated, views update, parameters edit and persist, undo/redo and save/reopen work, errors are explicit, tests cover the behaviour, and documentation records remaining limitations.
