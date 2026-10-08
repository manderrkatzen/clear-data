const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const ai = require("../src/ai.cjs");
const root = path.resolve(__dirname, "..");

function workspace() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "", textContent: "", value: "", classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll() { return []; } });
    return nodes.get(selector);
  };
  const context = vm.createContext({ document: { querySelector: node, querySelectorAll: () => [] }, fetch: async () => ({ ok: true, json: async () => ({ available: false }) }), setTimeout() {}, console, URL, Blob });
  vm.runInContext(fs.readFileSync(path.join(root, "cleaning-engine.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "analysis-engine.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "capabilities-engine.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "spreadsheet.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "workspace.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "review.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "review-ui.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
  vm.runInContext("render = () => {};", context);
  const run = (code) => vm.runInContext(code, context);
  const load = (text) => { context.inputCsv = text; return run('loadData(inputCsv, "test.csv")'); };
  const value = (code) => JSON.parse(run(`JSON.stringify(${code})`));
  return { context, nodes, node, run, load, value };
}

test("CSV preserves multiline/quoted content and round-trips escaped headers", () => {
  const w = workspace();
  assert.equal(w.load('\uFEFF"customer,name","notes\"\"detail",amount\r\n"A, Inc.","line one\nline \"\"two\"\"",12\r\nB,,0\r\n'), true);
  assert.deepEqual(w.value("state.headers"), ["customer,name", 'notes"detail', "amount"]);
  assert.equal(w.value('state.rows[0][state.headers[1]]'), 'line one\nline "two"');
  assert.deepEqual(w.value("parseCsv(csvText()).rows"), w.value("state.rows"));
  assert.equal(w.value("state.rows[1].amount"), "0");
});

test("malformed imports fail atomically without replacing the workspace", () => {
  const w = workspace();
  w.load("id,value\nA,1\nB,2");
  const before = w.value("state.rows");
  for (const text of ["", "id,id\nA,B", "_row,value\n1,2", "id,\nA,2", 'id,value\nA,"unfinished', 'id,value\nA,"ok"extra', "id,value\nA,2,extra", "id,value\n"]) {
    assert.equal(w.load(text), false);
    assert.deepEqual(w.value("state.rows"), before);
  }
});

test("mean/median and AI fill previews match applied rounded values exactly", () => {
  for (const action of ["imputeMean", "imputeMedian", "custom:test"]) {
    const w = workspace();
    w.load("id,amount\nA,1.234\nB,2.348\nC,3.459\nD,8.762\nE,\nF,");
    w.run('globalThis.item = state.issues.find(item => item.recommendation === "impute"); state.customProposals[item.id] = [{ id: "test", revision: state.datasetRevision, operation: "fill", value: 1.237, interpretation: "test" }];');
    w.context.action = action;
    const preview = w.value("numericSimulation(item, action)");
    w.run("applyFix(item, action)");
    assert.equal(w.value("state.rows[4].amount"), preview.fill.toFixed(2));
    assert.equal(w.value("state.rows[5].amount"), preview.fill.toFixed(2));
    assert.deepEqual(w.value('numericValues("amount")'), preview.after);
    assert.equal(w.value("metrics().changedCells"), 2);
    assert.equal(w.value("metrics().changedRows"), 2);
    w.run("rollbackChange(state.changes[0].id)");
    assert.equal(w.value("metrics().changedCells"), 0);
    assert.equal(w.value('state.issues.find(item => item.recommendation === "impute").status'), "open");
  }
});

test("arbitrary numerical columns each receive an independent reversible outlier review", () => {
  const w = workspace();
  w.load("record,temperature,pressure\nA,1,2\nB,2,3\nC,3,4\nD,4,5\nE,5,6\nF,6,7\nG,100,200");
  assert.deepEqual(w.value('state.issues.filter(item => item.recommendation === "outlier").map(item => item.column)'), ["temperature", "pressure"]);
  const original = w.value("state.rows");
  w.run('globalThis.item = state.issues.find(item => item.column === "pressure"); Object.assign(outlierDraft(item), { method: "percentile", low: 10, high: 90 }); applyFix(item, "valid");');
  assert.deepEqual(w.value("state.rows"), original);
  assert.equal(w.value('state.issues.find(item => item.column === "temperature").status'), "open");
  assert.equal(w.value("state.changes[0].snapshot.definition.method"), "percentile");
  w.run("rollbackChange(state.changes[0].id)");
  assert.equal(w.value('state.issues.filter(item => item.recommendation === "outlier" && item.status === "open").length'), 2);
});

test("record-level numerical previews exactly match approved values and keep source identifiers", () => {
  for (const action of ["imputeMean", "imputeMedian", "keep", "custom:preview"]) {
    const w = workspace();
    w.load("order_id,amount\nA,1.234\nB,2.348\nC,3.459\nD,8.762\nE,\nF,");
    w.context.action = action;
    w.run('globalThis.item = state.issues.find(item => item.recommendation === "impute"); state.customProposals[item.id] = [{ id: "preview", revision: state.datasetRevision, operation: "fill", value: 1.237, interpretation: "test" }]; state.selectedFix = action;');
    const identifiers = w.value("state.rows.map(row => [row._row,row.order_id])");
    const proposed = w.value('item.rows.map(row => affectedValue(item, row, "_proposedNumber"))');
    const ids = w.value("item.rows.map(row => row._row)");
    w.run("applyFix(item, action)");
    assert.deepEqual(w.value(`state.rows.filter(row => ${JSON.stringify(ids)}.includes(row._row)).map(row => row.amount)`), proposed);
    assert.deepEqual(w.value("state.rows.map(row => [row._row,row.order_id])"),identifiers);
  }
  const w = workspace();
  w.load("id,click_through_rate\nA,2.34567\nB,0.3\nC,4\nD,0.1");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "convert"); state.selectedFix = "convert";');
  const proposed = w.value('item.rows.map(row => affectedValue(item, row, "_proposedNumber"))');
  w.run('applyFix(item, "convert")');
  assert.deepEqual(w.value('state.changes[0].patches.map(patch => patch.after)'), proposed);
});

test("no-change approvals remain decisions rather than modified cells", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2\nC,3\nD,4\nE,");
  w.run('applyFix(state.issues.find(item => item.recommendation === "impute"), "keep")');
  assert.equal(w.value("state.changes.length"), 1);
  assert.equal(w.value("metrics().changedRows"), 0);
  assert.equal(w.value("metrics().changedCells"), 0);
  assert.equal(w.value("metrics().blanks"), 1);
  assert.equal(w.value('state.issues.find(item => item.recommendation === "impute").status'), "valid");
});

