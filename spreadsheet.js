const sheetIssueTypes = {
  missing: { symbol: "?", label: "Missing value", tab: "Missing" },
  outlier: { symbol: "◇", label: "Potential outlier", tab: "Outlier" },
  category: { symbol: "≠", label: "Inconsistent category", tab: "Category" },
  format: { symbol: "↔", label: "Date/number format", tab: "Format" },
  conflict: { symbol: "!", label: "Cross-column conflict", tab: "Conflict" },
  duplicate: { symbol: "⧉", label: "Duplicate record", tab: "Duplicate" },
  schema: { symbol: "§", label: "Schema violation", tab: "Schema" },
};
function sheetIssueType(item) {
  if (item.recommendation === "candidate") return ["missing_token", "sentinel"].includes(item.candidate?.kind) ? "missing" : item.candidate?.kind === "category" || item.candidate?.kind === "spacing" ? "category" : "format";
  if (item.recommendation === "relation") return "schema";
  if (item.recommendation === "duplicates") return "duplicate";
  if (item.recommendation === "schema") return "schema";
  if (/missing/i.test(item.type)) return "missing";
  if (item.recommendation === "outlier") return "outlier";
  if (item.recommendation === "standardize") return "category";
  if (["date", "convert"].includes(item.recommendation)) return "format";
  return "conflict";
}
function sheetInspection(item, row) {
  const type = sheetIssueType(item), column = item.column;
  const raw = String(row[column] ?? "");
  const format = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: /_usd$/.test(column) ? 2 : 0, ...(/_usd$/.test(column) ? { style: "currency", currency: "USD" } : {}) });
  const evidence = [["Current value", raw.trim() ? raw : "Empty"]];
  let title, explanation, action = "Review treatments →";
  if (item.recommendation === "candidate") {
    title = item.label;
    explanation = item.summary;
    evidence.push(["Candidate kind", item.candidate.kind.replaceAll("_", " ")], ["Matching records", item.rows.length.toLocaleString()]);
    action = "Interpret this candidate →";
  } else if (item.recommendation === "relation") {
    title = item.label; explanation = "This record violates an analyst-defined relationship. Review its meaning and choose a scoped correction.";
    evidence.push(["Rule evidence", relationProblem(row, item.rule)]);
  } else if (type === "missing") {
    title = `${column.replaceAll("_", " ")} is blank`;
    explanation = "This cell has no recorded value. A blank can be expected; unknown is different from zero or a confirmed category.";
    if (item.recommendation === "impute") {
      const stats = numericStats(numericValues(column));
      evidence.push(["Column median", format(stats.median)], ["Column mean", format(stats.mean)]);
    }
    evidence.push(["Missing across dataset", `${item.rows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} rows`]);
  } else if (type === "duplicate") {
    title = "Record shares a duplicate signature or business key";
    explanation = "Repeated keys can be legitimate. Inspect the full group before removing a record; the proposed survivor is the earliest source record.";
    const profile = duplicateProfile();
    const group = profile.groups.find((entry) => entry.rows.some((entryRow) => entryRow._row === row._row));
    evidence.push(["Compared columns", profile.columns.join(", ")], ["Group row IDs", group?.rows.map((entry) => entry._row).join(", ") || ""], ["Comparison", group?.conflict ? "Conflicting values outside key" : "Identical record values"]);
    action = "Review duplicate group →";
  } else if (type === "schema" || ["metric", "metricBlocked"].includes(item.recommendation)) {
    title = item.label;
    explanation = "This finding comes from an analyst-defined business rule. Detection does not change data values.";
    evidence.push(["Rule evidence", ruleEvidence(item, row)]);
    action = "Review configured rule →";
  } else if (type === "outlier") {
    const profile = item.outlier;
    title = `${column.replaceAll("_", " ")} matches the saved ${profile.method || "iqr"} review rule`;
    explanation = "An unusual value may be legitimate. Flagging it does not mean it should be changed. Review the distribution and context first.";
    evidence[0][1] = raw.trim() && Number.isFinite(Number(raw)) ? format(Number(raw)) : raw || "Empty";
    evidence.push(["Saved rule", profile.note || `${profile.multiplier} × IQR`]);
    if (Number.isFinite(profile.lower)) evidence.push(["Lower bound", format(profile.lower)]);
    if (Number.isFinite(profile.upper)) evidence.push(["Upper bound", format(profile.upper)]);
    if (Number.isFinite(profile.sd)) evidence.push(["Population standard deviation", format(profile.sd)]);
    action = "Inspect distribution →";
  } else if (type === "category") {
    title = "Category label differs from the standard spelling";
    explanation = "This cell uses a formatting variant of Paid Social. Confirm the labels refer to the same category before mapping them.";
    evidence.push(["Compared label", "Paid Social"], ["Rows with this spelling", state.rows.filter((entry) => entry[column] === raw).length.toLocaleString()]);
  } else if (item.recommendation === "date") {
    title = "Date uses a different format";
    explanation = "This cell uses MM/DD/YYYY rather than ISO format. Confirm the month/day interpretation before converting it.";
    try { evidence.push(["ISO interpretation", isoDate(raw)]); } catch (error) { evidence.push(["Parsing problem", error.message]); }
  } else if (item.recommendation === "convert") {
    title = "Rate uses a whole-percentage scale";
    explanation = "This rate is above 1 while comparable rates use decimals. Confirm the scale before dividing it by 100.";
    evidence.push(["Decimal interpretation", format(Number(raw) / 100)]);
  } else {
    title = "Clicks exceed impressions in this row";
    explanation = "Recorded clicks are greater than recorded impressions. Confirm the measurement definitions or source values before making a decision.";
    evidence.push(["Impressions", String(row.impressions)], ["Difference", String(Number(row.clicks) - Number(row.impressions))]);
  }
  return { title, explanation, evidence, action };
}

