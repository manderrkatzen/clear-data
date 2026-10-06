# Issues Page: UI Walkthrough and Terminology Guide

The page called **Issues** is currently labeled **Review** in the sidebar, with the page heading **Review findings**. Internally, it remains the `issues` screen, so either name works when requesting fixes.

This walkthrough describes the current interface from the repository implementation. Some panels appear only for particular findings or after running a comparison.

## 1. Page orientation

On desktop, the page is arranged roughly like this:

```text
┌───────────────┬─────────────────────────────────────────────┐
│               │ Dataset name + working-version controls    │
│ Main          ├─────────────────────────────────────────────┤
│ navigation    │ Review findings                             │
│ sidebar       │ AI analysis status banner                   │
│               │ Definitions, business checks & corrections  │
│               ├──────────────┬──────────────────────────────┤
│ Dataset       │ Findings     │ Selected finding header      │
│ Explore       │ queue        │                              │
│ Review        │              │ Five-step review navigation  │
│ Decisions     │ Search       ├──────────────────────────────┤
│ Report        │ Type filter  │                              │
│               │              │ Current review step          │
│               │ Finding A    │ Evidence / interpretation /  │
│               │ Finding B    │ treatment / preview          │
│               │ Finding C    │                              │
│               │              ├──────────────────────────────┤
│               │ Closed       │ Back · Step count · Continue │
│               │ findings     │ or Approve                   │
└───────────────┴──────────────┴──────────────────────────────┘
```

The most useful distinction is:

- **Navigation sidebar:** switches between application pages.
- **Findings queue:** chooses which issue you are reviewing.
- **Review workspace:** contains the selected issue and its workflow.

On smaller screens, the findings queue moves **above** the review workspace.

## 2. Far-left sidebar: Primary navigation

This is the dark navigation area containing:

- **Dataset**
- **Explore**
- **Review**, with an open-finding count
- **Decisions**, with a decision count when available
- **Report**

A **Continue review** shortcut appears near the bottom on desktop.

| What you see | Useful terminology |
| --- | --- |
| Whole dark sidebar | Primary navigation sidebar |
| Review button | Review navigation item |
| Number beside Review | Open-findings count badge |
| Highlighted page button | Active navigation state |
| Continue review shortcut | Continue-review shortcut |

**Example request:**

> The open-findings count badge in the primary navigation is not updating after approval.

## 3. Top horizontal bar: Dataset topbar

Above the page content, this identifies the dataset you are working on.

It contains the dataset name and, depending on state and screen width, working-version information and actions such as undo. This bar belongs to the overall application shell rather than to one particular finding.

**Useful terms:**

- Dataset topbar
- Dataset name
- Working-version badge
- Unresolved-findings badge
- Undo-last-change action

**Example request:**

> Keep the dataset name visible in the topbar when I scroll through a long review.

## 4. Under “Review findings”: AI analysis status banner

This horizontal banner explains what the AI is currently doing. Its heading changes with the analysis state, for example:

- **AI interpretation in progress**
- **AI suggestions ready**
- **AI-assisted interpretation**

It may show a progress count such as `12 / 20 findings interpreted`.

The action changes between **Cancel AI review** and **Refresh AI analysis**.

This area reports the status of the broader AI interpretation process. It is separate from the AI explanation shown inside an individual finding.

**Example request:**

> In the AI analysis status banner, show which findings failed instead of only showing the overall progress count.

## 5. Expandable setup row: Definitions and checks disclosure

The visible heading is **Definitions, business checks & manual corrections**. Clicking it expands a toolbar of configuration actions.

“Disclosure” means an area you can expand and collapse. “Expandable setup section” is also clear terminology.

