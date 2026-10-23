const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");
const base = process.env.BASE_URL || "http://localhost:4174";

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 900, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai/**", route => route.fulfill({ status: route.request().method() === "POST" ? 503 : 200, json: { available: false, error: "not configured" } }));
      await page.goto(base);
      await page.evaluate(async () => {
        await document.fonts.ready;
        loadData(await (await fetch("ui_test_sheet.csv")).text(), "ui_test_sheet.csv");
        cancelAutomaticReview(false);
      });
      await page.waitForFunction(() => !capabilityStore().scorecardPending);
      const shot = async name => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page overflow`);
        await page.screenshot({ path: `/tmp/opencode/distilled-${width}-${name}.png` });
      };
      const ready = () => page.waitForFunction(() => !ReviewCore.data(ReviewCore.current()).pending && Boolean(ReviewCore.data(ReviewCore.current()).preview));
      await shot("dataset");
      assert.equal(await page.locator(".review-launch .eyebrow").count(), 0);
      assert.doesNotMatch(await page.locator(".review-launch").innerText(), /YOUR NEXT STEP|not automatically errors/);
      assert.equal(await page.locator(".metric-grid small").count(), 0);
      const original = await page.evaluate(() => csvText(state.headers, state.original));
      await page.evaluate(() => go("view"));
      assert.ok(await page.locator("td.flagged").count(), "Explore retains highlighted findings");
      assert.ok(await page.locator("#sheetRail .sheet-bubble").count(), "Explore retains issue rail markers");
      await page.locator("td.flagged").first().click();
      assert.ok(await page.locator("#sheetDetails").isVisible(), "Flagged cells still open the inspector");
      await page.evaluate(() => ReviewCore.select(state.issues.find(issue => issue.column === "delivery_days__missing_pattern" && issue.reviewType === "missing").id));
      assert.equal(await page.locator('[data-ui="review.lead"]').count(), 0);
      assert.equal(await page.locator(".review-assistance").count(), 0, "Blank-only findings need no AI narration");
      assert.equal(await page.locator("#reviewChooseFix").innerText(), "Fix selected");
      await shot("explore");
      await page.locator("#reviewChooseFix").click();
      await ready();
      assert.equal(await page.locator('[data-ui="review.lead"]').count(), 0);
      assert.equal(await page.locator(".treatment-radio:checked").count(), 1);
      assert.equal(await page.locator(".opt:not(.on) .desc").count(), 0);
      assert.ok(await page.locator("#reviewAskAi").isVisible());
      assert.equal(await page.locator("#reviewAskAi").locator("xpath=ancestor::*[@data-ui='review.options']").count(), 0);
      assert.equal(await page.locator("#reviewMoreMethods").getAttribute("open"), null);
      const beforeDisclosure = await page.evaluate(() => { window.distilledPreview = ReviewCore.data(ReviewCore.current()).preview; return ReviewCore.data(ReviewCore.current()).generation; });
      await page.locator("#reviewImpactDetails > summary").click();
      assert.match(await page.locator("#reviewImpactDetails").innerText(), /Standard deviation/);
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).generation), beforeDisclosure, "Reading impact must not recompute or reset the preview");
      assert.ok(await page.evaluate(() => distilledPreview === ReviewCore.data(ReviewCore.current()).preview));
      await page.locator("#reviewImpactDetails > summary").click();
      await page.locator("#reviewMoreMethods > summary").click();
      await page.locator('#reviewMoreMethods [data-fix="mean"]').click();
      await ready();
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).fix), "mean");
      assert.equal(await page.locator("#reviewMoreMethods").getAttribute("open"), null);
      await page.locator('[data-fix="median"]').click();
      await ready();
      await page.locator(".treatment-radio:checked").focus();
      await page.keyboard.press("ArrowDown");
      await ready();
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).fix), "leave", "Native radio arrows select a treatment without applying it");
      await page.locator('[data-fix="median"]').click();
      await ready();
      const beforeAi = await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.fingerprint);
      await page.locator("#reviewAskAi").click();
      await page.locator("#reviewAiInstruction").fill("Use the reviewed numeric scope.");
      assert.equal(await page.evaluate(() => ReviewCore.data(ReviewCore.current()).preview.fingerprint), beforeAi);
      await page.locator("#reviewAskAi").click();
      await page.locator("#reviewScopeSettings").click();
      await page.locator("#reviewCloseRows").click();
      await page.locator("#reviewMetricSettings").click();
      await page.locator("#reviewCloseRows").click();
      assert.equal(await page.evaluate(() => state.changes.length), 0, "Browsing tools must not approve values");
      assert.equal(await page.evaluate(() => csvText(state.headers, state.original)), original);
      await shot("fix");
      await page.locator("#reviewAddNote").click();
      const note = "No note is a source label, not an empty-state placeholder. <reviewed>";
      await page.locator("#reviewNote").fill(note);
      await page.locator("#reviewApply").click();
      await page.waitForFunction(() => state.changes.length === 1);
      assert.match(await page.locator('[data-ui="review.review.metadata"]').innerText(), /<reviewed>/);
      assert.equal(await page.locator('[data-ui="review.review.metadata"] reviewed').count(), 0, "Notes remain escaped, never rewritten");
      assert.equal(await page.locator("#reviewNext").getAttribute("class"), "btn");
      assert.equal(await page.locator("#reviewUndo").innerText(), "Undo decision");
      await shot("review");
      await page.evaluate(() => go("changes"));
      assert.equal(await page.locator(".page-head h1").innerText(), "Decisions");
      assert.equal(await page.locator(".decision-details").getAttribute("open"), null);
      assert.ok((await page.locator(".change-card").innerText()).includes(note));
      await shot("decisions");
      await page.evaluate(() => go("report"));
      assert.equal(await page.locator(".topbar .primary:visible").count(), 0, "Export has one primary entry point");
      assert.equal(await page.locator(".export-options").getAttribute("open"), null);
      await page.locator(".export-options summary").click();
      await page.locator("#exportImputedFlags").uncheck();
      assert.match(await page.locator(".export-options summary").innerText(), /flags off/);
      await page.locator("#exportImputedFlags").check();
      await page.locator("#exportImputationMethods").check();
      assert.ok(await page.evaluate(() => state.exportOptions.includeFlags && state.exportOptions.includeMethods));
      await page.locator(".export-options summary").click();
      const download = page.waitForEvent("download");
      await page.locator("#downloadCsv").click();
      assert.match((await download).suggestedFilename(), /^cleaned-/);
      await shot("report");
      await page.evaluate(() => go("issues"));
      await page.locator("#reviewUndo").click();
      assert.equal(await page.evaluate(() => csvText()), original, "Undo restores the exact source");
      for (const type of ["outlier", "duplicate-rows", "category-variants", "format", "whitespace", "multi-value"]) {
        const found = await page.evaluate(type => { const issue = state.issues.find(issue => issue.reviewType === type); if (!issue) return false; ReviewCore.select(issue.id); return true; }, type);
        if (!found) continue;
        assert.equal(await page.locator('[data-ui="review.lead"]').count(), 0);
        assert.ok(await page.locator("[data-review-section] > h2").count());
        if (type === "outlier") {
          const labels = await page.locator(".outlier-log-strip svg text").allTextContents();
          assert.equal(new Set(labels).size, labels.length, "Log ticks retain distinct values at subunit intervals");
          assert.doesNotMatch(labels.join(" "), /\$/, "The age axis is not currency");
          assert.ok(await page.locator(".outlier-log-strip svg").evaluate(svg => svg.getBoundingClientRect().width / svg.viewBox.baseVal.width > 0.85), "Outlier lettering is not a miniaturized desktop canvas");
        }
        if (type === "outlier" || type === "category-variants") await shot(type);
      }
      await page.evaluate(() => {
        const rows = Array.from({ length: 50 }, (_, i) => ({ _row: i + 1, id: String(i + 1), contact: `person${i}@example.com` }));
        loadData(csvText(["id", "contact"], rows), "private.csv"); cancelAutomaticReview(false);
        ReviewCore.select(state.issues.find(issue => issue.reviewType === "sensitive").id);
      });
      assert.doesNotMatch(await page.locator(".main").innerText(), /person0@example.com/);
      await page.locator("#reviewTab-fix").click(); await ready();
      assert.equal(await page.locator("#reviewAskAi").count(), 0);
      assert.ok(await page.locator(".treatment-caveat").isVisible(), "Sensitive-data limitations remain visible");
      await shot("sensitive");
      assert.deepEqual(errors, []);
      console.log(`${width}px: concise hierarchy, native treatment choice, alternative methods, impact evidence, AI separation, scoped tools, note fidelity, approval/history/export/Undo and masked sensitive evidence passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
