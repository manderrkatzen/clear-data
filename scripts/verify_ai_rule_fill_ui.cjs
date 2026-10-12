const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/cleardata-tools/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

// MISS-T-08: selected-field disclosure, row decisions, scoped Apply, provenance restore and exact Undo.
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [], sentRows = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/ai/review" && route.request().method() === "GET") return route.fulfill({ status: 200, json: { available: true, turnstileSiteKey: "" } });
        if (url.pathname === "/api/ai/review" && route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          if (body.mode === "rule-plan") {
            assert.equal(body.context.availableColumns.some(entry => /email|name|address/i.test(entry.column)), false);
            assert.equal("rows" in body.context, false, "the field-planning request contains no row data");
            return route.fulfill({ status: 200, json: { provider: "test", result: { columns: ["rating", "CustomerLTV"], explanation: "Use rating and CustomerLTV to suggest the satisfaction label.", needsClarification: false } } });
          }
          assert.equal(body.mode, "rule-values");
          assert.deepEqual(body.context.columns, ["rating", "CustomerLTV"]);
          for (const row of body.context.rows) {
            assert.deepEqual(Object.keys(row.values).sort(), ["CustomerLTV", "rating"]);
            assert.ok(!JSON.stringify(row).includes("private"));
            sentRows.push(row);
          }
          return route.fulfill({ status: 200, json: { provider: "test", result: { suggestions: body.context.rows.map(row => ({ id: row.id, value: Number(row.values.rating) < .5 ? "LOW" : "HIGH", reason: `Rating ${row.values.rating} follows the requested threshold.` })) } } });
        }
        if (route.request().method() === "GET") return route.fulfill({ status: 200, json: { available: false, turnstileSiteKey: "" } });
        return route.fulfill({ status: 503, json: { error: "Not used in this flow." } });
      });

      await page.goto(base);
      await page.evaluate(() => {
        const csv = "satisfaction,rating,CustomerLTV,email,internal_note\n,0.2,0.4,,private row one\n,0.8,0.9,,private row two\n,0.4,0.3,,private row three";
        loadData(csv, "rule_fill_fixture.csv");
        cancelAutomaticReview(false);
        const issue = state.issues.find(entry => entry.reviewType === "missing" && entry.column === "satisfaction");
        if (!issue) throw new Error("Missing-value test finding was not created.");
        ReviewCore.select(issue.id);
        ReviewCore.switchTab(issue, "fix");
      });
      await page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending);
      const original = await page.evaluate(() => csvText());
      await page.locator("#reviewAskAi").click();
      assert.ok(await page.locator("#reviewAiRequest").isVisible());
      assert.equal(await page.locator("#reviewAiRequest").evaluate(panel=>Boolean(panel.closest('[data-ui="review.options"]'))),false,"Ask AI and AI rule composers are separate sibling panels");
      await page.locator("#reviewAskAi").click();
      await page.locator("#reviewAskAiRule").click();
      await page.locator("#reviewRuleInstruction").fill("If rating is below 0.5, suggest LOW; otherwise suggest HIGH for satisfaction.");
      await page.locator("#reviewRulePlan").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).rulePlan?.columns.length === 2);
      assert.equal(sentRows.length, 0, "row values stay local until requested fields are confirmed");
      await page.locator("#reviewRuleGenerate").click();
      await page.waitForFunction(() => document.querySelectorAll('[data-ui="review.fix.ai.rule.rows"] tbody tr').length === 3 && ReviewCore.data(ReviewCore.current()).ruleStatus === "ready");
      assert.equal(await page.locator('[data-ui="review.fix.ai.rule.rows"] tbody tr').count(), 3);
      assert.match(await page.locator('[data-ui="review.fix.ai.rule.rows"]').innerText(), /LOW/);
      if (width === 390) assert.ok(await page.locator('[data-ui="review.fix.ai.rule.rows"] .btn2').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)), "row decisions are mobile-sized touch targets");
      await page.locator('[data-ui="review.fix.ai.rule.rows"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/ai-rule-fill-${width}.png` });
      await page.locator('[data-ai-rule-row="1"] [data-ai-rule-action="approve"]').click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).preview?.patches.length === 1);
      await page.locator('[data-ai-rule-row="2"] [data-ai-rule-action="no"]').click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).ruleProposals.find(entry => entry.rowId === 2)?.status === "rejected" && ReviewCore.data(ReviewCore.current()).preview?.patches.length === 1);
      await page.locator('[data-ai-rule-row="3"] [data-ai-rule-action="suggest"]').click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).ruleProposals.find(entry => entry.rowId === 3)?.status === "suggested");
      await page.locator("#reviewRuleApproveAll").click();
      await page.waitForFunction(() => ReviewCore.data(ReviewCore.current()).preview?.patches.length === 2);
      assert.deepEqual(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.patches.map(patch => patch.rowId)), [1, 3]);
      assert.match(await page.locator('[data-ui="review.lead"]').innerText(), /these 2 entries/);
      await page.locator('[data-ui="review.fix.ai.rule.preview"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/ai-rule-preview-${width}.png` });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      assert.deepEqual(await page.evaluate(() => state.rows.map(row => row.satisfaction)), ["LOW", "", "LOW"]);
      assert.equal(await page.evaluate(() => state.changes[0].treatment.aiRuleEvidence.length), 2);
      assert.equal(await page.evaluate(() => state.changes[0].reviewSpec.aiRuleColumns.join(",")), "rating,CustomerLTV");
      assert.equal(await page.evaluate(() => state.changes[0].reviewSpec.aiRuleProvider), "test");
      const backup = await page.evaluate(() => serializeProject("AI rule review"));
      const corruption = await page.evaluate(project => {
        const before=csvText(),bad=structuredClone(project);bad.changes[0].treatment.aiRuleEvidence[0].values.rating="999";let rejected=false;
        try{restoreProject(bad);}catch{rejected=true;}
        return {rejected,unchanged:before===csvText()};
      }, backup);
      assert.deepEqual(corruption, { rejected: true, unchanged: true }, "corrupt row-level AI evidence cannot replace the workspace");
      await page.evaluate(project => restoreProject(project), backup);
      assert.equal(await page.evaluate(() => state.changes[0].treatment.aiRuleEvidence.length), 2, "row-level evidence survives project restore");
      await page.evaluate(() => { const issue=state.issues.find(entry=>entry.reviewType==="missing"&&entry.column==="satisfaction");ReviewCore.select(issue.id,"review"); });
      await page.screenshot({ path: `/tmp/ai-rule-review-${width}.png` });
      await page.locator("#reviewUndo").click();
      await page.waitForFunction(() => state.changes.length === 0);
      assert.equal(await page.evaluate(() => csvText()), original, "Undo restores every row to the original export");
      assert.deepEqual(errors, []);
      console.log(`${width}px: field selection, projected row requests, per-row Approve/No/Suggest, Approve all, Apply and Undo passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
