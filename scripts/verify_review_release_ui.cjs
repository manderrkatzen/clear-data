// Release smoke: a bundled sample, the new structural/privacy flows, and real exported CSVs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";
const folder = process.env.ARTIFACT_DIR || ".impeccable/review";
(async () => {
  fs.mkdirSync(folder,{recursive:true});
  const browser = await chromium.launch({ignoreDefaultArgs:["--disable-dev-shm-usage"]});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];
      page.on("pageerror",error=>errors.push(error.stack));
      page.on("console",message=>{if(message.type()==="error" && !/503|AI|provider|Ollama/i.test(message.text()))errors.push(message.text());});
      // Provider replies are mocked; CSV loading, local engines, history, and export are real.
      await page.route("**/api/ai/**",route=>route.fulfill({status:route.request().method()==="POST"?503:200,json:{available:false,turnstileSiteKey:"",error:"AI unavailable"}}));
      await page.goto(base);
      await page.evaluate(async()=>{loadData(await(await fetch("sales_orders.csv")).text(),"sales_orders.csv");cancelAutomaticReview(false);go("view");});
      assert.ok(await page.locator("td.flagged").count()>0);
      await page.locator("#sheetRail .sheet-bubble").first().waitFor();
      const target=await page.evaluate(()=>({row:state.rows.find(row=>!row.delivery_days.trim())._row,column:state.headers.indexOf("delivery_days")}));
      await page.locator(`td[data-cell-row="${target.row}"][data-cell-column="${target.column}"]`).click();
      assert.ok(await page.locator("#sheetDetails").isVisible());
      await page.locator("#sheetReview").click();
      assert.equal(await page.evaluate(()=>ReviewCore.current().reviewType),"missing");
      await page.locator("#missingAddLock").selectOption("channel");
      await page.locator("#reviewTab-fix").click();
      const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending&&Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();await page.locator('[data-fix="median-by-group"]').click();await ready();
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`${folder}/${width===1440?"desktop":"mobile"}.png`,fullPage:true});
      await page.locator("#reviewApply").click();
      assert.equal(await page.evaluate(()=>state.changes.length),1);
      assert.equal(await page.evaluate(()=>state.rows.filter(row=>!row.delivery_days.trim()).length),0);
      await page.evaluate(()=>go("changes"));
      assert.ok(await page.locator(".change-card").count()>0);
      await page.evaluate(()=>ReviewCore.select(state.issues.find(issue=>issue.column==="delivery_days"&&issue.reviewType==="missing").id,"review"));
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(()=>metrics().changedCells),0);
      const download=page.waitForEvent("download");await page.evaluate(()=>downloadCsv());
      const exported=await download,path=await exported.path();
      const parsed=await page.evaluate(csv=>parseCsv(csv),fs.readFileSync(path,"utf8"));
      assert.equal(parsed.rows.length,1000);assert.equal(parsed.rows.filter(row=>!row.delivery_days.trim()).length,86);
      for(const type of ["multi-value","sensitive"]) {
        await page.evaluate(type=>{const rows=Array.from({length:100},(_,i)=>({_row:i+1,id:String(i+1),value:type==="multi-value"?(i<10?"Email; Search":"Email"):(i<50?"jane@example.com":"+1 (202) 555-4821"),revenue_usd:"100"}));loadData(csvText(["id","value","revenue_usd"],rows),`${type}-release-fixture.csv`);cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.column==="value"&&issue.reviewType===type).id);},type);
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/${type}-explore-${width}.png`,fullPage:true});
        await page.locator("#reviewTab-fix").click();await ready();
        if(type==="sensitive"){await page.locator('[data-fix="hash"]').click();await ready();}
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:`${folder}/${type}-fix-${width}.png`,fullPage:true});
        await page.locator("#reviewApply").click();
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:`${folder}/${type}-review-${width}.png`,fullPage:true});
        await page.locator("#reviewUndo").click();assert.equal(await page.evaluate(()=>metrics().changedCells),0);
      }
      for(const size of [1280,900,600,width]){await page.setViewportSize({width:size,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No page overflow at ${size}`);}
      assert.deepEqual(errors,[]);await page.close();console.log(`Release smoke passed at ${width}px: sample inspection, preview, approval, history, Undo, export, splits and private codes`);
    }
    const response=await fetch(`${base}/api/ai/review`);assert.equal(response.status,200);const config=await response.json();assert.ok(Object.hasOwn(config,"turnstileSiteKey"));
    console.log(`Real Review API configuration route available on ${base}`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
