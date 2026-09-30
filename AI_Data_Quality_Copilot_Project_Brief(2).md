# AI Data Quality Copilot

## Authoritative Product and Interface Specification

**Document purpose:** This is the primary product brief for rebuilding the application. It defines what the product does, how users move through it, what each screen contains, and which interface behaviors are required.

**Product type:** An AI-assisted, human-controlled data-cleaning application for CSV and tabular data.

**Primary user:** A business analyst who needs to inspect, understand, correct, and document data-quality problems without manually searching through every value.

**Core workflow:** **Data → View → Issues → Changes → Report**

---

## 1. Authoritative Interpretation

This product is a working data-cleaning application. It is not a fictional company portal, project-management system, social workspace, or static SaaS dashboard.

The interface must focus on the dataset itself. The user opens or connects data, inspects it in a spreadsheet-style view, reviews issues with analytical evidence, approves corrections, reviews the change history, and exports a cleaned dataset and report.

The application must not invent:

- Fake users, names, avatars, or employee roles.
- Fake organizations or teams.
- User profiles when authentication is not actually required.
- A project selector merely to make the interface resemble enterprise software.
- Notifications, comments, mentions, or collaboration features that do not exist.
- Decorative “recent activity” feeds.
- Fictional timestamps or coworker actions.
- Marketing claims inside the working interface.
- Features that appear clickable but do not perform a real product function.

The application may use a realistic sample CSV and simulated incoming-data batch for demonstration. These must be presented as sample data or a demo workflow, not as fake users or pretend workplace activity.

---

## 2. Product Goal

The product helps a user answer:

1. What problems exist in this dataset?
2. Where are those problems located?
3. Why was each value or pattern flagged?
4. What corrections are possible?
5. How would each correction affect the data?
6. Could the correction affect related columns or analytical conclusions?
7. What changes have already been approved?
8. Can an approved change be reversed?
9. Is the dataset ready to export and use?

The product should reduce manual scanning while preserving analytical judgment. It should not silently “clean” the dataset. Detection can be automated, but consequential changes remain under the user’s control.

---

## 3. Core Product Principles

### 3.1 Dataset first

The data table, flagged cells, distributions, affected records, and changes are the primary content. Decorative dashboards and generic copy must not push the dataset out of view.

### 3.2 Human-controlled corrections

AI and analytical routines propose corrections. The user selects and finalizes them.

### 3.3 Explain before changing

Every proposed correction must show:

- What was detected.
- Why it was detected.
- Which records are affected.
- What the possible corrections are.
- What changes if an option is selected.

### 3.4 Preserve the original

The original dataset remains available. Approved corrections apply to a working version.

### 3.5 Make changes reversible

Every finalized correction appears in **Changes** and can be inspected. Reversal or rollback must be available where it is safe.

### 3.6 Use AI where context matters

Standard rules and statistics should detect objective problems. AI should explain ambiguity, interpret context, propose semantic mappings, translate plain-language requirements into reviewable rules, and summarize findings.

### 3.7 Do not confuse unusual with incorrect

An outlier is not automatically an error. The product must allow the user to mark a flagged value as valid.

---

## 4. Information Architecture

The permanent left navigation contains exactly five primary destinations:

1. **Data**
2. **View**
3. **Issues**
4. **Changes**
5. **Report**

Do not add a separate primary navigation item for Dashboard, Projects, Columns, Rules, Compare, History, Export, Users, or Settings.

Those functions belong within the five destinations:

| Function | Correct location |
|---|---|
| Upload or connect data | Data |
| Incoming batches | Data |
| Spreadsheet/table inspection | View |
| Column details | View |
| Rules and detected problems | Issues |
| Alternatives and correction impact | Issues |
| Original-versus-current comparison | Changes |
| History and rollback | Changes |
| Final dashboard | Report |
| Export | Report |

The active navigation item must be visibly selected. An issue-count badge may appear next to **Issues**, and a pending-change badge may appear next to **Changes**.

The application does not need a fake user profile at the bottom of the sidebar.

---

## 5. Global Layout

The application uses:

- A compact, fixed left navigation.
- A large main work area.
- A restrained top bar for the current file name, dataset status, and context-specific actions.
- Dense but readable analytical content.

The interface should resemble a modern data-analysis workspace more than a corporate landing page.

### 5.1 Top bar

The top bar may include:

- Current filename or connected source.
- Original/working version indicator.
- Current unresolved issue count.
- Undo for the most recent eligible change.
- A context-specific primary action.

