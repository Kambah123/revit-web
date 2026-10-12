# Decision log

Format: one record per decision. Newest last. Significant decisions only; routine choices stay in commit messages.

## D1 — Clean-room implementation (standing policy)

Independent implementation. No Autodesk code, assets, branding, or decompiled material. File formats based on public specifications (buildingSMART IFC, DXF spec, glTF, PDF). Recorded in README; restated here as the governing constraint.

## D2 — Integer millimetres in the canonical model (standing policy)

All stored linear dimensions are safe integers in millimetres. Floats only appear in derived geometry/rendering. User input parsed via `src/model/units.ts`. Alternatives require a documented, validated migration.

## D3 — Whole-project validation on every command

`src/model/commands.ts` commits only if `validateProject` reports no errors. Invalid edits throw and leave state untouched. Undo/redo stores immutable whole-project snapshots (HISTORY_LIMIT 200).

## D4 — Historical commits 4035013 / ddec16a are not in this clone (2026-10-12)

The master prompt references commit `4035013` on `arena/6a8161ff-revit-web` building on `ddec16a`. This checkout contains a single squash-merged commit `bd42fa0` ("Merge pull request #1 from Kambah123/arena/6a8161ff-revit-web") whose tree is the slice-1 codebase; `git cat-file` confirms `4035013` and `ddec16a` are absent. The current branch `arena/63a6b55e-revit-web` is the session branch. No history was rewritten; work proceeds from `bd42fa0` forward only.

## D5 — Reference attachments unavailable; derived requirements used (2026-10-12)

The prompt-supplied PDF and Revit screenshot were searched for (conversation attachments, repository, upload locations, filesystem) and are not present in this environment. `REFERENCE_AUDIT.md` documents the search and derives the requirement inventory from the prompt's own descriptions and public Revit UI knowledge. No page inspection is claimed. When the files arrive, re-audit and log requirement deltas here.

## D6 — Browser for e2e: portable Chromium via npm (2026-10-12)

No system Chrome/Chromium exists in the sandbox and the usual download CDNs (storage.googleapis.com, objects.githubusercontent.com) are unreachable. `@sparticuz/chromium` ships the browser binary inside the npm tarball (npm registry is reachable) and runs headless with WebGL under `LD_LIBRARY_PATH=/tmp/al2023/lib`. The package is used **for testing only** (`--no-save`, never a runtime dependency). The e2e entry point keeps the `CHROME_PATH` convention so CI/dev machines can pass their own browser.

## D7 — Schema v3: materials, floors, rooms, columns (2026-10-12)

Extending the canonical model with `Material`, `FloorType`/`Floor`, `Room`, `ColumnType`/`Column`. Rationale:
- Rooms and floors are the core of "an integrated building model" and of later schedules/quantities; they were the top of the repo roadmap (slice 2) and of the prompt's Phase 3.
- Materials give types an assignable identity needed by take-offs later.
- Boundaries are explicit closed polylines of integer-mm points (sketch-like), not wall-derived room-bounding, for this slice: deterministic, serializable, testable. Room auto-bounding from walls is deferred to M6 and noted in KNOWN_LIMITATIONS.
- Floors are extruded downward from their level (`z0 = level − thickness`, `z1 = level`): the floor's top face aligns with its level, matching common BIM convention; ceiling/soffit variants come later.
- Migration v2→v3 seeds one default material and empty new arrays; v1→v2→v3 chain preserved.

## D8 — Slice-2 polygon rules

Boundary polygons: ≥3 vertices, integer mm, no consecutive duplicates, non-self-intersecting, non-zero area (checked in integer 2×-area arithmetic where possible). Area/centroid computed by shoelace in `src/geometry/polygon.ts`; self-intersection check is O(n²) segment testing (boundaries are small).

## D9 — Quantity values are derived, never stored

Room area, floor area/perimeter/volume, wall net volume etc. live in `src/model/quantities.ts` and are computed on demand from geometry/parameters. Schedules and properties read them; nothing stores a quantity that could drift.
