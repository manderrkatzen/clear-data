# Instructions: ClearData next capability pass

## Read this first

You are extending ClearData, a browser-based CSV data-quality review tool. The current build is described in `UI_CAPABILITIES_REPORT.md` (release `7ee14ce`). Treat that report as the source of truth for existing behavior.

**Rules for this task**
1. **Read the relevant code before changing anything.** Several items below may be partially implemented. If you find an item already satisfied, record that in your summary and skip it. Do not rebuild it.
2. **Preserve every existing guarantee.** Specifically:
   - Source values are never mutated.
   - AI never changes data. It only advises or drafts.
   - Every physical change goes through scope → preview → explicit approval → reversible history.
   - Blanks are never coerced to 0.
   - Display bounds (first 100 rows, etc.) never limit the true scope.
3. **Do not redesign the UI.** Add the minimum surface needed to expose each capability, following existing component patterns, naming, and visual language. UI/UX will be refined separately by the product owner.
4. **Deterministic first.** All statistics are computed locally. AI receives only aggregate summaries, never raw rows.
5. **Work in the priority order below.** Finish, test, and summarize each item before starting the next.
6. **Add automated checks** for every item: a script that loads the bundled CSVs, runs the capability functions, and asserts the expected results listed in each item.
7. **Final deliverable:** a short change summary per item stating what was done, files touched, test results, and anything skipped (with the reason).

---

## Priority 1: Correctness fixes in existing capabilities

### 1.1 Effect size is distorted by outliers (missing vs present comparison)

**Problem:** The numeric effect size is a standardized mean difference on raw values. Means and pooled SD are dominated by extreme values. Evidence from the report (section 37.4): for `customer_tenure_months` in `sales_orders.csv`, `quantity` is rated "moderate" (SMD ≈ 0.234) even though the **medians run the opposite way** (missing 2 vs present 3). The mean gap comes from a few extreme quantities, such as the planted 450-unit typo.

**Required change:**
- Replace the primary numeric effect size with a robust, rank-based measure: **Cliff's delta** (δ ∈ [−1, 1]; probability that a random missing-group value exceeds a random present-group value, minus the reverse).
- Strength thresholds for |δ|: **strong ≥ 0.33, moderate ≥ 0.147, weak > 0, none = 0** (standard Romano et al. thresholds).
- Keep SMD as a secondary statistic, but compute it on values **winsorized at the 1st/99th percentile** of the combined groups.
- Ranking, the "no pattern" rule, Hold-similar combined effects and verdicts, and the AI explanation payload must all use the robust measure.
- Report the **direction** consistently (e.g. "higher in missing group" / "lower in missing group").
- Performance: Cliff's delta must stay within the existing budget (< 200 ms for 1,000 × 15). Use a sort-based O(n log n) implementation, not O(n²).

**Acceptance:**
- `sales_orders.csv`, target `customer_tenure_months`: no comparison column rated above weak, and the panel returns the "no pattern detected" state.
- `sales_orders.csv`, target `delivery_days`: `channel` still ranks strong. The `quantity` direction is "higher in missing group".
- Hold `channel` for `delivery_days` vs `quantity`: verdict `explained` or `partial`.

### 1.2 Inconsistent definition of "missing" across checks

**Problem (report 37.6, 37.7):** Different paths use different definitions of absence. Required-schema and conditional-required checks look at physical blanks plus declared tokens, but ignore source-preserving classifications. The missingness comparison mask merges **missing** and **not applicable**.

**Required change:**
- Create (or consolidate into) a single function, e.g. `observationState(row, column) → "present" | "missing" | "not_applicable" | "blank_unreviewed"`, that every path calls. It must account for physical blanks, declared tokens, and analyst classifications.
- Each consumer chooses explicitly which states count as absent:
  - Required / conditional-required checks: `missing` and `blank_unreviewed` violate; `not_applicable` does **not** violate.
  - Missing-vs-present comparison: compare `missing + blank_unreviewed` vs `present`. **Exclude** `not_applicable` from both groups and report its count separately.
  - Fill eligibility: `missing + blank_unreviewed` only (already the case; verify).
  - Statistics/reference populations: `present` only.
