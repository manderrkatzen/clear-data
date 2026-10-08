const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
(async () => {
  const folder = "docs/screenshots/review-spec/12-sensitive";
  fs.mkdirSync(folder,{recursive:true});
  const browser = await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:900}}), errors = [], bodies = [];
      page.on("pageerror",error => errors.push(error.stack));
      await page.route("**/api/ai/**",route => {
        if (route.request().method() === "POST") bodies.push(route.request().postData() || "");
        if (route.request().url().endsWith("/status")) return route.fulfill({json:{available:true,provider:"mock",model:"mock"}});
        return route.fulfill({status:route.request().method() === "POST" ? 503 : 200,json:{error:"AI unavailable",turnstileSiteKey:""}});
      });
      await page.goto(`${process.env.BASE_URL || "http://localhost:4174"}/?debug=ui`);
      await page.evaluate(() => {
        const rows = Array.from({length:100},(_,index) => ({id:String(index+1),contact:index < 50 ? "jane@example.com" : "+1 (202) 555-4821",amount:String(index+1),_row:index+1}));
        loadData(csvText(["id","contact","amount"],rows),"sensitive-fixture.csv");
        cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "contact" && issue.reviewType === "sensitive").id);
      });
      assert.match(await page.locator('[data-ui="review.explore.sensitive.summary"]').innerText(),/50 email values.*50 phone values/);
      const exploreHtml = await page.locator('[data-ui="review.explore.sensitive"]').innerHTML();
      assert.ok(!exploreHtml.includes("jane@example.com") && !exploreHtml.includes("202) 555"));
      assert.equal(await page.locator('[data-sensitive-type]:checked').count(),2);
      await page.screenshot({path:`${folder}/explore-${width}.png`,fullPage:true});
      await page.locator("#reviewTab-fix").click();
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();
      await page.locator('[data-fix="hash"]').click(); await ready();
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(),/100 values replaced.*SHA-256/);
      await page.locator("#reviewRows").click();
      assert.ok(!(await page.locator(".review-row-panel").innerHTML()).includes("jane@example.com"));
      await page.locator("#reviewCloseRows").click();
      await page.screenshot({path:`${folder}/fix-${width}.png`,fullPage:true});
      await page.locator("#reviewApply").click();
      const codes = await page.evaluate(() => state.rows.map(row => row.contact));
      assert.equal(codes[0],codes[49]); assert.equal(codes[50],codes[99]); assert.notEqual(codes[0],codes[50]);
      assert.match(codes[0],/^sha256:[a-f0-9]{64}$/);
      assert.ok(await page.evaluate(() => !csvText().includes("jane@example.com")));
      const backup = await page.evaluate(() => serializeProject());
      await page.evaluate(backup => restoreProject(backup),backup);
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "contact" && issue.reviewType === "sensitive").id,"review"));
      await page.screenshot({path:`${folder}/review-${width}.png`,fullPage:true});
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => state.rows[0].contact),"jane@example.com");
      assert.equal(await page.evaluate(() => metrics().changedCells),0);
      // The header cannot bypass SENS-F-02's required note.
      await page.locator("#reviewAccept").click(); await ready();
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).fix),"keep");
      assert.equal(await page.locator("#reviewApply").isDisabled(),true);
      await page.locator("#reviewNote").fill("Internal contact list; recipients are approved.");
      assert.equal(await page.locator("#reviewApply").isDisabled(),false);
      await page.locator("#reviewApply").click();
      assert.match(await page.locator(".review-tab-content").innerText(),/Accepted without changes/);
      await page.locator("#reviewUndo").click();
      // Exercise real automatic candidate generation, and a related-label AI call.
      await page.evaluate(async () => {
        await startAutomaticReview();
        const issue = state.issues.find(issue => issue.column === "contact" && issue.reviewType === "category-variants");
        if (issue) await ReviewCore.requestAi(issue,"explore",ReviewModules["category-variants"].context?.(issue,ReviewCore.data(issue)) || {samples:["jane@example.com"]});
        const sensitive = state.issues.find(issue => issue.column === "contact" && issue.reviewType === "sensitive");
        await ReviewCore.requestAi(sensitive,"fix",{samples:["jane@example.com"]});
      });
      for (const body of bodies) { assert.ok(!body.includes("jane@example.com") && !body.includes("202) 555-4821"),"SENS-T-03: no detected identifiers in AI request bodies"); }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      assert.deepEqual(errors,[]);
      console.log(`SENS-T-01…03, local codes, project restore, export and required-note checks passed at ${width}px`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
