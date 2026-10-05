# ClearData: AI Data Quality Copilot

[Open the live demo](https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev)

ClearData is an AI-assisted, human-controlled workspace for reviewing and improving CSV data quality. It helps a business analyst identify issues, compare remediation options, assess analytical impact, and retain a reversible record of approved changes.

## Why It Exists

Data cleaning should not be a black box. ClearData combines deterministic issue detection with context-aware remediation, visual impact analysis, and reversible human-approved corrections.

The analyst remains in control: detected issues can be finalized, marked valid, or left unresolved. The original source is preserved.

## Workflow

**Dataset → Explore → Review → Decisions → Report**

1. Load a local CSV or select a bundled sample dataset.
2. Inspect values in a spreadsheet-style view.
3. Choose a finding from the searchable review queue.
4. Follow **Understand → Interpret → Treat & scope → Preview → Approve**.
5. Confirm the meaning, exact record scope, and treatment; approve or leave unresolved.
6. Review history, roll back changes, and export the cleaned dataset.

## Features

### Try a bundled sample

Choose **Try a sample dataset** and select **Healthcare patient visits**, **Sales orders**,
or **Marketing campaigns**. Each sample contains 1,000 records. In Explore, select a
type-specific rail marker or highlighted cell to inspect its value and evidence.
Off-screen findings are counted separately by issue type at each edge of the rail.
For missing numerical values, review mean, median, or leaving the value missing in
the treatment preview before approving an explicitly scoped decision.

The Dataset overview profiles completeness, distinct values, and numerical ranges.
Local checks surface possible missing tokens (`NULL`, `N/A`, etc.), contextual
sentinels, whitespace/category variants, number/date formats, duplicates, and
outliers across arbitrary columns. Discovery never silently changes values.

AI interpretation **starts automatically on import** using bounded, batched evidence.
The highest-ranked suggestion appears first, with alternatives and assumptions;
its score is a model-assessed rank, **not a calibrated probability**. Analysis can
be cancelled, retried, or supplemented with context. Local/manual review remains
available when AI is unavailable. Unknown, not applicable, and legitimate zero
have separate decision semantics.

Scoped treatments include missing normalization; constant/manual correction;
mean, median, group median; whitespace/case normalization; exact mapping;
number/date parsing; explicit scaling; bounds capping; and row removal. Duplicate
review supports first/last/most-complete/manual survivors and complementary merges.
Preview exposes blocked records and new configured-constraint violations.
Original/working/proposed charts integrate approved decisions cumulatively.

The new analyst-first visual system uses local typography, SVG finding icons,
and a focused stage instead of an expanding control wall. See [DESIGN.md](DESIGN.md).

[Desktop review](docs/screenshots/review-desktop.png) ·
[Mobile review](docs/screenshots/review-mobile.png)

These Playwright captures use synthetic data and a mocked AI interpretation;
[capture provenance](docs/screenshots/README.md) is recorded alongside them.

Blank cells are review findings, not automatic errors: fields such as an open
opportunity's actual close date can legitimately be empty.

- Local CSV upload plus healthcare, sales, and marketing sample datasets.
- Spreadsheet-style inspection with highlighted issue cells.
- Deterministic checks for missing values, category variants, format conflicts, cross-column rules, and numerical outliers.
- Bounded AI requests for alternative remediation proposals.
- Before-and-after impact previews.
- Human approval, change history, and rollback.
- Cleaned CSV export.
- Downloadable self-contained HTML/JSON quality reports and CSV/JSON decision logs, including rationale and rollback events.
- Exact-row and composite business-key duplicate review, with previews, conflict acknowledgement, and reversible removal.
- Explicitly saved browser-local projects, portable JSON backups, and reusable review-rule libraries.
- Declared schema checks for type, required values, numeric bounds, and allowed categories.
- Configured sum/difference/product/ratio metric checks with explicit preview and approval of recalculation.

## Projects, Rules, and Review Artifacts

On **Dataset**, use **Save project** to save the current workspace in IndexedDB. **Saved projects** reopens saved data, original values, history, proposals, rules, and review state after refresh. **Download project backup** and **Import project backup** transfer that state between browsers/devices or origins. Saving is explicit; unsaved changes are not automatically persisted.

This works with the existing Cloudflare static asset deployment and requires no new database binding or server-side upload. Storage is specific to the browser and site origin: localhost, a preview URL, and the deployed Worker have separate project libraries. Browser storage can be cleared; use backups for portable retention.

On **Review**, expand **Definitions, business checks & manual corrections** for
column policies, business relationships, schema/metrics, duplicate keys, and manual
corrections. Duplicates use exact, case-sensitive comparison and skip blank business
keys. Survivor policies are explicit. Complementary merges fill only blank survivor
fields with one unambiguous group value; conflicting values need acknowledgement.

