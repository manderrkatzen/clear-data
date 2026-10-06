# ClearData next capability pass

Implements `next_capabilities_instructions.md` in priority order. All additions
use existing native controls, tables, disclosures, and the analytical desk style.

## Per-item changes and acceptance results

| Item | Built behavior | Main files touched | Acceptance result / reuse |
|---|---|---|---|
| **1.1 Robust effects** | Sort-based signed Cliff’s delta supplies numeric rank, strength and direction; 1st/99th winsorized SMD is secondary. Held verdicts, no-pattern and AI summaries use robust effects. | `analysis-engine.js`, `analytics.js`, `src/ai.cjs` | Delivery/quantity is higher in missing records; channel remains strong; held gap attenuates; ties and large-array delta checked. Original unit-price δ remained .1484, so item 3.2 uses its authorized fixture fallback. Thresholds stay .33/.147. |
| **1.2 Observation states** | Shared present/missing/not-applicable/unreviewed-blank states drive required checks, comparisons, donors, fills and numerical conditions. N/A targets are excluded and counted separately. | `cleaning-engine.js`, `analysis-engine.js`, `review.js`, `app.js`, `workspace.js` | Mixed NULL/blank fixture yields exactly two required violations, two missing, three present and one excluded N/A. Classification/restore/rollback regressions pass. Existing source-preserving classifications were extended, not replaced. |
| **1.3 Preview ranges** | Sixteen shared first–99th-percentile bins, separate below/above counts, true extrema in active chart families. | `analysis-engine.js`, `review-ui.js`, `analytics.js` | Sales discount 95% is above the central range; at least eight occupied central bins; median fill makes a distinct spike. |
| **2.1 Record inspection** | Affected/present/both, explicit states, identifiers/top-three defaults, editable context columns, hold/treatment bands, counts/rates/comparison medians, and not-applied proposals. | `capabilities-engine.js`, `capabilities.js`, worker integration | 1,000 inspection records; ≤100 displayed; scope stays 86. Distributor/Online proposals 4.3/4.5, Retail zero missing. Desktop/mobile flow passes. |
| **2.2 Band lenses** | Background per-band distributions, observed/filled counts, before/after mean/median, source breakdown and sparse warnings; global chart retained. | `capabilities-engine.js`, `capabilities.js`, `analysis-worker.js` | 54 Distributor fills, 32 Online fills, zero Retail fills, comparable axes. Strict groups retain exact membership; KNN/active holds have lenses. |
| **2.3 Candidate comparison** | Two to four transient recipes share snapshot, scope, bins/count scale, blocked/fallback counts and configured KPIs. Current/AI draft settings can be included. Promotion regenerates a normal preview, never approves. | `capabilities-engine.js`, `capabilities.js`, `analytics.js`, `design-system.css` | Global median 2.9, rounded mean 3.17, channel values 4.3/4.5. Source unchanged; fresh promotion/approval verified. Full versioned branching is excluded as instructed. |
| **2.4 KPIs** | Sum/mean/median/count/ratio-of-sums, optional ≤30-category groups, total, deltas, ranks, ≥5%/rank flags, deterministic headlines; opt-in ROAS/margin/HbA1c defaults. | `capabilities-engine.js`, `capabilities.js`, `workspace.js`, `review.js`, `review-ui.js` | Median/mean spend produce different ROAS tables; meaningful headlines; definitions/project restoration and approved log results pass. Zero/undefined baselines and literal Total group names are handled. |
| **2.5 Imputation export** | Flags default on, method columns optional; active fill/recalculation provenance, rollback/overwrite handling, collision-safe generated headers, formula-safe text with valid signed-number exceptions. | `capabilities-engine.js`, `capabilities.js`, `app.js` | Exactly 86 delivery flags; actual cost-mean rollback leaves no cost flag column. Formula and signed/exponent examples plus browser downloads pass. |
| **2.6 Suggested rules** | Local name/data candidates at ≥80% usable pass rate; explicit acceptance through normal definition validation; accepted metadata persists. | `capabilities-engine.js`, `capabilities.js`, `workspace.js` | Sales profit/rating/days suggestions, accepted −3 delivery finding; marketing ROAS/CPC; healthcare age; restored accepted suggestions pass. No auto-enable or treatment. |
| **2.7 Dependencies** | Background preview warning with dependent targets and changed-row violations; post-approval links to refreshed findings; no automatic recalculation. | `capabilities-engine.js`, `capabilities.js`, `review.js`, worker integration | Median cost warns about profit; profit stays unchanged; open follow-up exists. **Reused:** normal post-approval metric refresh already worked and was not rebuilt. |
| **3.1 Permutations** | Top five get 500 seeded background permutations, p-value and robust/likely/could-be-chance labels; >20,000-row target groups explicitly skip; AI must hedge chance evidence. | `analysis-engine.js`, `analysis-worker.js`, `analytics.js`, `capabilities.js`, `src/ai.cjs` | Channel robust; identical repeated outputs; ≥95/100 noise seeds chance-labeled; 50k skip/responsiveness checked. Numeric evaluation uses precomputed tied ranks. |
| **3.2 No-pattern fixture** | Independent latent tenure, missing only below eight months; reproducible sample generator without weakening thresholds. | `scripts/generate_no_pattern_demo.cjs`, `sales_orders.csv` | Seed 44 yields 121 gaps and weak/none effects across all 13 comparisons. Other sales fields remain unchanged. |
| **4.1 Naming** | Active history links and closed-finding notifications say Decisions. | `review-ui.js`, `app.js` | Notification and live navigation checks pass. Internal serialized `changes` keys remain compatible rather than being renamed as data fields. |
| **4.2 Strict group preset** | Strict single-group median now uses shared group-wise computation/provenance with strict=true, minObserved=1, no widening/global fallback. | `analysis-engine.js`, `cleaning-engine.js`, `review.js`, `workspace.js` | Median 15; empty group blocked; zero fallback; common trace; old `groupMedian` restoration and regression tests pass. Distinct strict purpose retained in the UI. |
| **4.3 Manual methods** | Group-wise/KNN offered when a numeric manual selection contains missing records. | `review.js` | Missing selection exposes methods; fully present selection does not. Existing manual workflow remains tested. |
| **4.4 Scorecard** | Nonblank validity against all relevant active rules, No rules when absent; dominant spelling/date-format consistency; background working profile and source/working JSON/HTML artifacts. | `capabilities-engine.js`, `capabilities.js`, `workspace.js` | 66.7% source versus 100% corrected validity, spelling/date consistency, no-rules and artifact checks pass. IDs/numerical measures receive no fabricated text consistency score. |

