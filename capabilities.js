// Minimal extensions within existing review surfaces; no autonomous approvals.
let capabilitiesSession = null;
function capabilityStore() {
  const key = JSON.stringify([state.datasetRevision, state.ruleConfig]);
  if (capabilitiesSession?.key !== key) capabilitiesSession = { key, items: new Map() };
  return capabilitiesSession;
}
function capabilityOptions() { return { revision: state.datasetRevision, policies: state.ruleConfig.columns || [], classifications: effectiveClassifications(), kpis: state.ruleConfig.kpis || [] }; }
function capabilityPreviewKey(item, draft) { const { previewFingerprint, note, valueAssessment, ...parameters } = draft; return JSON.stringify([capabilityStore().key, item.id, parameters]); }
function enrichCapabilityPreview(item, draft, preview) {
  const data = capabilityItem(item), key = capabilityPreviewKey(item, draft);
  if (typeof window === "undefined") {
    preview.dependencyImpact = CapabilitiesEngine.dependencyImpact(state.headers, state.rows, preview, state.ruleConfig.metrics || [], capabilityOptions());
    preview.kpiImpact = CapabilitiesEngine.kpiImpact(state.headers, state.rows, preview, state.ruleConfig.kpis || [], capabilityOptions());
  } else if (data.kpiKey === key) { preview.kpiImpact = data.kpiImpact; preview.dependencyImpact = data.dependencyImpact; }
  if (preview.kpiImpact) preview.treatment.kpiImpact = preview.kpiImpact;
  if (preview.dependencyImpact?.length) preview.treatment.dependencyImpact = preview.dependencyImpact;
}
function compactCapabilityPreview(preview) { return { patches: preview.patches, removedRows: preview.removedRows, fillMetadata: preview.fillMetadata }; }
async function prepareCapabilityPreview(item, draft) {
  if (!(state.ruleConfig.kpis || []).length && !(state.ruleConfig.metrics || []).length) return;
  const data = capabilityItem(item), key = capabilityPreviewKey(item, draft);
  if (data.kpiKey === key) return;
  const next = $("#reviewNext"), buttons = [...document.querySelectorAll("[data-review-step]")];
  if (next) { next.disabled = true; next.textContent = "Computing business impact…"; } buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await analyticalTask("business", item.column, { params: { preview: compactCapabilityPreview(guidedPreview(item)), definitions: state.ruleConfig.kpis || [], metrics: state.ruleConfig.metrics || [] }, options: capabilityOptions() });
    if (key !== capabilityPreviewKey(item, draft)) throw new Error("The preview changed. Recompute business impact.");
    data.kpiImpact = result.kpis; data.dependencyImpact = result.dependencies; data.kpiKey = key;
  } finally { if (next?.isConnected) { next.disabled = false; next.textContent = "Continue →"; } buttons.forEach(button => { button.disabled = false; }); }
}
function capabilityItem(item) {
  const store = capabilityStore();
  if (!store.items.has(item.id)) store.items.set(item.id, { records: null, mode: "affected", columns: null, holdColumn: null, pending: "", error: "" });
  return store.items.get(item.id);
}
function capabilityHold(item, draft = reviewDraft(item)) {
  const data = analyticalTarget(item.column);
  if (draft.operation === "groupwise" && draft.similar?.columns.length) return { holdColumns: draft.similar.columns, banding: draft.similar.banding };
  if (draft.operation === "groupMedian") return { holdColumn: draft.groupColumn, strict: true };
  if (draft.operation === "knn" && draft.similar?.columns.length) return { holdColumn: draft.similar.columns[0], banding: draft.similar.banding };
  if (data.held.length) { const held = data.held.at(-1); return { holdColumn: held.holdColumn, comparisonColumn: held.comparisonColumn, banding: { [held.holdColumn]: held.banding } }; }
  return {};
}
function capabilityRecordsHtml(item, data) {
  const result = data.records;
  const chosen = data.columns || [...new Set([item.column, ...state.headers.filter(CleaningEngine.isIdentifier), ...(analyticalTarget(item.column).result?.results || []).slice(0, 3).map(entry => entry.column)])];
  return `<details class="evidence-records capability-records" ${result ? "open" : ""}><summary>Inspect affected and present records</summary><div class="review-fields">${selectHtml("recordLensMode", "Show records", [["affected", "Affected only"], ["present", "Present only"], ["both", "Both (inspection only)"]], data.mode)}${selectHtml("recordLensHold", "Group by hold band", [["", "No grouping"], ...state.headers.filter(column => column !== item.column).map(column => [column, column])], data.holdColumn || capabilityHold(item).holdColumn || capabilityHold(item).holdColumns?.[0] || "")}</div><details><summary>Context columns</summary><div class="similar-columns">${state.headers.filter(column => column !== item.column).map(column => `<label><input type="checkbox" data-context-column="${escapeHtml(column)}" ${chosen.includes(column) ? "checked" : ""}> ${escapeHtml(column)}</label>`).join("")}</div></details><button class="secondary" id="refreshRecordLens" ${data.pending ? "disabled" : ""}>${data.pending === "records" ? "Inspecting…" : "Refresh record view"}</button>${data.error ? `<p class="workspace-error">${escapeHtml(data.error)}</p>` : ""}${result ? `<p class="review-scope">Showing ${result.displayedCount} of ${result.totalRecords} inspection records. Present records never enter treatment scope. Proposed values are not applied.</p>${result.bands.map(band => `<section class="record-band"><h4>${escapeHtml(band.label)}</h4><p>${band.nMissing} missing · ${band.nPresent} present · ${(band.missingRate * 100).toFixed(1)}% missing${band.fillValue !== null ? ` · proposed fill median ${analyticalNumber(band.fillValue)}` : ""}${band.missingStats ? ` · comparison medians ${analyticalNumber(band.missingStats.median)} / ${analyticalNumber(band.presentStats.median)}` : ""}</p><div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>Source row</th><th>Observation state</th>${result.columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}<th>Proposed (not applied)</th></tr></thead><tbody>${band.rows.map(row => `<tr><td>${row.rowId}</td><td>${escapeHtml(row.state.replaceAll("_", " "))}</td>${result.columns.map(column => `<td>${String(row.values[column]).trim() ? escapeHtml(row.values[column]) : "Blank"}</td>`).join("")}<td>${row.proposedValue === null ? "—" : escapeHtml(row.proposedValue)}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}` : ""}</details>`;
}
function enhanceCapabilities(item) {
  if (!item) return;
  const analytical = analyticalTarget(item.column);
  if (state.reviewStep === 1 && analytical.result?.results.length && !analytical.result.insufficientData) {
    const section = screen.querySelector(".analytical-section");
    if (section) {
      const table = section.querySelector(".analysis-table");
      if (table) {
        table.tHead.rows[0].insertAdjacentHTML("beforeend", "<th>Permutation evidence</th>");
        [...table.tBodies[0].rows].forEach((row, index) => { const result = analytical.result.results[index]; row.insertAdjacentHTML("beforeend", `<td>${result?.significance ? `${escapeHtml(result.significance)}${result.pValue === null ? " · >20,000-row group" : ` · p ${result.pValue.toFixed(3)}`}` : index < 5 ? "Pending" : "Not tested (top 5 only)"}</td>`); });
      }
      if (!analytical.permutationPending && !analytical.permutationError && !analytical.result.results[0]?.significance) {
        analytical.permutationPending = true; const store = analyticalStore(), originalResult = analytical.result;
        analyticalTask("significance", item.column, { params: { result: originalResult }, options: analyticalOptions() }).then(result => { if (store === analyticalStore() && analytical.result === originalResult) { analytical.result = result; analytical.ai = null; } }).catch(error => { analytical.error = error.message; analytical.permutationError = true; }).finally(() => { analytical.permutationPending = false; if (store === analyticalStore() && state.selectedIssue === item.id) renderPreservingReviewFocus(); });
      }
    }
  }
  const previewStage = state.reviewStep >= 4;
  if (previewStage) {
    try {
      const preview = guidedPreview(item), stage = screen.querySelector(".guided-stage");
      if (preview.kpiImpact) stage.insertAdjacentHTML("beforeend", kpiImpactHtml(preview.kpiImpact));
      if (preview.dependencyImpact?.length) stage.insertAdjacentHTML("beforeend", `<details class="evidence-records dependency-impact" open><summary>Dependent metric follow-ups</summary>${preview.dependencyImpact.map(dependency => `<p><b>${escapeHtml(dependency.name)}</b>: ${dependency.violatingRowIds.length} changed rows would violate ${escapeHtml(dependency.target)}; ${dependency.blockedRowIds.length} unavailable. ${escapeHtml(dependency.followUp)} after approval. Recalculation requires a separate review.</p>`).join("")}</details>`);
    } catch { /* Keep existing preview error visible. */ }
  }
  if (previewStage) enhanceBandImpact(item, capabilityItem(item), screen.querySelector(".guided-stage"));
  if (!["impute", "keep", "manual"].includes(item.recommendation)) return;
  const data = capabilityItem(item), stage = screen.querySelector(".guided-stage");
  if (data.records && data.recordsKey !== capabilityPreviewKey(item, reviewDraft(item))) { data.records = null; data.error = "The draft changed. Refresh the inspection lens for current proposed values."; }
  stage.insertAdjacentHTML("beforeend", capabilityRecordsHtml(item, data));
  if ([3, 4].includes(state.reviewStep)) enhanceCandidateComparison(item, data, stage);
  const hold = capabilityHold(item);
  if (hold.holdColumn || hold.holdColumns?.length) {
    const option = document.createElement("option"); option.value = "__active"; option.textContent = "Active treatment / hold bands"; $("#recordLensHold").append(option);
    if (data.holdColumn === null || data.holdColumn === "__active") $("#recordLensHold").value = "__active";
  }
  document.querySelectorAll("[data-context-column]").forEach(input => input.onchange = () => { data.contextEdited = true; });
  $("#refreshRecordLens").onclick = async () => {
    const store = capabilityStore(), fingerprint = guidedFingerprint(item, reviewDraft(item));
    data.mode = $("#recordLensMode").value; data.holdColumn = $("#recordLensHold").value;
    data.columns = data.contextEdited ? [item.column, ...[...document.querySelectorAll("[data-context-column]:checked")].map(input => input.dataset.contextColumn)] : null;
    data.pending = "records"; data.error = ""; renderPreservingReviewFocus();
    try {
      let preview = null; const draft = reviewDraft(item);
      if (draft.interpretation !== "unresolved") { await prepareAnalyticalPreview(item, draft); preview = guidedPreview(item); }
      const params = { ...capabilityHold(item), mode: data.mode, columns: data.columns, ranking: analyticalTarget(item.column).result?.results, preview: preview ? compactCapabilityPreview(preview) : null };
      if (data.holdColumn !== "__active") { params.holdColumns = undefined; params.holdColumn = data.holdColumn || undefined; }
      data.records = await analyticalTask("records", item.column, { params, options: analyticalOptions() });
      if (store !== capabilityStore() || fingerprint !== guidedFingerprint(item, reviewDraft(item))) data.records = null;
      else { data.recordsKey = capabilityPreviewKey(item, reviewDraft(item)); data.columns = data.records.columns; }
    } catch (error) { data.error = error.message; }
    finally { data.pending = ""; if (store === capabilityStore()) renderPreservingReviewFocus(); }
  };
}
function enhanceBandImpact(item, data, stage) {
  const hold = capabilityHold(item);
  if (!hold.holdColumn && !hold.holdColumns?.length) return;
  const key = capabilityPreviewKey(item, reviewDraft(item));
  if (data.impactKey === key && data.impact) { stage.insertAdjacentHTML("beforeend", bandImpactHtml(data.impact)); return; }
  if (data.impactErrorKey === key) { stage.insertAdjacentHTML("beforeend", `<p class="workspace-error">${escapeHtml(data.error)}</p>`); return; }
  stage.insertAdjacentHTML("beforeend", '<p class="review-scope" role="status">Computing impact by band…</p>');
  if (data.impactPending) return;
  data.impactPending = true;
  const store = capabilityStore();
  try {
    analyticalTask("impact", item.column, { params: { preview: compactCapabilityPreview(guidedPreview(item)), grouping: hold }, options: analyticalOptions() }).then(result => {
      if (store === capabilityStore() && key === capabilityPreviewKey(item, reviewDraft(item))) { data.impact = result; data.impactKey = key; }
    }).catch(error => { data.error = error.message; data.impactErrorKey = key; }).finally(() => { data.impactPending = false; if (store === capabilityStore() && state.selectedIssue === item.id) renderPreservingReviewFocus(); });
  } catch { data.impactPending = false; data.impactErrorKey = key; }
}
function bandImpactHtml(result) {
  return `<details class="evidence-records band-impact" open><summary>Impact by band</summary>${result.bands.map(band => `<section class="record-band"><h4>${escapeHtml(band.label)}${band.sparse ? " · fewer than 5 observations" : ""}</h4><p>${band.observedCount} observed · ${band.filledCount} filled · median ${analyticalNumber(band.beforeStats.median)} → ${analyticalNumber(band.afterStats.median)} · mean ${analyticalNumber(band.beforeStats.mean)} → ${analyticalNumber(band.afterStats.mean)}</p><p class="review-scope">${Object.entries(band.sourceBreakdown).map(([source, count]) => `${source}: ${count}`).join(" · ")}</p>${analyticalHistogram(band.histogram, ["Before", "After"])}</section>`).join("")}</details>`;
}
function candidateScopeKey(item) { return JSON.stringify([capabilityStore().key, item.id, reviewDraft(item).scope]); }
function enhanceCandidateComparison(item, data, stage) {
  const key = candidateScopeKey(item);
  if (data.candidateKey !== key) { data.candidateKey = key; data.candidateDrafts = []; data.candidateComparison = null; }
  const methods = ["median", "mean", "groupwise", "knn", "leaveMissing", "constant", "current"];
  stage.insertAdjacentHTML("beforeend", `<details class="evidence-records candidate-comparison" ${data.candidateDrafts.length ? "open" : ""}><summary>Compare candidate treatments (2–4)</summary><div class="review-fields">${selectHtml("candidateMethod", "Candidate method", methods.map(method => [method, method === "retain" ? "Leave missing (no physical changes)" : treatmentLabel(method)]), "median")}${selectHtml("candidateField", "Group / similarity column", state.headers.filter(column => column !== item.column && !CleaningEngine.isIdentifier(column)).map(column => [column, column]), state.headers.includes("channel") ? "channel" : state.headers.find(column => column !== item.column))}<label>Neighbours (for KNN)<input id="candidateK" type="number" min="1" max="50" value="7"></label></div><button class="secondary" id="addTreatmentCandidate" ${data.candidateDrafts.length >= 4 ? "disabled" : ""}>Add candidate</button><div class="workspace-actions">${data.candidateDrafts.map((draft, index) => `<span>${draft.operation === "retain" ? "Leave missing" : escapeHtml(treatmentLabel(draft.operation))}<button class="ghost" data-remove-candidate="${index}">Remove</button></span>`).join("")}</div><button class="secondary" id="compareTreatmentCandidates" ${data.candidateDrafts.length < 2 || data.pending ? "disabled" : ""}>${data.pending === "candidates" ? "Comparing candidates…" : "Compare on the current scope"}</button>${data.candidateComparison ? `<div class="candidate-lenses">${data.candidateComparison.candidates.map((candidate, index) => `<section><h4>${candidate.draft.operation === "retain" ? "Leave missing" : escapeHtml(treatmentLabel(candidate.draft.operation))}</h4><p>${candidate.cellsChanging} cells · ${candidate.blockedCount} blocked · ${candidate.fallbackCount} fallbacks</p><p>Mean ${analyticalNumber(candidate.afterStats.mean)} · median ${analyticalNumber(candidate.afterStats.median)}</p>${analyticalHistogram(candidate.histogram, ["Working", "Candidate"])}<button class="secondary" data-promote-candidate="${index}">Promote to reviewed preview</button></section>`).join("")}</div><p class="review-scope">Same snapshot, scope, bins, and count scale. Candidates do not create decisions.</p>` : ""}</details>`);
  $("#addTreatmentCandidate").onclick = () => {
    const method = $("#candidateMethod").value, column = $("#candidateField").value;
    const draft = JSON.parse(JSON.stringify(reviewDraft(item))); delete draft.previewFingerprint; delete draft.valueAssessment;
    if (method !== "current") { draft.operation = method; draft.interpretation = "missing"; }
    if (method === "constant") draft.value = $("#candidateValue").value;
    if (["groupwise", "knn"].includes(method)) draft.similar = { columns: [column], statistic: "median", minObserved: 5, k: Number($("#candidateK").value), banding: {} };
    data.candidateDrafts.push(draft); data.candidateOpen = true; data.candidateComparison = null; renderPreservingReviewFocus();
  };
  const disclosure = stage.querySelector(".candidate-comparison");
  if (data.candidateStage !== state.reviewStep) { data.candidateStage = state.reviewStep; data.candidateOpen = state.reviewStep === 3 && data.candidateDrafts.length > 0; }
  if (typeof data.candidateOpen === "boolean") disclosure.open = data.candidateOpen;
  disclosure.addEventListener("toggle", () => { if (disclosure.isConnected) data.candidateOpen = disclosure.open; });
  stage.querySelector(".candidate-comparison .review-fields").insertAdjacentHTML("beforeend", `<label>Replacement value (constant candidate)<input id="candidateValue" value="${escapeHtml(reviewDraft(item).value)}"></label>`);
  document.querySelectorAll("[data-remove-candidate]").forEach(button => button.onclick = () => { data.candidateDrafts.splice(Number(button.dataset.removeCandidate), 1); data.candidateComparison = null; render(); });
  $("#compareTreatmentCandidates").onclick = async () => {
    data.pending = "candidates"; data.error = ""; const expected = candidateScopeKey(item); renderPreservingReviewFocus();
    try {
      const result = await analyticalTask("candidates", item.column, { params: { eligibleIds: reviewRows(item).map(row => row._row), drafts: data.candidateDrafts }, options: capabilityOptions() });
      if (expected === candidateScopeKey(item)) data.candidateComparison = result;
    } catch (error) { data.error = error.message; }
    finally { data.pending = ""; renderPreservingReviewFocus(); }
  };
  document.querySelectorAll("[data-promote-candidate]").forEach(button => button.onclick = async () => {
    try {
      if (data.candidateKey !== candidateScopeKey(item)) throw new Error("The comparison is stale. Recompute candidates.");
      const candidate = data.candidateComparison.candidates[Number(button.dataset.promoteCandidate)];
      Object.assign(reviewDraft(item), JSON.parse(JSON.stringify(candidate.draft))); delete reviewDraft(item).previewFingerprint;
      const expected = guidedFingerprint(item, reviewDraft(item)); await prepareAnalyticalPreview(item, reviewDraft(item));
      if (expected !== guidedFingerprint(item, reviewDraft(item))) throw new Error("The treatment changed. Generate a new preview.");
      await prepareCapabilityPreview(item, reviewDraft(item));
      data.candidateOpen = false; data.candidateStage = 4;
      guidedPreview(item); state.reviewStep = 4; render();
    } catch (error) { notify(error.message); }
  });
  data.candidateComparison?.candidates.forEach((candidate, index) => { if (candidate.kpiImpact.length) stage.querySelectorAll(".candidate-lenses > section")[index]?.insertAdjacentHTML("beforeend", kpiImpactHtml(candidate.kpiImpact)); });
}
function kpiImpactHtml(results) {
  results = results.map(result => ({ ...result, groups: result.groups.map(group => ({ ...group, label: group.total ? "Total (all records)" : group.key === "unavailable" ? "Unknown (unavailable group)" : group.label })) }));
  return `<details class="evidence-records kpi-impact" open><summary>Business KPI impact</summary>${results.map(result => `<section><h4>${escapeHtml(result.definition.name)}</h4><p>${escapeHtml(result.headline)}</p><div class="analysis-table-wrap"><table class="profile-table analysis-table"><thead><tr><th>Group</th><th>Before</th><th>After</th><th>Δ</th><th>% Δ</th><th>Rank</th><th>Flag</th></tr></thead><tbody>${result.groups.map(group => `<tr><th>${escapeHtml(group.label)}</th><td>${analyticalNumber(group.before)}</td><td>${analyticalNumber(group.after)}</td><td>${analyticalNumber(group.delta)}</td><td>${group.percentDelta === null ? "Undefined baseline" : `${group.percentDelta.toFixed(2)}%`}</td><td>${group.rankBefore ?? "—"} → ${group.rankAfter ?? "—"}</td><td>${group.flagged ? "Review impact" : "—"}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}</details>`;
}
function showKpiEditor() {
  const definitions = state.ruleConfig.kpis || [], numeric = numericColumns(), suggestions = CapabilitiesEngine.suggestedKpis(state.headers);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><h2>Business KPIs</h2><p>Define the business answers to compare for working and proposed data.</p><div class="review-fields"><label>Name<input id="kpiName" maxlength="200"></label>${selectHtml("kpiMetric", "Numeric metric", numeric.map(column => [column, column]), numeric[0])}${selectHtml("kpiAggregation", "Aggregation", [["sum", "Sum"], ["mean", "Mean"], ["median", "Median"], ["count", "Observed count"], ["ratio", "Ratio of column sums"]], "sum")}${selectHtml("kpiDenominator", "Denominator (ratio)", numeric.map(column => [column, column]), numeric[1] || numeric[0])}${selectHtml("kpiGroup", "Group by", [["", "Total only"], ...state.headers.map(column => [column, column])], "")}</div><button class="secondary" id="addKpi">Add KPI</button><div class="saved-rule-list">${definitions.map((definition, index) => `<article><span>${escapeHtml(definition.name)} · ${escapeHtml(definition.aggregation)} ${escapeHtml(definition.metric)}${definition.denominator ? ` / ${escapeHtml(definition.denominator)}` : ""} · ${escapeHtml(definition.groupBy || "Total")}</span><button class="ghost" data-remove-kpi="${index}">Remove</button></article>`).join("")}</div><h3>Suggested KPIs</h3>${suggestions.map((definition, index) => `<p>${escapeHtml(definition.name)} by ${escapeHtml(definition.groupBy)} <button class="secondary" data-suggested-kpi="${index}">Use this KPI</button></p>`).join("") || "<p>No domain defaults match these columns.</p>"}<p id="kpiError" class="workspace-error" role="status"></p><button class="secondary" id="closeKpis">Close</button></div>`;
  $("#confirmDialog").showModal(); $("#closeKpis").onclick = () => $("#confirmDialog").close();
  const save = definition => {
    try { const [validated] = CapabilitiesEngine.normalizeKpis([definition], state.headers); CapabilitiesEngine.kpiValues(state.headers, state.rows, validated, capabilityOptions()); applyRuleConfig({ ...exportRuleConfig(), kpis: [...definitions, validated] }); render(); showKpiEditor(); }
    catch (error) { $("#kpiError").textContent = error.message; }
  };
  $("#addKpi").onclick = () => save({ id: newReviewId(), name: $("#kpiName").value || $("#kpiMetric").value, metric: $("#kpiMetric").value, aggregation: $("#kpiAggregation").value, denominator: $("#kpiDenominator").value, groupBy: $("#kpiGroup").value });
  document.querySelectorAll("[data-suggested-kpi]").forEach(button => button.onclick = () => save({ ...suggestions[Number(button.dataset.suggestedKpi)], id: newReviewId() }));
  document.querySelectorAll("[data-remove-kpi]").forEach(button => button.onclick = () => { applyRuleConfig({ ...exportRuleConfig(), kpis: definitions.filter((_, index) => index !== Number(button.dataset.removeKpi)) }); render(); showKpiEditor(); });
}
function enhanceCapabilityPages() {
  if (!state.headers.length) return;
  const actions = screen.querySelector(".guided-tools,.cleaning-context .workspace-actions");
  if (actions && !$("#businessKpis")) { const button = document.createElement("button"); button.className = "secondary"; button.id = "businessKpis"; button.textContent = "Business KPIs"; button.onclick = showKpiEditor; actions.append(button); }
  if (state.screen === "issues" && state.dependencyFollowUps?.length && screen.querySelector(".review-success")) {
    screen.querySelector(".review-success").insertAdjacentHTML("beforeend", state.dependencyFollowUps.map(id => { const finding = state.issues.find(item => item.id === id && item.status === "open"); return finding ? `<button class="secondary" data-dependency-followup="${id}">Review ${escapeHtml(finding.column)}</button>` : ""; }).join(""));
    document.querySelectorAll("[data-dependency-followup]").forEach(button => button.onclick = () => openIssue(Number(button.dataset.dependencyFollowup)));
  }
  if (state.screen === "data") enhanceRuleSuggestions();
  if (state.screen === "data") enhanceQualityScorecard();
  if (state.screen === "report") {
    state.exportOptions ||= { includeFlags: true, includeMethods: false };
    screen.querySelector(".report-head").insertAdjacentHTML("afterend", `<section class="workspace-card"><h2>Cleaned CSV provenance</h2><label class="check"><input id="exportImputedFlags" type="checkbox" ${state.exportOptions.includeFlags ? "checked" : ""}> Include imputation flags (default)</label><label class="check"><input id="exportImputationMethods" type="checkbox" ${state.exportOptions.includeMethods ? "checked" : ""}> Include imputation method columns</label><p class="review-scope">Flags follow active approved fills; rollback removes their effects. Formula-like text is quoted safely, while valid signed numbers remain numbers. Generated names use a suffix if a source header already exists.</p></section>`);
    $("#exportImputedFlags").onchange = event => { state.exportOptions.includeFlags = event.target.checked; };
    $("#exportImputationMethods").onchange = event => { state.exportOptions.includeMethods = event.target.checked; };
  }
}
function enhanceRuleSuggestions() {
  const store = capabilityStore();
  const activeIds = new Set([...(state.ruleConfig.schema || []), ...(state.ruleConfig.metrics || []), ...(state.ruleConfig.relations || [])].map(rule => rule.id));
  const suggestions = (store.suggestions || []).filter(suggestion => !activeIds.has(suggestion.rule.id));
  screen.insertAdjacentHTML("beforeend", `<section class="workspace-card"><h2>Suggested business checks</h2><p>Definitions are opt-in and tested locally; accepting does not change data.</p>${store.suggestions ? `<details><summary>Review ${suggestions.length} suggestions</summary>${suggestions.map((suggestion, index) => `<article class="saved-rule-list"><h3>${escapeHtml(suggestion.rule.name || suggestion.rule.column)}</h3><p>${escapeHtml(suggestion.note)}</p><small>${(suggestion.passRate * 100).toFixed(1)}% pass · ${suggestion.passed} / ${suggestion.usable} usable rows</small><button class="secondary" data-accept-rule="${index}">Accept definition and run checks</button></article>`).join("") || "<p>No additional supported suggestions.</p>"}</details>` : `<p role="status">${store.suggestionError ? escapeHtml(store.suggestionError) : "Testing candidate definitions…"}</p>`}</section>`);
  if (!store.suggestions && !store.suggestionPending && !store.suggestionError) {
    store.suggestionPending = true;
    analyticalTask("suggestions", "", { options: capabilityOptions() }).then(result => { store.suggestions = result; }).catch(error => { store.suggestionError = error.message; }).finally(() => { store.suggestionPending = false; if (store === capabilityStore() && state.screen === "data") renderPreservingReviewFocus(); });
  }
  document.querySelectorAll("[data-accept-rule]").forEach(button => button.onclick = () => {
    try {
      const suggestion = suggestions[Number(button.dataset.acceptRule)], config = exportRuleConfig();
      config[suggestion.kind] = config[suggestion.kind].filter(rule => suggestion.kind === "schema" ? rule.column !== suggestion.rule.column : suggestion.kind === "metrics" ? rule.target !== suggestion.rule.target : rule.id !== suggestion.rule.id).concat(suggestion.rule);
      config.acceptedSuggestions = [...(config.acceptedSuggestions || []).filter(entry => entry.ruleId !== suggestion.rule.id), { id: suggestion.id, ruleId: suggestion.rule.id, passRate: suggestion.passRate }];
      applyRuleConfig(config); render(); notify("Definition accepted. Review its findings before changing values.");
    } catch (error) { notify(error.message); }
  });
}
function enhanceQualityScorecard() {
  const store = capabilityStore(), table = screen.querySelector(".profile-table"); if (!table) return;
  table.tHead.rows[0].insertAdjacentHTML("beforeend", "<th>Validity</th><th>Consistency</th>");
  [...table.tBodies[0].rows].forEach((row, index) => {
    const result = store.scorecards?.[index];
    row.insertAdjacentHTML("beforeend", `<td>${result ? result.hasRules ? result.validity === null ? "—" : `${result.validity.toFixed(1)}%` : "No rules" : "Calculating…"}</td><td>${result?.consistency === null ? "—" : result ? `${result.consistency.toFixed(1)}%` : "Calculating…"}</td>`);
  });
  if (!store.scorecards && !store.scorecardPending && !store.scorecardError) {
    store.scorecardPending = true;
    analyticalTask("scorecards", "", { params: { rules: state.ruleConfig }, options: capabilityOptions() }).then(result => { store.scorecards = result; }).catch(error => { store.scorecardError = error.message; }).finally(() => { store.scorecardPending = false; if (store === capabilityStore() && state.screen === "data") renderPreservingReviewFocus(); });
  }
}
