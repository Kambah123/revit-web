# AI Architect (DeepSeek) — architecture and integration design

Date: 2026-10-12. Status: implemented (slices A–G). This document is the design record for the
DeepSeek-powered AI Architect, written after auditing the actual repository.

## 1. Architecture audit (what exists)

Verified on branch `arena/673afcb7-revit-web` @ `9a28692` (clean tree). The application is a
React 18 + TypeScript + Vite + Three.js single-page app with **no backend**:

| Layer | Location | Notes |
| --- | --- | --- |
| Canonical model | `src/model/types.ts` | Schema v4, integer-mm units. Levels, materials, wall/floor/column/ceiling/roof/opening types, walls, hosted openings (doors/windows), floors, rooms, columns, ceilings, rectangular hip roofs. |
| Command layer | `src/model/commands.ts` | Every edit is a command (`addWall`, `updateWall`, `deleteWall`, `addOpening`, `addLevel`, `addRoom`, `addFloor`, `addColumn`, `addCeiling`, `addRoof`, type CRUD, …). Each commit runs whole-project validation and throws on invalid edits, leaving the input untouched. |
| Validation | `src/model/validation.ts` | Whole-project invariants (integer mm, unique ids, hosted-opening fit, level cascades, …). |
| Derived geometry | `src/geometry/` | Wall solids with cut openings, slabs, hip-roof solids (ridge along the longer axis), polygon helpers, elevation projections. Pure functions. |
| Views | `src/viewer/BimScene.ts`, `src/ui/ElevationView.tsx` | Plan + 3D from derived geometry; **four generated elevations** (north/south/east/west). Sections are **not implemented** (`view.section` is an honest ribbon stub). Dimensions/annotations are **not implemented** (stubs). |
| History | `src/app/history.ts` | Pure undo/redo over immutable snapshots; `commit` bumps `revision`. |
| Persistence | `src/persistence/autosave.ts`, `src/model/schema.ts` | Autosave + deterministic save format with v1→v4 migrations. |
| Workspace | `src/App.tsx`, `src/ui/`, `src/app/ribbon.ts` | Ribbon + command registry (single source of truth), project browser, properties palette, view tabs, status bar. |

**Actual supported modelling commands** (the AI may only drive these): levels (add/rename/elevate/
delete-with-cascade), wall types (add/update), walls (add/update/delete), doors and windows hosted
in walls (add/update/delete), floors, rooms, columns, ceilings, rectangular hip roofs (add/update/
delete with overhang + rise), materials and the other type catalogues (read/assign via patches), and
opening the generated views (plan per level, 3D, four elevations).

**Integration points** (no rewrite): the AI applies its plan through `src/model/commands.ts` exactly
like the UI does, commits one history entry via `src/app/history.ts`, and lets the existing effects
regenerate the 3D scene, elevations and autosave.

## 2. DeepSeek API research (verified 2026-10-12)

From the official docs (`api-docs.deepseek.com`) and pricing page:

- **Endpoint**: `POST https://api.deepseek.com/chat/completions` (OpenAI-compatible).
- **Current models**: `deepseek-flash` (DeepSeek-V4.1-Flash) and `deepseek-v4-pro`
  (DeepSeek-V4-Pro-0813). Legacy names `deepseek-chat` / `deepseek-reasoner` were retired on
  2026-07-24; `deepseek-v4-flash` still resolves to Flash but is a legacy name. Our default is
  `deepseek-flash`, configurable via `DEEPSEEK_MODEL`.
- **Structured output**: JSON Output is supported on both models —
  `response_format: {"type": "json_object"}` guarantees a valid JSON string. Official caveats: the
  prompt must contain the word "json" plus an example of the desired format; `max_tokens` must be
  set generously to avoid truncation; empty content can occasionally occur (we retry once, then
  surface a typed error). Tool calling and the Responses API (`json_schema`) are also supported.
  We use `json_object` + a full schema description in the system prompt + **local, authoritative
  validation** (`src/ai/planSchema.ts`); the response is never trusted as executable content.
