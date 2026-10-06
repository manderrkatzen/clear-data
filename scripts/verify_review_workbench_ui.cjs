const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, acceptDownloads: true });
      page.setDefaultTimeout(60000);
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/status", route => route.fulfill({ json: { available: false } }));
      await page.goto(baseUrl);
      const load = async () => page.evaluate(async () => {
        loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv");
        openIssue(state.issues.find(item => item.column === "delivery_days" && item.recommendation === "impute").id);
      });
      const ready = () => page.waitForFunction(() => {
        const item = state.issues.find(item => item.id === state.selectedIssue), data = item && missingWorkbenchState(item);
        return data?.results && !data.pending && data.computedKey === workbenchKey(item);
      });
      const snapshot = () => page.evaluate(() => {
        const item = state.issues.find(item => item.id === state.selectedIssue), data = missingWorkbenchState(item);
        return { hold: data.hold, compare: data.compareColumn, verdict: data.held?.verdict, active: data.active, candidates: data.candidates.map(candidate => candidate.operation), bands: data.records.records.bands, changes: state.changes.length, scope: data.scope };
      });
      await load(); await ready();
      const queue = await page.evaluate(() => {
        const button = document.querySelector(".candidate-button.active"); button.focus();
        return { focus: button.id, order: [...document.querySelectorAll(".candidate-button")].map(button => button.dataset.guidedIssue) };
      });
      await page.evaluate(() => {
        const other = state.issues.find(item => item.status === "open" && item.id !== state.selectedIssue);
        state.interpretations[analysisCandidateId(other)] = { interpretations: [{ score: 1 }] };
        renderPreservingReviewFocus();
      });
      assert.equal(await page.evaluate(() => document.activeElement.id), queue.focus);
      assert.deepEqual(await page.locator(".candidate-button").evaluateAll(buttons => buttons.map(button => button.dataset.guidedIssue)), queue.order);
      assert.equal(await page.locator(".candidate-queue > .guided-setup").count(), 1);
      assert.ok((await page.locator(".analysis-banner b").innerText()).startsWith("AI status"));
      assert.equal(await page.locator(".guided-footer").evaluate(element => getComputedStyle(element).position), width > 800 ? "sticky" : "static");
      if (width > 800) assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".guided-stage")).paddingBottom) >= document.querySelector(".guided-footer").getBoundingClientRect().height));
      if (width > 800) assert.ok(await page.evaluate(() => document.querySelector(".guided-stage").getBoundingClientRect().bottom <= document.querySelector(".guided-footer").getBoundingClientRect().top + 1), "Footer has its own space and never overlays the scrolling review stage");
      let data = await snapshot();
      assert.equal(data.hold, "channel"); assert.equal(data.compare, "quantity"); assert.ok(["explained", "partial"].includes(data.verdict));
      assert.deepEqual(data.candidates, ["median", "groupwise", "leaveMissing"]); assert.equal(data.changes, 0);
      assert.equal(await page.locator(".review-stepper button").count(), 3);
      assert.ok((await page.locator(".guided-footer").innerText()).includes("Step 1 of 3"));
      assert.equal(await page.locator('[data-ui="review.missing.ranked-table"] tbody tr').count(), 3);
      await page.locator('input[name=activeWorkbenchCandidate][value="1"]').check(); await ready();
      data = await snapshot();
      assert.equal(data.bands.find(band => band.label === "Retail store").nMissing, 0);
      assert.ok(Math.abs(data.bands.find(band => band.label === "Distributor").fillValue - 4.3) < .2);
      assert.ok(Math.abs(data.bands.find(band => band.label === "Online").fillValue - 4.5) < .2);
      assert.equal(await page.locator(".workbench-histogram > div").count(), 16);
      assert.equal(await page.locator(".workbench-histogram > div").first().locator("i").count(), 4);
      assert.ok(data.bands.reduce((sum, band) => sum + band.rows.length, 0) <= 100);
      await page.locator("#workbenchByBand").check(); assert.ok(await page.locator(".band-impact").isVisible());
      await page.locator('[data-workbench-kpi="0"]').click(); await ready();
      assert.ok((await page.locator('[data-ui="review.workbench.kpi"]').innerText()).includes("Margin"));
      assert.equal((await snapshot()).active, 1);
      // Inspection changes must not alter candidate scope or patches.
      const scoped = await page.evaluate(() => missingWorkbenchState(state.issues.find(item => item.id === state.selectedIssue)).results.candidates[1].preview.selectedIds);
      await page.locator("#recordLensMode").selectOption("present"); await ready();
      assert.deepEqual(await page.evaluate(() => missingWorkbenchState(state.issues.find(item => item.id === state.selectedIssue)).results.candidates[1].preview.selectedIds), scoped);
      await page.locator("#recordLensMode").selectOption("both"); await ready();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: no page overflow`);
      await page.locator('[data-review-step="4"]').focus(); await page.locator('[data-review-step="4"]').press("Enter");
      await page.waitForFunction(() => state.reviewStep === 4);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.reviewStep), "4", "Workbench stepper keeps keyboard focus after candidate promotion");
      assert.equal(await page.locator(".guided-stage > .kpi-impact,.guided-stage > .band-impact,.guided-stage > .capability-records,.guided-stage > .dependency-impact").count(), 0);
      assert.equal(await page.locator('[data-ui="review.preview.kpi-headline"]').count(), 1);
      assert.equal(await page.locator(".fill-provenance").count(), 1);
      assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).selectedIds.length), 86);
      await page.locator("#reviewBack").click(); await ready(); assert.equal((await snapshot()).active, 1);
      await page.locator("#chooseWorkbenchFix").click(); await page.waitForFunction(() => state.reviewStep === 4);
      await page.locator("#reviewNext").click(); await page.waitForFunction(() => state.reviewStep === 5);
      await page.locator("#reviewNote").fill("Reviewed channel-specific reference medians in the shared workbench.");
      await page.locator("#approveGuided").click();
      assert.equal(await page.evaluate(() => state.changes[0].patches.length), 86);
      assert.equal(await page.evaluate(() => state.changes[0].interpretation), "missing");
      assert.equal(await page.evaluate(() => state.changes[0].treatment.fillMetadata.fills.length), 86);
      await page.locator('[data-screen="changes"]').click();
      await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
      assert.equal(await page.evaluate(() => state.changes.length), 0);
      assert.equal(await page.evaluate(() => state.rows.filter(row => !row.delivery_days.trim()).length), 86);
      await load(); await ready();
      await page.locator("#changeWorkbenchMeaning").click();
      await page.locator('input[name=reviewInterpretation][value="not_applicable"]').check(); await ready();
      assert.deepEqual((await snapshot()).candidates, ["retain"]);
      assert.equal(await page.locator("#workbenchAddCandidate").count(), 0);
      await page.locator("#closeWorkbenchMeaning").click();
      await page.locator("#chooseWorkbenchFix").click(); await page.waitForFunction(() => state.reviewStep === 4);
      assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).patches.length), 0);
      assert.equal(await page.evaluate(() => state.changes.length), 0);
      assert.deepEqual(errors, [], `${width}: no browser errors`);
      await page.close();
    }
    console.log("PASS: numeric missing workbench, automatic comparisons, shared channel hold, banded rows, three live candidates, shared bins, KPIs, inspection/scope separation, preview/back/approve, provenance, rollback, retention interpretation, desktop/mobile.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
