# ClearData: New Analytical Capabilities

**Scope:** what the system must compute and return. **No UI or UX is specified here**; layout, controls and visuals are designed separately. Each capability defines its inputs, computation, output and edge cases, plus acceptance checks against the bundled sample data.

**Shared principles**
- All statistics are computed deterministically in the browser. AI only receives summary outputs (never raw rows) and only produces explanations or fix proposals.
- Nothing modifies the working data until the analyst approves a fix. Previews are always computed on a copy.
- "Missing" uses one shared helper: blank or whitespace-only (optionally also `NULL`, `N/A`, `NA`, `-`). Comparisons must never coerce blanks to 0.

**Build order:** 1 → 2 → 3 → 4 → 5. Capability 6 is parked.

---

## 1. Missing vs present comparison

**Purpose:** find which other columns explain *why* a column has gaps.

**Input**
- `targetColumn`: the column with missing values.
- Optional `columns`: the columns to compare (default: all other columns, excluding ID-like ones that are ≥ 95% unique).

**Computation**
1. Split rows into `missing` (target is blank) and `present` (target has a value).
2. For each comparison column:
   - **Numeric:** count, mean, median, IQR and a 10–20-bin histogram for each group, using the shared 1st–99th percentile range so the two groups line up. Effect size = standardized mean difference: `|mean_missing − mean_present| / pooled_sd`.
   - **Categorical** (≤ 30 distinct values): the missing rate of the target per category. Effect size = the largest absolute gap between any category's missing rate and the overall missing rate, ignoring categories with fewer than 10 rows.
   - **Date:** the missing rate per month; effect size computed the same way as for categories.
   - Rows where the comparison column is itself blank are counted separately and excluded from that column's statistics.
3. Rank columns by effect size, descending.

**Output (per column)**
```
{ column, type, effectSize, strength: "strong" | "moderate" | "weak" | "none",
  missingStats, presentStats, histogram?, categoryRates?, monthlyRates?,
  excludedBlankRows, summary }   // summary: one deterministic sentence
```
Strength thresholds: numeric SMD ≥ 0.5 strong, ≥ 0.2 moderate; categorical gap ≥ 15 points strong, ≥ 7 moderate.

**Edge cases**
- Fewer than 5 missing or 5 present rows → return `insufficientData` and no ranking.
- Constant columns → skip.

**Acceptance (sales_orders.csv)**
- `delivery_days` → `channel` ranks strong: Distributor ~32% missing, Online ~6%, Retail 0%.
- `delivery_days` → `quantity` shows missing median 9 vs present 2.

---

## 2. Hold similar: compare mode

**Purpose:** test whether a pattern from capability 1 is real or explained by another column.

**Input:** `targetColumn`, `comparisonColumn`, `holdColumn`, `banding`.
- Banding for a numeric hold column: `quantiles(k)` (default k = 4), `fixedWidth(w)`, or custom edges.
- Banding for a categorical hold column: one band per category, with categories under 10 rows merged into "Other".

**Computation**
1. Assign each row to a band of `holdColumn`. Rows blank in `holdColumn` go into a separate "unknown" band.
2. Within each band, run the capability-1 comparison for `comparisonColumn` only.
3. Combine across bands: a **weighted average effect size**, weighted by band size, using only bands with ≥ 5 missing and ≥ 5 present rows.
4. Verdict:
   - `holds`: the combined effect size is ≥ 70% of the unbanded effect size, with the same direction in most valid bands.
   - `explained`: the combined effect size is ≤ 30% of the unbanded one.
   - `partial`: otherwise.
   - `insufficient`: fewer than 2 valid bands.

**Output**
```
{ unbandedEffect, combinedEffect, verdict,
  bands: [{ label, nMissing, nPresent, missingStats, presentStats, effectSize, valid }],
  summary }
```

**Guards:** `holdColumn` ≠ `targetColumn`. If `holdColumn` is blank in ≥ 50% of the rows where the target is missing, warn that the result is unreliable.

**Acceptance (sales_orders.csv):** target `delivery_days`, comparing `quantity`, holding `channel` → the overall gap (median 9 vs 2) mostly disappears inside Distributor (12 vs 12), so the verdict is `explained` or `partial`. Channel is the real driver.

---

## 3. Hold similar: fix mode (fill from similar rows)

