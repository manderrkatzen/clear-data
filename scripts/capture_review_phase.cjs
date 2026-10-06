const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const artifactDirectory = process.env.ARTIFACT_DIR || "docs/screenshots/workbench";
const phase = process.argv[2] || "phase0-before";
const base = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  require("node:fs").mkdirSync(artifactDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/status", route => route.fulfill({ json: { available: false } }));
      if (phase.startsWith("phase0") || phase === "phase1-before") {
        await page.route("**/review-workbench.js", async route => {
          const response = await route.fetch();
          await route.fulfill({ response, body: await response.text() + '\nisMissingWorkbench = () => false;' + (phase === "phase0-before" ? '\nanchorReviewUI = () => {};' : "") });
        });
      }
      if (phase === "phase3-before") await page.route("**/review-workbench.js", async route => {
        const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + '\norderReviewStage = () => {};' });
      });
      await page.goto(`${base}/${phase.includes("debug") ? "?debug=ui" : ""}`);
      await page.evaluate(async () => {
        loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv");
        openIssue(state.issues.find(item => item.column === "delivery_days" && item.recommendation === "impute").id);
      });
      if (!phase.includes("phase1-before") && (phase.includes("phase1") || phase.includes("phase2") || phase.includes("phase3"))) {
        await page.waitForFunction(() => typeof missingWorkbenchState === "function" && missingWorkbenchState(state.issues.find(item => item.id === state.selectedIssue)).results);
      }
      await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".guided-stage")?.scrollTo(0, 0); });
      await page.screenshot({ path: `${artifactDirectory}/${phase}-${width}.png`, fullPage: true });
      if (phase.startsWith("phase3")) {
        await page.evaluate(() => openIssue(state.issues.find(item => item.recommendation === "outlier").id));
        await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".guided-stage")?.scrollTo(0, 0); });
        await page.screenshot({ path: `${artifactDirectory}/${phase}-other-understand-${width}.png`, fullPage: true });
        await page.locator('[data-review-step="2"]').click();
        await page.locator('input[name=reviewInterpretation][value="legitimate"]').check();
        await page.locator('[data-review-step="3"]').click(); await page.locator('[data-review-step="4"]').click();
        await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".guided-stage")?.scrollTo(0, 0); });
        await page.screenshot({ path: `${artifactDirectory}/${phase}-other-preview-${width}.png`, fullPage: true });
      }
      if (errors.length) throw new Error(errors.join("\n"));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