test("rollback of an older overlapping decision preserves later approved values", () => {
  const w = workspace();
  w.load("id,click_through_rate\nA,1\nB,2\nC,100\nD,4\nE,5\nF,\nG,6");
  w.run('applyFix(state.issues.find(item => item.recommendation === "impute"), "imputeMean"); globalThis.olderId = state.changes[0].id; applyFix(state.issues.find(item => item.recommendation === "convert"), "convert");');
  const later = w.value("state.rows");
  w.run("rollbackChange(olderId)");
  assert.deepEqual(w.value("state.rows"), later);
  assert.equal(w.value("state.auditEvents.at(-1).effects.patches.length"), 0);
  assert.equal(w.value("state.changes.length"), 1);
  w.run("rollbackChange(state.changes[0].id)");
  assert.deepEqual(w.value("state.rows"), w.value("state.original"));
});

test("partial category treatment keeps remaining variants open and preview scope agrees", () => {
  const w = workspace();
  w.load("id,channel\nA,paid_social\nB,paid-social\nC,Paid Social\nD,Email");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "standardize")');
  assert.equal(w.value('categoryImpact(item, "mapOnly").modified'), 1);
  w.run('applyFix(item, "mapOnly")');
  assert.equal(w.value("item.status"), "open");
  assert.equal(w.value("item.rows.length"), 1);
  w.run('applyFix(item, "standardize")');
  assert.equal(w.value("metrics().changedCells"), 2);
  assert.equal(w.value("metrics().changedRows"), 2);
});

test("date application validates all dates before any mutation", () => {
  const w = workspace();
  w.load("id,launch_date,channel\nA,3/7/2025,Email\nB,2/30/2025,Email");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "date"); applyFix(item, "date")');
  assert.equal(w.value("state.changes.length"), 0);
  assert.equal(w.value("state.rows[0].launch_date"), "3/7/2025");
  assert.equal(w.value("isoDate('2/29/2024')"), "2024-02-29");
   assert.deepEqual(w.value("state.rows.map(row => [row._row,row.id])"),[[1,"A"],[2,"B"]]);
});

