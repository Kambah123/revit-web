# Sources, observations and uncertainty

**Collected:** 13 October 2026. These are retrieval notes, not immutable copies of the remote pages. Public pages may change. The retained JSON evidence in this folder concerns only our own compiled application.

## Evidence categories

- **DOC:** official task documentation describes a behavior; not exercised here.
- **PUBLIC:** website, pricing, changelog, login or privacy notice retrieved as text; publication is observed, operational accuracy is not proven.
- **SECONDARY:** third-party coverage/search result; weaker than current task docs.
- **SCREENSHOT:** user-supplied app image, visually inspected; proves only the visible captured state.
- **LOCAL:** this repository's source or executed checks.
- **PROPOSED:** our architecture/design choice, not a recovered Synaps implementation.
- **UNKNOWN:** insufficient evidence; do not fill gaps with guesses.

Use detailed task docs over broad marketing for implementation planning, but do not pretend that contradictory pages have been conclusively resolved without a live app check.

## 1. Official source ledger

All pages below were retrieved through web tools, except the solution page explicitly marked search-only. Linked videos/images were not themselves downloaded or watched.

| ID | Source | Evidence category and retained notes |
| --- | --- | --- |
| P01 | [Homepage](https://www.synaps.app/) | PUBLIC. Drafting/polishing positioning; CAD/reference import; architectural elements, tracing/generation, visualisation and Vecy-1 marketing. Image descriptions are not screenshot-level inspection. Both text chunks read. |
| P02 | [Pricing](https://synaps.app/pricing/) | PUBLIC. Displayed monthly €0 / €59 / €119; limits and credits; annual saving 17%; Enterprise/SSO on roadmap. No checkout verification. |
| P03 | [FAQ](https://synaps.app/faq/) | PUBLIC. DWG/RVT claims, older price/limit statements, multiplayer, broad security/no-training statements. Conflicts with P02 and D16/D18. |
| P04 | [Release notes](https://synaps.app/news/changelog/) | PUBLIC. October 7 graphics/loading/connectivity update; recent grid, wall layers, room fill, copy/paste, papers, imports and comments work. Main release listing read; footer tail and every linked weekly article not individually inspected. Generic footer claims DWG/IFC round-trip. |
| P05 | [Privacy](https://synaps.app/privacy/) | PUBLIC. Notice dated September 16, 2026; providers, consent, prompts, diagnostics, international processing and retention. Both chunks read. No security attestation or DPA obtained. |
| P06 | [Product entry](https://beta.synaps.app/) | PUBLIC. Fetch redirected to `/login?redirectTo=%2F`; “Continue with Google.” No account created or logged-in content inspected. |
| P07 | [Floor-plan generation solution](https://synaps.app/solutions/floor-plan-generation/) | PUBLIC/search-only. Result says 3–12 options and excludes structural beam/span verification. Conflicts with D03's single-plan description. Search citation: [4](https://synaps.app/solutions/floor-plan-generation/). |
| D01 | [Documentation home](https://docs.synaps.app/) | DOC. Explicitly separates editable drawings from generated/edited images and points to task guides. |
| D02 | [Documentation index](https://docs.synaps.app/llms.txt) | DOC. All three chunks read; used to discover task pages. An index entry is not proof that every listed workflow was exercised or read in full. |
| D03 | [Generate a floor plan](https://docs.synaps.app/ai-and-automation/generate-a-floor-plan.md) | DOC. One plan per submission; closed rectangle/polyline boundary >20 m²; plan independent of outline after generation; inspect dimensions and requirements. |
| D04 | [Trace a floor plan](https://docs.synaps.app/ai-and-automation/trace-a-floor-plan.md) | DOC. JPEG/PNG/GIF/WebP/PDF; SVG excluded; displayed 50 MB cap; review/remove regions across pages; all retained regions count; cropped reference plus editable geometry; scale not calibrated by known-length input in review. |
| D05 | [Create an interior render](https://docs.synaps.app/ai-and-automation/create-an-interior-render.md) | DOC. Place/aim/select camera; style/prompt; new independent image item; later model edits do not refresh prior image. |
| D06 | [Segmentation](https://docs.synaps.app/ai-and-automation/select-image-objects-with-segmentation.md) | DOC. Detect → hover/click region → category-specific edit; image-only result; re-segment when detection becomes stale. Detection/edit have separate costs. |
| D07 | [Draw a wall](https://docs.synaps.app/drafting/draw-a-wall.md) | DOC. Chained segments, length/angle input, Enter finish, snapping, T-junctions, alignment. Up to eight layers; core cannot be removed; divider walls lack layer controls. Dimensions are checked separately after moving walls. |
| D08 | [Define a room](https://docs.synaps.app/drafting/define-a-room.md) | DOC. Click closed wall-bounded region; hover preview; live area/numbered label; follows wall changes; clicking outside a closed loop does nothing. A rectangle alone is not sufficient. |
| D09 | [Add a door/window](https://docs.synaps.app/drafting/add-a-door-or-window.md) | DOC. Click host wall then direction; width/height/sill/configuration; frame alignment disabled if frame fills/exceeds wall depth. |
| D10 | [Dimensions and annotations](https://docs.synaps.app/drafting/add-dimensions-and-annotations.md) | DOC. Start/end/offset dimensions; aligned/horizontal/vertical; chain modes; text/leaders. Dimensions and leaders do **not** follow geometry automatically. |
| D11 | [Papers](https://docs.synaps.app/drafting/papers.md) | DOC. A0–A6/B0–B5/custom, scale, header-based selection, multiple papers and contained drawing content. |
| D12 | [Layers panel](https://docs.synaps.app/drafting/the-layers-panel.md) | DOC. Tree/z-order, rename, inherited visibility/lock, search/zoom, nesting constraints, no container cycles. Walls accept openings; floors remain in assigned buildings. |
| D13 | [Find the right controls](https://docs.synaps.app/get-started/draft-and-polish-modes.md) | DOC. Contextual drawing/camera/image controls and command search. Despite its URL, this page does not prove a mandatory two-mode state machine. |
| D14 | [Share a project](https://docs.synaps.app/get-started/share-your-project.md) | DOC. Editor/Viewer invitations, owners separately, seat notice, revoke invite/remove guest. Does not establish standalone commenter-role UI. |
| D15 | [AI credits](https://docs.synaps.app/workspace-and-billing/understand-ai-credits.md) | DOC. Team balance and action badges; each plan/segment/edit/retry can be separate; trace review not itself paid execution; Cancel/Undo do not guarantee refund. |
| D16 | [Import](https://docs.synaps.app/import-and-export/import-a-drawing-or-image.md) | DOC. Image/DXF/SVG/PDF; PDF Image/Vectorize/Trace; no DWG option; image/PDF displayed 50 MB cap. |
| D17 | [Export](https://docs.synaps.app/import-and-export/export-your-drawing.md) | DOC. Paper PDF/DXF/PNG/JPEG; selected images PNG/JPG; selected papers can combine into one PDF; separate output files may use ZIP; project-data export is separate. |
| D18 | [DXF support](https://docs.synaps.app/import-and-export/dxf-support.md) | DOC. Common entities, linear/aligned dimension import; no angular/radial/diameter/ordinate dimension path; layout viewports not working imports; check units, hatches and references. Convert DWG to DXF first. |
| D19 | [Assets in camera views](https://docs.synaps.app/assets/assets-in-3d-from-a-camera.md) | DOC. Camera badge indicates dedicated 3D representation; image replacement does not replace drawing asset. |
| D20 | [Shortcuts](https://docs.synaps.app/reference/shortcuts-and-gestures.md) | DOC. V Select, W Wall, D Dimension, F Paper, S Scale, Shift+C Camera, Ctrl/Cmd+K search; Space drag pan; navigation context and input focus matter. |

## 2. Search coverage and secondary material

Queries run:

1. `synaps.app BIM Revit architecture AI features Synaps`
2. `site:synaps.app documentation docs nodes floor plan tracer export collaboration pricing`

These surfaced the official docs and materially changed the plan from a generic “AI canvas” interpretation to specific drawing/media workflows.

- An April 30, 2026 article describes funding, browser collaboration and ambitious speed/growth claims. It was found in search, not used as a verified benchmark or roadmap commitment. [2](https://thenextweb.com/news/synaps-3-6m-pre-seed-ai-architecture-exclusive)
- A June 16, 2026 first-look describes “Synaps Nodes” and explicitly calls its own coverage a first look with unverified pricing. The node-graph claim is an open question, not a confirmed requirement. [3](https://archigenai.com/synaps-ai-floor-plan-render-canvas-first-look-2026.html)
- A result for `ierror/synaps-cad` describes an OpenSCAD desktop tool. It is not used as Synaps.app source or an architectural implementation reference. [10](https://github.com/ierror/synaps-cad)
- A Synaps-published format article reinforces the docs' narrower import support; the report relies on the retrieved task docs instead of treating that search snippet as independent validation. [7](https://synaps.app/news/blog/cad-file-formats/)

We did not search for leaked source, bypass sign-in, access user projects, intercept anyone else's session, or treat public search results as permission to copy proprietary code/assets.

## 3. Contradiction register

| ID | Conflict | Confidence / next probe |
| --- | --- | --- |
| C01 | FAQ/comparison/footer DWG/RVT/IFC claims vs explicit DXF-only CAD import menu guidance. | High confidence that publications conflict; unknown operational format support. Inspect menu and round-trip synthetic fixtures with authorized access. |
| C02 | FAQ €35/€75 vs pricing €59/€119 monthly. | High confidence in displayed values; unknown checkout total/currency/tax and entitlements. Read actual checkout without completing a purchase. |
| C03 | FAQ unlimited free projects vs pricing 3 models/3 pages. | Model/project terms may also differ. Check dashboard counters and limits. |
| C04 | Studio SSO/audit present in FAQ vs Enterprise roadmap on pricing. | Unknown feature/contract availability. Ask vendor or inspect eligible workspace settings. |
| C05 | Solution page 3–12 alternatives vs task doc one plan. | Use task-doc single-plan workflow provisionally. Record one authorized generation and its outputs. |
| C06 | Broad no-training/EU-only implications vs opt-out pricing and privacy's processing disclosures. | Do not conflate prompt analytics, inference, model training and retention. Obtain relevant contracts/provider terms; neither “all data trains models” nor “none ever does” is established. |
| C07 | “Connected” marketing vs static dimensions/generated pictures. | Task docs establish the narrower behavior. Verify model edit → room update → dimension/image behavior independently. |
| C08 | Third-party node graph vs task-doc workflows. | Node feature current availability unknown. Seek a current walkthrough before committing engineering work. |

## 4. Local inspection and test evidence

Reviewed: package manifest, README/scope/architecture/limitations, schema types, command/history/persistence boundaries, AI operations/application/preview flow, backend configuration and routes. This was source review with normal repository tools, in line with REA's guidance not to use binary analysis for ordinary source understanding.

Executed: lockfile install; 142 tests across 16 files; TypeScript + Vite production build; REA skill setup and scoped doctor; static analysis of the generated `dist` artifact. Details and original analysis JSON are in [REA.md](REA.md).

Not executed: current browser E2E suites, actual DeepSeek requests, screenshot comparison, production deployment, arbitrary-format compatibility tests, multiuser tests. Historical test counts in older repo documents were not silently treated as current results.

## 5. Unknowns that materially affect effort

- True scene size, drawing performance and browser/GPU compatibility.
- Exact selection/drag/constraint behavior and corner-case geometric tolerances.
- Tracing accuracy, calibration assumptions and model output representation.
- Floor-plan model architecture, training rights, inference costs and benchmark methodology.
- Format versions/entities truly round-tripped, beyond documented support descriptions.
- Actual project/page/model boundaries, offline behavior, storage quotas and revision retention.
- Conflict resolution, simultaneous geometric edits, shared undo, reconnect and permission enforcement.
- Production APIs, auth/session mechanisms, rate limits and transport schema.
- Exact source implementation of drafting, rendering, media processing or collaboration.
- Current node graph, plugin API, Enterprise/SSO or other marketing-only capability availability.

A backend architecture proposal is not evidence of how Synaps implements these. Public page extraction cannot answer them.

## 6. Follow-up: user-supplied app images

After the initial research, the user supplied 18 screenshots showing the dashboard and editor. All 18 inline images were reviewed and indexed as V01–V18 in [VISUAL_AUDIT.md](VISUAL_AUDIT.md). This adds direct visual evidence for docked blue and floating orange workspace states, the asset browser, tool-specific inspectors, a generation composer with a displayed 75-credit badge, camera controls/field-of-view and a panel-hidden view. Values apply only to the shown state; they do not resolve general pricing or runtime behavior.

This supersedes the initial absence of visual references, not the lack of live authenticated access. Original attachment files were not available at the supplied filesystem path during this follow-up; no file hashing, pixel sampling, image copies or REA capture is claimed. The screenshot audit uses direct vision, not binary analysis.