- **Pricing** (per 1M tokens; peak = 01:00–04:00 and 06:00–10:00 UTC Mon–Fri, off-peak otherwise):
  `deepseek-flash` $0.30 in / $1.20 out peak, $0.15 / $0.60 off-peak ($0.006 / $0.003 cache-hit in);
  `deepseek-v4-pro` $1.32 / $3.96 peak, $0.66 / $1.98 off-peak. Prices change — treat as advisory.
- **Rate limits**: concurrency-based (2 500 concurrent for flash, 500 for pro per account; HTTP 429
  over the limit) rather than requests-per-minute. We still apply a conservative per-IP request
  budget in front of the API to protect the deployment's quota.

## 3. Deployment shape

The repo had no server, so the smallest maintainable backend was added: a **dependency-free Node
ESM server** (`server/`) that

1. exposes `POST /api/ai/plan` (buffered), `POST /api/ai/plan-stream` (server-sent events) and
   `GET /api/ai/health`,
2. reads `DEEPSEEK_API_KEY` **only** from the server environment,
3. serves the built SPA (`dist/`) in production alongside the API — one process, one origin,
4. is proxied by Vite in development (`vite.config.ts` proxies `/api` → `http://127.0.0.1:8787`).

No secrets ever appear in `VITE_` variables or browser code; the browser talks only to same-origin
`/api/ai/plan`.

## 4. The typed design plan (intermediate representation)

DeepSeek must return a **DesignPlan** — a validated, typed operation list, never code. The IR lives
in `src/ai/planTypes.ts`; the runtime validator in `src/ai/planSchema.ts`; the transactional
executor in `src/ai/applyPlan.ts`. Operations map 1:1 to real commands:

| Plan op | Command |
| --- | --- |
| `level.add` / `level.rename` / `level.setElevation` / `level.delete` | `addLevel` / `renameLevel` / `setLevelElevation` / `deleteLevel` |
| `wallType.add` | `addWallType` |
| `wall.add` / `wall.update` / `wall.delete` | `addWall` / `updateWall` / `deleteWall` |
| `opening.add` / `opening.update` / `opening.delete` | `addOpeningType` + `addOpening` / `updateOpening` / `deleteOpening` |
| `floor.add` / `floor.update` / `floor.delete` | `addFloor` / `updateFloor` / `deleteFloor` |
| `room.add` / `room.update` / `room.delete` | `addRoom` / `updateRoom` / `deleteRoom` |
| `column.add` / `column.update` / `column.delete` | `addColumn` / `updateColumn` / `deleteColumn` |
| `ceiling.add` / `ceiling.update` / `ceiling.delete` | `addCeiling` / `updateCeiling` / `deleteCeiling` |
| `roof.add` / `roof.update` / `roof.delete` (hip only) | `addRoof` / `updateRoof` / `deleteRoof` |
| `view.open` (plan / 3d / four elevations) | view-tab switching in the workspace |

`addOpeningType` / `updateOpeningType` were added to the command layer (mirroring `addWallType`) so
doors/windows of a requested size can be hosted; nothing else in the command layer changed.

Each plan also carries `summary`, `assumptions[]`, `clarifications[]` (missing critical
information), `unsupported[]` (requested features the engine cannot do — e.g. **sections**,
**dimensions/annotations**, non-hip roofs — each with the reason and a supported alternative) and
`operations[]`. Length fields accept numbers (mm) or strings ("600 mm", "3.5 m", "10 ft", "18 in");
they are converted to integer millimetres by `src/ai/units.ts` with range checks.

References: `{ id }` (existing element), `{ opId }` (element created earlier in the same plan) or
`{ name }` (levels, rooms, types by name). Updates preserve stable identities — `wall.update` by id
never recreates the wall.

## 5. Request flow

