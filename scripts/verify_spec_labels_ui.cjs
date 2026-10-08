const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";
const folder = "docs/screenshots/review-spec/05-labels";
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false, turnstileSiteKey: "" } }));
      await page.goto(`${base}/?debug=ui`);
      await page.evaluate(() => {
        const rows = Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1), channel: index < 70 ? "Paid Social" : index < 85 ? "paid_social" : index < 90 ? "PAID SOCIAL" : index < 97 ? "Email" : "e-mail", rep: index % 2 ? "REP-01" : "REP-02", revenue: "100", _row: index + 1 }));
        loadData(csvText(["id", "channel", "rep", "revenue"], rows), "label-groups-fixture.csv"); cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "channel" && issue.reviewType === "category-variants").id);
      });
      assert.equal(await page.locator('[data-ui="review.explore.labels.cluster"]').count(), 2);
      assert.ok(await page.locator("[data-label-cluster]").first().isChecked());
      assert.equal(await page.evaluate(() => state.issues.filter(issue => issue.column === "rep" && issue.reviewType === "category-variants").length), 0);
      await page.screenshot({ path: `${folder}/explore-${width}.png`, fullPage: true });
      await page.locator('[data-label-variant="e-mail"]').dragTo(page.locator("#labelsNotSame"));
      assert.equal(await page.locator('[data-label-variant="e-mail"]').count(), 0);
      await page.locator("#reviewTab-fix").click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(), /Paid Social/);
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(), /\$7,000\.00 → \$9,000\.00/);
      await page.screenshot({ path: `${folder}/fix-${width}.png`, fullPage: true });
      await page.locator("#reviewApply").click();
      assert.ok(await page.locator('[data-ui="review.review.metrics"]').isVisible());
      assert.equal(await page.evaluate(() => new Set(state.rows.map(row => row.channel)).size), 3);
      await page.screenshot({ path: `${folder}/review-${width}.png`, fullPage: true });
      await page.locator("#reviewUndo").click(); assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      assert.deepEqual(errors, []); console.log(`LBL-T-01…04 passed at ${width}px`); await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
