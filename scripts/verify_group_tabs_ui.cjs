const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/cleardata-tools/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false, turnstileSiteKey: "" } }));
      await page.goto(base);
      await page.evaluate(() => {
        const rows = Array.from({ length: 1800 }, (_, i) => `${i + 1},${i % 7 ? i % 90 : ""},Segment ${String(i % 12).padStart(2, "0")},${i % 100},${["North", "north", "South", "south"][i % 4]}`);
        loadData(`entry_id,value,segment,measure,category\n${rows.join("\n")}`, "group-tabs.csv");
        cancelAutomaticReview(false);
        const issue = state.issues.find(issue => issue.column === "value" && issue.reviewType === "missing");
        ReviewCore.select(issue.id);
        const session = ReviewCore.data(issue);
        session.groupingUserChosen = true; session.autoGroupColumn = ""; session.locks = ["segment"]; session.showAll = true;
        render();
      });
      const host = page.locator('[data-group-browser="review.explore.missing.sheet"]');
      const tabs = host.locator(":scope > [role=tablist] > [role=tab]");
      assert.equal(await tabs.count(), 12);
      assert.equal(await host.locator("[data-group-show], [data-review-show-all]").count(), 0);
      const originalScope = await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).map(row => row._row));
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).comparePending);
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.groupRenderCalls=0;window.groupOriginalRender=render;
        render=function(...args){window.groupRenderCalls++;return window.groupOriginalRender(...args);};
        window.groupStableNodes=[document.querySelector(".top"),document.querySelector(".issues"),document.querySelector(".main > .content"),document.querySelector(".group-tabs")];
      });
      const scroller = host.locator(":scope > [role=tabpanel] > .scroll-x");
      assert.equal(await scroller.locator("tbody tr").count(), 100);
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.waitForFunction(() => document.querySelector('[data-group-browser="review.explore.missing.sheet"] tbody').rows.length > 100);
      await scroller.evaluate(element => { element.scrollTop = 200; element.dispatchEvent(new Event("scroll")); });
      const firstId = await tabs.first().getAttribute("id");
      await tabs.nth(1).scrollIntoViewIfNeeded();
      const pagePosition=()=>page.evaluate(()=>({top:window.scrollY,left:window.scrollX,content:document.querySelector(".main > .content").scrollTop}));
      const beforeSwitch=await pagePosition();
      await tabs.nth(1).click();
      assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
      assert.deepEqual(await pagePosition(),beforeSwitch,"Group tabs must not jump the page or evidence container");
      await tabs.first().click();
      assert.equal(await scroller.evaluate(element => Math.round(element.scrollTop)), 200);
      assert.equal(await scroller.locator("tbody tr").count(), 150);
      await tabs.first().press("End");
      assert.equal(await tabs.last().getAttribute("aria-selected"), "true");
      await tabs.last().press("ArrowRight");
      assert.equal(await page.locator(`#${firstId}`).getAttribute("aria-selected"), "true");
      for(let index=0;index<4;index++)await tabs.nth(index%2).click();
      await tabs.first().click();
      assert.deepEqual(await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).map(row => row._row)), originalScope, "Browsing cannot change treatment scope");
      assert.equal(await page.evaluate(() => window.groupRenderCalls),0,"Tab switches and progressive loading must invoke zero workspace renders");
      assert.ok(await page.evaluate(() => window.groupStableNodes.every(node=>node.isConnected)),"Surrounding controls and the tab strip stay mounted");
      await page.evaluate(() => { render=window.groupOriginalRender; });
      await page.evaluate(() => render());
      assert.equal(await scroller.evaluate(element => Math.round(element.scrollTop)), 200, "Background render preserves group scroll");
      await page.locator("[data-review-tab=fix]").click();
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      await page.locator("[data-review-tab=explore]").click();
      assert.equal(await scroller.evaluate(element => Math.round(element.scrollTop)), 200, "Stage changes preserve group scroll");
      if (width === 390) {
        const strip = host.locator(":scope > [role=tablist]");
        await strip.scrollIntoViewIfNeeded();
        await strip.evaluate(element => { element.scrollLeft = 0; });
        const rect = await strip.boundingBox(), cdp = await page.context().newCDPSession(page);
        const y = rect.y + Math.min(20, rect.height / 2), start = rect.x + rect.width * .8;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
        for (let step = 1; step <= 5; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start - step * rect.width * .1, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('[data-group-browser="review.explore.missing.sheet"] > [role=tablist]').scrollLeft > 0);
        await cdp.detach();
      }
      for (const mode of ["quantiles", "fixedWidth", "custom"]) {
        await page.evaluate(mode => {
          const session = ReviewCore.data(ReviewCore.current());
          session.locks = ["measure"]; session.banding.measure = { mode, k: 5, width: 20, edges: [0, 20, 40, 60, 80, 100] }; session.bandCache = null;
          render();
        }, mode);
        assert.ok(await tabs.count() >= 5, `${mode} uses shared tabs`);
        assert.equal(await host.locator(".ghead, [data-group-show]").count(), 0);
      }
      await page.evaluate(() => { const session = ReviewCore.data(ReviewCore.current()); session.locks = ["segment", "measure"]; session.bandCache = null; render(); });
      assert.equal(await host.locator(".group-browser").count(), 1, "Nested groupings use the same tab component");
      assert.ok(await host.locator(".group-browser tbody tr").count() > 0);
      await page.evaluate(() => { window.groupRenderCalls=0;window.groupOriginalRender=render;render=function(...args){window.groupRenderCalls++;return window.groupOriginalRender(...args);}; });
      await host.locator(".group-browser > [role=tablist] > [role=tab]").last().click();
      await tabs.nth(1).click();
      assert.equal(await page.evaluate(() => window.groupRenderCalls),0,"Nested and parent tabs also update locally");
      await page.evaluate(() => {render=window.groupOriginalRender;});
      await page.screenshot({ path: `/tmp/group-tabs-${width}.png`, fullPage: true });
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "category" && issue.reviewType === "category-variants").id));
      assert.equal(await page.locator('[data-group-browser="review.explore.labels.all"] [role=tab]').count(), 4);
      const labelScope = await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).length);
      await page.locator('[data-group-browser="review.explore.labels.all"] [role=tab]').last().click();
      assert.equal(await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).length), labelScope);
      await page.evaluate(async () => {
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv"); cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.reviewType === "duplicate-rows").id);
      });
      const copies = page.locator('[data-group-browser="review.explore.dup-rows.groups"]');
      assert.ok(await copies.locator("[role=tab]").count() > 1);
      const scope = await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).length);
      await copies.locator("[role=tab]").last().click();
      assert.equal(await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).length), scope);
      await copies.locator("[data-duplicate-group]").uncheck();
      assert.ok(await page.evaluate(() => ReviewCore.affected(ReviewCore.current()).length) < scope, "Only explicit group selection changes scope");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`${width}px: categories, numeric ranges, quantiles, nested groups and duplicates share accessible tabs and scrolling rows`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
