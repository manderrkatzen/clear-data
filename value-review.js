// Contextual, per-representation review. Classification changes analytical
// meaning only; raw source values remain intact until a treatment is approved.
function isValueFinding(item) { return ["missing_token", "sentinel"].includes(item?.candidate?.kind); }
function valueReviewState(column) {
  state.valueReview ||= {};
  return state.valueReview[column] ||= { selectedValue: null, skipped: [] };
}
function representationGroups(column) {
  const groups = new Map();
  for (const item of state.issues.filter(item => item.column === column && item.status === "open" && isValueFinding(item))) {
    for (const row of reviewRows(item)) {
      if (["missing", "legitimate", "not_applicable"].includes(cellInterpretation(row, column))) continue;
      const value = String(row[column] ?? "");
      if (!groups.has(value)) groups.set(value, { value, itemId: item.id, rowIds: [], evidenceId: evidenceValueId(column, value) });
      groups.get(value).rowIds.push(row._row);
    }
  }
  return [...groups.values()].sort((a, b) => {
    const token = value => !value.trim() || /^(null|n\/?a|none|nil|unknown|missing|--?)$/i.test(value.trim());
    return Number(token(b.value)) - Number(token(a.value)) || b.rowIds.length - a.rowIds.length || a.rowIds[0] - b.rowIds[0];
  });
}
function representationAssessment(column, group) {
  for (const [id, analysis] of Object.entries(state.interpretations || {})) {
    if (id !== `finding:${group.itemId}` && !id.startsWith(`finding:${group.itemId}:values:`)) continue;
    const assessment = analysis.valueAssessments?.find(entry => entry.evidenceId === group.evidenceId);
    if (assessment) return { ...assessment, provider: analysis.provider || "configured provider" };
  }
  return null;
}
function currentRepresentation(item) {
  const groups = representationGroups(item.column), progress = valueReviewState(item.column);
  const selected = groups.find(group => group.itemId === item.id && group.value === progress.selectedValue) || groups.find(group => group.itemId === item.id && !progress.skipped.includes(group.value)) || groups.find(group => group.itemId === item.id);
  if (selected) progress.selectedValue = selected.value;
  return { groups, selected, progress };
}
function representationReviewHtml(item) {
  const { groups, selected, progress } = currentRepresentation(item);
  if (!selected) return '<section class="value-review"><h3>Value meanings reviewed</h3><p>Open the confirmed missing-value finding to compare or treat those records.</p></section>';
  const assessment = representationAssessment(item.column, selected), index = groups.indexOf(selected);
  const selectedItem = state.issues.find(entry => entry.id === selected.itemId), draft = reviewDraft(selectedItem);
  const running = ["profiling", "running"].includes(state.analysisStatus);
  const confirmed = state.rows.filter(row => cellInterpretation(row, item.column) === "missing").length;
  return `<section class="value-review" aria-labelledby="valueReviewTitle"><div class="value-review-heading"><h3 id="valueReviewTitle">Review value meanings</h3><span>${groups.length} representations awaiting a decision</span></div><div class="representation-list" aria-label="Value representations">${groups.map((group, offset) => {
    const analysis = representationAssessment(item.column, group);
    return `<button id="representation${offset}" class="representation-chip" data-representation="${offset}" aria-pressed="${offset === index}"><code>${escapeHtml(group.value.trim() ? group.value : "(blank)")}</code><span>${group.rowIds.length} records</span><small>${analysis ? `${Math.round(analysis.missingScore * 100)}% AI missingness confidence` : running ? "AI assessment pending" : "Not assessed"}${progress.skipped.includes(group.value) ? " · skipped" : ""}</small></button>`;
  }).join("")}</div><div class="representation-focus"><div class="representation-value"><code>${escapeHtml(selected.value)}</code><span>${selected.rowIds.length} records in ${escapeHtml(item.column)}</span></div><div class="interpretation-top"><span class="ai-label">${assessment ? `AI assessment · ${escapeHtml(assessment.provider)}` : running ? "AI assessment pending" : "No AI assessment for this representation"}</span>${assessment ? `<h3>${Math.round(assessment.missingScore * 100)}% missingness confidence</h3><p>${escapeHtml(assessment.explanation)}</p><small>Suggested meaning: ${escapeHtml(assessment.meaning.replaceAll("_", " "))}</small>` : `<p>${running ? "Assessments appear as each summary batch completes." : "Request an assessment using this column’s name, meaning, counts, and distribution, or record your own judgment."}</p>`}<small>Model-assessed confidence, not a calibrated probability. No value is classified automatically.</small><button class="secondary" id="assessRepresentation" ${running ? "disabled" : ""}>${running ? "Assessing values…" : assessment ? "Reassess this value" : "Assess this value with AI"}</button></div><fieldset class="interpretation-choice"><legend>Your decision for ${escapeHtml(selected.value)}</legend>${[["missing", "Missing observation"], ["legitimate", "Keep as a valid value"], ["not_applicable", "Not applicable"]].map(([meaning, label]) => `<label><input name="reviewInterpretation" type="radio" value="${meaning}" ${draft.interpretation === meaning ? "checked" : ""}>${label}</label>`).join("")}</fieldset><p class="value-review-impact">Records the meaning of these ${selected.rowIds.length} exact matches. <b>0 cells rewritten.</b> Other values are unaffected.</p><div class="value-review-actions"><button class="primary" id="confirmRepresentation" ${!["missing", "legitimate", "not_applicable"].includes(draft.interpretation) ? "disabled" : ""}>Confirm & next value</button><button class="ghost" id="skipRepresentation">Skip for now</button></div></div>${confirmed ? `<div class="value-treatment-link"><span>${confirmed} records confirmed missing</span><button class="secondary" id="treatConfirmedMissing">Compare / treat confirmed missing values</button></div>` : ""}</section>`;
}
function selectRepresentation(column, index) {
  const group = representationGroups(column)[index]; if (!group) return;
  valueReviewState(column).selectedValue = group.value;
  state.selectedIssue = group.itemId;
  const draft = reviewDraft(state.issues.find(item => item.id === group.itemId));
  draft.interpretation = "unresolved"; delete draft.previewFingerprint;
  state.reviewStep = 2; render();
  document.querySelector(`[data-representation="${index}"]`)?.focus({ preventScroll: true });
}
function confirmRepresentation(item) {
  const { selected } = currentRepresentation(item); if (!selected) return;
  const selectedItem = state.issues.find(entry => entry.id === selected.itemId), draft = reviewDraft(selectedItem);
  if (!["missing", "legitimate", "not_applicable"].includes(draft.interpretation)) return notify("Choose a meaning for this representation.");
  const savedAssessments = { ...state.interpretations }, previousChanges = state.changes.length;
  const assessment = representationAssessment(item.column, selected);
  Object.assign(draft, { operation: "classify", scope: { mode: "selected", rowIds: [...selected.rowIds] }, valueAssessment: assessment ? { ...assessment, value: selected.value } : null });
  const preview = guidedPreview(selectedItem, draft);
  if (preview.patches.length || preview.removedRows.length || preview.blocked.length) return notify("Classification must preserve the exact stored values.");
  state.reviewStep = 5; draft.previewFingerprint = guidedFingerprint(selectedItem, draft);
  approveGuidedDecision(selectedItem);
  if (state.changes.length === previousChanges) return;
  // The raw column and context did not change. Keep only per-value assessments
  // for this column's remaining exact representations, not treatment advice.
  const remaining = representationGroups(item.column);
  for (const group of remaining) {
    for (const [id, result] of Object.entries(savedAssessments)) {
      if (id !== `finding:${group.itemId}` && !id.startsWith(`finding:${group.itemId}:values:`)) continue;
      const entries = result.valueAssessments?.filter(entry => remaining.some(other => other.itemId === group.itemId && other.evidenceId === entry.evidenceId)) || [];
      if (entries.length) state.interpretations[id] = { ...result, valueAssessments: entries };
    }
  }
  const progress = valueReviewState(item.column);
  progress.selectedValue = null;
  const next = remaining.find(group => !progress.skipped.includes(group.value)) || remaining[0];
  if (next) { progress.selectedValue = next.value; state.selectedIssue = next.itemId; state.reviewStep = 2; }
  else {
    const missing = state.issues.find(entry => entry.column === item.column && entry.status === "open" && ["impute", "keep"].includes(entry.recommendation));
    if (missing) { state.selectedIssue = missing.id; state.reviewStep = 1; }
  }
  render();
}
function enhanceValueReview(item) {
  if (!isValueFinding(item) || ![1, 2].includes(state.reviewStep || 1)) return;
  const stage = screen.querySelector(".guided-stage");
  stage.innerHTML = representationReviewHtml(item);
  // The original footer remains available for treatment navigation; one-by-one
  // classification has its own explicit, source-preserving confirmation.
  document.querySelectorAll("[data-representation]").forEach(button => button.onclick = () => selectRepresentation(item.column, Number(button.dataset.representation)));
  const { selected, groups, progress } = currentRepresentation(item);
  if (!selected) return;
  const selectedItem = state.issues.find(entry => entry.id === selected.itemId), draft = reviewDraft(selectedItem);
  // Scope treatment progression to this exact representation as well.
  draft.scope = { mode: "selected", rowIds: [...selected.rowIds] };
  $("#assessRepresentation").onclick = () => startAutomaticReview(selected.itemId, "", selected.value);
  $("#confirmRepresentation").onclick = () => confirmRepresentation(selectedItem);
  $("#skipRepresentation").onclick = () => {
    if (!progress.skipped.includes(selected.value)) progress.skipped.push(selected.value);
    const next = groups.find(group => !progress.skipped.includes(group.value));
    if (next) selectRepresentation(item.column, groups.indexOf(next));
    else { state.selectedIssue = null; state.reviewStep = 1; render(); notify("Remaining representations are left open."); }
  };
  $("#treatConfirmedMissing")?.addEventListener("click", () => {
    const missing = state.issues.find(entry => entry.column === item.column && entry.status === "open" && ["impute", "keep"].includes(entry.recommendation));
    if (missing) openIssue(missing.id);
  });
  document.querySelectorAll("input[name=reviewInterpretation]").forEach(input => input.onchange = () => { draft.interpretation = input.value; delete draft.previewFingerprint; renderPreservingReviewFocus(); });
}
