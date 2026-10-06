const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const cleaning = require("../cleaning-engine.js");
const analysis = require("../analysis-engine.js");
const capabilities = require("../capabilities-engine.js");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const parser = vm.createContext({});
vm.runInContext(app.slice(app.indexOf("function parseCsv("), app.indexOf("function csvText(")), parser);
function sample(name) { parser.csv = fs.readFileSync(path.join(root, name), "utf8"); return JSON.parse(JSON.stringify(vm.runInContext("parseCsv(csv)", parser))); }
function workspace(csv) {
  const nodes = new Map(), node = selector => { if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "", textContent: "", value: "", classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll() { return []; } }); return nodes.get(selector); };
  const context = vm.createContext({ document: { querySelector: node, querySelectorAll: () => [] }, fetch: async () => ({ ok: true, json: async () => ({ available: false }) }), console, setTimeout() {}, URL, Blob });
  for (const file of ["cleaning-engine.js", "analysis-engine.js", "capabilities-engine.js", "spreadsheet.js", "workspace.js", "review.js", "review-ui.js", "value-review.js", "capabilities.js", "app.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const run = code => vm.runInContext(code, context); run("render = () => {}; globalThis.approve = item => { state.reviewStep = 5; const draft = reviewDraft(item); draft.previewFingerprint = guidedFingerprint(item, draft); approveGuidedDecision(item); };"); context.csv = csv; run('loadData(csv, "next.csv")');
  return { run, value: expression => JSON.parse(run(`JSON.stringify(${expression})`)), context };
}
test("1.1 robust ranks expose tenure no-pattern and retain delivery/channel direction", () => {
  const { headers, rows } = sample("sales_orders.csv"), options = { revision: 1 };
  const tenure = analysis.compare(headers, rows, "customer_tenure_months", options);
  assert.equal(tenure.results.find(result => result.column === "quantity").strength, "weak");
  assert.ok(tenure.results.find(result => result.column === "quantity").cliffsDelta < 0);
  // The dedicated 3.2 assertion below verifies the independent regenerated fixture.
  const delivery = analysis.compare(headers, rows, "delivery_days", options);
  assert.equal(delivery.results.find(result => result.column === "channel").strength, "strong");
  const quantity = delivery.results.find(result => result.column === "quantity");
  assert.equal(quantity.directionText, "higher in missing group"); assert.ok(quantity.cliffsDelta > 0);
  assert.ok(Number.isFinite(quantity.winsorizedSmd));
  assert.ok(["explained", "partial"].includes(analysis.holdSimilar(headers, rows, "delivery_days", "quantity", "channel", {}, options).verdict));
  assert.equal(analysis.cliffsDelta([1, 2], [2, 3]), -.75);
  const large = Array.from({ length: 20000 }, (_, index) => index);
  const start = performance.now(); analysis.cliffsDelta(large, large); assert.ok(performance.now() - start < 200);
});
test("1.2 shared states exempt not-applicable records and include source-preserving NULL gaps", () => {
  const w = workspace("id,x,trigger\n1,NULL,yes\n2,NULL,yes\n3,,yes\n4,10,yes\n5,20,yes\n6,0,yes");
  w.run('const tokens = state.issues.find(item => item.candidate?.kind === "missing_token"); Object.assign(reviewDraft(tokens), { operation: "classify", interpretation: "missing", scope: { mode: "selected", rowIds: [1] } }); approve(tokens); Object.assign(reviewDraft(tokens), { operation: "classify", interpretation: "not_applicable", scope: { mode: "selected", rowIds: [2] } }); approve(tokens); globalThis.rule = { column: "x", type: "number", required: true, minimum: null, maximum: null, allowed: [] };');
  assert.equal(w.value("state.rows.filter(row => schemaProblems(row, rule).length).length"), 2);
  assert.equal(w.value('state.rows.filter(row => relationProblem(row, { kind: "requiredIf", left: "trigger", value: "yes", column: "x" })).length'), 2);
  const result = w.value('AnalysisEngine.compare(state.headers, state.rows, "x", { classifications: effectiveClassifications() })');
  assert.equal(result.nMissing, 2); assert.equal(result.nPresent, 3); assert.equal(result.excludedNotApplicable, 1);
  assert.deepEqual(w.value('state.rows.map(row => observationState(row, "x"))'), ["missing", "not_applicable", "blank_unreviewed", "present", "present", "present"]);
  assert.deepEqual(cleaning.scopeRows([{ _row: 1, x: "0" }], [1], { mode: "condition", column: "x", operator: ">=", value: "0" }, { classifications: [{ rowId: 1, column: "x", value: "0", meaning: "not_applicable" }] }), []);
});
test("1.3 percentile preview keeps the 95% typo outside the central discount bins", () => {
  const { headers, rows } = sample("sales_orders.csv"), ids = rows.filter(row => !row.discount_pct.trim()).map(row => row._row);
  const preview = cleaning.treatment(headers, rows, ids, "discount_pct", { operation: "median", decimals: 2 });
  const before = rows.filter(row => row.discount_pct.trim()).map(row => Number(row.discount_pct));
  const after = before.concat(preview.patches.map(patch => Number(patch.after)));
  const hist = analysis.histogram([before, after]);
  assert.equal(hist.bins, 16); assert.ok(hist.max < 95); assert.ok(hist.sets[0].above > 0); assert.ok(hist.trueMax >= 95);
  assert.ok(hist.sets[0].counts.filter(Boolean).length >= 8);
  const spike = Math.min(15, Math.floor((Number(preview.patches[0].after) - hist.min) / (hist.max - hist.min) * 16));
  assert.equal(hist.sets[1].counts[spike] - hist.sets[0].counts[spike], preview.patches.length);
});
test("2.1 affected/present record lens groups channel without expanding treatment scope", () => {
  const { headers, rows } = sample("sales_orders.csv"), ids = rows.filter(row => !row.delivery_days.trim()).map(row => row._row);
  const preview = cleaning.treatment(headers, rows, ids, "delivery_days", { operation: "groupwise", similar: { columns: ["channel"] }, decimals: 2 });
  const result = capabilities.recordView(headers, rows, "delivery_days", { mode: "both", holdColumn: "channel", comparisonColumn: "quantity", preview });
  assert.ok(result.displayedCount <= 100); assert.equal(result.totalRecords, 1000);
  assert.equal(result.bands.find(band => band.label === "Distributor").fillValue, 4.3);
  assert.equal(result.bands.find(band => band.label === "Online").fillValue, 4.5);
  assert.equal(result.bands.find(band => band.label === "Retail store").nMissing, 0);
  assert.ok(result.bands.every(band => band.rows.some(row => row.state === "present")));
  assert.equal(preview.selectedIds.length, 86); assert.ok(rows.every(row => typeof row.delivery_days === "string"));
});
test("2.2 group impact lenses preserve the global chart and zero-fill Retail band", () => {
  const { headers, rows } = sample("sales_orders.csv"), ids = rows.filter(row => !row.delivery_days.trim()).map(row => row._row);
  const preview = cleaning.treatment(headers, rows, ids, "delivery_days", { operation: "groupwise", similar: { columns: ["channel"] }, decimals: 2 });
  const result = capabilities.bandImpact(headers, rows, "delivery_days", preview, { holdColumn: "channel" });
  assert.equal(result.bands.find(band => band.label === "Distributor").filledCount, 54);
  assert.equal(result.bands.find(band => band.label === "Online").filledCount, 32);
  assert.equal(result.bands.find(band => band.label === "Retail store").filledCount, 0);
  assert.ok(result.bands.every(band => band.histogram.min === result.globalHistogram.min && band.histogram.max === result.globalHistogram.max));
});
test("2.3 transient candidates use identical snapshot, scope, bins and count scales", () => {
  const { headers, rows } = sample("sales_orders.csv"), before = JSON.stringify(rows), ids = rows.filter(row => !row.delivery_days.trim()).map(row => row._row);
  const drafts = ["median", "mean", "groupwise"].map(operation => ({ operation, decimals: 2, scope: { mode: "all" }, similar: { columns: ["channel"] } }));
  const result = capabilities.compareCandidates(headers, rows, "delivery_days", ids, drafts);
  assert.equal(Number(result.candidates[0].preview.patches[0].after), 2.9);
  assert.equal(Number(result.candidates[1].preview.patches[0].after), 3.17);
  assert.deepEqual([...new Set(result.candidates[2].preview.patches.map(patch => Number(patch.after)))].sort(), [4.3, 4.5]);
  assert.ok(result.candidates.every(candidate => candidate.histogram.min === result.candidates[0].histogram.min && candidate.histogram.max === result.candidates[0].histogram.max && candidate.histogram.countScale === result.countScale));
  assert.equal(JSON.stringify(rows), before); assert.equal(result.transient, true);
});
test("2.4 ROAS changes differ for median/mean fills and KPI definitions round-trip", () => {
  const { headers, rows } = sample("marketing_campaigns.csv"), ids = rows.filter(row => !row.spend_usd.trim()).map(row => row._row), kpis = capabilities.suggestedKpis(headers);
  const result = capabilities.compareCandidates(headers, rows, "spend_usd", ids, ["median", "mean"].map(operation => ({ operation, decimals: 2 })), { kpis });
  const a = result.candidates[0].kpiImpact[0], b = result.candidates[1].kpiImpact[0];
  assert.notDeepEqual(a.groups.map(group => group.after), b.groups.map(group => group.after));
  assert.ok(a.groups.some(group => !group.total && a.headline.includes(group.label))); assert.ok(a.groups.some(group => group.flagged));
  const w = workspace("id,amount,group\n1,,A\n2,10,A\n3,20,B");
  w.run('applyRuleConfig({ ...exportRuleConfig(), kpis: [{ id: "k", name: "Average", metric: "amount", aggregation: "mean", groupBy: "group" }] }); globalThis.item = state.issues.find(item => item.recommendation === "impute"); Object.assign(reviewDraft(item), { operation: "median", interpretation: "missing" }); approve(item); restoreProject(serializeProject());');
  assert.equal(w.value("state.ruleConfig.kpis.length"), 1); assert.equal(w.value("state.changes[0].treatment.kpiImpact.length"), 1);
  const namedTotal = capabilities.kpiImpact(["x", "group"], [{ _row: 1, x: "2", group: "Total" }, { _row: 2, x: "3", group: "Other" }], { patches: [] }, [{ id: "total-safe", metric: "x", aggregation: "sum", groupBy: "group" }]);
  assert.equal(namedTotal[0].groups.find(group => group.total).before, 5);
  assert.equal(namedTotal[0].groups.find(group => group.key.startsWith("group:") && group.label === "Total").before, 2);
});
test("2.5 export flags follow active fills, survive overlapping edits, and guard formulas", () => {
  const { headers, rows } = sample("sales_orders.csv"), original = structuredClone(rows), ids = rows.filter(row => !row.delivery_days.trim()).map(row => row._row);
  const draft = { operation: "groupwise", similar: { columns: ["channel"] }, decimals: 2 };
  const preview = cleaning.treatment(headers, rows, ids, "delivery_days", draft);
  const working = capabilities.proposedRows(rows, preview);
  const changes = [{ treatment: { ...draft, fillMetadata: preview.fillMetadata }, patches: preview.patches }];
  const output = capabilities.exportData(headers, working, changes, original, { includeMethods: true });
  assert.equal(output.rows.filter(row => row.delivery_days_imputed === "1").length, 86);
  assert.ok(!output.headers.includes("cost_usd_imputed"));
  assert.equal(output.rows.find(row => row.delivery_days_imputed === "1").delivery_days_imputation_method, "group");
  assert.ok(!capabilities.exportData(headers, original, [], original).headers.includes("delivery_days_imputed"));
  assert.equal(capabilities.safeCsvValue("=SUM(A1:A2)"), "'=SUM(A1:A2)"); assert.equal(capabilities.safeCsvValue("@evil"), "'@evil");
  assert.equal(capabilities.safeCsvValue("-4.2"), "-4.2"); assert.equal(capabilities.safeCsvValue("+2e3"), "+2e3");
  const w = workspace(fs.readFileSync(path.join(root, "sales_orders.csv"), "utf8"));
  w.run('globalThis.delivery = state.issues.find(item => item.column === "delivery_days" && item.recommendation === "impute"); Object.assign(reviewDraft(delivery), { operation: "groupwise", interpretation: "missing", similar: { columns: ["channel"] } }); approve(delivery); globalThis.cost = state.issues.find(item => item.column === "cost_usd" && item.recommendation === "impute"); Object.assign(reviewDraft(cost), { operation: "mean", interpretation: "missing" }); approve(cost); rollbackChange(state.changes[0].id); globalThis.exported = CapabilitiesEngine.exportData(state.headers, state.rows, state.changes, state.original);');
  assert.equal(w.value('exported.rows.filter(row => row.delivery_days_imputed === "1").length'), 86);
  assert.ok(!w.value("exported.headers").includes("cost_usd_imputed"));
  const equalEstimate = capabilities.exportData(["x"], [{ _row: 1, x: "0" }], [
    { treatment: { operation: "median" }, interpretationValues: [{ rowId: 1, column: "x", value: "0", meaning: "resolved" }], patches: [] },
    { treatment: { operation: "classify" }, interpretationValues: [{ rowId: 1, column: "x", value: "0", meaning: "missing" }], patches: [] }
  ], [{ _row: 1, x: "0" }]);
  assert.equal(equalEstimate.rows[0].x_imputed, "1");
});
test("2.6 opt-in suggestions validate at least 80% of usable rows on each sample", () => {
  const sales = sample("sales_orders.csv"), suggestions = capabilities.suggestedRules(sales.headers, sales.rows);
  assert.ok(suggestions.some(suggestion => suggestion.kind === "metrics" && suggestion.rule.target === "profit_usd"));
  assert.ok(suggestions.some(suggestion => suggestion.rule.column === "customer_rating"));
  const days = suggestions.find(suggestion => suggestion.rule.column === "delivery_days"); assert.ok(days && days.passRate >= .8);
  const w = workspace(fs.readFileSync(path.join(root, "sales_orders.csv"), "utf8")); w.context.definition = days.rule;
  w.run('applyRuleConfig({ ...exportRuleConfig(), schema: [definition], acceptedSuggestions: [{ id: "days", ruleId: definition.id, passRate: .99 }] }); restoreProject(serializeProject());');
  assert.ok(w.value('state.issues.some(item => item.recommendation === "schema" && item.column === "delivery_days" && item.rows.some(row => row.delivery_days === "-3.0" || row.delivery_days === "-3"))'));
  assert.equal(w.value("state.ruleConfig.acceptedSuggestions.length"), 1);
  const marketing = sample("marketing_campaigns.csv"), marketingRules = capabilities.suggestedRules(marketing.headers, marketing.rows);
  assert.ok(marketingRules.some(suggestion => suggestion.rule.target === "roas")); assert.ok(marketingRules.some(suggestion => suggestion.rule.target === "cpc_usd"));
  const healthcare = sample("healthcare_patient_visits.csv"); assert.ok(capabilities.suggestedRules(healthcare.headers, healthcare.rows).some(suggestion => suggestion.rule.column === "age"));
});
test("2.7 cost-fill preview warns and approval refreshes profit without recalculating", () => {
  const w = workspace(fs.readFileSync(path.join(root, "sales_orders.csv"), "utf8"));
  w.run('globalThis.profitRule = CapabilitiesEngine.suggestedRules(state.headers, state.rows).find(suggestion => suggestion.rule.target === "profit_usd").rule; applyRuleConfig({ ...exportRuleConfig(), metrics: [profitRule] }); globalThis.item = state.issues.find(item => item.column === "cost_usd" && item.recommendation === "impute"); Object.assign(reviewDraft(item), { operation: "median", interpretation: "missing" }); globalThis.beforeProfit = state.rows.map(row => row.profit_usd); globalThis.preview = guidedPreview(item);');
  assert.ok(w.value("preview.dependencyImpact[0].violatingRowIds.length") > 0);
  w.run("approve(item)"); assert.deepEqual(w.value("state.rows.map(row => row.profit_usd)"), w.value("beforeProfit"));
  assert.ok(w.value('state.issues.some(item => item.status === "open" && item.recommendation === "metric" && item.column === "profit_usd")'));
  assert.ok(w.value("state.dependencyFollowUps.length") > 0);
});
test("3.1 deterministic permutations support channel and calibrate synthetic noise", () => {
  const { headers, rows } = sample("sales_orders.csv"), options = { revision: 1 };
  const compared = analysis.compare(headers, rows, "delivery_days", options);
  const selected = { ...compared, results: compared.results.filter(result => result.column === "channel") };
  const result = analysis.significance(headers, rows, "delivery_days", selected, options);
  assert.equal(result.results[0].significance, "robust"); assert.deepEqual(analysis.significance(headers, rows, "delivery_days", selected, options), result);
  let chance = 0;
  for (let seed = 1; seed <= 100; seed++) {
    let random = seed; const noise = rows.map(row => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return { _row: row._row, target: row.delivery_days, noise: String(random / 4294967296) }; });
    const context = { revision: seed, permutationSeed: seed };
    const ranked = analysis.compare(["target", "noise"], noise, "target", context);
    const tested = analysis.significance(["target", "noise"], noise, "target", ranked, context);
    if (tested.results[0].significance === "could be chance") chance++;
  }
  assert.ok(chance >= 95, `${chance}% of random seeds should be chance-level`);
});
test("3.2 bundled tenure demonstrates no-pattern under unchanged robust thresholds", () => {
  const { headers, rows } = sample("sales_orders.csv");
  const result = analysis.compare(headers, rows, "customer_tenure_months");
  assert.equal(result.pattern, "none_detected"); assert.ok(result.results.every(entry => ["weak", "none"].includes(entry.strength)));
});
test("4.1 visible closed-finding notification uses Decisions", () => {
  const w = workspace("x\n1\n2\n"); w.run('globalThis.message = ""; notify = value => { message = value; }; openIssue(999999)');
  assert.ok(w.value("message").includes("Decisions"));
});
test("4.2 strict group median is the shared no-fallback groupwise preset", () => {
  const rows = [{ _row: 1, x: "10", group: "A" }, { _row: 2, x: "20", group: "A" }, { _row: 3, x: "", group: "A" }, { _row: 4, x: "", group: "B" }];
  const preview = cleaning.treatment(["x", "group"], rows, [3, 4], "x", { operation: "groupMedian", groupColumn: "group", decimals: 2 });
  assert.equal(preview.patches[0].after, "15.00"); assert.equal(preview.blocked[0].rowId, 4);
  assert.equal(preview.fillMetadata.method, "groupwise"); assert.equal(preview.fillMetadata.params.strict, true); assert.equal(preview.fillMetadata.fallbackCount, 0);
  const w = workspace("id,x,group\n1,10,A\n2,20,A\n3,,A");
  w.run('const item = state.issues.find(item => item.recommendation === "impute"); Object.assign(reviewDraft(item), { operation: "groupMedian", groupColumn: "group", interpretation: "missing" }); approve(item); restoreProject(serializeProject());');
  assert.equal(w.value("state.changes[0].treatment.operation"), "groupMedian");
});
test("4.3 manual corrections expose similar-row fills only for numeric missing selections", () => {
  const w = workspace("id,x,group\n1,,A\n2,10,A\n3,20,B");
  w.run('globalThis.missing = issue(90, "x", "Manual", "Manual", [state.rows[0]], "medium", "Review", "manual"); globalThis.present = { ...missing, rows: [state.rows[1]] };');
  assert.ok(w.value("reviewOperations(missing)").includes("groupwise")); assert.ok(w.value("reviewOperations(missing)").includes("knn"));
  assert.ok(!w.value("reviewOperations(present)").includes("knn"));
});
test("4.4 scorecards measure active-rule validity and dominant representation consistency", () => {
  const rows = [{ _row: 1, age: "20", label: "Active", date: "2025-01-01" }, { _row: 2, age: "150", label: "active", date: "01/02/2025" }, { _row: 3, age: "30", label: "Active", date: "2025-01-03" }];
  const rules = { schema: [{ column: "age", type: "integer", required: false, minimum: 0, maximum: 120, allowed: [] }] };
  const result = capabilities.qualityScorecard(["age", "label", "date"], rows, rules);
  assert.equal(result[0].validity, 2 / 3 * 100); assert.equal(result[1].hasRules, false); assert.equal(result[1].consistency, 2 / 3 * 100);
  assert.equal(result[2].consistency, 2 / 3 * 100);
  const w = workspace("id,age,label\n1,20,Active\n2,150,active\n3,30,Active"); w.context.rules = rules;
  w.run('applyRuleConfig({ ...exportRuleConfig(), ...rules }); globalThis.item = state.issues.find(item => item.recommendation === "schema"); Object.assign(reviewDraft(item), { operation: "constant", value: "40", interpretation: "error" }); approve(item);');
  assert.equal(w.value('qualityReportData().scorecards.working.find(entry => entry.column === "age").validity'), 100);
  assert.equal(w.value('qualityReportData().scorecards.source.find(entry => entry.column === "age").validity'), 2 / 3 * 100);
  assert.ok(w.value("qualityReportHtml()").includes("Source and working quality scorecard"));
});
