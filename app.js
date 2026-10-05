const state = { screen: "data", original: [], rows: [], headers: [], fileName: "", issues: [], changes: [], selectedIssue: null, selectedFix: "", query: "", flaggedOnly: false, customProposals: {}, aiMessage: "", proposalPending: false, scatter: {}, issueFilters: {}, ruleConfig: emptyRuleConfig(), auditEvents: [], decisionNotes: {} };
const $ = (selector) => document.querySelector(selector);
const screen = $("#screen");

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const records = [];
  let fields = [], value = "", quoted = false, closed = false, started = false;
  const finishRecord = () => {
    fields.push(value);
    if (started || fields.length > 1 || value !== "") records.push(fields);
    fields = []; value = ""; closed = false; started = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
      continue;
    }
    if (char === ",") { fields.push(value); value = ""; closed = false; started = true; }
    else if (char === "\n" || char === "\r") { finishRecord(); if (char === "\r" && source[i + 1] === "\n") i++; }
    else if (char === '"') {
      if (value !== "" || closed) throw new Error("Unexpected quote in CSV field.");
      quoted = true; started = true;
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field.");
      value += char; started = true;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  finishRecord();
  if (!records.length) throw new Error("CSV is empty.");
  const headers = records.shift().map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("Every CSV column needs a nonblank header.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV column headers must be unique.");
  if (headers.includes("_row")) throw new Error('The header "_row" is reserved for record identity. Rename it before importing.');
  const rows = records.map((record, index) => {
    if (record.length > headers.length) throw new Error(`CSV record ${index + 2} has more fields than the header.`);
    return { ...Object.fromEntries(headers.map((header, i) => [header, record[i] ?? ""])), _row: index + 1 };
  });
  if (!rows.length) throw new Error("CSV contains headers but no data records.");
  return { headers, rows };
}
function csvText(headers = state.headers, rows = state.rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n");
}
function issue(id, column, type, label, rows, severity, summary, recommendation, details = {}) { return { id, column, type, label, rows, severity, summary, recommendation, status: "open", ...details }; }
function numericColumns() { return cleaningProfile().columns.filter(profile => ["number", "integer"].includes(profile.role)).map(profile => profile.column); }
function quantile(sorted, p) { const position = (sorted.length - 1) * p; const lower = Math.floor(position); const upper = Math.ceil(position); return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); }
function numericStats(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); const mean = sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1); return { mean, median: quantile(sorted, .5) || 0, min: sorted[0] || 0, max: sorted[sorted.length - 1] || 0, q1: quantile(sorted, .25) || 0, q3: quantile(sorted, .75) || 0 }; }
function observedNumericEntries(column) {
  return state.rows.flatMap(row => {
    if (["missing", "not_applicable"].includes(cellInterpretation(row, column)) || CleaningEngine.missing(row[column], columnPolicy(column))) return [];
    try { return [{ row, raw: String(row[column]).trim(), value: CleaningEngine.parseNumber(row[column]) }]; } catch { return []; }
  });
}
function numericValues(column) { return observedNumericEntries(column).map(entry => entry.value); }
function outlierProfile(column, multiplier = 1.5) {
  const values = observedNumericEntries(column);
  if (values.length < 4) return null;
  const stats = numericStats(values.map(entry => entry.value)), iqr = stats.q3 - stats.q1;
  if (!iqr) return null;
  const lower = stats.q1 - multiplier * iqr, upper = stats.q3 + multiplier * iqr;
  return { rows: values.filter(entry => entry.value < lower || entry.value > upper).map(entry => entry.row), stats, lower, upper, multiplier };
}
function detectIssues() {
  const rows = state.rows; const issues = []; let id = 1;
  const numeric = new Set(numericColumns());
  state.headers.forEach((column) => {
    const missing = rows.filter((row) => !String(row[column] ?? "").trim() && cellInterpretation(row, column) !== "not_applicable");
    if (!missing.length) return;
    const isNumeric = numeric.has(column);
    issues.push(issue(id++, column, isNumeric ? "Missing numerical values" : "Missing values", `Missing ${column}`, missing, "high", `${missing.length} blank cells in ${column}. Review whether these are expected before filling; a blank is not necessarily an error.`, isNumeric ? "impute" : "keep"));
  });
  const ctr = rows.filter((row) => Number(row.click_through_rate) > 1); if (ctr.length) issues.push(issue(id++, "click_through_rate", "Mixed percentage scale", "Whole percentages mixed with decimals", ctr, "high", `${ctr.length} rate values are above 1 while comparable rates use decimals.`, "convert"));
  const channels = rows.filter((row) => /^(paid[_ -]social)$/i.test(row.channel) && row.channel !== "Paid Social"); if (channels.length) issues.push(issue(id++, "channel", "Nonstandard categories", "Paid Social label variants", channels, "medium", `${channels.length} labels use formatting variants of Paid Social.`, "standardize"));
  const dates = rows.filter((row) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row.launch_date)); if (dates.length) issues.push(issue(id++, "launch_date", "Mixed date formats", "Mixed launch date formats", dates, "medium", `${dates.length} dates use MM/DD/YYYY while the rest use ISO format.`, "date"));
  const invalidClicks = rows.filter((row) => [row.clicks, row.impressions].every((value) => String(value ?? "").trim() && Number.isFinite(Number(value))) && Number(row.clicks) > Number(row.impressions)); if (invalidClicks.length) issues.push(issue(id++, "clicks", "Cross-column violation", "Clicks exceed impressions", invalidClicks, "high", `${invalidClicks.length} rows have more clicks than impressions.`, "valid"));
  numericColumns().forEach((column) => {
    const profile = outlierProfile(column);
    if (profile?.rows.length) issues.push(issue(id++, column, "IQR numerical outliers", `Potential outliers in ${column}`, profile.rows, "medium", `${profile.rows.length} values fall outside the 1.5 × IQR fences (${profile.lower.toFixed(2)} to ${profile.upper.toFixed(2)}). Unusual does not mean incorrect.`, "outlier", { outlier: profile }));
  });
  appendReviewFindings(issues, id);
  appendCleaningCandidates(issues);
  state.issues = issues;
}
function loadData(text, name) {
  let data;
  try { data = parseCsv(text); } catch (error) { notify(`Could not import CSV: ${error.message}`); return false; }
  Object.assign(state, { screen: "data", headers: data.headers, original: data.rows.map((row) => ({ ...row })), allRows: data.rows, rows: data.rows, fileName: name, changes: [], selectedIssue: null, selectedRecord: null, locateRow: null, query: "", flaggedOnly: false, outlierDrafts: {}, customProposals: {}, aiMessage: "", proposalPending: false, scatter: {}, issueFilters: {}, datasetRevision: (state.datasetRevision || 0) + 1, ruleConfig: emptyRuleConfig(), auditEvents: [], decisionNotes: {}, projectId: null, projectName: "", projectDirty: true });
  state.aiInstructions = {};
  state.inspectionFiltersOpen = {};
  resetGuidedReview();
  detectIssues(); enableWorkspace(); render();
  startAutomaticReview();
  return true;
}
function enableWorkspace() { document.querySelectorAll(".nav-link").forEach((button) => { button.disabled = false; }); $("#batchButton").disabled = false; $("#contextAction").classList.remove("hidden"); $("#headerIssues").classList.remove("hidden"); }
function openCount() { return state.issues.filter((item) => item.status === "open").length; }
function inferType(header) { const role = cleaningProfile().columns.find(profile => profile.column === header)?.role || "text"; return role.charAt(0).toUpperCase() + role.slice(1); }
function metrics() {
  const original = new Map(state.original.map((row) => [row._row, row]));
  let changedCells = 0, changedRows = 0;
  state.rows.forEach((row) => {
    const count = state.headers.filter((header) => row[header] !== original.get(row._row)?.[header]).length;
    changedCells += count;
    if (count) changedRows++;
  });
  return { rows: state.rows.length, columns: state.headers.length, removedRows: state.original.length - state.rows.length, blanks: state.rows.reduce((total, row) => total + state.headers.filter((header) => !String(row[header] ?? "").trim()).length, 0), resolved: state.issues.filter((item) => item.status !== "open").length, changes: changedRows, changedRows, changedCells, decisions: state.changes.length };
}
function refreshChrome() {
  $("#datasetName").textContent = state.fileName || "No dataset loaded";
  $("#versionBadge").textContent = state.changes.length ? "Working version" : "Original";
  $("#navIssueCount").textContent = openCount();
  $("#headerIssues").textContent = `${openCount()} open findings`;
  $("#navChangeCount").textContent = state.changes.length;
  $("#navChangeCount").classList.toggle("hidden", !state.changes.length);
  $("#undoButton").classList.toggle("hidden", !state.changes.length);
  $("#contextAction").textContent = state.screen === "data" ? "Inspect data" : state.screen === "report" ? "Export cleaned CSV" : state.screen === "issues" && openCount() ? "Next finding →" : openCount() ? "Review findings →" : "View report →";
}
function render() {
  refreshChrome();
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.screen === state.screen));
  ({ data: renderData, view: renderSpreadsheet, issues: renderIssues, changes: renderChanges, report: renderReport })[state.screen]();
  if (state.screen === "data") { if (state.headers.length) { screen.insertAdjacentHTML?.("beforeend", cleaningOverviewHtml()); bindCleaningOverview(); } screen.insertAdjacentHTML?.("beforeend", workspaceTools()); bindWorkspaceTools(); }
  if (state.screen === "changes") decorateDecisionHistory();
}
function reviewOverview() {
  const open = state.issues.filter((item) => item.status === "open");
  return { open, rows: new Set(open.flatMap((item) => item.rows.map((row) => row._row))).size, columns: new Set(open.map((item) => item.column)).size, closed: state.issues.length - open.length };
}
function renderData() {
  $("#topEyebrow").textContent = "DATA SOURCE";
  if (!state.headers.length) {
    screen.innerHTML = `<section class="empty-state"><span class="source-icon">▤</span><p class="eyebrow">YOUR DATA. YOUR DECISIONS.</p><h1>From messy CSV to explainable changes.</h1><p>Find quality problems, compare treatments, and approve only what makes sense. Ask the AI copilot for a proposal when you need another approach.</p><div class="source-actions"><button class="primary" id="openCsv">Open CSV</button><button class="secondary" id="sampleCsv">Try a sample dataset</button></div><ol class="workflow-strip"><li><b>1. Inspect</b><span>Checks surface the evidence</span></li><li><b>2. Decide</b><span>You review the proposed impact</span></li><li><b>3. Keep control</b><span>Export or roll back any decision</span></li></ol><p class="ai-status" id="aiStatus" aria-live="polite">Checking AI availability...</p></section>`;
    $("#openCsv").onclick = () => $("#fileInput").click();
    $("#sampleCsv").onclick = () => loadSample();
    updateAiStatus();
    return;
  }
  const m = metrics(), overview = reviewOverview();
  const numeric = new Set(numericColumns());
  const profiles = state.headers.map((column) => {
    const values = state.rows.map((row) => String(row[column] ?? ""));
    const blanks = values.filter((value) => !value.trim()).length;
    const findings = overview.open.filter((item) => item.column === column);
    const stats = numeric.has(column) ? numericStats(numericValues(column)) : null;
    return `<tr><td><b>${escapeHtml(column)}</b></td><td>${inferType(column)}<small>inferred</small></td><td><span class="completeness-meter"><i style="width:${(state.rows.length - blanks) / state.rows.length * 100}%"></i></span>${blanks.toLocaleString()} blank${blanks === 1 ? "" : "s"}</td><td>${new Set(values.filter((value) => value.trim())).size.toLocaleString()}</td><td>${stats ? `${stats.min.toLocaleString(undefined, { maximumSignificantDigits: 6 })} – ${stats.max.toLocaleString(undefined, { maximumSignificantDigits: 6 })}` : "—"}</td><td>${findings.length ? `<button class="profile-finding" data-profile-issue="${findings[0].id}">${findings.length} to review →</button>` : '<span class="profile-clear">No open findings</span>'}</td></tr>`;
  }).join("");
  screen.innerHTML = `<section class="page-head"><div><p class="eyebrow">DATASET OVERVIEW</p><h1>${escapeHtml(state.fileName)}</h1><p>Source preserved · ${state.changes.length} approved decisions · ${m.changedCells} modified cells</p></div><button class="secondary" id="replaceSource">Replace CSV</button></section><section class="review-launch"><div><p class="eyebrow">YOUR NEXT STEP</p><h2>${overview.open.length ? `${overview.open.length} findings across ${overview.columns} columns` : "No open findings from the current checks"}</h2><p>${overview.rows.toLocaleString()} of ${m.rows.toLocaleString()} rows have open findings. Review findings in context; they are not automatically errors.</p></div><button class="primary" id="startReview">${overview.open.length ? "Review findings →" : "Inspect data →"}</button></section><section class="metric-grid"><article><span>WORKING ROWS</span><strong>${m.rows.toLocaleString()}</strong><small>${m.removedRows} removed from source</small></article><article><span>COLUMNS</span><strong>${m.columns}</strong><small>inferred types, not a schema</small></article><article><span>BLANK CELLS</span><strong>${m.blanks.toLocaleString()}</strong><small>may be legitimate</small></article><article><span>REVIEWED FINDINGS</span><strong>${overview.closed} / ${state.issues.length}</strong><small>closed does not mean corrected</small></article></section><section class="column-profile"><header><div><h2>Column profile</h2><p>Calculated locally from the working data. Types are suggestions; define schema rules for stricter checks.</p></div></header><div class="profile-scroll"><table class="profile-table"><thead><tr><th>Column</th><th>Type</th><th>Completeness</th><th>Distinct nonblank</th><th>Numeric range</th><th>Review</th></tr></thead><tbody>${profiles}</tbody></table></div></section><details class="coverage-note"><summary>What do these checks cover?</summary><p>Blank cells, IQR outliers in numerical columns, exact duplicate rows, and selected marketing format/category checks run automatically. Business-key duplicates, schema constraints, and derived metrics need your definitions. No findings means these checks found nothing; it does not certify the data.</p></details>`;
  $("#replaceSource").onclick = () => $("#fileInput").click();
  $("#startReview").onclick = () => overview.open.length ? openIssue(overview.open[0].id) : go("view");
  document.querySelectorAll("[data-profile-issue]").forEach((button) => button.onclick = () => openIssue(Number(button.dataset.profileIssue)));
}
async function updateAiStatus() { const status = $("#aiStatus"); if (!status) return; try { const response = await fetch("/api/ai/status", { cache: "no-store" }); if (!response.ok) throw new Error("Status request failed."); const result = await response.json(); status.textContent = result.available ? `AI configured: ${result.provider} · ${result.model} (provider health not tested)` : "AI proposals are not configured on this server."; status.classList.toggle("available", Boolean(result.available)); } catch { status.textContent = "AI status check could not reach the server"; } }
function renderIssues() {
  return renderGuidedIssues();
}
function renderLegacyIssues() {
  $("#topEyebrow").textContent = "ISSUE REVIEW";
  const overview = reviewOverview();
  const groups = overview.open.reduce((all, item) => ((all[item.column] ??= []).push(item), all), Object.create(null));
  const closed = state.issues.filter((item) => item.status !== "open");
  const groupHtml = Object.entries(groups).map(([column, items]) => `<article class="issue-group"><header><div><h2>${escapeHtml(column)}</h2><span>${inferType(column)} · ${new Set(items.flatMap((item) => item.rows.map((row) => row._row))).size} rows with open findings</span></div><b>${items.length} open</b></header>${items.map(renderIssueRow).join("")}</article>`).join("");
  screen.innerHTML = `<section class="page-head compact"><div><p class="eyebrow">HUMAN-IN-THE-LOOP REVIEW</p><h1>Make every change explainable.</h1><p>Inspect the evidence. Choose a treatment. Review its impact before approving.</p></div></section><section class="review-overview" aria-label="Review progress"><div><strong>${overview.open.length}</strong><span>open findings</span></div><div><strong>${overview.rows.toLocaleString()}</strong><span>rows to inspect</span></div><div><strong>${overview.closed}</strong><span>closed findings</span></div><div><strong>${metrics().changedCells}</strong><span>modified cells</span></div></section><details class="review-configuration"><summary>Define additional checks <span>Business keys, schema & derived metrics</span></summary><p>Automatic checks cannot know your business definitions. Add constraints without changing source values.</p><div class="workspace-actions"><button class="secondary" id="configureDuplicates">Review duplicates / keys</button><button class="secondary" id="configureSchema">Schema / metric rules</button></div></details><section class="issue-groups">${groupHtml || '<section class="empty-panel"><h2>Current findings are reviewed</h2><p>Inspect your data or define additional checks. Review completion is not a guarantee of correctness.</p><button class="primary" id="viewReviewedData">Inspect data</button></section>'}</section>${closed.length ? `<details class="closed-findings"><summary>${closed.length} closed findings <span>Accepted, finalized, or resolved by another change</span></summary>${closed.map(renderIssueRow).join("")}<p>Use Changes to inspect decisions or roll them back.</p></details>` : ""}`;
  $("#configureDuplicates").onclick = configureDuplicates;
  $("#configureSchema").onclick = showRuleEditor;
  $("#viewReviewedData")?.addEventListener("click", () => go("view"));
  bindIssueLinks();
}
function renderIssueRow(item) {
  const expanded = state.selectedIssue === item.id && item.status === "open";
  const status = item.status === "open" ? (expanded ? "Collapse ↑" : "Review →") : item.status === "valid" ? "Accepted unchanged" : item.status === "resolved" ? "Resolved by related change" : "Finalized";
  const recordSummary = expanded && item.recommendation === "outlier" ? `${previewOutlier(item).rows.length.toLocaleString()} records match the displayed definition` : `${item.rows.length.toLocaleString()} records · ${item.recommendation === "outlier" ? "Numerical outlier review" : escapeHtml(item.type)}`;
  return `<div class="issue-row ${item.status !== "open" ? "resolved" : ""}"><button class="issue-summary" data-open-issue="${item.id}" aria-expanded="${expanded}"><span class="severity-dot ${item.severity}" aria-hidden="true"></span><span><b>${escapeHtml(item.label)}</b><small>${recordSummary}</small></span><em>${status}</em></button>${expanded ? renderIssueWorkspace(item) : ""}</div>`;
}
function categoryProfile(item) { const counts = state.rows.map((row) => String(row[item.column] ?? "")).filter((value) => value.trim()).reduce((all, value) => ((all[value] = (all[value] || 0) + 1, all)), Object.create(null)); return { counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), variants: Object.entries(counts).filter(([value]) => value.replace(/[ _-]/g, "").toLowerCase() === "paidsocial") }; }
function categoryImpact(item, action) {
  const profile = categoryProfile(item);
  const proposal = action.startsWith("custom:") ? proposals(item).find((entry) => entry.id === action.slice(7)) : null;
  const mapping = proposal?.mapping || (action === "standardize" ? Object.fromEntries(profile.variants.map(([value]) => [value, "Paid Social"])) : action === "mapOnly" ? { paid_social: "Paid Social" } : {});
  const modified = item.rows.filter((row) => Object.hasOwn(mapping, row[item.column]) && mapping[row[item.column]] !== row[item.column]).length;
  return { profile, mapping, modified };
}
function proposals(item) { return state.customProposals[item.id] || []; }
function histogram(values, min, max, bins = 24) {
  const width = (max - min || 1) / bins;
  const counts = Array(bins).fill(0);
  let below = 0, above = 0;
  values.filter(Number.isFinite).forEach((value) => {
    if (value < min) below++;
    else if (value > max) above++;
    else counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
  });
  return { counts, below, above };
}
function numericSimulation(item, action) {
  const before = numericValues(item.column), stats = numericStats(before);
  const proposal = action.startsWith("custom:") ? proposals(item).find((entry) => entry.id === action.slice(7)) : null;
  const rawFill = action === "imputeMean" ? stats.mean : proposal?.operation === "fill" ? proposal.value : stats.median;
  const fill = Number(Number(rawFill).toFixed(2));
  const after = ["imputeMedian", "imputeMean"].includes(action) || proposal?.operation === "fill" ? [...before, ...item.rows.filter((row) => !String(row[item.column] ?? "").trim()).map(() => fill)] : before;
  return { before, after, beforeStats: stats, afterStats: numericStats(after), fill };
}
function histogramChart(item, action) {
  const sim = numericSimulation(item, action);
  const observed = [...sim.before].sort((a, b) => a - b);
  if (!observed.length) return '<p class="hist-empty">No observed numerical values to plot.</p>';
  const min = quantile(observed, .01), max = quantile(observed, .99);
  const before = histogram(sim.before, min, max), after = histogram(sim.after, min, max);
  const scale = Math.max(...before.counts, ...after.counts, before.below, before.above, after.below, after.above, 1);
  const format = (value) => Number(value).toLocaleString(undefined, { maximumSignificantDigits: 6 });
  const bars = (original, simulated, label) => `<span aria-label="${escapeHtml(`${label}: Before ${original}, simulated after ${simulated}`)}"><i class="before" style="height:${original / scale * 100}%;${original ? "" : "display:none"}" title="Before: ${original}"></i><i class="after" style="height:${simulated / scale * 100}%;${simulated ? "" : "display:none"}" title="Simulated after: ${simulated}"></i></span>`;
  const edge = (key, symbol, bound) => {
    if (!before[key] && !after[key]) return "";
    const label = `${symbol} ${format(bound)}`;
    const countLabel = (count) => `${count.toLocaleString()} ${count === 1 ? "value" : "values"} ${label}`;
    return `<div class="hist-edge" data-edge="${key}"><div class="hist-bars overlay">${bars(before[key], after[key], label)}</div><div class="hist-edge-label"><b>${escapeHtml(label)}</b><span>Before: ${escapeHtml(countLabel(before[key]))}</span><span>After: ${escapeHtml(countLabel(after[key]))}</span></div></div>`;
  };
  const trueMin = observed[0], trueMax = observed.at(-1);
  const afterMin = sim.afterStats.min, afterMax = sim.afterStats.max;
  return `<div class="histogram"><small>OVERLAPPING DISTRIBUTIONS <i class="legend-before"></i> Before <i class="legend-after"></i> Simulated after</small><p class="hist-range-note">Observed 1st–99th percentile · 24 bins · edge buckets share the count scale</p><div class="hist-layout">${edge("below", "<", min)}<div class="hist-center"><div class="hist-bars overlay">${before.counts.map((count, index) => bars(count, after.counts[index], `${format(min + (max - min) * index / 24)} to ${format(min + (max - min) * (index + 1) / 24)}`)).join("")}</div><p class="hist-axis"><span>${format(min)}</span><span>${escapeHtml(item.column)}</span><span>${format(max)}</span></p></div>${edge("above", ">", max)}</div><p class="hist-extrema">True observed min: <b>${format(trueMin)}</b> · max: <b>${format(trueMax)}</b>${afterMin !== trueMin || afterMax !== trueMax ? `<br>True simulated min: <b>${format(afterMin)}</b> · max: <b>${format(afterMax)}</b>` : ""}</p></div>`;
}
function issueKey(item) { return item.recommendation === "duplicates" ? "dataset:duplicates" : JSON.stringify([item.column, item.recommendation, item.candidateId || item.ruleId || ""]); }
function reviewFingerprint(item, rows = item.rows) {
  const columns = item.recommendation === "duplicates" ? state.headers : item.rule ? [...new Set([item.column, item.rule.left, item.rule.right].filter(Boolean))] : item.type === "Cross-column violation" ? [item.column, "impressions"] : [item.column];
  return JSON.stringify([item.rule || item.duplicateDefinition || null, rows.map((row) => [row._row, ...columns.map((column) => row[column])])]);
}
function refreshIssues() {
  invalidateCleaningProfile();
  const previous = state.issues;
  detectIssues();
  const detected = new Map(state.issues.map((item) => [issueKey(item), item]));
  let nextId = Math.max(0, ...previous.map((item) => item.id));
  state.issues = previous.map((item) => {
    let fresh = detected.get(issueKey(item));
    detected.delete(issueKey(item));
    if (item.recommendation === "outlier") {
      const profile = evaluateOutlier(item, item.outlierDefinition || defaultOutlierDefinition(item));
      fresh = { ...item, rows: profile.rows, outlier: profile, summary: `${profile.rows.length} values match the saved rule. ${profile.note}` };
    }
    const decision = state.changes.find((change) => change.issue.id === item.id);
    if (fresh) fresh.rows = fresh.rows.filter(row => !state.changes.some(change => change.issue.id === item.id && change.disposition === "valid" && change.reviewedFingerprints?.[row._row] === reviewFingerprint(fresh, [row])));
    if (!fresh || !fresh.rows.length) {
      item.status = decision ? decision.disposition : "resolved";
      item.currentRows = [];
      if (item.recommendation === "outlier") { item.rows = fresh.rows; item.outlier = fresh.outlier; item.summary = fresh.summary; }
      return item;
    }
    const accepted = decision?.disposition === "valid" && decision.fingerprint === reviewFingerprint(fresh);
    Object.assign(item, { column: fresh.column, rows: fresh.rows, currentRows: fresh.rows, summary: fresh.summary, rule: fresh.rule || item.rule, candidate: fresh.candidate || item.candidate, duplicateProfile: fresh.duplicateProfile, duplicateDefinition: fresh.duplicateDefinition || item.duplicateDefinition, outlier: fresh.outlier || item.outlier, status: accepted ? "valid" : "open" });
    return item;
  });
  detected.forEach((item) => { item.id = ++nextId; state.issues.push(item); });
  state.scatter = {};
  state.customProposals = {};
  state.proposalPending = false;
  state.datasetRevision = (state.datasetRevision || 0) + 1;
  invalidateCleaningProfile();
  invalidateGuidedReview();
  markProjectDirty();
}
function isoDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value));
  if (!match) throw new Error("Date must use MM/DD/YYYY before conversion.");
  const [, month, day, year] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) throw new Error(`Invalid calendar date: ${value}`);
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function applyFix(item, action) {
  try {
    if (!item || item.status !== "open") throw new Error("Reopen an unresolved issue before approving a decision.");
    if (item.recommendation === "duplicates") return approveDuplicateDecision(item, action);
    if (item.recommendation === "outlier" && !saveOutlierRule(item, false)) return;
    const allowed = { impute: ["imputeMean", "imputeMedian", "keep"], convert: ["convert", "valid"], standardize: ["standardize", "mapOnly", "valid"], date: ["date", "valid"], metric: ["recalculateMetric", "valid", "keep"] };
    const proposal = action.startsWith("custom:") ? proposals(item).find((entry) => entry.id === action.slice(7)) : null;
    if (!(allowed[item.recommendation] || ["valid", "keep"]).includes(action) && !proposal) throw new Error("Choose a treatment supported by this issue.");
    if (proposal && (proposal.revision !== state.datasetRevision || !["impute", "standardize"].includes(item.recommendation))) throw new Error("Generate a new proposal for the current dataset before approving.");
    const rows = [...item.rows];
    if (!rows.length) throw new Error("This rule has no affected records to approve.");
    const fill = ["imputeMean", "imputeMedian"].includes(action) || proposal?.operation === "fill" ? numericSimulation(item, action).fill.toFixed(2) : null;
    const mapping = item.recommendation === "standardize" ? categoryImpact(item, action).mapping : {};
    const originals = rows.map((row) => ({ row, value: row[item.column] }));
    const patches = originals.map(({ row, value }) => {
      let after = value;
      if (fill !== null && !String(value ?? "").trim()) after = fill;
      if (action === "convert" && Number(value) > 1) after = (Number(value) / 100).toFixed(4);
      if (action === "date") after = isoDate(value);
      if (action === "recalculateMetric") {
        const result = metricResult(row, item.rule);
        if (result.error) throw new Error(result.error);
        after = result.value;
      }
      if (Object.hasOwn(mapping, value)) after = mapping[value];
      return { rowId: row._row, column: item.column, before: value, after };
    });
    // Calculate every patch before mutating: invalid dates cannot partially apply.
    patches.forEach((patch, index) => { rows[index][item.column] = patch.after; });
    const disposition = ["valid", "keep"].includes(action) ? "valid" : "finalized";
    state.changes.unshift({ id: newReviewId(), createdAt: new Date().toISOString(), issue: item, title: proposal ? "Custom AI proposal" : action, disposition, rows, before: originals.slice(0, 3).map((entry) => entry.value).join(", "), after: patches.slice(0, 3).map((patch) => patch.after).join(", "), reason: proposal?.interpretation || item.summary, note: state.decisionNotes?.[item.id] || "", originals, patches: patches.filter((patch) => patch.before !== patch.after), removedRows: [], fingerprint: reviewFingerprint(item, rows) });
    if (proposal) state.changes[0].proposalCaveats = { assumptions: proposal.assumptions || [], warnings: proposal.warnings || [] };
    recordDecisionEvent(state.changes[0]);
    refreshIssues();
    state.selectedIssue = null;
    notify("Decision finalized and added to history.");
    render();
  } catch (error) { notify(error.message); }
}
function openIssue(id) {
  if (!id) return;
  const item = state.issues.find((entry) => entry.id === id);
  if (!item || item.status !== "open") return notify("This finding is closed. Inspect its decision in Changes, or roll it back to reopen it.");
  const opening = state.screen !== "issues" || state.selectedIssue !== id;
  state.selectedIssue = opening ? id : null;
  if (opening) state.reviewStep = 1;
  if (opening) state.selectedFix = "";
  state.aiMessage = "";
  go("issues");
  if (opening) document.querySelector(`[data-open-issue="${id}"]`)?.scrollIntoView?.({ block: "start" });
}
function renderChanges() {
  $("#topEyebrow").textContent = "CHANGE HISTORY";
  screen.innerHTML = `<section class="page-head compact"><div><p class="eyebrow">WORKING VERSION</p><h1>Transparent change history</h1></div></section>${state.changes.length ? `<section class="change-list">${state.changes.map((change) => `<article class="change-card"><header><div><span class="status-badge success">${change.disposition === "valid" ? "ACCEPTED — NO CHANGE" : "FINALIZED"}</span><h2>${escapeHtml(change.issue.column)} · ${escapeHtml(change.title)}</h2><p>${change.rows.length} records reviewed · ${change.patches.length} cells modified · ${(change.removedRows || []).length} records removed</p><small>${escapeHtml(change.createdAt)}</small></div><button class="secondary" data-rollback="${change.id}">Rollback</button></header><div class="comparison"><div><small>BEFORE THIS DECISION</small><p>${escapeHtml(change.before)}</p></div><span>→</span><div><small>AFTER THIS DECISION</small><p>${escapeHtml(change.after)}</p></div></div><p>${escapeHtml(change.reason)}</p>${change.note ? `<p><b>Analyst rationale:</b> ${escapeHtml(change.note)}</p>` : ""}</article>`).join("")}</section>` : `<section class="empty-panel"><h2>No approved decisions yet</h2><button class="secondary" id="reviewIssues">Review issues</button></section>`}`;
  $("#reviewIssues")?.addEventListener("click", () => go("issues"));
  document.querySelectorAll("[data-rollback]").forEach((button) => button.onclick = () => confirmRollback(button.dataset.rollback));
}
function renderReport() {
  $("#topEyebrow").textContent = "QUALITY REPORT";
  const m = metrics();
  screen.innerHTML = `<section class="page-head report-head"><div><p class="eyebrow">WORKING VERSION SUMMARY</p><h1>Quality report</h1><p>${openCount()} findings remain for review. Accepted findings may retain blanks or unusual values.</p></div><button class="primary" id="downloadCsv">Export cleaned CSV ↓</button></section><section class="metric-grid report-metrics"><article><span>DATASET</span><strong>${m.rows.toLocaleString()} × ${m.columns}</strong></article><article><span>FINDINGS</span><strong>${state.issues.length}</strong><small>${m.resolved} closed · ${m.decisions} approved decisions</small></article><article><span>MODIFIED ROWS</span><strong>${m.changedRows}</strong><small>${m.changedCells} modified cells compared with source</small></article><article><span>OPEN</span><strong>${openCount()}</strong><small>${m.blanks} blank cells retained</small></article></section>`;
  $("#downloadCsv").onclick = downloadCsv;
  screen.insertAdjacentHTML?.("beforeend", `<p class="review-scope">${m.removedRows} source records removed from the working dataset. Removed rows are separate from modified cells.</p>${reportExportControls()}`);
  bindReportExports();
}
function rollbackChange(id) {
  const change = state.changes.find((entry) => entry.id === id);
  if (!change) return false;
  const beforeRows = state.rows.map((row) => ({ ...row }));
  state.changes = state.changes.filter((entry) => entry !== change);
  const original = new Map(state.original.map((row) => [row._row, row]));
  const working = new Map(state.allRows.map((row) => [row._row, row]));
  state.allRows.forEach((row) => state.headers.forEach((header) => { row[header] = original.get(row._row)[header]; }));
  const removed = new Set();
  // Replay stored values, not recalculated treatments, so later approvals survive.
  [...state.changes].reverse().forEach((entry) => { entry.patches.forEach((patch) => { working.get(patch.rowId)[patch.column] = patch.after; }); (entry.removedRows || []).forEach((row) => removed.add(row._row)); });
  state.rows = state.allRows.filter((row) => !removed.has(row._row));
  recordRollbackEvent(change, beforeRows, state.rows);
  refreshIssues();
  state.selectedIssue = null;
  return true;
}
function confirmRollback(id) {
  const change = state.changes.find((entry) => entry.id === id);
  if (!change) return;
  $("#dialogContent").innerHTML = `<p class="eyebrow">ROLLBACK DECISION</p><h2>Undo this decision for ${change.rows.length} reviewed records?</h2><p>Later approved values will be preserved. Findings will be checked again.</p><div class="dialog-actions"><button class="secondary" id="cancelRollback">Cancel</button><button class="primary" id="doRollback">Undo decision</button></div>`;
  $("#confirmDialog").showModal();
  $("#cancelRollback").onclick = () => $("#confirmDialog").close();
  $("#doRollback").onclick = () => { rollbackChange(id); $("#confirmDialog").close(); render(); };
}
function go(name) { if (!state.headers.length && name !== "data") return; state.screen = name; render(); }
function loadSample(name) {
  const samples = [
    ["healthcare_patient_visits.csv", "Healthcare patient visits", "Patient visits, clinical measurements, and readmissions"],
    ["sales_orders.csv", "Sales orders", "Orders, pricing, profitability, and delivery metrics"],
    ["marketing_campaigns.csv", "Marketing campaigns", "Campaign spend, conversions, and performance metrics"],
  ];
  if (name) {
    fetch(new URL(name, window.location.origin), { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`Sample request returned ${response.status}.`);
      return response.text();
    }).then((text) => loadData(text, name)).catch((error) => {
      console.error("Sample load failed:", error);
      notify(`Could not open ${name}: ${error.message}`);
    });
    return;
  }
  screen.innerHTML = `<section class="empty-state sample-picker"><p class="eyebrow">BUNDLED SAMPLE DATA</p><h1>Choose a dataset to review.</h1><p>Each sample contains realistic quality problems for a local, reversible cleaning workflow.</p><div class="sample-list">${samples.map(([file, title, description]) => `<button class="sample-option" data-sample="${file}"><b>${title}</b><small>${description}</small></button>`).join("")}</div><button class="ghost" id="backToSource">Back</button></section>`;
  document.querySelectorAll("[data-sample]").forEach((button) => button.onclick = () => loadSample(button.dataset.sample));
  $("#backToSource").onclick = render;
}
function downloadCsv() { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csvText()], { type: "text/csv" })); link.download = `cleaned-${state.fileName || "dataset.csv"}`; link.click(); URL.revokeObjectURL(link.href); }
function notify(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3000); }
$("#navigation").onclick = (event) => {
  const button = event.target.closest("[data-screen]");
  if (button && !button.disabled) go(button.dataset.screen);
};
$("#fileInput").onchange = (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => loadData(reader.result, file.name);
    reader.readAsText(file);
  }
  event.target.value = "";
};
$("#contextAction").onclick = () => {
  if (state.screen === "report") return downloadCsv();
  if (state.screen === "data") return go("view");
  const open = state.issues.filter((item) => item.status === "open");
  if (!open.length) return go("report");
  const index = state.screen === "issues" ? open.findIndex((item) => item.id === state.selectedIssue) : -1;
  const next = open[(index + 1) % open.length];
  if (next.id !== state.selectedIssue || state.screen !== "issues") openIssue(next.id);
};
$("#undoButton").onclick = () => state.changes[0] && confirmRollback(state.changes[0].id);
$("#batchButton").onclick = () => go("issues");
render();
function scatterData(item) {
  const columns = numericColumns();
  const selected = state.scatter[item.id] ||= { x: item.column, y: columns.find((column) => column !== item.column) || item.column };
  selected.x = columns.includes(selected.x) ? selected.x : item.column;
  selected.y = columns.includes(selected.y) ? selected.y : columns.find((column) => column !== selected.x) || selected.x;
  const points = state.rows.map((row) => ({ row, rawX: String(row[selected.x] ?? "").trim(), rawY: String(row[selected.y] ?? "").trim(), x: Number(row[selected.x]), y: Number(row[selected.y]) })).filter((point) => point.rawX && point.rawY && Number.isFinite(point.x) && Number.isFinite(point.y));
  const range = (key) => points.length ? [Math.min(...points.map((point) => point[key])), Math.max(...points.map((point) => point[key]))] : [0, 1];
  const [minX, maxX] = range("x"), [minY, maxY] = range("y");
  return { columns, selected, points, minX, maxX, minY, maxY };
}
function scatterChart(item) {
  const { columns, selected } = scatterData(item);
  return `<div class="scatter-panel" data-scatter-panel="${item.id}"><div class="scatter-controls"><label>X axis<select data-scatter-axis="x" data-issue="${item.id}">${columns.map((column) => `<option ${column === selected.x ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select></label><label>Y axis<select data-scatter-axis="y" data-issue="${item.id}">${columns.map((column) => `<option ${column === selected.y ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select></label><button class="secondary scatter-reset" type="button" data-scatter-reset="${item.id}">Reset view</button></div><svg class="scatter-plot" data-scatter-plot="${item.id}" viewBox="0 0 100 100" role="img"></svg><p class="scatter-hint">Scroll to zoom · drag to pan</p><p class="scatter-note"><b>●</b> Matches the displayed rule · axes only change the view</p></div>`;
}
function formatScale(value, span) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3 }); }
function renderScatterPlot(item) {
  const svg = document.querySelector(`[data-scatter-plot="${item.id}"]`); if (!svg) return;
  const data = scatterData(item); const { selected, points, minX, maxX, minY, maxY } = data;
  if (!points.length) { svg.innerHTML = `<text x="50" y="48" text-anchor="middle">No paired numeric values</text>`; return; }
  const fullX = maxX - minX || 1, fullY = maxY - minY || 1, view = selected.viewport ||= { minX, maxX, minY, maxY }, xSpan = view.maxX - view.minX || fullX, ySpan = view.maxY - view.minY || fullY;
  const left = 18, right = 96, top = 5, bottom = 82, px = (value) => left + (value - view.minX) / xSpan * (right - left), py = (value) => bottom - (value - view.minY) / ySpan * (bottom - top);
  const ticks = (min, max, axis) => Array.from({ length: 5 }, (_, index) => { const value = min + (max - min) * index / 4, position = axis === "x" ? px(value) : py(value); return axis === "x" ? `<line x1="${position}" y1="${top}" x2="${position}" y2="${bottom}"/><text x="${position}" y="90" text-anchor="middle">${formatScale(value, max - min)}</text>` : `<line x1="${left}" y1="${position}" x2="${right}" y2="${position}"/><text x="15" y="${position + 1.8}" text-anchor="end">${formatScale(value, max - min)}</text>`; }).join("");
  const flagged = new Set(activeRows(item).map((row) => row._row)); const plot = points.map((point) => `<circle class="${flagged.has(point.row._row) ? `outlier-point ${state.selectedRecord === point.row._row ? "selected-point" : ""}` : "normal-point"}" cx="${px(point.x)}" cy="${py(point.y)}" r="${state.selectedRecord === point.row._row ? 3.8 : flagged.has(point.row._row) ? 2.5 : 1.6}"><title>Row ${point.row._row}: ${escapeHtml(selected.x)} ${point.x}, ${escapeHtml(selected.y)} ${point.y}</title></circle>`).join("");
  svg.setAttribute("aria-label", `Scatter plot of ${selected.x} by ${selected.y}`); svg.innerHTML = `<defs><clipPath id="scatter-clip-${item.id}"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></clipPath></defs><g class="scatter-grid">${ticks(view.minX, view.maxX, "x")}${ticks(view.minY, view.maxY, "y")}</g><path class="scatter-axis" d="M${left} ${top}V${bottom}H${right}"/><g clip-path="url(#scatter-clip-${item.id})">${plot}</g><text class="scatter-axis-title" x="${(left + right) / 2}" y="98" text-anchor="middle">${escapeHtml(selected.x)}</text><text class="scatter-axis-title" x="4" y="${(top + bottom) / 2}" text-anchor="middle" transform="rotate(-90 4 ${(top + bottom) / 2})">${escapeHtml(selected.y)}</text>`;
}
function bindScatterNavigation(item) {
  const svg = document.querySelector(`[data-scatter-plot="${item.id}"]`); if (!svg) return;
  const position = (event) => { const box = svg.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width * 100, y: (event.clientY - box.top) / box.height * 100 }; };
  const constrain = (view, data) => { const spanX = view.maxX - view.minX, spanY = view.maxY - view.minY, fullX = data.maxX - data.minX || 1, fullY = data.maxY - data.minY || 1; if (spanX >= fullX) [view.minX, view.maxX] = [data.minX, data.maxX]; else if (view.minX < data.minX) { view.maxX += data.minX - view.minX; view.minX = data.minX; } else if (view.maxX > data.maxX) { view.minX -= view.maxX - data.maxX; view.maxX = data.maxX; } if (spanY >= fullY) [view.minY, view.maxY] = [data.minY, data.maxY]; else if (view.minY < data.minY) { view.maxY += data.minY - view.minY; view.minY = data.minY; } else if (view.maxY > data.maxY) { view.minY -= view.maxY - data.maxY; view.maxY = data.maxY; } };
  svg.addEventListener("wheel", (event) => { event.preventDefault(); const data = scatterData(item), view = data.selected.viewport ||= { minX: data.minX, maxX: data.maxX, minY: data.minY, maxY: data.maxY }, cursor = position(event), factor = event.deltaY < 0 ? .8 : 1.25, oldX = view.maxX - view.minX, oldY = view.maxY - view.minY, nextX = Math.max((data.maxX - data.minX || 1) / 10000, oldX * factor), nextY = Math.max((data.maxY - data.minY || 1) / 10000, oldY * factor), xRatio = Math.max(0, Math.min(1, (cursor.x - 18) / 78)), yRatio = Math.max(0, Math.min(1, (82 - cursor.y) / 77)); view.minX += (oldX - nextX) * xRatio; view.maxX = view.minX + nextX; view.minY += (oldY - nextY) * yRatio; view.maxY = view.minY + nextY; constrain(view, data); renderScatterPlot(item); }, { passive: false });
  const stopDragging = () => { dragging = null; svg.classList.remove("is-panning"); document.body.classList.remove("scatter-panning"); };
  let dragging; svg.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); dragging = position(event); svg.classList.add("is-panning"); document.body.classList.add("scatter-panning"); svg.setPointerCapture(event.pointerId); }); svg.addEventListener("pointermove", (event) => { if (!dragging) return; event.preventDefault(); const current = position(event), data = scatterData(item), view = data.selected.viewport, dx = (current.x - dragging.x) / 78 * (view.maxX - view.minX), dy = (current.y - dragging.y) / 77 * (view.maxY - view.minY); view.minX -= dx; view.maxX -= dx; view.minY += dy; view.maxY += dy; dragging = current; constrain(view, data); renderScatterPlot(item); }); svg.addEventListener("pointerup", stopDragging); svg.addEventListener("pointercancel", stopDragging); svg.addEventListener("lostpointercapture", stopDragging);
}

