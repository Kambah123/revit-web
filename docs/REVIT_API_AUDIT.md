# Revit API, model schema, and APS integration audit

**Audit date:** 2026-10-12 (UTC)
**Repository inspected:** `Kambah123/revit-web`, branch `arena/11b23c70-revit-web`, starting commit `ce68041c55cb47d950bf22d084ec54b326c44e19`
**Technical source policy:** Autodesk/APS primary documentation only for Revit/APS behavior. This is an architectural audit, not a claim of testing against Revit or an RVT file.

## Executive result

This repository is a browser-based, application-native BIM editor. Its semantic project model is authoritative; Three.js geometry is derived from that model. The current file format is the app's versioned JSON (`schemaVersion: 4`), **not RVT**. The Autodesk Revit API is a .NET API that runs inside Revit (or an Autodesk Revit Automation engine); it is not callable from this TypeScript/Vite browser bundle. APS Model Derivative can translate an RVT and extract metadata; APS Viewer can display the derivative. That workflow does **not** turn the RVT into editable elements in this app.

**Recommendation:** preserve the editor, schema and local JSON workflow. Do not add Autodesk Viewer to the native edit path, make the app depend on APS, or promise native RVT editing. A sandboxed, read-only APS proof of concept is technically feasible, but **no-go for implementation now**: the repo has no server-side secret boundary, no approved RVT test fixture/data-retention policy, and no approved spend. The isolated design below is an opt-in follow-up, not an implemented feature.

A narrowly scoped, tested implementation is included: wall types can now select one of the project's existing materials, and the native Three.js view uses that material's display colour for unselected walls on the active level. This completes the roadmap's small wall-material assignment item without changing schema v4 or replacing the editor.

## Repository and semantic-model audit

### Current architecture

| Concern | Current source | Finding |
| --- | --- | --- |
| Canonical project | `src/model/types.ts` | Schema v4; integer-millimetre linear values; levels, materials, separate element types and instances, rooms, openings. |
| File compatibility | `src/model/schema.ts` | JSON save/open; v1, v2 and v3 inputs migrate to v4. No RVT/IFC/DXF parser is present. |
| Invariants and commands | `src/model/validation.ts`, `commands.ts` | Edits are immutable commands; the whole project is validated before a command commits. Invalid type/material/host/level references are rejected. |
| Derived geometry | `src/geometry/` | Pure, regenerated wall/opening, floor, room, column, ceiling and simple roof geometry. Meshes are not saved or authoritative. |
| Quantities | `src/model/quantities.ts` | Derived from current model geometry/parameters, not stored as authoritative inputs. |
| Editing and viewing | `src/App.tsx`, `src/viewer/BimScene.ts` | Native Three.js plan and 3D views, pointer picking and editing. This path remains intact. |
| History and persistence | `src/app/history.ts`, `src/persistence/` | Immutable snapshot undo/redo, browser autosave/recovery, project JSON file save/open. |
| Tests | `src/__tests__/`, `e2e/` | Unit/regression suite and four browser workflows. Exact final commands/results are in `docs/TESTING.md` and `docs/PROGRESS.md`. |

### Concepts mapped to the current schema

This mapping identifies useful analogues, **not** byte-for-byte/native-file equivalence. API class names below are conceptual targets for a future explicit adapter.

