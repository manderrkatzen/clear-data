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
      await page.evaluate(async () => {
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv");
        cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id);
      });
      await page.locator("[data-review-tab=fix]").click();
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await ready();
      await page.locator(".opt[data-o=median]").click();
      await ready();
      const chart = page.locator(".review-chart-impact").first();
      assert.match(await chart.locator("figcaption").innerText(), /^Fill 36 missing cells with 4\.$/);
      assert.deepEqual(await chart.locator(".review-chart-legend span").allTextContents(), ["Before", "After"]);
      assert.equal(await chart.locator("details").getAttribute("open"), null);
      const labels = await chart.locator("svg text").allTextContents();
      assert.ok(!labels.some(label => /median|below|above|filled/i.test(label)), "Plot has no scattered technical annotations");
      const marks = await chart.evaluate(figure => ({
        before: figure.querySelectorAll('[data-series="before"]').length,
        after: figure.querySelectorAll('[data-series="after"]').length,
        extra: figure.querySelectorAll('[data-series="filled"]').length,
        beforeColor: figure.querySelector('[data-series="before"]').getAttribute("fill"),
        afterColor: figure.querySelector('[data-series="after"]').getAttribute("fill")
      }));
      assert.deepEqual(marks, { before: 20, after: 20, extra: 0, beforeColor: "#B6CBF2", afterColor: "#2E6BD9" }, "Exactly two complete series use the requested colors");
      await chart.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/chart-clarity-fix-${width}.png`, fullPage: true });
      const bar=chart.locator('[data-series="after"]:not([data-bin-count="0"])').first(),tooltip=chart.locator('[role="tooltip"]');
      await bar.hover();
      assert.ok(await tooltip.isVisible());
      assert.equal(await tooltip.locator("strong").innerText(),"After");
      assert.equal(await tooltip.locator("span").innerText(),await bar.getAttribute("data-tooltip-range"));
      assert.equal(await tooltip.locator("small").innerText(),await bar.getAttribute("data-tooltip-values"));
      await page.screenshot({path:`/tmp/chart-tooltip-${width}.png`});
      await bar.focus();
      assert.ok(await tooltip.isVisible(),"Keyboard focus exposes the interval");
      await bar.press("Escape");
      assert.equal(await tooltip.isVisible(),false);
      await chart.locator('[data-series="before"]:not([data-bin-count="0"])').first().focus();
      assert.ok(await tooltip.isVisible(),"Focus alone opens a previously hidden tooltip");
      assert.equal(await tooltip.locator("strong").innerText(),"Before");
      await page.keyboard.press("Escape");
      if(width===390){
        await bar.scrollIntoViewIfNeeded();
        let box=await bar.boundingBox();
        await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
        assert.ok(await tooltip.isVisible(),"Touch exposes the interval");
        box=await bar.boundingBox();
        await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
        assert.equal(await tooltip.isVisible(),false,"A second tap dismisses the tooltip");
      }
      await chart.locator("summary").click();
      assert.match(await chart.locator("details table").innerText(), /Present numeric values\s+264\s+300/);
      assert.match(await chart.locator("details table").innerText(), /Median\s+4\s+4/);
      assert.match(await chart.locator("details").innerText(), /1st–99th percentile/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Expanded details fit the viewport");
      await chart.locator("summary").click();
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      assert.match(await chart.locator("figcaption").innerText(), /^Filled 36 missing cells with 4\.$/);
      assert.deepEqual(await chart.locator(".review-chart-legend span").allTextContents(), ["Before", "After"]);
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await page.evaluate(() => { const issue = state.issues.find(issue => issue.reviewType === "outlier"); ReviewCore.select(issue.id); });
      await page.locator("[data-review-tab=fix]").click();
      await ready();
      assert.match(await chart.locator("figcaption").innerText(), /^Update \d+ values /, "Outlier replacements are not mislabeled as fills");
      assert.ok(!/filled|missing cells/i.test(await chart.locator("figcaption").innerText()));
      const logBounds=await page.evaluate(()=>{
        const column=ReviewCore.current().column,values=[0,1,2,4,8,16,32,128,1024,16384],rows=values.map((value,index)=>({_row:index+1,[column]:String(value)})),policy={...columnPolicy(column),missingTokens:[]};
        const panel=document.createElement("dialog");
        panel.innerHTML=`<header><h2>Logarithmic intervals</h2><button id="reviewCloseRows">Close</button></header>${ReviewCharts.histogram(column,rows,rows,{log:true,snapshot:true,policy,title:"Logarithmic intervals"})}`;
        ReviewCore.openRowsPanel(panel);
        const observed=ReviewCharts.numeric(rows,column,new Set(),{snapshot:true,policy}),transformed=observed.map(Math.log1p),expected=AnalysisEngine.histogram([transformed,transformed],20);
        return [...panel.querySelectorAll('[data-series="after"]')].map((mark,index)=>({start:Number(mark.dataset.binStart),end:Number(mark.dataset.binEnd),count:Number(mark.dataset.binCount),expectedStart:Math.expm1(expected.min+(expected.max-expected.min)*index/20),expectedEnd:Math.expm1(expected.min+(expected.max-expected.min)*(index+1)/20),expectedCount:expected.sets[1].counts[index]}));
      });
      for(const bin of logBounds){assert.ok(Math.abs(bin.start-bin.expectedStart)<=1e-9*Math.max(1,Math.abs(bin.expectedStart)));assert.ok(Math.abs(bin.end-bin.expectedEnd)<=1e-9*Math.max(1,Math.abs(bin.expectedEnd)));assert.equal(bin.count,bin.expectedCount);}
      const logBar=page.locator('.review-row-panel [data-series="after"]:not([data-bin-count="0"])').first();
      await logBar.focus();
      assert.ok(await page.locator('.review-row-panel [role="tooltip"]').isVisible(),"Dialog charts expose tooltips too");
      assert.equal(await page.locator('.review-row-panel [role="tooltip"] span').innerText(),await logBar.getAttribute("data-tooltip-range"));
      await page.locator("#reviewCloseRows").click();
      assert.deepEqual(errors, []);
      console.log(`${width}px: two-series colors, hover/focus/touch tooltips, original-scale log intervals, counts and rollback passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
