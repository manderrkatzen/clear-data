// Find / Compare / Fix orchestration. All treatments and evidence use existing engines.
let simpleReviewSession = null;
let simpleReviewDone = null;
function simpleIsMissing(item) { return ["impute", "keep"].includes(item.recommendation) || isValueFinding(item); }
function simpleNumeric(item) { return ["number", "integer"].includes(cleaningProfile().columns.find(entry => entry.column === item.column)?.role); }
function simpleReviewData(item) {
  if (simpleReviewSession?.source !== state.original) { simpleReviewSession?.items.forEach(data => clearTimeout(data.timer)); simpleReviewSession = { source: state.original, items: new Map() }; simpleReviewDone = null; }
  const key = simpleIsMissing(item) ? `missing:${item.column}` : `finding:${item.id}`;
  if (!simpleReviewSession.items.has(key)) {
    const draft = reviewDraft(item);
    if (draft.interpretation === "unresolved") draft.interpretation = simpleIsMissing(item) ? "missing" : item.recommendation === "outlier" || item.recommendation === "duplicates" ? "legitimate" : ["candidate", "date", "convert", "standardize"].includes(item.recommendation) ? "format" : "error";
    simpleReviewSession.items.set(key, { draft, itemId: item.id, fix: simpleIsMissing(item) ? simpleNumeric(item) ? "median" : "constant" : item.recommendation === "duplicates" ? "first" : ["date", "convert", "standardize", "candidate", "metric"].includes(item.recommendation) ? "normalize" : "leave", hold: "", holdChosen: false, banding: { mode: "quantiles", k: 4 }, more: false, moreOpen: false, noteOpen: false, byGroup: false, panel: "", chip: null, preview: null, result: null, bands: null, held: null, impact: null, pending: false, error: "", computedKey: "", generation: 0 });
    if (simpleIsMissing(item) && !simpleNumeric(item) && !draft.value) draft.value = "Unassigned";
    simpleSyncFix(item);
  }
  const data = simpleReviewSession.items.get(key), draft = reviewDraft(item);
  if (data.draft !== draft) {
    const scope = data.itemId === item.id ? structuredClone(data.draft.scope) : draft.scope;
    const { previewFingerprint, valueAssessment, ...parameters } = data.draft;
    Object.assign(draft, parameters, { scope, interpretation: simpleIsMissing(item) ? "missing" : parameters.interpretation, skipBlocked: false, acknowledgeConstraints: false, acknowledgeConflicts: false });
    delete draft.previewFingerprint;
    delete draft.valueAssessment;
    clearTimeout(data.timer); data.generation++; data.pending = false; data.preview = null; data.computedKey = "";
    data.draft = draft; data.itemId = item.id;
  }
  return data;
}
function simpleDataKey(item) {
  const data = simpleReviewData(item);
  return JSON.stringify([guidedFingerprint(item, reviewDraft(item)), data.fix, data.hold, data.banding, data.more, data.byGroup]);
}
function simpleSyncFix(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item);
  data.validationError = "";
  delete draft.previewFingerprint;
  const missing = simpleIsMissing(item);
  if (data.fix === "leave") { draft.operation = missing && draft.interpretation === "missing" ? "leaveMissing" : "retain"; }
  else if (data.fix === "median-by-group") {
    draft.operation = "groupwise";
    draft.similar = { columns: [data.hold], statistic: "median", minObserved: 5, k: 7, banding: { [data.hold]: data.banding } };
  } else if (["first", "complete"].includes(data.fix)) { draft.operation = "deduplicate"; draft.survivor = data.fix; }
  else if (data.fix === "normalize") {
    draft.operation = item.recommendation === "metric" ? "recalculate" : item.recommendation === "date" || item.candidate?.kind === "date_format" ? "parseDate" : item.recommendation === "convert" ? "scale" : item.candidate?.kind === "number_format" ? "parseNumber" : item.recommendation === "standardize" || item.candidate?.kind === "category" ? "map" : "trim";
    if (draft.operation === "map" && !Object.keys(draft.mapping).length) draft.mapping = item.recommendation === "standardize" ? categoryImpact(item, "standardize").mapping : Object.fromEntries(currentValueGroups(item).map(([value]) => [value, value.trim().replace(/\s+/g, " ")]));
  } else if (data.fix === "median" && item.recommendation === "outlier") {
    const reference = guidedPreview(item, { ...draft, operation: "retain", interpretation: "legitimate" }).referenceStats;
    draft.operation = "constant"; draft.value = reference.median === null ? "" : Number(reference.median).toFixed(Number(draft.decimals));
    if (reference.median === null) data.validationError = "No observed reference median. Choose a reviewed replacement or keep these values.";
    draft.interpretation = "error";
  } else if (data.fix === "ai") {
    const proposal = analyticalTarget(item.column).ai?.proposal;
    if (!proposal) throw new Error("Request an AI explanation before choosing its proposed fix.");
    draft.operation = ({ fill_constant: "constant", fill_groupwise: "groupwise", fill_knn: "knn", leave_missing: "leaveMissing" })[proposal.operation];
    if (draft.operation === "constant") draft.value = String(proposal.params.value);
    if (draft.operation === "groupwise") draft.similar = { columns: proposal.params.holdColumns, statistic: proposal.params.statistic, minObserved: 5, k: 7, banding: {} };
    if (draft.operation === "knn") draft.similar = { columns: proposal.params.columns, statistic: "median", minObserved: 5, k: proposal.params.k, banding: {} };
  } else {
    draft.operation = data.fix;
    if (draft.operation === "knn") draft.similar ||= { columns: [data.hold || analyticalTarget(item.column).result?.results[0]?.column || state.headers.find(column => column !== item.column && !CleaningEngine.isIdentifier(column))].filter(Boolean), statistic: "median", minObserved: 5, k: 7, banding: {} };
  }
  if (missing && draft.interpretation !== "missing") { data.fix = "leave"; draft.operation = "retain"; }
  if (!missing && data.fix === "leave" && draft.interpretation === "missing") draft.interpretation = "legitimate";
}
function simpleRenderCurrent(item) { if (state.screen === "issues" && state.selectedIssue === item.id) renderPreservingReviewFocus(); }
function scheduleSimpleReview(item, renderNow = true) {
  const data = simpleReviewData(item);
  clearTimeout(data.timer); data.generation++; data.pending = true; data.preview = null; data.bands = null; data.impact = null; data.error = "";
  delete reviewDraft(item).previewFingerprint;
  if (renderNow) simpleRenderCurrent(item);
  else {
    $("#simpleApprove")?.setAttribute("disabled", "");
    const numbers = document.querySelector('[data-ui="review.fix.numbers"]'); if (numbers) numbers.textContent = "Checking this fix…";
  }
  data.timer = setTimeout(() => computeSimpleReview(item), 180);
}
async function computeSimpleReview(item) {
  const data = simpleReviewData(item), source = state.original, revision = state.datasetRevision, store = analyticalStore(), generation = ++data.generation;
  const current = () => source === state.original && generation === data.generation && state.issues.some(entry => entry.id === item.id);
  data.pending = true; data.error = "";
  try {
    const analytical = analyticalTarget(item.column);
    if (simpleIsMissing(item) && !analytical.result) {
      let result = await analyticalTask("compare", item.column, { options: analyticalOptions() });
      if (!current()) return;
      result = await analyticalTask("significance", item.column, { params: { result }, options: analyticalOptions() });
      if (!current()) return;
      analytical.result = result;
    }
    data.result = analytical.result;
    data.awaitMeaning = isValueFinding(item) && reviewDraft(item).interpretation === "missing" && !reviewRows(item).some(row => ["missing", "blank_unreviewed"].includes(observationState(row, item.column)));
    if (data.awaitMeaning) {
      data.preview = null; data.pending = false; data.computedKey = simpleDataKey(item); simpleRenderCurrent(item); return;
    }
    if (simpleIsMissing(item) && !data.holdChosen) data.hold = data.result?.results.find(entry => entry.type === "categorical" && ["strong", "moderate"].includes(entry.strength))?.column || "";
    if (data.fix === "median-by-group" && !data.hold) data.fix = "median";
    simpleSyncFix(item);
    if (data.validationError) throw new Error(data.validationError);
    const expected = simpleDataKey(item), draft = reviewDraft(item);
    await prepareAnalyticalPreview(item, draft); await prepareCapabilityPreview(item, draft);
    if (!current() || expected !== simpleDataKey(item)) return;
    const preview = guidedPreview(item);
    const entries = data.result?.results || [], comparison = entries.find(entry => entry.type === "numeric" && entry.column !== data.hold) || entries.find(entry => entry.column !== data.hold);
    const [bands, held, impact] = await Promise.all([
      data.hold && simpleIsMissing(item) ? analyticalTask("reviewBands", item.column, { params: { holdColumn: data.hold, banding: { [data.hold]: data.banding }, columns: (data.more ? entries : entries.slice(0, 3)).map(entry => entry.column) }, options: analyticalOptions() }) : null,
      data.hold && comparison ? analyticalTask("hold", item.column, { comparisonColumn: comparison.column, holdColumn: data.hold, banding: data.banding, options: analyticalOptions() }) : null,
      data.hold && data.byGroup ? analyticalTask("impact", item.column, { params: { preview: compactCapabilityPreview(preview), grouping: { holdColumn: data.hold, banding: { [data.hold]: data.banding } } }, options: analyticalOptions() }) : null
    ]);
    if (!current() || expected !== simpleDataKey(item)) return;
    data.preview = preview; data.bands = bands; data.held = held; data.impact = impact; data.computedKey = expected;
    analytical.held = held ? [held] : []; analytical.holdColumn = data.hold; analytical.banding = data.banding;
    data.pending = false; simpleRenderCurrent(item);
  } catch (error) {
    if (current()) {
      data.pending = false;
      if (revision !== state.datasetRevision || store !== analyticalStore() || error.message === "Dataset changed; run the comparison again.") {
        data.preview = null; data.computedKey = "";
        if (state.screen === "issues" && state.selectedIssue === item.id) scheduleSimpleReview(item);
        return;
      }
      data.error = error.message; data.computedKey = simpleDataKey(item); simpleRenderCurrent(item);
    }
  }
}
function simpleSuspiciousGroups(item) {
  const values = new Map(), rowById = new Map(state.rows.map(row => [row._row, row]));
  const columnIds = new Set(state.issues.filter(entry => entry.column === item.column).map(entry => entry.id));
  const add = (value, itemId) => { if (!values.has(value)) values.set(value, { value, itemId, rowIds: [], evidenceId: evidenceValueId(item.column, value) }); };
  state.issues.filter(entry => entry.column === item.column && entry.status === "open" && simpleIsMissing(entry)).forEach(entry => reviewRows(entry).forEach(row => add(String(row[item.column] ?? ""), entry.id)));
  for (const change of state.changes) for (const entry of change.interpretationValues || []) {
    if (entry.column === item.column && ["missing", "legitimate", "not_applicable"].includes(entry.meaning) && rowById.get(entry.rowId)?.[item.column] === entry.value && (change.treatment?.operation === "classify" || !entry.value.trim())) add(entry.value, change.issue.id);
  }
  for (const row of state.rows) if (values.has(String(row[item.column] ?? ""))) values.get(String(row[item.column] ?? "")).rowIds.push(row._row);
  return [...values.values()].filter(group => group.rowIds.length).map(group => {
    const states = group.rowIds.map(id => observationState(rowById.get(id), item.column));
    const meaning = states.every(value => ["missing", "blank_unreviewed"].includes(value)) ? "missing" : group.rowIds.every(id => ["legitimate", "not_applicable"].includes(cellInterpretation(rowById.get(id), item.column))) ? "valid" : "unreviewed";
    let assessment = representationAssessment(item.column, group);
    if (!assessment) for (const [id, result] of Object.entries(state.interpretations || {})) {
      if (!columnIds.has(Number(id.split(":")[1]))) continue;
      const matched = result.valueAssessments?.find(entry => entry.evidenceId === group.evidenceId);
      if (matched) { assessment = { ...matched, provider: result.provider || "configured provider" }; break; }
    }
    return { ...group, state: meaning, assessment };
  }).sort((a, b) => Number(!b.value.trim()) - Number(!a.value.trim()) || b.rowIds.length - a.rowIds.length);
}
async function classifySimpleValue(item, value, meaning) {
  const group = simpleSuspiciousGroups(item).find(entry => entry.value === value); if (!group) return;
  const data = simpleReviewData(item), saved = { ...state.interpretations };
  let source = state.issues.find(entry => entry.id === group.itemId && entry.status === "open");
  if (!source) {
    source = issue(Math.max(0, ...state.issues.map(entry => entry.id)) + 1, item.column, "Value meaning", `Review value meaning: ${item.column}`, state.rows.filter(row => group.rowIds.includes(row._row)), "medium", "Source-preserving value meaning decision.", "manual");
    state.issues.push(source);
  }
  const draft = reviewDraft(source);
  Object.assign(draft, { operation: "classify", interpretation: meaning, scope: { mode: "selected", rowIds: group.rowIds }, valueAssessment: group.assessment ? { ...group.assessment, value } : null });
  const preview = guidedPreview(source);
  if (preview.patches.length || preview.removedRows.length || preview.blocked.length) return notify("Value meaning must preserve source cells.");
  draft.previewFingerprint = guidedFingerprint(source, draft);
  const change = approveGuidedDecision(source); if (!change) return;
  const columnIds = new Set(state.issues.filter(entry => entry.column === item.column).map(entry => entry.id));
  const remainingEvidence = new Set(simpleSuspiciousGroups(item).map(entry => entry.evidenceId));
  Object.entries(saved).forEach(([id, result]) => {
    if (!columnIds.has(Number(id.split(":")[1]))) return;
    const assessments = result.valueAssessments?.filter(assessment => remainingEvidence.has(assessment.evidenceId));
    if (assessments?.length) state.interpretations[id] = { ...result, valueAssessments: assessments };
  });
  const next = state.issues.find(entry => entry.column === item.column && entry.status === "open" && ["impute", "keep"].includes(entry.recommendation)) || state.issues.find(entry => entry.column === item.column && entry.status === "open" && simpleIsMissing(entry)) || source;
  state.selectedIssue = next.id;
  data.chip = value;
  if (next.status === "open") { reviewDraft(next).interpretation = "missing"; reviewDraft(next).scope = { ...reviewDraft(next).scope, mode: "all", rowIds: [] }; simpleSyncFix(next); scheduleSimpleReview(next); }
  else { state.selectedIssue = null; render(); }
}
async function approveSimpleReview(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item);
  if (data.pending || !data.preview || data.computedKey !== simpleDataKey(item)) return notify("Wait for the current fix to finish checking.");
  const expected = guidedFingerprint(item, draft), selected = state.selectedIssue;
  try {
    data.approving = true;
    $("#simpleApprove").disabled = true; $("#simpleApprove").textContent = "Checking…";
    await prepareAnalyticalPreview(item, draft); await prepareCapabilityPreview(item, draft);
    if (expected !== guidedFingerprint(item, draft) || selected !== state.selectedIssue) throw new Error("The finding changed. Check the current fix before approving.");
    const preview = guidedPreview(item);
    if (!preview.selectedIds.length) throw new Error("Choose at least one matching record in Advanced → Scope.");
    if (preview.blocked.length && !draft.skipBlocked) throw new Error("Some rows cannot be filled. Review the list or explicitly approve the rest.");
    if (preview.constraints.length && !draft.acknowledgeConstraints) throw new Error("Review and acknowledge the new constraint violations.");
    draft.previewFingerprint = expected;
    const change = approveGuidedDecision(item); if (!change) return;
    simpleReviewDone = { id: change.id, count: change.patches.length };
    const next = state.issues.find(entry => entry.status === "open" && entry.id !== item.id) || state.issues.find(entry => entry.status === "open");
    state.selectedIssue = next?.id || null; render();
  } catch (error) { notify(error.message); }
  finally { data.approving = false; if (state.selectedIssue === item.id) simpleRenderCurrent(item); }
}
function simpleUndo(id) { if (!state.changes.some(change => change.id === id)) return; rollbackChange(id); simpleReviewDone = null; render(); }
function simpleOptions(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item);
  if (simpleIsMissing(item)) {
    if (draft.interpretation !== "missing") return [["leave", "Leave as is"]];
    if (simpleNumeric(item)) return [["median", "Median"], ...(data.hold ? [["median-by-group", `Median by ${data.hold}`]] : []), ["leave", "Leave as is"]];
    return [["constant", `Fill ‘${draft.value}’`], ["leave", "Leave as is"]];
  }
  if (item.recommendation === "outlier") return [["leave", "Keep"], ["cap", "Cap to bounds"], ["median", "Median"], ["remove", "Remove"]];
  if (item.recommendation === "duplicates") return [["first", "Keep earliest"], ["complete", "Keep most complete"], ["leave", "Keep all"]];
  if (["metric", "metricBlocked", "relation", "schema", "valid"].includes(item.recommendation)) return [...(item.recommendation === "metric" ? [["normalize", "Recalculate"]] : []), ["leave", "Keep as is"]];
  return [["normalize", "Normalize / map"], ["leave", "Keep as is"]];
}
function simpleDoneHtml() {
  return simpleReviewDone && state.changes.some(change => change.id === simpleReviewDone.id) ? `<div class="simple-done" data-ui="review.fix.done" role="status">Approved · ${simpleReviewDone.count} cells changed <button class="ghost" id="simpleUndo">Undo</button></div>` : "";
}
function simpleQueueTitle(item) {
  if (isValueFinding(item)) return `Value meanings: ${item.column}`;
  return item.label.includes(item.column) ? item.label : `${item.column}: ${item.label}`;
}
function renderSimpleReview() {
  $("#topEyebrow").textContent = "REVIEW";
  $("#contextAction").classList.add("hidden");
  const open = state.issues.filter(item => item.status === "open");
  let selected = open.find(item => item.id === state.selectedIssue);
  if (selected && isValueFinding(selected)) {
    const canonical = open.find(item => item.column === selected.column && ["impute", "keep"].includes(item.recommendation));
    if (canonical) { const data = simpleReviewData(selected); data.chip = currentRepresentation(selected).selected?.value ?? data.chip; selected = canonical; state.selectedIssue = canonical.id; }
  }
  const visible = open.filter(item => `${item.column} ${item.label}`.toLowerCase().includes((state.reviewSearch || "").toLowerCase()));
  const rank = item => state.interpretations?.[analysisCandidateId(item)]?.interpretations?.[0]?.score ?? item.candidate?.score ?? (item.severity === "high" ? .7 : .4);
  if (selected && state.reviewQueueOrder?.length) {
    const order = new Map(state.reviewQueueOrder.map((id, index) => [id, index])); visible.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.id - b.id);
  } else visible.sort((a, b) => rank(b) - rank(a) || a.id - b.id);
  state.reviewQueueOrder = visible.map(item => item.id);
  screen.innerHTML = `<div class="simple-review-layout"><aside class="simple-queue" aria-label="Findings queue"><header><h2>Findings <span>${open.length}</span></h2><input id="reviewSearch" type="search" aria-label="Search findings" placeholder="Search findings" value="${escapeHtml(state.reviewSearch || "")}"></header><div class="candidate-list">${visible.map(item => `<button id="reviewFinding${item.id}" class="candidate-button ${selected?.id === item.id ? "active" : ""}" data-simple-finding="${item.id}" aria-pressed="${selected?.id === item.id}"><b>${escapeHtml(simpleQueueTitle(item))}</b><small>${reviewRows(item).length.toLocaleString()} records</small></button>`).join("") || '<p class="review-scope">No matching findings.</p>'}</div><button class="ghost" id="simpleDecisions">Open Decisions</button></aside><div class="simple-review-main">${simpleDoneHtml()}${selected ? simpleFindingHtml(selected) : `<section class="simple-empty"><h1>${open.length ? "Review findings" : "No open findings"}</h1><p>${open.length ? "Choose a finding to review." : "Your decisions are available in Decisions."}</p>${open.length ? `<button class="primary" data-simple-finding="${visible[0]?.id || open[0].id}">Review first finding</button>` : ""}</section>`}</div></div>`;
  $("#reviewSearch").oninput = event => { state.reviewSearch = event.target.value; renderPreservingReviewFocus(); };
  $("#simpleDecisions").onclick = () => go("changes");
  $("#simpleUndo")?.addEventListener("click", () => simpleUndo(simpleReviewDone.id));
  document.querySelectorAll("[data-simple-finding]").forEach(button => button.onclick = () => { state.selectedIssue = Number(button.dataset.simpleFinding); renderPreservingReviewFocus(); });
  const queue = screen.querySelector(".candidate-list"), active = queue.querySelector(".active");
  if (active) {
    const bounds = queue.getBoundingClientRect(), button = active.getBoundingClientRect();
    if (button.bottom > bounds.bottom) queue.scrollTop += button.bottom - bounds.bottom;
    if (button.top < bounds.top) queue.scrollTop -= bounds.top - button.top;
    if (button.right > bounds.right) queue.scrollLeft += button.right - bounds.right;
    if (button.left < bounds.left) queue.scrollLeft -= bounds.left - button.left;
  }
  document.body.classList.toggle("debug-ui", new URLSearchParams(location.search).get("debug") === "ui");
  if (selected) {
    bindSimpleReview(selected);
    const data = simpleReviewData(selected);
    if (!data.pending && data.computedKey !== simpleDataKey(selected)) scheduleSimpleReview(selected, false);
  }
}
function simpleFindingHtml(item) {
  return `<header class="simple-review-header" data-ui="review.header"><div><h1 data-ui="review.header.title">${escapeHtml(item.label)}</h1><p data-ui="review.header.count">${reviewRows(item).length.toLocaleString()} records</p></div><div class="simple-header-actions"><button class="ghost" id="simpleAdvanced" data-ui="review.header.advanced">Advanced</button><button class="ghost" id="simpleLeaveOpen" data-ui="review.header.leave-open">Leave open</button></div></header>${simpleFindHtml(item)}${simpleCompareHtml(item)}${simpleFixHtml(item)}${simplePanelHtml(item)}`;
}
function simpleDuplicateGroupsHtml(item) {
  const ids = new Set(reviewRows(item).map(row => row._row));
  const groups = duplicateProfile().groups.filter(group => group.rows.some(row => ids.has(row._row)));
  return `${groups.length > 10 ? `<p class="review-scope">Showing 10 of ${groups.length} repeated groups.</p>` : ""}${groups.slice(0, 10).map((group, index) => `<details class="simple-duplicate-group"><summary>Group ${index + 1} · ${group.rows.length} records${group.conflict ? " · conflicting values" : ""}</summary>${simpleRecordTable(item, group.rows.slice(0, 100))}</details>`).join("")}`;
}
function simpleFindHtml(item) {
  const data = simpleReviewData(item), groups = simpleIsMissing(item) ? simpleSuspiciousGroups(item) : [];
  const selected = groups.find(group => group.value === data.chip) || groups[0]; if (selected) data.chip = selected.value;
  const running = ["running", "profiling"].includes(state.analysisStatus), unavailable = state.analysisStatus === "unavailable";
  let content;
  if (simpleIsMissing(item)) {
    content = `${running || unavailable ? `<p class="simple-ai-status" data-ui="review.find.ai-status">${running ? `AI is checking values… ${state.analysisCompleted}/${state.analysisTotal || "—"}` : "AI unavailable: counts only"}</p>` : ""}<div class="simple-value-chips" data-ui="review.find.chips">${groups.map((group, index) => `<button class="simple-value-chip ${selected === group ? "is-selected" : ""}" id="simpleValue${index}" data-ui="review.find.chip" data-value="${escapeHtml(group.value)}" aria-pressed="${selected === group}"><code>${escapeHtml(group.value.trim() ? group.value : "(blank)")}</code><span>${group.rowIds.length} · ${group.assessment ? `${Math.round(group.assessment.missingScore * 100)}% · ` : ""}${group.state}</span></button>`).join("")}</div>${selected ? `<div class="simple-value-detail" data-ui="review.find.detail"><p>${escapeHtml(selected.assessment?.explanation || "—")}</p><div class="simple-value-actions"><button class="${selected.state === "missing" ? "secondary" : "primary"}" id="simpleValueMissing" data-ui="review.find.detail.missing" ${selected.state === "missing" ? "disabled" : ""}>Missing</button><button class="secondary" id="simpleValueValid" data-ui="review.find.detail.valid" ${selected.state === "valid" ? "disabled" : ""}>Keep as valid</button></div></div>` : '<p>No unreviewed representations in this finding.</p>'}`;
  } else if (item.recommendation === "outlier") {
    const template = document.createElement("template"); template.innerHTML = outlierControls(item);
    template.content.querySelectorAll("small,.review-scope,[data-save-outlier]").forEach(element => element.remove());
    content = `<div data-ui="review.find.outlier-rule">${template.innerHTML}</div>`;
  } else if (item.recommendation === "duplicates") {
    const definition = state.ruleConfig.duplicates || { mode: "exact", columns: state.headers };
    content = `<div data-ui="review.find.duplicates"><p>${escapeHtml(item.summary)}</p><div class="review-fields">${selectHtml("simpleDuplicateMode", "Compare duplicates by", [["exact", "Exact full-row match"], ["key", "Business key"]], definition.mode)}</div>${definition.mode === "key" ? `<fieldset><legend>Key columns</legend>${state.headers.map(column => `<label class="check"><input type="checkbox" data-simple-key="${escapeHtml(column)}" ${definition.columns.includes(column) ? "checked" : ""}>${escapeHtml(column)}</label>`).join("")}</fieldset>` : ""}${simpleDuplicateGroupsHtml(item)}</div>`;
  } else if (["schema", "metric", "metricBlocked", "relation", "valid", "manual"].includes(item.recommendation)) {
    content = `<div data-ui="review.find.rule"><p>${escapeHtml(item.summary)}</p>${item.recommendation === "metric" ? `<p>${escapeHtml(metricFormula(item.rule))}</p>` : ""}${simpleRecordTable(item, reviewRows(item).slice(0, 5))}</div>`;
  } else {
    const patchMap = new Map((data.preview?.patches || []).map(patch => [patch.rowId, patch.after]));
    content = `<div data-ui="review.find.formats"><p>${escapeHtml(item.summary)}</p><div class="simple-format-values">${currentValueGroups(item).slice(0, 12).map(([value, ids]) => `<p><code>${escapeHtml(value || "(blank)")}</code><span>${ids.length} records</span><span>${patchMap.has(ids[0]) ? `→ ${escapeHtml(patchMap.get(ids[0]))}` : ""}</span></p>`).join("")}</div></div>`;
  }
  return `<section class="simple-review-card" data-ui="review.find"><h2>① Find: What could be missing?</h2>${content}</section>`;
}
function simplePatternSentence(item, result) {
  if (!result) return "Comparing missing and present rows…";
  if (result.pattern === "none_detected") return "Missing rows look like present rows. No clear pattern.";
  if (result.insufficientData || !result.results.length) return "Not enough missing and present observations to compare yet.";
  const category = result.results.find(entry => entry.type === "categorical" && ["strong", "moderate"].includes(entry.strength));
  if (category?.categoryRates?.length) {
    const ordered = [...category.categoryRates].sort((a, b) => b.rate - a.rate), high = ordered[0], low = ordered.at(-1);
    return `Missing ${item.column} are mostly ${high.label} records (${Math.round(high.rate * 100)}% missing vs ${Math.round(low.rate * 100)}% in ${low.label}).`;
  }
  return result.results[0].summary || "Missing and present rows differ in the selected comparison columns.";
}
function simpleCategoryBars(rates) {
  return `<div class="simple-rate-bars">${rates.slice(0, 10).map(rate => `<div><span>${escapeHtml(rate.label)}</span><div class="simple-rate-track"><i style="width:${rate.rate * 100}%"></i></div><b>${Math.round(rate.rate * 100)}%</b></div>`).join("")}</div>`;
}
function simpleComparisonPlot(entry) {
  if (!entry) return '<p class="review-scope">Checking this comparison…</p>';
  return entry.type === "numeric" ? analyticalHistogram(entry.histogram, ["Missing", "Present"]) : entry.categoryRates || entry.monthlyRates ? simpleCategoryBars(entry.categoryRates || entry.monthlyRates) : `<p class="review-scope">${escapeHtml(entry.note || "Not enough observations")}</p>`;
}
function simpleCompareHtml(item) {
  const data = simpleReviewData(item);
  if (item.recommendation === "outlier") return `<section class="simple-review-card" data-ui="review.compare"><h2>② Compare: Missing vs present</h2><div data-ui="review.compare.scatter">${scatterChart(item)}</div></section>`;
  if (!simpleIsMissing(item)) return "";
  const entries = data.result?.results || [], shown = data.more ? entries : entries.slice(0, 3);
  const numericHold = ["number", "integer"].includes(cleaningProfile().columns.find(entry => entry.column === data.hold)?.role);
  const options = [["", "None"], ...state.headers.filter(column => column !== item.column && cleaningProfile().columns.find(entry => entry.column === column)?.role !== "identifier").map(column => [column, column])];
  const verdict = data.held ? ({ holds: "Holds within groups", explained: `Explained by ${data.hold}`, partial: `Partly explained by ${data.hold}`, insufficient: "Not enough data" })[data.held.verdict] : data.pending ? "Checking groups…" : "Not enough data";
  const ai = analyticalTarget(item.column).ai;
  return `<section class="simple-review-card" data-ui="review.compare"><h2>② Compare: Missing vs present</h2><p class="simple-pattern-summary" data-ui="review.compare.summary">${escapeHtml(simplePatternSentence(item, data.result))}</p><div class="simple-hold-controls" data-ui="review.compare.hold"><label>Hold similar by<select id="simpleHold" data-ui="review.compare.hold.column">${options.map(([key, label]) => `<option value="${escapeHtml(key)}" ${data.hold === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>${numericHold ? `<label>Numeric bands<select id="simpleBandMode" data-ui="review.compare.hold.bands"><option value="quantiles" ${data.banding.mode === "quantiles" ? "selected" : ""}>Quartiles</option><option value="fixedWidth" ${data.banding.mode === "fixedWidth" ? "selected" : ""}>Fixed width</option><option value="custom" ${data.banding.mode === "custom" ? "selected" : ""}>Custom edges</option></select></label>${data.banding.mode === "fixedWidth" ? `<label>Width<input id="simpleBandWidth" type="number" min="0.000001" step="any" value="${escapeHtml(data.banding.width || "")}"></label>` : data.banding.mode === "custom" ? `<label>Increasing edges<input id="simpleBandEdges" value="${escapeHtml((data.banding.edges || []).join(", "))}" placeholder="2, 5, 10"></label>` : ""}` : ""}</div>${data.hold ? `<p class="simple-held-verdict" data-ui="review.compare.verdict">${escapeHtml(verdict)}</p>` : ""}<div class="simple-comparison-charts" data-ui="review.compare.charts">${shown.map(entry => `<section class="simple-comparison-column" data-ui="review.compare.chart" data-column="${escapeHtml(entry.column)}"><h3>${escapeHtml(entry.column)}</h3>${data.hold && data.bands ? data.bands.map(band => `<div class="simple-band-chart"><h4>${escapeHtml(band.label)}</h4>${simpleComparisonPlot(band.results.find(result => result.column === entry.column))}</div>`).join("") : simpleComparisonPlot(entry)}</section>`).join("")}</div><div class="simple-compare-actions">${entries.length > 3 ? `<button class="ghost" id="simpleMoreColumns" data-ui="review.compare.more">${data.more ? "Show fewer columns" : "Show more columns"}</button>` : ""}<button class="ghost" id="simpleExplain" data-ui="review.compare.ai" ${!data.result || data.result.insufficientData || data.pending ? "disabled" : ""}>${data.aiPending ? "Explaining…" : "Explain with AI"}</button></div>${ai ? `<p class="simple-ai-explanation" data-ui="review.compare.ai.text"><b>AI explanation</b> ${escapeHtml(ai.explanation)} ${escapeHtml(ai.caution || "")}</p>` : ""}</section>`;
}
function simpleTextChart(item, after) {
  const counts = rows => { const map = new Map(); rows.forEach(row => { const value = String(row[item.column] ?? ""); map.set(value, (map.get(value) || 0) + 1); }); return map; };
  const before = counts(state.rows), next = counts(after);
  const added = [...next.keys()].filter(value => value.trim() && !before.has(value));
  const ranked = [...new Set([...before.keys(), ...next.keys()])].filter(value => value.trim() && !added.includes(value)).sort((a, b) => (before.get(b) || 0) + (next.get(b) || 0) - (before.get(a) || 0) - (next.get(a) || 0));
  const labels = [...added, ...ranked].slice(0, 10);
  labels.push(""); const scale = Math.max(1, ...labels.flatMap(value => [before.get(value) || 0, next.get(value) || 0]));
  return `<div class="chart-legend"><span class="source">Before</span><span class="working">After</span></div><div class="simple-label-chart">${labels.map(value => `<div><span>${escapeHtml(value || "(blank)")}</span><div class="simple-label-tracks"><i class="source" style="width:${(before.get(value) || 0) / scale * 100}%"></i><i class="working" style="width:${(next.get(value) || 0) / scale * 100}%"></i></div><b>${before.get(value) || 0} → ${next.get(value) || 0}</b></div>`).join("")}</div>`;
}
function simpleFixParameters(item) {
  const draft = reviewDraft(item); let fields = "";
  if (draft.operation === "constant" && !(simpleIsMissing(item) && !simpleNumeric(item))) fields += `<label>Replacement value<input id="simpleReplacement" value="${escapeHtml(draft.value)}"></label>`;
  if (["median", "mean", "groupMedian", "parseNumber", "scale", "cap", "constant"].includes(draft.operation) && simpleNumeric(item)) fields += `<label>Decimal places<input id="simpleDecimals" type="number" min="0" max="12" value="${draft.decimals}"></label>`;
  if (draft.operation === "cap") fields += `<label>Lower bound<input id="simpleLower" value="${escapeHtml(draft.lower)}" placeholder="Unbounded"></label><label>Upper bound<input id="simpleUpper" value="${escapeHtml(draft.upper)}" placeholder="Unbounded"></label>`;
  if (draft.operation === "scale") fields += `<label>Conversion factor<input id="simpleFactor" value="${escapeHtml(draft.factor)}"></label>`;
  if (draft.operation === "parseDate") fields += selectHtml("simpleDateFormat", "Interpret source dates as", [["iso", "YYYY-MM-DD"], ["mdy", "Month / day / year"], ["dmy", "Day / month / year"], ["excel", "Excel 1900 serial"]], draft.dateFormat);
  if (draft.operation === "parseNumber") fields += `${selectHtml("simpleNumberFormat", "Number format", [["plain", "Plain decimal / exponent"], ["decimalPoint", "1,234.56"], ["decimalComma", "1.234,56"]], draft.numberFormat)}<label class="check"><input id="simpleCurrency" type="checkbox" ${draft.currency ? "checked" : ""}> Allow currency symbol</label><label class="check"><input id="simplePercentage" type="checkbox" ${draft.percentage ? "checked" : ""}> Convert explicit % to decimals</label>`;
  if (draft.operation === "groupMedian") fields += selectHtml("simpleGroupColumn", "Group by", state.headers.filter(column => column !== item.column).map(column => [column, column]), draft.groupColumn);
  if (draft.operation === "knn") {
    const params = similarDraft(item);
    fields += `<fieldset><legend>Similarity columns</legend>${state.headers.filter(column => column !== item.column && !CleaningEngine.isIdentifier(column)).map(column => `<label class="check"><input type="checkbox" data-simple-similar="${escapeHtml(column)}" ${params.columns.includes(column) ? "checked" : ""}>${escapeHtml(column)}</label>`).join("")}</fieldset><label>Neighbours (k)<input id="simpleK" type="number" min="1" max="50" value="${params.k}"></label>`;
  }
  if (draft.operation === "map") fields += `<div class="mapping-editor">${currentValueGroups(item).slice(0, 200).map(([value], index) => `<label><code>${escapeHtml(value)}</code><input data-simple-map="${index}" aria-label="Map ${escapeHtml(value)}" value="${escapeHtml(draft.mapping[value] ?? value)}"></label>`).join("")}</div>`;
  return fields ? `<div class="review-fields">${fields}</div>` : "";
}
function simpleFillNumbers(item, preview) {
  const data = simpleReviewData(item);
  if (!preview) return data.awaitMeaning ? "Mark a value as missing in Find to choose a fill." : data.error ? "This fix needs attention before approval." : "Checking this fix…";
  if (data.fix === "leave") return "No values will change";
  const grouped = preview.fillMetadata?.fills || [], byBand = new Map();
  grouped.forEach(fill => { const label = fill.bandLabel?.replace(`${data.hold}: `, "") || fill.source; if (!byBand.has(label)) byBand.set(label, analyticalNumber(fill.value)); });
  const fills = byBand.size ? [...byBand].slice(0, 6).map(([label, value]) => `${label} ${value}`).join(", ") : [...new Set(preview.patches.filter(patch => patch.column === item.column).map(patch => patch.after))].slice(0, 4).join(", ");
  return `${preview.patches.length} cells will change${preview.removedRows.length ? ` · ${preview.removedRows.length} whole rows removed` : ""}${fills ? ` · fill values: ${fills}` : ""} · ${preview.blocked.length} blocked`;
}
function simpleFixHtml(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item), preview = data.preview;
  const options = simpleOptions(item), keys = options.map(([key]) => key);
  if (!keys.includes(data.fix)) options.push([data.fix, data.fix === "ai" ? "AI-proposed fix" : treatmentLabel(data.fix)]);
  const more = reviewOperations(item).filter(operation => !["retain", "classify", "groupwise", "leaveMissing"].includes(operation));
  const chart = preview ? simpleNumeric(item) ? analyticalHistogram(AnalysisEngine.histogram([interpretedNumericValues(state.rows, item.column), interpretedNumericValues(preview.after, item.column, preview.classification)]), ["Before", "After"]) : simpleTextChart(item, preview.after) : '<p class="review-scope">A fresh chart appears when the fix is ready.</p>';
  return `<section class="simple-review-card" data-ui="review.fix"><h2>③ Fix: Choose and check</h2><div class="simple-fix-options" data-ui="review.fix.options">${options.map(([key, label]) => `<button class="simple-fix-option ${data.fix === key ? "is-selected" : ""}" data-ui="review.fix.option" data-fix="${escapeHtml(key)}" aria-pressed="${data.fix === key}">${escapeHtml(label)}</button>`).join("")}${simpleIsMissing(item) && !simpleNumeric(item) && data.fix === "constant" ? `<input id="simpleTextValue" aria-label="Replacement text" value="${escapeHtml(draft.value)}">` : ""}<details id="simpleMoreFixes" class="simple-more-fixes" data-ui="review.fix.more" ${data.moreOpen ? "open" : ""}><summary>More fixes</summary>${selectHtml("simpleOtherFix", "Treatment", [...more.map(operation => [operation, treatmentLabel(operation)]), ...(analyticalTarget(item.column).ai?.proposal ? [["ai", "AI-proposed fix"]] : [])], draft.operation)}${simpleFixParameters(item)}</details></div><div class="simple-fix-chart" data-ui="review.fix.chart">${chart}${data.hold ? `<label class="check simple-by-group"><input id="simpleByGroup" type="checkbox" data-ui="review.fix.chart.by-group" ${data.byGroup ? "checked" : ""}> By group</label>${data.byGroup && data.impact ? data.impact.bands.map(band => `<section class="simple-fix-band"><h3>${escapeHtml(band.label)}</h3>${analyticalHistogram(band.histogram, ["Before", "After"])}</section>`).join("") : ""}` : ""}</div><p class="simple-fix-numbers" data-ui="review.fix.numbers" aria-live="polite">${escapeHtml(simpleFillNumbers(item, preview))}</p>${data.error ? `<p class="workspace-error" role="alert">${escapeHtml(data.error)}</p>` : ""}${preview?.blocked.length ? `<div class="simple-exceptions" data-ui="review.fix.blocked"><span>${preview.blocked.length} rows can’t be filled</span><button class="ghost" id="simpleBlockedList">See list</button><label class="check"><input id="simpleSkipBlocked" type="checkbox" ${draft.skipBlocked ? "checked" : ""}> Approve the rest</label></div>` : ""}${preview?.constraints.length ? `<div class="simple-exceptions"><p>${preview.constraints.length} new constraint violations: ${preview.constraints.slice(0, 3).map(entry => escapeHtml(entry.reason)).join(" · ")}</p><label class="check"><input id="simpleConstraintAck" type="checkbox" ${draft.acknowledgeConstraints ? "checked" : ""}> I reviewed and accept these violations</label></div>` : ""}${["deduplicate", "mergeDuplicates"].includes(draft.operation) ? `<label class="check"><input id="simpleConflictAck" type="checkbox" ${draft.acknowledgeConflicts ? "checked" : ""}> I reviewed conflicting values and confirm this survivor policy</label>` : ""}<div class="simple-fix-actions"><button class="ghost" id="simpleChangedRows" data-ui="review.fix.changed-rows" ${!preview ? "disabled" : ""}>See changed rows</button><details id="simpleNote" data-ui="review.fix.note" ${data.noteOpen ? "open" : ""}><summary>Add a note</summary><label for="simpleNoteText">Rationale<textarea id="simpleNoteText" maxlength="2000" rows="3">${escapeHtml(draft.note)}</textarea></label></details><button class="primary simple-approve" id="simpleApprove" data-ui="review.fix.approve" ${data.pending || !preview || data.approving || item.status !== "open" ? "disabled" : ""}>${data.fix === "leave" ? "Mark as reviewed" : "Approve"}</button></div></section>`;
}
function simpleRecordTable(item, rows, patches = [], removedRows = []) {
  const columns = item.recommendation === "duplicates" ? state.headers : [...new Set([item.column, ...state.headers.filter(CleaningEngine.isIdentifier).slice(0, 2), item.rule?.left, item.rule?.right].filter(column => state.headers.includes(column)))];
  const map = new Map(patches.filter(patch => patch.column === item.column).map(patch => [patch.rowId, patch.after]));
  const allPatches = new Map(patches.map(patch => [`${patch.rowId}:${patch.column}`, patch])), removed = new Set(removedRows.map(row => row._row));
  return `<div class="analysis-table-wrap"><table class="profile-table simple-record-table"><thead><tr><th>Source row</th>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}${patches.length ? "<th>Proposed value</th>" : ""}${removed.size ? "<th>Row treatment</th>" : ""}</tr></thead><tbody>${rows.slice(0, 100).map(row => `<tr><td>${row._row}</td>${columns.map(column => { const patch = allPatches.get(`${row._row}:${column}`); return `<td>${escapeHtml(row[column] || "(blank)")}${patch && column !== item.column ? ` → <b>${escapeHtml(patch.after || "(blank)")}</b>` : ""}</td>`; }).join("")}${patches.length ? `<td>${escapeHtml(map.get(row._row) ?? row[item.column] ?? "(blank)")}</td>` : ""}${removed.size ? `<td>${removed.has(row._row) ? "Remove whole row" : "Retain / update"}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
function simpleScopeHtml(item) {
  const draft = reviewDraft(item), fields = state.headers.map(column => [column, column]);
  return `<section data-ui="review.advanced.scope"><h3>Treatment scope</h3><div class="review-fields">${selectHtml("simpleScopeMode", "Apply to", [["all", "All records in this finding"], ["selected", "Source row IDs"], ["condition", "Matching a condition"]], draft.scope.mode)}${draft.scope.mode === "selected" ? `<label>Source row IDs<input id="simpleScopeIds" value="${draft.scope.rowIds.join(", ")}" placeholder="3, 5, 9"></label>` : draft.scope.mode === "condition" ? `${selectHtml("simpleScopeColumn", "Column", fields, draft.scope.column)}${selectHtml("simpleScopeOperator", "Operator", [["=", "Exact equals"], ["!=", "Not equal"], ["contains", "Contains"], [">", ">"], [">=", ">="], ["<", "<"], ["<=", "<="]], draft.scope.operator)}<label>Value<input id="simpleScopeValue" value="${escapeHtml(draft.scope.value)}"></label>` : ""}</div></section>`;
}
function simplePanelHtml(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item), preview = data.preview;
  let content;
  if (data.panel === "rows") {
    const changed = new Set([...(preview?.patches || []).map(patch => patch.rowId), ...(preview?.removedRows || []).map(row => row._row)]);
    content = `<h2>Changed rows</h2><p>${changed.size} rows · proposed, not applied${changed.size > 100 ? " · showing the first 100" : ""}</p>${simpleRecordTable(item, state.rows.filter(row => changed.has(row._row)), preview?.patches || [], preview?.removedRows || [])}`;
  } else if (data.panel === "blocked") content = `<h2>Rows that can’t be filled</h2><ul>${(preview?.blocked || []).slice(0, 100).map(entry => `<li>Row ${entry.rowId}: ${escapeHtml(entry.reason)}</li>`).join("")}</ul>`;
  else content = `<h2>Advanced</h2>${simpleScopeHtml(item)}<section data-ui="review.advanced.interpretation"><h3>Interpretation</h3><div class="review-fields">${selectHtml("simpleInterpretation", "Treat these records as", interpretationOptions(item).map(option => [option.meaning, option.label]), draft.interpretation)}</div></section><section data-ui="review.advanced.kpi"><h3>Business impact</h3>${preview?.kpiImpact?.length ? kpiImpactHtml(preview.kpiImpact) : '<p>No KPI configured. Define one on Dataset.</p>'}${preview?.dependencyImpact?.length ? `<h4>Dependent metric follow-ups</h4>${preview.dependencyImpact.map(entry => `<p>${escapeHtml(entry.name)}: ${entry.violatingRowIds.length} affected rows. ${escapeHtml(entry.followUp)} after approval; separate review required.</p>`).join("")}` : ""}</section><section data-ui="review.advanced.sources"><h3>Fill sources</h3>${preview?.fillMetadata ? analyticalFillMetadataHtml(preview.fillMetadata) : '<p>No similar-row fill provenance for this fix.</p>'}</section><section data-ui="review.advanced.copilot"><h3>Ask AI about this finding</h3><label for="simpleQuestion">Question<input id="simpleQuestion" maxlength="220"></label><button class="secondary" id="simpleAsk">Ask AI</button>${state.interpretations?.[analysisCandidateId(item)]?.interpretations?.[0] ? `<p>${escapeHtml(state.interpretations[analysisCandidateId(item)].interpretations[0].explanation)}</p><small>Provider: ${escapeHtml(state.interpretations[analysisCandidateId(item)].provider || "configured provider")} · model-assessed, not a calibrated probability.</small>` : ""}</section>`;
  return `<dialog class="simple-review-panel" id="simpleReviewPanel" data-ui="review.advanced" aria-label="${data.panel === "rows" ? "Changed rows" : data.panel === "blocked" ? "Blocked rows" : "Advanced review controls"}"><button class="ghost simple-panel-close" id="simpleClosePanel">Close</button>${content}</dialog>`;
}
function bindSimpleReview(item) {
  const data = simpleReviewData(item), draft = reviewDraft(item);
  const panel = $("#simpleReviewPanel");
  if (data.panel) panel.showModal();
  panel.addEventListener("cancel", () => { data.panel = ""; });
  $("#simpleClosePanel").onclick = () => { const trigger = data.panel === "rows" ? "simpleChangedRows" : data.panel === "blocked" ? "simpleBlockedList" : "simpleAdvanced"; data.panel = ""; panel.close(); $("#" + trigger)?.focus(); };
  const openPanel = name => { data.panel = name; simpleRenderCurrent(item); };
  $("#simpleAdvanced").onclick = () => openPanel("advanced");
  $("#simpleChangedRows").onclick = () => openPanel("rows");
  $("#simpleBlockedList")?.addEventListener("click", () => openPanel("blocked"));
  $("#simpleLeaveOpen").onclick = () => { state.selectedIssue = null; render(); };
  document.querySelectorAll('[data-ui="review.find.chip"]').forEach(button => button.onclick = () => { data.chip = button.dataset.value; simpleRenderCurrent(item); });
  document.querySelectorAll('[data-ui="review.find.chip"]').forEach(button => { button.title = "AI missingness confidence is model-assessed, not a calibrated probability."; });
  $("#simpleValueMissing")?.addEventListener("click", () => classifySimpleValue(item, data.chip, "missing"));
  $("#simpleValueValid")?.addEventListener("click", () => classifySimpleValue(item, data.chip, "legitimate"));
  document.querySelectorAll('[data-ui="review.fix.option"]').forEach(button => button.onclick = () => { data.fix = button.dataset.fix; simpleSyncFix(item); scheduleSimpleReview(item); });
  $("#simpleOtherFix")?.addEventListener("change", event => { data.fix = event.target.value; simpleSyncFix(item); scheduleSimpleReview(item); });
  $("#simpleMoreFixes").addEventListener("toggle", event => { if (event.target.isConnected) data.moreOpen = event.target.open; });
  $("#simpleMoreFixes").hidden = simpleIsMissing(item) && draft.interpretation !== "missing";
  const textValue = $("#simpleTextValue"), constantOption = document.querySelector('[data-ui="review.fix.option"][data-fix="constant"]');
  if (textValue && constantOption) {
    const group = document.createElement("div"); group.className = "simple-fill-choice is-selected";
    constantOption.before(group); group.append(constantOption, textValue);
    constantOption.textContent = "Fill"; constantOption.setAttribute("aria-label", `Fill ‘${draft.value}’`);
  }
  $("#simpleNote").addEventListener("toggle", event => { if (event.target.isConnected) data.noteOpen = event.target.open; });
  $("#simpleHold")?.addEventListener("change", event => { data.hold = event.target.value; data.holdChosen = true; analyticalTarget(item.column).ai = null; analyticalTarget(item.column).held = []; data.held = null; scheduleSimpleReview(item); });
  $("#simpleBandMode")?.addEventListener("change", event => { data.banding = { mode: event.target.value, k: 4, width: 1, edges: [1, 5, 10] }; scheduleSimpleReview(item); });
  $("#simpleBandWidth")?.addEventListener("input", event => { data.banding.width = Number(event.target.value); scheduleSimpleReview(item, false); });
  $("#simpleBandEdges")?.addEventListener("input", event => { data.banding.edges = event.target.value.split(",").map(value => Number(value.trim())); scheduleSimpleReview(item, false); });
  $("#simpleMoreColumns")?.addEventListener("click", () => { data.more = !data.more; scheduleSimpleReview(item); });
  $("#simpleExplain")?.addEventListener("click", async () => {
    const analytical = analyticalTarget(item.column); data.aiPending = true; simpleRenderCurrent(item);
    try { await requestPatternExplanation(item, analytical); } catch (error) { notify(error.message); }
    finally { data.aiPending = false; simpleRenderCurrent(item); }
  });
  $("#simpleByGroup")?.addEventListener("change", event => { data.byGroup = event.target.checked; scheduleSimpleReview(item); });
  const scalar = { simpleTextValue: "value", simpleReplacement: "value", simpleDecimals: "decimals", simpleLower: "lower", simpleUpper: "upper", simpleFactor: "factor", simpleDateFormat: "dateFormat", simpleNumberFormat: "numberFormat", simpleGroupColumn: "groupColumn", simpleNoteText: "note", simpleInterpretation: "interpretation" };
  Object.entries(scalar).forEach(([id, key]) => {
    const input = $("#" + id); if (!input) return;
    const update = () => { draft[key] = input.type === "number" ? Number(input.value) : input.value; if (key === "interpretation" && input.value !== "missing" && simpleIsMissing(item)) data.fix = "leave"; simpleSyncFix(item); scheduleSimpleReview(item, input.tagName === "SELECT"); };
    input[input.tagName === "SELECT" ? "onchange" : "oninput"] = update;
  });
  const checks = { simpleSkipBlocked: "skipBlocked", simpleConstraintAck: "acknowledgeConstraints", simpleConflictAck: "acknowledgeConflicts", simpleCurrency: "currency", simplePercentage: "percentage" };
  Object.entries(checks).forEach(([id, key]) => $("#" + id)?.addEventListener("change", event => { draft[key] = event.target.checked; scheduleSimpleReview(item); }));
  const scopes = { simpleScopeMode: "mode", simpleScopeColumn: "column", simpleScopeOperator: "operator", simpleScopeValue: "value", simpleScopeIds: "rowIds" };
  Object.entries(scopes).forEach(([id, key]) => {
    const input = $("#" + id); if (!input) return;
    const update = () => { draft.scope[key] = key === "rowIds" ? input.value.trim() ? input.value.split(/[\s,]+/).map(Number) : [] : input.value; scheduleSimpleReview(item, input.tagName === "SELECT"); };
    input[input.tagName === "SELECT" ? "onchange" : "oninput"] = update;
  });
  document.querySelectorAll("[data-simple-similar]").forEach(input => input.onchange = () => { similarDraft(item).columns = [...document.querySelectorAll("[data-simple-similar]:checked")].map(input => input.dataset.simpleSimilar); scheduleSimpleReview(item); });
  $("#simpleK")?.addEventListener("input", event => { similarDraft(item).k = Number(event.target.value); scheduleSimpleReview(item, false); });
  document.querySelectorAll("[data-simple-map]").forEach(input => input.oninput = () => { draft.mapping[currentValueGroups(item)[Number(input.dataset.simpleMap)][0]] = input.value; scheduleSimpleReview(item, false); });
  $("#simpleAsk")?.addEventListener("click", () => startAutomaticReview(item.id, $("#simpleQuestion").value));
  $("#simpleApprove").onclick = () => approveSimpleReview(item);
  document.querySelectorAll("[data-outlier-method]").forEach(input => input.onchange = () => { outlierDraft(item).method = input.value; invalidateFindingInterpretation(item); scheduleSimpleReview(item); });
  document.querySelectorAll("[data-outlier-input]").forEach(input => input.onchange = () => { outlierDraft(item)[input.dataset.outlierInput.split(":")[1]] = input.value; invalidateFindingInterpretation(item); scheduleSimpleReview(item); });
  document.querySelectorAll("[data-scatter-plot]").forEach(() => { renderScatterPlot(item); bindScatterNavigation(item); });
  document.querySelectorAll("[data-scatter-axis]").forEach(select => select.onchange = () => { const selected = scatterData(item).selected; selected[select.dataset.scatterAxis] = select.value; delete selected.viewport; render(); });
  document.querySelectorAll("[data-scatter-reset]").forEach(button => button.onclick = () => { delete scatterData(item).selected.viewport; renderScatterPlot(item); });
  const duplicates = () => { refreshIssues(); state.selectedIssue = item.id; scheduleSimpleReview(item); };
  $("#simpleDuplicateMode")?.addEventListener("change", event => { state.ruleConfig.duplicates = { mode: event.target.value, columns: event.target.value === "exact" ? state.headers : [state.headers[0]] }; duplicates(); });
  document.querySelectorAll("[data-simple-key]").forEach(input => input.onchange = () => { const columns = [...document.querySelectorAll("[data-simple-key]:checked")].map(field => field.dataset.simpleKey); if (!columns.length) return notify("Choose at least one key column."); state.ruleConfig.duplicates.columns = columns; duplicates(); });
}
