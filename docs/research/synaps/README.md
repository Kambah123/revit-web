# Synaps rebuild: research and recommendation

**Research date:** 13 October 2026 · **Scope:** research and implementation planning only
**Baseline:** `799bbc553cf7d99af6e898f6e13abe2eb0d24bbd` in `Kambah123/revit-web`

> **Recommendation: evolve this repository into a canvas-first architectural design tool, not a pixel clone or a full Revit replacement. Keep the validated semantic model and command engine. Add precise 2D drafting, sheets and import/export before investing in image AI or multiplayer.**

The application source, runtime dependencies and UI were not changed in this research pass. REA's matching skill was installed and included in the repository; a real, **partial** REA analysis of our own compiled bundle is retained. No Synaps source code, reusable asset files, model weights or authenticated traffic were obtained. A subsequent user-supplied set of 18 app screenshots has now been visually reviewed; see the visual audit below.

## Read this package

- [App screenshot visual audit](VISUAL_AUDIT.md): all 18 supplied views, docked/floating layouts, tool inspectors, camera UI and concrete blueprint updates.
- [Technical rebuild blueprint](BLUEPRINT.md): architecture, schema changes, implementation sequence, acceptance tests and effort ranges.
- [Source and uncertainty register](SOURCES.md): primary sources, contradictions, coverage and remaining questions.
- [REA installation and evidence](REA.md): what was installed, exactly what ran, limitations and a future browser-inspection procedure.
- [Raw REA evidence](evidence/revit-web-bundle.partial.json): our local production artifact, **not Synaps**.

## 1. What Synaps actually offers

The strongest available reference is its task-oriented documentation, rather than landing-page promises. It describes an architectural canvas combining:

| Product area | Documented behavior | Implication for our rebuild |
| --- | --- | --- |
| Drafting | Lines and shapes, wall chains and construction layers, wall-hosted openings, wall-bounded rooms, stairs, dimensions and annotations. | A useful editor needs drafting/topology, not just attractive 3D boxes. |
| Organisation | A front-to-back Layers tree with papers, groups and blocks; visibility, locking and nesting. | Add a document/canvas layer without flattening the existing building model. |
| AI plans | A brief produces **one editable plan**; an optional closed boundary must exceed 20 m². | Produce validated domain operations, not a generated picture pretending to be CAD. |
| Tracing | Review regions across image/PDF pages, explicitly confirm, then receive editable elements plus a cropped reference. | Separate upload, review, paid execution, correction and acceptance. |
| Visualisation | Place and aim a camera; rendering creates a separate image item. | Keep live geometry and generated media distinct. |
| Image editing | Segmentation, prompt edits, material/flooring replacement, background removal, expansion and resolution enhancement. | Model image jobs and source lineage separately from geometric edits. |
| Deliverables | Papers have format and scale; export PDF, DXF, PNG or JPEG; selected papers can become one PDF. | Sheets and trustworthy export are first-class product features. |
| Collaboration | Project invitations expose Editor and Viewer; team ownership is separate. | Server-enforced authorization comes before live cursors. |

