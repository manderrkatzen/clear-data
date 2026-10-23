const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/opencode/node_modules/playwright");

const base = process.env.BASE_URL || "http://localhost:4174";
(async () => {
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/**", route => route.fulfill({ json: { available: false, turnstileSiteKey: "" } }));
  try {
    await page.goto(base);
    const samples = ["sales_orders.csv", "marketing_campaigns.csv", "healthcare_patient_visits.csv", "ui_test_sheet.csv"];
    for (const file of samples) {
      const response = await page.request.get(`${base}/${file}`);
      assert.ok(response.ok(), `${file} could not be loaded`);
      const csv = await response.text();
      await page.evaluate(({ csv, file }) => { loadData(csv, file); cancelAutomaticReview(false); }, { csv, file });
      await page.waitForSelector(".cumulative-view");
      const columns = await page.evaluate(() => numericColumns());
      assert.ok(columns.length, `${file} has no numerical distribution to plot`);
      for (const column of columns.slice(0, 2)) {
        await page.locator("#cumulativeColumn").selectOption(column);
        await page.waitForFunction(column => {
          const section=document.querySelector(".cumulative-view");
          return section?.querySelector("#cumulativeColumn")?.value===column && section.querySelectorAll(".bars .bar").length===32;
        },column);
        const chart = await page.locator(".cumulative-view").evaluate(section => {
          const bars = section.querySelector(".bars");
          return {
            column: section.querySelector("#cumulativeColumn").value,
            legend: section.querySelector(".legend")?.innerText || "",
            binCount: section.querySelectorAll(".bars > .pairs").length,
            markCount: bars?.querySelectorAll(".bar").length || 0,
            visibleMarks: [...(bars?.querySelectorAll(".bar") || [])].filter(mark => mark.getBoundingClientRect().height > 0).length,
            height: bars?.getBoundingClientRect().height || 0,
            axis: section.querySelector('[aria-label="Distribution range"].pairs')?.innerText || "",
            legacyClasses: [...section.querySelectorAll(".chart-legend,.distribution-bars,.distribution-axis,.analytical-histogram,.comparison-metrics")].length
          };
        });
        assert.equal(chart.column, column);
        assert.match(chart.legend, /Original source/);
        assert.match(chart.legend, /Working/);
        assert.equal(chart.binCount, 16, `${file}/${column}: expected sixteen shared percentile bins`);
        assert.equal(chart.markCount, 32, `${file}/${column}: expected original and working bars per bin`);
        assert.ok(chart.visibleMarks > 0, `${file}/${column}: the distribution bars are invisible`);
        assert.ok(chart.height >= 100, `${file}/${column}: the chart has collapsed height`);
        assert.match(chart.axis, /1st–99th percentile/);
        assert.equal(chart.legacyClasses, 0, `${file}/${column}: distribution uses a non-shared style class`);
        console.log(`PASS ${file}: ${column} distribution (${chart.visibleMarks} visible bars)`);
      }
      const categorical = await page.evaluate(() => cleaningProfile().columns.find(profile => !["number","integer","identifier"].includes(profile.role))?.column);
      if (categorical) {
        await page.locator("#cumulativeColumn").selectOption(categorical);
        await page.waitForFunction(column => document.querySelector("#cumulativeColumn")?.value===column&&Boolean(document.querySelector(".cumulative-view .metrics")),categorical);
        const summary=await page.locator(".cumulative-view .metrics").innerText();
        assert.match(summary,/Original/);assert.match(summary,/Working/);assert.match(summary,/labels/);
        assert.equal(await page.locator(".cumulative-view .comparison-metrics").count(),0);
        console.log(`PASS ${file}: ${categorical} label distribution`);
      }
    }

    const file = "ui_test_sheet.csv", source = await (await page.request.get(`${base}/${file}`)).text();
    await page.evaluate(({ csv, file }) => { loadData(csv, file); cancelAutomaticReview(false); }, { csv: source, file });
    await page.waitForFunction(() => state.issues.some(issue => issue.column === "delivery_days__missing_pattern"));
    await page.locator('#navigation [data-screen="issues"]').click();
    const issueId = await page.evaluate(() => state.issues.find(issue => issue.column === "delivery_days__missing_pattern")?.id);
    await page.evaluate(id => ReviewCore.select(id), issueId);
    await page.locator('[data-review-tab="fix"]').click();
    await page.waitForFunction(() => { const session = ReviewCore.data(ReviewCore.current()); return !session.pending && Boolean(session.preview); });
    await page.locator('.opt[data-o="median"]').click();
    await page.waitForFunction(() => { const session = ReviewCore.data(ReviewCore.current()); return !session.pending && Boolean(session.preview); });
    assert.ok(!(await page.locator("#reviewApply").isDisabled()));
    await page.locator("#reviewApply").click();
    await page.waitForFunction(() => state.changes.length === 1);
    await page.locator('#navigation [data-screen="data"]').click();
    await page.waitForSelector(".cumulative-view");
    await page.locator("#cumulativeColumn").selectOption("delivery_days__missing_pattern");
    const effect = await page.evaluate(() => ({ original: interpretedNumericValues(state.original, "delivery_days__missing_pattern", null, true).length, working: interpretedNumericValues(state.rows, "delivery_days__missing_pattern").length, bins: document.querySelectorAll(".cumulative-view .bars > .pairs").length, visibleBars: [...document.querySelectorAll(".cumulative-view .bars .bar")].filter(mark => mark.getBoundingClientRect().height > 0).length }));
    assert.ok(effect.working > effect.original, "The working distribution did not reflect the approved fill");
    assert.equal(effect.bins, 16);
    assert.ok(effect.visibleBars > 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, "Mobile dataset distribution has horizontal overflow");
    assert.ok(await page.locator(".cumulative-view .bars .bar").evaluateAll(marks => marks.some(mark => mark.getBoundingClientRect().height > 0)), "Mobile distribution bars are invisible");
    assert.deepEqual(errors, []);
    console.log(`PASS approved fill updates delivery_days distribution (${effect.original} source → ${effect.working} working observations)`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
