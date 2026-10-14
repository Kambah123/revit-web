# Contour — first working workspace

> Historical milestone. The visual design and dimension limitation below are superseded by [milestone 2](CONTOUR_MILESTONE_2.md).

13 October 2026. Working product name; independent implementation inspired by the public research and supplied screenshot audit. No Synaps source, private assets, account or authenticated API was acquired or copied.

## Implemented

**Library:** IndexedDB-backed multi-project dashboard, model-derived SVG previews, search, grid/list switch, six most recently edited entries, blank/example creation, independent duplication/import, rename in the editor, confirmed delete. Two original semantic example models are seeded only on first initialization. A valid legacy autosave is migrated once without deleting its recovery bytes; corrupt legacy data produces a visible warning. Deleting every project does not reseed the library.

**Editor:** light architectural plan, searchable/selectable element list, level switcher and management dialog, contextual editable properties, wall/door/window placement defaults, real building-type and material libraries, drawing toolbar, command search, undo/redo, show/hide panels, snapping/grid, fit and zoom, live 3D with orange mode accents, editable JSON export. Existing floors, rooms, columns, ceilings, roofs and read-only elevation commands remain available through the shared command engine/search; the legacy ribbon remains at `/?legacy=1`.

**Persistence:** queued writes finish on IDB transaction completion, not request success. Returning to the dashboard awaits the save queue. Failures stay visible and prevent navigation from hiding unsaved work; pending/failed writes also register a browser unload warning. Imports get new project IDs to avoid silently overwriting another local project. Opening a project without editing does not update its modified timestamp.

**AI integration:** reuses the existing schema-validation → preview → transactional command pipeline. The running preview uses `AI_DEMO_PLANNER=1`, a small deterministic local rule set, labelled in the panel and proposals. It is not DeepSeek or a generative-image model. Try a blank project with “Design a 10 m by 8 m house.” No paid/model requests were made during implementation verification. Real provider configuration stays server-side; see `AI_ARCHITECT.md`.

## Engineering changes

- `src/studio/`: shell, project store, original samples, icons, thumbnails, dialogs and scoped styles.
- `src/App.tsx`: optional studio adapter over existing immutable model/history commands. Legacy autosave/ribbon retained separately. Modal/input shortcuts guarded.
- `src/viewer/BimScene.ts`: studio materials, plan edges, grid/zoom/fit, labels, geometry/material disposal. Fixed the existing double-negation that mirrored off-origin room/floor/ceiling polygons. Projection has explicit regression tests.
- `src/main.tsx`, `src/studio/Editor.tsx`, `vite.config.ts`: default dashboard; editor/WebGL lazy-loaded, Three.js separated. Dashboard entry approximately 192 kB minified / 61 kB gzip. The ~512 kB Three.js vendor chunk still emits Vite's non-failing 500 kB warning.
- `fake-indexeddb` is a dev-only dependency for store tests. REA remains isolated tooling, not an app dependency.

## Verification actually run

| Check | Result |
| --- | --- |
| `npm run build` (includes TypeScript) | Passed; vendor size warning only |
| `npm test` | 153 tests / 18 files passed |
| `CHROME_PATH=… npm run e2e:all` | All seven suites passed: 92 checks total |
| Legacy browser suites | 71 checks: modelling, properties, materials, persistence, UI, roof/ceiling, elevations, mocked AI |
| New `e2e:studio` suite | 21 checks: library, search, views, panels, assets, drawing/openings/history, AI preview/apply/undo, saving/reload, export/import, duplication/deletion, narrow dashboard, no runtime/console errors |
| Production browser smoke | Built app opened, real example canvas and demo assistant rendered |
| REA production runtime | Actual target discovery + passive DOM/accessibility/script-metadata inspection; evidence linked below |

Environment: Node 22.22.3, Chromium 133; this sandbox uses `LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium`. These temporary browser paths are not a portable installation requirement. The legacy suites add `legacy=1` to `APP_URL`; the studio suite uses the normal route. AI tests intercept the HTTP response with deterministic plans; the application validation/history pipeline is real. One full-run attempt hit a timing-sensitive legacy selection assertion while two inspection canvases were also running; after closing that inspection browser the complete suite passed unchanged.

Actual screenshots are generated under ignored `e2e/screenshots/`: `contour-dashboard.png`, `contour-editor.png`, `contour-spatial.png`, `contour-assistant.png`, `contour-dashboard-mobile.png`. They are observations of this app, not copies of the reference screenshots.

## REA use

The user's requested **REA 6.4.0** was genuinely used, not merely installed. See [installation and use](research/synaps/REA.md#contour-implementation-runtime-inspection) and the retained original evidence:

- [Production target discovery](research/synaps/evidence/contour-production-targets.json)
- [Production browser inspection](research/synaps/evidence/contour-production-runtime.json)
- [Separate build hashes](research/synaps/evidence/contour-build-record.json)

REA observed our own built application at `http://localhost:8787`, with 524 DOM nodes, 459 accessibility nodes and three eligible compiled scripts. Browser actions were performed through Puppeteer, not attributed to REA's passive provider. REA cannot establish Synaps internals, application correctness, full network history or artifact identity from this capture. Its policy/attach limits remain intact in the evidence. The inspection browser/debugging process was stopped after capture; the app and local demo API remain running.

## Boundaries — deliberately not simulated

- Local, single-browser/origin projects. No sign-in, cloud backup, multi-user permissions, real-time collaboration or cross-tab conflict merging. Keep one editing tab per project and export backups. Clearing site data can delete the library; the unload warning is not a disaster-recovery guarantee.
- JSON is the only supported import/export format. No PDF/DXF/image export, paper/layout engine, associative dimensions, drawing trace, calibrated image import, DWG/IFC/RVT or segmentation.
- Assets here are model types and display materials, not a furniture/3D-content marketplace. Shared wall-type material edits affect every wall of that type.
- Rooms are explicit polygon boundaries, not automatic wall-loop detection or auto-reshaping rooms. Geometry remains conceptual and not building-code/engineering approval.
- Live WebGL 3D is not an AI image. No saved cameras, photoreal image generation, render history or image-to-model conversion.
- Desktop-first drawing workspace; the narrow dashboard was tested. No claim of a complete touch drafting system, full accessibility audit, huge-model performance or cross-browser parity.
- The demo planner understands a small fixed set of requests, including assumptions about default level names; use a blank example for the demo. Real AI requires configuration and additional authentication, quotas and deployment hardening before exposing a paid endpoint publicly.

## Suggested next slice

Model-first annotation/measurement tools and explicit wall/room geometry editing, followed by calibrated reference-image import. Then paper/export workflows and camera/render jobs; collaboration should follow a defined operation/versioning model rather than bolting network sync onto this local snapshot store.
