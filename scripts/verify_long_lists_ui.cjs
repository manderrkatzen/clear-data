const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/cleardata-tools/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

// CORE-T-07: long review selections, tables, grouped evidence, duplicate groups and decision history scroll locally.
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route("**/api/ai/**", route => route.fulfill({ status: route.request().method() === "GET" ? 200 : 503, json: { available: false, turnstileSiteKey: "", error: "Not used in this check." } }));
      await page.goto(base);
      await page.evaluate(() => {
        loadData("target,context\n,1\n,2\n,3", "long_lists_fixture.csv");
        cancelAutomaticReview(false);
        const issue = state.issues.find(item => item.reviewType === "missing" && item.column === "target");
        ReviewCore.select(issue.id);
        const session = ReviewCore.data(issue), host = document.querySelector(".tab-content");
        const selection = ReviewComponents.selection(Array.from({ length: 320 }, (_, index) => ({ value: `Missing token ${index}`, count: 1, share: "0.3%" })), { ui: "review.explore.test.values" });
        const table = ReviewComponents.table({ columns: [{ key: "row", label: "Row", numeric: true }, { key: "value", label: "Value" }], rows: Array.from({ length: 320 }, (_, index) => ({ row: index + 1, value: `Value ${index + 1}` })), ui: "review.test.rows" });
        const groups = Array.from({ length: 100 }, (_, index) => ({ label: `Group ${index + 1}`, labels: [`Group ${index + 1}`], rows: Array.from({length:320},(_,row)=>({_row:index*320+row+1,target:"",context:String(index)})) }));
        const grouped = ReviewComponents.groupedTable(groups, { columns: [{ key: "_row", label: "Row", numeric: true }, { key: "target", label: "Target" }, { key: "context", label: "Context" }], target: "target", ui: "review.explore.missing.sheet", selectedIds: new Set(groups.map(group => group.rows[0]._row)), session });
        const duplicateGroups = Array.from({ length: 100 }, (_, index) => `<div class="grp"><div class="ghead">Group ${index + 1}</div><div class="body-rows">Rows in group</div></div>`).join("");
        host.insertAdjacentHTML("beforeend", `${selection}${table}${grouped}<div class="card scroll-x" data-ui="review.table" tabindex="0" role="region" aria-label="Duplicate group comparisons">${duplicateGroups}</div>`);
        const measure = selector => { const element=document.querySelector(selector);return {client:element.clientHeight,scroll:element.scrollHeight,overflowY:getComputedStyle(element).overflowY,maxHeight:getComputedStyle(element).maxHeight,focusable:element.tabIndex===0}; };
        window.listMeasurements={values:measure('.vals > div > [data-ui="review.explore.test.values"]'),table:measure('[data-ui="review.test.rows"]'),grouped:measure('[data-ui="review.explore.missing.sheet"].group-browser > [role="tabpanel"] > .scroll-x'),duplicateGroups:measure('[data-ui="review.table"]:has(> .grp)')};
        session.expandedLists={"review.explore.test.values":true,"review.test.rows":true};
        document.querySelector('[data-ui="review.explore.test.values"]').closest(".vals").outerHTML=ReviewComponents.selection(Array.from({length:320},(_,index)=>({value:`Missing token ${index}`,count:1,share:"0.3%"})),{ui:"review.explore.test.values"});
        document.querySelector('[data-ui="review.test.rows"]').outerHTML=ReviewComponents.table({columns:[{key:"row",label:"Row",numeric:true},{key:"value",label:"Value"}],rows:Array.from({length:320},(_,index)=>({row:index+1,value:`Value ${index+1}`})),ui:"review.test.rows"});
        window.expandedMeasurements={values:measure('.vals > div > [data-ui="review.explore.test.values"]'),table:measure('[data-ui="review.test.rows"]'),valueRows:document.querySelectorAll('[data-ui="review.explore.test.values"] .vrow').length,tableRows:document.querySelectorAll('[data-ui="review.test.rows"] tbody tr').length};
      });
      await page.screenshot({path:`/tmp/long-review-lists-${width}.png`,fullPage:true});
      await page.evaluate(() => {
        const measure = selector => { const element=document.querySelector(selector);return {client:element.clientHeight,scroll:element.scrollHeight,overflowY:getComputedStyle(element).overflowY,maxHeight:getComputedStyle(element).maxHeight,focusable:element.tabIndex===0}; };
        state.changes = Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1), disposition: "finalized", issue: { column: "target" }, title: `Decision ${index + 1}`, rows: [{ _row: index + 1 }], patches: [], removedRows: [], createdAt: "2026-01-01", before: "Missing", after: "Reviewed", reason: "Test history" }));
        go("changes");
        window.decisionMeasurements=measure(".change-list");
      });
      await page.screenshot({path:`/tmp/long-decision-history-${width}.png`,fullPage:true});
      const sizes = await page.evaluate(() => ({ ...window.listMeasurements, expanded:window.expandedMeasurements,decisions:window.decisionMeasurements,documentWidth: document.documentElement.scrollWidth }));
      for (const [name, size] of Object.entries(sizes).filter(([key]) => !["documentWidth","expanded"].includes(key))) {
        assert.ok(size.scroll > size.client, `${width}px ${name} has long contents and a bounded viewport: ${JSON.stringify(size)}`);
        assert.ok(["auto", "scroll"].includes(size.overflowY), `${width}px ${name} scrolls vertically`);
        assert.equal(size.focusable, true, `${width}px ${name} can receive keyboard focus`);
      }
      for(const name of ["values","table"]){const size=sizes.expanded[name];assert.ok(size.scroll>size.client,`${width}px show-all ${name} stays locally scrollable`);assert.ok(size.focusable);}
      assert.equal(sizes.expanded.valueRows,320);assert.equal(sizes.expanded.tableRows,320);
      assert.ok(sizes.documentWidth <= width + 1, `${width}px no page-wide horizontal overflow`);
      console.log(`${width}px: five long-list surfaces have bounded, keyboard-focusable vertical scrolling`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
