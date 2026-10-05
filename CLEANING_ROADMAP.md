# Guided cleaning: implementation checkpoint

## Product philosophy

Deterministic discovery → AI-assisted interpretation → analyst-chosen treatment
and scope → exact preview → explicit approval → cumulative working view.

Candidates are not automatically errors. Unknown, not applicable, legitimate zero,
and formatting problems remain distinct. Ranking a hypothesis does not establish
a calibrated probability or authorize a data patch.

## Implemented

- Cached profiles, identifier protection, background analysis, and numerical inference from observed non-token values.
- Blank, missing-token, contextual sentinel, whitespace, category-variant, number/date-format, duplicate, schema, relationship, metric, and outlier findings.
- Editable column meaning/role, missing tokens, precision, number separators/currency/percentage semantics, and date interpretation.
- Automatic bounded AI interpretation; ranked alternatives, assumptions, context, follow-up questions, caching, cancellation, unavailable/quota states, and revision guards.
- Five review stages, searchable/filterable queue, explicit row/conditional/all-matching scopes, and retained unresolved findings.
- Missing normalization; constant/manual corrections; mean/median/group median; whitespace/case normalization; exact mapping; number/date parsing; explicit scaling; bounds capping; scoped removal; arithmetic recalculation.
- First/last/most-complete/manual duplicate survivors and complementary blank-field merging. Conflicts require acknowledgement.
- Conditional requirements and numerical/date/text comparisons, plus existing schema required/range/allowed-value checks and arithmetic metrics.
- Exact previews, blocked-record recovery, new constraint-violation review, per-record retention, semantic replay, cumulative charts, reversible patches/removals, and portable projects/rules.
- New documented visual system: navy rail, white task surfaces, blue actions, green approval, local typography, SVG finding icons, and focused responsive hierarchy.

## Verification

- 52 Node regressions passed (`verify_quality.cjs` + `verify_cleaning.cjs`).
- Playwright passed at 360, 390, 768, 1024, 1280, and 1440 pixels through five steps, keyboard navigation, local fonts, cancellation, manual correction, project restore, and three sample approval/rollback/export flows.
- Axe WCAG A/AA checks found no violations in the tested five review stages at desktop/mobile sizes; this is scoped evidence, not whole-product certification.
- Impeccable's independent review identified four material issues. One batch corrected blank-history wording, footer overlap, finding icons, and metadata hierarchy. The reviewer scored all four resolved; its ship verdict applies to that fix list.
- Verification used mocked AI. Configuration status is not a live provider health test.

## Remaining analytical limits

This does not detect every exception. Sentinel discovery is heuristic, category
equivalence is formatting-based rather than fuzzy entity resolution, and unknown
source semantics need the analyst. Policies do not silently rewrite values. Metric
chains need separate approvals. Conditions currently use one field or explicit
row IDs; compound conditions and multi-field grouping remain future work.

Timestamp/time-zone normalization, a unit-conversion ontology, external reference
joins, fuzzy duplicates, and predictive imputation are not implemented. Large files
need table windowing and further performance verification. JSON backups retain
classification meaning; CSV cannot distinguish otherwise identical blank cells.

## Excel: discussion only

Workbook import has not been built. Discuss one-sheet/cross-sheet scope, table/header
selection, cached formulas, dates, leading-zero codes, hidden rows, and merged cells
before selecting a parser. Parsing Excel-style date serials already inside a CSV is
separate from importing a workbook.

## Release workflow

Verified checkpoints are pushed to `feature/analytics-review-workspace`. Deploying
is a separate requested action targeting the existing Worker. Restart OpenCode to
discover the installed Impeccable commands. Tool binaries/captures are gitignored.
