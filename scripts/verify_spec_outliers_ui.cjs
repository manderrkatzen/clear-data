const assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"/tmp/opencode/node_modules/playwright");
const base=process.env.BASE_URL||"http://localhost:4174",folder="docs/screenshots/review-spec/02-outliers";
(async()=>{
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    for(const width of [1440,390]) {
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
      page.on("pageerror",error=>errors.push(error.stack));
      await page.route("**/api/ai/**",route=>{
        if(route.request().method()==="GET")return route.fulfill({json:{available:false,turnstileSiteKey:""}});
        const payload=route.request().postDataJSON();
        return route.fulfill({json:{provider:"mock",result:{requiresConfirmation:true,note:"Very large quantities could have an extra zero. Confirm the source before correcting them.",values:payload.context.values.map(entry=>({value:entry.value,classification:Number(entry.value)>=400?"likely-error":"plausible",reason:"Possible extra digit",...(Number(entry.value)>=400?{correction:String(Number(entry.value)/10)}:{})}))}}});
      });
      await page.goto(`${base}/?debug=ui`);
      await page.evaluate(async()=>{loadData(await(await fetch("sales_orders.csv")).text(),"sales_orders.csv");cancelAutomaticReview(false);});
      const select=column=>page.evaluate(column=>ReviewCore.select(state.issues.find(issue=>issue.column===column&&issue.reviewType==="outlier").id),column);
      const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending&&Boolean(ReviewCore.data(ReviewCore.current()).preview));
      const fix=async key=>{const button=page.locator(`[data-fix="${key}"]`);if(await button.count())await button.click();else await page.locator("#reviewMore").selectOption(key);await ready();};
      const shot=async tab=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/${tab}-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));};
      await select("unit_price_usd");
      // OUT-T-01: rule controls recompute the actual count and bounds.
      const initial=await page.evaluate(()=>ReviewCore.moduleFor(ReviewCore.current()).count(ReviewCore.current()));assert.ok(initial>0);
      await page.locator("#outlierSlider").evaluate(element=>{element.value="3";element.dispatchEvent(new Event("input",{bubbles:true}));});
      await page.waitForTimeout(250);
      const wider=await page.evaluate(()=>ReviewCore.moduleFor(ReviewCore.current()).count(ReviewCore.current()));assert.ok(wider<=initial);
      assert.match(await page.locator('[data-ui="review.explore.outlier.bounds"]').innerText(),/bounds:/);
      // OUT-T-02: fixed-range membership matches independently parsed source values.
      await page.locator("#outlierRule").selectOption("threshold");
      await page.locator("#outlier-lower").fill("1");await page.locator("#outlier-lower").dispatchEvent("input");
      await page.locator("#outlier-upper").fill("2000");await page.locator("#outlier-upper").dispatchEvent("input");await page.waitForTimeout(250);
      const sets=await page.evaluate(()=>{const issue=ReviewCore.current();return {actual:previewOutlier(issue).rows.map(row=>row._row).sort((a,b)=>a-b),expected:state.rows.filter(row=>{try{const value=CleaningEngine.parseNumber(row[issue.column],columnPolicy(issue.column));return value<1||value>2000;}catch{return false;}}).map(row=>row._row).sort((a,b)=>a-b)};});assert.deepEqual(sets.actual,sets.expected);
      assert.match(await page.locator('[data-ui="review.explore.outlier.list"]').innerText(),/0.01/);
      // OUT-T-03: the selected point is hollow and its matching list lock is unchecked.
      const point=page.locator("[data-outlier-point]").first();
      if(await point.count()){const id=await point.getAttribute("data-outlier-point");await point.press("Enter");assert.match(await page.locator('[data-ui="review.explore.outlier.count"]').innerText(),/1 unlocked as fine/);assert.equal(await page.locator(`[data-outlier-point="${id}"]`).getAttribute("fill"),"white");assert.equal(await page.locator(`[data-outlier-lock="${id}"]`).isChecked(),false);}
      await shot("explore");
      await page.locator("#reviewTab-fix").click();await ready();await fix("cap");assert.match(await page.locator('[data-ui="review.fix.consequence"]').innerText(),/Mean/);await shot("fix");
      // OUT-T-05: exact scoped capping, Review and source-restoring Undo.
      await page.locator("#reviewApply").click();await shot("review");assert.ok(await page.locator('[data-ui="review.review.metrics"]').isVisible());await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>metrics().changedCells),0);
      // OUT-T-04: validated assessment makes the correction option visible.
      await select("quantity");await page.locator("#outlierAi").click();await page.waitForFunction(()=>Boolean(ReviewCore.data(ReviewCore.current()).outlierAssessment));
      await page.locator("#reviewTab-fix").click();await ready();assert.ok(await page.locator('[data-fix="ai-typos"]').count()>0);
      // OUT-T-06: marking the locked outliers missing opens/updates the independent Missing module.
      await fix("set-missing");const expected=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.patches.length);await page.locator("#reviewApply").click();
      assert.ok(await page.evaluate(expected=>state.issues.some(issue=>issue.column==="quantity"&&issue.reviewType==="missing"&&ReviewModules.missing.count(issue)>=expected),expected));
      assert.deepEqual(errors,[]);await page.close();console.log(`OUT-T-01…06 passed at ${width}px`);
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