function renderOutlierWorkspace(item) {
  const profile = previewOutlier(item);
  const choices = [["valid", "Accept as legitimate", "I reviewed the matching values; keep them unchanged."], ["keep", "Keep unchanged with a note", "Record why these observations should be retained."]];
  if (!choices.some(([id]) => id === state.selectedFix)) state.selectedFix = choices[0][0];
  return `<div class="review-workspace outlier-review"><div class="review-top"><div class="analysis-panel"><p class="eyebrow">1 · EVIDENCE & DEFINITION</p><h3>What makes these values unusual?</h3><p>Calculated locally on <b>${escapeHtml(item.column)}</b>. Change the definition to inspect a different matching set.</p>${outlierControls(item)}</div><div class="fix-panel"><p class="eyebrow">2 · YOUR DECISION</p><h3>Unusual does not mean incorrect.</h3><p>These controls define a finding and record a no-change decision. They do not cap, replace, or remove outliers.</p>${choices.map(([id, title, detail]) => `<label class="fix-option ${state.selectedFix === id ? "selected" : ""}"><input type="radio" name="fix" value="${id}" ${state.selectedFix === id ? "checked" : ""}><span><b>${title}</b><small>${detail}</small></span></label>`).join("")}<p class="review-scope">If the source needs correction, leave this finding open while you investigate.</p></div><div class="impact-panel"><p class="eyebrow">3 · REVIEW THE IMPACT</p><h3>${profile.rows.length.toLocaleString()} matching values · 0 cells changed</h3>${scatterChart(item)}<p>Highlighted points match the displayed definition. No data changes until an approved treatment supports them.</p></div></div>${affectedRecords(item)}<footer class="decision-bar"><span>Approve review of <b>${profile.rows.length.toLocaleString()} matching records</b><small>Source values stay unchanged. The displayed definition is saved with your decision.</small></span><button class="ghost" data-defer>Decide later</button><button class="primary" data-finalize="${item.id}">Approve no-change decision</button></footer></div>`;
}
function bindReviewControls() {
  document.querySelectorAll("[data-open-issue]").forEach((button) => button.onclick = () => {
    const item = state.issues.find((entry) => entry.id === Number(button.dataset.openIssue));
    if (item.status !== "open") return notify("This finding is closed. Use Changes to roll back an approved decision.");
    openIssue(item.id);
  });
  document.querySelectorAll("input[name=fix]").forEach((input) => input.onchange = () => { state.selectedFix = input.value; renderIssues(); });
  const changeFilter = (el, key) => { const [id, index] = el.dataset[key].split(":").map(Number); issueFilter(state.issues.find((x) => x.id === id)).conditions[index][key.replace("filter", "").toLowerCase()] = el.value; renderIssues(); };
  document.querySelectorAll("[data-filter-field]").forEach((el) => el.onchange = () => changeFilter(el, "filterField"));
  document.querySelectorAll("[data-filter-operator]").forEach((el) => el.onchange = () => changeFilter(el, "filterOperator"));
  document.querySelectorAll("[data-filter-value]").forEach((el) => el.onchange = () => changeFilter(el, "filterValue"));
  document.querySelectorAll("[data-filter-join]").forEach((el) => el.onchange = () => { issueFilter(state.issues.find((x) => x.id === Number(el.dataset.filterJoin))).join = el.value; renderIssues(); });
  document.querySelectorAll("[data-add-filter]").forEach((el) => el.onclick = () => { issueFilter(state.issues.find((x) => x.id === Number(el.dataset.addFilter))).conditions.push({ column: state.headers[0], operator: "contains", value: "" }); renderIssues(); });
  document.querySelectorAll("[data-remove-filter]").forEach((el) => el.onclick = () => { const [id, index] = el.dataset.removeFilter.split(":").map(Number); const filter = issueFilter(state.issues.find((x) => x.id === id)); if (filter.conditions.length > 1) filter.conditions.splice(index, 1); renderIssues(); });
  document.querySelectorAll("[data-clear-filters]").forEach((el) => el.onclick = () => { Object.assign(issueFilter(state.issues.find((x) => x.id === Number(el.dataset.clearFilters))), { join: "AND", conditions: [{ column: state.headers[0], operator: "contains", value: "" }] }); renderIssues(); });
  document.querySelectorAll("[data-outlier-method]").forEach((el) => el.onchange = () => { outlierDraft(state.issues.find((x) => x.id === Number(el.dataset.outlierMethod))).method = el.value; renderIssues(); });
  document.querySelectorAll("[data-outlier-input]").forEach((el) => el.onchange = () => { const [id, key] = el.dataset.outlierInput.split(":"); outlierDraft(state.issues.find((x) => x.id === Number(id)))[key] = el.value; renderIssues(); });
  document.querySelectorAll("[data-save-outlier]").forEach((el) => el.onclick = () => { saveOutlierRule(state.issues.find((x) => x.id === Number(el.dataset.saveOutlier))); renderIssues(); });
  document.querySelectorAll("[data-select-record]").forEach((el) => el.onclick = (event) => { if (!event.target.closest("button")) { state.selectedRecord = Number(el.dataset.selectRecord.split(":")[1]); renderIssues(); } });
  document.querySelectorAll("[data-locate-row]").forEach((el) => el.onclick = () => locateRecord(Number(el.dataset.locateRow)));
  document.querySelectorAll("[data-finalize]").forEach((el) => {
    const item = state.issues.find((x) => x.id === Number(el.dataset.finalize));
    el.disabled = state.proposalPending || (item.recommendation === "outlier" && (!!previewOutlier(item).error || !activeRows(item).length));
    el.onclick = () => applyFix(item, state.selectedFix);
  });
  document.querySelectorAll("[data-scatter-axis]").forEach((el) => el.onchange = () => { const item = state.issues.find((x) => x.id === Number(el.dataset.issue)); const selected = scatterData(item).selected; selected[el.dataset.scatterAxis] = el.value; delete selected.viewport; renderIssues(); });
  document.querySelectorAll("[data-scatter-reset]").forEach((el) => el.onclick = () => { const item = state.issues.find((x) => x.id === Number(el.dataset.scatterReset)); delete scatterData(item).selected.viewport; renderScatterPlot(item); });
  document.querySelectorAll("[data-scatter-plot]").forEach((el) => { const item = state.issues.find((x) => x.id === Number(el.dataset.scatterPlot)); renderScatterPlot(item); bindScatterNavigation(item); });
  document.querySelectorAll("[data-defer]").forEach((el) => el.onclick = () => { state.selectedIssue = null; renderIssues(); });
}
function locateRecord(rowId) {
  if (!state.rows.some((row) => row._row === rowId)) return notify("Record not found in the current dataset.");
  state.selectedRecord = rowId;
  state.locateRow = rowId;
  state.query = "";
  state.flaggedOnly = false;
  go("view");
}

