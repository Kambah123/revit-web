# Progress log

Latest state first. Every slice: intent, work, verification (real results only), commit, next task.

## Session 2026-10-12 (second) — DeepSeek AI Architect (slices A–G)

**Branch/commit at start:** `arena/673afcb7-revit-web` @ `9a28692` (clean; slices 1–5 already merged).

**Baseline measured:** `tsc` clean, 94 unit tests pass, `npm run build` passes (three.js chunk warning, known).

**Audit:** schema v4 model + command layer + whole-project validation + derived geometry (incl. hip
roofs) + generated elevations + undo/redo history + autosave. No backend existed. Sections and
dimensions/annotations are honest stubs (roadmap M4). Design and API research (official DeepSeek
docs: `deepseek-flash`/`deepseek-v4-pro`, `response_format: json_object`, concurrency-based rate
limits, current pricing) recorded in `docs/AI_ARCHITECT.md`.

**Slice A (`b26b29f`):** `docs/AI_ARCHITECT.md` — audit, DeepSeek research, typed DesignPlan IR design, flow, security, env vars, limits.

**Slice B (`030f08d`):** dependency-free Node server (`server/`): `POST /api/ai/plan` (request
validation, per-IP rate limit, upstream timeout, safe typed errors, one empty-content retry for
JSON mode), `GET /api/ai/health`, static SPA hosting with traversal/sensitive-path protection.
`DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL`/`DEEPSEEK_BASE_URL` from server env only; Vite proxies `/api`.
Verified: 14 server tests with a mocked DeepSeek (key never in responses, 400/405/415/429/502/503/504 mapping).

**Slice C (`79737de`):** `src/ai/` DesignPlan IR (27 ops mapping 1:1 to real commands), explicit
unit conversion (mm/cm/m/ft/in → integer mm), strict validator with readable errors, op preview
labels, quick-apply heuristics; prompt/validator sync test. Verified: 21 new checks.

**Slices D/E engine (`8fcadd9`):** `applyPlan.ts` transactional executor through
`src/model/commands.ts` (refs id/opId/name, stable identities, atomic, per-op outcomes, view
requests); `context.ts` compact project context (never the whole file); `apiClient.ts`; additive
`addOpeningType`/`updateOpeningType`/`deleteOpeningType` commands (mirror `addWallType`). Verified:
12 integration tests — new-building generation (walls+rooms+slab+door+2 windows+hip roof all real
entities), hip roof on existing building, room resize keeping identity, wall edit with stable id
and intact host links, door/window fit refusals, atomic recovery (mid-plan failure leaves the model
untouched), cascades, undo/redo as one history step.

**Slices D/E/F UI (`6dba1e5`):** `AiArchitectPanel` (status, preview cards with
summary/assumptions/clarifications/unsupported+alternatives, validated op list, Apply/Quick
apply/Cancel/Retry, suggestions, disclaimer) wired into the workspace (ribbon + launcher command,
one history commit, requested views opened, first created element selected). e2e `slice6-ai.e2e.mjs`
8 checks with DeepSeek mocked at the network layer; caught and fixed a real bug (model edits must
not run inside a React state updater under StrictMode) and a static-server fallback leak
(`/.git/config` now 404s). Screenshots inspected (`slice6-ai-preview/applied/elevation/unsupported`
— genuine punched walls, hip roof, Properties editing a real wall, two-digit op numbering fixed,
header/scroll clipping fixed).

**Slice G (this commit):** `server/manualTest.mjs` (manual live-API test), README/TESTING/
KNOWN_LIMITATIONS/AI_ARCHITECT updates.

**Verified end-to-end:** `tsc` clean; 141 unit/integration tests pass; `npm run build` passes;
e2e slice1 17/17, slice2 11/11, slice3 14/14, slice4 9/9, slice5 11/11, slice6 8/8 (70 checks).

**Next task:** sections and dimensions when M4 lands (then the AI can offer them); streaming
progress for long plans; shared rate limiter for multi-instance deployments.

---

## Session 2026-10-12 — Phases 0–2 done; M3 modelling expanded (slices 2–4)

