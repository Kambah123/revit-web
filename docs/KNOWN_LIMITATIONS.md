# Known limitations

> Current update: [Contour milestone 2](CONTOUR_MILESTONE_2.md) replaces the default shell with shadcn/ui and adds manual static dimensions with schema v5 migration. Historical no-dimensions/v4 statements below predate this update.
Reverified 2026-10-12 (UTC). Current feature boundaries are in [`PRODUCT_SCOPE.md`](PRODUCT_SCOPE.md); Autodesk API/APS limits are in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).

## Environment, build and dependency audit

- The UI screenshot/PDF mentioned in the earlier prompt were not present in the reference-audit environment (see [`REFERENCE_AUDIT.md`](REFERENCE_AUDIT.md)); no page-by-page inspection is claimed.
- No system Chrome/Chromium was available in this sandbox. Browser tests used a temporary `@sparticuz/chromium` binary with NSS/NSPR libraries in `/tmp/al2023/lib`; this package was not added to runtime or lockfile dependencies.
- `npm run build` succeeds, but Vite warns that the minified main JS chunk is **774.50 kB** (208.81 kB gzip), above its 500 kB advisory threshold. Code splitting has not been attempted.
- Full `npm audit` reports **13 development-tree vulnerabilities** (3 moderate, 8 high, 2 critical), associated with locked development/test tools such as Vite, Vitest and Puppeteer Core. `npm audit --omit=dev` reports **0 production-dependency vulnerabilities**. Major-version remediation was not attempted in this feature-focused change; keep the dev server private and schedule dependency upgrades separately.

## Model and geometry

- Wall joins are detected at coincident endpoints only. T-joins and mitered corners are rendered by overlapping boxes.
- Openings are rectangular and only in straight walls; no arched openings or door-swing family geometry.
- Wall height is one value; no base/top offsets or compound/layered wall assemblies.
- Floor/room boundaries are explicit user-drawn polygons; rooms are not auto-bounded by walls. Floor openings and sloped floors are not implemented.
- Columns are unrotated rectangles only; no round/steel sections or structural framing semantics.
- Ceilings are horizontal panels at a level-relative height; no reflected ceiling plan view. Ceilings render translucently in plan.
- Roofs are hip roofs over axis-aligned rectangular footprints (overhang + rise) only; no gable/free-form/curved roofs, angle-defined slopes, fascia or automatic wall-to-roof joins.
- Floor, room, ceiling and roof boundaries cannot be re-edited after creation; delete and redraw.
- Stairs, railings, ramps, curtain walls, grids, reference planes, terrain, phases and design options are not implemented.
- Room area is polygon shoelace area, not net of walls or derived from room-bounding topology.
- App IDs are opaque local IDs. Validation checks uniqueness within collections, not across every collection. Any future global-ID rule needs a migration/audit before old projects are rejected.
- Built-in material records carry display color only. There is no general material-library CRUD, Revit appearance asset or thermal/structural property model. Wall material selection is type-level; it changes displayed color, not engineering behavior.

## Views and workspace

- One plan per level with a fixed 1200 mm cut plane; no view ranges, reflected ceiling plans or sections yet.
- Elevations (north/south/east/west) are generated read-only silhouettes from derived geometry: flat fills, no hatching/material patterns or hidden-line depth. They are not persisted Revit-style views.
- Plan symbology is basic: no door swings, break lines, detailed hatching, dimensions, text, tags, symbols, callouts, view templates or visibility filters.
- View scale/detail/visual style/shadow options are view-session state, not saved as view records/templates.
- Ribbon/workspace exists with 11 tabs, but most commands in Structure/Steel/Insert/Annotate/Analyze/Massing/Collaborate/Manage/Add-Ins remain disabled with explanatory “Not implemented yet” tooltips.
- Some unselected objects can be hard to distinguish when their assigned display material matches their surroundings; selection highlighting remains available.

## AI Architect

- DeepSeek proposes conceptual designs only; outputs are not building-code compliant and are not professional engineering. The UI states this on every panel.
- Roof generation is hip-only (the engine's only roof type). Gable/shed/mansard and free-form footprints are returned as `unsupported` with the hip alternative, never faked.
- Section views and dimension/annotation tools do not exist in the engine yet, so the AI reports them as unsupported and offers elevations or 3D instead.
- Room boundaries are explicit polygons (no wall-derived room bounding yet). The AI can resize a room boundary via `room.update` even though the properties palette does not expose boundary editing yet; walls are separate elements and must be moved explicitly.
- The model can propose ill-fitting geometry; the executor refuses it atomically with per-operation errors. A refused plan never leaves a partially applied model.
- The per-IP rate limit and request caps are per-process (in-memory); multi-instance deployments need a shared limiter.
- `AI_DEMO_PLANNER=1` serves deterministic local plans for keyless previews and is clearly labelled in the UI; it is not the language model.

## Persistence and interoperability

- Undo history is in memory and is not saved in the project file. Autosave has one browser-local storage slot; there is no recovery history, backend or cloud sync.
- `revit-web` JSON schema v4 is the only implemented project format. v1/v2/v3 migrate to v4. DXF, PDF, IFC, BCF, CSV/XLSX and GLB import/export are not implemented.
- Native RVT read/write is not implemented; no Revit parser/runtime or APS job is present. A Model Derivative/Viewer derivative would be read-only external viewing/metadata, not editable native BIM elements.

## Engineering and external services

- No structural or MEP engineering, analysis or code-compliance features. Nothing in the app claims structural adequacy or regulatory compliance.
- APS/Autodesk dependencies and credentials are not part of the app. The optional viewer POC is no-go until sample-file rights, privacy/retention, server-side secret handling, short-lived viewer-token policy and a spend cap are approved. Published APS rate assumptions are dated; reconfirm before a paid run.
