# Visual audit: user-supplied Synaps app screenshots

**Reviewed:** 13 October 2026 · **Evidence:** 18 screenshots supplied in chat after the initial research pass.
**Scope:** direct visual inspection of the attached images, not a live browser session or implementation change.

These references establish the app's visible desktop layout much more clearly than the marketing pages. They do not prove that a displayed command succeeds, that rendering finishes, or that edits persist. No private project URLs, account identifiers or personal profile details are transcribed here.

The screenshots were reviewed from their inline chat representations. The supplied `/home/user/uploads` directory was not available to the shell during this follow-up, so no original-file hashes, pixel sampling or image-file copies are claimed. Original screenshots have not been added to Git.

## 1. Screenshot inventory

IDs follow attachment order; timestamps identify the supplied filenames, not an independently verified app version. All filenames begin `Screenshot 2026-10-13 at` and end `.png`.

| ID | Filename time | Visible state and key evidence |
| --- | --- | --- |
| V01 | 22.20.17 | Project dashboard: team/plan header, search, Home/Recent, Spaces, project cards with thumbnails/timestamps, New project control and credit indicator. |
| V02 | 22.20.52 | Blue-accent editor, Layers tab: model list and object rows at left, furnished floor plan centrally, Canvas properties at right, floating bottom toolbar. |
| V03 | 22.20.58 | Assets tab: category folders replace the layer list without changing the plan or right-hand Canvas controls. |
| V04 | 22.21.06 | Activities expanded into a two-column symbol-thumbnail grid, with asset names and categories below thumbnails. |
| V05 | 22.21.14 | Bathroom expanded: bathtub/shower variations in the same two-column grid. Other category headers remain above. |
| V06 | 22.21.20 | Drawing-shapes flyout opens upward above the toolbar: Arc (A), Line (L), Circle (O), Rectangle (R), Polyline (P); a checkmark marks Polyline. |
| V07 | 22.21.26 | Wall tool active in blue. Right panel shows thickness, Left/Center/Right alignment, wall construction fill/stroke, opacity, line width and Solid/Dash. Hint says to click to start drawing a wall. |
| V08 | 22.21.30 | Door tool active. Geometry fields show width 860 mm, height 2040 mm and depth 75 mm; configuration reads Solid · Hung Left. A hint asks for a wall click. |
| V09 | 22.21.34 | Window tool active. Width 600 mm, height 1200 mm, depth 75 mm, sill 900 mm; configuration reads Framed · Fixed. |
| V10 | 22.21.39 | Dimension tool active, with a secondary toolbar and start-point hint. Inspector includes stroke, arrow ends/sizes, extension lines and typography controls. |
| V11 | 22.21.42 | Pencil tool active. Compact stroke inspector; hint says click and drag to draw. |
| V12 | 22.21.45 | Text tool active. Font/style/size, line height, letter spacing, color and alignment controls; hint offers click-to-place or drag-to-create text box. |
| V13 | 22.21.48 | Move tool active. Hint says select shapes, then press Enter to confirm. Right panel shows general appearance controls. |
| V14 | 22.21.53 | Floor-plan generation prompt replaces the main bottom tool strip: No boundary selector, description input, 75-credit badge, send and close controls. Existing Move hint remains visible above. |
| V15 | 22.21.58 | Orange-accent workspace: floating project/Pages/Layers cards at left, floating Share controls at top right and a different bottom toolbar. No full-height inspector in this state. |
| V16 | 22.22.04 | Orange Camera tool active. Translucent peach camera field-of-view overlay; right Camera card shows 35mm Standard, 165 cm: Eye level and 270° rotation. Separate Preview card says Rendering preview…; hint asks for another click to set direction. |
| V17 | 22.22.11 | Orange workspace with image-selection controls above toolbar: selection-mode icons, 32% slider and disabled-looking Edit with prompt / Erase / Isolate. Polygonal Lasso tooltip visible. Camera/Preview cards remain at right. |
| V18 | 22.22.32 | Canvas-only blue state: sidebars and sharing header absent, small top-left panel toggle remains, bottom drawing toolbar remains. |

Displayed numerical values are **capture-specific**, not validated defaults or limits. In particular, do not adopt the unusual Wall thickness value shown in V07 as a sensible construction default. Likewise, the 75-credit badge is evidence of the offer displayed in V14, not a universal price for every user or future generation.

## 2. Layout reference

Approximate coordinates are visually estimated from the displayed **1440 × 900** frames; these are not DOM measurements. The browser tabs/address/bookmarks occupy roughly the first 122 px and must not be reproduced as application UI.

### Dashboard

- Approximately 280 px left rail, with a vertical divider.
- Main space title near the upper-left of the content area and New project at upper-right.
- Project cards roughly 340 px wide: large preview above a compact title/edited-time footer.
- Light gray/off-white surfaces, thin borders, restrained rounding and generous unused canvas area.
- This is a project/space browser, not the drawing editor with a different central panel.

### Blue drafting-oriented state

- Left sidebar approximately 280 px; right inspector approximately 280 px; remaining centre approximately 880 px at this viewport.
- No global ribbon across the drawing area. Project identity is in the left header; avatar/actions/Share are above the right inspector.
- Layers and Assets are tabs within the same sidebar, not permanently stacked panels.
- Central plan remains at the same position across most tool changes. Inspector content changes rather than opening a new page.
- Bottom command strip floats above the canvas edge with rounded corners, subtle border/shadow and vertical separators.
- Active tools have blue filled rounded-square backgrounds with contrasting icons. Utility controls flank the main strip.
- Tool hints and secondary tool options float immediately above the strip. Shape menus open upwards.
- A unit/zoom/status row sits at the bottom of the right sidebar; it is distinct from the centre toolbar.