| Control | What it opens or does |
| --- | --- |
| **Column definitions** | Defines column meaning, analytical role, units, missing tokens, and parsing policies |
| **Business relationships** | Defines comparisons between fields or conditional requirements |
| **Schema / metric rules** | Defines types, required values, bounds, allowed categories, and derived calculations |
| **Duplicate keys** | Configures how duplicate records are identified |
| **Manual correction** | Starts a review for an analyst-selected column and source rows |
| **Dataset context →** | Takes you to Dataset to describe the dataset’s purpose |

These definitions influence checks and interpretation. Changing a definition does not itself rewrite cells.

**Example request:**

> Inside the definitions and checks disclosure, make Column definitions and Schema / metric rules easier to distinguish.

## 6. Narrow list beside the main panel: Findings queue

This list is headed **[number] open findings**. It is your issue-selection panel.

### 6.1 Queue header

The header contains:

- Total open-findings count
- A note about recommendation-rank sorting
- **Search columns or findings**
- **All finding types** dropdown

Search matches column names, finding labels, and finding types. The type dropdown filters which findings appear in the queue.

These are **queue filters**. They do not define which dataset rows a treatment changes.

### 6.2 Finding items

Each clickable item shows:

- Column name
- Finding label
- Matching-record count
- **AI alternatives ready** or **Local evidence**

The selected item gets a highlighted background. Call these **finding items**, **queue items**, or **finding cards**.

### 6.3 Closed findings

An expandable section below the open list summarizes closed findings and provides a route to **Decisions** for inspection or rollback.

Closed does not necessarily mean cells were corrected: a finding can be reviewed and accepted without changing its values.

**Example requests:**

> In the findings queue, keep the selected finding visible when the list reorders.

> The queue’s finding-type filter should use clearer labels.

> The matching-record count on each finding item is hard to scan.

## 7. Large panel: Selected-finding review workspace

After selecting a finding, the main panel becomes its review workspace.

### 7.1 Selected-finding header

At the top, you see:

- Finding title
- Column name
- Matching-record count
- **Leave open** action

**Leave open** exits the active review while keeping the finding unresolved. Call this the **selected-finding header**, distinct from the page header.

### 7.2 Five-step navigation

Immediately below is the **review stepper**:

```text
1 Understand → 2 Interpret → 3 Treat & scope → 4 Preview → 5 Approve
```

A **stepper** is navigation through a multi-step workflow. The current step is highlighted.

### 7.3 Current-step content

The body underneath changes as you move between steps. Call this the **review stage** or **current-step panel**.

**Example requests:**

> In the selected-finding header, make the column name more prominent.

> The review stepper should explain why I cannot advance to Preview.

## 8. Step 1: Understand — inspect the evidence

For ordinary findings, this starts with **Finding details**.

### 8.1 Finding summary

A short explanation describes what was detected and why it needs review.

**Term:** finding summary.

### 8.2 Source-value groups

The page groups matching records by their stored value. Each group shows:

- Exact value, or `(blank)`
- Number of records with that representation
- **Scope to this group**

For example:

```text
"N/A"       18 records       Scope to this group
"NULL"       9 records       Scope to this group
```

**Terms:** source-value groups or value-representation groups.

Selecting **Scope to this group** narrows the review draft to those records and moves into interpretation.

### 8.3 Original-versus-working distribution

For numerical columns, a histogram compares **Original source** and **Cumulative working**. Supporting metrics include mean, median, and parsed-value counts.

For nonnumerical columns, the comparison can show label and blank counts instead of a numerical histogram.

**Terms:** distribution comparison, histogram, chart legend, comparison metrics.

### 8.4 Matching source records

The expandable **Inspect matching source records** section shows record-level evidence, including source row IDs and **View row** actions.

**Term:** matching-source-records table.

### 8.5 Finding-specific evidence

Some issue types add controls here:

- **Outliers:** outlier-definition controls and **Inspect numerical relationships**
- **Duplicates:** comparison mode and business-key fields
- **Configured rules:** row-level rule evidence

**Example requests:**

> In Understand, place the source-value groups above the finding summary.

> The original-versus-working histogram needs clearer axis labels.

