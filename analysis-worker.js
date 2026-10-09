importScripts("cleaning-engine.js", "review-page-engine.js", "analysis-engine.js");
importScripts("capabilities-engine.js");
importScripts("review-bands.js");
let dataset = null;
self.onmessage = event => {
  if (event.data.rows) dataset = { headers: event.data.headers, rows: event.data.rows };
  const { id, task, targetColumn, options, params, comparisonColumn, holdColumn, banding } = event.data;
  try {
    const { headers, rows } = dataset;
    if (task === "reviewBands") { self.postMessage({ id, result: reviewBandComparisons(headers, rows, targetColumn, params, options) }); return; }
    if (task === "business") { self.postMessage({ id, result: { kpis: CapabilitiesEngine.kpiImpact(headers, rows, params.preview, params.definitions, options), dependencies: CapabilitiesEngine.dependencyImpact(headers, rows, params.preview, params.metrics, options) } }); return; }
    if (task === "scorecards") { self.postMessage({ id, result: CapabilitiesEngine.qualityScorecard(headers, rows, params.rules, options) }); return; }
    if (task === "significance") { self.postMessage({ id, result: AnalysisEngine.significance(headers, rows, targetColumn, params.result, options) }); return; }
    if (task === "suggestions") { self.postMessage({ id, result: CapabilitiesEngine.suggestedRules(headers, rows, options) }); return; }
    if (task === "kpi") { self.postMessage({ id, result: CapabilitiesEngine.kpiImpact(headers, rows, params.preview, params.definitions, options) }); return; }
    if (task === "candidates") { self.postMessage({ id, result: CapabilitiesEngine.compareCandidates(headers, rows, targetColumn, params.eligibleIds, params.drafts, options) }); return; }
    const result = task === "impact" ? CapabilitiesEngine.bandImpact(headers, rows, targetColumn, params.preview, params.grouping, options) : task === "records" ? CapabilitiesEngine.recordView(headers, rows, targetColumn, params, options) : task === "fill" ? AnalysisEngine.fillSimilar(headers, rows, targetColumn, params, options) : task === "hold" ? AnalysisEngine.holdSimilar(headers, rows, targetColumn, comparisonColumn, holdColumn, banding, options) : AnalysisEngine.compare(headers, rows, targetColumn, options);
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
