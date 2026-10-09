// Browser-only review features. These classic-script functions use app.js globals.
function newReviewId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function cloneReview(value) { return JSON.parse(JSON.stringify(value)); }
function emptyRuleConfig() { return { schema: [], metrics: [], outliers: [], duplicates: null, columns: [], relations: [], kpis: [], acceptedSuggestions: [] }; }
function downloadArtifact(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function artifactName(prefix, extension) { return `${prefix}-${String(state.fileName || "dataset").replace(/\.csv$/i, "")}.${extension}`; }
function recordDecisionEvent(change) {
  const snapshot = {
    id: change.id, createdAt: change.createdAt || new Date().toISOString(),
    issue: { id: change.issue.id, column: change.issue.column, type: change.issue.type, label: change.issue.label, recommendation: change.issue.recommendation, ruleId: change.issue.ruleId || null },
    title: change.title, disposition: change.disposition, reason: change.reason,
    note: change.note || "", rowIds: change.rows.map((row) => row._row),
    definition: cloneReview(change.issue.rule || change.issue.outlierDefinition || change.issue.duplicateDefinition || null),
    treatment: cloneReview(change.treatment || null), interpretation: change.interpretation || "",
    reviewedFingerprints: cloneReview(change.reviewedFingerprints || {}),
    interpretationValues: cloneReview(change.interpretationValues || []),
    assumptions: change.proposalCaveats?.assumptions || [], warnings: change.proposalCaveats?.warnings || [],
     patches: cloneReview(change.patches), removedRows: cloneReview(change.removedRows || []),
     structure: cloneReview(change.structure || { addedRows: [], addedColumns: [], removedColumns: [] }),
     reviewImpact: cloneReview(change.reviewImpact || null),
  };
  change.snapshot = snapshot;
  state.auditEvents ||= [];
  state.auditEvents.push({ id: newReviewId(), kind: "approval", at: snapshot.createdAt, decision: cloneReview(snapshot) });
}
function recordRollbackEvent(change, beforeRows, afterRows) {
  state.auditEvents ||= [];
  const before = new Map(beforeRows.map((row) => [row._row, row]));
  const after = new Map(afterRows.map((row) => [row._row, row]));
  const patches = [];
  afterRows.forEach((row) => {
    const previous = before.get(row._row);
    if (previous) state.headers.forEach((column) => { if (previous[column] !== row[column]) patches.push({ rowId: row._row, column, before: previous[column], after: row[column] }); });
  });
  const effects = { patches, restoredRows: afterRows.filter((row) => !before.has(row._row)).map((row) => ({ ...row })), removedRows: beforeRows.filter((row) => !after.has(row._row)).map((row) => ({ ...row })) };
  state.auditEvents.push({ id: newReviewId(), kind: "rollback", at: new Date().toISOString(), decision: cloneReview(change.snapshot), effects, note: "Decision rolled back; later approved values were retained. Effects describe actual resulting value/row changes, not an assumed inversion of the original treatment." });
}
function qualityReportData() {
  const summary = metrics();
  const currentIds = new Set(state.rows.map((row) => row._row));
  return {
    format: "cleardata-quality-report", version: 1, generatedAt: new Date().toISOString(), dataset: state.fileName,
    summary: { ...summary, sourceRows: state.original.length, openFindings: openCount(), approvedNoChange: state.changes.filter((change) => change.disposition === "valid").length },
    completeness: state.headers.map((column) => ({ column, sourceBlanks: state.original.filter((row) => !String(row[column] ?? "").trim()).length, workingBlanks: state.rows.filter((row) => !String(row[column] ?? "").trim()).length })),
    removedRowIds: state.original.filter((row) => !currentIds.has(row._row)).map((row) => row._row),
    findings: state.issues.map((item) => ({ id: item.id, column: item.column, type: item.type, label: item.label, severity: item.severity, status: item.status, summary: item.summary, rowIds: (item.currentRows || item.rows).filter((row) => currentIds.has(row._row)).map((row) => row._row), reviewedRowIds: item.rows.map((row) => row._row), rule: item.rule || item.outlierDefinition || item.duplicateDefinition || null })),
    activeDecisions: state.changes.map((change) => cloneReview(change.snapshot)),
    scorecards: typeof CapabilitiesEngine !== "undefined" ? { source: CapabilitiesEngine.qualityScorecard(state.headers, state.original, state.ruleConfig, { policies: state.ruleConfig.columns || [] }), working: CapabilitiesEngine.qualityScorecard(state.headers, state.rows, state.ruleConfig, { revision: state.datasetRevision, policies: state.ruleConfig.columns || [], classifications: effectiveClassifications() }) } : null,
    auditEvents: cloneReview(state.auditEvents || []), rules: exportRuleConfig(),
    interpretation: "Accepted findings may retain blanks or unusual values. Modified-cell counts compare remaining working rows with source; removed records are counted separately. History and these artifacts are analyst review records, not a certification of correctness.",
  };
}
function qualityReportHtml(report = qualityReportData()) {
  const esc = escapeHtml;
  const table = (heads, rows) => `<div class="table-scroll"><table><thead><tr>${heads.map((head) => `<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const m = report.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClearData quality report — ${esc(report.dataset)}</title><style>body{font:15px system-ui,sans-serif;color:#1d292e;margin:40px auto;padding:0 24px;max-width:1200px;line-height:1.6}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #dfe6e3;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eff5f0}.table-scroll{overflow:auto;margin:16px 0}.summary{padding:16px;background:#eff5f0;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8faf8;padding:16px}@media print{body{margin:0;max-width:none}.table-scroll{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>ClearData quality report</h1><p><strong>${esc(report.dataset)}</strong><br>Generated ${esc(report.generatedAt)}</p><div class="summary">${m.sourceRows} source rows → ${m.rows} working rows · ${m.columns} columns<br>${m.changedRows} modified rows · ${m.changedCells} modified cells · ${m.removedRows} removed rows<br>${m.openFindings} open findings · ${m.decisions} active approved decisions · ${m.approvedNoChange} accepted without changing values</div><p>${esc(report.interpretation)}</p><h2>Completeness</h2><p>Counts use the source and remaining working population, respectively. Row removal can reduce blank counts without filling values.</p>${table(["Column", "Source blanks", "Working blanks"], report.completeness.map((item) => [item.column, item.sourceBlanks, item.workingBlanks]))}<h2>Findings and unresolved concerns</h2>${table(["Finding", "Column", "Priority", "Status", "Current affected row IDs", "Evidence"], report.findings.map((item) => [item.label, item.column, item.severity, item.status, item.rowIds.join(", ") || "None", item.summary]))}<h2>Active decisions</h2>${table(["Approved at", "Treatment", "Column", "Reviewed row IDs", "Modified cells", "Removed row IDs", "Reason", "Analyst note"], report.activeDecisions.map((item) => [item.createdAt, item.title, item.issue.column, item.rowIds.join(", "), item.patches.length, item.removedRows.map((row) => row._row).join(", "), item.reason, item.note]))}<h2>Approval and rollback log</h2>${table(["Event at", "Event", "Decision ID", "Treatment", "Reason / note"], report.auditEvents.map((event) => [event.at, event.kind, event.decision.id, event.decision.title, event.decision.note || event.note || event.decision.reason]))}<h2>Configured review rules</h2><pre>${esc(JSON.stringify(report.rules, null, 2))}</pre><p>Use the JSON decision log for full cell-level before/after values and removed-record snapshots. This self-contained HTML report can be printed to PDF using your browser.</p></body></html>`;
}
const baseQualityReportHtml = qualityReportHtml;
qualityReportHtml = (report = qualityReportData()) => {
  const html = baseQualityReportHtml(report);
  if (!report.scorecards) return html;
  const metric = (card, kind) => kind === "validity" && !card.hasRules ? "No rules" : card[kind] === null ? "—" : `${card[kind].toFixed(1)}%`;
  const table = `<h2>Source and working quality scorecard</h2><div class="table-scroll"><table><thead><tr><th>Column</th><th>Source validity</th><th>Working validity</th><th>Source consistency</th><th>Working consistency</th></tr></thead><tbody>${report.scorecards.source.map(source => { const working = report.scorecards.working.find(card => card.column === source.column); return `<tr><th>${escapeHtml(source.column)}</th><td>${metric(source, "validity")}</td><td>${metric(working, "validity")}</td><td>${metric(source, "consistency")}</td><td>${metric(working, "consistency")}</td></tr>`; }).join("")}</tbody></table></div>`;
  return html.replace("</body>", `${table}</body>`);
};
function decisionLogCsv() {
  const headers = ["event_at", "event", "decision_id", "treatment", "column", "row_id", "before", "after", "reason", "analyst_note", "interpretation", "scope"];
  const rows = [];
  (state.auditEvents || []).forEach((event) => {
    const decision = event.decision;
    const base = { event_at: event.at, event: event.kind, decision_id: decision.id, treatment: decision.title, column: decision.issue.column, reason: decision.reason, analyst_note: decision.note, interpretation: decision.interpretation || "", scope: decision.treatment?.scope ? JSON.stringify(decision.treatment.scope) : "Issue matching set" };
    const effects = event.kind === "rollback" ? event.effects || { patches: [], removedRows: [], restoredRows: [] } : { patches: decision.patches, removedRows: decision.removedRows, restoredRows: [] };
    effects.patches.forEach((patch) => rows.push({ ...base, column: patch.column, row_id: patch.rowId, before: patch.before, after: patch.after }));
    effects.removedRows.forEach((row) => rows.push({ ...base, row_id: row._row, before: JSON.stringify(row), after: "Record removed" }));
    effects.restoredRows.forEach((row) => rows.push({ ...base, row_id: row._row, before: "Record absent", after: JSON.stringify(row) }));
    if (!effects.patches.length && !effects.removedRows.length && !effects.restoredRows.length) rows.push({ ...base, row_id: decision.rowIds.join(", "), before: "No value change", after: "No value change" });
  });
  return csvText(headers, rows);
}
function reportExportControls() {
  return `<section class="workspace-card"><h2>Report and decision-log downloads</h2><p>Capture the current findings, completeness, decisions, and unresolved concerns. HTML is self-contained and can be printed to PDF.</p><div class="workspace-actions"><button class="secondary" id="downloadQualityHtml">Quality report · HTML</button><button class="secondary" id="downloadQualityJson">Quality report · JSON</button><button class="secondary" id="downloadDecisionJson">Decision log · JSON</button><button class="secondary" id="downloadDecisionCsv">Decision log · CSV</button></div></section>`;
}
function bindReportExports() {
  $("#downloadQualityHtml").onclick = () => downloadArtifact(qualityReportHtml(), artifactName("quality-report", "html"), "text/html");
  $("#downloadQualityJson").onclick = () => downloadArtifact(JSON.stringify(qualityReportData(), null, 2), artifactName("quality-report", "json"), "application/json");
  $("#downloadDecisionJson").onclick = () => downloadArtifact(JSON.stringify({ format: "cleardata-decision-log", version: 1, dataset: state.fileName, generatedAt: new Date().toISOString(), activeDecisionIds: state.changes.map((change) => change.id), events: state.auditEvents || [] }, null, 2), artifactName("decision-log", "json"), "application/json");
  $("#downloadDecisionCsv").onclick = () => downloadArtifact(decisionLogCsv(), artifactName("decision-log", "csv"), "text/csv");
}

function duplicateProfile(definition = state.ruleConfig?.duplicates || { mode: "exact", columns: [...state.headers] }) {
  const columns = definition.mode === "exact" ? state.headers : definition.columns;
  if (!["exact", "key"].includes(definition.mode) || !Array.isArray(columns) || !columns.length || columns.some((column) => !state.headers.includes(column))) return { error: "Choose at least one valid duplicate-key column.", rows: [], groups: [], removeRows: [] };
  const buckets = new Map();
  let skipped = 0;
  state.rows.forEach((row) => {
    if (definition.mode === "key" && columns.some((column) => !String(row[column] ?? "").trim())) { skipped++; return; }
    const key = JSON.stringify(columns.map((column) => row[column]));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  const groups = [...buckets.values()].filter((rows) => rows.length > 1).map((rows) => ({ rows, survivor: rows[0], conflict: new Set(rows.map((row) => JSON.stringify(state.headers.map((column) => row[column])))).size > 1 }));
  return { groups, rows: groups.flatMap((group) => group.rows), removeRows: groups.flatMap((group) => group.rows.slice(1)), conflicts: groups.filter((group) => group.conflict).length, skipped, columns, definition };
}
function appendReviewFindings(issues, nextId) {
  (state.ruleConfig?.outliers || []).forEach((rule) => {
    if (issues.some((item) => item.recommendation === "outlier" && item.column === rule.column)) {
      const item = issues.find((entry) => entry.recommendation === "outlier" && entry.column === rule.column);
      item.outlierDefinition = cloneReview(rule.definition);
      const profile = evaluateOutlier(item, rule.definition);
      item.rows = profile.rows; item.outlier = profile; item.summary = `${profile.rows.length} values match the saved rule. ${profile.note}`;
      if (!profile.rows.length) item.status = "resolved";
      return;
    }
    const profile = evaluateOutlier({ column: rule.column }, rule.definition);
    if (profile.rows.length) issues.push(issue(nextId++, rule.column, "Configured numerical outliers", `Outlier review: ${rule.column}`, profile.rows, "medium", profile.note, "outlier", { outlier: profile, outlierDefinition: cloneReview(rule.definition) }));
  });
  const duplicates = duplicateProfile();
  if (duplicates.rows.length) issues.push(issue(nextId++, duplicates.columns[0], "Duplicate records", "Repeated records / business keys", duplicates.rows, "high", `${duplicates.groups.length} repeated groups; ${duplicates.removeRows.length} removable records; ${duplicates.conflicts} conflicting groups.`, "duplicates", { duplicateProfile: duplicates, duplicateDefinition: cloneReview(duplicates.definition) }));
  (state.ruleConfig?.schema || []).forEach((rule) => {
    const rows = state.rows.filter((row) => schemaProblems(row, rule).length);
    if (rows.length) issues.push(issue(nextId++, rule.column, "Schema violation", `Schema check: ${rule.column}`, rows, "high", `${rows.length} records violate the declared ${rule.type} / required / range / allowed-value checks.`, "schema", { rule, ruleId: rule.id }));
  });
  (state.ruleConfig?.metrics || []).forEach((rule) => {
    const profile = metricProfile(rule);
    if (profile.rows.length) issues.push(issue(nextId++, rule.target, "Derived metric inconsistency", `Metric check: ${rule.name}`, profile.rows, "high", `${profile.rows.length} records differ from ${metricFormula(rule)}; ${profile.blocked.length} other records cannot be calculated.`, "metric", { rule, ruleId: rule.id, metricProfile: profile }));
    if (profile.blocked.length) issues.push(issue(nextId++, rule.target, "Derived metric unavailable", `Cannot calculate: ${rule.name}`, profile.blocked.map((entry) => entry.row), "medium", `${profile.blocked.length} records have missing/invalid inputs, zero denominators, or nonfinite results.`, "metricBlocked", { rule, ruleId: rule.id }));
  });
}
function configureDuplicates() {
  const definition = state.ruleConfig.duplicates || { mode: "exact", columns: [...state.headers] };
  $("#dialogContent").innerHTML = `<h2>Duplicate key definition</h2><p>Definitions run checks; they never remove rows automatically.</p>${selectHtml("duplicateMode","Compare rows by",[["exact","All columns"],["key","Selected business key"]],definition.mode)}<fieldset><legend>Key columns</legend>${state.headers.map(column => `<label class="rp-check"><input type="checkbox" data-dataset-key="${escapeHtml(column)}" ${definition.columns.includes(column) ? "checked" : ""}>${escapeHtml(column)}</label>`).join("")}</fieldset><p id="duplicateDefinitionError" role="status"></p><div class="dialog-actions"><button class="secondary" id="closeDuplicateDefinition">Cancel</button><button class="primary" id="saveDuplicateDefinition">Save definition</button></div>`;
  $("#confirmDialog").showModal(); $("#closeDuplicateDefinition").onclick = () => $("#confirmDialog").close();
  $("#saveDuplicateDefinition").onclick = () => { try { const mode = $("#duplicateMode").value, columns = mode === "exact" ? [...state.headers] : [...document.querySelectorAll("[data-dataset-key]:checked")].map(input => input.dataset.datasetKey); applyRuleConfig({...exportRuleConfig(),duplicates:{mode,columns}}); $("#confirmDialog").close(); render(); } catch (error) { $("#duplicateDefinitionError").textContent = error.message; } };
}
function approveDuplicateDecision(item, action) {
  const profile = duplicateProfile();
  if (profile.error || !profile.rows.length) throw new Error(profile.error || "No duplicate records match this definition.");
  if (!["removeDuplicates", "valid"].includes(action)) throw new Error("Choose a supported duplicate treatment.");
  if (action === "removeDuplicates" && profile.conflicts && !item.acknowledged) throw new Error("Review conflicting key records and confirm the survivor policy first.");
  const removedRows = action === "removeDuplicates" ? profile.removeRows.map((row) => ({ ...row })) : [];
  item.rows = profile.rows; item.duplicateDefinition = cloneReview(profile.definition);
  const change = { id: newReviewId(), createdAt: new Date().toISOString(), issue: item, title: action === "removeDuplicates" ? "Remove duplicates; keep first" : "Retain repeated records", disposition: action === "valid" ? "valid" : "finalized", rows: [...profile.rows], patches: [], removedRows, originals: [], before: `${state.rows.length} rows`, after: `${state.rows.length - removedRows.length} rows`, reason: `${profile.groups.length} groups using ${profile.definition.mode}: ${profile.columns.join(", ")}. ${profile.conflicts} conflicting groups.`, note: state.decisionNotes?.[item.id] || "", fingerprint: reviewFingerprint(item) };
  const removed = new Set(removedRows.map((row) => row._row));
  state.rows = state.rows.filter((row) => !removed.has(row._row));
  state.changes.unshift(change); recordDecisionEvent(change);
  refreshIssues(); state.selectedIssue = null;
  notify(`${removedRows.length} records removed; decision recorded and reversible.`); render();
}

function validIsoDate(text) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) return false;
  try { return isoDate(`${parts[2]}/${parts[3]}/${parts[1]}`) === text; } catch { return false; }
}
function schemaProblems(row, rule) {
  if (typeof CapabilitiesEngine !== "undefined") return CapabilitiesEngine.schemaProblems(row, rule, { policies: state.ruleConfig.columns || [], classifications: effectiveClassifications() });
  const value = String(row[rule.column] ?? "").trim();
  const status = observationState(row, rule.column);
  if (status === "not_applicable") return [];
  if (status !== "present") return rule.required ? ["Required observation is missing or unreviewed blank"] : [];
  let number;
  try { number = CleaningEngine.parseNumber(value); } catch { number = NaN; }
  const problems = [];
  if (["number", "integer"].includes(rule.type) && !Number.isFinite(number)) problems.push("Expected a finite number");
  else if (rule.type === "integer" && !Number.isInteger(number)) problems.push("Expected an integer");
  if (rule.type === "date" && !validIsoDate(value)) problems.push("Expected a valid YYYY-MM-DD calendar date");
  if (rule.type === "boolean" && !["true", "false", "0", "1"].includes(value.toLowerCase())) problems.push("Expected true/false or 0/1");
  if (["number", "integer"].includes(rule.type) && Number.isFinite(number)) {
    if (rule.minimum !== null && number < rule.minimum) problems.push(`Below minimum ${rule.minimum}`);
    if (rule.maximum !== null && number > rule.maximum) problems.push(`Above maximum ${rule.maximum}`);
  }
  if (rule.allowed.length && !rule.allowed.includes(value)) problems.push("Not in the allowed-value list (case-sensitive)");
  return problems;
}
function normalizeRuleConfig(input, headers = state.headers) {
  if (!input || typeof input !== "object" || !Array.isArray(input.schema) || !Array.isArray(input.metrics) || !Array.isArray(input.outliers)) throw new Error("Invalid review-rule file.");
  const known = (column) => { if (typeof column !== "string" || !headers.includes(column)) throw new Error(`Rule column not present in this dataset: ${column}`); return column; };
  const bound = (value) => { if (value === null || value === "" || value === undefined) return null; if (!Number.isFinite(Number(value))) throw new Error("Schema bounds must be finite numbers."); return Number(value); };
  const schema = input.schema.map((rule) => {
    const column = known(rule.column);
    if (!["any", "text", "number", "integer", "date", "boolean", "category"].includes(rule.type) || typeof rule.required !== "boolean" || !Array.isArray(rule.allowed) || !rule.allowed.every((value) => typeof value === "string" && value.trim())) throw new Error("Invalid schema type, required flag, or allowed-value list.");
    const minimum = bound(rule.minimum), maximum = bound(rule.maximum);
    if ((minimum !== null || maximum !== null) && !["number", "integer"].includes(rule.type)) throw new Error("Numeric bounds require a number or integer schema type.");
    if (minimum !== null && maximum !== null && minimum > maximum) throw new Error("Schema minimum cannot exceed maximum.");
    return { id: typeof rule.id === "string" && rule.id ? rule.id : `schema-${column}`, column, type: rule.type, required: rule.required, minimum, maximum, allowed: [...new Set(rule.allowed.map((value) => value.trim()))] };
  });
  if (new Set(schema.map((rule) => rule.column)).size !== schema.length) throw new Error("Only one schema definition per column is supported.");
  const metrics = input.metrics.map((rule) => {
    if (!["difference", "sum", "product", "ratio"].includes(rule.operation)) throw new Error("Unsupported metric operation.");
    const target = known(rule.target), left = known(rule.left), right = known(rule.right);
    if (target === left || target === right) throw new Error("A derived target cannot also be one of its inputs.");
    if ([rule.factor, rule.tolerance, rule.decimals].some((value) => value == null || !String(value).trim())) throw new Error("Metric factor, tolerance, and decimal places are required.");
    const factor = Number(rule.factor), tolerance = Number(rule.tolerance), decimals = Number(rule.decimals);
    if (!Number.isFinite(factor) || !Number.isFinite(tolerance) || tolerance < 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 8) throw new Error("Metric factor/tolerance must be finite; tolerance is nonnegative and decimals range from 0 to 8.");
    return { id: typeof rule.id === "string" && rule.id ? rule.id : newReviewId(), name: String(rule.name || target).slice(0, 200), target, left, right, operation: rule.operation, factor, tolerance, decimals };
  });
  if (new Set(metrics.map((rule) => rule.target)).size !== metrics.length) throw new Error("Only one derived-metric rule per target column is supported.");
  if (new Set([...schema, ...metrics].map((rule) => rule.id)).size !== schema.length + metrics.length) throw new Error("Rule IDs must be unique.");
  // Reject cycles; noncyclic chains are evaluated from current source values and approved one rule at a time.
  const targets = new Map(metrics.map((rule) => [rule.target, rule]));
  const visit = (column, trail = new Set()) => {
    if (trail.has(column)) throw new Error("Derived-metric rules cannot contain a dependency cycle.");
    const rule = targets.get(column);
    if (!rule) return;
    const next = new Set(trail); next.add(column); visit(rule.left, next); visit(rule.right, next);
  };
  metrics.forEach((rule) => visit(rule.target));
  const outliers = input.outliers.map((rule) => {
    const column = known(rule.column);
    if (!rule.definition || !["iqr", "zscore", "percentile", "threshold", "custom"].includes(rule.definition.method)) throw new Error("Invalid saved outlier definition.");
    const definition = { ...defaultOutlierDefinition({ column }), ...rule.definition };
    const finite = (value) => value != null && String(value).trim() !== "" && Number.isFinite(Number(value));
    if (definition.method === "iqr" && (!finite(definition.multiplier) || Number(definition.multiplier) <= 0)) throw new Error("Invalid saved IQR multiplier.");
    if (definition.method === "zscore" && (!finite(definition.zScore) || Number(definition.zScore) <= 0)) throw new Error("Invalid saved Z-score threshold.");
    if (definition.method === "percentile" && (!finite(definition.low) || !finite(definition.high) || Number(definition.low) < 0 || Number(definition.high) > 100 || Number(definition.low) >= Number(definition.high))) throw new Error("Invalid saved percentile bounds.");
    if (definition.method === "threshold" && ((definition.lower !== "" && !finite(definition.lower)) || (definition.upper !== "" && !finite(definition.upper)) || (definition.lower !== "" && definition.upper !== "" && Number(definition.lower) >= Number(definition.upper)))) throw new Error("Invalid saved business bounds.");
    if (definition.method === "custom") { known(definition.field); if (![">=", ">", "<", "<=", "=", "!=", "contains"].includes(definition.operator) || typeof definition.value !== "string" || !definition.value.trim() || ([">=", ">", "<", "<="].includes(definition.operator) && !finite(definition.value))) throw new Error("Invalid saved custom rule."); }
    return { column, definition: cloneReview(definition) };
  });
  if (new Set(outliers.map((rule) => rule.column)).size !== outliers.length) throw new Error("Only one saved outlier rule per column is supported.");
  let duplicates = null;
  if (input.duplicates != null) {
    if (!["exact", "key"].includes(input.duplicates.mode) || !Array.isArray(input.duplicates.columns) || !input.duplicates.columns.length) throw new Error("Invalid duplicate rule.");
    duplicates = { mode: input.duplicates.mode, columns: input.duplicates.mode === "exact" ? [...headers] : [...new Set(input.duplicates.columns.map(known))] };
  }
  const columns = CleaningEngine.normalizePolicies(input.columns || [], headers);
  const relations = normalizeRelationRules(input.relations || [], headers);
  const kpis = typeof CapabilitiesEngine !== "undefined" ? CapabilitiesEngine.normalizeKpis(input.kpis || [], headers) : [];
  if (!Array.isArray(input.acceptedSuggestions || []) || (input.acceptedSuggestions || []).some(entry => !entry || typeof entry.id !== "string" || typeof entry.ruleId !== "string" || !Number.isFinite(entry.passRate) || entry.passRate < .8 || entry.passRate > 1)) throw new Error("Invalid accepted suggestion metadata.");
  const knownRules = new Set([...schema, ...metrics, ...relations].map(rule => rule.id));
  const acceptedSuggestions = (input.acceptedSuggestions || []).filter(entry => knownRules.has(entry.ruleId)).map(entry => ({ id: entry.id, ruleId: entry.ruleId, passRate: entry.passRate }));
  return { schema, metrics, outliers, duplicates, columns, relations, kpis, acceptedSuggestions };
}
function metricFormula(rule) {
  const symbol = { difference: "−", sum: "+", product: "×", ratio: "÷" }[rule.operation];
  return `${rule.target} = (${rule.left} ${symbol} ${rule.right}) × ${rule.factor}; ${rule.decimals} decimals; absolute tolerance ${rule.tolerance}`;
}
function metricResult(row, rule) {
  const values = [row[rule.left], row[rule.right]];
  if ([rule.left, rule.right].some(column => observationState(row, column) !== "present")) return { error: "Missing or invalid numerical source" };
  let left, right;
  try { [left, right] = values.map((value, index) => CleaningEngine.parseNumber(value, columnPolicy([rule.left, rule.right][index]))); } catch { return { error: "Missing or invalid numerical source" }; }
  if (rule.operation === "ratio" && right === 0) return { error: "Zero denominator" };
  const result = ({ difference: () => left - right, sum: () => left + right, product: () => left * right, ratio: () => left / right })[rule.operation]() * rule.factor;
  if (!Number.isFinite(result) || Math.abs(result) >= 1e21) return { error: "Result cannot be represented as a finite fixed-decimal value" };
  return { value: result.toFixed(rule.decimals) };
}
function metricProfile(rule) {
  const rows = [], blocked = [];
  state.rows.forEach((row) => {
    const result = metricResult(row, rule);
    if (result.error) { blocked.push({ row, error: result.error }); return; }
    const current = String(row[rule.target] ?? "").trim();
    if (!current || !Number.isFinite(Number(current)) || Math.abs(Number(current) - Number(result.value)) > rule.tolerance + Number.EPSILON * Math.max(1, Math.abs(Number(current)), Math.abs(Number(result.value))) * 4) rows.push(row);
  });
  return { rows, blocked };
}
function ruleEvidence(item, row) {
  if (item.recommendation === "schema") return schemaProblems(row, item.rule).join("; ");
  const result = metricResult(row, item.rule);
  return result.error || `Calculated target: ${result.value}. ${metricFormula(item.rule)}`;
}

function exportRuleConfig() {
  const config = cloneReview(state.ruleConfig || emptyRuleConfig());
  const outliers = new Map(config.outliers.map((rule) => [rule.column, rule]));
  state.issues.filter((item) => item.recommendation === "outlier" && item.outlierDefinition).forEach((item) => outliers.set(item.column, { column: item.column, definition: cloneReview(item.outlierDefinition) }));
  config.outliers = [...outliers.values()];
  return config;
}
function applyRuleConfig(config) {
  const normalized = normalizeRuleConfig(config);
  normalized.outliers.forEach((rule) => {
    const preview = evaluateOutlier({ column: rule.column }, { ...defaultOutlierDefinition({ column: rule.column }), ...rule.definition });
    if (preview.error && preview.error !== "No observed numerical values for this rule.") throw new Error(preview.error);
  });
  state.ruleConfig = normalized;
  invalidateCleaningProfile();
  state.outlierDrafts = {};
  state.issues.filter((item) => item.recommendation === "outlier").forEach((item) => { item.outlierDefinition = normalized.outliers.find((rule) => rule.column === item.column)?.definition || defaultOutlierDefinition(item); });
  refreshIssues(); state.selectedIssue = null;
  markProjectDirty();
}
function columnOptions(selected) { return state.headers.map((column) => `<option value="${escapeHtml(column)}" ${selected === column ? "selected" : ""}>${escapeHtml(column)}</option>`).join(""); }
function showRuleEditor() {
  state.ruleDraft = exportRuleConfig();
  renderRuleEditor(); $("#confirmDialog").showModal();
}
function renderRuleEditor() {
  const draft = state.ruleDraft;
  $("#dialogContent").innerHTML = `<p class="eyebrow">BUSINESS REVIEW RULES</p><h2>Schema and derived metrics</h2><p>Checks produce findings. Saving a definition never changes data values. Recalculation is a separate preview and approval.</p><div class="rule-editor"><h3>Column schema</h3><div class="rule-fields"><label>Column<select id="schemaColumn">${columnOptions(state.headers[0])}</select></label><label>Declared type<select id="schemaType">${["any", "text", "number", "integer", "date", "boolean", "category"].map((type) => `<option>${type}</option>`).join("")}</select></label><label class="check"><input id="schemaRequired" type="checkbox"> Required / nonblank</label><label>Minimum<input id="schemaMinimum" type="number" step="any" placeholder="Unbounded"></label><label>Maximum<input id="schemaMaximum" type="number" step="any" placeholder="Unbounded"></label><label class="wide-field">Allowed values (one per line; case-sensitive)<textarea id="schemaAllowed" placeholder="Optional"></textarea></label></div><button class="secondary" id="addSchemaRule">Add / replace column check</button><div class="saved-rule-list">${draft.schema.map((rule, index) => `<article><span><b>${escapeHtml(rule.column)}</b> · ${escapeHtml(rule.type)} · ${rule.required ? "required" : "optional"} · bounds ${rule.minimum ?? "−∞"} to ${rule.maximum ?? "∞"} · ${rule.allowed.length} allowed values</span><button class="ghost" data-remove-schema="${index}">Remove</button></article>`).join("") || "<p>No declared schema checks.</p>"}</div><h3>Derived metric rules</h3><p>Difference (profit), product (quantity × unit price), or ratio (ROAS / CTR). Set factor 100 for a percentage result. Tolerance is absolute in the target's units.</p><div class="rule-fields"><label>Name<input id="metricName" maxlength="200" placeholder="e.g. Profit reconciliation"></label><label>Target column<select id="metricTarget">${columnOptions(state.headers[0])}</select></label><label>Left source<select id="metricLeft">${columnOptions(state.headers[1] || state.headers[0])}</select></label><label>Operation<select id="metricOperation"><option value="difference">Left − right</option><option value="sum">Left + right</option><option value="product">Left × right</option><option value="ratio">Left ÷ right</option></select></label><label>Right source<select id="metricRight">${columnOptions(state.headers[2] || state.headers[0])}</select></label><label>Multiply result by<input id="metricFactor" type="number" step="any" value="1"></label><label>Decimal places<input id="metricDecimals" type="number" min="0" max="8" value="2"></label><label>Absolute tolerance<input id="metricTolerance" type="number" min="0" step="any" value="0.01"></label></div><button class="secondary" id="addMetricRule">Add / replace target rule</button><div class="saved-rule-list">${draft.metrics.map((rule, index) => `<article><span><b>${escapeHtml(rule.name)}</b><br>${escapeHtml(metricFormula(rule))}</span><button class="ghost" data-remove-metric="${index}">Remove</button></article>`).join("") || "<p>No derived-metric rules.</p>"}</div></div><p id="ruleEditorError" class="workspace-error" role="status"></p><div class="dialog-actions"><button class="secondary" id="cancelRuleEditor">Cancel</button><button class="primary" id="saveRuleEditor">Save definitions and run checks</button></div>`;
  const fail = (error) => { $("#ruleEditorError").textContent = error.message; };
  $("#addSchemaRule").onclick = () => {
    try {
      const column = $("#schemaColumn").value;
      const rule = { id: draft.schema.find((entry) => entry.column === column)?.id || newReviewId(), column, type: $("#schemaType").value, required: $("#schemaRequired").checked, minimum: $("#schemaMinimum").value, maximum: $("#schemaMaximum").value, allowed: $("#schemaAllowed").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) };
      state.ruleDraft = normalizeRuleConfig({ ...draft, schema: [...draft.schema.filter((entry) => entry.column !== column), rule] }); renderRuleEditor();
    } catch (error) { fail(error); }
  };
  $("#addMetricRule").onclick = () => {
    try {
      const target = $("#metricTarget").value;
      const rule = { id: draft.metrics.find((entry) => entry.target === target)?.id || newReviewId(), name: $("#metricName").value || target, target, left: $("#metricLeft").value, right: $("#metricRight").value, operation: $("#metricOperation").value, factor: $("#metricFactor").value, decimals: $("#metricDecimals").value, tolerance: $("#metricTolerance").value };
      state.ruleDraft = normalizeRuleConfig({ ...draft, metrics: [...draft.metrics.filter((entry) => entry.target !== target), rule] }); renderRuleEditor();
    } catch (error) { fail(error); }
  };
  document.querySelectorAll("[data-remove-schema]").forEach((button) => button.onclick = () => { draft.schema.splice(Number(button.dataset.removeSchema), 1); renderRuleEditor(); });
  document.querySelectorAll("[data-remove-metric]").forEach((button) => button.onclick = () => { draft.metrics.splice(Number(button.dataset.removeMetric), 1); renderRuleEditor(); });
  $("#saveRuleEditor").onclick = () => { try { applyRuleConfig(state.ruleDraft); $("#confirmDialog").close(); render(); notify("Rule definitions saved. Review findings before changing values."); } catch (error) { fail(error); } };
  $("#cancelRuleEditor").onclick = () => $("#confirmDialog").close();
}

function serializeProject(name = state.projectName || state.fileName) {
  const serializeIssue = (item) => ({ id: item.id, column: item.column, type: item.type, label: item.label, severity: item.severity, summary: item.summary, recommendation: item.recommendation, status: item.status, rowIds: item.rows.map((row) => row._row), ruleId: item.ruleId || null, rule: item.rule || null, candidateId: item.candidateId || null, candidate: item.candidate || null, outlierDefinition: item.outlierDefinition || null, duplicateDefinition: item.duplicateDefinition || null, reviewType: item.reviewType || null, displayColumn: item.displayColumn || null, range: item.range || null, date: item.date || false, width: item.width || null, separator: item.separator || null });
  return {
    format: "cleardata-project", version: 1, id: state.projectId || newReviewId(), name: String(name || "Untitled project").slice(0, 200), updatedAt: new Date().toISOString(), fileName: state.fileName,
    headers: [...state.headers], originalHeaders: [...(state.originalHeaders || state.headers)], original: cloneReview(state.original), rows: cloneReview(state.rows), rules: exportRuleConfig(),
    issues: state.issues.map(item => ({...serializeIssue(item),unit:item.unit || null,columnRole:item.columnRole || null,rangeEdited:Boolean(item.rangeEdited),crossRule:cloneReview(item.crossRule || null),scale:item.scale?{factor:item.scale.factor,minority:item.scale.minority,groups:item.scale.groups.map(group=>({key:group.key,stats:cloneReview(group.stats),rowIds:group.rows.map(row=>row._row)}))}:null})), changes: state.changes.map((change) => ({ ...cloneReview(change.snapshot), issueId: change.issue.id, before: change.before, after: change.after, fingerprint: change.fingerprint })),
    auditEvents: cloneReview(state.auditEvents || []), customProposals: cloneReview(state.customProposals),
    outlierDrafts: cloneReview(state.outlierDrafts), issueFilters: cloneReview(state.issueFilters), decisionNotes: cloneReview(state.decisionNotes || {}),
    datasetPurpose: state.datasetPurpose || "",
    primaryReviewMetric: state.primaryReviewMetric || "",
    reviewPage: Object.fromEntries(Object.entries(state.reviewPage || {}).map(([key,data]) => [key,{locked:data.locked,unlocked:data.unlocked,locks:data.locks,banding:data.banding,showAll:data.showAll,sheetOpen:data.sheetOpen,aiClusters:data.aiClusters || [],whitespaceInitialized:Boolean(data.whitespaceInitialized),fix:data.fix,note:data.note,value:data.value,valueInitialized:data.valueInitialized,knnColumns:data.knnColumns,knnK:data.knnK,orderColumn:data.orderColumn,separator:data.separator,targetLength:data.targetLength,tolerance:data.tolerance,range:data.range,canonical:data.canonical,mapping:data.mapping,memberOverrides:data.memberOverrides,detached:data.detached,blankMeansValue:data.blankMeansValue,uniqueConfirmed:data.uniqueConfirmed,survivors:data.survivors,groupIndex:data.groupIndex,visitedGroups:data.visitedGroups,keepRule:data.keepRule,partialChoices:data.partialChoices,target:data.target,targetFormat:data.targetFormat,sourceDate:data.sourceDate,percent:data.percent,keepTime:data.keepTime,factor:data.factor,capLow:data.capLow,capHigh:data.capHigh,x:data.x,logY:data.logY}])),
    view: { screen: state.screen, query: state.query, flaggedOnly: state.flaggedOnly, selectedIssue: state.selectedIssue, selectedRecord: state.selectedRecord, selectedFix: state.selectedFix }, revision: state.datasetRevision,
  };
}
function validateProject(data) {
  if (!data || data.format !== "cleardata-project" || data.version !== 1 || !Array.isArray(data.headers) || !data.headers.length || data.headers.some((column) => typeof column !== "string" || !column.trim() || column === "_row") || new Set(data.headers).size !== data.headers.length || !Array.isArray(data.original) || !data.original.length || !Array.isArray(data.rows) || !Array.isArray(data.issues) || !Array.isArray(data.changes) || !Array.isArray(data.auditEvents)) throw new Error("Unsupported or incomplete ClearData project file.");
  const originalHeaders = data.originalHeaders || data.headers;
  if (!Array.isArray(originalHeaders) || !originalHeaders.length || new Set(originalHeaders).size !== originalHeaders.length || originalHeaders.some(c => typeof c !== "string" || !c.trim() || c === "_row")) throw new Error("Invalid original columns.");
  const allHeaders = [...new Set([...originalHeaders,...data.headers,...data.auditEvents.flatMap(e => e.decision?.structure?.addedColumns || []),...data.changes.flatMap(c => c.structure?.addedColumns || [])])];
  if (allHeaders.some(c => typeof c !== "string" || !c.trim() || c === "_row")) throw new Error("Invalid structural column.");
  const ids = new Set();
  data.original.forEach((row) => { if (!row || !Number.isInteger(row._row) || row._row < 1 || ids.has(row._row) || originalHeaders.some((column) => typeof row[column] !== "string")) throw new Error("Invalid source records in project."); ids.add(row._row); });
  for (const entry of [...data.auditEvents.map(e => e.decision),...data.changes]) for (const row of entry?.structure?.addedRows || []) { if (!row || !Number.isInteger(row._row) || row._row < 1 || data.original.some(r => r._row === row._row) || Object.entries(row).some(([c,v]) => c !== "_row" && (!allHeaders.includes(c) || typeof v !== "string"))) throw new Error("Invalid added row."); ids.add(row._row); }
  const workingIds = new Set();
  data.rows.forEach((row) => { if (!row || !ids.has(row._row) || workingIds.has(row._row) || data.headers.some((column) => typeof row[column] !== "string")) throw new Error("Invalid working records in project."); workingIds.add(row._row); });
  const rules = normalizeRuleConfig(data.rules, allHeaders);
  const issueIds = new Set();
  const recommendations = ["impute", "keep", "convert", "standardize", "date", "valid", "outlier", "duplicates", "schema", "metric", "metricBlocked", "candidate", "relation", "manual"];
  data.issues.forEach((item) => {
    if (!item || !Number.isInteger(item.id) || issueIds.has(item.id) || !allHeaders.includes(item.column) || !recommendations.includes(item.recommendation) || !["open", "valid", "finalized", "resolved"].includes(item.status) || !Array.isArray(item.rowIds) || item.rowIds.some((id) => !ids.has(id)) || [item.type, item.label, item.summary, item.severity].some((value) => typeof value !== "string")) throw new Error("Invalid finding reference in project.");
    if (item.range) { const range = item.range; if (!["number","date","email"].includes(range.type) || [range.min,range.max].some(value => value !== "" && (range.type === "number" ? typeof value !== "number" || !Number.isFinite(value) : range.type === "email" || typeof value !== "string" || !validIsoDate(value))) || range.min !== "" && range.max !== "" && range.min > range.max) throw new Error("Invalid saved valid-range rule."); }
    if (item.crossRule && (item.reviewType !== "cross-column" || item.crossRule.id !== item.ruleId || item.crossRule.column !== item.column || !Array.isArray(item.crossRule.inputs) || item.crossRule.inputs.some(column => !allHeaders.includes(column)) || typeof item.crossRule.label !== "string" || !["difference","product","sum","discount-product","ratio","less-equal","less","date-order","relation"].includes(item.crossRule.operation) || !Number.isFinite(item.crossRule.tolerance) || item.crossRule.tolerance < 0)) throw new Error("Invalid saved relationship rule.");
    // FMT-D-04 / CORE-37: cluster references must survive restore without trusting arbitrary embedded records.
    if(item.scale) {
      const scale=item.scale,seen=new Set();
      if(item.reviewType!=="scale"||![100,1000].includes(scale.factor)||!["low","high"].includes(scale.minority)||!Array.isArray(scale.groups)||scale.groups.length!==2||new Set(scale.groups.map(group=>group.key)).size!==2)throw new Error("Invalid saved scale clusters.");
      for(const group of scale.groups) {
        if(!["low","high"].includes(group.key)||!Array.isArray(group.rowIds)||!group.rowIds.length||group.rowIds.some(id=>!ids.has(id)||seen.has(id)||!seen.add(id))||!group.stats||["count","min","max","median"].some(key=>!Number.isFinite(group.stats[key]))||group.stats.count!==group.rowIds.length||group.stats.min>group.stats.median||group.stats.median>group.stats.max)throw new Error("Invalid saved scale group.");
      }
    }
    if (["schema", "metric", "metricBlocked"].includes(item.recommendation)) {
      const input = emptyRuleConfig();
      input[item.recommendation === "schema" ? "schema" : "metrics"] = [item.rule];
      const normalized = normalizeRuleConfig(input, allHeaders);
      const rule = (item.recommendation === "schema" ? normalized.schema : normalized.metrics)[0];
      if (item.ruleId !== rule.id || item.column !== (rule.column || rule.target)) throw new Error("Finding rule does not match its target.");
    }
    if (item.outlierDefinition) normalizeRuleConfig({ ...emptyRuleConfig(), outliers: [{ column: item.column, definition: item.outlierDefinition }] }, allHeaders);
    if (item.recommendation === "candidate" && (!item.candidate || typeof item.candidateId !== "string" || item.candidate.column !== item.column || item.candidate.id !== item.candidateId)) throw new Error("Invalid candidate reference.");
    if (item.recommendation === "relation") normalizeRelationRules([item.rule], allHeaders);
    issueIds.add(item.id);
  });
  const changeIds = new Set();
  if (data.primaryReviewMetric && data.primaryReviewMetric !== "__rows__" && !allHeaders.includes(data.primaryReviewMetric)) throw new Error("Invalid Review primary metric.");
  for (const [key,prefs] of Object.entries(data.reviewPage || {})) {
    if (!data.issues.some(item => issueKey(item) === key) || !prefs || prefs.locked !== null && (!Array.isArray(prefs.locked) || prefs.locked.some(v => typeof v !== "string")) || !Array.isArray(prefs.locks) || prefs.locks.length > 3 || new Set(prefs.locks).size !== prefs.locks.length || prefs.locks.some(c => !allHeaders.includes(c)) || !Array.isArray(prefs.unlocked) || prefs.unlocked.some(id => !ids.has(id))) throw new Error("Invalid saved Explore locks.");
    for (const [column,band] of Object.entries(prefs.banding || {})) { if (!allHeaders.includes(column) || !["quantiles","fixedWidth","custom"].includes(band?.mode) || band.mode === "fixedWidth" && (!Number.isFinite(band.width) || band.width <= 0) || band.mode === "custom" && (!Array.isArray(band.edges) || !band.edges.length || band.edges.some((v,i) => !Number.isFinite(v) || i && v <= band.edges[i-1]))) throw new Error("Invalid saved group bands."); }
    if (prefs.aiClusters && (!Array.isArray(prefs.aiClusters) || prefs.aiClusters.length > 100 || prefs.aiClusters.some(cluster => !Array.isArray(cluster) || cluster.length < 2 || cluster.length > 300 || cluster.some(value => typeof value !== "string")))) throw new Error("Invalid saved label suggestions.");
    if (["fix","note","value"].some(key => prefs[key] !== undefined && (typeof prefs[key] !== "string" || prefs[key].length > 2000)) || prefs.separator !== undefined && ![";","|",","," / "," & "," + "].includes(prefs.separator) || prefs.targetLength !== undefined && (!Number.isInteger(prefs.targetLength) || prefs.targetLength < 1 || prefs.targetLength > 100) || prefs.tolerance !== undefined && (!Number.isFinite(prefs.tolerance) || prefs.tolerance < 0)) throw new Error("Invalid saved fix parameters.");
    for (const key of ["mapping","canonical","memberOverrides"]) if (prefs[key] !== undefined && (!prefs[key] || typeof prefs[key] !== "object" || Array.isArray(prefs[key]) || Object.entries(prefs[key]).some(([source,value]) => source.length > 1000 || typeof value !== "string" || value.length > 2000))) throw new Error("Invalid saved label mapping.");
    if (prefs.detached !== undefined && (!Array.isArray(prefs.detached) || prefs.detached.some(value => typeof value !== "string"))) throw new Error("Invalid saved label exclusions.");
    if(prefs.valueInitialized!==undefined&&typeof prefs.valueInitialized!=="boolean" || prefs.knnK!==undefined&&(!Number.isInteger(prefs.knnK)||prefs.knnK<1||prefs.knnK>50) || prefs.knnColumns!==undefined&&(!Array.isArray(prefs.knnColumns)||new Set(prefs.knnColumns).size!==prefs.knnColumns.length||prefs.knnColumns.some(column=>!allHeaders.includes(column))) || prefs.orderColumn!==undefined&&!allHeaders.includes(prefs.orderColumn))throw new Error("Invalid saved missing-fill parameters.");
    if(prefs.survivors&&(!prefs.survivors||typeof prefs.survivors!=="object"||Array.isArray(prefs.survivors)||Object.values(prefs.survivors).some(value=>value!=="all"&&!ids.has(value))) || prefs.groupIndex!==undefined&&(!Number.isInteger(prefs.groupIndex)||prefs.groupIndex<0) || prefs.visitedGroups!==undefined&&(!Array.isArray(prefs.visitedGroups)||prefs.visitedGroups.some(key=>typeof key!=="string")))throw new Error("Invalid saved duplicate choices.");
    if(prefs.keepRule){const valid=rule=>rule&&allHeaders.includes(rule.column)&&["nonblank","highest","lowest","latest","equals"].includes(rule.condition)&&(rule.condition!=="equals"||typeof rule.value==="string"&&rule.value.length<=300);if(!valid(prefs.keepRule)||prefs.keepRule.tieBreak&&!valid(prefs.keepRule.tieBreak))throw new Error("Invalid saved survivor rule.");}
    if(prefs.targetFormat!==undefined&&!["iso","mdy","dmy","mon","ymdSlash","dotted","long","excel","number"].includes(prefs.targetFormat)||prefs.sourceDate!==undefined&&!["mdy","dmy"].includes(prefs.sourceDate)||prefs.target!==undefined&&(typeof prefs.target!=="string"||prefs.target.length>200)||["percent","keepTime","logY","partialChoices","uniqueConfirmed"].some(key=>prefs[key]!==undefined&&typeof prefs[key]!=="boolean")||["factor","capLow","capHigh"].some(key=>prefs[key]!==undefined&&prefs[key]!==""&&(!["string","number"].includes(typeof prefs[key])||String(prefs[key]).length>100||!Number.isFinite(Number(prefs[key]))))||prefs.x!==undefined&&prefs.x!==""&&!allHeaders.includes(prefs.x))throw new Error("Invalid saved format or outlier parameters.");
    if (prefs.range && (!["number","date","email"].includes(prefs.range.type) || [prefs.range.min,prefs.range.max].some(value=>value!=="" && (prefs.range.type==="number" ? !Number.isFinite(value) : prefs.range.type==="email" || typeof value!=="string" || !validIsoDate(value))) || prefs.range.min!==""&&prefs.range.max!==""&&prefs.range.min>prefs.range.max)) throw new Error("Invalid saved Explore range.");
  }
  const validateSnapshot = (change, validateProvenance = true) => {
    if (!change || typeof change.id !== "string" || !change.issue || !allHeaders.includes(change.issue.column) || !Array.isArray(change.rowIds) || change.rowIds.some((id) => !ids.has(id)) || !Array.isArray(change.patches) || !Array.isArray(change.removedRows) || typeof change.title !== "string" || typeof change.reason !== "string" || typeof change.note !== "string" || !["valid", "finalized"].includes(change.disposition)) throw new Error("Invalid decision in project.");
    change.patches.forEach((patch) => { if (!ids.has(patch.rowId) || !allHeaders.includes(patch.column) || typeof patch.before !== "string" || typeof patch.after !== "string") throw new Error("Invalid decision patch in project."); });
    change.removedRows.forEach((row) => { if (!ids.has(row._row) || originalHeaders.some((column) => typeof row[column] !== "string")) throw new Error("Invalid removed record in project."); });
    if (change.structure && (!Array.isArray(change.structure.addedRows) || !Array.isArray(change.structure.addedColumns) || !Array.isArray(change.structure.removedColumns) || [...change.structure.addedColumns,...change.structure.removedColumns].some(c => !allHeaders.includes(c)))) throw new Error("Invalid column structure decision.");
    if (change.structure?.rowLineage && (!Array.isArray(change.structure.rowLineage) || change.structure.rowLineage.length !== change.structure.addedRows.length || change.structure.rowLineage.some(trace => !change.structure.addedRows.some(row => row._row === trace.rowId) || !change.rowIds.includes(trace.sourceRowId) || !allHeaders.includes(trace.column) || !Number.isInteger(trace.part) || trace.part < 2))) throw new Error("Invalid split-row source lineage.");
    if (change.interpretationValues && (!Array.isArray(change.interpretationValues) || change.interpretationValues.some(entry => !ids.has(entry.rowId) || !allHeaders.includes(entry.column) || typeof entry.value !== "string" || !["legitimate", "missing", "not_applicable", "format", "error", "resolved"].includes(entry.meaning)))) throw new Error("Invalid cell interpretation in project.");
    if(change.reviewImpact) {
      const impact=change.reviewImpact;
      for(const phase of ["before","after"]) {
        const headers=impact[`${phase}Headers`],rows=impact[`${phase}Rows`],seen=new Set();
        if(!Array.isArray(headers)||!headers.length||new Set(headers).size!==headers.length||headers.some(column=>!allHeaders.includes(column))||!Array.isArray(rows))throw new Error("Invalid saved comparison snapshot.");
        for(const row of rows) {if(!row||!ids.has(row._row)||seen.has(row._row)||headers.some(column=>typeof row[column]!=="string")||Object.entries(row).some(([column,value])=>column!=="_row"&&(!allHeaders.includes(column)||typeof value!=="string")))throw new Error("Invalid saved comparison record.");seen.add(row._row);}
        const missing=impact[`${phase}Missing`];if(!Number.isInteger(missing)||missing<0||missing>rows.length)throw new Error("Invalid saved missing count.");
      }
    }
    for(const key of ["beforeMissingIds","afterMissingIds","beforeExcludedIds","afterExcludedIds"])if(change.reviewImpact?.[key]!==undefined&&(!Array.isArray(change.reviewImpact[key])||new Set(change.reviewImpact[key]).size!==change.reviewImpact[key].length||change.reviewImpact[key].some(id=>!ids.has(id))))throw new Error("Invalid saved observation masks.");
    if(change.reviewSpec?.chartGroups && (!Array.isArray(change.reviewSpec.chartGroups)||change.reviewSpec.chartGroups.some(group=>typeof group.label!=="string"||!Array.isArray(group.rowIds)||group.rowIds.some(id=>!ids.has(id)))))throw new Error("Invalid saved comparison groups.");
    if(change.reviewSpec?.targetPolicy) {if(change.reviewSpec.targetPolicy.column!==change.issue.column)throw new Error("Invalid saved target policy.");CleaningEngine.normalizePolicies([change.reviewSpec.targetPolicy],allHeaders);}
    if(change.reviewSpec?.targetPrecision!==undefined&&(!Number.isInteger(change.reviewSpec.targetPrecision)||change.reviewSpec.targetPrecision<0||change.reviewSpec.targetPrecision>12))throw new Error("Invalid saved target precision.");
    const assessment = change.treatment?.valueAssessment;
    if (validateProvenance && change.treatment?.extraProvenance && (!Array.isArray(change.treatment.extraProvenance) || change.treatment.extraProvenance.some(trace => !ids.has(trace.rowId) || !change.rowIds.includes(trace.rowId) || trace.column !== change.issue.column || !["mode","groupMode","previous","next","interpolate"].includes(trace.method) || !Array.isArray(trace.sourceRowIds) || !trace.sourceRowIds.length || trace.sourceRowIds.some(id => !ids.has(id) || id === trace.rowId) || trace.orderColumn && !allHeaders.includes(trace.orderColumn)))) throw new Error("Invalid ordered or grouped-fill provenance.");
    if (assessment && (typeof assessment.evidenceId !== "string" || !Number.isFinite(assessment.missingScore) || assessment.missingScore < 0 || assessment.missingScore > 1 || !["missing", "legitimate", "not_applicable", "unresolved", "error", "format"].includes(assessment.meaning) || typeof assessment.explanation !== "string" || assessment.explanation.length > 600 || typeof assessment.value !== "string" || !change.interpretationValues?.every(entry => entry.value === assessment.value))) throw new Error("Invalid reviewed representation assessment.");
    const metadata = change.treatment?.fillMetadata;
    if (validateProvenance && ["groupwise", "knn"].includes(change.treatment?.operation) && !metadata) throw new Error("Similar-row fills require a source trace.");
    if (metadata && validateProvenance) {
      const compatibleOperation = change.treatment.operation === metadata.method || change.treatment.operation === "groupMedian" && metadata.method === "groupwise" && metadata.params?.strict === true;
      if (!["groupwise", "knn"].includes(metadata.method) || !compatibleOperation || !metadata.params || !Array.isArray(metadata.params.columns) || !metadata.params.columns.length || new Set(metadata.params.columns).size !== metadata.params.columns.length || metadata.params.columns.some(column => column === change.issue.column || !data.headers.includes(column)) || !Number.isInteger(metadata.params.k) || metadata.params.k < 1 || metadata.params.k > 50 || !Number.isInteger(metadata.params.minObserved) || metadata.params.minObserved < 1 || metadata.params.minObserved > 1000 || !["median", "mean"].includes(metadata.params.statistic) || !Array.isArray(metadata.fills) || metadata.fills.length !== change.patches.filter(patch => patch.column === change.issue.column).length || !Number.isInteger(metadata.fallbackCount) || metadata.fallbackCount < 0 || metadata.fallbackCount > metadata.fills.length) throw new Error("Invalid similar-fill decision metadata.");
      const filled = new Set();
      for (const fill of metadata.fills) {
        if (!ids.has(fill.row) || !change.rowIds.includes(fill.row) || filled.has(fill.row) || !Number.isFinite(fill.value) || !["band", "widened", "knn", "global"].includes(fill.source) || (fill.bandLabel !== undefined && typeof fill.bandLabel !== "string") || (metadata.method === "knn" && (!Array.isArray(fill.neighbourRows) || new Set(fill.neighbourRows).size !== fill.neighbourRows.length || fill.neighbourRows.length > metadata.params.k || fill.neighbourRows.some(id => !ids.has(id) || id === fill.row) || (fill.source === "knn" && !fill.neighbourRows.length)))) throw new Error("Invalid per-cell fill provenance.");
        filled.add(fill.row);
        if (!change.patches.some(patch => patch.rowId === fill.row && patch.column === change.issue.column && Number(patch.after) === fill.value)) throw new Error("Fill provenance does not match its approved value.");
      }
      if (metadata.fallbackCount !== metadata.fills.filter(fill => ["widened", "global"].includes(fill.source)).length) throw new Error("Invalid fill fallback count.");
    }
  };
  data.changes.forEach((change) => { validateSnapshot(change); if (!issueIds.has(change.issueId) || changeIds.has(change.id)) throw new Error("Invalid history reference in project."); changeIds.add(change.id); });
  data.auditEvents.forEach((event) => {
    if (!event || !["approval", "rollback"].includes(event.kind) || typeof event.at !== "string") throw new Error("Invalid audit event.");
    validateSnapshot(event.decision);
    if (event.effects) {
      // Effect patches describe the rollback, not the original fill values.
      // The source trace was already validated on event.decision above.
      validateSnapshot({ ...event.decision, patches: event.effects.patches, removedRows: event.effects.removedRows }, false);
      if (!Array.isArray(event.effects.restoredRows) || event.effects.restoredRows.some((row) => !ids.has(row?._row) || data.headers.some((column) => typeof row[column] !== "string"))) throw new Error("Invalid rollback effects in project.");
    }
  });
  if (data.decisionNotes && (typeof data.decisionNotes !== "object" || Array.isArray(data.decisionNotes) || Object.entries(data.decisionNotes).some(([id, value]) => !issueIds.has(Number(id)) || typeof value !== "string" || value.length > 2000))) throw new Error("Invalid analyst notes in project.");
  const structural = typeof ReviewPageEngine !== "undefined" && (data.originalHeaders || data.changes.some(c => c.structure?.addedColumns.length || c.structure?.removedColumns.length || c.structure?.addedRows.length));
  if (structural) {
    const replayed = ReviewPageEngine.replay(originalHeaders,data.original,data.changes);
    if (JSON.stringify(replayed.headers) !== JSON.stringify(data.headers) || JSON.stringify(replayed.rows.map(r => [r._row,...data.headers.map(c => r[c])])) !== JSON.stringify(data.rows.map(r => [r._row,...data.headers.map(c => r[c])]))) throw new Error("Project working data does not match its approved decision history.");
    const pool = ReviewPageEngine.identityPool(data.original,replayed.rows,data.changes,data.auditEvents);
    return {data:cloneReview(data),rules,pool,byId:new Map(pool.map(r => [r._row,r]))};
  }
  const pool = data.original.map((row) => ({ ...row })), byId = new Map(pool.map((row) => [row._row, row]));
  let active = new Set(ids);
  [...data.changes].reverse().forEach((change) => {
    change.patches.forEach((patch) => { byId.get(patch.rowId)[patch.column] = patch.after; });
    change.removedRows.forEach((row) => active.delete(row._row));
  });
  const replayed = pool.filter((row) => active.has(row._row));
  if (JSON.stringify(replayed.map((row) => [row._row, ...data.headers.map((column) => row[column])])) !== JSON.stringify(data.rows.map((row) => [row._row, ...data.headers.map((column) => row[column])]))) throw new Error("Project working data does not match its approved decision history.");
  return { data: cloneReview(data), rules, pool, byId };
}
function restoreProject(input) {
  const { data, rules, pool, byId } = validateProject(input);
  // Rehydrate references before replacing the active workspace.
  const issues = data.issues.map((saved) => ({ ...saved, rows: saved.rowIds.map((id) => byId.get(id)),...(saved.scale?{scale:{...saved.scale,groups:saved.scale.groups.map(group=>({...group,rows:group.rowIds.map(id=>byId.get(id))}))}}:{}) }));
  if(typeof ReviewModules!=="undefined")for(const issue of issues)ReviewModules[issue.reviewType]?.restoreMetadata?.(issue,data.original);
  const issueById = new Map(issues.map((item) => [item.id, item]));
  const changes = data.changes.map((saved) => ({ ...saved, issue: issueById.get(saved.issueId), rows: saved.rowIds.map((id) => byId.get(id)), originals: [], snapshot: cloneReview(saved) }));
  const view = data.view || {};
  Object.assign(state, { headers: [...data.headers], original: data.original, allRows: pool, rows: data.rows.map((row) => byId.get(row._row)), fileName: String(data.fileName || "dataset.csv"), issues, changes, ruleConfig: rules, auditEvents: data.auditEvents, customProposals: {}, outlierDrafts: {}, issueFilters: {}, decisionNotes: data.decisionNotes && typeof data.decisionNotes === "object" ? data.decisionNotes : {}, scatter: {}, screen: "data", selectedIssue: null, selectedRecord: null, selectedFix: "", query: "", flaggedOnly: false, locateRow: null, proposalPending: false, aiMessage: "", projectId: typeof data.id === "string" ? data.id : newReviewId(), projectName: String(data.name || data.fileName || "Project"), projectDirty: false });
  state.aiInstructions = {};
  state.inspectionFiltersOpen = {};
  state.originalHeaders = [...(data.originalHeaders || data.headers)];
  state.reviewPage = {};
  resetGuidedReview();
  if (typeof ReviewCore !== "undefined") for (const item of state.issues) { const prefs = data.reviewPage?.[issueKey(item)]; if (prefs) Object.assign(ReviewCore.data(item),prefs,{locks:prefs.locks.filter(column => state.headers.includes(column))}); }
  state.primaryReviewMetric = data.primaryReviewMetric || "";
  state.datasetPurpose = typeof data.datasetPurpose === "string" ? data.datasetPurpose.slice(0, 1000) : "";
  refreshIssues();
  if (["data", "view", "issues", "changes", "report"].includes(view.screen)) state.screen = view.screen;
  state.query = typeof view.query === "string" ? view.query : ""; state.flaggedOnly = !!view.flaggedOnly;
  state.selectedIssue = issues.some((item) => item.id === view.selectedIssue && item.status === "open") ? view.selectedIssue : null;
  state.selectedRecord = byId.has(view.selectedRecord) ? view.selectedRecord : null;
  state.selectedFix = typeof view.selectedFix === "string" ? view.selectedFix : "";
  Object.entries(data.outlierDrafts || {}).forEach(([id, definition]) => { const item = state.issues.find((entry) => entry.id === Number(id) && entry.recommendation === "outlier"); if (item && definition && typeof definition === "object") { const preview = evaluateOutlier(item, definition); if (!preview.error) state.outlierDrafts[id] = definition; } });
  Object.entries(data.issueFilters || {}).forEach(([id, filter]) => { if (state.issues.some((item) => String(item.id) === id) && ["AND", "OR"].includes(filter?.join) && Array.isArray(filter.conditions) && filter.conditions.every((condition) => state.headers.includes(condition.column) && ["contains", "=", "!=", ">", "<", ">=", "<="].includes(condition.operator) && typeof condition.value === "string")) state.issueFilters[id] = filter; });
  Object.entries(data.customProposals || {}).forEach(([id, proposals]) => {
    const item = state.issues.find((entry) => String(entry.id) === id && entry.status === "open" && ["impute", "standardize"].includes(entry.recommendation));
    if (!item || !Array.isArray(proposals)) return;
    const sources = Object.fromEntries(categoryProfile(item).variants);
    state.customProposals[id] = proposals.filter((proposal) => proposal && typeof proposal.id === "string" && typeof proposal.instruction === "string" && typeof proposal.interpretation === "string" && ((item.recommendation === "impute" && proposal.operation === "fill" && Number.isFinite(proposal.value)) || (item.recommendation === "standardize" && proposal.operation === "map" && proposal.mapping && typeof proposal.mapping === "object" && !Array.isArray(proposal.mapping) && Object.keys(proposal.mapping).length && Object.entries(proposal.mapping).every(([source, target]) => Object.hasOwn(sources, source) && typeof target === "string" && target.trim())))).map((proposal) => ({ ...proposal, revision: state.datasetRevision, assumptions: Array.isArray(proposal.assumptions) ? proposal.assumptions.filter((value) => typeof value === "string").slice(0, 3) : [], warnings: Array.isArray(proposal.warnings) ? proposal.warnings.filter((value) => typeof value === "string").slice(0, 3) : [] }));
  });
  state.projectDirty = false;
  enableWorkspace(); render(); notify("Project restored, including original values and reversible decisions.");
  startAutomaticReview();
  return true;
}

function projectDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Browser storage is unavailable. Use a downloaded project backup instead."));
    const request = indexedDB.open("cleardata-workspaces", 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore("projects", { keyPath: "id" }); db.createObjectStore("rules", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open browser storage. Use project backups if storage is blocked."));
    request.onblocked = () => reject(new Error("Close other ClearData tabs to finish opening browser storage."));
  });
}
async function localRecord(store, action, value) {
  const db = await projectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, action === "getAll" || action === "get" ? "readonly" : "readwrite");
    const request = transaction.objectStore(store)[action](value);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error("Browser storage operation failed; check available storage or download a project backup.")); };
  });
}
function markProjectDirty() { if (state.headers.length) state.projectDirty = true; }
function workspaceTools() {
  const loaded = state.headers.length > 0;
  return `<section class="workspace-card"><div class="workspace-heading"><div><h2>${loaded ? "Keep your work" : "Resume a project"}</h2><p>${loaded ? "Save this review in your browser, or download a portable project backup." : "Open a saved review with its original data, decisions, and rules."}</p></div>${loaded ? `<span class="status-badge neutral">${state.projectDirty ? "Unsaved changes" : "Saved in this browser"}</span>` : ""}</div><div class="workspace-actions">${loaded ? '<button class="primary" id="saveProject">Save project</button><button class="secondary" id="downloadProject">Download project backup</button>' : ""}<button class="secondary" id="openProjects">Saved projects</button><button class="secondary" id="importProject">Import project backup</button></div><p class="workspace-message" id="workspaceMessage" role="status">${loaded && state.projectName ? `Current project: ${escapeHtml(state.projectName)}` : "Browser-local storage · saving is explicit · backups work across devices"}</p>${loaded ? '<details class="workspace-advanced"><summary>Configure & reuse review rules <span>Schema, metrics, and rule libraries</span></summary><div class="workspace-actions"><button class="secondary" id="editReviewRules">Schema / metric rules</button><button class="secondary" id="openRules">Reusable rules</button><button class="secondary" id="downloadRules">Download rules</button><button class="secondary" id="importRules">Import rules</button></div></details>' : ""}</section>`;
}
function bindWorkspaceTools() {
  $("#openProjects").onclick = () => showProjectLibrary();
  $("#importProject").onclick = () => $("#projectInput").click();
  if (!state.headers.length) return;
  $("#saveProject").onclick = () => {
    $("#dialogContent").innerHTML = `<h2>Save project in this browser</h2><label class="project-name">Project name<input id="projectName" maxlength="200" value="${escapeHtml(state.projectName || state.fileName)}"></label><p>Includes original and working data, decisions, rules, proposals, and review state. Same-origin browser storage; no cloud sync.</p><p id="projectSaveError" role="status" class="workspace-error"></p><div class="dialog-actions"><button class="secondary" id="cancelSaveProject">Cancel</button><button class="primary" id="confirmSaveProject">Save project</button><button class="secondary" id="saveProjectCopy">Save as new project</button></div>`;
    $("#confirmDialog").showModal();
    const save = async (copy) => {
      try {
        const project = serializeProject($("#projectName").value);
        if (copy) project.id = newReviewId();
        $("#confirmSaveProject").disabled = true; $("#saveProjectCopy").disabled = true;
        await localRecord("projects", "put", project);
        if (project.revision === state.datasetRevision) { state.projectId = project.id; state.projectName = project.name; state.projectDirty = false; }
        $("#confirmDialog").close(); render(); notify("Project saved in this browser.");
      } catch (error) { $("#projectSaveError").textContent = error.message; $("#confirmSaveProject").disabled = false; $("#saveProjectCopy").disabled = false; }
    };
    $("#confirmSaveProject").onclick = () => save(false); $("#saveProjectCopy").onclick = () => save(true);
    $("#cancelSaveProject").onclick = () => $("#confirmDialog").close();
  };
  $("#downloadProject").onclick = () => downloadArtifact(JSON.stringify(serializeProject(), null, 2), artifactName("project", "json"), "application/json");
  $("#editReviewRules").onclick = showRuleEditor;
  $("#openRules").onclick = showRuleLibrary;
  $("#downloadRules").onclick = () => downloadArtifact(JSON.stringify({ format: "cleardata-rules", version: 1, rules: exportRuleConfig() }, null, 2), artifactName("rules", "json"), "application/json");
  $("#importRules").onclick = () => $("#rulesInput").click();
}
async function showProjectLibrary() {
  $("#dialogContent").innerHTML = '<h2>Saved projects</h2><p id="projectLibraryStatus" role="status">Loading browser storage…</p><div id="projectLibraryList"></div><div class="dialog-actions"><button class="secondary" id="closeProjectLibrary">Close</button></div>';
  $("#confirmDialog").showModal(); $("#closeProjectLibrary").onclick = () => $("#confirmDialog").close();
  try {
    const projects = (await localRecord("projects", "getAll")).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!$("#confirmDialog").open || !document.querySelector("#projectLibraryList")) return;
    $("#projectLibraryStatus").textContent = projects.length ? "Opening replaces the active session. Save your current session first if needed." : "No projects saved in this browser for this site.";
    $("#projectLibraryList").innerHTML = projects.map((project, index) => `<article class="library-item"><div><b>${escapeHtml(project.name)}</b><small>${escapeHtml(project.fileName)} · ${project.rows.length} working rows · ${escapeHtml(project.updatedAt)}</small></div><button class="secondary" data-open-project="${index}">Open</button><button class="ghost" data-delete-project="${index}">Delete saved copy</button></article>`).join("");
    document.querySelectorAll("[data-open-project]").forEach((button) => button.onclick = () => { try { restoreProject(projects[Number(button.dataset.openProject)]); $("#confirmDialog").close(); } catch (error) { $("#projectLibraryStatus").textContent = error.message; } });
    document.querySelectorAll("[data-delete-project]").forEach((button) => button.onclick = async () => { try { await localRecord("projects", "delete", projects[Number(button.dataset.deleteProject)].id); $("#confirmDialog").close(); showProjectLibrary(); } catch (error) { $("#projectLibraryStatus").textContent = error.message; } });
  } catch (error) { $("#projectLibraryStatus").textContent = error.message; }
}
async function showRuleLibrary() {
  $("#dialogContent").innerHTML = '<h2>Reusable review rules</h2><p>Includes schema, metric, saved outlier, and duplicate definitions. Applying replaces current definitions and runs checks; it never applies treatments.</p><label class="project-name">Rule-set name<input id="ruleSetName" maxlength="200" placeholder="e.g. Monthly sales review"></label><button class="secondary" id="saveRuleSet">Save current definitions</button><p id="ruleLibraryStatus" class="workspace-message" role="status">Loading…</p><div id="ruleLibraryList"></div><div class="dialog-actions"><button class="secondary" id="closeRuleLibrary">Close</button></div>';
  $("#confirmDialog").showModal(); $("#closeRuleLibrary").onclick = () => $("#confirmDialog").close();
  $("#saveRuleSet").onclick = async () => {
    try { await localRecord("rules", "put", { id: newReviewId(), name: $("#ruleSetName").value.trim() || "Review rules", updatedAt: new Date().toISOString(), rules: exportRuleConfig() }); $("#confirmDialog").close(); showRuleLibrary(); } catch (error) { $("#ruleLibraryStatus").textContent = error.message; }
  };
  try {
    const sets = await localRecord("rules", "getAll");
    if (!$("#confirmDialog").open || !document.querySelector("#ruleLibraryList")) return;
    $("#ruleLibraryStatus").textContent = sets.length ? "All referenced columns must exist in the current dataset." : "No rule sets saved yet.";
    $("#ruleLibraryList").innerHTML = sets.map((set, index) => `<article class="library-item"><b>${escapeHtml(set.name)}</b><button class="secondary" data-apply-rule-set="${index}">Apply definitions</button><button class="ghost" data-delete-rule-set="${index}">Delete</button></article>`).join("");
    document.querySelectorAll("[data-apply-rule-set]").forEach((button) => button.onclick = () => { try { applyRuleConfig(sets[Number(button.dataset.applyRuleSet)].rules); $("#confirmDialog").close(); render(); notify("Definitions applied; data values are unchanged."); } catch (error) { $("#ruleLibraryStatus").textContent = error.message; } });
    document.querySelectorAll("[data-delete-rule-set]").forEach((button) => button.onclick = async () => { try { await localRecord("rules", "delete", sets[Number(button.dataset.deleteRuleSet)].id); $("#confirmDialog").close(); showRuleLibrary(); } catch (error) { $("#ruleLibraryStatus").textContent = error.message; } });
  } catch (error) { $("#ruleLibraryStatus").textContent = error.message; }
}
function initializeWorkspaceFeatures() {
  const importJson = (element, action) => {
    element.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try { if (file.size > 50 * 1024 * 1024) throw new Error("Project/rule imports are limited to 50 MiB."); action(JSON.parse(await file.text())); } catch (error) { notify(`Could not import: ${error.message}`); }
      element.value = "";
    };
  };
  importJson($("#projectInput"), restoreProject);
  importJson($("#rulesInput"), (data) => { if (data.format !== "cleardata-rules" || data.version !== 1) throw new Error("Unsupported rule file."); applyRuleConfig(data.rules); render(); notify("Rule definitions imported; review findings before applying changes."); });
}