**Purpose:** fill blanks using rows like them instead of a single global value.

**Methods**
- **Group-wise:** fill each blank with the median (or mean) of observed values in the same band of one or more hold columns.
- **KNN:** fill each blank with the median of the `k` most similar rows that have a value (default k = 7).
  - Distance: numeric columns min-max scaled to [0, 1]; categorical columns contribute 0 if equal and 1 if not; the distance is the average over the selected columns.
  - Ignore any column that's blank in the row being filled.

**Fallback rules**
- Group-wise: if a band has fewer than `minObserved` (default 5) values, widen it (merge with the nearest band for numeric, use "Other" for categorical). If that still fails, use the global median.
- KNN: if fewer than `k` neighbours exist, use the ones that do. If there are none, use the global median.
- Every filled cell records which method actually produced its value.

**Output**
```
{ method, params, fills: [{ row, value, source: "band" | "widened" | "knn" | "global", bandLabel?, neighbourRows? }],
  fallbackCount, beforeStats, afterStats, histogramBefore, histogramAfter }
```
- `neighbourRows` (up to k) is required so the analyst can trace exactly which rows a value came from.
- Plugs into the existing preview → approve → history → rollback flow as a normal treatment, with the method and params stored in history.

**Guards:** hold columns can't include the target, and should exclude columns blank in the same rows.

**Acceptance (sales_orders.csv):** `delivery_days` group-wise by `channel` → Distributor blanks get ~4.3, Online blanks get ~4.5, there are no Retail blanks, and the global median (2.9, dragged down by Retail's 0-day pickups) is not used.

---

## 4. "No pattern found" detection

**Purpose:** say explicitly when blanks look like the filled rows in every column, which suggests the blanks depend on the missing value itself (for example, new customers with no tenure history).

**Rule:** if capability 1 returns no column stronger than `weak` across at least 3 comparison columns, return:
```
{ pattern: "none_detected",
  note: "Missing rows look like present rows in every other column. The gaps may depend on the missing value itself, so filling with an average could bias results." }
```
Wording must say "may". This is an indication, not a diagnosis.

**Acceptance (sales_orders.csv):** `customer_tenure_months` → `none_detected`. In the data, tenure is mostly missing when tenure itself is low.

---

## 5. AI explanation of the top pattern

**Purpose:** turn the comparison results into a short plain-language explanation and an optional fix proposal.

**Input sent to the AI** (summaries only, no rows)
- Target column, missing count, total rows.
- Top 3 results from capability 1 (column, type, effect size, key stats or category rates).
- Any capability-2 verdicts already computed.
- The allowed fix operations: `fill_constant`, `fill_groupwise(holdColumns, statistic)`, `fill_knn(columns, k)`, `leave_missing`.

**Expected AI output (JSON)**
```
{ explanation: "1–2 sentences", likelyDriver: "column name or null",
  caution: "1 sentence or null",
  proposal: { operation, params } | null }
```

**Validation (server side)**
- Every column mentioned must exist in the submitted summary.
- The operation must be in the allowed list, and the params must reference valid columns.
- `explanation` ≤ 300 characters. Hedge language is required when the verdict is `partial` or `insufficient`.
- A proposal is always returned as `requiresConfirmation: true` and runs through capability 3 (or the existing fill logic) to generate its preview before anyone can approve it.

---

## 6. Parked: branching fixes

Compare chains of fixes, since a fix on one column changes values in others (filling `cost_usd` changes `profit_usd`; handling outliers changes the median used to fill).

- **Minimum version:** compute 2–3 candidate fixes for the same column in parallel and return their before/after stats and histograms together.
- **Full version:** versioned working data per branch, recomputation of dependent columns, and a branch history that can be rolled back.

---

## Shared requirements

- **Performance:** capabilities 1–4 must complete in under 200 ms for 1,000 rows × 15 columns, and stay usable at 50,000 rows (cache per-column sorted values and missing masks; recompute only what changed).
- **Determinism:** the same input always gives the same output. KNN ties are broken by row order.
- **Logging:** each approved fill from capability 3 stores its method, params, fallback count and per-cell source in history, and rollback restores the original values.
- **Tests:** add the acceptance checks above as a small script that runs the capability functions against the three bundled CSVs and asserts the expected outcomes.