test("cross-column rules and numeric filters do not equate missing values with zero", () => {
  const w = workspace();
  w.load("id,clicks,impressions\nA,5,\nB,8,4\nC,0,0\nD,1,10");
  assert.deepEqual(w.value('state.issues.find(item => item.type === "Cross-column violation").rows.map(row => row._row)'), [2]);
  assert.equal(w.run('match({ value: "" }, { column: "value", operator: "=", value: "0" })'), false);
  assert.equal(w.run('match({ value: "" }, { column: "value", operator: ">=", value: "0" })'), false);
});

test("outlier approval uses the displayed draft and saved evidence uses its method", () => {
  const w = workspace();
  w.load("id,amount,region\nA,1,North\nB,2,South\nC,3,North\nD,4,North\nE,100,South");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "outlier"); Object.assign(outlierDraft(item), { method: "threshold", upper: "3" });');
  assert.equal(w.value("activeRows(item).length"), 2);
  w.run('issueFilter(item).conditions = [{ column: "region", operator: "=", value: "South" }];');
  assert.equal(w.value("filteredIssueRows(item).length"), 1);
  w.run('applyFix(item, "valid")');
  assert.equal(w.value("state.changes[0].rows.length"), 2);
  assert.equal(w.value("item.outlier.method"), "threshold");
  assert.match(w.value("sheetInspection(item, item.rows[0]).title"), /threshold/);
  assert.equal(w.value("metrics().changedCells"), 0);
});

test("invalid statistical parameters cannot be saved or approved", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2\nC,3\nD,4\nE,100");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "outlier")');
  for (const definition of [{ method: "iqr", multiplier: -1 }, { method: "zscore", zScore: 0 }, { method: "percentile", low: 90, high: 10 }, { method: "threshold", lower: 10, upper: 2 }, { method: "custom", field: "amount", operator: ">", value: "wrong" }]) {
    w.context.definition = definition;
    w.run("Object.assign(outlierDraft(item), definition)");
    assert.ok(w.value("previewOutlier(item).error"));
    assert.equal(w.run("saveOutlierRule(item)"), false);
    w.run('applyFix(item, "valid")');
    assert.equal(w.value("state.changes.length"), 0);
  }
});

test("exact record navigation clears filters without substituting a text query", () => {
  const w = workspace();
  w.load("id,value\nA,999\nB,888");
  w.run('state.query = "unrelated"; state.flaggedOnly = true; locateRecord(2)');
  assert.equal(w.value("state.locateRow"), 2);
  assert.equal(w.value("state.query"), "");
  assert.equal(w.value("state.flaggedOnly"), false);
  assert.equal(w.value("state.screen"), "view");
});

test("dataset and AI-provided content is escaped before HTML interpolation", () => {
  const w = workspace();
  assert.equal(w.run('escapeHtml("<img src=x>")'), "&lt;img src=x&gt;");
  assert.equal(w.run('escapeHtml(`"quoted" & <script>`)'), "&quot;quoted&quot; &amp; &lt;script&gt;");
});

test("a proposal response for a replaced dataset cannot enter the new workspace", async () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2\nC,3\nD,4\nE,");
  w.run("renderIssues = () => {};");
  w.node("#aiInstruction").value = "Fill with one.";
  let finish;
  w.context.fetch = () => new Promise((resolve) => { finish = resolve; });
  const pending = w.run('requestProposal(state.issues.find(item => item.recommendation === "impute"))');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(w.value("state.proposalPending"), true);
  w.load("id,value\nNEW,7");
  finish({ ok: true, json: async () => ({ provider: "test", proposal: { operation: "fill_missing", column: "amount", value: 1 } }) });
  await pending;
  assert.deepEqual(w.value("state.customProposals"), {});
  assert.equal(w.value("state.proposalPending"), false);
  assert.equal(w.value("state.rows[0].id"), "NEW");
});