// An outlier rule is a review definition, not a correction decision.
state.outlierDrafts ||= {}; state.selectedRecord ||= null;
function activeRows(item) { return item.recommendation === "outlier" ? previewOutlier(item).rows : item.rows; }
function defaultOutlierDefinition(item) { return { method: "iqr", multiplier: 1.5, zScore: 3, low: 1, high: 99, lower: "", upper: "", field: item.column, operator: ">=", value: "" }; }
function outlierDraft(item) { return state.outlierDrafts[item.id] ||= { ...(item.outlierDefinition || defaultOutlierDefinition(item)) }; }
function match(row, filter) {
  const text = String(row[filter.column] ?? "").trim(), query = String(filter.value ?? "").trim(), a = Number(text), b = Number(query);
  if (!query) return true;
  if (filter.operator === "contains") return text.toLowerCase().includes(query.toLowerCase());
  if ([">", "<", ">=", "<="].includes(filter.operator)) return !!text && Number.isFinite(a) && Number.isFinite(b) && ({ ">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b })[filter.operator];
  const equal = text && Number.isFinite(a) && Number.isFinite(b) ? a === b : text.toLowerCase() === query.toLowerCase();
  return filter.operator === "!=" ? !equal : equal;
}
function evaluateOutlier(item, d) {
  const values = observedNumericEntries(item.column);
  const stats = numericStats(values.map((entry) => entry.value));
  let rows = [], note = "", lower, upper, sd;
  const fail = (error) => ({ rows: [], note: error, error, method: d.method, stats });
  const finite = (value) => String(value).trim() !== "" && Number.isFinite(Number(value));
  if (d.method !== "custom" && !values.length) return fail("No observed numerical values for this rule.");
  if (d.method === "iqr") {
    if (!finite(d.multiplier) || Number(d.multiplier) <= 0) return fail("IQR multiplier must be greater than zero.");
    const iqr = stats.q3 - stats.q1;
    lower = stats.q1 - Number(d.multiplier) * iqr; upper = stats.q3 + Number(d.multiplier) * iqr;
    rows = iqr ? values.filter((entry) => entry.value < lower || entry.value > upper).map((entry) => entry.row) : [];
    note = iqr ? `${Number(d.multiplier)} × IQR fences: ${lower.toFixed(2)} to ${upper.toFixed(2)}` : "IQR is zero; this rule flags no values.";
  } else if (d.method === "zscore") {
    if (!finite(d.zScore) || Number(d.zScore) <= 0) return fail("Z-score threshold must be greater than zero.");
    sd = Math.sqrt(values.reduce((sum, entry) => sum + (entry.value - stats.mean) ** 2, 0) / values.length);
    rows = values.filter((entry) => sd && Math.abs((entry.value - stats.mean) / sd) >= Number(d.zScore)).map((entry) => entry.row);
    note = `Absolute Z-score >= ${d.zScore}; mean ${stats.mean.toFixed(2)}, population SD ${sd.toFixed(2)}`;
  } else if (d.method === "percentile") {
    if (!finite(d.low) || !finite(d.high) || Number(d.low) < 0 || Number(d.high) > 100 || Number(d.low) >= Number(d.high)) return fail("Percentiles must satisfy 0 <= lower < upper <= 100.");
    const sorted = values.map((entry) => entry.value).sort((a, b) => a - b);
    lower = quantile(sorted, Number(d.low) / 100); upper = quantile(sorted, Number(d.high) / 100);
    rows = values.filter((entry) => entry.value <= lower || entry.value >= upper).map((entry) => entry.row);
    note = `At or beyond ${d.low}th–${d.high}th percentile bounds: ${lower.toFixed(2)} to ${upper.toFixed(2)}`;
  } else if (d.method === "threshold") {
    if ((d.lower !== "" && !finite(d.lower)) || (d.upper !== "" && !finite(d.upper))) return fail("Business bounds must be finite numbers or blank.");
    lower = d.lower === "" ? -Infinity : Number(d.lower); upper = d.upper === "" ? Infinity : Number(d.upper);
    if (lower >= upper) return fail("The lower business bound must be below the upper bound.");
    rows = values.filter((entry) => entry.value < lower || entry.value > upper).map((entry) => entry.row);
    note = `Outside business range ${Number.isFinite(lower) ? lower : "−∞"} to ${Number.isFinite(upper) ? upper : "∞"}`;
  } else if (d.method === "custom") {
    if (!state.headers.includes(d.field) || ![">=", ">", "<", "<=", "=", "!=", "contains"].includes(d.operator) || !String(d.value).trim()) return fail("Choose a source field, operator, and nonblank custom value.");
    if ([">=", ">", "<", "<="].includes(d.operator) && !finite(d.value)) return fail("Numeric comparisons require a finite rule value.");
    rows = state.rows.filter((row) => match(row, { column: d.field, operator: d.operator, value: d.value }));
    note = `${d.field} ${d.operator} ${d.value}`;
  } else return fail("Choose a supported outlier method.");
  return { rows, note, stats, lower, upper, sd, multiplier: Number(d.multiplier), method: d.method };
}
function previewOutlier(item) { return evaluateOutlier(item, outlierDraft(item)); }
function saveOutlierRule(item, announce = true) {
  const profile = previewOutlier(item);
  if (profile.error) { notify(profile.error); return false; }
  item.outlierDefinition = { ...outlierDraft(item) };
  item.outlier = profile;
  item.rows = profile.rows;
  item.summary = `${profile.rows.length} values match the saved rule. ${profile.note}`;
  markProjectDirty();
  if (announce) notify("Outlier rule saved. No data changed.");
  return true;
}
function outlierControls(item) {
  const d = outlierDraft(item), profile = previewOutlier(item);
  const input = (label, key, type = "number") => `<label>${label}<input type="${type}" ${type === "number" ? 'step="any"' : ""} ${["low", "high"].includes(key) ? 'min="0" max="100"' : ""} value="${escapeHtml(d[key])}" data-outlier-input="${item.id}:${key}" ${profile.error ? 'aria-invalid="true"' : ""}></label>`;
  const controls = d.method === "iqr" ? input("IQR multiplier", "multiplier") : d.method === "zscore" ? input("Absolute Z-score", "zScore") : d.method === "percentile" ? input("Lower percentile (%)", "low") + input("Upper percentile (%)", "high") : d.method === "threshold" ? input("Lower bound", "lower") + input("Upper bound", "upper") : `<label>Field<select data-outlier-input="${item.id}:field">${state.headers.map((column) => `<option ${d.field === column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select></label><label>Operator<select data-outlier-input="${item.id}:operator">${[">=", ">", "<", "<=", "=", "!=", "contains"].map((operator) => `<option ${d.operator === operator ? "selected" : ""}>${escapeHtml(operator)}</option>`).join("")}</select></label>${input("Value", "value", "text")}`;
  const guidance = { iqr: "Flags values outside the fences. Lower multipliers flag more observations.", zscore: "Measures distance from the mean in population standard deviations; review skewed data carefully.", percentile: "Flags values at or beyond these percentile bounds, including ties.", threshold: "Flags values outside your business bounds. Leave either bound blank for an open end.", custom: "Flags records matching this condition; this is a business filter, not a statistical test." };
  return `<div class="outlier-definition"><label>Detection method<select data-outlier-method="${item.id}">${[["iqr", "Interquartile range (IQR)"], ["zscore", "Standard deviation / Z-score"], ["percentile", "Percentile bounds"], ["threshold", "Business bounds"], ["custom", "Custom condition"]].map(([value, label]) => `<option value="${value}" ${d.method === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><div class="outlier-controls">${controls}</div><p class="review-scope">${guidance[d.method] || ""}</p><div class="outlier-preview ${profile.error ? "workspace-error" : ""}" role="status"><b>${profile.error ? "Check your definition" : `${profile.rows.length.toLocaleString()} matching records`}</b><p>${escapeHtml(profile.note)}</p></div><button class="secondary" data-save-outlier="${item.id}" ${profile.error ? "disabled" : ""}>Save definition only</button><small class="review-scope">Saving updates the finding; it does not approve a decision or change data.</small></div>`;
}


let turnstileSiteKey = "";

async function requestTurnstileToken(signal) {
  if (!turnstileSiteKey) return "";
  if (!window.turnstile) throw new Error("The security check is still loading. Try again in a moment.");
  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    container.className = "turnstile-container";
    document.body.append(container);
    let widgetId, timer;
    const remove = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); if (widgetId !== undefined) window.turnstile.remove?.(widgetId); container.remove(); };
    const abort = () => { remove(); reject(new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    timer = setTimeout(() => { remove(); reject(new Error("The security check timed out. Try again.")); }, 30000);
    widgetId = window.turnstile.render(container, {
      sitekey: turnstileSiteKey,
      size: "invisible",
      callback: (token) => { remove(); resolve(token); },
      "error-callback": () => { remove(); reject(new Error("The security check failed. Try again.")); },
      "expired-callback": () => { remove(); reject(new Error("The security check expired. Try again.")); },
    });
    window.turnstile.execute(widgetId);
  });
}

async function requestProposal(item) {
  const instruction = $("#aiInstruction")?.value.trim();
  if (!instruction) { state.aiMessage = "Describe a bounded treatment before generating a proposal."; return renderIssues(); }
  if (state.proposalPending || !item || item.status !== "open" || !["impute", "standardize"].includes(item.recommendation)) return;
  const revision = state.datasetRevision;
  const fingerprint = reviewFingerprint(item);
  const current = () => revision === state.datasetRevision && state.issues.includes(item) && item.status === "open" && fingerprint === reviewFingerprint(item);
  const numeric = item.recommendation === "impute";
  const observed = numeric ? numericValues(item.column) : [];
  const stats = numeric ? numericStats(observed) : null;
  const context = { column: item.column, type: numeric ? "numeric" : "categorical", issueType: item.type, affectedRecords: item.rows.length, statistics: stats && { mean: stats.mean, median: stats.median, min: stats.min, max: stats.max }, categoryValues: numeric ? undefined : Object.fromEntries(categoryProfile(item).variants), allowedOperations: numeric ? ["fill_missing"] : ["map_categories"] };
  state.proposalPending = true;
  state.aiMessage = "";
  renderIssues();
  try {
    const turnstileToken = await requestTurnstileToken();
    const response = await fetch("/api/ai/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction, context, turnstileToken }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Proposal could not be created.");
    if (!current()) return;
    const plan = result.proposal;
    if (!plan || plan.column !== item.column || !context.allowedOperations.includes(plan.operation)) throw new Error("The proposal does not match this issue.");
    if (numeric && !Number.isFinite(plan.value)) throw new Error("The proposed fill must be finite.");
    if (!numeric && (!plan.mapping || Array.isArray(plan.mapping) || !Object.keys(plan.mapping).length || !Object.entries(plan.mapping).every(([source, target]) => Object.hasOwn(context.categoryValues, source) && typeof target === "string" && target.trim()))) throw new Error("The proposal mapped values outside the reviewed category set.");
    const caveats = (values) => Array.isArray(values) ? values.filter((value) => typeof value === "string").slice(0, 3) : [];
    const proposal = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, revision, instruction, operation: plan.operation === "fill_missing" ? "fill" : "map", value: plan.value, mapping: plan.mapping, interpretation: plan.operation === "fill_missing" ? `Fill ${item.rows.length} missing ${item.column} values with ${Number(plan.value).toFixed(2)}.` : `Map the reviewed ${item.column} labels as proposed.`, assumptions: caveats(plan.assumptions), warnings: caveats(plan.warnings) };
    (state.customProposals[item.id] ??= []).push(proposal);
    state.selectedFix = `custom:${proposal.id}`;
    state.aiMessage = `Proposal generated by ${result.provider} AI.`;
  } catch (error) {
    if (current()) state.aiMessage = error.message;
  } finally {
    if (revision === state.datasetRevision) {
      state.proposalPending = false;
      if (state.screen === "issues") renderIssues();
    }
  }
}

fetch("/api/ai/proposals").then((response) => response.ok ? response.json() : {}).then((config) => { turnstileSiteKey = config.turnstileSiteKey || ""; }).catch(() => {});
function renderTreatmentWorkspace(item) {
  const category = item.recommendation === "standardize"; const custom = proposals(item);
  let options = item.recommendation === "convert" ? [["convert", "Convert values to decimals", "Divide values above 1 by 100."], ["valid", "Keep unchanged and mark valid", "Retain current source values."]] : item.recommendation === "impute" ? [["imputeMedian", "Fill with column median", "Use the median of observed values."], ["imputeMean", "Fill with column mean", "Use the mean of observed values."], ["keep", "Leave missing and document", "Do not estimate unknown values."]] : category ? [["standardize", "Standardize confirmed variants", "Map Paid Social formatting variants."], ["mapOnly", "Map underscore values only", "Map paid_social only."], ["valid", "Keep labels unchanged", "Retain each source label."]] : item.recommendation === "date" ? [["date", "Convert to ISO dates", "Use YYYY-MM-DD."], ["valid", "Keep current dates", "Retain source formats."]] : [["valid", "Mark values as valid", "Accept the current values."], ["keep", "Leave unchanged and document", "No source values change."]];
  options = [...options, ...custom.map((proposal) => [`custom:${proposal.id}`, "Custom AI proposal", proposal.interpretation])]; if (!options.some(([value]) => value === state.selectedFix)) state.selectedFix = options[0][0];
  const selected = state.selectedFix; const selectedOption = options.find(([value]) => value === selected); const impact = category ? categoryImpact(item, selected) : null;
  const evidence = item.recommendation === "outlier" ? `<div class="evidence"><b>IQR fences</b><br>${item.outlier.lower.toFixed(2)} to ${item.outlier.upper.toFixed(2)} · Q1 ${item.outlier.stats.q1.toFixed(2)} · Q3 ${item.outlier.stats.q3.toFixed(2)}</div><label class="iqr-control"><span>IQR multiplier <output>${item.outlier.multiplier.toFixed(1)}</output></span><input type="range" min="0.5" max="3" step="0.1" value="${item.outlier.multiplier}" data-iqr-multiplier="${item.id}" aria-label="IQR multiplier"></label><p class="iqr-guidance">Lower multipliers flag more values; higher multipliers flag fewer.</p>` : `<div class="evidence"><b>Evidence</b><br>${item.rows.slice(0, 4).map((row) => `Row ${row._row}: ${escapeHtml(row[item.column])}`).join(" · ")}</div>`;
  const preview = item.recommendation === "impute" ? (() => { const sim = numericSimulation(item, selected); return `<h3>${selected === "keep" ? "Missing values retained" : `${item.rows.length} missing values simulated`}</h3><div class="impact-stats"><span><small>Mean</small><b>${sim.beforeStats.mean.toFixed(2)} → ${sim.afterStats.mean.toFixed(2)}</b></span><span><small>Median</small><b>${sim.beforeStats.median.toFixed(2)} → ${sim.afterStats.median.toFixed(2)}</b></span></div>${histogramChart(item, selected)}<p>The after distribution is a temporary simulation.</p>`; })() : item.recommendation === "outlier" ? `<h3>${item.rows.length} statistically unusual values</h3>${scatterChart(item)}<p>Flagging is based on the selected issue column; change either axis to inspect relationships.</p>` : category ? `<h3>${selected === "valid" ? "No cells will change" : `${impact.modified} records will be remapped`}</h3><div class="impact-stats"><span><small>Unique labels</small><b>${Object.keys(impact.profile.counts).length}</b></span><span><small>Changed</small><b>${impact.modified}</b></span></div>` : `<h3>${["valid", "keep"].includes(selected) ? "No values will change" : `${item.rows.length} records affected`}</h3>`;
  const primary = ["valid", "keep"].includes(selected) ? "Approve no-change decision" : "Approve change";
  return `<div class="review-workspace"><div class="review-top"><div class="analysis-panel"><p class="eyebrow">1 · UNDERSTAND THE FINDING</p><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.summary)}</p>${evidence}<small class="review-scope">Rule-based finding · calculated locally, not AI-generated</small></div><div class="fix-panel"><p class="eyebrow">2 · CHOOSE A TREATMENT</p>${options.map(([value, title, detail]) => `<label class="fix-option ${selected === value ? "selected" : ""}"><input type="radio" name="fix" value="${escapeHtml(value)}" ${selected === value ? "checked" : ""}><span><b>${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small></span></label>`).join("")}${renderAiPanel(item)}</div><div class="impact-panel"><p class="eyebrow">3 · REVIEW THE IMPACT</p>${preview}</div></div>${affectedRecords(item)}<footer class="decision-bar"><span>Selected: <b>${escapeHtml(selectedOption?.[1] || "Select a fix")}</b><small>Preview only until you approve · reversible in Changes</small></span><button class="ghost" data-defer>Decide later</button><button class="primary" data-finalize="${item.id}">${primary}</button></footer></div>`;
}
function renderAiPanel(item) {
  if (!["impute", "standardize"].includes(item.recommendation)) return "";
  const example = item.recommendation === "impute" ? `Suggest a constant fill for missing ${item.column}.` : "Map paid_social to Paid Social.";
  const caveats = (label, values) => values?.length ? `<div class="proposal-caveats"><b>${label}</b><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></div>` : "";
  return `<div class="ask-ai"><p class="eyebrow">AI COPILOT · ON REQUEST</p><label for="aiInstruction"><b>Need another approach?</b><small>${item.recommendation === "impute" ? "Request a constant numerical fill for these blanks." : "Request a mapping of the reviewed category labels."}</small></label><textarea id="aiInstruction" maxlength="300" placeholder="${escapeHtml(example)}" ${state.proposalPending ? "disabled" : ""}>${escapeHtml(state.aiInstructions?.[item.id] || "")}</textarea><button class="secondary" data-generate-proposal="${item.id}" ${state.proposalPending ? "disabled" : ""}>${state.proposalPending ? "Generating proposal…" : "Ask AI for a proposal"}</button><small class="review-scope">Sends this column's bounded issue context to the configured AI provider. The response is validated; you approve any change.</small>${state.proposalPending ? '<span class="proposal-pending" role="status"><i></i> Waiting for the AI service</span>' : ""}${state.aiMessage ? `<p class="ai-message" role="status">${escapeHtml(state.aiMessage)}</p>` : ""}${proposals(item).length ? `<div class="proposal-cards">${proposals(item).map((proposal) => `<article class="proposal-card"><b>AI-generated proposal</b><p>${escapeHtml(proposal.instruction)}</p><small>${escapeHtml(proposal.interpretation)}</small>${caveats("Assumptions", proposal.assumptions)}${caveats("Warnings", proposal.warnings)}<button class="ghost" data-remove-proposal="${proposal.id}" data-issue="${item.id}">Remove proposal</button></article>`).join("")}</div>` : ""}</div>`;
}
function bindIssueLinks() {
  bindReviewControls();
  bindDuplicateControls();
  bindDecisionNote();
  const instruction = document.querySelector("#aiInstruction");
  if (instruction) instruction.oninput = () => { (state.aiInstructions ||= {})[state.selectedIssue] = instruction.value; };
  const filters = document.querySelector("[data-record-filters]");
  if (filters) filters.ontoggle = () => { (state.inspectionFiltersOpen ||= {})[state.selectedIssue] = filters.open; };
  document.querySelectorAll("[data-generate-proposal]").forEach((button) => button.onclick = () => requestProposal(state.issues.find((item) => item.id === Number(button.dataset.generateProposal))));
  document.querySelectorAll("[data-remove-proposal]").forEach((button) => button.onclick = () => { const list = proposals({ id: button.dataset.issue }); state.customProposals[button.dataset.issue] = list.filter((proposal) => proposal.id !== button.dataset.removeProposal); state.selectedFix = ""; renderIssues(); });
}

// The active definitions keep one reusable, issue-scoped record subview below the analytical row.
function issueFilter(item) { return state.issueFilters[item.id] ||= { join: "AND", conditions: [{ column: state.headers[0], operator: "contains", value: "" }] }; }
function filteredIssueRows(item) { const filter = issueFilter(item), conditions = filter.conditions.filter((entry) => String(entry.value).trim()); return !conditions.length ? activeRows(item) : activeRows(item).filter((row) => filter.join === "OR" ? conditions.some((entry) => match(row, entry)) : conditions.every((entry) => match(row, entry))); }
function renderIssueWorkspace(item) { if (item.recommendation === "duplicates") return renderDuplicateWorkspace(item); if (item.recommendation === "metric") return renderMetricWorkspace(item); return item.recommendation === "outlier" ? renderOutlierWorkspace(item) : renderTreatmentWorkspace(item); }

function affectedColumnConfig(item, filter) {
  const identifiers = [...new Set([...state.headers.filter((column) => /(^id$|_id$|name$|^city$|^channel$)/i.test(column)), ...state.headers.filter((column) => !numericColumns().includes(column))])].filter((column) => column !== item.column).slice(0, 2);
  const identifierConfig = identifiers.map((column) => ({ key: column, label: column }));
  if (["impute", "convert"].includes(item.recommendation)) return [{ key: item.column, label: "Current value" }, { key: "_proposedNumber", label: "Proposed value" }, ...identifierConfig];
  if (item.recommendation === "date") return [{ key: item.column, label: "Original value" }, { key: "_parsedDate", label: "Parsed value" }, { key: "_proposedDate", label: "Proposed value" }, ...identifierConfig];
  if (item.recommendation === "standardize") return [{ key: item.column, label: "Original label" }, { key: "_proposedCategory", label: "Proposed mapping" }, ...identifierConfig];
  const related = item.rule ? [item.rule.left, item.rule.right] : item.type === "Cross-column violation" ? ["impressions"] : item.recommendation === "outlier" ? numericColumns().filter((column) => column !== item.column).slice(0, 2) : [];
  return [...new Set([item.column, ...identifiers, ...related, ...filter.conditions.map((entry) => entry.column)].filter((column) => state.headers.includes(column)))].slice(0, 7).map((column) => ({ key: column, label: column }));
}
function affectedValue(item, row, key, simulation) {
  if (key === "_proposedNumber") {
    if (item.recommendation === "convert") return state.selectedFix === "convert" && Number(row[item.column]) > 1 ? (Number(row[item.column]) / 100).toFixed(4) : row[item.column];
    const proposal = state.selectedFix.startsWith("custom:") ? proposals(item).find((entry) => entry.id === state.selectedFix.slice(7)) : null;
    return ["imputeMean", "imputeMedian"].includes(state.selectedFix) || proposal?.operation === "fill" ? (simulation || numericSimulation(item, state.selectedFix)).fill.toFixed(2) : row[item.column];
  }
  if (item.recommendation === "date" && key === "_parsedDate") {
    try { return isoDate(row[item.column]); } catch (error) { return error.message; }
  }
  if (item.recommendation === "date" && key === "_proposedDate") return state.selectedFix === "date" ? affectedValue(item, row, "_parsedDate") : row[item.column];
  if (item.recommendation === "standardize" && key === "_proposedCategory") {
    const mapping = categoryImpact(item, state.selectedFix).mapping;
    return Object.hasOwn(mapping, row[item.column]) ? mapping[row[item.column]] : row[item.column];
  }
  return row[key];
}
// Keep record previews focused; outlier review additionally supports inspection filters.
function affectedRecords(item) {
  const filter = issueFilter(item);
  const rows = filteredIssueRows(item);
  const columns = affectedColumnConfig(item, filter);
  const simulation = item.recommendation === "impute" ? numericSimulation(item, state.selectedFix) : null;
  const filterControls = item.recommendation === "outlier" ? `<details class="inspection-filters" data-record-filters ${state.inspectionFiltersOpen?.[item.id] ? "open" : ""}><summary>Filter records for inspection</summary><div class="filter-builder"><label>Match<select data-filter-join="${item.id}"><option ${filter.join === "AND" ? "selected" : ""}>AND</option><option ${filter.join === "OR" ? "selected" : ""}>OR</option></select></label>${filter.conditions.map((entry, index) => `<div class="affected-filter"><select aria-label="Filter column" data-filter-field="${item.id}:${index}">${state.headers.map((column) => `<option ${entry.column === column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select><select aria-label="Comparison operator" data-filter-operator="${item.id}:${index}">${["contains", "=", "!=", ">", "<", ">=", "<="].map((operator) => `<option ${entry.operator === operator ? "selected" : ""}>${escapeHtml(operator)}</option>`).join("")}</select><input aria-label="Filter value" data-filter-value="${item.id}:${index}" value="${escapeHtml(entry.value)}" placeholder="Value"><button class="ghost" data-remove-filter="${item.id}:${index}" ${filter.conditions.length === 1 ? "disabled" : ""}>Remove</button></div>`).join("")}<button class="secondary" data-add-filter="${item.id}">Add filter</button><button class="ghost" data-clear-filters="${item.id}">Clear</button></div></details>` : "";
  return `<section class="affected-records"><div class="affected-toolbar"><div><p class="eyebrow">RECORD-LEVEL EVIDENCE</p><h3>${rows.length.toLocaleString()} <small>of ${activeRows(item).length.toLocaleString()} matching records</small></h3></div></div>${filterControls}${item.recommendation === "outlier" ? `<p class="review-scope">Inspection filters do not change approval scope: your decision covers all ${activeRows(item).length.toLocaleString()} records matching the displayed definition.</p>` : ""}${rows.length ? `<div class="affected-table-wrap"><table class="affected-table"><thead><tr><th>Source row</th>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}${item.rule ? "<th>Rule evidence</th>" : ""}<th>Inspect</th></tr></thead><tbody>${rows.map((row) => `<tr class="${state.selectedRecord === row._row ? "selected-record" : ""}" data-select-record="${item.id}:${row._row}"><td>${row._row}</td>${columns.map((column) => { const value = affectedValue(item, row, column.key, simulation); return `<td title="${escapeHtml(value)}">${String(value ?? "").trim() ? escapeHtml(value) : '<span class="cell-empty">Blank</span>'}</td>`; }).join("")}${item.rule ? `<td>${escapeHtml(ruleEvidence(item, row))}</td>` : ""}<td><button class="ghost" data-locate-row="${row._row}">View row →</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="affected-empty">No records match the displayed definition and inspection filters.</p>'}</section>`;
}
initializeWorkspaceFeatures();