## Verification

Run the timing-sensitive checks separately:

- `node --test scripts/verify_quality.cjs scripts/verify_cleaning.cjs scripts/verify_pattern.cjs scripts/verify_next_capabilities.cjs`
- `node --test scripts/verify_analysis.cjs`
- `node scripts/verify_next_performance.cjs`

Browser checks use the existing external Playwright setup:

- `scripts/verify_ui.cjs`: six widths, five stages, blocked records, stale preview,
  manual review, project restore, sample fills, rollback and export.
- `scripts/verify_analytics_ui.cjs`: existing comparison/similar-fill flow.
- `scripts/verify_value_review_ui.cjs`: one-by-one meanings, legitimate zero,
  contextual negatives, classification/treatment separation.
- `scripts/verify_next_capabilities_ui.cjs`: new desktop/mobile suggestion, KPI,
  candidate/promotion, record/band/dependency, persistence/export/scorecard flow,
  plus 50,000-row background business work and explicit permutation skip.

`BASE_URL` verifies a hosted runtime. `ARTIFACT_DIR` captures desktop/mobile views.

Measured comparison + held comparison + KPI latency on the cached 1,000 × 15
sample was **102.0 ms**, below the 200 ms budget. The separate cold analytical
check completed in **97.9 ms**. Preparation follows import/local
profiling and reuses per-column masks/sorted values. Permutations and larger
business/record computations remain in a background worker.

## Guarantees and compatibility

- Source snapshots remain intact; every physical edit/removal still needs the
  explicit scoped preview and approval. Promotion does not create a decision.
- Present-row inspection never changes treatment scope; bounded displays do not
  limit full counts, approvals, or persisted provenance.
- Not applicable is distinct from missing. Blank/unavailable inputs are never
  fabricated as numerical zeros. Strict empty groups stay blocked.
- Scope/definition/data changes invalidate transient comparisons; draft changes
  invalidate old proposed record lenses. Blocked/constraint acknowledgment and
  later-patch-preserving rollback retain their existing safeguards.
- KPI and accepted-suggestion definitions persist in the existing project/rule
  format. Older backups default optional new fields and retain old operation IDs.
- Approved KPI results and fill traces are present in structured decision logs.
  CSV is a flattened audit view, while cleaned CSV offers explicit estimate flags.
- AI receives only allowlisted aggregate summaries, including robust direction,
  excluded-N/A counts and permutation labels. Advice never executes changes.
- The old analytical overlap checker now excludes boxes inside closed disclosures,
  avoiding false-positive overlap reports for nonvisible controls.

## Scope not rebuilt or intentionally excluded

- Existing metric refresh, source-preserving meaning review, approval staleness,
  rollback replay, and basic saving were reused.
- Strict group behavior remains a preset because no fallback is a meaningful
  distinction; the underlying computation and new provenance are shared.
- Full versioned branches, joins, Excel, accounts/cloud sync and visual redesign
  remain outside this pass, as specified.
