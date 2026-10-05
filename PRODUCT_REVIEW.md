# ClearData product review

Review date: 2026-10-05. Based on the repository implementation and local browser testing. This is a personal portfolio project, so the priorities favor a coherent, credible cleaning experience over infrastructure breadth.

## Overall assessment

The strongest idea is already here: **findings → evidence → proposed treatment → human approval → reversible history**. Preserving row identity, previewing changes, validating AI operations, and replaying later decisions during rollback are meaningful engineering choices. These are stronger portfolio signals than a long list of integrations.

The main weakness was that the interface did not make that reasoning legible. It looked like several feature panels had accumulated around a demonstration, rather than one deliberate decision-making tool. Some of that impression is cosmetic, but some is functional: a finding can be detected with no supported way to correct it, and several detection rules depend on specific marketing field names.

The right positioning is an **explainable CSV cleaning workbench with an on-demand AI copilot**. An analyst should be able to answer four questions without searching:

1. What was found, and where?
2. Why is it a finding rather than necessarily an error?
3. What exactly would this treatment change?
4. What did I approve, and can I undo it?

## 1. Information hierarchy was the largest usability problem

### Findings before this pass

- Additional-check buttons appeared above the review screen's title and purpose.
- Three equally weighted columns forced outlier controls, descriptions, and plots into competing narrow spaces.
- Outlier control children used `display: contents` inside a three-column grid. Percentile inputs retained intrinsic widths and their labels overlapped.
- A large chart determined the height of neighboring panels, leaving empty space while pushing records and approval lower down.
- Filter builders, optional rationale, project storage, and reusable-rule controls were visible at the same time as the primary decision.
- The dataset overview offered column-name/type badges but little practical profiling information.
- Closed findings remained interleaved with open work.
- An incoming-batch control suggested a live-feed demonstration but only displayed a toast.

### Implemented changes

- Added a dataset review entry point and a column profile with blanks, distinct nonblank source values, numerical ranges, inferred types, and direct review links.
- Added distinct counts for open findings, affected rows, closed findings, and modified cells. These are not combined into a misleading quality score.
- Reorganized review panels into evidence/treatment beside an impact preview on desktop, stacking in reading order on smaller screens.
- Rebuilt outlier controls as a full-width method selector followed by a bounded parameter grid. Inputs cannot exceed their grid tracks.
- Moved additional-check configuration, inspection filters, analyst rationale, and reusable-rule tools behind descriptive expandable sections.
- Separated closed findings from the open queue.
- Added record-level current/proposed numerical values, alongside existing date/category previews.
- Replaced the simulated incoming-batch affordance with a working findings-queue shortcut.
- Fixed mobile page overflow caused by the navigation's intrinsic grid width; improved focus states, disabled states, long-name wrapping, and rule-dialog sizing.

### Remaining design work worth doing

- A large queue still needs type/column search and filtering, plus an optional focused single-finding mode. Expanding all numerical coverage makes this more valuable.
- Missingness is generally assigned high severity. Legitimately blank optional fields can drown out confirmed type/range violations. Distinguish **review priority** from confidence that something is wrong, using declared schema when available.
- Prefer specific treatments over vague labels: `Fill 110 blanks with median 235.42` communicates more than `Fill with column median`. The record preview now makes the value visible, but treatment cards can do more.
- Make successful approval show a compact summary: cells changed, rows affected, findings refreshed, and a link to the decision. A toast alone is easy to miss.
- The report screen should tell a short analytical story in the browser, rather than mainly acting as a download hub: changes made, values deliberately retained, and unresolved limitations.

## 2. Cleaning coverage is still the largest functional gap

Before this pass, automatic IQR detection calculated several numerical profiles but selected only one, preferring `spend_usd`. This has been corrected: each inferred numerical column with matching IQR observations now receives its own review finding.

The rest of the engine still has an important distinction:

| Area | Current capability | Highest-value next improvement |
| --- | --- | --- |
| Missing values | Detect blanks across columns; numerical mean, median, AI constant fill, or retain | Configurable missing tokens; explicit constant/manual fill; grouped fills with preview |
| Numerical values | Inferred numeric types, multiple outlier definitions, declared schema bounds | Mixed numeric/text detection; explicit locale/currency/percentage parsing; precision control |
| Categories and text | Specific Paid Social variants; declared allowed labels; AI mappings of the reviewed variants | Column-independent trim/case/spacing checks and a manual mapping editor |
| Dates | Specific `launch_date` slash-date conversion; declared ISO-date validation | Column-independent format profiles, explicit day/month interpretation, invalid-date correction |
| Duplicates | Exact rows and analyst-defined composite keys; conflicts acknowledged before removal | More survivor choices and group-by-group comparison; optional normalization before comparison |
| Outliers | IQR checks across inferred numeric columns; Z-score, percentile, business bounds, custom condition | Explicit treatment options: retain, reviewed manual correction, cap to declared bounds, or remove with context |
| Schema | Type, required, bounds, and allowed-value findings | A direct route from each problem to a safe correction preview |
| Cross-column logic | Clicks/impressions special case; configured arithmetic metrics | Generic comparisons and conditional requirements, such as delivered date after order date |
| Metrics | Rounded sum/difference/product/ratio recalculation; invalid inputs separated | Dependency-aware review ordering and clear explanations of blocked recalculations |
| Individual corrections | Treatments are issue-scoped; no general-purpose edit workflow | Manual cell patches with a rationale, preview, validation, and existing rollback history |

