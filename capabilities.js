// Business impact, definitions, exports, and Dataset extensions.
let capabilitiesSession = null;
function capabilityStore() {
  const key = JSON.stringify([state.datasetRevision, state.ruleConfig]);
  if (capabilitiesSession?.key !== key) capabilitiesSession = { key, items: new Map() };
  return capabilitiesSession;
}
function capabilityOptions() { return { revision: state.datasetRevision, policies: state.ruleConfig.columns || [], classifications: effectiveClassifications(), kpis: state.ruleConfig.kpis || [] }; }
function capabilityPreviewKey(item, draft) { const { previewFingerprint, note, valueAssessment, ...parameters } = draft; return JSON.stringify([capabilityStore().key, item.id, parameters]); }
function capabilityItem(item) {
  const store = capabilityStore();
  if (!store.items.has(item.id)) store.items.set(item.id, { pending: "", error: "" });
  return store.items.get(item.id);
}
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
  const result = await analyticalTask("business", item.column, { params: { preview: compactCapabilityPreview(guidedPreview(item)), definitions: state.ruleConfig.kpis || [], metrics: state.ruleConfig.metrics || [] }, options: capabilityOptions() });
  if (key !== capabilityPreviewKey(item, draft)) throw new Error("The fix changed. Recompute business impact.");
  data.kpiImpact = result.kpis; data.dependencyImpact = result.dependencies; data.kpiKey = key;
}
function kpiImpactHtml(results) {
  return `<details class="kpi-impact" open><summary>Business KPI impact</summary>${results.map(result => `<section><h4>${escapeHtml(result.definition.name)}</h4><p>${escapeHtml(result.headline)}</p><div class="analysis-table-wrap"><table class="profile-table"><thead><tr><th>Group</th><th>Before</th><th>After</th><th>Δ</th><th>% Δ</th><th>Rank</th><th>Flag</th></tr></thead><tbody>${result.groups.map(group => `<tr><th>${escapeHtml(group.total ? "Total (all records)" : group.key === "unavailable" ? "Unknown (unavailable group)" : group.label)}</th><td>${analyticalNumber(group.before)}</td><td>${analyticalNumber(group.after)}</td><td>${analyticalNumber(group.delta)}</td><td>${group.percentDelta === null ? "Undefined baseline" : `${group.percentDelta.toFixed(2)}%`}</td><td>${group.rankBefore ?? "—"} → ${group.rankAfter ?? "—"}</td><td>${group.flagged ? "Review impact" : "—"}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}</details>`;
}
function showKpiEditor() {
  const definitions = state.ruleConfig.kpis || [], numeric = numericColumns(), suggestions = CapabilitiesEngine.suggestedKpis(state.headers);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><h2>Business KPIs</h2><div class="review-fields"><label>Name<input id="kpiName" maxlength="200"></label>${selectHtml("kpiMetric", "Numeric metric", numeric.map(column => [column, column]), numeric[0])}${selectHtml("kpiAggregation", "Aggregation", [["sum", "Sum"], ["mean", "Mean"], ["median", "Median"], ["count", "Observed count"], ["ratio", "Ratio of column sums"]], "sum")}${selectHtml("kpiDenominator", "Denominator (ratio)", numeric.map(column => [column, column]), numeric[1] || numeric[0])}${selectHtml("kpiGroup", "Group by", [["", "Total only"], ...state.headers.map(column => [column, column])], "")}</div><button class="secondary" id="addKpi">Add KPI</button><div class="saved-rule-list">${definitions.map((definition, index) => `<article><span>${escapeHtml(definition.name)} · ${escapeHtml(definition.aggregation)} ${escapeHtml(definition.metric)}</span><button class="ghost" data-remove-kpi="${index}">Remove</button></article>`).join("")}</div><h3>Suggested KPIs</h3>${suggestions.map((definition, index) => `<p>${escapeHtml(definition.name)} by ${escapeHtml(definition.groupBy)} <button class="secondary" data-suggested-kpi="${index}">Use this KPI</button></p>`).join("") || "<p>No domain defaults match these columns.</p>"}<p id="kpiError" class="workspace-error" role="status"></p><button class="secondary" id="closeKpis">Close</button></div>`;
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
  const actions = screen.querySelector(".dataset-setup .workspace-actions");
  if (state.screen === "data" && actions && !$("#businessKpis")) { const button = document.createElement("button"); button.className = "secondary"; button.id = "businessKpis"; button.textContent = "Business KPIs"; button.onclick = showKpiEditor; actions.append(button); }
  if (state.screen === "data") { enhanceRuleSuggestions(); enhanceQualityScorecard(); }
  if (state.screen === "report") {
    state.exportOptions ||= { includeFlags: true, includeMethods: false };
    screen.querySelector(".report-head").insertAdjacentHTML("afterend", `<section class="workspace-card"><h2>Cleaned CSV provenance</h2><label class="check"><input id="exportImputedFlags" type="checkbox" ${state.exportOptions.includeFlags ? "checked" : ""}> Include imputation flags (default)</label><label class="check"><input id="exportImputationMethods" type="checkbox" ${state.exportOptions.includeMethods ? "checked" : ""}> Include imputation method columns</label><p class="review-scope">Flags follow active approved fills; rollback removes their effects. Formula-like text is quoted safely. Generated names avoid source headers.</p></section>`);
    $("#exportImputedFlags").onchange = event => { state.exportOptions.includeFlags = event.target.checked; };
    $("#exportImputationMethods").onchange = event => { state.exportOptions.includeMethods = event.target.checked; };
  }
}
function enhanceRuleSuggestions() {
  const store = capabilityStore(), activeIds = new Set([...(state.ruleConfig.schema || []), ...(state.ruleConfig.metrics || []), ...(state.ruleConfig.relations || [])].map(rule => rule.id));
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
