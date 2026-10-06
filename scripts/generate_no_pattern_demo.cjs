// Reproducible sample-only generator. Other sales columns and lexical fields
// are preserved; tenure is drawn independently and hidden only when latent < 8.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const analysis = require("../analysis-engine.js");
const root = path.resolve(__dirname, "..");
const filename = path.join(root, "sales_orders.csv");
const source = fs.readFileSync(filename, "utf8"), app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const context = vm.createContext({ source });
vm.runInContext(app.slice(app.indexOf("function parseCsv("), app.indexOf("function csvText(")), context);
const { headers, rows } = JSON.parse(JSON.stringify(vm.runInContext("parseCsv(source)", context)));
const column = "customer_tenure_months", field = headers.indexOf(column);
let selectedSeed = null, result;
for (let initial = 1; initial <= 2000; initial++) {
  let seed = initial;
  for (const row of rows) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const latent = Math.floor(seed / 4294967296 * 61);
    row[column] = latent < 8 ? "" : `${latent}.0`;
  }
  result = analysis.compare(headers, rows, column, { revision: initial });
  if (result.pattern === "none_detected") { selectedSeed = initial; break; }
}
assert.ok(selectedSeed !== null, "A reproducible independent fixture must satisfy the unchanged robust rule.");
if (process.argv.includes("--write")) {
  const lines = source.trimEnd().split(/\r?\n/); assert.equal(lines.length, rows.length + 1, "Bundled sales CSV uses one record per line.");
  for (let index = 1; index < lines.length; index++) {
    const positions = [-1]; let quoted = false;
    for (let offset = 0; offset < lines[index].length; offset++) {
      if (lines[index][offset] === '"') { if (quoted && lines[index][offset + 1] === '"') offset++; else quoted = !quoted; }
      else if (lines[index][offset] === "," && !quoted) positions.push(offset);
    }
    positions.push(lines[index].length);
    lines[index] = lines[index].slice(0, positions[field] + 1) + rows[index - 1][column] + lines[index].slice(positions[field + 1]);
  }
  fs.writeFileSync(filename, lines.join("\n") + "\n");
}
console.log(`No-pattern demo: ${column}; seed ${selectedSeed}; ${result.nMissing} gaps depend only on latent tenure < 8; all ${result.results.length} comparisons are weak/none.`);
