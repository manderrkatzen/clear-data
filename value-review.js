// Per-representation evidence and source-preserving classification helpers.
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
function confirmRepresentation(item) {
  const { selected } = currentRepresentation(item); if (!selected) return;
  const selectedItem = state.issues.find(entry => entry.id === selected.itemId), draft = reviewDraft(selectedItem);
  if (!["missing", "legitimate", "not_applicable"].includes(draft.interpretation)) return notify("Choose a meaning for this representation.");
  const savedAssessments = { ...state.interpretations }, previousChanges = state.changes.length;
  const assessment = representationAssessment(item.column, selected);
  Object.assign(draft, { operation: "classify", scope: { mode: "selected", rowIds: [...selected.rowIds] }, valueAssessment: assessment ? { ...assessment, value: selected.value } : null });
  const preview = guidedPreview(selectedItem, draft);
  if (preview.patches.length || preview.removedRows.length || preview.blocked.length) return notify("Classification must preserve the exact stored values.");
  draft.previewFingerprint = guidedFingerprint(selectedItem, draft);
  approveGuidedDecision(selectedItem);
  if (state.changes.length === previousChanges) return;
  const remaining = representationGroups(item.column);
  for (const group of remaining) for (const [id, result] of Object.entries(savedAssessments)) {
    if (id !== `finding:${group.itemId}` && !id.startsWith(`finding:${group.itemId}:values:`)) continue;
    const entries = result.valueAssessments?.filter(entry => remaining.some(other => other.itemId === group.itemId && other.evidenceId === entry.evidenceId)) || [];
    if (entries.length) state.interpretations[id] = { ...result, valueAssessments: entries };
  }
  const progress = valueReviewState(item.column); progress.selectedValue = null;
  const next = remaining.find(group => !progress.skipped.includes(group.value)) || remaining[0];
  if (next) { progress.selectedValue = next.value; state.selectedIssue = next.itemId; }
  else { const missing = state.issues.find(entry => entry.column === item.column && entry.status === "open" && ["impute", "keep"].includes(entry.recommendation)); if (missing) state.selectedIssue = missing.id; }
  render();
}
