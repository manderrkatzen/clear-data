// Optional browser regression runner. Install Playwright separately; the app has
// no build dependencies. See README for PLAYWRIGHT_MODULE and browser setup.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
const fixture = "id,amount,region,visit_date,status\n001,10,North,2025-01-01,Active\n002,NULL,North,02/03/2025,active\n003,20,North,2025-01-03, Active \n004,0,South,31/02/2025,N/A\n005,30,South,2025-01-04,Active\n006,,South,2025-01-05,Active";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    let aiCalls = 0, delayAI = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/ai/status", route => route.fulfill({ json: { available: true, provider: "openai", model: "mock-model", healthChecked: false } }));
    await page.route("**/api/ai/interpretations", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { turnstileSiteKey: "", maxBatchSize: 6 } });
      const payload = route.request().postDataJSON(); aiCalls++;
      assert.ok(payload.candidates.length <= 6);
      if (delayAI) await new Promise(resolve => setTimeout(resolve, 350));
      const results = payload.candidates.map(candidate => ({ id: candidate.id, interpretations: [{ meaning: "missing", score: .8, explanation: "A missing representation is plausible; confirm the source meaning.", evidenceIds: [candidate.groups[0].id], operation: "retain", assumptions: ["Zero could be legitimate."] }, { meaning: "legitimate", score: .4, explanation: "The value may be legitimate in a subgroup.", evidenceIds: [], operation: "retain", assumptions: [] }] }));
      try { await route.fulfill({ json: { results, provider: "openai", model: "mock-model", calibrated: false } }); } catch { /* cancellation intentionally aborts a request */ }
    });
    await page.goto(baseUrl);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some(face => face.family === "Source Sans 3" && face.status === "loaded")), "Self-hosted interface font loads");
    const load = async (csv = fixture) => {
      await page.evaluate(csv => loadData(csv, "exceptions.csv"), csv);
      await page.waitForFunction(() => state.analysisStatus === "complete");
    };
    const choose = async expression => page.evaluate(expression => { const item = state.issues.find(new Function("item", `return ${expression}`)); state.selectedIssue = null; openIssue(item.id); }, expression);
    const toTreatment = async meaning => {
      await page.locator("#reviewNext").click();
      assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "2");
      await page.locator(`input[name=reviewInterpretation][value=${meaning}]`).check();
      await page.locator("#reviewNext").click();
    };
    const finalize = async () => {
      await page.locator("#reviewNext").click();
      assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "4");
      await page.locator("#reviewNext").click();
      await page.locator("#reviewNote").fill("Reviewed source context and exact scoped changes.");
      await page.locator("#approveGuided").click();
    };
    const layout = async label => {
      const result = await page.evaluate(() => {
        const overlaps = [];
        for (const group of document.querySelectorAll(".review-fields,.outlier-controls")) {
          const controls = [...group.querySelectorAll("input:not([type=checkbox]),select,textarea")].filter(input => input.getClientRects().length);
          for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push([controls[i].id, controls[j].id]);
          }
        }
        return { overflow: document.documentElement.scrollWidth - innerWidth, overlaps };
      });
      assert.ok(result.overflow <= 1, `${label}: page overflows by ${result.overflow}px`);
      assert.deepEqual(result.overlaps, [], `${label}: controls overlap`);
    };
    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 }); await load();
      await layout(`${width} overview`);
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await choose('item.candidate?.kind === "missing_token" && item.column === "amount"');
      await layout(`${width} evidence`);
      assert.equal(await page.locator(".review-stepper button:disabled").count(), 0);
      assert.ok(!(await page.locator(".guided-stage").innerText()).includes("Evidence first."));
      await page.locator('[data-review-step="3"]').click();
      assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "2", "Missing interpretation routes to the choice");
      await page.locator('[data-review-step="1"]').click();
      await page.locator('[data-review-step="2"]').focus();
      await page.locator('[data-review-step="2"]').press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.reviewStep), "2", "Stepper retains keyboard focus after rendering");
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("not a calibrated probability"));
      await layout(`${width} interpretation`);
      await page.locator("input[name=reviewInterpretation][value=missing]").check();
      await page.locator('[data-review-step="3"]').click();
      await page.locator("#reviewOperation").selectOption("missing");
      if (width === 1440) {
        await page.locator("#reviewOperation").focus();
        await page.locator("#reviewOperation").press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement.id), "reviewScopeMode");
      }
      await page.locator("#reviewScopeMode").selectOption("selected");
      await page.locator("#reviewRowIds").fill("2");
      await layout(`${width} treatment`);
      await page.locator('[data-review-step="5"]').click();
      assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "4", "Approval requires visiting the preview");
      await layout(`${width} preview`);
      assert.equal(await page.evaluate(() => state.rows[1].amount), "NULL");
      if (process.env.ARTIFACT_DIR && [1440, 390].includes(width)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/guided-preview-${width}.png`, fullPage: true }); }
      await page.locator('[data-review-step="5"]').click(); await layout(`${width} approval`);
      await page.locator('[data-review-step="3"]').click();
      assert.equal(await page.locator("#reviewRowIds").inputValue(), "2", "Going back preserves scope");
      await page.locator("#reviewOperation").selectOption("constant");
      await page.locator("#reviewValue").fill("10");
      await page.locator('[data-review-step="5"]').click();
      assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "4", "Editing treatment invalidates approval preview");
      await page.locator('[data-review-step="3"]').click();
      await page.locator("#reviewOperation").selectOption("missing");
      await page.locator('[data-review-step="4"]').click();
      await page.locator('[data-review-step="5"]').click();
      await page.locator("#approveGuided").click();
      assert.equal(await page.evaluate(() => state.rows[1].amount), "");
      assert.equal(await page.evaluate(() => state.rows[3].amount), "0");
      await page.locator(".guided-setup > summary").click();
      await page.locator("#guidedPolicies").click(); await layout(`${width} policies`);
      await page.locator("#closePolicy").click();
      await page.locator("#guidedRelations").click(); await layout(`${width} relationships`);
      await page.locator("#closeRelationships").click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load();
    await choose('item.candidate?.kind === "sentinel" && item.column === "amount"');
    await toTreatment("legitimate"); await finalize();
    assert.equal(await page.evaluate(() => state.rows[3].amount), "0");
    await choose('item.candidate?.kind === "date_format"'); await toTreatment("format");
    await page.locator("#reviewOperation").selectOption("parseDate");
    await page.locator("#reviewDateFormat").selectOption("dmy");
    await page.locator("#reviewNext").click();
    assert.ok((await page.locator(".preview-exceptions").innerText()).includes("Row 4"));
    await page.locator('[data-review-step="5"]').click();
    assert.equal(await page.locator("[data-current-step]").getAttribute("data-current-step"), "4", "Stepper cannot bypass blocked-record acknowledgement");
    await page.locator("#reviewSkipBlocked").check();
    await page.locator("#reviewNext").click(); await page.locator("#approveGuided").click();
    assert.equal(await page.evaluate(() => state.rows[1].visit_date), "2025-03-02");
    assert.equal(await page.evaluate(() => state.rows[3].visit_date), "31/02/2025");
    await page.locator(".guided-setup > summary").click();
    await page.locator("#guidedManual").click();
    await page.locator("#manualColumn").selectOption("amount");
    await page.locator("#manualRowIds").fill("3");
    await page.locator("#beginManual").click(); await toTreatment("error");
    await page.locator("#reviewOperation").selectOption("constant");
    await page.locator("#reviewValue").fill("21.5"); await finalize();
    assert.equal(await page.evaluate(() => state.rows[2].amount), "21.5");
    await page.locator("[data-screen=changes]").click();
    assert.ok((await page.locator(".decision-interpretation").first().innerText()).includes("error"));
    await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
    assert.equal(await page.evaluate(() => state.rows[2].amount), "20");
    assert.equal(await page.evaluate(() => state.rows[1].visit_date), "2025-03-02");
    await page.evaluate(() => { const backup = serializeProject(); restoreProject(backup); });
    await page.waitForFunction(() => state.analysisStatus === "complete");
    assert.equal(await page.evaluate(() => state.rows[1].visit_date), "2025-03-02");
    for (const sample of ["healthcare_patient_visits.csv", "sales_orders.csv", "marketing_campaigns.csv"]) {
      await page.evaluate(async sample => loadData(await (await fetch(sample)).text(), sample), sample);
      await page.waitForFunction(() => state.analysisStatus === "complete");
      await choose('item.recommendation === "impute"'); await toTreatment("missing");
      await page.locator("#reviewOperation").selectOption("mean"); await finalize();
      assert.ok(await page.evaluate(() => state.changes[0].patches.length > 0));
      await page.locator("[data-screen=changes]").click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.locator("[data-screen=report]").click();
      const download = page.waitForEvent("download"); await page.locator("#downloadCsv").click();
      assert.ok((await download).suggestedFilename().startsWith("cleaned-"));
    }
    await page.evaluate(async () => loadData(await (await fetch("marketing_campaigns.csv")).text(), "marketing_campaigns.csv"));
    await page.waitForFunction(() => state.analysisStatus === "complete");
    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await choose('item.recommendation === "outlier"');
      for (const method of ["iqr", "zscore", "percentile", "threshold", "custom"]) {
        await page.locator("[data-outlier-method]").selectOption(method);
        await layout(`${width} outlier ${method}`);
      }
      await page.locator("[data-outlier-method]").selectOption("percentile");
      await page.locator("details").filter({ has: page.locator("[data-scatter-plot]") }).locator("summary").click();
      assert.ok(await page.locator("[data-scatter-plot] circle").count() > 0);
      await layout(`${width} relationship plot`);
    }
    delayAI = true;
    await page.evaluate(csv => loadData(csv.replace("NULL", "N/A"), "cancel.csv"), fixture);
    await page.waitForFunction(() => state.analysisStatus === "running");
    await page.locator("#cancelInterpretation").click();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => state.analysisStatus), "cancelled");
    assert.equal(await page.evaluate(() => metrics().changedCells), 0);
    assert.ok(aiCalls > 0);
    assert.deepEqual(errors, []);
    console.log("PASS: automatic bounded AI interpretation; six responsive widths and all five steps; missing/zero classification; blocked dates; manual correction; history/rollback/project restore; three sample fill/rollback/export flows; cancellation; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