```
user prompt ──► POST /api/ai/plan-stream ──► DeepSeek chat/completions
   ▲            (or, if unavailable,       (json_object; stream:true on the
   │             POST /api/ai/plan)         streaming route)
   │                    │                            │
   │                    │              start / delta* / done | error   ◄── progress
   │                    ▼                            ▼
   │          request limits, timeout,        json text (untrusted)
   │          rate limit, no secrets                 │
   │                    │                            ▼
   │                    │              src/ai/planSchema.ts validation
   │                    ▼                            │
   │            typed errors                         ▼
   │                    │              src/ai/applyPlan.ts (transactional dry run:
   │                    │              all ops succeed or the model is untouched)
   │                    │                            │
   │                    │              rejected? ──► repair request (once) ──┐
   │                    │                            │                       │
   │                    │                            ▼                       │
   │                    │              src/ai/applyPlan.ts on Apply          │
   └──── UI panel ◄─────┴── preview: summary + ops, Apply / Cancel / Retry ◄─┘
         │
         ▼
   one history commit (undo/redo) + views regenerate + autosave — via model/commands.ts
```

Project context sent to the model (`src/ai/context.ts`) is **compact and purpose-built**: level
names/elevations, type catalogues, an element inventory (id + kind + key dimensions, capped),
selection, active view, supported capabilities. It is never the whole serialized project and never
contains secrets or unrelated user data.

## 6. Streaming plans (progress you can watch, and cancel)

A large design can take 30–60 s to write, which is a long time to stare at "thinking…". The plan is
therefore also available as a **server-sent event stream**, and the UI shows operations appearing as
the model writes them.

```
POST /api/ai/plan-stream        (same request body as /api/ai/plan, including `repair`)
  event: start   data: {"model": "...", "repairing": false}
  event: delta   data: {"text": "{\"kind\":\"design-plan\",..."}     (many)
  event: done    data: {"plan": {...}, "model": "...", "demo": false, "usage": {...}}
  event: error   data: {"code": "ai_bad_response", "message": "..."}   (terminal, instead of done)
```

- **One envelope, two transports.** The `done` payload is identical to the buffered response, and the
  plan is parsed and sanity-checked server-side in both cases. The client's validator (and the repair
  loop) never branch on transport: `requestAiPlanStream` returns the same `PlanRequestResult`.
- **Progressive display, never progressive trust.** `src/ai/partialPlan.ts` scans the incoming json
  incrementally and reports only *complete* operation objects ("7 operations so far" + the newest
  labels). It is tolerant by design — partial frames, prose containing braces and malformed fragments
  are skipped, never thrown — and it is display-only: the finished json still goes through
  `planSchema.ts` and `applyPlan.ts` before anything is applied.
- **Fallback is automatic and invisible.** The client uses the buffered route when the stream route
  is missing (404/405), streaming is switched off (`AI_STREAM=0` → 501), the response is not an event
  stream, nothing arrived before the connection ended, or the request failed to connect. A deployment
  that only has `/api/ai/plan` (or a proxy that buffers the stream away) keeps working — users just
  don't see progress.
- **The timeout is an inactivity budget.** It is re-armed on every delta, so a slow but live stream is
  never cut off for being long.
- **Cancelling stops token spend.** The panel's Cancel aborts the fetch; the server sees the client
  disconnect (`res.on("close")`) and aborts the upstream DeepSeek request, so a cancelled plan is not
  paid for in full. Cancellation is reported as a status line ("nothing was applied"), never as an
  error.
- **Repairs stream too**, with the same `temperature: 0` rule, so a fix is watched the same way.
- **Empty streams cost nothing twice.** If the model produced no content at all (a known intermittent
  JSON-mode behaviour), the server retries once buffered; a stream that already delivered text is
  never silently re-requested.

## 7. Automatic repair loop (failures are not dead ends)

A plan can be rejected in two places: `planSchema.ts` (the json does not match the IR) and
`applyPlan.ts` (it parses, but the geometry does not fit the real model). Both used to be terminal
for the user — they are now a single, bounded, self-correcting round trip.

```
attempt 1 ──► plan valid?  ── yes ──► preview → Apply
                  │ no
                  ▼
        validator messages + the rejected json (as validated, lengths in mm)
                  │
                  ▼
              attempt 2 (repair, temperature 0)
                  │
        valid → the repaired plan replaces the failed one, tagged "auto-repaired" and reported
        invalid → the failure is shown with per-operation detail and a "Try to fix" button that
                  sends the very same feedback again (a genuine repair, not a re-roll)
```

