# Progress log

Latest state first. Record only executed commands/results; historical sessions follow current status.

## Session 2026-10-12 (third) — AI Architect self-repair loop

**Branch/commit at start:** `arena/45e507a7-revit-web` @ `799bbc5` (clean; AI Architect from the previous session already merged).

**Audit finding (the trigger):** the AI's *failure* path was the weak link, not its happy path.
`retryLast()` claimed "Retrying with validation feedback…" but sent no feedback at all (a re-roll);
an unbuildable-but-schema-valid plan produced a dead end ("This plan cannot be applied as
proposed"); and the failed assistant json was truncated to 1 800 chars in history. `usage` was
returned by the server and thrown away, so nobody could see what a request cost.

**Fix — automatic repair loop (bounded, disclosed, testable):**
- `src/ai/repair.ts` (new, React-free and injectable): `requestPlanWithAutoRepair` re-asks the model
  **once** with the deterministic validator's own messages plus the json it rejected. Schema failures
  and `applyPlan` geometry failures share the same path; `MAX_AUTO_REPAIRS = 1` guarantees no loop;
  feedback is bounded (12 messages × 300 chars, deduped); the echoed json is the *parsed* plan
  (lengths normalized to mm) when it parsed, the raw response when it did not.
- Server: optional `repair { plan, errors }` in `POST /api/ai/plan`, validated (≤20 × 500 chars,
  json ≤ 40 000 chars) and assembled into a "VALIDATION REPAIR REQUEST" block by `buildRepairSection`;
  repairs sample at **temperature 0** (`AI_TEMPERATURE` configures ordinary requests, default 0.2);
  the system prompt documents the contract (complete corrected json, keep valid operations, drop what
  cannot be valid into `unsupported`).
- UI: auto-repaired cards are tagged and report what was fixed; failed cards show the failing
  operation and a "Try to fix" button that sends the same feedback (a real repair, honest label);
  clarification options became actionable chips that send `Answer to "<question>": <answer>`;
  provider `usage` is surfaced per plan and per session.

**Verified:** `tsc --noEmit` clean; **163 unit/integration tests pass** (18 files; +21 over the
pre-session 142: 14 repair-policy/loop tests, 1 end-to-end repair test through the real server with a
mocked model, 3 server repair tests, 3 prompt/repair-block tests); `npm run build` passes (known
three.js chunk warning).

**Not verified here:** the two new browser checks in `e2e/slice6-ai.e2e.mjs` (auto-repair with the
repair request asserted at the network layer, and clarification chips) could not be executed in this
sandbox — no Chrome/Chromium binary is available (`CHROME_PATH` unset). They follow the existing
suite's conventions and should be run with `npm run e2e:all` on a machine with Chromium.

**Next ideas (not started):** stream partial plans for long designs; rotate to `deepseek-v4-pro` when
a plan fails validation twice (cost-aware escalation); server-side daily token budget; a golden-prompt
evaluation harness with buildability scoring.

---

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

**Merge with main:** after the slices above, merged `origin/main` (PR #4: wall type material
selector + colour rendering, Autodesk Revit API/APS audit, docs restructure) resolving conflicts in
README.md, package.json, docs/TESTING.md, docs/KNOWN_LIMITATIONS.md and docs/PROGRESS.md; both
feature sets preserved (`e2e:all` now includes the AI suite).

**Verified end-to-end (post-merge):** `tsc` clean; 142 unit/integration tests pass (16 files —
model + AI + server; the extra test over the pre-merge 141 is PR #4's material command regression);
`npm run build` passes; all six browser suites pass: slice1 18, slice2 11, slice3 14, slice4 9,
slice5 11, slice6-ai 8 — **71 checks** total, no console/page/request errors.

**Next task:** sections and dimensions when M4 lands (then the AI can offer them); streaming
progress for long plans; shared rate limiter for multi-instance deployments.

---

## Session 2026-10-12 — PR #4 branch synchronization with M4 elevation work

**Branch:** `arena/11b23c70-revit-web`. The wall-material/audit commit `4843cc7` was synchronized with `origin/main` at `9a28692` (including elevation implementation commit `1ad8a1d`) so PR #4 can be merged against current `main`.

**Conflict resolution:** preserved the wall material test hook and the elevation view-state hook in `src/App.tsx`/`src/vite-env.d.ts`; retained the upstream elevation decision and added the wall-material/APS decision as D14; reconciled limitations, testing and progress docs. M4 north/south/east/west derived read-only SVG elevations and their unit/browser tests are now present on this branch. `npm run e2e:all` covers five suites.

**Current feature work on this branch:**
- Wall type material assignment uses existing `WallType.materialId`; native Three.js walls resolve the project's display color. Selected and below-level appearance precedence remains intact. Schema stays v4.
- Official Autodesk Revit API/SDK and APS audit, mapping, prioritized plan, optional isolated APS POC design and no-go recommendation are in [`REVIT_API_AUDIT.md`](REVIT_API_AUDIT.md).
- README, scope, architecture, roadmap, testing and limitations now include current M4 elevation capabilities without implying RVT editing.

**Verification after syncing main:**

| Command | Outcome |
| --- | --- |
| `npm test` | 11 files, **95 tests passed**. |
| `npm run typecheck` | Passed (`tsc --noEmit`). |
| `npm run build` | Passed. Main JS chunk **774.50 kB** / **208.81 kB gzip**; Vite's >500 kB advisory remains. |
| `LD_LIBRARY_PATH=/tmp/al2023/lib CHROME_PATH=/tmp/chromium APP_URL=http://localhost:5173 npm run e2e:all` | Five suites passed: slice1 18, slice2 11, slice3 14, slice4 9, slice5 11 — **63 checks total**, no console/page/request errors. |
| `npm audit --omit=dev` | `found 0 vulnerabilities`. |

The full dependency audit previously reported 13 development-tree advisories (3 moderate, 8 high, 2 critical); `npm audit --omit=dev` reported zero production dependency vulnerabilities. No dependency upgrades or APS services/credentials were added. The browser environment uses the temporary Chromium binary at `/tmp/chromium` and libraries at `/tmp/al2023/lib`.

**Next product work:** M4 sections, view ranges, annotations and later sheets/exports. APS integration remains no-go without the documented approvals.

---

## Historical session — Revit/APS audit and wall material UI

Started from `ce68041c55cb47d950bf22d084ec54b326c44e19`. Inspected the schema v4 source, validation, commands, geometry, quantities, history, persistence and UI; wrote the official Autodesk API/SDK and APS audit; added the wall type material selector, color rendering, command test, browser test, and `npm run e2e:all`. Initial verification was 90 unit tests and 52 browser checks before main's elevation suite was integrated. The source commit was `4843cc734c126e2f259d9806c3bad18c659fdd05`.

---

## Historical main session — M4 elevations (2026-10-12)

Added `src/geometry/elevation.ts` and `src/ui/ElevationView.tsx`: generated north/south/east/west projections from canonical-derived geometry, level datums, read-only view tabs and ribbon commands. Added five projection unit tests and `e2e/slice5.e2e.mjs` (11 checks). At that point, upstream main reported 94 unit tests and 62 browser checks.

---

## Earlier historical session — M0–M3 foundation and schema v4

Earlier work implemented schema v3 materials/floors/rooms/columns, the professional workspace and schema v4 ceilings/hip roofs. At that stage the model was at 89 unit tests and 51 browser checks (17/11/14/9 across slices 1–4); wall material editing and the slice-5 elevation suite were added later.

## Earlier historical session — Slice 1

Implemented the initial integer-mm BIM model with hosted doors/windows, plan and 3D views, undo/redo, autosave and project JSON. See historical decisions in [`DECISIONS.md`](DECISIONS.md).
