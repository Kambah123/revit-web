# revit-web

A browser-based building information modeling (BIM) editor, built from scratch.

Current features (v0.1):

- 3D plan view with orbit, pan, and zoom (Three.js)
- Levels with elevations; add, rename, and delete levels; the active level is the drawing target
- Wall tool: click to place walls, chain them, and snap to 0.1 m, 0.5 m, or 1 m (or off)
- Select walls to edit level, height, thickness, start/end points, and length; delete walls
- Save and open projects as JSON (`*.revit-web.json`), with validation on load
- **AI Architect (DeepSeek):** describe buildings and edits in plain English (metres, millimetres
  or feet); the model proposes a validated, previewed design plan that is applied through the real
  command layer as one undo step — genuine walls, rooms, floors, doors, windows and hip roofs, plus
  generated elevations. See `docs/AI_ARCHITECT.md` for setup, security and limits.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the model, geometry, history, persistence and AI pipeline
npm run build      # type-check and production build
CHROME_PATH=/path/to/chrome npm run e2e   # end-to-end test in a real browser (dev server must be running)
```

### AI Architect (DeepSeek)

The AI Architect needs a small server that keeps the DeepSeek API key out of the browser:

```bash
# development: run the AI server next to the Vite dev server (Vite proxies /api to it)
export DEEPSEEK_API_KEY=sk-...       # server-side only; never a VITE_ variable
npm run server                       # http://127.0.0.1:8787 (also AI_DEMO_PLANNER=1 for a keyless demo)

# production: one process serves the built SPA and the API
npm run build
npm start                            # serves dist/ + /api/ai/plan on PORT (default 8787)
```

Configuration: `DEEPSEEK_API_KEY` (required), `DEEPSEEK_MODEL` (default `deepseek-flash`),
`AI_TIMEOUT_MS`, `AI_RATE_LIMIT_PER_MIN`, `AI_DEMO_PLANNER`, `PORT`. Full table in
`docs/AI_ARCHITECT.md`. Manual live-API test (spends tokens): `DEEPSEEK_API_KEY=sk-... npm run test:ai-manual`.

## What works (slice 1)

- Levels with millimetre elevations: add, rename, change elevation, delete (cascades to walls and openings).
- Connected walls: wall tool draws chained walls; a new wall that starts within 150 mm of an existing endpoint snaps to it and joins it.
- Wall types with thickness; changing a type updates every wall of that type.
- Doors and windows hosted in walls. They are refused if they fall outside the wall, overlap another opening, or are taller than the wall. Deleting a wall deletes its openings.
- Plan view (orthographic, walls cut at 1200 mm) and 3D view, both from the same derived geometry. In plan, X points right and Y points up.
- Properties panel for walls, doors and windows, with whole-millimetre fields.
- Undo and redo (toolbar buttons, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y).
- Autosave to the browser, recovered on reload.
- Save and open project files (`*.revit-web.json`). Files in the first format are migrated to millimetres.

Known limitations: see `docs/ARCHITECTURE.md` section 4. Windows show as solid sill walls in plan, with only a thin glass line; plan symbology is planned for a later slice.

## Shortcuts

| Key      | Action                                   |
| -------- | ---------------------------------------- |
| `S`      | Select tool                              |
| `W`      | Wall tool                                |
| `D`      | Door tool (click near a wall)            |
| `N`      | Window tool (click near a wall)          |
| `Esc`    | Finish wall chain / back to Select       |
| `Delete` | Delete the selected wall, door or window |
| `Ctrl+Z` | Undo                                     |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo                   |

## Project layout

```
src/model/       Canonical model: types, integer-mm units, commands, validation, schema, joins, queries
src/geometry/    Derived geometry: wall solids with openings cut (pure, no rendering)
src/viewer/      Three.js scene: plan and 3D views of derived geometry, pointer input
src/app/         Undo/redo history (pure reducer)
src/persistence/ Autosave to local storage
src/ui/          Panels and form controls
src/App.tsx      Application shell: toolbar, tools, commands wiring
e2e/             End-to-end browser test (puppeteer-core)
```

The model is the source of truth. Every edit goes through a command in `src/model/commands.ts`, which validates the whole project before returning. The viewer only renders derived geometry.

## Units and coordinates

- All lengths in the model are integer millimetres. Elevation is measured from the project datum.
- Plan `(x, y)` maps to world `(x, elevation, -y)` in the 3D scene. Only `src/viewer/BimScene.ts` converts units.

## Clean-room policy

This project is an independent implementation. It is not derived from Autodesk Revit or any other proprietary BIM product. Do not add code, binaries, file-format parsers, or assets that were decompiled or extracted from Revit or similar commercial software. New file formats should be based on public specifications, such as buildingSMART IFC and glTF.

## Roadmap

See `docs/ARCHITECTURE.md` for the slice plan: floors, roofs, rooms and materials; sections and elevations; dimensions and sheets; exports; then IFC and structural/MEP work, which needs approval.
