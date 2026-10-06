// Analytical UI extends the existing review stages and uses summary-only AI.
let analyticalSession = null;
function analyticalOptions() {
  return { revision: state.datasetRevision, policies: state.ruleConfig.columns || [], classifications: effectiveClassifications() };
}
function analyticalStore() {
  const key = JSON.stringify([state.datasetRevision, state.rows.length, state.ruleConfig, effectiveClassifications()]);
  if (analyticalSession?.key !== key) {
    analyticalSession?.controllers.forEach(controller => controller.abort());
    analyticalSession?.worker?.terminate();
    analyticalSession?.jobs?.forEach(job => job.reject(new Error("Dataset changed; run the comparison again.")));
    analyticalSession = { key, targets: new Map(), fills: new Map(), controllers: new Set(), jobs: new Map(), worker: null, nextJob: 0 };
  }
  return analyticalSession;
}
function analyticalTarget(column) {
  const store = analyticalStore();
  if (!store.targets.has(column)) store.targets.set(column, { result: null, held: [], comparisonColumn: "", holdColumn: "", banding: { mode: "quantiles", k: 4 }, pending: "", error: "", ai: null });
  return store.targets.get(column);
}
function analyticalTask(task, column, input = {}) {
  const store = analyticalStore();
  const payload = { id: ++store.nextJob, task, targetColumn: column, ...input };
  if (typeof Worker === "undefined") {
    if (task === "business") return Promise.resolve({ kpis: CapabilitiesEngine.kpiImpact(state.headers, state.rows, payload.params.preview, payload.params.definitions, payload.options), dependencies: CapabilitiesEngine.dependencyImpact(state.headers, state.rows, payload.params.preview, payload.params.metrics, payload.options) });
    if (task === "scorecards") return Promise.resolve(CapabilitiesEngine.qualityScorecard(state.headers, state.rows, payload.params.rules, payload.options));
    if (task === "significance") return Promise.resolve(AnalysisEngine.significance(state.headers, state.rows, column, payload.params.result, payload.options));
    if (task === "suggestions") return Promise.resolve(CapabilitiesEngine.suggestedRules(state.headers, state.rows, payload.options));
    if (task === "kpi") return Promise.resolve(CapabilitiesEngine.kpiImpact(state.headers, state.rows, payload.params.preview, payload.params.definitions, payload.options));
    if (task === "candidates") return Promise.resolve(CapabilitiesEngine.compareCandidates(state.headers, state.rows, column, payload.params.eligibleIds, payload.params.drafts, payload.options));
    if (task === "impact") return Promise.resolve(CapabilitiesEngine.bandImpact(state.headers, state.rows, column, payload.params.preview, payload.params.grouping, payload.options));
    if (task === "records") return Promise.resolve(CapabilitiesEngine.recordView(state.headers, state.rows, column, payload.params, payload.options));
    return Promise.resolve(task === "fill" ? AnalysisEngine.fillSimilar(state.headers, state.rows, column, payload.params, payload.options) : task === "hold" ? AnalysisEngine.holdSimilar(state.headers, state.rows, column, payload.comparisonColumn, payload.holdColumn, payload.banding, payload.options) : AnalysisEngine.compare(state.headers, state.rows, column, payload.options));
  }
  if (!store.worker) {
    store.worker = new Worker("analysis-worker.js");
    payload.headers = state.headers; payload.rows = state.rows;
    store.worker.onmessage = event => {
      const job = store.jobs.get(event.data.id); if (!job) return;
      store.jobs.delete(event.data.id);
      if (store !== analyticalStore()) return job.reject(new Error("Dataset changed; run the comparison again."));
      if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
    };
    store.worker.onerror = () => {
      store.jobs.forEach(job => job.reject(new Error("Analytical computation failed. Please try again.")));
      store.jobs.clear(); store.worker.terminate(); store.worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    store.jobs.set(payload.id, { resolve, reject }); store.worker.postMessage(payload);
  });
}
function analyticalNumber(value) { return value === null || value === undefined ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }); }
function analyticalHistogram(histogram, names = ["Target missing", "Target present"]) {
  if (!histogram || histogram.min === null) return "";
  const max = histogram.countScale || Math.max(1, ...histogram.sets.flatMap(set => set.counts));
  return `<div class="analytical-histogram"><div class="chart-legend">${names.map((name, index) => `<span class="${index ? "working" : "source"}">${escapeHtml(name)}</span>`).join("")}</div><div class="distribution-bars" role="img" aria-label="${escapeHtml(names.join(" and "))} counts in shared percentile bins">${Array.from({ length: histogram.bins }, (_, index) => `<div>${histogram.sets.map((set, series) => `<i class="${series ? "working" : "source"}" style="height:${set.counts[index] / max * 100}%" title="${escapeHtml(names[series])}: ${set.counts[index]}"></i>`).join("")}</div>`).join("")}</div><div class="distribution-axis"><span>${analyticalNumber(histogram.min)}</span><span>Shared 1st–99th percentile range</span><span>${analyticalNumber(histogram.max)}</span></div><small>Separate edge counts: ${histogram.sets.map((set, index) => `${names[index]}: ${set.below} below, ${set.above} above`).join(" · ")}. True min ${analyticalNumber(histogram.trueMin)} / max ${analyticalNumber(histogram.trueMax)}.</small></div>`;
}
function analyticalStatsTable(result) {
  return `<div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>Group</th><th>Parsed count</th><th>Mean</th><th>Median</th><th>IQR</th></tr></thead><tbody>${[["Target missing", result.missingStats], ["Target present", result.presentStats]].map(([label, stats]) => `<tr><th>${label}</th><td>${stats?.count ?? 0}</td><td>${analyticalNumber(stats?.mean)}</td><td>${analyticalNumber(stats?.median)}</td><td>${analyticalNumber(stats?.iqr)}</td></tr>`).join("")}</tbody></table></div>`;
}
function analyticalComparisonDetails(result) {
  if (result.type === "numeric") return `${analyticalStatsTable(result)}${analyticalHistogram(result.histogram)}<p class="review-scope">Cliff’s δ ${analyticalNumber(result.cliffsDelta)} · ${escapeHtml(result.directionText)}. Secondary 1st–99th-percentile winsorized SMD ${analyticalNumber(result.winsorizedSmd)}.</p>`;
  return `<div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>${result.type === "date" ? "Month" : "Category"}</th><th>Records</th><th>Target missing</th><th>Missing rate</th></tr></thead><tbody>${(result.categoryRates || result.monthlyRates).map(rate => `<tr><th>${escapeHtml(rate.label)}</th><td>${rate.total}</td><td>${rate.missing}</td><td>${(rate.rate * 100).toFixed(1)}%${rate.eligible ? "" : ' <small>(under 10; excluded from ranking)</small>'}</td></tr>`).join("")}</tbody></table></div>`;
}
function analyticalBandFields(prefix, banding) {
  return `${selectHtml(`${prefix}Mode`, "Numeric bands", [["quantiles", "Quantiles"], ["fixedWidth", "Fixed width"], ["custom", "Custom edges"]], banding.mode || "quantiles")}${banding.mode === "fixedWidth" ? `<label>Band width<input id="${prefix}Width" type="number" min="0.000001" step="any" value="${escapeHtml(banding.width || "")}"></label>` : banding.mode === "custom" ? `<label>Increasing edges<input id="${prefix}Edges" value="${escapeHtml((banding.edges || []).join(", "))}" placeholder="2, 5, 10"></label>` : `<label>Number of bands<input id="${prefix}K" type="number" min="2" max="20" value="${banding.k || 4}"></label>`}`;
}
function analyticalEvidenceHtml(item) {
  const data = analyticalTarget(item.column), result = data.result;
  const selected = result?.results.find(entry => entry.column === data.comparisonColumn) || result?.results[0];
  const otherColumns = state.headers.filter(column => column !== item.column);
  const holdColumn = data.holdColumn || otherColumns.find(column => column !== selected?.column) || otherColumns[0];
  const comparison = data.comparisonColumn || selected?.column || otherColumns[0];
  const currentHeld = data.held.find(entry => entry.comparisonColumn === comparison && entry.holdColumn === holdColumn);
  return `<section class="analytical-section" aria-labelledby="missingComparisonTitle"><div class="analytical-heading"><div><h3 id="missingComparisonTitle">Missing vs present</h3><p>Compare blanks and analyst-confirmed missing observations with present values in ${escapeHtml(item.column)}.</p></div><button class="secondary" id="compareMissing" ${data.pending ? "disabled" : ""}>${data.pending === "compare" ? "Comparing…" : result ? "Refresh comparison" : "Compare columns"}</button></div>${data.error ? `<p class="workspace-error" role="alert">${escapeHtml(data.error)}</p>` : ""}${result ? `<p class="analytical-counts">${result.nMissing} target-missing · ${result.nPresent} target-present records</p>${result.insufficientData ? `<p class="evidence">${escapeHtml(result.note)}</p>` : `${result.note ? `<p class="evidence" id="noPatternNote">${escapeHtml(result.note)}</p>` : ""}<div class="analysis-table-wrap"><table class="profile-table analysis-table" aria-label="Ranked missingness comparisons"><thead><tr><th>Comparison column</th><th>Type</th><th>Effect size</th><th>Strength</th></tr></thead><tbody>${result.results.map(entry => `<tr ${entry.column === selected?.column ? 'class="is-selected"' : ""}><th><button class="ghost" data-analysis-column="${escapeHtml(entry.column)}" aria-pressed="${entry.column === selected?.column}">${escapeHtml(entry.column)}</button></th><td>${entry.type}</td><td>${analyticalNumber(entry.effectSize)}${entry.type === "numeric" ? " SMD" : " gap"}</td><td>${entry.strength}</td></tr>`).join("") || '<tr><td colspan="4">No variable comparison columns with usable values.</td></tr>'}</tbody></table></div>${selected ? `<h4>${escapeHtml(selected.column)}</h4>${analyticalComparisonDetails(selected)}<p class="review-scope">Excluded: ${selected.excludedBlankRows} missing comparison values · ${selected.excludedInvalidRows} unparsed values. Numeric effects use pooled standard deviation; categorical effects use a proportion gap.</p>` : ""}<details class="analytical-hold" ${currentHeld ? "open" : ""}><summary>Hold similar: compare within groups</summary><div class="review-fields">${selectHtml("analysisCompareColumn", "Compare", otherColumns.map(column => [column, column]), comparison)}${selectHtml("analysisHoldColumn", "Hold similar by", otherColumns.filter(column => column !== comparison).map(column => [column, column]), holdColumn)}${analyticalBandFields("analysisBand", data.banding)}</div><button class="secondary" id="runHeldComparison" ${data.pending ? "disabled" : ""}>${data.pending === "hold" ? "Comparing groups…" : "Compare within groups"}</button>${currentHeld ? `<div class="held-result" role="status"><h4>${escapeHtml(currentHeld.verdict)}</h4><p>${escapeHtml(currentHeld.summary)}</p><p>Unbanded effect ${analyticalNumber(currentHeld.unbandedEffect)} → weighted effect ${analyticalNumber(currentHeld.combinedEffect)}</p>${currentHeld.warning ? `<p class="evidence">${escapeHtml(currentHeld.warning)}</p>` : ""}<div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>Band</th><th>Missing / present</th><th>Missing median</th><th>Present median</th><th>Effect</th><th>Included</th></tr></thead><tbody>${currentHeld.bands.map(band => `<tr><th>${escapeHtml(band.label)}</th><td>${band.nMissing} / ${band.nPresent}</td><td>${analyticalNumber(band.missingStats?.median)}</td><td>${analyticalNumber(band.presentStats?.median)}</td><td>${analyticalNumber(band.effectSize)}</td><td>${band.valid ? "Yes" : "Insufficient"}</td></tr>`).join("")}</tbody></table></div></div>` : ""}</details><div class="analytical-ai"><button class="secondary" id="explainMissingPattern" ${data.pending ? "disabled" : ""}>${data.pending === "ai" ? "Requesting explanation…" : "Explain top pattern with AI"}</button><small>Only aggregate statistics and comparison verdicts are sent.</small>${data.ai ? `<div class="pattern-explanation"><span class="ai-label">AI explanation</span><p>${escapeHtml(data.ai.explanation)}</p>${data.ai.likelyDriver ? `<p>Likely driver: <b>${escapeHtml(data.ai.likelyDriver)}</b></p>` : ""}${data.ai.caution ? `<p>${escapeHtml(data.ai.caution)}</p>` : ""}${data.ai.proposal ? `<p>Proposed: ${escapeHtml(data.ai.proposal.operation.replaceAll("_", " "))}</p><button class="secondary" id="usePatternProposal">Review proposed treatment</button>` : ""}</div>` : ""}</div>`}` : ""}</section>`;
}
function similarDraft(item) {
  const draft = reviewDraft(item);
  if (!draft.similar) {
    const top = analyticalTarget(item.column).result?.results[0]?.column;
    const other = state.headers.find(column => column !== item.column && !CleaningEngine.isIdentifier(column));
    draft.similar = { columns: [top || other].filter(Boolean), statistic: "median", minObserved: 5, k: 7, banding: {} };
  }
  return draft.similar;
}
function similarTreatmentHtml(item) {
  const draft = reviewDraft(item), params = similarDraft(item), options = analyticalOptions();
  const targetMissing = state.rows.filter(row => CleaningEngine.missing(row[item.column], AnalysisEngine.policy(item.column, options)));
  const columns = state.headers.filter(column => column !== item.column && !CleaningEngine.isIdentifier(column));
  const sparse = params.columns.filter(column => targetMissing.length && targetMissing.filter(row => CleaningEngine.missing(row[column], AnalysisEngine.policy(column, options))).length / targetMissing.length >= .5);
  return `<div class="similar-treatment"><fieldset><legend>${draft.operation === "knn" ? "Similarity columns" : "Hold columns"}</legend><div class="similar-columns">${columns.map(column => `<label><input type="checkbox" data-similar-column="${escapeHtml(column)}" ${params.columns.includes(column) ? "checked" : ""}> ${escapeHtml(column)}</label>`).join("")}</div></fieldset><div class="review-fields">${draft.operation === "knn" ? `<label>Neighbours (k)<input id="similarK" type="number" min="1" max="50" value="${params.k}"></label>` : `${selectHtml("similarStatistic", "Reference statistic", [["median", "Median"], ["mean", "Mean"]], params.statistic)}<label>Minimum observed references<input id="similarMinimum" type="number" min="1" max="1000" value="${params.minObserved}"></label>`}<label>Decimal places<input id="similarDecimals" type="number" min="0" max="12" value="${draft.decimals}"></label></div>${draft.operation === "groupwise" ? params.columns.filter(column => ["number", "integer"].includes(cleaningProfile().columns.find(entry => entry.column === column)?.role)).map((column, index) => `<div class="similar-banding" data-band-column="${escapeHtml(column)}"><h4>${escapeHtml(column)} bands</h4><div class="review-fields">${analyticalBandFields(`similarBand${index}`, params.banding[column] || {})}</div></div>`).join("") : ""}${sparse.length ? `<p class="evidence">${escapeHtml(sparse.join(", "))} is missing in at least half of these target-missing rows. Choose more complete columns; weak matches may use the global median.</p>` : ""}<p class="review-scope">${draft.operation === "knn" ? "Numeric distances use min-max scaling; categories match exactly. Blank similarity values in the target row are ignored. Ties follow source order." : "Small groups widen to nearby numeric bands or the Other category. Groups still lacking references use the global median."} Every proposed fill lists its actual source.</p></div>`;
}
function analyticalFillKey(item, draft) { return JSON.stringify([analyticalStore().key, item.id, draft.operation, draft.similar, draft.scope, draft.decimals]); }
async function prepareAnalyticalPreview(item, draft) {
  if (!["groupwise", "knn"].includes(draft.operation)) return;
  const params = similarDraft(item), store = analyticalStore(), key = analyticalFillKey(item, draft);
  if (store.fills.has(key)) return;
  const rowIds = CleaningEngine.scopeRows(state.rows, reviewRows(item).map(row => row._row), draft.scope, analyticalOptions()).map(row => row._row);
  const next = $("#reviewNext"), steps = [...document.querySelectorAll("[data-review-step]")];
  if (next) { next.disabled = true; next.textContent = "Computing preview…"; }
  steps.forEach(button => { button.disabled = true; });
  try {
    const result = await analyticalTask("fill", item.column, { params: { ...params, method: draft.operation, rowIds }, options: analyticalOptions() });
    if (key !== analyticalFillKey(item, draft)) throw new Error("Treatment changed; review its preview again.");
    store.fills.set(key, result);
  } finally {
    if (next?.isConnected) { next.disabled = false; next.textContent = "Continue →"; }
    steps.forEach(button => { button.disabled = false; });
  }
}
function analyticalTreatmentOptions(item, draft) {
  if (!["groupwise", "knn"].includes(draft.operation)) return {};
  const params = similarDraft(item), similarResult = analyticalStore().fills.get(analyticalFillKey(item, draft));
  if (!similarResult) throw new Error("Generate the similar-row preview from Treat & scope.");
  return { ...analyticalOptions(), similarResult };
}
function analyticalFillMetadataHtml(metadata, approved = false) {
  if (!metadata) return "";
  return `<details class="fill-provenance" open><summary>Fill sources · ${metadata.fills.length} ${approved ? "approved" : "proposed"} values · ${metadata.fallbackCount} fallbacks</summary><p class="review-scope">${escapeHtml(metadata.method)} · ${escapeHtml(metadata.params.columns.join(", "))} · ${escapeHtml(metadata.params.statistic)}${metadata.method === "knn" ? ` · k = ${metadata.params.k}` : ` · minimum ${metadata.params.minObserved} references`}</p><div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>Source row</th><th>${approved ? "Filled" : "Proposed"} value</th><th>Actual method</th><th>Group / neighbour source rows</th></tr></thead><tbody>${metadata.fills.slice(0, 100).map(fill => `<tr><td>${fill.row}</td><td>${analyticalNumber(fill.value)}</td><td>${escapeHtml(fill.source)}</td><td>${escapeHtml(fill.bandLabel || fill.neighbourRows?.join(", ") || "Global observed median")}</td></tr>`).join("")}</tbody></table></div>${metadata.fills.length > 100 ? `<small>Showing 100 of ${metadata.fills.length} fills. The full source trace is saved with the decision and project backup.</small>` : ""}</details>`;
}
function enhanceAnalyticalReview(item) {
  if (!item) return;
  const step = state.reviewStep || 1, stage = screen.querySelector(".guided-stage");
  if (step === 1 && (["impute", "keep"].includes(item.recommendation) || item.candidate?.kind === "missing_token")) {
    const distribution = stage.querySelector(".review-distribution,.comparison-metrics");
    if (distribution) distribution.insertAdjacentHTML("beforebegin", analyticalEvidenceHtml(item));
    else stage.insertAdjacentHTML("beforeend", analyticalEvidenceHtml(item));
    const excluded = analyticalTarget(item.column).result?.excludedNotApplicable || 0;
    if (excluded) stage.querySelector(".analytical-counts")?.insertAdjacentHTML("afterend", `<p class="review-scope">${excluded} not-applicable records excluded from both target groups.</p>`);
    stage.querySelectorAll(".analytical-section > .analysis-table-wrap tbody tr").forEach((row, index) => {
      const result = analyticalTarget(item.column).result?.results[index];
      if (result?.type === "numeric") row.cells[2].textContent = `${analyticalNumber(result.effectSize)} |δ| · ${result.directionText}`;
    });
    const hold = stage.querySelector(".analytical-hold"), data = analyticalTarget(item.column);
    if (hold) {
      if (data.holdOpen) hold.open = true;
      hold.addEventListener("toggle", () => { if (hold.isConnected) data.holdOpen = hold.open; });
      const holdColumn = data.holdColumn || $("#analysisHoldColumn")?.value;
      if (holdColumn && !["number", "integer"].includes(cleaningProfile().columns.find(entry => entry.column === holdColumn)?.role)) {
        for (const id of ["analysisBandMode", "analysisBandK", "analysisBandWidth", "analysisBandEdges"]) $(`#${id}`)?.closest("label")?.setAttribute("hidden", "");
      }
    }
    bindAnalyticalEvidence(item);
  }
  if (step === 3 && ["groupwise", "knn"].includes(reviewDraft(item).operation)) {
    stage.querySelector(".review-fields").insertAdjacentHTML("afterend", similarTreatmentHtml(item));
    bindSimilarTreatment(item);
  }
  if (step >= 4 && ["groupwise", "knn"].includes(reviewDraft(item).operation)) {
    try { stage.querySelector(".preview-summary").insertAdjacentHTML("afterend", analyticalFillMetadataHtml(guidedPreview(item).fillMetadata)); } catch { /* Existing preview error remains visible. */ }
  }
}
function readAnalyticalBand(prefix) {
  const mode = $(`#${prefix}Mode`).value;
  return { mode, ...(mode === "fixedWidth" ? { width: Number($(`#${prefix}Width`).value) } : mode === "custom" ? { edges: $(`#${prefix}Edges`).value.split(",").map(value => Number(value.trim())) } : { k: Number($(`#${prefix}K`).value) }) };
}
function bindAnalyticalEvidence(item) {
  const data = analyticalTarget(item.column);
  const run = async (kind, action) => {
    const store = analyticalStore(); data.pending = kind; data.error = ""; renderPreservingReviewFocus();
    try { await action(); } catch (error) { if (store === analyticalStore()) data.error = error.message; }
    finally { data.pending = ""; if (store === analyticalStore() && state.screen === "issues") renderPreservingReviewFocus(); }
  };
  $("#compareMissing").onclick = () => run("compare", async () => {
    data.result = await analyticalTask("compare", item.column, { options: analyticalOptions() });
    data.permutationError = false;
    data.comparisonColumn = data.result.results[0]?.column || ""; data.held = []; data.ai = null;
  });
  document.querySelectorAll("[data-analysis-column]").forEach(button => button.onclick = () => { data.comparisonColumn = button.dataset.analysisColumn; renderPreservingReviewFocus(); });
  $("#analysisCompareColumn")?.addEventListener("change", event => { data.holdOpen = true; data.comparisonColumn = event.target.value; data.ai = null; renderPreservingReviewFocus(); });
  $("#analysisHoldColumn")?.addEventListener("change", event => { data.holdOpen = true; data.holdColumn = event.target.value; data.ai = null; renderPreservingReviewFocus(); });
  $("#analysisBandMode")?.addEventListener("change", event => { data.holdOpen = true; data.banding = { mode: event.target.value, k: 4, width: 1, edges: [] }; renderPreservingReviewFocus(); });
  $("#runHeldComparison")?.addEventListener("click", () => {
    const comparisonColumn = $("#analysisCompareColumn").value, holdColumn = $("#analysisHoldColumn").value, banding = readAnalyticalBand("analysisBand");
    data.comparisonColumn = comparisonColumn; data.holdColumn = holdColumn; data.banding = banding; data.ai = null;
    run("hold", async () => {
      const result = await analyticalTask("hold", item.column, { comparisonColumn, holdColumn, banding, options: analyticalOptions() });
      data.held = data.held.filter(entry => entry.comparisonColumn !== comparisonColumn || entry.holdColumn !== holdColumn).concat(result).slice(-10);
    });
  });
  $("#explainMissingPattern")?.addEventListener("click", () => run("ai", () => requestPatternExplanation(item, data)));
  $("#usePatternProposal")?.addEventListener("click", () => {
    try {
      const proposal = data.ai.proposal, draft = reviewDraft(item), params = similarDraft(item);
      draft.interpretation = "missing";
      if (proposal.operation === "fill_constant") { draft.operation = "constant"; draft.value = String(proposal.params.value); }
      if (proposal.operation === "fill_groupwise") { draft.operation = "groupwise"; params.columns = [...proposal.params.holdColumns]; params.statistic = proposal.params.statistic; }
      if (proposal.operation === "fill_knn") { draft.operation = "knn"; params.columns = [...proposal.params.columns]; params.k = proposal.params.k; }
      if (proposal.operation === "leave_missing") draft.operation = "leaveMissing";
      delete draft.previewFingerprint; state.reviewStep = 3; render();
    } catch (error) { notify(error.message); }
  });
}
function bindSimilarTreatment(item) {
  const draft = reviewDraft(item), params = similarDraft(item);
  const update = (action, rerender = false) => { action(); delete draft.previewFingerprint; if (rerender) renderPreservingReviewFocus(); };
  document.querySelectorAll("[data-similar-column]").forEach(input => input.onchange = () => update(() => { params.columns = [...document.querySelectorAll("[data-similar-column]:checked")].map(input => input.dataset.similarColumn); }, true));
  $("#similarStatistic")?.addEventListener("change", event => update(() => { params.statistic = event.target.value; }));
  for (const [id, key] of [["similarK", "k"], ["similarMinimum", "minObserved"]]) $(`#${id}`)?.addEventListener("input", event => update(() => { params[key] = Number(event.target.value); }));
  $("#similarDecimals").oninput = event => update(() => { draft.decimals = Number(event.target.value); });
  document.querySelectorAll("[data-band-column]").forEach((group, index) => {
    const column = group.dataset.bandColumn, prefix = `similarBand${index}`;
    $(`#${prefix}Mode`).onchange = event => update(() => { params.banding[column] = { mode: event.target.value, k: 4, width: 1, edges: [] }; }, true);
    group.querySelectorAll("input").forEach(input => input.oninput = () => update(() => { params.banding[column] = readAnalyticalBand(prefix); }));
  });
}
function buildPatternSummary(column, data) {
  return { targetColumn: column, total: data.result.total, nMissing: data.result.nMissing, results: data.result.results.slice(0, 3).map(result => ({ column: result.column, type: result.type, effectSize: result.effectSize, missingStats: result.missingStats, presentStats: result.presentStats, ...(result.categoryRates ? { categoryRates: result.categoryRates.slice(0, 30) } : {}), ...(result.monthlyRates ? { monthlyRates: result.monthlyRates.slice(0, 30) } : {}) })), held: data.held.map(result => ({ comparisonColumn: result.comparisonColumn, holdColumn: result.holdColumn, verdict: result.verdict, combinedEffect: result.combinedEffect, unbandedEffect: result.unbandedEffect })) };
}
const baseBuildPatternSummary = buildPatternSummary;
buildPatternSummary = (column, data) => {
  const summary = baseBuildPatternSummary(column, data);
  summary.excludedNotApplicable = data.result.excludedNotApplicable || 0;
  summary.results.forEach((result, index) => {
    const computed = data.result.results[index];
    if (computed.type === "numeric") Object.assign(result, { effectMeasure: "cliffs_delta", cliffsDelta: computed.cliffsDelta, winsorizedSmd: computed.winsorizedSmd, directionText: computed.directionText });
    if (computed.significance) Object.assign(result, { pValue: computed.pValue, significance: computed.significance });
  });
  return summary;
};
async function requestPatternExplanation(item, data) {
  const store = analyticalStore(), controller = new AbortController(); store.controllers.add(controller);
  const summary = buildPatternSummary(item.column, data), fingerprint = JSON.stringify(summary);
  try {
    const configResponse = await fetch("/api/ai/pattern", { signal: controller.signal });
    if (!configResponse.ok) throw new Error("AI pattern explanations are unavailable. Local comparisons remain available.");
    const config = await configResponse.json(); turnstileSiteKey = config.turnstileSiteKey || "";
    const turnstileToken = await requestTurnstileToken(controller.signal);
    const response = await fetch("/api/ai/pattern", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ summary, turnstileToken }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not explain this pattern.");
    if (store !== analyticalStore() || fingerprint !== JSON.stringify(buildPatternSummary(item.column, data))) return;
    const result = payload.result, columns = new Set([item.column, ...summary.results.map(entry => entry.column), ...summary.held.flatMap(entry => [entry.comparisonColumn, entry.holdColumn])]);
    if (!result || typeof result.explanation !== "string" || result.explanation.length > 300 || result.requiresConfirmation !== true || result.likelyDriver !== null && !columns.has(result.likelyDriver)) throw new Error("Invalid AI explanation.");
    if (result.proposal) {
      const proposal = result.proposal, params = proposal.params;
      if (!["fill_constant", "fill_groupwise", "fill_knn", "leave_missing"].includes(proposal.operation) || proposal.requiresConfirmation !== true || !params) throw new Error("Invalid AI fix proposal.");
      if (proposal.operation === "fill_constant" && !Number.isFinite(params.value)) throw new Error("Invalid constant proposal.");
      if (["fill_groupwise", "fill_knn"].includes(proposal.operation)) {
        const references = proposal.operation === "fill_knn" ? params.columns : params.holdColumns;
        if (!Array.isArray(references) || !references.length || references.some(column => column === item.column || !columns.has(column))) throw new Error("Invalid similarity columns in AI proposal.");
        if (proposal.operation === "fill_knn" && (!Number.isInteger(params.k) || params.k < 1 || params.k > 50)) throw new Error("Invalid neighbour count.");
        if (proposal.operation === "fill_groupwise" && !["median", "mean"].includes(params.statistic)) throw new Error("Invalid group statistic.");
      }
    }
    data.ai = result;
  } finally { store.controllers.delete(controller); }
}
