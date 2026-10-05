const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const engine = require("../cleaning-engine.js");
const ai = require("../src/ai.cjs");
const root = path.resolve(__dirname, "..");
function workspace(csv) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "", textContent: "", value: "", classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll() { return []; } });
    return nodes.get(selector);
  };
  const context = vm.createContext({ document: { querySelector: node, querySelectorAll: () => [] }, fetch: async () => ({ ok: true, json: async () => ({ available: false }) }), console, setTimeout() {}, URL, Blob });
  for (const file of ["cleaning-engine.js", "spreadsheet.js", "workspace.js", "review.js", "review-ui.js", "app.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const run = code => vm.runInContext(code, context);
  run("render = () => {}; globalThis.approve = item => { state.reviewStep = 5; const draft = reviewDraft(item); draft.previewFingerprint = guidedFingerprint(item, draft); approveGuidedDecision(item); };");
  context.csv = csv; run('loadData(csv, "exceptions.csv")');
  const value = expression => JSON.parse(run(`JSON.stringify(${expression})`));
  return { run, value, context, node };
}
test("candidate discovery preserves NULL/zero/blanks and protects identifiers", () => {
  const rows = ["10", "20", "30", "0", "NULL", ""].map((value, index) => ({ _row: index + 1, postal_code: `00${index}`, measurement: value }));
  const original = structuredClone(rows);
  const profile = engine.profile(["postal_code", "measurement"], rows);
  assert.equal(profile.columns[0].role, "identifier");
  assert.equal(profile.columns[1].role, "number");
  assert.deepEqual(profile.candidates.filter(candidate => candidate.column === "measurement").map(candidate => candidate.kind), ["missing_token", "sentinel"]);
  assert.equal(profile.columns[1].statistics.count, 4);
  assert.deepEqual(rows, original);
});
test("number policies reject ambiguous formats and support separators, percent and accounting negatives", () => {
  assert.throws(() => engine.parseNumber("1,234.56"));
  assert.throws(() => engine.parseNumber("0x10"));
  assert.throws(() => engine.parseNumber(""));
  assert.equal(engine.parseNumber("$1,234.56", { numberFormat: "decimalPoint", currency: true }), 1234.56);
  assert.equal(engine.parseNumber("1.234,56", { numberFormat: "decimalComma" }), 1234.56);
  assert.equal(engine.parseNumber("(1,234.56)", { numberFormat: "decimalPoint" }), -1234.56);
  assert.equal(engine.parseNumber("12%", { numberFormat: "decimalPoint", percentage: true }), .12);
  assert.throws(() => engine.parseNumber("12%", { numberFormat: "decimalPoint" }));
  assert.throws(() => engine.parseNumber("12,34", { numberFormat: "decimalPoint" }));
});
test("date interpretation is explicit and invalid dates / Excel's fictitious leap day stay blocked", () => {
  assert.equal(engine.parseDate("02/03/2025", "mdy"), "2025-02-03");
  assert.equal(engine.parseDate("02/03/2025", "dmy"), "2025-03-02");
  assert.throws(() => engine.parseDate("31/02/2025", "dmy"));
  assert.throws(() => engine.parseDate("2025-02-29", "iso"));
  assert.throws(() => engine.parseDate("2025-01-01T12:00:00Z", "iso"));
  assert.equal(engine.parseDate("61", "excel"), "1900-03-01");
  assert.throws(() => engine.parseDate("60", "excel"));
});
test("grouped fills use scoped reference populations and expose groups without observations", () => {
  const rows = [{ _row: 1, region: "A", x: "10" }, { _row: 2, region: "A", x: "20" }, { _row: 3, region: "B", x: "" }, { _row: 4, region: "A", x: "NULL" }, { _row: 5, region: "", x: "" }];
  const preview = engine.treatment(["region", "x"], rows, [3, 4, 5], "x", { operation: "groupMedian", groupColumn: "region", decimals: 0 });
  assert.deepEqual(preview.patches, [{ rowId: 4, column: "x", before: "NULL", after: "15" }]);
  assert.deepEqual(preview.blocked.map(entry => entry.rowId), [3, 5]);
  assert.equal(rows[3].x, "NULL");
});
test("scope cannot escape the finding and numerical conditions never equate blank with zero", () => {
  const rows = [{ _row: 1, x: "", group: "" }, { _row: 2, x: "NULL", group: "0" }, { _row: 3, x: "10", group: "1" }];
  assert.throws(() => engine.treatment(["x", "group"], rows, [1, 2], "x", { operation: "constant", value: "5", scope: { mode: "selected", rowIds: [3] } }));
  assert.throws(() => engine.scopeRows(rows, [1, 2], { mode: "invented" }));
  const preview = engine.treatment(["x", "group"], rows, [1, 2], "x", { operation: "missing", scope: { mode: "condition", column: "group", operator: ">=", value: "0" } });
  assert.deepEqual(preview.selectedIds, [2]);
});
test("partial missing-token normalization keeps unresolved alternatives open and survives rollback", () => {
  const w = workspace("id,x\nA,NULL\nB,N/A\nC,0\nD,10\nE,20\nF,30\nG,");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "missing_token"); Object.assign(reviewDraft(item), { operation: "missing", interpretation: "missing", scope: { mode: "selected", rowIds: [1] } }); approve(item);');
  assert.equal(w.value("state.rows[0].x"), "");
  assert.equal(w.value("state.rows[1].x"), "N/A");
  assert.equal(w.value("state.rows[2].x"), "0");
  assert.deepEqual(w.value('state.issues.find(item => item.candidate?.kind === "missing_token" && item.status === "open").rows.map(row => row._row)'), [2]);
  assert.equal(w.value("state.changes[0].snapshot.interpretation"), "missing");
  assert.equal(w.value('state.issues.find(item => item.recommendation === "impute").rows.length'), 2);
  w.run("rollbackChange(state.changes[0].id)");
  assert.equal(w.value("state.rows[0].x"), "NULL");
});
test("retaining a subset does not close unreviewed records and invalidates if its value changes", () => {
  const w = workspace("id,label\nA,NULL\nB,N/A\nC,Real");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "missing_token"); Object.assign(reviewDraft(item), { operation: "retain", interpretation: "not_applicable", scope: { mode: "selected", rowIds: [1] } }); approve(item);');
  assert.deepEqual(w.value('state.issues.find(item => item.recommendation === "candidate" && item.status === "open").rows.map(row => row._row)'), [2]);
  assert.equal(w.value("metrics().changedCells"), 0);
  w.run("rollbackChange(state.changes[0].id)");
  assert.equal(w.value('state.issues.find(item => item.candidate?.kind === "missing_token").rows.length'), 2);
});
test("not-applicable blanks and zeros retain semantics, affect working statistics and restore correctly", () => {
  const w = workspace("id,x\nA,0\nB,10\nC,20\nD,30\nE,");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "sentinel"); Object.assign(reviewDraft(item), { operation: "retain", interpretation: "not_applicable" }); globalThis.preview = guidedPreview(item); approve(item);');
  assert.equal(w.value('cellInterpretation(state.rows[0], "x")'), "not_applicable");
  assert.equal(w.value("preview.afterStats.mean"), 20);
  assert.deepEqual(w.value('numericValues("x")'), [10, 20, 30]);
  w.run('globalThis.blank = state.issues.find(item => item.recommendation === "impute"); Object.assign(reviewDraft(blank), { operation: "retain", interpretation: "not_applicable" }); approve(blank); globalThis.backup = serializeProject(); restoreProject(backup);');
  assert.ok(!w.value('state.issues.some(item => item.status === "open" && ["impute", "keep"].includes(item.recommendation))'));
  assert.equal(w.value('cellInterpretation(state.rows[0], "x")'), "not_applicable");
  w.run("rollbackChange(state.changes[0].id)");
  assert.ok(w.value('state.issues.some(item => item.status === "open" && item.recommendation === "impute")'));
});
test("constraints are checked before approval and acknowledgement must be explicit", () => {
  const w = workspace("id,age\nA,10\nB,20\nC,30\nD,40\nE,");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), schema: [{ id: "age-rule", column: "age", type: "integer", required: true, minimum: 0, maximum: 100, allowed: [] }] }); globalThis.item = state.issues.find(item => item.recommendation === "impute"); Object.assign(reviewDraft(item), { operation: "constant", interpretation: "error", value: "101" });');
  assert.ok(w.value("guidedPreview(item).constraints.length") > 0);
  w.run("approve(item)");
  assert.equal(w.value("metrics().changedCells"), 0);
  w.run("reviewDraft(item).acknowledgeConstraints = true; approve(item)");
  assert.equal(w.value("state.rows[4].age"), "101");
});
test("preview staleness and blocked-record acknowledgement prevent unintended partial application", () => {
  const w = workspace("id,event_date\nA,02/03/2025\nB,31/02/2025");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "date_format"); Object.assign(reviewDraft(item), { operation: "parseDate", interpretation: "format", dateFormat: "dmy" });');
  assert.equal(w.value("guidedPreview(item).blocked.length"), 1);
  w.run("approve(item)");
  assert.equal(w.value("metrics().changedCells"), 0);
  w.run('const draft = reviewDraft(item); draft.skipBlocked = true; draft.previewFingerprint = guidedFingerprint(item, draft); state.reviewStep = 5; draft.dateFormat = "mdy"; approveGuidedDecision(item);');
  assert.equal(w.value("metrics().changedCells"), 0);
  w.run('reviewDraft(item).dateFormat = "dmy"; approve(item)');
  assert.equal(w.value("state.rows[0].event_date"), "2025-03-02");
  assert.equal(w.value("state.rows[1].event_date"), "31/02/2025");
});
test("duplicate survivor policies and complementary merge preserve identity and reject unacknowledged conflicts", () => {
  const rows = [{ _row: 1, key: "A", email: "", name: "Lee" }, { _row: 2, key: "A", email: "lee@test", name: "Lee" }, { _row: 3, key: "B", email: "b@test", name: "B" }];
  const preview = engine.treatment(["key", "email", "name"], rows, [1, 2], "key", { operation: "mergeDuplicates", keys: ["key"], keyMode: true, survivor: "first" });
  assert.deepEqual(preview.patches, [{ rowId: 1, column: "email", before: "", after: "lee@test" }]);
  assert.equal(preview.removedRows[0]._row, 2);
  const mostComplete = engine.treatment(["key", "email", "name"], rows, [1, 2], "key", { operation: "deduplicate", keys: ["key"], keyMode: true, survivor: "complete" });
  assert.equal(mostComplete.removedRows[0]._row, 1);
  assert.throws(() => engine.treatment(["key", "email", "name"], rows, [1, 2], "key", { operation: "deduplicate", keys: ["key"], survivor: "selected", survivorIds: [] }));
  rows[1].name = "Different";
  assert.throws(() => engine.treatment(["key", "email", "name"], rows, [1, 2], "key", { operation: "mergeDuplicates", keys: ["key"], survivor: "first" }));
});
test("generic/manual multi-column duplicate merge round-trips and overlapping rollback preserves later patches", () => {
  const w = workspace("id,name,email\nA,Lee,\nA,Lee,lee@test\nB,Other,b@test");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), duplicates: { mode: "key", columns: ["id"] } }); globalThis.item = state.issues.find(item => item.recommendation === "duplicates"); Object.assign(reviewDraft(item), { operation: "mergeDuplicates", interpretation: "error", survivor: "first" }); approve(item); globalThis.mergeId = state.changes[0].id;');
  assert.equal(w.value("state.rows.length"), 2);
  assert.equal(w.value("state.rows[0].email"), "lee@test");
  w.run('globalThis.manual = issue(100, "email", "Manual correction", "Manual", [state.rows[0]], "medium", "Manual", "manual"); state.issues.push(manual); Object.assign(reviewDraft(manual), { operation: "constant", interpretation: "error", value: "corrected@test" }); approve(manual); globalThis.backup = serializeProject(); restoreProject(backup); rollbackChange(mergeId);');
  assert.equal(w.value("state.rows.length"), 3);
  assert.equal(w.value("state.rows[0].email"), "corrected@test");
  assert.equal(w.value("state.rows[1].email"), "lee@test");
});
test("conditional and date-comparison rules run on arbitrary columns and persist with policies", () => {
  const w = workspace("id,status,delivered,ordered\nA,Delivered,,2025-01-02\nB,Delivered,2025-01-01,2025-01-02\nC,Open,,2025-01-02");
  w.run('applyRuleConfig({ ...emptyRuleConfig(), columns: [{ ...CleaningEngine.defaultPolicy("id"), role: "identifier" }], relations: [{ id: "required", name: "Delivery date required", column: "delivered", left: "status", kind: "requiredIf", value: "Delivered" }, { id: "sequence", name: "Date order", column: "delivered", left: "delivered", right: "ordered", kind: "comparison", operator: ">=", comparisonType: "date" }] });');
  assert.equal(w.value('state.issues.find(item => item.ruleId === "required").rows.length'), 1);
  assert.equal(w.value('relationProblem(state.rows[1], state.ruleConfig.relations[1])').includes("must be"), true);
  w.run("globalThis.backup = serializeProject(); restoreProject(backup)");
  assert.equal(w.value("state.ruleConfig.relations.length"), 2);
  assert.equal(w.value("state.ruleConfig.columns[0].role"), "identifier");
});
test("scoped category mappings leave excluded labels untouched", () => {
  const w = workspace("id,label\nA,Active\nB,active\nC,ACTIVE");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "category"); Object.assign(reviewDraft(item), { operation: "map", interpretation: "format", mapping: { Active: "Active", active: "Active", ACTIVE: "Active" }, scope: { mode: "selected", rowIds: [2] } }); approve(item);');
  assert.deepEqual(w.value("state.rows.map(row => row.label)"), ["Active", "Active", "ACTIVE"]);
  assert.equal(w.value("state.changes[0].patches.length"), 1);
});
test("removing all working records preserves a navigable source-backed project and rollback", () => {
  const w = workspace("id,label\nA,NULL\nB,N/A");
  w.run('globalThis.item = state.issues.find(item => item.candidate?.kind === "missing_token"); Object.assign(reviewDraft(item), { operation: "remove", interpretation: "error" }); approve(item); go("report");');
  assert.equal(w.value("state.screen"), "report");
  assert.equal(w.value("state.rows.length"), 0);
  w.run("globalThis.backup = serializeProject(); restoreProject(backup); rollbackChange(state.changes[0].id)");
  assert.equal(w.value("state.rows.length"), 2);
  assert.deepEqual(w.value("state.rows"), w.value("state.original"));
});
function evidence() {
  return { purpose: "Patient measurements", candidates: [{ id: "finding:1", column: "measurement", kind: "sentinel", role: "number", meaning: "A positive measurement", evidence: "1 zero among 4 numerical observations", rule: "", total: 4, affected: 1, groups: [{ id: "value:0", value: "0", count: 1 }], statistics: { count: 4, min: 0, max: 30, mean: 15, median: 15 }, allowedOperations: ["retain", "missing", "constant"] }] };
}
test("interpretation validation rejects fabricated evidence, probabilities, IDs and operations", () => {
  const payload = ai.validateInterpretationRequest(evidence());
  const suggestion = { meaning: "missing", score: .6, explanation: "A sentinel is possible, but zero may be real.", evidenceIds: ["value:0"], operation: "missing", assumptions: ["Verify the measurement definition."] };
  assert.equal(ai.validateInterpretations({ results: [{ id: "finding:1", interpretations: [suggestion] }] }, payload.candidates)[0].interpretations[0].score, .6);
  for (const patch of [{ score: 95 }, { operation: "execute_code" }, { evidenceIds: ["invented"] }, { meaning: "certain_error" }]) assert.throws(() => ai.validateInterpretations({ results: [{ id: "finding:1", interpretations: [{ ...suggestion, ...patch }] }] }, payload.candidates));
  assert.throws(() => ai.validateInterpretations({ results: [{ id: "wrong", interpretations: [suggestion] }] }, payload.candidates));
  assert.throws(() => ai.validateInterpretationRequest({ ...evidence(), candidates: Array(7).fill(evidence().candidates[0]) }));
});
test("Worker and Pages interpretations use bounded mocked provider calls and never emit executable patches", async () => {
  const originalFetch = global.fetch;
  const worker = (await import(pathToFileURL(path.join(root, "src/worker.js")))).default;
  const pages = await import(pathToFileURL(path.join(root, "functions/api/ai/interpretations.js")));
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses"); calls++;
    assert.ok(JSON.parse(options.body).max_output_tokens > 300);
    return Response.json({ output_text: JSON.stringify({ results: [{ id: "finding:1", interpretations: [{ meaning: "legitimate", score: .7, explanation: "Zero may be valid; ask the analyst.", evidenceIds: ["value:0"], operation: "retain", assumptions: [] }] }] }) });
  };
  try {
    const env = { OPENAI_API_KEY: "mock-key", AI_MAX_REQUESTS_PER_HOUR: 100 };
    for (const handler of [request => worker.fetch(request, env), request => pages.onRequest({ request, env })]) {
      const response = await handler(new Request("http://test/api/ai/interpretations", { method: "POST", headers: { "cf-connecting-ip": `interpretations-${calls}` }, body: JSON.stringify(evidence()) }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.calibrated, false);
      assert.equal(result.results[0].interpretations[0].operation, "retain");
      assert.equal(result.proposal, undefined);
      assert.equal((await handler(new Request("http://test/api/ai/interpretations", { method: "DELETE" }))).status, 405);
    }
    assert.equal(calls, 2);
  } finally { global.fetch = originalFetch; }
});
