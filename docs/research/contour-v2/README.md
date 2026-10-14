# REA inspection — shadcn workspace and dimension tool

REA **6.4.0**, using the previously installed official skill. Target: our own built application at `http://localhost:8787`, served by the existing local Node server. This is not a Synaps capture.

Puppeteer opened an original sample project and placed a dimension between its 14 m exterior-wall endpoints. The production inspector read **14000 mm**. Puppeteer drove those actions; REA's provider was used only for passive inspection. The debugger was loopback-scoped and the inspection process was stopped after capture.

```bash
REA=/home/user/rea-tooling/node_modules/.bin/rea
"$REA" list-browser-targets http://127.0.0.1:9222 \
  --allowed-origins http://localhost:8787 --json
# The discovered real target ID was used in inspect-web-page, not invented.
"$REA" inspect-web-page http://127.0.0.1:9222 1B7CA5C45A026BDE838BCA497F9C137B \
  --allowed-origins http://localhost:8787 --include-accessibility-text --json
```

- `targets.json`: original discovery Evidence.
- `runtime.json`: original inspection Evidence; **629 DOM nodes, 418 accessibility nodes, 3 eligible compiled scripts**.
- `run-record.json`: agent-authored summary and separate SHA-256 file hashes, **not** an artifact identity bound by REA.

The accessibility tree includes `Dimension 1 14000 mm` as a layer button, the explicit measured value, display-unit selector and coordinate/offset controls. This corroborates that the production UI exposes the new feature; correctness comes from independent geometry and workflow tests, not this tree alone.

Evidence ID:
`ev_062113d17c11ab34cb3e85d4407ead1192cc99937f22d9759d3e3f291b913655`

Limits are preserved in the original envelope: policy-filtered, attach-limited; artifact identity unavailable; prior network/console activity unavailable. Script bodies, secrets, cookie/storage values and raw request bodies were not requested. No Synaps private code/runtime/API was accessed. The earlier research's partial static-analysis memory failure remains documented separately and is not rewritten as successful complete analysis.

This capture precedes final polish, including the plan-only dimension-tool shortcut guard and a dimension-label clearance adjustment (220 → 420 mm away from the line). Its build hashes describe that captured build, not later source changes; the feature semantics and measured value are unchanged.
