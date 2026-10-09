// Missing's complete contract lives here; shared controls/calculations stay in their existing layers.
ReviewModules.missing = (() => {
  const nullLike = /^(null|n\/?a|none|nan|--?|\?|#n\/a|missing|unknown|not available)$/i;
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
  function inspectionState(issue,session) { // MISS-E-18, MISS-E-22: context columns are seeded once, never replaced by background analysis.
    session.tableOrder ??= [];session.tableColumns ??= contextColumns(issue,session);session.tableLimit ??= 50;
    session.tableLimit=Math.min(session.tableLimit,Math.max(1,state.rows.length));
    session.tableOrder=session.tableOrder.filter(entry=>state.headers.includes(entry.column));
    session.tableColumns=session.tableColumns.filter(column=>state.headers.includes(column)&&column!==issue.column);
  }
  function inspectionRows(issue,session) { // MISS-E-13, MISS-E-14, MISS-E-17, MISS-E-21: sort a copy, with source-order ties and unavailable values last.
    inspectionState(issue,session);const key=JSON.stringify([state.datasetRevision,session.tableOrder]);
    if(session.orderCache?.key===key&&session.orderCache.source===state.rows)return session.orderCache.rows;
    const formats=reviewDateFormats(),descriptors=session.tableOrder.map(entry=>({...entry,policy:columnPolicy(entry.column),numeric:ReviewCore.numericType(entry.column),date:inferType(entry.column)==="Date"}));
    const entries=state.rows.map((row,index)=>({row,index,values:descriptors.map(entry=>{
      const raw=String(row[entry.column]??"");if(!raw.trim()||observationState(row,entry.column)!=="present")return null;
      try{if(entry.numeric)return CleaningEngine.parseNumber(raw,entry.policy);if(entry.date){const iso=ReviewPageEngine.dateValue(raw,formats[JSON.stringify([row._row,entry.column,raw])]||entry.policy.dateFormat);return Date.parse(raw.includes("T")?`${iso}T${raw.split("T")[1]}`:iso);}return raw;}catch{return null;}
    })}));
    const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:"base"});
    if(descriptors.length)entries.sort((a,b)=>{for(let i=0;i<descriptors.length;i++){const x=a.values[i],y=b.values[i];if(x===null&&y===null)continue;if(x===null)return 1;if(y===null)return -1;const delta=typeof x==="number"?x-y:collator.compare(x,y);if(delta)return descriptors[i].direction==="desc"?-delta:delta;}return a.index-b.index;});
    const rows=entries.map(entry=>entry.row);session.orderCache={key,source:state.rows,rows};return rows;
  }
  function sheet(issue,session) { // MISS-E-10, MISS-E-11, MISS-E-15, MISS-E-16, MISS-E-19, MISS-E-20, CORE-58
    inspectionState(issue,session);const missing=new Set(lockedRows(issue,session).map(row=>row._row)),rows=inspectionRows(issue,session),shown=rows.slice(0,session.tableLimit);
    const columns=[...new Set([issue.column,...session.tableOrder.map(entry=>entry.column),...session.tableColumns])],available=state.headers.filter(column=>!session.tableOrder.some(entry=>entry.column===column));
    tablePrecisions.clear();columns.filter(ReviewCore.numericType).forEach(column=>tablePrecisions.set(column,ReviewCore.precision(column)));
    const priorities=session.tableOrder.map((entry,index)=>`<li draggable="true" data-order-chip="${index}" data-ui="review.explore.missing.priority" data-column="${escapeHtml(entry.column)}"><label class="priority-position"><span class="sr-only">Priority for ${escapeHtml(entry.column)}</span><select data-order-position="${index}">${session.tableOrder.map((_,position)=>`<option value="${position}" ${position===index?"selected":""}>${position+1}</option>`).join("")}</select></label><span class="priority-name" title="${escapeHtml(entry.column)}">${escapeHtml(entry.column)}</span><button class="priority-direction" data-order-direction="${index}" aria-label="${escapeHtml(entry.column)}: ${entry.direction==="desc"?"descending; switch to ascending":"ascending; switch to descending"}">${orderIcon(entry.direction)}</button><button class="priority-remove" data-order-remove="${index}" aria-label="Remove ordering by ${escapeHtml(entry.column)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></li>`).join("");
    const heading=column=>{const index=session.tableOrder.findIndex(entry=>entry.column===column),direction=session.tableOrder[index]?.direction;return `<th class="${column===issue.column?"pinned-target":""}" scope="col" ${index===0?`aria-sort="${direction==="desc"?"descending":"ascending"}"`:""}><button data-order-header="${escapeHtml(column)}" aria-label="Order by ${escapeHtml(column)}${index>=0?`, priority ${index+1}, ${direction==="desc"?"descending":"ascending"}`:""}"><span>${escapeHtml(column)}</span>${index>=0?`<small>${index+1}</small>${orderIcon(direction)}`:""}</button></th>`;};
    const addControl=available.length?`<details class="priority-add"><summary id="missingOrderAdd" aria-label="Add ordering column" title="Add ordering column"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></summary><div class="priority-picker"><label>Order rows by<select id="missingAddOrder"><option value="">Choose a column</option>${available.map(column=>`<option>${escapeHtml(column)}</option>`).join("")}</select></label></div></details>`:"";
    return `<section class="review-gap-sheet priority-sheet" data-ui="review.explore.missing.sheet">
      <div class="review-sheet-heading"><div><h3>Inspect the rows</h3><p>Order columns to look for patterns in the highlighted gaps.</p></div><button class="text-button" id="missingColumns" data-ui="review.explore.missing.columns" aria-expanded="${Boolean(session.pickColumns)}">Columns</button></div>
      <div class="priority-toolbar" data-ui="review.explore.missing.order"><span>Order by</span><ol>${priorities}</ol>${addControl}${session.tableOrder.length?'<button class="text-button" id="missingResetOrder">Reset</button>':""}</div>
      ${session.pickColumns?`<fieldset class="review-column-picker"><legend>Visible context columns</legend>${state.headers.filter(column=>column!==issue.column).map(column=>`<label><input type="checkbox" data-context-column="${escapeHtml(column)}" ${columns.includes(column)?"checked":""} ${session.tableOrder.some(entry=>entry.column===column)?'disabled title="Remove this ordering priority before hiding its column"':""}>${escapeHtml(column)}</label>`).join("")}</fieldset>`:""}
      <div class="priority-table-scroll" tabindex="0" aria-label="Ordered rows; scroll to inspect more columns"><table class="priority-table"><thead><tr><th class="pinned-row" scope="col">Row</th>${columns.map(heading).join("")}</tr></thead><tbody>${shown.map(row=>`<tr data-inspection-row="${row._row}"><td class="pinned-row">${row._row}</td>${columns.map(column=>`<td class="${column===issue.column?"pinned-target":""} ${column===issue.column&&missing.has(row._row)?"locked-gap":""}">${column===issue.column&&!canonical(row[column])?'<span class="missing-cell">Missing</span>':escapeHtml(formatted(row[column],column))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <footer class="priority-table-footer"><span data-ui="review.explore.missing.headline">${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} rows · ${missing.size.toLocaleString()} selected missing · ${session.tableOrder.length?"priority order":"source order"}</span>${shown.length<rows.length?`<button class="text-button" id="missingMoreRows">Show ${Math.min(50,rows.length-shown.length)} more</button><button class="text-button" id="missingAllRows">Show all</button>`:""}</footer></section>`;
  }
  function renderFixSetup(issue,session) { // MISS-E-12, MISS-F-03: fill groups are independent of inspection ordering.
    if(isDate(issue))return "";
    return `<details class="missing-fill-groups" data-ui="review.fix.missing.groups" ${session.fillGroupsOpen?"open":""}><summary>Fill groups <span>${session.locks.length?escapeHtml(session.locks.join(" · ")):"None selected"}</span></summary><p>Used only by group-based fills. Table ordering does not choose these groups.</p><div class="review-lock-controls">${session.locks.map((column,index)=>`<div class="review-lock-chip" draggable="true" data-lock-chip="${index}"><b>${escapeHtml(column)}</b>${ReviewCore.numericType(column)?`<select data-ui="review.fix.missing.bands" data-missing-band="${escapeHtml(column)}" aria-label="Fill bands for ${escapeHtml(column)}"><option value="quantiles" ${(session.banding[column]?.mode||"quantiles")==="quantiles"?"selected":""}>5 quantiles</option><option value="fixedWidth" ${session.banding[column]?.mode==="fixedWidth"?"selected":""}>Fixed width</option><option value="custom" ${session.banding[column]?.mode==="custom"?"selected":""}>Custom edges</option></select>${["fixedWidth","custom"].includes(session.banding[column]?.mode)?`<input data-missing-edges="${escapeHtml(column)}" aria-label="Width or edges for ${escapeHtml(column)}" value="${escapeHtml(session.banding[column].width||session.banding[column].edges?.join(", ")||"")}">`:""}`:""}<button class="text-button" data-remove-lock="${index}" aria-label="Remove fill group ${escapeHtml(column)}">Remove</button></div>`).join("")}${session.locks.length<3?`<select id="missingAddLock" aria-label="Add a fill group"><option value="">Add fill group…</option>${state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!session.locks.includes(column)).map(column=>`<option>${escapeHtml(column)}</option>`).join("")}</select>`:""}</div></details>`;
  }
  function picks(session) { // MISS-E-07, MISS-T-06: explicit recommendations must also meet the documented 70 threshold.
    const report=session.missingAssessment || (session.aiMode==="explore"?session.ai:null);
    return (report?.locks || []).filter(value=>!value || report.assessments?.some(entry=>entry.value===value&&entry.confidence>=70));
  }
  function renderExplore(issue,session) { // MISS-E-01, MISS-E-02, MISS-E-04, MISS-E-05, MISS-E-06, MISS-E-08
    init(issue,session);const list=groups(issue),total=lockedRows(issue,session).length,onlyBlank=list.length===1&&!list[0].value,assessmentStatus=session.aiMode==="explore"?session.aiStatus:session.missingAssessment?"ready":"idle",ready=assessmentStatus==="ready",report=session.missingAssessment || (session.aiMode==="explore"?session.ai:null),provider=session.assessmentProvider || session.aiProvider,shown=session.showRepresentations?list:list.slice(0,200);
    const displaySession={...session,ai:report,aiStatus:assessmentStatus,aiProvider:provider};
    const valueList=shown.map((group,index)=>{
      const assessment=ready&&report?.assessments?.find(entry=>entry.value===group.value);
      return `<button id="missingValue${index}" class="review-missing-value ${session.locked.includes(group.value)?"locked":""}" data-ui="review.explore.missing.value" data-value="${escapeHtml(group.value)}" aria-pressed="${session.locked.includes(group.value)}"><span class="review-lock-square">${session.locked.includes(group.value)?"✓":""}</span><code>${escapeHtml(group.value || "(blank)")}</code><b>${group.rows.length}</b><span>${(group.rows.length/state.rows.length*100).toFixed(1)}%</span><small data-ui="review.explore.missing.confidence" ${assessment?`title="AI · ${escapeHtml(provider || "configured provider")}: ${escapeHtml(assessment.reason)} Scores are model-assessed rankings, not calibrated probabilities."`:""}>${!group.value?"missing":assessment?`AI ${Math.round(assessment.confidence)}%`:assessmentStatus==="pending"?"AI …":"unreviewed"}</small></button>`;
    }).join("");
    const aiPane=onlyBlank?`<p class="review-empty-copy" data-ui="review.explore.missing.only-blanks">Only blank cells found (${list[0].rows.length}, ${(list[0].rows.length/state.rows.length*100).toFixed(1)}%), treated as missing. Nothing for AI to judge.</p>`:`<aside class="review-missing-ai" data-ui="review.explore.missing.ai">${ReviewCore.aiStatus(issue,displaySession)}${ready&&report?`<p>AI · ${escapeHtml(provider || "configured provider")}: ${escapeHtml(report.note)}</p><button class="secondary" id="missingAiPicks" ${!picks(session).length?'disabled title="AI recommended no representations above the confidence threshold"':""}>Lock AI picks</button>`:""}<button class="text-button" id="missingRefreshAi">Refresh</button></aside>`;
    return `<section class="missing-explore" data-ui="review.explore.missing"><div class="review-representation-header"><h2>Treat as missing</h2></div><div class="review-missing-overview ${onlyBlank?"blank-only":""}"><div class="review-missing-values" data-ui="review.explore.missing.values">${valueList}${list.length>200&&!session.showRepresentations?`<button class="text-button" id="missingShowRepresentations">Show all ${list.length} representations</button>`:""}</div>${aiPane}</div><p class="review-locked-total" data-ui="review.explore.missing.total">Selected: ${ReviewCore.count(total,"cells")}${total/Math.max(1,state.rows.length)>=.95?' <button class="text-button" id="missingDropLink">This column is almost empty: consider dropping it →</button>':""}</p>${sheet(issue,session)}</section>`;
  }
  function knnParams(issue,session) {
    session.knnColumns ||= (session.comparison?.results || []).filter(result=>!idLike(result.column)).slice(0,3).map(result=>result.column);
    session.knnK ??= 7;
    return `<label>Neighbours<input id="missingKnnK" type="number" min="1" max="50" value="${session.knnK}"></label><div class="missing-knn-columns">${state.headers.filter(column=>column!==issue.column&&!idLike(column)).map(column=>`<label><input type="checkbox" data-knn-column="${escapeHtml(column)}" ${session.knnColumns.includes(column)?"checked":""}>${escapeHtml(column)}</label>`).join("")}</div>`;
  }
  function getFixOptions(issue,session) { // MISS-F-01, MISS-F-02, MISS-F-03: type-specific defaults and editable exact parameters.
    const numeric=ReviewCore.numericType(issue.column),date=isDate(issue),dateColumn=session.orderColumn || state.headers.find(column=>column!==issue.column&&inferType(column)==="Date"),groupedLabel=session.locks.join(" + ");
    const constantRisk=current=>current.blankMeansValue?"Doesn't invent information":numeric || date?"Estimates values":/^(unknown|unassigned|not recorded|missing)$/i.test(current.value.trim())?"Doesn't invent information":"Invents information";
    const constant={key:"constant",label:numeric?"Fill with value":date?"Fill with date":`Fill “${session.value || "Unknown"}”`,risk:constantRisk,params:()=>`<input id="missingConstant" aria-label="Fill value" type="${numeric?"number":date?"date":"text"}" step="any" value="${escapeHtml(session.value)}"><label class="review-inline-check"><input id="missingBlankMeans" type="checkbox" ${session.blankMeansValue?"checked":""}> Blank means this value</label>`,compute:()=>{if(!session.value.trim())throw new Error("Enter a replacement value, or choose Leave missing.");if(date)CleaningEngine.parseDate(session.value);return {operation:"constant",value:session.value};}};
    const leave={key:"leave",label:"Leave missing",risk:"Doesn't change values",compute:()=>({operation:"leaveMissing",interpretation:"missing"})},drop={key:"drop-rows",label:"Remove these rows",risk:"Removes data",more:true,compute:()=>({operation:"remove"})};
    const ordered=dateColumn || date?[{key:"previous-value",label:"Carry forward",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"previous",orderColumn:dateColumn})},{key:"next-value",label:"Carry back",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"next",orderColumn:dateColumn})}]:[];
    if(date)return [leave,constant,...ordered,drop];
    if(!numeric)return [constant,{key:"mode-by-group",label:`Most common by ${groupedLabel || "group"}`,risk:"Invents information",disabled:session.locks.length?"":"Choose a fill group below",compute:()=>({operation:"groupMode",groupColumns:session.locks,groupBanding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))})},leave,{key:"mode",label:"Most common overall",risk:"Invents information",more:true,compute:()=>({operation:"mode"})},drop];
    return [{key:"median",label:"Median",risk:"Estimates values",compute:()=>({operation:"median"})},{key:"median-by-group",label:`Median by ${groupedLabel || "group"}`,risk:"Estimates values",disabled:session.locks.length?"":"Choose a fill group below",compute:()=>({operation:"groupwise",similar:{columns:session.locks,statistic:"median",minObserved:5,k:7,banding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))}})},constant,leave,{key:"mean",label:"Mean",risk:"Estimates values",more:true,compute:()=>({operation:"mean"})},{key:"knn",label:"Similar rows",risk:"Estimates values",more:true,params:()=>knnParams(issue,session),compute:()=>{knnParams(issue,session);return {operation:"knn",similar:{columns:session.knnColumns,statistic:"median",minObserved:5,k:session.knnK,banding:{}}};}},...ordered,...(dateColumn?[{key:"interpolate",label:"Interpolate",risk:"Estimates values",more:true,compute:()=>({operation:"interpolate",orderColumn:dateColumn})}]:[]),drop];
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
  function renderHistograms(issue,session,before,after,marks,compact=false,frame={}) { // CORE-46, CORE-47, MISS-F-08, MISS-R-03
    const missingBefore=new Set(frame.beforeExcludedIds || lockedRows(issue,session).map(row=>row._row)),missingAfter=new Set(frame.afterExcludedIds || []),options={missingBefore,missingAfter,patches:marks,compact,snapshot:true,policy:session.targetPolicy};
    if(!session.byGroup || !session.locks.length)return ReviewCharts.histogram(issue.column,before,after,options);
    // Group membership is frozen from the decision's source snapshot, not today's working values.
    let groups;
    if(session.chartGroups){const byId=new Map(before.map(row=>[row._row,row]));groups=session.chartGroups.map(group=>({label:group.label,rows:group.rowIds.map(id=>byId.get(id)).filter(Boolean)}));}
    else {
      const context=AnalysisEngine.prepare(frame.beforeHeaders || state.headers,before,analyticalOptions()),definitions=session.locks.map(column=>AnalysisEngine.bandsFor(context,column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]})),byGroup=new Map();
      before.forEach((row,index)=>{const label=definitions.map(definition=>definition.labels[index]).join(" · ");if(!byGroup.has(label))byGroup.set(label,{label,rows:[]});byGroup.get(label).rows.push(row);});groups=[...byGroup.values()];
    }
    const ordered=groups.sort((a,b)=>b.rows.length-a.rows.length),top=ordered.slice(0,4),other=ordered.slice(4).flatMap(group=>group.rows);if(other.length)top.push({label:"Other",rows:other});
    return `<div class="review-small-multiples">${top.map(group=>{const ids=new Set(group.rows.map(row=>row._row));return `<section><h4>${escapeHtml(group.label)}</h4>${ReviewCharts.histogram(issue.column,group.rows,after.filter(row=>ids.has(row._row)),{...options,patches:marks.filter(patch=>ids.has(patch.rowId)),compact:true,small:true,ymax:1})}</section>`;}).join("")}</div>`;
  }
  function renderPreview(issue,session,preview,option) { // MISS-F-07
    const key=option.key.replace(/^ai:/,"");if(key==="leave")return '<p>No values change.</p>';if(key==="drop-rows")return `<p>${preview.removedRows.length} rows will be removed; no cell values are filled.</p>`;
    if(!ReviewCore.numericType(issue.column)) {
      const old=new Map(ReviewPageEngine.frequencies(state.rows,issue.column,canonical).map(group=>[group.value,group.rows.length])),next=new Map(ReviewPageEngine.frequencies(preview.after,issue.column,canonical).map(group=>[group.value,group.rows.length])),keys=[...new Set([...old.keys(),...next.keys()])],changed=keys.filter(value=>(old.get(value)||0)!==(next.get(value)||0));
      return `<div class="review-text-effects">${changed.map(value=>`<p><b>${escapeHtml(value || "(blank)")}</b> ${old.get(value)||0} → ${next.get(value)||0}</p>`).join("")}${changed.length?`<p>${keys.length-changed.length} others unchanged</p>`:"<p>No values change.</p>"}</div>`;
    }
    return `${session.locks.length?`<label class="review-chart-toggle" data-ui="review.fix.preview.by-group"><input id="missingPreviewGroups" type="checkbox" ${session.byGroup?"checked":""}> By group</label>`:""}${renderHistograms(issue,session,state.rows,preview.after,fillMarks(issue,state.rows,preview.after,preview.classification.rowIds),true,preview)}`;
  }
  function renderReview(issue,decision) { // MISS-R-01, MISS-R-02, MISS-R-04
    const current=ReviewCore.data(issue),impact=decision.reviewImpact,before=impact.beforeRows,after=impact.afterRows,session={...current,locks:decision.reviewSpec?.locks || impact.groups || [],banding:decision.reviewSpec?.banding || current.banding,chartGroups:decision.reviewSpec?.chartGroups,targetPolicy:decision.reviewSpec?.targetPolicy},numeric=["number","integer"].includes(decision.reviewSpec?.targetRole || issue.columnRole),noFill=["leaveMissing","remove","retain"].includes(decision.treatment.operation),filled=noFill?0:decision.rows.length;
    const entries=[{label:"Cells changed",value:decision.patches.length},{label:"Cells filled",value:filled},{label:"Rows removed",value:decision.removedRows.length},{label:"Columns added / removed",value:"0 / 0"},{label:"Missing",value:`${impact.beforeMissing} (${(impact.beforeMissing/Math.max(1,before.length)*100).toFixed(1)}%) → ${impact.afterMissing}`}];
    if(numeric)entries.push({label:"Median",value:`${ReviewCore.format(impact.beforeStats.median,issue.column)} → ${ReviewCore.format(impact.afterStats.median,issue.column)}`},{label:"Mean",value:`${ReviewCore.format(impact.beforeStats.mean,issue.column)} → ${ReviewCore.format(impact.afterStats.mean,issue.column)}`});else entries.push({label:"Distinct labels",value:`${new Set(before.map(row=>canonical(row[issue.column]))).size} → ${new Set(after.map(row=>canonical(row[issue.column]))).size}`});
    const remaining=remainingCandidates(issue),representations=[...new Set(remaining.map(row=>canonical(row[issue.column])||"(blank)"))];
    const outcome=`<div class="review-outcome"><p>${filled?`${filled.toLocaleString()} cells filled.`:decision.removedRows.length?`${decision.removedRows.length} rows removed.`:"Selected values reviewed without filling."}${remaining.length?` ${remaining.length.toLocaleString()} candidate cells still need review (${escapeHtml(representations.slice(0,3).join(", "))}${representations.length>3?", …":""}).`:" No candidates remain for this issue."}</p>${remaining.length?'<button class="text-button" id="reviewRemainingCandidates">Review remaining candidates</button>':""}</div>`;
    return `${outcome}${ReviewCore.metricStrip(entries)}${!noFill&&session.locks.length?`<label data-ui="review.review.by-group"><input id="missingReviewGroups" type="checkbox" ${session.byGroup?"checked":""}> By group</label>`:""}<div data-ui="review.review.chart">${noFill?'<p>No cell values were filled by this decision.</p>':numeric?renderHistograms(issue,session,before,after,fillMarks(issue,before,after,decision.rows.map(row=>row._row)),false,impact):ReviewCharts.categories(issue.column,before,after,{canonicalize:canonical})}</div>${ReviewCore.sampleTable(issue,decision.patches,session.locks,5,after)}`;
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
    const inspectEdited=edit=>{edit();session.tableLimit=50;session.orderCache=null;markProjectDirty();renderPreservingReviewFocus();};
    const reorder=(from,to)=>inspectEdited(()=>{const [entry]=session.tableOrder.splice(from,1);session.tableOrder.splice(to,0,entry);});
    document.getElementById("missingAddOrder")?.addEventListener("change",event=>{const column=event.target.value;if(column&&!session.tableOrder.some(entry=>entry.column===column)){inspectEdited(()=>session.tableOrder.push({column,direction:"asc"}));document.getElementById("missingOrderAdd")?.focus();}});
    document.querySelector(".priority-add")?.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.currentTarget.open=false;document.getElementById("missingOrderAdd")?.focus();}});
    document.querySelector(".priority-add")?.addEventListener("toggle",event=>{if(!event.target.open||!event.target.isConnected)return;const picker=event.target.querySelector(".priority-picker"),anchor=event.target.getBoundingClientRect(),bounds=document.querySelector(".review-main").getBoundingClientRect(),width=picker.offsetWidth;picker.style.insetInlineEnd="auto";picker.style.insetInlineStart=`${Math.max(bounds.left+14-anchor.left,Math.min(0,bounds.right-14-anchor.left-width))}px`;});
    document.getElementById("reviewRemainingCandidates")?.addEventListener("click",()=>ReviewCore.switchTab(issue,"explore"));
    document.querySelectorAll("[data-order-direction]").forEach(button=>button.onclick=()=>inspectEdited(()=>{const entry=session.tableOrder[Number(button.dataset.orderDirection)];entry.direction=entry.direction==="asc"?"desc":"asc";}));
    document.querySelectorAll("[data-order-remove]").forEach(button=>button.onclick=()=>inspectEdited(()=>session.tableOrder.splice(Number(button.dataset.orderRemove),1)));
    document.querySelectorAll("[data-order-position]").forEach(input=>input.onchange=()=>reorder(Number(input.dataset.orderPosition),Number(input.value)));
    document.querySelectorAll("[data-order-header]").forEach(button=>button.onclick=()=>inspectEdited(()=>{const column=button.dataset.orderHeader,entry=session.tableOrder.find(entry=>entry.column===column);if(entry)entry.direction=entry.direction==="asc"?"desc":"asc";else session.tableOrder.push({column,direction:"asc"});}));
    let orderDragged=null;document.querySelectorAll("[data-order-chip]").forEach(chip=>{chip.ondragstart=event=>{orderDragged=Number(chip.dataset.orderChip);event.dataTransfer?.setData("text/plain",String(orderDragged));};chip.ondragover=event=>event.preventDefault();chip.ondrop=event=>{event.preventDefault();if(orderDragged!==null)reorder(orderDragged,Number(chip.dataset.orderChip));orderDragged=null;};chip.ondragend=()=>{orderDragged=null;};});
    document.getElementById("missingResetOrder")?.addEventListener("click",()=>inspectEdited(()=>{session.tableOrder=[];}));
    document.getElementById("missingMoreRows")?.addEventListener("click",()=>{session.tableLimit+=50;renderPreservingReviewFocus();});
    document.getElementById("missingAllRows")?.addEventListener("click",()=>{session.tableLimit=state.rows.length;renderPreservingReviewFocus();});
    document.querySelectorAll('[data-ui="review.explore.missing.value"]').forEach(button=>button.onclick=()=>scopeEdited(issue,session,()=>{const value=button.dataset.value;session.locked=session.locked.includes(value)?session.locked.filter(entry=>entry!==value):session.locked.concat(value);}));
    document.getElementById("missingShowRepresentations")?.addEventListener("click",()=>{session.showRepresentations=true;renderPreservingReviewFocus();});
    document.getElementById("missingAiPicks")?.addEventListener("click",()=>scopeEdited(issue,session,()=>{session.locked=picks(session);}));
    document.getElementById("missingRefreshAi")?.addEventListener("click",()=>{session.assessmentRequested=false;session.missingAssessment=null;session.ai=null;aiExplore(issue,session);});
    document.getElementById("missingDropLink")?.addEventListener("click",()=>ReviewCore.select(state.issues.find(item=>item.column===issue.column&&item.reviewType==="constant").id));
    const fillEdited=edit=>{const before=lockedRows(issue,session).length;edit();ReviewCore.lockChanged(issue,before);session.fillGroupsOpen=true;session.updated="Fill groups updated";markProjectDirty();ReviewCore.compute(issue);};
    document.querySelector(".missing-fill-groups")?.addEventListener("toggle",event=>{if(event.target.isConnected)session.fillGroupsOpen=event.target.open;});
    document.getElementById("missingAddLock")?.addEventListener("change",event=>{if(event.target.value&&session.locks.length<3)fillEdited(()=>{session.locks.push(event.target.value);session.banding[event.target.value]={mode:"quantiles",k:5,minCategoryCount:5};});});
    document.querySelectorAll("[data-remove-lock]").forEach(button=>button.onclick=()=>fillEdited(()=>{session.locks.splice(Number(button.dataset.removeLock),1);}));
    document.querySelectorAll("[data-missing-band]").forEach(input=>input.onchange=()=>fillEdited(()=>{const column=input.dataset.missingBand,stats=cleaningProfile().columns.find(profile=>profile.column===column).statistics;session.banding[column]={mode:input.value,k:5,minCategoryCount:5,width:Math.max((stats.max-stats.min)/5 || 1,Number.EPSILON),edges:[0,5,10,20,50]};}));
    document.querySelectorAll("[data-missing-edges]").forEach(input=>input.onchange=()=>{const column=input.dataset.missingEdges,band=session.banding[column],previous=structuredClone(band);if(band.mode==="fixedWidth")band.width=Number(input.value);else band.edges=input.value.split(",").map(Number);try{grouped(issue,session);fillEdited(()=>{});}catch(error){session.banding[column]=previous;session.bandCache=null;notify(error.message);}});
    document.getElementById("missingColumns")?.addEventListener("click",()=>{session.pickColumns=!session.pickColumns;renderPreservingReviewFocus();});
    document.querySelectorAll("[data-context-column]").forEach(input=>input.onchange=()=>{session.tableColumns=[...document.querySelectorAll("[data-context-column]:checked")].map(input=>input.dataset.contextColumn);markProjectDirty();renderPreservingReviewFocus();});
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
  return {detect,unit:"cells",count,queueCount,queueCountLabel,countLabel,remainingCandidates,groups,init,lockedRows,isDate,contextColumns,grouped,inspectionRows,renderExplore,getFixOptions,reminder,consequence,renderPreview,renderReview,renderFixSetup,aiContext,aiExplore,aiFix,decisionMetadata,invalidate,bind};
})();
