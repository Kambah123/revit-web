# Known limitations

Kept current every slice. Newest items last within each section. (Session 2026-10-12.)

## Environment

- The prompt-supplied Revit UI PDF and screenshot are not present in this environment (see `REFERENCE_AUDIT.md`); requirements were derived from the prompt's descriptions and public Revit UI knowledge.
- No system Chrome in the sandbox; e2e runs on a portable Chromium extracted from the `@sparticuz/chromium` npm package (testing only), with `CHROME_PATH` still the supported interface elsewhere.
- The three.js bundle exceeds Vite's 500 kB chunk warning (informational; code-splitting deferred).

## Model and geometry

- Wall joins are detected only where endpoints coincide exactly. T-joins and mitered corners are rendered by overlapping boxes.
- Openings are rectangular and only in straight walls; no arched openings.
- Wall height is a single value; no base/top offsets; no layered (compound) wall assemblies.
- Floor/room boundaries are explicit user-drawn polylines; rooms are not auto-bounded by walls yet; no shaft/openings in floors yet; no sloped floors.
- Columns are rectangular only; no rotation parameter yet; no round/steel sections.
- Roofs, ceilings, stairs, railings, ramps, curtain walls, grids, reference planes: not yet implemented.
- Room area is polygon shoelace area (not net-of-walls).

## Views

- One plan view per active level with a fixed 1200 mm cut plane; no view ranges, RCP, elevations or sections yet.
- Plan symbology is basic: no door swings, break lines, or hatching (room floors show translucent fill only).
- No dimensions, text, tags, symbols, callouts, view templates or visibility filters yet.
- Undo history is in memory and is not saved with the project.

## Persistence

- Autosave holds one slot in local storage; no recovery versions.
- Project format is revit-web JSON only; DXF/PDF/IFC/BCF/CSV/GLB exporters not yet implemented.

## Workspace (updated with slice 2b when delivered)

- Before workspace milestone: flat toolbar instead of ribbon; no project browser, view tabs, command launcher, or resizable panels yet (M2 in `ROADMAP.md`).

## Engineering

- No structural or MEP engineering, no calculations, no code-compliance features. Nothing in the app claims compliance.