// Row markers follow the viewport; off-screen findings collect by type at either end.
function renderSpreadsheet() {
  $("#topEyebrow").textContent = "SPREADSHEET VIEW";
  const flags = new Map(), rowIssues = new Map();
  state.issues.filter((item) => item.status === "open").forEach((item) => item.rows.forEach((row) => {
    const key = `${row._row}:${item.column}`;
    if (!flags.has(key)) flags.set(key, []);
    flags.get(key).push(item);
    if (!rowIssues.has(row._row)) rowIssues.set(row._row, []);
    rowIssues.get(row._row).push(item);
  }));
  const rows = state.rows.filter((row) => (!state.query || state.headers.some((column) => String(row[column]).toLowerCase().includes(state.query.toLowerCase()))) && (!state.flaggedOnly || rowIssues.has(row._row)));
  const types = Object.entries(sheetIssueTypes);
  const inferred = new Map(state.headers.map((column) => [column, inferType(column)]));
  screen.innerHTML = `<section class="view-toolbar"><input id="search" aria-label="Search values" placeholder="Search values" value="${escapeHtml(state.query)}"><label class="check"><input type="checkbox" id="flaggedFilter" ${state.flaggedOnly ? "checked" : ""}> Flagged rows only</label><span>${rows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} rows</span></section>
    <div class="sheet-legend">${types.map(([type, meta]) => `<span><b class="sheet-type sheet-${type}">${meta.symbol}</b> ${meta.label}</span>`).join("")}<small>Select a marker or highlighted cell. Edge counts represent off-screen findings by type.</small></div>
    <section class="sheet-grid"><div class="table-wrap" id="sheetViewport"><table><thead><tr><th class="row-no">#</th>${state.headers.map((header) => `<th>${escapeHtml(header)}<small>${inferred.get(header)}</small></th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr data-sheet-row="${row._row}"><td class="row-no">${row._row}</td>${state.headers.map((column, index) => {
      const findings = flags.get(`${row._row}:${column}`) || [];
      const type = findings.length ? sheetIssueType(findings[0]) : "";
      return `<td ${findings.length ? `class="flagged sheet-${type}" tabindex="0" role="button" data-cell-row="${row._row}" data-cell-column="${index}" aria-label="${escapeHtml(`${column}, row ${row._row}: ${findings.map((item) => item.label).join(", ")}`)}"` : ""}>${escapeHtml(row[column])}${findings.length ? `<i>${[...new Set(findings.map((item) => sheetIssueTypes[sheetIssueType(item)].symbol))].join(" ")}</i>` : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div><aside class="sheet-rail" id="sheetRail" aria-label="Row findings"></aside></section><section id="sheetDetails" class="sheet-details" aria-live="polite" hidden></section>`;
  const viewport = $("#sheetViewport"), rail = $("#sheetRail");
  const elements = [...viewport.querySelectorAll("[data-sheet-row]")];
  let selected = null;
  const showDetails = (rowId, issueId) => {
    const findings = rowIssues.get(rowId) || [];
    const item = findings.find((entry) => entry.id === issueId) || findings[0];
    if (!item) return;
    selected = { rowId, issueId: item.id };
    const row = rows.find((entry) => entry._row === rowId);
    const type = sheetIssueType(item), meta = sheetIssueTypes[type], inspection = sheetInspection(item, row);
    viewport.querySelectorAll(".sheet-selected-row,.sheet-selected-cell").forEach((element) => element.classList.remove("sheet-selected-row", "sheet-selected-cell"));
    const rowElement = elements.find((element) => Number(element.dataset.sheetRow) === rowId);
    rowElement.classList.add("sheet-selected-row");
    rowElement.querySelector(`[data-cell-column="${state.headers.indexOf(item.column)}"]`)?.classList.add("sheet-selected-cell");
    const details = $("#sheetDetails");
    details.hidden = false;
    details.className = `sheet-details sheet-${type}`;
    const tabs = [...new Set(findings.map(sheetIssueType))];
    details.innerHTML = `${findings.length > 1 ? `<div class="sheet-tabs" role="group" aria-label="Findings in selected row">${tabs.map((key) => {
      const matches = findings.filter((entry) => sheetIssueType(entry) === key);
      return `<button class="sheet-tab sheet-${key}" aria-pressed="${key === type}" data-finding="${matches[0].id}">${sheetIssueTypes[key].symbol} ${sheetIssueTypes[key].tab} (${matches.length})</button>`;
    }).join("")}</div>${findings.filter((entry) => sheetIssueType(entry) === type).length > 1 ? `<div class="sheet-tabs">${findings.filter((entry) => sheetIssueType(entry) === type).map((entry) => `<button class="sheet-tab" aria-pressed="${entry.id === item.id}" data-finding="${entry.id}">${escapeHtml(entry.column)}</button>`).join("")}</div>` : ""}` : ""}
      <header class="sheet-card-heading"><span class="sheet-type">${meta.symbol}</span><b>${meta.label}</b><span>Row ${rowId} · <code>${escapeHtml(item.column)}</code></span><small>${escapeHtml(item.severity)} priority</small></header>
      <h3>${escapeHtml(inspection.title)}</h3><p>${escapeHtml(inspection.explanation)}</p>
      <dl class="sheet-evidence">${inspection.evidence.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      <footer class="sheet-card-action"><button class="primary" id="sheetReview">${inspection.action}</button><span>Reviews all ${item.rows.length.toLocaleString()} ${type === "missing" ? "missing cells" : "flagged cells"} in <code>${escapeHtml(item.column)}</code>.<small>Compare treatments before approving a column-wide decision.</small></span></footer>`;
    details.querySelectorAll("[data-finding]").forEach((button) => button.onclick = () => showDetails(rowId, Number(button.dataset.finding)));
    $("#sheetReview").onclick = () => { state.selectedIssue = null; openIssue(item.id); };
    updateMarkers();
  };
  const marked = elements.filter((element) => rowIssues.has(Number(element.dataset.sheetRow)));
  const updateMarkers = () => {
    const box = viewport.getBoundingClientRect();
    const header = viewport.querySelector("thead").getBoundingClientRect().height;
    const groups = new Map();
    marked.forEach((element) => {
      const rect = element.getBoundingClientRect(), rowId = Number(element.dataset.sheetRow);
      const y = rect.top - box.top + rect.height / 2;
      const edge = rect.bottom <= box.top + header ? "above" : rect.top >= box.top + viewport.clientHeight ? "below" : null;
      const key = edge || `row-${rowId}`;
      if (!groups.has(key)) groups.set(key, { edge, position: edge === "above" ? header / 2 : edge === "below" ? viewport.clientHeight - 15 : y, entries: [] });
      rowIssues.get(rowId).forEach((item) => groups.get(key).entries.push({ rowId, item, element }));
    });
    const focused = rail.querySelector(":focus")?.dataset.marker;
    const targets = new Map();
    rail.innerHTML = [...groups].map(([key, group]) => `<div class="sheet-marker-cluster ${group.edge ? "sheet-edge" : ""}" style="top:${group.position}px">${types.map(([type, meta]) => {
      const entries = group.entries.filter((entry) => sheetIssueType(entry.item) === type);
      if (!entries.length) return "";
      const target = group.edge === "above" ? entries.at(-1) : entries[0];
      const marker = `${key}:${type}`;
      targets.set(marker, target);
      const label = group.edge ? `${meta.label}: ${entries.length} findings ${group.edge} the viewport. Go to row ${target.rowId}.` : `${entries.map((entry) => entry.item.label).join("; ")} · Row ${target.rowId}`;
      const active = selected && entries.some((entry) => entry.rowId === selected.rowId && entry.item.id === selected.issueId);
      return `<button class="sheet-bubble sheet-${type} ${active ? "selected" : ""}" data-marker="${marker}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${Boolean(active)}">${group.edge ? `<span class="sheet-direction">${group.edge === "above" ? "↑" : "↓"}</span>` : ""}${meta.symbol}${group.edge || entries.length > 1 ? `<small>${entries.length}</small>` : ""}<span class="sheet-marker-label">${escapeHtml(label)}</span></button>`;
    }).join("")}</div>`).join("");
    rail.querySelectorAll("[data-marker]").forEach((button) => button.onclick = () => {
      const target = targets.get(button.dataset.marker);
      if (groups.get(button.dataset.marker.split(":")[0]).edge) viewport.scrollTop += target.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
      showDetails(target.rowId, target.item.id);
    });
    if (focused) [...rail.querySelectorAll("[data-marker]")].find((button) => button.dataset.marker === focused)?.focus({ preventScroll: true });
  };
  viewport.querySelectorAll("[data-cell-row]").forEach((cell) => {
    cell.onclick = () => showDetails(Number(cell.dataset.cellRow), flags.get(`${cell.dataset.cellRow}:${state.headers[Number(cell.dataset.cellColumn)]}`)[0].id);
    cell.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cell.click(); } };
  });
  let frame;
  viewport.addEventListener("scroll", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(updateMarkers); });
  if (window.sheetResizeObserver) window.sheetResizeObserver.disconnect();
  window.sheetResizeObserver = new ResizeObserver(updateMarkers);
  window.sheetResizeObserver.observe(viewport);
  updateMarkers();
  if (state.locateRow != null) {
    const rowId = state.locateRow;
    state.locateRow = null;
    const target = elements.find((element) => Number(element.dataset.sheetRow) === rowId);
    if (target) {
      target.classList.add("sheet-selected-row");
      viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
      if (rowIssues.has(rowId)) showDetails(rowId);
      updateMarkers();
    }
  }
  $("#search").oninput = (event) => {
    const position = event.target.selectionStart;
    state.query = event.target.value;
    renderSpreadsheet();
    $("#search").focus();
    $("#search").setSelectionRange(position, position);
  };
  $("#flaggedFilter").onchange = (event) => { state.flaggedOnly = event.target.checked; renderSpreadsheet(); };
}
