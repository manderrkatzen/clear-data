# Repository Guide

## Initialization and Tooling Directive

- Read this guide on initialization. For every task, use the Impeccable skill when applicable and Playwright for browser/UI verification, unless their overhead is genuinely unnecessary (for example, a local documentation-only task, a trivial non-UI edit, or a backend-only task). State any relevant omission briefly; do not skip these tools for substantive UI work.
- Local reference documents requested by the user stay local unless publishing them is explicitly requested. Application updates continue to follow the release instructions below.

## Project

ClearData is an AI-assisted CSV data-quality workspace. Its visible workflow is **Dataset → Explore → Review → Decisions → Report** (internal screens: `data`, `view`, `issues`, `changes`, `report`). Deterministic checks identify findings; users review treatment previews, explicitly approve changes, and can roll them back or export the working dataset.

## Structure

- `index.html`: application shell, dialogs, navigation, and script/style loading.
- `app.js`: shared browser state, CSV import/export, issue detection, treatment previews, AI requests, history, and screen rendering.
- `spreadsheet.js`: spreadsheet view, issue rail, and cell inspection; shares globals with `app.js`. It loads before `app.js` as a classic script.
- `workspace.js` and `workspace.css`: downloadable review artifacts, duplicates, schema/metric rules, and browser-local projects/rule libraries. `workspace.js` loads before `app.js` and uses its globals when invoked.
- `cleaning-engine.js` and `profile-worker.js`: pure profiling/parsing/scoped treatments and background profiling; the engine is also required by Node tests.
- `analysis-engine.js`, `analysis-worker.js`, and `analytics.js`: deterministic missingness/held comparisons, cached background computation, traceable group-wise/KNN fills, and summary-only AI explanations integrated into review stages. Keep per-cell fill provenance in approved history and project validation.
- `review.js`, `review-ui.js`, and `review.css`: deterministic candidate integration, bounded automatic AI interpretation, fingerprinted approval, shared controls, and Dataset definitions. Classic scripts load before `app.js`.
- `review-page.js`, `review-core.js`, `review-charts.js`, `review-page.css`, `review-page-engine.js`, and `issues/*.js`: the **Issue list + Explore · Fix · Review** surface. `review_spec/README.md` and the numbered `review_spec/*.md` files are the single source of truth, superseding all earlier briefs. Implement and verify files in the specified stage order, with requirement-ID comments and exact `data-ui` names. Each issue module exposes detection, Explore, fix options, Review, and AI hooks. Shared consequences explain reported-number impact and explicitly label risk. The tabs are freely navigable, not a wizard. Definitions live on Dataset under `dataset.setup`.
- `review-bands.js`: bounded per-group chart orchestration, shared with `analysis-worker.js`; reuse the existing engines without new statistical methods. Text grouped-mode filling is not supported by the current treatment engine; do not invent it as a UI side effect.
- `value-review.js`: per-representation contextual assessments and source-preserving, reversible meaning-decision helpers. Unconfirmed tokens never enter physical fill scope. Do not replace these with blanket token/zero missingness switches.
- `capabilities-engine.js` and `capabilities.js`: local record/group lenses, transient candidates, KPIs, export provenance, suggested checks, dependencies, and scorecards. All observation semantics use `CleaningEngine.observationState`; numeric ranks use Cliff’s delta. Verify with `scripts/verify_next_capabilities.cjs`, `scripts/verify_next_performance.cjs`, and `scripts/verify_next_capabilities_ui.cjs`.
- `design-system.css`: final-loaded visual authority, with local typography in `fonts/`. Read `PRODUCT.md` and `DESIGN.md` before visual changes.
- `styles.css` and `spreadsheet.css`: application and spreadsheet styling.
- `server.js`: dependency-free Node HTTP server and local AI API, defaulting to Ollama.
- `src/worker.js`: deployed Cloudflare Worker API and static asset routing, using OpenAI and optional Turnstile verification.
- `src/ai.cjs`: shared Node/Worker/Pages proposal validation, providers, timeouts, byte limits, and process/isolate-local rate protection.
- `functions/api/ai/proposals.js`: additional Cloudflare Pages proposal handler. Check its relevance when changing API behavior; the configured Workers entry point is `src/worker.js`.
- `wrangler.jsonc` and `.assetsignore`: Workers deployment and explicit browser asset allowlist.
- Root CSV files: bundled healthcare, sales, and marketing samples.
- `scripts/generate_distribution_demo.py`: demo-data generation utility.
- `README.md`, `DEPLOYMENT.md`, and `PROJECT_WRITEUP.md`: workflow, deployment, and product context.

