const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const analysis = require("../analysis-engine.js"), capabilities = require("../capabilities-engine.js");
const app = fs.readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
const context = vm.createContext({ csv: fs.readFileSync(require("node:path").join(__dirname, "../sales_orders.csv"), "utf8") });
vm.runInContext(app.slice(app.indexOf("function parseCsv("), app.indexOf("function csvText(")), context);
const { headers, rows } = JSON.parse(JSON.stringify(vm.runInContext("parseCsv(csv)", context))), options = { revision: 1 };
// Import/background profiling prepares reusable per-column masks/sorted values.
analysis.prepare(headers, rows, options);
const start = performance.now();
analysis.compare(headers, rows, "delivery_days", options);
analysis.holdSimilar(headers, rows, "delivery_days", "quantity", "channel", {}, options);
capabilities.kpiImpact(headers, rows, { patches: [], removedRows: [] }, capabilities.suggestedKpis(headers), options);
const duration = performance.now() - start;
console.log(`Comparison + held comparison + KPI (1,000 × 15): ${duration.toFixed(1)} ms`);
assert.ok(duration < 200, `Interaction budget exceeded: ${duration.toFixed(1)}ms`);
