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
  async function compare(issue,session) { // MISS-E-18: use the existing robust comparison engine and stale-result guard.
    const signature=JSON.stringify([state.datasetRevision,session.locked]);if(session.compareKey===signature || session.comparePending)return;
    session.comparePending=true;const source=state.original;
    try {
      const classifications=effectiveClassifications().concat(lockedRows(issue,session).map(row=>({rowId:row._row,column:issue.column,value:row[issue.column],meaning:"missing"})));
      const result=await analyticalTask("compare",issue.column,{options:{...analyticalOptions(),classifications}});
      if(source!==state.original || signature!==JSON.stringify([state.datasetRevision,session.locked]))return;
      session.comparison=result;session.compareKey=signature;
    } catch { session.compareKey=signature; }
    finally {session.comparePending=false;if(state.screen==="issues"&&state.selectedIssue===issue.id)renderPreservingReviewFocus();}
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
  function formatted(value,column) { if(value===null || value===undefined || !String(value).trim())return "not recorded";if(ReviewCore.numericType(column)){try{return ReviewCore.format(CleaningEngine.parseNumber(value,columnPolicy(column)),column);}catch{}}return String(value); }
  function contextTooltip(issue,session,column) {
    const ids=new Set(lockedRows(issue,session).map(row=>row._row)),missing=state.rows.filter(row=>ids.has(row._row)),present=state.rows.filter(row=>!ids.has(row._row));
    if(ReviewCore.numericType(column))return `Missing rows: median ${ReviewCore.format(CleaningEngine.stats(ReviewCharts.numeric(missing,column)).median,column)} vs ${ReviewCore.format(CleaningEngine.stats(ReviewCharts.numeric(present,column)).median,column)} in present rows.`;
    const top=ReviewPageEngine.frequencies(missing,column)[0];if(!top)return "No missing-row comparison is available.";
    return `Missing rows here are mostly ${top.value || "unrecorded"} (${Math.round(top.rows.length/Math.max(1,missing.length)*100)}% vs ${Math.round(present.filter(row=>row[column]===top.value).length/Math.max(1,present.length)*100)}%).`;
  }
  function rowTable(issue,session,rows,missing,context,key) { // MISS-E-13, MISS-E-16, MISS-E-20, CORE-58
    const absent=rows.filter(row=>missing.has(row._row)),present=rows.filter(row=>!missing.has(row._row)),numericLock=session.locks.find(ReviewCore.numericType);
    const near=present.sort((a,b)=>{
      if(!numericLock || !absent.length)return a._row-b._row;
      const distance=row=>{try{const value=CleaningEngine.parseNumber(row[numericLock],columnPolicy(numericLock));return Math.min(...absent.flatMap(other=>{try{return [Math.abs(value-CleaningEngine.parseNumber(other[numericLock],columnPolicy(numericLock)))];}catch{return [];}}));}catch{return Infinity;}};
      return distance(a)-distance(b)||a._row-b._row;
    });
    const missingLimit=Number(session.showRows[`${key}:missing`]) || 20,shownMissing=absent.slice(0,missingLimit),shownPresent=session.showRows[`${key}:present`]?near:near.slice(0,5),columns=[...new Set([issue.column,...session.locks,...context])],differing=new Set((session.comparison?.results || []).filter(result=>result.effectSize>0).map(result=>result.column));
    return `<div class="review-sheet-table"><table><thead><tr><th>Row</th>${columns.map((column,index)=>`<th class="${index===0?"pinned-target":""}">${escapeHtml(column)}${context.includes(column)&&differing.has(column)?`<span class="review-diff-dot" data-context-dot="${escapeHtml(column)}" aria-label="differs"></span>`:""}</th>`).join("")}</tr></thead><tbody>${shownMissing.concat(shownPresent).map(row=>`<tr class="${missing.has(row._row)?"gap-row":"contrast-row"}"><td>${row._row}</td>${columns.map((column,index)=>`<td class="${index===0?"pinned-target":""} ${column===issue.column&&missing.has(row._row)?"locked-gap":""}">${column===issue.column&&!canonical(row[column])?'<span aria-label="missing">—</span>':escapeHtml(formatted(row[column],column))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${absent.length>shownMissing.length?`<button class="text-button" data-more-gap="${escapeHtml(key)}">${absent.length-shownMissing.length} more missing · show</button>`:""}${present.length>shownPresent.length?`<button class="text-button" data-more-present="${escapeHtml(key)}">${present.length} present · show all</button>`:""}`;
  }
  function sheet(issue,session) { // MISS-E-10, MISS-E-11, MISS-E-14, MISS-E-15, MISS-E-19, MISS-E-21
    const missing=new Set(lockedRows(issue,session).map(row=>row._row)),overall=missing.size/Math.max(1,state.rows.length),context=contextColumns(issue,session);
    const rates=grouped(issue,session,state.rows,session.locks.slice(0,1)).map(group=>({...group,n:group.rows.filter(row=>missing.has(row._row)).length})).sort((a,b)=>b.n/b.rows.length-a.n/a.rows.length),top=rates[0],even=rates.every(group=>Math.abs(group.n/group.rows.length-overall)<=.03);
    const headline=!session.locks.length?"Read the missing rows beside similar complete rows. Lock a column to arrange them into groups.":!missing.size?"No cells are locked as missing. Choose the representations to inspect.":even?`Gaps are spread evenly across ${session.locks[0]} groups (all within ±3 points of ${(overall*100).toFixed(1)}%).`:`Gaps are most common in ${top.label} (${(top.n/top.rows.length*100).toFixed(1)}% vs ${(overall*100).toFixed(1)}% overall).`;
    const tree=(rows,depth,path=[])=>{
      if(depth===session.locks.length)return rowTable(issue,session,rows,missing,context,JSON.stringify(path));
      const column=session.locks[depth],list=grouped(issue,session,rows,[column]).map(group=>({...group,n:group.rows.filter(row=>missing.has(row._row)).length})).filter(group=>session.showAll || group.n).sort((a,b)=>b.n/b.rows.length-a.n/a.rows.length);
      if(!list.length)return '<p class="review-empty-copy">No groups contain a locked gap. Enable groups with no gaps to inspect the remaining records.</p>';
      return list.map((group,index)=>{const id=JSON.stringify(path.concat(group.label)),open=session.openGroups[id]??index<3;return `<details class="review-gap-group" data-ui="review.explore.missing.group" data-group="${escapeHtml(id)}" ${open?"open":""}><summary><span>${escapeHtml(group.label)} · ${group.rows.length} rows · ${group.n} missing (${(group.n/group.rows.length*100).toFixed(1)}%)</span><span class="review-gap-rate"><i style="width:${group.n/group.rows.length*100}%"></i><em style="left:${overall*100}%"></em></span></summary>${open?tree(group.rows,depth+1,path.concat(group.label)):""}</details>`;}).join("");
    };
    return `<section class="review-gap-sheet" data-ui="review.explore.missing.sheet"><div class="review-sheet-heading"><h3>Rows around the gaps</h3><button class="text-button" id="missingColumns" data-ui="review.explore.missing.columns">+ columns</button></div><div class="review-lock-controls" data-ui="review.explore.missing.locks">${session.locks.map((column,index)=>`<div class="review-lock-chip" draggable="true" data-lock-chip="${index}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h1m4 0h1M5 8h1m4 0h1M5 13h1m4 0h1" stroke="currentColor" stroke-width="2"/></svg><b>${escapeHtml(column)}</b>${ReviewCore.numericType(column)?`<select data-ui="review.explore.missing.bands" data-missing-band="${escapeHtml(column)}" aria-label="Bands for ${escapeHtml(column)}"><option value="quantiles" ${(session.banding[column]?.mode || "quantiles")==="quantiles"?"selected":""}>5 quantiles</option><option value="fixedWidth" ${session.banding[column]?.mode==="fixedWidth"?"selected":""}>Fixed width</option><option value="custom" ${session.banding[column]?.mode==="custom"?"selected":""}>Custom edges</option></select>${["fixedWidth","custom"].includes(session.banding[column]?.mode)?`<input data-missing-edges="${escapeHtml(column)}" aria-label="Width or edges for ${escapeHtml(column)}" value="${escapeHtml(session.banding[column].width || session.banding[column].edges?.join(", ") || "")}">`:""}`:""}<button class="text-button" data-remove-lock="${index}" aria-label="Remove ${escapeHtml(column)}">×</button></div>`).join("")}${session.locks.length<3?`<select id="missingAddLock" aria-label="Add a lock column"><option value="">+ add lock column</option>${state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!session.locks.includes(column)).map(column=>`<option>${escapeHtml(column)}</option>`).join("")}</select>`:""}<label><input id="missingShowAll" type="checkbox" ${session.showAll?"checked":""}> show groups with no gaps</label></div><p class="review-gap-headline" data-ui="review.explore.missing.headline">${escapeHtml(headline)}</p>${session.pickColumns?`<div class="review-column-picker">${state.headers.filter(column=>column!==issue.column&&!session.locks.includes(column)).map(column=>`<label><input data-context-column="${escapeHtml(column)}" type="checkbox" ${context.includes(column)?"checked":""}>${escapeHtml(column)}</label>`).join("")}</div>`:""}<div class="review-gap-scroll">${session.locks.length?tree(state.rows,0):rowTable(issue,session,state.rows,missing,context,"flat")}</div></section>`;
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
    return `<section class="missing-explore" data-ui="review.explore.missing"><div class="review-representation-header"><h2>Values that may mean missing</h2><span>${ReviewCore.count(total,"cells")}</span></div><div class="review-missing-overview ${onlyBlank?"blank-only":""}"><div class="review-missing-values" data-ui="review.explore.missing.values">${valueList}${list.length>200&&!session.showRepresentations?`<button class="text-button" id="missingShowRepresentations">Show all ${list.length} representations</button>`:""}</div>${aiPane}</div><p class="review-locked-total" data-ui="review.explore.missing.total">Locked: ${ReviewCore.count(total,"cells")}${total/Math.max(1,state.rows.length)>=.95?' <button class="text-button" id="missingDropLink">This column is almost empty: consider dropping it →</button>':""}</p>${sheet(issue,session)}</section>`;
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
    if(!numeric)return [constant,{key:"mode-by-group",label:`Most common by ${groupedLabel || "group"}`,risk:"Invents information",disabled:session.locks.length?"":"Add a lock column in Explore",compute:()=>({operation:"groupMode",groupColumns:session.locks,groupBanding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))})},leave,{key:"mode",label:"Most common overall",risk:"Invents information",more:true,compute:()=>({operation:"mode"})},drop];
    return [{key:"median",label:"Median",risk:"Estimates values",compute:()=>({operation:"median"})},{key:"median-by-group",label:`Median by ${groupedLabel || "group"}`,risk:"Estimates values",disabled:session.locks.length?"":"Add a lock column in Explore",compute:()=>({operation:"groupwise",similar:{columns:session.locks,statistic:"median",minObserved:5,k:7,banding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))}})},constant,leave,{key:"mean",label:"Mean",risk:"Estimates values",more:true,compute:()=>({operation:"mean"})},{key:"knn",label:"Similar rows",risk:"Estimates values",more:true,params:()=>knnParams(issue,session),compute:()=>{knnParams(issue,session);return {operation:"knn",similar:{columns:session.knnColumns,statistic:"median",minObserved:5,k:session.knnK,banding:{}}};}},...ordered,...(dateColumn?[{key:"interpolate",label:"Interpolate",risk:"Estimates values",more:true,compute:()=>({operation:"interpolate",orderColumn:dateColumn})}]:[]),drop];
  }
  function reminder(issue,session) { return `Fixing: ${session.locked.map(value=>value || "(blank)").join(" + ")} in ${issue.column} · ${lockedRows(issue,session).length} cells${session.locks.length?` · grouped by ${session.locks.join(" + ")}`:""}`; }
  function consequence(issue,session,preview,option) { // MISS-F-04, MISS-F-05, MISS-F-06
    const carrying=ReviewCore.measure(issue),label=carrying.metric || "row count",amount=ReviewCore.money(carrying.carry,carrying.metric),numeric=ReviewCore.numericType(issue.column),primaryTarget=carrying.metric===issue.column;
    const whole=primaryTarget?preview.afterSum:ReviewCore.total(preview.after,carrying.metric),current=primaryTarget?preview.beforeSum:ReviewCore.total(state.rows,carrying.metric),figures=[];
    const column=session.locks[0] || session.comparison?.results.find(result=>result.type==="categorical")?.column,top=column&&ReviewPageEngine.frequencies(carrying.rows,column)[0],share=top?top.rows.length/Math.max(1,carrying.rows.length):0;
    const sentence=(primaryTarget?`These ${carrying.rows.length} rows have no recorded ${label} under the locked missing meaning; their contribution is unknown`:`These ${carrying.rows.length} rows hold ${amount} (${carrying.share.toFixed(1)}% of ${label})`)+`${top?`, ${share>=.5?"mostly":"largest group"} ${top.value || "unrecorded"} (${(share*100).toFixed(1)}%)`:""}.`;
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
    return `${ReviewCore.metricStrip(entries)}${!noFill&&session.locks.length?`<label data-ui="review.review.by-group"><input id="missingReviewGroups" type="checkbox" ${session.byGroup?"checked":""}> By group</label>`:""}<div data-ui="review.review.chart">${noFill?'<p>No cell values were filled by this decision.</p>':numeric?renderHistograms(issue,session,before,after,fillMarks(issue,before,after,decision.rows.map(row=>row._row)),false,impact):ReviewCharts.categories(issue.column,before,after,{canonicalize:canonical})}</div>${ReviewCore.sampleTable(issue,decision.patches,session.locks,5,after)}`;
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
    document.querySelectorAll("[data-context-dot]").forEach(dot=>{dot.title=contextTooltip(issue,session,dot.dataset.contextDot);});
    document.querySelectorAll('[data-ui="review.explore.missing.value"]').forEach(button=>button.onclick=()=>scopeEdited(issue,session,()=>{const value=button.dataset.value;session.locked=session.locked.includes(value)?session.locked.filter(entry=>entry!==value):session.locked.concat(value);}));
    document.getElementById("missingShowRepresentations")?.addEventListener("click",()=>{session.showRepresentations=true;renderPreservingReviewFocus();});
    document.getElementById("missingAiPicks")?.addEventListener("click",()=>scopeEdited(issue,session,()=>{session.locked=picks(session);}));
    document.getElementById("missingRefreshAi")?.addEventListener("click",()=>{session.assessmentRequested=false;session.missingAssessment=null;session.ai=null;aiExplore(issue,session);});
    document.getElementById("missingDropLink")?.addEventListener("click",()=>ReviewCore.select(state.issues.find(item=>item.column===issue.column&&item.reviewType==="constant").id));
    document.getElementById("missingAddLock")?.addEventListener("change",event=>{if(event.target.value&&session.locks.length<3)scopeEdited(issue,session,()=>{session.locks.push(event.target.value);session.banding[event.target.value]={mode:"quantiles",k:5,minCategoryCount:5};});});
    document.querySelectorAll("[data-remove-lock]").forEach(button=>button.onclick=()=>scopeEdited(issue,session,()=>{session.locks.splice(Number(button.dataset.removeLock),1);}));
    document.querySelectorAll("[data-missing-band]").forEach(input=>input.onchange=()=>scopeEdited(issue,session,()=>{const column=input.dataset.missingBand,stats=cleaningProfile().columns.find(profile=>profile.column===column).statistics;session.banding[column]={mode:input.value,k:5,minCategoryCount:5,width:Math.max((stats.max-stats.min)/5 || 1,Number.EPSILON),edges:[0,5,10,20,50]};}));
    document.querySelectorAll("[data-missing-edges]").forEach(input=>input.onchange=()=>{const column=input.dataset.missingEdges,band=session.banding[column],previous=structuredClone(band);if(band.mode==="fixedWidth")band.width=Number(input.value);else band.edges=input.value.split(",").map(Number);try{grouped(issue,session);scopeEdited(issue,session,()=>{});}catch(error){session.banding[column]=previous;session.bandCache=null;notify(error.message);}});
    document.getElementById("missingShowAll")?.addEventListener("change",event=>{session.showAll=event.target.checked;renderPreservingReviewFocus();});
    document.getElementById("missingColumns")?.addEventListener("click",()=>{session.pickColumns=!session.pickColumns;renderPreservingReviewFocus();});
    document.querySelectorAll("[data-context-column]").forEach(input=>input.onchange=()=>{session.extraColumns=[...document.querySelectorAll("[data-context-column]:checked")].map(input=>input.dataset.contextColumn);renderPreservingReviewFocus();});
    document.querySelectorAll("[data-ui='review.explore.missing.group']").forEach(group=>{const initial=group.open;group.addEventListener("toggle",()=>{if(!group.isConnected)return;const previous=session.openGroups[group.dataset.group]??initial;session.openGroups[group.dataset.group]=group.open;if(previous!==group.open)renderPreservingReviewFocus();});});
    document.querySelectorAll("[data-more-gap],[data-more-present]").forEach(button=>button.onclick=()=>{const gap=button.hasAttribute("data-more-gap"),key=button.dataset.moreGap || button.dataset.morePresent;session.showRows[`${key}:${gap?"missing":"present"}`]=gap?(Number(session.showRows[`${key}:missing`]) || 20)+50:true;renderPreservingReviewFocus();});
    let dragged=null;document.querySelectorAll("[data-lock-chip]").forEach(chip=>{chip.ondragstart=()=>{dragged=Number(chip.dataset.lockChip);};chip.ondragover=event=>event.preventDefault();chip.ondrop=event=>{event.preventDefault();if(dragged===null)return;scopeEdited(issue,session,()=>{const [column]=session.locks.splice(dragged,1);session.locks.splice(Number(chip.dataset.lockChip),0,column);});};});
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
  return {detect,unit:"cells",count,groups,init,lockedRows,isDate,contextColumns,grouped,renderExplore,getFixOptions,reminder,consequence,renderPreview,renderReview,aiContext,aiExplore,aiFix,decisionMetadata,invalidate,bind};
})();
