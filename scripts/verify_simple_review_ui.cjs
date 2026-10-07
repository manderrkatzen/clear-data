const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
const artifacts = process.env.ARTIFACT_DIR || "docs/screenshots/simplify";
const baseline = process.argv.includes("--baseline");
const tokens = "id,amount,group\n" + Array.from({ length: 72 }, (_, index) => `${index + 1},${["NULL", "N/A", "0", "8", "12", "16"][index % 6]},${["North", "South", "West"][index % 3]}`).join("\n");
const dates = "id,visit_date,amount\n1,02/03/2025,10\n2,31/02/2025,20\n3,2025-01-03,30\n4,2025-01-04,40";
const expectedIds = new Set([
  "review.header", "review.header.title", "review.header.count", "review.header.advanced", "review.header.leave-open",
  "review.find", "review.find.ai-status", "review.find.chips", "review.find.chip", "review.find.detail", "review.find.detail.missing", "review.find.detail.valid",
  "review.compare", "review.compare.summary", "review.compare.hold", "review.compare.hold.column", "review.compare.hold.bands", "review.compare.verdict", "review.compare.charts", "review.compare.chart", "review.compare.more", "review.compare.ai", "review.compare.ai.text",
  "review.fix", "review.fix.options", "review.fix.option", "review.fix.more", "review.fix.chart", "review.fix.chart.by-group", "review.fix.numbers", "review.fix.blocked", "review.fix.changed-rows", "review.fix.note", "review.fix.approve", "review.fix.done",
  "review.advanced", "review.advanced.scope", "review.advanced.interpretation", "review.advanced.kpi", "review.advanced.sources", "review.advanced.copilot", "dataset.setup",
  "review.find.outlier-rule", "review.find.duplicates", "review.find.formats", "review.find.rule", "review.compare.scatter"
]);
if (require("node:fs").existsSync("docs/simplify_review.md")) {
  const requested = new Set([...require("node:fs").readFileSync("docs/simplify_review.md", "utf8").matchAll(/`((?:review|dataset)\.[a-z0-9.-]+)`/g)].map(match => match[1]));
  requested.delete("review.stepper"); requested.delete("review.footer");
  assert.deepEqual([...expectedIds].sort(), [...requested].sort(), "Published UI contract matches the local brief");
}
const seenIds = new Set();
(async () => {
  require("node:fs").mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, acceptDownloads: true });
      page.setDefaultTimeout(60000);
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/status", route => route.fulfill({ json: { available: true, provider: "mock", model: "value-review" } }));
      await page.route("**/api/ai/interpretations", route => {
        if (route.request().method() === "GET") return route.fulfill({ json: { turnstileSiteKey: "" } });
        const { candidates } = route.request().postDataJSON();
        return route.fulfill({ json: { provider: "mock", results: candidates.map(candidate => ({
          id: candidate.id, interpretations: [{ meaning: "missing", score: .8, explanation: "Check the value in its column context.", evidenceIds: candidate.groups.map(group => group.id), operation: "retain", assumptions: [] }],
          valueAssessments: candidate.groups.map(group => ({ evidenceId: group.id, missingScore: ["NULL", "N/A"].includes(group.value) ? .95 : .3, meaning: ["NULL", "N/A"].includes(group.value) ? "missing" : "legitimate", explanation: `${group.value} needs contextual review; the source value is preserved.` }))
        })) } });
      });
      await page.route("**/api/ai/pattern", route => {
        if (route.request().method() === "GET") return route.fulfill({ json: { turnstileSiteKey: "" } });
        const payload = route.request().postDataJSON();
        assert.ok(!JSON.stringify(payload).includes('"rows"') && !JSON.stringify(payload).includes('"_row"'));
        return route.fulfill({ json: { result: { explanation: "Channel is associated with missing delivery times; the quantity gap shrinks within groups.", likelyDriver: "channel", caution: "Check the source before estimating.", proposal: { operation: "fill_groupwise", params: { holdColumns: ["channel"], statistic: "median" }, requiresConfirmation: true }, requiresConfirmation: true } } });
      });
      await page.goto(`${baseUrl}/?debug=ui`);
      const capture = async name => {
        await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".guided-stage")?.scrollTo(0, 0); });
        await page.screenshot({ path: `${artifacts}/${baseline ? "before" : "after"}-${name}-${width}.png`, fullPage: true });
        if (!baseline) await collectIds();
      };
      const load = async (csv, name) => {
        await page.evaluate(({ csv, name }) => loadData(csv, name), { csv, name });
        await page.waitForFunction(() => state.analysisStatus === "complete");
      };
      const choose = async (column, recommendation) => page.evaluate(({ column, recommendation }) => {
        openIssue(state.issues.find(item => item.column === column && (item.recommendation === recommendation || item.candidate?.kind === recommendation) && item.status === "open").id);
      }, { column, recommendation });
      const ready = () => page.waitForFunction(() => {
        const item = state.issues.find(item => item.id === state.selectedIssue);
        if (!item) return false; const data = simpleReviewData(item);
        return !data.pending && data.computedKey === simpleDataKey(item);
      });
      const value = raw => page.locator('[data-ui="review.find.chip"]').filter({ has: page.locator("code", { hasText: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
      const layout = async label => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no page overflow`);
        assert.equal(await page.locator(".review-stepper,.guided-footer,[data-review-step],[data-ui='review.stepper'],[data-ui='review.footer']").count(), 0);
        assert.equal(await page.evaluate(() => Object.hasOwn(state, "reviewStep")), false);
        assert.ok(await page.locator('[data-ui="review.find"]').isVisible());
        assert.ok(await page.locator('[data-ui="review.fix"]').isVisible());
        await collectIds();
      };
      const collectIds = async () => {
        const ids = await page.locator("[data-ui]").evaluateAll(elements => elements.map(element => element.dataset.ui));
        ids.forEach(id => { assert.ok(expectedIds.has(id), `Unexpected UI ID: ${id}`); seenIds.add(id); });
      };
      await load(await page.evaluate(async () => (await (await fetch("sales_orders.csv")).text())), "sales_orders.csv");
      if (!baseline) {
        await page.locator('[data-screen="view"]').click();
        assert.ok(await page.locator("td.flagged").count() > 0);
        await page.locator("td.flagged").first().click();
        assert.ok(await page.locator("#sheetDetails").isVisible());
        assert.ok(await page.locator("#sheetRail").isVisible());
        await page.locator('[data-screen="data"]').click();
        await page.locator('[data-ui="dataset.setup"] > summary').click();
        await page.locator("#businessKpis").click(); await page.locator("[data-suggested-kpi]").first().click(); await page.locator("#closeKpis").click();
      }
      await choose("delivery_days", "impute");
      if (baseline) await page.waitForFunction(() => {
        const item = state.issues.find(item => item.id === state.selectedIssue);
        if (typeof simpleReviewData === "function") { const data = simpleReviewData(item); return !data.pending && data.computedKey === simpleDataKey(item); }
        return typeof missingWorkbenchState !== "function" || missingWorkbenchState(item).results;
      });
      else {
        await ready(); await layout("delivery days");
        assert.ok((await page.locator('[data-ui="review.find.chip"][data-value=""]').innerText()).includes("86"));
        assert.ok((await page.locator('[data-ui="review.find.chip"][data-value=""]').innerText()).includes("missing"));
        assert.ok((await page.locator('[data-ui="review.compare.summary"]').innerText()).includes("Distributor"));
        assert.equal(await page.locator('[data-ui="review.compare.hold.column"]').inputValue(), "channel");
        assert.ok((await page.locator('[data-ui="review.compare.verdict"]').innerText()).includes("Explained"));
        assert.equal(await page.locator('[data-ui="review.compare.chart"]').count(), 3);
        assert.ok((await page.locator('[data-ui="review.compare.charts"]').innerText()).includes("Retail store"));
        await page.locator('[data-fix="median-by-group"]').click(); await ready();
        const numbers = await page.locator('[data-ui="review.fix.numbers"]').innerText();
        assert.ok(numbers.includes("Distributor 4.3") && numbers.includes("Online 4.5") && numbers.includes("86 cells"));
        assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      }
      await capture("delivery-days");
      if (!baseline) {
        if (width === 1440) {
          for (const size of [1280, 1024, 950, 768, 360]) {
            await page.setViewportSize({ width: size, height: 1000 }); await layout(`delivery days ${size}`);
            assert.equal(await page.locator(".simple-queue .candidate-list").evaluate(element => getComputedStyle(element).display), size > 900 ? "block" : "flex");
          }
          await page.setViewportSize({ width, height: 1000 });
        }
        await page.locator('[data-ui="review.compare.ai"]').click();
        await page.waitForFunction(() => analyticalTarget("delivery_days").ai !== null);
        assert.ok((await page.locator('[data-ui="review.compare.ai.text"]').innerText()).includes("AI explanation"));
        await collectIds();
        await page.locator("#simpleMoreFixes > summary").click(); await page.locator("#simpleOtherFix").selectOption("ai"); await ready();
        assert.equal(await page.locator('[data-ui="review.fix.option"]').count(), 4);
        assert.equal(await page.evaluate(() => metrics().changedCells), 0);
        await page.locator('[data-fix="median-by-group"]').click(); await ready();
        await page.locator("#simpleHold").selectOption("quantity"); await ready();
        assert.equal(await page.locator('[data-ui="review.compare.hold.bands"]').inputValue(), "quantiles");
        await collectIds(); await page.locator("#simpleBandMode").selectOption("custom");
        await page.locator("#simpleBandEdges").fill("2, 5, 10"); await ready();
        assert.ok((await page.locator('[data-ui="review.compare.charts"]').innerText()).includes("≥ 10"));
        await page.locator("#simpleHold").selectOption("channel"); await ready();
        await page.locator('[data-ui="review.header.advanced"]').click();
        assert.ok((await page.locator('[data-ui="review.advanced.kpi"]').innerText()).includes("Margin"));
        assert.ok((await page.locator('[data-ui="review.advanced.sources"]').innerText()).includes("channel"));
        await page.locator("#simpleClosePanel").click();
        await page.locator('[data-ui="review.fix.changed-rows"]').click();
        assert.ok((await page.locator("#simpleReviewPanel").innerText()).includes("86 rows"));
        await page.locator("#simpleClosePanel").click();
        await page.locator('[data-ui="review.fix.approve"]').click();
        await page.waitForFunction(() => state.changes.some(change => change.issue.column === "delivery_days" && change.patches.length === 86));
        assert.equal(await page.evaluate(() => state.changes[0].treatment.fillMetadata.fills.length), 86);
        assert.equal(await page.evaluate(() => state.changes[0].treatment.kpiImpact.length), 1);
        assert.ok(await page.locator('[data-ui="review.fix.done"]').isVisible());
        await collectIds();
        await page.locator('[data-screen="report"]').click(); await page.locator("#exportImputationMethods").check();
        const exportedDownload = page.waitForEvent("download"); await page.locator("#downloadCsv").click();
        const exportedCsv = require("node:fs").readFileSync(await (await exportedDownload).path(), "utf8");
        assert.ok(exportedCsv.includes("delivery_days_imputed") && exportedCsv.includes("delivery_days_imputation_method"));
        await page.locator('[data-screen="issues"]').click();
        await page.locator("#simpleUndo").click();
        assert.equal(await page.evaluate(() => state.rows.filter(row => !row.delivery_days.trim()).length), 86);
        assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      }
      await choose("sales_rep", "keep");
      if (!baseline) {
        await ready(); await layout("sales rep");
        const noPattern = await page.locator('[data-ui="review.compare.summary"]').innerText();
        assert.ok(noPattern.includes("No clear pattern"), `${noPattern}; ${await page.evaluate(() => simpleReviewData(state.issues.find(item => item.id === state.selectedIssue)).error)}`);
        const chart = await page.locator('[data-ui="review.fix.chart"]').innerText();
        assert.ok(chart.includes("(blank)") && chart.includes("32 → 0") && chart.includes("Unassigned") && chart.includes("0 → 32"));
      }
      await capture("sales-rep");
      if (!baseline) {
        await page.locator('[data-ui="review.fix.approve"]').click();
        await page.waitForFunction(() => state.changes.some(change => change.issue.column === "sales_rep" && change.patches.length === 32));
        await page.locator('[data-screen="changes"]').click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
        assert.equal(await page.evaluate(() => state.rows.filter(row => !row.sales_rep.trim()).length), 32);
      }
      await load(tokens, "value-meanings.csv"); await choose("amount", "missing_token");
      if (!baseline) {
        await ready(); await value("NULL").click();
        assert.equal(await page.locator('[data-ui="review.fix.approve"]').isDisabled(), true, "Unconfirmed tokens cannot enter physical fill scope");
        assert.ok((await value("NULL").innerText()).includes("95%"));
        await page.locator('[data-ui="review.find.detail.missing"]').click(); await ready();
        assert.equal(await page.evaluate(() => analyticalTarget("amount").result.nMissing), 12);
        assert.equal(await page.evaluate(() => state.rows[0].amount), "NULL");
        await value("0").click(); await page.locator('[data-ui="review.find.detail.valid"]').click(); await ready();
        assert.ok((await value("0").innerText()).includes("valid"));
        assert.equal(await page.evaluate(() => cellInterpretation(state.rows[2], "amount")), "legitimate");
        assert.equal(await page.evaluate(() => metrics().changedCells), 0);
        await layout("value meanings");
      }
      await capture("value-meanings");
      if (!baseline) {
        await page.locator('[data-ui="review.fix.approve"]').click();
        await page.waitForFunction(() => metrics().changedCells === 12);
        assert.equal(await page.evaluate(() => state.rows[2].amount), "0");
        await page.evaluate(() => restoreProject(serializeProject()));
        await page.waitForFunction(() => state.analysisStatus === "complete");
        await page.locator('[data-screen="changes"]').click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
        assert.equal(await page.evaluate(() => state.rows[0].amount), "NULL");
        assert.equal(await page.evaluate(() => cellInterpretation(state.rows[0], "amount")), "missing");
      }
      await load(dates, "blocked-dates.csv"); await choose("visit_date", "date_format");
      if (!baseline) {
        await ready(); await page.locator("#simpleMoreFixes > summary").click();
        await page.locator("#simpleDateFormat").selectOption("dmy"); await ready();
        assert.equal(await page.locator('[data-ui="review.compare"]').count(), 0);
        assert.ok((await page.locator('[data-ui="review.fix.blocked"]').innerText()).includes("1 rows"));
        await page.locator('[data-ui="review.fix.approve"]').click();
        assert.equal(await page.evaluate(() => state.changes.length), 0);
        await page.locator("#simpleSkipBlocked").check(); await ready(); await layout("blocked dates");
      }
      await capture("blocked-rows");
      if (!baseline) {
        await page.locator('[data-ui="review.fix.approve"]').click();
        await page.waitForFunction(() => state.changes.length === 1);
        assert.equal(await page.evaluate(() => state.rows[0].visit_date), "2025-03-02");
        assert.equal(await page.evaluate(() => state.rows[1].visit_date), "31/02/2025");
        await page.locator('[data-screen="changes"]').click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
        assert.equal(await page.evaluate(() => state.rows[0].visit_date), "02/03/2025");
        await page.locator('[data-screen="data"]').click();
        assert.equal(await page.locator('[data-ui="dataset.setup"]').count(), 1);
        await page.locator('[data-ui="dataset.setup"] > summary').click();
        assert.ok(await page.locator("#manualCorrection").isVisible());
        await collectIds();
        // Other finding types use the same cards, with no legacy fallback.
        await load(await page.evaluate(async () => (await (await fetch("sales_orders.csv")).text())), "sales_orders.csv");
        await choose("unit_price_usd", "outlier"); await ready(); await layout("outlier");
        assert.equal(await page.locator('[data-ui="review.find.outlier-rule"]').count(), 1);
        assert.equal(await page.locator('[data-ui="review.compare.scatter"]').count(), 1);
        await page.locator('[data-fix="cap"]').click(); await ready();
        await page.locator("#simpleMoreFixes > summary").click();
        await page.locator("#simpleLower").fill("0"); await page.locator("#simpleUpper").fill("100"); await ready();
        await page.locator('[data-ui="review.fix.approve"]').click(); await page.waitForFunction(() => state.changes.length === 1);
        assert.ok(await page.evaluate(() => state.changes[0].patches.length > 0)); await page.locator("#simpleUndo").click();
        await load("id,amount\n1,10\n1,10\n2,20", "duplicates.csv");
        await page.evaluate(() => openIssue(state.issues.find(item => item.recommendation === "duplicates").id)); await ready(); await layout("duplicates");
        assert.equal(await page.locator('[data-ui="review.find.duplicates"]').count(), 1);
        assert.equal(await page.locator('[data-ui="review.compare"]').count(), 0);
        await page.locator('[data-ui="review.fix.approve"]').click(); await page.waitForFunction(() => state.rows.length === 2); await page.locator("#simpleUndo").click();
        assert.equal(await page.evaluate(() => state.rows.length), 3);
        await load("id,q,p,total\n1,2,3,99\n2,3,4,12\n3,4,5,20", "metric.csv");
        await page.evaluate(() => {
          applyRuleConfig({ ...exportRuleConfig(), metrics: [{ id: "metric:test", name: "Total", target: "total", left: "q", right: "p", operation: "product", factor: 1, decimals: 2, tolerance: 0 }] });
          openIssue(state.issues.find(item => item.recommendation === "metric").id);
        });
        await ready(); await layout("metric");
        assert.equal(await page.locator('[data-ui="review.find.rule"]').count(), 1);
        await page.locator('[data-ui="review.fix.approve"]').click(); await page.waitForFunction(() => state.rows[0].total === "6.00");
        await page.locator("#simpleUndo").click(); assert.equal(await page.evaluate(() => state.rows[0].total), "99");
        await load("id,amount\n1,\n2,\n3,\n4,15\n5,25\n6,35", "constraints.csv");
        await page.evaluate(() => {
          applyRuleConfig({ ...exportRuleConfig(), schema: [{ id: "schema:test", column: "amount", type: "number", required: false, minimum: null, maximum: 20, allowed: [] }] });
          openIssue(state.issues.find(item => item.recommendation === "impute").id);
        });
        await ready(); assert.ok(await page.locator("#simpleConstraintAck").isVisible());
        await page.locator('[data-ui="review.fix.approve"]').click(); assert.equal(await page.evaluate(() => state.changes.length), 0);
        await page.locator("#simpleConstraintAck").check(); await ready();
        await page.locator('[data-ui="review.fix.approve"]').click(); await page.waitForFunction(() => state.changes.length === 1);
        await page.locator("#simpleUndo").click(); assert.equal(await page.evaluate(() => state.rows[0].amount), "");
        // More fixes retains KNN and exact scope/provenance in Advanced.
        await load(await page.evaluate(async () => (await (await fetch("sales_orders.csv")).text())), "sales_orders.csv");
        await choose("delivery_days", "impute"); await ready();
        await page.locator("#simpleMoreFixes > summary").click(); await page.locator("#simpleOtherFix").selectOption("knn"); await ready();
        await page.locator('[data-ui="review.header.advanced"]').click();
        await page.locator("#simpleScopeMode").selectOption("selected");
        const rowId = await page.evaluate(() => state.issues.find(item => item.id === state.selectedIssue).rows[0]._row);
        await page.locator("#simpleScopeIds").fill(String(rowId)); await ready();
        const scoped = await page.evaluate(() => simpleReviewData(state.issues.find(item => item.id === state.selectedIssue)).preview);
        assert.equal(scoped.patches.length, 1); assert.equal(scoped.fillMetadata.fills[0].neighbourRows.length, 7);
        await page.locator("#simpleClosePanel").click(); await page.locator('[data-ui="review.fix.approve"]').click();
        await page.waitForFunction(() => state.changes.length === 1);
        assert.equal(await page.evaluate(() => state.changes[0].treatment.fillMetadata.fills.length), 1);
        await page.evaluate(() => restoreProject(serializeProject()));
        await page.locator('[data-screen="changes"]').click(); await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
        assert.equal(await page.evaluate(() => metrics().changedCells), 0);
        await page.locator('[data-screen="report"]').click();
        const download = page.waitForEvent("download"); await page.locator("#downloadCsv").click(); assert.ok((await download).suggestedFilename().startsWith("cleaned-"));
        await page.route("**/api/ai/status", route => route.fulfill({ json: { available: false } }));
        await page.evaluate(async () => loadData(await (await fetch("sales_orders.csv")).text(), "sales_orders.csv"));
        await page.waitForFunction(() => state.analysisStatus === "unavailable");
        await choose("delivery_days", "impute"); await ready();
        assert.equal(await page.locator('[data-ui="review.find.ai-status"]').innerText(), "AI unavailable: counts only");
        await collectIds();
        if (width === 1440) {
          const large = await page.evaluate(async () => {
            const { headers, rows } = parseCsv(await (await fetch("sales_orders.csv")).text());
            state.headers = headers; state.rows = Array.from({ length: 50000 }, (_, index) => ({ ...rows[index % rows.length], _row: index + 1 }));
            state.original = state.rows.map(row => ({ ...row })); state.allRows = state.rows; state.changes = []; state.datasetRevision++; invalidateCleaningProfile();
            let ticks = 0; const timer = setInterval(() => ticks++, 10);
            try {
              const result = await analyticalTask("compare", "delivery_days", { options: analyticalOptions() });
              const bands = await analyticalTask("reviewBands", "delivery_days", { params: { holdColumn: "channel", columns: ["quantity", "channel", "revenue_usd"] }, options: analyticalOptions() });
              const fills = await analyticalTask("fill", "delivery_days", { params: { method: "groupwise", columns: ["channel"] }, options: analyticalOptions() });
              return { ticks, total: result.total, groups: bands.length, fills: fills.fills.length };
            } finally { clearInterval(timer); }
          });
          assert.equal(large.total, 50000); assert.equal(large.groups, 3); assert.ok(large.ticks > 1 && large.fills > 0);
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    if (!baseline) assert.deepEqual([...seenIds].sort(), [...expectedIds].sort(), "All exact UI IDs in simplify_review.md are covered; no deleted IDs remain");
    console.log(baseline ? "Captured current Review baseline for all four paths." : "PASS: Find/Compare/Fix, no step state or navigation, delivery grouping and provenance, text fills, per-value AI confidence/classification, exact approval, blocked subset, Undo/Decisions rollback, Dataset setup, desktop/mobile, debug captures.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
