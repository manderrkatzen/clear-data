# ClearData: AI Data Quality Copilot

[Open the live demo](https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev)

ClearData is an AI-assisted, human-controlled workspace for reviewing and improving CSV data quality. It helps a business analyst identify issues, compare remediation options, assess analytical impact, and retain a reversible record of approved changes.

## Why It Exists

Data cleaning should not be a black box. ClearData combines deterministic issue detection with context-aware remediation, visual impact analysis, and reversible human-approved corrections.

The analyst remains in control: detected issues can be finalized, marked valid, or left unresolved. The original source is preserved.

## Workflow

**Data -> View -> Issues -> Changes -> Report**

1. Load a local CSV or select a bundled sample dataset.
2. Inspect values in a spreadsheet-style view.
3. Review issues grouped by column.
4. Compare possible fixes and impact previews.
5. Finalize, mark valid, or defer a decision.
6. Review history, roll back changes, and export the cleaned dataset.

## Features

### Try a bundled sample

Choose **Use sample CSV** and select **Healthcare patient visits**, **Sales orders**,
or **Marketing campaigns**. Each sample contains 1,000 records. In View, select a
type-specific rail marker or highlighted cell to inspect its value and evidence.
Off-screen findings are counted separately by issue type at each edge of the rail.
For missing numerical values, review mean, median, or leaving the value missing in
the treatment preview before approving a column-wide decision.

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

On **Data**, use **Save project** to save the current workspace in IndexedDB. **Saved projects** reopens saved data, original values, history, proposals, rules, and review state after refresh. **Download project backup** and **Import project backup** transfer that state between browsers/devices or origins. Saving is explicit; unsaved changes are not automatically persisted.

This works with the existing Cloudflare static asset deployment and requires no new database binding or server-side upload. Storage is specific to the browser and site origin: localhost, a preview URL, and the deployed Worker have separate project libraries. Browser storage can be cleared; use backups for portable retention.

On **Issues**, **Review duplicates / keys** compares full rows or selected key columns using exact, case-sensitive values. Blank key components are excluded from key grouping. The proposed policy keeps the earliest source row in each group; records with conflicting non-key values need an explicit acknowledgement before removal. All removals can be rolled back while preserving later approved values.

**Schema / metric rules** configures expected types (`any`, `text`, `number`, `integer`, ISO `date`, `boolean`, `category`), required/nonblank status, numeric bounds, and allowed labels. Allowed labels are case-sensitive after trimming for validation; schema checks do not normalize stored labels. These definitions flag observations without changing them.

Metric rules choose an existing target column, left/right numerical source columns, sum/difference/product/ratio, a result factor, decimal precision, and absolute tolerance. Examples include `profit = revenue − cost`, `revenue = quantity × unit_price`, `ROAS = revenue ÷ spend`, and a whole-percentage CTR using factor 100. Missing inputs and zero denominators become separate findings, not zero-valued estimates. Review the calculated/proposed values and explicitly approve recalculation; dependent metrics are not cascaded automatically.

Use **Reusable rules** to save schema, metric, saved outlier, and duplicate definitions in the browser. Rules can also be downloaded/imported as JSON. Applying definitions runs checks without applying treatments. Missing referenced columns, circular metric dependencies, and invalid parameters are rejected before the active configuration changes.

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
node --test scripts/verify_quality.cjs
```

CSV import supports quoted multiline fields and rejects invalid headers or malformed quoting without replacing the current workspace. Numerical previews use the same rounded values as approval. Report counts distinguish approved decisions from actual modified rows and cells. Rollback preserves later approved values and refreshes findings.

Outlier approval saves the displayed rule and reviews its complete matching set; record filters only narrow inspection. The record **View** action locates the exact row in the spreadsheet. AI assumptions and warnings are displayed before approval, and proposal controls are available for numerical fills and category mappings.

## Public Deployment

Cloudflare Workers serves the static site and runs `src/worker.js` for `/api/*` requests. The Worker calls OpenAI server-side and reads `OPENAI_API_KEY` only from a Cloudflare runtime secret. See [DEPLOYMENT.md](DEPLOYMENT.md) for the required Worker secrets.

The Node, Worker, and alternative Pages handlers share proposal validation, response extraction, byte limits, provider timeouts, and process/isolate-local rate protection through `src/ai.cjs`. Rate protection is not a durable distributed quota. AI status indicates configuration, not a tested provider health check.

Never commit API keys, `.env` files, or credential files. The included `.gitignore` excludes them.

## Human-In-The-Loop AI

AI does not silently modify data. It receives only bounded issue context and returns a structured proposal that is validated before display. Selecting a fix updates a preview; the analyst must explicitly finalize any change.

## Portfolio Context

ClearData demonstrates business analysis, data-quality reasoning, product workflow design, structured AI integration, and secure deployment practices. See [PROJECT_WRITEUP.md](PROJECT_WRITEUP.md) for the full project narrative.