**Schema / metric rules** configures expected types (`any`, `text`, `number`, `integer`, ISO `date`, `boolean`, `category`), required/nonblank status, numeric bounds, and allowed labels. Allowed labels are case-sensitive after trimming for validation; schema checks do not normalize stored labels. These definitions flag observations without changing them.

Metric rules choose an existing target column, left/right numerical source columns, sum/difference/product/ratio, a result factor, decimal precision, and absolute tolerance. Examples include `profit = revenue − cost`, `revenue = quantity × unit_price`, `ROAS = revenue ÷ spend`, and a whole-percentage CTR using factor 100. Missing inputs and zero denominators become separate findings, not zero-valued estimates. Review the calculated/proposed values and explicitly approve recalculation; dependent metrics are not cascaded automatically.

Use **Reusable rules** to save schema, metric, outlier, duplicate, column-policy, and
relationship definitions. JSON import/export supports reuse. Applying definitions
runs checks without treatments; missing columns, metric cycles, and invalid parameters
are rejected before active configuration changes.

On **Report**, download the quality report as HTML (printable to PDF through the browser) or JSON, and the decision log as JSON or CSV. The log retains approval and rollback events, timestamps, optional analyst rationale, value patches, and removed-row snapshots. Rollback events include actual resulting changes, which can differ from a simple reversal when later decisions overlap. These are review records rather than tamper-proof enterprise audit logs.

## Local Development

The local server defaults to Ollama:

```bash
node server.js
```

Open `http://localhost:4174`.

Configure local AI behavior with a non-committed `.env` file if needed. See `.env.example` for supported values. The server reads `process.env`; export the variables or use `node --env-file=.env server.js` on a supporting Node version.

Run the data-treatment and API regression checks with:

```bash
node --test scripts/verify_quality.cjs scripts/verify_cleaning.cjs
```

CSV import supports quoted multiline fields and rejects invalid headers or malformed quoting without replacing the current workspace. Numerical previews use the same rounded values as approval. Report counts distinguish approved decisions from actual modified rows and cells. Rollback preserves later approved values and refreshes findings.

Outlier approval saves the displayed definition and treats only the explicit scope.
Numerical fills have configurable precision; grouped estimates block populations
without observations. Meaning, scope, rationale, patches, and removals are retained
with the decision. Stale previews cannot be approved after data or treatment changes.

### Playwright and Impeccable

Install optional browser tooling separately from the dependency-free application,
install Chromium/dependencies, run the local server, and point the runner at it:

```bash
npm install --prefix /tmp/cleardata-tools playwright
/tmp/cleardata-tools/node_modules/.bin/playwright install --with-deps chromium
PLAYWRIGHT_MODULE=/tmp/cleardata-tools/node_modules/playwright node scripts/verify_ui.cjs
```

`BASE_URL` selects another server. `ARTIFACT_DIR` selects an existing screenshot
directory. The runner mocks AI and checks six widths, five steps, keyboard navigation,
local fonts, normalization, legitimate zero, blocked dates, manual correction,
history/rollback/project restore, three samples, export, and cancellation.

Impeccable is installed in `.opencode/skills/impeccable`. Restart OpenCode to discover
`/impeccable`. [PRODUCT.md](PRODUCT.md) records product truth and [DESIGN.md](DESIGN.md)
records visual rules. Tool binaries and temporary captures are gitignored.

## Public Deployment

Cloudflare Workers serves the static site and runs `src/worker.js` for `/api/*` requests. The Worker calls OpenAI server-side and reads `OPENAI_API_KEY` only from a Cloudflare runtime secret. See [DEPLOYMENT.md](DEPLOYMENT.md) for the required Worker secrets.

The Node, Worker, and alternative Pages handlers share proposal validation, response extraction, byte limits, provider timeouts, and process/isolate-local rate protection through `src/ai.cjs`. Rate protection is not a durable distributed quota. AI status indicates configuration, not a tested provider health check.

Never commit API keys, `.env` files, or credential files. The included `.gitignore` excludes them.

## Human-In-The-Loop AI

Automatic interpretation sends capped value representations, counts, calculated
statistics, column meaning, and rule context—not the entire CSV—to the server-side
provider. Candidate/evidence IDs, allowed meanings, score bounds, and operations are
validated. A suggested operation is advice: the analyst configures its parameters,
scope, and exact preview before explicit approval. Approvals invalidate old AI
evidence; refresh analysis for the working data when needed.

## Portfolio Context

ClearData demonstrates business analysis, data-quality reasoning, product workflow design, structured AI integration, and secure deployment practices. See [PROJECT_WRITEUP.md](PROJECT_WRITEUP.md) for the full project narrative.

See [PRODUCT_REVIEW.md](PRODUCT_REVIEW.md) for the implementation-based usability
assessment, cleaning-coverage gaps, and prioritized portfolio roadmap.

See [CLEANING_ROADMAP.md](CLEANING_ROADMAP.md) for current coverage, remaining
analytical limitations, and the deferred Excel discussion.