Do not fill the top bar with social, team, help, notification, or profile controls unless those functions genuinely exist.

### 5.2 Visual tone

Use a clean analytical interface:

- Legible sans-serif typography.
- Clear data grids.
- Compact controls.
- High information density without clutter.
- Neutral surfaces.
- Red for confirmed or high-priority problems.
- Amber for warnings or uncertain issues.
- Blue or another neutral accent for informational findings.
- Green for reviewed, valid, or resolved states.

Do not rely on color alone. Flagged cells and issue markers should also use icons, borders, labels, or patterns.

---

## 6. Data Screen

The **Data** screen controls how information enters the product. It has two major states.

### 6.1 Empty state

Before a dataset is loaded, the main content should prominently offer:

- **Open CSV**
- **Use sample CSV**
- **Connect live feed** or **Open live-feed demo**
- Recently used local datasets only if that is a real supported behavior

The screen should be direct. It does not need marketing copy explaining what the product is not.

### 6.2 Loaded state

After data is loaded, the Data screen shows:

- Filename or source name.
- Row count.
- Column count.
- File size if relevant.
- Import time.
- Detected column types.
- Import warnings.
- Source status.
- Replace or refresh source action.
- Open in View action.

### 6.3 Local CSV

This is the primary public-demo workflow:

1. User selects a CSV.
2. Product previews the file.
3. User confirms the header row and basic column interpretation if needed.
4. Product profiles the file.
5. User moves into View.

The original CSV must never be overwritten.

### 6.4 Sample CSV

A sample dataset must be available so a recruiter or visitor can use the application immediately. It should contain realistic quality problems rather than random fake activity.

### 6.5 Live-feed demonstration

The product should demonstrate how recurring rows could arrive from a spreadsheet or automated source. In the public demo, this may be simulated with local data.

Example message:

> **500 new rows received. 489 passed the current checks and 11 require review.**

The 11 questionable rows remain separate until the user resolves or deliberately defers them.

---

## 7. View Screen

The **View** screen is the central spreadsheet-style data inspection experience.

### 7.1 Table behavior

The View screen must contain a large, scrollable table:

- Vertical scrolling for rows.
- Horizontal scrolling for columns.
- Column headers fixed at the top while rows scroll.
- Row identifiers fixed at the left when practical.
- Column widths that can be resized.
- Tooltips or expanded display for truncated values.
- Search and filtering.
- Ability to select a column.
- Ability to select a row or cell.

The user must be able to inspect the real values, not merely a summarized dashboard.

### 7.2 Flagged cells

Cells containing detected problems are visibly highlighted.

The highlight must indicate:

- The cell has a detected or suspected issue.
- The issue has not yet been resolved.
- The user can select it for details.

Red can represent a high-priority or confirmed violation. Amber should represent uncertain or lower-risk findings. A small icon or outline should accompany the color for accessibility.

Clicking a flagged cell should:

1. Select the cell.
2. Show a concise issue preview.
3. Offer **Open in Issues**.
4. Preserve the current row and column context when the user returns.

### 7.3 Issue navigator rail

The right edge of the table contains an issue navigator rail or marker strip.

This rail represents the locations of issues throughout the dataset:

- Markers are positioned relative to affected rows.
- Multiple nearby markers may stack or cluster.
- A cluster shows a count.
- Hovering or selecting a marker previews the issue.
- Clicking a marker jumps to the affected row and cell.
- The selected issue marker is visually distinct.

When flagged cells are outside the current horizontal view:

- A left-edge or right-edge indicator shows that additional flagged columns exist off-screen.
- The indicator may show a count, such as **3 issues →**.
- Clicking the indicator scrolls to the next flagged column.

When flagged rows are above or below the current vertical view:

- Top and bottom indicators show unresolved findings outside the visible rows.
- Clicking an indicator jumps to the nearest flagged row in that direction.

This creates a “radar” for problems without forcing the user to manually scan the entire sheet.

### 7.4 View toolbar

The View toolbar may include:

- Search values.
- Filter rows.
- Filter to flagged rows only.
- Filter by issue type.
- Select column.
- Show original or current version.
- Jump to next issue.
- Open selected issue.

Do not place final export controls here. Export belongs in Report.

### 7.5 Column inspection

Selecting a column may open a compact profile panel showing:

- Column name.
- Inferred type.
- Non-null and missing counts.
- Unique-value count.
- Minimum and maximum where relevant.
- Mean and median where relevant.
- Most common categories.
- Small distribution preview.
- Number of unresolved issues.
- Open this column in Issues.