test("all bundled samples load, treat a numerical blank, roll back and export", () => {
  for (const file of ["healthcare_patient_visits.csv", "sales_orders.csv", "marketing_campaigns.csv"]) {
    const w = workspace();
    assert.equal(w.load(fs.readFileSync(path.join(root, file), "utf8")), true);
    assert.equal(w.value("state.rows.length"), 1000);
    w.run('globalThis.item = state.issues.find(item => item.recommendation === "impute"); applyFix(item, "imputeMedian")');
    assert.ok(w.value("metrics().changedCells") > 0);
    w.run("rollbackChange(state.changes[0].id)");
    assert.equal(w.value("metrics().changedCells"), 0);
    assert.deepEqual(w.value("parseCsv(csvText()).rows"), w.value("state.original"));
  }
});

test("exact duplicate removal is previewed, reversible and counted separately", () => {
  const w = workspace();
  w.load("id,amount\nA,10\nA,10\nB,20\nB,20\nC,30");
  assert.equal(w.value("duplicateProfile().removeRows.length"), 2);
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "duplicates"); state.decisionNotes[item.id] = "Confirmed repeated export records"; applyFix(item, "removeDuplicates")');
  assert.deepEqual(w.value("state.rows.map(row => row._row)"), [1, 3, 5]);
  assert.equal(w.value("metrics().removedRows"), 2);
  assert.equal(w.value("metrics().changedCells"), 0);
  assert.equal(w.value("state.auditEvents[0].decision.removedRows.length"), 2);
  assert.equal(w.value("state.auditEvents[0].decision.note"), "Confirmed repeated export records");
  w.run("rollbackChange(state.changes[0].id)");
  assert.deepEqual(w.value("state.rows"), w.value("state.original"));
  assert.equal(w.value("state.auditEvents.length"), 2);
  assert.equal(w.value("state.auditEvents[1].kind"), "rollback");
  assert.equal(w.value("state.auditEvents[1].effects.restoredRows.length"), 2);
});

test("conflicting business-key duplicates need acknowledgement and skip blank keys", () => {
  const w = workspace();
  w.load("id,amount\nA,10\nA,11\n,10\n,10\nB,20");
  w.run('state.ruleConfig.duplicates = { mode: "key", columns: ["id"] }; refreshIssues(); globalThis.item = state.issues.find(item => item.recommendation === "duplicates")');
  assert.equal(w.value("duplicateProfile().conflicts"), 1);
  assert.equal(w.value("duplicateProfile().skipped"), 2);
  w.run('applyFix(item, "removeDuplicates")');
  assert.equal(w.value("state.changes.length"), 0);
  w.run('item.acknowledged = true; applyFix(item, "removeDuplicates")');
  assert.deepEqual(w.value("state.rows.map(row => row._row)"), [1, 3, 4, 5]);
});

test("rollback after row removal preserves other approvals and restores row identity", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nA,1\nB,2\nC,3\nD,4\nE,");
  w.run('applyFix(state.issues.find(item => item.recommendation === "duplicates"), "removeDuplicates"); globalThis.removal = state.changes[0].id; applyFix(state.issues.find(item => item.recommendation === "impute"), "imputeMean")');
  const fill = w.value("state.rows.find(row => row._row === 6).amount");
  w.run("rollbackChange(removal)");
  assert.equal(w.value("state.rows.length"), 6);
  assert.equal(w.value("state.rows.find(row => row._row === 6).amount"), fill);
  assert.equal(w.value("metrics().removedRows"), 0);
});

test("schema checks distinguish type/range/required/allowed-value problems without mutation", () => {
  const w = workspace();
  w.load("id,rating,date,category\nA,6,2025-02-30,Other\nB,,2024-02-29,Valid\nC,3.5,2025-01-01,Valid");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), schema: [{ id: "rating", column: "rating", type: "integer", required: true, minimum: 1, maximum: 5, allowed: [] }, { id: "date", column: "date", type: "date", required: false, minimum: null, maximum: null, allowed: [] }, { id: "category", column: "category", type: "category", required: false, minimum: null, maximum: null, allowed: ["Valid"] }] })');
  assert.equal(w.value('state.issues.find(item => item.ruleId === "rating").rows.length'), 3);
  assert.equal(w.value('state.issues.find(item => item.ruleId === "date").rows.length'), 1);
  assert.equal(w.value('state.issues.find(item => item.ruleId === "category").rows.length'), 1);
  assert.equal(w.value("metrics().changedCells"), 0);
  assert.equal(w.value("state.changes.length"), 0);
  assert.equal(w.run('validIsoDate("2024-02-29")'), true);
});

