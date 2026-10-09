// CORE-01, CORE-03, CORE-04: one shared shell/approval layer; independent issue modules register below.
var ReviewModules = {};
var ReviewCore = (() => {
  const risks = {"Doesn't change values":"neutral","Doesn't invent information":"safe","Estimates values":"estimate","Invents information":"estimate","Removes data":"remove","Changes structure":"structure"};
  const order = ["missing","outlier","duplicate-rows","duplicate-values","format","type-mismatch","scale","category-variants","whitespace","invalid","cross-column","constant","leading-zeros","multi-value","sensitive"];
  const kind = issue => issue.reviewType || "manual";
  function data(issue) {
    state.reviewPage ||= {};
    const session=state.reviewPage[issueKey(issue)] ||= {tab:issue.status === "open" ? "explore" : "review",fix:"",locked:null,unlocked:[],locks:[],banding:{},mapping:{},value:"",preview:null,pending:false,error:"",note:"",noteOpen:false,more:false,ai:null,aiStatus:"idle",aiRequested:false,aiController:null,generation:0,skipBlocked:false,acknowledgeConstraints:false,acknowledgeConflicts:false,byGroup:false,openGroups:{},extraColumns:[],showRows:{},sourceVersion:state.datasetRevision};
    if(session.sourceVersion!==state.datasetRevision) { // CORE-27, CORE-50, CORE-54: old evidence never becomes a current approval/proposal.
      session.sourceVersion=state.datasetRevision;session.generation++;session.preview=null;session.pending=false;session.aiController?.abort();session.aiFixProposal=null;
      if(session.aiRequested){session.ai=null;session.aiStatus="error";session.aiReason="error";session.aiStale=true;}
      ReviewModules[kind(issue)]?.invalidate?.(session);
    }
    return session;
  }
  function moduleFor(issue) { return ReviewModules[kind(issue)] || generic; }
  // CORE-48: infer display precision from real observations; IDs are never averaged.
  function numericType(column) { return ["number","integer"].includes(cleaningProfile().columns.find(profile=>profile.column === column)?.role); }
  function precision(column) { if (/usd|revenue|sales|amount|spend|cost|price|total/i.test(column) && numericType(column)) return 2; if (/pct|percent|ctr/i.test(column)) return 1; const values = ReviewCharts.numeric(state.rows,column); if (columnPolicy(column).role === "integer" || values.length && values.every(Number.isInteger)) return 0; return Math.min(3,Math.max(1,columnPolicy(column).decimals)); }
  function format(value,column = "",options = {}) { // CORE-48: fixed monetary/percentage precision, integral measurements otherwise.
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "not available";
    const percent=/pct|percent|ctr/i.test(column), monetary=options.money || /usd|revenue|sales|amount|spend|cost|price|total/i.test(column) && numericType(column),decimals=options.decimals ?? precision(column),minimum=monetary?2:percent?1:0;
    const number=Number(value).toLocaleString(undefined,{minimumFractionDigits:Math.min(minimum,decimals),maximumFractionDigits:decimals});
    return `${options.money?"$":""}${number}${!options.money && percent?"%":""}`;
  }
  function count(value,unit,total = state.rows.length) { return `${Number(value).toLocaleString()} ${unit} (${(value/Math.max(1,total)*100).toFixed(1)}%)`; }
  // CORE-31: explicit override, then first matching numerical column in dataset order, else rows.
  function metricColumn() { if (state.primaryReviewMetric === "__rows__") return ""; if (state.headers.includes(state.primaryReviewMetric) && numericType(state.primaryReviewMetric)) return state.primaryReviewMetric; return state.headers.find(column=>/revenue|sales|amount|spend|cost|price|total/i.test(column) && numericType(column)) || ""; }
  function total(rows,column = metricColumn()) { if (!column) return rows.length; return ReviewCharts.numeric(rows,column).reduce((sum,value)=>sum+value,0); }
  function money(value,column = metricColumn()) { return format(value,column,{money:Boolean(column && /usd|revenue|sales|amount|spend|cost|price|total/i.test(column)),decimals:column ? precision(column) : 0}); }
  function affected(issue) { return state.headers.includes(issue.column) ? moduleFor(issue).lockedRows(issue,data(issue)) : []; }
  function exploreScope(issue) {return state.headers.includes(issue.column)?moduleFor(issue).exploreRows?.(issue,data(issue)) || affected(issue):[];}
  function measure(issue) { const rows = affected(issue), metric = metricColumn(), carry = total(rows,metric), whole = total(state.rows,metric); return {rows,metric,carry,whole,share:whole ? carry/whole*100 : 0}; }
  function optionList(issue) { // CORE-24, CORE-50: selecting a validated AI option accepts parameters, never applies data.
    const session=data(issue),options=moduleFor(issue).getFixOptions(issue,session),proposal=session.aiFixProposal,original=proposal && options.find(option=>option.key===proposal.operation);
    if(original)options.push({...original,key:`ai:${original.key}`,label:`AI: ${original.label}`,more:false,compute:context=>{
      for(const key of ["value","factor","lower","upper","dateFormat","targetFormat","orderColumn","separator"])if(proposal.params?.[key]!==undefined)session[key]=String(proposal.params[key]);
      if(proposal.params?.blankMeansValue!==undefined)session.blankMeansValue=proposal.params.blankMeansValue;
      if(proposal.params?.k!==undefined)session.knnK=proposal.params.k;
      if(proposal.params?.columns)session.knnColumns=[...proposal.params.columns];
      if(proposal.params?.keepRule)session.keepRule=structuredClone(proposal.params.keepRule);
      if(proposal.mapping && kind(issue)==="category-variants")session.mapping={...session.mapping,...proposal.mapping};
      return original.compute(context);
    }});
    return options;
  }
  function choice(issue) { const options = optionList(issue); return options.find(option=>option.key === data(issue).fix) || options[0]; }
  function select(id,tab = null) { const issue = state.issues.find(item=>item.id === id); if (!issue) return; state.selectedIssue = id; state.screen = "issues"; data(issue).tab = tab || (issue.status === "open" ? "explore" : "review"); render(); document.querySelector(`[data-review-issue="${id}"]`)?.scrollIntoView({block:"nearest"}); }
  function current() { return state.issues.find(issue=>issue.id === state.selectedIssue); }
  function showScopeUpdate(issue) { // CORE-17: the three-second notice starts when Fix becomes visible.
    const session=data(issue);if(!session.pendingUpdate)return;
    session.updated=session.pendingUpdate;session.pendingUpdate="";clearTimeout(session.updateTimer);
    session.updateTimer=setTimeout(()=>{session.updated="";if(state.screen==="issues"&&current()?.id===issue.id)renderPreservingReviewFocus();},3000);
  }
  function switchTab(issue,tab) { // CORE-16, CORE-17, CORE-18
    const session=data(issue),decision=state.changes.find(change=>change.issue.id===issue.id);
    if(tab==="fix"&&!exploreScope(issue).length || tab==="review"&&!decision)return;
    session.tab=tab;
    if(tab==="fix") {
      const options=optionList(issue);if(!options.some(option=>option.key===session.fix))session.fix=options[0]?.key || "";
      showScopeUpdate(issue);
      if(!session.preview || session.preview.fingerprint!==guidedFingerprint(issue,reviewDraft(issue)))return compute(issue);
    }
    renderPreservingReviewFocus();
  }
  function lockChanged(issue,before) {
    const session=data(issue),delta=affected(issue).length-before;session.generation++;session.pending=false;session.preview=null;
    session.pendingUpdate=`Updated: ${Math.abs(delta)} ${delta>=0?"more":"fewer"} ${moduleFor(issue).unit || "cells"} locked`;
    if(session.tab==="fix")showScopeUpdate(issue);
  }
  async function compute(issue) {
    const session = data(issue), generation = ++session.generation, revision = state.datasetRevision, selected = choice(issue); session.pending = true; session.preview = null; session.error = ""; renderPreservingReviewFocus();
    try {
      if(selected.disabled)throw new Error(selected.disabled);
      const parameters = await selected.compute({issue,session,rows:affected(issue)});
      if(generation!==session.generation || revision!==state.datasetRevision)return;
      const draft = reviewDraft(issue), rowIds = affected(issue).map(row=>row._row);
      draft.requiresConflictAcknowledgement=Boolean(parameters.requiresConflictAcknowledgement);
      Object.assign(draft,{...parameters,scope:{mode:"selected",rowIds},interpretation:parameters.interpretation || (parameters.operation === "retain" ? "legitimate" : kind(issue) === "missing" ? "missing" : "error"),lockedMissing:kind(issue) === "missing",note:session.note,decimals:parameters.decimals ?? precision(issue.column),groupColumns:session.locks,skipBlocked:session.skipBlocked,acknowledgeConstraints:session.acknowledgeConstraints,acknowledgeConflicts:parameters.requiresConflictAcknowledgement?true:session.acknowledgeConflicts}); delete draft.previewFingerprint;
      if (["groupwise","knn"].includes(draft.operation)) { const classifications = effectiveClassifications().concat(affected(issue).map(row=>({rowId:row._row,column:issue.column,value:row[issue.column],meaning:"missing"}))); draft.similarResult = await analyticalTask("fill",issue.column,{params:{...draft.similar,method:draft.operation,rowIds},options:{...analyticalOptions(),classifications}}); }
      if (generation !== session.generation || revision !== state.datasetRevision) return;
      session.preview = guidedPreview(issue,draft);if(parameters.parseBlocked?.length){const reasons=new Map(parameters.parseBlocked.map(entry=>[entry.rowId,entry.reason]));session.preview.blocked=session.preview.blocked.map(entry=>({...entry,reason:reasons.get(entry.rowId)||entry.reason}));} session.fingerprint = session.preview.fingerprint; session.selectedCount = rowIds.length;
    } catch (error) { if (generation === session.generation) session.error = error.message; }
    finally { if (generation === session.generation) {session.pending=false;if (state.screen === "issues" && current()?.id === issue.id) renderPreservingReviewFocus();} }
  }
  async function apply(issue) { // CORE-27, CORE-28: recheck fingerprint, no silent valid subset.
    const session = data(issue), draft = reviewDraft(issue), option = choice(issue);
    const targetRole=cleaningProfile().columns.find(profile=>profile.column===issue.column)?.role;
    const targetPolicy=structuredClone(columnPolicy(issue.column)),targetPrecision=precision(issue.column),moduleDetails=moduleFor(issue).decisionMetadata?.(issue,session,session.preview) || {};
    if (!session.preview || session.pending || session.fingerprint !== guidedFingerprint(issue,draft)) return notify("The preview changed. Check the selected fix again.");
    if (option.requiresNote && !session.note.trim()) return notify("Add a note explaining this choice.");
    if (draft.requiresConflictAcknowledgement && !session.acknowledgeConflicts) return notify("Review the differing duplicate cells and acknowledge the survivor policy.");
    draft.previewFingerprint = session.fingerprint;
    const change = approveGuidedDecision(issue); if (!change) return;
    change.reviewSpec = {fix:option.key,label:option.label,risk:typeof option.risk==="function"?option.risk(session):option.risk,metric:metricColumn(),targetRole,targetPolicy,targetPrecision,lockedValues:[...(session.locked || [])],locks:[...session.locks],banding:structuredClone(session.banding),...moduleDetails}; change.snapshot.reviewSpec = {...change.reviewSpec};
    const event=state.auditEvents.find(event=>event.kind==="approval"&&event.decision.id===change.id);if(event)event.decision.reviewSpec=structuredClone(change.reviewSpec);
    session.tab="review"; session.changeId=change.id; state.selectedIssue=issue.id; render();
  }
  function accept(issue,extra = {}) { // CORE-15: no change, next issue, reversible acceptance.
    // SENS-F-02: header acceptance must use the same required-note path as Keep.
    if (kind(issue) === "sensitive") { const session=data(issue);if(!affected(issue).length)session.locked=null;session.fix="keep";session.noteOpen=true;return switchTab(issue,"fix"); }
    const session = data(issue), draft = reviewDraft(issue); Object.assign(draft,{operation:"retain",interpretation:"legitimate",lockedMissing:false,scope:{mode:"selected",rowIds:reviewRows(issue).map(row=>row._row)},note:session.note,...extra}); draft.previewFingerprint=guidedFingerprint(issue,draft); const change=approveGuidedDecision(issue); if (!change) return; change.reviewSpec={fix:"keep",label:extra.repeatableColumn ? "Repeats allowed" : "Accepted without changes",risk:"Doesn't change values",metric:metricColumn()}; change.snapshot.reviewSpec={...change.reviewSpec}; session.tab="review"; const next=state.issues.find(item=>item.status === "open" && item.id !== issue.id); if (next) select(next.id); else select(issue.id,"review"); }
  function undo(issue) { // CORE-37
    const session=data(issue), change=state.changes.find(change=>change.issue.id===issue.id); if (!change || !rollbackChange(change.id)) return; session.tab="explore"; session.preview=null;session.error="";state.selectedIssue=issue.id;render();
  }
  // CORE-30, CORE-32: consequence is the centre of Fix, not a redundant chart wall.
  function consequence(issue,preview,option) { const content=moduleFor(issue).consequence(issue,data(issue),preview,option), risk=typeof option.risk === "function" ? option.risk(data(issue)) : option.risk; return `<section class="review-consequence" data-ui="review.fix.consequence"><p class="review-effect">${escapeHtml(content.sentence)}</p>${content.effect?`<p class="review-effect-detail">${escapeHtml(content.effect)}</p>`:""}<div class="review-effect-figures">${(content.figures||[]).slice(0,content.figureLimit || 3).map(figure=>`<span>${escapeHtml(figure.label)} <b>${escapeHtml(figure.before)} → ${escapeHtml(figure.after)}</b></span>`).join("")}</div><p class="review-risk ${risks[risk]}" data-ui="review.fix.risk"><b>${escapeHtml(risk)}</b>${content.reason ? ` · ${escapeHtml(content.reason)}` : ""}</p>${content.detail ? `<p class="review-effect-detail">${escapeHtml(content.detail)}</p>` : ""}${impactMetricHtml()}</section>`; }
  function impactMetricHtml(){ // CORE-31: identify the actual aggregation without changing default metric policy.
    const metric=metricColumn();return `<details class="review-impact-setting"><summary>Impact metric · ${metric?`Sum of ${escapeHtml(metric)}`:"Row count"}</summary><label>Metric<select id="reviewImpactMetric"><option value="" ${!state.primaryReviewMetric?"selected":""}>Automatic: first matching numeric column</option><option value="__rows__" ${state.primaryReviewMetric==="__rows__"?"selected":""}>Row count</option>${state.headers.filter(numericType).map(column=>`<option value="${escapeHtml(column)}" ${state.primaryReviewMetric===column?"selected":""}>Sum of ${escapeHtml(column)}</option>`).join("")}</select></label><p>These are column sums, not a derived revenue calculation.</p></details>`;
  }
  function optionsHtml(issue) { // CORE-21, CORE-23, CORE-24, MISS-F-01: default, selected and AI choices fit the four-choice limit.
    const session=data(issue),options=optionList(issue),keys=new Set([options[0]?.key,session.fix,...options.filter(option=>option.key.startsWith("ai:")||option.key==="ai-typos").map(option=>option.key)]);
    for(const option of options)if(!option.more&&keys.size<4)keys.add(option.key);
    const visible=options.filter(option=>keys.has(option.key)),hidden=options.filter(option=>!keys.has(option.key));
    const reasons=[...new Set(options.filter(option=>option.disabled).map(option=>option.disabled))];
    return `<div class="review-fix-options" data-ui="review.fix.options">${visible.map(option=>`<div class="review-option-wrap ${session.fix===option.key?"selected":""}"><button id="reviewFix-${option.key}" class="review-fix-choice" data-ui="review.fix.option" data-fix="${option.key}" aria-pressed="${session.fix===option.key}" ${option.disabled?`disabled title="${escapeHtml(option.disabled)}" aria-describedby="reviewMethodHelp"`:""}>${escapeHtml(option.label)}</button>${session.fix===option.key&&option.params?option.params(issue,session):""}</div>`).join("")}${hidden.length?`<label class="review-more" data-ui="review.fix.more"><span>More</span><select id="reviewMore" aria-label="More fixes"><option value="">Other methods</option>${hidden.map(option=>`<option value="${option.key}" ${option.disabled?`disabled title="${escapeHtml(option.disabled)}"`:""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`:""}</div>
      ${reasons.length?`<p class="review-method-help" id="reviewMethodHelp">${kind(issue)==="missing"&&!session.locks.length?'<button class="text-button" id="reviewChooseFillGroups">Choose fill groups</button> to use a group-based fill. ':""}${escapeHtml(reasons.filter(reason=>reason!=="Choose a fill group below").join(" · "))}</p>`:""}
      ${session.aiFixProposal?`<p class="review-ai-reason">AI · ${escapeHtml(session.aiProvider || "configured provider")}: ${escapeHtml(session.aiFixProposal.reason || session.aiFixProposal.note)}</p>`:""}`;
  }
  function fixHtml(issue) { // CORE-18, CORE-21, CORE-22, CORE-23, CORE-24, CORE-26, CORE-27, CORE-28
    const session=data(issue),option=choice(issue),preview=session.preview;
    return `<button class="review-reminder" data-ui="review.fix.reminder" id="reviewReminder">${escapeHtml(moduleFor(issue).reminder(issue,session))}</button>${session.updated?`<p class="review-update" role="status">${escapeHtml(session.updated)}</p>`:""}${optionsHtml(issue)}
      ${moduleFor(issue).renderFixSetup?.(issue,session)||""}
      ${session.askOpen?`<div class="review-ai-box"><label>Your instruction<input id="reviewAiInstruction" maxlength="300" value="${escapeHtml(session.instruction || "")}" placeholder="Describe the fix you need"></label><button class="secondary" id="reviewSuggestAi">Suggest a fix</button>${aiStatus(issue)}</div>`:""}
      ${preview?consequence(issue,preview,option):`<p role="status" class="review-empty-copy">${session.pending?'<span class="review-spinner" aria-hidden="true"></span>Checking this fix…':escapeHtml(session.error || "Choose a fix to compute its effect.")}</p>`}
      ${preview?`<section data-ui="review.fix.preview" class="review-preview">${moduleFor(issue).renderPreview(issue,session,preview,option)}</section>`:""}
      ${preview?.blocked.length?`<div class="review-blocked" data-ui="review.fix.blocked"><p>${preview.blocked.length} rows can’t be fixed · ${escapeHtml(preview.blocked[0].reason)} <button class="text-button" id="reviewBlockedList">See list</button></p><label><input id="reviewSkipBlocked" type="checkbox" ${session.skipBlocked?"checked":""}> Apply to the rest</label></div>`:""}
      ${preview?.constraints.length?`<label class="review-constraint"><input id="reviewConstraints" type="checkbox" ${session.acknowledgeConstraints?"checked":""}> I reviewed ${preview.constraints.length} new rule violations.</label><p>${escapeHtml(preview.constraints.slice(0,3).map(entry=>entry.reason).join(" · "))}</p>`:""}
      <footer class="review-fix-footer" data-ui="review.fix.footer"><p id="reviewApplyReason" class="review-apply-reason" role="status" hidden></p><button class="text-button" id="reviewRows" data-ui="review.fix.rows" ${!preview?'disabled title="Wait for the preview"':""}>See affected rows</button><button class="text-button" id="reviewAddNote" data-ui="review.fix.note">Add a note</button>${moduleFor(issue).aiFix?`<button class="text-button" id="reviewAskAi" data-ui="review.fix.ai" aria-expanded="${Boolean(session.askOpen)}">AI suggestion</button>`:""}<button class="primary" id="reviewApply" data-ui="review.fix.apply" ${!preview?'disabled title="Wait for the preview"':""}>${["retain","leaveMissing","toText"].includes(reviewDraft(issue).operation)?"Mark as reviewed":"Apply"}</button></footer>
      ${session.noteOpen?`<label class="review-note">Decision note<input id="reviewNote" maxlength="2000" value="${escapeHtml(session.note)}"></label>`:""}`;
  }
  function metricStrip(entries) { // CORE-35: structural counts are shared, even for a value-only issue.
    const decision=state.changes.find(change=>change.issue.id===current()?.id), labels=entries.map(entry=>entry.label.toLowerCase());
    if(decision && !labels.includes("cells changed"))entries.unshift({label:"Cells changed",value:decision.patches.length});
    if (decision && !labels.some(label=>label.includes("rows removed"))) entries.push({label:"Rows removed",value:decision.removedRows.length});
    if (decision && !labels.some(label=>label.includes("columns added"))) entries.push({label:"Columns added / removed",value:`${decision.structure?.addedColumns.length || 0} / ${decision.structure?.removedColumns.length || 0}`});
    if(kind(current()||{})==="missing"){
      const primary=entries.filter(entry=>["Cells filled","Missing"].includes(entry.label)),secondary=entries.filter(entry=>!primary.includes(entry));
      const html=list=>list.map(entry=>`<div><b>${escapeHtml(entry.value)}</b><span>${escapeHtml(entry.label)}</span></div>`).join("");
      return `<section class="review-metric-summary" data-ui="review.review.metrics"><div class="review-metric-strip review-primary-metrics">${html(primary)}</div><details class="review-decision-details"><summary>Decision details</summary><div class="review-metric-strip">${html(secondary)}</div></details></section>`;
    }
    return `<div class="review-metric-strip" data-ui="review.review.metrics">${entries.map(entry=>`<div><b>${escapeHtml(entry.value)}</b><span>${escapeHtml(entry.label)}</span></div>`).join("")}</div>`;
  }
  function reviewHtml(issue) { // CORE-36, CORE-38, CORE-39, CORE-56
    const change=state.changes.find(change=>change.issue.id===issue.id);
    if(!change)return `<p class="review-empty-copy">${issue.status==="resolved"?"The current data no longer matches this finding. No separate decision was recorded; inspect the changes in Decisions.":"Apply a fix to see changes."}</p>`;
    const noChange=change.treatment?.operation==="retain" && !change.patches.length && !change.removedRows.length,content=noChange?change.treatment.repeatableColumn?'<h2>Accepted: repeats allowed</h2><p>The source values are retained; this column may repeat.</p>':'<h2>Accepted without changes</h2><p>The source values are retained.</p>':moduleFor(issue).renderReview(issue,change);
    return `${content}<p class="review-decision" data-ui="review.review.decision">${escapeHtml(change.reviewSpec?.label || change.title)} · applied ${escapeHtml(new Date(change.createdAt).toLocaleTimeString())} · note: ${escapeHtml(change.note || "none")}</p><footer class="review-review-footer" data-ui="review.review.footer"><button class="secondary" id="reviewUndo" data-ui="review.review.undo">Undo</button><button class="text-button" id="reviewNext" data-ui="review.review.next" ${!state.issues.some(item=>item.status==="open")?'disabled title="No open issues remain"':""}>Next issue →</button></footer>`;
  }
  function sampleTable(issue,patches,context = [],limit = 5,records = state.rows) {
    const changed=patches.filter(patch=>patch.before!==patch.after);
    if (!changed.length) return '<p class="review-empty-copy" data-ui="review.review.sample">No cell values change for this choice.</p>';
    const byId=new Map(state.original.concat(records).map(row=>[row._row,row]));
    return `<div class="review-table-scroll" data-ui="review.review.sample"><table><thead><tr><th>Row</th><th>Before → after</th>${context.map(column=>`<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${changed.slice(0,limit).map(patch=>`<tr><td>${patch.rowId}</td><td><code>${escapeHtml(patch.before || "(blank)")} → ${escapeHtml(patch.after || "(blank)")}</code></td>${context.map(column=>`<td>${escapeHtml(byId.get(patch.rowId)?.[column] || "not recorded")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function aiStatus(issue,override = {}) { // CORE-53: visible progress and specific failure reason; local controls remain usable.
    const session={...data(issue),...override},pending=session.aiStatus==="pending";
    const text=pending?"AI is checking…":session.aiStatus==="error"?`AI unavailable: ${session.aiReason || "error"}${session.aiValidationError?" · AI suggestion couldn't be used":""}${session.aiLocalOnly?" · Sensitive values stay local":""}${session.aiStale?" · Context changed; refresh the suggestion":""}`:session.ai?`AI · ${session.aiProvider || "configured provider"}`:session.aiUnavailableByConfig?"AI unavailable: not configured":"AI has not been requested";
    return `<p class="review-ai-status" data-ui="review.ai.status" role="status">${pending?'<span class="review-spinner" aria-hidden="true"></span>':""}${escapeHtml(text)}</p>`;
  }
  function errorReason(response,payload) { const text=String(payload?.error || "").toLowerCase(),raw=Number(response.headers?.get("retry-after") || payload?.retryAfterSeconds || 3600),seconds=Number.isFinite(raw)?raw:3600;return response.status===429?`limit reached (resets in ${Math.max(1,Math.ceil(seconds/60))} min)`:response.status===503?"not configured":/verif|security|turnstile/.test(text)?"verification failed":/timed|timeout/.test(text)||response.status===504?"timed out":"error"; }
  async function requestAi(issue,mode,context) {
    const session=data(issue), source=state.original, revision=state.datasetRevision,fingerprint=()=>JSON.stringify([session.locked,session.locks,session.banding,session.instruction,session.range,session.tolerance,session.targetFormat,session.sourceDate,session.percent,kind(issue)==="outlier"?outlierDraft(issue):null]),scope=fingerprint();
    session.aiMode=mode;
    // SENS-D-02: another issue on the same personal column must not bypass local-only review.
    if (ReviewModules.sensitive?.isSensitiveColumn(issue.column) || containsSensitiveText({context,instruction:session.instruction || ""})) { session.aiRequested=true; session.aiStatus="error"; session.aiReason="error";session.aiLocalOnly=true;session.ai=null; renderPreservingReviewFocus(); return; }
    session.aiController?.abort(); const controller=new AbortController(); session.aiController=controller; session.aiStatus="pending"; session.aiReason=""; session.aiValidationError=false;session.aiLocalOnly=false;session.aiStale=false;session.ai=null; session.aiRequested=true; renderPreservingReviewFocus();
    try {
      const config=await fetch("/api/ai/review",{signal:controller.signal}).then(response=>response.json()); turnstileSiteKey=config.turnstileSiteKey||"";
      const token=await requestTurnstileToken(controller.signal);
      const response=await fetch("/api/ai/review",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json"},body:JSON.stringify({mode,instruction:session.instruction||"",context,turnstileToken:token})});
      const payload=await response.json();
      if (!response.ok) { session.aiReason=errorReason(response,payload); session.aiValidationError=payload.error==="AI suggestion couldn't be used"; throw new Error(payload.error||"AI unavailable"); }
      if (source!==state.original || revision!==state.datasetRevision || controller!==session.aiController) return;
      if(scope!==fingerprint()){session.aiStatus="error";session.aiReason="error";session.aiStale=true;return;}
      session.ai=payload.result; session.aiProvider=payload.provider||"configured provider"; session.aiStatus="ready"; return payload.result;
    } catch(error) { if(source===state.original && revision===state.datasetRevision && controller===session.aiController && error.name!=="AbortError") {session.aiStatus="error";session.aiReason ||= /timed|timeout/i.test(error.message) ? "timed out" : "error";} }
    finally { if(state.screen==="issues" && current()?.id===issue.id) renderPreservingReviewFocus(); }
  }
  let sensitiveTextCache=null;
  function containsSensitiveText(value) {
    if (typeof value === "string") {
      if (!sensitiveTextCache || sensitiveTextCache.source!==state.original || sensitiveTextCache.revision!==state.datasetRevision) {
        const columns=[...new Set(state.issues.filter(issue=>issue.reviewType==="sensitive").map(issue=>issue.column))];
        sensitiveTextCache={source:state.original,revision:state.datasetRevision,values:[...new Set(state.original.concat(state.rows).flatMap(row=>columns.flatMap(column=>{const cell=String(row[column]??"");return cell && ReviewPageEngine.sensitiveType(cell,column) ? [cell] : [];})))]};
      }
      return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value) || !/^\d+(?:\.\d+)?$/.test(value) && Boolean(ReviewPageEngine.sensitiveType(value)) || sensitiveTextCache.values.some(cell=>value.includes(cell));
    }
    if (Array.isArray(value)) return value.some(containsSensitiveText);
    return value && typeof value === "object" ? Object.entries(value).some(([key,entry]) => containsSensitiveText(key) || containsSensitiveText(entry)) : false;
  }
  function updateApplyButton(issue) { // CORE-27, CORE-28, CORE-57, SENS-F-02: one gate, with a specific reason.
    const session=data(issue), preview=session.preview, option=choice(issue), button=document.getElementById("reviewApply");
    if (!button) return;
    const reason=issue.status!=="open" ? "This issue is already reviewed; Undo its decision first" : session.error ? session.error : session.pending || !preview ? "Wait for a complete preview" : !preview.selectedIds.length ? "Lock at least one item in Explore" : option.requiresNote && !session.note.trim() ? "Add a note explaining why these values can be kept" : preview.blocked.length===preview.selectedIds.length ? "Every selected row is blocked; choose another fix" : preview.blocked.length && !session.skipBlocked ? "Review blocked rows and explicitly choose Apply to the rest" : preview.constraints.length && !session.acknowledgeConstraints ? "Acknowledge the new rule violations" : reviewDraft(issue).requiresConflictAcknowledgement && !session.acknowledgeConflicts ? "Acknowledge the differing duplicate cells and survivor policy" : "";
    button.disabled=Boolean(reason); button.title=reason;
    const explanation=document.getElementById("reviewApplyReason");if(explanation){explanation.textContent=reason;explanation.hidden=!reason;button.setAttribute("aria-describedby","reviewApplyReason");}
  }
  let aiConfiguration;
  function checkAiConfiguration(issue) { // CORE-T-03: a configuration read does not trigger on-request interpretation.
    const module=moduleFor(issue);if(!module.aiExplore&&!module.aiFix)return;
    const source=state.original,session=data(issue);
    aiConfiguration ||= fetch("/api/ai/review").then(response=>response.ok?response.json():{}).catch(()=>({}));
    aiConfiguration.then(config=>{if(source!==state.original)return;const unavailable=config.available===false;if(session.aiUnavailableByConfig===unavailable)return;session.aiUnavailableByConfig=unavailable;if(state.screen==="issues"&&current()?.id===issue.id)renderPreservingReviewFocus();});
  }
  function bindShared(issue) {
    const session=data(issue), bind=(id,event,callback)=>document.getElementById(id)?.addEventListener(event,callback);
    document.querySelectorAll("[data-review-tab]").forEach(button=>button.onclick=()=>switchTab(issue,button.dataset.reviewTab));
    bind("reviewAccept","click",()=>accept(issue)); bind("reviewReminder","click",()=>switchTab(issue,"explore"));
    document.querySelectorAll("[data-fix]").forEach(button=>button.onclick=()=>{session.fix=button.dataset.fix;session.skipBlocked=false;compute(issue);});
    bind("reviewMore","change",event=>{if(event.target.value){session.fix=event.target.value;session.skipBlocked=false;compute(issue);}});
    bind("reviewAskAi","click",()=>{session.askOpen=!session.askOpen;renderPreservingReviewFocus();if(session.askOpen)document.getElementById("reviewAiInstruction")?.focus();});
    bind("reviewChooseFillGroups","click",()=>{const groups=document.querySelector(".missing-fill-groups");if(groups){session.fillGroupsOpen=true;groups.open=true;document.getElementById("missingAddLock")?.focus();}});
    bind("reviewImpactMetric","change",event=>{state.primaryReviewMetric=event.target.value;Object.values(state.reviewPage||{}).forEach(entry=>{entry.preview=null;});markProjectDirty();compute(issue);});
    bind("reviewAiInstruction","input",event=>{session.instruction=event.target.value;}); bind("reviewSuggestAi","click",()=>moduleFor(issue).aiFix(issue,session));
    bind("reviewSkipBlocked","change",event=>{session.skipBlocked=event.target.checked;compute(issue);}); bind("reviewConstraints","change",event=>{session.acknowledgeConstraints=event.target.checked;compute(issue);});
    bind("reviewAddNote","click",()=>{session.noteOpen=!session.noteOpen;renderPreservingReviewFocus();document.getElementById("reviewNote")?.focus();});
    bind("reviewNote","input",event=>{session.note=event.target.value;reviewDraft(issue).note=session.note;if(session.preview)session.fingerprint=guidedFingerprint(issue,reviewDraft(issue));updateApplyButton(issue);});
    bind("reviewApply","click",()=>apply(issue)); bind("reviewUndo","click",()=>undo(issue));
    bind("reviewNext","click",()=>{const open=state.issues.filter(item=>item.status==="open"), next=open.find(item=>item.id>issue.id)||open[0];if(next)select(next.id);});
    bind("reviewRows","click",()=>showRows(issue)); bind("reviewBlockedList","click",()=>showRows(issue,true));
    document.querySelectorAll("[data-review-show-all]").forEach(button=>button.onclick=()=>{session.expandedLists ||= {};session.expandedLists[button.dataset.reviewShowAll]=true;renderPreservingReviewFocus();});
    moduleFor(issue).bind?.(issue,session); updateApplyButton(issue);
    checkAiConfiguration(issue);
  }
  function limitedItems(session,key,items,limit=200) { // CORE-58: shared bounded-list policy, adopted by each issue's own renderer.
    return session.expandedLists?.[key]?items:items.slice(0,limit);
  }
  function showAllHtml(session,key,total,limit=200) {
    return total>limit&&!session.expandedLists?.[key]?`<button class="text-button" data-review-show-all="${escapeHtml(key)}">Show all ${total.toLocaleString()} items</button>`:"";
  }
  function openRowsPanel(panel,openerId="reviewRows") { // CORE-25: native modal focus containment and predictable return focus.
    const previous=document.querySelector(".review-row-panel");if(previous){previous.onclose=null;previous.close?.();previous.remove();}
    panel.className="review-row-panel";panel.setAttribute("aria-label",panel.querySelector("h2")?.textContent||"Affected rows");
    panel.onclose=()=>{panel.remove();document.getElementById(openerId)?.focus({preventScroll:true});};
    const table=panel.querySelector(".review-table-scroll");table?.setAttribute("tabindex","0");table?.setAttribute("aria-label","Affected rows table");
    panel.addEventListener("keydown",event=>{if(event.key!=="Tab")return;const controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(node=>node.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}});
    document.body.append(panel);panel.querySelector("#reviewCloseRows").onclick=()=>panel.close();panel.showModal();panel.querySelector("#reviewCloseRows").focus();
  }
  function showRows(issue,blockedOnly = false) { // CORE-25, CORE-58
    if (moduleFor(issue).showRows) return moduleFor(issue).showRows(issue,blockedOnly);
    const session=data(issue), preview=session.preview, selected=new Set(blockedOnly ? preview.blocked.map(entry=>entry.rowId) : preview.selectedIds), patches=new Map(preview.patches.filter(patch=>patch.column===issue.column).map(patch=>[patch.rowId,patch.after])), columns=[...new Set([...(moduleFor(issue).contextColumns?.(issue,session) || []),...session.locks,...state.headers.filter(column=>column!==issue.column)])].filter(column=>column!==issue.column).slice(0,3);
    const rows=state.rows.filter(row=>selected.has(row._row)),key=blockedOnly?"blocked-rows":"affected-rows",blocked=new Map(preview.blocked.map(entry=>[entry.rowId,entry.reason]));
    const panel=document.createElement("dialog");panel.innerHTML=`<header><h2>${blockedOnly?"Rows that can’t be fixed":"Affected rows"}</h2><button class="secondary" id="reviewCloseRows">Close</button></header><div class="review-table-scroll"><table><thead><tr><th>Row</th><th>Current → proposed</th>${columns.map(column=>`<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${limitedItems(session,key,rows).map(row=>`<tr><td>${row._row}</td><td>${escapeHtml(row[issue.column] || "(blank)")} → ${escapeHtml(patches.get(row._row) ?? row[issue.column] ?? "(blank)")}${blocked.has(row._row)?` · ${escapeHtml(blocked.get(row._row))}`:""}</td>${columns.map(column=>`<td>${escapeHtml(row[column] || "not recorded")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${showAllHtml(session,key,rows.length)}`;
    panel.querySelector("[data-review-show-all]")?.addEventListener("click",()=>{session.expandedLists ||= {};session.expandedLists[key]=true;showRows(issue,blockedOnly);});openRowsPanel(panel,blockedOnly?"reviewBlockedList":"reviewRows");
  }
  function detect(headers,rows,profile,existing) { // CORE-04: normalize every module's findings to the same public contract.
    const baseline=ReviewPageEngine.detect(headers,rows,profile,existing,effectiveClassifications(),state.changes.map(change=>change.treatment?.repeatableColumn).filter(Boolean),Object.fromEntries(state.issues.filter(issue=>issue.rangeEdited).map(issue=>[issue.column,issue.range])),reviewDateFormats()),context={headers,rows,profile,existing,baseline,policies:state.ruleConfig.columns,classifications:effectiveClassifications()};
    const replaced=new Set(Object.keys(ReviewModules)),generated=Object.values(ReviewModules).flatMap(module=>module.detect(context));
    return baseline.filter(issue=>!replaced.has(issue.reviewType)).concat(generated).sort((a,b)=>headers.indexOf(a.column)-headers.indexOf(b.column)||order.indexOf(a.reviewType)-order.indexOf(b.reviewType)).map((issue,index)=>{
      const finding={...issue,id:index+1};finding.issueKey=issueKey(finding);finding.cells=finding.rows.map(row=>({rowId:row._row,column:finding.column}));finding.count=moduleFor(finding).count?moduleFor(finding).count(finding):finding.rows.length;return finding;
    });
  }
  function bindDatasetSettings() { // CORE-31
    const setup=document.querySelector('[data-ui="dataset.setup"]');if (!setup || document.getElementById("reviewPrimaryMetric")) return;const label=document.createElement("label");label.innerHTML=`Primary metric for Review<select id="reviewPrimaryMetric"><option value="">Automatic: first matching numerical column</option><option value="__rows__">Row count</option>${state.headers.filter(numericType).map(column=>`<option value="${escapeHtml(column)}" ${state.primaryReviewMetric===column ? "selected" : ""}>${escapeHtml(column)}</option>`).join("")}</select>`;setup.append(label);document.getElementById("reviewPrimaryMetric").value=state.primaryReviewMetric||"";document.getElementById("reviewPrimaryMetric").onchange=event=>{state.primaryReviewMetric=event.target.value;Object.values(state.reviewPage||{}).forEach(session=>{session.preview=null;});markProjectDirty();}; }
  const generic={unit:"cells",lockedRows:issue=>reviewRows(issue),reminder:issue=>`Fixing: ${issue.type} in ${issue.column} · ${reviewRows(issue).length} cells`,getFixOptions:(issue,session)=>[{key:"constant",label:"Replace selected values",risk:"Invents information",params:()=>`<label>Replacement<input id="manualReplacement" maxlength="300" value="${escapeHtml(session.value)}"></label>`,compute:()=>({operation:"constant",value:session.value,interpretation:"error"})},{key:"keep",label:"Keep as is",risk:"Doesn't change values",compute:()=>({operation:"retain",interpretation:"legitimate"})}],renderExplore:issue=>`<h2>${escapeHtml(issue.type)}</h2><p>${escapeHtml(issue.summary)}</p><p class="review-empty-copy">These are analyst-selected source rows. Check a replacement in Fix before applying it.</p>`,consequence:(issue,session,preview,option)=>({sentence:option.key==="keep"?`${reviewRows(issue).length} source records stay unchanged.`:`${preview.patches.length} selected cells receive the reviewed replacement.`,figures:[]}),renderPreview:(issue,session,preview)=>sampleTable(issue,preview.patches),renderReview:(issue,change)=>`${metricStrip([{label:"Cells changed",value:change.patches.length},{label:"Rows removed",value:change.removedRows.length}])}${sampleTable(issue,change.patches)}`,bind:(issue,session)=>document.getElementById("manualReplacement")?.addEventListener("change",event=>{session.value=event.target.value;compute(issue);})};
  return {risks,order,kind,data,moduleFor,numericType,precision,format,count,metricColumn,total,money,affected,exploreScope,measure,choice,select,current,switchTab,lockChanged,compute,apply,accept,undo,consequence,optionsHtml,fixHtml,reviewHtml,metricStrip,sampleTable,aiStatus,requestAi,containsSensitiveText,limitedItems,showAllHtml,openRowsPanel,bindShared,detect,bindDatasetSettings};
})();