| App concept and current fields | Closest Revit API concept | Current semantic boundary / gap |
| --- | --- | --- |
| `Project` (`id`, name, `schemaVersion`, `revision`, `units`) | Revit `Document` plus project information | The app project is a versioned JSON aggregate, not a Revit `Document`; it has no Revit worksharing, phase, project-location, or transaction semantics. |
| `Level` (`id`, name, integer-mm `elevation`) | `Autodesk.Revit.DB.Level` | Good basic datum analogue. Project datum/shared coordinates and level constraints are not modeled. Convert at an adapter boundary; do not change canonical mm storage. |
| `Material` (`id`, name, sRGB hex `color`) | Revit `Material` element | App colour is display-only. Revit materials can carry appearance, thermal and structural/physical assets; those are absent here. |
| `WallType` (`thickness`, `materialId`) / `Wall` (`wallTypeId`, `levelId`, endpoints, `height`) | `WallType` / basic system `Wall` | Type/instance split maps well at a high level. Current wall is a straight centreline prism with one height and one material; no compound layers, location line, flip, base/top constraints, offsets, stacked/curtain wall behavior, or general joins. |
| `OpeningType` / `Opening` (`hostWallId`, type, along-wall `offset`) | Door/window `FamilySymbol` / hosted `FamilyInstance` | The app opening is a simple host-and-offset semantic record. It is not a Revit `FamilyInstance`, loaded family, host-face reference, swing/orientation, or full opening cut/family behavior. |
| `FloorType` / `Floor` (`boundary`, `levelId`, type) | `FloorType` / `Floor` | Boundary sketch and type are analogous. Current slab is flat and extruded down from the level; no slope arrow, compound structure, shape editing, or native Revit sketch constraints. |
| `Room` (`name`, `number`, level, explicit polygon) | `Autodesk.Revit.DB.Architecture.Room` / `SpatialElement` | Name/number/level and derived area are comparable concepts. Here the boundary is manually stored; Revit room boundaries are related to room-bounding geometry, phase and upper/lower constraints. App area is shoelace area, not `Room.Area`. |
| `ColumnType` / `Column` (`width`, `depth`, `height`, position) | Column `FamilySymbol` / `FamilyInstance` | Current column is an unrotated rectangle extrusion. No reusable family document, base/top levels, offsets, rotation, round/steel sections, analytical model, or structural framing semantics. |
| `CeilingType` / `Ceiling` (boundary, height) | `CeilingType` / `Ceiling` | Boundary and type are useful analogues. Current ceiling is a simple horizontal slab; no ceiling grid, compound layers, hosted fixtures, or reflected-ceiling-plan object. |
| `RoofType` / `Roof` (axis-aligned rectangle, overhang, rise) | `RoofType` / `FootPrintRoof` or other `RoofBase` subtype | Current roof is one computed hip-roof solid. It is not a general footprint/extrusion roof, native slope definition, roof edit sketch, or arbitrary roof form. |
| Specific fields such as `height`, `thickness`, `offset`, `rise`, `overhang` | Revit built-in/type/instance `Parameter`s | These are app-specific typed TypeScript fields, not a generic parameter registry. The app has no parameter GUIDs, spec/data-type IDs, project/category bindings, formula/read-only rules, or shared-parameter definitions. |
| `projectGeometry()` / slab, column, roof geometry and quantities | Revit geometry/quantity engine | App geometry and quantities are custom, derived approximations. They do not invoke Revit's solid kernel or guarantee Revit-equivalent quantity rules. |
| Plan/3D view state | `ViewPlan`, `View3D`, other `View` subclasses | The app currently has one plan behavior per level and a 3D view. No persisted Revit-style view records, view ranges, sections/elevations, sheets, annotations, or schedules. |
| App IDs (`id` fields), derivative IDs | Revit element `UniqueId` / APS `externalId`, `objectId`, Viewer `dbId` | App IDs are local opaque IDs. Validation rejects duplicates within each collection, not globally across all collections. APS `objectId`/`dbId` are derivative-scoped and must never be substituted for app IDs; use APS `externalId` plus source/version context in a future sidecar. |

### What can and cannot be claimed

- **Supported today:** edit the app's own semantic types/elements, see regenerated native Three.js views, undo/redo, browser recovery, and save/open app JSON.
- **Not implemented:** opening, parsing, editing, or exporting an RVT file; running Revit API calls from TypeScript; importing a derivative into editable app-native elements; interoperable RVT identity/parameter mapping.
- **Future read-only path:** Model Derivative translates an RVT for a viewer and exposes extracted object trees/properties. This is an imported view/metadata sidecar only unless a separately specified importer maps objects into the canonical model and validates the result.
- **Future native-RVT authoring path:** requires a server-side C#/.NET Revit adapter running under Revit or Revit Automation, a deliberate mapping into native Revit transactions, version/error handling and round-trip tests. It is not equivalent to rendering an RVT derivative.

