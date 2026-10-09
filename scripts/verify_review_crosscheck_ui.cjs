// Requirement cross-checks supplement the bundled acceptance examples with actual UI approval/restore/Undo paths.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";
const folder = process.env.ARTIFACT_DIR || "/tmp/opencode/review-crosscheck";
const results = [];

(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.stack));
      await page.route("**/api/ai/**", route => {
        if (route.request().method() === "POST") requests.push(route.request().postDataJSON());
        return route.fulfill({ status: route.request().method() === "POST" ? 503 : 200, json: { available: false, error: "AI unavailable", turnstileSiteKey: "" } });
      });
      await page.goto(`${base}/?debug=ui`);
      async function check(name, ids, run) {
        if(process.env.CROSSCHECK_FILTER&&!new RegExp(process.env.CROSSCHECK_FILTER).test(name))return;
        try {
          await run();
          results.push({ name, ids, width, status: "pass" });
          console.log(`PASS ${width}px ${name}`);
        } catch (error) {
          results.push({ name, ids, width, status: "fail", error: error.message });
          console.error(`FAIL ${width}px ${name}: ${error.message}`);
          await page.screenshot({ path: path.join(folder, `failure-${width}-${results.length}.png`), fullPage: true }).catch(() => {});
        }
      }
      async function fixture(type, column) {
        await page.evaluate(({ type, column }) => {
          const headers = ["record_id", "amount", "age", "channel", "region", "zip", "event_date", "discount_pct", "profit_usd", "revenue_usd", "cost_usd", "currency", "parts", "contact"];
          const rows = Array.from({ length: 100 }, (_, i) => ({
            _row: i + 1, record_id: `R-${i === 99 ? 1 : i + 1}`, amount: i < 5 ? "" : String(10 + i % 7), age: i === 0 ? "-2" : "30",
            channel: i < 10 ? "paid_social" : "Paid Social", region: i < 5 ? "North " : "North", zip: i < 10 ? "2134" : "90210",
            event_date: i === 0 ? "TBD" : i < 10 ? "3/25/2025" : "2025-03-25", discount_pct: i < 10 ? "0.5" : "50",
            profit_usd: i < 3 ? "-7800" : "8", revenue_usd: "10", cost_usd: "2", currency: "USD", parts: i < 10 ? "Email; Search" : "Email",
            contact: i < 50 ? "jane@example.com" : "+1 (202) 555-4821"
          }));
          rows[98].amount = "10000";
          if (type === "duplicate-rows") rows.push({ ...rows[97], _row: 101 });
          loadData(csvText(headers, rows), "crosscheck.csv");
          cancelAutomaticReview(false);
          const issue = state.issues.find(item => item.reviewType === type && item.column === column);
          if (!issue) throw new Error(`Fixture lacks ${type}/${column}`);
          ReviewCore.select(issue.id);
          if (type === "duplicate-values") { ReviewCore.data(issue).uniqueConfirmed = true; renderPreservingReviewFocus(); }
        }, { type, column });
      }
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending, { timeout: 15000 });
      async function choose(key) {
        if (await page.locator("#reviewTab-fix").getAttribute("aria-selected") !== "true") await page.locator("#reviewTab-fix").click();
        await ready();
        const button = page.locator(`[data-fix="${key}"]`);
        if (await button.count()) await button.click();
        else await page.locator("#reviewMore").selectOption(key);
        await ready();
      }
      async function roundTrip() {
        const frame = await page.evaluate(() => {
          const issue = ReviewCore.current(), session = ReviewCore.data(issue), preview = session.preview;
          if (session.error || !preview) throw new Error(session.error || "Missing preview");
          const parameters=Object.fromEntries(["fix","value","targetFormat","sourceDate","percent","keepTime","factor","capLow","capHigh","targetLength","knnK","orderColumn","keepRule"].filter(key=>session[key]!==undefined).map(key=>[key,session[key]]));
          return { type: issue.reviewType, column: issue.column, parameters, original: csvText(), headers: [...state.headers], source: JSON.stringify(state.original), expected: csvText(state.headers.concat(preview.addedColumns || []).filter(column => !(preview.removedColumns || []).includes(column)), preview.after), blocked: preview.blocked.length, selected: preview.selectedIds.length };
        });
        if(frame.selected===frame.blocked){
          assert.ok(frame.blocked>0,"All-blocked scope explains the unavailable treatment");
          assert.equal(await page.locator("#reviewApply").isDisabled(),true);
          assert.equal(await page.evaluate(()=>state.changes.length),0);
          return;
        }
        if (frame.blocked) {
          assert.equal(await page.locator("#reviewApply").isDisabled(), true, "Subset approval must be explicit");
          await page.locator("#reviewSkipBlocked").check();
          await ready();
        }
        if (await page.locator("#duplicateConflictAck").count()) await page.locator("#duplicateConflictAck").check();
        if (await page.locator("#reviewConstraints").count()) await page.locator("#reviewConstraints").check();
        assert.equal(await page.locator("#reviewApply").isEnabled(), true, "Complete approval gate");
        await page.locator("#reviewApply").click();
        assert.equal(await page.evaluate(() => csvText()), frame.expected, "Approved CSV equals the exact preview");
        assert.equal(await page.evaluate(() => JSON.stringify(state.original)), frame.source, "Original source stays immutable");
        await page.evaluate(({ type, column }) => {
          const saved = serializeProject(); restoreProject(saved); cancelAutomaticReview(false);
          const issue = state.issues.find(item => item.reviewType === type && item.column === column);
          ReviewCore.select(issue.id, "review");
        }, frame);
        assert.equal(await page.evaluate(() => csvText()), frame.expected, "Restored working data equals approved data");
        assert.deepEqual(await page.evaluate(keys=>{const session=ReviewCore.data(ReviewCore.current());return Object.fromEntries(keys.map(key=>[key,session[key]]));},Object.keys(frame.parameters)),frame.parameters,"Treatment parameters survive restore");
        await page.locator("#reviewUndo").click();
        assert.equal(await page.evaluate(() => csvText()), frame.original, "Undo restores all values, row order and headers");
        assert.deepEqual(await page.evaluate(() => state.headers), frame.headers);
      }
      const cases = [
        ["missing", "amount", ["median", "mean", "constant", "leave", "drop-rows"]],
        ["outlier", "amount", ["keep", "cap", "replace-median", "set-missing", "fixed-cap", "drop-rows", "log-transform"]],
        ["duplicate-rows", "record_id", ["keep-first", "keep-last", "keep-most-complete", "keep-all"]],
        ["duplicate-values", "record_id", ["keep-first", "keep-last", "keep-most-complete", "merge", "rule", "one-by-one", "keep-all"]],
        ["format", "event_date", ["to-target", "set-missing", "keep"]],
        ["type-mismatch", "event_date", ["to-target", "set-missing", "keep"]],
        ["scale", "discount_pct", ["to-majority", "custom-factor", "keep"]],
        ["category-variants", "channel", ["map-to-canonical", "case-lower", "case-title", "case-upper", "trim", "keep"]],
        ["whitespace", "region", ["clean-all", "trim", "collapse-spaces", "remove-hidden", "keep"]],
        ["invalid", "age", ["set-missing", "cap-to-rule", "abs", "replace-median", "drop-rows", "keep"]],
        ["cross-column", "profit_usd", ["recalculate", "set-missing", "keep"]],
        ["constant", "currency", ["keep", "drop-column"]],
        ["leading-zeros", "zip", ["pad-zeros", "to-text", "keep"]],
        ["multi-value", "parts", ["split-to-rows", "split-to-columns", "to-flags", "keep-first", "keep"]],
        ["sensitive", "contact", ["mask", "hash", "drop-column", "keep"]]
      ];
      for (const [type, column, options] of cases.filter(([, , options]) => options.length)) {
        for (const key of options) await check(`${type}/${key}: preview, approval, project restore, Undo`, ["CORE-27", "CORE-28", "CORE-37"], async () => {
          await fixture(type, column);
          await page.evaluate(({ type, key }) => {
            const issue = ReviewCore.current(), session = ReviewCore.data(issue);
            if (key === "fixed-cap") { session.capLow = "10"; session.capHigh = "17"; }
            if (key === "custom-factor") session.factor = "100";
            if (key === "rule") session.keepRule = { column: "amount", condition: "highest" };
            if (key === "one-by-one") session.partialChoices = true;
            if (type === "sensitive" && key === "keep") session.note = "Approved internal-use source identifiers.";
          }, { type, key });
          await choose(key);
          await roundTrip();
        });
        // One bounded screenshot pass: all three tabs, both device classes.
        await check(`${type}: shell, tab geometry, debug regions and screenshots`, ["CORE-14", "CORE-16", "CORE-20", "CORE-56", "CORE-57", "CORE-60", "CORE-61"], async () => {
          await fixture(type, column);
          for (const tab of ["explore", "fix", "review"]) {
            if (tab === "fix") { await choose(options[0]); await ready(); }
            if (tab === "review") {
              if(await page.evaluate(()=>{const preview=ReviewCore.data(ReviewCore.current()).preview;return preview.blocked.length===preview.selectedIds.length;}))await choose("set-missing");
              if (await page.locator("#duplicateConflictAck").count()) await page.locator("#duplicateConflictAck").check();
              if (await page.locator("#reviewSkipBlocked").count()) await page.locator("#reviewSkipBlocked").check();
              if (await page.locator("#reviewConstraints").count()) await page.locator("#reviewConstraints").check();
              await page.locator("#reviewApply").click();
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No viewport overflow");
            const unexplained = await page.evaluate(() => [...document.querySelectorAll(".review-main button:disabled,.review-main select:disabled")].filter(node => !node.title).map(node => node.id));
            assert.deepEqual(unexplained, [], "Disabled controls explain why");
            if(process.env.CAPTURE!=="0"){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({ path: path.join(folder, `${type}-${tab}-${width}.png`), fullPage: true });}
          }
        });
      }
      await check("format: chosen pattern is the actual conversion target", ["FMT-E-02", "FMT-F-02"], async () => {
        await page.evaluate(() => { loadData("id,event_date\n1,3/25/2025\n2,3/26/2025\n3,2025-03-27", "dominant-pattern.csv"); cancelAutomaticReview(false); ReviewCore.select(state.issues.find(issue => issue.reviewType === "format").id); });
        const target = await page.locator("input[data-target-pattern]:checked").getAttribute("data-target-pattern");
        await choose("to-target");
        const converted = await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.patches.map(patch => patch.after));
        assert.equal(target, "M/D/YYYY");
        assert.deepEqual(converted, ["03/27/2025"], "Radio target and actual conversion must agree");
      });
      await check("format: alternate date targets survive project restore", ["FMT-E-02", "FMT-R-01", "FMT-R-02", "CORE-17"], async () => {
        for (const target of ["dmy", "mdy", "mon", "ymdSlash", "dotted", "long", "excel"]) {
          await fixture("format", "event_date");
          await page.locator("#formatTarget").selectOption(target);
          await choose("to-target");
          const expected={dmy:"25/03/2025",mdy:"03/25/2025",mon:"25-Mar-2025",ymdSlash:"2025/03/25",dotted:"25.03.2025",long:"Mar 25, 2025",excel:String((Date.UTC(2025,2,25)-Date.UTC(1899,11,30))/86400000)}[target];
          assert.equal(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.after[99].event_date),expected,"Former target values convert to the newly selected standard");
          await roundTrip();
        }
      });
      await check("format: current time parts survive conversions and Undo", ["FMT-D-01", "FMT-F-02"], async () => {
        await page.evaluate(() => { loadData("id,event_date\n1,2025-03-25T12:30:00Z\n2,3/25/2025\n3,2025-03-26", "timestamps.csv"); cancelAutomaticReview(false); ReviewCore.select(state.issues.find(issue => issue.reviewType === "format").id); });
        await page.locator("#formatTarget").selectOption("dmy");
        await page.locator('input[data-format-pattern="ISO with time"]').check();
        await choose("to-target");
        assert.ok(await page.locator("#formatKeepTime").isChecked());
        assert.ok(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.after[0].event_date.includes("T12:30")));
        await roundTrip();
      });
      await check("duplicates: partial decisions leave unvisited groups open", ["DUP-F-04", "CORE-28"], async () => {
        await page.evaluate(() => { const rows = Array.from({ length: 100 }, (_, i) => ({ _row: i + 1, order_id: i < 6 ? `G-${Math.floor(i / 2)}` : `R-${i}`, revenue_usd: "10" })); loadData(csvText(["order_id", "revenue_usd"], rows), "partial-duplicates.csv"); cancelAutomaticReview(false); ReviewCore.select(state.issues.find(issue => issue.reviewType === "duplicate-values").id); });
        await page.locator("#duplicateNo").click();
        await choose("one-by-one");
        assert.equal(await page.locator("#reviewApply").isDisabled(), true);
        await page.locator("#duplicateApplyChoices").click(); await ready();
        if (await page.locator("#duplicateConflictAck").count()) await page.locator("#duplicateConflictAck").check();
        await page.locator("#reviewApply").click();
        assert.equal(await page.evaluate(() => state.rows.length), 99);
        assert.equal(await page.evaluate(() => state.issues.find(issue => issue.reviewType === "duplicate-values").status), "open");
        await page.locator("#reviewUndo").click();
        assert.equal(await page.evaluate(() => state.rows.length), 100);
      });
      await check("zeros: actual download retains quotes and padded codes", ["ZERO-F-02", "ZERO-T-02"], async () => {
        await fixture("leading-zeros", "zip"); await choose("pad-zeros"); await page.locator("#reviewApply").click();
        const pending = page.waitForEvent("download"); await page.evaluate(() => downloadCsv());
        const download = await pending, csv = fs.readFileSync(await download.path(), "utf8");
        assert.ok(csv.includes('"02134"'), "Export explicitly quotes padded text");
        assert.equal(await page.evaluate(() => columnPolicy("zip").role), "text");
      });
      await check("sensitive: no personal values in any AI request", ["SENS-D-02", "SENS-E-02", "SENS-T-03"], async () => {
        await fixture("sensitive", "contact");
        assert.ok(!(await page.locator(".review-main").innerText()).includes("jane@example.com"));
        assert.ok(!(await page.locator(".review-main").innerText()).includes("(202) 555-4821"));
        await choose("hash"); await roundTrip();
        for (const request of requests) assert.ok(!JSON.stringify(request).includes("jane@example.com") && !JSON.stringify(request).includes("555-4821"));
      });
      await check("shared: stale previews cannot approve after scope mutation", ["CORE-17", "CORE-27", "CORE-50"], async () => {
        await fixture("outlier", "amount"); await choose("cap");
        await page.evaluate(async () => { const issue = ReviewCore.current(); reviewDraft(issue).scope.rowIds = []; await ReviewCore.apply(issue); });
        assert.equal(await page.evaluate(() => state.changes.length), 0);
      });
      await check("cross-column: date swapping preserves both fields through restore", ["XCOL-D-01", "XCOL-F-01", "XCOL-R-01"], async () => {
        await page.evaluate(() => { const rows = Array.from({ length: 100 }, (_, i) => ({ _row: i + 1, id: `R-${i}`, order_date: "2025-03-25", delivery_date: i < 3 ? "2025-03-24" : "2025-03-27" })); loadData(csvText(["id", "order_date", "delivery_date"], rows), "date-order.csv"); cancelAutomaticReview(false); ReviewCore.select(state.issues.find(issue => issue.reviewType === "cross-column").id); });
        await choose("swap-dates");
        assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.patches.length), 6);
        await roundTrip();
      });
      await check("scale: legacy projects rehydrate missing cluster metadata",["FMT-D-04","CORE-37"],async()=>{
        await fixture("scale","discount_pct");await choose("to-majority");await page.locator("#reviewApply").click();
        await page.evaluate(()=>{const project=serializeProject();for(const issue of project.issues)delete issue.scale;restoreProject(project);cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.reviewType==="scale"&&issue.column==="discount_pct").id,"review");});
        await page.locator("#reviewUndo").click();
        assert.equal(await page.evaluate(()=>state.rows[0].discount_pct),"0.5");
        assert.ok(await page.locator('[data-ui="review.explore.scale.clusters"]').isVisible());
      });
      await check("project: corrupt scale references are rejected atomically",["CORE-03","FMT-D-04"],async()=>{
        await fixture("scale","discount_pct");
        const result=await page.evaluate(()=>{const before=csvText(),project=serializeProject();project.issues.find(issue=>issue.reviewType==="scale").scale.groups[0].rowIds.push(999999);let rejected=false;try{restoreProject(project);}catch{rejected=true;}return {rejected,unchanged:csvText()===before};});
        assert.deepEqual(result,{rejected:true,unchanged:true});
      });
      await check("whitespace: all hidden forms are visible and repaired reversibly",["WS-D-01","WS-E-01","WS-E-04","WS-F-03","WS-R-03"],async()=>{
        await page.evaluate(()=>{const values=[" North ","North  West","New\u00a0York","North\tWest","North\nWest","North\u200b","SÃ£o Paulo","North"];loadData(csvText(["id","region"],values.map((region,i)=>({_row:i+1,id:`R-${i}`,region}))),"hidden-forms.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.reviewType==="whitespace"&&issue.column==="region").id);});
        const text=await page.locator('[data-ui="review.explore.whitespace.types"]').innerText();
        for(const marker of ["␣","·","→","↵","⌀","São␣Paulo"])assert.ok(text.includes(marker),`Visible ${marker}`);
        await choose("clean-all");
        assert.equal(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.after[6].region),"São Paulo");
        await roundTrip();
      });
      await check("numeric format: currency, decimal comma, percent, scientific and suffix",["FMT-D-01","FMT-F-01","FMT-T-04"],async()=>{
        await page.evaluate(()=>{const values=["$1,234.50","1.234,50","12%","1e3","1.2k",...Array(20).fill("10")];loadData(csvText(["id","amount"],values.map((amount,i)=>({_row:i+1,id:`R-${i}`,amount}))),"number-shapes.csv");cancelAutomaticReview(false);ReviewCore.select(state.issues.find(issue=>issue.reviewType==="format"&&issue.column==="amount").id);});
        const shapes=await page.locator('[data-ui="review.explore.format.pattern"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.pattern));
        for(const pattern of ["plain","with currency symbol","decimal comma","with %","scientific","with unit suffix"])assert.ok(shapes.includes(pattern),pattern);
        await choose("to-number");
        assert.deepEqual(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.after.slice(0,5).map(row=>Number(row.amount))),[1234.5,1234.5,.12,1000,1200]);
        await roundTrip();
      });
      await check("review: recorded missing comparison is frozen after a later treatment",["CORE-47","MISS-R-01","MISS-R-02"],async()=>{
        await fixture("missing","amount");await choose("median");await page.locator("#reviewApply").click();
        await page.locator('.review-decision-details > summary').click();
        const oldMetrics=await page.locator('[data-ui="review.review.metrics"]').innerText();
        await page.evaluate(()=>ReviewCore.select(state.issues.find(issue=>issue.reviewType==="outlier"&&issue.column==="amount").id));await choose("cap");await page.locator("#reviewApply").click();
        await page.evaluate(()=>ReviewCore.select(state.issues.find(issue=>issue.reviewType==="missing"&&issue.column==="amount").id,"review"));
        await page.locator('.review-decision-details > summary').click();
        assert.equal(await page.locator('[data-ui="review.review.metrics"]').innerText(),oldMetrics,"Later cap cannot rewrite the recorded fill statistics");
        await page.locator("#reviewUndo").click();
        assert.ok(await page.evaluate(()=>state.rows[98].amount!=="10000"),"Undo older fill preserves later cap");
        assert.equal(await page.evaluate(()=>state.rows.slice(0,5).every(row=>row.amount==="")),true);
      });
      await check("shared: keyboard navigation and editing-safe shortcuts",["CORE-19","CORE-16"],async()=>{
        await fixture("missing","amount");
        await page.locator("#reviewTab-explore").focus();await page.keyboard.press("2");await ready();
        assert.equal(await page.locator("#reviewTab-fix").getAttribute("aria-selected"),"true");
        await choose("constant");await page.locator("#missingConstant").focus();await page.keyboard.press("1");
        assert.equal(await page.locator("#reviewTab-fix").getAttribute("aria-selected"),"true");
        await page.locator("#reviewTab-fix").focus();await page.keyboard.press("1");
        assert.equal(await page.locator("#reviewTab-explore").getAttribute("aria-selected"),"true");
        const prior=await page.evaluate(()=>state.selectedIssue);await page.keyboard.press("j");assert.notEqual(await page.evaluate(()=>state.selectedIssue),prior);
      });
      await check("shared: background render commits a focused edit without nested DOM replacement",["CORE-17","CORE-22"],async()=>{
        await fixture("missing","amount");await choose("constant");
        await page.locator("#missingConstant").fill("123");
        await page.evaluate(()=>renderPreservingReviewFocus());await ready();
        assert.equal(await page.locator("#missingConstant").inputValue(),"123");
        assert.equal(await page.evaluate(()=>ReviewCore.data(ReviewCore.current()).preview.after[0].amount),"123");
        assert.equal(await page.evaluate(()=>document.activeElement.id),"missingConstant");
        await roundTrip();
      });
      await check("AI: each unavailable state names the actual failure",["CORE-53","CORE-52"],async()=>{
        for(const [status,error,expected] of [[429,"AI request limit reached.","resets in 2 min"],[503,"AI unavailable","not configured"],[403,"verification failed","verification failed"],[504,"timed out","timed out"],[422,"AI suggestion couldn't be used","AI suggestion couldn't be used"]]){
          await fixture("outlier","amount");
          const handler=route=>route.request().method()==="GET"?route.fulfill({json:{available:true,turnstileSiteKey:""}}):route.fulfill({status,headers:{"retry-after":"90"},json:{error}});
          await page.route("**/api/ai/review",handler);await page.locator("#outlierAi").click();
          await page.waitForFunction(()=>ReviewCore.data(ReviewCore.current()).aiStatus==="error");
          assert.ok((await page.locator('[data-ui="review.ai.status"]').innerText()).includes(expected));
          assert.equal(await page.evaluate(()=>state.changes.length),0);
          await page.unroute("**/api/ai/review",handler);
        }
      });
      await check("application: real CSV upload, five screens, and Report export",["CORE-03"],async()=>{
        for(const file of ["sales_orders.csv","marketing_campaigns.csv","healthcare_patient_visits.csv"]){
          const response=await page.request.get(`${base}/${file}`);assert.ok(response.ok());
          await page.locator("#fileInput").setInputFiles({name:file,mimeType:"text/csv",buffer:await response.body()});
          await page.waitForFunction(file=>state.fileName===file&&state.rows.length===1000,file);
          await page.evaluate(()=>cancelAutomaticReview(false));
          for(const screen of ["data","view","issues","changes","report"]){
            await page.locator(`#navigation [data-screen="${screen}"]`).click();
            assert.equal(await page.evaluate(()=>state.screen),screen);
            assert.ok((await page.locator("#screen").innerText()).trim().length>0);
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          }
          const pending=page.waitForEvent("download");await page.locator("#downloadCsv").click();
          const download=await pending,csv=fs.readFileSync(await download.path(),"utf8");
          const result=await page.evaluate(csv=>{const parsed=parseCsv(csv);return {rows:parsed.rows.length,headers:JSON.stringify(parsed.headers)===JSON.stringify(state.headers)};},csv);
          assert.deepEqual(result,{rows:1000,headers:true});
        }
      });
      await check("browser console is clean", [], async () => assert.deepEqual(errors, []));
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(folder, "results.json"), JSON.stringify({ base, results }, null, 2));
  }
  const failed = results.filter(result => result.status === "fail");
  console.log(`${results.length - failed.length}/${results.length} cross-checks passed; evidence: ${folder}`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
