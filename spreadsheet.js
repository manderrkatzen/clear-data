// Row markers follow the viewport; off-screen findings collect at either end.
function renderSpreadsheet() {
  $("#topEyebrow").textContent = "SPREADSHEET VIEW";
  const flags = new Map();
  const rowIssues = new Map();
  state.issues.filter((item) => item.status === "open").forEach((item) => {
    item.rows.forEach((row) => {
      const key = `${row._row}:${item.column}`;
      if (!flags.has(key)) flags.set(key, []);
      flags.get(key).push(item);
      if (!rowIssues.has(row._row)) rowIssues.set(row._row, []);
      rowIssues.get(row._row).push(item);
    });
  });
  const rows = state.rows.filter((row) => (!state.query || state.headers.some((column) => String(row[column]).toLowerCase().includes(state.query.toLowerCase()))) && (!state.flaggedOnly || rowIssues.has(row._row)));
  screen.innerHTML = `<section class="view-toolbar"><input id="search" aria-label="Search values" placeholder="Search values" value="${escapeHtml(state.query)}"><label class="check"><input type="checkbox" id="flaggedFilter" ${state.flaggedOnly ? "checked" : ""}> Flagged rows only</label><span>${rows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} rows</span></section>
    <p class="sheet-legend">Red !: missing/high-priority findings · Yellow !: other findings. Select a bubble or highlighted cell for details. Edge bubbles group findings outside the viewport.</p>
    <section class="sheet-grid"><div class="table-wrap" id="sheetViewport"><table><thead><tr><th class="row-no">#</th>${state.headers.map((header) => `<th>${escapeHtml(header)}<small>${inferType(header)}</small></th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr data-sheet-row="${row._row}"><td class="row-no">${row._row}</td>${state.headers.map((column, index) => {
      const findings = flags.get(`${row._row}:${column}`) || [];
      const severity = findings.some((item) => item.severity === "high") ? "high" : "medium";
      return `<td ${findings.length ? `class="flagged ${severity}" tabindex="0" role="button" data-cell-row="${row._row}" data-cell-column="${index}" aria-label="${escapeHtml(`${column}, row ${row._row}: ${findings.map((item) => item.label).join(", ")}`)}"` : ""}>${escapeHtml(row[column])}${findings.length ? "<i>!</i>" : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div><aside class="sheet-rail" id="sheetRail" aria-label="Row findings"></aside></section><section id="sheetDetails" class="sheet-details" aria-live="polite" hidden></section>`;
  const viewport = $("#sheetViewport"), rail = $("#sheetRail");
  const elements = [...viewport.querySelectorAll("[data-sheet-row]")];
  const showDetails = (rowId, columnIndex) => {
    const column = columnIndex === undefined ? null : state.headers[columnIndex];
    const findings = column ? flags.get(`${rowId}:${column}`) : rowIssues.get(rowId);
    const details = $("#sheetDetails");
    details.hidden = false;
    details.innerHTML = `<h3>Row ${rowId}${column ? ` · ${escapeHtml(column)}` : ""}</h3>${(findings || []).map((item) => `<p><b>${escapeHtml(item.column)}: ${escapeHtml(item.label)}</b> — ${escapeHtml(item.summary)} <button class="secondary" data-review="${item.id}">Review fix</button></p>`).join("")}`;
    details.querySelectorAll("[data-review]").forEach((button) => button.onclick = () => openIssue(Number(button.dataset.review)));
  };
  const marked = elements.filter((element) => rowIssues.has(Number(element.dataset.sheetRow)));
  const updateMarkers = () => {
    const box = viewport.getBoundingClientRect();
    const top = viewport.querySelector("thead").getBoundingClientRect().height + 18;
    const bottom = viewport.clientHeight - 22;
    const groups = new Map();
    marked.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const y = rect.top - box.top + rect.height / 2;
      const position = y < top + 28 ? top : y > bottom - 28 ? bottom : Math.round(y / 28) * 28;
      const key = position === top ? "above" : position === bottom ? "below" : String(position);
      if (!groups.has(key)) groups.set(key, { position, entries: [] });
      groups.get(key).entries.push(element);
    });
    rail.innerHTML = [...groups].map(([key, group]) => {
      const ids = group.entries.map((element) => Number(element.dataset.sheetRow));
      const high = ids.some((id) => rowIssues.get(id).some((item) => item.severity === "high"));
      const label = key === "above" ? "↑" : key === "below" ? "↓" : "!";
      return `<button class="sheet-bubble ${high ? "high" : "medium"}" style="top:${group.position}px" data-marker="${key}" title="${ids.length} flagged row(s): ${ids.slice(0, 8).join(", ")}" aria-label="${ids.length} flagged rows ${key === "above" || key === "below" ? key : "in view"}">${label}${ids.length > 1 ? `<small>${ids.length}</small>` : ""}</button>`;
    }).join("");
    rail.querySelectorAll("[data-marker]").forEach((button) => button.onclick = () => {
      const group = groups.get(button.dataset.marker);
      const target = button.dataset.marker === "above" ? group.entries.at(-1) : group.entries[0];
      viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientHeight / 2;
      showDetails(Number(target.dataset.sheetRow));
    });
  };
  viewport.querySelectorAll("[data-cell-row]").forEach((cell) => {
    cell.onclick = () => showDetails(Number(cell.dataset.cellRow), Number(cell.dataset.cellColumn));
    cell.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cell.click(); } };
  });
  let frame;
  viewport.addEventListener("scroll", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(updateMarkers); });
  if (window.sheetResizeObserver) window.sheetResizeObserver.disconnect();
  window.sheetResizeObserver = new ResizeObserver(updateMarkers);
  window.sheetResizeObserver.observe(viewport);
  updateMarkers();
  $("#search").oninput = (event) => {
    const position = event.target.selectionStart;
    state.query = event.target.value;
    renderSpreadsheet();
    $("#search").focus();
    $("#search").setSelectionRange(position, position);
  };
  $("#flaggedFilter").onchange = (event) => { state.flaggedOnly = event.target.checked; renderSpreadsheet(); };
}
