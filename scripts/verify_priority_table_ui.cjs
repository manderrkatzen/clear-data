// MISS-E-10…22: the user-approved single-table inspection model, separate from physical treatments.
const assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"/tmp/opencode/node_modules/playwright");
const base=process.env.BASE_URL||"http://localhost:4174",folder=process.env.ARTIFACT_DIR||"/tmp/opencode/priority-table";
(async()=>{
  fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch();
  try{for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack));
    await page.route("**/api/ai/**",route=>route.fulfill({status:route.request().method()==="POST"?503:200,json:{available:false,turnstileSiteKey:"",error:"AI unavailable"}}));
    await page.goto(base);
    const rows=Array.from({length:180},(_,i)=>({_row:i+1,record_id:`R-${i+1}`,amount:i>=102&&i%5!==0?"":String(10+i%11),distance_to_store:String(Math.floor(i/2)),store_type:i%2?"Retail":"Distributor",event_date:`2025-01-${String(i%28+1).padStart(2,"0")}`,region:i%3?"North":"South"}));
    await page.evaluate(rows=>{loadData(csvText(["record_id","amount","distance_to_store","store_type","event_date","region"],rows),"distance-pattern.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.column==="amount"&&issue.reviewType==="missing").id);},rows);
    const original=await page.evaluate(()=>csvText()),sourceIds=rows.map(row=>row._row),selected=rows.filter(row=>!row.amount).map(row=>row._row);
    const table=page.locator('.priority-table');
    const ids=()=>table.locator("tbody tr").evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.inspectionRow)));
    const headings=()=>table.locator("th").evaluateAll(nodes=>nodes.map(node=>node.textContent.trim().replace(/\d+$/,"")));
    const capture=async name=>{if(process.env.CAPTURE!=="0"){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${folder}/${name}-${width}.png`,fullPage:true});}};
    const ready=()=>page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).pending&&Boolean(ReviewCore.data(ReviewCore.current()).preview));
    assert.equal(await page.locator('[data-ui="review.explore.missing.sheet"] table').count(),1);
    assert.deepEqual(await ids(),sourceIds.slice(0,50));
    await page.locator("#missingAddOrder").selectOption("distance_to_store");
    await page.locator('[data-order-direction="0"]').click();
    await page.locator("#missingAddOrder").selectOption("store_type");
    const expected=[...rows].sort((a,b)=>Number(b.distance_to_store)-Number(a.distance_to_store)||a.store_type.localeCompare(b.store_type)||a._row-b._row).map(row=>row._row);
    assert.deepEqual(await ids(),expected.slice(0,50));
    assert.deepEqual((await headings()).slice(0,4),["Row","amount","distance_to_store","store_type"]);
    assert.ok(await table.locator("td.locked-gap").count()>20,"The missing values above distance 50 are visibly clustered");
    assert.equal(await page.locator('[data-ui="review.explore.missing.group"]').count(),0);
    assert.equal(await page.locator('[data-missing-band]').count(),0,"No automatic inspection ranges");
    assert.deepEqual(await page.evaluate(()=>state.rows.map(row=>row._row)),sourceIds);
    assert.deepEqual(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).locks),[],"Sorting never becomes fill grouping");
    assert.equal(await page.evaluate(()=>csvText()),original);
    const beforeHeaders=await headings();await page.waitForFunction(()=>!ReviewCore.data(ReviewCore.current()).comparePending);await page.evaluate(()=>renderPreservingReviewFocus());assert.deepEqual(await headings(),beforeHeaders,"Background comparison cannot replace visible columns");
    await capture("explore-priorities");
    await page.locator("#missingMoreRows").click();assert.equal(await table.locator("tbody tr").count(),100);
    await page.locator("#missingAllRows").click();assert.deepEqual(await ids(),expected);
    assert.equal(await table.locator("td.locked-gap").count(),selected.length);
    await page.locator('[data-order-position="1"]').selectOption("0");
    const reordered=[...rows].sort((a,b)=>a.store_type.localeCompare(b.store_type)||Number(b.distance_to_store)-Number(a.distance_to_store)||a._row-b._row).map(row=>row._row);
    assert.deepEqual(await ids(),reordered.slice(0,50));
    if(width===1440){await page.locator('[data-order-chip="0"]').dragTo(page.locator('[data-order-chip="1"]'));assert.deepEqual(await ids(),expected.slice(0,50));}
    else await page.locator('[data-order-position="1"]').selectOption("0");
    await page.locator("#missingColumns").click();await page.locator('[data-context-column="region"]').check();
    await page.locator("#missingColumns").click();
    const order=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).tableOrder);
    await page.locator("#reviewTab-fix").click();await ready();
    const fingerprint=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.fingerprint);
    assert.deepEqual(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.selectedIds),selected);
    assert.equal(await page.locator('[data-fix="median-by-group"]').isDisabled(),true);
    await page.locator("#reviewTab-explore").click();await page.locator('[data-order-direction="0"]').click();
    await page.locator("#reviewTab-fix").click();await ready();
    assert.equal(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.fingerprint),fingerprint,"Presentation sorting does not invalidate the treatment");
    await page.locator('.missing-fill-groups > summary').click();await page.locator("#missingAddLock").selectOption("store_type");await ready();
    await page.locator('[data-fix="median-by-group"]').click();await ready();
    const independentMedian=values=>{const sorted=values.sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
    const medians=Object.fromEntries(["Retail","Distributor"].map(group=>[group,independentMedian(rows.filter(row=>row.store_type===group&&row.amount).map(row=>Number(row.amount)))]));
    const patches=await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.patches);
    for(const patch of patches){const row=rows.find(row=>row._row===patch.rowId);assert.equal(Number(patch.after),Number(medians[row.store_type].toFixed(2)));}
    await page.locator('.missing-fill-groups > summary').click();await capture("fix-grouped");
    if(width===1440)assert.ok(await page.locator("#reviewApply").evaluate(node=>{const rect=node.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;}),"Apply remains in the desktop viewport without overlapping evidence");
    await page.locator("#reviewApply").click();await capture("review");
    const prefs=await page.evaluate(()=>({order:ReviewCore.data(ReviewCore.current()).tableOrder,columns:ReviewCore.data(ReviewCore.current()).tableColumns}));
    await page.evaluate(()=>{restoreProject(serializeProject());cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.column==="amount"&&issue.reviewType==="missing").id,"review");});
    await page.locator("#reviewUndo").click();
    assert.equal(await page.evaluate(()=>csvText()),original);
    assert.deepEqual(await page.evaluate(()=>({order:ReviewCore.data(ReviewCore.current()).tableOrder,columns:ReviewCore.data(ReviewCore.current()).tableColumns})),prefs);
    const corrupt=await page.evaluate(()=>{const before=csvText(),saved=serializeProject();saved.reviewPage[issueKey(ReviewCore.current())].tableOrder=[{column:"fabricated",direction:"desc"}];let rejected=false;try{restoreProject(saved);}catch{rejected=true;}return {rejected,unchanged:csvText()===before};});assert.deepEqual(corrupt,{rejected:true,unchanged:true});
    await page.locator("#missingResetOrder").click();assert.deepEqual(await ids(),sourceIds.slice(0,50));
    await page.locator("#missingAddOrder").selectOption("event_date");
    assert.deepEqual(await ids(),[...rows].sort((a,b)=>Date.parse(a.event_date)-Date.parse(b.event_date)||a._row-b._row).slice(0,50).map(row=>row._row));
    for(const size of [1280,900,600,width]){await page.setViewportSize({width:size,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No page overflow at ${size}`);}
    await page.setViewportSize({width,height:900});
    for(const [type,column] of [["outlier","unit_price_usd"],["cross-column","profit_usd"]]){
      await page.evaluate(async({type,column})=>{loadData(await(await fetch("sales_orders.csv")).text(),"sales_orders.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.reviewType===type&&issue.column===column).id);},{type,column});
      await capture(`${type}-explore`);await page.locator("#reviewTab-fix").click();await ready();await capture(`${type}-fix`);
    }
    assert.deepEqual(errors,[]);await page.close();console.log(`Single-table priorities, independent fill groups, exact Apply/restore/Undo and responsive UI passed at ${width}px`);
  }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
