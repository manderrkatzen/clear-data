// Bounded chart orchestration; statistical methods remain in the existing engines.
function reviewBandComparisons(headers, rows, target, params, options) {
  const capabilities = typeof CapabilitiesEngine !== "undefined" ? CapabilitiesEngine : require("./capabilities-engine.js");
  const analysis = typeof AnalysisEngine !== "undefined" ? AnalysisEngine : require("./analysis-engine.js");
  const grouped = capabilities.bandGroups(headers, rows, target, params, options);
  const recordBands = capabilities.recordView(headers, rows, target, { ...params, mode: "both", columns: params.columns }, options).bands;
  const targetEntry = grouped.context.columns.get(target);
  return grouped.groups.slice(0, 20).map(group => {
    const subset = group.indices.map(index => rows[index]);
    const compared = analysis.compare(headers, subset, target, { ...options, revision: undefined, columns: params.columns });
    const nMissing = group.indices.filter(index => targetEntry.blanks[index]).length;
    const nPresent = group.indices.filter(index => targetEntry.states[index] === "present").length;
    return { label: group.label, nMissing, nPresent, results: params.columns.map(column => {
      const entry = grouped.context.columns.get(column), existing = compared.results.find(result => result.column === column);
      if (entry.type === "numeric") {
        const missing = group.indices.filter(index => targetEntry.blanks[index]).map(index => entry.numbers[index]).filter(Number.isFinite);
        const present = group.indices.filter(index => targetEntry.states[index] === "present").map(index => entry.numbers[index]).filter(Number.isFinite);
        return { column, type: "numeric", histogram: analysis.histogram([missing, present]) };
      }
      return existing || { column, type: entry.type, categoryRates: [{ label: "Missing rate", rate: recordBands.find(band => band.label === group.label)?.missingRate || 0 }] };
    }) };
  });
}
if (typeof module !== "undefined") module.exports = reviewBandComparisons;