## 9. Missing-value findings: Missing vs present

For applicable missing-value findings, Understand adds a dedicated analytical section called **Missing vs present**.

This investigates whether rows with missing target values differ from rows where the target is present.

### Walk through it

1. Click **Compare columns**.
2. Inspect the ranked comparison table.
3. Select a comparison column.
4. Review its detailed statistics or category rates.
5. Use the held-comparison controls to compare within groups.
6. Request an AI explanation of the computed evidence if needed.

| Area | Useful terminology |
| --- | --- |
| Whole section | Missingness comparison panel |
| Ranked list of other columns | Ranked comparison table |
| Selected column’s results | Comparison detail panel |
| Missing/present bars | Missing-versus-present histogram |
| Comparing inside groups | Held comparison or stratified comparison |
| Numeric grouping ranges | Numeric bands |
| AI explanation of results | Analytical AI explanation |

For numerical comparisons, the current UI uses **Cliff’s delta** for ranking and direction, with additional statistical evidence.

**Example requests:**

> In Missing vs present, explain the effect-size column in plain language.

> The held-comparison controls should make the comparison column and grouping column easier to distinguish.

## 10. Step 2: Interpret — decide what the finding means

The ordinary interpretation screen has four main areas.

### 10.1 Top AI suggestion

Shows the highest-ranked interpretation, including:

- Suggested meaning
- AI provider attribution
- Model confidence
- Explanation
- Assumptions
- Recommendation rank

**Term:** top AI interpretation card.

The rank is model-assessed, not a calibrated probability.

### 10.2 Alternative interpretations

An expandable section lets you compare other explanations.

**Term:** alternative-interpretations disclosure.

### 10.3 Your interpretation

Radio buttons let you record your own judgment about the scoped records. Available meanings depend on the finding.

**Term:** analyst interpretation selector.

### 10.4 Copilot follow-up

The **Ask the copilot about this finding** disclosure contains a question input and an action to request an interpretation.

**Term:** finding-level copilot follow-up.

**Example request:**

> In Interpret, visually separate the AI suggestion from my interpretation selector.

## 11. Special flow: Review value meanings

For possible missing tokens and sentinel values—such as `NULL`, `N/A`, or suspicious zero/negative representations—the first two steps use a specialized interface headed **Review value meanings**.

### Walk through it

1. Pick a value from the horizontal **representation strip**.
2. Inspect its record count and AI missingness assessment.
3. Choose **Missing observation**, **Keep as a valid value**, or **Not applicable**.
4. Click **Confirm & next value**, or **Skip for now**.
5. Continue to comparison and treatment for confirmed missing observations.

**Useful terms:**

- Value-meaning review panel
- Representation strip
- Selected representation
- Per-value AI assessment
- Value-meaning radio group
- Confirm-and-next action
- Skip-value action

This confirmation records meaning while preserving the stored value: **zero cells are rewritten by the classification itself**.

**Example request:**

> In the representation strip, keep skipped values visible but clearly distinguish them from unreviewed values.

## 12. Step 3: Treat & scope — choose the operation and affected rows

This step answers two separate questions: **What should happen?** and **Which matching records should it happen to?**

### 12.1 Treatment selector

The **Treatment** dropdown chooses the operation. Depending on the finding and interpretation, options may include retaining values, replacement, numerical fills, normalization, parsing, mapping, capping, duplicate handling, or row removal.

**Term:** treatment selector.

### 12.2 Treatment parameters

Additional inputs appear for the selected operation, for example:

- Replacement value
- Decimal places
- Conversion factor
- Date format
- Number format
- Bounds
- Grouping field
- Duplicate survivor policy

**Term:** treatment-parameter fields.

### 12.3 Treatment scope

Under **Apply only to these matching records**, choose:

- All records belonging to this finding
- Selected source row IDs
- Records matching a condition

Conditional scope adds a field, operator, and condition value.

**Terms:** treatment-scope selector and conditional-scope builder.