The table should remain visible while this information is shown.

---

## 8. Issues Screen

The **Issues** screen is organized by column rather than as one undifferentiated priority list.

### 8.1 Column-grouped structure

Each column is represented by a collapsible group.

Example:

    click_through_rate                         17 issues
    campaign_name                              88 issues
    launch_date                                94 issues
    customer_id                                63 possible duplicates

Groups with unresolved findings should be shown first. Each group may display:

- Column name.
- Detected type.
- Number of affected cells or records.
- Issue categories.
- Highest severity.
- Review progress.

### 8.2 Issue rows

Within each expanded column group, individual issue types or issue clusters appear as stacked rows.

Examples:

- Missing values.
- Invalid percentages.
- Mixed formats.
- Unusual numerical values.
- Possible category duplicates.
- Rule violations.

Selecting an issue expands it in place. Do not immediately send the user to an unrelated page.

### 8.3 Expanded issue workspace

An expanded issue contains:

1. A short issue summary.
2. Affected cells or example records.
3. A horizontally arranged analytical review area.
4. A decision and finalization area.

The analytical review area contains three connected sections:

- **AI Analysis**
- **Possible Fixes**
- **Impact Preview**

On a wide desktop screen, these may appear as three adjacent panels. If the available width is insufficient, the panels may operate as a contained horizontal carousel with clear previous/next controls. The entire page should not become awkwardly horizontally scrollable.

### 8.4 AI Analysis panel

The AI Analysis panel explains:

- What is missing, inconsistent, duplicated, or unusual.
- Why the issue may have occurred.
- Whether it resembles a formatting problem, entry error, system mismatch, legitimate exception, or ambiguous business definition.
- What evidence supports the interpretation.
- What is still uncertain.
- Whether business context is required.
- How many records are affected.

The AI must not claim certainty when the evidence is ambiguous.

Example:

> Seventeen click-through-rate values appear to use whole percentages while the rest of the column uses decimals. Values such as 8.4 may represent 8.4%, while most comparable records store 8.4% as 0.084. This is a likely scale inconsistency, but the affected records should be reviewed before conversion.

### 8.5 Possible Fixes panel

This panel lists appropriate treatments.

Examples:

- Keep unchanged and mark as valid.
- Replace with the mean.
- Replace with the median.
- Replace with a group-specific median.
- Standardize to the most common category.
- Map selected labels to a standard label.
- Convert a percentage scale.
- Remove an exact duplicate.
- Keep both probable duplicates.
- Correct a confirmed entry error.
- Exclude from a specific analysis without deleting the row.
- Leave missing and document the limitation.
- Enter a custom value.

Every option should show:

- Plain-language action.
- Number of affected records.
- Important assumption.
- Primary tradeoff.
- Whether the action is reversible.

Selecting an option updates the Impact Preview immediately. Selection alone does not finalize the correction.

### 8.6 Impact Preview panel

The Impact Preview provides the analytical evidence needed for a business analyst to make the decision.

The content depends on the column and issue type.

#### Numerical columns

Show relevant measures such as:

- Distribution before and after.
- Mean before and after.
- Median before and after.
- Variance and standard deviation before and after.
- Minimum and maximum.
- Quartiles and interquartile range.
- Skewness where useful.
- Missing-value count.
- Outlier count.
- Number of affected rows.

Appropriate visuals include:

- Overlaid histogram.
- Side-by-side histogram.
- Box plot.
- Density plot.
- Before-and-after summary cards.

Do not display every metric merely because it exists. Prioritize the measures that help evaluate the selected correction, with optional expansion for more detail.

#### Categorical columns

Show:

- Category counts before and after.
- Number of unique categories.
- Categories being merged.
- Percentage of rows affected.
- Most common category.
- Rare-category changes.

Appropriate visual:

- Before-and-after frequency bars.

#### Missing values

Show:

- Missing count and rate.
- Proposed filled values.
- Resulting distribution.
- Whether imputation changes the mean, median, variance, category share, or group comparisons.
- Which rows remain unresolved.

#### Duplicates

Show:

- Records being compared.
- Fields that match.
- Fields that differ.
- Record that would be retained.
- Information that would be lost.
- Row count before and after.

#### Dates

Show:

- Invalid or mixed-format counts.
- Earliest and latest date.
- Coverage gaps.
- Timeline before and after standardization.
- Records that cannot be safely interpreted.

### 8.7 Cross-column impact

Cross-column influence is useful, but it must be presented carefully.