## Small tested change and diff summary

- `src/ui/PropertiesPanel.tsx`: wall properties now offer the selected `WallType`'s existing project material records; the label explicitly says the setting is shared by all walls of that type.
- `src/App.tsx`: routes the selection to the existing `updateWallType` model command.
- `src/viewer/BimScene.ts`: resolves each ordinary wall's color through `wallTypeId → materialId → Material.color`; existing selection highlight and below-level tint remain higher-priority display states.
- `src/vite-env.d.ts`, `src/App.tsx`, `src/viewer/BimScene.ts`: type and expose a development-only `wallColor` hook for browser verification; it is absent from production builds.
- `src/__tests__/commands.test.ts`: verifies type-level assignment, unchanged wall instances and refusal of a missing material.
- `e2e/slice1.e2e.mjs`: selects a wall, changes type material, asserts the model and actual rendered color, then verifies undo/redo.
- `e2e/slice2.e2e.mjs`: corrects the migration step's assertion text from v3 to v4. `package.json` adds `e2e:all` without changing the existing slice-1 `e2e` command.

No schema/version change, runtime dependency, external API call, APS credential, backend or file-format behavior was introduced. The full patch is inspectable with `git diff`; test outcomes are recorded in `docs/PROGRESS.md`.

## Autodesk API findings that affect design

1. **Execution boundary.** Autodesk describes Revit as exposing a .NET API. Revit document modifications require an active Revit `Transaction` and a supported Revit API callback/context. That runtime is absent from this browser app. Revit Automation supplies a headless Revit engine in APS, but its jobs run an uploaded/published Revit add-in/AppBundle; it is not a browser-side .NET bridge.
2. **Units.** Revit stores internal length values in feet. Its API's `UnitUtils` is the conversion mechanism. Keep integer mm canonical in the app and convert to/from Revit internal units only at a tested adapter boundary; do not silently store Revit feet in `Project`.
3. **Types and instances.** Revit families/types and `FamilyInstance`s are richer than this app's small type arrays. Revit type-bound parameters affect every instance using that type; the UI now applies wall material at `WallType` scope to retain the app's existing type/instance behavior.
4. **Parameters.** Revit supports built-in parameter identifiers, parameter/spec identifiers and shared-parameter GUIDs. `LookupParameter(name)` can be localized or ambiguous; a future adapter should use stable identifiers/GUIDs, preserve data type/spec and distinguish instance from type scope. A generic typed parameter model is a schema-level feature, not just a label/value UI.
5. **Rooms and stairs.** Revit rooms expose derived area/perimeter/volume and relate to placed room boundaries/topology; the app's explicitly drawn polygon remains a distinct semantic choice. Revit stairs have their own creation/edit scope and API coverage is not interchangeable with a generic extrusion; do not promise universal stair conversion.
6. **Derivative identity.** APS extracts hierarchy and properties for viewables. Viewer `dbId`/Model Derivative `objectId` identify derivative objects and can change with a retranslation; retain source/derivative context and prefer extracted `externalId` for cross-derivative matching where available.

## Prioritized implementation plan

### P0 — Preserve and make explicit the current native model (now)

- Keep `Project` authoritative; retain schema v4 compatibility, integer-mm values, commands/validation, history, autosave, JSON open/save, existing unit/e2e tests and the Three.js editor.
- Keep app-native IDs independent from Revit/APS IDs. Before tightening global-ID rules, inspect/migrate existing files so an old project is not rejected unexpectedly.
- Document every unsupported import/export as unsupported. Distinguish app-native elements from imported viewables in UI and saved data.
- **Completed in this change:** expose the already-modeled wall type `materialId`, render the selected type's material colour on normal active-level walls, and test command validation, UI assignment, displayed colour, undo and redo. No schema migration or APS dependency is needed.

### P1 — Strengthen the reusable semantic foundation before adding more element categories

