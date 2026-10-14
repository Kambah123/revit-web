# Technical blueprint: a Synaps-inspired architectural canvas

**Status:** proposed architecture, not implemented · **Date:** 13 October 2026
All technical choices below are recommendations for **our product**, not claims about Synaps' private implementation. For observed/documented target behavior, see the [research report](README.md) and [sources](SOURCES.md).

## 1. Product boundary

Build a browser-based design and presentation workspace for early architectural work. Keep editable geometry authoritative, expose precision/scale clearly, and help users move from a brief or source drawing to a checked visual deliverable.

Initial non-goals:

- Full BIM authoring parity with Revit, native RVT editing or construction-code certification.
- A proprietary trained Vecy replacement; no access to Synaps' training data or weights is assumed.
- Lossless conversion of arbitrary DWG, IFC, PDFs or images to semantic BIM.
- Photorealistic image edits that silently change walls or engineering quantities.
- Real-time collaboration implemented by blindly synchronizing entire project snapshots.
- Copying Synaps code, branded assets, templates or licensed libraries. Preserve this repository's clean-room policy.

## 2. Baseline-to-target gap matrix

“Present” means found in our source and covered by the current baseline tests to their existing extent; it does not imply production readiness or full Synaps parity.

| Capability | Current source | Gap / action | Priority |
| --- | --- | --- | --- |
| Canonical building model | `src/model/types.ts`, schema v4, integer mm | Keep; extend via migrations, not meshes. | Preserve |
| Validated changes | `src/model/commands.ts`, `validation.ts` | Keep; add atomic document/model transactions. | Preserve |
| Undo/redo | `src/app/history.ts`, max 200 snapshots | Fine for local MVP; later use operation-based history for collaboration. | Preserve → extend |
| 2D/3D | `src/viewer/BimScene.ts`; SVG elevations | Keep native renderer; add annotation/reference overlay and persisted camera/view records. | P0 |
| Precision drafting | Straight wall drawing and existing tool state | Add input-driven lengths/angles, richer snaps, transform handles and multi-selection. | P0 |
| Wall topology | Endpoint join discovery; overlapping solids at joins | Robust T/corner junctions, alignment and layer-aware plan geometry. | P0/P1 |
| Rooms | Explicit polygons, shoelace area | Keep manual rooms; add bounded-room mode tied to wall topology. | P1 |
| Doors/windows | Hosted rectangular openings and fit checks | Swing/handing, symbol geometry, frame controls and join-edge cases. | P0/P1 |
| Lines/shapes/annotation | No general drawing schema | Add independent drawing primitives, text and dimensions. | P0 |
| Layers/groups/blocks | Element browser, not a compositional canvas tree | Add visibility/lock/z-order, containers and reusable instances. | P0/P1 |
| Papers/export | App JSON only | Scale-aware sheet model + vector PDF; raster exports; DXF adapter. | P0/P1 |
| Import | Versioned app JSON | Image/reference workflow first; DXF subset next; PDF choices later. | P1 |
| AI editable plans | `src/ai/*`, DeepSeek adapter, preview/apply | Preserve validator; add constraints, immutable proposal base, alternatives and quality checks. | P1 |
| AI tracing | Absent | Region review, calibration, geometry reconstruction and human correction. | P2 |
| Render/media editing | Display colors, no image pipeline | Camera records, media lineage, jobs, provider adapters and image tools. | P2 |
| Persistence | One localStorage autosave slot | Multi-project IndexedDB + storage quotas; server persistence later. | P0/P3 |
| Teams/auth/comments | Absent | Identity, project ACLs, audit, durable events, invites and comments. | P3 |
| Multiplayer | Absent | Authoritative operations and revision handling; then presence/reconnect/undo. | P3 |
| Asset library | Built-in display materials only | Licensed/original symbols; optional 3D counterparts; safe imports. | P1/P2 |
| Design branches | Absent | Explicit immutable variants; node-graph UI only if user research justifies it. | Later |

Local evidence: [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md), [`types.ts`](../../../src/model/types.ts), [`history.ts`](../../../src/app/history.ts), [`autosave.ts`](../../../src/persistence/autosave.ts), [`AiArchitectPanel.tsx`](../../../src/ui/AiArchitectPanel.tsx).

## 3. Workspace design

### Proposed information architecture