- **One extra request, hard-capped.** `MAX_AUTO_REPAIRS = 1` in `src/ai/repair.ts`; a repair request
  is never itself auto-repaired, so a prompt cannot loop and cost cannot run away. A repair is only
  attempted when there is something to report (`buildRepairPayload` returns null when no validator
  message exists).
- **The feedback is the validator's own words.** `operation 2 (opening.add): Window 2000 x 1200
  would fall outside its host wall.` — machine-generated, specific, and already precise enough to fix.
- **The json echoed back is the json the validator saw**: the *parsed* plan (lengths normalized to
  integer millimetres) when it parsed, the raw response when it did not. It stays data: the server
  echoes it into the prompt, never executes it.
- **Feedback is bounded**: at most 12 messages, 300 characters each, whitespace-collapsed and
  de-duplicated (`boundRepairErrors`); the server re-validates the same bounds (401/400 on abuse).
- **Sampling changes for repairs**: `temperature: 0` so the model satisfies the listed problems
  instead of redesigning (`AI_TEMPERATURE` sets the ordinary value, default 0.2).
- **Repairs are disclosed, never silent.** The card is tagged `auto-repaired`, names the first fixed
  problems, and reports how many extra requests it took. Request counts and tokens (session and
  per plan) are shown in the panel, taken from the provider's `usage`.
- **Clarifications are actionable.** A plan that asks a question with `options` renders them as
  chips; clicking one sends `Answer to "<question>": <answer>` as the next turn, so the
  clarification loop closes without retyping.

The system prompt documents the contract ("REPAIR REQUESTS"): return the complete corrected json,
keep every operation that was already valid, never repeat a listed mistake, and if an operation
cannot be made valid, drop it into `unsupported` with an alternative — a smaller valid plan beats an
invalid one.

## 8. Privacy, security and limits

- `DEEPSEEK_API_KEY` is read from server env only; responses and logs never include it.
- Request validation: message ≤ 4 000 chars, history ≤ 30 turns, context ≤ 40 000 chars, body ≤ 256 kB.
- Repair block validation: ≤ 20 messages of ≤ 500 chars each, rejected json ≤ 40 000 chars, echoed as
  data only. It is untrusted text in the prompt (bounded and never executed), like any user message.
- Per-IP sliding-window rate limit (default 10 requests/minute, `AI_RATE_LIMIT_PER_MIN`).
- Upstream timeout (default 60 s, `AI_TIMEOUT_MS`) with `AbortController`; typed error codes:
  `ai_not_configured`, `ai_bad_request`, `ai_rate_limited`, `ai_timeout`, `ai_upstream`,
  `ai_bad_response`.
- The model response is data: parsed, schema-validated, geometry-checked by the existing command
  validation before anything touches the canonical model. No code execution, no raw model writes.
- Conceptual-design disclaimers: the UI and the system prompt state that outputs are conceptual
  design, **not** building-code compliance or professional engineering.

## 9. Testing

- `src/__tests__/aiUnits.test.ts` — unit conversion (mm/cm/m/ft/in) and dimension validation.
- `src/__tests__/aiPlanSchema.test.ts` — plan parsing, malformed/unsupported responses.
- `src/__tests__/aiApply.test.ts` — new-building generation, hip roof on an existing building,
  room modification, host relationships for doors/windows, atomic recovery, undo/redo, stable ids.
- `src/__tests__/aiContext.test.ts` — compact context, no whole-project leak.
- `src/__tests__/aiServer.test.mjs` — server request validation, rate limiting, timeout, upstream
  error mapping, API-key protection, demo planner labelling (DeepSeek mocked over local HTTP).
- `e2e/slice6-ai.e2e.mjs` — browser workflow with the `/api/ai/plan` response mocked at the
  network layer: prompt → preview → apply → real walls/rooms in the canonical model → undo.
- `src/__tests__/aiRepair.test.ts` — error bounding, repair payloads, and the loop against a fake
  transport (schema-invalid, unbuildable via the real `applyPlan`, budget exhausted, transport error).
- `src/__tests__/aiRepairEndToEnd.test.mjs` — the loop across the real boundary: client ⇄ request body ⇄
  server (validation + prompt assembly) ⇄ mocked DeepSeek, asserting the problems and rejected json
  reach the model and the repaired plan applies as verified geometry.
- `src/__tests__/aiPartialPlan.test.ts` — the incremental json scanner: partial frames, prose
  containing braces, malformed operations, and the safe label fallback.
- `src/__tests__/aiStream.test.mjs` — the SSE route against a mocking upstream: frame order, the
  identical `done` envelope, streamed repairs, mid-stream errors, request validation before any
  stream is opened, the empty-stream buffered retry, and `AI_STREAM=0`.
- `src/__tests__/aiStreamClient.test.mjs` — the client against the real server: incremental deltas
  reassembling byte-for-byte, the inactivity timeout, every fallback trigger (no route, 501, empty
  stream), and that cancelling aborts the upstream request rather than just the rendering.
- `server/mockModel.mjs` (`npm run mock:model`) — an offline stand-in for the model: it answers a
  build request with a deliberately rejectable plan and fixes it generically on the repair request,
  so the whole pipeline (including the repair loop and both transports: it speaks SSE when asked to
  stream) can be demonstrated and manually inspected without a key or a token budget. Covered by
  `aiRepairEndToEnd.test.mjs`.
- `server/manualTest.mjs` — **manual** integration test against the real DeepSeek API
  (`DEEPSEEK_API_KEY` required), never part of the automated suite.

## 10. Environment variables

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | server | — | DeepSeek API key. Never exposed to the browser. |
| `DEEPSEEK_MODEL` | server | `deepseek-flash` | Model id (`deepseek-flash`, `deepseek-v4-pro`, …). |
| `DEEPSEEK_BASE_URL` | server | `https://api.deepseek.com` | OpenAI-compatible base URL (tests point this at a mock). |
| `AI_TIMEOUT_MS` | server | `60000` | Upstream request timeout. |
| `AI_MAX_TOKENS` | server | `8000` | `max_tokens` for the completion. |
| `AI_TEMPERATURE` | server | `0.2` | Sampling temperature for ordinary requests (repairs always use 0). |
| `AI_RATE_LIMIT_PER_MIN` | server | `10` | Per-IP request budget per minute. |
| `AI_STREAM` | server | on | `0` disables `POST /api/ai/plan-stream` (clients fall back to the buffered route). |
| `AI_DEMO_PLANNER` | server | off | `1` = serve clearly-labelled deterministic demo plans when no API key is configured (preview/demo environments only). |
| `PORT` | server | `8787` | HTTP port (API + static SPA in production). |
| `SERVE_STATIC` | server | on | `0` disables serving `dist/` (API only). |