- Design schema v5 (not part of this change) around parameter definitions and typed values: stable definition ID/GUID, data type/spec, canonical unit, type/instance scope, applicability and nullability. Keep length values in integer mm; define explicit conversion for Revit parameter storage units.
- Audit project-wide ID uniqueness and stable external references; preserve/migrate IDs deterministically before enforcing new invariants.
- Model base/top levels and offsets, and compound wall material/layer structures as explicit semantics instead of adding ad hoc fields to every element.
- Add family/symbol/instance and hosting semantics only after placement, orientation, host/face references and regeneration rules are testable.

### P2 — Expand architectural semantics and derived views

- Distinguish manually sketched rooms from wall/room-bounding computed spaces; define boundary provenance and test area/volume rules.
- Add constrained stairs/landings and richer roof/floor shapes only with explicit schema/validation/geometry coverage.
- Add persisted plan/RCP/section/elevation view records, view ranges and annotations from canonical geometry. Views remain projections of one semantic model, not separate meshes.

### P3 — Schedules and open-format interchange

- Build schedules from typed parameters/derived quantities, with traceable fields, filters and grouping.
- Prefer a tested, declared IFC subset for exchange, then DXF/PDF as scoped deliverables. Maintain source IDs/external IDs in a mapping sidecar and test round trips; do not map every external object to an editable native element by name or geometry guess alone.

### P4 — Optional Autodesk integration, behind an explicit boundary

- A read-only APS RVT viewer POC can be evaluated separately, using the design below and a throwaway test model.
- Only if native `.rvt` output becomes an approved product requirement, evaluate a Revit Automation C# AppBundle that maps supported canonical categories to Revit API elements and writes an RVT. Require sample-file, account, budget, retention, error-handling and round-trip approvals first.

## Isolated optional APS read-only proof-of-concept design

### Proposed boundary

```text
Existing editor (unchanged)             Optional APS demo (separate route/service)
Project JSON + commands + history       Local RVT upload -> private backend -> OSS
Three.js plan/3D editing                 Model Derivative POST job -> manifest polling
                                        Read-only APS Viewer + extracted-property panel
                                        APS object metadata kept in a separate sidecar
```

- Put the demo behind a feature flag and a separate view/tab/route. Never swap out `BimScene`, redirect native editing to APS Viewer, or load RVT derivative objects into `Project` implicitly.
- Suggested backend endpoints: `POST /api/aps/uploads` (validate and obtain signed upload instructions), `POST /api/aps/translations` (submit SVF2 translation), `GET /api/aps/translations/:id` (manifest/status), and `GET /api/aps/models/:id/{tree,properties}` (server-proxied extraction). Use the current signed-S3 upload flow; do not copy deprecated direct-upload OSS v1 recipes.
- Store the bucket/object/URN, derivative GUID, translation version, extracted `externalId` and temporary `objectId`/`dbId` in an integration record keyed to the upload. Do not write these fields into native `Project.id`s or treat them as editable element IDs.
- Viewer interactions are read-only: frame/select a derivative object and show its extracted APS properties. An explicit later “map to native” workflow would need category/type mapping, user confirmation, validation, stable IDs and an import report for unsupported/unmapped objects.

### Credentials and security

- APS client secret and OAuth client credentials live only in backend secret storage. Never put the secret in Vite `VITE_*` variables, browser local storage, source maps, logs, or committed `.env` files.
- APS Viewer normally needs an access token in the browser. If approved, broker a narrowly scoped (`viewables:read`), short-lived token and do not persist it. If the requirement means **no OAuth bearer token may reach browser memory**, an embedded APS Viewer is a no-go until a backend proxy/alternative renderer is designed and reviewed; do not relax that boundary silently.
- Require an authenticated app session, upload-size/type limits, per-user opaque object keys, least-privilege scopes, request/rate limits, token/log redaction, retention/deletion and consent for third-party processing of the RVT.
- For the one-owner sandbox POC, use app-owned storage/OAuth; use a 3-legged user-consent flow only if the approved workflow must access a user's Autodesk account or cloud project. Never request Autodesk credentials in this app.

### Account setup, limitations and current cost estimate

Pricing checked against Autodesk's published APS rate sheet on **2026-10-12**; confirm the account's live rate table and job classification before any billable run.