## Development and Verification

There is no package manifest or application build pipeline. Use a current Node.js runtime with built-in `fetch` and `AbortSignal.timeout`. Run `node --test scripts/verify_quality.cjs scripts/verify_cleaning.cjs` for mocked data-treatment/API regressions. `scripts/verify_ui.cjs` is an optional Playwright runner; see README for external tooling setup.

For analytical changes, also run `node --test scripts/verify_pattern.cjs` and `node --test scripts/verify_analysis.cjs` (separately for the timing budget), plus `scripts/verify_analytics_ui.cjs` with the same Playwright setup. Check new classic scripts with `node --check` and Pages modules with `node --input-type=module --check`.

```bash
node server.js
```

Open `http://localhost:4174`. The server reads configuration from `process.env`; it does not automatically load `.env`. Export variables in the shell or use Node's `--env-file=.env` option on a supporting runtime. Consult `.env.example` for configuration names.

For Workers development, use `npx wrangler dev`. See `DEPLOYMENT.md` for runtime variables and secrets.

The user requests publishing every completed update by default: after verification, commit the intended changes, push the current release branch to GitHub, and deploy the existing Cloudflare Worker with `npx wrangler deploy --keep-vars`, unless the user explicitly asks not to. Verify the affected flow on the permanent hosted URL and report the commit and deployment result. Preserve unrelated user files and server-side secrets.

The user has granted standing permission for task-related verification, publishing, and stopping identified stale development sessions. Proceed with these actions without repeated permission prompts; clarify requirements only when a product decision is genuinely unresolved.

The permanent hosted URL is `https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev`. Releases and rollbacks must update that existing Worker. Keep its name unchanged, `workers_dev: true`, and `preview_urls: false`; preserve alternative versions in Git rather than publishing separate preview URLs unless the user explicitly changes this requirement.

For JavaScript edits, run syntax checks on affected files:

```bash
node --check app.js
node --check spreadsheet.js
node --check workspace.js
node --check server.js
node --check src/ai.cjs
node --input-type=module --check < src/worker.js
node --input-type=module --check < functions/api/ai/proposals.js
node --input-type=module --check < functions/api/ai/status.js
```

For UI or data-treatment changes, manually exercise the affected flow with a bundled sample: load data, inspect highlighted cells and issue rail markers, review a treatment preview, finalize, check history, roll back, and export as relevant. Check the browser console and responsive layout. Verify API changes against the affected runtime; local and deployed handlers have different capabilities.

## Coding Conventions

- Keep the vanilla JavaScript/HTML/CSS architecture and existing global-script relationships unless the task requires a structural change.
- Follow surrounding style: camelCase functions and variables, double-quoted JavaScript strings, semicolons, and two-space indentation in multiline code.
- Inspect the entire relevant section before editing: `app.js` contains compact functions as well as later definitions. Confirm which definition is active.
- Escape dataset and user-provided text with `escapeHtml` when interpolating HTML. Use DOM text APIs where suitable.
- Preserve row identity (`_row`), original values, issue status, preview behavior, and reversible change history when modifying treatments.
- Row removal keeps `state.allRows` as the identity pool; rollback replays remaining value patches and removals from the original snapshot. Record actual rollback effects in the review log.
- Project JSON must validate/reconcile before replacing state. IndexedDB persistence is explicit and origin-local; rule reuse must not apply treatments automatically.
- Treat blanks and outliers as findings requiring contextual review. Do not automatically equate them with invalid data.
- AI returns bounded, validated proposals; applying changes requires explicit user confirmation. Keep operation, column, and category-source validation intact.
- Interpretation starts automatically on import in bounded batches. Preserve candidate/evidence ID validation, stale-response guards, cancellation, and non-calibrated ranking wording. Advice never executes treatments.
- Guided approval requires an unchanged preview fingerprint and explicit scope. Blocked records stay open unless a valid subset is expressly chosen. Semantic classification is replayed from decision metadata and must survive restore/rollback.
- Keep provider credentials server-side. Respect `.gitignore`; do not commit `.env`, `.dev.vars`, credential files, or generated `.wrangler` state.
- Update `.assetsignore` when adding browser assets that must be deployed.
- Inspect existing working-tree changes and preserve user work. Keep changes focused on the requested task.
