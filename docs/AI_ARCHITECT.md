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

1. exposes `POST /api/ai/plan` (and `GET /api/ai/health`),
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
user prompt ──► POST /api/ai/plan ──► DeepSeek chat/completions (json_object)
   ▲                │                       │
   │        request limits, timeout,        │ validated JSON text
   │        rate limit, no secrets          ▼
   │                │              plan JSON (untrusted)
   │                ▼                       │
   └── UI panel ◄── typed errors      src/ai/planSchema.ts validation
         │                                  │
         │  preview: summary + ops          ▼
         │  Apply / Cancel / Retry   src/ai/applyPlan.ts (transactional:
         │                            all ops succeed or the model is
         ▼                            untouched) via model/commands.ts
   one history commit (undo/redo) + views regenerate + autosave
```

Project context sent to the model (`src/ai/context.ts`) is **compact and purpose-built**: level
names/elevations, type catalogues, an element inventory (id + kind + key dimensions, capped),
selection, active view, supported capabilities. It is never the whole serialized project and never
contains secrets or unrelated user data.

## 6. Automatic repair loop (failures are not dead ends)

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

## 7. Privacy, security and limits

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

## 8. Testing

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
- `server/mockModel.mjs` (`npm run mock:model`) — an offline stand-in for the model: it answers a
  build request with a deliberately rejectable plan and fixes it generically on the repair request,
  so the whole pipeline (including the repair loop) can be demonstrated and manually inspected
  without a key or a token budget. Covered by `aiRepairEndToEnd.test.mjs`.
- `server/manualTest.mjs` — **manual** integration test against the real DeepSeek API
  (`DEEPSEEK_API_KEY` required), never part of the automated suite.

## 9. Environment variables

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | server | — | DeepSeek API key. Never exposed to the browser. |
| `DEEPSEEK_MODEL` | server | `deepseek-flash` | Model id (`deepseek-flash`, `deepseek-v4-pro`, …). |
| `DEEPSEEK_BASE_URL` | server | `https://api.deepseek.com` | OpenAI-compatible base URL (tests point this at a mock). |
| `AI_TIMEOUT_MS` | server | `60000` | Upstream request timeout. |
| `AI_MAX_TOKENS` | server | `8000` | `max_tokens` for the completion. |
| `AI_TEMPERATURE` | server | `0.2` | Sampling temperature for ordinary requests (repairs always use 0). |
| `AI_RATE_LIMIT_PER_MIN` | server | `10` | Per-IP request budget per minute. |
| `AI_DEMO_PLANNER` | server | off | `1` = serve clearly-labelled deterministic demo plans when no API key is configured (preview/demo environments only). |
| `PORT` | server | `8787` | HTTP port (API + static SPA in production). |
| `SERVE_STATIC` | server | on | `0` disables serving `dist/` (API only). |

## 10. Known limitations

- Roof generation supports **rectangular hip roofs** only (the engine's only roof type); gable,
  shed, mansard and free-form footprints are reported as `unsupported` with the hip alternative.
- **Section views** and **dimension/annotation** tools do not exist in the engine yet (roadmap M4);
  the AI reports them as unsupported and offers elevations or 3D instead.
- Room boundaries are explicit polygons (no wall-derived room bounding yet — roadmap M6), so "make
  the kitchen larger" resizes the room's boundary and the AI may also move the bounding walls.
- The model can propose ill-fitting geometry; the executor refuses it with per-operation errors and
  leaves the model untouched (atomic). This is a feature: invalid AI output must never corrupt the BIM.
- Auto-repair fixes *reported* failures (shape and geometry), not judgement: a plan that is valid but
  architecturally poor still applies, so the preview and the assumptions remain the user's to review.
  Repairs cost one extra request (and are reported); set `maxAutoRepairs: 0` in `src/ai/repair.ts`
  callers to disable them.