### 12.4 Similar-row fill controls

Group-wise or KNN fills add:

- Hold or similarity columns
- Reference statistic
- Minimum reference count or neighbour count
- Numeric bands where applicable

**Term:** similar-row treatment controls.

### 12.5 Candidate treatment comparison

For supported findings, **Compare candidate treatments (2–4)** lets you compare alternative drafts on the same scope.

**Term:** candidate-treatment comparison panel.

**Example request:**

> In Treat & scope, make the treatment parameters and scope controls look like separate sections.

## 13. Step 4: Preview — inspect the exact proposed impact

### 13.1 Preview summary strip

Four counters summarize:

- **Scoped records**
- **Cells changing**
- **Whole rows removed**
- **Blocked records**

**Term:** preview summary strip.

### 13.2 Exceptions

Conditional warning sections show records that cannot be treated and new configured-constraint violations. They may include explicit acknowledgement or valid-subset controls.

**Terms:** blocked-record exceptions and constraint-violation warnings.

### 13.3 Three-way distribution comparison

The chart now compares **Original source**, **Cumulative working**, and **Proposed preview**.

**Term:** original/working/proposed distribution comparison.

### 13.4 Exact record-level preview

A table shows scoped source rows, current values, and proposed values.

**Term:** exact record-level preview table.

### 13.5 Supporting impact panels

Depending on the treatment and configuration, you may also see:

- **Fill sources:** provenance for proposed fills
- **Impact by band:** effects within groups
- **Business KPI impact:** changes to configured business measures
- **Dependent metric follow-ups:** calculations needing a separate review
- **Inspect affected and present records:** a broader inspection lens

The affected-and-present record lens also appears in other review steps for supported findings. Its inspection settings do not broaden treatment scope.

**Example requests:**

> In Preview, show the current and proposed values side by side more clearly.

> In Fill sources, make global-median fallbacks easier to identify.

## 14. Step 5: Approve — finalize the decision

The approval stage retains the proposed-impact information for final review and provides an analyst-rationale field.

The main action is **Approve this decision**.

**Useful terms:**

- Approval stage
- Analyst rationale field
- Final approval button
- Approved-decision confirmation banner

After approval, the decision can be inspected or rolled back in **Decisions**.

**Example request:**

> In Approve, put the rationale field closer to the final approval button.

## 15. Bottom of the workspace: Review action footer

This contains:

- **← Back**
- **Step X of 5**
- **Continue →**
- **Review approval →** at Preview
- **Approve this decision** at the final step

The footer sits after the content in normal page flow.

**Terms:** review action footer or step-navigation footer.

**Example request:**

> The review action footer is too far below the evidence on long findings.

## 16. A simple format for requesting fixes

Use:

> On Review → [step] → [section], when [action/state], [problem]. I want [expected result].

For example:

> On Review → Understand → Missing vs present, after I select a comparison column, the results take up too much vertical space. I want the statistics and histogram arranged side by side on desktop.

Or:

> On Review → Treat & scope → Treatment scope, selecting source row IDs is cumbersome. I want to select rows from the record table.

The core vocabulary to remember is **findings queue**, **selected-finding header**, **review stepper**, **review stage**, **treatment scope**, **preview summary**, **record-level preview**, and **review action footer**. Those names identify the major areas unambiguously.

## Implementation reference

| File | Relevant responsibility |
| --- | --- |
| `index.html` | Navigation sidebar and dataset topbar |
| `review-ui.js` | Findings queue, review workspace, five-step content, and configuration dialogs |
| `review.js` | Review steps, drafts, interpretations, and approval logic |
| `value-review.js` | Per-representation value-meaning review |
| `analytics.js` | Missingness comparisons, similar-row controls, and fill provenance |
| `capabilities.js` | Record lenses, candidate comparisons, band impact, and KPI/dependency impact |
| `review.css` and `design-system.css` | Review layout and visual styling |
