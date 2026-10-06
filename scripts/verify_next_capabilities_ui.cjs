const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.setDefaultTimeout(60000); page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/ai/status", route => route.fulfill({ json: { available: false } }));
    await page.goto(baseUrl);
    const load = async filename => {
      await page.evaluate(async filename => loadData(await (await fetch(filename)).text(), filename), filename);
      await page.waitForFunction(() => capabilityStore().suggestions && capabilityStore().scorecards);
    };
    const choose = async (column, recommendation = "impute") => page.evaluate(({ column, recommendation }) => openIssue(state.issues.find(item => item.column === column && item.recommendation === recommendation && item.status === "open").id), { column, recommendation });
    const step = async value => { await page.locator(`[data-review-step="${value}"]`).click(); await page.waitForFunction(value => state.reviewStep === value, value); };
    const layout = async name => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page does not overflow`);
      const overlaps = await page.evaluate(() => {
        const errors = [];
        for (const group of document.querySelectorAll(".review-fields")) {
          const fields = [...group.querySelectorAll("input,select")].filter(field => field.getClientRects().length);
          for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) { const a = fields[i].getBoundingClientRect(), b = fields[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push([fields[i].id, fields[j].id]); }
        }
        return errors;
      });
      assert.deepEqual(overlaps, [], `${name}: controls do not overlap`);
    };
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await load("sales_orders.csv");
      assert.ok((await page.locator(".profile-table thead").innerText()).includes("Validity"));
      const suggestions = page.locator(".workspace-card").filter({ has: page.getByRole("heading", { name: "Suggested business checks" }) });
      await suggestions.locator("summary").click();
      await suggestions.locator("article").filter({ has: page.getByRole("heading", { name: /profit_usd from/ }) }).locator("button").click();
      await page.waitForFunction(() => state.ruleConfig.metrics.some(rule => rule.target === "profit_usd"));
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.locator("#businessKpis").click(); await page.locator("[data-suggested-kpi]").first().click(); await page.locator("#closeKpis").click();
      assert.equal(await page.evaluate(() => state.ruleConfig.kpis.length), 1);
      await choose("delivery_days"); await page.locator("#compareMissing").click();
      await page.waitForFunction(() => analyticalTarget("delivery_days").result?.results[0]?.significance);
      const result = await page.evaluate(() => analyticalTarget("delivery_days").result);
      assert.ok(result.results.find(entry => entry.column === "quantity").cliffsDelta > 0);
      await page.locator(".analytical-hold > summary").click(); await page.locator("#analysisCompareColumn").selectOption("quantity"); await page.locator("#analysisHoldColumn").selectOption("channel"); await page.locator("#runHeldComparison").click();
      await page.waitForFunction(() => analyticalTarget("delivery_days").held.length > 0);
      await step(2); await page.locator("input[name=reviewInterpretation][value=missing]").check(); await step(3);
      await page.locator(".candidate-comparison > summary").click();
      for (const method of ["median", "mean", "groupwise"]) { await page.locator("#candidateMethod").selectOption(method); await page.locator("#candidateField").selectOption("channel"); await page.locator("#addTreatmentCandidate").click(); }
      await page.locator("#compareTreatmentCandidates").click();
      await page.waitForFunction(() => capabilityItem(state.issues.find(item => item.id === state.selectedIssue)).candidateComparison !== null);
      assert.equal(await page.locator("[data-promote-candidate]").count(), 3); assert.equal(await page.evaluate(() => state.changes.length), 0);
      await layout(`${width} candidate comparison`);
      if (process.env.ARTIFACT_DIR) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/next-candidates-${width}.png`, fullPage: true }); }
      await page.locator('[data-promote-candidate="2"]').click(); await page.waitForFunction(() => state.reviewStep === 4);
      await page.waitForFunction(() => capabilityItem(state.issues.find(item => item.id === state.selectedIssue)).impact !== undefined);
      assert.ok((await page.locator(".band-impact").innerText()).includes("Retail store"));
      assert.ok((await page.locator(".guided-stage > .kpi-impact").innerText()).includes("Margin"));
      await page.locator(".capability-records > summary").click(); await page.locator("#recordLensMode").selectOption("both"); await page.locator("#recordLensHold").selectOption("__active"); await page.locator("#refreshRecordLens").click();
      await page.waitForFunction(() => capabilityItem(state.issues.find(item => item.id === state.selectedIssue)).records !== null);
      const records = await page.evaluate(() => capabilityItem(state.issues.find(item => item.id === state.selectedIssue)).records);
      assert.equal(records.totalRecords, 1000); assert.ok(records.displayedCount <= 100);
      assert.equal(records.bands.find(band => band.label === "Retail store").nMissing, 0);
      assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).selectedIds.length), 86);
      await layout(`${width} banded records and preview`);
      if (process.env.ARTIFACT_DIR) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/next-preview-${width}.png`, fullPage: true }); }
      await step(5); await page.locator("#approveGuided").click();
      assert.equal(await page.evaluate(() => state.changes[0].treatment.kpiImpact.length), 1);
      await choose("cost_usd"); await step(2); await page.locator("input[name=reviewInterpretation][value=missing]").check(); await step(3); await page.locator("#reviewOperation").selectOption("median"); await step(4);
      assert.ok((await page.locator(".dependency-impact").innerText()).includes("profit_usd"));
      await step(5); await page.locator("#approveGuided").click(); assert.ok(await page.locator("[data-dependency-followup]").count() > 0);
      await page.locator("[data-screen=changes]").click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
      await page.evaluate(() => restoreProject(serializeProject()));
      assert.equal(await page.evaluate(() => state.ruleConfig.kpis.length), 1); assert.ok(await page.evaluate(() => state.ruleConfig.acceptedSuggestions.length > 0));
      await page.locator("[data-screen=report]").click();
      assert.equal(await page.locator("#exportImputedFlags").isChecked(), true); await page.locator("#exportImputationMethods").check();
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#downloadCsv").click()]);
      const fs = require("node:fs"), csv = fs.readFileSync(await download.path(), "utf8");
      assert.ok(csv.includes("delivery_days_imputed")); assert.ok(!csv.includes("cost_usd_imputed"));
      const exported = await page.evaluate(csv => parseCsv(csv), csv); assert.equal(exported.rows.filter(row => row.delivery_days_imputed === "1").length, 86);
      const report = await page.evaluate(() => qualityReportData()); assert.ok(report.scorecards.source && report.scorecards.working);
      await layout(`${width} report`);
    }
    await load("marketing_campaigns.csv"); await page.locator("#businessKpis").click(); await page.locator("[data-suggested-kpi]").first().click(); await page.locator("#closeKpis").click(); await choose("spend_usd");
    await step(2); await page.locator("input[name=reviewInterpretation][value=missing]").check(); await step(3); await page.locator(".candidate-comparison > summary").click();
    for (const method of ["median", "mean"]) { await page.locator("#candidateMethod").selectOption(method); await page.locator("#addTreatmentCandidate").click(); }
    await page.locator("#compareTreatmentCandidates").click(); await page.waitForFunction(() => capabilityItem(state.issues.find(item => item.id === state.selectedIssue)).candidateComparison !== null);
    assert.equal(await page.locator(".candidate-lenses .kpi-impact").count(), 2);
    // The new business calculations and skip rule keep the 50k-row main thread responsive.
    const large = await page.evaluate(async () => {
      const { headers, rows } = parseCsv(await (await fetch("sales_orders.csv")).text());
      state.headers = headers; state.rows = Array.from({ length: 50000 }, (_, index) => ({ ...rows[index % rows.length], _row: index + 1 })); state.original = state.rows.map(row => ({ ...row })); state.allRows = state.rows; state.changes = []; state.ruleConfig = emptyRuleConfig(); state.datasetRevision++; invalidateCleaningProfile();
      let ticks = 0; const timer = setInterval(() => ticks++, 10);
      try {
        const options = analyticalOptions(); const compared = await analyticalTask("compare", "delivery_days", { options });
        const significance = await analyticalTask("significance", "delivery_days", { params: { result: compared }, options });
        const fill = await analyticalTask("fill", "delivery_days", { params: { columns: ["channel"] }, options });
        const patches = fill.fills.map(fill => ({ rowId: fill.row, column: "delivery_days", before: "", after: fill.value.toFixed(2) }));
        const business = await analyticalTask("business", "delivery_days", { params: { preview: { patches, removedRows: [] }, definitions: CapabilitiesEngine.suggestedKpis(headers), metrics: [] }, options });
        return { ticks, skipped: significance.results[0].significance, kpis: business.kpis.length };
      } finally { clearInterval(timer); }
    });
    assert.ok(large.ticks > 1); assert.equal(large.skipped, "skipped"); assert.equal(large.kpis, 1); assert.deepEqual(errors, []);
    console.log("PASS: desktop/mobile suggestions, KPIs, candidates/promotion, robust comparisons, banded records, group lenses, dependencies, restored definitions, imputation export, scorecards, 50k background business work, no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
