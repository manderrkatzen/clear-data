const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/cleardata-tools/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false, turnstileSiteKey: "" } }));
      await page.goto(base);
      await page.evaluate(async () => {
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv");
        cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id);
      });
      await page.locator("[data-review-tab=fix]").click();
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();
      await page.locator(".opt[data-o=median]").click();
      await ready();
      const chart = page.locator(".review-chart-impact").first();
      assert.match(await chart.locator("figcaption").innerText(), /^Fill 36 missing cells with 4\.$/);
      assert.deepEqual(await chart.locator(".review-chart-legend span").allTextContents(), ["Before", "After", "Proposed fills"]);
      assert.equal(await chart.locator("details").getAttribute("open"), null);
      const labels = await chart.locator("svg text").allTextContents();
      assert.ok(!labels.some(label => /median|below|above|filled/i.test(label)), "Plot has no scattered technical annotations");
      const marks = await chart.evaluate(figure => ({
        before: figure.querySelectorAll('[data-series="before"]').length,
        after: figure.querySelectorAll('[data-series="after"]').length,
        filled: [...figure.querySelectorAll("[data-filled-segment]")].reduce((sum, mark) => sum + Number(mark.dataset.filledSegment), 0)
      }));
      assert.deepEqual(marks, { before: 20, after: 20, filled: 36 }, "Shared bins and fill counts remain intact");
      await chart.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/chart-clarity-fix-${width}.png`, fullPage: true });
      await chart.locator("summary").click();
      assert.match(await chart.locator("details table").innerText(), /Present numeric values\s+264\s+300/);
      assert.match(await chart.locator("details table").innerText(), /Median\s+4\s+4/);
      assert.match(await chart.locator("details").innerText(), /1st–99th percentile/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Expanded details fit the viewport");
      await chart.locator("summary").click();
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      assert.match(await chart.locator("figcaption").innerText(), /^Filled 36 missing cells with 4\.$/);
      assert.deepEqual(await chart.locator(".review-chart-legend span").allTextContents(), ["Before", "After", "Filled values"]);
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.evaluate(() => { const issue = state.issues.find(issue => issue.reviewType === "outlier"); ReviewCore.select(issue.id); });
      await page.locator("[data-review-tab=fix]").click();
      await ready();
      assert.match(await chart.locator("figcaption").innerText(), /^Update \d+ values /, "Outlier replacements are not mislabeled as fills");
      assert.ok(!/filled|missing cells/i.test(await chart.locator("figcaption").innerText()));
      assert.deepEqual(errors, []);
      console.log(`${width}px: clean impact chart, hidden details, preserved counts, proposed/recorded wording and rollback passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