CSV files normally contain stored values, not spreadsheet formulas. Therefore, the product should not pretend it can reconstruct formula dependencies that do not exist.

Instead, **Related Impact** may show:

- Other columns used in a known validation rule.
- Changes to calculated dashboard measures.
- Changes to correlations or grouped comparisons.
- Whether the correction causes or resolves another rule violation.
- Whether a duplicate decision changes totals in another measure.
- Whether correcting price changes derived discount, revenue, or margin calculations when the required columns and relationship are explicitly available.

Example:

> Standardizing these price values changes average revenue by 1.8% and resolves six discount-rate inconsistencies.

The product must not automatically alter unrelated columns merely because they are correlated.

If an imported spreadsheet includes formulas and the product genuinely reads them, formula-based relationships may be shown as an advanced capability. Formula lineage is not required for the initial CSV-focused version.

### 8.8 Finalize decision

The expanded issue must include a clear final action:

- **Finalize change**
- **Mark as valid**
- **Leave unresolved**
- **Cancel**

Before finalization, show a concise confirmation:

- Selected action.
- Number of affected records.
- Reversibility.
- Any remaining warning.

After finalization:

- The change is added to Changes.
- The issue status updates.
- Flagged cells update in View.
- Report metrics recalculate.
- The user remains in the same column context.

---

## 9. Changes Screen

The **Changes** screen uses a structure visually related to Issues, but it displays correction history rather than unresolved problems.

### 9.1 Organization

Changes should be grouped by column and displayed as expandable stacked entries.

Each collapsed entry shows:

- Column name.
- Change type.
- Original state.
- Applied correction.
- Number of affected records.
- Date or sequence of application.
- Current status.

Useful statuses:

- Finalized.
- Reversed.
- Replaced by a later change.
- Pending final export.

### 9.2 Expanded change

Expanding a change shows:

- Original values or rule.
- Finalized correction.
- AI explanation or user reasoning.
- Affected rows.
- Before-and-after chart.
- Before-and-after metrics.
- Alternative corrections originally considered.
- Related-column or report impact.
- Rollback or restore option.

The user should be able to compare the chosen correction with a previously available alternative without accidentally applying that alternative.

### 9.3 Rollback

Rollback must clearly state:

- What values will be restored.
- How many records will change.
- Whether later changes depend on this decision.
- Which report measures will be recalculated.

If rollback would conflict with later corrections, the product should explain the dependency and require the user to confirm the appropriate recovery action.

### 9.4 Original versus current

The Changes screen should allow the user to inspect:

- Original value.
- Current value.
- Correction method.
- Reason.
- Affected issue.

A filter should allow:

- All changes.
- Finalized changes.
- Reversed changes.
- Changes by column.
- Changes by issue type.

---

## 10. Report Screen

The **Report** screen is the final interactive dashboard and export area. It should summarize the completed cleaning work rather than reproduce the issue queue.

### 10.1 Main report content

The report should include:

- Total rows and columns.
- Total issues detected.
- Issues resolved.
- Issues marked valid.
- Issues left unresolved.
- Number of cells or records changed.
- Data completeness before and after.
- Duplicate count before and after.
- Valid-format rate before and after.
- Rule-compliance rate before and after.

### 10.2 Interactive dashboard

Recommended visual sections:

- Issues by type.
- Issues by column.
- Resolved versus unresolved.
- Missingness before and after.
- Duplicate reduction.
- Category consolidation.
- Distribution changes for corrected numerical columns.
- Changes with the largest analytical effect.
- Unresolved risks.

The dashboard should be interactive:

- Selecting a column filters the visuals.
- Selecting an issue category reveals the associated summary.
- Selecting a chart element can open the relevant Issue or Change entry.
- The user can switch between original and cleaned views.

### 10.3 Narrative summary

AI may create a concise report explaining:

- The condition of the original dataset.
- The most consequential problems.
- The major corrections selected.
- How the dataset changed.
- Which risks remain.
- Whether the data appears ready for its stated analytical purpose.

The narrative must be based on measured results and finalized decisions. It must not invent findings.

### 10.4 Export

Export belongs in Report.

Available outputs may include:

- Cleaned CSV.
- Original CSV.
- Change log.
- Data-quality report.
- Unresolved-issues list.

The export action should clearly identify which working version is being exported.

---

## 11. Live-Feed and Incoming-Batch Workflow

The product should be able to demonstrate an automated recurring workflow without requiring a real external connection in the public demo.

### 11.1 Batch sequence

