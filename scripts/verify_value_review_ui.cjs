const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BASE_URL || "http://localhost:4174";
const values = ["NULL", "N/A", "0", "-23", "-5", "-20", "2", "3", "4", "5", "6", "7"];
const fixture = "id,number_of_children,temperature_c,measurement_a,measurement_b\n" + Array.from({ length: 72 }, (_, index) => `${index + 1},${values[index % 12]},${[-23, -5, -20, 0][index % 4]},${values[index % 12]},${values[index % 12]}`).join("\n");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; let calls = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/ai/status", route => route.fulfill({ json: { available: true, provider: "mock", model: "contextual-values" } }));
    await page.route("**/api/ai/interpretations", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { turnstileSiteKey: "", maxBatchSize: 6 } });
      const payload = route.request().postDataJSON(); calls++;
      assert.ok(payload.candidates.length <= 6);
      assert.ok(!JSON.stringify(payload).includes('"rows"') && !JSON.stringify(payload).includes('"_row"'));
      const results = payload.candidates.map(candidate => ({ id: candidate.id, interpretations: [{ meaning: "unresolved", score: .5, explanation: "Meanings depend on column context.", evidenceIds: [candidate.groups[0].id], operation: "retain", assumptions: [] }], valueAssessments: candidate.groups.map(group => {
        const token = ["NULL", "N/A"].includes(group.value), temperature = candidate.column === "temperature_c";
        return { evidenceId: group.id, missingScore: token ? .99 : temperature ? .03 : group.value === "0" ? .02 : .3, meaning: token ? "missing" : temperature || group.value === "0" ? "legitimate" : "unresolved", explanation: token ? `${group.value} may denote an unknown observation in ${candidate.column}.` : temperature ? "Negative Celsius temperatures are valid measurements, not missing tokens." : group.value === "0" ? "Zero children is a valid count and does not imply a missing observation." : "A negative child count needs investigation; an incorrect value is not automatically a missing observation." };
      }) }));
      await new Promise(resolve => setTimeout(resolve, payload.candidates.some(candidate => candidate.column === "measurement_b") ? 400 : 80));
      try { await route.fulfill({ json: { results, provider: "mock", calibrated: false } }); } catch { /* deliberate cancellation during a fresh import */ }
    });
    await page.goto(baseUrl);
    const chooseValue = async value => page.locator(".representation-chip").filter({ has: page.locator("code", { hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(csv => loadData(csv, "value-meanings.csv"), fixture);
      await page.evaluate(() => openIssue(state.issues.find(item => item.column === "number_of_children" && item.candidate?.kind === "missing_token").id));
      if (width === 1440) {
        await page.waitForFunction(() => state.analysisCompleted > 0 && state.analysisStatus === "running");
        assert.ok((await page.locator(".interpretation-top").innerText()).includes("99%"), "First-batch assessments appear while later batches are still running");
      }
      await page.waitForFunction(() => state.analysisStatus === "complete");
      assert.equal(await page.locator("#analysisTokens,#similarTokens").count(), 0);
      assert.ok((await page.locator(".representation-list").innerText()).includes("0"));
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("99%"));
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.ARTIFACT_DIR) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/value-review-${width}.png`, fullPage: true }); }
      await page.locator("input[name=reviewInterpretation][value=missing]").check();
      assert.equal(await page.evaluate(() => document.activeElement.value), "missing", "Decision radio keeps keyboard focus through rendering");
      await page.locator("#confirmRepresentation").click();
      assert.equal(await page.evaluate(() => state.changes.length), 1);
      assert.equal(await page.evaluate(() => state.rows[0].number_of_children), "NULL");
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[0], "number_of_children")), "missing");
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[1], "number_of_children")), null);
      assert.ok((await page.locator(".representation-value").innerText()).includes("N/A"));
      await page.locator("input[name=reviewInterpretation][value=missing]").check(); await page.locator("#confirmRepresentation").click();
      await chooseValue("0");
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("2%"));
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("Zero children"));
      await page.locator("input[name=reviewInterpretation][value=legitimate]").check(); await page.locator("#confirmRepresentation").click();
      assert.equal(await page.evaluate(() => state.rows[2].number_of_children), "0");
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[2], "number_of_children")), "legitimate");
      assert.equal(await page.evaluate(() => metrics().changedCells), 0);
      await chooseValue("-23"); await page.locator("#skipRepresentation").click();
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[3], "number_of_children")), null);
      await page.locator("#treatConfirmedMissing").click();
      await page.locator("#compareMissing").click();
      await page.waitForFunction(() => analyticalTarget("number_of_children").result !== null);
      assert.equal(await page.evaluate(() => analyticalTarget("number_of_children").result.nMissing), 12);
      await page.locator('[data-review-step="2"]').click();
      await page.locator("input[name=reviewInterpretation][value=missing]").check();
      await page.locator('[data-review-step="3"]').click(); await page.locator("#reviewOperation").selectOption("mean");
      await page.locator('[data-review-step="4"]').click(); await page.waitForFunction(() => state.reviewStep === 4);
      assert.equal(await page.evaluate(() => guidedPreview(state.issues.find(item => item.id === state.selectedIssue)).patches.length), 12);
      assert.equal(await page.evaluate(() => state.rows[0].number_of_children), "NULL");
      await page.locator('[data-review-step="5"]').click(); await page.waitForFunction(() => state.reviewStep === 5);
      await page.locator("#approveGuided").click();
      assert.equal(await page.evaluate(() => metrics().changedCells), 12);
      assert.equal(await page.evaluate(() => state.rows[2].number_of_children), "0");
      await page.locator("[data-screen=changes]").click();
      await page.locator("[data-rollback]").first().click(); await page.locator("#doRollback").click();
      assert.equal(await page.evaluate(() => state.rows[0].number_of_children), "NULL");
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[0], "number_of_children")), "missing");
      await page.evaluate(() => restoreProject(serializeProject()));
      assert.equal(await page.evaluate(() => cellInterpretation(state.rows[2], "number_of_children")), "legitimate");
      await page.locator("[data-screen=report]").click();
      const download = page.waitForEvent("download"); await page.locator("#downloadCsv").click(); await download;
      await page.evaluate(() => openIssue(state.issues.find(item => item.column === "temperature_c" && item.candidate?.kind === "sentinel" && item.status === "open").id));
      await page.waitForFunction(() => state.analysisStatus === "complete");
      await chooseValue("-23");
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("3%"));
      assert.ok((await page.locator(".interpretation-top").innerText()).includes("Celsius"));
    }
    assert.ok(calls > 0); assert.deepEqual(errors, []);
    console.log("PASS: contextual per-value scores, NULL then N/A classification without rewriting, legitimate zero, negative-temperature context, skip/unresolved, confirmed-missing comparison and treatment, restore/rollback/export, desktop/mobile, no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