### Orange polishing-oriented state

- Left navigation becomes separate floating cards inset roughly 8 px from the edge and approximately 264 px wide.
- Share/actions occupy a compact floating upper-right card.
- Camera properties and Preview stack as independent right-side cards when relevant.
- Toolbar, Share and relevant active controls use orange rather than blue; the camera footprint is translucent peach.
- Two small controls to the right of the toolbar appear associated with the blue/orange workspace states, but their labels and exact transition semantics are not visible.

The names **drafting-oriented** and **polishing-oriented** describe the observed tool sets. The screenshots support two distinct visual states, but do not prove the application's internal mode names, implementation, or whether switching changes saved document state.

### Canvas-only state

V18 demonstrates that a chrome-reduced layout must be considered independently from the orange/blue distinction. Hiding panels should not require replacing or resetting the project. Reopening panels should preserve selection, camera and tool state—this is our proposed behavior, not a tested observation.

## 3. Visual language to carry into our implementation

- Small, dense sans-serif UI labels; fine outline icons; compact 28–36 px inputs/buttons in the illustrated desktop layout.
- Very light cool backgrounds, subtle one-pixel separators and subdued selected rows.
- Dark text/icons; stronger blue or orange reserved for active tools/actions.
- Section-based inspectors: heading, labels, paired fields where appropriate, segmented alignment/style controls and unit suffixes.
- Monochrome top-down asset previews in pale thumbnail tiles; two columns within the narrow asset panel.
- Technical plan linework and light room fills, rather than a dark CAD viewport or a photorealistic hero canvas.

**Do not infer the UI font from the typography inspector.** Barlow Semi Condensed is visibly selected for drawing annotations/text; that is not evidence that it is the interface font. Exact CSS tokens and fonts remain to be measured/selected in implementation.

The small repeated screenshot thumbnail at the lower right of several frames appears to be a screen-capture overlay. It is **not established as a Synaps minimap** and should not be copied into the app. Browser chrome, personal avatars and project identifiers are also outside our reconstruction target.

## 4. Changes to the rebuild blueprint

1. **Specify two workspace presentations**, not just a single shell with different right-panel content: docked blue drawing UI and floating orange media/camera UI. Reuse the same underlying model, history and selection services.
2. **Build Layers/Assets tab switching early.** Include category disclosure and a reusable two-column asset-card component. Actual assets must be original or appropriately licensed, not extracted from the screenshots.
3. **Make the inspector tool-aware as well as selection-aware.** V07–V12 show controls for active placement tools before a new element is placed. Separate creation defaults from edits to existing objects.
4. **Reserve a bottom interaction area** for the main toolbar, upward flyouts, secondary options, task hints and the generation composer. Avoid a permanently open chat sidebar crowding the plan for this workflow.
5. **Persist camera records and draw a field-of-view overlay.** Separate camera placement/direction, local preview loading and paid render execution. V16 only demonstrates a pending preview, not a successful render.
6. **Keep panel visibility a separate UI state** so the canvas-only view works with the drawing tools.
7. **Use an independent demonstration project.** A furnished floor plan is useful for visual regression, but these screenshots do not supply reusable CAD geometry or permission to distribute the shown plan/assets.

Suggested component boundaries: `ProjectDashboard`, `EditorShell`, `WorkspacePresentation`, `LayersAssetsPanel`, `AssetCategory`, `AssetGrid`, `ToolInspector`, `SelectionInspector`, `BottomToolbar`, `ToolOptions`, `ToolHint`, `GenerationComposer`, `CameraInspector`, `CameraPreview`, and `CanvasChromeToggle`. Names are proposals, not recovered source identifiers.

## 5. Visual acceptance checklist

At a 1440 px-wide desktop viewport, compare the **app region only**, excluding browser chrome:

- Dashboard rail, two-card grid, project title and New project placement.
- Docked sidebars and an unobscured central drawing region.
- Layers/Assets switching without losing viewport position.
- Category collapse/expand and two-column asset previews.
- Shape flyout above the toolbar with visible labels/shortcuts.
- Wall, door, window, dimension, pencil and text property states.
- Active-tool colors, hint placement and secondary controls.
- Generation composer occupying the bottom command area with explicit cost/confirmation.
- Floating orange panel arrangement and camera field-of-view overlay.
- Disabled image actions when no eligible selection exists; do not infer backend capability from their presence.
- Hide/restore panels without moving or destroying document content.

Screenshot comparison must be paired with behavioral tests. A visual replica alone would not establish working drawing, AI, persistence or collaboration.

## 6. Remaining evidence gaps

These images do not show completed AI output, an imported DXF, trace-region review, a successful camera preview/render, sheets/export dialogs, door/window configuration dialogs, asset placement, group editing, the Share dialog, concurrent editing, mobile layouts, or undo/save/reopen behavior. Those remain documented or unknown as recorded in the original research.

**Outcome:** the visual direction is now grounded in user-supplied app views. The research-first scope remains unchanged; no editor code was modified in this follow-up.