test("metric rules preview exact rounded targets, isolate missing inputs and approve explicitly", () => {
  const w = workspace();
  w.load("id,revenue,cost,profit\nA,100,30,1\nB,200,60,140\nC,,20,9\nD,20,0,");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), metrics: [{ id: "profit", name: "Profit reconciliation", target: "profit", left: "revenue", right: "cost", operation: "difference", factor: 1, decimals: 2, tolerance: 0.01 }] }); globalThis.item = state.issues.find(item => item.recommendation === "metric")');
  assert.deepEqual(w.value("item.rows.map(row => row._row)"), [1, 4]);
  assert.equal(w.value("metrics().changedCells"), 0);
  assert.equal(w.value('state.issues.find(item => item.recommendation === "metricBlocked").rows.length'), 1);
  assert.equal(w.value("metricResult(state.rows[0], item.rule).value"), "70.00");
  w.run('applyFix(item, "recalculateMetric")');
  assert.equal(w.value("state.rows[0].profit"), "70.00");
  assert.equal(w.value("state.rows[2].profit"), "9");
  assert.equal(w.value("metrics().changedCells"), 2);
  w.run("rollbackChange(state.changes[0].id)");
  assert.equal(w.value("state.rows[0].profit"), "1");
});

test("ratio rules never turn zero denominators or missing inputs into fabricated values", () => {
  const w = workspace();
  w.load("id,clicks,impressions,ctr\nA,1,3,0\nB,0,0,\nC,,100,");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), metrics: [{ id: "ctr", name: "CTR percent", target: "ctr", left: "clicks", right: "impressions", operation: "ratio", factor: 100, decimals: 2, tolerance: 0.01 }] }); globalThis.rule = state.ruleConfig.metrics[0]');
  assert.equal(w.value("metricResult(state.rows[0], rule).value"), "33.33");
  assert.equal(w.value("metricProfile(rule).blocked.length"), 2);
});

test("reusable rules reject missing columns/cycles/invalid parameters atomically", () => {
  const w = workspace();
  w.load("id,a,b,c\nA,1,2,3");
  const before = w.value("state.ruleConfig");
  assert.throws(() => w.run('applyRuleConfig({ ...emptyRuleConfig(), schema: [{ column: "missing", type: "number", required: false, allowed: [] }] })'));
  assert.throws(() => w.run('applyRuleConfig({ ...emptyRuleConfig(), metrics: [{ id: "one", target: "a", left: "b", right: "c", operation: "sum", factor: 1, tolerance: 0, decimals: 2 }, { id: "two", target: "b", left: "a", right: "c", operation: "sum", factor: 1, tolerance: 0, decimals: 2 }] })'));
  assert.throws(() => w.run('applyRuleConfig({ ...emptyRuleConfig(), outliers: [{ column: "a", definition: { method: "iqr", multiplier: -1 } }] })'));
  assert.deepEqual(w.value("state.ruleConfig"), before);
});

test("saved outlier rules apply to another dataset without applying a treatment", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2\nC,3");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), outliers: [{ column: "amount", definition: { ...defaultOutlierDefinition({ column: "amount" }), method: "threshold", upper: "2" } }] })');
  assert.equal(w.value('state.issues.find(item => item.recommendation === "outlier").rows.length'), 1);
  assert.equal(w.value("state.changes.length"), 0);
  assert.equal(w.value("metrics().changedCells"), 0);
});

test("project backup round trip restores removed rows/history/rules and working rollback", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nA,1\nB,2\nC,3\nD,4\nE,");
  w.run('applyFix(state.issues.find(item => item.recommendation === "duplicates"), "removeDuplicates"); applyFix(state.issues.find(item => item.recommendation === "impute"), "imputeMean"); globalThis.backup = serializeProject("Test project")');
  const rows = w.value("state.rows");
  w.load("other,value\nNEW,42");
  w.run("restoreProject(backup)");
  assert.deepEqual(w.value("state.rows"), rows);
  assert.equal(w.value("state.projectName"), "Test project");
  assert.equal(w.value("state.changes.length"), 2);
  assert.equal(w.value("state.projectDirty"), false);
  w.run("rollbackChange(state.changes[0].id); rollbackChange(state.changes[0].id)");
  assert.deepEqual(w.value("state.rows"), w.value("state.original"));
  assert.equal(w.value("state.auditEvents.length"), 4);
});

