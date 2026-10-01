# ClearData: AI Data Quality Copilot

## What It Is

ClearData is an AI-assisted data-quality workspace for CSV data. It helps an analyst inspect a dataset, identify quality risks, compare possible corrections, understand the effect of a change, and retain a reversible record of every approved decision.

The workflow is deliberately analyst-led:

**Data -> View -> Issues -> Changes -> Report**

Rather than presenting a generic dashboard, the application keeps the data table, flagged cells, issue evidence, and change history at the center of the experience.

## Business Problem

Business analysts often receive operational data with missing values, inconsistent labels, formatting conflicts, duplicate records, and statistical anomalies. The cost is not only data preparation time. Undocumented or automatic cleanup can change analytical conclusions without a defensible audit trail.

ClearData addresses that gap with **an AI-assisted data-quality workspace combining deterministic issue detection with context-aware remediation, visual impact analysis, and reversible human-approved corrections**.

## Value Proposition For A Business Analyst

- Reduce manual scanning with targeted issue detection and highlighted cells.
- Keep business judgment in the workflow: a flagged value is not automatically an error.
- Compare treatments before altering a dataset, including simulated distribution and category impacts.
- Preserve the original file and record each finalized correction for traceability and rollback.
- Produce a clearer handoff through a quality report, cleaned CSV export, and documented unresolved risks.

This approach supports stronger analytical governance. It makes the reasoning behind a change visible instead of treating data cleaning as an opaque preprocessing step.

## Product Workflow

1. Load a local CSV or select a bundled healthcare, sales, or marketing sample.
2. Profile and inspect the dataset in a spreadsheet-style view.
3. Review detected issues by column, with examples and evidence.
4. Compare predefined and AI-requested correction options.
5. Inspect the projected effect before finalizing a decision.
6. Finalize, mark valid, or defer the issue.
7. Review change history, roll back safe changes, and export the working dataset.

## How It Was Built

The application is a lightweight HTML, CSS, and JavaScript workspace served locally by Node.js during development.

- Deterministic checks handle objective conditions such as missing values, inconsistent percentage scales, category variants, cross-column violations, and IQR outliers.
- The issue review experience connects evidence, possible fixes, impact previews, and a final analyst decision in one workflow.
- Local Ollama support enables bounded AI requests for alternative remediation proposals without exposing a provider key in the browser.
- The UI supports sample data, local CSV upload, table inspection, issue navigation, reversible changes, and cleaned CSV export.

I used OpenCode as an AI-enabled engineering assistant to accelerate implementation, investigate defects, and validate changes. Product intent, workflow decisions, acceptance criteria, and final review remain human-directed. This is important: AI assisted the build process and can assist with bounded recommendations inside the product, but it does not replace analyst accountability.

## Human-In-The-Loop Design

The product does not silently modify source data.

- Detection is automated where evidence is objective.
- AI recommendations are constrained to the selected issue, column, affected records, and allowed operation.
- A recommendation is validated against the actual dataset before it becomes actionable.
- Selecting an option only updates a preview.
- The analyst explicitly finalizes a change, marks a value valid, or leaves the issue unresolved.
- Finalized changes are visible in history and can be rolled back.

This design recognizes that unusual values can be valid business events, and that data quality is often contextual rather than purely statistical.

## AI Architecture

In local development, the app uses Ollama for bounded, structured remediation proposals. The default local model is `llama3.2:3b`.

For public deployment, the frontend will be hosted on Cloudflare Pages and the AI route will run as a Cloudflare Pages Function. The OpenAI API key will be stored only as a Cloudflare encrypted secret, never in GitHub, client-side JavaScript, or a local credential file. The browser will continue calling the same-origin `/api/ai/proposals` route.

## Portfolio Evidence

This project demonstrates:

- Business analysis: converting ambiguous quality risks into reviewable decisions and measurable tradeoffs.
- Data analysis: profiling columns, detecting rule violations, interpreting distributions, and documenting analytical impact.
- Product thinking: organizing the experience around an end-to-end analyst workflow rather than isolated technical checks.
- AI literacy: using structured prompts, bounded context, server-side secrets, response validation, and human approval gates.
- Engineering collaboration: using AI tools such as OpenCode to iteratively build and test while maintaining human ownership of requirements and outcomes.

## Current Scope

ClearData is a portfolio demonstration, not a production governance platform. It supports local CSV workflows and bundled datasets. A public deployment will add Cloudflare-hosted server-side AI access with abuse protection before any OpenAI key is enabled.
