# revit-web

A browser-based BIM editor with an application-native semantic model and a Three.js plan/3D editor. **This project is not Autodesk Revit and does not read, edit or write RVT files.** Autodesk API/APS research and the carefully bounded integration recommendation are documented in [`docs/REVIT_API_AUDIT.md`](docs/REVIT_API_AUDIT.md).

## Current capabilities

- Create/edit building levels; add connected straight walls; host rectangular doors/windows and validate fit.
- Add polygon floors and rooms, rectangular columns, horizontal ceilings and simple hip roofs.
- Use per-project element types and built-in display materials; choose a wall type's material and see its colour in the native 3D view.
- Edit supported element properties, view derived areas/volumes, undo/redo, autosave/recover, and save/open versioned `*.revit-web.json` projects.
- Work in a native Three.js orthographic plan and 3D view, plus generated read-only north/south/east/west elevations, with a ribbon workspace, Project Browser, Properties panel, view tabs and command launcher.

The semantic model is authoritative; Three.js geometry is derived. All linear model values are integer millimetres. App JSON is the only supported project format (schema v4; v1/v2/v3 files migrate to v4). See [`docs/PRODUCT_SCOPE.md`](docs/PRODUCT_SCOPE.md) and [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for boundaries.

## Getting started

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev          # Vite dev server (default http://localhost:5173)
npm test             # Unit and integration tests
npm run typecheck    # TypeScript checks
npm run build        # TypeScript checks and production build
```

For browser tests, start the dev server in one terminal, install/provide Chrome or Chromium, then run from another terminal:

```bash
CHROME_PATH=/path/to/chrome npm run e2e       # core workflow (slice 1)
CHROME_PATH=/path/to/chrome npm run e2e:all   # all four browser suites
```

See [`docs/TESTING.md`](docs/TESTING.md) for browser flags, all scenarios and the tested sandbox setup. Build output currently includes Vite's informational warning that the Three.js application chunk exceeds 500 kB; see [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).

## Shortcuts

| Key | Action |
| --- | --- |
| `S` | Select tool |
| `W` | Wall tool |
| `D` | Door tool (click near a wall) |
| `N` | Window tool (click near a wall) |
| `F` | Floor tool |
| `R` | Room tool |
| `C` | Column tool |
| `E` | Ceiling tool |
| `O` | Roof tool |
| `Esc` | Finish boundary/wall chain or return to Select |
| `Delete` | Delete selection |
| `Ctrl+K` | Search commands |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `F1` | Shortcut reference |

## Project layout

```text
src/model/       Canonical schema v4, integer-mm units, commands, validation, quantities
src/geometry/    Derived geometry for building elements plus model-derived elevation projections
src/viewer/      Native Three.js plan/3D scene and pointer interaction
src/app/         Undo/redo history and command registry
src/persistence/ Browser autosave/recovery
src/ui/          Ribbon, browser, view tabs, properties, read-only elevation renderer and workspace controls
src/App.tsx      Application shell and model-command wiring
e2e/             Four Puppeteer browser workflows
src/__tests__/   Vitest unit/integration/regression tests
docs/            Scope, architecture, roadmap, tests, limitations and Revit/APS audit
```

## Units and coordinates

- Lengths and elevations are integer millimetres; level elevation is relative to the app's project datum.
- Plan `(x, y)` maps to world `(x, elevation, -y)` in the 3D scene.
- Keep the app's canonical units unchanged; convert only at an explicit, tested export or integration boundary.

## Clean-room policy

This project is an independent implementation. Do not add code, binaries, file-format parsers or assets extracted/decompiled from Revit or another proprietary BIM product. New file formats must use public specifications and independently implemented/tested mappings.
