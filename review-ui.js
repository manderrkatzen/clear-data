// Shared review controls and Dataset definitions. No sequential review screens.
function renderPreservingReviewFocus() {
  const active = document.activeElement, id = active?.id;
  const start = active?.selectionStart, end = active?.selectionEnd;
  const queue = document.querySelector(".review-issue-list"), top = queue?.scrollTop, left = queue?.scrollLeft;
  render();
  const replacement = id && document.getElementById(id);
  replacement?.focus?.({ preventScroll: true });
  if (typeof start === "number" && replacement?.setSelectionRange && ["text", "search", "textarea"].includes(replacement.type)) replacement.setSelectionRange(start, end);
  const nextQueue = document.querySelector(".review-issue-list");
  if (nextQueue && queue) { nextQueue.scrollTop = top; nextQueue.scrollLeft = left; }
}
function selectHtml(id, label, options, value) {
  return `<label>${label}<select id="${id}">${options.map(([key, name]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`;
}
function currentValueGroups(item) {
  const groups = new Map();
  reviewRows(item).forEach(row => { const value = row[item.column]; if (!groups.has(value)) groups.set(value, []); groups.get(value).push(row._row); });
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}
function reviewDistribution(column, afterRows, classification = null) {
  const identifier = cleaningProfile().columns.find(entry => entry.column === column)?.role === "identifier";
  const source = identifier ? [] : interpretedNumericValues(state.original, column, null, true), working = identifier ? [] : interpretedNumericValues(state.rows, column), proposed = identifier ? [] : interpretedNumericValues(afterRows, column, classification);
  if (!source.length && !working.length && !proposed.length) {
    const series = [["Original", state.original], ["Working", state.rows], ...(afterRows !== state.rows ? [["Proposed", afterRows]] : [])];
    return `<div class="comparison-metrics">${series.map(([name, rows]) => `<div><span>${name}</span><b>${new Set(rows.map(row => row[column]).filter(value => String(value ?? "").trim())).size} labels</b><small>${rows.filter(row => !String(row[column] ?? "").trim()).length} blanks</small></div>`).join("")}</div>`;
  }
  const values = [source, working], names = ["Original source", "Working"];
  if (afterRows !== state.rows) { values.push(proposed); names.push("Proposed"); }
  return analyticalHistogram(AnalysisEngine.histogram(values), names);
}
function cleaningOverviewHtml() {
  if (!state.headers.length) return "";
  const column = state.headers.includes(state.lastReviewedColumn) ? state.lastReviewedColumn : numericColumns()[0] || state.headers[0];
  return `<details class="workspace-card dataset-setup" data-ui="dataset.setup" ${state.datasetSetupOpen ? "open" : ""}><summary>Definitions, business checks & manual corrections</summary><label for="datasetPurpose">Dataset purpose<textarea id="datasetPurpose" maxlength="1000" placeholder="Describe what the dataset measures.">${escapeHtml(state.datasetPurpose || "")}</textarea></label><div class="workspace-actions"><button class="secondary" id="columnPolicies">Column definitions</button><button class="secondary" id="relationshipRules">Business relationships</button><button class="secondary" id="datasetSchema">Schema / metric rules</button><button class="secondary" id="datasetDuplicates">Duplicate keys</button><button class="secondary" id="manualCorrection">Manual correction</button></div><button class="ghost" id="refreshInterpretation">Refresh AI analysis</button></details><section class="workspace-card cumulative-view"><div class="workspace-heading"><h2>Working distribution</h2><label>Column<select id="cumulativeColumn">${columnOptions(column)}</select></label></div>${reviewDistribution(column, state.rows)}</section>`;
}
function bindCleaningOverview() {
  if (typeof ReviewCore !== "undefined") ReviewCore.bindDatasetSettings();
  document.querySelector('[data-ui="dataset.setup"]')?.addEventListener("toggle", event => { if (event.target.isConnected) state.datasetSetupOpen = event.target.open; });
  $("#datasetPurpose")?.addEventListener("input", event => {
    state.datasetPurpose = event.target.value; state.interpretations = {}; cancelAutomaticReview(false);
    state.analysisStatus = "stale"; state.analysisMessage = "Dataset context changed. Refresh AI analysis to use it."; markProjectDirty();
  });
  $("#columnPolicies")?.addEventListener("click", () => showColumnPolicies());
  $("#relationshipRules")?.addEventListener("click", showRelationshipRules);
  $("#datasetSchema")?.addEventListener("click", showRuleEditor);
  $("#datasetDuplicates")?.addEventListener("click", configureDuplicates);
  $("#manualCorrection")?.addEventListener("click", showManualCorrection);
  $("#refreshInterpretation")?.addEventListener("click", () => startAutomaticReview());
  $("#cumulativeColumn")?.addEventListener("change", event => { state.lastReviewedColumn = event.target.value; render(); });
}
function showColumnPolicies(selectedColumn = state.headers[0]) {
  if (!state.headers.includes(selectedColumn)) selectedColumn = state.headers[0];
  const policy = columnPolicy(selectedColumn);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><h2>Column meaning and parsing policy</h2><p>Definitions change checks, not stored values.</p><div class="review-fields">${selectHtml("policyColumn", "Column", state.headers.map(column => [column, column]), selectedColumn)}${selectHtml("policyRole", "Analytical role", ["auto", "identifier", "number", "integer", "text", "category", "date", "boolean"].map(role => [role, role]), policy.role)}<label>Meaning / units<input id="policyMeaning" maxlength="300" value="${escapeHtml(policy.meaning)}"></label><label class="wide-field">Declared missing tokens (one per line)<textarea id="policyMissingTokens">${escapeHtml(policy.missingTokens.join("\n"))}</textarea><small>Comparison ignores surrounding whitespace and case. Zero is missing only if explicitly included.</small></label>${selectHtml("policyNumberFormat", "Number parsing", [["plain", "Plain decimal / exponent"], ["decimalPoint", "1,234.56"], ["decimalComma", "1.234,56"]], policy.numberFormat)}<label>Default decimal places<input id="policyDecimals" type="number" min="0" max="12" value="${policy.decimals}"></label><label class="check"><input id="policyCurrency" type="checkbox" ${policy.currency ? "checked" : ""}> Allow a currency symbol</label><label class="check"><input id="policyPercentage" type="checkbox" ${policy.percentage ? "checked" : ""}> Convert explicit % to decimals</label>${selectHtml("policyDateFormat", "Date interpretation", [["iso", "YYYY-MM-DD"], ["mdy", "Month / day / year"], ["dmy", "Day / month / year"], ["excel", "Excel 1900 serial"]], policy.dateFormat)}</div><p id="policyError" class="workspace-error" role="status"></p><div class="dialog-actions"><button class="secondary" id="closePolicy">Cancel</button><button class="primary" id="savePolicy">Save definition</button></div></div>`;
  $("#confirmDialog").showModal(); $("#policyColumn").onchange = event => showColumnPolicies(event.target.value);
  $("#closePolicy").onclick = () => $("#confirmDialog").close();
  $("#savePolicy").onclick = () => {
    try {
      const definition = { column: selectedColumn, role: $("#policyRole").value, meaning: $("#policyMeaning").value, missingTokens: $("#policyMissingTokens").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), numberFormat: $("#policyNumberFormat").value, decimals: Number($("#policyDecimals").value), currency: $("#policyCurrency").checked, percentage: $("#policyPercentage").checked, dateFormat: $("#policyDateFormat").value };
      applyRuleConfig({ ...exportRuleConfig(), columns: [...(state.ruleConfig.columns || []).filter(entry => entry.column !== selectedColumn), definition] });
      $("#confirmDialog").close(); render(); notify("Definition saved. Data values are unchanged.");
    } catch (error) { $("#policyError").textContent = error.message; }
  };
}
function showRelationshipRules() {
  const rules = state.ruleConfig.relations || [], options = state.headers.map(column => [column, column]);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><h2>Relationships and conditional requirements</h2><div class="review-fields"><label>Rule name<input id="relationName" maxlength="200"></label>${selectHtml("relationKind", "Check", [["comparison", "Compare two fields"], ["requiredIf", "Require a field when another matches"]], "comparison")}${selectHtml("relationColumn", "Finding / required field", options, state.headers[0])}${selectHtml("relationLeft", "Left / trigger field", options, state.headers[0])}${selectHtml("relationRight", "Right comparison field", options, state.headers[1] || state.headers[0])}${selectHtml("relationOperator", "Comparison operator", [[">=", ">="], [">", ">"], ["<=", "<="], ["<", "<"], ["=", "="], ["!=", "!="]], ">=")}${selectHtml("relationType", "Comparison type", [["number", "Numerical"], ["date", "Valid ISO dates"], ["text", "Exact text"]], "number")}<label>Conditional trigger value<input id="relationValue"></label></div><p id="relationError" class="workspace-error" role="status"></p><button class="primary" id="addRelationship">Add relationship check</button><div class="saved-rule-list">${rules.map((rule, index) => `<article><span><b>${escapeHtml(rule.name)}</b> · ${rule.kind === "requiredIf" ? `${escapeHtml(rule.column)} required when ${escapeHtml(rule.left)} = ${escapeHtml(rule.value)}` : `${escapeHtml(rule.left)} ${escapeHtml(rule.operator)} ${escapeHtml(rule.right)}`}</span><button class="ghost" data-remove-relation="${index}">Remove</button></article>`).join("")}</div><button class="secondary" id="closeRelationships">Close</button></div>`;
  $("#confirmDialog").showModal(); $("#closeRelationships").onclick = () => $("#confirmDialog").close();
  $("#addRelationship").onclick = () => {
    try {
      const rule = { id: newReviewId(), name: $("#relationName").value, column: $("#relationColumn").value, left: $("#relationLeft").value, right: $("#relationRight").value, kind: $("#relationKind").value, operator: $("#relationOperator").value, comparisonType: $("#relationType").value, value: $("#relationValue").value };
      applyRuleConfig({ ...exportRuleConfig(), relations: [...rules, rule] }); render(); showRelationshipRules();
    } catch (error) { $("#relationError").textContent = error.message; }
  };
  document.querySelectorAll("[data-remove-relation]").forEach(button => button.onclick = () => { applyRuleConfig({ ...exportRuleConfig(), relations: rules.filter((_, index) => index !== Number(button.dataset.removeRelation)) }); render(); showRelationshipRules(); });
}
function showManualCorrection() {
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><h2>Manual correction</h2><p>Select a column and source rows, then check and approve the fix.</p><div class="review-fields">${selectHtml("manualColumn", "Column", state.headers.map(column => [column, column]), state.headers[0])}<label>Source row IDs<input id="manualRowIds" placeholder="e.g. 3, 5, 9; blank means all working rows"></label></div><p id="manualError" class="workspace-error" role="status"></p><div class="dialog-actions"><button class="secondary" id="cancelManual">Cancel</button><button class="primary" id="beginManual">Begin correction review</button></div></div>`;
  $("#confirmDialog").showModal(); $("#cancelManual").onclick = () => $("#confirmDialog").close();
  $("#beginManual").onclick = () => {
    try {
      const raw = $("#manualRowIds").value.trim(), ids = raw ? raw.split(/[\s,]+/).map(Number) : state.rows.map(row => row._row);
      if (!ids.length || ids.some(id => !Number.isInteger(id) || !state.rows.some(row => row._row === id))) throw new Error("Choose valid source row IDs present in the working data.");
      const column = $("#manualColumn").value;
      const item = issue(Math.max(0, ...state.issues.map(item => item.id)) + 1, column, "Manual correction", `Manual correction: ${column}`, state.rows.filter(row => ids.includes(row._row)), "medium", "Analyst-selected records. No value changes until approval.", "manual");
      state.issues.push(item); $("#confirmDialog").close(); openIssue(item.id);
    } catch (error) { $("#manualError").textContent = error.message; }
  };
}
function decorateDecisionHistory() {
  document.querySelectorAll(".change-card").forEach((card, index) => {
    const change = state.changes[index]; if (!change?.interpretation || !card.insertAdjacentHTML) return;
    card.insertAdjacentHTML("beforeend", `<p class="decision-interpretation"><b>Analyst interpretation:</b> ${escapeHtml(change.interpretation.replaceAll("_", " "))} · <b>Scope:</b> ${change.rows.length} reviewed source records. ${change.treatment?.scope?.mode === "condition" ? `Condition: ${escapeHtml(change.treatment.scope.column)} ${escapeHtml(change.treatment.scope.operator)} ${escapeHtml(change.treatment.scope.value)}.` : ""}</p>`);
    if (typeof analyticalFillMetadataHtml === "function" && change.treatment?.fillMetadata) card.insertAdjacentHTML("beforeend", analyticalFillMetadataHtml(change.treatment.fillMetadata, true));
  });
}
function enhanceDatasetScreen() {
  screen.querySelectorAll?.(".profile-table tbody tr").forEach((row, index) => {
    const column = state.headers[index], metadata = row.cells[1]?.querySelector("small");
    const declared = columnPolicy(column).role !== "auto" || state.ruleConfig.schema.some(rule => rule.column === column && rule.type !== "any");
    if (metadata) metadata.textContent = declared ? "declared" : "inferred";
  });
  const empty = screen.querySelector?.(".empty-state:not(.sample-picker)"); if (!empty) return;
  const heading = empty.querySelector("h1"), description = empty.querySelector("p:not(.eyebrow):not(.ai-status)");
  if (heading) heading.textContent = "Import a dataset";
  if (description) description.textContent = "Open a CSV or choose a sample dataset.";
}