- Remove any duplicated inline missing checks.

**Acceptance:** A test dataset where one `NULL` is classified missing, one classified not applicable, and one blank left unreviewed, with a required-schema rule on that column, produces exactly two required-violations and a comparison that excludes the N/A row.

### 1.3 Preview distribution range

**Problem (report 7.4, 23.3):** The original/working/proposed preview uses "18 shared bins over the displayed numerical range". If that range is min→max, a single extreme value squashes the distribution into one or two bins (the issue fixed earlier in the missingness histogram).

**Required change:** If the preview histogram uses min/max, switch it to the same rule as the missingness histogram: bins over the combined **1st–99th percentile** range, with explicit below/above edge counts and true min/max reported. Keep the bin count consistent across both chart families (pick one value and use it everywhere).

**Acceptance:** `sales_orders.csv` `discount_pct`, preview median fill: bars spread across most of the range, the 95% value appears in an above-range count, and the fill spike sits in its own bar.

---

## Priority 2: Missing capabilities from the agreed spec

### 2.1 Present rows alongside affected rows

**Problem:** Matching-record tables show only the affected rows (e.g. only rows where the value is missing). The analyst can't see what the *non-missing* rows look like next to them, which is the whole point of the missing-vs-present idea.

**Required capability:**
- For a missing-value finding, the record table can show **affected only / present only / both**. When showing both, each row is labeled with its state.
- Show **context columns**: by default, the top 3 columns from the missing-vs-present ranking, plus identifier columns. The analyst can change the selection.
- When a hold column is active (Hold similar), records can be **grouped by band**, and each group carries its summary: counts, missing rate, the band's comparison statistic, and the fill value the current draft treatment would use.
- When a treatment draft exists, affected rows show the **proposed value** next to the current blank, clearly marked as not applied.
- Respect existing display bounds and full-scope counts. Present-row display is for inspection only and never enters a treatment scope.

**Acceptance:** `delivery_days` with hold `channel` and draft "fill from similar groups (median, channel)": the record view groups Distributor / Online / Retail, shows missing and present rows together, shows proposed values 4.3 / 4.5 on affected rows, and Retail shows zero missing.

### 2.2 Preview impact by group (stacked lenses)

**Problem:** Preview shows original/working/proposed distributions for the whole column only. When a fill is computed per group, the analyst can't see what it did inside each group.

**Required capability:**
- When the treatment is group-wise or KNN, or a hold column is active, compute the before/after distribution **per band** (same bands as the treatment or hold).
- Per band, return: observed count, filled count, before median/mean, after median/mean, fill source breakdown (band / widened / knn / global).
- Bands with fewer than 5 observed values are flagged.

**Acceptance:** `delivery_days` group fill by `channel`: per-band output for Distributor (fills ≈ 4.3) and Online (≈ 4.5). Retail reports 0 fills. The global distribution is still available.

### 2.3 Compare multiple candidate treatments side by side

**Problem:** Preview evaluates one treatment at a time. The product's core promise is seeing several options in front of you visually before committing.

**Required capability (minimum version of the parked "branching" idea):**
- The analyst can add **2–4 candidate treatments** for the same finding and scope (e.g. global median, mean, group median by channel, KNN k = 7, leave missing, the AI proposal).
- Compute every candidate on the same scope and data snapshot, and return, per candidate: summary stats, the histogram on **shared bins and a shared count scale**, cells changing, blocked count, fallback count, and the KPI impact from 2.4 if configured.
- Any candidate can be promoted to the normal preview → approve path. Promotion must produce a fresh, valid preview; never approve from the comparison view directly.
- Candidates are transient. They are not saved as decisions, and they are invalidated when data, scope, or definitions change.

**Acceptance:** `delivery_days`, candidates = global median, mean, group median by channel. Output shows global fill 2.9, mean fill ≈ 3.2 (verify the actual value), and group fills 4.3/4.5, all on identical bins. Promoting the group candidate produces a normal approvable preview.

### 2.4 Business impact (KPI) of a treatment

