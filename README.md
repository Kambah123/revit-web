# revit-web

A browser-based BIM editor with an application-native semantic model and a Three.js plan/3D editor. **This project is not Autodesk Revit and does not read, edit or write RVT files.** Autodesk API/APS research and the carefully bounded integration recommendation are documented in [`docs/REVIT_API_AUDIT.md`](docs/REVIT_API_AUDIT.md).

## Current capabilities

- Create/edit building levels; add connected straight walls; host rectangular doors/windows and validate fit.
- Add polygon floors and rooms, rectangular columns, horizontal ceilings and simple hip roofs.
- Use per-project element types and built-in display materials; choose a wall type's material and see its colour in the native 3D view.
- Edit supported element properties, view derived areas/volumes, undo/redo, autosave/recover, and save/open versioned `*.revit-web.json` projects.
- Work in a native Three.js orthographic plan and 3D view, plus generated read-only north/south/east/west elevations, with a ribbon workspace, Project Browser, Properties panel, view tabs and command launcher.
- **AI Architect (DeepSeek):** describe buildings and edits in plain English (metres, millimetres or feet); the model proposes a validated, previewed design plan that is applied through the real command layer as one undo step — genuine walls, rooms, floors, doors, windows and hip roofs, plus generated elevations. Plans **stream** as they are written (operations appear live, with Cancel that stops the request), and rejected plans are **auto-repaired**: the deterministic validator's own messages and the rejected json go back to the model once, so a plan that fails on a fixable detail arrives fixed and labelled instead of failing. See [`docs/AI_ARCHITECT.md`](docs/AI_ARCHITECT.md) for setup, security and limits.

The semantic model is authoritative; Three.js geometry is derived. All linear model values are integer millimetres. App JSON is the only supported project format (schema v4; v1/v2/v3 files migrate to v4). See [`docs/PRODUCT_SCOPE.md`](docs/PRODUCT_SCOPE.md) and [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for boundaries.

## Getting started

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev          # Vite dev server (default http://localhost:5173)
npm test             # Unit and integration tests (model, geometry, AI pipeline, server)
npm run typecheck    # TypeScript checks
npm run build        # TypeScript checks and production build
```

For browser tests, start the dev server in one terminal, install/provide Chrome or Chromium, then run from another terminal:

```bash
CHROME_PATH=/path/to/chrome npm run e2e       # core workflow (slice 1)
CHROME_PATH=/path/to/chrome npm run e2e:ai    # AI Architect workflow (DeepSeek mocked)
CHROME_PATH=/path/to/chrome npm run e2e:all   # all browser suites
```

### AI Architect (DeepSeek)

The AI Architect needs a small server that keeps the DeepSeek API key out of the browser:

```bash
# development: run the AI server next to the Vite dev server (Vite proxies /api to it)
export DEEPSEEK_API_KEY=sk-...       # server-side only; never a VITE_ variable
npm run server                       # http://127.0.0.1:8787 (also AI_DEMO_PLANNER=1 for a keyless demo)

# production: one process serves the built SPA and the API
npm run build
npm start                            # serves dist/ + /api/ai/plan (+ /api/ai/plan-stream) on PORT (default 8787)
```

Requests go to `POST /api/ai/plan-stream` (server-sent events: `start` → `delta`* → `done`/`error`) so
the panel can show operations as they are written and cancel an in-flight request. When streaming is
unavailable (`AI_STREAM=0`, no such route, or a proxy that buffers it away) the client automatically
uses the buffered `POST /api/ai/plan` instead — same envelope, same validation, no user-visible error.

Offline demo of the full pipeline (no API key, no DeepSeek): the mock model answers a design
request with a plan that is deliberately broken, so you can watch the automatic repair loop fix it.

```bash
npm run mock:model                                                   # terminal 1: mock model (not an LLM)
DEEPSEEK_API_KEY=demo DEEPSEEK_BASE_URL=http://127.0.0.1:9999 npm run server   # terminal 2
npm run dev                                                          # terminal 3: open the app, ask for a studio
```

Configuration: `DEEPSEEK_API_KEY` (required), `DEEPSEEK_MODEL` (default `deepseek-flash`),
`AI_TIMEOUT_MS`, `AI_TEMPERATURE`, `AI_RATE_LIMIT_PER_MIN`, `AI_DEMO_PLANNER`, `PORT`. Full table in
`docs/AI_ARCHITECT.md`. Manual live-API test (spends tokens): `DEEPSEEK_API_KEY=sk-... npm run test:ai-manual`.

#### Deploying on Vercel

Vercel uses the serverless handlers in `api/ai/plan.mjs` and `api/ai/health.mjs`; it does not run
the standalone `npm start` server for a static Vite deployment. In **Vercel → Project → Settings →
Environment Variables**, set `DEEPSEEK_API_KEY` to your actual DeepSeek API key for **Preview** and
**Production** (and Development if needed). Do not prefix it with `VITE_`, and never commit it.
Redeploy after changing the variable. Check `/api/ai/health`: `aiConfigured: true` means the key
is available to that deployment; `false` means the serverless route is running but DeepSeek is not
configured. Local `npm run dev` still needs `npm run server` running separately.

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
src/ai/          AI Architect: DesignPlan schema, transactional apply engine, project context
server/          AI server: DeepSeek endpoint (key stays server-side) and static SPA hosting
e2e/             Puppeteer browser workflows (slice 1 to slice 6, incl. the AI Architect)
src/__tests__/   Vitest unit/integration/regression tests
docs/            Scope, architecture, roadmap, tests, limitations, Revit/APS audit and AI design
```

## Units and coordinates

- Lengths and elevations are integer millimetres; level elevation is relative to the app's project datum.
- Plan `(x, y)` maps to world `(x, elevation, -y)` in the 3D scene.
- Keep the app's canonical units unchanged; convert only at an explicit, tested export or integration boundary.

## Clean-room policy

This project is an independent implementation. Do not add code, binaries, file-format parsers or assets extracted/decompiled from Revit or another proprietary BIM product. New file formats must use public specifications and independently implemented/tested mappings.
