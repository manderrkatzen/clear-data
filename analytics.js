// Cached analytical work, shared charts, source traces, and summary-only AI.
let analyticalSession = null;
function analyticalOptions() { return { revision: state.datasetRevision, policies: state.ruleConfig.columns || [], classifications: effectiveClassifications() }; }
function analyticalStore() {
  const key = JSON.stringify([state.datasetRevision, state.rows.length, state.ruleConfig, effectiveClassifications()]);
  if (analyticalSession?.key !== key) {
    analyticalSession?.controllers.forEach(controller => controller.abort()); analyticalSession?.worker?.terminate();
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
  const store = analyticalStore(), payload = { id: ++store.nextJob, task, targetColumn: column, ...input };
  if (typeof Worker === "undefined") {
    if (task === "reviewBands") return Promise.resolve(reviewBandComparisons(state.headers, state.rows, column, payload.params, payload.options));
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
    store.worker = new Worker("analysis-worker.js"); payload.headers = state.headers; payload.rows = state.rows;
    store.worker.onmessage = event => {
      const job = store.jobs.get(event.data.id); if (!job) return; store.jobs.delete(event.data.id);
      if (store !== analyticalStore()) return job.reject(new Error("Dataset changed; run the comparison again."));
      if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.result);
    };
    store.worker.onerror = () => { store.jobs.forEach(job => job.reject(new Error("Analytical computation failed. Please try again."))); store.jobs.clear(); store.worker.terminate(); store.worker = null; };
  }
  return new Promise((resolve, reject) => { store.jobs.set(payload.id, { resolve, reject }); store.worker.postMessage(payload); });
}
function analyticalNumber(value) { return value === null || value === undefined ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }); }
function analyticalHistogram(histogram, names = ["Missing", "Present"]) {
  if (!histogram || histogram.min === null) return '<p class="review-scope">No numerical observations to plot.</p>';
  const max = histogram.countScale || Math.max(1, ...histogram.sets.flatMap(set => set.counts));
  return `<div class="analytical-histogram"><div class="chart-legend">${names.map((name, index) => `<span class="${index ? "working" : "source"}">${escapeHtml(name)}</span>`).join("")}</div><div class="distribution-bars" role="img" aria-label="${escapeHtml(names.join(" and "))} counts in shared percentile bins">${Array.from({ length: histogram.bins }, (_, index) => `<div>${histogram.sets.map((set, series) => `<i class="${series ? "working" : "source"}" style="height:${set.counts[index] / max * 100}%" title="${escapeHtml(names[series])}: ${set.counts[index]}"></i>`).join("")}</div>`).join("")}</div><div class="distribution-axis"><span>${analyticalNumber(histogram.min)}</span><span>1st–99th percentile</span><span>${analyticalNumber(histogram.max)}</span></div><details class="chart-edge-counts"><summary>Edge counts</summary><p>${histogram.sets.map((set, index) => `${escapeHtml(names[index])}: ${set.below} below, ${set.above} above`).join(" · ")}. True min ${analyticalNumber(histogram.trueMin)} / max ${analyticalNumber(histogram.trueMax)}.</p></details></div>`;
}
function similarDraft(item) {
  const draft = reviewDraft(item);
  if (!draft.similar) draft.similar = { columns: [analyticalTarget(item.column).result?.results[0]?.column || state.headers.find(column => column !== item.column && !CleaningEngine.isIdentifier(column))].filter(Boolean), statistic: "median", minObserved: 5, k: 7, banding: {} };
  return draft.similar;
}
function analyticalFillKey(item, draft) { return JSON.stringify([analyticalStore().key, item.id, draft.operation, draft.similar, draft.scope, draft.decimals]); }
async function prepareAnalyticalPreview(item, draft) {
  if (!["groupwise", "knn"].includes(draft.operation)) return;
  const params = similarDraft(item), store = analyticalStore(), key = analyticalFillKey(item, draft);
  if (store.fills.has(key)) return;
  const rowIds = CleaningEngine.scopeRows(state.rows, reviewRows(item).map(row => row._row), draft.scope, analyticalOptions()).map(row => row._row);
  const result = await analyticalTask("fill", item.column, { params: { ...params, method: draft.operation, rowIds }, options: analyticalOptions() });
  if (key !== analyticalFillKey(item, draft)) throw new Error("Treatment changed; check its current chart again.");
  store.fills.set(key, result);
}
function analyticalTreatmentOptions(item, draft) {
  if (!["groupwise", "knn"].includes(draft.operation)) return {};
  const similarResult = analyticalStore().fills.get(analyticalFillKey(item, draft));
  if (!similarResult) throw new Error("Wait for the similar-row fix to finish checking.");
  return { ...analyticalOptions(), similarResult };
}
function analyticalFillMetadataHtml(metadata, approved = false) {
  if (!metadata) return "";
  return `<details class="fill-provenance" open><summary>Fill sources · ${metadata.fills.length} ${approved ? "approved" : "proposed"} values · ${metadata.fallbackCount} fallbacks</summary><p class="review-scope">${escapeHtml(metadata.method)} · ${escapeHtml(metadata.params.columns.join(", "))} · ${escapeHtml(metadata.params.statistic)}</p><div class="analysis-table-wrap"><table class="profile-table"><thead><tr><th>Source row</th><th>${approved ? "Filled" : "Proposed"} value</th><th>Actual method</th><th>Group / neighbour source rows</th></tr></thead><tbody>${metadata.fills.slice(0, 100).map(fill => `<tr><td>${fill.row}</td><td>${analyticalNumber(fill.value)}</td><td>${escapeHtml(fill.source)}</td><td>${escapeHtml(fill.bandLabel || fill.neighbourRows?.join(", ") || "Global observed median")}</td></tr>`).join("")}</tbody></table></div>${metadata.fills.length > 100 ? `<small>Showing 100 of ${metadata.fills.length}. Full provenance is retained in the decision.</small>` : ""}</details>`;
}
function buildPatternSummary(column, data) {
  return { targetColumn: column, total: data.result.total, nMissing: data.result.nMissing, excludedNotApplicable: data.result.excludedNotApplicable || 0,
    results: data.result.results.slice(0, 3).map(result => ({ column: result.column, type: result.type, effectSize: result.effectSize, missingStats: result.missingStats, presentStats: result.presentStats, ...(result.categoryRates ? { categoryRates: result.categoryRates.slice(0, 30) } : {}), ...(result.monthlyRates ? { monthlyRates: result.monthlyRates.slice(0, 30) } : {}), ...(result.type === "numeric" ? { effectMeasure: "cliffs_delta", cliffsDelta: result.cliffsDelta, winsorizedSmd: result.winsorizedSmd, directionText: result.directionText } : {}), ...(result.significance ? { pValue: result.pValue, significance: result.significance } : {}) })),
    held: data.held.map(result => ({ comparisonColumn: result.comparisonColumn, holdColumn: result.holdColumn, verdict: result.verdict, combinedEffect: result.combinedEffect, unbandedEffect: result.unbandedEffect })) };
}
async function requestPatternExplanation(item, data) {
  const store = analyticalStore(), controller = new AbortController(); store.controllers.add(controller);
  const summary = buildPatternSummary(item.column, data), fingerprint = JSON.stringify(summary);
  try {
    const configResponse = await fetch("/api/ai/pattern", { signal: controller.signal });
    if (!configResponse.ok) throw new Error("AI pattern explanations are unavailable. Local comparisons remain available.");
    const config = await configResponse.json(); turnstileSiteKey = config.turnstileSiteKey || "";
    const turnstileToken = await requestTurnstileToken(controller.signal);
    const response = await fetch("/api/ai/pattern", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ summary, turnstileToken }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not explain this pattern.");
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
