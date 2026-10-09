const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base=process.env.BASE_URL || "http://localhost:4174",folder="docs/screenshots/review-spec/01-missing-contract";
(async()=>{
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    for(const width of [1440,390]) {
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
      page.on("pageerror",error=>errors.push(error.stack));
      await page.route("**/api/ai/**",route=>{
        if(route.request().method()==="GET")return route.fulfill({json:{available:route.request().url().endsWith("/review"),turnstileSiteKey:""}});
        const payload=route.request().postDataJSON();requests.push(payload);
        if(!route.request().url().endsWith("/review"))return route.fulfill({status:503,json:{error:"not configured"}});
        return route.fulfill({json:{provider:"mock",result:payload.mode==="fix"?{requiresConfirmation:true,note:"Use the confirmed blank convention. Review the exact preview before applying.",operation:"constant",params:{value:"0",blankMeansValue:true},reason:"Uses the source convention."}:{requiresConfirmation:true,note:"NULL may represent a missing observation. Zero remains a candidate until its meaning is confirmed.",assessments:payload.context.values.map(entry=>({value:entry.value,confidence:entry.value==="0"?30:95,reason:"Review this representation's source convention."})),locks:payload.context.values.filter(entry=>entry.value!=="0").map(entry=>entry.value)}}});
      });
      await page.goto(`${base}/?debug=ui`);
      const load=async(headers,rows,name="contract.csv",policies=[])=>page.evaluate(({headers,rows,name,policies})=>{loadData(csvText(headers,rows),name);cancelAutomaticReview(false);if(policies.length)applyRuleConfig({...exportRuleConfig(),columns:policies});const issue=state.issues.find(issue=>issue.column===headers[1]&&issue.reviewType==="missing");if(issue)ReviewCore.select(issue.id);},{headers,rows,name,policies});
      const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending&&Boolean(ReviewCore.data(ReviewCore.current()).preview));
      const fillGroup=async column=>{await page.locator("#reviewTab-fix").click();await ready();if(await page.locator(".missing-fill-groups").getAttribute("open")===null)await page.locator(".missing-fill-groups > summary").click();await page.locator("#missingAddLock").selectOption(column);await ready();};
      const choose=async fix=>{if(fix==="knn")await page.waitForFunction(()=>(ReviewCore.data(ReviewCore.current()).comparison?.results || []).length>0);await page.locator("#reviewTab-fix").click();await ready();const button=page.locator(`[data-fix="${fix}"]`);if(await button.count())await button.click();else await page.locator("#reviewMore").selectOption(fix);await ready();};
      const undo=async()=>{await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>metrics().changedCells),0);};
      // MISS-D-01: aggregate numeric aliases before screening a spike, but keep representations independent.
      await load(["id","measure"],Array.from({length:100},(_,i)=>({_row:i+1,id:`row-${i+1}`,measure:i<30?"99":i<60?"99.0":i<80?"98":"100"})),"sentinel-aliases.csv");
      assert.deepEqual(await page.evaluate(()=>ReviewModules.missing.groups(ReviewCore.current()).map(group=>group.value).sort()),["99","99.0"]);
      assert.equal(await page.evaluate(()=>ReviewCore.affected(ReviewCore.current()).length),0);
      // MISS-D-03: a rare interior zero with dense neighbours is not a sentinel finding.
      await page.evaluate(()=>{const rows=Array.from({length:101},(_,i)=>({_row:i+1,id:`row-${i+1}`,measure:i===100?"0":i%2?"-0.5":"0.5"}));loadData(csvText(["id","measure"],rows),"legitimate-interior-zero.csv");cancelAutomaticReview(false);});
      assert.equal(await page.evaluate(()=>state.issues.some(issue=>issue.column==="measure"&&issue.reviewType==="missing")),false);
      // MISS-D-04: a lock change creates the dependent empty-column finding without physical mutation.
      await load(["id","measure"],Array.from({length:100},(_,i)=>({_row:i+1,id:`row-${i+1}`,measure:i<97?"NULL":String(10+i)})),"locked-null-empty.csv");
      await page.locator('[data-ui="review.explore.missing.value"][data-value="NULL"]').click();
      assert.equal(await page.evaluate(()=>ReviewCore.affected(ReviewCore.current()).length),97);
      assert.ok(await page.locator("#missingDropLink").isVisible());assert.equal(await page.evaluate(()=>metrics().changedCells),0);
      // CORE-17: notice remains queued while in Explore, then lasts three seconds in Fix.
      await page.waitForTimeout(3200);await page.locator("#reviewTab-fix").click();await ready();
      assert.match(await page.locator(".review-update").innerText(),/97 more/);
      // MISS-F-04…05: primary-target statistics include SD as well as total.
      const numericRows=Array.from({length:100},(_,i)=>({_row:i+1,id:`row-${i+1}`,amount:i<10?"":String(10+i%5),channel:i<60?"North":"South",hold:String(i),event_date:`2025-01-${String(i%28+1).padStart(2,"0")}`}));
      await load(["id","amount","channel","hold","event_date"],numericRows,"numeric-contract.csv");
      await fillGroup("channel");
      await fillGroup("hold");
      const bands=await page.evaluate(()=>{const issue=ReviewCore.current(),session=ReviewCore.data(issue),full=AnalysisEngine.prepare(state.headers,state.rows,analyticalOptions()),expected=AnalysisEngine.bandsFor(full,"hold",{mode:"quantiles",k:5,minCategoryCount:5}).labels,sub=state.rows.filter(row=>row.channel==="North"),actual=ReviewModules.missing.grouped(issue,session,sub,["hold"]);return actual.every(group=>group.rows.every(row=>expected[state.rows.findIndex(item=>item._row===row._row)]===group.label));});
      assert.equal(bands,true,"MISS-E-17: nested bands must not be recomputed from a subset");
      await choose("median");assert.equal(await page.locator(".review-effect-figures > span").count(),4);
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(),/Standard deviation/);
      assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(),/North/);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/numeric-fix-${width}.png`,fullPage:true});
      // CORE-25, CORE-26: current working context and an actual saved note.
      await page.locator("#reviewRows").click();assert.equal(await page.locator(".review-row-panel th").count(),5);await page.locator("#reviewCloseRows").click();
      await page.locator("#reviewAddNote").click();await page.locator("#reviewNote").fill("Scoped measurement review.");
      await page.locator("#reviewApply").click();assert.match(await page.locator('[data-ui="review.review.decision"]').innerText(),/Scoped measurement review/);
      const frame=await page.evaluate(()=>({before:state.changes[0].reviewImpact.beforeStats.median,excluded:state.changes[0].reviewImpact.beforeExcludedIds.length,risk:state.changes[0].snapshot.reviewSpec.risk}));
      assert.equal(frame.excluded,10);assert.equal(frame.risk,"Estimates values");
      await page.locator("#missingReviewGroups").check();
      assert.ok(await page.locator(".review-small-multiples > section").count()<=5);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/numeric-review-${width}.png`,fullPage:true});
      const backup=await page.evaluate(()=>serializeProject());
      const corruption=await page.evaluate(backup=>{const before=csvText(),bad=structuredClone(backup);bad.changes[0].reviewSpec.targetPolicy.decimals=100;let rejected=false;try{restoreProject(bad);}catch{rejected=true;}return {rejected,unchanged:before===csvText()};},backup);
      assert.deepEqual(corruption,{rejected:true,unchanged:true});
      await page.evaluate(backup=>restoreProject(backup),backup);await page.evaluate(()=>ReviewCore.select(state.issues.find(issue=>issue.column==="amount"&&issue.reviewType==="missing").id,"review"));
      await undo();
      // Every numerical choice must run its own preview -> Apply -> Review -> Undo path.
      for(const fix of ["mean","median-by-group","constant","knn","previous-value","next-value","interpolate","leave","drop-rows"]) {
        await load(["id","amount","channel","hold","event_date"],numericRows,`${fix}-contract.csv`);
        if(fix==="median-by-group")await fillGroup("channel");
        await choose(fix);
        if(fix==="knn") {await page.locator("#missingKnnK").fill("7");await page.locator("#missingKnnK").dispatchEvent("change");await ready();}
        const blocked=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.blocked.length);
        if(blocked){await page.locator("#reviewSkipBlocked").check();await ready();}
        await page.locator("#reviewApply").click();assert.ok(await page.locator('[data-ui="review.review.metrics"]').isVisible());
        if(fix==="leave") {assert.equal(await page.locator('[data-ui="review.review.chart"] svg').count(),0);assert.equal(await page.evaluate(()=>state.changes[0].patches.length),0);}
        await undo();
      }
      // Missing zero is excluded before, but a confirmed zero fill is observed after—even under a token policy.
      await load(["id","measure","group"],Array.from({length:30},(_,i)=>({_row:i+1,id:`row-${i+1}`,measure:i<3?"":String(10+i%3),group:i%2?"North":"South"})),"confirmed-zero.csv",[{...await page.evaluate(()=>CleaningEngine.defaultPolicy("measure")),role:"number",missingTokens:["0"]}]);
      await choose("constant");await page.locator("#missingBlankMeans").check();await ready();
      assert.equal(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.afterMissing),0);
      await page.locator("#reviewApply").click();assert.equal(await page.evaluate(()=>observationState(state.rows[0],"measure")),"present");
      assert.match(await page.locator('[data-ui="review.review.chart"]').innerText(),/\+3 filled at 0/);
      assert.equal(await page.evaluate(()=>state.changes[0].reviewImpact.beforeExcludedIds.length),3);
      await undo();
      // MISS-A-02, MISS-A-03 / CORE-24, CORE-50: advice includes group medians/share and never applies itself.
      await load(["id","amount","channel","hold","event_date"],numericRows,"ai-fix-contract.csv");
      await fillGroup("channel");await choose("median");
      await page.locator("#reviewAskAi").click();await page.locator("#reviewAiInstruction").fill("Fill with 0; blank means no recorded charge.");await page.locator("#reviewSuggestAi").click();
      await page.locator('[data-fix="ai:constant"]').waitFor();assert.equal(await page.evaluate(()=>metrics().changedCells),0);
      assert.ok(await page.locator('[data-ui="review.fix.option"]').count()<=4);
      const advice=requests.filter(request=>request.mode==="fix").at(-1);assert.ok(advice.context.groups.some(group=>Number.isFinite(group.statistics.median)));assert.equal(advice.context.primaryMetric.affectedTotal,null);
      await page.locator('[data-fix="ai:constant"]').click();await ready();assert.equal(await page.locator("#missingConstant").inputValue(),"0");assert.equal(await page.locator("#missingBlankMeans").isChecked(),true);
      assert.match(await page.locator('[data-ui="review.fix.risk"]').innerText(),/Doesn't invent information/);await page.locator("#reviewApply").click();await undo();
      // CORE-58 and MISS-E-04: all representations are accessible and receive bounded, actual assessments.
      await load(["id","measure"],Array.from({length:210},(_,i)=>({_row:i+1,id:`row-${i+1}`,measure:`NULL${" ".repeat(i)}`})),"many-representations.csv");
      assert.equal(await page.locator('[data-ui="review.explore.missing.value"]').count(),200);
      await page.locator("#missingShowRepresentations").click();assert.equal(await page.locator('[data-ui="review.explore.missing.value"]').count(),210);
      await page.waitForFunction(()=>ReviewCore.data(ReviewCore.current()).aiStatus==="ready"&&ReviewCore.data(ReviewCore.current()).ai.assessments.length===210).catch(async error=>{console.log("Representation AI diagnostic",await page.evaluate(()=>{const session=ReviewCore.data(ReviewCore.current());return {status:session.aiStatus,reason:session.aiReason,assessments:session.ai?.assessments?.length,job:session.aiJob,scope:session.locked};}),"POSTs",requests.length);throw error;});
      assert.equal(await page.locator('[data-ui="review.explore.missing.confidence"]',{hasText:/AI 95%/}).count(),210);
      const once=requests.length;await page.evaluate(()=>renderPreservingReviewFocus());assert.equal(requests.length,once,"CORE-54: rerender must not restart the automatic job");
      for(const request of requests){assert.ok(!JSON.stringify(request).includes('"_row"'));assert.ok(request.context.values.length<=20);assert.ok(request.context.samples.length<=20);}
      // Date defaults, explicit dates, and explained unavailable ordering.
      await load(["id","event_date"],Array.from({length:20},(_,i)=>({_row:i+1,id:`row-${i+1}`,event_date:i<3?"":"2025-01-10"})),"date-contract.csv");
      await page.locator("#reviewTab-fix").click();await ready();await page.locator('[data-fix="constant"]').click();await page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending);await page.locator("#missingConstant").fill("2025-01-12");await page.locator("#missingConstant").dispatchEvent("change");await ready();await page.locator("#reviewApply").click();await undo();
      await page.locator("#reviewTab-fix").click();await ready();assert.ok(await page.locator('[data-fix="previous-value"]').isDisabled());assert.ok(await page.locator('[data-fix="previous-value"]').getAttribute("title"));
      assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      console.log(`00_shared + 01_missing expanded contract paths passed at ${width}px`);await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