Sources: [drafting](https://docs.synaps.app/drafting), [layers](https://docs.synaps.app/drafting/the-layers-panel.md), [generation](https://docs.synaps.app/ai-and-automation/generate-a-floor-plan.md), [tracing](https://docs.synaps.app/ai-and-automation/trace-a-floor-plan.md), [rendering](https://docs.synaps.app/ai-and-automation/create-an-interior-render.md), [segmentation](https://docs.synaps.app/ai-and-automation/select-image-objects-with-segmentation.md), [papers](https://docs.synaps.app/drafting/papers.md), [export](https://docs.synaps.app/import-and-export/export-your-drawing.md), [sharing](https://docs.synaps.app/get-started/share-your-project.md). These are **documented behaviors, not hands-on verification**.

### The most important distinction

Synaps' documentation explicitly says image editing does **not** update the underlying drawing. Generated renders also do **not** automatically refresh after later drawing changes. Assets with a camera badge have dedicated 3D representations; changing an object in a rendered picture does not replace its drawing asset. Do not interpret the homepage's “connected” language as a bidirectional image-to-BIM engine. [Rendering](https://docs.synaps.app/ai-and-automation/create-an-interior-render.md) · [Asset camera views](https://docs.synaps.app/assets/assets-in-3d-from-a-camera.md)

For our implementation, every result must visibly say **Editable drawing**, **Live model view**, or **Generated image**. An image can remember its source model/version without becoming authoritative geometry.

## 2. The user journeys worth rebuilding

### A. Brief → editable plan → client sheet

1. Create a project and optionally draw a closed boundary.
2. Open generation via command search; write room and adjacency requirements.
3. Generate a candidate; check layout, dimensions, access and openings.
4. Correct the drawing using actual drafting tools.
5. Create a scaled paper, annotate, export and inspect the deliverable.

Synaps documents the underlying generation and sheet workflow. **Our proposed improvement** is to keep this repo's explicit preview/accept transaction and clearly mark unverified regulatory/design constraints. [Generation](https://docs.synaps.app/ai-and-automation/generate-a-floor-plan.md) · [Papers](https://docs.synaps.app/drafting/papers.md)

### B. Scan/PDF → reviewed regions → corrected drawing

Import offers three different PDF results: **Image**, **Vectorize** and **Trace**. Tracing's final “Trace All Floorplans” covers all retained regions across pages, not just the highlighted region. A trace produces a cropped source alongside reconstructed elements. The docs say the review does not calibrate from a known length; scale and measure afterwards. [Import](https://docs.synaps.app/import-and-export/import-a-drawing-or-image.md) · [Trace](https://docs.synaps.app/ai-and-automation/trace-a-floor-plan.md)

**Our proposed improvement:** require a known-length calibration or an explicit “scale unverified” state before accepting a trace. Display the selected region count and estimated cost before execution.

### C. Model → camera → render → finish alternatives

Place the camera, aim it, select it alone and choose a style/prompt. The generated image is a separate canvas item. Segment the image, select a detected surface/object and run a category-appropriate edit. Re-segment after substantial changes. Each render, detection and subsequent edit is a separate AI operation. [Render](https://docs.synaps.app/ai-and-automation/create-an-interior-render.md) · [Segment](https://docs.synaps.app/ai-and-automation/select-image-objects-with-segmentation.md) · [Credits](https://docs.synaps.app/workspace-and-billing/understand-ai-credits.md)

### D. Shared project → review → controlled editing

Invite a signed-in collaborator as Viewer or Editor; manage pending invitations and access. Release notes describe comments and collaborator cursors, but exact concurrent editing/conflict behavior was not inspected. [Sharing](https://docs.synaps.app/get-started/share-your-project.md) · [Release notes](https://synaps.app/news/changelog/)

## 3. Do not build from the marketing pages blindly

| Topic | Conflicting public evidence | Planning decision |
| --- | --- | --- |
| DWG / RVT / IFC | FAQ claims DWG round-trip and Revit reference import; changelog footer claims DWG/IFC round-trip. Import docs say DWG is not an import-menu option and instruct conversion to DXF. | Target the documented DXF subset. Do not advertise DWG, RVT or IFC support without fixtures and a real adapter. |
| Pricing | FAQ lists Pro €35 and Studio €75; current pricing page displays **€59 and €119/editor/month, billed monthly**. | Record the current pricing-page values as displayed, not verified checkout prices. Do not base our business model on FAQ figures. |
| Free limits | FAQ says unlimited personal projects; pricing says 3 models, 3 pages, 3 editors and limited libraries. | Use the pricing-page comparison provisionally; confirm in-app entitlements before a competitive comparison. |
| Enterprise | FAQ says Studio includes SSO/audit; pricing puts multi-office Enterprise with SSO/audit on the roadmap. | Treat availability as unresolved. |
| Generation count | A solution page says 3–12 options; the task guide says a single editable plan. | Design one validated result first; alternatives are explicit independent runs. |
| Data use/security | FAQ makes broad no-training and EU-hosting claims; pricing lists a Studio training opt-out. Privacy describes AI providers, consent-based prompt analysis and possible non-EEA processing. | Do not assume global no-training guarantees or EU-only processing. Obtain applicable contractual terms before using confidential plans. |
| “Connected” outputs | Homepage implies a connected environment; docs distinguish static annotations and generated images from live drawing geometry. | Specify dependencies explicitly; never promise automatic propagation where it does not exist. |

Sources: [FAQ](https://synaps.app/faq/), [pricing](https://synaps.app/pricing/), [changelog](https://synaps.app/news/changelog/), [DXF support](https://docs.synaps.app/import-and-export/dxf-support.md), [generation solution](https://synaps.app/solutions/floor-plan-generation/), [generation guide](https://docs.synaps.app/ai-and-automation/generate-a-floor-plan.md), [privacy](https://synaps.app/privacy/), [annotations](https://docs.synaps.app/drafting/add-dimensions-and-annotations.md). The solution-page option-count claim was returned in search: [4](https://synaps.app/solutions/floor-plan-generation/).

### Pricing snapshot, not a purchase recommendation

The pricing page displays:

- **Freemium:** €0; 300 signup credits + 30/day; 3 models, 3 pages, 3 editors.
- **Pro:** €59/editor/month billed monthly; 4,500 credits/month, rollover balance capped at 10,000; up to 10 editors; unlimited models/pages/libraries; DXF and high-quality, watermark-free export.
- **Studio:** €119/editor/month billed monthly; unlimited credits; up to 50 editors; personal support; training opt-out.
- Annual billing is advertised as 17% cheaper. No checkout, tax treatment, fair-use policy or annual total was verified. The page's comparison table also marks personal support for Pro.

Source: [pricing page retrieved 13 October 2026](https://synaps.app/pricing/). AI action costs are shown in the app; the docs do not provide a stable numeric per-operation table. Cancel/Undo do not guarantee a credit refund. [Credit rules](https://docs.synaps.app/workspace-and-billing/understand-ai-credits.md)

## 4. What can be said about the technology

**Documented, not independently detected:** the privacy policy names Cloudflare and Supabase for infrastructure/account services, Stripe for payments, PostHog for analytics/feature settings, Sentry for diagnostics, Brevo for communications, and Google/OpenAI for AI features. This does not establish which provider runs any particular feature, database topology, frontend framework, or rendering engine. [Privacy](https://synaps.app/privacy/)

**Marketing claim only:** the homepage calls Vecy-1 a proprietary floor-plan generation model with best-in-class performance. No weights, training recipe, reproducible benchmark or internal service contract were examined. REA cannot recover a private server-side model from a public website. [Homepage](https://www.synaps.app/)

**Not established:** React/Next.js/Vue usage; exact geometry engine; WebGL/WebGPU implementation; CRDT/OT design; private endpoints; render providers per action; source schema; rate limits; actual tracing accuracy; real-world model capacity; latency percentiles.

An external first-look describes “Synaps Nodes” branching. Current task documentation reviewed here does not establish a general node-graph workflow. Keep it as a validation question and an optional independent feature—not a mandatory parity target. [3](https://archigenai.com/synaps-ai-floor-plan-render-canvas-first-look-2026.html)

## 5. Our repository already has a valuable foundation

Source review at the baseline commit found:

- React 18 + TypeScript + Vite + Three.js; an application-owned schema v4.
- Integer-millimetre semantic geometry, levels, walls, hosted openings, floors, rooms, columns, ceilings and simple hip roofs.
- Immutable validated commands, snapshot undo/redo, local autosave, versioned JSON with migrations.
- Native plan/3D views and read-only elevations.
- A DeepSeek-backed DesignPlan flow with schema validation, preview and atomic application; a separately labelled deterministic demo planner.

The largest missing pieces are **2D document primitives, robust wall/room topology, real sheet output, file interoperability, media workflows, multi-project storage and shared persistence**. This is not a CSS reskin.

Local references: [`src/model/types.ts`](../../../src/model/types.ts), [`commands.ts`](../../../src/model/commands.ts), [`history.ts`](../../../src/app/history.ts), [`schema.ts`](../../../src/model/schema.ts), [`BimScene.ts`](../../../src/viewer/BimScene.ts), [`applyPlan.ts`](../../../src/ai/applyPlan.ts), [`server/index.mjs`](../../../server/index.mjs). See the [blueprint](BLUEPRINT.md) for the gap matrix.

### Baseline checks executed in this pass

| Check | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Completed using the existing lockfile. |
| `npm test` | **16 test files, 142 tests passed.** |
| `npm run build` | TypeScript and Vite build passed. |
| Bundle | Main JS 813.65 kB / 219.96 kB gzip; Vite >500 kB advisory remains. |
| REA skill check | `healthy: true`, version 37, 170-tool identity aligned with REA 6.4.0. |
| REA compiled-bundle analysis | Returned partial evidence; semantic worker hit its 1,024 MiB old-space limit. |
| Browser E2E / live AI | **Not run in this pass.** Existing tests are not evidence that Synaps behaves identically. |

## 6. Recommended first release

**One complete, honest loop:** open a local project → draw/edit walls and openings → place/check a room → annotate → lay out an A3 paper → export a correctly scaled PDF → save and reopen without loss.

Then add DXF/reference import, constrained editable-plan generation, camera snapshots/render jobs, and finally team collaboration. The [blueprint](BLUEPRINT.md) breaks this into testable milestones.

Do **not** lead with fake image-to-BIM, a decorative node graph, unavailable ribbon commands, untested RVT/DWG buttons, AI-speed claims, or simulated collaboration presented as real.

## 7. Research limits and next evidence

Public pages and documentation were retrieved through web tools. The sandbox's outbound host restrictions prevented direct Synaps access (`curl` failed TLS connection); the web fetch of `beta.synaps.app` resolved to its Google sign-in page. No live authenticated editor session, project data file, private endpoint or paid action was inspected. Embedded video links were located, not watched. The initial pass had no screenshot references; a follow-up now visually reviews 18 user-supplied screenshots of the app in [VISUAL_AUDIT.md](VISUAL_AUDIT.md). These show editor states but do not establish successful execution or backend behavior.

The next high-value evidence is a user-authorized walkthrough on synthetic plans: blank project, wall junction edits, room updates, one DXF round-trip, one generation, one trace, one render, one image edit, and two-editor reconnect behavior. See [the capture checklist](REA.md#next-synaps-inspection) for a safe, reproducible procedure. Never share session cookies or tokens in chat.