| Item | Published allowance/rate at audit | POC implication |
| --- | --- | --- |
| APS account/app | Create a developer hub, APS app and choose the Free tier. Autodesk currently requires a payment method for identity verification, but says the Free tier is not charged unless upgraded; usage limits refresh monthly and rated API access is suspended at the cap until reset or upgrade. | A team administrator/account setup is required even for a no-charge experiment. Do not add credentials to this repo. |
| Model Derivative translation | Free tier lists 60 simple and 20 complex jobs/month. Paid rate sheet lists 1 token or US$3 per 3 simple jobs, and 3 tokens or US$9 per 2 complex jobs. | Autodesk's [2022 rate-class notice](https://aps.autodesk.com/blog/tokenflex-rate-changes-autodesk-forger-apis-and-services) says Revit jobs use the Complex class. Conservatively budget about **US$4.50 per complex translation after the free allowance**, pending verification in the live account/rate sheet. One test file within the free allowance has **US$0 metered translation cost**. |
| Model Derivative non-job API calls | 300,000 free calls/month; paid 1 token or US$3 per 300,000 calls. | Manifest, tree/property polling should be modest, but count all endpoints and avoid tight polling. |
| APS Viewer SDK | The current API rate sheet has no separate per-call Viewer line item; this is not a blanket license grant. | Confirm current SDK/service terms before deployment. Model Derivative translation, upload/storage terms and hosting are separate budget considerations. |
| Data Management upload calls | Current rate sheet lists upload/basic interactions with no additional per-call fee. | This is not a promise that retention, storage policy or enterprise data services have no other terms/costs; delete temporary objects. |
| Revit Automation (not needed for viewing) | 300 Revit processing minutes/month; paid 1 token or US$3 per 12 processing minutes. | If a future authoring/export job ran 4–10 billable minutes, rough usage pricing is **US$1.00–US$2.50/job**, before any rounding, retry or account-specific terms. It still requires a Revit AppBundle and semantic mapping. |
| Prepayment option | Published APS overview shows a US$99/33-token minimum; pay-as-you-go is also offered. | Do not prepay for the proposed one-file viewer test. If the free tier is exceeded, require explicit budget approval before enabling a paid tier. |

The above is usage pricing, not an all-in production estimate. It excludes engineering/hosting, customer support, security/legal review, data retention, storage/egress terms, and any Autodesk subscription requirements that may apply to the deployment. The SVF2 derivative is viewable/extractable data, not an editable RVT or an editable copy of this app's BIM semantics. A translation can be asynchronous, fail, omit/flatten authoring semantics, or be version-dependent.

### Go / no-go

**NO-GO now** for shipping APS integration, adding an APS SDK/dependency to the editor, uploading real customer RVTs, or promising RVT editing. The current repository has no backend secret boundary, no approved test RVT/data-rights/retention policy, and no paid-usage approval. No APS code, dependency, credential or upload is added by this audit.

**Conditional GO for a disposable read-only POC only after approval** of: (1) a small RVT fixture and upload rights, (2) APS developer hub/app and OAuth scopes, (3) privacy, region, retention and deletion policy, (4) the browser access-token exception or a proxy design, (5) a hard usage budget/free-tier alert, and (6) acceptance that results are a read-only derivative, not native BIM elements. Keep this service and route optional and removable.

## Official primary references

All links below are Autodesk/APS sources. API details were read from the versioned guides as of the audit date; verify the target Revit/API engine version before implementation.

### Revit API / SDK

