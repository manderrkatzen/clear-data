const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}}), errors = [];
    page.on("pageerror",error => errors.push(error.stack));
    await page.route("**/api/ai/**",route => route.fulfill({status:route.request().method() === "POST" ? 503 : 200,json:{available:false,error:"AI unavailable",turnstileSiteKey:""}}));
    await page.goto(`${process.env.BASE_URL || "http://localhost:4174"}/?debug=ui`);
    const results = await page.evaluate(async () => {
      const columns = ["record_id","amount","age","channel","region","zip","date","discount_pct","profit_usd","revenue_usd","cost_usd","constant","parts","contact"];
      const rows = Array.from({length:100},(_,i) => ({_row:i+1,record_id:String(i===99?1:i+1),amount:i<5?"":String(10+i%3),age:i===0?"-2":"30",channel:i<10?"paid_social":"Paid Social",region:i<5?"North ":"North",zip:i<10?"2134":"90210",date:i<10?"3/7/2025":"2025-03-07",discount_pct:i<10?"0.5":"50",profit_usd:i<5?"-7800":"8",revenue_usd:"10",cost_usd:"2",constant:"USD",parts:i<10?"Email; Search":"Email",contact:i<50?"jane@example.com":"+1 (202) 555-4821"}));
      rows[98].amount="10000";
      rows[97].amount="oops";
      loadData(csvText(columns,rows),"all-issue-families-fixture.csv"); cancelAutomaticReview(false);
      const report = [], originals = JSON.stringify(state.original);
      for (const type of ReviewCore.order) {
        let issue = state.issues.find(issue => issue.reviewType === type && issue.status === "open");
        if (type === "duplicate-rows" && !issue) {
          const original = {...state.rows[97],_row:101}; original.record_id=state.rows[97].record_id;
          loadData(csvText(columns,state.rows.concat(original)),"all-issue-families-with-exact-copy.csv");cancelAutomaticReview(false);
          issue=state.issues.find(issue=>issue.reviewType===type);
        }
        if (!issue) throw new Error(`Missing dedicated ${type} finding`);
        if (ReviewCore.moduleFor(issue).renderExplore(issue,ReviewCore.data(issue)).includes("next build stage")) throw new Error(`Fallback remains for ${type}`);
        ReviewCore.select(issue.id);
        const session = ReviewCore.data(issue), module = ReviewCore.moduleFor(issue);
        if (type === "duplicate-values") {session.repeated=false;session.locked=module.lockedRows(issue,session).length?session.locked:session.locked;}
        if (module.aiExplore) {await module.aiExplore(issue,session); if (type !== "sensitive" && !ReviewModules.sensitive.isSensitiveColumn(issue.column) && session.aiStatus === "error" && session.aiReason !== "not configured") throw new Error(`${type}: unavailable reason ${session.aiReason}`);}
        if (!ReviewCore.affected(issue).length) { report.push(`${type}: inspected, explicit locks required`); continue; }
        session.tab="fix";
        const options = module.getFixOptions(issue,session).filter(option=>!option.disabled && !option.requiresConflictAcknowledgement);
        // Compute every local option, including keep/no-change, and inspect the shared controls.
        for (const option of options) {
          if (option.key === "one-by-one" || option.key === "rule" || option.key === "merge" || option.key === "ai-parse" || option.key === "ai-typos") continue;
          session.fix=option.key;
          await ReviewCore.compute(issue);
          if (session.error && !session.preview) { report.push(`${type}/${option.key}: explained prerequisite (${session.error})`); continue; }
          if (!session.preview) throw new Error(`${type}/${option.key}: no preview`);
          for (const button of document.querySelectorAll(".review-page button:disabled,.review-page select:disabled")) if (!button.title) throw new Error(`${type}/${option.key}: unexplained disabled control ${button.id}`);
          for (const element of document.querySelectorAll(".review-main p,.review-main td,.review-main span")) if (element.textContent.trim() === "—") throw new Error(`${type}/${option.key}: lone dash`);
          report.push(`${type}/${option.key}: preview ready`);
        }
        // Every issue family's acceptance is reversible, without touching values.
        session.note="Internal review fixture retained intentionally.";
        const keep=options.find(option=>["keep","leave","keep-all"].includes(option.key));
        if (keep) { session.fix=keep.key;await ReviewCore.compute(issue);if(session.preview&&!session.preview.blocked.length){const before=JSON.stringify(state.rows);await ReviewCore.apply(issue);ReviewCore.undo(issue);if(JSON.stringify(state.rows)!==before)throw new Error(`${type}: no-change Undo differs`);} }
      }
      if (JSON.stringify(state.original)!==originals && state.fileName!=='all-issue-families-with-exact-copy.csv') throw new Error("Source mutated");
      return report;
    });
    console.log(results.join("\n"));
    // CORE-T-04: a calendar failure must remain open until subset approval is explicit.
    await page.evaluate(() => {loadData("id,date\n1,3/25/2025\n2,31/02/2025\n3,2025-03-25","blocked-date-fixture.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.reviewType==="format").id);});
    await page.locator("#reviewTab-fix").click();
    const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending&&Boolean(ReviewCore.data(ReviewCore.current()).preview));await ready();
    assert.ok(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.blocked.length>0));
    assert.equal(await page.locator("#reviewApply").isDisabled(),true);
    await page.locator("#reviewSkipBlocked").check();await ready();
    await page.locator("#reviewApply").click();
    assert.equal(await page.evaluate(()=>state.rows[1].date),"31/02/2025");
    assert.equal(await page.evaluate(()=>state.issues.find(issue=>issue.reviewType==="format").status),"open");
    await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>metrics().changedCells),0);
    // Persist resolved cross-column evidence, and verify Undo after an actual project round trip.
    await page.evaluate(async()=>{const rows=Array.from({length:100},(_,i)=>({_row:i+1,id:String(i+1),profit_usd:i<3?"-7800":"8",revenue_usd:"10",cost_usd:"2"}));loadData(csvText(["id","profit_usd","revenue_usd","cost_usd"],rows),"cross-project.csv");cancelAutomaticReview(false);const issue=state.issues.find(issue=>issue.reviewType==="cross-column");ReviewCore.select(issue.id);ReviewCore.data(issue).tab="fix";ReviewCore.data(issue).fix="recalculate";await ReviewCore.compute(issue);await ReviewCore.apply(issue);const saved=serializeProject();restoreProject(saved);ReviewCore.select(state.issues.find(issue=>issue.reviewType==="cross-column").id,"review");});
    assert.match(await page.locator('[data-ui="review.review.metrics"]').innerText(),/3 → 0/);
    await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>metrics().changedCells),0);
    const timings = await page.evaluate(async () => {
      const rows=Array.from({length:10000},(_,i)=>({_row:i+1,id:String(i+1),amount:i<1000?"":String(10+i%7),region:i%2?"North":"South"}));
      loadData(csvText(["id","amount","region"],rows),"10k-preview-budget.csv");cancelAutomaticReview(false);
      const issue=state.issues.find(issue=>issue.column==="amount"&&issue.reviewType==="missing");ReviewCore.select(issue.id);const session=ReviewCore.data(issue);session.tab="fix";session.fix="median";
      const start=performance.now();await ReviewCore.compute(issue);const elapsed=performance.now()-start;
      if (!session.preview || session.preview.patches.length!==1000) throw new Error("Incorrect 10k preview");
      return {elapsed:Math.round(elapsed),patches:session.preview.patches.length};
    });
    assert.ok(timings.elapsed<=300,`CORE-22: 10k option preview ${timings.elapsed}ms exceeds 300ms`);
    assert.deepEqual(errors,[]);
    console.log(`CORE-T-01…06 cross-module checks passed; 10k preview ${timings.elapsed}ms / ${timings.patches} patches`);
    await page.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
