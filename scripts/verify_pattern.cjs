const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ai = require("../src/ai.cjs");
function evidence() {
  return { summary: { targetColumn: "delivery_days", total: 1000, nMissing: 100, results: [{ column: "channel", type: "categorical", effectSize: .22, missingStats: { count: 100 }, presentStats: { count: 900 }, categoryRates: [{ label: "Distributor", total: 200, missing: 64, rate: .32 }] }], held: [{ comparisonColumn: "quantity", holdColumn: "channel", verdict: "partial", unbandedEffect: .7, combinedEffect: .3 }] } };
}
const plan = { explanation: "The gaps may be associated with channel rather than quantity.", likelyDriver: "channel", caution: "Verify the source before estimating delivery_days.", mentionedColumns: ["channel", "quantity", "delivery_days"], proposal: { operation: "fill_groupwise", params: { holdColumns: ["channel"], statistic: "median" } } };
test("pattern validation allows only submitted columns, supported bounded fixes, and hedged explanations", () => {
  const summary = ai.validatePatternRequest(evidence());
  const valid = ai.validatePatternPlan(plan, summary);
  assert.equal(valid.requiresConfirmation, true); assert.equal(valid.proposal.requiresConfirmation, true);
  for (const patch of [{ likelyDriver: "invented" }, { explanation: "x".repeat(301) }, { explanation: "delivery_days is driven by unknown_column." }, { explanation: "Channel causes the gaps.", caution: null }, { mentionedColumns: ["unknown"] }, { proposal: { operation: "execute", params: {} } }, { proposal: { operation: "fill_groupwise", params: { holdColumns: ["delivery_days"], statistic: "median" } } }, { proposal: { operation: "fill_knn", params: { columns: ["channel"], k: 51 } } }]) assert.throws(() => ai.validatePatternPlan({ ...plan, ...patch }, summary));
  assert.equal(ai.validatePatternPlan({ ...plan, proposal: { operation: "fill_constant", params: { value: 0 } } }, summary).proposal.params.value, 0);
  assert.equal(ai.validatePatternPlan({ ...plan, proposal: { operation: "leave_missing", params: {} } }, summary).proposal.operation, "leave_missing");
  assert.throws(() => ai.validatePatternRequest({ summary: { ...evidence().summary, nMissing: 1001 } }));
  const chance = evidence(); chance.summary.held = []; Object.assign(chance.summary.results[0], { significance: "could be chance", pValue: .6 });
  const uncertain = ai.validatePatternRequest(chance), unqualified = { explanation: "Channel explains the gaps.", likelyDriver: "channel", caution: null, proposal: null, mentionedColumns: ["channel"] };
  assert.throws(() => ai.validatePatternPlan(unqualified, uncertain), /qualified language/);
  assert.equal(ai.validatePatternPlan({ ...unqualified, explanation: "Channel could be associated with the gaps by chance." }, uncertain).requiresConfirmation, true);
});
test("Worker and Pages pattern endpoints send only aggregate summaries to the provider", async () => {
  const worker = (await import(pathToFileURL(path.join(__dirname, "../src/worker.js")))).default;
  const pages = await import(pathToFileURL(path.join(__dirname, "../functions/api/ai/pattern.js")));
  const originalFetch = global.fetch; let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses"); calls++;
    const request = JSON.parse(options.body);
    assert.ok(!request.input.includes("PRIVATE_RAW_ROW"));
    assert.ok(!request.input.includes("neighbourRows"));
    return Response.json({ output_text: JSON.stringify(plan) });
  };
  try {
    const payload = evidence(); payload.summary.rows = [{ private: "PRIVATE_RAW_ROW" }]; payload.summary.results[0].neighbourRows = [1, 2];
    const env = { OPENAI_API_KEY: "mock", AI_MAX_REQUESTS_PER_HOUR: 100 };
    for (const handler of [request => worker.fetch(request, env), request => pages.onRequest({ request, env })]) {
      const response = await handler(new Request("http://test/api/ai/pattern", { method: "POST", headers: { "cf-connecting-ip": `patterns-${calls}` }, body: JSON.stringify(payload) }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).result.proposal.requiresConfirmation, true);
      assert.equal((await handler(new Request("http://test/api/ai/pattern", { method: "DELETE" }))).status, 405);
    }
    assert.equal(calls, 2);
    global.fetch = async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/generate");
      assert.ok(JSON.parse(options.body).prompt.includes("delivery_days"));
      return Response.json({ response: JSON.stringify(plan) });
    };
    const local = await ai.handlePattern(new Request("http://test/api/ai/pattern", { method: "POST", body: JSON.stringify(evidence()) }), { AI_MODE: "local", OLLAMA_URL: "http://127.0.0.1:11434" });
    assert.equal(local.status, 200); assert.equal((await local.json()).result.requiresConfirmation, true);
  } finally { global.fetch = originalFetch; }
});
