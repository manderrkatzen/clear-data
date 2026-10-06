# ClearData: Detailed UI and Functional Capabilities Report

**Report date:** 6 October 2026

**Website:** https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev

**Capability baseline:** the published interface through release `7ee14ce`, including contextual, one-by-one value-meaning review.

**Scope:** the analyst-facing website, its pages, individual interface units, decisions, calculations, outputs, and operational behavior. This is a description of the built product rather than a coding or software-architecture report.

---

## Contents

1. [Product purpose and operating model](#1-product-purpose-and-operating-model)
2. [Core concepts and what the website counts](#2-core-concepts-and-what-the-website-counts)
3. [Site-wide shell and navigation](#3-site-wide-shell-and-navigation)
4. [Dataset page: starting without a dataset](#4-dataset-page-starting-without-a-dataset)
5. [Dataset page: bundled sample selection](#5-dataset-page-bundled-sample-selection)
6. [Dataset page: loaded dataset overview](#6-dataset-page-loaded-dataset-overview)
7. [Dataset page: context and working distributions](#7-dataset-page-context-and-working-distributions)
8. [Explore page: spreadsheet workspace](#8-explore-page-spreadsheet-workspace)
9. [Explore page: issue rail and cell inspection](#9-explore-page-issue-rail-and-cell-inspection)
10. [Review page: queue, configuration, and workspace](#10-review-page-queue-configuration-and-workspace)
11. [Review page: clickable five-stage navigation](#11-review-page-clickable-five-stage-navigation)
12. [Review stage: Understand](#12-review-stage-understand)
13. [Review unit: one-by-one value-meaning assessment](#13-review-unit-one-by-one-value-meaning-assessment)
14. [Review unit: missing-versus-present comparison](#14-review-unit-missing-versus-present-comparison)
15. [Review unit: Hold similar comparison](#15-review-unit-hold-similar-comparison)
16. [Review unit: AI explanation of a measured pattern](#16-review-unit-ai-explanation-of-a-measured-pattern)
17. [Review stage: Interpret](#17-review-stage-interpret)
18. [Review stage: Treat & scope](#18-review-stage-treat--scope)
19. [Treatment catalogue: retain, replace, and normalize](#19-treatment-catalogue-retain-replace-and-normalize)
20. [Treatment catalogue: statistical and similar-row fills](#20-treatment-catalogue-statistical-and-similar-row-fills)
21. [Treatment catalogue: numerical and date transformations](#21-treatment-catalogue-numerical-and-date-transformations)
22. [Treatment catalogue: duplicates, removal, and metrics](#22-treatment-catalogue-duplicates-removal-and-metrics)
23. [Review stage: Preview](#23-review-stage-preview)
24. [Review stage: Approve](#24-review-stage-approve)
25. [Decisions page and rollback](#25-decisions-page-and-rollback)
26. [Report page and downloadable artifacts](#26-report-page-and-downloadable-artifacts)
27. [Configuration dialog: column definitions](#27-configuration-dialog-column-definitions)
28. [Configuration dialog: business relationships](#28-configuration-dialog-business-relationships)
29. [Configuration dialog: schema and derived metrics](#29-configuration-dialog-schema-and-derived-metrics)
30. [Configuration dialog: manual correction](#30-configuration-dialog-manual-correction)
31. [Project saving, backups, and restoration](#31-project-saving-backups-and-restoration)
32. [Reusable rule libraries](#32-reusable-rule-libraries)
33. [Finding catalogue and detection behavior](#33-finding-catalogue-and-detection-behavior)
34. [AI behavior, progress, and failure states](#34-ai-behavior-progress-and-failure-states)
35. [Responsive layout, accessibility, and visual behavior](#35-responsive-layout-accessibility-and-visual-behavior)
36. [End-to-end operational examples](#36-end-to-end-operational-examples)
37. [Current product boundaries and interpretation nuances](#37-current-product-boundaries-and-interpretation-nuances)
38. [Capability and state-change reference matrix](#38-capability-and-state-change-reference-matrix)

---

## 1. Product purpose and operating model

ClearData is a CSV data-quality review workspace. The analyst imports a dataset, examines locally calculated findings, decides what suspicious values mean, chooses a correction or a retention decision, inspects its exact impact, and explicitly approves the result.

The primary navigation follows this sequence:

**Dataset → Explore → Review → Decisions → Report**

The website is built around an active working dataset and a preserved original source. Approved changes accumulate in the working dataset. The source remains available for before-and-after comparisons and rollback.

The product separates three kinds of work:

- **Evidence:** counts, distributions, duplicates, formatting checks, constraints, and comparisons calculated from the dataset.
- **Interpretation:** the analyst's judgment about meaning, supported by optional AI assessments.
- **Treatment:** a concrete, scoped operation such as filling a confirmed gap, parsing a date, mapping a label, or removing a duplicate record.

This separation matters operationally. An unusual value is not automatically wrong; an invalid-looking value is not automatically a missing observation; a blank may be expected; and an accepted finding may involve no physical data change.

AI participates in interpretation and explanation. It does not autonomously edit the working dataset. Numerical statistics, held comparisons, and candidate fill values are calculated locally rather than invented by a model.

## 2. Core concepts and what the website counts

### 2.1 Original source

The source is the imported dataset before approved corrections. Its values and original record identities provide the reference point for comparisons, restoration, and quality reports.

Importing a replacement CSV starts a new dataset session. It is not an append operation or a merge of two datasets.

### 2.2 Working dataset

The working dataset is the current population of records after active approved decisions. It may contain edited cells, removed records, unchanged values accepted by the analyst, and source-preserving meaning classifications.

An approved classification can change how a value participates in analysis without changing its displayed text. For example, a stored `NULL` can remain `NULL` while being treated as an analyst-confirmed missing observation.

### 2.3 Proposed preview

A preview is a temporary proposed outcome. It has its own record-level values, counts, distributions, blocked records, and constraint checks. It is not the working dataset until the analyst approves it.

### 2.4 Finding

A finding is a reviewable condition affecting a column or a collection of records. Examples include blank observations, possible missing-value tokens, zero/negative screening candidates, potential outliers, duplicate groups, and schema violations.

One record can belong to several findings. Therefore, a finding count, an affected-record count, and a modified-cell count measure different things.

### 2.5 Representation

A representation is an exact stored form of a value, such as `NULL`, `N/A`, `0`, `-23`, or a spelling variant of a category. The value-meaning reviewer groups exact matches so the analyst can decide about one representation at a time.

Classification applies to the currently reviewed matching records. It is not a global instruction that every future occurrence of that token, in every column, must have the same meaning.

### 2.6 Meaning classification

The one-by-one reviewer records one of three analyst decisions:

- **Missing observation:** the value represents an unknown or absent observation.
- **Keep as a valid value:** the representation is retained as a legitimate observed value.
- **Not applicable:** an observation is not expected for those records.

Skipping creates no classification. An AI suggestion creates no classification either.

The broader treatment workflow also supports interpretation choices for formatting problems and incorrect values/business-rule violations.

### 2.7 Scope

Scope is the exact record set eligible for an operation. A spreadsheet search changes what is visible; a treatment scope changes what can be approved. These are separate controls.

### 2.8 Source row identity

Records have a stable source-row number within a dataset session. That identity is used by the spreadsheet, previews, scoped selections, duplicate survivors, KNN donor traces, and history.

Removed records do not cause the remaining records to be renumbered as new source records. Gaps in source-row numbers can therefore be meaningful after removals.

### 2.9 Counts shown throughout the UI

| Count | What it means | Important distinction |
|---|---|---|
| Working rows | Records currently present in the working population | Removed records are excluded |
| Source rows | Records in the imported source | Used as the restoration/reference population |
| Columns | Dataset fields | A type label is not a guarantee that every value conforms |
| Blank cells | Physically empty or whitespace-only cells | A confirmed missing `NULL` can remain nonblank |
| Open findings | Findings awaiting a current decision | Several may affect the same row |
| Matching records | Records belonging to a specific finding or definition | May exceed the number that actually change |
| Scoped records | Records chosen for a proposed treatment | The analyst may narrow a larger finding |
| Modified cells | Working values that differ from the source | No-change classifications do not increase this count |
| Modified rows | Remaining working rows with at least one changed cell | Not the same as approved decisions |
| Removed rows | Source records absent from the working population | Counted separately from edited cells |
| Approved decisions | Active recorded approvals | Can include source-preserving decisions |
| Fallbacks | Similar-row fills produced through widening or a global estimate | Not all fills are direct group/KNN estimates |

## 3. Site-wide shell and navigation

### 3.1 Brand and persistent navigation

The desktop interface has a navy navigation rail containing the ClearData brand, an analyst-workspace label, and five page buttons. The brand returns to Dataset.

Dataset is available before import. Explore, Review, Decisions, and Report become available after a dataset is loaded. This keeps data-dependent pages from being opened without an active dataset.

### 3.2 Navigation units

| Unit | User-facing purpose | Result of using it |
|---|---|---|
| Dataset | Import, profile, provide context, manage project work | Opens the dataset workspace |
| Explore | Inspect records and cell-level evidence | Opens the spreadsheet |
| Review | Work through findings and choose decisions | Opens the findings queue and guided review |
| Decisions | Examine active approved decisions | Opens history and rollback controls |
| Report | Summarize and export the current state | Opens quality metrics and download actions |
| Continue review | Quickly return to review work | Opens the findings queue |

Review carries an open-finding count. Decisions carries an active-decision count once decisions exist. An active page has a distinct selected state.

### 3.3 Dataset top bar

The top bar identifies the current screen context and dataset filename. It also presents:

- A version badge, initially **Original**, then **Working version** when approved decisions exist.
- An open-finding badge.
- **Undo last change** when an active decision is available.
- A context-sensitive primary action.

“Working version” can appear after a meaning classification even when no cells have been rewritten, because the analytical state now includes an approved decision.

### 3.4 Context-sensitive primary action

The primary top-bar button changes with the current page and session:

- From Dataset, **Inspect data** opens Explore.
- During Review with open findings, **Next finding** moves to another open finding.
- From other relevant pages, **Review findings** provides a shortcut back to review work.
- When no open findings remain, **View report** provides the next destination.
- On Report, the action exports the cleaned CSV.

Moving to a next finding selects another review item. It is not an approval of the current one.

### 3.5 Shared feedback

The site uses transient status messages for events such as invalid imports, saved definitions, project saves, missing records, and validation failures. Longer-running or persistent states also appear inside the relevant banner, panel, or dialog.

Native dialogs provide focused interactions for definitions, project storage, rule libraries, and rollback. Their close/cancel actions have local effects rather than implicitly approving a treatment.

## 4. Dataset page: starting without a dataset

### 4.1 Import empty state

The initial task surface is headed **Import a dataset**. Its supporting text directs the analyst to open a CSV or choose a sample.

The two primary units are:

1. **Open CSV:** launches the local file picker.
2. **Try a sample dataset:** opens the bundled sample chooser.

The page also reports AI configuration availability. A configured provider/model means the service is configured; it is not a guarantee that a future provider call will succeed.

### 4.2 CSV import behavior

The importer supports ordinary CSV text, quoted fields, embedded commas, escaped quotes, and quoted multiline content. The original strings are retained rather than immediately converted into numerical/date storage values.

Examples of the distinction:

- A source value `001` can remain `001` rather than becoming `1`.
- A date string is not silently reformatted on import.
- A currency-formatted number requires an explicit parsing decision before normalization.
- A string `NULL` is a review candidate, not an instruction to write a blank or a zero.

### 4.3 Import validation and failure recovery

The importer rejects problems such as empty input, missing/duplicate headers, malformed quoting, an unexpected extra field, and use of a reserved internal record-identity header.

A failed import reports the error without replacing an existing valid workspace. Cancelling the file picker also leaves the current session available.

If a CSV record has fewer fields than the header, absent trailing fields are represented as empty values. Headers without data records do not create a usable dataset session.

### 4.4 Project-resumption unit

Below the import task is **Resume a project**. It provides:

- **Saved projects:** lists reviews previously saved in this browser/site.
- **Import project backup:** opens a portable review backup.

A project backup is a different artifact from a CSV: it can restore source data, working values, decisions, classifications, and rule definitions together.

## 5. Dataset page: bundled sample selection

### 5.1 Sample chooser structure

The sample chooser is a dedicated selection state with a heading, three dataset options, and **Back**. Each option has a dataset title and a short domain description.

| Sample | Domain | Useful review themes |
|---|---|---|
| Healthcare patient visits | Visits, clinical measurements, readmissions | Context-sensitive blanks, measurements, dates, unusual observations |
| Sales orders | Orders, pricing, profitability, delivery | Missingness patterns, channel comparisons, similar-row fills, metric reconciliation |
| Marketing campaigns | Spend, conversions, performance | Percentage scales, category variants, date formats, cross-column findings |

### 5.2 Selecting a sample

Selecting an option loads that CSV as the active source, calculates findings, enables the data-dependent navigation, and starts the normal automatic AI interpretation process.

The sample experience uses the same review, approval, rollback, and export capabilities as an uploaded dataset. It is not a separate read-only demonstration interface.

### 5.3 Back and load errors

Back returns to the current Dataset state. If a sample cannot be retrieved, the site reports the failed load rather than substituting an unrelated dataset.

## 6. Dataset page: loaded dataset overview

### 6.1 Filename and dataset state

The loaded overview is headed by the filename. Its summary reports approved decisions and modified cells relative to the preserved source.

**Replace CSV** opens the file picker to start another dataset session. It does not add rows to the current dataset.

### 6.2 Review-launch unit

This unit reports:

- The number of open findings.
- How many columns have open findings.
- How many distinct working rows participate in those findings.

Its action opens a finding when review work exists. With no current findings, the action leads to inspection instead.

The distinct affected-row count avoids counting the same row repeatedly merely because it belongs to several findings.

### 6.3 Four overview metrics

| Metric | Content shown | Analyst interpretation |
|---|---|---|
| Working rows | Current record count and removals from source | Shows population changes |
| Columns | Number of fields and an inference reminder | Indicates dataset breadth, not schema compliance |
| Blank cells | Physical blank count | Does not declare every blank incorrect |
| Reviewed findings | Closed findings out of total findings | Closure may represent retention, classification, correction, or related resolution |

### 6.4 Column-profile table

Each column has a profile row containing:

1. **Column:** the field name.
2. **Type:** the current analytical role/type and whether it is inferred or declared.
3. **Completeness:** a compact meter plus the physical blank count.
4. **Distinct nonblank:** the number of distinct nonblank stored representations.
5. **Numeric range:** the observed minimum and maximum for numerical columns.
6. **Review:** a link to an open finding for that column, or a no-open-findings state.

The profile is calculated from the current working data. An approved fill, edit, or removal can therefore change the profile. The original source remains available elsewhere for comparison.

### 6.5 Completeness versus confirmed missingness

This is an important current UI distinction. Completeness measures physical blanks. The missingness analysis can additionally recognize analyst-confirmed nonblank missing representations.

Consequently, classifying `NULL` as missing can increase the analytical missing population while leaving the profile's physical blank count unchanged. Filling that confirmed missing observation later is a separate approval.

### 6.6 Check-coverage disclosure

**What do these checks cover?** explains the scope of automatic checks and distinguishes them from analyst-defined business constraints.

Automatic detection includes blank observations, numerical outlier checks, duplicate records, representation/format checks, and selected marketing-specific checks. Business-key definitions, schema requirements, and derived metrics depend on analyst definitions.

The absence of findings means the configured checks found nothing to flag; it is not a certification that every record is correct.

## 7. Dataset page: context and working distributions

### 7.1 AI analysis banner

The Dataset page includes an AI interpretation banner. It can show profiling/running status, completed progress, ready suggestions, stale context, cancellation, or unavailability.

During analysis, **Cancel AI review** stops the active interpretation process. Otherwise, **Refresh AI analysis** requests updated interpretations for the current evidence.

### 7.2 Dataset context

The **Dataset context** unit contains a **Dataset purpose** text area, with a maximum of 1,000 characters.

This is where the analyst can explain facts that a column name alone does not establish. For example:

- What the dataset measures.
- Whether a blank discharge date is expected for an admitted patient.
- What units a measure uses.
- Whether a code has a documented business meaning.

Editing context invalidates prior AI interpretations and exposes a refresh-needed state. The edit changes context; it does not rewrite dataset cells.

### 7.3 Context-related shortcuts

The context unit provides **Column definitions**, **Business relationships**, and **Review a manual correction**. These open the corresponding configuration or correction dialogs described later in this report.

### 7.4 Working distribution

The **Working distribution** unit has a column selector and compares:

- **Original source:** the imported data.
- **Cumulative working:** the current working data and its active classifications.

For numerical data, it shows shared histogram bins, a common count scale, minimum/maximum axis labels, and summary metrics for mean, median, and parsed-value count.

This original/working/proposed distribution family uses 18 shared bins over the displayed numerical range. It is distinct from the percentile-range histogram in missingness comparisons.

### 7.5 Non-numerical distribution state

For identifier or non-numerical columns without a usable numerical distribution, the comparison falls back to distinct label counts and blank counts rather than drawing a misleading numerical histogram.

### 7.6 What can change without rewriting cells

A missingness classification can remove a numerical sentinel from working analytical statistics while the source text remains intact. Conversely, retaining a legitimate zero keeps it observed.

The distributions therefore represent both physical working values and reviewed analytical meaning. They are not simply visual copies of the imported strings.

## 8. Explore page: spreadsheet workspace

### 8.1 Purpose and layout

Explore is the record-inspection page. It combines a search/filter toolbar, a finding legend, a scrollable spreadsheet, an issue rail aligned with rows, and a cell/row inspection area.

The table presents current working values. It is an inspection surface: selecting a cell does not directly edit it.

### 8.2 Search values

**Search values** performs a case-insensitive search across the dataset's columns. It narrows the visible row set when any field contains the entered text.

The accompanying counter reports visible rows against the working-row population. Clearing the search restores the wider view.

Search does not constitute a treatment scope and does not approve any correction.

### 8.3 Flagged rows only

This checkbox limits the spreadsheet to rows participating in open findings. It can be combined with search.

Flags follow the current open findings. After decisions or rollback, the set of flagged rows can change.

### 8.4 Spreadsheet headers and source-row column

The first table column shows the source-row number. Dataset headers appear with their inferred/current type labels underneath.

Values preserve their current textual representation. Formatting normalization becomes visible only after an approved treatment.

### 8.5 Highlighted cells

A flagged cell has a category-colored background and a finding icon. It is selectable by pointer or keyboard.

The cell can represent more than one finding. Multiple icons or the inspection tabs help distinguish those findings rather than treating the entire row as one undifferentiated problem.

### 8.6 Finding legend

The legend identifies seven categories:

- Missing value.
- Potential outlier.
- Inconsistent category.
- Date/number format.
- Cross-column conflict.
- Duplicate record.
- Schema violation.

These are category encodings, not a scale from “good” to “bad.” A possible sentinel may use a missing-related marker before its meaning has been confirmed.

### 8.7 Table scrolling

The spreadsheet scrolls locally so wide datasets remain readable. Large columns and long records do not require shrinking all values into the page width.

Vertical scrolling updates the adjacent issue rail so its markers remain associated with the visible row positions.

## 9. Explore page: issue rail and cell inspection

### 9.1 Row-aligned markers

The issue rail groups finding markers by visible source row and finding category. A row with several findings can have several categorized markers.

Markers include a type icon, a count when multiple findings are grouped, selected-state feedback, and a descriptive accessible label/tooltip.

### 9.2 Off-screen edge markers

Findings outside the spreadsheet viewport collect at the upper or lower edge. These markers show direction and a finding count by type.

The count represents findings, not necessarily unique records. A single off-screen row may contribute more than one finding.

Selecting an edge marker scrolls toward a relevant source row and opens its inspection details. This makes finding navigation possible without manually searching the entire table.

### 9.3 Selection feedback

Selecting a highlighted cell or a rail marker highlights the source row and the relevant cell. The detail area opens below the grid.

The selected state is reflected in the rail as well as the table, helping the analyst maintain the relationship between the record, column, and finding.

### 9.4 Inspection-card header

The card identifies the finding category, source row, column, and priority. Priority is a review-order signal, not a model-proven diagnosis.

### 9.5 Finding tabs within a record

If several findings affect the selected record, tabs allow the analyst to switch between finding types. When more than one finding of a type is present, an additional column-level choice distinguishes them.

Switching a tab changes the evidence being inspected. It does not change the record.

### 9.6 Evidence units by finding type

| Finding type | Evidence the inspector can present |
|---|---|
| Representation candidate | Current value, candidate kind, matching-record count |
| Missing numerical observation | Current value, column mean/median, affected count against total records |
| Potential outlier | Current value, saved rule, lower/upper boundaries, and population standard deviation where relevant |
| Duplicate | Compared columns, group source-row IDs, identical/conflicting-group distinction |
| Schema or relationship | Specific rule evidence for the record |
| Metric | Calculated target or reason calculation is unavailable |
| Date format | Source representation and an interpreted ISO result or parsing problem |
| Percentage scale | Source value and a decimal-scale interpretation |
| Category variant | Source spelling, comparison label, count of that spelling |
| Click/impression conflict | Recorded impressions and the numerical difference |

The current-value field is important when inspecting confirmed nonblank missing representations: their stored text remains visible even if general missing-value wording refers to a blank.

### 9.7 Review handoff

The card's primary action opens the associated guided review. Its wording varies with the finding, such as **Interpret this candidate**, **Inspect distribution**, or **Review configured rule**.

The destination concerns the finding's matching set, not automatically just the clicked cell. The analyst chooses the actual treatment scope in Review.

### 9.8 Locating a record from another page

**View row** actions in review tables return to Explore and locate the exact source row. They clear search and flagged-only restrictions so those filters do not hide the requested record.

This is a direct record-navigation operation, not a textual search for an ID that might happen to match several rows.

## 10. Review page: queue, configuration, and workspace

### 10.1 Page structure

The Review page contains:

1. A **Review findings** heading.
2. A result/feedback strip when a decision has just completed.
3. The AI interpretation banner.
4. A collapsed advanced-configuration disclosure.
5. A findings queue.
6. The active finding workspace or an empty-selection state.

On desktop, the queue and task surface sit side by side. On smaller displays, the queue moves above the task surface.

### 10.2 Findings-queue header

The header shows the open-finding count, explains recommendation-based sorting, and provides **Search columns or findings** plus a finding-type selector.

### 10.3 Finding search

This search matches column names, finding labels, and finding-type text. It changes the queue entries displayed to the analyst; it does not filter the working dataset or expand a treatment's scope.

### 10.4 Finding-type selector

**All finding types** is the broad view. The selector's other options reflect the kinds actually present in the current open findings.

Selecting a kind narrows the queue. If nothing matches the search/type combination, an explicit no-matching-findings state appears.

### 10.5 Queue entry

Each selectable entry presents:

- The column name.
- A finding label.
- The current matching-record count.
- Whether AI alternatives are ready or local evidence is the available basis.

The active entry has a blue selected treatment. Recommendation ranking can reorder visible items as AI results become available. The ranking does not establish correctness.

### 10.6 Closed-findings disclosure

The queue includes a closed-findings count and a shortcut to decision history. It directs the analyst to inspect or roll back decisions in Decisions rather than silently reapplying an old treatment.

Some supporting labels still call that destination “Changes,” while the main navigation labels it **Decisions**. They refer to the same history page.

### 10.7 Configuration disclosure

**Definitions, business checks & manual corrections** contains:

- Column definitions.
- Business relationships.
- Schema / metric rules.
- Duplicate keys.
- Manual correction.
- Dataset context.

These tools are disclosed separately from the primary finding task to keep advanced setup accessible without making every review stage a large configuration form.

### 10.8 Active-finding header

The task surface identifies the finding, column, and matching-record count. **Leave open** exits the current active selection while retaining the unresolved finding.

Leaving a finding open records neither a correction nor an acceptance decision.

### 10.9 Empty-selection states

With open findings but none selected, the workspace invites the analyst to choose a finding or start with the first ranked item.

With no open findings from current checks, it offers inspection of the working data. This is a check-completion state, not a guarantee that the dataset has no possible quality concerns.

## 11. Review page: clickable five-stage navigation

### 11.1 The stage banner

The horizontal banner lists:

**Understand → Interpret → Treat & scope → Preview → Approve**

Each stage label is a real button. The analyst can use the banner by pointer or keyboard rather than relying only on the footer's Continue button.

The current stage has a highlighted numbered marker, blue background, and blue underline. Earlier and later labels remain visible as navigation controls.

### 11.2 Progression rules

Forward navigation shares the same validation as Continue:

- Entering treatment requires a chosen interpretation.
- Preview requires a valid treatment definition and a nonempty matching scope.
- Approval requires a reviewed preview.
- Blocked records need resolution or an explicit valid-subset choice.
- Newly introduced configured violations require explicit acknowledgment.
- A changed dataset, treatment, or scope invalidates the earlier preview's approval eligibility.

Selecting Approve before reviewing the impact routes the analyst through Preview. It does not apply the treatment merely because the label was clicked.

### 11.3 Footer controls

The footer contains **Back**, a stage counter, and either **Continue**, **Review approval**, or **Approve this decision**.

Back is disabled at the first stage. The footer is in normal document flow, below the evidence, so it does not cover records or exception explanations.

### 11.4 Draft preservation and busy state

Going back retains the configured draft within the active review. Editing its interpretation, method, parameters, or scope requires a fresh valid preview before approval.

Similar-row preview generation can temporarily disable progression and change the primary label to **Computing preview…**. This indicates a calculation in progress, not a background approval.

### 11.5 Specialized meaning-review path

The one-by-one representation reviewer appears in the Understand/Interpret area for token and zero/negative findings. It adds a shorter **Confirm & next value** path for source-preserving meaning decisions.

That path approves a meaning classification with an explicit exact-match scope. Physical corrections still use the treatment, preview, and approval stages.

## 12. Review stage: Understand

### 12.1 General finding details

For ordinary findings, this stage presents a heading, a deterministic summary, grouped observed values, comparison metrics/distributions, and an expandable matching-record table.

Its question is: **What was observed, in which records, under which definition?**

### 12.2 Value-group list

Each group shows an exact representation and its record count. **Scope to this group** transfers that group's source-row identities into the review scope and proceeds toward interpretation.

The general evidence list shows up to 30 representations at once, with a notice when more exist. The full finding remains available to the scope controls.

Token/zero-negative findings use the more specialized one-by-one representation interface instead of this general evidence presentation.

### 12.3 Matching source records

**Inspect matching source records** opens a record-level table. It shows source-row numbers, the target field, relevant identifier fields, related rule fields where applicable, and **View row** navigation.

The evidence view is bounded to the first 100 matching records. This display bound does not mean only those records belong to the finding.

### 12.4 Outlier-definition controls

Potential outliers have an editable detection-method selector:

| Method | Exposed controls | Matching behavior |
|---|---|---|
| Interquartile range | IQR multiplier | Values outside Q1/Q3 fences expanded by the multiplier |
| Standard deviation / Z-score | Absolute Z-score threshold | Distance from the mean in population standard deviations |
| Percentile bounds | Lower and upper percentages | Values at or beyond percentile boundaries, including ties |
| Business bounds | Lower and upper numerical bounds | Values outside the chosen range; either end may be open |
| Custom condition | Field, operator, comparison value | Records matching the selected business condition |

The default statistical screen is 1.5 × IQR. A lower multiplier generally flags more values. A zero IQR does not manufacture a new spread; the rule reports no statistical matches under that condition.

### 12.5 Outlier-definition feedback

The unit reports the current matching-record count and the calculated boundary/rule description. Invalid settings display a validation message and prevent saving the definition.

Examples include nonpositive multipliers, invalid percentile ordering, or inconsistent lower/upper bounds.

### 12.6 Save definition only

This saves the finding's definition without applying a cap, replacement, or removal. The definition and a treatment decision remain separate operations.

Changing a displayed finding definition also makes earlier AI advice or treatment previews stale for that evidence.

### 12.7 Numerical relationships disclosure

**Inspect numerical relationships** exposes a scatter plot for an outlier finding. The analyst can choose X and Y numerical columns, zoom by scrolling, pan by dragging, and reset the view.

Highlighted points correspond to the displayed finding definition. Axis choices and viewport movement change the visualization, not the rule or approval scope.

Rows lacking usable paired numerical values do not become fabricated zero-valued points. A no-paired-values state is shown if the plot has no usable observations.

### 12.8 Duplicate definition

Duplicate review exposes **Exact full-row match** or **Composite business key**.

Composite-key mode adds field checkboxes. At least one valid key column is required. Keys are compared exactly and case-sensitively; records with missing key components are excluded from that key comparison.

Choosing a duplicate definition recalculates membership. It does not remove records.

## 13. Review unit: one-by-one value-meaning assessment

### 13.1 Purpose

This unit answers: **Does this exact representation denote a missing observation in this column, or does it have another meaning?**

It is designed for values such as `NULL`, `N/A`, `0`, negative measurements, and sentinel-like codes. The system screens these values without declaring them missing in advance.

### 13.2 Column-level representation strip

The strip gathers currently unresolved token and zero/negative representations for the same column. The analyst can therefore move between `NULL`, `N/A`, zero, and negatives while retaining the column context.

Every representation button shows:

- Its exact value.
- Matching-record count.
- Its own AI missingness-confidence percentage, when assessed.
- Pending or unassessed state when a score is unavailable.
- A skipped indication where applicable.

The strip is horizontally scrollable. Selection changes the focused representation, not the dataset's stored values.

### 13.3 Representation ordering

Common token-like forms are prioritized ahead of numerical candidates. Within the ordering, occurrence counts and source order provide a deterministic way to move through groups.

The analyst can jump directly to a representation rather than accepting the suggested sequence.

### 13.4 Focused value and exact scope

The focused area repeats the selected value, column, and matching-record count. The scope is the currently unresolved exact matches belonging to that representation's finding.

This prevents deciding that `NULL` is missing and inadvertently classifying `0`, `N/A`, or a different negative value at the same time.

### 13.5 Independent AI assessment

The AI block shows a provider attribution, missingness-confidence percentage, explanation, and suggested meaning.

The assessment uses column context: name, declared meaning/units, dataset purpose, value counts, and numerical distribution where available. It is not merely a token lookup.

Examples of why independent assessment is necessary:

- `0` in number of children is a legitimate count.
- `0` in a temperature column is a legitimate temperature.
- `-23` in Celsius can be a valid reading.
- `-23` in a child-count column can be an error without proving a specific missing-value convention.
- `NULL` may be an unknown observation, but its meaning remains a reviewed contextual decision.

### 13.6 Confidence interpretation

The percentage is a model-assessed confidence score, not a calibrated statistical probability. It is not the percentage of records that are missing, an observed error rate, or a validated domain fact.

The UI does not select the analyst's radio choice based on that score. A high model score is still advice that the analyst can reject or leave unresolved.

### 13.7 Suggested meanings versus available analyst decisions

AI assessments can describe a value as missing, legitimate, not applicable, unresolved, erroneous, or a format problem. The compact reviewer offers three explicit semantic decisions: missing, valid, or not applicable.

If an AI explanation identifies an error but there is insufficient evidence that it represents missingness, the analyst can skip it and investigate or use the normal correction workflow. “Erroneous” and “missing” are not equivalent labels.

### 13.8 Assess or reassess this value

**Assess this value with AI** requests an assessment for the selected representation. After a result exists, the button becomes **Reassess this value**.

During active interpretation, the control shows a busy state and is disabled. The analyst can still see results already delivered in earlier batches.

### 13.9 Batch-by-batch delivery

Automatic interpretation starts after import. Exact representations are covered in bounded batches, and the UI updates when each batch completes.

This is incremental delivery of completed assessment batches. It is not a guarantee of token-by-token text streaming. Available evidence and completed scores can be inspected before the entire dataset's AI analysis finishes.

### 13.10 Analyst decision radios

| Choice | Meaning recorded | Immediate physical data effect |
|---|---|---|
| Missing observation | These exact matches denote absent/unknown observations | No cells rewritten |
| Keep as a valid value | These exact matches are retained as legitimate observations | No cells rewritten |
| Not applicable | An observation is not expected for these records | No cells rewritten |

The confirmation control is disabled until an explicit supported choice is made. Choosing a radio stages the decision; confirmation records it.

### 13.11 Confirm & next value

Confirmation records the exact-match scope, analyst meaning, and available AI assessment in reversible decision history. It also changes how those records participate in subsequent analytical work.

The UI then advances to another unresolved representation. If the representation review is complete and confirmed missing observations exist, the normal missing-value finding becomes the next useful destination.

The stored `NULL`, `N/A`, or numerical sentinel remains intact during this classification step. No automatic blank replacement or numerical fill occurs.

### 13.12 Skip for now

Skipping leaves the representation unresolved, marks it as skipped in the current review sequence, and advances where another unskipped representation exists.

If all remaining items are skipped, the interface returns to an open-findings state. Skipping is not approval, retention, or classification.

### 13.13 Confirmed-missing handoff

When confirmed missing observations exist, **Compare / treat confirmed missing values** opens their missing-value finding.

That destination can contain nonblank source forms that have been confirmed missing. The comparison and fill logic use the reviewed meaning rather than requiring the analyst first to destroy the original representation by converting it to blank.

### 13.14 Scope granularity

The streamlined confirmation applies to the exact representation's matching group. It is not an individual-cell editor.

Where the same representation means different things for different records, the standard treatment-scope controls allow narrower row-ID or condition-based review. The representation strip itself is not a rule that all occurrences in every future dataset share one meaning.

### 13.15 Persistence and rollback

Approved meanings are preserved with history and project backups. A rollback removes the corresponding active interpretation and rebuilds the working state around remaining decisions.

A legitimate zero therefore remains observed after restoration; a confirmed missing token remains analytically missing after restoration; and rolling back a physical fill can restore the original token while retaining an earlier missingness classification.

## 14. Review unit: missing-versus-present comparison

### 14.1 Entry and purpose

Open a missing-value finding, remain in Understand, and use **Compare columns** in **Missing vs present**.

The analysis asks: **Which other fields differ between records whose target observation is missing and those whose target observation is present?**

Unconfirmed `NULL`, `N/A`, or zero values are not made missing by a blanket comparison checkbox. Their reviewed classifications, plus existing explicit definitions where applicable, supply meaning.

### 14.2 Group-count unit

The result shows target-missing and target-present record counts. These define the population split used by the analysis.

At least five records are required in each target group. Otherwise, the panel returns an insufficient-data explanation rather than a ranked result.

### 14.3 Ranked comparison table

The table presents comparison column, comparison type, effect size, and strength. It is sorted by measured effect size.

Clicking a column selects its detailed statistics or rates. The selected row is visually distinguished.

Default comparisons omit identifier-like columns where appropriate. Constant columns and unsupported/high-cardinality categorical comparisons do not receive a fabricated effect ranking.

### 14.4 Numerical comparison details

For a numerical comparison field, the detail table has two group rows: **Target missing** and **Target present**. Each reports:

- Parsed count.
- Mean.
- Median.
- Interquartile range.

These are statistics of the comparison field within each target group. For example, when delivery days is the target and quantity is the comparison, “missing median 9” refers to quantity among records missing delivery days.

### 14.5 Numerical effect size

The numerical effect is the absolute standardized mean difference: the difference in the two group means divided by pooled standard deviation.

Strength categories use the built thresholds:

- **Strong:** standardized mean difference at least 0.5.
- **Moderate:** at least 0.2 and below 0.5.
- **Weak:** a smaller nonzero measured difference.
- **None:** no measured effect under the calculation.

This is an association measure. It does not demonstrate that the comparison field caused the missing observations.

### 14.6 Missing/present histogram

The histogram uses 16 shared bins over the combined first-to-99th-percentile range. Both groups use the same horizontal intervals and count scale.

Values beyond that range remain in the edge bins, and the unit reports below/above tail counts for each group. Extreme observations are not silently deleted from the group counts.

The group legend distinguishes target-missing and target-present records. These series are different from the original/working/proposed series used elsewhere.

### 14.7 Categorical comparison details

Categorical comparison is available for fields with at most 30 distinct usable values. Its table shows category, record count, target-missing count, and missing rate.

The categorical effect is the largest absolute difference between an eligible category's missing rate and the overall target missing rate.

Categories with fewer than ten records remain visible in the rate table but are labeled as excluded from the ranking calculation.

Strength thresholds are:

- **Strong:** a rate gap of at least 15 percentage points.
- **Moderate:** at least 7 and below 15 percentage points.
- **Weak:** a smaller nonzero gap.
- **None:** no eligible measured gap.

The effect is displayed as a proportion gap. A displayed gap near 0.15 corresponds to about 15 percentage points; it is not a numerical standardized mean difference.

### 14.8 Date comparison details

Date comparison groups usable dates by month and shows monthly record counts, target-missing counts, and missing rates.

It follows the same eligible-group/rate-gap idea as categorical analysis. Date parsing follows the selected explicit format policy; unparseable values are reported as excluded rather than guessed.

This is a monthly rate table, not a forecasting model or a fully featured time-series dashboard.

### 14.9 Exclusion counts

The selected comparison explains how many comparison values were missing and how many were unparsed. Those observations do not become numerical zeros.

A group can have many target-missing records but fewer usable numerical comparison values. Parsed counts and exclusion counts make that distinction visible.

### 14.10 No-pattern state

When at least three usable comparison columns are all weak or have no measured effect, the panel explicitly reports that no stronger pattern was detected.

Its wording says the gaps **may** depend on the missing value itself and that average filling could bias results. It is an indication based on the available comparisons, not a diagnosis of a particular statistical missingness mechanism.

### 14.11 Refresh behavior

**Refresh comparison** recomputes for the current working data. Earlier held results and AI pattern explanations are refreshed/invalidated in accordance with the new evidence.

The calculations run as background work, with a busy label, so comparison does not itself apply any treatment.

## 15. Review unit: Hold similar comparison

### 15.1 Purpose

**Hold similar: compare within groups** asks whether an overall association persists when another field is held broadly comparable.

For example, an overall quantity difference between missing/present delivery-day records can be reconsidered within Online, Distributor, and Retail channel groups.

### 15.2 Controls

| Control | What the analyst chooses |
|---|---|
| Compare | The field whose missing/present difference is being examined |
| Hold similar by | The field defining comparable groups |
| Numeric bands | Quantiles, fixed width, or custom edges for numerical holds |
| Number of bands | Quantile count, default 4; supported range 2–20 |
| Band width | Positive interval width for fixed-width grouping |
| Increasing edges | Explicit finite boundaries for custom bands |
| Compare within groups | Executes the held comparison |

Numerical band controls disappear for a categorical hold. The target column cannot serve as its own hold column.

### 15.3 Categorical bands

Each sufficiently populated category becomes a band. Categories with fewer than ten records are consolidated into **Other**. Missing hold values have a separate **Unknown** band.

### 15.4 Numerical bands

Quantiles divide the numerical hold distribution into approximately comparable population regions. Repeated boundary values can reduce the number of distinct effective intervals.

Fixed-width bands use a chosen numerical interval size. Custom bands use the analyst's ordered boundaries, such as 2, 5, and 10.

Unusable/missing numerical hold values are kept in an Unknown band rather than assigned to a fabricated zero interval. Validation rejects nonpositive widths, unordered/nonfinite custom edges, and excessively granular band definitions.

### 15.5 Band result table

Each band shows:

- Band label.
- Target-missing / target-present counts.
- Missing-group median where a numerical comparison supports it.
- Present-group median where supported.
- Within-band effect size.
- Whether the band is included or insufficient.

Categorical/date comparisons use rates internally; a numerical median is not manufactured where it is not applicable.

### 15.6 Included-band criteria

A band needs at least five target-missing and five target-present records to contribute to the combined conclusion. Numerical comparisons also need adequate usable comparison values.

At least two valid bands are required for a non-insufficient verdict. A single large informative group does not satisfy the multi-band requirement by itself.

### 15.7 Combined effect

The unit shows the unbanded effect and a weighted average of the valid within-band effects. Weighting uses band population size.

The purpose is attenuation/persistence comparison, not a causal model or a multivariable regression coefficient.

### 15.8 Verdicts

| Verdict | Operational meaning |
|---|---|
| Holds | Combined effect remains at least 70% of the unbanded effect and direction is consistent in most valid bands |
| Explained | Combined effect is at most 30% of the unbanded effect |
| Partial | The result falls between those conditions or lacks sufficiently consistent persistence |
| Insufficient | Fewer than two usable bands support the comparison |

The headline is accompanied by a deterministic summary and the underlying band table, allowing the analyst to inspect the basis for the verdict.

### 15.9 Reliability warning

If the hold field is missing in at least half of the target-missing records, the result includes a warning that it is unreliable.

The warning does not silently discard those records or select another hold field. It tells the analyst that the chosen grouping is poorly observed where it matters.

## 16. Review unit: AI explanation of a measured pattern

### 16.1 Request control

After a usable missingness comparison, **Explain top pattern with AI** requests a concise explanation of the computed evidence. Its nearby text identifies that aggregate statistics and comparison verdicts are sent.

This is a separate AI task from per-representation missingness assessment. One assesses value meaning; the other explains measured associations across columns.

### 16.2 Evidence supplied

The explanation request includes target identity, target-missing count, total record count, up to three top comparison summaries, and previously computed held verdicts.

The summaries can contain numerical key statistics or aggregated category/monthly rates. Raw dataset rows and KNN neighbour-record lists are not part of this pattern-explanation prompt.

### 16.3 Result units

The result can show:

- A short explanation, limited to 300 characters by validation.
- A likely-driver column, if proposed.
- A caution sentence.
- An optional treatment proposal.

Partial or insufficient held results require qualified language. The “likely driver” label is model interpretation of associations, not proof of causation.

### 16.4 Allowed proposal types

The model can propose a constant fill, a group-wise fill with specified hold fields/statistic, a KNN fill with fields and neighbour count, or leaving missing observations unfilled.

The response is checked against supplied columns and supported operations. Unsupported fields, operations, and parameter values are rejected rather than used as executable instructions.

### 16.5 Review proposed treatment

This button configures a draft in Treat & scope. It does not edit the working dataset or bypass the preview.

The analyst can alter the proposed method, reference fields, precision, or scope. The normal preview, exceptions, constraint checks, and explicit approval remain in force.

## 17. Review stage: Interpret

### 17.1 General interpretation unit

Outside the specialized representation reviewer, Interpret shows the highest-ranked AI interpretation, its model confidence/rank, explanation, assumptions, and provider attribution when available.

An alternatives disclosure allows comparison with other returned interpretations. High/moderate/low model-confidence labels summarize recommendation scores; they are not calibrated probabilities.

### 17.2 Analyst interpretation choices

The general choices are:

- Legitimate value / expected repetition.
- Unknown / missing observation.
- Not applicable to these records.
- Formatting or representation problem.
- Incorrect value / business-rule violation.

Choosing one defines the analyst's intended meaning for the scoped records. It does not by itself choose or execute a physical correction.

### 17.3 No AI result

If AI is unavailable or still running, the panel states that clearly and allows the analyst to proceed using the local evidence and an explicit interpretation.

Local review is not gated on a successful model response.

### 17.4 Follow-up question

**Ask the copilot about this finding** opens a question input, limited to 220 characters, and **Ask for an interpretation**.

The follow-up refines the current finding's interpretation request. It does not act as an unrestricted command console or apply a treatment.

## 18. Review stage: Treat & scope

### 18.1 Interpretation summary

The stage begins with the selected interpretation. This keeps the chosen meaning visible while the analyst specifies an operation.

### 18.2 Treatment selector

The available treatments depend on the finding and the column's analytical role. Numerical missing findings, category variants, date-format findings, outliers, duplicates, and derived metrics expose different operation sets.

The website does not present every transformation as valid for every finding.

### 18.3 Dynamic parameter fields

Selecting a method reveals its relevant fields: replacement text, decimal precision, grouping column, conversion factor, mapping editor, date format, bounds, duplicate-survivor policy, or similarity-column controls.

Changing a field invalidates the existing approval preview. A method switch does not apply the old method's simulated output to the data.

### 18.4 Scope mode: all finding records

**All records belonging to this finding** chooses the finding's eligible matching population.

It means all records in that finding, not all rows in the dataset regardless of relevance.

### 18.5 Scope mode: selected source-row IDs

The analyst enters source-row identities, separated by commas or whitespace. The IDs must belong to the finding and remain present in the working population.

This gives explicit subset control when only particular records should receive the operation.

### 18.6 Scope mode: condition

Condition scope exposes a field selector, an operator selector, and a comparison value.

Supported operators include exact equality, inequality, contains, greater than, greater than or equal, less than, and less than or equal.

Condition matching narrows the eligible finding set. It does not silently include unrelated dataset rows. Numerical comparisons require usable numerical values; blanks do not become zero.

### 18.7 Empty/invalid scope

A scope with no matching eligible records prevents forward approval progression. Invalid IDs, unsupported conditions, or missing required condition values produce feedback rather than a broader implicit scope.

### 18.8 Inspection versus treatment

Spreadsheet search, flagged-only view, queue search, and scatter-plot panning are inspection controls. They do not define which records a treatment changes.

The treatment-scope unit is the authoritative approval scope.

## 19. Treatment catalogue: retain, replace, and normalize

### 19.1 Retain reviewed values

This records acceptance of the reviewed scope without changing its cell values. It is useful when unusual values or repeated records are legitimate.

Retaining a reviewed value as legitimate is distinct from declaring it missing. The dedicated representation classification handles source-preserving missingness decisions.

### 19.2 Reviewed replacement

The analyst supplies an exact replacement string. It is applied only to the approved scope. A blank replacement is permitted where that is the explicit decision.

The preview shows actual before/after values. This is a direct chosen replacement, not an inferred estimate.

### 19.3 Normalize to missing

This physically replaces selected representations with a blank. Their original values and the interpretation remain in the decision record.

It differs from the new source-preserving classification path: classifying `NULL` as missing retains `NULL`; normalizing it to missing writes an empty value.

Normalization is also separate from filling. Newly blank observations can still require a later fill or retention decision.

### 19.4 Normalize whitespace

This removes surrounding whitespace and consolidates repeated internal whitespace into single spaces for the selected values.

It is an explicit representation transformation, not a claim that two semantically different labels are synonyms.

### 19.5 Normalize to lowercase or uppercase

These treatments combine whitespace normalization with a chosen case convention. Their scope and exact output are previewed before approval.

### 19.6 Map reviewed labels

The mapping editor lists exact source representations, record counts, and editable target values. Each mapping is explicit.

The editor displays up to 200 source labels. A larger set requires narrowing the scope rather than silently omitting unreviewed mappings.

Mapping is appropriate for confirmed equivalent labels. Similar spelling alone does not require the analyst to merge them.

## 20. Treatment catalogue: statistical and similar-row fills

### 20.1 Fill with reference mean

The estimate uses numerical reference observations outside the selected treatment scope. Missing/not-applicable classifications are excluded from the reference population, while legitimate zero remains observed.

The analyst sets decimal precision. The preview uses the rounded values that would actually be stored after approval.

### 20.2 Fill with reference median

This uses the middle of the observed reference distribution rather than its arithmetic average. Its scope, precision, and approval behavior follow the same review model as mean filling.

No reference observations means no fabricated estimate. The record becomes blocked and requires another explicit treatment or retention choice.

### 20.3 Fill with group median: strict single-group method

This existing method groups by one other column and uses observed references with the same exact group value.

A blank group key or a group without observed references blocks the estimate. It does not automatically widen the group or insert zero.

This is materially different from **Fill from similar groups**, which supports multiple holds, banding, minimum references, widening, and global fallback.

### 20.4 Fill from similar groups: controls

The unit exposes:

- A checklist of hold columns other than the target.
- **Reference statistic:** median or mean.
- **Minimum observed references:** default 5; valid positive range up to 1,000.
- Decimal precision, 0–12.
- A numeric-band configuration for each selected numerical hold.

Identifier-like fields are omitted from the normal similarity-field checklist so the analyst is not encouraged to treat unique IDs as meaningful reference similarity.

### 20.5 Multiple holds

When several holds are selected, the method uses their combined band/category membership. For example, it can estimate within a channel-and-region combination rather than channel alone.

Numerical holds can use quantiles, fixed widths, or explicit custom edges. Categorical holds use category membership with small categories consolidated into Other.

### 20.6 Direct-band estimate

If the matching band has enough observed target values, its selected median or mean supplies the fill. The recorded source is **band**.

The estimate is based on observed target values, not on previously simulated fills in the same preview.

### 20.7 Widened estimate

An underpopulated band can widen through nearby numerical bands or the applicable Other-category pool. The method records **widened** when that expanded reference population supplies the value.

Widening is an explicit part of this method's computation. It is not presented as if the value came from the original narrow group.

### 20.8 Global fallback

If a usable widened reference group is still unavailable, the global observed median is the fallback. This remains a median fallback even when mean was selected for direct group estimates.

The source is recorded as **global**, and the fallback count increases. If no global observed numerical references exist, the affected record is blocked.

### 20.9 Fill from nearest neighbours: controls

KNN filling exposes a similarity-column checklist, **Neighbours (k)**, and decimal precision. The default is seven neighbours; supported k values are 1–50.

The target cannot be included among its own similarity features.

### 20.10 KNN similarity behavior

Numerical similarity dimensions are scaled to the observed minimum/maximum range, so a large currency scale does not automatically dominate a small numerical scale.

Categorical dimensions contribute zero distance for an exact match and one for a mismatch. The overall distance averages the used selected dimensions.

A similarity dimension missing in the record being filled is ignored for that record. Missing information in a donor is treated as a mismatch on a used dimension rather than assumed equal.

### 20.11 KNN estimate and ties

The target estimate is the median of the selected neighbours' observed target values. Ties in distance are broken by source order, making the same evidence produce the same selection.

If fewer than k observed neighbours exist, the available neighbours are used. With no usable neighbour match, the global median is attempted. With no observed target references at all, the record is blocked.

### 20.12 Similarity-data warning

The treatment unit can warn when selected similarity fields are missing in at least half of physically target-missing rows. It advises choosing more complete reference dimensions and identifies possible reliance on global fallback.

For confirmed nonblank missing tokens, consult the exact scope and provenance as well: the current sparsity-warning presentation is oriented around physically missing target values.

### 20.13 Source trace

Both similar-row methods provide per-cell provenance. Direct group/widened/global sources are distinguished. KNN also records the selected donor source-row IDs, up to k.

The complete trace is saved with the approved decision and portable project/log artifacts, even when the visible preview table shows only the first 100 fills.

## 21. Treatment catalogue: numerical and date transformations

### 21.1 Parse numerical format

The analyst chooses plain decimal/exponent form, a decimal-point/separator convention such as `1,234.56`, or a decimal-comma convention such as `1.234,56`.

For formatted-number modes, separate controls allow a leading currency symbol and decide whether explicit percentages become decimals. The analyst also chooses output decimal precision.

The parser rejects representations that do not match the selected convention. It does not guess whether `1,234` means a decimal-comma number or a thousands-separated integer.

### 21.2 Multiply by a reviewed factor

This applies an explicit numerical factor to each scoped value. For example, 0.01 can convert confirmed whole-percentage values to decimal scale.

The factor and precision are analyst choices. Unit conversion is not inferred and applied autonomously.

### 21.3 Convert interpreted dates

The available source interpretations are:

- YYYY-MM-DD.
- Month/day/year.
- Day/month/year.
- Excel 1900-system date serial.

The proposed output is a normalized ISO date. Invalid calendar dates remain blocked. The fictitious Excel leap-day serial is rejected rather than translated into a real date.

The control is explicit source-format interpretation, not a general natural-language date recognizer or an instruction to discard timestamps silently.

### 21.4 Cap to business bounds

The analyst supplies a lower bound, upper bound, or both. A scoped value outside those bounds is brought to the corresponding bound; values already within the permitted range remain unchanged.

The bound definition and rounding precision are visible before approval. Detection of an outlier does not itself choose this treatment.

## 22. Treatment catalogue: duplicates, removal, and metrics

### 22.1 Retain repeated records

Duplicate findings can be accepted without removal where repetition is legitimate. This is a recorded decision rather than a deduplication operation.

### 22.2 Keep selected duplicate survivor

The survivor selector supports:

- Earliest source record.
- Latest source record.
- Most complete record, with source order resolving ties.
- Manually selected survivor source-row IDs.

Manual selection requires exactly one survivor in each reviewed duplicate group. The other reviewed group members become proposed whole-record removals.

### 22.3 Conflicting duplicate values

Repeated business keys can have different non-key values. The interface calls out that conflict and requires acknowledgment of the survivor policy before the operation proceeds.

The analyst is not led to assume that matching keys prove all records are identical.

### 22.4 Merge complementary duplicate values

This fills a blank survivor field only when the group supplies one distinct nonblank alternative for that field. It does not automatically reconcile competing nonblank values.

A merge can therefore involve both cell patches in the survivor and whole-record removals of other members. The preview distinguishes these effects and provides an all-merged-patches disclosure when fields beyond the finding's primary column change.

### 22.5 Remove scoped records

This removes entire records from the working population. It is not removal of just the selected cells or target values.

The UI identifies this consequence and previews the rows. Original records remain available for rollback and population accounting.

### 22.6 Recalculate metric

For a configured derived-metric finding, recalculation changes the target column using its chosen source fields, operation, factor, and precision.

Source input fields are not overwritten by the target recalculation. A zero denominator, missing/unusable input, or nonfinite/unrepresentable result prevents a fabricated numerical value.

### 22.7 Dependent metrics

Metric definitions can form noncyclic dependencies, but approving one correction does not autonomously execute a chain of dependent corrections.

For example, filling cost may create or change a profit discrepancy. The analyst separately reviews the profit rule and approves its target recalculation.

## 23. Review stage: Preview

### 23.1 Preview summary strip

The preview begins with four counts:

1. Scoped records.
2. Cells changing.
3. Whole rows removed.
4. Blocked records.

These counts prevent a large reviewed scope from being mistaken for the number of physical edits, and prevent record removal from being reported as a mere cell change.

### 23.2 Exact record-level table

The table shows source-row identity, current field values, relevant identifiers/rule fields, proposed values when cell patches exist, and **View row**.

Up to 100 scoped records are displayed. A notice explains when the full approved scope is larger. Summary counts and approval cover the full selected scope, not just the visible table sample.

### 23.3 Distribution comparison

The preview compares **Original source**, **Cumulative working**, and **Proposed preview** on shared bins and a common count scale.

Mean, median, parsed-value counts, and physical blank counts make the proposed numerical impact visible. Non-numerical columns use label/blank metrics where a numerical chart would be inappropriate.

The proposed series is a simulation; navigating past the chart does not apply it.

### 23.4 Blocked-record exceptions

The exception panel gives source-row IDs and reasons, showing up to 30 detailed entries alongside the full blocked count.

Examples include invalid dates, absent statistical references, unusable group keys, and unrepresentable numerical results.

### 23.5 Valid-subset acknowledgment

**Approve only the valid subset; leave all blocked records unresolved** is an explicit partial-approval choice.

Without that choice, blocked records stop approval. With it, eligible valid changes can proceed while blocked records remain open. The system does not silently treat failure as permission to ignore those records.

### 23.6 Introduced-constraint panel

The preview checks changed rows for newly introduced configured schema/relationship violations. It lists relevant row IDs, columns, and reasons, with a bounded detailed display.

The analyst must explicitly acknowledge such violations before approval. The panel concerns the configured rules and changed-row impact; it is not a universal certificate that the entire dataset satisfies every conceivable business constraint.

### 23.7 Fill-provenance disclosure

For group-wise/KNN estimates, **Fill sources** shows proposed-fill count, fallback count, method, selected reference fields, and method parameters.

Its table reports source row, proposed value, actual method source, and group label or neighbour row IDs. Method sources distinguish band, widened, KNN, and global estimates.

### 23.8 Preview staleness

A preview is linked to the current data, finding definition, interpretation, parameters, and scope. Editing these makes its previous approval state stale.

The analyst must regenerate/review the current impact. A stale preview cannot approve a different treatment merely because an older chart was already inspected.

## 24. Review stage: Approve

### 24.1 Approval content

Approve retains the impact summary, exceptions, distributions, and exact-record table so the final decision remains tied to the reviewed outcome.

The analyst is not asked to approve an abstract treatment name without its current scope and consequences.

### 24.2 Optional rationale

**Your rationale** accepts up to 2,000 characters. The analyst can document the business basis, evidence, or reason for retaining values.

The rationale is stored with the decision and available in history/artifacts. It is optional; the explicit treatment interpretation and scope still exist without a note.

### 24.3 Approve this decision

This is the physical-treatment approval action. It requires a still-valid preview, a chosen interpretation, a nonempty eligible scope, and the appropriate exception/constraint acknowledgments.

It applies the reviewed cell patches or removals, records the analyst decision and provenance, refreshes findings and working profiles, and presents completion feedback.

### 24.4 Completion feedback

The result strip reports actual changed cells, removed records, reviewed-record count, and unresolved blocked records. **Dismiss** clears the feedback presentation, not the approved history.

### 24.5 Source-preserving classification approval

The representation reviewer's **Confirm & next value** is a separate explicit approval of meaning. It checks an exact source-preserving scope and records the classification, but has zero rewritten cells and zero removed rows.

The fact that both paths create decisions does not make them equivalent physical changes.

## 25. Decisions page and rollback

### 25.1 History layout

The Decisions navigation opens the change-history page, currently headed **Transparent change history**. Active approved decisions are displayed newest first.

With no active decisions, the page shows an empty state and a shortcut back to Review.

### 25.2 Decision card units

Each card includes:

- A status badge: accepted without value change or finalized.
- Column and treatment/decision title.
- Reviewed-record count.
- Cell-modification count.
- Removed-record count.
- Approval timestamp.
- Before/after decision summaries.
- Finding evidence/reason.
- Optional analyst rationale.
- Analyst interpretation and scope information.
- A **Rollback** control.

### 25.3 No-change decisions

An accepted retention decision can have zero cell modifications. A finalized meaning-classification decision can also have zero cell modifications.

The badge describes the decision disposition, not a guarantee that numerical cell values changed. The record/cell/removal counts provide the physical-impact distinction.

### 25.4 Statistical-fill history

Similar-row fills add the provenance disclosure to the card. It identifies approved values, method, parameters, fallback count, and per-cell band/neighbour source information.

This lets the analyst trace an approved estimate after leaving the preview screen.

### 25.5 Rollback confirmation dialog

The dialog asks whether to undo the decision for its reviewed record count. It explains that later approved values will be preserved and findings will be checked again.

**Cancel** closes the dialog. **Undo decision** performs the rollback.

### 25.6 Rollback behavior

Rollback removes the selected decision's active effect and rebuilds the working dataset around remaining approvals. Later approvals retain their stored approved values; estimates are not silently recalculated using today's reference population.

This supports undoing an older overlapping correction without erasing a later approved edit to the same cell.

### 25.7 Record restoration

A rolled-back removal can restore source records if another remaining decision does not remove them. The records return with their source identities and applicable remaining approved patches.

### 25.8 Classification restoration

Rolling back a classification removes that active meaning decision. Other active classifications remain.

Rolling back a later fill can restore `NULL` as text while leaving an earlier missingness classification active. This is a practical demonstration of separate source representation and analytical meaning.

### 25.9 Audit-event continuity

The main history lists active decisions. Downloadable logs retain approval and rollback events, including the actual resulting effects of rollback rather than an assumed reversal of every original patch.

An audit trail is therefore more complete than the set of cards still visible as active decisions.

## 26. Report page and downloadable artifacts

### 26.1 On-page summary

The Report page is headed **Quality report**. It identifies how many findings remain open and offers **Export cleaned CSV**.

Its metric strip includes current dataset dimensions, total findings with closed/approved counts, modified rows with modified-cell count, and open findings with physical blanks retained.

A separate line reports source records removed from the working population.

### 26.2 Cleaned CSV

This exports the current working rows and original dataset columns with approved physical edits/removals. Values are quoted/escaped for CSV output.

It does not add internal source-row identities, model scores, history, or classification metadata as new dataset columns.

A source-preserving missingness classification alone leaves its literal token in the CSV. To physically blank or fill that token, the analyst must approve the corresponding treatment.

### 26.3 Report and decision-log downloads

| Download | Purpose | Main contents |
|---|---|---|
| Quality report · HTML | Human-readable portable report | Metrics, completeness, findings, active decisions, audit history, rules |
| Quality report · JSON | Detailed structured report | Counts, source/working completeness, row identities, decisions, events, definitions |
| Decision log · JSON | Full decision/audit artifact | Active decision IDs and approval/rollback events, including treatment metadata and fill traces |
| Decision log · CSV | Flat tabular audit view | Event, decision, treatment, column, source row, before/after, reason, note, interpretation, scope |

### 26.4 HTML report structure

The downloadable HTML report includes dataset identity, generation time, source-to-working population counts, modified/removed totals, open findings, active approvals, source/working completeness, finding status/evidence, active decisions, and review history/rules.

It is self-contained for reading and printing. PDF creation uses browser printing rather than a separate in-app PDF-generation workflow.

### 26.5 Completeness in reports

The report compares source and working physical blank counts. Their populations can differ after row removal.

A reduced blank count after removing records is not presented as proof that those values were filled. Removed-row accounting is separate.

### 26.6 JSON versus CSV audit depth

JSON preserves nested method parameters, per-cell provenance, and richer decision metadata. The CSV log is a flattened audit format and should not be assumed to preserve every nested KNN or banding detail as separate columns.

For a no-value-change event, the CSV log can record the reviewed row IDs and a no-value-change before/after description rather than invent cell patches.

## 27. Configuration dialog: column definitions

### 27.1 Entry points and purpose

**Column definitions** is available from Dataset context and the Review configuration disclosure. The dialog is titled **Column meaning and parsing policy**.

It lets the analyst provide context and interpretation rules for a selected column. Saving a definition recalculates relevant checks but does not rewrite stored values.

### 27.2 Field inventory

| Field | Available input | Functional effect |
|---|---|---|
| Column | Existing field selector | Chooses the column whose policy is being edited |
| Analytical role | Auto, identifier, number, integer, text, category, date, boolean | Guides profiling and appropriate review behavior |
| Meaning / units | Up to 300 characters | Supplies semantic/unit context for interpretation |
| Declared missing tokens | One bounded exact token per line | Explicit analyst-authored column policy |
| Number parsing | Plain, decimal point, decimal comma | Chooses the permitted source-number convention |
| Default decimal places | 0–12 | Supplies a treatment-precision default |
| Allow a currency symbol | Checkbox | Enables the applicable formatted-number parsing behavior |
| Convert explicit % to decimals | Checkbox | Declares the intended handling of explicit percentages |
| Date interpretation | ISO, month/day, day/month, Excel serial | Supplies an explicit source-date convention |

### 27.3 Identifier role

Declaring a postal code, account identifier, or similar field as an identifier prevents numerical measurement assumptions from being used indiscriminately. A sequence of digits is not necessarily a quantity.

Statistical outlier rules are not appropriate for declared identifiers; explicit custom business conditions remain conceptually distinct.

### 27.4 Explicit token definitions versus one-by-one review

The definition dialog still supports an expert-authored column policy. This is different from the removed blanket comparison/fill checkbox that asked the user to treat a default token list as missing in bulk.

The new normal review flow assesses representations individually. An active legitimate per-record decision can preserve an observation despite a broad missing-token policy in the analytical paths that honor reviewed meanings.

### 27.5 Matching and actions

Declared token comparison ignores surrounding whitespace and case. Zero is not a universal missing token; it must be explicitly declared or individually reviewed according to context.

**Save column definition** validates and applies the policy. **Cancel** exits without applying the current edit. Invalid precision, token lists, or parsing choices produce dialog feedback.

## 28. Configuration dialog: business relationships

### 28.1 Purpose

**Relationships and conditional requirements** expresses business checks across fields. These checks create findings; they do not execute corrections.

### 28.2 Comparison-rule fields

The analyst supplies a rule name, finding field, left field, right field, comparison operator, and comparison type.

Operators include equality, inequality, and ordered comparisons. Comparison type can be numerical, valid ISO dates, or exact text.

Example: a delivered date must be on or after the order date. A violation appears against the nominated finding field with record-level evidence.

### 28.3 Conditional requirement

**Require a field when another matches** chooses a required field, a trigger field, and a trigger value. An exact trigger match makes the required field necessary for that record.

Example: a cancellation reason is required when order status equals `Cancelled`.

### 28.4 Saved-rule list and actions

**Add relationship check** validates and adds a rule. The list shows rule names and readable conditions, with a Remove action for each entry. **Close** exits the dialog.

Numerical/date comparisons require usable, nonmissing inputs. Unsupported fields or incomplete conditional triggers produce errors rather than guessed relationships.

## 29. Configuration dialog: schema and derived metrics

### 29.1 Dialog organization

**Schema and derived metrics** contains a column-schema section and a derived-metric section, each with its own add/replace action and definition list.

Edits are assembled in the dialog. **Save definitions and run checks** applies the validated definitions; **Cancel** discards the pending dialog changes.

### 29.2 Column-schema fields

The schema section includes column, declared type, required/nonblank status, numerical minimum/maximum, and a case-sensitive allowed-value list.

Types include any, text, number, integer, date, boolean, and category.

### 29.3 Schema behavior

Examples of supported checks:

- A numerical field contains a finite ordinary number.
- An integer field has no fractional part.
- A date is a valid YYYY-MM-DD calendar date.
- A boolean is a recognized true/false or 0/1 representation.
- A numerical value is within declared bounds.
- A value is in the declared case-sensitive set.
- A required observation is present under the applicable definition.

Numerical bounds belong to numerical/integer schema types. The interface does not treat a text minimum as a numerical constraint without the appropriate type.

### 29.4 Add / replace column check

One schema definition is supported per column. Adding another definition for the same column replaces that column's prior draft definition rather than creating contradictory duplicate schema entries.

The definition list shows type, required/optional status, bounds, and allowed-value count. Remove deletes a definition from the draft.

### 29.5 Derived-metric fields

The metric section exposes:

- Name.
- Target column.
- Left source.
- Operation: difference, sum, product, or ratio.
- Right source.
- Multiply-result factor.
- Decimal places, 0–8.
- Absolute tolerance, nonnegative.

### 29.6 Formula interpretation

The resulting formula is the chosen two-source operation multiplied by the factor, rounded to the chosen precision, and compared with the current target using absolute tolerance.

Examples include profit from revenue minus cost, revenue from quantity times unit price, and percentage rates from a ratio times 100.

### 29.7 Definition validation

The target cannot be one of its own inputs. Only one derived-metric definition is supported per target. Dependency cycles are rejected.

Factor, tolerance, and precision must be valid values. Zero denominators, absent inputs, or nonfinite results create unavailable-calculation evidence rather than an artificial target value.

### 29.8 Definition versus treatment

Saving a formula starts/checks findings. Recalculating the target is a subsequent review decision with a scoped preview and approval.

## 30. Configuration dialog: manual correction

### 30.1 Purpose

Manual correction gives the analyst a reviewed correction path when no automatic finding represents the intended record set.

### 30.2 Controls

The dialog contains a column selector and **Source row IDs** input. Leaving the row-ID input blank selects the current working population for the newly created manual finding.

Entered IDs must identify existing working records. Invalid identities produce feedback before a review is created.

### 30.3 Begin correction review

This creates an analyst-selected review item and opens the normal interpretation/treatment/preview/approval workflow. It does not directly edit cells from the dialog.

The manual operation set includes retention, replacement, normalization, text/case mapping, number/date parsing, scaling, mean/median and strict group-median estimates, bounds, and record removal.

The newer group-wise/KNN methods are exposed on the eligible numerical missing/candidate paths; the manual-correction selector is not a universal menu containing every capability.

## 31. Project saving, backups, and restoration

### 31.1 Keep your work

With a dataset loaded, the Dataset page shows **Keep your work**, an unsaved/saved status badge, project identity where available, and persistence actions.

Saving is explicit. Importing a CSV or making a decision should not be assumed to create a durable browser project automatically.

### 31.2 Save project dialog

The dialog has a project-name field, an explanation of included review data, a save-error area, and three actions:

- **Save project:** save/update the active browser-local project.
- **Save as new project:** create another saved project identity.
- **Cancel:** exit without saving.

During the storage operation, save controls are temporarily disabled to avoid overlapping saves.

### 31.3 What a project preserves

A project includes source and working data, active findings, approved decisions, audit events, rules, reviewed value meanings, available treatment metadata, fill provenance, dataset purpose, and basic workspace/view information.

Approved semantic decisions are durable within the saved project. Cached or in-flight AI advice is not a substitute for a saved approval.

### 31.4 Saved projects library

Each library entry identifies its name, dataset filename, working-row count, and update time. The list supports **Open** and **Delete saved copy**.

The library has loading, empty, and storage-error states. Opening a project replaces the current active session after validation; the UI advises preserving current work before switching if needed.

Deleting a saved copy removes that browser-local stored project. It is not a treatment that removes dataset rows.

### 31.5 Browser-local scope

Saved projects belong to the current browser/site origin. They do not automatically appear on another device, in another browser profile, or on the local-development origin.

The website does not present this storage as cloud sync or a user-account workspace.

### 31.6 Download project backup

This creates a portable JSON backup with the review state needed for restoration. It is the appropriate artifact for carrying a review between devices/origins.

Unlike a cleaned CSV, it retains the source dataset and decision history needed for reversible review.

### 31.7 Import project backup

The importer validates the project before replacing the active workspace. It checks source/working records, row identities, finding/history references, supported rules, reviewed classifications, and similar-fill provenance.

It also checks that the working dataset is consistent with its remaining approved decisions. A corrupt or incompatible backup does not silently become the new workspace.

Project/rule JSON imports are limited to 50 MiB.

### 31.8 Resume fidelity

Restoration preserves approved work and basic view information. It should not be interpreted as an exact replay of every unfinished treatment field, representation-strip cursor, AI request, or temporary preview.

Guided review drafts and ephemeral AI calculations can be reset/recomputed. The durable distinction is between confirmed decisions and transient in-progress UI state.

### 31.9 Storage failure recovery

When browser storage is unavailable, blocked, or exhausted, the site reports that condition. A downloadable project backup remains the alternative preservation path.

## 32. Reusable rule libraries

### 32.1 Entry points

**Configure & reuse review rules** on Dataset provides schema/metric editing, the reusable-rule library, rule-file download, and rule-file import.

### 32.2 Save current definitions

The rule library has a rule-set-name field and **Save current definitions**. It stores reusable definitions separately from the project data.

Definitions can include schema, metrics, column policies, business relationships, saved outlier rules, and duplicate comparison rules in the supported rule configuration.

### 32.3 Apply definitions

Applying a saved rule set validates its referenced columns and supported parameters, replaces the active definitions, and reruns relevant checks.

It does not apply the treatments that might later resolve those findings. The analyst still reviews the resulting evidence and approves corrections separately.

### 32.4 Import/export and removal

Rule definitions can be downloaded/imported as a dedicated JSON artifact. Library entries support applying and deleting the saved definition set.

Unknown columns, invalid bounds, unsupported methods, and metric cycles are rejected. Removing a library entry does not undo a previously approved physical treatment.

## 33. Finding catalogue and detection behavior

### 33.1 Blank or confirmed missing observations

Physical blanks and analyst-confirmed missing representations produce missing-value findings. Numerical roles can expose numerical filling methods; other roles receive appropriate retention/replacement paths.

Not-applicable and legitimate per-record decisions are distinguished from confirmed missing observations in the relevant reviewed paths.

### 33.2 Possible missing-value tokens

Token-like strings such as NULL/NA forms, question marks, and other supported unknown/sentinel-like text are screened for contextual review. Screening does not rewrite the strings or establish their meaning.

The one-by-one reviewer is the analyst-facing path for resolving those candidates.

### 33.3 Zero, negative, and sentinel-like numbers

Numerical screening includes zero, negative values, and selected large sentinel-like codes. It also operates on an all-nonpositive numerical column; the absence of positive values does not make such screening unavailable.

These remain meaning-review candidates. A negative temperature, financial loss, or zero count can be legitimate.

### 33.4 Numerical-format candidates

Nonblank numerical-looking representations that cannot be parsed under the ordinary convention can require explicit separator, currency, percentage, or role decisions.

A type inference does not silently convert them into numbers or treat an unparsed string as zero.

### 33.5 Spacing and category variants

Surrounding/repeated whitespace and formatting-equivalent labels can create candidate findings. The analyst explicitly reviews the exact transformation or mapping before unifying stored labels.

The marketing sample also has a targeted Paid Social variant check. The application includes both general representation checks and some named-domain sample checks.

### 33.6 Date-format candidates

Ambiguous day/month representations and invalid dates produce review evidence. The analyst selects an explicit interpretation or correction; invalid calendar dates remain blocked under a simple parsing proposal.

### 33.7 Percentage-scale checks

Selected rate-field checks identify values using whole-percentage scale where comparable observations use decimals. An explicit scaling treatment can resolve the scoped representation after review.

This is not automatic unit detection for every arbitrary numerical column.

### 33.8 Potential outliers

Eligible numerical measurements receive IQR screening, with analyst-configurable alternative definitions. Declared identifiers do not become measurements merely because their strings contain digits.

Flagged outliers can be retained, corrected, capped to explicit bounds, or removed through supported reviewed operations. The flag itself performs none of those actions.

### 33.9 Duplicate records and business keys

Exact-row duplicate detection is available automatically. Composite business-key review requires a chosen definition and can reveal conflicting non-key fields.

Survivor and merge treatments distinguish cell changes from removed records and require explicit scope/conflict decisions.

### 33.10 Cross-column and configured-rule findings

The system includes a targeted clicks-versus-impressions check plus analyst-authored schema, relationship, conditional-required, and metric checks.

Configured checks provide record-level evidence based on their definitions. They do not infer every domain relationship automatically from column names.

## 34. AI behavior, progress, and failure states

### 34.1 Automatic start

AI interpretation begins after a successful import. Local evidence and profiling provide the request context first; the analyst does not need to initiate the entire first interpretation manually.

### 34.2 Bounded evidence

Requests contain summary evidence rather than complete raw rows: column identity/meaning, counts, selected exact representations, distribution statistics, and rule context.

Each candidate summary contains at most ten value groups, and requests contain at most six candidate summaries. Representation review can cover additional groups through further bounded batches rather than silently stopping at the first ten values.

### 34.3 Independent evidence IDs

Each returned value assessment must refer to its supplied representation evidence. The system checks unsupported IDs, duplicates, completeness where required, score bounds, and permitted meanings.

A model cannot transfer a NULL assessment to zero merely by returning a plausible explanation with an unrelated evidence reference.

### 34.4 Progress presentation

The analysis banner shows completed/total progress and changes between running, ready, stale, cancelled, and unavailable states.

For large representation sets, the progress can count bounded candidate-summary batches rather than one unique column per displayed unit. Individual completed scores are visible in the value strip as results arrive.

### 34.5 Cancellation and stale results

Cancel stops the active interpretation process. Importing another dataset or changing relevant context invalidates the earlier request's applicability.

Late results for replaced data do not become executable decisions for the new workspace. Existing confirmed decisions are a different concept from transient model advice.

### 34.6 Unavailable/provider-error state

Configuration failures, provider errors, timeouts, rejected structured responses, or exhausted request limits are reported. Local checks, manual interpretation, comparison, and explicit treatments remain available.

The UI does not create fake confidence percentages when no per-value assessment was returned.

### 34.7 Request limits and optional verification

The service applies configured request limits and timeouts; the documented default request limit is ten valid AI attempts per hour under the current protection mechanism, though deployment configuration can change it.

Optional verification may be required by the deployed configuration. It affects AI requests, not the availability of local data inspection and deterministic analysis.

### 34.8 What AI output authorizes

AI output authorizes no physical change. It can supply interpretation rankings, per-value missingness assessments, explanations, and supported draft proposals.

The actual authority to classify or treat rests with the analyst's explicit confirmation/approval and the associated exact scope.

## 35. Responsive layout, accessibility, and visual behavior

### 35.1 Visual system

The UI uses a daylight analytical style: navy navigation, white task surfaces, a cool light background, blue selection/progression, green final-treatment approval, and amber exception emphasis.

The primary interface typeface is Source Sans 3. Numerical tables and metrics use aligned/tabular numerals for comparison. Source representations receive a distinct code-like value treatment where useful.

### 35.2 Desktop organization

Desktop provides a persistent navigation rail, dataset top bar, wide task surfaces, and a side-by-side findings queue/review workspace.

The queue and table regions have their own scrolling where appropriate. The footer remains after the review content rather than floating over record tables.

### 35.3 Tablet and narrower layouts

The navigation rail and page gutters contract at intermediate widths. The guided queue moves above the task surface around the narrower desktop/tablet range and becomes a horizontally navigable finding list.

At mobile widths, navigation becomes a horizontal top area. Some secondary top-bar actions/badges are hidden to conserve space, while the page-specific primary actions remain available.

### 35.4 Mobile analytical units

Analytical headings stack; forms become one-column arrangements; similarity-field checklists become one column; action groups wrap; summary metrics reduce their column count.

Wide tables scroll locally instead of forcing the entire page beyond the viewport. Representation chips form a horizontal scrolling strip so exact values and confidence details remain readable.

### 35.5 Scroll boundaries

Different boundaries serve different purposes:

- Spreadsheet scrolling keeps record inspection manageable.
- Queue scrolling keeps the selected finding accessible.
- Bounded analytical tables retain a readable width.
- Provenance tables show substantial evidence without stretching every review indefinitely.
- Long dialogs can scroll internally.

Display bounds do not redefine the approved population. The interface explicitly distinguishes first-100 displays from full-scope counts.

### 35.6 Keyboard interaction

Main navigation, stage labels, representation chips, buttons, radios, selectors, disclosures, and dialog controls use keyboard-operable controls.

Highlighted spreadsheet cells support Enter/Space activation. Visible focus outlines identify the active control. The stage banner retains focus after rendering, and interpretation radios preserve focus through relevant refreshes.

### 35.7 Non-color cues

Selected states, finding icons, readable type labels, counts, legends, and evidence descriptions supplement color. Finding categories are not conveyed only through a red/green distinction.

### 35.8 Feedback accessibility

Status banners, inspection regions, errors, and transient feedback provide appropriate live/status presentation. Field labels identify their purpose; examples in placeholders supplement rather than replace those labels.

The product has concrete keyboard/responsive provisions, but this report does not claim a formal accessibility conformance certification.

## 36. End-to-end operational examples

### 36.1 Review NULL, then N/A, then legitimate zero

1. Import a column containing NULL, N/A, zero, negatives, and observed positive values.
2. Open its token/zero-negative finding.
3. Wait for or request contextual per-representation assessments.
4. Select NULL, choose Missing observation, and confirm.
5. Observe that NULL remains stored while its meaning becomes missing.
6. Review N/A independently and confirm or reject its missingness interpretation.
7. Select zero in the children-count context and keep it as valid.
8. Skip an unresolved negative count rather than treating invalidity as proof of a missing-value convention.
9. Open confirmed missing values for comparison or treatment.
10. Preview and approve a physical fill only when its exact scope and references are appropriate.

The outcome can contain reviewed missing NULL/N/A forms, a valid observed zero, and unresolved negative candidates simultaneously.

### 36.2 Explain delivery-day missingness in the sales sample

1. Load Sales orders.
2. Open Missing delivery_days.
3. Compare columns in Understand.
4. Inspect channel missing rates and quantity group statistics.
5. Compare quantity while holding channel similar.
6. Inspect both the weighted verdict and the individual band medians.
7. Optionally request an AI explanation of the measured results.
8. Review a channel-group fill in Treat & scope.
9. Inspect the per-cell band sources and fallback count.
10. Approve, review history, and roll back if needed.

The bundled fixture demonstrates approximately 32% missingness for Distributor, about 6% for Online, and none for Retail store delivery days. Quantity medians are 9 versus 2 overall, while Distributor medians are 12 versus 12 within that channel. Group-wise delivery-day fills are approximately 4.3 for Distributor and 4.5 for Online, with no Retail blanks to fill in that example.

### 36.3 Correct an ambiguous date with exceptions

1. Open a date-format finding.
2. Review source representations and select a date interpretation.
3. Scope the intended records.
4. Inspect normalized dates in Preview.
5. Read blocked-record reasons for invalid calendar dates.
6. Correct the definition or explicitly choose the valid subset.
7. Approve only the eligible reviewed outcomes.

An impossible date remains unresolved rather than being rolled into another month as if it were valid.

### 36.4 Review conflicting business-key duplicates

1. Open Duplicate keys from the Review configuration tools.
2. Choose Composite business key and its fields.
3. Inspect matching full records and conflicts.
4. Choose retention, a survivor policy, or complementary merging.
5. Acknowledge non-key conflicts where required.
6. Preview survivor patches and removed-record counts separately.
7. Approve and inspect the decision.
8. Roll back to restore appropriate source records while retaining other active approvals.

### 36.5 Correct a derived metric after an input treatment

1. Define profit as revenue minus cost, with explicit precision/tolerance.
2. Review and approve an appropriate cost correction.
3. Revisit resulting profit discrepancies.
4. Preview the target-only recalculation from current working inputs.
5. Approve the profit correction separately.

This preserves analyst review of dependent effects rather than automatically propagating a whole correction chain.

### 36.6 Save, transfer, and resume a review

1. Save the current project locally or download a backup.
2. Open Saved projects to resume in the same browser/site, or import the backup elsewhere.
3. Confirm restored data, active classifications, decisions, and rule definitions.
4. Recompute transient analytical/AI evidence as needed.
5. Continue reviewing, or roll back an older decision while retaining later approvals.

## 37. Current product boundaries and interpretation nuances

### 37.1 Supported workspace shape

The active product is a single-dataset CSV review workspace. It is not currently a multi-sheet Excel workbook editor, a joined-dataset modeling environment, a SQL query tool, or a free-form spreadsheet formula editor.

### 37.2 Editing surface

Explore is for inspection and navigation. Data changes use reviewed treatment controls; there is no general inline cell-editing grid presented as the main correction interface.

### 37.3 Branching alternatives

Parallel versioned correction branches and a branch comparison/history interface are parked rather than part of the current UI. The working version is cumulative, with a proposed preview and reversible active decisions.

### 37.4 No-pattern fixture nuance

The current sales tenure fixture does not satisfy the specified no-pattern rule: measured unit-price and quantity standardized mean differences are approximately 0.256 and 0.234, both moderate under the 0.2 threshold.

The UI therefore reports the measured results rather than forcing “no pattern.” No-pattern behavior is separately verified with balanced evidence.

### 37.5 Physical versus semantic completeness

Blank meters and CSV exports describe physical representations. Missingness comparisons and reviewed analytical populations can also use semantic classifications. They answer related but different questions.

### 37.6 Not-applicable analytical nuance

The analytical missingness mask currently excludes missing/not-applicable classified values from ordinary observed numerical statistics. Consequently, some comparison grouping reflects unavailable observations more broadly, while the treatment-finding path excludes not-applicable records from ordinary confirmed-missing correction eligibility.

The decision history preserves those meanings separately. A comparison result should not be read as if “unknown” and “not applicable” had been merged into one identical business concept everywhere in the product.

### 37.7 Rule-path specificity

Column-role inference, parsing policy, schema checks, relationship checks, and metric formulas each have specific behavior. Declaring a number/date role is not the same as physically parsing every stored value or guaranteeing that every check accepts every formatted representation.

Explicit parsing/correction previews resolve representations; definitions express expectations and context.

Required-schema and conditional-required checks evaluate physical blanks and
explicitly declared missing tokens. A source-preserving classification is not
the same as physically blanking a value in every rule checker. Metric calculation
and the reviewed analytical paths also consult recorded meanings. The analyst
should inspect each rule's evidence rather than assume every count/check uses an
identical definition of absence.

### 37.8 AI reliability and validation

The site validates supported structure, evidence references, score bounds, and proposals. It does not turn model confidence into statistical calibration or guarantee a domain interpretation is correct.

Incorrect-value suggestions and missingness suggestions can coexist. Analyst choice, source visibility, exact scope, and reversibility remain central.

### 37.9 Persistence limits

There is no account-based project cloud sync, team collaboration, or automatic transfer of browser-local projects between origins. Portable backups provide the transfer mechanism.

An unfinished draft, skipped-value cursor, or in-flight request is not the same kind of durable artifact as an approved decision.

### 37.10 Scale and responsiveness

Background analytical checks have been exercised on a 50,000-row workload while retaining browser responsiveness. The sample-size analytical benchmark has also met the specified under-200ms budget in verification runs.

These are verified workloads, not an unlimited-data guarantee. Browser memory, table size, selected KNN dimensions, missing-population size, and reference populations still affect interaction/calculation time.

### 37.11 Display sampling

The first 100 records/fills or first 30 detailed exceptions in a UI unit are presentation bounds. They are not permission to assume that only those displayed records were reviewed or approved.

The full counts and persisted source traces identify the true scope.

## 38. Capability and state-change reference matrix

| UI operation | Reads or recomputes evidence | Records a decision | Physically edits/removes records | Primary durable output |
|---|---|---|---|---|
| Open CSV / select sample | Yes | No | Establishes a new source/workspace | Active dataset; project if explicitly saved |
| Spreadsheet search / flagged-only | Changes visible inspection set | No | No | Basic view state where saved |
| Select cell / rail marker | Reveals record evidence | No | No | No new decision |
| Select finding / stage label | Reveals or validates review state | No | No | Active review state |
| Refresh AI analysis | Recomputes interpretation advice | No | No | Transient/cached advice |
| Assess this value | Recomputes one representation's advice | No | No | Per-representation assessment |
| Select a meaning radio | Stages analyst interpretation | Not yet | No | Draft choice |
| Confirm & next value | Checks exact source-preserving scope | Yes | No | Reviewed meaning and available assessment |
| Skip for now | Advances review selection | No | No | Unresolved representation |
| Compare columns | Computes missing/present evidence | No | No | Analytical result |
| Compare within groups | Computes held evidence | No | No | Band results and verdict |
| Explain top pattern with AI | Interprets aggregate evidence | No | No | Explanation and optional draft proposal |
| Review proposed treatment | Configures a treatment draft | No | No | Proposed parameters/scope |
| Save column/rule definitions | Reruns applicable checks | Not a treatment decision | No | Definitions and resulting findings |
| Save outlier definition only | Updates finding membership | No treatment approval | No | Saved review definition |
| Generate treatment preview | Computes exact proposed effects | No | No | Temporary preview/provenance |
| Approve retention | Checks reviewed scope | Yes | No | Active no-change decision |
| Approve replacement/fill/parsing/map/cap | Checks current valid preview | Yes | Yes, scoped cell changes | Working values and decision history |
| Approve removal/deduplication | Checks current valid preview | Yes | Yes, scoped record removal and possible merge patches | Working population and history |
| Approve metric recalculation | Checks target/source definition | Yes | Yes, target-only changes | Updated target values and history |
| Rollback | Rebuilds around remaining approvals | Records a rollback event | Restores/removes effects as appropriate | Current working state and audit effects |
| Save project | Captures current review state | Does not create a cleaning approval | No new treatment | Browser-local project |
| Download/import project backup | Captures or validates/restores a review | Preserves existing decisions | Restores backed-up working state | Portable review artifact |
| Apply reusable definitions | Rechecks current data | No automatic treatment decision | No | Active rules and new findings |
| Export cleaned CSV | Reads current working data | No | No new treatment | Dataset CSV |
| Export quality report | Reads evidence, decisions, populations | No | No | Human-readable/structured report |
| Export decision log | Reads approval and rollback events | No | No | Structured or flat audit record |

---

## Concluding functional summary

ClearData currently combines source-preserving CSV inspection, deterministic quality findings, contextual per-value AI missingness assessments, explicit one-by-one meaning decisions, measured missingness/held comparisons, traceable statistical fills, scoped transformations, duplicate/metric review, exact previews, explicit approvals, reversible history, and portable review artifacts.

Its distinctive operational capability is that it can preserve what the source literally contained while separately recording what the analyst believes that representation means. That meaning can then inform deterministic comparisons and proposed corrections without converting all NULL-like strings, zeros, or negatives through a blanket rule.

The interface supports both a focused representation-by-representation sequence and a broader five-stage treatment sequence. The source, working population, proposed effects, approved decisions, and downloadable audit history remain separate and inspectable throughout that process.
