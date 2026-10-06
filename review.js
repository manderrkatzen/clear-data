// Guided cleaning workflow. Loaded as a classic script before app.js; globals
// are used only when the application invokes these functions.
let cleaningCache = null;
let classificationCache = null;
let profileWorker = null;
let reviewController = null;
let automaticReviewRun = 0;
const interpretationCache = new Map();
const reviewSteps = ["Understand", "Interpret", "Treat & scope", "Preview", "Approve"];
function invalidateCleaningProfile() { cleaningCache = null; classificationCache = null; }
function cleaningProfile() {
  const key = JSON.stringify([state.datasetRevision, state.rows.length, state.ruleConfig?.columns, state.ruleConfig?.schema]);
  if (!cleaningCache || cleaningCache.key !== key) cleaningCache = { key, result: CleaningEngine.profile(state.headers, state.rows, state.ruleConfig?.columns || [], state.ruleConfig?.schema || [], effectiveClassifications()) };
  return cleaningCache.result;
}
function columnPolicy(column) { return state.ruleConfig.columns?.find(policy => policy.column === column) || CleaningEngine.defaultPolicy(column); }
function effectiveClassifications() {
  const key = `${state.datasetRevision}:${state.changes.length}:${state.changes[0]?.id || ""}`;
  if (classificationCache?.key === key) return classificationCache.entries;
  const latest = new Map();
  for (const change of [...state.changes].reverse()) for (const entry of change.interpretationValues || []) latest.set(`${entry.rowId}:${entry.column}`, entry);
  classificationCache = { key, entries: [...latest.values()], index: latest };
  return classificationCache.entries;
}
function cellInterpretation(row, column) {
  effectiveClassifications();
  const entry = classificationCache.index.get(`${row._row}:${column}`);
  return entry?.value === row[column] ? entry.meaning : null;
}
function interpretedNumericValues(rows, column, classification = null, original = false) {
  return rows.flatMap(row => {
    const meaning = classification?.rowIds.includes(row._row) ? classification.meaning : cellInterpretation(row, column);
    if (!original && (["missing", "not_applicable"].includes(meaning) || meaning !== "legitimate" && CleaningEngine.missing(row[column], columnPolicy(column)))) return [];
    try { return [CleaningEngine.parseNumber(row[column])]; } catch { return []; }
  });
}
function resetGuidedReview() {
  cancelAutomaticReview(false);
  invalidateCleaningProfile();
  state.reviewDrafts = {};
  state.valueReview = {};
  state.reviewStep = 1;
  state.reviewSearch = "";
  state.reviewKind = "all";
  state.interpretations = {};
  state.analysisStatus = "idle";
  state.analysisMessage = "";
  state.analysisCompleted = 0;
  state.analysisTotal = 0;
  state.datasetPurpose = "";
  state.reviewResult = "";
}
function invalidateGuidedReview() {
  cancelAutomaticReview(false);
  state.reviewDrafts = {};
  state.interpretations = {};
  state.reviewStep = 1;
  state.analysisStatus = "stale";
  state.analysisMessage = "Data or rules changed. Previous AI suggestions were invalidated; refresh analysis for the working data.";
}
function invalidateFindingInterpretation(item) {
  cancelAutomaticReview(false);
  delete state.interpretations?.[analysisCandidateId(item)];
  state.analysisStatus = "stale";
  state.analysisMessage = "The displayed finding definition changed. Refresh AI analysis for its current evidence.";
}
function appendCleaningCandidates(issues) {
  let id = Math.max(0, ...issues.map(item => item.id));
  const byId = new Map(state.rows.map(row => [row._row, row]));
  for (const candidate of cleaningProfile().candidates) {
    if (candidate.kind === "category" && issues.some(item => item.column === candidate.column && item.recommendation === "standardize")) continue;
    if (candidate.kind === "date_format" && issues.some(item => item.column === candidate.column && item.recommendation === "date")) continue;
    issues.push(issue(++id, candidate.column, candidate.kind.replaceAll("_", " "), candidate.label, candidate.rowIds.map(rowId => byId.get(rowId)).filter(Boolean), candidate.kind === "sentinel" ? "medium" : "high", candidate.evidence, "candidate", { candidate, candidateId: candidate.id }));
  }
  for (const rule of state.ruleConfig.relations || []) {
    const rows = state.rows.filter(row => relationProblem(row, rule));
    if (rows.length) issues.push(issue(++id, rule.column, "Business relationship", rule.name, rows, "high", `${rows.length} records violate the declared relationship.`, "relation", { rule, ruleId: rule.id }));
  }
}
function normalizeRelationRules(rules, headers) {
  if (!Array.isArray(rules) || rules.length > 100) throw new Error("Relationship rules must be a bounded list.");
  const ids = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule.id !== "string" || !rule.id || ids.has(rule.id) || !headers.includes(rule.column) || !headers.includes(rule.left) || !["comparison", "requiredIf"].includes(rule.kind)) throw new Error("Invalid relationship rule.");
    ids.add(rule.id);
    if (rule.kind === "comparison" && (!headers.includes(rule.right) || !["=", "!=", ">", ">=", "<", "<="].includes(rule.operator) || !["number", "date", "text"].includes(rule.comparisonType))) throw new Error("Choose comparison columns, type, and operator.");
    if (rule.kind === "requiredIf" && (typeof rule.value !== "string" || !rule.value.trim())) throw new Error("Conditional requirements need a nonblank trigger value.");
    return { id: rule.id, name: String(rule.name || rule.column).slice(0, 200), column: rule.column, left: rule.left, right: rule.right || rule.column, kind: rule.kind, operator: rule.operator || "=", comparisonType: rule.comparisonType || "text", value: rule.value || "" };
  });
}
function relationProblem(row, rule) {
  if (rule.kind === "requiredIf") return row[rule.left] === rule.value && CleaningEngine.missing(row[rule.column], columnPolicy(rule.column)) ? `${rule.column} is required when ${rule.left} = ${rule.value}` : "";
  try {
    if ([rule.left, rule.right].some(column => CleaningEngine.missing(row[column], columnPolicy(column)))) return "Cannot compare missing values; review the missing inputs.";
    const convert = value => rule.comparisonType === "number" ? CleaningEngine.parseNumber(value) : rule.comparisonType === "date" ? CleaningEngine.parseDate(value) : value;
    const a = convert(row[rule.left]), b = convert(row[rule.right]);
    return ({ "=": a === b, "!=": a !== b, ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b })[rule.operator] ? "" : `${rule.left} (${row[rule.left]}) must be ${rule.operator} ${rule.right} (${row[rule.right]})`;
  } catch (error) { return error.message; }
}
function reviewRows(item) { return item.recommendation === "outlier" ? activeRows(item) : item.rows.filter(row => state.rows.some(current => current._row === row._row)); }
function reviewDraft(item) {
  state.reviewDrafts ||= {};
  return state.reviewDrafts[item.id] ||= { operation: "retain", interpretation: "unresolved", value: "", factor: item.recommendation === "convert" ? "0.01" : "1", decimals: item.recommendation === "convert" ? 4 : columnPolicy(item.column).decimals, scope: { mode: "all", rowIds: [], column: state.headers[0], operator: "=", value: "" }, mapping: {}, groupColumn: state.headers.find(column => column !== item.column) || item.column, numberFormat: columnPolicy(item.column).numberFormat, dateFormat: columnPolicy(item.column).dateFormat, currency: columnPolicy(item.column).currency, percentage: columnPolicy(item.column).percentage, lower: "", upper: "", survivor: "first", survivorIds: [], acknowledgeConflicts: false, note: "", acknowledgeConstraints: false, skipBlocked: false };
}
function guidedFingerprint(item, draft) { const { previewFingerprint, ...parameters } = draft; return JSON.stringify([state.datasetRevision, reviewFingerprint(item, reviewRows(item)), item.recommendation === "outlier" ? outlierDraft(item) : null, state.ruleConfig, parameters]); }
function guidedPreview(item, draft = reviewDraft(item)) {
  const policy = columnPolicy(item.column);
  const treatment = { ...draft };
  if (draft.operation === "map") {
    const sources = new Set(reviewRows(item).map(row => row[item.column]));
    if (Object.keys(draft.mapping).some(source => !sources.has(source))) throw new Error("Mapping sources must belong to this finding.");
    const scoped = new Set(CleaningEngine.scopeRows(state.rows, reviewRows(item).map(row => row._row), draft.scope).map(row => row[item.column]));
    treatment.mapping = Object.fromEntries(Object.entries(draft.mapping).filter(([source]) => scoped.has(source)));
  }
  if (item.recommendation === "duplicates") {
    const definition = state.ruleConfig.duplicates || { mode: "exact", columns: state.headers };
    treatment.keys = definition.columns; treatment.keyMode = definition.mode === "key";
  }
  if (draft.operation === "recalculate") treatment.rule = item.rule;
  const options = typeof analyticalTreatmentOptions === "function" ? analyticalTreatmentOptions(item, draft) : {};
  const preview = CleaningEngine.treatment(state.headers, state.rows, reviewRows(item).map(row => row._row), item.column, treatment, policy, effectiveClassifications(), options);
  if (preview.fillMetadata) treatment.fillMetadata = preview.fillMetadata;
  const proposed = state.rows.map(row => ({ ...row })), byId = new Map(proposed.map(row => [row._row, row]));
  preview.patches.forEach(patch => { byId.get(patch.rowId)[patch.column] = patch.after; });
  const removed = new Set(preview.removedRows.map(row => row._row));
  const after = proposed.filter(row => !removed.has(row._row));
  const beforeById = new Map(state.rows.map(row => [row._row, row]));
  const constraints = [];
  const changed = new Set(preview.patches.map(patch => patch.rowId));
  for (const row of after.filter(row => changed.has(row._row))) {
    const original = beforeById.get(row._row);
    for (const rule of state.ruleConfig.schema) {
      const before = new Set(schemaProblems(original, rule));
      schemaProblems(row, rule).filter(problem => !before.has(problem)).forEach(problem => constraints.push({ rowId: row._row, column: rule.column, reason: problem }));
    }
    for (const rule of state.ruleConfig.relations || []) {
      const problem = relationProblem(row, rule);
      if (problem && problem !== relationProblem(original, rule)) constraints.push({ rowId: row._row, column: rule.column, reason: problem });
    }
  }
  const classification = { rowIds: preview.selectedIds.filter(id => !preview.blocked.some(entry => entry.rowId === id)), meaning: ["retain", "classify", "missing"].includes(draft.operation) ? draft.interpretation : "resolved" };
  return { ...preview, after, constraints, classification, beforeStats: CleaningEngine.stats(interpretedNumericValues(state.rows, item.column)), afterStats: CleaningEngine.stats(interpretedNumericValues(after, item.column, classification)), fingerprint: guidedFingerprint(item, draft), treatment };
}
function approveGuidedDecision(item) {
  try {
    const draft = reviewDraft(item);
    if (item.status !== "open" || state.reviewStep !== 5 || !draft.previewFingerprint || draft.previewFingerprint !== guidedFingerprint(item, { ...draft, previewFingerprint: undefined })) throw new Error("The data or treatment changed. Review the preview again before approval.");
    if (draft.interpretation === "unresolved") throw new Error("Choose an interpretation before approving; unresolved findings can be left open.");
    if (draft.operation === "classify" && !["missing", "legitimate", "not_applicable"].includes(draft.interpretation)) throw new Error("Choose missing, legitimate, or not applicable for this representation.");
    if (draft.operation === "retain" && draft.interpretation === "missing") throw new Error("Retaining values is not a missing-value normalization. Choose normalize to missing, or an appropriate retention interpretation.");
    const preview = guidedPreview(item);
    if (!preview.selectedIds.length) throw new Error("Choose at least one matching record.");
    if (preview.blocked.length && !draft.skipBlocked) throw new Error("Resolve blocked records or explicitly approve only the valid subset.");
    if (preview.constraints.length && !draft.acknowledgeConstraints) throw new Error("Review the new constraint violations before approving.");
    const blocked = new Set(preview.blocked.map(entry => entry.rowId));
    const reviewedRows = state.rows.filter(row => preview.selectedIds.includes(row._row) && !blocked.has(row._row));
    if (!reviewedRows.length) throw new Error("No eligible records can be approved.");
    if (item.recommendation === "outlier" && !saveOutlierRule(item, false)) return;
    const fingerprints = Object.fromEntries(reviewedRows.map(row => [row._row, reviewFingerprint(item, [row])]));
    const rowById = new Map(state.rows.map(row => [row._row, row]));
    preview.patches.forEach(patch => { rowById.get(patch.rowId)[patch.column] = patch.after; });
    const removedIds = new Set(preview.removedRows.map(row => row._row));
    state.rows = state.rows.filter(row => !removedIds.has(row._row));
    const interpretationValues = reviewedRows.map(row => ({ rowId: row._row, column: item.column, value: row[item.column], meaning: ["retain", "classify", "missing"].includes(draft.operation) ? draft.interpretation : "resolved" }));
    const sample = (patches, key) => patches.slice(0, 3).map(patch => String(patch[key]).trim() ? patch[key] : "Blank").join(", ");
    const change = { id: newReviewId(), createdAt: new Date().toISOString(), issue: item, title: treatmentLabel(draft.operation), disposition: draft.operation === "retain" ? "valid" : "finalized", rows: reviewedRows, before: preview.patches.length ? sample(preview.patches, "before") : "Values retained", after: preview.patches.length ? sample(preview.patches, "after") : removedIds.size ? `${removedIds.size} records removed` : "Values retained", reason: item.summary, note: draft.note || "", interpretation: draft.interpretation, interpretationValues, treatment: { ...preview.treatment, previewFingerprint: undefined }, originals: [], patches: preview.patches, removedRows: preview.removedRows, reviewedFingerprints: fingerprints, fingerprint: reviewFingerprint(item, reviewedRows) };
    state.changes.unshift(change);
    recordDecisionEvent(change);
    refreshIssues();
    state.lastReviewedColumn = item.column;
    state.selectedIssue = null;
    state.reviewResult = `${preview.patches.length} cells changed · ${removedIds.size} records removed · ${reviewedRows.length} records reviewed. ${preview.blocked.length} blocked records remain unresolved. Working profiles and charts updated.`;
    render();
  } catch (error) { notify(error.message); }
}
function treatmentLabel(operation) {
  if (operation === "classify") return "Record reviewed value meaning";
  if (operation === "groupwise") return "Fill from similar groups";
  if (operation === "knn") return "Fill from nearest neighbours";
  if (operation === "scale") return "Multiply by a reviewed factor";
  return ({ retain: "Retain reviewed values", missing: "Normalize to missing", constant: "Reviewed replacement", median: "Fill with reference median", mean: "Fill with reference mean", groupMedian: "Fill with group median", trim: "Normalize whitespace", lowercase: "Normalize to lowercase", uppercase: "Normalize to uppercase", map: "Map reviewed labels", parseNumber: "Parse numerical format", parseDate: "Convert interpreted dates", cap: "Cap to business bounds", remove: "Remove scoped records", recalculate: "Recalculate metric", deduplicate: "Keep selected duplicate survivor", mergeDuplicates: "Merge complementary duplicate values" })[operation] || operation;
}
function reviewOperations(item) {
  const base = ["retain", "constant", "missing", "remove"];
  if (item.recommendation === "manual") return ["retain", "constant", "missing", "trim", "lowercase", "uppercase", "map", "parseNumber", "parseDate", "scale", "median", "mean", "groupMedian", "cap", "remove"];
  const numerical = ["number", "integer"].includes(cleaningProfile().columns.find(profile => profile.column === item.column)?.role);
  if (numerical && (["impute", "keep"].includes(item.recommendation) || ["missing_token", "sentinel"].includes(item.candidate?.kind))) base.splice(2, 0, "median", "mean", "groupMedian", "groupwise", "knn");
  if (numerical || item.recommendation === "convert") base.splice(2, 0, "scale");
  if (["standardize"].includes(item.recommendation) || ["spacing", "category"].includes(item.candidate?.kind)) base.splice(2, 0, "trim", "lowercase", "uppercase", "map");
  if (item.candidate?.kind === "number_format" || item.recommendation === "convert" || item.recommendation === "schema") base.splice(2, 0, "parseNumber");
  if (item.candidate?.kind === "date_format" || item.recommendation === "date" || item.recommendation === "schema") base.splice(2, 0, "parseDate");
  if (["outlier", "schema"].includes(item.recommendation)) base.splice(2, 0, "cap");
  if (item.recommendation === "metric") base.splice(2, 0, "recalculate");
  if (item.recommendation === "duplicates") return ["retain", "deduplicate", "mergeDuplicates"];
  return [...new Set(base)];
}
function interpretationOptions(item) {
  const options = [{ meaning: "legitimate", label: "Legitimate value / expected repetition" }, { meaning: "missing", label: "Unknown / missing observation" }, { meaning: "not_applicable", label: "Not applicable to these records" }, { meaning: "format", label: "Formatting or representation problem" }, { meaning: "error", label: "Incorrect value / business-rule violation" }];
  const ranked = state.interpretations?.[analysisCandidateId(item)]?.interpretations || [];
  return options.sort((a, b) => (ranked.find(entry => entry.meaning === b.meaning)?.score || 0) - (ranked.find(entry => entry.meaning === a.meaning)?.score || 0));
}
function analysisCandidateId(item) { return `finding:${item.id}`; }
function cancelAutomaticReview(announce = true) {
  automaticReviewRun++;
  reviewController?.abort(); reviewController = null;
  profileWorker?.terminate(); profileWorker = null;
  if (announce) { state.analysisStatus = "cancelled"; state.analysisMessage = "AI interpretation cancelled. Local findings and manual review remain available."; render(); }
}
function refreshReviewScreen() { if (["data", "issues"].includes(state.screen)) renderPreservingReviewFocus(); }
async function profileInBackground(revision, signal) {
  if (typeof Worker === "undefined") return cleaningProfile();
  return new Promise((resolve, reject) => {
    const worker = new Worker("profile-worker.js"); profileWorker = worker;
    const finish = () => { worker.terminate(); if (profileWorker === worker) profileWorker = null; signal?.removeEventListener("abort", abort); };
    const abort = () => { finish(); reject(new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else if (event.data.revision !== revision) reject(new Error("Stale profile")); else resolve(event.data.result); };
    worker.onerror = () => { finish(); reject(new Error("Background profiling could not run.")); };
    worker.postMessage({ revision, headers: state.headers, rows: state.rows, policies: state.ruleConfig.columns, schema: state.ruleConfig.schema, classifications: effectiveClassifications() });
  });
}
async function startAutomaticReview(onlyIssue = null, question = "", representationValue = undefined) {
  if (typeof window === "undefined" || !state.headers.length) return;
  cancelAutomaticReview(false);
  const run = automaticReviewRun, revision = state.datasetRevision;
  const controller = new AbortController(); reviewController = controller;
  const current = () => run === automaticReviewRun && revision === state.datasetRevision && !controller.signal.aborted;
  if (!onlyIssue) state.interpretations = {};
  state.analysisStatus = "profiling"; state.analysisMessage = "Profiling candidate groups in the background…";
  state.analysisCompleted = 0; state.analysisTotal = 0; refreshReviewScreen();
  try {
    await profileInBackground(revision, controller.signal);
    if (!current()) return;
    const response = await fetch("/api/ai/status", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("AI configuration could not be checked.");
    const status = await response.json();
    if (!status.available) throw new Error("AI is not configured. Local evidence and manual cleaning remain available.");
    const configResponse = await fetch("/api/ai/interpretations", { signal: controller.signal });
    if (!configResponse.ok) throw new Error("The interpretation API is unavailable on this server.");
    const config = await configResponse.json();
    turnstileSiteKey = config.turnstileSiteKey || "";
    const candidates = buildAnalysisCandidates(onlyIssue, representationValue);
    if (question) candidates.forEach(candidate => { candidate.meaning = `Analyst question: ${question}. Column context: ${candidate.meaning}`.slice(0, 300); });
    state.analysisTotal = candidates.length;
    state.analysisStatus = "running"; state.analysisMessage = "AI is ranking possible interpretations. Source values stay unchanged."; refreshReviewScreen();
    const batchSize = 6;
    for (let offset = 0; offset < candidates.length; offset += batchSize) {
      if (!current()) return;
      const batch = candidates.slice(offset, offset + batchSize);
      const pending = [];
      for (const candidate of batch) {
        const key = JSON.stringify([status.provider, status.model, state.datasetPurpose, candidate]);
        if (interpretationCache.has(key)) { state.interpretations[candidate.id] = interpretationCache.get(key); state.analysisCompleted++; }
        else pending.push(candidate);
      }
      if (pending.length) {
        const turnstileToken = await requestTurnstileToken(controller.signal);
        if (!current()) return;
        const resultResponse = await fetch("/api/ai/interpretations", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ purpose: state.datasetPurpose || "", candidates: pending, turnstileToken }) });
        const result = await resultResponse.json();
        if (!resultResponse.ok) throw new Error(result.error || "AI interpretation could not be generated.");
        if (!current()) return;
        const valid = validateBrowserInterpretations(result.results, pending);
        for (const entry of valid) {
          state.interpretations[entry.id] = { ...entry, provider: result.provider, model: result.model };
          const candidate = pending.find(candidate => candidate.id === entry.id);
          interpretationCache.set(JSON.stringify([status.provider, status.model, state.datasetPurpose, candidate]), state.interpretations[entry.id]);
          if (interpretationCache.size > 200) interpretationCache.delete(interpretationCache.keys().next().value);
          state.analysisCompleted++;
        }
      }
      refreshReviewScreen();
    }
    if (current()) { state.analysisStatus = "complete"; state.analysisMessage = `${state.analysisCompleted} findings interpreted. Scores rank model suggestions; they are not calibrated probabilities.`; refreshReviewScreen(); }
  } catch (error) {
    if (current()) { state.analysisStatus = "unavailable"; state.analysisMessage = error.message; refreshReviewScreen(); }
  } finally { if (reviewController === controller) reviewController = null; }
}
function evidenceValueId(column, value) {
  const original = state.original.find(row => String(row[column] ?? "") === value);
  return original ? `value:${original._row}` : `working:${state.rows.find(row => String(row[column] ?? "") === value)?._row}`;
}
function buildAnalysisCandidates(onlyIssue = null, representationValue = undefined) {
  return state.issues.filter(item => item.status === "open" && (!onlyIssue || item.id === onlyIssue)).flatMap(item => {
    const rows = reviewRows(item), counts = new Map();
    rows.forEach(row => { const value = String(row[item.column] ?? ""); counts.set(value, (counts.get(value) || 0) + 1); });
    const representations = [...counts].sort((a, b) => b[1] - a[1]).filter(([value]) => representationValue === undefined || value === representationValue).map(([value, count]) => ({ id: evidenceValueId(item.column, value), value: value.slice(0, 160), count }));
    const grouped = ["missing_token", "sentinel", "impute", "keep"].includes(item.candidate?.kind || item.recommendation) ? representations : representations.slice(0, 10);
    const profile = cleaningProfile().columns.find(profile => profile.column === item.column);
    const outlier = item.recommendation === "outlier" ? outlierDraft(item) : null;
    const evidence = outlier ? previewOutlier(item).note : item.summary;
    const batches = [];
    for (let offset = 0; offset < grouped.length; offset += 10) batches.push({ id: `${analysisCandidateId(item)}${offset ? `:values:${offset}` : ""}`, column: item.column.slice(0, 200), kind: item.candidate?.kind || item.recommendation, total: state.rows.length, affected: rows.length, role: profile?.role || "text", meaning: columnPolicy(item.column).meaning, evidence: evidence.slice(0, 600), groups: grouped.slice(offset, offset + 10), statistics: profile?.statistics || {}, allowedOperations: reviewOperations(item), rule: JSON.stringify({ rule: item.rule || null, outlier, columnPolicy: columnPolicy(item.column) }).slice(0, 600) });
    return batches;
  }).filter(candidate => candidate.affected > 0);
}
function validateBrowserInterpretations(results, candidates) {
  if (!Array.isArray(results) || results.length !== candidates.length || new Set(results.map(entry => entry?.id)).size !== results.length) throw new Error("AI interpretations did not match the requested candidate batch.");
  return results.map(entry => {
    const candidate = candidates.find(candidate => candidate.id === entry?.id);
    if (!candidate || !Array.isArray(entry.interpretations) || !entry.interpretations.length || entry.interpretations.length > 5) throw new Error("Invalid candidate interpretation.");
    const meanings = new Set();
    const interpretations = entry.interpretations.map(suggestion => {
      if (!["legitimate", "missing", "not_applicable", "format", "error", "unresolved"].includes(suggestion.meaning) || meanings.has(suggestion.meaning) || !Number.isFinite(suggestion.score) || suggestion.score < 0 || suggestion.score > 1 || typeof suggestion.explanation !== "string" || !Array.isArray(suggestion.evidenceIds) || suggestion.evidenceIds.some(id => !candidate.groups.some(group => group.id === id)) || (suggestion.operation && !candidate.allowedOperations.includes(suggestion.operation))) throw new Error("The AI suggested unsupported meanings, evidence, or operations.");
      meanings.add(suggestion.meaning);
      return { meaning: suggestion.meaning, score: suggestion.score, confidence: suggestion.score >= .75 ? "high" : suggestion.score >= .45 ? "moderate" : "low", explanation: suggestion.explanation.slice(0, 1000), evidenceIds: suggestion.evidenceIds, operation: suggestion.operation || "retain", assumptions: (Array.isArray(suggestion.assumptions) ? suggestion.assumptions : []).filter(value => typeof value === "string").slice(0, 3).map(value => value.slice(0, 600)) };
    }).sort((a, b) => b.score - a.score);
    const seen = new Set();
    const valueAssessments = (entry.valueAssessments || []).map(assessment => {
      if (!candidate.groups.some(group => group.id === assessment.evidenceId) || seen.has(assessment.evidenceId) || !Number.isFinite(assessment.missingScore) || assessment.missingScore < 0 || assessment.missingScore > 1 || !["missing", "legitimate", "not_applicable", "unresolved", "error", "format"].includes(assessment.meaning) || typeof assessment.explanation !== "string" || !assessment.explanation.trim() || assessment.explanation.length > 600) throw new Error("Invalid per-representation AI assessment.");
      seen.add(assessment.evidenceId); return { ...assessment };
    });
    if (entry.valueAssessments !== undefined && ["missing_token", "sentinel", "impute", "keep"].includes(candidate.kind) && valueAssessments.length !== candidate.groups.length) throw new Error("AI assessments did not cover every supplied representation.");
    return { id: entry.id, interpretations, valueAssessments };
  });
}
