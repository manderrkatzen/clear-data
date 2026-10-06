// UI orchestration only. Calculations and approval remain in the existing engines.
let missingWorkbenchSession = null;
let reviewFooterObserver = null;
function labelReviewSurfaces() {
  document.querySelectorAll(".analysis-banner b").forEach(element => {
    if (!element.textContent.startsWith("AI status")) element.textContent = `AI status · ${element.textContent}`;
  });
  document.querySelectorAll(".interpretation-top .ai-label").forEach(element => {
    if (element.closest(".value-review")) {
      element.textContent = element.textContent.replace(/^AI assessment/, "AI suggestion: is this value missing?");
    } else element.textContent = element.textContent.replace(/^AI suggestion ·/, "AI suggestion: what this means ·");
  });
  document.querySelectorAll(".ai-followup > summary").forEach(element => { element.textContent = "Ask AI about this finding"; });
  document.querySelectorAll(".pattern-explanation .ai-label").forEach(element => { element.textContent = "AI explanation of this pattern"; });
  if ($("#reviewIssues")) $("#reviewIssues").textContent = "Review findings";
  if ($("#guidedHistory")) $("#guidedHistory").textContent = "Open Decisions";
}
function finishReviewLayout(queuePosition) {
  const list = screen.querySelector(".candidate-list"), active = list?.querySelector(".active");
  if (list) {
    list.scrollTop = queuePosition.top; list.scrollLeft = queuePosition.left;
    if (active) {
      const outer = list.getBoundingClientRect(), inner = active.getBoundingClientRect();
      if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top;
      else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom;
      if (inner.left < outer.left) list.scrollLeft -= outer.left - inner.left;
      else if (inner.right > outer.right) list.scrollLeft += inner.right - outer.right;
    }
  }
  reviewFooterObserver?.disconnect();
  const footer = screen.querySelector(".guided-footer"), card = footer?.closest(".guided-card");
  if (footer && card) {
    const size = () => {
      card.style.setProperty("--review-footer-height", `${footer.getBoundingClientRect().height}px`);
      card.style.setProperty("--review-workspace-height", `${Math.max(420, innerHeight - card.getBoundingClientRect().top - 16)}px`);
    };
    size(); reviewFooterObserver = new ResizeObserver(size); reviewFooterObserver.observe(footer); reviewFooterObserver.observe(card);
  }
}
function orderReviewStage(item) {
  if (!item) return;
  const stage = screen.querySelector(".guided-stage");
  if (state.reviewStep === 1 && !isMissingWorkbench(item) && !isValueFinding(item)) {
    const groups = stage.querySelector(".candidate-value-groups");
    if (groups) {
      stage.querySelectorAll(":scope > .evidence,:scope > .outlier-definition").forEach(element => groups.before(element));
      const relationships = [...stage.querySelectorAll(":scope > .evidence-records")].find(element => element.querySelector("[data-scatter-plot]"));
      if (relationships) { relationships.dataset.ui = "review.understand.relationships"; groups.before(relationships); }
    }
  }
  if (state.reviewStep >= 4) {
    const distribution = stage.querySelector(":scope > .review-distribution,:scope > .comparison-metrics"), table = stage.querySelector(":scope > .guided-table-wrap");
    if (distribution && table) {
      const heading = table.previousElementSibling;
      if (heading?.tagName === "H4") distribution.before(heading);
      distribution.before(table);
    }
    const supporting = [".fill-provenance", ".band-impact", ".kpi-impact", ".dependency-impact"];
    for (const selector of supporting) {
      stage.querySelectorAll(`:scope > ${selector}`).forEach(details => {
        if (details.tagName === "DETAILS") details.open = selector === ".kpi-impact" && !!state.ruleConfig.kpis?.length;
        stage.append(details);
      });
    }
  }
}
function isMissingWorkbench(item) {
  return !!item && ["impute", "keep"].includes(item.recommendation)
    && ["number", "integer"].includes(cleaningProfile().columns.find(profile => profile.column === item.column)?.role);
}
function missingWorkbenchState(item) {
  if (missingWorkbenchSession?.revision !== state.datasetRevision) {
    missingWorkbenchSession?.items.forEach(data => clearTimeout(data.timer));
    missingWorkbenchSession = { revision: state.datasetRevision, items: new Map() };
  }
  if (!missingWorkbenchSession.items.has(item.id)) {
    const draft = reviewDraft(item);
    if (draft.interpretation === "unresolved") draft.interpretation = "missing";
    missingWorkbenchSession.items.set(item.id, {
      candidates: [], active: 0, hold: "", banding: { mode: "quantiles", k: 4 }, holdChosen: false,
      allPatterns: false, detail: "", compareColumn: "", byBand: false,
      records: { mode: "both", columns: null, records: null }, scope: structuredClone(draft.scope),
      pending: "", error: "", generation: 0, results: null, computedKey: "", interpretationOpen: false
    });
  }
  return missingWorkbenchSession.items.get(item.id);
}
function withWorkbenchDraft(item, draft, action) {
  const saved = state.reviewDrafts[item.id]; state.reviewDrafts[item.id] = draft;
  try { return action(); } finally { state.reviewDrafts[item.id] = saved; }
}
function workbenchDraft(item, operation) {
  const data = missingWorkbenchState(item), draft = structuredClone(reviewDraft(item));
  delete draft.previewFingerprint;
  Object.assign(draft, { operation, scope: structuredClone(data.scope), skipBlocked: false, acknowledgeConstraints: false });
  if (["groupwise", "knn"].includes(operation)) {
    draft.similar = { columns: [data.hold || analyticalTarget(item.column).result?.results[0]?.column || state.headers.find(column => column !== item.column && !CleaningEngine.isIdentifier(column))].filter(Boolean), statistic: "median", minObserved: 5, k: 7, banding: {} };
  }
  return draft;
}
function workbenchKey(item) {
  const data = missingWorkbenchState(item);
  return JSON.stringify([capabilityStore().key, item.id, data.candidates, data.hold, data.banding, data.records.mode, data.records.columns, data.compareColumn]);
}
function workbenchCurrent(item, data, generation, key) {
  return missingWorkbenchSession?.items.get(item.id) === data && data.generation === generation && (!key || key === workbenchKey(item));
}
function renderWorkbenchIfVisible(item) {
  if (state.screen === "issues" && state.selectedIssue === item.id) renderPreservingReviewFocus();
}
function syncWorkbenchCandidates(item) {
  const data = missingWorkbenchState(item), meaning = reviewDraft(item).interpretation;
  for (const draft of data.candidates) {
    draft.scope = structuredClone(data.scope); draft.interpretation = meaning; delete draft.previewFingerprint;
    if (draft.operation === "groupwise") {
      draft.similar ||= { columns: [], statistic: "median", minObserved: 5, k: 7, banding: {} };
      const extra = (draft.extraHoldColumns || []).filter(column => column !== data.hold);
      draft.similar.columns = [...new Set([data.hold, ...extra].filter(Boolean))];
      draft.similar.banding = { ...draft.similar.banding, ...(data.hold ? { [data.hold]: structuredClone(data.banding) } : {}) };
    }
  }
}
async function compareWorkbenchPattern(item, refresh = false) {
  const data = missingWorkbenchState(item), analytical = analyticalTarget(item.column);
  if (data.pending || analytical.result && !refresh) return;
  const generation = ++data.generation;
  data.pending = "pattern"; data.error = ""; renderWorkbenchIfVisible(item);
  try {
    let result = await analyticalTask("compare", item.column, { options: analyticalOptions() });
    result = await analyticalTask("significance", item.column, { params: { result }, options: analyticalOptions() });
    if (!workbenchCurrent(item, data, generation)) return;
    analytical.result = result; analytical.held = []; analytical.ai = null;
    analytical.comparisonColumn = result.results[0]?.column || "";
    if (!data.holdChosen) data.hold = result.results.find(entry => ["categorical", "category"].includes(entry.type) && ["moderate", "strong"].includes(entry.strength))?.column || "";
    data.compareColumn ||= result.results.find(entry => entry.type === "numeric" && entry.column !== data.hold)?.column || result.results.find(entry => entry.column !== data.hold)?.column || "";
    if (!data.candidates.length) {
      data.candidates = ["median", data.hold ? "groupwise" : "mean", "leaveMissing"].map(operation => workbenchDraft(item, operation));
      if (reviewDraft(item).interpretation !== "missing") data.candidates = [workbenchDraft(item, "retain")];
    }
    data.pending = ""; syncWorkbenchCandidates(item);
    await computeWorkbench(item);
  } catch (error) {
    if (workbenchCurrent(item, data, generation)) { data.pending = ""; data.error = error.message; renderWorkbenchIfVisible(item); }
  }
}
function scheduleWorkbench(item, rerender = false) {
  const data = missingWorkbenchState(item);
  syncWorkbenchCandidates(item); clearTimeout(data.timer);
  data.generation++; data.results = null; data.records.records = null; data.impact = null; data.dependencies = [];
  data.computedKey = ""; data.pending = "candidates"; data.error = "";
  if (rerender) renderWorkbenchIfVisible(item);
  else {
    document.querySelectorAll("[data-workbench-stats]").forEach(element => { element.textContent = "Computing preview…"; });
    $("#chooseWorkbenchFix")?.setAttribute("disabled", ""); $("#reviewNext")?.setAttribute("disabled", "");
  }
  data.timer = setTimeout(() => computeWorkbench(item), 250);
}
async function computeWorkbench(item) {
  const data = missingWorkbenchState(item);
  if (!data.candidates.length) return;
  clearTimeout(data.timer); syncWorkbenchCandidates(item);
  const generation = ++data.generation, key = workbenchKey(item), analytical = analyticalTarget(item.column);
  data.pending = "candidates"; data.error = ""; renderWorkbenchIfVisible(item);
  try {
    // The existing worker owns all candidate calculations, shared bins and KPIs.
    const drafts = data.candidates.length === 1 ? [data.candidates[0], data.candidates[0]] : data.candidates;
    const result = await analyticalTask("candidates", item.column, {
      params: { eligibleIds: reviewRows(item).map(row => row._row), drafts }, options: capabilityOptions()
    });
    if (!workbenchCurrent(item, data, generation, key)) return;
    result.candidates = result.candidates.slice(0, data.candidates.length);
    const preview = result.candidates[data.active]?.preview;
    const grouping = data.hold ? { holdColumn: data.hold, banding: { [data.hold]: data.banding } } : {};
    const [records, held, impact, business] = await Promise.all([
      analyticalTask("records", item.column, { params: { ...grouping, mode: data.records.mode, columns: data.records.columns, ranking: analytical.result?.results, comparisonColumn: data.compareColumn, preview }, options: analyticalOptions() }),
      data.hold && data.compareColumn && data.hold !== data.compareColumn
        ? analyticalTask("hold", item.column, { comparisonColumn: data.compareColumn, holdColumn: data.hold, banding: data.banding, options: analyticalOptions() }) : null,
      data.hold ? analyticalTask("impact", item.column, { params: { preview, grouping }, options: analyticalOptions() }) : null,
      analyticalTask("business", item.column, { params: { preview, definitions: state.ruleConfig.kpis || [], metrics: state.ruleConfig.metrics || [] }, options: capabilityOptions() })
    ]);
    if (!workbenchCurrent(item, data, generation, key)) return;
    data.results = result; data.records.records = records; data.held = held; data.impact = impact;
    data.dependencies = business.dependencies; data.computedKey = key;
    analytical.holdColumn = data.hold; analytical.banding = data.banding;
    if (held) analytical.held = [held];
    data.pending = ""; renderWorkbenchIfVisible(item);
  } catch (error) {
    if (workbenchCurrent(item, data, generation)) { data.pending = ""; data.error = error.message; renderWorkbenchIfVisible(item); }
  }
}
function workbenchPatternHtml(item) {
  const data = missingWorkbenchState(item), analytical = analyticalTarget(item.column), result = analytical.result;
  const entries = result?.results || [], shown = data.allPatterns ? entries : entries.slice(0, 3);
  const selected = entries.find(entry => entry.column === data.detail);
  const noPattern = result && (result.insufficientData || !entries.length || result.pattern === "none_detected");
  return `<section data-ui="review.workbench.pattern" class="workbench-region analytical-section">
    <div class="analytical-heading"><h3>Missing vs present</h3><button id="compareMissing" class="secondary" ${data.pending ? "disabled" : ""}>Refresh comparison</button></div>
    <p>${escapeHtml(item.summary)}</p>
    ${result ? `<p class="analytical-counts">${result.nMissing} target-missing · ${result.nPresent} target-present records</p>` : '<p role="status">Comparing columns…</p>'}
    ${noPattern ? `<p class="evidence">${escapeHtml(result.note || "No pattern detected in the available comparison columns.")}</p>` : result ? `<div class="analysis-table-wrap" data-ui="review.missing.ranked-table"><table class="profile-table analysis-table"><thead><tr><th>Comparison column</th><th>Effect size</th><th>Strength</th><th>Permutation evidence</th></tr></thead><tbody>
      ${shown.map(entry => `<tr class="${entry.column === data.detail ? "is-selected" : ""}"><th><button class="ghost" data-workbench-pattern="${escapeHtml(entry.column)}" aria-expanded="${entry.column === data.detail}">${escapeHtml(entry.column)}</button></th><td>${analyticalNumber(entry.effectSize)} ${entry.type === "numeric" ? "|δ|" : "gap"}</td><td>${escapeHtml(entry.strength)}</td><td>${escapeHtml(entry.significance || "Not tested")}${entry.pValue != null ? ` · p ${entry.pValue.toFixed(3)}` : ""}</td></tr>`).join("")}
    </tbody></table></div>${entries.length > 3 ? `<button class="ghost" id="workbenchShowPatterns">${data.allPatterns ? "Show top 3" : `Show all ${entries.length}`}</button>` : ""}` : ""}
    ${selected ? `<details open class="workbench-detail" data-ui="review.missing.detail"><summary>${escapeHtml(selected.column)} · comparison detail</summary>${analyticalComparisonDetails(selected)}<p class="review-scope">Excluded: ${selected.excludedBlankRows} missing comparison values · ${selected.excludedInvalidRows} unparsed values.</p></details>` : ""}
    ${data.held ? workbenchHeldHtml(item) : ""}
    <div class="analytical-ai" data-ui="review.missing.ai-explanation"><button class="secondary" id="explainMissingPattern" ${!result || data.pending ? "disabled" : ""}>Explain top pattern with AI</button><small>Only aggregate statistics and comparison verdicts are sent.</small>
    ${analytical.ai ? `<div class="pattern-explanation"><span class="ai-label">AI explanation of this pattern</span><p>${escapeHtml(analytical.ai.explanation)}</p>${analytical.ai.caution ? `<p>${escapeHtml(analytical.ai.caution)}</p>` : ""}${analytical.ai.proposal ? '<button class="secondary" id="addPatternCandidate">Add AI proposal as a candidate</button>' : ""}</div>` : ""}</div>
  </section>`;
}
function workbenchHeldHtml(item) {
  const data = missingWorkbenchState(item), analytical = analyticalTarget(item.column);
  const previous = analytical.comparisonColumn; analytical.comparisonColumn = data.compareColumn;
  analytical.holdColumn = data.hold; analytical.banding = data.banding;
  const template = document.createElement("template"); template.innerHTML = analyticalEvidenceHtml(item);
  analytical.comparisonColumn = previous;
  return `<details class="evidence-records" data-ui="review.missing.held" open><summary>Held comparison · ${escapeHtml(data.compareColumn)} by ${escapeHtml(data.hold)}</summary>${template.content.querySelector(".held-result")?.outerHTML || ""}</details>`;
}
function workbenchHoldHtml(item) {
  const data = missingWorkbenchState(item), numerical = ["number", "integer"].includes(cleaningProfile().columns.find(profile => profile.column === data.hold)?.role);
  const other = state.headers.filter(column => column !== item.column && !CleaningEngine.isIdentifier(column));
  return `<section class="workbench-region" data-ui="review.workbench.hold"><h3>Hold similar</h3><p class="review-scope">One grouping for comparisons, rows, similar-group fills, and impact by band.</p>
    <div class="review-fields">${selectHtml("workbenchHold", "Hold similar by", [["", "No hold — all records"], ...other.map(column => [column, column])], data.hold)}
    ${data.hold ? selectHtml("workbenchHeldColumn", "Compare within these groups", other.filter(column => column !== data.hold).map(column => [column, column]), data.compareColumn) : ""}
    ${data.hold && numerical ? analyticalBandFields("workbenchBand", data.banding) : ""}</div></section>`;
}
function workbenchRecordsHtml(item) {
  const data = missingWorkbenchState(item), template = document.createElement("template");
  template.innerHTML = capabilityRecordsHtml(item, data.records);
  const lens = template.content.firstElementChild; lens.open = true; lens.dataset.ui = "review.workbench.rows";
  lens.classList.add("workbench-region");
  lens.querySelector("#recordLensHold")?.closest("label")?.remove();
  lens.querySelector("summary").textContent = "Inspect affected and present records";
  return lens.outerHTML;
}
function workbenchCandidateEditor(item, draft, index) {
  const template = document.createElement("template");
  template.innerHTML = withWorkbenchDraft(item, draft, () => guidedTreatmentHtml(item));
  const fields = template.content.querySelector(".review-fields");
  fields.dataset.ui = "review.treat.params";
  const methods = reviewOperations(item).filter(operation => operation !== "retain");
  const select = fields.querySelector("#reviewOperation");
  select.dataset.ui = "review.treat.selector";
  select.innerHTML = methods.map(operation => `<option value="${operation}" ${draft.operation === operation ? "selected" : ""}>${escapeHtml(treatmentLabel(operation))}</option>`).join("");
  if (["groupwise", "knn"].includes(draft.operation)) {
    const similar = document.createElement("template"); similar.innerHTML = withWorkbenchDraft(item, draft, () => similarTreatmentHtml(item));
    if (draft.operation === "groupwise") {
      similar.content.querySelector("legend").textContent = "Extra hold columns (optional)";
      similar.content.querySelectorAll("[data-similar-column]").forEach(input => {
        if (input.dataset.similarColumn === missingWorkbenchState(item).hold) input.closest("label").remove();
      });
      similar.content.querySelectorAll("[data-band-column]").forEach(element => {
        if (element.dataset.bandColumn === missingWorkbenchState(item).hold) element.remove();
      });
      const note = document.createElement("p"); note.className = "review-scope";
      note.textContent = `Shared hold: ${missingWorkbenchState(item).hold || "none — choose a hold or extra column"}`;
      fields.after(note, ...similar.content.childNodes);
    } else fields.after(...similar.content.childNodes);
  }
  const siblings = []; for (let next = fields.nextSibling; next; next = next.nextSibling) {
    if (next.nodeType === 1 && (next.classList.contains("similar-treatment") || next.classList.contains("review-scope"))) siblings.push(next);
  }
  const container = document.createElement("div"); container.append(fields, ...siblings);
  // Namespace existing parameter fields so multiple editors can coexist.
  container.querySelectorAll("[id]").forEach(element => { element.dataset.workbenchField = element.id; element.id = `workbench${index}_${element.id}`; });
  container.querySelectorAll("[data-similar-column]").forEach(element => { element.dataset.workbenchSimilar = element.dataset.similarColumn; element.removeAttribute("data-similar-column"); });
  return container.innerHTML;
}
function workbenchCandidatesHtml(item) {
  const data = missingWorkbenchState(item), meaning = reviewDraft(item).interpretation;
  const scopeTemplate = document.createElement("template"); scopeTemplate.innerHTML = guidedTreatmentHtml(item);
  const scope = scopeTemplate.content.querySelector(".treatment-scope"); scope.dataset.ui = "review.treat.scope";
  return `<section class="workbench-region" data-ui="review.workbench.candidates"><h3>Candidate fixes</h3>
    ${meaning !== "missing" ? '<p class="evidence">This interpretation keeps values unchanged. Only retention is available.</p>' : ""}
    <div class="workbench-candidates">${data.candidates.map((draft, index) => {
      const result = data.results?.candidates[index];
      return `<article class="workbench-candidate ${index === data.active ? "is-active" : ""}" data-workbench-candidate="${index}">
        <div class="workbench-candidate-heading"><label><input type="radio" name="activeWorkbenchCandidate" value="${index}" ${index === data.active ? "checked" : ""}> ${escapeHtml(treatmentLabel(draft.operation))}</label>${data.candidates.length > 2 ? `<button class="ghost" data-workbench-remove="${index}" aria-label="Remove candidate ${index + 1}">Remove</button>` : ""}</div>
        <details data-workbench-parameters="${index}" ${data.parameterOpen?.[index] ? "open" : ""}><summary>Parameters</summary>${meaning === "missing" ? workbenchCandidateEditor(item, draft, index) : '<p>Retain the reviewed source values.</p>'}</details>
        <p data-workbench-stats="${index}" role="status">${data.pending ? "Computing preview…" : result ? `${result.cellsChanging} cells changing · ${result.blockedCount} blocked · ${result.fallbackCount} fallbacks · after mean ${analyticalNumber(result.afterStats.mean)} / median ${analyticalNumber(result.afterStats.median)}` : "Preview unavailable"}</p>
        ${result ? `<p class="review-scope">${draft.operation === "leaveMissing" || draft.operation === "retain" ? "No physical changes" : result.preview.fillMetadata ? `Fill values: ${[...new Set(result.preview.fillMetadata.fills.map(fill => analyticalNumber(fill.value)))].slice(0, 8).join(", ")}` : `Fill values: ${[...new Set(result.preview.patches.map(patch => patch.after))].slice(0, 8).map(escapeHtml).join(", ")}`}</p>` : ""}
      </article>`;
    }).join("")}</div>
    ${meaning === "missing" ? `<div class="review-fields">${selectHtml("workbenchAddMethod", "Add candidate", reviewOperations(item).filter(operation => operation !== "retain").map(operation => [operation, treatmentLabel(operation)]), "knn")}</div><button class="secondary" id="workbenchAddCandidate" ${data.candidates.length >= 4 || !data.candidates.length ? "disabled" : ""}>Add candidate (up to 4)</button>` : ""}
    <details class="evidence-records" id="workbenchScope" ${data.scopeOpen ? "open" : ""}><summary>Scope · shared by every candidate</summary>${scope.outerHTML}</details></section>`;
}
function workbenchDistributionHtml(item) {
  const data = missingWorkbenchState(item), candidates = data.results?.candidates || [];
  const first = candidates[0]?.histogram;
  if (!first) return '<section class="workbench-region" data-ui="review.workbench.distribution"><h3>Shared distribution</h3><p role="status">Computing preview…</p></section>';
  const sets = [first.sets[0], ...candidates.map(candidate => candidate.histogram.sets[1])];
  const names = ["Cumulative working", ...candidates.map((candidate, index) => `${index + 1}. ${treatmentLabel(candidate.draft.operation)}`)];
  return `<section class="workbench-region" data-ui="review.workbench.distribution"><h3>Shared distribution</h3>
    <div class="chart-legend">${names.map((name, index) => `<span class="${index === 0 ? "working" : "proposed"} ${index === data.active + 1 ? "is-active" : "is-muted"}">${escapeHtml(name)}</span>`).join("")}</div>
    <div class="distribution-bars workbench-histogram" role="img" aria-label="Working and candidate distributions in shared bins">${Array.from({ length: first.bins }, (_, bin) => `<div>${sets.map((set, index) => `<i class="${index === 0 ? "working" : "proposed"} ${index === data.active + 1 ? "is-active" : "is-muted"}" style="height:${set.counts[bin] / data.results.countScale * 100}%" title="${escapeHtml(names[index])}: ${set.counts[bin]}"></i>`).join("")}</div>`).join("")}</div>
    <div class="distribution-axis"><span>${analyticalNumber(first.min)}</span><span>Shared 1st–99th percentile range · ${first.bins} bins</span><span>${analyticalNumber(first.max)}</span></div>
    <p class="review-scope">True min ${analyticalNumber(first.trueMin)} / max ${analyticalNumber(first.trueMax)}. ${sets.map((set, index) => `${escapeHtml(names[index])}: ${set.below} below / ${set.above} above`).join(" · ")}</p>
    ${data.hold ? `<label class="check"><input type="checkbox" id="workbenchByBand" ${data.byBand ? "checked" : ""}> By band · active candidate</label>${data.byBand && data.impact ? bandImpactHtml(data.impact) : ""}` : ""}</section>`;
}
function workbenchDependenciesHtml(dependencies) {
  return dependencies?.length ? `<details class="evidence-records dependency-impact" data-ui="review.preview.dependents"><summary>Dependent metric follow-ups</summary>${dependencies.map(entry => `<p><b>${escapeHtml(entry.name)}</b>: ${entry.violatingRowIds.length} changed rows would violate ${escapeHtml(entry.target)}; ${entry.blockedRowIds.length} unavailable. ${escapeHtml(entry.followUp)} after approval. Recalculation requires a separate review.</p>`).join("")}</details>` : "";
}
function workbenchKpiHtml(item) {
  const data = missingWorkbenchState(item), candidates = data.results?.candidates || [];
  const suggestions = CapabilitiesEngine.suggestedKpis(state.headers);
  return `<section class="workbench-region" data-ui="review.workbench.kpi"><h3>Business KPI impact</h3>
    ${!(state.ruleConfig.kpis || []).length ? `<p>No KPI defined. Add a suggested business measure to compare every candidate.</p>${suggestions.map((definition, index) => `<p>${escapeHtml(definition.name)} by ${escapeHtml(definition.groupBy || "total")} <button class="secondary" data-workbench-kpi="${index}">Use this KPI</button></p>`).join("") || '<p class="review-scope">No domain defaults match this dataset. Define KPIs from Dataset.</p>'}` : candidates.map((candidate, index) => `<details class="candidate-kpi" ${index === data.active ? "open" : ""}><summary>${index + 1}. ${escapeHtml(treatmentLabel(candidate.draft.operation))}${index === data.active ? " · active" : ""}</summary>${kpiImpactHtml(candidate.kpiImpact)}</details>`).join("") || '<p role="status">Computing business impact…</p>'}
    ${workbenchDependenciesHtml(data.dependencies)}</section>`;
}
function missingWorkbenchWorkspaceHtml(item) {
  const data = missingWorkbenchState(item), step = state.reviewStep >= 4 ? state.reviewStep : 1;
  const meaning = interpretationOptions(item).find(option => option.meaning === reviewDraft(item).interpretation)?.label || "Unknown / missing observation";
  let content;
  if (step === 1) {
    content = `<div class="missing-workbench" data-ui="review.workbench"><div class="workbench-evidence">${workbenchPatternHtml(item)}${workbenchHoldHtml(item)}${workbenchRecordsHtml(item)}</div><div class="workbench-fixes">${workbenchCandidatesHtml(item)}${workbenchDistributionHtml(item)}${workbenchKpiHtml(item)}<section class="workbench-region" data-ui="review.workbench.choose"><button class="primary" id="chooseWorkbenchFix" ${!data.results || data.pending || data.computedKey !== workbenchKey(item) ? "disabled" : ""}>Choose this fix and preview →</button><p class="review-scope">Proposed values are not applied. Preview and approval remain separate.</p></section></div></div>`;
  } else {
    try {
      const preview = guidedPreview(item); content = guidedPreviewHtml(item, preview, step === 5);
      if (["groupwise", "knn"].includes(reviewDraft(item).operation)) content += analyticalFillMetadataHtml(preview.fillMetadata);
      const headline = preview.kpiImpact?.map(result => result.headline).join(" ");
      if (headline) content += `<p class="review-scope" data-ui="review.preview.kpi-headline">KPI impact: ${escapeHtml(headline)}</p>`;
    } catch (error) { content = `<p class="workspace-error" role="alert">${escapeHtml(error.message)}</p>`; }
  }
  const displayStep = step === 1 ? 1 : step - 2;
  return `<section class="guided-card missing-workbench-card"><header class="guided-heading"><div><h2>${escapeHtml(item.label)}</h2><p class="guided-column">${escapeHtml(item.column)} · ${reviewRows(item).length.toLocaleString()} matching records</p><p class="workbench-meaning">Interpreted as: ${escapeHtml(meaning)} · <button class="ghost" id="changeWorkbenchMeaning" popovertarget="workbenchMeaning">change</button></p></div><button class="ghost" id="guidedDefer">Leave open</button></header>
    <div id="workbenchMeaning" popover class="workbench-meaning-popover" data-ui="review.workbench.interpretation">${guidedInterpretationHtml(item)}<button class="secondary" popovertarget="workbenchMeaning" popovertargetaction="hide" id="closeWorkbenchMeaning">Done</button></div>
    <nav class="review-stepper workbench-stepper" aria-label="Review steps">${[[1, "Workbench"], [4, "Preview"], [5, "Approve"]].map(([value, label], index) => `<button data-review-step="${value}" ${step === value ? 'aria-current="step"' : ""}><span>${index + 1}</span>${label}</button>`).join("")}</nav>
    <div class="guided-stage" data-current-step="${step}">${data.error ? `<p class="workspace-error" role="alert">${escapeHtml(data.error)} <button class="secondary" id="retryWorkbench">Retry comparison</button></p>` : ""}${content}</div>
    <footer class="guided-footer"><button class="secondary" id="reviewBack" ${step === 1 ? "disabled" : ""}>← Back</button><span>Step ${displayStep} of 3</span>${step < 5 ? `<button class="primary" id="reviewNext" ${step === 1 && (!data.results || data.pending) ? "disabled" : ""}>${step === 1 ? "Choose this fix and preview →" : "Review approval →"}</button>` : '<button class="primary" id="approveGuided">Approve this decision</button>'}</footer></section>`;
}
async function chooseWorkbenchCandidate(item) {
  const data = missingWorkbenchState(item);
  if (!data.results || data.pending || data.computedKey !== workbenchKey(item)) return notify("Wait for a fresh candidate preview before choosing this fix.");
  const selected = data.results.candidates[data.active];
  try {
    Object.assign(reviewDraft(item), structuredClone(selected.draft)); delete reviewDraft(item).previewFingerprint;
    const fingerprint = guidedFingerprint(item, reviewDraft(item));
    await prepareAnalyticalPreview(item, reviewDraft(item)); await prepareCapabilityPreview(item, reviewDraft(item));
    if (state.selectedIssue !== item.id || fingerprint !== guidedFingerprint(item, reviewDraft(item))) throw new Error("The review changed. Choose the candidate again.");
    const preview = guidedPreview(item);
    if (!preview.selectedIds.length) throw new Error("The scope contains no matching records.");
    state.reviewStep = 4; render();
  } catch (error) { notify(error.message); }
}
function enhanceMissingWorkbench(item) {
  const data = missingWorkbenchState(item), analytical = analyticalTarget(item.column);
  const popover = $("#workbenchMeaning");
  popover?.addEventListener("toggle", event => { if (popover.isConnected) data.interpretationOpen = event.newState === "open"; });
  if (data.interpretationOpen) popover?.showPopover();
  document.querySelectorAll("input[name=reviewInterpretation]").forEach(input => {
    input.onchange = () => {
      reviewDraft(item).interpretation = input.value; delete reviewDraft(item).previewFingerprint;
      if (input.value !== "missing") {
        data.missingCandidates ||= data.candidates; data.candidates = [workbenchDraft(item, "retain")]; data.active = 0;
      } else {
        data.candidates = data.missingCandidates || ["median", data.hold ? "groupwise" : "mean", "leaveMissing"].map(operation => workbenchDraft(item, operation));
        data.missingCandidates = null; data.active = 0;
      }
      state.reviewStep = 1; scheduleWorkbench(item, true);
    };
  });
  if (state.reviewStep >= 4) return;
  if (!analytical.result && !data.pending) { compareWorkbenchPattern(item); return; }
  if (!data.candidates.length && analytical.result && !data.pending) { compareWorkbenchPattern(item, true); return; }
  if (!data.pending && data.computedKey !== workbenchKey(item) && !data.error) { scheduleWorkbench(item); }
  $("#compareMissing").onclick = () => compareWorkbenchPattern(item, true);
  $("#retryWorkbench")?.addEventListener("click", () => compareWorkbenchPattern(item, true));
  $("#workbenchShowPatterns")?.addEventListener("click", () => { data.allPatterns = !data.allPatterns; renderWorkbenchIfVisible(item); });
  document.querySelectorAll("[data-workbench-pattern]").forEach(button => button.onclick = () => {
    data.detail = data.detail === button.dataset.workbenchPattern ? "" : button.dataset.workbenchPattern;
    analytical.comparisonColumn = button.dataset.workbenchPattern; renderWorkbenchIfVisible(item);
  });
  $("#workbenchHold").onchange = event => {
    data.hold = event.target.value; data.holdChosen = true; analytical.ai = null;
    analytical.held = []; data.held = null;
    if (data.compareColumn === data.hold) data.compareColumn = analytical.result.results.find(entry => entry.column !== data.hold)?.column || "";
    scheduleWorkbench(item, true);
  };
  $("#workbenchHeldColumn")?.addEventListener("change", event => { data.compareColumn = event.target.value; analytical.ai = null; analytical.held = []; data.held = null; scheduleWorkbench(item, true); });
  $("#workbenchBandMode")?.addEventListener("change", event => { data.banding = { mode: event.target.value, k: 4, width: 1, edges: [] }; analytical.ai = null; analytical.held = []; data.held = null; scheduleWorkbench(item, true); });
  for (const id of ["workbenchBandK", "workbenchBandWidth", "workbenchBandEdges"]) $("#" + id)?.addEventListener("input", () => { data.banding = readAnalyticalBand("workbenchBand"); analytical.ai = null; analytical.held = []; data.held = null; scheduleWorkbench(item); });
  $("#explainMissingPattern")?.addEventListener("click", async () => {
    data.pending = "ai"; data.error = ""; renderWorkbenchIfVisible(item);
    try { await requestPatternExplanation(item, analytical); } catch (error) { data.error = error.message; }
    finally { data.pending = ""; renderWorkbenchIfVisible(item); }
  });
  $("#addPatternCandidate")?.addEventListener("click", () => {
    if (data.candidates.length >= 4) return notify("Remove a candidate before adding another.");
    if (reviewDraft(item).interpretation !== "missing") return notify("Only retention is available for this interpretation.");
    const proposal = analytical.ai.proposal, methods = { fill_constant: "constant", fill_groupwise: "groupwise", fill_knn: "knn", leave_missing: "leaveMissing" };
    const draft = workbenchDraft(item, methods[proposal.operation]);
    if (draft.operation === "constant") draft.value = String(proposal.params.value);
    if (draft.operation === "groupwise") { draft.extraHoldColumns = proposal.params.holdColumns; draft.similar.statistic = proposal.params.statistic; }
    if (draft.operation === "knn") { draft.similar.columns = proposal.params.columns; draft.similar.k = proposal.params.k; }
    data.candidates.push(draft); scheduleWorkbench(item, true);
  });
  document.querySelectorAll("input[name=activeWorkbenchCandidate]").forEach(input => input.onchange = () => { data.active = Number(input.value); scheduleWorkbench(item, true); });
  document.querySelectorAll("[data-workbench-remove]").forEach(button => button.onclick = () => {
    data.candidates.splice(Number(button.dataset.workbenchRemove), 1); data.active = Math.min(data.active, data.candidates.length - 1); scheduleWorkbench(item, true);
  });
  $("#workbenchAddCandidate")?.addEventListener("click", () => {
    if (data.candidates.length >= 4) return;
    data.candidates.push(workbenchDraft(item, $("#workbenchAddMethod").value)); scheduleWorkbench(item, true);
  });
  bindWorkbenchParameters(item);
  $("#workbenchScope")?.addEventListener("toggle", event => { if (event.target.isConnected) data.scopeOpen = event.target.open; });
  document.querySelectorAll("[data-workbench-parameters]").forEach(details => details.addEventListener("toggle", () => {
    if (details.isConnected) { data.parameterOpen ||= {}; data.parameterOpen[details.dataset.workbenchParameters] = details.open; }
  }));
  const scopeFields = { reviewScopeMode: "mode", reviewScopeColumn: "column", reviewScopeOperator: "operator", reviewScopeValue: "value", reviewRowIds: "rowIds" };
  Object.entries(scopeFields).forEach(([id, key]) => {
    const input = $("#" + id); if (!input) return;
    const change = () => { data.scope[key] = key === "rowIds" ? input.value.trim() ? input.value.split(/[\s,]+/).map(Number) : [] : input.value; reviewDraft(item).scope = structuredClone(data.scope); delete reviewDraft(item).previewFingerprint; scheduleWorkbench(item, input.tagName === "SELECT"); };
    input[input.tagName === "SELECT" ? "onchange" : "oninput"] = change;
  });
  $("#recordLensMode").onchange = event => { data.records.mode = event.target.value; scheduleWorkbench(item, true); };
  document.querySelectorAll("[data-context-column]").forEach(input => input.onchange = () => {
    data.records.columns = [item.column, ...[...document.querySelectorAll("[data-context-column]:checked")].map(field => field.dataset.contextColumn)]; scheduleWorkbench(item);
  });
  $("#refreshRecordLens").onclick = () => scheduleWorkbench(item, true);
  document.querySelectorAll("[data-guided-locate],[data-capability-locate]").forEach(button => button.onclick = () => locateRecord(Number(button.dataset.guidedLocate || button.dataset.capabilityLocate)));
  $("#workbenchByBand")?.addEventListener("change", event => { data.byBand = event.target.checked; renderWorkbenchIfVisible(item); });
  document.querySelectorAll("[data-workbench-kpi]").forEach(button => button.onclick = () => {
    const definition = CapabilitiesEngine.suggestedKpis(state.headers)[Number(button.dataset.workbenchKpi)];
    const candidates = data.candidates, saved = structuredClone(data);
    applyRuleConfig({ ...exportRuleConfig(), kpis: [...(state.ruleConfig.kpis || []), definition] });
    state.selectedIssue = item.id; state.reviewStep = 1;
    const next = missingWorkbenchState(item);
    Object.assign(next, { ...saved, candidates, generation: 0, results: null, pending: "", timer: null });
    reviewDraft(item).interpretation = candidates[0].interpretation; reviewDraft(item).scope = structuredClone(next.scope);
    scheduleWorkbench(item, true);
  });
  $("#chooseWorkbenchFix").onclick = () => chooseWorkbenchCandidate(item);
}
function bindWorkbenchParameters(item) {
  const data = missingWorkbenchState(item);
  const scalars = { reviewOperation: "operation", reviewValue: "value", reviewFactor: "factor", reviewDecimals: "decimals", reviewGroupColumn: "groupColumn", reviewNumberFormat: "numberFormat", reviewDateFormat: "dateFormat", reviewLower: "lower", reviewUpper: "upper" };
  const similar = { similarK: "k", similarMinimum: "minObserved", similarStatistic: "statistic" };
  document.querySelectorAll("[data-workbench-candidate]").forEach(article => {
    const index = Number(article.dataset.workbenchCandidate), draft = data.candidates[index];
    article.querySelectorAll("[data-workbench-field]").forEach(input => {
      const field = input.dataset.workbenchField;
      const change = () => {
        if (scalars[field]) {
          draft[scalars[field]] = input.type === "number" ? Number(input.value) : input.value;
          if (field === "reviewOperation" && ["groupwise", "knn"].includes(input.value)) draft.similar ||= workbenchDraft(item, input.value).similar;
        } else if (similar[field]) draft.similar[similar[field]] = input.type === "number" ? Number(input.value) : input.value;
        else if (field === "similarDecimals") draft.decimals = Number(input.value);
        else if (field === "reviewCurrency") draft.currency = input.checked;
        else if (field === "reviewPercentage") draft.percentage = input.checked;
        else if (field.startsWith("similarBand")) {
          const group = input.closest("[data-band-column]"), prefix = input.id.replace(/(Mode|K|Width|Edges)$/, "");
          draft.similar.banding[group.dataset.bandColumn] = field.endsWith("Mode") ? { mode: input.value, k: 4, width: 1, edges: [] } : readAnalyticalBand(prefix);
        }
        scheduleWorkbench(item, input.tagName === "SELECT");
      };
      input[input.tagName === "SELECT" || input.type === "checkbox" ? "onchange" : "oninput"] = change;
    });
    article.querySelectorAll("[data-workbench-similar]").forEach(input => input.onchange = () => {
      const columns = [...article.querySelectorAll("[data-workbench-similar]:checked")].map(field => field.dataset.workbenchSimilar);
      if (draft.operation === "groupwise") draft.extraHoldColumns = columns; else draft.similar.columns = columns;
      scheduleWorkbench(item, true);
    });
  });
}
function anchorReviewUI() {
  const anchors = {
    ".sidebar": "app.navigation", ".topbar": "app.dataset-topbar",
    ".page-head": "review.page-header", ".analysis-banner": "review.ai-status",
    ".guided-setup": "review.setup", ".guided-tools": "review.setup.actions",
    ".candidate-queue": "review.queue", ".candidate-queue > header": "review.queue.header",
    "#reviewSearch": "review.queue.search", "#reviewKind": "review.queue.filter",
    ".candidate-button": "review.queue.item", ".review-closed": "review.queue.closed",
    ".guided-heading": "review.finding-header", ".review-stepper": "review.stepper",
    ".guided-stage": "review.stage", ".guided-footer": "review.footer",
    ".review-success": "review.confirmation", ".guided-empty": "review.empty",
    ".candidate-value-groups": "review.understand.value-groups",
    ".guided-stage > h3:first-child + p": "review.understand.summary",
    ".guided-stage > .evidence": "review.understand.rule-evidence",
    ".outlier-definition": "review.understand.outlier-definition",
    ".guided-key-columns": "review.understand.duplicate-keys",
    ".analytical-section": "review.missing.compare",
    ".analytical-section > .analysis-table-wrap": "review.missing.ranked-table",
    ".analytical-section > .analytical-histogram": "review.missing.detail",
    ".analytical-hold": "review.missing.held", ".analytical-ai": "review.missing.ai-explanation",
    ".interpretation-top": "review.interpret.ai-card", ".ai-alternatives": "review.interpret.alternatives",
    ".interpretation-choice": "review.interpret.selector", ".ai-followup": "review.interpret.copilot",
    "#reviewOperation": "review.treat.selector", ".guided-stage > .review-fields": "review.treat.params",
    ".treatment-scope": "review.treat.scope", ".similar-treatment": "review.treat.similar-row",
    ".candidate-comparison": "review.treat.candidates", ".preview-summary": "review.preview.summary-strip",
    ".preview-exceptions": "review.preview.exceptions", ".fill-provenance": "review.preview.fill-sources",
    ".band-impact": "review.preview.band-impact", ".kpi-impact": "review.preview.kpi",
    ".dependency-impact": "review.preview.dependents", ".capability-records": "review.preview.record-lens",
    ".approval-note": "review.approve.rationale", "#approveGuided": "review.approve.button",
    ".value-review": "review.value.meanings", ".representation-list": "review.value.strip",
    ".representation-focus": "review.value.focus", "#assessRepresentation": "review.value.assess",
    "#confirmRepresentation": "review.value.confirm", "#skipRepresentation": "review.value.skip"
  };
  Object.entries(anchors).forEach(([selector, name]) => {
    document.querySelectorAll(selector).forEach(element => { if (!element.dataset.ui) element.dataset.ui = name; });
  });
  const stage = document.querySelector(".guided-stage");
  if (stage) {
    const preview = state.reviewStep >= 4;
    stage.querySelectorAll(".review-distribution,.comparison-metrics").forEach(element => {
      if (!element.dataset.ui) element.dataset.ui = preview ? "review.preview.distribution" : "review.understand.distribution";
    });
    stage.querySelectorAll(".guided-table-wrap").forEach(element => {
      element.dataset.ui = preview ? "review.preview.records" : "review.understand.matching-records";
    });
    stage.querySelectorAll(".evidence-records:not([data-ui])").forEach(element => {
      element.dataset.ui = element.querySelector("[data-scatter-plot]") ? "review.understand.relationships" : "review.understand.matching-records";
    });
    const duplicate = stage.querySelector("#guidedDuplicateMode")?.closest(".review-fields");
    if (duplicate) duplicate.dataset.ui = "review.understand.duplicate-definition";
    const analytical = stage.querySelector(".analytical-section:not([data-ui='review.workbench.pattern'])");
    if (analytical && !analytical.querySelector("[data-ui='review.missing.detail']")) {
      const heading = analytical.querySelector(":scope > h4");
      if (heading) {
        const detail = document.createElement("div"); detail.dataset.ui = "review.missing.detail";
        heading.before(detail); let next = heading;
        while (next && !next.classList.contains("analytical-hold") && !next.classList.contains("analytical-ai")) {
          const sibling = next.nextElementSibling; detail.append(next); next = sibling;
        }
      }
    }
  }
  document.body.classList.toggle("debug-ui", new URLSearchParams(location.search).get("debug") === "ui");
}
