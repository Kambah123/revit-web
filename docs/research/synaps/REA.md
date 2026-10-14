# REA installation, use and evidence

**Date:** 13 October 2026 · **Upstream:** [morluto/rea](https://github.com/morluto/rea)

## What is installed

- Official npm package **`rea-agents@6.4.0`**, isolated at `/home/user/rea-tooling/node_modules/rea-agents`.
- CLI: `/home/user/rea-tooling/node_modules/.bin/rea`.
- Runtime used: Node **22.22.3**, within the package's supported range.
- Matching bundled skill installed by REA at `/home/user/.agents/skills/reverse-engineer-anything`.
- The same skill and on-demand references copied into this repository at [`.agents/skills/reverse-engineer-anything`](../../../.agents/skills/reverse-engineer-anything), with its MIT license retained.
- Scoped `rea doctor --skill --json` returned **healthy**, skill version **37**, tool count **170**, identity **aligned**.

The tool-count field describes the bundled skill's catalog identity; it does not mean 170 tools were attached to this Arena conversation. The CLI is usable here. **No live MCP registration in Arena was established.** We did not write configurations for unrelated clients, install a native disassembler, change app dependencies, or run `setup --all-detected`.

The local `node_modules` installation is disposable and may need reinstalling in a fresh environment. The pinned skill, research and evidence files are repository deliverables; the exact npm command below recreates the executable. Upstream `main` had documentation beyond the released package in some areas, so the bundled **6.4.0** workflow is the installed authority—not an arbitrary current-main skill copy.

Package integrity reported by npm:

```text
sha512-Vj1zWfSlna5bphGoaoI/TcVBuYvze9u+OyPC3Shz8YkBqaCTqB4COnnRoX7XDwMpwI24ZlFEel2yEj0k8LTWEQ==
```

## Installation performed

The README, npm metadata and setup options were inspected first. Package installation used `--ignore-scripts`; the published CLI worked without running package lifecycle scripts. Setup was previewed before applying only the skill action.

```bash
npm install --prefix /home/user/rea-tooling \
  --ignore-scripts --no-audit --no-fund --save-exact rea-agents@6.4.0

REA=/home/user/rea-tooling/node_modules/.bin/rea
"$REA" setup --skill=true --yes --dry-run --json
# Plan: install the matching skill under /home/user/.agents/skills only.
"$REA" setup --skill=true --yes --json
"$REA" doctor --skill --json
```

Setup returned `status: ready` and `appliedActions: ["installed_skill"]`. Missing optional Ghidra/IDA providers in broader diagnostics do not block static JavaScript analysis or the skill-only check. Installation does not grant authorization to inspect arbitrary apps.

## What REA was used for

The installed skill was read and applied to the investigation:

1. Separate documented behavior, static artifact findings, actual runtime evidence and proposals.
2. Use normal repository tools for a complete source repository rather than pretending a decompiler is needed.
3. Use REA for the **compiled production artifact** to verify the tool works and retain bounded findings with limitations.
4. Do not claim authenticated runtime observations without a selected browser target and actual capture.

After installing repo dependencies and building the existing app:

```bash
npm ci --no-audit --no-fund
npm test
npm run build

/home/user/rea-tooling/node_modules/.bin/rea \
  analyze-javascript-application /home/user/revit-web/dist \
  --artifact-format directory --analysis-timeout-ms 60000 --json \
  > /home/user/rea-tooling/revit-web-bundle.json
```

**Target: our own `revit-web/dist`, not Synaps.** This is a tooling baseline and artifact inspection, not evidence of Synaps internals.

### Actual outcome: partial, not complete

REA returned an Evidence envelope and exited successfully, but one semantic-analysis worker exhausted its default **1,024 MiB old-space heap**. The result explicitly preserves this resource constraint. We retained it rather than converting “exit 0” into a false claim of complete recovery. No higher-memory retry was performed.

The retained output reports:

- 2 relevant files; 814,163 text bytes; 1 parsed JavaScript file.
- 213,452 visited AST nodes; 22 findings.
- 20 application-graph nodes, 27 edges; incomplete graph coverage.
- A literal `fetch` reference to **`/api/ai/health`** in the bundle.
- No full semantic recovery of the large bundled application.

Important interpretation checks:

- Fourteen other endpoint-labelled observations are Three.js/WebGL extension names passed to `.get`, **not verified network endpoints**.
- An `electron-renderer` node label associated with HTML does **not** establish that this browser SPA uses Electron.
- `/api/ai/plan` exists in our source. Its absence from this partial graph is not proof that the route does not exist or execute.
- Static references do not prove execution, live requests or backend behavior.

This demonstrates why REA evidence needs source/runtime cross-checking and explicit coverage limits. It should not be used to invent a technology stack from weak labels.

### Retained files and identity

- [`evidence/revit-web-bundle.partial.json`](evidence/revit-web-bundle.partial.json): original 90,559-byte CLI JSON, unchanged.
- [`evidence/run-record.json`](evidence/run-record.json): our human-readable structured run summary, **not** a canonical REA Evidence envelope.

```text
Evidence ID:
ev_8059c9ea9c562884ccd0d1c2fe0a91491ac2c0d2fd85238e305f2e95887fccc7

REA artifact-directory digest:
2d3a7208f3c64222f07804b83e97ff56e9a69b0ebd26e0669c564938f5b70a70

Compiled JS SHA-256 (dist/assets/index-DZNL7U80.js):
beadec22e8ce60a5fc83610348d9993081df95ec69ff982906c6b0140fa1587a

Retained Evidence JSON file SHA-256:
2e2d78e7cb1e9a98871498e48e88a20655b16dc026d0f40abe811bbbfe97ec4e
```

The directory digest is REA's artifact identity, not the SHA-256 of a tar/ZIP file. A repeat run may have a different evidence ID or runtime diagnostics even when the input bytes match. Preserve the original file rather than editing its internal evidence/coverage fields.

## Why there is no live Synaps REA capture

- This sandbox has a restricted outbound host list. A direct TLS request to `https://www.synaps.app/` failed with curl code 35 (`SSL_ERROR_SYSCALL`). It was not bypassed.
- The separate web retrieval tools could read public website/docs text. These outputs are **not CDP browser captures**, JS bundles or HAR recordings.
- The web fetch of `https://beta.synaps.app/` redirected to a Google sign-in page.
- No logged-in session, project artifact, browser target or authorized traffic capture was supplied.

Therefore `analyze-web-bundle`, `inspect-web-page` and screenshot capture were not run against Synaps. Private APIs, renderer internals, real timing, geometry accuracy and backend model weights remain unknown. REA cannot supply evidence that it never captured.

## Next Synaps inspection

This is a **future procedure**, not work completed here. Use an environment allowed to reach Synaps and a browser/account the user controls. The user signs in normally; never paste cookies, passwords, OAuth tokens or authorization headers into chat. Use synthetic plans and review applicable terms/permissions before collecting artifacts.

### A. Establish target and scope

1. Open a separate browser profile for the research, with local-loopback-only CDP enabled using that browser's supported procedure. Do not expose the debugging port to the public network or proxy it as an Arena preview.
2. Sign in and open an empty/synthetic project manually.
3. List actual page targets, then select the returned target ID by title and exact origin. Never invent or reuse a stale target ID.

Example CLI sequence on that machine, with variables populated from the actual environment/result:

```bash
# CDP_ENDPOINT is the real literal-port loopback endpoint for your own browser.
npx -y rea-agents@6.4.0 list-browser-targets "$CDP_ENDPOINT" \
  --allowed-origins https://beta.synaps.app --json

# TARGET_ID must come from the discovery output above.
npx -y rea-agents@6.4.0 inspect-web-page "$CDP_ENDPOINT" "$TARGET_ID" \
  --allowed-origins https://beta.synaps.app \
  --include-accessibility-text --json

npx -y rea-agents@6.4.0 capture-web-screenshot "$CDP_ENDPOINT" "$TARGET_ID" \
  --allowed-origins https://beta.synaps.app --json
```

Confirm the actual origin first; do not assume an account still uses `beta.synaps.app`. Origin filters scope evidence, not all network activity of the browser. Accessibility text and screenshots can contain project names/personal data—review before sharing.

### B. Bounded scenarios

| Scenario | Synthetic input | Evidence to collect / acceptance question |
| --- | --- | --- |
| Empty project | New disposable project | Canvas layout, panels, units, shortcuts, default layers; no account/billing data. |
| Precise wall loop | 6 m × 4 m rectangle, one T-junction | Numeric placement, snapping, wall alignment/layers; does moving one wall update the expected junctions? |
| Openings/rooms | One door, one window, one room | Host movement/deletion, swing/fit, label/area update; reject invalid placement? |
| Annotation/sheet | One dimension, A3 sheet at 1:100 | Does dimension stay static after wall edit? Does exported physical scale match? |
| DXF | Owned minimal entity fixture | Actual import options, units and entity report; inspect exported supported entities. |
| Generation | Two-bedroom brief, closed >20 m² boundary | Confirm displayed cost first; one result or alternatives? Editable objects? Invalid geometry/corrections? |
| Tracing | Owned calibrated plan plus two-page/two-region fixture | Confirm all retained regions and cost before submit; output scale, crop, missed openings and correction flow. |
| Camera render | One simple furnished room | Cost/latency, image lineage, camera preservation; does drawing edit leave prior image unchanged? |
| Image edit | Generated test interior | Segment then repaint one region; image vs model difference; undo and charge behavior. |
| Collaboration | Two authorized test accounts | Viewer cannot edit; two-editor edits/reconnect; conflict, recovery and undo behavior. |

Paid execution requires approval of the displayed cost; discovering a button is not authorization to charge the account. Capture before/after states and timings explicitly. Do not label a whole workflow “verified” because one screenshot looks right.

### C. Optional deeper analysis

Only if necessary and authorized: passively capture the selected page's scripts/network shapes with REA, retain digests and source locations, and use `analyze-web-bundle`/script export according to the installed version's help. Do not copy proprietary code into this repo. Do not collect unrelated browser tabs, credentials, raw customer content or private project data. Browser-visible code does not expose all server logic.

For an exported, sanitized HAR, use `inspect-web-network-capture` after reading its current schema/help. A retained capture is historical evidence; it does not establish current availability or permit replaying authenticated requests.

### D. Exit artifact

Produce a scenario matrix with **observed**, **failed**, **not tested**, **blocked**, and **inferred** states. Attach original evidence identities, input hashes, exact app/REA versions where available, source locations and explicit limits. Update the contradiction register only when the new observation actually resolves a claim.

## Optional MCP configuration outside this session

For a compatible local agent that supports user-managed MCP configuration, the official pinned command shape is:

```json
{
  "mcpServers": {
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents@6.4.0", "mcp"]
    }
  }
}
```

This is a configuration example, **not a registration performed in Arena**. Prefer `rea setup` for a specifically selected supported client, preview changes, apply with approval, then restart that client. Installing a skill alone does not attach tools to an already-running agent. See [upstream installation](https://github.com/morluto/rea/blob/main/docs/installation.md).

## Contour implementation runtime inspection

During implementation on 13 October 2026, the installed REA CLI was used again against **our own app**, first on the Vite development page and then the compiled production page served by the local Node server. The browser used synthetic original example projects. Puppeteer drove opening the project/assistant; REA's browser provider performed passive inspection only.

Production commands actually executed:

```bash
REA=/home/user/rea-tooling/node_modules/.bin/rea
"$REA" list-browser-targets http://127.0.0.1:9222 \
  --allowed-origins http://localhost:8787 --json
# Discovery returned the following real target ID, not an invented placeholder:
"$REA" inspect-web-page http://127.0.0.1:9222 E8ADFB2A85439AC9994EA26451D12452 \
  --allowed-origins http://localhost:8787 --include-accessibility-text --json
```

Retained files:

- [`evidence/contour-production-targets.json`](evidence/contour-production-targets.json) — discovery Evidence, title **Contour — Architecture workspace**, one permitted production page.
- [`evidence/contour-production-runtime.json`](evidence/contour-production-runtime.json) — original final inspection Evidence, **524 DOM nodes / 459 accessibility nodes / 3 eligible compiled scripts**.
- [`evidence/contour-build-record.json`](evidence/contour-build-record.json) — separately recorded file sizes and SHA-256s. This is **our build record**, not a REA-bound artifact identity.

Final inspection evidence ID:

```text
ev_fc7f0f05e37b5cbe0cf5428d5f40f27756015a7caf24ad4f075cf206b2232dcc
```

The accessibility tree exposes the implemented project navigation, editable project-name field, layers/assets tabs, drafting controls, export, inspector and explicitly labelled demo assistant. Script metadata names the split built entry, editor and Three.js assets. Cross-checked those visible structures with source and browser workflow tests; this is not proof of every feature's correctness.

**Coverage:** `policy_filtered` and `attach_limited`, no truncated or unavailable sections. No script source bodies, console text, cookies, storage values, JSON bodies or WebSocket payloads were requested. Empty network/console observations cannot prove that no earlier traffic/errors occurred. REA explicitly reports artifact identity and browser host-platform identity unavailable. No Synaps browser, private source or authenticated traffic was inspected. The debugging browser/process was stopped after collection.

The earlier baseline partial static analysis and its memory failure remain documented above; they are not replaced by a claim of complete static recovery. The implementation evidence is the successful live inspection described here.
