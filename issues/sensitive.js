// SENS-D-01, SENS-D-02: personal values are classified locally; this module has no AI hook.
ReviewModules.sensitive = (() => {
  function groups(rows, column) {
    const found = new Map();
    for (const row of rows) { const type = ReviewPageEngine.sensitiveType(row[column],column); if (!type) continue; if (!found.has(type)) found.set(type,[]); found.get(type).push(row); }
    return [...found].map(([type,rows]) => ({type,rows}));
  }
  function detect(dataset) {
    return dataset.headers.flatMap(column => {
      const profile = dataset.profile.columns.find(profile => profile.column === column);
      if (["number","integer"].includes(profile?.role) && !CleaningEngine.isIdentifier(column) && !/(?:^|[_\s])(?:email|phone|mobile|ssn|dob|name|address)(?:$|[_\s])/i.test(column)) return [];
      const found = groups(dataset.rows,column);
      return found.length ? [{column,reviewType:"sensitive",type:"Sensitive data",label:"Sensitive data",rows:found.flatMap(group => group.rows),recommendation:"manual",status:"open",severity:"medium",summary:"Personal or financial identifiers need review before sharing."}] : [];
    });
  }
  function isSensitiveColumn(column) { return groups(state.original.concat(state.rows),column).length > 0 && (state.issues.some(issue => issue.column === column && issue.reviewType === "sensitive") || !["number","integer"].includes(cleaningProfile().columns.find(profile => profile.column === column)?.role)); }
  function init(issue, session) { if (session.locked === null) session.locked = groups(state.rows,issue.column).map(group => group.type); }
  function lockedRows(issue, session) { init(issue,session); return groups(state.rows,issue.column).filter(group => session.locked.includes(group.type)).flatMap(group => group.rows); }
  function count(issue) { return state.headers.includes(issue.column)?groups(state.rows,issue.column).reduce((sum,group)=>sum+group.rows.length,0):0; }
  function renderExplore(issue, session) { // SENS-E-01, SENS-E-02, SENS-E-03
    init(issue,session); const found = groups(state.rows,issue.column);
    return `<section class="sensitive-explore" data-ui="review.explore.sensitive"><h2 data-ui="review.explore.sensitive.summary">${escapeHtml(issue.column)} · ${found.map(group => `${group.rows.length} ${escapeHtml(group.type)} values`).join(" · ")}</h2><p>Review these identifiers before sharing the cleaned file. Detection and treatment run in your browser; these values are never sent to AI.</p><div class="sensitive-types">${found.map(group => `<label data-ui="review.explore.sensitive.type" data-type="${escapeHtml(group.type)}"><input type="checkbox" data-sensitive-type="${escapeHtml(group.type)}" ${session.locked.includes(group.type) ? "checked" : ""}><b>${escapeHtml(group.type)}</b><span>${ReviewCore.count(group.rows.length,"cells")}</span></label>`).join("")}</div><div class="sensitive-examples" data-ui="review.explore.sensitive.examples"><h3>Masked examples</h3>${found.flatMap(group => group.rows.slice(0,3).map(row => `<p><span>${escapeHtml(group.type)}</span><code>${escapeHtml(ReviewPageEngine.mask(row[issue.column]))}</code></p>`)).slice(0,10).join("")}</div></section>`;
  }
  function getFixOptions(issue, session) {
    return [{key:"mask",label:"Mask",risk:"Removes data",compute:() => ({operation:"mask"})}, {key:"hash",label:"Replace with a code",risk:"Removes data",disabled:typeof crypto==="undefined"||!crypto.subtle?"Deterministic codes require browser cryptography on a secure origin":"",compute:async () => {
      const mapping = Object.create(null);
      for (const value of new Set(lockedRows(issue,session).map(row => row[issue.column]))) { const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); mapping[value] = `sha256:${Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,"0")).join("")}`; }
      return {operation:"hash",mapping};
    }}, {key:"drop-column",label:"Remove column",risk:"Changes structure",disabled:state.headers.length < 2 ? "Keep at least one column" : "",compute:() => ({operation:"dropColumn"})}, {key:"keep",label:"Keep as is",risk:"Doesn't change values",requiresNote:true,compute:() => ({operation:"retain",interpretation:"legitimate"})}];
  }
  function reminder(issue, session) { return `Fixing: ${lockedRows(issue,session).length} sensitive cells in ${issue.column} · ${session.locked.join(", ")}`; }
  function consequence(issue, session, preview, option) { // SENS-F-01, SENS-F-02
    return {sentence:option.key === "drop-column" ? `Removes ${issue.column} and all its values from the working sheet and cleaned CSV.` : option.key === "keep" ? "Keeps these sensitive values. Add a note explaining why sharing them is appropriate." : `${preview.patches.length} values ${option.key === "hash" ? "replaced with deterministic SHA-256 codes" : "masked"}. You can still count customers with ‘Replace with a code’; masking makes some customers look identical.`, figures:[{label:"Values changed",before:0,after:preview.patches.length},{label:"Columns",before:state.headers.length,after:state.headers.length-(preview.removedColumns || []).length}],reason:option.key === "hash" ? "Codes cannot be decoded, but guessable inputs can still be matched. Undo restores values from your local source snapshot." : option.key === "mask" ? "Recognizable fragments remain; different customers can share the same mask." : "The preserved source and project backup still contain original identifiers."};
  }
  function samples(issue, patches, rows = []) { // SENS-R-02: no unmasked before-values in any review preview.
    const examples = patches.length ? patches.slice(0,5).map(patch => ({rowId:patch.rowId,before:ReviewPageEngine.mask(patch.before),after:patch.after.startsWith("sha256:") ? patch.after : ReviewPageEngine.mask(patch.after)})) : rows.slice(0,5).map(row => ({rowId:row._row,before:ReviewPageEngine.mask(row[issue.column]),after:"Source preserved locally"}));
    return `<div class="review-table-scroll sensitive-samples" data-ui="review.review.sample"><table><thead><tr><th>Row</th><th>Masked source</th><th>After</th></tr></thead><tbody>${examples.map(example => `<tr><td>${example.rowId}</td><td>${escapeHtml(example.before)}</td><td><code>${escapeHtml(example.after)}</code></td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderPreview(issue, session, preview) { return samples(issue,preview.patches,lockedRows(issue,session)); }
  function renderReview(issue, decision) { // SENS-R-01
    return `${ReviewCore.metricStrip([{label:"Cells changed",value:decision.patches.length},{label:"Rows removed",value:0},{label:"Columns added / removed",value:`0 / ${decision.structure.removedColumns.length}`},{label:"Columns removed",value:decision.structure.removedColumns.length},{label:decision.treatment.operation === "hash" ? "Values hashed" : "Values masked",value:decision.patches.length}])}${samples(issue,decision.patches,groups(decision.reviewImpact.beforeRows,issue.column).flatMap(group=>group.rows))}`;
  }
  function showRows(issue) {
    const session = ReviewCore.data(issue), panel = document.createElement("dialog");
    panel.innerHTML = `<header><h2>Affected sensitive rows</h2><button class="secondary" id="reviewCloseRows">Close</button></header><p>Examples stay masked here. The source snapshot remains local.</p>${samples(issue,session.preview.patches,lockedRows(issue,session))}`;
    ReviewCore.openRowsPanel(panel);
  }
  function bind(issue, session) {
    document.querySelectorAll("[data-sensitive-type]").forEach(input => input.onchange = () => { const before = lockedRows(issue,session).length; session.locked = input.checked ? session.locked.concat(input.dataset.sensitiveType) : session.locked.filter(type => type !== input.dataset.sensitiveType); ReviewCore.lockChanged(issue,before); renderPreservingReviewFocus(); });
    if (session.tab === "fix" && session.fix === "keep") { const button = document.getElementById("reviewApply"); if (!session.note.trim()) button.title = "Add a note explaining why these sensitive values can be kept"; }
  }
  return {detect,isSensitiveColumn,init,lockedRows,count,unit:"cells",renderExplore,getFixOptions,reminder,consequence,renderPreview,renderReview,showRows,bind};
})();
