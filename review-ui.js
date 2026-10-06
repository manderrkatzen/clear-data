// A focused, five-step workspace rather than an expanding wall of controls.
function renderPreservingReviewFocus() {
  const active = document.activeElement;
  const id = active?.id, start = active?.selectionStart, end = active?.selectionEnd;
  render();
  if (id) {
    const replacement = document.getElementById?.(id);
    replacement?.focus({ preventScroll: true });
    if (typeof start === "number" && replacement?.setSelectionRange && ["text", "search", "textarea"].includes(replacement.type)) replacement.setSelectionRange(start, end);
  }
}
function analysisBanner() {
  const running = ["profiling", "running"].includes(state.analysisStatus);
  return `<section class="analysis-banner ${running ? "is-running" : ""}" aria-live="polite"><div><b>${running ? "AI interpretation in progress" : state.analysisStatus === "complete" ? "AI suggestions ready" : "AI-assisted interpretation"}</b><p>${escapeHtml(state.analysisMessage || "Candidate evidence is calculated locally. AI ranks interpretations; you finalize every solution.")}</p>${state.analysisTotal ? `<small>${state.analysisCompleted} / ${state.analysisTotal} findings interpreted</small>` : ""}</div><button class="${running ? "ghost" : "secondary"}" id="${running ? "cancelInterpretation" : "refreshInterpretation"}">${running ? "Cancel AI review" : "Refresh AI analysis"}</button></section>`;
}
function bindAnalysisTools() {
  $("#cancelInterpretation")?.addEventListener("click", () => cancelAutomaticReview());
  $("#refreshInterpretation")?.addEventListener("click", () => startAutomaticReview());
}
function cleaningOverviewHtml() {
  if (!state.headers.length) return "";
  const column = state.headers.includes(state.lastReviewedColumn) ? state.lastReviewedColumn : numericColumns()[0] || state.headers[0];
  return `${analysisBanner()}<section class="workspace-card cleaning-context"><div class="workspace-heading"><div><h2>Dataset context</h2><p>Describe the dataset to improve AI suggestions.</p></div></div><label for="datasetPurpose">Dataset purpose<textarea id="datasetPurpose" maxlength="1000" placeholder="For example: patient visits; a blank discharge date means the patient is still admitted.">${escapeHtml(state.datasetPurpose || "")}</textarea></label><div class="workspace-actions"><button class="secondary" id="columnPolicies">Column definitions</button><button class="secondary" id="relationshipRules">Business relationships</button><button class="secondary" id="manualCorrection">Review a manual correction</button></div></section><section class="workspace-card cumulative-view"><div class="workspace-heading"><div><h2>Working distribution</h2><p>Compare original and working values.</p></div><label>Column<select id="cumulativeColumn">${columnOptions(column)}</select></label></div>${reviewDistribution(column, state.rows)}</section>`;
}
function bindCleaningOverview() {
  bindAnalysisTools();
  $("#datasetPurpose")?.addEventListener("input", event => {
    state.datasetPurpose = event.target.value; state.interpretations = {};
    cancelAutomaticReview(false); state.analysisStatus = "stale";
    state.analysisMessage = "Dataset context changed. Refresh AI analysis to use it."; markProjectDirty();
  });
  $("#datasetPurpose")?.addEventListener("change", () => renderPreservingReviewFocus());
  $("#columnPolicies")?.addEventListener("click", () => showColumnPolicies());
  $("#relationshipRules")?.addEventListener("click", showRelationshipRules);
  $("#manualCorrection")?.addEventListener("click", showManualCorrection);
  $("#cumulativeColumn")?.addEventListener("change", event => { state.lastReviewedColumn = event.target.value; render(); });
}
function reviewDistribution(column, afterRows, classification = null) {
  const selected = state.issues.find(item => item.id === state.selectedIssue && item.column === column);
  if (!classification && selected && afterRows !== state.rows && state.reviewStep >= 4) {
    const preview = guidedPreview(selected);
    classification = preview.classification;
  }
  const isIdentifier = cleaningProfile().columns.find(profile => profile.column === column)?.role === "identifier";
  const source = isIdentifier ? [] : interpretedNumericValues(state.original, column, null, true), working = isIdentifier ? [] : interpretedNumericValues(state.rows, column), after = isIdentifier ? [] : interpretedNumericValues(afterRows, column, classification);
  const countBlanks = rows => rows.filter(row => !String(row[column] ?? "").trim()).length;
  const series = [{ name: "Original", legend: "Original source", className: "source", values: source, rows: state.original }, { name: "Working", legend: "Cumulative working", className: "working", values: working, rows: state.rows }];
  if (afterRows !== state.rows) series.push({ name: "Preview", legend: "Proposed preview", className: "proposed", values: after, rows: afterRows });
  if (!source.length && !working.length && !after.length) {
    const distinct = rows => new Set(rows.map(row => row[column]).filter(value => String(value ?? "").trim())).size;
    return `<div class="comparison-metrics">${series.map(entry => `<div><span>${entry.name}</span><b>${distinct(entry.rows)} labels</b><small>${countBlanks(entry.rows)} blanks</small></div>`).join("")}</div>`;
  }
  const range = CleaningEngine.stats(series.flatMap(entry => entry.values)), min = range.min, max = range.max;
  const bins = values => { const counts = Array(18).fill(0); values.forEach(value => counts[Math.min(17, Math.floor((value - min) / (max - min || 1) * 18))]++); return counts; };
  const sets = series.map(entry => bins(entry.values)), scale = Math.max(1, ...sets.flat());
  const format = value => value === null ? "—" : value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  const metrics = series.map(entry => { const stats = CleaningEngine.stats(entry.values); return `<div><span>${entry.name}</span><b>Median ${format(stats.median)}</b><small>Mean ${format(stats.mean)} · ${entry.values.length} parsed values</small></div>`; }).join("");
  return `<div class="review-distribution"><div class="chart-legend">${series.map(entry => `<span class="${entry.className}">${entry.legend}</span>`).join("")}</div><div class="distribution-bars" role="img" aria-label="${series.map(entry => entry.name).join(", ")} distributions of ${escapeHtml(column)}">${sets[0].map((_, index) => `<div>${sets.map((counts, seriesIndex) => `<i class="${series[seriesIndex].className}" style="height:${counts[index] / scale * 100}%" title="${series[seriesIndex].name}: ${counts[index]} values"></i>`).join("")}</div>`).join("")}</div><div class="distribution-axis"><span>${format(min)}</span><span>${escapeHtml(column)}</span><span>${format(max)}</span></div><div class="comparison-metrics">${metrics}</div><p class="review-scope">Common bins and count scale. Unparsed text is not zero. Blanks: ${series.map(entry => `${entry.name.toLowerCase()} ${countBlanks(entry.rows)}`).join(", ")}.</p></div>`;
}
function renderGuidedIssues() {
  $("#topEyebrow").textContent = "GUIDED CLEANING REVIEW";
  const open = state.issues.filter(item => item.status === "open"), search = (state.reviewSearch || "").toLowerCase();
  const kinds = [...new Set(open.map(item => item.candidate?.kind || item.recommendation))];
  const visible = open.filter(item => (!search || `${item.column} ${item.label} ${item.type}`.toLowerCase().includes(search)) && (!state.reviewKind || state.reviewKind === "all" || (item.candidate?.kind || item.recommendation) === state.reviewKind));
  const selected = open.find(item => item.id === state.selectedIssue);
  const rank = item => state.interpretations?.[analysisCandidateId(item)]?.interpretations?.[0]?.score ?? item.candidate?.score ?? (item.severity === "high" ? .7 : .4);
  visible.sort((a, b) => rank(b) - rank(a) || a.id - b.id);
  screen.innerHTML = `<section class="page-head compact"><div><h1>Review findings</h1></div></section>${state.reviewResult ? `<div class="review-success" role="status">${escapeHtml(state.reviewResult)}<button class="ghost" id="dismissReviewResult">Dismiss</button></div>` : ""}${analysisBanner()}<div class="guided-tools"><button class="secondary" id="guidedPolicies">Column definitions</button><button class="secondary" id="guidedRelations">Business relationships</button><button class="secondary" id="guidedSchema">Schema / metric rules</button><button class="secondary" id="guidedDuplicates">Duplicate keys</button><button class="secondary" id="guidedManual">Manual correction</button><button class="ghost" id="guidedContext">Dataset context →</button></div><section class="guided-layout"><aside class="candidate-queue" aria-label="Findings queue"><header><h2>${open.length} open findings</h2><small>Sorted by recommendation rank; scores do not establish correctness.</small><input id="reviewSearch" type="search" aria-label="Search findings" placeholder="Search columns or findings" value="${escapeHtml(state.reviewSearch || "")}"><select id="reviewKind" aria-label="Filter finding type"><option value="all">All finding types</option>${kinds.map(kind => `<option value="${escapeHtml(kind)}" ${state.reviewKind === kind ? "selected" : ""}>${escapeHtml(kind.replaceAll("_", " "))}</option>`).join("")}</select></header><div class="candidate-list">${visible.map(item => `<button class="candidate-button ${selected?.id === item.id ? "active" : ""}" data-guided-issue="${item.id}" aria-pressed="${selected?.id === item.id}"><span>${escapeHtml(item.column)}</span><b>${escapeHtml(item.label)}</b><small>${reviewRows(item).length.toLocaleString()} records · ${state.interpretations?.[analysisCandidateId(item)] ? "AI alternatives ready" : "Local evidence"}</small></button>`).join("") || '<p class="review-scope">No findings match this filter.</p>'}</div><details class="review-closed"><summary>${state.issues.length - open.length} closed findings</summary><p>Inspect decisions or roll them back in Changes.</p><button class="secondary" id="guidedHistory">Open Changes</button></details></aside><div class="guided-workspace">${selected ? guidedWorkspaceHtml(selected) : `<section class="guided-empty"><h2>${open.length ? "Choose a finding to begin" : "No open findings from the current checks"}</h2>${open.length ? `<button class="primary" data-guided-issue="${visible[0]?.id || open[0].id}">Review first finding →</button>` : '<button class="primary" id="guidedView">Inspect working data</button>'}</section>`}</div></section>`;
  const toolbar = screen.querySelector?.(".guided-tools");
  if (toolbar) {
    const details = document.createElement("details"), summary = document.createElement("summary");
    details.className = "guided-setup"; summary.textContent = "Definitions, business checks & manual corrections";
    toolbar.before(details); details.append(summary, toolbar);
  }
  const findingTitle = screen.querySelector?.(".guided-heading h2"), metadata = screen.querySelector?.(".guided-column");
  if (findingTitle && metadata) findingTitle.after(metadata);
  const interpretationTitle = screen.querySelector?.(".interpretation-top h3"), attribution = screen.querySelector?.(".interpretation-top .ai-label");
  if (interpretationTitle && attribution) interpretationTitle.after(attribution);
  if (selected?.recommendation === "outlier" && state.reviewStep === 1) {
    const stage = screen.querySelector(".guided-stage"), records = stage.querySelector(".evidence-records");
    const details = document.createElement("details"), summary = document.createElement("summary"), plot = document.createElement("div");
    details.className = "evidence-records"; summary.textContent = "Inspect numerical relationships";
    plot.innerHTML = scatterChart(selected); details.append(summary, plot);
    if (records) records.before(details); else stage.append(details);
  }
  bindGuidedUI(selected);
}
function guidedWorkspaceHtml(item) {
  const step = state.reviewStep || 1;
  let content = "";
  if (step === 1) content = guidedEvidenceHtml(item);
  if (step === 2) content = guidedInterpretationHtml(item);
  if (step === 3) content = guidedTreatmentHtml(item);
  if (step >= 4) {
    try { content = guidedPreviewHtml(item, guidedPreview(item), step === 5); }
    catch (error) { content = `<div class="workspace-error" role="alert">${escapeHtml(error.message)}<p>Return to treatment and correct the definition. No values have changed.</p></div>`; }
  }
  content = content.replace(/^<p class="eyebrow">[^<]*<\/p>/, "");
  return `<section class="guided-card"><header class="guided-heading"><div><p class="guided-column">${escapeHtml(item.column)} · ${reviewRows(item).length.toLocaleString()} matching records</p><h2>${escapeHtml(item.label)}</h2></div><button class="ghost" id="guidedDefer">Leave open</button></header><nav class="review-stepper" aria-label="Review steps">${reviewSteps.map((label, index) => `<button data-review-step="${index + 1}" ${index + 1 === step ? 'aria-current="step"' : ""}><span>${index + 1}</span>${label}</button>`).join("")}</nav><div class="guided-stage" data-current-step="${step}">${content}</div><footer class="guided-footer"><button class="secondary" id="reviewBack" ${step === 1 ? "disabled" : ""}>← Back</button><span>Step ${step} of 5</span>${step < 5 ? `<button class="primary" id="reviewNext">${step === 4 ? "Review approval →" : "Continue →"}</button>` : '<button class="primary" id="approveGuided">Approve this decision</button>'}</footer></section>`;
}
function currentValueGroups(item) {
  const groups = new Map();
  reviewRows(item).forEach(row => { const value = row[item.column]; if (!groups.has(value)) groups.set(value, []); groups.get(value).push(row._row); });
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}
function guidedEvidenceHtml(item) {
  const groups = currentValueGroups(item);
  return `<h3>Finding details</h3><p>${escapeHtml(item.summary)}</p>${item.recommendation === "outlier" ? outlierControls(item) : ""}${item.recommendation === "duplicates" ? guidedDuplicateDefinitionHtml() : ""}<div class="candidate-value-groups">${groups.slice(0, 30).map(([value, rowIds], index) => `<article><code>${String(value ?? "").trim() ? escapeHtml(value) : "(blank)"}</code><span>${rowIds.length} records</span><button class="ghost" data-value-group="${index}">Scope to this group</button></article>`).join("")}</div>${groups.length > 30 ? `<p class="review-scope">Showing 30 of ${groups.length} representations. The full matching set remains available in treatment scope.</p>` : ""}${item.rule ? `<div class="evidence">${reviewRows(item).slice(0, 5).map(row => `Row ${row._row}: ${escapeHtml(item.recommendation === "relation" ? relationProblem(row, item.rule) : ruleEvidence(item, row))}`).join("<br>")}</div>` : ""}${reviewDistribution(item.column, state.rows)}<details class="evidence-records"><summary>Inspect matching source records</summary>${guidedRecordsHtml(item, reviewRows(item).slice(0, 100))}</details>`;
}
function guidedInterpretationHtml(item) {
  const draft = reviewDraft(item), analysis = state.interpretations?.[analysisCandidateId(item)], top = analysis?.interpretations?.[0];
  return `<h3>Interpretation</h3>${analysis ? `<div class="interpretation-top"><span class="ai-label">AI suggestion · ${escapeHtml(analysis.provider || "configured provider")}</span><h3>${escapeHtml(top.meaning.replaceAll("_", " "))}</h3><span class="confidence-badge">${escapeHtml(top.confidence)} model confidence</span><p>${escapeHtml(top.explanation)}</p>${top.assumptions.length ? `<ul>${top.assumptions.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}<small>Rank ${top.score.toFixed(2)} · model-assessed, not a calibrated probability · highest-ranked shown first</small></div><details class="ai-alternatives"><summary>Compare ${Math.max(0, analysis.interpretations.length - 1)} alternative interpretations</summary>${analysis.interpretations.slice(1).map(suggestion => `<article><b>${escapeHtml(suggestion.meaning.replaceAll("_", " "))}</b><span>${escapeHtml(suggestion.confidence)} confidence · rank ${suggestion.score.toFixed(2)}</span><p>${escapeHtml(suggestion.explanation)}</p></article>`).join("")}</details>` : `<div class="evidence"><b>${["running", "profiling"].includes(state.analysisStatus) ? "AI analysis is in progress" : "No AI interpretation is available"}</b><p>Choose an interpretation from the evidence, or request AI analysis.</p></div>`}<fieldset class="interpretation-choice"><legend>Your interpretation of the scoped records</legend>${interpretationOptions(item).map(option => `<label><input name="reviewInterpretation" type="radio" value="${option.meaning}" ${draft.interpretation === option.meaning ? "checked" : ""}>${option.label}</label>`).join("")}</fieldset><p class="review-scope">For records with different meanings, narrow the treatment scope.</p><details class="ai-followup"><summary>Ask the copilot about this finding</summary><label for="reviewQuestion">Question<input id="reviewQuestion" maxlength="220" placeholder="Could zero be legitimate for a particular subgroup?"></label><button class="secondary" id="askReviewQuestion">Ask for an interpretation</button></details>`;
}
function guidedDuplicateDefinitionHtml() {
  const definition = state.ruleConfig.duplicates || { mode: "exact", columns: state.headers };
  return `<div class="review-fields"><label>Comparison<select id="guidedDuplicateMode"><option value="exact" ${definition.mode === "exact" ? "selected" : ""}>Exact full-row match</option><option value="key" ${definition.mode === "key" ? "selected" : ""}>Composite business key</option></select></label></div>${definition.mode === "key" ? `<fieldset class="guided-key-columns"><legend>Business key fields (exact, case-sensitive)</legend>${state.headers.map((column, index) => `<label><input type="checkbox" data-guided-key="${index}" ${definition.columns.includes(column) ? "checked" : ""}>${escapeHtml(column)}</label>`).join("")}</fieldset>` : ""}`;
}
function selectHtml(id, label, options, value) { return `<label>${label}<select id="${id}">${options.map(([key, name]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`; }
function guidedTreatmentHtml(item) {
  const draft = reviewDraft(item), fieldOptions = state.headers.map(column => [column, column]);
  let fields = "";
  if (draft.operation === "constant") fields += `<label>Replacement value<input id="reviewValue" value="${escapeHtml(draft.value)}" placeholder="Exact replacement; blank is allowed"></label>`;
  if (["mean", "median", "groupMedian", "parseNumber", "scale", "cap"].includes(draft.operation)) fields += `<label>Decimal places<input id="reviewDecimals" type="number" min="0" max="12" value="${draft.decimals}"></label>`;
  if (draft.operation === "scale") fields += `<label>Conversion factor<input id="reviewFactor" value="${escapeHtml(draft.factor)}" placeholder="0.01 for whole percentages → decimals"><small>Every scoped value is multiplied by this explicit factor. Source units are not guessed.</small></label>`;
  if (draft.operation === "groupMedian") fields += selectHtml("reviewGroupColumn", "Group by", fieldOptions.filter(([column]) => column !== item.column), draft.groupColumn);
  if (draft.operation === "parseNumber") fields += `${selectHtml("reviewNumberFormat", "Number format", [["plain", "Plain decimal / exponent"], ["decimalPoint", "1,234.56 (decimal point)"], ["decimalComma", "1.234,56 (decimal comma)"]], draft.numberFormat)}<label class="check"><input id="reviewCurrency" type="checkbox" ${draft.currency ? "checked" : ""}> Allow a leading currency symbol</label><label class="check"><input id="reviewPercentage" type="checkbox" ${draft.percentage ? "checked" : ""}> Convert explicit % values to decimals</label>`;
  if (draft.operation === "parseDate") fields += selectHtml("reviewDateFormat", "Interpret source dates as", [["iso", "YYYY-MM-DD"], ["mdy", "Month / day / year"], ["dmy", "Day / month / year"], ["excel", "Excel 1900 date serial"]], draft.dateFormat);
  if (draft.operation === "cap") fields += `<label>Lower business bound<input id="reviewLower" value="${escapeHtml(draft.lower)}" placeholder="Unbounded"></label><label>Upper business bound<input id="reviewUpper" value="${escapeHtml(draft.upper)}" placeholder="Unbounded"></label>`;
  if (["deduplicate", "mergeDuplicates"].includes(draft.operation)) fields += `${selectHtml("reviewSurvivor", "Keep which record in each group?", [["first", "Earliest source record"], ["last", "Latest source record"], ["complete", "Most complete record (earliest breaks ties)"], ["selected", "Manually selected row IDs"]], draft.survivor)}${draft.survivor === "selected" ? `<label>One survivor source row ID per group<input id="reviewSurvivorIds" value="${draft.survivorIds.join(", ")}" placeholder="e.g. 2, 7, 19"></label>` : ""}<label class="check"><input id="reviewConflictAck" type="checkbox" ${draft.acknowledgeConflicts ? "checked" : ""}> I reviewed conflicting non-key values and confirm this survivor policy.</label><p class="review-scope">Merging fills only blank survivor fields when the group has one distinct nonblank value. Conflicting values are not automatically reconciled.</p>`;
  if (draft.operation === "map") {
    const groups = currentValueGroups(item);
    fields += `<div class="mapping-editor"><h4>Exact source → target mapping</h4>${groups.slice(0, 200).map(([value, rowIds], index) => `<label><span><code>${escapeHtml(value)}</code><small>${rowIds.length} records</small></span><input data-review-map="${index}" value="${escapeHtml(Object.hasOwn(draft.mapping, value) ? draft.mapping[value] : value)}" aria-label="Map ${escapeHtml(value)}"></label>`).join("")}${groups.length > 200 ? '<p class="workspace-error">Narrow the scope to at most 200 labels before mapping.</p>' : ""}</div>`;
  }
  const scopedRows = draft.scope.mode === "selected" ? `<label>Source row IDs<input id="reviewRowIds" value="${draft.scope.rowIds.join(", ")}" placeholder="e.g. 3, 5, 9"></label>` : draft.scope.mode === "condition" ? `${selectHtml("reviewScopeColumn", "Condition field", fieldOptions, draft.scope.column)}${selectHtml("reviewScopeOperator", "Operator", [["=", "Exact equals"], ["!=", "Not equal"], ["contains", "Contains"], [">", ">"], [">=", ">="], ["<", "<"], ["<=", "<="]], draft.scope.operator)}<label>Condition value<input id="reviewScopeValue" value="${escapeHtml(draft.scope.value)}"></label>` : "";
  return `<p class="eyebrow">3 · CHOOSE THE SOLUTION AND ITS SCOPE</p><h3>Your interpretation: ${escapeHtml(draft.interpretation.replaceAll("_", " "))}</h3><div class="review-fields">${selectHtml("reviewOperation", "Treatment", reviewOperations(item).map(operation => [operation, treatmentLabel(operation)]), draft.operation)}${fields}</div><section class="treatment-scope"><h3>Apply only to these matching records</h3><div class="review-fields">${selectHtml("reviewScopeMode", "Treatment scope", [["all", "All records belonging to this finding"], ["selected", "Selected source row IDs"], ["condition", "Records matching a condition"]], draft.scope.mode)}${scopedRows}</div><p class="review-scope">Scope changes which records are treated. It is separate from inspection filters. Records outside this finding cannot be silently included.</p></section>${["mean", "median", "groupMedian"].includes(draft.operation) ? '<p class="evidence">Estimates use observed values outside the treatment scope, excluding declared missing tokens. Unconfirmed zero/sentinel values remain observed. Groups without reference values are blocked, not assigned zero.</p>' : ""}${draft.operation === "missing" ? '<p class="evidence">Normalizing to blank consolidates selected representations. The interpretation and original values remain in the decision history; newly missing values still need a separate treatment decision.</p>' : ""}${draft.operation === "remove" ? '<p class="workspace-error">This removes whole records from the working dataset, not just the selected cells. Review the exact rows in the next step.</p>' : ""}`;
}
function guidedRecordsHtml(item, rows, patches = []) {
  const patchMap = new Map(patches.filter(patch => patch.column === item.column).map(patch => [patch.rowId, patch.after]));
  const columns = item.recommendation === "duplicates" ? state.headers : [...new Set([item.column, ...state.headers.filter(column => CleaningEngine.isIdentifier(column)).slice(0, 2), item.rule?.left, item.rule?.right].filter(column => state.headers.includes(column)))];
  return `<div class="guided-table-wrap"><table class="guided-record-table"><thead><tr><th>Source row</th>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}${patches.length ? "<th>Proposed value</th>" : ""}<th>Inspect</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row._row}</td>${columns.map(column => `<td>${String(row[column]).trim() ? escapeHtml(row[column]) : '<span class="cell-empty">Blank</span>'}</td>`).join("")}${patches.length ? `<td>${String(patchMap.get(row._row) ?? row[item.column]).trim() ? escapeHtml(patchMap.get(row._row) ?? row[item.column]) : '<span class="cell-empty">Blank</span>'}</td>` : ""}<td><button class="ghost" data-guided-locate="${row._row}">View row</button></td></tr>`).join("")}</tbody></table></div>`;
}
function guidedPreviewHtml(item, preview, approving) {
  const draft = reviewDraft(item), selectedRows = state.rows.filter(row => preview.selectedIds.includes(row._row));
  return `<p class="eyebrow">${approving ? "5 · FINALIZE YOUR REVIEWED DECISION" : "4 · CHECK THE EXACT IMPACT"}</p><h3>${escapeHtml(treatmentLabel(draft.operation))}</h3><div class="preview-summary"><div><b>${preview.selectedIds.length}</b><span>scoped records</span></div><div><b>${preview.patches.length}</b><span>cells changing</span></div><div><b>${preview.removedRows.length}</b><span>whole rows removed</span></div><div><b>${preview.blocked.length}</b><span>blocked records</span></div></div>${preview.blocked.length ? `<section class="preview-exceptions"><h4>Exceptions that cannot be treated</h4><ul>${preview.blocked.slice(0, 30).map(entry => `<li>Row ${entry.rowId}: ${escapeHtml(entry.reason)}</li>`).join("")}</ul><label class="check"><input id="reviewSkipBlocked" type="checkbox" ${draft.skipBlocked ? "checked" : ""}> Approve only the valid subset; leave all blocked records unresolved.</label></section>` : ""}${preview.constraints.length ? `<section class="preview-exceptions"><h4>This proposal introduces constraint violations</h4><ul>${preview.constraints.slice(0, 30).map(entry => `<li>Row ${entry.rowId}, ${escapeHtml(entry.column)}: ${escapeHtml(entry.reason)}</li>`).join("")}</ul><label class="check"><input id="reviewConstraintAck" type="checkbox" ${draft.acknowledgeConstraints ? "checked" : ""}> I reviewed these violations and explicitly accept this treatment.</label></section>` : '<p class="review-scope">No new violations of the configured schema or relationship rules were found in changed rows.</p>'}${preview.patches.some(patch => patch.column !== item.column) ? `<details><summary>All merged value patches</summary><ul>${preview.patches.slice(0, 100).map(patch => `<li>Row ${patch.rowId}, ${escapeHtml(patch.column)}: ${escapeHtml(patch.before) || "Blank"} → ${escapeHtml(patch.after)}</li>`).join("")}</ul></details>` : ""}${reviewDistribution(item.column, preview.after)}<h4>Exact record-level preview</h4>${guidedRecordsHtml(item, selectedRows.slice(0, 100), preview.patches)}${selectedRows.length > 100 ? `<p class="review-scope">Showing the first 100 scoped records. Counts and approval cover all ${selectedRows.length} scoped records.</p>` : ""}${approving ? `<label class="approval-note">Your rationale (optional)<textarea id="reviewNote" maxlength="2000" placeholder="Explain the business basis for this decision.">${escapeHtml(draft.note)}</textarea></label><p class="evidence">Interpretation: <b>${escapeHtml(draft.interpretation.replaceAll("_", " "))}</b>. ${draft.operation === "retain" ? "Values stay unchanged; only the reviewed scope is accepted." : "Only the displayed, valid scoped changes are approved."} Original values are preserved and rollback replays remaining decisions.</p>` : '<p class="review-scope">This is a simulation. Continuing does not apply anything; the final step requires approval.</p>'}`;
}
function bindGuidedUI(item) {
  bindAnalysisTools();
  document.querySelectorAll("[data-guided-issue]").forEach(button => button.onclick = () => { state.selectedIssue = Number(button.dataset.guidedIssue); state.reviewStep = 1; render(); });
  $("#reviewSearch").oninput = event => { state.reviewSearch = event.target.value; renderPreservingReviewFocus(); };
  $("#reviewKind").onchange = event => { state.reviewKind = event.target.value; render(); };
  $("#guidedPolicies").onclick = () => showColumnPolicies(item?.column);
  $("#guidedRelations").onclick = showRelationshipRules;
  $("#guidedSchema").onclick = showRuleEditor;
  $("#guidedDuplicates").onclick = configureDuplicates;
  $("#guidedManual").onclick = showManualCorrection;
  $("#guidedContext").onclick = () => go("data");
  $("#guidedHistory")?.addEventListener("click", () => go("changes"));
  $("#guidedView")?.addEventListener("click", () => go("view"));
  $("#dismissReviewResult")?.addEventListener("click", () => { state.reviewResult = ""; render(); });
  if (!item) return;
  const draft = reviewDraft(item);
  const update = (action, rerender = true) => { action(); delete draft.previewFingerprint; if (rerender) renderPreservingReviewFocus(); };
  $("#guidedDefer").onclick = () => { state.selectedIssue = null; state.reviewStep = 1; render(); };
  $("#reviewBack").onclick = () => { state.reviewStep = Math.max(1, state.reviewStep - 1); render(); };
  const navigate = target => {
    try {
      if (target >= 3 && draft.interpretation === "unresolved") {
        state.reviewStep = 2; render();
        throw new Error("Choose your interpretation, or leave this finding open.");
      }
      if (target >= 4) {
        const preview = guidedPreview(item);
        if (!preview.selectedIds.length) throw new Error("The scope contains no matching records.");
        if (target === 5) {
          if (state.reviewStep !== 4 && draft.previewFingerprint !== guidedFingerprint(item, draft)) {
            state.reviewStep = 4; render();
            throw new Error("Review the exact impact, then select Approve.");
          }
          if (preview.blocked.length && !draft.skipBlocked) throw new Error("Resolve exceptions or choose to approve only the valid subset.");
          if (preview.constraints.length && !draft.acknowledgeConstraints) throw new Error("Review the new constraint violations before continuing.");
          draft.previewFingerprint = guidedFingerprint(item, draft);
        }
      }
      state.reviewStep = target; render();
    } catch (error) { notify(error.message); }
  };
  document.querySelectorAll("[data-review-step]").forEach(button => button.onclick = () => {
    navigate(Number(button.dataset.reviewStep));
    document.querySelector('[data-review-step][aria-current="step"]')?.focus({ preventScroll: true });
  });
  $("#reviewNext")?.addEventListener("click", () => navigate(state.reviewStep + 1));
  $("#approveGuided")?.addEventListener("click", () => approveGuidedDecision(item));
  document.querySelectorAll("input[name=reviewInterpretation]").forEach(input => input.onchange = () => update(() => { draft.interpretation = input.value; }));
  const scalar = { reviewOperation: "operation", reviewValue: "value", reviewFactor: "factor", reviewDecimals: "decimals", reviewGroupColumn: "groupColumn", reviewNumberFormat: "numberFormat", reviewDateFormat: "dateFormat", reviewLower: "lower", reviewUpper: "upper", reviewSurvivor: "survivor" };
  Object.entries(scalar).forEach(([id, key]) => {
    const input = document.querySelector(`#${id}`); if (!input) return;
    const change = () => update(() => { draft[key] = key === "decimals" ? Number(input.value) : input.value; if (key === "operation" && input.value === "map") draft.mapping = Object.fromEntries(currentValueGroups(item).slice(0, 200).map(([value]) => [value, value])); }, input.tagName === "SELECT");
    input[input.tagName === "SELECT" ? "onchange" : "oninput"] = change;
  });
  const checkboxes = { reviewCurrency: "currency", reviewPercentage: "percentage", reviewConflictAck: "acknowledgeConflicts", reviewSkipBlocked: "skipBlocked", reviewConstraintAck: "acknowledgeConstraints" };
  Object.entries(checkboxes).forEach(([id, key]) => { const input = document.querySelector(`#${id}`); if (input) input.onchange = () => update(() => { draft[key] = input.checked; }, false); });
  const scopes = { reviewScopeMode: "mode", reviewScopeColumn: "column", reviewScopeOperator: "operator", reviewScopeValue: "value" };
  Object.entries(scopes).forEach(([id, key]) => { const input = document.querySelector(`#${id}`); if (input) input[input.tagName === "SELECT" ? "onchange" : "oninput"] = () => update(() => { draft.scope[key] = input.value; }, input.tagName === "SELECT"); });
  const parseIds = value => value.trim() ? value.split(/[\s,]+/).map(Number) : [];
  $("#reviewRowIds")?.addEventListener("input", event => update(() => { draft.scope.rowIds = parseIds(event.target.value); }, false));
  $("#reviewSurvivorIds")?.addEventListener("input", event => update(() => { draft.survivorIds = parseIds(event.target.value); }, false));
  $("#reviewNote")?.addEventListener("input", event => { draft.note = event.target.value; draft.previewFingerprint = guidedFingerprint(item, draft); });
  document.querySelectorAll("[data-review-map]").forEach(input => input.oninput = () => update(() => { const source = currentValueGroups(item)[Number(input.dataset.reviewMap)]?.[0]; if (source !== undefined) draft.mapping[source] = input.value; }, false));
  document.querySelectorAll("[data-value-group]").forEach(button => button.onclick = () => update(() => { draft.scope.mode = "selected"; draft.scope.rowIds = currentValueGroups(item)[Number(button.dataset.valueGroup)][1]; state.reviewStep = 2; }));
  document.querySelectorAll("[data-guided-locate]").forEach(button => button.onclick = () => locateRecord(Number(button.dataset.guidedLocate)));
  document.querySelectorAll("[data-scatter-axis]").forEach(select => select.onchange = () => { const current = scatterData(item).selected; current[select.dataset.scatterAxis] = select.value; delete current.viewport; render(); });
  document.querySelectorAll("[data-scatter-reset]").forEach(button => button.onclick = () => { delete scatterData(item).selected.viewport; renderScatterPlot(item); });
  document.querySelectorAll("[data-scatter-plot]").forEach(() => { renderScatterPlot(item); bindScatterNavigation(item); });
  $("#askReviewQuestion")?.addEventListener("click", () => startAutomaticReview(item.id, $("#reviewQuestion").value));
  document.querySelectorAll("[data-outlier-method]").forEach(input => input.onchange = () => { outlierDraft(item).method = input.value; delete draft.previewFingerprint; invalidateFindingInterpretation(item); render(); });
  document.querySelectorAll("[data-outlier-input]").forEach(input => input.onchange = () => { outlierDraft(item)[input.dataset.outlierInput.split(":")[1]] = input.value; delete draft.previewFingerprint; invalidateFindingInterpretation(item); render(); });
  document.querySelectorAll("[data-save-outlier]").forEach(button => button.onclick = () => { saveOutlierRule(item); render(); });
  const changeDuplicateKeys = definition => { state.ruleConfig.duplicates = definition; refreshIssues(); state.selectedIssue = item.id; render(); };
  $("#guidedDuplicateMode")?.addEventListener("change", event => changeDuplicateKeys({ mode: event.target.value, columns: event.target.value === "exact" ? [...state.headers] : [state.headers[0]] }));
  document.querySelectorAll("[data-guided-key]").forEach(input => input.onchange = () => { const columns = [...document.querySelectorAll("[data-guided-key]:checked")].map(input => state.headers[Number(input.dataset.guidedKey)]); if (!columns.length) return notify("Choose at least one key column."); changeDuplicateKeys({ mode: "key", columns }); });
}

function showColumnPolicies(selectedColumn = state.headers[0]) {
  if (!state.headers.includes(selectedColumn)) selectedColumn = state.headers[0];
  const policy = columnPolicy(selectedColumn);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><p class="eyebrow">DEFINITIONS, NOT SILENT CORRECTIONS</p><h2>Column meaning and parsing policy</h2><p>Saving changes interpretation and checks. It never rewrites stored values; use a treatment preview to normalize representations.</p><div class="review-fields">${selectHtml("policyColumn", "Column", state.headers.map(column => [column, column]), selectedColumn)}${selectHtml("policyRole", "Analytical role", ["auto", "identifier", "number", "integer", "text", "category", "date", "boolean"].map(role => [role, role]), policy.role)}<label class="wide-field">Meaning / units<input id="policyMeaning" maxlength="300" value="${escapeHtml(policy.meaning)}" placeholder="e.g. annual income in USD; postal code is an identifier"></label><label class="wide-field">Declared missing tokens (one exact representation per line)<textarea id="policyMissingTokens" placeholder="NULL\nN/A\n-999">${escapeHtml(policy.missingTokens.join("\n"))}</textarea><small>Comparison ignores surrounding whitespace and case. Zero is missing only if you explicitly include it.</small></label>${selectHtml("policyNumberFormat", "Number parsing", [["plain", "Plain decimal / exponent"], ["decimalPoint", "1,234.56"], ["decimalComma", "1.234,56"]], policy.numberFormat)}<label>Default decimal places<input id="policyDecimals" type="number" min="0" max="12" value="${policy.decimals}"></label><label class="check"><input id="policyCurrency" type="checkbox" ${policy.currency ? "checked" : ""}> Allow a currency symbol</label><label class="check"><input id="policyPercentage" type="checkbox" ${policy.percentage ? "checked" : ""}> Convert explicit % to decimals</label>${selectHtml("policyDateFormat", "Date interpretation", [["iso", "YYYY-MM-DD"], ["mdy", "Month / day / year"], ["dmy", "Day / month / year"], ["excel", "Excel 1900 serial"]], policy.dateFormat)}</div><p id="policyError" class="workspace-error" role="status"></p><div class="dialog-actions"><button class="secondary" id="closePolicy">Cancel</button><button class="primary" id="savePolicy">Save column definition</button></div></div>`;
  $("#confirmDialog").showModal();
  $("#policyColumn").onchange = event => showColumnPolicies(event.target.value);
  $("#closePolicy").onclick = () => $("#confirmDialog").close();
  $("#savePolicy").onclick = () => {
    try {
      const definition = { column: selectedColumn, role: $("#policyRole").value, meaning: $("#policyMeaning").value, missingTokens: $("#policyMissingTokens").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), numberFormat: $("#policyNumberFormat").value, decimals: Number($("#policyDecimals").value), currency: $("#policyCurrency").checked, percentage: $("#policyPercentage").checked, dateFormat: $("#policyDateFormat").value };
      applyRuleConfig({ ...exportRuleConfig(), columns: [...(state.ruleConfig.columns || []).filter(policy => policy.column !== selectedColumn), definition] });
      $("#confirmDialog").close(); render(); notify("Definition saved. Data values are unchanged; review treatments explicitly.");
    } catch (error) { $("#policyError").textContent = error.message; }
  };
}
function showRelationshipRules() {
  const rules = state.ruleConfig.relations || [];
  const options = state.headers.map(column => [column, column]);
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><p class="eyebrow">ANALYST-DEFINED BUSINESS LOGIC</p><h2>Relationships and conditional requirements</h2><div class="review-fields"><label>Rule name<input id="relationName" maxlength="200" placeholder="e.g. Delivered date follows order date"></label>${selectHtml("relationKind", "Check", [["comparison", "Compare two fields"], ["requiredIf", "Require a field when another matches"]], "comparison")}${selectHtml("relationColumn", "Finding / required field", options, state.headers[0])}${selectHtml("relationLeft", "Left / trigger field", options, state.headers[0])}${selectHtml("relationRight", "Right comparison field", options, state.headers[1] || state.headers[0])}${selectHtml("relationOperator", "Comparison operator", [[">=", ">="], [">", ">"], ["<=", "<="], ["<", "<"], ["=", "="], ["!=", "!="]], ">=")}${selectHtml("relationType", "Comparison type", [["number", "Numerical"], ["date", "Valid ISO dates"], ["text", "Exact text"]], "number")}<label>Conditional trigger value<input id="relationValue" placeholder="Used only for conditional requirements"></label></div><p class="review-scope">Comparisons require valid, nonmissing inputs. Conditional checks use an exact trigger match. Reference-list membership is available through schema allowed values.</p><p id="relationError" class="workspace-error" role="status"></p><button class="primary" id="addRelationship">Add relationship check</button><div class="saved-rule-list">${rules.map((rule, index) => `<article><span><b>${escapeHtml(rule.name)}</b> · ${rule.kind === "requiredIf" ? `${escapeHtml(rule.column)} required when ${escapeHtml(rule.left)} = ${escapeHtml(rule.value)}` : `${escapeHtml(rule.left)} ${escapeHtml(rule.operator)} ${escapeHtml(rule.right)}`}</span><button class="ghost" data-remove-relation="${index}">Remove</button></article>`).join("")}</div><div class="dialog-actions"><button class="secondary" id="closeRelationships">Close</button></div></div>`;
  $("#confirmDialog").showModal();
  $("#closeRelationships").onclick = () => $("#confirmDialog").close();
  $("#addRelationship").onclick = () => {
    try {
      const rule = { id: newReviewId(), name: $("#relationName").value, column: $("#relationColumn").value, left: $("#relationLeft").value, right: $("#relationRight").value, kind: $("#relationKind").value, operator: $("#relationOperator").value, comparisonType: $("#relationType").value, value: $("#relationValue").value };
      applyRuleConfig({ ...exportRuleConfig(), relations: [...rules, rule] });
      render(); showRelationshipRules();
    } catch (error) { $("#relationError").textContent = error.message; }
  };
  document.querySelectorAll("[data-remove-relation]").forEach(button => button.onclick = () => { applyRuleConfig({ ...exportRuleConfig(), relations: rules.filter((_, index) => index !== Number(button.dataset.removeRelation)) }); render(); showRelationshipRules(); });
}
function showManualCorrection() {
  $("#dialogContent").innerHTML = `<div class="cleaning-dialog"><p class="eyebrow">A REVIEWED CORRECTION PATH</p><h2>Manual correction</h2><p>Select a column and source row IDs, then use the same interpretation, treatment, preview, and approval workflow.</p><div class="review-fields">${selectHtml("manualColumn", "Column", state.headers.map(column => [column, column]), state.headers[0])}<label>Source row IDs<input id="manualRowIds" placeholder="e.g. 3, 5, 9; blank means all working rows"></label></div><p id="manualError" class="workspace-error" role="status"></p><div class="dialog-actions"><button class="secondary" id="cancelManual">Cancel</button><button class="primary" id="beginManual">Begin correction review</button></div></div>`;
  $("#confirmDialog").showModal();
  $("#cancelManual").onclick = () => $("#confirmDialog").close();
  $("#beginManual").onclick = () => {
    try {
      const raw = $("#manualRowIds").value.trim(), ids = raw ? raw.split(/[\s,]+/).map(Number) : state.rows.map(row => row._row);
      if (!ids.length || ids.some(id => !Number.isInteger(id) || !state.rows.some(row => row._row === id))) throw new Error("Choose valid source row IDs present in the working data.");
      const column = $("#manualColumn").value;
      const item = issue(Math.max(0, ...state.issues.map(item => item.id)) + 1, column, "Manual correction", `Manual correction: ${column}`, state.rows.filter(row => ids.includes(row._row)), "medium", "Analyst-selected records requiring a reviewed correction. No value changes until final approval.", "manual");
      state.issues.push(item); $("#confirmDialog").close(); openIssue(item.id);
    } catch (error) { $("#manualError").textContent = error.message; }
  };
}
function decorateDecisionHistory() {
  document.querySelectorAll(".change-card").forEach((card, index) => {
    const change = state.changes[index];
    if (!change?.interpretation || !card.insertAdjacentHTML) return;
    card.insertAdjacentHTML("beforeend", `<p class="decision-interpretation"><b>Analyst interpretation:</b> ${escapeHtml(change.interpretation.replaceAll("_", " "))} · <b>Scope:</b> ${change.rows.length} reviewed source records. ${change.treatment?.scope?.mode === "condition" ? `Condition: ${escapeHtml(change.treatment.scope.column)} ${escapeHtml(change.treatment.scope.operator)} ${escapeHtml(change.treatment.scope.value)}.` : ""}</p>`);
  });
}
function enhanceDatasetScreen() {
  screen.querySelectorAll?.(".profile-table tbody tr").forEach((row, index) => {
    const column = state.headers[index], metadata = row.cells[1]?.querySelector("small");
    const declared = columnPolicy(column).role !== "auto" || state.ruleConfig.schema.some(rule => rule.column === column && rule.type !== "any");
    if (metadata) metadata.textContent = declared ? "declared" : "inferred";
  });
  const empty = screen.querySelector?.(".empty-state:not(.sample-picker)");
  if (!empty) return;
  const heading = empty.querySelector("h1"), description = empty.querySelector("p:not(.eyebrow):not(.ai-status)");
  if (heading) heading.textContent = "Import a dataset";
  if (description) description.textContent = "Open a CSV or choose a sample dataset.";
  const icon = empty.querySelector(".source-icon");
  if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8"/></svg>';
}