The key problem is **detection without remediation**. Schema violations, nonnumerical blanks, and many cross-column problems can be reviewed or accepted but cannot be corrected through a general editing path. Outlier review now clearly states that it records a no-change decision, rather than implying that definition controls clean the values.

### What “handle everything related to cleaning” should mean

Not every unusual value is incorrect, and some errors require knowledge outside the CSV. A plausible but wrong customer age cannot always be distinguished from a correct one. Ambiguous dates, legitimate repeated records, and meaningful blanks need explicit policies.

For a personal project, a strong practical target is:

- Detect common structural, missingness, formatting, category, numerical, duplicate, and rule-consistency problems on arbitrary column names.
- Offer a small, understandable set of corrections for each supported finding.
- Allow a reviewed manual correction when an automatic treatment is inappropriate.
- State what remains unresolved or unsupported.
- Preserve the same approval, exact preview, and rollback behavior for every operation.

Do not silently treat `NA`, `0`, `unknown`, or `-` as missing in every dataset. Make missing-token definitions explicit. Similarly, do not blindly merge labels because their spelling looks similar or parse ambiguous dates without showing the interpretation.

## 3. The runtime AI is useful but currently too narrow to feel like a copilot

The application being built with AI and the application calling AI at runtime are different capabilities. Both can be demonstrated honestly.

Currently, the runtime AI supports two proposal classes: a constant fill for a numerical missing-value issue, and category mappings within the reviewed source set. It receives a bounded context and returns a validated structured operation. That is a sound foundation, but mostly a natural-language interface to two treatments.

The automatic findings, statistics, explanations, and default treatment options are deterministic. Calling a model to calculate blank counts would add little value. The more useful AI layer would help the analyst **reason about tradeoffs**:

- “Why might median be safer than mean for this distribution?”
- “When would filling this field with zero change the meaning of the data?”
- “Which of these category labels appear equivalent, and which need confirmation?”
- “Given that this is an order dataset, what business constraints should I consider defining?”
- “Explain the approved decisions and unresolved concerns for a stakeholder.”

Implement this as a separate grounded advisory response: explanation, alternatives, assumptions, warnings, and references to computed evidence. Treatment proposals should still select from a validated operation registry. An explanation should never silently become a data patch.

Useful context additions include dataset purpose supplied by the analyst, total/observed row counts, column meaning, missingness rate, quartiles, and configured constraints. The model should use locally computed facts rather than inventing statistics. For category review, show the exact mapping and row counts before approval.

This pass makes AI invocation explicit, visually separates it from rule-based findings, displays proposal caveats, and preserves the typed instruction while other treatment controls rerender the screen. It does not add new AI endpoints or proposal operations.

## 4. Implementation cleanup matters for future features

`app.js` had multiple shadowed declarations of `renderIssueWorkspace`, `affectedRecords`, `issueFilter`, `filteredIssueRows`, `bindIssueLinks`, `scatterChart`, and `requestProposal`. JavaScript used the last declaration, making earlier code look active when it was not. This pass removes those shadowed declarations and unused predecessor helpers; there is now one top-level declaration per function name in `app.js`.

The remaining useful cleanup is modest, not a framework migration:

- Extract profiling/detection, treatment simulation, history, and rendering into clearly named classic-script sections or files.
- Consolidate accumulated CSS into authoritative component rules; the new review rules currently live in the final-loaded `workspace.css` layer.
- Use a treatment registry so the same operation defines eligibility, preview, patch generation, and explanation. Every new treatment should use the existing reversible decision record.
- Cache column profiles per dataset revision rather than repeatedly scanning and sorting values during rendering.
- Add table pagination or windowing when moving beyond the bundled 1,000-row datasets.
- Keep behavior-focused regressions for atomic application, preview/application agreement, invalid inputs, and overlapping rollback. Avoid tests that just duplicate HTML templates.

## 5. Recommended build order

### Priority 1 — Credible generic cleaning

Add column-independent text/category checks, robust number/date format review, explicit missing-token configuration, and reviewed manual cell corrections. Complete these as vertical slices: detection, evidence, treatment, exact preview, approval, history, rollback, export.

### Priority 2 — A copilot that helps with judgment

Add evidence-grounded explanations and treatment comparisons. Let the analyst provide the dataset's purpose. Keep advice and executable proposals distinct. Expand executable AI operations only after their deterministic treatments work reliably.

### Priority 3 — A memorable recruiter demonstration

Prepare a short walkthrough using an unfamiliar-column CSV rather than only the bundled marketing example:

1. Import and show an immediately useful profile.
2. Inspect a concrete incorrect value and its evidence.
3. Compare treatments or ask the copilot for help.
4. Show an exact before/after preview and approve it.
5. Explain why one unusual value was deliberately retained.
6. Roll back an earlier decision while retaining a later one.
7. Export a report and the working CSV.

Explain the engineering decisions: deterministic calculations, constrained model output, explicit approval, stable row identity, and reversible replay. Show one ambiguous case and how the tool handles it honestly. That demonstrates more judgment than claiming to clean every possible dataset automatically.

## Verification and release status

All 33 Node regression checks pass, including independent multi-column outlier reviews and agreement between record-level numerical previews and approved values. Chromium verification covers widths of 360, 390, 768, 1024, 1280, and 1440 pixels; each outlier method; inspection filters; spreadsheet inspection; rule dialogs; all three bundled samples through numerical approval/rollback/export; and a mocked AI proposal flow. No page runtime errors were observed in these exercises.

Changes are local repository changes. The production Worker has not been redeployed by this review. A live OpenAI provider call was not used for UI verification; provider behavior is mocked in the regression checks.
