# revit-web

A browser-based building information modeling (BIM) editor, built from scratch.

Current features (v0.1):

- 3D plan view with orbit, pan, and zoom (Three.js)
- Levels with elevations; add, rename, and delete levels; the active level is the drawing target
- Wall tool: click to place walls, chain them, and snap to 0.1 m, 0.5 m, or 1 m (or off)
- Select walls to edit level, height, thickness, start/end points, and length; delete walls
- Save and open projects as JSON (`*.revit-web.json`), with validation on load

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the model
npm run build      # type-check and production build
```

## Shortcuts

| Key      | Action                          |
| -------- | ------------------------------- |
| `S`      | Select tool                     |
| `W`      | Wall tool                       |
| `Esc`    | Finish wall chain / back to Select |
| `Delete` | Delete selected wall            |

## Project layout

```
src/model/     Pure data model: types, validation, geometry (no rendering, fully unit-tested)
src/viewer/    Three.js scene: renders the model and reports pointer input
src/ui/        Small React form controls
src/App.tsx    Application shell: toolbar, levels panel, properties panel
```

The model is the source of truth. The viewer only renders it, and the UI only changes it through the functions in `src/model/project.ts`.

## Units and coordinates

- All lengths are meters. Elevation is measured from the project datum.
- Plan coordinates `(x, y)` map to world `(x, 0, z)` in the 3D scene; elevation is world `y`.

## Clean-room policy

This project is an independent implementation. It is not derived from Autodesk Revit or any other proprietary BIM product. Do not add code, binaries, file-format parsers, or assets that were decompiled or extracted from Revit or similar commercial software. New file formats should be based on public specifications, such as buildingSMART IFC and glTF.

## Roadmap

- IFC import and export (using a permissively licensed parser, to be chosen)
- Undo and redo
- Doors and windows hosted in walls
- Floors and roofs
- Sections and elevations
