importScripts("cleaning-engine.js", "analysis-engine.js");
let dataset = null;
self.onmessage = event => {
  if (event.data.rows) dataset = { headers: event.data.headers, rows: event.data.rows };
  const { id, task, targetColumn, options, params, comparisonColumn, holdColumn, banding } = event.data;
  try {
    const { headers, rows } = dataset;
    const result = task === "fill" ? AnalysisEngine.fillSimilar(headers, rows, targetColumn, params, options) : task === "hold" ? AnalysisEngine.holdSimilar(headers, rows, targetColumn, comparisonColumn, holdColumn, banding, options) : AnalysisEngine.compare(headers, rows, targetColumn, options);
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
