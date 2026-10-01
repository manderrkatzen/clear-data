# Clearview: AI Data Quality Copilot

Clearview is an AI-assisted, human-controlled workspace for reviewing and improving CSV data quality. It helps a business analyst identify issues, compare remediation options, assess analytical impact, and retain a reversible record of approved changes.

## Why It Exists

Data cleaning should not be a black box. Clearview combines deterministic issue detection with context-aware remediation, visual impact analysis, and reversible human-approved corrections.

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

- Local CSV upload plus healthcare, sales, and marketing sample datasets.
- Spreadsheet-style inspection with highlighted issue cells.
- Deterministic checks for missing values, category variants, format conflicts, cross-column rules, and numerical outliers.
- Bounded AI requests for alternative remediation proposals.
- Before-and-after impact previews.
- Human approval, change history, and rollback.
- Cleaned CSV export.

## Local Development

The local server defaults to Ollama:

```bash
node server.js
```

Open `http://localhost:4174`.

Configure local AI behavior with a non-committed `.env` file if needed. See `.env.example` for supported values.

## Public Deployment

Cloudflare Workers serves the static site and runs `src/worker.js` for `/api/*` requests. The Worker calls OpenAI server-side and reads `OPENAI_API_KEY` only from a Cloudflare runtime secret. See [DEPLOYMENT.md](DEPLOYMENT.md) for the required Worker secrets.

Never commit API keys, `.env` files, or credential files. The included `.gitignore` excludes them.

## Human-In-The-Loop AI

AI does not silently modify data. It receives only bounded issue context and returns a structured proposal that is validated before display. Selecting a fix updates a preview; the analyst must explicitly finalize any change.

## Portfolio Context

Clearview demonstrates business analysis, data-quality reasoning, product workflow design, structured AI integration, and secure deployment practices. See [PROJECT_WRITEUP.md](PROJECT_WRITEUP.md) for the full project narrative.
