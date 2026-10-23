const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 900, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false, turnstileSiteKey: "" } }));
      await page.goto(base);
      await page.evaluate(async () => {
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv");
        cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id);
      });
      const trigger = page.locator("[data-original-preview-trigger]"), pane = page.locator("#originalPreview");
      assert.equal(await trigger.count(), 1, "Peek is available in Explore");
      await trigger.click();
      await pane.waitFor({state:"visible"});
      await page.keyboard.press("Escape");
      await page.locator("[data-review-tab=fix]").click();
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();
      await page.locator(".opt[data-o=median]").click();
      await ready();
      await page.evaluate(() => { render(); render(); render(); });
      assert.equal(await trigger.innerText(), "Peek at original data");
      const field = page.locator("#missingMedianValue");
      await field.fill("4.25"); // Keep a live, uncommitted draft in the underlying input.
      const snapshot = () => page.evaluate(() => {
        const session = ReviewCore.data(ReviewCore.current());
        return { url: location.href, screen: state.screen, issue: state.selectedIssue, tab: session.tab, fix: session.fix, draft: document.querySelector("#missingMedianValue")?.value, median: session.medianValue, generation: session.generation, fingerprint: session.preview?.fingerprint, patches: session.preview?.patches, changes: state.changes.length, windowTop: window.scrollY, contentTop: document.querySelector(".main > .content").scrollTop };
      });
      const before = await snapshot();
      await page.evaluate(() => {
        window.peekRenderCalls=0;window.peekOriginalRender=render;
        render=function(...args){window.peekRenderCalls++;return window.peekOriginalRender(...args);};
        window.peekUnderlyingNodes=[document.querySelector(".main"),document.querySelector(".main > .content"),document.querySelector("#missingMedianValue")];
        window.peekPreview=ReviewCore.data(ReviewCore.current()).preview;
      });
      if (width === 1440) {
         await trigger.hover();
         assert.equal(await pane.isVisible(),false,"Hover does not open the popup");
         assert.deepEqual(await snapshot(), before, "Hover leaves Fix untouched");
      }
      const clickTrigger = async () => {
        if (width === 390) { const box=await trigger.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2); }
        else await trigger.click();
      };
      await clickTrigger();
      await pane.waitFor({state:"visible"});
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      assert.equal(await pane.locator("tbody tr").count(), 250);
      assert.ok(await pane.evaluate(element => getComputedStyle(element).position === "fixed"), "The worksheet is an overlay pane");
      assert.ok(await page.locator("#originalPreviewBackdrop").evaluate(element => getComputedStyle(element).backdropFilter.includes("blur")), "Workspace is blurred");
      assert.ok(await page.evaluate(() => {
        const nav = document.querySelector(".sidebar").getBoundingClientRect();
        const backdrop = document.querySelector("#originalPreviewBackdrop").getBoundingClientRect();
        return nav.width > innerWidth / 2 ? backdrop.top >= nav.bottom : backdrop.left >= nav.right;
      }), "Navigation is outside the blur backdrop");
      const expected = await page.evaluate(() => String(state.original[0][state.originalHeaders[0]]));
      assert.equal(await pane.locator("tbody tr").first().locator("td").first().innerText(), expected, "Pane shows preserved source values");
      const scroll = pane.locator("#originalPreviewViewport");
      await scroll.evaluate(element => { element.scrollTop=220;element.scrollLeft=200; });
      await page.keyboard.press("9");
      assert.ok(await scroll.evaluate(element=>{const box=element.getBoundingClientRect();return Boolean(document.elementFromPoint(box.x+12,box.y+8)?.closest("thead"));}),"Worksheet headers remain above row numbers while scrolling");
      assert.deepEqual(await snapshot(), before, "Pane scrolling does not move Fix");
      await page.screenshot({path:`/tmp/worksheet-peek-${width}.png`});
      await pane.locator("#loadMoreOriginalRows").click();
      assert.equal(await pane.locator("tbody tr").count(), 306);
      await pane.locator("#closeOriginalPreview").click();
      await pane.waitFor({state:"hidden"});
      assert.deepEqual(await snapshot(), before, "Opening, paging, and closing preserve the draft, exact preview and page position");
      assert.equal(await page.evaluate(() => window.peekRenderCalls), 0, "Peek actions never invoke the workspace renderer");
      assert.ok(await page.evaluate(() => window.peekUnderlyingNodes.every(node=>node.isConnected) && window.peekPreview===ReviewCore.data(ReviewCore.current()).preview), "Underlying controls and preview stay mounted");
      await page.evaluate(() => {render=window.peekOriginalRender;});
      await field.dispatchEvent("change");
      await ready();
      await clickTrigger();
      await pane.waitFor({state:"visible"});
      await page.keyboard.press("Escape");
      await pane.waitFor({state:"hidden"});
      await trigger.focus();
      await trigger.press("Enter");
      assert.ok(await scroll.evaluate(element=>document.activeElement===element), "Keyboard activation enters the pane without scrolling the page");
      await page.keyboard.press("Shift+Tab");
      assert.ok(await pane.locator("#closeOriginalPreview").evaluate(element=>document.activeElement===element),"Pane header is keyboard reachable");
      await page.keyboard.press("Shift+Tab");
      assert.ok(await pane.locator("#loadMoreOriginalRows").evaluate(element=>document.activeElement===element),"Keyboard focus wraps inside the popup");
      await page.keyboard.press("1");
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).tab), "fix", "Review shortcuts cannot switch the underlying stage while peeking");
      await page.keyboard.press("Escape");
      await pane.waitFor({state:"hidden"});
      assert.ok(await trigger.evaluate(element=>document.activeElement===element), "Keyboard close returns focus to the opener");
      await page.evaluate(() => ReviewCore.switchTab(ReviewCore.current(), "explore"));
      assert.equal(await trigger.count(), 1);
      await page.locator("[data-review-tab=fix]").click();
      await ready();
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      assert.equal(await trigger.count(), 1, "Peek remains available in post-approval Review");
      assert.equal(await pane.isVisible(), false);
      await clickTrigger();
      await pane.waitFor({state:"visible"});
      await page.keyboard.press("Escape");
      await page.evaluate(()=>go("changes"));
      const historyTrigger=page.locator("#historyOriginalPreview");
      const historyNode=await page.locator(".change-list").elementHandle();
      await historyTrigger.click();
      await pane.waitFor({state:"visible"});
      const backdrop=await page.locator("#originalPreviewBackdrop").boundingBox();
      await page.mouse.click(backdrop.x+2,backdrop.y+2);
      await pane.waitFor({state:"hidden"});
      assert.ok(await historyNode.evaluate(node=>node.isConnected),"Decisions history stays mounted");
      assert.equal(await page.evaluate(()=>state.changes.length),1);
      await historyTrigger.click();
      await page.locator('#navigation [data-screen="issues"]').click();
      assert.equal(await pane.isVisible(),false,"Mode navigation remains usable and dismisses the popup");
      assert.equal(await historyTrigger.isVisible(),true,"Shared peek trigger stays visible in Review");
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      assert.deepEqual(errors, []);
      console.log(`${width}px: Review + Decisions popup, scoped blur, source rows, zero peek renders, untouched draft/preview/scroll, keyboard and touch passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
