# User-interface reference inventory

**Inventory date:** 2026-10-12. This file records the earlier UI-reference search and prompt-derived requirements; it is not the current feature-status or Autodesk API audit. See [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md) for current implementation status and [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md) for the official Revit API/SDK and APS technical review.

## 1. Materials provided for this session

The master execution prompt states that two reference materials were supplied:

1. A screenshot of the Autodesk Revit user interface.
2. A PDF containing Revit UI references, explanations and guides.

## 2. Search performed

The following locations were searched for the attachments before this audit was written:

- The conversation attachment block (no `<arena-system-message>` attachment list accompanied the prompt).
- The repository tree `/home/user/revit-web` (all files, including `docs/` and `e2e/`).
- Common upload locations: `/home/user`, `/tmp`, `/tmp/arena-workspace`, `/mnt`, `/media`, `/uploads`.
- A filesystem-wide search (bounded depth, excluding system directories) for `*.pdf`, `*.png`, `*.jpg`, `*screenshot*`, `*revit*ui*`, `*reference*`.

**Result: neither the PDF nor the screenshot is present in this environment.** No PDF was read and no screenshot was inspected. Per the prompt's instruction, the limitation is recorded here and the reference inventory below is derived from the Revit UI description already given in the conversation (the prompt's own feature inventory and workspace requirements), from established public knowledge of the Revit interface, and from the existing repository documentation. Once the actual PDF and screenshot are available, this document must be updated with a page-by-page inventory and any resulting requirement changes must be logged in `DECISIONS.md`.

## 3. Reference inventory (derived from the prompt's descriptions)

This is the working requirements baseline used to shape the roadmap. It is **not** a claim of having inspected the missing files.

### 3.1 Ribbon tabs and command groups

Tabs required by the prompt: **Architecture, Structure, Steel, Insert, Annotate, Analyze, Massing & Site, Collaborate, View, Manage, Add-Ins**. Typical groups (from public Revit documentation):

- **Architecture**: Datum (Level, Grid), Build (Wall, Door, Window, Component, Floor, Roof, Ceiling, Opening), Circulation (Stair, Railing, Ramp), Room & Area (Room, Room Tag, Area), Model (Model Text, Detail), Site, Opening, Work Plane.
- **Structure**: Datum, Foundation, Structure (Column, Beam, Brace, Floor), Connection, Reinforcement.
- **Steel**: Connection, Fabrication, Element Modification.
- **Insert**: Import (CAD, IFC, Link Revit/IFC), Load from Library, Model-in-Place, Reference.
- **Annotate**: Dimension (Aligned, Linear, Angular, Radial), Detail (Detail Line, Region, Component), Text, Tag, Symbol, View (Section, Callout, Elevation), Color Fill.
- **Analyze**: Spaces & Zones, Reports & Schedules, Energy, Systems.
- **Massing & Site**: Conceptual Mass, Model by Face, Toposurface, Site Component, Modify Site.
- **Collaborate**: Worksets, Manage Collaboration, Coordinate (Interference Check), Publish.
- **View**: Graphics (Visibility/Graphics, Filters, View Templates), Create (3D View, Section, Elevation, Callout, Drafting View), Sheet Composition, Windows, Zoom.
- **Manage**: Project Location/Units, Project Information, Materials, Object Styles, Snapping, Phases, Design Options, Project Parameters, Purge.
- **Add-Ins**: external tools.

Contextual ribbon tabs (shown on selection): Modify | Walls, Modify | Doors, Modify | Floors, etc.

### 3.2 Workspace layout and panel behaviour

- Application frame: title area with **Quick Access Toolbar** (New, Open, Save, Undo, Redo, Print, measure), ribbon below it, tabbed document/view area in the middle.
- Left dock: **Project Browser** tree (Views: floor plans, ceiling plans, 3D views, elevations, sections, drafting views; Legends; Schedules/Quantities; Sheets; Families; Groups; Revit Links).
- Right dock: **Properties palette** — instance parameters of the current selection or view; type selector at the top; Edit Type button.
- Bottom: **View Control Bar** at the bottom of each viewport (scale, detail level, visual style, sun path, shadows, crop view, reveal hidden elements), and a **status bar** (selection count, background process info, workset/snap/selection options).
- View tabs: multiple open views switchable per tab; closeable; asterisk for unsaved.
- Panels resizable, collapsible, splitters draggable.
- Tooltips with command name + shortcut; **searchable command launcher** (Revit's "Search Commands" / press `Ctrl` twice or type-to-search).

### 3.3 Modelling workflows and tool interactions

- Place tool: click to place; properties palette shows the type being placed; Options Bar (not in prompt's list but implied) carries placement settings; temporary dimensions during placement; Esc cancels.
- Draw tools (walls, sketch-based floors/roofs/ceilings): pick or draw loop, chain segments, magenta sketch lines, Finish/Cancel checkmarks, closed-loop requirements for boundary-based elements.
- Modify tools: Move, Copy, Rotate, Mirror, Array, Align, Trim/Extend, Offset, Pin/Unpin, Split Element, Match Type Properties.
- Editing parameters drives geometry immediately (parametric regeneration).

### 3.4 Properties, Project Browser, views and sheets

- Properties: instance vs type parameters; Edit Type dialog with type parameters and Duplicate; parameter values editable in-place with validation.
- Project Browser: rename views/sheets, right-click actions (open, duplicate, delete), double-click opens view; organization by prefix/numbering.
- Views: plan, RCP, 3D (default + perspective camera), elevation, section (building/interior/detail), drafting, legend, schedule. View Range (top, cut plane, bottom, view depth), Underlay, Phase filter, Discipline, View Template.
- Sheets: drag views onto sheets as viewports; title block family; sheet number/name; revision tracking; print sets.

### 3.5 Dimensions, annotations, schedules

- Aligned/linear/angular/radial dimensions with witness lines; temporary dimensions on selection; dimension text overrides; equality constraints.
- Text notes with leaders; tags (category-based, label-driven); detail lines/regions/components; break lines; symbols.
- Schedules: category or key schedules; fields, filters, sorting/grouping, formatting, calculated values; quantities (area, volume, count, length); material take-offs; multi-category schedules; schedule placement on sheets.

### 3.6 Settings, collaboration, analysis, interoperability

- Project Units (length, angle, area, volume formats), Snaps settings, Object Styles, Materials (appearance + physical/thermal), Manage Place/Location (sun settings), Phases, Design Options.
- Collaboration: worksets, central/local models, relinquish, synchronize, element borrowing; publish to cloud platform; review/approval workflows.
- Interference check (clash), IFC import/export, BCF workflows, CAD import/export (DXF/DWG), PDF/DWF printing, schedules to spreadsheet.
- Analysis: space/zone definitions, heating/cooling loads (separate calculation engines), structural analytical model.

## 4. Derived acceptance themes

| Theme | Acceptance idea carried into ROADMAP |
| --- | --- |
| Ribbon anatomy | Tabs named above exist; every enabled command mutates the model or view through real commands; unsupported tools are visibly disabled with an explanatory tooltip. |
| Panels | Project Browser and Properties update live with selection and view; all panels resize/collapse. |
| View system | Views are generated from the model + view rules (not screenshots of another view). |
| Annotation | Dimensions/tags derive from model positions and parameters. |
| Schedules | Every quantity traces to model geometry/parameters. |
| Interop | Exporters produce spec-conformant files validated by round-trip tests. |

## 5. Branding

The reference materials describe Autodesk Revit's UI. This project is an independent, clean-room implementation: it does not use Autodesk logos, proprietary icons, copied source code, extracted file-format code, or extracted assets. Any visual styling and iconography are original.