test("corrupt project data is rejected without replacing the current dataset", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2");
  w.run('globalThis.backup = serializeProject("Test"); backup.rows[0].amount = "999"');
  assert.throws(() => w.run("restoreProject(backup)"), /approved decision history/);
  assert.equal(w.value("state.rows[0].amount"), "1");
});

test("project restore retains valid AI alternatives with a current revision", () => {
  const w = workspace();
  w.load("id,amount\nA,1\nB,2\nC,3\nD,4\nE,");
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "impute"); state.customProposals[item.id] = [{ id: "saved-ai", revision: state.datasetRevision, operation: "fill", value: 12.345, instruction: "Use this constant", interpretation: "Fill after review", assumptions: ["Test"], warnings: ["Check missingness"] }]; globalThis.backup = serializeProject("With proposals")');
  w.load("id,other\nNEW,0");
  w.run('restoreProject(backup); globalThis.restored = state.issues.find(item => item.recommendation === "impute")');
  assert.equal(w.value("state.customProposals[restored.id][0].revision"), w.value("state.datasetRevision"));
  assert.deepEqual(w.value("state.customProposals[restored.id][0].warnings"), ["Check missingness"]);
  w.run('applyFix(restored, "custom:saved-ai")');
  assert.equal(w.value("state.rows[4].amount"), "12.35");
});

test("quality artifacts retain rollback events, notes and escaped content", () => {
  const w = workspace();
  w.load('id,amount\n"<script>alert(1)</script>",1\nB,2\nC,3\nD,4\nE,');
  w.run('globalThis.item = state.issues.find(item => item.recommendation === "impute"); state.decisionNotes[item.id] = "<img src=x> business rationale"; applyFix(item, "keep"); rollbackChange(state.changes[0].id)');
  const report = w.value("qualityReportData()");
  assert.equal(report.activeDecisions.length, 0);
  assert.equal(report.auditEvents.length, 2);
  assert.equal(report.summary.changedCells, 0);
  assert.match(w.run("qualityReportHtml()"), /&lt;img src=x&gt; business rationale/);
  assert.doesNotMatch(w.run("qualityReportHtml()"), /<img src=x>/);
  assert.match(w.run("decisionLogCsv()"), /rollback/);
  assert.equal(w.value("parseCsv(decisionLogCsv()).rows.length"), 2);
});

test("shared API rejects mismatched operations/sources and keeps bounded caveats", () => {
  const numeric = { column: "amount", type: "numeric", allowedOperations: ["fill_missing"], affectedRecords: 2 };
  assert.throws(() => ai.validateRequest({ instruction: "test", context: { ...numeric, allowedOperations: ["delete_rows"] } }));
  assert.throws(() => ai.validatePlan({ operation: "fill_missing", column: "other", value: 0 }, numeric));
  assert.throws(() => ai.validatePlan({ operation: "fill_missing", column: "amount", value: Infinity }, numeric));
  const categorical = { column: "channel", type: "categorical", allowedOperations: ["map_categories"], categoryValues: { paid_social: 2 }, affectedRecords: 2 };
  assert.throws(() => ai.validatePlan({ operation: "map_categories", column: "channel", mapping: {} }, categorical));
  assert.throws(() => ai.validatePlan({ operation: "map_categories", column: "channel", mapping: { other: "Paid Social" } }, categorical));
  const plan = ai.validatePlan({ operation: "fill_missing", column: "amount", value: 0, assumptions: [1, "a", "b", "c", "d"], warnings: ["warning"] }, numeric);
  assert.deepEqual(plan.assumptions, ["a", "b", "c"]);
  assert.equal(plan.requiresConfirmation, true);
});

test("body limits use UTF-8 bytes, including streamed requests", async () => {
  const body = JSON.stringify({ instruction: "é".repeat(40000) });
  await assert.rejects(ai.readPayload(new Request("http://test/api", { method: "POST", body })), (error) => error.status === 413);
});

