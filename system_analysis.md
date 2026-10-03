# ClearData — System Analysis, Feature Inventory, and Business Analytics Value

**Application:** ClearData / AI Data Quality Copilot<br>
**Analysis date:** October 3, 2026<br>
**Perspective:** Business analytics, analytical decision quality, product capability, and technical implementation<br>
**Evidence:** Current repository implementation, including browser code, local server, Cloudflare Worker, alternative Pages handler, sample datasets, and supporting utilities

> **Implementation updates:** Sections 1–20 are the baseline analysis captured before the requested implementation. Section 21 records corrections, and Section 22 records newly added capabilities. These sections supersede the corresponding baseline descriptions; other capability boundaries remain applicable.

## Table of Contents

1. [Executive assessment](#1-executive-assessment)
2. [Business problem and value proposition](#2-business-problem-and-value-proposition)
3. [Users, responsibilities, and workflow](#3-users-responsibilities-and-workflow)
4. [Data acquisition and profiling](#4-data-acquisition-and-profiling)
5. [Spreadsheet inspection and issue navigation](#5-spreadsheet-inspection-and-issue-navigation)
6. [Deterministic data-quality detection](#6-deterministic-data-quality-detection)
7. [Issue review and affected-record analysis](#7-issue-review-and-affected-record-analysis)
8. [Treatments and analytical impact previews](#8-treatments-and-analytical-impact-previews)
9. [Configurable outlier analysis](#9-configurable-outlier-analysis)
10. [AI-assisted proposal generation](#10-ai-assisted-proposal-generation)
11. [Decisions, history, and rollback](#11-decisions-history-and-rollback)
12. [Quality reporting and CSV export](#12-quality-reporting-and-csv-export)
13. [Bundled datasets and demonstration coverage](#13-bundled-datasets-and-demonstration-coverage)
14. [Architecture, runtime behavior, and data handling](#14-architecture-runtime-behavior-and-data-handling)
15. [Complete feature register](#15-complete-feature-register)
16. [Business applications and analytical examples](#16-business-applications-and-analytical-examples)
17. [Measurement framework and economic value](#17-measurement-framework-and-economic-value)
18. [Current boundaries and implementation qualifications](#18-current-boundaries-and-implementation-qualifications)
19. [Overall assessment](#19-overall-assessment)
20. [Implementation reference map](#20-implementation-reference-map)
21. [Implemented corrections and verification](#21-implemented-corrections-and-verification)
22. [New analytics review capabilities](#22-new-analytics-review-capabilities)

---

## 1. Executive Assessment

ClearData is a browser-based workspace for reviewing the quality of CSV datasets before using them in reporting, exploratory analysis, or downstream business intelligence. It combines automated, deterministic checks with contextual inspection, treatment previews, optional AI-generated alternatives, explicit analyst decisions, and reversible session history.

Its central product proposition is:

> Help analysts move from “this dataset contains suspicious values” to “these are the findings, these are the available treatments, this is their likely analytical impact, and these are the decisions we approved.”

The application organizes that process into five connected screens:

**Data → View → Issues → Changes → Report**

This is an analytical preparation and review tool. Its principal output is a working CSV, supported by an in-session record of decisions. It does not calculate a full business dashboard, build predictive models, or provide a persistent enterprise data-governance repository.

### 1.1 What the application does particularly well

- **Makes findings visible:** highlights affected cells and provides a type-specific navigation rail beside the spreadsheet.
- **Connects evidence to action:** an inspected cell leads into the issue-level review and treatment workflow.
- **Preserves analytical judgment:** missing values and unusual observations can be retained rather than automatically corrected.
- **Makes numerical treatment effects inspectable:** compares mean, median, and before/after frequency distributions for numerical fills.
- **Supports contextual outlier review:** offers statistical methods, fixed business ranges, custom rules, filters, and interactive scatter plots.
- **Separates AI advice from approval:** AI returns a bounded proposal; an analyst must finalize it before values change.
- **Supports reversible decisions:** records original affected values for rollback within the current browser session.
- **Provides an accessible handoff format:** exports the working dataset as CSV for use in existing analytics tools.

### 1.2 Evidence standard used in this document

Capabilities below are based on the active code, not merely product language in earlier writeups. This matters because `app.js` contains several repeated function declarations: the final declarations determine the runtime behavior.

Business benefits are explained as plausible mechanisms and use cases, not as measured customer outcomes. Sample counts in Section 13 were calculated by running the current application parser and detection functions against the checked-in datasets in a Node VM with browser stubs. That exercise verifies those calculations; it is not a live-browser usability test or a live AI-provider test.

---

## 2. Business Problem and Value Proposition

### 2.1 The business analytics problem

Operational data often arrives as exports assembled for transactions rather than analysis. An analyst may encounter incomplete measurements, inconsistent category labels, incompatible percentage scales, mixed date representations, or values that appear extreme.

Each can affect decisions in a different way:

| Quality problem | Analytical consequence | Example business impact |
|---|---|---|
| Missing numerical observations | Changes sample coverage and can bias estimates | Incomplete cost observations distort margin interpretation |
| Category spelling variants | Fragment group-by results | One marketing channel appears as several smaller channels |
| Mixed percentage scales | Makes otherwise comparable records incomparable | A rate stored as `2.4` is compared directly with a rate stored as `0.024` |
| Mixed date formats | Complicates sorting, joins, and time aggregation | Campaign launches fall into inconsistent temporal groups downstream |
| Cross-column contradictions | Undermines confidence in calculated metrics | Click totals exceed the recorded impressions that should contextualize them |
| Extreme numerical observations | Can dominate averages or obscure ordinary patterns | A few high-spend campaigns overwhelm an average-budget comparison |
| Undocumented cleaning decisions | Makes results difficult to explain or reproduce | Stakeholders cannot determine whether a suspicious value was changed or accepted |

ClearData addresses both the **inspection cost** and the **decision-transparency cost** of preparing such data.

### 2.2 Core value proposition

**For business analysts:** replace scattered manual scanning with a connected evidence-and-decision workflow.

**For analytics stakeholders:** make it easier to explain why a working dataset differs from its source and why certain flagged values were retained.

**For data-quality review:** distinguish automated finding generation from contextual business validation.

**For AI adoption:** demonstrate a bounded assistance pattern in which AI proposes a treatment rather than independently editing the dataset.

### 2.3 Value mechanisms

1. **Faster triage:** automatically identify predefined classes of concern and show their locations.
2. **Reduced context switching:** view the evidence, treatment choices, previews, and affected records in the same issue workspace.
3. **Better treatment selection:** compare simple remediation options before approving them.
4. **Lower risk of unnecessary alteration:** retain legitimate blanks and extreme values when business context supports them.
5. **More explainable preparation:** record finalized decisions and their before/after examples.
6. **Lower experimentation cost:** roll back a decision without rereading the original file.
7. **Practical toolchain integration:** produce a CSV usable in spreadsheets, BI tools, SQL import workflows, notebooks, and reporting pipelines.

### 2.4 How to interpret the governance value

The application supports **analytical discipline and session-level traceability**. It does not implement durable audit logs, named approvers, approval hierarchies, role-based access, or retention policies. Its history should therefore be understood as a useful review aid, not as evidence of a complete compliance or enterprise governance system.

---

## 3. Users, Responsibilities, and Workflow

### 3.1 Intended user roles

These are business personas, not implemented permission roles:

| Persona | Main need | Relevant capabilities |
|---|---|---|
| Business analyst | Prepare a defensible analytical dataset | Import, profiling, finding review, treatment previews, export |
| Marketing analyst | Understand spend and engagement data quality | Spend outliers, missing metrics, clicks/impressions checks, compatible category/scale rules |
| Sales or commercial analyst | Review incomplete financial and operational fields | Missing cost/profit review, numerical fills, unusual unit-price analysis |
| Healthcare operations analyst | Understand completeness and unusual operational/clinical measurements | Missing measurement review, outlier inspection, contextual retention |
| Data steward or analytics reviewer | Understand preparation choices | Explicit decisions, before/after examples, history, rollback |
| Product demonstrator or learner | Explain human-controlled AI-assisted data preparation | Samples, proposal workflow, visual previews, reversible decisions |

### 3.2 End-to-end workflow

| Stage | Analyst question | Implemented behavior | Business deliverable |
|---|---|---|---|
| **Data** | What did I receive? | Load a CSV, inspect dimensions and inferred column types | Initial scope and quality backlog |
| **View** | Where are the findings? | Search rows, highlight affected cells, inspect evidence | Record-level understanding |
| **Issues** | What should we do? | Review grouped findings, compare treatments, inspect affected records | Explicit treatment decision |
| **Changes** | What did we approve? | Inspect decision history and restore originals | Session-level preparation trace |
| **Report** | What is the current state? | Summarize findings and decision counts, export CSV | Working data handoff |

### 3.3 Navigation and workflow support

- Other workspace screens are disabled until a dataset is loaded.
- The header displays the filename, original/working-version status, and unresolved finding count.
- Sidebar badges show unresolved issues and history-entry count.
- The context button opens View from Data, exports from Report, and otherwise opens the first unresolved issue.
- “Next issue” follows the issue array order; it does not implement weighted business prioritization or a sophisticated sequential-review queue.
- “Undo last change” opens rollback confirmation for the most recent history entry.
- Short-lived toast messages communicate events such as finalized decisions, saved outlier rules, and sample-loading errors.

These controls make review state visible without requiring the analyst to maintain a separate preparation checklist.

---

## 4. Data Acquisition and Profiling

### 4.1 Local CSV import

**Feature:** load a user-selected CSV through the browser file picker.

**Technical behavior:** `FileReader.readAsText` reads the file. `parseCsv` produces headers and row objects. The first record is interpreted as the header; headers are trimmed. Data values generally remain strings, with numerical conversion performed when calculations require it.

**Business value:** analysts can review ad hoc extracts without first provisioning a database, defining an integration, or uploading the entire source file to an AI service.

**Scope:** there is no Excel, JSON, Parquet, database, cloud-drive, or API connector. The file chooser advertises CSV acceptance, but this is not a full schema-validation system.

### 4.2 CSV parsing features and boundaries

Implemented parsing supports comma-separated fields, quoted values, commas inside quoted fields on a single line, and doubled quotes inside quoted fields. Missing trailing field values become empty strings.

The parser first splits text into physical lines. Consequently, quoted fields containing embedded line breaks are not handled as multiline CSV records. It also does not validate duplicate headers, field-count consistency, malformed quotes, or delimiter alternatives. Duplicate headers can overwrite object properties, and additional values beyond the header count are not preserved.

The `_row` property is reserved internally for row identity. A source column with that same name can interfere with the identifier because imported header properties are spread into the row object after the generated `_row` value.

These limitations matter when reviewing complex exports: a successful load is not proof that every aspect of the source CSV conforms to the parser's assumptions.

### 4.3 Original and working data representations

On import, the application maintains:

- `state.original`: a separate shallow copy of every parsed row.
- `state.rows`: the working row objects used by the application.
- `state.headers`: the original header order used for display and export.
- `_row`: a generated one-based row identifier for ordinary compatible inputs.

Treatments update the working rows; they do not write back to the source file. The original snapshot is an in-memory copy, not a versioned database record or a cryptographically immutable object.

### 4.4 Dataset replacement

The Data screen provides a **Replace source** action. Loading another dataset resets decision history, selected issue/record, searches, flagged-row filtering, outlier drafts, proposals, scatter state, and issue filters, then runs detection on the new data.

**Business value:** a fresh extract begins a fresh review cycle.

**Operational implication:** there is no workspace archive or merge across imports. Previous session decisions are not carried into the replacement dataset.

### 4.5 Bundled sample selection

The sample picker provides three choices:

- Healthcare patient visits.
- Sales orders.
- Marketing campaigns.

Each CSV is fetched from the same application origin with `cache: "no-store"`, then loaded through the same parsing and detection path as a local file. Loading failures appear in a toast and are logged to the browser console.

**Business value:** users can evaluate the application before supplying their own data and can compare quality-review needs across business domains.

### 4.6 Numerical column inference

A column is considered numeric when the count of nonblank values coercible to finite JavaScript numbers is at least:

```text
max(4, 0.60 × total dataset rows)
```

This is a whole-dataset coverage threshold, not “60% of the nonmissing values.” A fully numerical column with more than 40% missing entries may therefore fail numerical inference. Datasets with fewer than four rows cannot satisfy the minimum count.

**Business value:** allows generic numerical profiling without asking the analyst to define every type manually.

**Qualification:** identifiers and binary indicators can also meet the numerical criterion. The application does not infer business semantics, measurement units, or whether a column should be treated as a categorical code.

### 4.7 Display type inference

Headers are labeled:

- **Number** when numerical inference succeeds.
- **Date** when numerical inference fails and the header contains the lowercase substring `date`.
- **Text** otherwise.

The date label is a name-based heuristic, not validation of all date values. There is no manual type override or schema editor.

### 4.8 Data overview and import-status indicators

The loaded Data screen shows:

- Row count.
- Column count.
- Number of open findings.
- Original or Working version.
- Count of approved history entries.
- Column names and their inferred display types.
- Header-detected and records-parsed messages.
- A message directing the analyst to review detected findings.

The application internally calculates total blank cells, although the principal Data metric cards focus on rows, columns, open findings, and version.

**Business value:** establishes review workload and dataset shape before treatment decisions begin.

**Qualification:** “Header row detected” means the parser used the first row as headers. It is not a probabilistic header-detection or schema-conformance check.

---

## 5. Spreadsheet Inspection and Issue Navigation

### 5.1 Full working-data table

View displays the working dataset with a row-number column, source headers, and inferred types beneath the headers. Values reflect approved treatments. The spreadsheet is an inspection interface: there is no general-purpose cell editor, formula bar, row insertion, column deletion, or sort control.

The table uses a scrollable viewport and renders the matching rows into the DOM. It does not implement pagination or virtualized row rendering.

### 5.2 Dataset-wide text search

The search box performs case-insensitive substring matching across the source columns. Search updates the visible rows immediately and preserves input focus and cursor position after rerendering.

**Business value:** locate a business identifier, label, or known value while reviewing a larger dataset.

**Qualification:** it is value search, not SQL, regular-expression search, or a dedicated exact-row-ID locator.

### 5.3 Flagged-rows-only filter

A checkbox restricts View to rows associated with at least one **open** issue. It combines with text search, and the toolbar displays visible rows versus total dataset rows.

**Business value:** directs attention to the current quality-review workload.

Because resolved/accepted issues stop contributing flags, an accepted row can disappear from this view even if its source value was intentionally retained.

### 5.4 Cell-level highlights and multi-finding symbols

Open issues are indexed by row and column. Affected cells receive type-specific backgrounds and symbols:

| Visual class | Symbol | Business meaning |
|---|---|---|
| Missing | `?` | Value is blank and requires contextual review |
| Outlier | `◇` | Value falls within a flagged outlier set |
| Category | `≠` | Label differs from the expected formatting |
| Format | `↔` | Date or rate representation requires review |
| Conflict | `!` | Cross-column rule finding |

If multiple findings share a cell, its symbols can represent multiple classes; its primary visual class comes from the first finding. This avoids treating all findings as one undifferentiated error category.

### 5.5 Viewport-aware issue rail

The side rail positions finding markers beside the visible rows. Its markers are grouped by row and issue type.

- Visible-row markers lead to the corresponding finding.
- Findings above the viewport aggregate at the upper edge by type.
- Findings below the viewport aggregate at the lower edge by type.
- Edge markers show direction arrows and counts.
- Clicking an edge marker scrolls toward a relevant off-screen row and opens inspection.
- Counts represent finding entries, not guaranteed unique rows or unique cells.
- Search and flagged-row filtering determine which rendered rows contribute to the rail.

Scrolling uses `requestAnimationFrame` to schedule marker updates. A `ResizeObserver` recalculates placement when the viewport changes size. Focus is restored when rail buttons are reconstructed.

**Business value:** provides location awareness in a long table and reduces repeated manual scrolling.

### 5.6 Record and cell inspection card

Selecting a highlighted cell or rail marker highlights the selected row/cell and opens a detail card showing:

- Finding class and symbol.
- Row identifier and affected column.
- Assigned priority.
- A human-readable finding title.
- Context explaining why review is appropriate.
- Evidence values specific to the finding.
- An action leading to issue-level treatment review.
- The size and column-wide scope of that review.

Examples of evidence include:

- Missing cells: current value, dataset missing count, numerical mean and median where applicable.
- Outliers: current numerical value, lower/upper IQR fences, multiplier.
- Categories: compared canonical label and count of rows with the selected spelling.
- Dates: current string and its MM/DD/YYYY-to-ISO interpretation.
- Rate scale: current rate and its divide-by-100 interpretation.
- Cross-column conflict: impressions and click/impression difference.

### 5.7 Multiple findings within a row

When a row contains multiple findings, the inspection card provides tabs by finding type. If several findings share the same type, additional column-specific tabs allow selection among them.

**Business value:** permits a row-level explanation without collapsing independent problems into a single warning.

### 5.8 Keyboard and accessibility support

Highlighted cells are focusable and respond to Enter or Space. Rail markers and tabs are buttons with accessible labels and pressed state. Details use a live region; the application also labels navigation, search, and finding groups.

The stylesheet uses symbols and labels in addition to color, making the quality categories more distinguishable than color alone.

These are implemented accessibility aids, not evidence of a completed accessibility certification or comprehensive keyboard audit.

---

## 6. Deterministic Data-Quality Detection

### 6.1 Detection model

`detectIssues` creates issue objects containing an ID, column, type, label, affected row references, severity, summary, recommendation, and status. Initial status is `open`.

Detection runs when data is loaded. It is deterministic browser-side logic; an AI call is not required to identify these findings.

The UI's “AI ANALYSIS” label on review panels does not mean the displayed detection summary was generated by an AI model. Most evidence and default choices are authored or calculated locally.

### 6.2 Missing values across every column

**Rule:** a value is missing when its string representation, after trimming whitespace, is empty.

The application creates one missing-value issue for each column with blanks. Numerical columns receive **Missing numerical values**, high priority, and an imputation recommendation. Other columns receive **Missing values**, high priority, and a keep recommendation.

**Business value:** exposes completeness gaps across arbitrary CSV headers.

**Important distinctions:**

- Zero is not treated as missing by this check.
- Whitespace-only cells are treated as missing.
- Text such as `NULL`, `N/A`, `unknown`, or `-` is not automatically interpreted as missing.
- A blank is a finding, not a conclusion that the data is invalid.

### 6.3 Mixed percentage scale

**Rule:** rows with `Number(row.click_through_rate) > 1` are flagged in `click_through_rate`.

**Priority:** high.<br>
**Default treatment:** divide values greater than one by 100.<br>
**Alternative:** keep unchanged and mark valid.

**Business value:** supports comparability when one rate field mixes whole percentages and decimal fractions.

**Boundary:** this rule targets the exact column name `click_through_rate`. It does not inspect all percentage-like columns, prove that other records use decimals, or calculate the correct CTR from clicks and impressions. In particular, a field called `ctr_pct` is outside this rule.

### 6.4 Paid Social category variants

**Rule:** `channel` values matching `paid_social`, `paid-social`, or `paid social`, case-insensitively, are flagged unless the value is exactly `Paid Social`.

**Priority:** medium.<br>
**Treatments:** standardize confirmed variants, map only the exact `paid_social` spelling, or retain labels.

**Business value:** prevents a single channel from fragmenting across spelling/formatting variants in downstream aggregation.

**Boundary:** there is no generic fuzzy clustering, taxonomy dictionary, spelling-correction engine, or arbitrary categorical normalization. Detection concerns this named field and label family.

### 6.5 Mixed launch-date formats

**Rule:** `launch_date` strings matching one/two-digit month, one/two-digit day, and four-digit year separated by slashes are flagged.

**Priority:** medium.<br>
**Treatments:** convert to `YYYY-MM-DD`, or retain the source dates.

**Business value:** supports consistent formatting for downstream date parsing and time-based reporting.

**Boundary:** this is a string-format check for `launch_date`. It assumes MM/DD/YYYY, does not resolve international ambiguity, and does not validate calendar correctness. It does not normalize `visit_date`, `order_date`, or the marketing sample's `date` field.

### 6.6 Clicks exceed impressions

**Rule:** rows where `Number(clicks) > Number(impressions)` are flagged against `clicks`.

**Priority:** high.<br>
**Treatments:** mark valid or leave unchanged and document.

**Business value:** highlights a relationship that may undermine engagement-rate interpretation or indicate inconsistent measurement definitions.

**Boundary:** the application does not infer which source field is wrong or automatically correct either one. JavaScript numeric coercion means blanks in these fields can behave as zero during this comparison; this check does not separately require two nonblank valid observations.

### 6.7 Initial numerical outliers

For each inferred numeric column, the application computes an IQR profile if there are at least four valid nonblank numerical values and nonzero IQR.

```text
IQR = Q3 − Q1
Lower fence = Q1 − 1.5 × IQR
Upper fence = Q3 + 1.5 × IQR
Flag when value < lower fence or value > upper fence
```

**Priority:** medium.<br>
**Initial selection:** if `spend_usd` has outliers, it is preferred; otherwise the first numerical column with outliers is selected.

Only **one** initial outlier issue is added, even when many columns have outlier candidates. The application is therefore not a comprehensive all-column anomaly catalogue.

**Business value:** provides a focused starting point for examining unusual observations.

### 6.8 Priority and issue counts

Severity labels are hard-coded by check class. They do not incorporate financial exposure, confidence, business criticality, or stakeholder-defined tolerances.

One issue can refer to many rows. “Open findings” and “unresolved” count issue objects, not individual cells or unique affected records. For example, 361 blank values in one column count as one open issue.

This distinction is essential when presenting review progress to stakeholders.

---

## 7. Issue Review and Affected-Record Analysis

### 7.1 Column-based issue organization

The Issues screen groups issue objects by column. Each group displays inferred type, open-issue count, and a sum of row counts for open issues in that group.

Each issue row displays severity, label, affected-record count, and status. Open issues expand into review; resolved entries remain visible with finalized or marked-valid labels.

The summed affected count can count the same row more than once when findings overlap. It should not be interpreted automatically as unique affected records.

### 7.2 Three-panel decision workspace

Expanded review organizes content into:

1. **Analysis/evidence:** finding description and relevant examples or outlier-rule controls.
2. **Possible fixes:** selectable predefined choices and, where available, custom AI alternatives.
3. **Impact preview:** numerical distributions, category modification counts, scatter plots, or general affected/no-change messages.

An affected-record subview follows those panels, with the final decision bar below it. On narrower displays, analytical panels stack vertically.

**Business value:** puts the “why,” “what,” and “likely effect” of a treatment together.

### 7.3 Affected-record table

The active implementation displays all rows in the current issue subview inside a scrollable, vertically resizable table. It includes row identifiers, relevant source/proposed values, and a View button.

For generic numerical review, contextual columns include the issue column and available fields such as `spend_usd`, `impressions`, `clicks`, and `click_through_rate`, plus filter-selected fields, up to seven source columns.

For date review, the table provides **Original value**, **Parsed value**, and **Proposed value**, plus available identifiers such as `campaign_name`, `city`, and `channel`.

For category review, it provides **Original label** and **Proposed mapping**, plus available identifiers.

**Business value:** supports row-level explanation of a decision, especially when stakeholders want examples rather than only aggregate counts.

### 7.4 Outlier-specific multi-condition filtering

The final `affectedRecords` implementation exposes configurable filter controls only for outlier review.

Capabilities include:

- Select any source column as a condition field.
- Operators: `contains`, `=`, `!=`, `>`, `<`, `>=`, `<=`.
- Add multiple conditions.
- Remove conditions, with the last remaining control protected from removal.
- Choose AND or OR combination.
- Clear conditions back to a blank initial condition.
- Show filtered row count against the active outlier count.

`contains` and textual equality are case-insensitive. Equality uses numeric comparison when both trimmed operands coerce to finite numbers. Numeric inequalities also use JavaScript numeric coercion; a blank source value can therefore act as zero. Empty filter queries are excluded from the active conditions.

**Business value:** examine whether unusual observations concentrate in a region, campaign class, channel, or other available business segment.

### 7.5 Filtering is inspection, not treatment scope

Filters change the records displayed in the subview. They do not restrict `applyFix` to that displayed subset. Approval operates on `item.rows` for the issue.

Similarly, the scatter plot highlights the active outlier set, not only the filtered subset. The distinction prevents an incorrect assumption that “what I filtered on screen” is automatically “what will be approved.”

### 7.6 Record selection and View action

Selecting an affected-record row stores its `_row` as `state.selectedRecord`. Outlier scatter plots can visually emphasize the selected record when rendered.

The View button sets the dataset-wide search to the row number string and navigates to View. It does **not** implement an exact row-ID search or guaranteed scroll-to-row: View searches source values, not the generated `_row`. The row number can match unrelated source values or fail to match the intended row. This is a navigation intent with a current implementation limitation.

### 7.7 Deferring a decision

**Decide later** collapses the selected issue while leaving it open. It neither changes source values nor creates a separate deferred status, comment, or task assignment.

**Business value:** analysts can preserve unresolved ambiguity rather than forcing a premature answer.

---

## 8. Treatments and Analytical Impact Previews

### 8.1 Treatment inventory

| Finding | Available predefined actions | Value effect |
|---|---|---|
| Missing numeric values | Fill with column median; fill with column mean; leave missing | Numerical fill or no change |
| Missing nonnumeric values | Mark valid; leave unchanged/document | No automatic text fill |
| Mixed rate scale | Divide values above one by 100; keep valid | Decimal-format rate conversion or no change |
| Paid Social variants | Standardize confirmed variants; map exact underscore spelling only; retain | Targeted category replacement or no change |
| Mixed launch dates | Convert to ISO; retain | String-format conversion or no change |
| Click/impression conflict | Mark valid; leave unchanged/document | No automatic correction |
| Outliers | Mark valid; leave unchanged/document | No automatic numerical correction |
| Custom AI numeric proposal | Fill with a validated finite constant | Constant applied to issue rows |
| Custom AI category proposal | Map reviewed source labels | Mapping applied to issue rows |

There is no general-purpose delete-row, winsorize, cap, interpolate, calculate-derived-field, or arbitrary code-execution treatment.

### 8.2 Mean and median imputation

Numerical missing-value review computes statistics from nonblank finite values in the **whole column**.

**Mean:** arithmetic average of observed values.<br>
**Median:** interpolated 50th percentile of sorted observed values.

Business interpretation:

- Mean filling can preserve a column's arithmetic average in the ideal unrounded case, but can create an artificial concentration at the mean.
- Median filling is less sensitive to extreme observations, but can change the overall mean and compress the distribution.
- Leaving missing values retains uncertainty but leaves completeness unresolved in downstream analysis.

Neither fill is subgroup-specific, model-based, time-series-aware, or conditional on business context. Neither method establishes that missingness is random.

### 8.3 Numerical simulation

`numericSimulation` constructs:

- **Before:** observed numerical values only.
- **After:** the before values plus one selected fill value per missing issue row, or the unchanged before distribution for a keep decision.
- Before/after summary statistics.

The review displays mean and median before and after. Selecting a choice changes the simulation, not the working data.

**Business value:** lets an analyst judge distributional consequences rather than treating completeness as an unconditional improvement.

### 8.4 Before/after histogram

The histogram uses:

- 24 bins over the observed 1st-to-99th-percentile range.
- Overlaid Before and Simulated after bars.
- A shared count scale across main bins and edge buckets.
- Explicit below-range and above-range buckets when values fall outside the displayed center.
- Numerical axis endpoints and column labeling.
- Bar labels/tooltips with counts.
- True observed minimum and maximum.
- True simulated extrema when they differ from the observed extrema.

The plot shows frequencies, not a normalized density, fitted distribution, confidence interval, or significance test. Keeping edge values visible is important because otherwise a treatment could appear harmless while moving records beyond the central display range.

### 8.5 Preview-to-application precision qualification

Numerical fills are written as strings using `toFixed(2)`. Simulations use the unrounded fill value.

The current predefined mean/median application also recomputes `numericSimulation` inside the per-row mutation loop. For mean filling, rounding earlier fills can slightly alter the mean used for later fills. A preview therefore should not be described as an exact byte-for-byte forecast of every applied numerical value.

This does not change the purpose of the preview, but it is relevant when analysts require strict numerical reconciliation.

### 8.6 Category impact analysis

`categoryProfile` counts nonempty string labels across the working column and identifies Paid Social variants by removing spaces, underscores, and hyphens and comparing lowercased text.

The preview shows:

- Current number of unique labels.
- Number of records the selected mapping would modify.
- Row-level proposed mappings in the affected-record table.

The unique-label statistic is a current-profile count, not a full before/after cardinality comparison. The modification count is calculated against the whole working column, whereas application is limited to the issue's row references; unusual inputs can therefore expose a scope difference.

**Business value:** makes category consolidation explainable before it changes downstream channel grouping.

### 8.7 Percentage conversion

The conversion action divides affected values greater than one by 100 and writes four decimal places.

Example:

```text
2.4 → 0.0240
```

**Business value:** restores a common numerical representation when the business interpretation is confirmed.

It does not recalculate CTR from the raw click/impression fields or update other dependent metrics.

### 8.8 Date conversion and proposed-value comparison

The date action splits the source slash-formatted string as month/day/year, pads month/day to two digits, and writes year-month-day.

Example:

```text
3/7/2025 → 2025-03-07
```

The affected-record table separates parsing from the selected decision: the parsed value can be shown even when the proposed value remains unchanged.

**Business value:** makes the assumed date interpretation explicit before changing the representation.

### 8.9 Retention as a legitimate treatment

Keeping values unchanged is available for several issue classes. A legitimate extreme campaign budget, an expected missing measurement, or a disputed cross-column rule can be accepted without fabricating a correction.

The implementation treats both `valid` and `keep` as status `valid` after finalization. Their action names remain distinguishable in history, but there is no separate accepted-missing or documented-unresolved status.

---

## 9. Configurable Outlier Analysis

### 9.1 Outlier definition versus correction

Outlier review explicitly separates defining the review set from changing observations.

- Editing rule controls previews a set of rows.
- Saving a rule updates the issue definition and affected-row set.
- Saving a rule does not modify dataset values or create a correction history entry.
- Final approval can accept the flagged values unchanged.

**Business value:** allows statistical sensitivity to be adjusted without confusing a detection threshold with proof of error.

### 9.2 Supported methods

| Method | Calculation and parameters | Useful business interpretation |
|---|---|---|
| **IQR** | Q1/Q3 fences with editable multiplier; default 1.5 | Robust first-pass review of skewed distributions |
| **Z-score** | Absolute distance from the mean divided by population standard deviation; default threshold 3 | Identify observations far from the average in SD units |
| **Percentile** | Editable lower/upper percentiles; defaults 1 and 99 | Focus on distribution tails |
| **Fixed business threshold** | Editable lower/upper limits; blank sides are unbounded | Review against explicit operational tolerances |
| **Custom rule** | Source field, comparison operator, and value | Define a review set using domain criteria |

### 9.3 Statistical formulas and boundary behavior

**Quantile interpolation:** for sorted values, position is `(n − 1) × p`, with linear interpolation between adjacent values.

**IQR:** preview flags values strictly outside the lower/upper fences. The initial detection suppresses zero-IQR profiles; the editable preview does not have that same early-return behavior.

**Z-score:**

```text
Population SD = sqrt(sum((value − mean)^2) / n)
Flag when abs((value − mean) / SD) >= threshold
```

If SD is zero, this method produces no flagged rows. A zero/empty numerical threshold falls back to three through the current JavaScript expression.

**Percentile:** preview flags values `<=` the lower bound or `>=` the upper bound. Values exactly on the percentile boundaries are included; tied values can cause the review set to exceed a simple tail-percentage expectation.

**Fixed threshold:** flags numerical values strictly below the lower or above the upper bound. Missing/nonfinite values are excluded from this numerical analysis.

**Custom rule:** can evaluate any source column across all working rows, using `>=`, `>`, `<`, `<=`, `=`, `!=`, or `contains`. It is a single custom condition, distinct from the multi-condition filters used to inspect the resulting review set.

There is no robust parameter-range validation ensuring sensible multipliers, ordered percentiles, or ordered business bounds. The controls provide flexibility rather than a fully validated statistical configuration framework.

### 9.4 Save outlier rule

Saving stores the draft definition in `item.outlierDefinition`, replaces `item.rows` with the preview rows, updates the summary, and displays “Outlier rule saved. No data changed.”

The saved rule is issue-scoped and in memory. It cannot be exported as a reusable ruleset or automatically replayed against a new file.

### 9.5 Draft, saved, and evidence-state distinction

`activeRows` uses the current draft preview for outlier records and scatter highlights. The issue's persistent row references update only when the rule is saved.

Consequently:

- The preview can differ from the row set used by final approval if the draft was not saved.
- View's highlighted rows use `item.rows`, not an unsaved draft.
- The original IQR profile in `item.outlier` is not synchronized by the Save rule handler, so the spreadsheet inspection card can continue showing initial IQR evidence after a different rule has been saved.

These distinctions are material for precise interpretation of review evidence.

### 9.6 Interactive scatter plot

Outlier review provides a two-axis SVG scatter plot with:

- Selectable X and Y axes from inferred numeric columns.
- Points only for records with valid nonblank values on both selected axes.
- Different styling for ordinary and active outlier records.
- Emphasis for the selected record when present.
- Point tooltips with row number and source values.
- Numerical ticks, grid, axis titles, and clipping to the viewport.
- Mouse-wheel zoom anchored around cursor position.
- Pointer-drag pan.
- Constraints keeping the view within the full data range.
- A reset-view action.
- An empty-state message when no paired numerical values exist.

**Business value:** helps distinguish genuinely suspicious values from legitimate segments, such as large campaigns whose spending is consistent with a proportionately large audience.

The plot supports exploratory inspection. It does not compute regression, correlation coefficients, statistical significance, clustering, or causal relationships. A flagged record without paired numeric values on the chosen axes will not appear in the plot.

---

## 10. AI-Assisted Proposal Generation

### 10.1 AI's business role

AI is an optional source of alternative treatments. Deterministic checks, predefined choices, manual review, history, and export are designed around local application logic rather than requiring AI-generated detection.

The useful pattern is **bounded proposal generation**: turn a short instruction into a structured operation for the issue currently under review.

### 10.2 Instruction capture and user experience

Non-outlier review includes an **Ask AI for another fix** area with:

- An instruction textarea capped at 300 characters.
- A contextual example instruction.
- A Generate proposal button.
- A disabled button and waiting indicator while generation is pending.
- Success/provider messages or errors.
- Custom proposal cards showing original instruction and interpretation.
- A remove action for each proposal.
- A selectable custom treatment choice after a proposal is accepted.

The application retains multiple proposals per issue. Proposal IDs are generated from time and randomness. Removal discards the proposal from the session; it does not undo an already finalized history entry.

### 10.3 What context is sent

The browser sends a same-origin request containing:

- Analyst instruction.
- Column name.
- Numeric or categorical type.
- Issue type.
- Affected-record count.
- Allowed operations.
- For numeric issues: observed mean, median, minimum, maximum.
- For categorical issues: reviewed Paid Social variant labels and counts.
- An optional Turnstile token.

The normal UI path does not send the entire CSV or a full row-by-row dataset. However, instructions and category labels are still data sent to the configured AI runtime/provider; this is bounded disclosure, not a claim of zero external data transmission.

### 10.4 Supported proposal operations

| Operation | Eligibility and validation | Application behavior |
|---|---|---|
| `fill_missing` | Numeric issue; finite numerical fill value | Constant fill becomes a selectable proposal and is written to two decimal places on approval |
| `map_categories` | Categorical issue; mapping object with reviewed sources and nonblank string targets | Mapping becomes a selectable proposal applied to matching issue rows |

The frontend treats only `recommendation === "impute"` as numeric. Other non-outlier review requests use a categorical mapping context.

Therefore the visible AI area should not be interpreted as universal correction support for dates, scale conflicts, missing text fields, or click/impression contradictions. Those issue types can display the area, but their allowed request operation is still `map_categories`, usually with a limited or empty Paid Social source set.

### 10.5 Prompt and structured response

The server instructs the model to return JSON only, choose an allowed operation, target the provided column, and remain within the reviewed scope.

The requested structure includes:

```json
{
  "operation": "fill_missing",
  "column": "spend_usd",
  "value": 0,
  "mapping": {},
  "assumptions": ["Example assumption"],
  "warnings": ["Example warning"]
}
```

The example demonstrates structure, not an endorsement that unknown spending should be filled with zero.

The parser extracts a JSON object from returned text. This is structured proposal validation, not execution of generated JavaScript, SQL, or Python.

### 10.6 Validation and approval boundary

Server validation checks:

- Instruction is nonblank and at most 300 characters.
- Context contains a string column, accepted type, and allowed-operation array.
- Affected-record count is a positive integer.
- Proposal operation is allowed by that context.
- Proposal column matches the requested column.
- Numerical fills are finite and target numeric context.
- Category mappings are non-array objects in categorical context.
- Mapping source keys are in the submitted reviewed category set.
- Mapping targets are nonblank strings.

Validated responses set `requiresConfirmation: true`, and the UI still requires explicit finalization.

**Technical qualification:** the API validates against context supplied by the client, not against a server-held copy of the dataset. It does not independently prove the row count, source labels, or column values. It also does not reject semantically inappropriate but finite fills, require mappings to use an approved target taxonomy, or necessarily require a nonempty mapping.

### 10.7 Assumptions and warnings

The handlers bound assumptions and warnings to three entries each. The browser stores joined warnings in the custom proposal object, but the active proposal cards and selection details primarily display the instruction and interpretation. Assumptions are not retained in the frontend proposal object, and warnings are not visibly rendered in the active review template.

Accordingly, the model's structured caveats are an API capability, not a fully exposed analyst-facing justification workflow.

### 10.8 Local Ollama runtime

The Node server defaults to:

- `AI_MODE=local`.
- Ollama URL `http://192.168.56.1:11434`.
- Model `llama3.2:3b`.
- JSON output format, nonstreaming generation, temperature zero.
- A 45-second provider request timeout.

**Business value:** supports an environment-controlled model deployment for demonstrations or local experimentation.

The default Ollama address is a configured network address, not necessarily the same machine running the browser. “Local mode” alone is not proof that no information crosses a network.

### 10.9 Local server with OpenAI mode

When `AI_MODE=deployed`, the Node server uses OpenAI's Responses API, with `OPENAI_API_KEY` and optional `OPENAI_MODEL` from its environment. Default model is `gpt-4.1-mini`; the request asks for JSON output, temperature zero, and 300 output tokens.

The local implementation extracts only `result.output_text`. The Worker has an additional fallback for Responses API output-content arrays, so response extraction is not identical across runtimes.

### 10.10 Deployed Cloudflare Worker

The configured deployed entry point is `src/worker.js`, served with static assets through Cloudflare Workers.

Endpoints:

- `GET /api/ai/status`: reports configured model/provider and whether an OpenAI key exists.
- `GET /api/ai/proposals`: provides the optional public Turnstile site key.
- `POST /api/ai/proposals`: validates context, optionally verifies Turnstile, calls OpenAI, validates the proposal, and returns it.
- Other `/api/*` paths return 404.

Availability status checks configuration presence; it does not run a live provider health probe or verify that the key/model currently works.

### 10.11 Optional Turnstile verification

The browser fetches the public site key. When a key is configured, requesting a proposal creates an invisible Turnstile widget and waits for a token. Errors and expiry produce messages.

The Worker verifies the token server-side when `TURNSTILE_SECRET_KEY` is set, including the connecting IP where available. Provider secrets remain server-side.

**Business value:** protects the optional public AI endpoint against some automated abuse while keeping ordinary dataset review independent of the verification flow.

### 10.12 Runtime limits and differences

| Capability | Local Node server | Configured Worker | Alternative Pages handler |
|---|---|---|---|
| Provider | Ollama by default; OpenAI in deployed mode | OpenAI | OpenAI |
| Instruction cap | 300 characters | 300 characters | 300 characters |
| Request cap | 65,536-character accumulated body check | 64 KiB nominal checks via content length and serialized payload length | Same nominal checks as Worker |
| Explicit provider timeout | 45 seconds | No explicit fetch timeout | No explicit fetch timeout |
| Per-IP hourly limit | In-memory; defaults to 10 | Not implemented | Not implemented |
| Turnstile | Not implemented | Optional | Optional |
| Status endpoint | `/api/ai/config`, not the UI's `/api/ai/status` | `/api/ai/status` | Not supplied by this proposal file |
| Responses output-array fallback | No | Yes | No |

The local hourly limit counts proposal attempts before detailed validation, not just successful proposals. It is process-local and resets on restart. Neither this limit nor the local timeout should be attributed to the deployed Worker without additional implementation.

---

## 11. Decisions, History, and Rollback

### 11.1 Explicit finalization

Selecting a radio option or generating an AI proposal does not apply it. A decision-bar button calls `applyFix` to approve the selected treatment.

Finalization:

1. Captures original values for the issue's row references.
2. Applies the supported mutation, if any.
3. Sets the issue status to `finalized` for value-changing actions or `valid` for keep/valid actions.
4. Adds a history entry at the beginning of the history array.
5. Collapses the selected issue and rerenders the workspace.

**Business value:** makes a dataset change an explicit analytical decision rather than a side effect of viewing a recommendation.

### 11.2 No-change decisions are also recorded

Accepting values or leaving them unchanged creates history even when no cells change. This recognizes that reviewing and retaining data is still a decision.

However, an accepted-missing issue is no longer open. Reduction in unresolved findings therefore measures review disposition, not automatically improved completeness or corrected values.

### 11.3 History content

Each history entry stores:

- Time-derived identifier.
- Issue reference and affected column.
- Action title or Custom AI proposal label.
- Affected row references.
- Original value for every affected row.
- Before/after display examples using the first three values.
- Reason: the issue summary or the custom proposal interpretation.

The Changes screen displays the column/action, affected-record count, examples, reason, and Rollback button.

**Business value:** allows an analyst to reconstruct the local preparation sequence at a useful summary level.

### 11.4 Limits of the rationale record

There is no analyst comment field, reviewer name, timestamp display, source-file hash, independent approval record, or dedicated decision-log export. History captures application-supplied summaries and interpretations rather than a complete business justification authored by the reviewer.

The “FINALIZED” badge is used in history even for entries whose underlying issue status is `valid`.

### 11.5 Undo latest and individual rollback

- Header Undo opens confirmation for the latest entry.
- Each history card can open rollback confirmation for its own entry.
- The modal offers cancel or restore.
- Restore writes saved original values back into the affected issue column.
- The issue reopens.
- The selected history entry is removed.

**Business value:** lowers the cost of testing a treatment and allows a rejected decision to be revisited.

### 11.6 Rollback boundary

Rollback restores saved values for the selected column and issue rows. It does not restore an entire dataset snapshot, append a durable reversal event, or reconcile dependent/overlapping decisions.

If two approved issues affect the same column/rows, restoring an older decision can overwrite a later value. Rule definitions and other issue memberships are not automatically rebuilt. History removal also means the reversal itself is not retained as a permanent audit event.

### 11.7 Session lifetime

All working data, proposals, filters, rules, and history are held in JavaScript memory. Refreshing or closing the page loses the review session. CSV export preserves working values but does not preserve the decision log or rule configuration.

---

## 12. Quality Reporting and CSV Export

### 12.1 Quality report screen

The Report screen shows:

- Dataset dimensions as rows × columns.
- Total issue-object count.
- Number of reviewed issue objects.
- “Changed” count.
- Remaining unresolved issue count in the summary text.
- Export cleaned CSV action.

It is a preparation-status summary, not a full analytical quality report containing detailed issue tables, statistical charts, cost exposure, or individual decision narratives.

### 12.2 Exact metric interpretation

```text
Open findings = count(issue.status === "open")
Reviewed findings = count(issue.status !== "open")
History entries = state.changes.length
Reported changed = sum(historyEntry.rows.length)
```

The reported changed metric:

- Includes rows associated with no-change decisions.
- Can count the same row more than once across history entries.
- Is not a unique-row count.
- Is not a count of actual modified cells.

For stakeholder reporting, describe it as **record references covered by history decisions** unless independently reconciled. Treating it as “corrected records” would overstate the implemented measurement.

### 12.3 Working CSV export

`downloadCsv` creates a browser Blob from the current working rows, creates an object URL, initiates download, and revokes the URL.

- Filename is prefixed with `cleaned-`.
- Columns follow `state.headers` order.
- Internal row identifiers are not added as a new export column.
- All working rows are exported, not just searched/flagged/filtered rows.
- Values are wrapped in quotes and internal double quotes are doubled.
- Header names are joined with commas without equivalent quoting.

**Business value:** hands the prepared data to existing analysis tools without introducing a proprietary output format.

### 12.4 Export qualifications

- Export does not require every issue to be resolved.
- The `cleaned-` filename is not a certification that every value is correct.
- It does not include issue status, rules, proposals, or decision history.
- It does not overwrite the original source file.
- It does not export a PDF, formatted report, Excel workbook, or standalone audit package.
- Special characters in headers are not robustly escaped by the export header construction.
- CSV escaping handles delimiters/quotes in values; it does not neutralize formula-like values for spreadsheet applications.

---

## 13. Bundled Datasets and Demonstration Coverage

### 13.1 Verified initial overview

The following counts are produced by the current application code on fresh import:

| Dataset | Rows | Columns | Blank cells | Initially open issues | Initial outlier issue |
|---|---:|---:|---:|---:|---|
| Healthcare patient visits | 1,000 | 15 | 856 | 8 | `age`: 1 row |
| Sales orders | 1,000 | 15 | 906 | 8 | `unit_price_usd`: 92 rows |
| Marketing campaigns | 1,000 | 14 | 1,002 | 7 | `spend_usd`: 48 rows |

Counts describe these repository snapshots, not every future dataset or deployment asset version.

### 13.2 Healthcare patient visits

**Fields:** `patient_id`, `visit_date`, `department`, `age`, `sex`, `insurance_type`, `bmi`, `systolic_bp`, `diastolic_bp`, `heart_rate_bpm`, `glucose_mg_dl`, `hba1c_pct`, `cholesterol_mg_dl`, `length_of_stay_days`, `readmitted_30d`.

**Detected completeness issues:**

| Column | Blank records |
|---|---:|
| `insurance_type` | 43 |
| `bmi` | 109 |
| `systolic_bp` | 69 |
| `diastolic_bp` | 69 |
| `glucose_mg_dl` | 66 |
| `hba1c_pct` | 361 |
| `cholesterol_mg_dl` | 139 |

**Business analytics value:** review whether incomplete observations represent process gaps, unmeasured characteristics, or expected absence before preparing operational summaries.

**Coverage qualification:** other numerical columns have IQR candidates, including BMI and glucose, but only the selected `age` issue is initially exposed. No clinical safety rules, diagnostic interpretation, or treatment recommendations are implemented.

### 13.3 Sales orders

**Fields:** `order_id`, `order_date`, `region`, `channel`, `product_category`, `sales_rep`, `unit_price_usd`, `quantity`, `discount_pct`, `revenue_usd`, `cost_usd`, `profit_usd`, `customer_tenure_months`, `delivery_days`, `customer_rating`.

**Detected completeness issues:**

| Column | Blank records |
|---|---:|
| `sales_rep` | 32 |
| `discount_pct` | 296 |
| `cost_usd` | 93 |
| `profit_usd` | 93 |
| `customer_tenure_months` | 93 |
| `delivery_days` | 86 |
| `customer_rating` | 213 |

**Business analytics value:** review gaps affecting commercial attribution, discount interpretation, profitability, customer segmentation, and fulfillment reporting.

**Coverage qualification:** the application does not enforce `profit = revenue − cost`, validate revenue against quantity/price/discount, or recognize rating bounds. Such business logic should not be inferred from the presence of those fields.

### 13.4 Marketing campaigns

**Fields:** `campaign_id`, `date`, `channel`, `campaign_type`, `region`, `spend_usd`, `impressions`, `clicks`, `conversions`, `revenue_usd`, `ctr_pct`, `cpc_usd`, `roas`, `bounce_rate_pct`.

**Detected completeness issues:**

| Column | Blank records |
|---|---:|
| `spend_usd` | 110 |
| `conversions` | 187 |
| `revenue_usd` | 187 |
| `cpc_usd` | 110 |
| `roas` | 277 |
| `bounce_rate_pct` | 131 |

**Business analytics value:** inspect spend coverage and unusual campaign budgets before using the extract for channel performance comparisons.

**Coverage qualification:** this sample uses `ctr_pct` and `date`, not `click_through_rate` and `launch_date`. Its fresh-load findings do not include the specialized scale/date checks or Paid Social mapping finding. The sample also produces no clicks-exceed-impressions finding in the verified fresh-load run.

The application does not recalculate CPC, CTR, ROAS, conversion rate, or attributed revenue after filling related values.

### 13.5 Reproducible distribution-demonstration generator

`scripts/generate_distribution_demo.py` is a developer utility that creates `distribution-demo.csv` in the repository root.

It produces:

- 320 synthetic campaign records.
- 80 missing spend values, representing 25% of rows.
- Lower-budget campaigns and a substantial higher-budget tail.
- Paid Social underscore variants.
- Slash-formatted launch dates.
- Whole-percentage values in `click_through_rate`.
- Selected clicks-exceed-impressions cases.
- Some missing campaign names.

**Business value:** a controlled example for explaining why mean/median filling and contextual anomaly review are consequential.

The generated file is not currently a bundled sample-picker option or an allowed deployed browser asset. It can be imported manually after generation. The utility writes a file; it is not a background data-feed service.

---

## 14. Architecture, Runtime Behavior, and Data Handling

### 14.1 Browser architecture

The application uses vanilla HTML, CSS, and JavaScript with shared globals:

- `index.html` defines the shell, file input, dialog, navigation, and script loading.
- `spreadsheet.js` defines inspection and rail behavior.
- `app.js` defines shared state, import/export, detection, calculations, review, treatments, AI calls, history, and reporting.
- `styles.css` and `spreadsheet.css` define the visual system and responsive layouts.

`spreadsheet.js` loads before `app.js` as a classic script. Its functions access shared helpers/state when invoked after application initialization.

### 14.2 Main state entities

| Entity | Purpose | Persistence |
|---|---|---|
| Original rows | Preserve imported source values in a separate copy | Browser memory |
| Working rows | Current data displayed/exported | Browser memory until CSV export |
| Issues | Finding definitions, row references, priority, status | Browser memory |
| Changes | Approved decisions and rollback values | Browser memory |
| Custom proposals | Optional AI alternatives grouped by issue | Browser memory |
| Outlier drafts | Current parameters used for previews | Browser memory |
| Saved outlier definition | Approved review-set definition on the issue | Browser memory |
| Issue filters | AND/OR inspection conditions | Browser memory |
| Scatter state | Axis choices and viewport | Browser memory |
| Selected record/issue | Current inspection/review focus | Browser memory |

### 14.3 Local development server

`server.js` is a dependency-free Node HTTP server listening on port 4174. It serves repository files and provides local AI endpoints.

Environment configuration is read from `process.env`; the code does not automatically load `.env`. A supporting Node version can use an environment-file option, or values can be exported through the shell.

The repository has no package manifest, application build pipeline, or configured automated test suite. Relevant JavaScript files can be syntax-checked with Node, and user flows are verified manually.

### 14.4 Worker deployment and asset selection

`wrangler.jsonc` configures:

- Worker name `clearview-data-quality-copilot`.
- Entry point `src/worker.js`.
- Static assets from the repository directory.
- An `ASSETS` binding.
- Worker-first routing for `/api/*`.

`.assetsignore` uses an explicit allowlist for the HTML, browser scripts, styles, and three sample CSVs. Source server files and documentation are not part of that browser asset list.

`functions/api/ai/proposals.js` is a separate Cloudflare Pages-compatible handler. Its existence does not make Pages the currently configured deployment runtime.

### 14.5 Data exposure and credentials

- Local files are read into browser memory; ordinary quality checks and previews run there.
- Bounded AI context is sent when an analyst requests another fix.
- Provider credentials are read server-side rather than embedded in browser scripts.
- Provider/model behavior is configured in runtime environment variables, not a browser provider selector.
- Dynamic dataset content is generally escaped through `escapeHtml` before HTML rendering.
- Browser fonts are loaded from Google Fonts, and the Turnstile script is loaded from Cloudflare.

This supports a lightweight privacy-conscious workflow, but it is not a documented end-to-end data residency, encryption, authentication, or regulatory-control system.

### 14.6 Performance characteristics

The application repeatedly scans columns/rows for inference, issue detection, statistics, and previews. Quantile calculation sorts arrays. Tables render matching rows directly, and scatter plots render all paired points into SVG.

The included thousand-row samples are useful demonstrations, not a published maximum-size guarantee. No explicit upload size/row limit, worker-based computation, row virtualization, persistent query engine, or large-dataset benchmark is implemented.

### 14.7 Responsive interaction design

The UI provides responsive analytical panels, scrollable tables, a resizable affected-record area, and adjustments to the issue rail and inspection card at narrower widths. The main review panels stack before becoming too narrow.

These features support analyst readability across common viewport sizes, while dense multi-column CSV inspection remains inherently more comfortable on a larger display.

---

## 15. Complete Feature Register

The register below inventories individual implemented capabilities and visible demonstration affordances. Detailed scope and qualifications are in the preceding sections.

### 15.1 Acquisition, profiling, and workspace

| ID | Feature | Technical basis | Business value |
|---|---|---|---|
| D01 | Local CSV file picker | File input and FileReader | Start from ordinary operational extracts |
| D02 | Comma/quoted-field parsing | Custom single-line CSV parser | Preserve common CSV values |
| D03 | Header and row construction | Header order and row objects | Establish analytical structure |
| D04 | Internal row identity | Generated `_row` | Link findings, inspection, and history |
| D05 | Original snapshot | Separate row copies | Preserve source reference in session |
| D06 | Working dataset | Mutable `state.rows` | Separate review decisions from source file |
| D07 | Replace source | Reload/reset state | Begin a fresh review cycle |
| D08 | Healthcare sample | Same-origin CSV fetch | Demonstrate measurement completeness |
| D09 | Sales sample | Same-origin CSV fetch | Demonstrate commercial data preparation |
| D10 | Marketing sample | Same-origin CSV fetch | Demonstrate campaign/spend review |
| D11 | Sample picker and back action | Selection screen | Lower evaluation friction |
| D12 | Sample-loading error feedback | Toast and console error | Explain failed sample retrieval |
| D13 | Numerical inference | Finite nonblank count threshold | Enable generic numeric review |
| D14 | Name-based date display type | Header substring heuristic | Provide lightweight column context |
| D15 | Column interpretation list | Names plus inferred types | Orient the analyst |
| D16 | Dataset dimensions | Row/column counters | Establish scope |
| D17 | Import-status messages | Parsing-result display | Confirm import progress |
| D18 | Open finding count | Open issue objects | Show review backlog |
| D19 | Version indicator | History presence | Distinguish untouched/reviewed session |
| D20 | Workflow navigation gating | Disabled screens before import | Keep workflow coherent |
| D21 | Filename/header context | Shared chrome refresh | Maintain source awareness |
| D22 | Sidebar issue/history badges | Shared state counts | Maintain progress visibility |
| D23 | Context-sensitive action | View/first unresolved/export | Reduce navigation steps |
| D24 | Toast notifications | Timed status messages | Confirm actions |
| D25 | Incoming-batch demo affordance | Toast instructing new CSV load | Communicate a batch-review concept; not live ingestion |

### 15.2 Inspection and detection

| ID | Feature | Technical basis | Business value |
|---|---|---|---|
| V01 | Working-data spreadsheet | HTML table | Inspect current values |
| V02 | Header type labels | `inferType` | Understand displayed structure |
| V03 | Dataset-wide search | Case-insensitive substring matching | Locate known source values |
| V04 | Flagged-only row view | Open row-issue map | Focus quality-review work |
| V05 | Visible/total row count | Filter result count | Understand current table scope |
| V06 | Five-class finding legend | Symbols, labels, colors | Differentiate issue meanings |
| V07 | Highlighted cells | Row/column finding map | Locate evidence precisely |
| V08 | Multiple symbols per cell | Unique finding-type symbols | Expose overlapping concerns |
| V09 | Visible-row rail markers | DOM viewport positions | Navigate affected rows |
| V10 | Above/below edge aggregates | Type-specific off-screen groups | Maintain long-table awareness |
| V11 | Edge-marker scroll navigation | Scroll offset adjustment | Reach off-screen evidence |
| V12 | Scroll/resize marker refresh | RAF and ResizeObserver | Keep location cues aligned |
| V13 | Selected row/cell styling | Selection classes | Maintain inspection focus |
| V14 | Evidence inspection card | `sheetInspection` | Explain a finding |
| V15 | Multi-type row tabs | Grouped row findings | Inspect independent concerns |
| V16 | Same-type column tabs | Column-specific finding choices | Separate multiple column findings |
| V17 | Keyboard cell activation | Enter/Space handlers | Improve access to review |
| V18 | Accessible rail/tab state | ARIA labels and pressed state | Make controls understandable |
| V19 | Inspection-to-review action | `openIssue` | Connect cell evidence to treatment |
| Q01 | All-column missing checks | Trimmed-empty test | Expose completeness gaps |
| Q02 | Numeric/nonnumeric missing distinction | Inferred type | Tailor treatment choices |
| Q03 | Named rate-scale check | `click_through_rate > 1` | Review rate comparability |
| Q04 | Paid Social variant check | `channel` regular expression | Review grouping consistency |
| Q05 | Launch-date format check | Slash-date regex | Review temporal representation |
| Q06 | Click/impression relationship check | Numeric comparison | Review metric consistency |
| Q07 | Initial IQR check | Quartile fences | Identify an unusual review set |
| Q08 | Preferred outlier-column selection | Spend-first, otherwise first candidate | Provide focused starting analysis |
| Q09 | Class-based priority | Fixed severity labels | Offer lightweight triage |

### 15.3 Review, treatment, and outlier analytics

| ID | Feature | Technical basis | Business value |
|---|---|---|---|
| R01 | Column-grouped issue list | Grouping by issue column | Organize review workload |
| R02 | Expand/collapse issue review | Selected issue ID | Focus one decision |
| R03 | Resolved status display | `valid`/`finalized` | Keep reviewed items visible |
| R04 | Evidence/fix/impact layout | Three analytical panels | Consolidate decision information |
| R05 | Predefined treatment selection | Radio options | Make choices explicit |
| R06 | Missing-value retention | Keep action | Preserve uncertainty |
| R07 | Median fill | Quantile-derived fill | Compare a robust simple treatment |
| R08 | Mean fill | Average-derived fill | Compare a conventional simple treatment |
| R09 | Rate conversion | Divide by 100; four decimals | Standardize compatible rate representation |
| R10 | Canonical category mapping | Paid Social variant mapping | Consolidate confirmed labels |
| R11 | Exact underscore-only mapping | Exact `paid_social` replacement | Support narrower treatment |
| R12 | ISO date string conversion | Split/pad/reorder | Standardize confirmed date representation |
| R13 | Mark-valid treatment | No-change approval | Accept legitimate findings |
| R14 | Numerical simulation | Before/after arrays | Preview distributional effects |
| R15 | Before/after mean and median | Numeric statistics | Explain summary-statistic sensitivity |
| R16 | Overlaid histogram | 24 common bins | Compare frequency structure |
| R17 | Tail buckets and true extrema | Edge counts and min/max | Avoid hiding tail effects |
| R18 | Category profile/cardinality | Label counts | Understand category structure |
| R19 | Category modified-record preview | Mapping comparison | Estimate mapping impact |
| R20 | Affected-record table | Issue-specific row subview | Explain individual examples |
| R21 | Date original/parsed/proposed columns | Derived display values | Expose interpretation before conversion |
| R22 | Category proposed mapping column | Selected mapping | Explain intended replacement |
| R23 | Scrollable/resizable record area | CSS table viewport | Inspect a longer review set |
| R24 | Selected-record state | `_row` selection | Link record inspection to plotted emphasis |
| R25 | Record View action | Row-string search navigation | Attempt cross-screen location; limited exactness |
| R26 | Decide later | Collapse without approval | Preserve unresolved ambiguity |
| R27 | Explicit approval control | Decision-bar finalization | Retain analyst authority |
| O01 | Editable IQR method | Multiplier and quartiles | Adjust sensitivity |
| O02 | Z-score method | Population SD threshold | Inspect mean-relative extremes |
| O03 | Percentile method | Lower/upper quantiles | Inspect tails |
| O04 | Business-range method | Lower/upper bounds | Apply operational tolerances |
| O05 | Custom-rule method | Field/operator/value | Apply domain-specific review criteria |
| O06 | Live rule preview | `previewOutlier` | Compare review-set definitions |
| O07 | Save rule without changing data | Definition and row-set update | Separate detection from correction |
| O08 | Filter field selection | Any source header | Inspect business context |
| O09 | Seven filter operators | Text/numeric matching | Express review conditions |
| O10 | Add/remove/clear conditions | Filter state array | Refine a review subset |
| O11 | AND/OR composition | Every/some matching | Combine contextual criteria |
| O12 | Filtered/active count | Subset versus rule rows | Understand inspection scope |
| O13 | Selectable scatter axes | Numeric header selectors | Inspect numerical relationships |
| O14 | Flagged/ordinary point styling | Active review-set membership | Compare flagged values with context |
| O15 | Selected point emphasis | Selected row state | Locate a record visually |
| O16 | Point value tooltips | SVG title elements | Read source context |
| O17 | Plot ticks/grid/axis labels | SVG numerical scale | Interpret chart position |
| O18 | Cursor-centered zoom | Wheel viewport adjustment | Examine dense regions |
| O19 | Drag pan with range constraints | Pointer handlers | Explore zoomed regions |
| O20 | Reset plot | Viewport removal | Recover full-data context |
| O21 | No-paired-values message | Empty point-set handling | Explain missing plot coverage |

### 15.4 AI, history, output, and supporting infrastructure

| ID | Feature | Technical basis | Business value |
|---|---|---|---|
| A01 | Short natural-language instruction | 300-character textarea | Express an alternative treatment |
| A02 | Bounded request context | Statistics/category counts | Limit proposal scope |
| A03 | Structured JSON proposals | Provider prompt/output format | Convert advice into reviewable operations |
| A04 | Constant numeric proposal | `fill_missing` | Offer an additional fill option |
| A05 | Category mapping proposal | `map_categories` | Offer an additional mapping option |
| A06 | Operation/column/source validation | Handler checks | Reject incompatible proposal structure |
| A07 | Multiple proposals per issue | Proposal arrays | Retain alternatives for comparison |
| A08 | Proposal cards and removal | Session UI/state | Manage alternatives |
| A09 | Pending/disabled generation state | Pending flag and spinner | Make request progress visible |
| A10 | Provider/error feedback | Result/error messages | Explain AI outcomes |
| A11 | Approval requirement | Finalize action | Prevent silent application |
| A12 | Structured caveat fields | Bounded API assumptions/warnings | Carry limited model caveats at API level |
| A13 | Local Ollama integration | `/api/generate` | Support environment-controlled inference |
| A14 | Server-side OpenAI integration | Responses API | Support hosted proposal generation |
| A15 | Configured-AI status | Worker status endpoint | Display deployment configuration state |
| A16 | Optional invisible Turnstile | Browser token/server verify | Protect public proposal access |
| A17 | Local request rate limit | Per-IP in-memory hourly map | Bound local proposal attempts |
| A18 | Request/instruction limits | Handler checks | Bound accepted request scope |
| A19 | Local provider timeout | AbortSignal timeout | Avoid indefinitely pending local requests |
| H01 | Decision history creation | `state.changes.unshift` | Record approved actions |
| H02 | No-change history entries | Valid/keep finalization | Recognize reviewed retention |
| H03 | Before/after examples and reason | First three values and summary | Explain decision effect |
| H04 | Original values for affected rows | Saved original entries | Support restoration |
| H05 | Undo most recent entry | Header control | Quickly revisit latest decision |
| H06 | Individual rollback | History control | Revisit a specific decision |
| H07 | Rollback confirmation dialog | Native dialog | Make restoration deliberate |
| H08 | Issue reopening after rollback | Status reset | Return item to review |
| E01 | Quality status summary | Dataset/issue/decision metrics | Support preparation handoff |
| E02 | CSV download | Blob/object URL | Integrate with existing tools |
| E03 | Working-row full export | Header-order serialization | Preserve dataset structure |
| E04 | Quoted/escaped exported values | Quote doubling | Preserve ordinary CSV values |
| E05 | Distinct output filename | `cleaned-` prefix | Separate source from output |
| T01 | Lightweight local HTTP service | Built-in Node modules | Reduce setup requirements |
| T02 | Worker API/static routing | Worker and ASSETS binding | Host a public demonstration |
| T03 | Alternative Pages proposal handler | Pages exports | Provide another serverless handler implementation |
| T04 | Browser asset allowlist | `.assetsignore` | Define deployment contents |
| T05 | Server-side credentials | Runtime environment | Keep provider keys out of browser code |
| T06 | Escaped dataset HTML | `escapeHtml` | Safely represent ordinary data strings in UI |
| T07 | Responsive review layout | Media-query panel stacking | Preserve review readability |
| T08 | Synthetic dataset utility | Python CSV generator | Demonstrate treatment tradeoffs reproducibly |

---

## 16. Business Applications and Analytical Examples

### 16.1 Marketing budget review

**Question:** are high-spend campaigns errors, or a legitimate enterprise segment?

**Workflow:** import marketing data → inspect the spend outlier issue → compare spend with impressions/clicks → filter by available channel/region → adjust the review definition → accept valid extremes or defer investigation.

**Value:** avoids deleting legitimate high-budget campaigns solely because they exceed a statistical fence. The scatter plot adds operational context to a univariate flag.

**Boundary:** ClearData does not calculate campaign ROI sensitivity or recommend budget allocation.

### 16.2 Missing commercial data

**Question:** should missing costs be estimated before profitability analysis?

**Workflow:** import sales orders → inspect missing cost observations → compare mean and median fills → inspect distribution changes → leave missing if the business basis for estimation is inadequate → export the reviewed data.

**Value:** makes uncertainty visible and supports a defensible decision about whether improved completeness is worth the assumptions introduced.

**Boundary:** filling `cost_usd` does not recalculate `profit_usd`. Commercial consistency still requires downstream reconciliation or source correction.

### 16.3 Category consistency for aggregation

**Question:** do several Paid Social spellings describe the same business channel?

**Workflow:** use a compatible CSV with `channel` variants → inspect examples → compare narrow/existing canonical mapping or a validated AI mapping → review proposed labels → finalize.

**Value:** reduces fragmented channel totals and improves interpretability of downstream pivots and dashboards.

**Boundary:** confirming semantic equivalence remains the analyst's responsibility; the application does not know the organization's channel taxonomy.

### 16.4 Measurement completeness in healthcare operations

**Question:** are missing measurements a collection-process concern or expected for certain visits?

**Workflow:** import the healthcare sample → inspect per-column completeness findings → assess whether a numerical fill is justified → retain legitimate missingness where appropriate → record the decision.

**Value:** discourages blanket imputation that could misrepresent observed patient/visit characteristics in operational reporting.

**Boundary:** no subgroup imputation, clinical decision support, or clinical-quality thresholds are implemented.

### 16.5 Date and rate representation review

**Question:** do format differences reflect representation differences rather than business differences?

**Workflow:** use a compatible CSV containing `launch_date` or `click_through_rate` → inspect the proposed interpretation → approve conversion only when units/date ordering are understood.

**Value:** resolves avoidable comparability problems while keeping assumptions visible.

**Boundary:** the rule does not independently establish that 3/7 means March 7 rather than July 3, or that every number greater than one is a percentage-scale error.

---

## 17. Measurement Framework and Economic Value

### 17.1 What can be measured directly

The application directly exposes dataset dimensions, open/total/reviewed issue counts, history entries, affected-record counts, filter-result counts, numerical preview statistics, category modification estimates, and rule-selected outlier counts.

These support workload and review-progress interpretation. They do not by themselves prove improved business outcomes.

### 17.2 Useful evaluation metrics

The following are proposed evaluation measures, not built-in analytics instrumentation:

| Measure | Definition | Why it matters |
|---|---|---|
| Review time | Minutes from load to agreed disposition | Tests preparation-efficiency benefit |
| Triage time | Minutes to identify relevant findings | Tests scanning/navigation benefit |
| Finding acceptance rate | Accepted valid findings / reviewed findings | Measures how much domain judgment matters |
| Actual modified-cell count | Independently compare source and output values | Avoids overreading the Report changed metric |
| Completeness change | Nonblank cells before versus after | Measures coverage, separately from correctness |
| Treatment distribution shift | Compare means/medians and other downstream measures | Measures analytical sensitivity |
| Downstream rework | Corrections requested after handoff | Tests decision quality |
| Traceability coverage | Decisions with an adequate recorded business rationale | Tests documentation quality |
| AI proposal utility | Approved useful proposals / requested proposals | Tests bounded assistance value |
| Review coverage | Reviewed relevant findings / relevant findings found independently | Tests rule coverage, not just UI completion |

### 17.3 Illustrative economic model

```text
Preparation labor benefit
  = reviewed datasets per period
  × average hours saved per dataset
  × fully loaded analyst hourly cost

Estimated net benefit
  = preparation labor benefit
  + evidenced reduction in downstream rework
  − hosting/provider/operating cost
```

Inputs should come from actual comparisons with a baseline workflow. The repository contains no measured time-savings study, customer ROI results, billing dashboard, or provider-cost estimator.

### 17.4 Decision quality versus cosmetic cleanliness

A useful analytics evaluation should distinguish:

1. **Reviewed:** someone has made a disposition decision.
2. **Modified:** a working value differs from the source.
3. **More complete:** fewer cells are blank.
4. **More correct:** values better represent the business process.
5. **More useful for analysis:** downstream conclusions are more defensible.

These are different outcomes. ClearData's strongest implemented controls concern visibility, treatment comparison, and explicit disposition. Its counters should not collapse all five into a single “quality improved” claim.

---

## 18. Current Boundaries and Implementation Qualifications

### 18.1 Capabilities not currently implemented

- Duplicate-row/key detection or deduplication.
- General-purpose fuzzy category cleaning or taxonomy management.
- Full schema inference/validation and manual type overrides.
- Arbitrary spreadsheet editing, formulas, sorting, joins, or calculated columns.
- Automatic correction of outliers or cross-column conflicts.
- Segment-aware, temporal, predictive, or multi-variable imputation.
- Derived-metric recalculation after treatments.
- Continuous ingestion, scheduled jobs, or real streaming batches.
- Persistent sessions, saved projects, databases, or cross-import rule reuse.
- Multi-user collaboration, authentication, role-based approval, or named reviewers.
- Durable append-only audit trails, provenance exports, or approval signatures.
- Downloadable formatted quality reports or decision logs.
- Statistical hypothesis testing, forecasting, regression, or full BI dashboards.
- A production-scale performance limit or deployment-independent provider health check.

The Incoming batch control is a demonstration message directing users to load another CSV. Earlier product discussion of duplicate records or broader governance does not constitute implementation of those capabilities.

### 18.2 Cross-cutting interpretation constraints

| Constraint | Consequence for business analytics |
|---|---|
| Specialized checks require exact field names | Rule coverage varies by dataset schema |
| Only one initial outlier issue is created | Other unusual numeric columns can remain unlisted |
| Numerical inference uses all-row coverage | Highly incomplete numeric fields can receive nonnumeric review |
| Findings are not globally regenerated after approval | Other issue sets can become stale after changes |
| Filters control inspection, not approval scope | Displayed subset is not necessarily the treatment set |
| Outlier drafts differ from saved issue rows | Unsaved previews can differ from finalized record references |
| Saved outlier rule does not refresh initial IQR evidence | Spreadsheet evidence can lag rule changes |
| No-change decisions resolve issue status | Fewer open findings does not mean fewer blanks/errors |
| Report changed count sums history row references | It can overstate actual unique modified records |
| Numerical writes are rounded | Preview and applied values need not match exactly |
| Derived fields are not recalculated | Related financial/rate metrics can remain inconsistent |
| Rollback is issue-column based | Overlapping decisions require careful interpretation |
| All state is session-memory only | Values/history must be captured before refresh/replacement |
| Record View uses value search | It is not a guaranteed exact row-navigation feature |
| AI context is client-submitted | Server validation is structural/contextual, not independent source reconciliation |
| AI caveats are not fully shown in review | Proposal interpretation is more visible than assumptions/warnings |
| Local and deployed APIs differ | Status, rate limits, timeouts, and response parsing depend on runtime |

### 18.3 Operational implications for an analyst

Use the application as a transparent review workspace. Confirm source semantics before conversion, distinguish accepted findings from actual corrections, and reconcile related metrics before a downstream decision depends on them.

For a handoff, the CSV contains the resulting values; the rationale and unresolved-context discussion need separate capture if the receiving team requires them. The current application does not bundle that context into the downloaded dataset.

---

## 19. Overall Assessment

ClearData demonstrates a coherent business-analytics preparation workflow: **acquire → inspect → diagnose → compare → decide → trace → export**.

Its most important contribution is making data preparation a sequence of inspectable decisions. A finding is attached to evidence; a treatment is attached to a preview; an approval is attached to original values that can be restored.

From a technical perspective, the system combines deterministic browser-side calculations, shared in-memory state, SVG/HTML analytical views, bounded server-side AI proposals, and straightforward CSV output. That lightweight architecture supports quick demonstrations and ad hoc review, while also defining clear limits around persistence, schema breadth, scalability, and enterprise auditability.

From a business perspective, the strongest proposition is **more focused and explainable preparation of CSV data for analysis**. The application helps analysts avoid both indiscriminate cleaning and opaque AI-driven mutation. It is most valuable when the reviewer's contextual judgment is as important as the mechanical identification of a blank, format difference, or statistical extreme.

---

## 20. Implementation Reference Map

| Source | Relevant responsibilities |
|---|---|
| `index.html` | Navigation shell, dataset file input, confirmation dialog, fonts, Turnstile script, browser script order |
| `app.js` — `parseCsv`, `loadData`, `loadSample` | Acquisition, row/header construction, reset behavior, bundled samples |
| `app.js` — `numericColumns`, `inferType`, `numericStats`, `quantile`, `numericValues` | Type inference and numerical calculations |
| `app.js` — `detectIssues`, `outlierProfile` | Initial deterministic checks and issue creation |
| `app.js` — `renderData`, `refreshChrome`, `renderIssues`, `renderIssueRow` | Overview, navigation state, grouped review |
| `app.js` — final `renderIssueWorkspace`, `renderLegacyIssueWorkspace`, `renderOutlierWorkspace` | Active review layouts and available decisions |
| `app.js` — `numericSimulation`, `histogram`, `histogramChart`, `categoryProfile`, `categoryImpact` | Treatment impact calculations and previews |
| `app.js` — `outlierDraft`, `previewOutlier`, `activeRows`, `outlierControls` | Configurable outlier definitions and previews |
| `app.js` — final `issueFilter`, `filteredIssueRows`, `affectedColumnConfig`, `affectedValue`, `affectedRecords` | Affected records, filters, proposed date/category displays |
| `app.js` — `scatterData`, final `scatterChart`, `renderScatterPlot`, `bindScatterNavigation` | Scatter axes, rendering, zoom, pan, record emphasis |
| `app.js` — final `bindIssueLinks`, `bindLegacyIssueLinks` | Active control bindings, rule save, record actions, finalization |
| `app.js` — final `requestProposal`, `requestTurnstileToken` | AI request UX, bounded context, optional verification |
| `app.js` — `applyFix`, `renderChanges`, `confirmRollback` | Approved treatments, decision history, restoration |
| `app.js` — `metrics`, `renderReport`, `downloadCsv` | Report counts and working CSV download |
| `spreadsheet.js` | Finding taxonomy, spreadsheet search/filtering, highlights, rail, inspection cards, keyboard support |
| `styles.css`, `spreadsheet.css` | Analytical layout, chart appearance, tables, responsive behavior, finding colors/symbols |
| `server.js` | Local static hosting, environment config, Ollama/OpenAI calls, proposal validation, process-local rate limit |
| `src/worker.js` | Configured deployed OpenAI API, status, optional Turnstile, asset routing, output-text extraction |
| `functions/api/ai/proposals.js` | Alternative Pages request handling, OpenAI proposals, optional Turnstile |
| `wrangler.jsonc`, `.assetsignore` | Worker configuration and deployed browser asset allowlist |
| `.env.example` | Example local/provider runtime configuration names |
| Three root sample CSVs | Domain examples and verified initial detection measurements |
| `scripts/generate_distribution_demo.py` | Reproducible synthetic treatment/detection demonstration dataset |

**Documentation scope:** source-code-based analysis of the current application. This file describes implemented behavior and its business implications; proposed evaluation metrics are explicitly identified as proposals rather than existing features.

---

## 21. Implemented Corrections and Verification

The following corrections were implemented from the baseline analysis while retaining the browser-based Data → View → Issues → Changes → Report workflow.

### 21.1 Data integrity and treatment consistency

- **CSV parsing:** quoted multiline fields, embedded commas, doubled quotes, CR/LF record separators, and a UTF-8 BOM are supported. Empty, duplicate, or reserved `_row` headers, excess fields, malformed quote transitions, unterminated quotes, and header-only files produce an actionable import error. A failed import leaves the existing workspace intact. Missing trailing values remain blank.
- **CSV export:** headers and values are both quoted and escaped, with CRLF record separators. Export includes the entire working dataset in source-header order. Formula-like values remain source data; they are not transformed by this escaping.
- **Numerical preview/application agreement:** the selected fill is calculated once and rounded to two decimals before both simulation and application. A mutation loop no longer recalculates mean or median as prior fills are written.
- **Atomic date treatments:** MM/DD/YYYY dates must be valid calendar dates. All proposed changes are calculated before any cell is updated, so an invalid date cannot cause a partially applied treatment.
- **Scoped category preview:** the modified-record estimate uses the same issue rows as approval. Date/category contextual columns use consistent column descriptors rather than mixing descriptors with string names.
- **Blank-aware relationships and filters:** click/impression contradictions require two finite nonblank source values. Numeric filters no longer silently equate a blank with zero.

### 21.2 Accurate measurement and reversible decisions

- **Actual modified rows/cells:** Report compares working values with the original snapshot. Unique modified rows, modified cells, approved decisions, remaining blanks, and unresolved findings have separate interpretations. No-change approvals contribute a decision but zero modified cells.
- **History wording:** accepted no-change decisions are labeled explicitly. Each entry separates reviewed-record count from cells modified by that decision, and examples are labeled before/after that decision rather than claiming to be the current dataset state.
- **Overlapping rollback:** every value-changing decision stores patches. Rolling back one decision rebuilds values from the original snapshot and replays the stored patches of remaining approvals in chronological order. It does not rerun statistical treatments, and later approved values survive an older rollback.
- **Finding refresh:** approval and rollback refresh detected evidence while retaining issue identity and saved outlier definitions. Remaining variants after a narrow category mapping stay open. A valid acceptance is retained only when its reviewed fingerprint still matches the finding; changed evidence can reopen it. Findings eliminated by another treatment can be identified as resolved by a related change.
- **Issue-group counts:** affected records within a column are deduplicated by row identity rather than summing overlapping memberships.

These remain session-level controls. They do not add durable projects, exported audit logs, named approvers, or automatic recalculation of business metrics.

### 21.3 Record navigation and outlier consistency

- **Exact View navigation:** the affected-record action stores a dedicated row ID, clears search/flagged filters, scrolls to that row, highlights it, and opens finding inspection where available. It no longer substitutes the row number into a source-value search.
- **Method-aware saved evidence:** spreadsheet outlier cards describe the saved rule and its method, bounds, or standard deviation as applicable, rather than always presenting initial IQR evidence.
- **Preview/approval scope:** approving an outlier decision saves the displayed valid draft first and records its complete matching set. The subview explicitly states that filters only narrow inspection.
- **Parameter validation:** IQR/Z-score thresholds must be positive finite numbers; percentiles must be ordered within 0–100; business bounds must be finite or unbounded and correctly ordered; custom rules require a supported field/operator/value. Invalid rules cannot be saved or approved. Zero-IQR detection and preview behavior are consistent.
- **Chart controls:** axis changes reset the viewport, and Reset view is wired into the active event bindings. Returning from View opens the selected issue instead of inadvertently toggling it closed.

### 21.4 AI and runtime corrections

- **Visible caveats:** validated assumptions and warnings are retained and escaped in proposal cards before approval.
- **Eligible controls:** AI proposal controls are displayed only for supported numerical imputation and Paid Social category mapping reviews.
- **Stale-response protection:** proposals are tied to dataset revision and issue evidence. A response arriving after dataset replacement cannot enter the new workspace, and old alternatives are invalidated after value-changing review operations.
- **Shared implementation:** `src/ai.cjs` now supplies Node, Worker, and Pages handlers with the same request/operation/source validation, nonempty category mapping requirement, bounded string caveats, Responses API output-array fallback, UTF-8 body cap, 45-second timeout, and process/isolate-local rate protection.
- **Status parity:** Node, Worker, and Pages expose `/api/ai/status`. Configuration is labeled as configuration, with `healthChecked: false`; availability is not represented as a successful live provider probe. Local proposal configuration GET also returns the expected Turnstile shape.
- **Consistent failures:** unsupported methods return 405, oversized requests 413, invalid proposals 422, quota exhaustion 429, missing provider configuration 503, provider rejection 502, and timeouts 504 in the shared proposal path.
- **Local asset serving:** Node serves the explicit browser asset set rather than arbitrary repository files.

Rate protection remains process/isolate-local; no distributed durable quota or server-held source-dataset reconciliation has been added.

### 21.5 Verification and execution

Run reproducible data and API regression checks with:

```bash
node --test scripts/verify_quality.cjs
```

The suite covers multiline CSV round trips, invalid-import atomicity, rounded mean/median/AI fills, no-change counts, overlapping rollback, partial category mappings, atomic calendar validation, blank-aware comparisons, outlier approval/evidence, invalid rule rejection, exact-navigation state, escaped AI caveats, stale-response rejection, all three bundled datasets, API validation, byte limits, and Worker/Pages parity with mocked provider responses.

Browser verification additionally exercises sample load → highlighted-cell inspection → preview → finalize → history → rollback → CSV download, saved outlier evidence, filtering, exact row navigation, plot zoom/reset, invalid-rule gating, AI caveat display and explicit approval, and stacked responsive review layouts.

JavaScript syntax checks and a Cloudflare Wrangler dry-run bundle check validate the changed runtime files. The dry run builds the Worker without publishing it. Live provider credentials are not required for regression verification.

---

## 22. New Analytics Review Capabilities

The following features were added from the proposed expansion areas: downloadable reports/logs, duplicates, saved projects/reusable rules, and schema/derived-metric review. Broader category normalization was explicitly deferred.

### 22.1 Stakeholder-ready quality reports and decision logs

Report now offers four downloads:

| Artifact | Contents | Business use |
|---|---|---|
| Quality report — HTML | Self-contained formatted summary, completeness by column, findings/status/evidence, active decisions, rationale, approval/rollback log, configured rules | Readable stakeholder handoff; printable to PDF using the browser |
| Quality report — JSON | Versioned structured summary, row references, findings, rule definitions, active decisions and event history | Machine-readable review package |
| Decision log — JSON | Active decision IDs, approval and rollback events, complete value patches, removed-record snapshots, timestamps, optional analyst notes, captured definitions and AI caveats | Detailed trace of what was approved and later undone |
| Decision log — CSV | Event-level cell changes, removals/restorations, reason, rationale, timestamps and row identity | Spreadsheet-based review/reconciliation |

Analysts can enter an optional business rationale before approval. The note is displayed in history and included in artifacts. History distinguishes value modifications from record removals and no-change decisions.

Rollback adds an event rather than erasing its historical occurrence from the log. The event records actual resulting value/row changes after remaining approvals are replayed. It is therefore possible to undo an older decision while making no current value change if a later approval already determines those same cells.

Report metrics distinguish source population, working population, actual modified cells/rows, and removed rows. Completeness counts explicitly identify their source/working populations, because removing records can reduce blank counts without filling any values.

All artifacts are generated in the browser. HTML escapes dataset content and uses no external dependencies. JSON logs retain full change details; the HTML report focuses on findings, review disposition, rationale, and references. These downloadable/session records are not digitally signed, identity-authenticated, or tamper-proof audit evidence.

### 22.2 Duplicate records and business-key collisions

**Entry point:** Issues → Review duplicates / keys. Exact duplicate findings are also generated during normal detection when matching full rows exist.

Two definitions are supported:

1. **Exact full-row match:** compare all source columns, excluding internal `_row` identity.
2. **Selected business key:** compare one or several user-selected columns. Rows with any blank key component are excluded and counted separately.

Comparisons preserve exact string values and are case-sensitive. They do not use fuzzy matching or silently normalize identifiers. Repeated keys are classified as identical records or conflicting groups based on their non-key values.

The group preview displays group number, original row IDs, source values, conflict classification, and proposed keep/remove actions. The available treatments are retaining the records as an accepted finding or keeping the first record in source order and removing later members. The default review choice retains values. Conflicting groups require a separate acknowledgement before removal.

**Business value:** avoids double-counting while recognizing that repeated identifiers can represent legitimate business events or different versions of a record.

**Treatment boundary:** the application does not merge records, choose the newest/most complete observation, or infer which conflicting version is true. The survivor policy is explicit. Removed records retain their identity in the source pool/history and can be restored through rollback. CSV export contains only the remaining working rows.

### 22.3 Saved projects and portable backups

**Entry point:** Data → Projects and reusable rules.

Capabilities:

- Save the current project under a name, overwrite its saved copy, or save as a new project.
- List saved projects with filename, working-row count, and last-save timestamp.
- Reopen a project after page refresh.
- Delete a saved copy independently of the currently loaded data.
- Download/import a versioned JSON project backup.
- Retain original and working values, row identity, approved decisions, removal history, audit events, rule definitions, eligible AI alternatives, outlier drafts, record filters, rationale drafts, and view selection state.
- Validate record/rule/history references and reconcile the working data with replayed history before replacing the active workspace.

The original identity pool and mutable issue/history references are rehydrated on restore. Rollback continues to work after reopening/importing a project, including decisions that removed records. AI alternatives are checked for supported scope and rebound to the current dataset revision; restoration does not make a new provider request.

**Cloudflare feasibility:** persistence is implemented entirely through IndexedDB in the browser. The Worker continues serving static assets and bounded AI endpoints; no D1/R2/KV integration or additional cloud credential is needed.

**Persistence boundary:** saving is explicit, not autosave. Libraries are local to the browser and site origin. Localhost, forwarded preview URLs, and the deployed Worker hostname can have separate libraries. Browser storage can be unavailable, quota-limited, or cleared. JSON backups provide transfer and independent retention. Browser JSON project/rule imports are limited to 50 MiB.

This adds useful local continuity and portability, not cloud synchronization, collaborative projects, or named access-controlled storage.

### 22.4 Reusable review-rule libraries

Rule sets contain declared schema definitions, derived-metric definitions, saved outlier definitions by column, and the duplicate comparison definition. They can be named/saved/deleted in IndexedDB or downloaded/imported as JSON.

Applying a rule set replaces the current definitions and runs checks. It never fills, remaps, removes, or recalculates values by itself. Each treatment remains subject to preview and approval.

All referenced source columns must exist in the receiving dataset. Invalid parameters, unsupported operations, duplicate targets, and circular derived-metric dependencies are rejected before replacement. This deliberate compatibility requirement avoids silently dropping a rule when a recurring extract changes its headers.

**Business value:** supports consistent monthly/weekly review without repeatedly configuring the same column expectations and reconciliation logic.

### 22.5 Declared schema validation

**Entry point:** Data or Issues → Schema / metric rules.

Each schema definition selects an existing column and can specify:

- Type: `any`, `text`, `number`, `integer`, ISO `date`, `boolean`, or `category`.
- Required/nonblank versus optional.
- Inclusive numerical minimum/maximum for number/integer types.
- An allowed-value list, one label per line.

Validation semantics:

- Optional blanks are not type/range violations; required blanks are flagged.
- Number requires a nonblank value coercible to a finite number.
- Integer additionally requires an integral numerical value.
- Date requires a real YYYY-MM-DD calendar date, including leap-day validation.
- Boolean accepts true/false or 0/1, case-insensitively for textual true/false.
- Allowed labels are case-sensitive against trimmed values; checks do not rewrite stored text.
- Numerical bounds must be finite/ordered, and cannot be assigned to a text-only type.

Violations create column-scoped findings with per-record evidence. They can be retained/accepted or deferred; schema validation itself does not invent corrections or override source values. It is distinct from the application's original heuristic type inference.

**Business examples:** ratings from 1–5, nonnegative cost, required order identifiers, ISO reporting dates, and a known regional-code list.

**Boundary:** rules currently target columns present in the dataset. Reusing definitions against a missing header is rejected as a configuration incompatibility rather than automatically adding a new source column. This is a lightweight business contract, not a schema-registry platform.

### 22.6 Configurable derived-metric validation and recalculation

Each metric definition includes:

- A name and existing target column.
- Existing left/right source columns.
- Supported operation: difference, sum, product, or ratio.
- Result multiplier/factor.
- Output decimal precision from 0–8.
- Nonnegative absolute tolerance in target units.

```text
Expected target = round((left OP right) × factor, configured decimals)
Finding when target is missing/nonfinite or differs beyond absolute tolerance
```

Example configurations:

| Business metric | Operation | Factor |
|---|---|---:|
| Profit = revenue − cost | Difference | 1 |
| Gross revenue = quantity × unit price | Product | 1 |
| ROAS = attributed revenue ÷ spend | Ratio | 1 |
| CTR as decimal = clicks ÷ impressions | Ratio | 1 |
| CTR as whole percentage = clicks ÷ impressions × 100 | Ratio | 100 |

Missing/invalid inputs, zero denominators, and nonrepresentable results produce separate unavailable-calculation findings. Those rows are not assigned zero or included in the recalculation mutation set.

Calculable discrepancies provide an affected-record preview showing the current source values, current target, calculated target, and selected proposed target. Retention is the default. Explicit approval changes only the target column, using exactly the previewed rounded result. Patches, rationale, and the configured formula are recorded, and the operation is reversible.

Self-referential targets and dependency cycles are rejected. Noncyclic dependent rules use current working inputs, and each must be reviewed separately; there is no silent cascade or arbitrary expression execution.

**Business value:** makes familiar reconciliation rules visible and repeatable while preserving control over measurement definitions and units.

### 22.7 New implementation locations and verification

- `workspace.js`: artifacts, event snapshots, duplicates, schema/metric calculations, rule editor, project serialization/reconciliation, IndexedDB libraries, and JSON import/export.
- `workspace.css`: project/rule controls, responsive editor/dialog styles, and duplicate/schema finding classes.
- `app.js`: detection/treatment/report/history integration and original-pool replay for removals.
- `spreadsheet.js`: duplicate/schema/metric evidence and rail categories.
- `index.html`, `.assetsignore`, `server.js`: classic-script loading, import inputs, and explicit local/deployed asset inclusion.

The regression suite verifies duplicate policy and conflict acknowledgement, reversible identity-preserving removals, blank-aware schema checks, atomic incompatible-rule rejection, bounded metric calculations, ratio failure cases, project round trips/corruption rejection, saved AI proposal restoration, artifacts, and actual rollback effects. Browser checks additionally verify IndexedDB save → refresh → reopen → rollback, rule reuse across imports, backup import, all download buttons, evidence/approval controls, bundled sample regressions, and narrow-screen layout.

Run:

```bash
node --test scripts/verify_quality.cjs
```

Cloudflare bundle verification is performed with a Wrangler dry run. These capabilities require only the deployed browser assets; implementation does not imply a live deployment or a push to Git.
