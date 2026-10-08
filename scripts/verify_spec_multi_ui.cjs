const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
(async () => {
  const folder = "docs/screenshots/review-spec/11-multi-value";
  fs.mkdirSync(folder,{recursive:true});
  const browser = await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:900}}), errors = [];
      page.on("pageerror",error => errors.push(error.message));
      await page.route("**/api/ai/**",route => route.fulfill({status:503,json:{error:"AI unavailable"}}));
      await page.goto(`${process.env.BASE_URL || "http://localhost:4174"}/?debug=ui`);
      await page.evaluate(() => {
        const rows = Array.from({length:100},(_,index) => ({id:String(index+1),channels:index < 10 ? "Email; Search" : "Email",revenue_usd:"100",_row:index+1}));
        loadData(csvText(["id","channels","revenue_usd"],rows),"multi-value-fixture.csv");
        cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "channels" && issue.reviewType === "multi-value").id);
      });
      assert.equal(await page.locator("#multiSeparator").inputValue(),";");
      assert.match(await page.locator('[data-ui="review.explore.multi.summary"]').innerText(),/10 cells \(10.0%\)/);
      assert.match(await page.locator('[data-ui="review.explore.multi.distinct"]').innerText(),/Email 100/);
      await page.screenshot({path:`${folder}/explore-${width}.png`,fullPage:true});
      await page.locator("#reviewTab-fix").click();
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(),/double-count.*\$1,000.00 counted extra/);
      await page.screenshot({path:`${folder}/fix-${width}.png`,fullPage:true});
      await page.locator("#reviewApply").click();
      assert.equal(await page.evaluate(() => state.rows.length),110);
      const backup = await page.evaluate(() => serializeProject());
      await page.evaluate(backup => restoreProject(backup),backup);
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "channels" && issue.reviewType === "multi-value" && issue.status !== "open").id,"review"));
      await page.screenshot({path:`${folder}/review-${width}.png`,fullPage:true});
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => state.rows.length),100);
      assert.equal(await page.evaluate(() => metrics().changedCells),0);
      for (const fix of ["split-to-columns","to-flags","keep-first"]) {
        await page.locator("#reviewTab-fix").click();
        await ready();
        await page.locator(`[data-fix="${fix}"]`).click();
        await ready();
        await page.locator("#reviewApply").click();
        if (fix === "split-to-columns") assert.equal(await page.evaluate(() => state.rows[0].channels_2),"Search");
        if (fix === "to-flags") { assert.equal(await page.evaluate(() => state.rows[0].channels_Search),"1"); assert.equal(await page.evaluate(() => state.rows[10].channels_Email),"1"); }
        if (fix === "keep-first") assert.equal(await page.evaluate(() => state.rows[0].channels),"Email");
        await page.locator("#reviewUndo").click();
        assert.equal(await page.evaluate(() => state.headers.length),3);
        assert.equal(await page.evaluate(() => metrics().changedCells),0);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      assert.deepEqual(errors,[]);
      console.log(`MULTI-T-01…02 and structural variants passed at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
