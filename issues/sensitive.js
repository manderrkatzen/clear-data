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
  function showRows(issue) {
    const session = ReviewCore.data(issue), panel = document.createElement("dialog");
    panel.innerHTML = `<header><h2>Affected sensitive rows</h2><button class="secondary" id="reviewCloseRows">Close</button></header><p>Examples stay masked here. The source snapshot remains local.</p>${samples(issue,session.preview.patches,lockedRows(issue,session))}`;
    ReviewCore.openRowsPanel(panel);
  }
  function bind(issue, session) {
    document.querySelectorAll("[data-sensitive-type]").forEach(input => input.onchange = () => { const before = lockedRows(issue,session).length; session.locked = input.checked ? session.locked.concat(input.dataset.sensitiveType) : session.locked.filter(type => type !== input.dataset.sensitiveType); ReviewCore.lockChanged(issue,before); renderPreservingReviewFocus(); });
    if (session.tab === "fix" && session.fix === "keep") { const button = document.getElementById("reviewApply"); if (!session.note.trim()) button.title = "Add a note explaining why these sensitive values can be kept"; }
  }
  function maskedExamples(issue,patches,records){
    const examples=patches.length?patches.slice(0,5).map(patch=>({row:patch.rowId,before:{value:ReviewPageEngine.mask(patch.before),raw:true},after:{value:patch.after.startsWith("sha256:")?patch.after:ReviewPageEngine.mask(patch.after),raw:true}})):records.slice(0,5).map(row=>({row:row._row,before:{value:ReviewPageEngine.mask(row[issue.column]),raw:true},after:"Source kept locally"}));
    return ReviewComponents.table({columns:[{key:"row",label:"Row",numeric:true},{key:"before",label:"Masked source"},{key:"after",label:"After"}],rows:examples,card:false,ui:"review.review.sample"});
  }
  function exploreContent(issue,session){ // SENS-E-01…03: masked data supplied to shared components; no AI slot.
    init(issue,session);const c=ReviewComponents,found=groups(state.rows,issue.column),items=found.map(group=>({value:group.type,raw:false,count:group.rows.length,share:`${(group.rows.length/state.rows.length*100).toFixed(1)}%`,control:`<input type="checkbox" data-sensitive-type="${escapeHtml(group.type)}" ${session.locked.includes(group.type)?"checked":""}>`,extra:`<span><code>${escapeHtml(group.rows.slice(0,3).map(row=>ReviewPageEngine.mask(row[issue.column])).join(" · "))}</code></span>`,meta:"processed locally",ui:"review.explore.sensitive.type",attrs:{"data-type":group.type}}));
    return {lead:`How should these ${count(issue)} personal values be shared?`,sub:"Review before exporting; originals remain in your local source and project backup.",selection:c.selection(items,{ui:"review.explore.sensitive.examples",total:`${lockedRows(issue,session).length} values selected`}),evidence:""};
  }
  function fixContent(issue,session,preview){return {examples:maskedExamples(issue,preview.patches,lockedRows(issue,session))};}
  function reviewContent(issue,decision){ // SENS-R-01…02
    const source=groups(decision.reviewImpact.beforeRows,issue.column).flatMap(group=>group.rows);
    return {lead:`${decision.patches.length} personal values ${decision.treatment.operation==="hash"?"coded":"masked"}.`,sub:`${decision.reviewSpec.label} · ${new Date(decision.createdAt).toLocaleTimeString()} · ${decision.note||"No note"}`,count:decision.rows.length,change:{metrics:[{label:"Values masked or coded",value:decision.patches.length},{label:"Columns removed",value:decision.structure.removedColumns.length}],text:"Original values remain in the local source; Undo restores them."},examples:maskedExamples(issue,decision.patches,source)};
  }
  return {detect,isSensitiveColumn,init,lockedRows,count,unit:"cells",exploreContent,fixContent,reviewContent,renderExplore:(issue,session)=>ReviewComponents.explore(issue,exploreContent(issue,session)),getFixOptions,reminder,consequence,aiExplore:undefined,showRows,bind};
})();
