const assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"/tmp/opencode/node_modules/playwright");
const base=process.env.BASE_URL||"http://localhost:4174",folder=process.env.ARTIFACT_DIR||"/tmp/opencode/spec2-ui",stage=process.env.SPEC2_STAGE||"missing";
const families={missing:["missing"],outlier:["outlier"],duplicates:["duplicate-rows","duplicate-values"],format:["format","type-mismatch","scale"],labels:["category-variants","whitespace"],rules:["invalid","cross-column"],remaining:["constant","leading-zeros","multi-value","sensitive"]};
(async()=>{
  fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch();
  try{for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on("pageerror",e=>errors.push(e.stack));
    await page.route("**/api/ai/**",r=>r.fulfill({status:r.request().method()==="POST"?503:200,json:{available:false,turnstileSiteKey:"",error:"AI unavailable"}}));await page.goto(base);
    const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending);
    async function checks(type,tab){
      assert.equal(await page.locator('.review-main [data-ui="review.lead"]').count(),1,`${type}/${tab} C1`);
      assert.equal(await page.locator('.review-main [data-ui="review.footer"]').count(),1,`${type}/${tab} C8`);
      assert.ok(await page.locator('[data-review-section]').count()<=3);
      assert.equal(await page.locator('.review-main button:disabled').count(),0);
      assert.equal(await page.locator('.review-main .primary').count(),1);
      assert.match(await page.locator('.review-main .primary').innerText(),/\d/);
      assert.ok(!/\b(locked|scope|treatment|candidate|representation|finding|semantic|provenance|attributed)s?\b/i.test(await page.locator('.review-main').innerText()),`${type}/${tab} LAY-51`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width===1440){const edges=await page.locator('[data-ui="review.lead"],.rc-section > h2,.rc-footer > div').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().left)));assert.equal(new Set(edges).size,1,`${type}/${tab} one left edge`);}
      if(process.env.CAPTURE!=="0"){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/${type}-${tab}-${width}.png`,fullPage:true});}
    }
    const types=stage==="all"?Object.values(families).flat():families[stage];if(!types)throw new Error(`Unknown stage ${stage}`);
    for(const type of types){
      await page.evaluate(async type=>{
        if(type==="missing"){loadData(await(await fetch("sales_orders.csv")).text(),"sales_orders.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(i=>i.reviewType==="missing"&&i.column==="sales_rep").id);return;}
        const headers=["record_id","amount","age","channel","region","zip","event_date","discount_pct","profit_usd","revenue_usd","cost_usd","currency","parts","contact"],rows=Array.from({length:100},(_,i)=>({_row:i+1,record_id:`R-${i===99?1:i+1}`,amount:i<5?"":String(10+i%7),age:i===0?"-2":"30",channel:i<10?"paid_social":"Paid Social",region:i<5?"North ":"North",zip:i<10?"2134":"90210",event_date:i===0?"TBD":i<10?"3/25/2025":"2025-03-25",discount_pct:i<10?"0.5":"50",profit_usd:i<3?"-7800":"8",revenue_usd:"10",cost_usd:"2",currency:"USD",parts:i<10?"Email; Search":"Email",contact:i<50?"jane@example.com":"+1 (202) 555-4821"}));rows[98].amount="10000";if(type==="duplicate-rows")rows.push({...rows[97],_row:101});loadData(csvText(headers,rows),"spec2-fixture.csv");cancelAutomaticReview(false);const wanted={outlier:"amount","duplicate-values":"record_id","duplicate-rows":"record_id",format:"event_date","type-mismatch":"event_date",scale:"discount_pct","category-variants":"channel",whitespace:"region",invalid:"age","cross-column":"profit_usd",constant:"currency","leading-zeros":"zip","multi-value":"parts",sensitive:"contact"}[type],issue=state.issues.find(i=>i.reviewType===type&&i.column===wanted);if(!issue)throw new Error(`Missing fixture ${type}`);ReviewCore.select(issue.id);
      },type);
      if(type==="duplicate-values"&&await page.locator("#duplicateNo").count())await page.locator("#duplicateNo").click();
      await checks(type,"explore");const original=await page.evaluate(()=>csvText());await page.locator("#reviewChooseFix").click();await ready();
      assert.ok(await page.locator('.rc-option').count()<=4);await checks(type,"fix");
      const preview=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview);if(preview?.blocked.length===preview?.selectedIds.length&&preview?.blocked.length){const alternate=page.locator('[data-fix="set-missing"]');if(await alternate.count())await alternate.click();await ready();}
      if(await page.locator("#reviewSkipBlocked").count())await page.locator("#reviewSkipBlocked").check();
      if(await page.locator("#duplicateConflictAck").count())await page.locator("#duplicateConflictAck").check();
      if(await page.locator("#reviewConstraints").count())await page.locator("#reviewConstraints").check();
      await ready();await page.locator("#reviewApply").click();await page.waitForFunction(()=>ReviewCore.data(ReviewCore.current()).tab==="review");await checks(type,"review");await page.locator("#reviewUndo").click();await page.waitForFunction(()=>ReviewCore.data(ReviewCore.current()).tab==="explore");assert.equal(await page.evaluate(()=>csvText()),original,`${type} exact Undo`);
    }
    if(stage==="missing"){
      await page.evaluate(()=>ReviewCore.select(state.issues.find(i=>i.reviewType==="missing"&&i.column==="delivery_days").id));await page.locator("#missingAddLock").selectOption("channel");
      assert.match(await page.locator('[data-ui="review.explore.missing.headline"]').innerText(),/Distributor/);assert.equal(await page.locator('.rc-evidence-group').filter({hasText:/Retail store/}).count(),0);await page.locator("#missingShowAll").check();assert.ok(await page.locator('.rc-evidence-group').filter({hasText:/Retail store/}).count()>0);await page.locator("#missingShowAll").uncheck();
      await page.locator("#reviewChooseFix").click();await ready();await page.locator('[data-fix="median-by-group"]').click();await ready();assert.match(await page.locator('[data-ui="review.change"]').innerText(),/\+86 filled/);const before=await page.evaluate(()=>csvText());await page.locator("#reviewApply").click();await page.waitForFunction(()=>ReviewCore.data(ReviewCore.current()).tab==="review");await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>csvText()),before);
      await page.evaluate(()=>{loadData("id,region\n1,NA\n2,Europe\n3,#REF!\n4,#DIV/0!", "excel-values.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(i=>i.column==="region"&&i.reviewType==="missing").id);});assert.equal(await page.evaluate(()=>ReviewCore.affected(ReviewCore.current()).length),0);assert.ok(await page.locator('[data-value="NA"]').count());assert.ok(await page.locator('[data-value="#REF!"]').count());assert.ok(await page.locator('[data-value="#DIV/0!"]').count());
    }
    assert.deepEqual(errors,[]);console.log(`Spec2 ${stage} templates, layout and Apply/Undo passed at ${width}px`);await page.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
