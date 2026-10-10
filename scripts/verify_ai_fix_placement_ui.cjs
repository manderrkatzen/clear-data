const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      let posts = 0;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => {
        if (route.request().method() === "POST") {
          posts++;
          return route.fulfill({ status: 200, json: { provider: "test", result: { operation: "median", reason: "Review the median as an alternative." } } });
        }
        return route.fulfill({ status: 200, json: { available: true, turnstileSiteKey: "" } });
      });
      await page.goto(base);
      await page.evaluate(async () => {
        loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv");
        cancelAutomaticReview(false);
        const issue = state.issues.find(item => item.reviewType === "missing" && item.column === "delivery_days");
        ReviewCore.select(issue.id);
        const session = ReviewCore.data(issue);
        session.locks = ["channel"];
        ReviewCore.switchTab(issue, "fix");
      });
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      const original = await page.evaluate(() => csvText());
      const initialPosts = posts;
      await page.locator('[data-fix="median-by-group"]').click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      await page.locator("#reviewAskAi").click();
      assert.equal(posts, initialPosts, "Opening the composer does not send a request");
      assert.equal(await page.locator(".rc-option #reviewAiInstruction").count(), 0);
      assert.equal(await page.locator(".rc-options > #reviewAiRequest #reviewAiInstruction").count(), 1);
      assert.equal(await page.locator("#reviewAskAi").getAttribute("aria-expanded"), "true");
      assert.ok(await page.evaluate(() => document.activeElement.id === "reviewAiInstruction"));
      assert.ok(await page.evaluate(() => document.getElementById("reviewAiRequest").getBoundingClientRect().top >= document.getElementById("reviewAskAi").getBoundingClientRect().bottom));
      await page.locator("#reviewAiInstruction").fill("Prefer an estimate based on the available observations");
      await page.evaluate(() => { window.composer = document.getElementById("reviewAiRequest"); });
      await page.locator('[data-fix="median"]').click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      assert.ok(await page.evaluate(() => composer === document.getElementById("reviewAiRequest")), "Composer stays independent of the selected method");
      assert.equal(await page.locator("#reviewAiInstruction").inputValue(), "Prefer an estimate based on the available observations");
      await page.locator("#reviewSuggestAi").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).aiStatus === "ready");
      assert.equal(posts, initialPosts + 1);
      assert.equal(await page.evaluate(() => csvText()), original, "AI advice does not alter data");
      assert.equal(await page.locator(".rc-option #reviewAiInstruction").count(), 0);
      await page.locator("#reviewAskAi").click();
      assert.equal(await page.locator("#reviewAiRequest").count(), 0);
      assert.equal(await page.locator("#reviewAskAi").getAttribute("aria-expanded"), "false");
      await page.locator("#reviewAskAi").click();
      assert.equal(await page.locator("#reviewAiInstruction").inputValue(), "Prefer an estimate based on the available observations");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`${width}px: independent AI composer placement, focus, method switching and single request passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
