const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const analysis = require("../analysis-engine.js");
const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const parser = vm.createContext({});
vm.runInContext(app.slice(app.indexOf("function parseCsv("), app.indexOf("function csvText(")), parser);
function sample(name) {
  parser.csv = fs.readFileSync(path.join(__dirname, "..", name), "utf8");
  return JSON.parse(JSON.stringify(vm.runInContext("parseCsv(csv)", parser)));
}
test("sales missingness reveals channel and quantity, held comparison attenuates quantity", () => {
  const { headers, rows } = sample("sales_orders.csv");
  const result = analysis.compare(headers, rows, "delivery_days");
  const channel = result.results.find(entry => entry.column === "channel");
  assert.equal(channel.strength, "strong");
  const rates = Object.fromEntries(channel.categoryRates.map(entry => [entry.label, entry.rate]));
  assert.ok(rates.Distributor > .27 && rates.Distributor < .37);
  assert.ok(rates.Online > .03 && rates.Online < .09);
  assert.equal(rates["Retail store"], 0);
  const quantity = result.results.find(entry => entry.column === "quantity");
  assert.equal(quantity.missingStats.median, 9);
  assert.equal(quantity.presentStats.median, 2);
  const held = analysis.holdSimilar(headers, rows, "delivery_days", "quantity", "channel");
  assert.ok(["explained", "partial"].includes(held.verdict));
  const distributor = held.bands.find(band => band.label === "Distributor");
  assert.equal(distributor.missingStats.median, 12);
  assert.equal(distributor.presentStats.median, 12);
});
test("sales group-wise fills use channel medians and tenure reports the actual measured effects", () => {
  const { headers, rows } = sample("sales_orders.csv"), original = JSON.stringify(rows);
  const result = analysis.fillSimilar(headers, rows, "delivery_days", { columns: ["channel"] });
  const byId = new Map(rows.map(row => [row._row, row]));
  for (const fill of result.fills) {
    assert.equal(fill.source, "band");
    const channel = byId.get(fill.row).channel;
    assert.ok(Math.abs(fill.value - (channel === "Distributor" ? 4.3 : 4.5)) < .25);
    assert.notEqual(channel, "Retail store");
  }
  assert.equal(result.fallbackCount, 0);
  // Robust ranks avoid a few extreme observations driving false mean patterns.
  const tenure = analysis.compare(headers, rows, "customer_tenure_months");
  assert.equal(tenure.results.find(entry => entry.column === "quantity").strength, "weak");
  assert.equal(JSON.stringify(rows), original);
});
test("all bundled CSV comparisons and fills are deterministic and source-preserving", () => {
  for (const name of ["sales_orders.csv", "healthcare_patient_visits.csv", "marketing_campaigns.csv"]) {
    const { headers, rows } = sample(name), snapshot = JSON.stringify(rows);
    const target = headers.find(column => rows.some(row => !row[column].trim()) && rows.filter(row => row[column].trim()).every(row => Number.isFinite(Number(row[column]))));
    const compare = analysis.compare(headers, rows, target);
    assert.deepEqual(analysis.compare(headers, rows, target), compare);
    const columns = compare.results.slice(0, 2).map(entry => entry.column);
    const fills = analysis.fillSimilar(headers, rows, target, { method: "knn", columns, k: 7 });
    assert.ok(fills.fills.length);
    assert.deepEqual(analysis.fillSimilar(headers, rows, target, { method: "knn", columns, k: 7 }), fills);
    assert.ok(fills.fills.every(fill => fill.source === "knn" && fill.neighbourRows.length <= 7));
    assert.equal(JSON.stringify(rows), snapshot);
  }
});
test("blanks, declared tokens, zero, constants, and insufficient groups are distinct", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ _row: index + 1, target: index < 10 ? "" : "0", number: index < 10 ? " " : "3", constant: "1", category: index % 2 ? "A" : "B", date: index < 10 ? "2025-01-01" : "2025-02-01" }));
  const headers = ["target", "number", "constant", "category", "date"];
  const result = analysis.compare(headers, rows, "target");
  assert.equal(result.nMissing, 10); assert.equal(result.nPresent, 10);
  assert.ok(!result.results.some(entry => entry.column === "constant"));
  assert.equal(result.results.find(entry => entry.column === "date").monthlyRates.length, 2);
  assert.equal(analysis.compare(headers, rows.slice(0, 12), "target").insufficientData, true);
  const tokenRows = rows.map(row => ({ ...row, target: row.target || "NULL" }));
  assert.equal(analysis.compare(headers, tokenRows, "target").nMissing, 0);
  assert.equal(analysis.compare(headers, tokenRows, "target", { includeTokens: true }).nMissing, 0, "An old blanket-token option cannot classify values");
  const classifications = tokenRows.slice(0, 10).map(row => ({ rowId: row._row, column: "target", value: "NULL", meaning: "missing" }));
  assert.equal(analysis.compare(headers, tokenRows, "target", { classifications }).nMissing, 10);
  assert.throws(() => analysis.holdSimilar(headers, rows, "target", "category", "target"));
  assert.throws(() => analysis.fillSimilar(headers, rows, "target", { columns: ["target"] }));
  const balanced = Array.from({ length: 40 }, (_, index) => ({ _row: index + 1, target: index < 20 ? "" : "2", a: String(index % 5), b: String(index % 4), c: index % 2 ? "A" : "B" }));
  const none = analysis.compare(["target", "a", "b", "c"], balanced, "target");
  assert.equal(none.pattern, "none_detected"); assert.ok(none.note.includes("may"));
});
test("KNN breaks ties by source order and falls back when no usable similarity exists", () => {
  const rows = [{ _row: 1, y: "", x: "5" }, { _row: 2, y: "2", x: "4" }, { _row: 3, y: "8", x: "6" }, { _row: 4, y: "", x: "" }];
  const result = analysis.fillSimilar(["y", "x"], rows, "y", { method: "knn", columns: ["x"], k: 1 });
  assert.deepEqual(result.fills[0].neighbourRows, [2]); assert.equal(result.fills[0].value, 2);
  assert.equal(result.fills[1].source, "global"); assert.equal(result.fills[1].value, 5);
  const widened = analysis.fillSimilar(["y", "x"], rows, "y", { columns: ["x"], minObserved: 2 });
  assert.ok(widened.fills.some(fill => fill.source === "widened"));
  const noDonors = analysis.fillSimilar(["y", "x"], rows.map(row => ({ ...row, y: "" })), "y", { columns: ["x"] });
  assert.equal(noDonors.fills.length, 0); assert.equal(noDonors.blocked.length, 4);
});
test("numeric bands accept explicit edges, keep unknowns separate, and caches update changed columns", () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({ _row: index + 1, target: index % 4 ? String(index + 1) : "", hold: index === 0 ? "" : String(index), comparison: String(index % 7) }));
  const headers = ["target", "hold", "comparison"], options = { revision: 1 };
  const context = analysis.prepare(headers, rows, options);
  const custom = analysis.bandsFor(context, "hold", { mode: "custom", edges: [10, 20, 30] });
  assert.equal(custom.labels[0], "Unknown"); assert.equal(new Set(custom.labels).size, 5);
  const fixed = analysis.bandsFor(context, "hold", { mode: "fixedWidth", width: 10 });
  assert.equal(fixed.numeric, true);
  assert.throws(() => analysis.bandsFor(context, "hold", { mode: "custom", edges: [20, 10] }));
  assert.throws(() => analysis.bandsFor(context, "hold", { mode: "fixedWidth", width: 0 }));
  rows[1].comparison = "1000";
  const changed = analysis.prepare(headers, rows, { revision: 2 });
  assert.equal(changed.columns.get("comparison").numbers[1], 1000);
  assert.equal(changed.columns.get("hold"), context.columns.get("hold"), "Unchanged sorted values and masks are reused");
  const unreliable = rows.map(row => ({ ...row, hold: row.target ? row.hold : "" }));
  assert.ok(analysis.holdSimilar(headers, unreliable, "target", "comparison", "hold").warning.includes("unreliable"));
});
test("analytical comparisons stay below the 200ms sample-size budget", () => {
  const { headers, rows } = sample("sales_orders.csv");
  const options = { revision: 1 };
  const start = performance.now();
  analysis.compare(headers, rows, "delivery_days", options);
  analysis.holdSimilar(headers, rows, "delivery_days", "quantity", "channel", {}, options);
  analysis.fillSimilar(headers, rows, "delivery_days", { columns: ["channel"] }, options);
  analysis.compare(headers, rows, "customer_tenure_months", options);
  const duration = performance.now() - start;
  console.log(`Capabilities 1–4 (1,000 × 15): ${duration.toFixed(1)}ms`);
  assert.ok(duration < 200, `Analytical computations took ${duration.toFixed(1)}ms`);
});