1. A new batch arrives.
2. The product checks it against existing rules and current approved data.
3. Passing rows are marked ready.
4. Questionable rows are placed in Issues.
5. User reviews the exceptions.
6. User finalizes corrections or deliberately leaves issues unresolved.
7. User approves the batch.
8. Approved rows merge into the current dataset.
9. View and Report refresh.
10. The merge appears in Changes.

### 11.2 Required batch summary

Show:

- Total incoming rows.
- Rows ready.
- Rows requiring review.
- Possible duplicates against existing data.
- Resolved exceptions.
- Excluded or postponed rows.
- Merge status.

Example:

> **500 rows received**  
> 489 ready  
> 11 need review

### 11.3 Demo behavior

For the online portfolio:

- Use a local sample dataset as the current approved data.
- Use a second local file as the simulated incoming batch.
- Present the process as a demo of a recurring feed.
- Do not claim a real Google Sheets connection if one is not implemented.

The value of the demonstration is the operational workflow: automated checking, exception handling, approval, merging, and dashboard refresh.

---

## 12. AI Routine

AI is a visible analytical assistant, not a hidden authority.

### 12.1 AI receives

Only relevant context should be considered:

- Column name and inferred meaning.
- Issue type.
- Representative affected values.
- Summary statistics.
- Related business rules.
- Optional dataset description.
- Previously finalized decisions within the same dataset.

### 12.2 AI returns

The product should ask AI for a structured recommendation containing:

- Interpretation.
- Possible cause.
- Recommended treatments.
- Alternatives.
- Assumptions.
- Uncertainty.
- Business impact to investigate.

### 12.3 Validation

AI suggestions must be tested against the actual data before being displayed as actionable options. A narrative suggestion alone is not sufficient.

### 12.4 AI cannot

AI cannot:

- Finalize a correction without user action.
- Delete outliers automatically.
- Invent factual missing values without labeling them as estimates.
- Claim a category mapping is confirmed when it is inferred.
- Modify unrelated columns based only on correlation.
- Hide uncertainty.

---

## 13. Supported Issue Types

The product should detect and present:

### Missing values

- Nulls.
- Blank cells.
- Whitespace-only cells.
- Placeholder values such as N/A, unknown, -, or TBD.

### Duplicates

- Exact duplicate rows.
- Duplicate identifiers.
- Probable duplicates with slightly different values.

### Nonstandard categories

- Capitalization differences.
- Spelling variants.
- Abbreviations.
- Semantically similar labels requiring confirmation.

### Numerical outliers

- Statistically unusual values.
- Values outside defined business ranges.
- Possible decimal or unit errors.
- Unusual values within a relevant group.

### Formatting conflicts

- Mixed date formats.
- Numbers stored as text.
- Percentages represented on different scales.
- Currency or unit inconsistencies.
- Identifiers with unexpected lengths or characters.

### Cross-column violations

- Completion before start.
- Completed record without completion date.
- Total inconsistent with components.
- Discount inconsistent with price.
- Country inconsistent with a defined geography rule.

### Type conflicts

- Mixed incompatible types within a column.

Each type must support **keep unchanged/mark valid** when the flagged value is legitimate.

---

## 14. Modular Component Requirement

The application must be built from focused components. Do not place the full application inside one single page file or one massive component.

At minimum, separate the responsibilities for:

- Application shell and navigation.
- Data source selection.
- CSV preview and import state.
- Spreadsheet-style grid.
- Flagged-cell rendering.
- Issue navigator rail.
- Column profile.
- Column issue group.
- Expandable issue row.
- AI analysis panel.
- Possible-fixes panel.
- Impact-preview charts.
- Cross-column impact.
- Decision confirmation.
- Change-history group.
- Change comparison.
- Rollback confirmation.
- Report dashboard.
- Export controls.
- Incoming-batch summary.

Detection, AI recommendations, user decisions, version history, charts, and export logic should remain conceptually separate so that modifying one does not destabilize the others.

Use shared components for:

- Status badges.
- Metric cards.
- Before-and-after charts.
- Expandable rows.
- Confirmation dialogs.
- Empty states.
- Loading states.
- Error states.

---

## 15. Product State and Continuity

The interface must maintain a coherent relationship among the screens.

Examples:

- A flagged cell in View opens the matching issue in Issues.
- Finalizing an issue removes or changes its flag in View.
- A finalized issue appears in Changes.
- Reversing a change restores the relevant issue state.
- Report metrics update after a finalized change or rollback.
- Selecting a report visual can navigate back to the relevant issue or change.