- [Revit API overview and SDKs](https://aps.autodesk.com/developer/overview/revit-api) — identifies the Revit API as .NET; linked Developer Guide and Revit .NET SDK (the page listed SDK 2027.3 with 100+ samples at audit time).
- [Revit API Developer Guide, 2027](https://help.autodesk.com/view/RVT/2027/ENU/?guid=Revit_API_Revit_API_Developers_Guide_html) — current guide entry point.
- [Units, Revit API Guide](https://help.autodesk.com/view/RVT/2021/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Introduction_Application_and_Document_Units_html) — internal units and conversion context.
- [Parameters, Revit API Guide](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Basic_Interaction_with_Revit_Elements_Parameters_html) and [shared parameter bindings, Revit 2025](https://help.autodesk.com/view/RVT/2025/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Basic_Interaction_with_Revit_Elements_Parameters_Shared_Parameters_Binding_html).
- [Transactions](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Basic_Interaction_with_Revit_Elements_Transactions_html) — document changes are made within supported transactions.
- [Family](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Family_Instances_Family_html), [FamilySymbol](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Family_Instances_FamilySymbol_html), and [FamilyInstances](https://help.autodesk.com/view/RVT/2023/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Family_Instances_FamilyInstances_html).
- [Walls](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Walls_Floors_Ceilings_Roofs_and_Openings_Walls_html), [floors/ceilings](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Walls_Floors_Ceilings_Roofs_and_Openings_Floors_Ceilings_and_Foundations_html), [roofs](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Walls_Floors_Ceilings_Roofs_and_Openings_Roofs_html), and [levels/grids](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Datum_and_Information_Elements_Levels_html).
- [Materials](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Material_html), [rooms](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Discipline_Specific_Functionality_Architecture_Rooms_html), and [stairs/railings](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Stairs_and_Railings_html).
- [Views](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Basic_Interaction_with_Revit_Elements_Views_html) and [creating a schedule](https://help.autodesk.com/view/RVT/2024/ENU/?guid=Revit_API_Revit_API_Developers_Guide_Basic_Interaction_with_Revit_Elements_Views_View_Types_TableView_ViewSchedule_Creating_a_Schedule_html).
- [Revit API export guide](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-API/files/Revit_API_Developers_Guide/Advanced_Topics/Revit_API_Revit_API_Developers_Guide_Advanced_Topics_Export_html.html) and [Autodesk's Revit IFC exporter repository](https://github.com/Autodesk/revit-ifc) (reference only; no Autodesk code is copied into this clean-room app).

### APS viewer / derivative / authentication / Automation / pricing

- [Model Derivative overview](https://aps.autodesk.com/en/docs/model-derivative/v2), [supported translations](https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/supported-translations), [prepare models for viewing](https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/basics/preperation), and [SVF2 Viewer tutorial](https://aps.autodesk.com/en/docs/model-derivative/v2/tutorials/prep-file4viewer).
- Model Derivative REST references: [submit job](https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/job-POST/), [manifest](https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-GET/), [object tree](https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-metadata-guid-GET/), and [properties](https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-metadata-guid-properties-GET/).
- [Current Model Derivative upload tutorial](https://aps.autodesk.com/en/docs/model-derivative/v2/tutorials/prep-file4viewer/task2-upload_source_file_to_oss) and [OSS v1 endpoint deprecation notice](https://aps.autodesk.com/blog/object-storage-service-oss-api-deprecating-v1-endpoints).
- [APS Viewer v7 Developer Guide](https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/viewer_basics/) — browser viewer lifecycle, extensions and properties.
- [OAuth 2-legged token tutorial](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/get-2-legged-token/) — backend app-to-app token flow.
- [Automation API overview](https://aps.autodesk.com/en/docs/design-automation/v3), [Revit AppBundle tutorial](https://aps.autodesk.com/en/docs/design-automation/v3/tutorials/revit), [restrictions](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/restrictions), and [rate limits/quotas](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/rate-limits/da-rate-limits).
- [APS developer hub/app setup](https://tutorials.autodesk.io/) and [Developer Hub setup details](https://aps.autodesk.com/blog/aps-developer-hub-setup-and-app-migration).
- [APS pricing overview](https://www.autodesk.com/products/autodesk-platform-services/overview#pricing), [published rate sheet](https://www.autodesk.com/products/autodesk-platform-services/product-details), [APS business-model/usage-limit announcement](https://aps.autodesk.com/blog/aps-business-model-evolution), and [APS terms of use](https://www.autodesk.com/company/terms-of-use/en/subscription-benefits) (account payment-method and Free-tier access terms).