test("local Ollama uses the shared bounded proposal path and provider status", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "http://127.0.0.1:11434/api/generate");
    assert.ok(options.signal);
    assert.equal(JSON.parse(options.body).stream, false);
    return ai.json({ response: JSON.stringify({ operation: "fill_missing", column: "amount", value: 0, warnings: ["Zero is an assumption"] }) });
  };
  try {
    const env = { AI_MODE: "local", OLLAMA_URL: "http://127.0.0.1:11434" };
    const request = new Request("http://test/api", { method: "POST", headers: { "cf-connecting-ip": "ollama-test" }, body: JSON.stringify({ instruction: "Use zero after review.", context: { column: "amount", type: "numeric", allowedOperations: ["fill_missing"], affectedRecords: 1 } }) });
    const result = await ai.handleProposal(request, env);
    assert.equal(result.status, 200);
    const output = await result.json();
    assert.equal(output.provider, "ollama");
    assert.equal(output.proposal.value, 0);
    assert.equal(ai.providerConfig(env).available, true);
    assert.equal(ai.providerConfig(env).healthChecked, false);
  } finally { global.fetch = originalFetch; }
});

test("Turnstile rejection blocks the provider call", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.ok(options.signal);
    return ai.json({ success: false });
  };
  try {
    const request = new Request("http://test/api", { method: "POST", headers: { "cf-connecting-ip": "turnstile-test" }, body: JSON.stringify({ instruction: "test", turnstileToken: "test-token", context: { column: "amount", type: "numeric", allowedOperations: ["fill_missing"], affectedRecords: 1 } }) });
    const result = await ai.handleProposal(request, { OPENAI_API_KEY: "test-placeholder", TURNSTILE_SECRET_KEY: "test-secret" });
    assert.equal(result.status, 422);
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; }
});

test("Worker and Pages use the same response extraction, limits and errors", async () => {
  const worker = (await import(pathToFileURL(path.join(root, "src/worker.js")))).default;
  const pages = await import(pathToFileURL(path.join(root, "functions/api/ai/proposals.js")));
  const status = await import(pathToFileURL(path.join(root, "functions/api/ai/status.js")));
  const env = { OPENAI_API_KEY: "test-placeholder", AI_MAX_REQUESTS_PER_HOUR: "100" };
  const fetchBefore = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.ok(options.signal);
    const context = JSON.parse(JSON.parse(options.body).input.match(/Current issue context: (.*?)\. User instruction:/)[1]);
    return ai.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ operation: "fill_missing", column: context.column, value: 1.237, assumptions: ["test"], warnings: ["review"] }) }] }] });
  };
  try {
    const payload = { instruction: "Use a constant.", context: { column: "amount", type: "numeric", allowedOperations: ["fill_missing"], affectedRecords: 2 } };
    for (const handler of [(request) => worker.fetch(request, env), (request) => pages.onRequest({ request, env })]) {
      const result = await handler(new Request("http://test/api/ai/proposals", { method: "POST", headers: { "cf-connecting-ip": `test-${calls}` }, body: JSON.stringify(payload) }));
      assert.equal(result.status, 200);
      const output = await result.json();
      assert.equal(output.proposal.value, 1.237);
      assert.deepEqual(output.proposal.warnings, ["review"]);
      assert.equal(output.provider, "openai");
      assert.equal((await handler(new Request("http://test/api/ai/proposals", { method: "DELETE" }))).status, 405);
    }
    const workerStatus = await (await worker.fetch(new Request("http://test/api/ai/status"), env)).json();
    assert.deepEqual(await (await status.onRequestGet({ env })).json(), workerStatus);
    assert.equal(workerStatus.healthChecked, false);
    global.fetch = async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
    assert.equal((await ai.handleProposal(new Request("http://test/api", { method: "POST", headers: { "cf-connecting-ip": "timeout-test" }, body: JSON.stringify(payload) }), env)).status, 504);
    const limited = { ...env, AI_MAX_REQUESTS_PER_HOUR: "1" };
    const request = () => new Request("http://test/api", { method: "POST", headers: { "cf-connecting-ip": "quota-test" }, body: JSON.stringify(payload) });
    await ai.handleProposal(request(), limited);
    assert.equal((await ai.handleProposal(request(), limited)).status, 429);
  } finally { global.fetch = fetchBefore; }
});
