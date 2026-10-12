# Decision log

Format: one record per decision. Newest last. Significant decisions only; routine choices stay in commit messages.

## D1 — Clean-room implementation (standing policy)

Independent implementation. No Autodesk source code, proprietary icons/logos/assets, or decompiled material. Revit/Autodesk may be named when documenting compatibility boundaries; this project is not an Autodesk product. File formats are based on public specifications (buildingSMART IFC, DXF spec, glTF, PDF). Recorded in README; restated here as the governing constraint.

## D2 — Integer millimetres in the canonical model (standing policy)

All stored linear dimensions are safe integers in millimetres. Floats only appear in derived geometry/rendering. User input parsed via `src/model/units.ts`. Alternatives require a documented, validated migration.

## D3 — Whole-project validation on every command

`src/model/commands.ts` commits only if `validateProject` reports no errors. Invalid edits throw and leave state untouched. Undo/redo stores immutable whole-project snapshots (HISTORY_LIMIT 200).

## D4 — Historical starting checkout for the prior slice session (2026-10-12)

At the time this historical note was written, the prior session began from squash-merged commit `bd42fa0` on `arena/63a6b55e-revit-web`; prompt-referenced commits `4035013` and `ddec16a` were absent. This is not the current session branch or HEAD. The current branch and baseline are recorded at the top of `PROGRESS.md`; no history was rewritten.

## D5 — Reference attachments unavailable; derived requirements used (2026-10-12)

The prompt-supplied PDF and Revit screenshot were searched for (conversation attachments, repository, upload locations, filesystem) and were not present in the earlier reference audit environment. `REFERENCE_AUDIT.md` documents that search and derives the UI requirements from the prompt's descriptions and public Revit UI knowledge. No page inspection is claimed. If the materials arrive, re-audit and log requirement deltas here.

## D6 — Browser for e2e: portable Chromium via npm (2026-10-12)

No system Chrome/Chromium was available in the earlier sandbox and the usual download CDNs were unreachable. `@sparticuz/chromium` ships the browser binary inside the npm tarball (npm registry is reachable) and runs headless with WebGL under `LD_LIBRARY_PATH=/tmp/al2023/lib`. The package was used for testing only (`--no-save`, never a runtime dependency). The e2e entry point keeps the `CHROME_PATH` convention so CI/dev machines can pass their own browser.

## D7 — Schema v3: materials, floors, rooms, columns (2026-10-12)

Extended the canonical model with `Material`, `FloorType`/`Floor`, `Room`, `ColumnType`/`Column`. Rationale:
- Rooms and floors are core to an integrated building model and later schedules/quantities; explicit boundaries are deterministic, serializable and testable.
- Materials give types an assignable identity needed by take-offs later.
- Boundaries are explicit closed polylines of integer-mm points, not wall-derived room-bounding, for this slice; auto-bounding from walls is deferred.
- Floors are extruded downward from their level (`z0 = level − thickness`, `z1 = level`): the top face aligns with its level.
- Migration v2→v3 seeds one default material and empty new arrays; the v1→v2→v3 chain was preserved.

## D8 — Slice-2 polygon rules

Boundary polygons have ≥3 integer-mm vertices, no consecutive duplicates, are non-self-intersecting and have non-zero area (checked in integer 2×-area arithmetic where possible). Area/centroid use shoelace calculation in `src/geometry/polygon.ts`; self-intersection checking is O(n²), suitable for small boundaries.

## D9 — Quantity values are derived, never stored

Room area, floor area/perimeter/volume, wall net volume, etc. live in `src/model/quantities.ts` and are computed on demand from model data. Properties read those results; no duplicate stored quantity can drift.

## D10 — Schema v4: ceilings and simple hip roofs (2026-10-12)

- `Ceiling`: boundary polygon + `height` (top face above the level) + type (thickness, material). A reflected ceiling plan is later; ceilings render translucently in plan and solid in 3D.
- `Roof`: axis-aligned rectangular footprint + `overhang` (expands footprint) + `rise` (ridge height above level). Geometry is a classic hip roof with a ridge along the longer axis and four slopes plus a flat soffit. Free-form/gable roofs and slope-as-angle are not represented.
- Migration v3→v4 seeds one ceiling type and one roof type referencing the file's first material.

## D11 — 3D view shows all levels; plan keeps the level rule (2026-10-12)

The 3D view renders every level, while a level plan shows that level and lower levels as underlay. A slice-4 browser screenshot revealed and fixed a roof on Level 2 being invisible in 3D while Level 1 was active.

## D12 — Polygon self-intersection fix (2026-10-12)

The segment-intersection test compared orientation values instead of their signs, so non-intersecting edges with same-sign but unequal orientations could be rejected as crossing. Fixed to a strict sign test plus endpoint-on-segment checks, with unit coverage for slanted quadrilaterals and pentagons.

## D13 — Wall material remains a type-level semantic field; APS stays optional and read-only (2026-10-12)

The wall properties UI edits the existing `WallType.materialId`, and native Three.js walls resolve the referenced app material's display color. Do not duplicate the assignment onto each wall or reinterpret display color as physical/thermal data. The change requires no schema bump and is covered by command and browser tests.

The Revit API/APS audit recommends **no-go for APS integration at present**. A future read-only viewer experiment must be an isolated optional service with server-side client secrets, explicit approval for a short-lived browser access token, a user-authorized RVT fixture, retention/deletion rules and a hard spend limit. A Model Derivative view/metadata result must never be called an editable native app or Revit model. See `REVIT_API_AUDIT.md`.
