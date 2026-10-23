const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 1100, 900, 800, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false } }));
      await page.goto(process.env.BASE_URL || "http://localhost:4174");
      await page.evaluate(async () => {
        await document.fonts.ready;
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv");
        cancelAutomaticReview(false);
        window.shellNodes = [document.querySelector(".sidebar"), document.querySelector(".brand"), document.querySelector("#navigation"), document.querySelector(".topbar"), document.querySelector("#screen")];
        window.shellParent = document.querySelector("#screen").parentElement;
        window.shellSignature = () => {
          const sidebar = document.querySelector(".sidebar"), brand = document.querySelector(".brand"), nav = document.querySelector("#navigation");
          const box = sidebar.getBoundingClientRect(), styles = getComputedStyle(sidebar), brandStyles = getComputedStyle(brand);
          return { width: box.width, height: box.height, padding: styles.padding, brandSize: brandStyles.fontSize, brandPadding: brandStyles.padding, brandFont: brandStyles.fontFamily, brandWidth: brand.getBoundingClientRect().width, navTop: nav.getBoundingClientRect().top - box.top, buttons: [...nav.children].map(element => ({ height: element.getBoundingClientRect().height, fontSize: getComputedStyle(element).fontSize, padding: getComputedStyle(element).padding })) };
        };
      });
      const baseline = await page.evaluate(() => shellSignature());
      for (const name of ["view", "issues", "changes", "issues", "report", "data"]) {
        const frames = await page.evaluate(async name => {
          go(name);
          const frames = [];
          for (let i = 0; i < 4; i++) { await new Promise(requestAnimationFrame); frames.push(shellSignature()); }
          return frames;
        }, name);
        frames.forEach(signature => assert.deepEqual(signature, baseline, `${width}/${name}: shell must not resize, even during transition`));
        assert.ok(await page.evaluate(() => shellNodes.every(node => node.isConnected) && document.querySelector("#screen").parentElement === shellParent), "Shell nodes and workspace parent stay mounted");
        assert.equal(await page.locator(".sidebar").count(), 1);
        assert.equal(await page.locator("#screen .nav, #screen .top").count(), 0, "Review must not create replacement chrome");
        if (name === "issues") {
          assert.ok(await page.locator("[data-original-preview-trigger]").isVisible());
          assert.ok(await page.evaluate(() => document.querySelector(".main").getBoundingClientRect().width > 0));
          await page.screenshot({ path: `/tmp/opencode/stable-shell-${width}.png` });
        }
      }
      assert.deepEqual(errors, []);
      console.log(`${width}px: stable shell geometry across all screens and transition frames; same navigation, brand, topbar and workspace nodes`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
