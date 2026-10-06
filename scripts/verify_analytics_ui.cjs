const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; let patternCalls = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/ai/status", route => route.fulfill({ json: { available: false } }));
    await page.route("**/api/ai/pattern", route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { turnstileSiteKey: "" } });
      patternCalls++;
      const payload = route.request().postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ["summary", "turnstileToken"]);
      assert.ok(payload.summary.results.length <= 3);
      const raw = JSON.stringify(payload);
      assert.ok(!raw.includes('"rows"') && !raw.includes('"_row"') && !raw.includes("neighbourRows"));
      return route.fulfill({ json: { result: { explanation: "Missing delivery_days may be associated with channel; the quantity gap shrinks within channel groups.", likelyDriver: "channel", caution: "Check the source before estimating delivery times.", proposal: { operation: "fill_groupwise", params: { holdColumns: ["channel"], statistic: "median" }, requiresConfirmation: true }, requiresConfirmation: true } } });
    });
    const load = async () => {
      await page.evaluate(async () => loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv"));
      await page.evaluate(() => openIssue(state.issues.find(item => item.column === "delivery_days" && item.recommendation === "impute").id));
    };
    const stage = async step => {
      await page.locator(`[data-review-step="${step}"]`).click();
      await page.waitForFunction(step => state.reviewStep === step, step);
    };
    const layout = async label => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no page overflow`);
      const overlaps = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll(".guided-stage .review-fields input,.guided-stage .review-fields select")].filter(input => input.getClientRects().length);
        const errors = [];
        for (let i = 0; i < inputs.length; i++) for (let j = i + 1; j < inputs.length; j++) {
          const a = inputs[i].getBoundingClientRect(), b = inputs[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push([inputs[i].id, inputs[j].id]);
        }
        return errors;
      });
      assert.deepEqual(overlaps, [], `${label}: no overlapping controls`);
    };
    await page.goto(baseUrl);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await load();
      await page.locator("#compareMissing").click();
      await page.waitForFunction(() => analyticalTarget("delivery_days").result !== null);
      await page.locator('[data-analysis-column="channel"]').click();
      assert.ok((await page.locator(".analytical-section").innerText()).includes("Distributor"));
      await page.locator(".analytical-hold > summary").click();
      await page.locator("#analysisCompareColumn").selectOption("quantity");
      await page.locator("#analysisHoldColumn").selectOption("channel");
      assert.equal(await page.locator("#analysisBandMode").isVisible(), false, "Categorical holds do not show numeric band controls");
      await page.locator("#runHeldComparison").click();
      await page.waitForFunction(() => analyticalTarget("delivery_days").held.length > 0);
      assert.ok(["explained", "partial"].includes(await page.evaluate(() => analyticalTarget("delivery_days").held[0].verdict)));
      await layout(`${width} comparisons`);
      if (process.env.ARTIFACT_DIR) { await page.evaluate(() => { scrollTo(0, 0); $("#toast").classList.remove("show"); }); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/analytics-comparison-${width}.png`, fullPage: true }); }
      await page.locator("#explainMissingPattern").click();
      await page.waitForFunction(() => analyticalTarget("delivery_days").ai !== null);
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.locator("#usePatternProposal").click();
      await page.waitForFunction(() => state.reviewStep === 3);
      assert.equal(await page.locator("#reviewOperation").inputValue(), "groupwise");
      await layout(`${width} group-wise treatment`);
      await stage(4);
      assert.ok((await page.locator(".fill-provenance").innerText()).includes("channel: Distributor"));
      assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).fillMetadata.fallbackCount), 0);
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await layout(`${width} group-wise preview`);
      if (process.env.ARTIFACT_DIR) { await page.evaluate(() => { scrollTo(0, 0); $("#toast").classList.remove("show"); }); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/analytics-preview-${width}.png`, fullPage: true }); }
      await stage(5); await page.locator("#approveGuided").click();
      assert.ok(await page.evaluate(() => state.changes[0].treatment.fillMetadata.fills.every(fill => fill.source === "band")));
      assert.ok(await page.evaluate(() => metrics().changedCells > 0));
      await page.locator("[data-screen=changes]").click();
      assert.ok((await page.locator(".fill-provenance").innerText()).includes("groupwise"));
      await page.evaluate(() => { const backup = serializeProject(); restoreProject(backup); });
      await page.locator("[data-screen=changes]").click();
      assert.ok((await page.locator(".fill-provenance").innerText()).includes("groupwise"));
      await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.evaluate(() => restoreProject(serializeProject()));
      assert.equal(await page.evaluate(() => metrics().changedCells), 0, "Rolled-back source traces survive project restore");
      await page.locator("[data-screen=report]").click();
      const download = page.waitForEvent("download"); await page.locator("#downloadCsv").click(); await download;
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await load();
    await stage(2); await page.locator("input[name=reviewInterpretation][value=missing]").check(); await stage(3);
    await page.locator("#reviewOperation").selectOption("knn");
    // Use a small explicit scope to verify exact donor trace and scope isolation.
    await page.locator("#reviewScopeMode").selectOption("selected");
    const rowId = await page.evaluate(() => state.issues.find(item => item.id === state.selectedIssue).rows[0]._row);
    await page.locator("#reviewRowIds").fill(String(rowId));
    await stage(4);
    assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).fillMetadata.fills.length), 1);
    assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).fillMetadata.fills[0].neighbourRows.length), 7);
    await stage(5); await page.locator("#approveGuided").click();
    assert.equal(await page.evaluate(() => metrics().changedCells), 1);
    await page.locator("[data-screen=changes]").click();
    assert.ok((await page.locator(".fill-provenance").innerText()).includes("knn"));
    await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
    assert.equal(await page.evaluate(() => metrics().changedCells), 0);
    // Worker remains off the main thread for a 50,000-row analytical workload.
    await page.evaluate(async () => {
      const { headers, rows } = parseCsv(await (await fetch("sales_orders.csv")).text());
      state.rows = Array.from({ length: 50000 }, (_, index) => ({ ...rows[index % rows.length], _row: index + 1 }));
      state.original = state.rows.map(row => ({ ...row })); state.allRows = state.rows; state.headers = headers;
      state.changes = []; state.datasetRevision++; invalidateCleaningProfile();
    });
    const heartbeat = await page.evaluate(async () => {
      let ticks = 0; const timer = setInterval(() => ticks++, 10);
      try {
        const result = await analyticalTask("compare", "delivery_days", { options: analyticalOptions() });
        const held = await analyticalTask("hold", "delivery_days", { comparisonColumn: "quantity", holdColumn: "channel", banding: {}, options: analyticalOptions() });
        const fill = await analyticalTask("fill", "delivery_days", { params: { method: "groupwise", columns: ["channel"] }, options: analyticalOptions() });
        const knn = await analyticalTask("fill", "delivery_days", { params: { method: "knn", columns: ["channel"], k: 7 }, options: analyticalOptions() });
        return { ticks, total: result.total, bands: held.bands.length, fills: fill.fills.length, knnFills: knn.fills.length };
      } finally { clearInterval(timer); }
    });
    assert.equal(heartbeat.total, 50000); assert.ok(heartbeat.ticks > 0 && heartbeat.fills > 0 && heartbeat.knnFills > 0 && heartbeat.bands >= 2);
    assert.equal(patternCalls, 2); assert.deepEqual(errors, []);
    console.log("PASS: hosted-capable desktop/mobile comparisons, held verdicts, summary-only AI proposal, group-wise/KNN preview/approval/provenance/restore/rollback/export, 50k-row responsive worker, no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
