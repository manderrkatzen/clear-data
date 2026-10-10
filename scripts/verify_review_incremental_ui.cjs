const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      let aiRequest;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => {
        if (route.request().method() === "POST") { aiRequest = route; return; }
        return route.fulfill({ status: 200, json: { available: true, turnstileSiteKey: "" } });
      });
      await page.goto(base);
      await page.evaluate(async () => {
        loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv");
        cancelAutomaticReview(false);
        const issue = state.issues.find(item => item.reviewType === "outlier");
        if (!issue) throw new Error("Bundled sample has no outlier finding");
        ReviewCore.select(issue.id);
      });
      await page.waitForFunction(() => {
        const session = ReviewCore.data(ReviewCore.current());
        return !session.comparePending && session.aiUnavailableByConfig === false;
      });
      const original = await page.evaluate(() => csvText());
      await page.evaluate(() => {
        window.retained = {
          page: document.querySelector(".review-page"),
          queue: document.querySelector(".review-issue-list"),
          content: document.getElementById("reviewTabContent"),
          slider: document.getElementById("outlierSlider"),
          chart: document.getElementById("outlierPlot"),
          list: document.querySelector('[data-ui="review.explore.outlier.list"]')
        };
        retained.content.scrollTop = 120;
        retained.queue.scrollTop = 80;
        retained.slider.focus({ preventScroll: true });
        retained.slider.value = "2";
        retained.slider.dispatchEvent(new Event("input", { bubbles: true }));
        window.retainedScroll = [retained.content.scrollTop, retained.queue.scrollTop];
      });
      // AI/config/analysis completions and repeat renders must retain the live interaction.
      await page.evaluate(() => { renderPreservingReviewFocus(); renderPreservingReviewFocus(); });
      assert.deepEqual(await page.evaluate(() => [
        retained.page === document.querySelector(".review-page"),
        retained.slider === document.getElementById("outlierSlider"),
        retained.chart === document.getElementById("outlierPlot"),
        retained.list === document.querySelector('[data-ui="review.explore.outlier.list"]'),
        document.activeElement === retained.slider,
        retained.slider.value === "2",
        retained.content.scrollTop === retainedScroll[0],
        retained.queue.scrollTop === retainedScroll[1]
      ]), Array(8).fill(true), `${width}: background updates preserve nodes, focus and scroll`);
      await page.locator("#outlierCancelRule").click();
      await page.locator("#outlierAi").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).aiStatus === "pending");
      assert.ok(aiRequest, "AI request issued");
      await page.evaluate(() => {
        retained.content.scrollTop = 90;
        retainedScroll[0] = retained.content.scrollTop;
        retained.slider.focus({ preventScroll: true });
      });
      await aiRequest.fulfill({ status: 200, json: { provider: "test", result: { note: "Review unusual values in their business context.", values: [] } } });
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).aiStatus === "ready");
      assert.deepEqual(await page.evaluate(() => [
        retained.page === document.querySelector(".review-page"),
        retained.content === document.getElementById("reviewTabContent"),
        retained.chart === document.getElementById("outlierPlot"),
        retained.slider === document.getElementById("outlierSlider"),
        document.activeElement === retained.slider,
        retained.content.scrollTop === retainedScroll[0]
      ]), Array(6).fill(true), `${width}: AI updates only its content`);
      await page.evaluate(() => {
        retained.slider.value = "2";
        retained.slider.dispatchEvent(new Event("input", { bubbles: true }));
        window.generationBefore = ReviewCore.data(ReviewCore.current()).generation;
      });
      await page.locator("#outlierApplyRule").click();
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).generation), await page.evaluate(() => generationBefore + 1), "One click runs one update after repeated bindings");
      assert.ok(await page.evaluate(() => retained.slider === document.getElementById("outlierSlider") && retained.page === document.querySelector(".review-page")));
      await page.locator("#reviewChooseFix").click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      assert.ok(await page.evaluate(() => retained.page === document.querySelector(".review-page") && retained.queue === document.querySelector(".review-issue-list")), "Tab changes retain the workspace and queue");
      await page.locator('[data-fix="cap"]').click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      await page.evaluate(() => { renderPreservingReviewFocus(); renderPreservingReviewFocus(); });
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).tab === "review");
      assert.equal(await page.evaluate(() => state.changes.length), 1, "Approval is not duplicated");
      await page.locator("#reviewUndo").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).tab === "explore");
      assert.equal(await page.evaluate(() => csvText()), original, "Undo restores source exactly");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No page overflow");
      assert.deepEqual(errors, []);
      console.log(`${width}px: stable slider/AI nodes, scroll/focus, single update, approval and Undo passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
