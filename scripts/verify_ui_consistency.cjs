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
      });
      for (const name of ["data", "view", "changes", "report"]) {
        await page.evaluate(name => go(name), name);
        await page.waitForFunction(name => state.screen === name && !renderingWorkspace && !workspaceRenderQueued, name);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${name}: page overflow`);
        if (name === "data") {
          await page.waitForFunction(() => getComputedStyle(document.querySelector(".cumulative-view .legend")).display === "flex");
          await page.waitForFunction(() => getComputedStyle(document.querySelector(".cumulative-view > .pairs")).display === "flex");
          await page.locator('[data-ui="dataset.setup"] > summary').click();
          await page.locator("#columnPolicies").click();
          assert.equal(await page.locator(".review-fields").evaluate(e => getComputedStyle(e).display), "grid", "Column definitions use shared field layout");
          assert.ok(await page.locator("#confirmDialog").evaluate(e => e.getBoundingClientRect().right <= innerWidth), "Definitions dialog fits the viewport");
          await page.locator("#closePolicy").click();
        }
        if (name === "view") {
          assert.equal(await page.locator(".view-toolbar").evaluate(e => getComputedStyle(e).display), "flex");
          assert.equal(await page.locator(".sheet-grid th small").first().evaluate(e => getComputedStyle(e).display), "block");
          assert.equal(await page.locator("#search").evaluate(e => getComputedStyle(e).borderRadius), "6px");
        }
      }
      await page.evaluate(() => go("issues"));
      const types = await page.evaluate(() => [...new Set(state.issues.map(issue => issue.reviewType))]);
      for (const type of types) {
        await page.evaluate(type => {
          const issue = state.issues.find(issue => issue.reviewType === type);
          ReviewCore.select(issue.id);
        }, type);
        if (type === "duplicate-rows") {
          assert.ok(await page.locator('[data-ui="review.explore.dup-rows.groups"] table').count() > 0, "Exact copies expose their source comparisons");
          const input = page.locator("[data-duplicate-group]").first();
          await input.uncheck();
          assert.equal(await input.isChecked(), false, "Duplicate group selection is usable");
          await input.check();
        }
        await page.locator("[data-review-tab=fix]").click();
        await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
        const layout = await page.evaluate(() => {
          const footer = document.querySelector(".main > .foot"), content = document.querySelector(".main > .content");
          const a = footer.getBoundingClientRect(), b = content.getBoundingClientRect();
          return { overlap: a.top < b.bottom - 2, position: getComputedStyle(footer).position, width: document.documentElement.scrollWidth, viewport: innerWidth };
        });
        assert.equal(layout.position, "static", `${width}px ${type}: footer reserves its own space`);
        assert.equal(layout.overlap, false, `${width}px ${type}: footer does not cover options/evidence`);
        assert.ok(layout.width <= layout.viewport + 1, `${width}px ${type}: no page overflow`);
      }
      // Exercise a real approval/history/rollback after the layout pass.
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id));
      await page.locator("[data-review-tab=fix]").click();
      await page.waitForFunction(() => { const session = ReviewCore.data(ReviewCore.current()); return !session.pending && Boolean(session.preview); });
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      const chart = page.locator(".review-chart").first();
      assert.ok(await chart.isVisible(), "Approved comparison remains visible");
      assert.notEqual(await chart.locator(".review-chart-legend .after").evaluate(e => getComputedStyle(e, "::before").backgroundColor), "rgba(0, 0, 0, 0)", "Legend has a visible color key");
      await page.evaluate(() => go("changes"));
      assert.ok(await page.locator(".change-card").count() > 0, "Decision appears in history");
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id, "review"));
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0, "Rollback restores source cells");
      assert.equal(await page.evaluate(() => parseCsv(csvText()).rows.length), 306, "Export retains original row population");
      assert.deepEqual(errors, []);
      console.log(`${width}px: all five screens and ${types.length} Review issue types passed shared-theme/layout checks`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