No screen should display numbers that disagree with the other screens.

---

## 16. Metrics and Analytical Guidance

The product should choose metrics based on the correction.

Useful measures include:

- Missing-value rate.
- Duplicate rate.
- Unique-category count.
- Rule-violation count.
- Mean.
- Median.
- Variance.
- Standard deviation.
- Quartiles.
- Interquartile range.
- Skewness.
- Minimum and maximum.
- Category shares.
- Correlation changes when genuinely relevant.

RMSE is not a universal cleaning-quality score. It should only appear when a numerical estimate can be compared against known or defensible reference values.

The product must not imply that a smoother distribution is automatically more correct.

---

## 17. Public Demo Requirements

The public demo should feel like a real application, not a screenshot.

It must allow a visitor to:

1. Load a sample CSV.
2. Inspect the table.
3. See highlighted issue cells.
4. Navigate with issue markers.
5. Open a column group in Issues.
6. Expand an issue.
7. Compare at least two corrections.
8. See the chart and metrics update.
9. Finalize a change.
10. Find that change in Changes.
11. Roll it back or inspect alternatives.
12. View the updated Report.
13. Export a cleaned file or demonstration output.

The demo may also allow a visitor to simulate an incoming batch.

---

## 18. Recommended Demonstration Data

The sample dataset should include:

- Missing values.
- Exact duplicates.
- Probable duplicates.
- Category capitalization and spelling variations.
- One ambiguous semantic category.
- Mixed percentage scales.
- Mixed date formats.
- A cross-column rule violation.
- A legitimate numerical outlier.
- An incorrect numerical entry.
- At least one issue that should remain unresolved.

The demo should prove that the product does not always recommend changing the data.

---

## 19. First Release Scope

### Required

- Local CSV upload.
- Sample CSV.
- Five-item navigation.
- Scrollable data table.
- Sticky column headers.
- Highlighted issue cells.
- Edge issue navigator.
- Column-grouped Issues screen.
- Expandable issue analysis.
- AI explanation.
- Multiple correction options.
- Before-and-after chart and metrics.
- Finalize or mark-valid actions.
- Changes history.
- Alternatives and rollback.
- Interactive Report.
- Cleaned CSV export.
- Simulated incoming batch.

### Later possibilities

- Real Google Sheets connection.
- Scheduled source refresh.
- Formula lineage.
- Multiple reviewers.
- Organization-wide reusable rules.
- More advanced free-text analysis.
- Authentication and saved cloud projects.

Do not build later possibilities into the initial interface as fake or nonfunctional controls.

---

## 20. Acceptance Criteria

The rebuild is successful only if:

- The application opens with data-source actions, not a fake company dashboard.
- No fictional user identity appears.
- The navigation is Data, View, Issues, Changes, Report.
- A CSV can be loaded and displayed as a scrollable table.
- Column headers remain visible while scrolling.
- Troubled cells are visibly highlighted.
- A user can navigate to off-screen issues using edge markers.
- Issues are grouped by column.
- Issue groups and entries expand and collapse.
- An expanded issue contains AI Analysis, Possible Fixes, and Impact Preview.
- Selecting a possible fix updates the graph and metrics before finalization.
- The user can finalize, reject, defer, or mark a value as valid.
- Finalized decisions appear in Changes.
- Changes include alternatives, graphical impact, and rollback.
- Report functions as the final analytical dashboard.
- Export is available from Report.
- Screen counts remain consistent after changes and rollback.
- The codebase is componentized rather than concentrated in one file.

---

## 21. Final Product Statement

AI Data Quality Copilot is a visual, human-controlled data-cleaning application. It combines a spreadsheet-style view, precise issue navigation, column-based review, contextual AI analysis, correction alternatives, before-and-after statistics and charts, reversible history, and a final interactive report.

Its purpose is not simply to find errors. Its purpose is to help a business analyst understand each issue, compare defensible treatments, see the analytical consequences, make the decision, and preserve a transparent record of what changed.

## 22. Update rules
look into Update.MD for any updates, build them and add them into a separate file called updatelogs for changed udpates and clear update.MD after building

## 23. Ollama server setting 
Ollama is available at  `OLLAMA_URL=http://192.168.56.1:11434`
- Available models : `qwen2.5:14b`; `qwen2.5-coder:32b`; `llama3.2:3b`
- start with 3b model for faster workflow on local

## 24. uv 
we are using uv for environement mangagemnt on python so start with uv sync always
and handle modules using uv in this folder