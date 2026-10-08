# Review page: Issue list + Explore · Fix · Review

This is the implementation walkthrough for `review_spec/README.md`, `00_shared.md`, and the numbered issue specifications. Those files supersede `review_three_sections.md` and all earlier stepper / Find · Compare · Fix briefs. The application navigation still calls the screen **Review**; its internal name is `issues`.

## Page layout

```text
Issue list                          Selected column · issue · affected count
All types · search                  Accept as is
Column
  Missing values · 86               Explore | Fix | Review
  Outliers · 12                     Selected section content
Next column
Resolved (collapsed)
```

The left panel groups every column/issue pair. Type and column-name filters narrow the list. Status dots and text distinguish open, fixed, and accepted findings. Resolved items open their Review tab. On narrow screens the bounded issue list sits above the main surface.

The tabs are freely navigable. **Fix** is enabled when Explore has a locked scope; **Review** becomes available after a decision. These are sections, not sequential wizard steps. There are no three-card review screens or Advanced panels.

| Region | Exact `data-ui` |
| --- | --- |
| Issue list | `review.issues` |
| Type dropdown and column search | `review.issues.filter` |
| Column group (`data-column`) | `review.issues.column` |
| Issue item (`data-column`, `data-issue`) | `review.issues.item` |
| Resolved disclosure | `review.issues.done` |
| Main surface | `review.main` |
| Selected issue and Accept as is | `review.issue-header` |
| Explore / Fix / Review | `review.tabs` |

## Explore: choose the exact scope

### Missing values

The frequency list contains each exact blank, null-like token, and suspicious sentinel representation. Rows show the percentage of the column and the count. **Blank starts locked**; other representations require an explicit lock. A lock defines what the subsequent treatment may touch without changing the stored source value.

The automatic AI micro report receives the column name, inferred/declared type, defined meaning, bounded frequencies, and at most 20 present samples. Its recommendations appear as a suggestion and **Lock AI picks**; failure shows **AI unavailable**. AI never changes locks or data by itself.

**Go to Fix** uses the locked total. The inspection sheet is separate: its up-to-three lock columns arrange rows but never expand the treatment scope. Numeric locks use quantiles (five bands), fixed width, or explicit edges. Text groups below five records collapse into Other. Groups are ordered by missing rate, with zero-missing groups hidden unless requested. Each header shows the group population, missing count/rate, a rate bar, and an overall-rate marker. Nested locks can be reordered. Missing rows come first; each group initially shows 50 rows, with Show more.

| Element | Exact `data-ui` |
| --- | --- |
| Missing Explore section | `review.explore.missing` |
| Frequencies / individual representation (`data-value`) | `review.explore.missing.values`, `review.explore.missing.value` |
| AI micro report | `review.explore.missing.ai` |
| Locked count and Go to Fix | `review.explore.missing.total` |
| Inspection sheet | `review.explore.missing.sheet` |
| Ordered lock-column controls | `review.explore.missing.locks` |
| Include groups without missing values | `review.explore.missing.show-all` |

### Other issue types

| Issue | Explore behavior | Exact `data-ui` |
| --- | --- | --- |
| Outliers | Live IQR, Z-score, percentile, or fixed-range rule; count; scatter with rule bounds; histogram; point/box unlocking; zoom and Shift-drag pan; on-request AI error assessment | `review.explore.outlier`, `.rule`, `.threshold`, `.count`, `.scatter`, `.x`, `.hist`, `.points`, `.ai` |
| Repeated ID values | Count, Yes/No repeatability question, identical/conflicting group metrics, expandable rows | `review.explore.dup-values`, `.count`, `.question`, `.metrics`, `.groups` |
| Exact duplicate rows | Dataset-level All columns finding, groups, Remove all exact copies shortcut | `review.explore.dup-rows` |
| Format, type, or scale | Pattern frequencies, lockable patterns, editable target, ambiguous-date note, unreadable values | `review.explore.format`, `.patterns`, `.pattern`, `.ambiguous`, `.unparseable` |
| Inconsistent labels | Normalization clusters, editable canonical labels, requested AI synonym pass, complete frequencies | `review.explore.labels`, `.clusters`, `.cluster`, `.ai`, `.all` |
| Hidden characters | Lockable problem types and visible-space examples | `review.explore.whitespace` |
| Impossible values | Suggested/editable valid range, count, histogram, offending rows | `review.explore.invalid` |
| Conflicting columns | Suggested or declared relationship, editable calculation, violating rows and differences | `review.explore.cross` |
| Empty or constant column | Missing/dominant-value proportions and top values | `review.explore.constant` |
| Lost leading zeros | Digit-length distribution and examples | `review.explore.zeros` |
| Multiple values in a cell | Separator, proportion, examples, per-cell value counts | `review.explore.multi` |
| Sensitive data | Detected type and count with masked examples | `review.explore.sensitive` |

Suffix notation in the table expands the full preceding ID, for example `.rule` means `review.explore.outlier.rule`.

Answering **Yes** to repeated values records a reversible no-change decision and remembers that the column may repeat. **Undo** removes that permission. No turns on the comparison metrics and survivor review.

