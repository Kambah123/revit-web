# Contour milestone 2 — shadcn/ui redesign + static dimensions

13 October 2026. Supersedes the first milestone's visual design. Existing geometry, histories and saved project identities are preserved.

## Replaced, not overlaid

The sage-green, serif-heavy dashboard/editor stylesheet and hand-drawn icon set have been replaced. The new interface uses white/slate surfaces, a consistent blue accent, sans-serif type, compact controls and Lucide icons. Real shadcn/ui source is vendored under `src/components/ui` with its MIT license and provenance. Tailwind 4 is integrated into Vite; its layers keep the legacy compatibility shell separate from the studio theme.

Implemented components/workflows include:
- Dashboard search, last-edited/name sorting, grid/list layouts and model-derived previews.
- shadcn buttons, inputs, badges, Radix project action menus, creation/import/error states, and a confirmation dialog for deletion.
- Compact editor header, layers/assets tabs, contextual inspector, plan/3D switch, tooltips, drawing toolbar and collapsible panels.
- shadcn/cmdk command palette; focus-managed dialogs; a restyled, explicitly labelled demo assistant.
- Narrow dashboard and editor layouts with a horizontally scrollable tool strip. Desktop remains the full authoring experience; the inspector and layers are hidden at narrow widths, not claimed as complete mobile drawers.

No image replaced the canvas. Project operations, wall/opening drawing, properties, undo/redo, assets, save/reload, import/export and native 3D continue through the existing model engine.

## New: static aligned dimensions

Use the ruler button or **M**:
1. Click the first measurement point.
2. Click the second point (at least 1 mm away).
3. Click to choose the signed perpendicular offset.

The live preview shows the measurement and offset before the third click. Escape cancels pending placement without creating a model element. The selected dimension exposes endpoint coordinates, offset and display units (mm or m). Click its dimension line/text or select it in Layers; Delete and Undo work normally. An annotation is shown only in the plan for its own level, not as a physical 3D object.

The true measurement is Euclidean distance between stored model-space endpoints. Stored coordinates/offsets are integer millimetres. Display uses mm to one decimal when needed, or metres to three decimals, with the unit explicit. It is **static**: moving/deleting a wall does not move the annotation or change its endpoints. No associative references, automatic dimension chains, paper scale or AI dimension operations are claimed.

Model implementation:
- Required `dimensions` collection in schema **5**; v4 imports gain an empty collection without altering buildings or IDs. Earlier migration paths still work.
- Existing v4 IndexedDB rows migrate at the read boundary without calling the v5 serializer first. Original row identity and timestamps are retained.
- Validated immutable add/update/delete commands, level-deletion cascade and normal history/persistence.
- Pure projection/measurement helpers, native Three.js linework/ticks/labels, invisible picking strips and proper geometry/material disposal.

## Verification

- Production build and TypeScript passed (the lazy Three.js vendor bundle still produces the non-failing ~512 kB size warning).
- **167 unit/integration tests across 19 files passed**, including 14 dimension tests: diagonal/horizontal/vertical measurements, signed/zero offsets, invalid values/units/levels, duplicate IDs, static behavior, commands/history, JSON migration and pre-existing v4 IndexedDB migration.
- **98 browser checks across seven suites passed**: 71 legacy checks and 27 studio checks. The studio suite exercises actual dimension placement, properties, native canvas selection, deletion/undo, cancellation and persistence through reload/export/import.
- Actual desktop/narrow screenshots inspected under ignored `e2e/screenshots/`, including `contour-dashboard.png`, `contour-editor.png`, `contour-dimensions.png`, `contour-editor-mobile.png` and a production example with a 14,000 mm dimension.
- REA target discovery and passive production runtime inspection executed; see [evidence and limits](research/contour-v2/README.md).
- `npm audit`: **0 vulnerabilities** at verification time. Vite, Vitest and Puppeteer were upgraded to patched compatible releases; Puppeteer tests use its current `count` multi-click option. Node 22.12+ is required (22.22.3 tested).

Browser checks assert against the new accessible dialog/menu structure rather than obsolete native-dialog selectors. Console assertions were not suppressed: they found and drove the React 18 `forwardRef` fixes for the upstream shadcn Button/DialogOverlay primitives.

## Still out of scope

Cloud storage/accounts, collaboration/conflict merging, paper/PDF/DXF export, furniture marketplace, calibrated image import/trace, photoreal render jobs and live generative AI are not implemented. The preview uses the local deterministic assistant demo. Existing room polygons are not automatically wall-associated. Keep one editing tab per project and export backups; clearing browser/origin storage can remove projects. This is conceptual modelling, not building-code/engineering approval.

The legacy ribbon remains at `/?legacy=1` for compatibility. Its historical styling is not used as the default UI. The default preview on port **5173** is the redesigned workspace.