## 11. Known limitations

- Roof generation supports **rectangular hip roofs** only (the engine's only roof type); gable,
  shed, mansard and free-form footprints are reported as `unsupported` with the hip alternative.
- **Section views** and **dimension/annotation** tools do not exist in the engine yet (roadmap M4);
  the AI reports them as unsupported and offers elevations or 3D instead.
- Room boundaries are explicit polygons (no wall-derived room bounding yet — roadmap M6), so "make
  the kitchen larger" resizes the room's boundary and the AI may also move the bounding walls.
- The model can propose ill-fitting geometry; the executor refuses it with per-operation errors and
  leaves the model untouched (atomic). This is a feature: invalid AI output must never corrupt the BIM.
- The incremental stream card (operations appearing while the model writes, and the Cancel button) is
  covered at the protocol level by `aiPartialPlan`/`aiStreamClient` tests, but the browser suite cannot
  assert it: Puppeteer's request interception delivers a whole body at once, so `e2e/slice6-ai.e2e.mjs`
  verifies only that the client tries the stream endpoint first and falls back cleanly.
- Auto-repair fixes *reported* failures (shape and geometry), not judgement: a plan that is valid but
  architecturally poor still applies, so the preview and the assumptions remain the user's to review.
  Repairs cost one extra request (and are reported); set `maxAutoRepairs: 0` in `src/ai/repair.ts`
  callers to disable them.