## Fix: exact preview before Apply

Ready-made fixes cover all issue families in the brief. Numerical missing values offer median, mean, grouped median when inspection locks exist, KNN, a constant, ordered previous/next fills and interpolation when a date column exists, retention, and row removal. Text missing values add global/grouped mode; dates use explicit constants or ordered neighbours. Other issues expose their corresponding conversion, mapping, character-cleaning, capping, duplicate-survivor, structural, and privacy treatments.

Choosing an option computes a pure preview. A scope reminder comes first; then the selected choices, a plain-language **reported-number consequence**, up to three before → after figures, and an explicitly named **risk** before the compact chart or row preview. **See affected rows** opens a side panel of current → proposed values. An optional note is saved with the decision; sensitive-data retention requires a note.

Multi-value cells support split rows, positional columns, yes/no flags (at most 20 distinct parts), keep-first and retention. Splitting rows shows the extra primary-metric total that copied records would double-count. Sensitive detection is local; Explore, previews and affected-row panels mask source examples. Masking, deterministic SHA-256 codes and column removal remain reversible through the preserved local source. These values are excluded from AI context, including related issue flows.

**Ask AI** accepts an instruction or requests a suggestion. Parsed leftovers and likely outlier typos use bounded source strings and confidence filtering. Suggestions are validated against the submitted columns, source values, and allowed operations; they become a selectable AI option and follow the same preview and Apply path.

Blocked records are not applied silently. **N can’t be fixed · Apply to the rest** must be explicitly selected. Conflicting duplicate survivor values and newly introduced declared-constraint violations also require acknowledgement. Approval checks the exact preview fingerprint and runs the existing approval function against current working data.

| Element | Exact `data-ui` |
| --- | --- |
| Fix choices / individual choice (`data-fix`) | `review.fix.options`, `review.fix.option` |
| Locked scope reminder | `review.fix.reminder` |
| Reporting effect and risk | `review.fix.consequence`, `review.fix.risk` |
| AI instruction and suggestions | `review.fix.ai` |
| Shared-scale chart and exact impact counts | `review.fix.preview` |
| Affected-row side-panel opener | `review.fix.rows` |
| Optional decision note | `review.fix.note` |
| Explicit approval | `review.fix.apply` |

## Review: impact, examples, Undo

After Apply, the selected issue stays visible and switches to Review. The metric strip shows changed cells, removed rows, column additions/removals, missing counts/rates, and mean/median or distinct-label changes. One before/after chart follows, then five example patches, Undo, and Next issue.

Numeric histograms overlap on common 1st–99th percentile bins, include edge counts and mean/median lines, and distinguish the filled-value segment. Labels compare top frequencies plus blanks. Dates compare representation patterns. Duplicates compare row totals; outliers use paired before/after scatter plots. By group is available when the decision used lock columns.

Undo uses history replay from the preserved source and reopens the finding. The current session’s Explore locks remain available. Column and row structure changes are included in portable project validation and rollback.

| Element | Exact `data-ui` |
| --- | --- |
| Impact metric strip | `review.review.metrics` |
| Before/after visualization | `review.review.chart` |
| Group breakdown | `review.review.by-group` |
| Five example changes | `review.review.sample` |
| Reversible history replay | `review.review.undo` |
| Next open column/issue pair | `review.review.next` |

Dataset purpose, parsing definitions, schema/metric rules, reusable projects, and KPI definitions remain under **Dataset → Definitions, business checks & manual corrections** (`dataset.setup`). Dataset-wide cumulative changes remain on Report.

## Verification and screenshots

- `scripts/verify_review_page_ui.cjs`: all numbered `verify_spec_*` acceptance suites at desktop/mobile widths, followed by the shared cross-module suite.
- `scripts/verify_review_page_extended_ui.cjs`: shared behavior, all multi-value structural variants, sensitive code equality, required-note gating, project round trips, network checks and source restoration.
- `scripts/verify_review_page.cjs`: pure new treatments, new detection families, and AI input/output validation.
- `scripts/verify_review_release_ui.cjs`: bundled CSV highlights/rail, grouped exact preview, Apply/history/Undo, real downloaded export, structural/private-code flows, console checks and responsive widths. `BASE_URL` targets local or the permanent hosted application.
- Earlier UI runner names forward to the current suite.

Use `?debug=ui` to display region IDs. Each issue's three-tab desktop/mobile screenshots are saved locally under `docs/screenshots/review-spec/01-missing/` through `12-sensitive/`. Non-debug release captures live in `.impeccable/review/`. AI responses are explicitly mocked; detection, statistics, treatments, approval, history, restore, rollback and CSV export are real. `docs/review-spec-progress.md` records stage results and the release checkpoint.

The sales file has no repeated order IDs, so that path uses a named derived fixture. The marketing file has ISO dates and consistent channel names, so format/label paths likewise use a named derived fixture. Bundled source CSVs are preserved.

**Example change request:** “On Review → Fix → `review.fix.preview`, after choosing constant 0 for discount_pct, make the filled-value segment easier to distinguish.”