**Problem:** The tool shows how a *column* changes, never how a *business answer* changes. This is the main business-analytics gap.

**Required capability:**
- The analyst defines one or more KPIs for the session: `metric` (numeric column), `aggregation` (sum | mean | median | count | ratio of two columns' sums), and an optional `groupBy` (column with ≤ 30 distinct values).
- For any preview or candidate, compute the KPI **before** (working) and **after** (proposed) per group, plus a total row: value before, value after, absolute Δ, % Δ, rank before → rank after.
- Flag groups with |%Δ| ≥ 5% or a rank change.
- Generate one deterministic headline sentence, e.g. "Filling spend_usd with the median moves Meta Ads from #2 to #4 by ROAS." When nothing moves more than 2%: "No group changes by more than 2%."
- Suggest sensible default KPIs when matching columns exist (the analyst can accept or ignore them):
  - marketing: ROAS = sum(revenue_usd) / sum(spend_usd) by `channel`
  - sales: margin = sum(profit_usd) / sum(revenue_usd) by `product_category`
  - healthcare: mean(`hba1c_pct`) by `department`
- KPI definitions are saved with the project and with reusable rule libraries. KPI results appear in the decision log for approved treatments (before/after per group).

**Acceptance:** `marketing_campaigns.csv` `spend_usd`, median fill vs mean fill: the ROAS-by-channel table differs between the two candidates, and the headline names the channel with the largest change.

### 2.5 Imputation flags in the cleaned CSV

**Problem (report 26.2):** The cleaned CSV gives no way to tell which values were filled. Downstream users can't separate real observations from estimates.

**Required capability:**
- Export option, **on by default**: for every column with at least one approved fill (statistical, group, KNN, replacement of a missing value, or metric recalculation), append `<column>_imputed` with `1` for cells whose current value came from an approved fill and `0` otherwise.
- Optional second column `<column>_imputation_method` (`median`, `mean`, `group`, `knn`, `global_fallback`, `constant`, `recalculated`).
- Rolled-back fills must not be flagged.
- Header and value escaping follow the existing CSV rules. Also guard against spreadsheet formula injection: prefix values starting with `=`, `+`, `-`, `@` with a single quote, **except** values that parse as valid numbers (e.g. `-4.2`).

**Acceptance:** Approve a group fill on `delivery_days`, then roll back a separate mean fill on `cost_usd`, then export. `delivery_days_imputed` has exactly 86 ones (or the approved valid subset), and no `cost_usd_imputed` column exists.

### 2.6 Suggested business rules from column names

**Problem:** Relationship and metric checks exist but must be authored manually. On the bundled samples, obvious identities (profit = revenue − cost, ROAS = revenue / spend) are never checked unless the analyst writes them.

**Required capability:**
- After import, detect candidate rules from column names and data, and present them as **suggestions** (never auto-enabled):

| Columns present | Suggested definition |
|---|---|
| `profit*`, `revenue*`, `cost*` | metric: profit = revenue − cost, tolerance 1% of median |abs(profit)| |
| `roas`, `revenue*`, `spend*` | metric: roas = revenue / spend |
| `cpc*`, `spend*`, `clicks` | metric: cpc = spend / clicks |
| `ctr*`, `clicks`, `impressions` | metric: ctr = clicks / impressions × 100 if the column name contains `pct` or values are mostly > 1, else × 1 |
| `revenue*`, `quantity`, `unit_price*` | metric: revenue ≈ quantity × unit_price (wide tolerance; discounts may apply, so mention that in the suggestion) |
| `*rating*` | schema: integer 1–5 if the observed values are a subset of 1–5 |
| `*_pct`, `*percent*` | schema: number 0–100 |
| `age` | schema: integer 0–120 |
| `*days*` (duration-like) | schema: number ≥ 0 |
| `*_date` pairs (order/delivery, admit/discharge) | relationship: later ≥ earlier |

- Before suggesting, test each candidate on the data. Only suggest it if **≥ 80% of rows** with usable inputs satisfy it (otherwise the columns probably don't mean what the names suggest). Show the pass rate with the suggestion.
- Accepting a suggestion creates a normal definition through the existing validation path.

**Acceptance:** `sales_orders.csv` suggests the profit identity, the rating 1–5 rule, and delivery_days ≥ 0. Accepting delivery_days ≥ 0 produces a finding for the −3 row. `marketing_campaigns.csv` suggests ROAS and CPC.

### 2.7 Dependency warning on approval

**Problem (report 22.7):** Filling an input (e.g. `cost_usd`) silently creates downstream metric discrepancies (`profit_usd`). Propagation is correctly manual, but the analyst isn't warned at decision time.

**Required capability:**
- At preview time, if the target column is an input to any configured or suggested-and-accepted metric, report: the dependent metric(s), how many changed rows would now violate them, and a pointer to the follow-up finding.
- After approval, the dependent metric finding should be opened or refreshed automatically (not approved).
- Do **not** auto-recalculate.

**Acceptance:** With the profit identity accepted, previewing a median fill of `cost_usd` reports the number of rows whose profit would no longer match. After approval, a profit metric finding exists for those rows.

---

## Priority 3: Robustness of findings

### 3.1 Significance indicator for missing-vs-present rankings

**Problem:** Ranking many columns invites spurious "patterns" in small groups.

**Required capability:**
- For the top 5 ranked columns, run a **permutation test**: shuffle the missing/present labels 500 times (seeded for determinism) and compute the fraction of shuffles with |effect| ≥ observed.
- Return `pValue` and a plain label: `robust` (p < 0.01), `likely` (p < 0.05), `could be chance` (otherwise).
- Include the label in the AI explanation payload. The AI must hedge when the label is `could be chance`.
- Must run in the background and stay within interaction budgets. Skip it (and say so) if a group has more than 20,000 rows, or use a sample.

**Acceptance:** `delivery_days` → `channel` labeled `robust`. A synthetic random-noise column added in the test is labeled `could be chance` in at least 95% of seeds.

### 3.2 Sample fixture for the "no pattern" state

After 1.1 is done, re-check `customer_tenure_months`. If it still doesn't trigger "no pattern detected", do **not** weaken the rule. Instead, update `scripts/` or the dataset generator so one sample column demonstrates it cleanly: blanks that depend only on the column's own value, independent of every other column. Then document which column demonstrates it.

---

## Priority 4: Consistency and cleanup

4.1 **Naming:** some labels still say "Changes" where navigation says "Decisions" (report 10.6). Use "Decisions" everywhere.

4.2 **Two group-median methods:** "Fill with group median (strict single-group)" and "Fill from similar groups" overlap. Keep both only if the strict one has a distinct purpose. Otherwise make the strict method a preset of "Fill from similar groups" (one hold column, no widening, no global fallback, blocked records stay blocked) so there is one code path and one provenance format. Preserve backward compatibility for saved projects and decision logs that reference the old method name.

4.3 **Manual correction coverage:** expose group-wise and KNN fills in the manual-correction path when the selected column is numeric and the selected rows contain missing values.

4.4 **Quality scorecard:** extend the column profile with **validity** (% of non-blank values passing all active schema/metric/relationship rules for that column, or "no rules") and **consistency** (% in the dominant format/spelling for text/date columns). Show source vs working for both in the Report artifacts.

---

## Out of scope for this pass

- Full branching with versioned datasets per branch (item 2.3 is the minimum version only).
- Multi-dataset joins, Excel workbooks, cloud sync, accounts.
- Visual redesign of existing screens.

---

## Final checklist (run before reporting done)

- [ ] All acceptance checks above pass in the automated script against the three bundled CSVs
- [ ] Existing behaviors in report sections 2, 11.2, 23, 24, 25 still hold (spot-check: preview staleness, blocked-record handling, rollback preserving later approvals)
- [ ] No path coerces blanks to 0; no raw rows are sent to AI
- [ ] Performance: comparison + held comparison + KPI on 1,000 rows < 200 ms; background work stays responsive on 50,000 rows
- [ ] Project save/backup round-trips new state (KPI definitions, accepted rule suggestions); older backups still import
- [ ] Change summary written per item