**Branch/commit at start:** `arena/63a6b55e-revit-web` @ `bd42fa0` (squash-merge of the previous session's slice 1; historical `4035013`/`ddec16a` absent from this clone — see DECISIONS D4).

**Baseline measured (before any change):**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npx vitest run` | 6 files, 46 tests pass |
| `npm run build` | pass (chunk-size warning: three.js ≈ 671 kB) |
| System Chrome | none; portable Chromium 153 via `@sparticuz/chromium` works headless with WebGL (DECISIONS D6) |
| Reference PDF/screenshot | not present in environment (DECISIONS D5) |

**Phase 0 (commit `7a558a8`):** `PRODUCT_SCOPE.md` (feature audit A–L), `REFERENCE_AUDIT.md`, `ROADMAP.md` (M0–M12 with DoD), `DECISIONS.md`, `KNOWN_LIMITATIONS.md`, `TESTING.md`, this log.

**Slice 2a (commit `4170662`): canonical model — materials, floors, rooms, columns (schema v3).**
- Polygon helpers (integer-safe shoelace area/centroid, self-intersection checks); quantities module (all values derived); commands + validation; level-delete cascade; schema v3 with v2 and v1 migrations.
- Verified: `tsc` clean, 75 unit tests pass (29 new), `npm run build` passes.

**Slice 2b (commit `82eb07f`): viewer + UI for the new elements.**
- Floor slabs (extruded boundaries, material colours), columns, plan-only room fills with name+area labels; polygon-chain drawing (Floor F / Room R / Column C); properties editors; derived quantities in the palette.
- Verified: `slice1` 17/17, `slice2` 11/11 in headless Chromium; screenshots inspected.

**Slice 3 (commit `135b331`): professional workspace (roadmap M2).**
- Command registry (`src/app/ribbon.ts`) as single source of truth for ribbon, Ctrl+K launcher and shortcuts; 11 ribbon tabs; 40+ unimplemented commands disabled with "Not implemented yet" tooltips; QAT; contextual Modify ribbon; Project Browser; view tabs; View Control Bar (scale/detail/visual style/shadows — real view state); status bar; F1 shortcut map; resizable/collapsible panels.
- Verified: `slice1` 17/17, `slice2` 11/11, `slice3` 14/14; screenshots `slice3-workspace.png`, `slice3-wireframe.png` inspected.

**Slice 4 (this commit): ceilings and hip roofs with overhangs (M3 finish).**
- Schema v4: `Ceiling` (boundary + height + type), `Roof` (rectangular footprint + overhang + rise + type) with hip-roof derived geometry (ridge along the longer axis, four slopes + soffit); commands, validation, migrations (v3→v4 plus chain); Ceiling (E) and Roof (O) tools share the boundary-chain workflow; properties editors; pick priorities.
- Fixed a real geometry bug found by tests: segment intersection compared orientation values instead of signs (D12); fixed 3D visibility so the 3D view shows all levels while plan keeps the underlay rule (D11 — caught by screenshot inspection).
- Verified: `tsc` clean, 89 unit tests pass (13 new incl. hip-roof ridge derivation, rectangle rules, ceiling/roof commands, cascade), `npm run build` passes; e2e `slice1` 17/17, `slice2` 11/11, `slice3` 14/14, `slice4` 9/9 (51 checks total; roof draw/edit/refusal, ceiling draw/edit, 3D render, undo/redo); screenshot `slice4-3d.png` inspected — hip roof with ridge renders correctly.

**Slice 5 (this commit): elevations generated from the model (M4 start).**
- `src/geometry/elevation.ts`: pure projections (viewer-right axis per facade naming, wall faces unioned from split solids, opening rects, slab/column rects, roof silhouettes as convex hulls — trapezoid from the sides, triangle from the ends, level datums); `src/ui/ElevationView.tsx` SVG renderer (read-only); Project Browser "Views (Elevations)"; view tabs `elev:<dir>`; View ribbon commands (4 elevations); modelling shortcuts inert in elevations.
- Verified: `tsc` clean, 94 unit tests pass (5 new), `npm run build` passes; e2e `slice1` 17/17, `slice2` 11/11, `slice3` 14/14, `slice4` 9/9, `slice5` 11/11 (62 checks total; elevation open/read-only/tab-close, triangle-from-end assert); screenshot `slice5-elevation.png` inspected twice — caught and fixed level labels overpainted by the wall face (datums now draw over geometry).

**Next task:** M4 continues — sections generated from cut planes, then dimensions/annotations; then sheets and PDF/DXF export (M5). Also small: wall material assignment in properties (type material dropdown).

---

## Session (previous) — Slice 1 (merged as `bd42fa0`)

BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave; 46 unit tests + 17-step e2e (verified on that branch). See `ARCHITECTURE.md` §4 for its verification record.