```text
Project dashboard
  Recent projects · Local/cloud status · New / Import / Generate

Editor
  Top bar: project name · save/sync state · undo/redo · import/export · share
  Left: project pages/levels · searchable object tree · asset library
  Centre: pan/zoom architectural canvas · sheets · references · images
  Bottom: compact drawing tools · contextual command input
  Right: selected object properties OR camera/image actions
  Status: units · scale · snap state · cursor position · job status
```

The follow-up [visual audit of 18 user-supplied screenshots](VISUAL_AUDIT.md) now provides a concrete desktop reference. Refine this arrangement into two workspace presentations: blue-accent drawing with approximately 280 px docked sidebars, and orange-accent media/camera work with floating cards. Keep a separate panel-hidden state. Place the project header at left and sharing actions at right rather than introducing a full-width ribbon. Inspector content must reflect active creation tools as well as selected objects. The generation composer occupies the bottom toolbar area. These are visual observations and design recommendations, not verified transition behavior. Exact fonts/colors, animations and responsive layouts remain unmeasured.

### Interaction rules

- Geometry tools operate in model units. Paper sizing is physical millimetres. Zoom is screen-only.
- Selection drives controls: wall → construction; opening → dimensions/handing; camera → render; image → image tools.
- Distinguish building **levels**, freeform document **pages**, and printable **sheets**. Do not use “floor” for all three.
- A generated image is labelled as a snapshot, with its source model revision and camera. Mark it stale after the source changes; never silently replace it.
- Show pending/error/offline states. Unsupported functions stay hidden or explain their scope—no decorative buttons that claim to work.
- Expose command search and keyboard navigation; property inputs must not trigger global shortcuts while typing.
- Preserve the existing shortcut profile initially. Synaps uses `V` Select, `D` Dimension, `F` Paper, `S` Scale; our current app uses `S` Select, `D` Door and `F` Floor. Introduce an explicit selectable profile rather than silently reassigning keys. [Target shortcuts](https://docs.synaps.app/reference/shortcuts-and-gestures.md)
- Test mouse and trackpad separately; screen-reader names for commands; visible focus and reduced-motion support. Keep the local desktop editor the initial target; phone editing is a separate scope.

## 4. Architecture: evolve, do not replace

```text
React workspace / pointer tools / command palette
                    |
          intent / domain transaction
                    v
       schema + authorization + validation
                    |
     immutable building model + document model
          /             |                 \
 plan/3D geometry    sheet projection    job input snapshot
          |             |                 |
 Three.js + overlay  PDF / DXF / PNG    worker/provider
          |                               |
      display only               typed proposed result
                                         |
                          validate → preview → user accept
```

### Keep these boundaries

1. **Semantic building model:** walls, levels, openings and quantities remain in `src/model`. Geometry and meshes stay derived.
2. **Document composition:** a separate typed model holds drawings, annotations, references, sheets, cameras and image placements. It references building objects instead of duplicating them.
3. **Session state:** active tool, selection, open panels, transient hover and collaborator presence are not canonical geometry.
4. **Persistent media:** binary files live in IndexedDB/object storage, not base64 blobs inside every undo snapshot.
5. **AI providers:** providers return typed data or media; never execute arbitrary model-generated JavaScript.
6. **Network boundary:** browser calls relative `/api/...`; provider keys remain server-side. Preserve Vite's same-origin proxy pattern.

### Renderer decision

Keep Three.js and the current plan/3D projection. Add a dedicated orthographic overlay for crisp annotations, sheet frames and reference-image interaction. Benchmark an SVG overlay on modest scenes before selecting a GPU-backed 2D renderer for large documents. Avoid a speculative full canvas rewrite or introducing a second scene graph library that duplicates selection/history.

Move parsing, topology recomputation and expensive export into workers. Use spatial indexing and dirty-element updates rather than rebuilding the entire scene per pointer move. Extract camera, picking and tool-state responsibilities from the large `BimScene` incrementally, with behavior tests.

## 5. Data model and migration design

Introduce a versioned document envelope alongside the existing model. Decide the final serialization layout in a small ADR before schema work. An illustrative shape—not production code:

```ts
type WorkspaceDocument = {
  format: "architecture-canvas";
  version: 1;
  building: Project;             // existing schema/migrations retained
  pages: CanvasPage[];
  nodes: Record<NodeId, CanvasNode>;
  views: Record<ViewId, SavedView>;
  assets: Record<AssetId, AssetMetadata>;
};
```

Suggested node types:

| Type | Persisted fields / constraints |
| --- | --- |
| `DrawingPrimitive` | Line/polyline/arc/circle, stroke/fill, layer; finite bounded coordinates. Curves are defined mathematically, not as screen samples. |
| `Text` / `Dimension` | Text style; dimension endpoints, orientation, offset and display format. Static first; associative attachments require an explicit later contract. |
| `BuildingView` | Model/level/view reference and canvas transform. Do not rescale the canonical building when resizing a view on a page. |
| `Sheet` | Physical dimensions, orientation, viewport/source, scale denominator, title block and content references. |
| `ReferenceImage` | Asset ID, dimensions, transform, calibration transform/status, opacity and lock state. |
| `Camera` | Model-space pose, target/FOV/clipping and source view. |
| `GeneratedImage` | Asset ID, source snapshot hash, camera ID, job ID, parent image ID, prompt reference and timestamp. |
| `Group` / `BlockInstance` | Child IDs or definition ID, transform, inherited visibility/lock. Reject cycles and illegal containment. |
| `Variant` | Parent variant/snapshot ID, immutable model/document snapshot reference, user label; no automatic merge initially. |

Geometry uses integer millimetres at the model boundary. Rotations, curve parameters, camera angles, image UVs and screen transforms have explicit representations; never repeatedly round during pointer preview. Commit once with tolerance-aware validation. Persist the image-pixel-to-model calibration transform independently of viewport zoom.

### Building extensions

- Wall type: ordered layers with thickness/material, stable IDs and one designated core; alignment explicit. Migrate each current wall type to one core layer preserving total thickness/material.
- Opening: handing/swing configuration and frame depth as explicit parameters, with legacy-compatible defaults.
- Room: retain current manual polygon mode; add `bounded` mode with topology references and derived outline. Broken boundaries become visible invalid states, not silently filled rooms.
- Maintain legacy v1–v4 loaders. Offer native project export independent of deliverable export. Do not promise new-format files open in old versions of the app.
- Persist asset metadata and binary references; package assets into a portable project archive only with manifest, path validation, size caps and checksums.

### Avoid a revision trap

The current history reducer restores old snapshots on undo; `Project.revision` is therefore not a globally monotonic event sequence. Do **not** use it alone as a concurrency or AI stale-result token. Introduce a document content hash or a monotonic session change token for local proposals, and a distinct server-assigned version for shared documents. Tests must cover edit → undo → divergent edit at the same numeric project revision.

## 6. Precision and geometry work

### Walls and openings

- Convert wall centreline intersections into a planar junction graph; split edges logically at T/cross junctions while maintaining stable wall identity.
- Compute offset boundaries and bounded joins with a documented tolerance; distinguish near misses from intended connections.
- Render construction layers consistently at L/T/cross joins; define supported corner rules before promising all wall conditions.
- Keep openings hosted by wall distance, not world mesh coordinates; revalidate fit after wall shortening or type changes.
- Test short segments, acute angles, nearly collinear walls, reversed orientation, coincident walls, adjacent openings and zero-length moves.

### Rooms

Use planar face extraction from joined room-bounding walls. Define net-area convention explicitly (e.g. inside finished face); current polygon area is not automatically net usable area. Keep level separation, courtyard holes and disconnected boundaries explicit. Recompute affected faces after accepted wall edits; use stable room matching rules to preserve labels where possible. If one room splits or two merge, ask/flag rather than guessing ownership.

### Dimensions

Ship static dimensions honestly first, matching the documented target limitation. An optional later associative dimension references feature IDs; broken attachments produce warnings. At 1:100, a 10,000 mm span must occupy 100 mm on an exported sheet. Test physical geometry, font embedding and line-weight units, not just a screenshot comparison.

## 7. File interoperability

### Stage 1: references and PDF output

Support raster reference placement, lock/opacity, known-length calibration and independent scale validation. Export vector linework and text to PDF from the canonical drawing projection, not a viewport screenshot. Use raster export only when requested. Test crop boundaries and multiple sheets.

### Stage 2: documented DXF subset

Implement an adapter against the public format, with a published support matrix. Start with LINE, LWPOLYLINE, ARC, CIRCLE and basic TEXT plus units/layers. Subsequent support for blocks, hatches and dimensions must have fixtures before being advertised.

- Never assume arbitrary DXF line pairs are semantic walls. Import them as editable primitives; offer an explicit, previewed conversion workflow.
- Unknown units require a user choice and known-length check.
- Report unsupported entity counts and retained/skipped content. No silent “success” with missing architecture.
- Import/export round-trip tests should compare the supported geometry with tolerances, not require byte equality.
- Use licensed/public fixtures; independently inspect output in a recipient CAD tool.

### Stage 3: PDF/SVG

Keep **place as reference**, **vector extraction**, and **semantic tracing** distinct. Extracted vectors are not guaranteed walls. Sanitize SVG (scripts, event handlers, external references and foreign objects); rasterize in isolation when safety cannot be established. Bound PDF pages, image dimensions, decompression ratios and processing time. Do not fetch external resource URLs from imported files.

DWG/IFC/RVT remain separate product decisions requiring their own compatibility, licensing and security reviews. Do not broaden the current Revit integration claims.

## 8. AI design

### A. Editable floor-plan generation

Retain `DesignPlan` and `applyPlan`. Extend the request with typed programme constraints: boundary, room counts, target areas, adjacency, minimum widths and units. These are inputs for generation and deterministic checking, not a claim of regulatory compliance.

Pipeline:

1. Snapshot model/document state and hash it.
2. Validate the requested programme and detect impossible constraints where practical.
3. Ask an LLM for a constrained structured proposal; optionally use deterministic layout search/constraint solving for geometric placement.
4. Validate schema, references, bounds, intersections, opening fit, circulation assumptions and room-area targets.
5. Preview changes and unmet constraints. Ask for missing information rather than silently inventing site conditions.
6. On acceptance, verify the base snapshot is current, revalidate, and apply one transaction. Otherwise regenerate/rebase visibly.

The existing DeepSeek interface is a useful adapter, **not equivalent to a specialized architectural generation model**. Use deterministic seeded fixtures for tests and a separately consented benchmark corpus for quality. Do not report model performance from demo plans.

### B. Tracing

Start with reference/manual tracing before promising automation. Automated stages: safe decode → page/region review → optional line/opening/text detection → calibrated pixel-to-model conversion → graph cleanup → semantic candidates → validation → overlay comparison → accept/reject.

A vision model can propose candidates; a topology/geometry layer must make them internally consistent. Preserve confidence and source coordinates. Low-confidence items stay marked. OCR text is untrusted content, never an instruction to the AI agent or a reason to bypass validation.

A paid/provider-backed trace only starts after explicit confirmation of all regions and estimated cost. Partial completion must identify failed regions without charging or reapplying successful ones twice.

### C. Visualisation and image editing

First persist cameras and produce reproducible local 3D snapshots. Add photorealistic providers only after a job pipeline exists. A renderer can use image/depth/mask inputs from the native model, but output remains non-authoritative media.

Store prompt, source hash, seed/model where available, provider version, output dimensions and parent image. Store sensitive prompt contents only when necessary, with access and retention rules. Masks use image coordinates and must be invalidated or recomputed after replacements that change the picture.

### D. Asynchronous jobs

Proposed states: `queued → running → succeeded | failed | cancelled`; distinguish `cancel_requested` when a provider cannot guarantee cancellation. Persist idempotency keys, timestamps, input hash, accepted output ID and sanitized errors. Poll/SSE progress over same-origin APIs. Retry transient errors with bounded backoff; never automatically repeat a charged action without a clear rule and user disclosure.

Reserve estimated credit/cost atomically, settle once on the defined billing event, and release/refund according to a written policy. Network retries must not create duplicate charges. Undo changes the document; it does not cancel provider work or imply a refund.

### E. Evaluation before launch

Use synthetic/consented plans with held-out examples. Track wall/opening correctness, dimension error after calibration, invalid intersections, connectivity, boundary compliance, room counts/areas, repair time, cost and latency distributions. For images, evaluate preservation of openings, viewpoint and layout independently of aesthetics. A passing schema validator is not a quality score.

## 9. Persistence and multiplayer

### Local first

Replace single-slot localStorage with IndexedDB project metadata, snapshots and binary asset stores. Keep native file export as an escape hatch. Migrate the autosave only after a verified new write; leave recovery bytes until successful reopening. Handle quota failures and tab conflicts visibly. Back up before schema migrations.

### Hosted first, multiplayer second

Recommended initial backend: a TypeScript/Node API, PostgreSQL for projects/memberships/revisions/jobs, and private object storage for media. Managed auth/Postgres can shorten setup, but provider selection is not finalized. Preserve the existing backend until the first hosted slice proves necessary.

Authorization must be checked on **every** project read/write, asset download/upload, job and invite. Include tenant/project IDs in authorization decisions, not just user-supplied filters. Owner/editor/viewer roles are sufficient initially; commenter is a distinct later feature if needed. Sharing a link is not an authorization grant by itself.

For collaborative geometry, start with a server-authoritative ordered transaction stream:

- Each operation includes document ID, operation ID, expected server version and typed payload.
- The server authorizes, deduplicates, validates against its current state, commits durably, advances version and broadcasts.
- On conflict, reject or deterministically rebase supported independent operations. Never apply a stale whole snapshot over somebody else's work.
- Reconnect uses the last acknowledged version and queued operation IDs; presence is ephemeral, rate-limited and expires.
- Remote deletion of a wall invalidates hosted-opening operations; do not resurrect the wall through a stale client snapshot.
- Collaborative undo is an authorized compensating operation, not restoring an old whole-project snapshot.

A CRDT library such as Yjs is a candidate for text/comments/presence or a later document layer. It is **not** a substitute for cross-entity geometric constraints, transaction validation or authorization. Prototype convergence under randomized event ordering before choosing broad CRDT storage.

## 10. Security and operations gates

The current AI proxy is not a complete multi-tenant SaaS backend. Before public deployment:

- Add authentication, project authorization, durable per-user/workspace quotas and spending limits. Configure trusted reverse-proxy handling rather than trusting arbitrary forwarded-IP headers for rate limiting.
- Validate request/result schemas server-side at the authoritative write boundary; enforce size/operation-count/time limits.
- Keep model-provider secrets server-side. Never log authorization headers, session tokens, source plans or full prompts by default.
- Isolate parsing and uploads; validate MIME/content, pixel dimensions, file sizes, filenames, SVG/PDF behavior and external references. Sign short-lived asset URLs after ACL checks.
- Prefer privacy-preserving defaults: no training reuse or optional analytics without an explicit, documented policy and necessary consent. Record provider retention/subprocessor choices; include client confidentiality requirements and relevant local data-protection review.
- Backups plus tested restoration; object lifecycle cleanup; migration rollback; audit trail for sensitive changes.
- Budget monitoring for AI jobs; timeouts; circuit breakers; dead-letter handling; failure messages that do not reveal credentials.
- Re-audit development dependencies before public hosting; this pass did not remediate the previously documented tooling advisories. Keep preview servers private.

## 11. Milestones with acceptance gates

Effort ranges are **planning estimates**, not measured commitments. Assume one experienced full-time full-stack/graphics engineer, access to design/architect review, existing model retained, and no custom model training. Phases are largely sequential; backend/AI work can overlap only with additional engineering capacity. Account for discovery and contingency before setting dates.

| Phase | Scope and likely code areas | Estimate | Exit criteria |
| --- | --- | --- | --- |
| 0 — Evidence/design lock | Authorized walkthrough, synthetic reference fixtures, ADRs, baseline screenshots; `docs/research`, `e2e` | 3–5 days | Agreed MVP, independent asset policy, measured interaction references and explicit unsupported list. |
| 1 — Canvas/doc foundation | Workspace shell, multi-selection, initial document schema, project dashboard/IndexedDB; `src/ui`, `src/document`, `src/persistence` | 2–3 weeks | Existing projects load; core wall/3D/AI flows unchanged; create/reopen multiple projects; undo works across document changes; keyboard tests pass. |
| 2 — Drafting and sheets | Primitives, static dimensions/text, first wall/junction improvements, A-series paper/PDF; model/geometry/viewer/export | 4–6 weeks | A3/1:100 deliverable is physically accurate; hosted openings remain valid; no data loss through save/reopen/undo. This is the first usable local release. |
| 3 — Topology/import/library | Bounded rooms, layer-aware joins, reference calibration, DXF subset, basic licensed blocks | 4–7 weeks | Room updates tested at L/T joins; DXF supported subset round-trips; unsupported entities reported; import security/scale checks pass. |
| 4 — AI proposals/variants | Boundary/programme validation, stale-base protection, constrained preview, independent alternatives | 2–4 weeks | Invalid plans cannot commit; results need human acceptance; divergent edit/undo case handled; no fabricated quality claims. |
| 5 — Cameras/media/trace | Saved camera, native snapshots, provider job pipeline, one render tool and one image-edit flow; tracing pilot behind a flag | 4–8 weeks | Output lineage survives reopen; retries/cancellation safe; privacy/cost rules visible; tracing benchmark and correction workflow demonstrated. |
| 6 — Hosted collaboration | Auth/ACLs, durable sync, invites, comments, presence, shared undo strategy | 4–8 weeks | Two-editor tests, unauthorized-access tests, reconnect/deduplication, backups and quotas pass. |
| 7 — Hardening | Larger fixtures, accessibility, dependency upgrades, operational tests and release review | 2–4 weeks | Published performance/compatibility limits and a tested incident/restore process. |

Broad sum: roughly **23–41 engineering weeks plus initial discovery** for this scope, with high uncertainty around geometry, tracing and multiplayer. A deliberately narrower local demo can arrive far sooner; it must not be sold as full Synaps parity. GPU/provider spend and commercial file-format licensing are additional and not estimated without volume/provider decisions.

### Suggested first implementation issue

**“Canvas foundation without model regression”**

1. Add a document envelope and migration tests while preserving old JSON open/save behavior.
2. Add a compact canvas shell behind an explicit feature flag; retain the current workspace as a fallback until tests pass.
3. Reuse the existing command registry and property editors; no dummy tool actions.
4. Add one calibrated reference-image item and one paper frame as the first document objects.
5. Demonstrate wall drawing, selection, opening fit, undo/redo, native 3D, file save/open, and existing AI preview in the new shell.
6. No cloud auth, billing, tracing provider or pixel-perfect marketing-site recreation in this issue.

## 12. Verification plan

| Layer | Required examples |
| --- | --- |
| Model/schema | Legacy v1–v4 migration, single-layer wall conversion, stable IDs, illegal containers/cycles, image metadata without inline blobs. |
| Geometry | L/T/cross junctions, acute angles, wall reversal, openings near ends, room split/merge, courtyard hole, calibrated plan transformations. |
| Commands/history | Atomic mixed edits, cancellation, undo/redo after imports, type edits affecting instances, divergent edit/undo revision collision. |
| Deliverables | 10 m → 100 mm at 1:100, A3 media box, line weights, text, clipping, image placement, multi-sheet PDF. |
| Imports | Known/unknown units, malformed files, unsupported DXF entities, huge decompressed images, SVG scripts/external URLs, page bounds. |
| AI | Malformed/oversized responses, wrong unit, impossible brief, stale proposal, unavailable provider, deterministic demo label, idempotent retry, budget limit. |
| Collaboration | Concurrent same/different element edits, host deletion, rejected edits, invitation revocation, tenant isolation, reconnect replay and per-user undo. |
| Browser | Mouse/trackpad pan/zoom, keyboard focus, multi-selection, drag handles, file picker/import/export, quota recovery and modal shortcuts. |
| Performance | Establish device-specific baselines at 100/1,000/10,000 drawing items; profile p95 input latency, frame time, memory and import/export time. Set budgets from those measurements, not a competitor speed claim. |

Keep `npm test`, `npm run build` and the existing Puppeteer suites in CI. Add scenario screenshots for our own documented interaction states. Visual regression is complementary to semantic assertions, not a replacement.

## 13. Decisions still needed before implementation

1. Is the first release local-only or must accounts/team sharing ship immediately? Recommendation: local-only first.
2. Is precision drafting or AI tracing the primary differentiator? Recommendation: reliable drawing and export first.
3. Do we preserve Revit-like shortcuts, add a Synaps-like profile, or allow customization? Recommendation: preserve and offer explicit profiles later.
4. What file formats must real customers receive? Recommendation: PDF first, a tested DXF subset second.
5. What provider/data-retention terms are acceptable for confidential plans? No real client documents in AI trials before this is settled.
6. Do users genuinely need a node graph, or are named independent alternatives sufficient? Validate before building a graph UI.
