# Testing

Layered strategy. Every slice runs type-check + unit tests + production build; user-visible workflows also get browser e2e and screenshot inspection.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run (unit + integration)
npm run build       # type-check + vite production build
npm run e2e         # puppeteer-core against a running dev server
```

E2E requirements: a Chromium/Chrome executable. Set `CHROME_PATH`. In this sandbox the portable Chromium from the `@sparticuz/chromium` npm package works with `LD_LIBRARY_PATH=/tmp/al2023/lib` (see `DECISIONS.md` D6):

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium \
  APP_URL=http://localhost:5173 npm run e2e
```

Environment knobs for `e2e/*.e2e.mjs`: `APP_URL`, `CHROME_PATH`, `CHROME_ARGS`, `E2E_SHOTS` (screenshot directory).

## Unit tests (vitest, jsdom-free pure logic)

| Area | File | What it proves |
| --- | --- | --- |
| Units | `src/__tests__/units.test.ts` | mm round-trips, parsing with unit suffixes, integer invariants. |
| Geometry | `src/__tests__/geometry.test.ts` | wall solids with openings, clipping at cut plane, volumes, snapping, projection. |
| Commands | `src/__tests__/commands.test.ts` | command results, refusal of invalid edits, cascades (level/wall delete), type updates. |
| History | `src/__tests__/history.test.ts` | undo/redo round-trips exactly, revision counter, limits. |
| Schema | `src/__tests__/schema.test.ts` | deterministic serialization, parse errors, v1→v2 migration. |
| Autosave | `src/__tests__/autosave.test.ts` | write/read/clear, corrupt-slot handling. |
| Polygons & quantities | `src/__tests__/polygon.test.ts`, `quantities.test.ts` | shoelace areas, self-intersection rejection, derived quantities. |
| Element commands | `src/__tests__/elements.test.ts` | materials, floor/column/ceiling/roof types and instances, cascades, invalid-edit rejection. |
| Element geometry | `src/__tests__/elementGeometry.test.ts` | slab elevations, hip-roof ridge derivation, visible-level rules, rectangle rules. |
| Elevation projections | `src/__tests__/elevation.test.ts` | viewer-right axis mapping, hulls, wall/opening rectangles, roof silhouettes per direction, column spans, level datums. |
| Schema migrations | `src/__tests__/schema.test.ts` | deterministic round-trip, v1→v2→v4 and v3→v4 migrations, malformed-file rejection. |
| AI units | `src/__tests__/aiUnits.test.ts` | mm/cm/m/ft/in conversion to integer mm, range and garbage rejection. |
| AI plan schema | `src/__tests__/aiPlanSchema.test.ts` | DesignPlan parsing, malformed/malicious responses, refs, boundaries, views, duplicate opIds, plan caps. |
| AI apply | `src/__tests__/aiApply.test.ts` | new-building generation, hip roof on existing building, room resize with stable ids, door/window host refusals, atomic failure recovery, delete cascades, undo/redo of a whole plan. |
| AI prompt sync | `src/__tests__/aiPromptSync.test.ts` | server system prompt documents exactly the validator's op kinds; prompt example is a valid plan. |
| AI server | `src/__tests__/aiServer.test.mjs` | request validation, per-IP rate limit, timeout, upstream error mapping, empty-content retry, API-key protection, demo planner labelling (DeepSeek mocked over local HTTP). |

## Integration tests

Same vitest run; they exercise several layers together:

- Command → derived geometry agreement (projectGeometry for a known model).
- Save → parse → deep-equal identity of entities.
- Quantity functions against hand-computed fixtures.
- Future: plan/elevation/section agreement, schedule refresh, autosave recovery in the app.

## Manual AI integration test (real DeepSeek)

`npm run test:ai-manual` with `DEEPSEEK_API_KEY` set calls the real DeepSeek API once (spends
tokens) and reports whether the model returns a DesignPlan-shaped response with the expected
operations. It is never part of the automated suite; everything else mocks DeepSeek.

## Browser end-to-end (puppeteer-core)

`e2e/slice1.e2e.mjs` (grows per slice; new slices add their own scenario files or extend it):

- Draw chained walls with snapping; refuse invalid door placement with a message.
- Select and edit properties (wall height, door offset); undo/redo via buttons and shortcuts.
- Plan orientation matches the model; 3D renders (mesh count); screenshots inspected.
- Autosave recovery after reload; save → New → reopen preserves ids; v1 file migration.
- Delete cascades and undo.
- Fails on any console error, page error, failed request, or HTTP ≥ 400.

`e2e/slice6-ai.e2e.mjs` (AI Architect; DeepSeek mocked at the network layer, deterministic):

- Panel status, plan preview before apply (nothing applied early).
- Applied plan creates genuine walls/openings/room/floor/hip-roof with integer-mm geometry and host links.
- Undo/redo reverts and restores the whole plan; conversational edit resizes a room by name (stable id).
- Elevation tabs open from `view.open` operations; unsupported section requests are explained with alternatives.

Screenshots land in `e2e/screenshots/` (gitignored) and are inspected for visual defects; passing assertions alone are not accepted as proof of correct appearance.

## Regression policy

Tests are never deleted to make a slice pass. Behaviour changes update tests deliberately with an explanation in `DECISIONS.md`. Baseline numbers are recorded in `PROGRESS.md` after each slice.

## Coverage priorities (grows over milestones)

1. Geometry and dimensions, unit conversion, wall joins/openings — done for current features.
2. Constraints/dependency validation — done for hosting; extends with families.
3. Room areas, element quantities — with M3.
4. Serialization and migrations — extends each schema bump.
5. Command history and invalid-edit rejection — standing.
6. Type/material assignment — with M3 materials.
7. View agreement (plan/elevation/section/3D) and schedules — with M4/M5.
8. Export format validity — with each exporter.
