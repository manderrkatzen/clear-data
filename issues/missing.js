// Missing's complete contract lives here; shared controls/calculations stay in their existing layers.
ReviewModules.missing = (() => {
  const nullLike = /^(null|n\/?a|none|nan|--?|\?|#n\/a|#div\/0!|#value!|#ref!|#num!|#null!|missing|unknown|not available)$/i;
  const sentinels = new Set([0,-1,-99,-999,99,999,9999,99999]);
  const candidateCache=new WeakMap();
  const canonical = value => String(value ?? "").trim() ? String(value) : "";
  const idLike = column => CleaningEngine.isIdentifier(column) || cleaningProfile().columns.find(profile=>profile.column===column)?.role==="identifier";
  function candidates(dataset,column) { // MISS-D-01, MISS-D-03
    const profile=dataset.profile.columns.find(profile=>profile.column===column);
    if(!profile)return [];
    const groups=ReviewPageEngine.frequencies(dataset.rows,column,canonical),numeric=["number","integer"].includes(profile.role),reviewed=new Map((dataset.classifications || []).map(entry=>[`${entry.rowId}:${entry.column}`,entry]));
    const available=row=>{const entry=reviewed.get(`${row._row}:${column}`);return !entry || entry.value!==row[column] || !["legitimate","not_applicable","resolved"].includes(entry.meaning);};
    const frequencies=new Map();groups.forEach(group=>{try{const value=CleaningEngine.parseNumber(group.value,profile.policy);frequencies.set(value,(frequencies.get(value)||0)+group.rows.length);}catch{}});
    const parsed=[...frequencies].map(([value,count])=>({value,count})).sort((a,b)=>a.value-b.value);
    return groups.filter(group=>{
      if(!group.value || nullLike.test(group.value.trim()))return true;
      if(!numeric)return false;
      let value;try{value=CleaningEngine.parseNumber(group.value,profile.policy);}catch{return false;}const index=parsed.findIndex(entry=>entry.value===value);
      if(!sentinels.has(value))return false;
      const neighbours=[parsed[index-1],parsed[index+1]].filter(Boolean),other=parsed.filter(entry=>entry.value!==value);
      return neighbours.length>0 && neighbours.every(entry=>parsed[index].count>=3*entry.count) || other.length>0 && (value<other[0].value || value>other.at(-1).value);
    }).map(group=>({...group,rows:group.rows.filter(available)})).filter(group=>group.rows.length);
  }
  function detect(dataset) { // MISS-D-02, MISS-D-04
    return dataset.headers.flatMap(column=>{
      const representations=candidates(dataset,column);if(!representations.length)return [];
      const role=dataset.profile.columns.find(profile=>profile.column===column).role;
      return [{column,columnRole:role,date:role==="date",reviewType:"missing",type:"Missing values",label:"Missing values",recommendation:["number","integer"].includes(role)?"impute":"keep",severity:"medium",summary:"Candidate missing representations. Only explicitly locked values enter a treatment.",rows:representations.flatMap(group=>group.rows),status:"open",representations:representations.map(group=>({value:group.value,count:group.rows.length})),unit:"cells"}];
    });
  }
  function groups(issue) {
    const profile=cleaningProfile(),classifications=effectiveClassifications();let cache=candidateCache.get(state.rows);if(!cache){cache=new Map();candidateCache.set(state.rows,cache);}
    const saved=cache.get(issue.column);if(saved?.profile===profile&&saved.classifications===classifications)return saved.groups;
    const result=candidates({rows:state.rows,profile,classifications},issue.column);cache.set(issue.column,{profile,classifications,groups:result});return result;
  }
  function isDate(issue) { return issue.date || cleaningProfile().columns.find(profile=>profile.column===issue.column)?.role==="date"; }
  function init(issue,session) { // MISS-E-03: only genuine blanks begin locked; empty input is not re-defaulted on render.
    if(session.locked===null)session.locked=groups(issue).filter(group=>!group.value).map(group=>group.value);
    if(!session.valueInitialized){if(session.value==="")session.value=ReviewCore.numericType(issue.column)?"0":isDate(issue)?"":"Unknown";session.valueInitialized=true;}
  }
  function lockedRows(issue,session) { init(issue,session);return groups(issue).filter(group=>session.locked.includes(group.value)).flatMap(group=>group.rows); }
  function count(issue) { return lockedRows(issue,ReviewCore.data(issue)).length; }
  function remainingCandidates(issue) { // MISS-D-02, CORE-11: review work and selected treatment scope are different counts.
    if(issue.status!=="open")return [];
    const decisions=state.changes.filter(change=>change.issue.id===issue.id);
    return groups(issue).flatMap(group=>group.rows).filter(row=>!decisions.some(change=>change.reviewedFingerprints?.[row._row]===reviewFingerprint(issue,[row])));
  }
  function queueCount(issue) {return issue.status==="open"?remainingCandidates(issue).length:state.changes.find(change=>change.issue.id===issue.id)?.rows.length||issue.rows.length;}
  function queueCountLabel(issue) {const total=queueCount(issue);return `${total} ${issue.status==="open"?`candidate ${total===1?"cell":"cells"} awaiting review`:`${total===1?"cell":"cells"} reviewed`} · ${count(issue)} selected for treatment`;}
  function countLabel(issue) {const total=issue.status==="open"?remainingCandidates(issue).length:queueCount(issue);return issue.status==="open"?`${total.toLocaleString()} candidate ${total===1?"cell":"cells"} · ${count(issue).toLocaleString()} selected`: `${total.toLocaleString()} ${total===1?"cell":"cells"} reviewed`;}
  async function compare(issue,session) { // MISS-E-18: use the existing robust comparison engine and stale-result guard.
    const signature=JSON.stringify([state.datasetRevision,session.locked]);if(session.compareKey===signature || session.comparePending)return;
    session.comparePending=true;const source=state.original;
    try {
      const classifications=effectiveClassifications().concat(lockedRows(issue,session).map(row=>({rowId:row._row,column:issue.column,value:row[issue.column],meaning:"missing"})));
      const result=await analyticalTask("compare",issue.column,{options:{...analyticalOptions(),classifications}});
      if(source!==state.original || signature!==JSON.stringify([state.datasetRevision,session.locked]))return;
      session.comparison=result;session.compareKey=signature;
    } catch { session.compareKey=signature; }
    finally {
      session.comparePending=false;
      if(source===state.original&&state.screen==="issues"&&state.selectedIssue===issue.id){
        if(signature===JSON.stringify([state.datasetRevision,session.locked]))renderPreservingReviewFocus();
        else if(session.tab==="explore")setTimeout(()=>compare(issue,session),0);
      }
    }
  }
  function contextColumns(issue,session) {
    if(Array.isArray(session.chosenContextColumns))return session.chosenContextColumns.filter(column=>state.headers.includes(column)&&column!==issue.column&&!session.locks.includes(column));
    const ranked=(session.comparison?.results || []).filter(result=>result.effectSize>0&&!idLike(result.column)).map(result=>result.column);
    const fallback=state.headers.filter(column=>column!==issue.column&&!idLike(column));
    return [...new Set([...ranked,...fallback])].filter(column=>column!==issue.column&&!session.locks.includes(column)).slice(0,4).concat(session.extraColumns || []).filter((column,index,list)=>list.indexOf(column)===index);
  }
  function bandDefinitions(session) { // MISS-E-12, MISS-E-17, MISS-E-22: inspection and treatment use the same global band boundaries.
    const signature=JSON.stringify([state.datasetRevision,session.locks,session.banding]);
    if(session.bandCache?.key===signature)return session.bandCache;
    const context=AnalysisEngine.prepare(state.headers,state.rows,analyticalOptions()),positions=new Map(state.rows.map((row,index)=>[row._row,index])),definitions=new Map();
    for(const column of session.locks) {
      const entry=context.columns.get(column),definition=AnalysisEngine.bandsFor(context,column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]});
      definitions.set(column,definition.labels.map((label,index)=>entry.states[index]==="present"?label:entry.states[index]==="not_applicable"?`(not applicable ${column})`:`(blank ${column})`));
    }
    session.bandCache={key:signature,positions,definitions};return session.bandCache;
  }
  function grouped(issue,session,rows=state.rows,columns=session.locks) {
    if(!columns.length)return [{label:"All rows",rows}];
    const cache=bandDefinitions(session),result=new Map();
    for(const row of rows) {
      const labels=columns.map(column=>cache.definitions.get(column)[cache.positions.get(row._row)]),key=JSON.stringify(labels);
      if(!result.has(key))result.set(key,{label:labels.join(" · "),labels,rows:[]});result.get(key).rows.push(row);
    }
    return [...result.values()];
  }
  const tablePrecisions=new Map();
  function formatted(value,column) { if(value===null || value===undefined || !String(value).trim())return "not recorded";if(ReviewCore.numericType(column)){try{return ReviewCore.format(CleaningEngine.parseNumber(value,columnPolicy(column)),column,{decimals:tablePrecisions.get(column)});}catch{}}return String(value); }
  const orderIcon=direction=>`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${direction==="desc"?"M8 3v10m-4-4 4 4 4-4":"M8 13V3m-4 4 4-4 4 4"}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function picks(session) { // MISS-E-07, MISS-T-06: explicit recommendations must also meet the documented 70 threshold.
    const report=session.missingAssessment || (session.aiMode==="explore"?session.ai:null);
    return (report?.locks || []).filter(value=>!value || report.assessments?.some(entry=>entry.value===value&&entry.confidence>=70));
  }
  function knnParams(issue,session) {
    session.knnColumns ||= (session.comparison?.results || []).filter(result=>!idLike(result.column)).slice(0,3).map(result=>result.column);
    session.knnK ??= 7;
    return `<label>Neighbours<input id="missingKnnK" type="number" min="1" max="50" value="${session.knnK}"></label><div class="missing-knn-columns">${state.headers.filter(column=>column!==issue.column&&!idLike(column)).map(column=>`<label><input type="checkbox" data-knn-column="${escapeHtml(column)}" ${session.knnColumns.includes(column)?"checked":""}>${escapeHtml(column)}</label>`).join("")}</div>`;
  }
  function getFixOptions(issue,session) { // MISS-F-01, MISS-F-02, MISS-F-03: type-specific defaults and editable exact parameters.
    const numeric=ReviewCore.numericType(issue.column),date=isDate(issue),dateColumn=session.orderColumn || state.headers.find(column=>column!==issue.column&&inferType(column)==="Date"),groupedLabel=session.locks.join(" + "),groupColumns=state.headers.filter(column=>column!==issue.column&&!idLike(column)),canGroup=session.locks.length>0||groupColumns.length>0;
    const constantRisk=current=>current.blankMeansValue?"Doesn't invent information":numeric || date?"Estimates values":/^(unknown|unassigned|not recorded|missing)$/i.test(current.value.trim())?"Doesn't invent information":"Invents information";
    const constant={key:"constant",label:numeric?"Fill with value":date?"Fill with date":`Fill “${session.value || "Unknown"}”`,risk:constantRisk,params:()=>`<input id="missingConstant" aria-label="Fill value" type="${numeric?"number":date?"date":"text"}" step="any" value="${escapeHtml(session.value)}"><label class="review-inline-check"><input id="missingBlankMeans" type="checkbox" ${session.blankMeansValue?"checked":""}> Blank means this value</label>`,compute:()=>{if(!session.value.trim())throw new Error("Enter a replacement value, or choose Leave missing.");if(date)CleaningEngine.parseDate(session.value);return {operation:"constant",value:session.value};}};
    const leave={key:"leave",label:"Leave missing",risk:"Doesn't change values",compute:()=>({operation:"leaveMissing",interpretation:"missing"})},drop={key:"drop-rows",label:"Remove these rows",risk:"Removes data",more:true,compute:()=>({operation:"remove"})};
    const ordered=dateColumn || date?[{key:"previous-value",label:"Carry forward",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"previous",orderColumn:dateColumn})},{key:"next-value",label:"Carry back",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"next",orderColumn:dateColumn})}]:[];
    if(date)return [leave,constant,...ordered,drop];
    const groupSetup={disabled:"Choose a grouping column in Explore first.",setupLabel:"Choose group in Explore →"};
    if(!numeric)return [constant,...(canGroup?[{key:"mode-by-group",label:`Most common by ${groupedLabel || "group"}`,risk:"Invents information",...(!session.locks.length?groupSetup:{}),compute:()=>({operation:"groupMode",groupColumns:session.locks,groupBanding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))})}]:[]),leave,{key:"mode",label:"Most common overall",risk:"Invents information",more:true,compute:()=>({operation:"mode"})},drop];
    return [{key:"median",label:"Median",risk:"Estimates values",compute:()=>({operation:"median"})},...(canGroup?[{key:"median-by-group",label:`Median by ${groupedLabel || "group"}`,risk:"Estimates values",...(!session.locks.length?groupSetup:{}),compute:()=>({operation:"groupwise",similar:{columns:session.locks,statistic:"median",minObserved:5,k:7,banding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))}})}]:[]),constant,leave,{key:"mean",label:"Mean",risk:"Estimates values",more:true,compute:()=>({operation:"mean"})},{key:"knn",label:"Similar rows",risk:"Estimates values",more:true,params:()=>knnParams(issue,session),compute:()=>{knnParams(issue,session);return {operation:"knn",similar:{columns:session.knnColumns,statistic:"median",minObserved:5,k:session.knnK,banding:{}}};}},...ordered,...(dateColumn?[{key:"interpolate",label:"Interpolate",risk:"Estimates values",more:true,compute:()=>({operation:"interpolate",orderColumn:dateColumn})}]:[]),drop];
  }
  function reminder(issue,session) { return `Fixing: ${session.locked.map(value=>value || "(blank)").join(" + ")} in ${issue.column} · ${lockedRows(issue,session).length} cells${session.locks.length?` · grouped by ${session.locks.join(" + ")}`:""}`; }
  function consequence(issue,session,preview,option) { // MISS-F-04, MISS-F-05, MISS-F-06
    const carrying=ReviewCore.measure(issue),label=carrying.metric || "row count",amount=ReviewCore.money(carrying.carry,carrying.metric),numeric=ReviewCore.numericType(issue.column),primaryTarget=carrying.metric===issue.column;
    const whole=primaryTarget?preview.afterSum:ReviewCore.total(preview.after,carrying.metric),current=primaryTarget?preview.beforeSum:ReviewCore.total(state.rows,carrying.metric),figures=[];
    const column=session.locks[0] || session.comparison?.results.find(result=>result.type==="categorical")?.column,top=column&&ReviewPageEngine.frequencies(carrying.rows,column)[0],share=top?top.rows.length/Math.max(1,carrying.rows.length):0;
    const sentence=(primaryTarget?`These ${carrying.rows.length} rows have no recorded ${label}; their contribution to the column sum is unknown`:carrying.metric?`Sum of ${label} for these ${carrying.rows.length} selected rows: ${amount} (${carrying.share.toFixed(1)}% of the column sum)`:`${carrying.rows.length} rows selected (${carrying.share.toFixed(1)}% of all rows)`)+`${top?`; ${share>=.5?"mostly":"largest group"} ${top.value || "unrecorded"} (${(share*100).toFixed(1)}%)`:""}.`;
    let effect="",reason="",detail="";
    if(option.key==="drop-rows") {effect=primaryTarget?`Removes ${preview.removedRows.length} rows; their missing metric contribution is unknown.`:`Removes ${preview.removedRows.length} rows and ${amount} from all totals.`;figures.push({label,before:ReviewCore.money(current,carrying.metric),after:ReviewCore.money(whole,carrying.metric)},{label:"Rows",before:state.rows.length,after:preview.after.length});reason="These records are removed from every report, not only this column.";}
    else if(option.key==="leave") {effect=`These rows stay out of ${numeric?"averages":"per-group totals"} (${primaryTarget?"their metric contribution is unknown":`${amount} not attributed`}).`;reason="The gaps remain visible; no values are assigned.";}
    else if(numeric) {
      figures.push({label:"Median",before:ReviewCore.format(preview.beforeStats.median,issue.column),after:ReviewCore.format(preview.afterStats.median,issue.column)},{label:"Mean",before:ReviewCore.format(preview.beforeStats.mean,issue.column),after:ReviewCore.format(preview.afterStats.mean,issue.column)});
      figures.push({label:"Standard deviation",before:ReviewCore.format(preview.beforeStats.sd,issue.column),after:ReviewCore.format(preview.afterStats.sd,issue.column)});
      if(carrying.metric===issue.column)figures.push({label:"Total",before:ReviewCore.money(current,carrying.metric),after:ReviewCore.money(whole,carrying.metric)});
      reason=option.key.replace(/^ai:/,"")==="constant"&&session.blankMeansValue?"Uses your confirmed meaning of the blank; it is not a statistical guess.":"Replaces unknown observations with reviewed estimates.";
      if(option.key.replace(/^ai:/,"")==="median-by-group") {
        const fills=preview.fillMetadata?.fills || [];
        detail=grouped(issue,session).flatMap(group=>{const ids=new Set(group.rows.map(row=>row._row)),values=fills.filter(fill=>ids.has(fill.row)).map(fill=>fill.value);return values.length?[`${group.label} ${ReviewCore.format(CleaningEngine.stats(values).median,issue.column)}`]:[];}).slice(0,4).join(" · ");
        const fallback=new Set(fills.filter(fill=>["widened","global"].includes(fill.source)).map(fill=>fill.bandLabel || "overall"));if(fallback.size)detail+=` · ${fallback.size} groups used fallback`;
      }
    } else {
      const values=[...new Set(preview.patches.map(patch=>patch.after))],destination=values.slice(0,2).join(" / ") || session.value,old=state.rows.filter(row=>values.includes(row[issue.column])).length,next=preview.after.filter(row=>values.includes(row[issue.column])).length;
      effect=`${carrying.rows.length} rows will appear as “${destination}” in ${issue.column} reports.`;
      figures.push({label:`${destination} rows`,before:old,after:next},{label:"Attributed rows",before:state.rows.length-preview.beforeMissing,after:preview.after.length-preview.afterMissing});
      reason=session.blankMeansValue?"Uses the source meaning you confirmed.":["mode","mode-by-group"].includes(option.key)||!/^(unknown|unassigned|not recorded|missing)$/i.test(destination)?"Assigns records to a real category or person without knowing that attribution.":"Keeps the lack of information explicit instead of naming a real person or category.";
    }
    // MISS-F-05 expressly requires median + mean + SD + total when target is the primary metric.
    return {sentence,effect,figures,figureLimit:carrying.metric===issue.column?4:3,reason,detail};
  }
  function fillMarks(issue,before,after,rowIds) {
    const source=new Map(before.map(row=>[row._row,row]));return after.filter(row=>rowIds.includes(row._row)).map(row=>({rowId:row._row,column:issue.column,before:source.get(row._row)?.[issue.column] || "",after:row[issue.column]}));
  }
  function aiContext(issue,session,mode="explore",values=groups(issue)) { // MISS-A-01, MISS-A-02, MISS-A-03, CORE-51
    const selected=lockedRows(issue,session),ids=new Set(selected.map(row=>row._row)),present=state.rows.filter(row=>!ids.has(row._row)&&observationState(row,issue.column)==="present"),numeric=ReviewCore.numericType(issue.column),metric=ReviewCore.measure(issue);
    const primaryTarget=metric.metric===issue.column,primaryMetric={column:metric.metric || "",kind:metric.metric?"numeric":"rows",total:primaryTarget?ReviewCharts.numeric(state.rows,issue.column,ids).reduce((sum,value)=>sum+value,0):metric.whole,affectedTotal:primaryTarget?null:metric.carry,affectedSharePercent:primaryTarget?null:metric.share};
    return {column:issue.column,type:"missing",role:numeric?"number":isDate(issue)?"date":"text",headers:state.headers,meaning:columnPolicy(issue.column).meaning,allowedFixes:getFixOptions(issue,session).filter(option=>!option.disabled).map(option=>option.key),count:state.rows.length,affected:ids.size,values:values.slice(0,20).map(group=>({value:group.value,count:group.rows.length,locked:session.locked.includes(group.value)})),samples:present.slice(0,20).map(row=>String(row[issue.column]).slice(0,160)),statistics:numeric?CleaningEngine.stats(ReviewCharts.numeric(present,issue.column)):{},groups:grouped(issue,session).slice(0,20).map(group=>({label:group.label,total:group.rows.length,missing:group.rows.filter(row=>ids.has(row._row)).length,statistics:numeric?CleaningEngine.stats(ReviewCharts.numeric(group.rows.filter(row=>!ids.has(row._row)),issue.column)):{}})),...(mode==="fix"?{primaryMetric}:{})};
  }
  async function aiExplore(issue,session) { // MISS-E-07, MISS-E-08, CORE-54: one automatic bounded-batch job per issue/session.
    const values=groups(issue);if(values.every(group=>!group.value) || session.assessmentRequested)return;
    session.assessmentRequested=true;
    const job=(session.aiJob || 0)+1;session.aiJob=job;
    const combined={assessments:[],locks:[],note:"",requiresConfirmation:true},notes=[];
    for(let offset=0;offset<values.length;offset+=20) {
      const result=await ReviewCore.requestAi(issue,"explore",aiContext(issue,session,"explore",values.slice(offset,offset+20)));
      if(job!==session.aiJob || !result)return;
      combined.assessments.push(...(result.assessments || []));combined.locks.push(...(result.locks || []));notes.push(result.note);
    }
    combined.locks=[...new Set(combined.locks)];combined.note=notes.flatMap(note=>note.split(/(?<=[.!?])\s+(?=[A-Z])/)).slice(0,4).join(" ");
    session.ai=combined;session.missingAssessment=combined;session.assessmentProvider=session.aiProvider;session.aiStatus="ready";renderPreservingReviewFocus();
  }
  async function aiFix(issue,session) {
    const result=await ReviewCore.requestAi(issue,"fix",aiContext(issue,session,"fix",groups(issue).filter(group=>session.locked.includes(group.value))));
    if(result?.operation && getFixOptions(issue,session).some(option=>option.key===result.operation&&!option.disabled)){session.aiFixProposal=result;renderPreservingReviewFocus();}
  }
  function scopeEdited(issue,session,edit) {
    const before=lockedRows(issue,session).length;edit();ReviewCore.lockChanged(issue,before);session.compareKey="";
    // MISS-D-04: the dependent almost-empty finding updates from locks without changing source values.
    if(lockedRows(issue,session).length/Math.max(1,state.rows.length)>=.95 && !state.issues.some(item=>item.column===issue.column&&item.reviewType==="constant")) {
      const dependent=ReviewModules.constant.detect({headers:[issue.column],rows:state.rows,profile:cleaningProfile()})[0];
      if(dependent)state.issues.push({...dependent,id:Math.max(0,...state.issues.map(item=>item.id))+1});
    }
    renderPreservingReviewFocus();
  }
  function bind(issue,session) {
    document.querySelectorAll('[data-ui="review.explore.missing.value"]').forEach(button=>button.onclick=()=>scopeEdited(issue,session,()=>{const value=button.dataset.value;session.locked=session.locked.includes(value)?session.locked.filter(entry=>entry!==value):session.locked.concat(value);}));
    document.getElementById("missingShowRepresentations")?.addEventListener("click",()=>{session.showRepresentations=true;renderPreservingReviewFocus();});
    document.getElementById("missingAiPicks")?.addEventListener("click",()=>scopeEdited(issue,session,()=>{session.locked=picks(session);}));
    document.getElementById("missingRefreshAi")?.addEventListener("click",()=>{session.assessmentRequested=false;session.missingAssessment=null;session.ai=null;aiExplore(issue,session);});
    document.getElementById("missingDropLink")?.addEventListener("click",()=>ReviewCore.select(state.issues.find(item=>item.column===issue.column&&item.reviewType==="constant").id));
    const fillEdited=edit=>{const before=lockedRows(issue,session).length;edit();ReviewCore.lockChanged(issue,before);markProjectDirty();if(session.tab==="fix")ReviewCore.compute(issue);else renderPreservingReviewFocus();};
    document.getElementById("missingAddLock")?.addEventListener("change",event=>{if(event.target.value&&session.locks.length<3)fillEdited(()=>{session.locks.push(event.target.value);session.banding[event.target.value]={mode:"quantiles",k:5,minCategoryCount:5};});});
    document.querySelectorAll("[data-remove-lock]").forEach(button=>button.onclick=()=>fillEdited(()=>{session.locks.splice(Number(button.dataset.removeLock),1);}));
    document.querySelectorAll("[data-missing-band]").forEach(input=>input.onchange=()=>fillEdited(()=>{const column=input.dataset.missingBand,stats=cleaningProfile().columns.find(profile=>profile.column===column).statistics;session.banding[column]={mode:input.value,k:5,minCategoryCount:5,width:Math.max((stats.max-stats.min)/5 || 1,Number.EPSILON),edges:[0,5,10,20,50]};}));
    document.querySelectorAll("[data-missing-edges]").forEach(input=>input.onchange=()=>{const column=input.dataset.missingEdges,band=session.banding[column],previous=structuredClone(band);if(band.mode==="fixedWidth")band.width=Number(input.value);else band.edges=input.value.split(",").map(Number);try{grouped(issue,session);fillEdited(()=>{});}catch(error){session.banding[column]=previous;session.bandCache=null;notify(error.message);}});
    document.getElementById("missingColumns")?.addEventListener("click",()=>{const panel=document.createElement("dialog"),current=new Set(contextColumns(issue,session));panel.innerHTML=`<header><h2>Context columns</h2><button id="reviewCloseRows">Close</button></header>${state.headers.filter(column=>column!==issue.column&&!session.locks.includes(column)).map(column=>`<label><input type="checkbox" data-add-context="${escapeHtml(column)}" ${current.has(column)?"checked":""}>${escapeHtml(column)}</label>`).join("")}`;ReviewCore.openRowsPanel(panel,"missingColumns");panel.querySelectorAll("[data-add-context]").forEach(input=>input.onchange=()=>{session.chosenContextColumns=[...panel.querySelectorAll("[data-add-context]:checked")].map(input=>input.dataset.addContext);markProjectDirty();renderPreservingReviewFocus();});});
    document.getElementById("missingShowAll")?.addEventListener("change",event=>{session.showAll=event.target.checked;renderPreservingReviewFocus();});
    document.querySelectorAll(".rc-evidence-group").forEach(group=>{const initial=group.open;group.addEventListener("toggle",()=>{if(!group.isConnected)return;const key=group.dataset.group,previous=session.openGroups[key]??initial;session.openGroups[key]=group.open;if(previous!==group.open)renderPreservingReviewFocus();});});
    document.querySelectorAll("[data-group-show]").forEach(button=>button.onclick=()=>{session.groupLimits||={};session.groupLimits[button.dataset.groupShow]=(session.groupLimits[button.dataset.groupShow]||6)+50;renderPreservingReviewFocus();});
    let dragged=null;document.querySelectorAll("[data-lock-chip]").forEach(chip=>{chip.ondragstart=()=>{dragged=Number(chip.dataset.lockChip);};chip.ondragover=event=>event.preventDefault();chip.ondrop=event=>{event.preventDefault();if(dragged===null)return;fillEdited(()=>{const [column]=session.locks.splice(dragged,1);session.locks.splice(Number(chip.dataset.lockChip),0,column);});};});
    document.getElementById("missingConstant")?.addEventListener("change",event=>{session.value=event.target.value;ReviewCore.compute(issue);});
    document.getElementById("missingBlankMeans")?.addEventListener("change",event=>{session.blankMeansValue=event.target.checked;ReviewCore.compute(issue);});
    document.getElementById("missingKnnK")?.addEventListener("change",event=>{session.knnK=Number(event.target.value);ReviewCore.compute(issue);});
    document.querySelectorAll("[data-knn-column]").forEach(input=>input.onchange=()=>{session.knnColumns=[...document.querySelectorAll("[data-knn-column]:checked")].map(input=>input.dataset.knnColumn);ReviewCore.compute(issue);});
    ["missingPreviewGroups","missingReviewGroups"].forEach(id=>document.getElementById(id)?.addEventListener("change",event=>{session.byGroup=event.target.checked;renderPreservingReviewFocus();}));
    if(session.tab==="explore") {
      if(!session.comparePending&&session.compareKey!==JSON.stringify([state.datasetRevision,session.locked]))setTimeout(()=>compare(issue,session),0);
      if(!session.assessmentRequested&&groups(issue).some(group=>group.value))setTimeout(()=>{if(state.selectedIssue===issue.id&&session.tab==="explore")aiExplore(issue,session);},0);
    }
  }
  function decisionMetadata(issue,session) {return {chartGroups:grouped(issue,session).map(group=>({label:group.label,rowIds:group.rows.map(row=>row._row)}))};}
  function invalidate(session) {session.missingAssessment=null;if(session.assessmentRequested){session.aiMode="explore";session.aiStatus="error";session.aiReason="error";session.aiStale=true;}}
  function groupControls(issue,session){ // MISS-E-11, MISS-E-12, MISS-E-22 / C5
    return session.locks.map((column,index)=>`<span class="rc-chip" draggable="true" data-lock-chip="${index}">${escapeHtml(column)}${ReviewCore.numericType(column)?`<select data-missing-band="${escapeHtml(column)}" data-ui="review.explore.missing.bands" aria-label="Groups for ${escapeHtml(column)}"><option value="quantiles" ${(session.banding[column]?.mode||"quantiles")==="quantiles"?"selected":""}>5 quantiles</option><option value="fixedWidth" ${session.banding[column]?.mode==="fixedWidth"?"selected":""}>Fixed width</option><option value="custom" ${session.banding[column]?.mode==="custom"?"selected":""}>Custom edges</option></select>${["fixedWidth","custom"].includes(session.banding[column]?.mode)?`<input data-missing-edges="${escapeHtml(column)}" aria-label="Width or edges" value="${escapeHtml(session.banding[column].width||session.banding[column].edges?.join(", ")||"")}">`:""}`:""}<button class="text-button" data-remove-lock="${index}" aria-label="Remove ${escapeHtml(column)}">×</button></span>`).join("")+(session.locks.length<3?`<select id="missingAddLock" aria-label="Add group column"><option value="">+ add column</option>${state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!session.locks.includes(column)).map(column=>`<option>${escapeHtml(column)}</option>`).join("")}</select>`:"")+`<label><input type="checkbox" id="missingShowAll" ${session.showAll?"checked":""}>Show groups with no gaps</label><button class="text-button" id="missingColumns">+ columns</button>`;
  }
  function exploreContent(issue,session){ // MISS-E-01…22 / LAY-01, LAY-03: shared selection and grouped table slots.
    init(issue,session);const c=ReviewComponents,list=groups(issue),selected=lockedRows(issue,session),ids=new Set(selected.map(row=>row._row)),onlyBlank=list.length===1&&!list[0].value;
    const report=session.missingAssessment||(session.aiMode==="explore"?session.ai:null),ready=session.aiStatus==="ready"||Boolean(session.missingAssessment);
    const items=list.slice(0,session.showRepresentations?list.length:200).map(group=>({value:group.value||"(blank)",count:group.rows.length,share:`${(group.rows.length/state.rows.length*100).toFixed(1)}%`,button:true,ui:"review.explore.missing.value",attrs:{"data-value":group.value,"aria-pressed":session.locked.includes(group.value)},control:'<span class="rc-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>',meta:!group.value?"always missing":ready&&report?.assessments?.find(entry=>entry.value===group.value)?`<span data-ui="review.explore.missing.confidence">AI ${Math.round(report.assessments.find(entry=>entry.value===group.value).confidence)}%</span>`:session.aiStatus==="pending"?"AI …":"review the meaning"}));
    const ai=onlyBlank?`<p data-ui="review.explore.missing.only-blanks">Only blank cells found (${list[0].rows.length}, ${(list[0].rows.length/state.rows.length*100).toFixed(1)}%), treated as missing. Nothing for AI to judge.</p>`:`${ReviewCore.aiStatus(issue)}${ready&&report?`<p>AI · ${escapeHtml(session.assessmentProvider||session.aiProvider||"configured provider")}: ${c.text(report.note)}</p><button class="text-button" id="missingAiPicks">Select AI picks</button>`:""}<button class="text-button" id="missingRefreshAi">Refresh AI</button>`;
    const total=`${selected.length} cells selected (${(selected.length/Math.max(1,state.rows.length)*100).toFixed(1)}% of rows)`;
    const columns=[{key:"_row",label:"Row",numeric:true},...new Set([issue.column,...session.locks,...contextColumns(issue,session)])].map(item=>typeof item==="string"?{key:item,label:item,numeric:ReviewCore.numericType(item)}:item);
    const rate=rows=>rows.filter(row=>ids.has(row._row)).length/Math.max(1,rows.length),sort=items=>items.filter(group=>session.showAll||rate(group.rows)>0).sort((a,b)=>rate(b.rows)-rate(a.rows));
    const outer=sort(grouped(issue,session,state.rows,session.locks.slice(0,1))).map(group=>({...group,...(session.locks.length>1?{children:sort(grouped(issue,session,group.rows,session.locks.slice(1)))}:{})}));
    const highest=outer[0],overall=selected.length/Math.max(1,state.rows.length),even=outer.every(group=>Math.abs(rate(group.rows)-overall)<=.03);
    const takeaway=session.locks.length?(even?`Gaps are spread evenly across ${session.locks[0]}; no single group explains them.`:`Gaps are most common in ${highest?.label||"the selected groups"} (${((highest?rate(highest.rows):0)*100).toFixed(1)}% vs ${(overall*100).toFixed(1)}% overall), so inspect that group's entries.`):"Compare missing values with complete entries; add a group to inspect where the gaps concentrate.";
    const flat=state.rows.filter(row=>ids.has(row._row)).slice(0,4).concat(state.rows.filter(row=>!ids.has(row._row)).slice(0,2)).map(row=>Object.fromEntries(columns.map(column=>[column.key,column.key==="_row"?row._row:{value:canonical(row[column.key])?row[column.key]:"—",raw:true,problem:column.key===issue.column&&ids.has(row._row)}])));
    const evidence=c.toolbar("Group rows by",groupControls(issue,session),"review.explore.missing.locks")+c.headline(takeaway,"review.explore.missing.headline")+(session.locks.length?c.groupedTable(outer,{columns,target:issue.column,selectedIds:ids,overall,session,ui:"review.explore.missing.sheet"}):c.table({columns,rows:flat,ui:"review.explore.missing.sheet"}));
    return {lead:`Which values in ${issue.column} mean something was not recorded?`,sub:`Select the values to include in the next fix for ${c.count(selected.length)}.`,selection:c.selection(items,{ui:"review.explore.missing.values",total,ai})+(list.length>200&&!session.showRepresentations?'<button class="text-button" id="missingShowRepresentations">Show all values</button>':"")+(selected.length/state.rows.length>=.95?'<button class="text-button" id="missingDropLink">This column is almost empty: consider removing it →</button>':""),evidence,evidenceTitle:"Where are the gaps?",grouping:session.locks.join(" · ")};
  }
  function fixContent(issue,session,preview,option){ // MISS-F-07 / C6: one changed-only view.
    const key=option.key.replace(/^ai:/,"");if(["leave","drop-rows"].includes(key))return {text:key==="leave"?"No values change.":`${preview.removedRows.length} entries are removed; no values are filled.`};
    return {visual:ReviewCore.numericType(issue.column)?ReviewCharts.histogram(issue.column,state.rows,preview.after,{missingBefore:new Set(preview.beforeExcludedIds),missingAfter:new Set(preview.afterExcludedIds),patches:preview.patches,snapshot:true,compact:true}):ReviewComponents.changedLabels(issue.column,state.rows,preview.after)};
  }
  function reviewContent(issue,decision){ // MISS-R-01…04 / T3 slots, using approved snapshots only.
    const impact=decision.reviewImpact,numeric=["number","integer"].includes(decision.reviewSpec?.targetRole),filled=["leaveMissing","remove","retain"].includes(decision.treatment.operation)?0:decision.patches.length;
    const columns=[{key:"row",label:"Row",numeric:true},{key:"before",label:"Before"},{key:"after",label:"After"},...(decision.reviewSpec?.locks||[]).slice(0,3).map(column=>({key:column,label:column}))],byId=new Map(impact.afterRows.map(row=>[row._row,row]));
    const examples=decision.patches.filter(patch=>patch.column===issue.column).slice(0,5).map(patch=>({row:patch.rowId,before:{value:patch.before||"(blank)",raw:true},after:{value:patch.after||"(blank)",raw:true},...Object.fromEntries(columns.slice(3).map(column=>[column.key,byId.get(patch.rowId)?.[column.key]||"Not recorded"]))}));
    return {lead:filled?`${filled} ${ReviewComponents.noun()} now have a reviewed value in ${issue.column}.`:`${decision.rows.length} ${ReviewComponents.noun()} reviewed without filling values.`,sub:`${decision.reviewSpec?.label||decision.title} · ${new Date(decision.createdAt).toLocaleTimeString()} · ${decision.note||"No note"}`,count:decision.rows.length,change:{metrics:[{label:"Values filled",value:filled},{label:"Missing",value:`${impact.beforeMissing} → ${impact.afterMissing}`},...(numeric?[{label:"Median",value:`${ReviewCore.format(impact.beforeStats.median,issue.column)} → ${ReviewCore.format(impact.afterStats.median,issue.column)}`},{label:"Mean",value:`${ReviewCore.format(impact.beforeStats.mean,issue.column)} → ${ReviewCore.format(impact.afterStats.mean,issue.column)}`}]:[{label:"Rows removed",value:decision.removedRows.length}])],visual:filled?(numeric?ReviewCharts.histogram(issue.column,impact.beforeRows,impact.afterRows,{missingBefore:new Set(impact.beforeExcludedIds),missingAfter:new Set(impact.afterExcludedIds),patches:decision.patches,snapshot:true,policy:decision.reviewSpec.targetPolicy}):ReviewComponents.changedLabels(issue.column,impact.beforeRows,impact.afterRows)):"",text:filled?"":"No cell values were filled."},examples:ReviewComponents.table({columns,rows:examples,ui:"review.review.sample",empty:"No example values change for this decision."})};
  }
  return {detect,unit:"cells",count,queueCount:count,queueCountLabel:issue=>`${count(issue)} cells selected`,countLabel:issue=>ReviewCore.count(count(issue),"cells selected"),remainingCandidates,groups,init,lockedRows,isDate,contextColumns,grouped,exploreContent,fixContent,reviewContent,renderExplore:(issue,session)=>ReviewComponents.explore(issue,exploreContent(issue,session)),getFixOptions,reminder,consequence,aiContext,aiExplore,aiFix,decisionMetadata,invalidate,bind};
})();
