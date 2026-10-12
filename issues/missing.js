// Missing's complete contract lives here; shared controls/calculations stay in their existing layers.
ReviewModules.missing = (() => {
  const nullLike = /^(null|n\/?a|none|nan|--?|\?|#n\/a|#div\/0!|#value!|#ref!|#num!|#null!|missing|unknown|not available)$/i;
  const sentinels = new Set([0,-1,-99,-999,99,999,9999,99999]);
  const aiRuleBatchSize=25,aiRuleRowLimit=200;
  const candidateCache=new WeakMap();
  const canonical = value => String(value ?? "").trim() ? String(value) : "";
  const idLike = column => CleaningEngine.isIdentifier(column) || cleaningProfile().columns.find(profile=>profile.column===column)?.role==="identifier";
  const restrictedAiColumn = column => /(?:^|[_\s-])(?:email|phone|mobile|ssn|name|address|card|passport|id|identifier|key|token|secret|password)(?:$|[_\s-])/i.test(String(column).replace(/([a-z0-9])([A-Z])/g,"$1_$2"));
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
       const neighbours=[parsed[index-1],parsed[index+1]].filter(Boolean),other=parsed.filter(entry=>entry.value!==value).map(entry=>entry.value).sort((a,b)=>a-b),percentile=p=>other.length?other[Math.round((other.length-1)*p)]:NaN;
       return neighbours.length>0&&neighbours.every(entry=>parsed[index].count>=3*entry.count)||other.length>0&&(value<percentile(.01)||value>percentile(.99));
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
     const result=candidates({rows:detectorRows(),profile,classifications},issue.column);cache.set(issue.column,{profile,classifications,groups:result});return result;
  }
  function isDate(issue) { return issue.date || cleaningProfile().columns.find(profile=>profile.column===issue.column)?.role==="date"; }
  function groupingColumns(issue) { return state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!state.issues.some(item=>item.column===column&&item.reviewType==="missing")&&!ReviewModules.sensitive?.isSensitiveColumn?.(column)); }
  function init(issue,session) { // MISS-E-03: only genuine blanks begin locked; empty input is not re-defaulted on render.
    if(session.locked===null)session.locked=groups(issue).filter(group=>!group.value).map(group=>group.value);
    if(!session.groupingInitialized){const categorical=groupingColumns(issue).filter(column=>!ReviewCore.numericType(column)&&inferType(column)!=="Date"),preferred=/missing_tokens/i.test(issue.column)?categorical.find(column=>/region/i.test(column)):categorical.find(column=>/channel/i.test(column))||categorical.find(column=>/region|segment|category|group/i.test(column)),fallback=preferred||categorical[0];session.groupingInitialized=true;if(!session.locks.length&&fallback){session.locks=[fallback];session.autoGroupColumn=fallback;session.banding[fallback]={mode:"quantiles",k:5,minCategoryCount:5};}}
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
      if(!session.groupingUserChosen){
        const eligible=new Set(groupingColumns(issue)),strongest=/missing_tokens/i.test(issue.column)?null:(result.results||[]).filter(item=>item.type==="categorical"&&item.effectSize>0&&eligible.has(item.column)).sort((a,b)=>b.effectSize-a.effectSize)[0];
        if(session.autoGroupColumn&&strongest&&session.locks[0]===session.autoGroupColumn&&session.locks[0]!==strongest.column){session.locks=[strongest.column];session.autoGroupColumn=strongest.column;session.banding[strongest.column]={mode:"quantiles",k:5,minCategoryCount:5};session.bandCache=null;}
      }
    } catch { session.compareKey=signature; }
    finally {
      session.comparePending=false;
      if(source===state.original&&state.screen==="issues"&&state.selectedIssue===issue.id){
        if(signature===JSON.stringify([state.datasetRevision,session.locked])){renderPreservingReviewFocus();if(session.tab==="explore"&&!session.assessmentRequested&&groups(issue).some(group=>group.value))setTimeout(()=>aiExplore(issue,session),0);}
        else if(session.tab==="explore")setTimeout(()=>compare(issue,session),0);
      }
    }
  }
  function contextColumns(issue,session) {
    if(Array.isArray(session.chosenContextColumns))return session.chosenContextColumns.filter(column=>state.headers.includes(column)&&column!==issue.column&&!session.locks.includes(column));
    const hasFinding=new Set(state.issues.filter(item=>item.status==="open"&&item.column!==issue.column).map(item=>item.column)),ranked=(session.comparison?.results||[]).filter(result=>result.effectSize>0&&!idLike(result.column)&&!hasFinding.has(result.column)).map(result=>result.column),fallback=state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!hasFinding.has(column)),metric=ReviewCore.measure(issue).metric;
    return [...new Set([...ranked,...fallback,...(metric?[metric]:[])])].filter(column=>column!==issue.column&&!session.locks.includes(column)).slice(0,3).concat(session.extraColumns||[]).filter((column,index,list)=>list.indexOf(column)===index);
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
  function groupFillDescription(issue,session,operation){
    const columns=session.locks;if(!columns.length)return "Choose a grouping column in Explore first.";
    const groups=grouped(issue,session,detectorRows(),columns),fills=groups.map(group=>{const rows=group.rows.filter(row=>observationState(row,issue.column)==="present"),values=rows.flatMap(row=>{try{return [CleaningEngine.parseNumber(row[issue.column],columnPolicy(issue.column))];}catch{return [];}});if(!values.length)return null;return {label:group.label,count:values.length,value:operation==="median"?CleaningEngine.stats(values).median:ReviewPageEngine.frequencies(rows,issue.column)[0]?.value};}).filter(Boolean);
    const notes=fills.slice(0,3).map(group=>`${group.label}: ${ReviewCore.numericType(issue.column)?ReviewCore.format(group.value,issue.column):group.value} from ${group.count} complete entries`);
    return `${operation==="median"?"Uses each group’s median":"Uses each group’s most common value"}${notes.length?` · ${notes.join("; ")}`:""}.`;
  }
  function aiRuleAvailable(issue){const role=cleaningProfile().columns.find(profile=>profile.column===issue.column)?.role;return !ReviewModules.sensitive?.isSensitiveColumn?.(issue.column)&&!restrictedAiColumn(issue.column)&&role!=="identifier"&&["number","integer","date","text","category","boolean"].includes(role);}
  function aiRuleFillOption(issue,session){
    const approved=(session.ruleProposals||[]).filter(proposal=>proposal.status==="approved"&&proposal.value!==null);
    if(!approved.length)return null;
    return {key:"ai-rule-fill",label:"Use approved AI suggestions",risk:ReviewCore.numericType(issue.column)?"Estimates values":"Invents information",more:true,compute:()=>({operation:"rowValues",rowIds:approved.map(proposal=>proposal.rowId),rowMapping:Object.fromEntries(approved.map(proposal=>[proposal.rowId,proposal.value])),aiRuleInstruction:session.ruleInstruction,aiRulePlan:session.rulePlan?.explanation||"",aiRuleProvider:session.ruleProvider||session.aiProvider||"configured provider",aiRuleEvidence:approved.map(proposal=>({rowId:proposal.rowId,columns:[...proposal.columns],values:{...proposal.context},value:proposal.value,reason:proposal.reason}))})};
  }
  function getFixOptions(issue,session) { // MISS-F-01, MISS-F-02, MISS-F-03: type-specific defaults and editable exact parameters.
    const numeric=ReviewCore.numericType(issue.column),date=isDate(issue),dateColumn=session.orderColumn || state.headers.find(column=>column!==issue.column&&inferType(column)==="Date"),groupedLabel=session.locks.join(" + "),groupColumns=state.headers.filter(column=>column!==issue.column&&!idLike(column)),canGroup=session.locks.length>0||groupColumns.length>0;
    const aiRule=aiRuleFillOption(issue,session);
    const constantRisk=current=>current.blankMeansValue?"Doesn't invent information":numeric || date?"Estimates values":/^(unknown|unassigned|not recorded|missing)$/i.test(current.value.trim())?"Doesn't invent information":"Invents information",overallMedian=()=>CleaningEngine.stats(ReviewCharts.numeric(detectorRows().filter(row=>observationState(row,issue.column)==="present"),issue.column)).median;
    const constant={key:"constant",label:numeric?"Fill with value":date?"Fill with date":`Fill “${session.value || "Unknown"}”`,risk:constantRisk,params:()=>`<input id="missingConstant" aria-label="Fill value" type="${numeric?"number":date?"date":"text"}" step="any" value="${escapeHtml(session.value)}"><label class="review-inline-check"><input id="missingBlankMeans" type="checkbox" ${session.blankMeansValue?"checked":""}> Blank means this value</label>`,compute:()=>{if(!session.value.trim())throw new Error("Enter a replacement value, or choose Leave missing.");if(date)CleaningEngine.parseDate(session.value);return {operation:"constant",value:session.value};}};
    const leave={key:"leave",label:"Leave missing",risk:"Doesn't change values",compute:()=>({operation:"leaveMissing",interpretation:"missing"})},drop={key:"drop-rows",label:"Remove these rows",risk:"Removes data",more:true,compute:()=>({operation:"remove"})};
    const ordered=dateColumn || date?[{key:"previous-value",label:"Carry forward",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"previous",orderColumn:dateColumn})},{key:"next-value",label:"Carry back",risk:"Estimates values",more:!date,disabled:dateColumn?"":"A separate date column is needed to order these rows",compute:()=>({operation:"next",orderColumn:dateColumn})}]:[];
    if(date)return [leave,constant,...ordered,drop,...(aiRule?[aiRule]:[])];
    const groupSetup={disabled:"Choose a grouping column in Explore first.",setupLabel:"Choose group in Explore →"};
    const groupingColumn=session.locks[0]||groupColumns[0],groupPicker=`<select id="missingFillGroup" aria-label="Fill group">${groupColumns.map(column=>`<option value="${escapeHtml(column)}" ${groupingColumn===column?"selected":""}>${escapeHtml(column)}</option>`).join("")}</select>`;
    const groupOption=canGroup?{key:numeric?"median-by-group":"mode-by-group",label:`${numeric?"Median":"Most common"} by ${groupedLabel || groupingColumn || "group"}`,labelHtml:`${numeric?"Fill with the median of each":"Most common by"} ${groupPicker}`,description:groupFillDescription(issue,session,numeric?"median":"mode"),risk:numeric?"Estimates values":"Invents information",...(!session.locks.length?groupSetup:{}),compute:()=>numeric?({operation:"groupwise",similar:{columns:session.locks,statistic:"median",minObserved:5,k:7,banding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))}}):({operation:"groupMode",groupColumns:session.locks,groupBanding:Object.fromEntries(session.locks.map(column=>[column,{mode:"quantiles",k:5,minCategoryCount:5,...session.banding[column]}]))})}:null;
    if(!numeric)return [...(groupOption?[groupOption]:[]),constant,leave,{key:"mode",label:"Most common overall",risk:"Invents information",more:true,compute:()=>({operation:"mode"})},drop,...(aiRule?[aiRule]:[])];
    session.medianValue ??= String(overallMedian()??"");
    const medianOption={key:"median",label:"Fill with overall median",labelHtml:`Fill with the overall median <span class="inline-edit"><input id="missingMedianValue" type="number" step="any" value="${escapeHtml(session.medianValue)}" aria-label="Overall median fill value"></span>`,risk:"Estimates values",compute:()=>session.medianValue!==String(overallMedian())?{operation:"constant",value:session.medianValue}:{operation:"median"}};
    return [...(groupOption?[groupOption]:[]),medianOption,constant,leave,{key:"mean",label:"Mean",risk:"Estimates values",more:true,compute:()=>({operation:"mean"})},{key:"knn",label:"Similar rows",risk:"Estimates values",more:true,params:()=>knnParams(issue,session),compute:()=>{knnParams(issue,session);return {operation:"knn",similar:{columns:session.knnColumns,statistic:"median",minObserved:5,k:session.knnK,banding:{}}};}},...ordered,...(dateColumn?[{key:"interpolate",label:"Interpolate",risk:"Estimates values",more:true,compute:()=>({operation:"interpolate",orderColumn:dateColumn})}]:[]),drop,...(aiRule?[aiRule]:[])];
  }
  function reminder(issue,session) { return `Fixing: ${session.locked.map(value=>value || "(blank)").join(" + ")} in ${issue.column} · ${ReviewCore.affected(issue).length} cells${session.locks.length?` · grouped by ${session.locks.join(" + ")}`:""}`; }
  function consequence(issue,session,preview,option) { // MISS-F-04, MISS-F-05, MISS-F-06
    const carrying=ReviewCore.measure(issue,option.key==="ai-rule-fill"?preview.selectedIds:null),label=carrying.metric || "row count",amount=ReviewCore.money(carrying.carry,carrying.metric),numeric=ReviewCore.numericType(issue.column),primaryTarget=carrying.metric===issue.column;
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
      reason=option.key==="ai-rule-fill"?"Only individually approved AI suggestions are included; review the requested context and each proposed value before Apply.":option.key.replace(/^ai:/,"")==="constant"&&session.blankMeansValue?"Uses your confirmed meaning of the blank; it is not a statistical guess.":"Replaces unknown observations with reviewed estimates.";
      if(option.key.replace(/^ai:/,"")==="median-by-group") {
        const fills=preview.fillMetadata?.fills || [];
        detail=grouped(issue,session).flatMap(group=>{const ids=new Set(group.rows.map(row=>row._row)),values=fills.filter(fill=>ids.has(fill.row)).map(fill=>fill.value);return values.length?[`${group.label} ${ReviewCore.format(CleaningEngine.stats(values).median,issue.column)}`]:[];}).slice(0,4).join(" · ");
        const fallback=new Set(fills.filter(fill=>["widened","global"].includes(fill.source)).map(fill=>fill.bandLabel || "overall"));if(fallback.size)detail+=` · ${fallback.size} groups used fallback`;
      }
    } else {
      const values=[...new Set(preview.patches.map(patch=>patch.after))],destination=values.slice(0,2).join(" / ") || session.value,old=state.rows.filter(row=>values.includes(row[issue.column])).length,next=preview.after.filter(row=>values.includes(row[issue.column])).length;
      effect=`${carrying.rows.length} rows will appear as “${destination}” in ${issue.column} reports.`;
      figures.push({label:`${destination} rows`,before:old,after:next},{label:"Attributed rows",before:state.rows.length-preview.beforeMissing,after:preview.after.length-preview.afterMissing});
      reason=option.key==="ai-rule-fill"?"Each value was proposed for its row from the requested context and must be approved before Apply.":session.blankMeansValue?"Uses the source meaning you confirmed.":["mode","mode-by-group"].includes(option.key)||!/^(unknown|unassigned|not recorded|missing)$/i.test(destination)?"Assigns records to a real category or person without knowing that attribution.":"Keeps the lack of information explicit instead of naming a real person or category.";
    }
    // MISS-F-05 expressly requires median + mean + SD + total when target is the primary metric.
    return {sentence,effect,figures,figureLimit:carrying.metric===issue.column?4:3,reason,detail};
  }
  function fillMarks(issue,before,after,rowIds) {
    const source=new Map(before.map(row=>[row._row,row]));return after.filter(row=>rowIds.includes(row._row)).map(row=>({rowId:row._row,column:issue.column,before:source.get(row._row)?.[issue.column] || "",after:row[issue.column]}));
  }
  function aiContext(issue,session,mode="explore",values=groups(issue)) { // MISS-A-01, MISS-A-02, MISS-A-03, CORE-51
    const population=detectorRows(),selected=lockedRows(issue,session),ids=new Set(selected.map(row=>row._row)),present=population.filter(row=>!ids.has(row._row)&&observationState(row,issue.column)==="present"),numeric=ReviewCore.numericType(issue.column),metric=ReviewCore.measure(issue);
    const primaryTarget=metric.metric===issue.column,primaryMetric={column:metric.metric || "",kind:metric.metric?"numeric":"rows",total:primaryTarget?ReviewCharts.numeric(state.rows,issue.column,ids).reduce((sum,value)=>sum+value,0):metric.whole,affectedTotal:primaryTarget?null:metric.carry,affectedSharePercent:primaryTarget?null:metric.share};
    return {column:issue.column,type:"missing",role:numeric?"number":isDate(issue)?"date":"text",headers:state.headers,meaning:columnPolicy(issue.column).meaning,allowedFixes:getFixOptions(issue,session).filter(option=>!option.disabled).map(option=>option.key),count:population.length,affected:ids.size,values:values.slice(0,20).map(group=>({value:group.value,count:group.rows.length,locked:session.locked.includes(group.value)})),samples:present.slice(0,20).map(row=>String(row[issue.column]).slice(0,160)),statistics:numeric?CleaningEngine.stats(ReviewCharts.numeric(present,issue.column)):{},groups:grouped(issue,session,population).slice(0,20).map(group=>({label:group.label,total:group.rows.length,missing:group.rows.filter(row=>ids.has(row._row)).length,statistics:numeric?CleaningEngine.stats(ReviewCharts.numeric(group.rows.filter(row=>!ids.has(row._row)),issue.column)):{}})),...(mode==="fix"?{primaryMetric}:{})};
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
     session.ai=combined;session.missingAssessment=combined;session.assessmentProvider=session.aiProvider;session.aiStatus="ready";
     if(!session.explicitSelection){const blanks=values.filter(group=>!group.value).map(group=>group.value),trusted=values.filter(group=>group.value&&combined.assessments.some(entry=>entry.value===group.value&&entry.confidence>=60)).map(group=>group.value);session.locked=[...new Set([...blanks,...trusted])];}
     renderPreservingReviewFocus();
  }
  async function aiFix(issue,session) {
    const result=await ReviewCore.requestAi(issue,"fix",aiContext(issue,session,"fix",groups(issue).filter(group=>session.locked.includes(group.value))));
    if(result?.operation && getFixOptions(issue,session).some(option=>option.key===result.operation&&!option.disabled)){session.aiFixProposal=result;renderPreservingReviewFocus();}
  }
  // MISS-A-04: discover the minimum safe context first; no row values leave the browser until the analyst confirms the requested fields.
  function availableRuleColumns(issue){const profiles=new Map(cleaningProfile().columns.map(entry=>[entry.column,entry]));return state.headers.filter(column=>column!==issue.column&&!idLike(column)&&profiles.has(column)&&!ReviewModules.sensitive?.isSensitiveColumn?.(column)&&!restrictedAiColumn(column)).map(column=>({column,role:profiles.get(column)?.role||"text"}));}
  function ruleRequestHtml(issue,session){
    if(!session.ruleOpen)return "";
    const instruction=`<label for="reviewRuleInstruction"><span class="tag">AI row suggestions</span><br>Describe how to choose a value<textarea class="input" id="reviewRuleInstruction" style="display:block;width:min(100%, 32rem);text-align:left;font-variant-numeric:normal;resize:vertical;margin-top:8px" maxlength="1000" rows="3" aria-label="Describe how to choose a value" placeholder="If rating is below 0.5, suggest LOW; if it is 0.5 or higher, suggest HIGH.">${escapeHtml(session.ruleInstruction||"")}</textarea></label>`;
    const status=session.ruleError?`<p class="meta" role="status">${ReviewComponents.text(session.ruleError)}</p>`:session.ruleStatus==="planning"?'<p class="meta" role="status">AI is identifying the fields it needs…</p>':session.ruleStatus==="generating"?`<p class="meta" role="status">AI suggestions ${session.ruleProgress?.completed||0} of ${session.ruleProgress?.total||0} batches ready…</p>`:"";
    if(!session.rulePlan)return `<div class="card ai" id="reviewAiRuleRequest" data-ui="review.fix.ai.rule"><p class="meta">No row values are sent while AI identifies the context fields it needs.</p>${instruction}<button class="btn" id="reviewRulePlan" ${session.ruleBusy?'disabled title="Wait for the current AI request to finish."':""}>Identify needed fields</button>${status}</div>`;
    const plan=session.rulePlan;
    if(plan.needsClarification)return `<div class="card ai" id="reviewAiRuleRequest" data-ui="review.fix.ai.rule"><p class="meta">AI · ${ReviewComponents.text(session.ruleProvider||"configured provider")}</p><p>${ReviewComponents.text(plan.explanation)}</p>${instruction}<button class="btn" id="reviewRulePlan" ${session.ruleBusy?'disabled title="Wait for the current AI request to finish."':""}>Clarify instruction</button>${status}</div>`;
    const fields=plan.columns.map(column=>`<label class="chip"><input type="checkbox" data-ai-rule-column="${escapeHtml(column)}" ${session.ruleColumns.includes(column)?"checked":""} ${session.ruleBusy?'disabled title="Wait for the current AI request to finish."':""}>${escapeHtml(column)}</label>`).join(""),proposals=session.ruleProposals||[];
    const usable=proposals.filter(proposal=>proposal.value!==null),accepted=usable.filter(proposal=>proposal.status==="approved").length,pendingApproval=usable.filter(proposal=>proposal.status==="suggested").length;
    const rows=proposals.map(proposal=>{
      const action=(name,label)=>`<button class="btn2" aria-label="${ReviewComponents.text(`${label} suggestion for row ${ReviewComponents.rowLabel(proposal.rowId)}`)}" data-ai-rule-action="${name}" data-ai-rule-row="${proposal.rowId}">${label}</button>`;
      const control=proposal.status==="approved"?`<span class="tag">Approved</span> ${action("undo","Undo")}`:proposal.status==="rejected"?`<span class="meta">Skipped</span> ${action("suggest","Suggest value")}`:proposal.status==="pending"?'<span class="meta">Waiting</span>':proposal.value===null?action("suggest","Suggest value"): `${action("approve","Approve")} ${action("no","No")} ${action("suggest","Suggest value")}`;
      const context=proposal.columns.map(column=>`${ReviewComponents.text(column)}: <code class="mono">${ReviewComponents.text(proposal.context[column]||"(blank)")}</code>`).join(" · "),suggestion=proposal.value===null?"No suggestion":ReviewComponents.text(proposal.value),row=ReviewComponents.text(ReviewComponents.rowLabel(proposal.rowId));
      return {entry:{control:`<div class="meta" style="white-space:normal"><p><b>Row ${row}</b> · ${context}</p><p><b>${ReviewComponents.text(issue.column)}: ${suggestion}</b> · ${ReviewComponents.text(proposal.reason)}</p><div>${control}</div></div>`},rowId:proposal.rowId};
    });
    const rowLimitExceeded=ReviewCore.affected(issue).length>aiRuleRowLimit,generationReason=session.ruleBusy?"Wait for the current AI request to finish.":!session.ruleColumns.length?"Choose at least one context field to continue.":rowLimitExceeded?"Choose 200 or fewer missing cells in Explore.":"";
    return `<div class="card ai" id="reviewAiRuleRequest" data-ui="review.fix.ai.rule"><p class="meta">AI · ${ReviewComponents.text(session.ruleProvider||"configured provider")}</p><p>${ReviewComponents.text(plan.explanation)}</p><p class="meta">AI requested these fields. Choose what to share for the selected missing rows:</p><div>${fields}</div><p class="meta">Only checked fields and selected missing rows are sent. Other row fields stay in your browser.</p>${!session.ruleColumns.length?'<p class="meta">Choose at least one context field to continue.</p>':""}<button class="btn" id="reviewRuleGenerate" ${generationReason?`disabled title="${ReviewComponents.text(generationReason)}"`:""}>Request row suggestions</button>${rowLimitExceeded?`<p class="meta">Choose 200 or fewer missing cells in Explore to use AI suggestions.</p>`:""}${status}${proposals.length?`<p class="meta">Each row is a separate suggestion. Approve or skip rows here; the Apply button still previews and confirms every accepted value.</p>${pendingApproval?`<button class="btn2" id="reviewRuleApproveAll" ${session.ruleBusy?'disabled title="Wait for the current AI request to finish."':""}>Approve all ${pendingApproval} suggestions</button>`:""}${accepted?`<p class="meta">${accepted} row suggestions approved for the preview below.</p>`:""}${ReviewComponents.table({columns:[{key:"entry",label:"AI row suggestions"}],rows,ui:"review.fix.ai.rule.rows",card:false,rowAttrs:row=>({"data-ai-rule-row":row.rowId})})}`:""}</div>`;
  }
  function ruleTargetRole(issue){return cleaningProfile().columns.find(profile=>profile.column===issue.column)?.role||"text";}
  function invalidateRuleSuggestions(session){session.ruleGeneration++;session.ruleBusy=false;session.rulePlan=null;session.ruleColumns=[];session.ruleProposals=[];session.ruleStatus="idle";session.ruleError="";session.ruleProgress=null;delete session.aiRuleApprovedIds;if(session.fix==="ai-rule-fill")session.fix="";}
  async function requestRulePlan(issue,session){
    const instruction=String(session.ruleInstruction||"").trim(),rows=ReviewCore.affected(issue),availableColumns=availableRuleColumns(issue);
    if(!instruction)return notify("Describe how the selected missing values should be filled.");
    if(!rows.length)return notify("Select missing cells in Explore before requesting AI suggestions.");
    if(rows.length>aiRuleRowLimit){session.ruleError="Choose 200 or fewer missing cells in Explore.";renderPreservingReviewFocus();return;}
    if(!availableColumns.length){session.ruleError="No non-sensitive, non-identifier context columns are available for AI.";renderPreservingReviewFocus();return;}
    invalidateRuleSuggestions(session);const generation=++session.ruleGeneration;session.ruleBusy=true;session.ruleStatus="planning";session.ruleError="";session.rulePlan=null;session.ruleProposals=[];session.ruleColumns=[];renderPreservingReviewFocus();
    const result=await ReviewCore.requestAi(issue,"rule-plan",{column:issue.column,role:ruleTargetRole(issue),meaning:columnPolicy(issue.column).meaning||"",headers:[issue.column,...availableColumns.map(entry=>entry.column)],availableColumns},instruction);
    if(generation!==session.ruleGeneration)return;
    session.ruleBusy=false;
    if(!result){session.ruleError=`AI unavailable: ${session.aiReason||"error"}${session.aiLocalOnly?" · Sensitive values stay local":""}`;session.ruleStatus="error";renderPreservingReviewFocus();return;}
    session.rulePlan=result;session.ruleProvider=session.aiProvider||"configured provider";session.ruleColumns=[...result.columns];session.ruleStatus=result.needsClarification?"clarification":"planned";renderPreservingReviewFocus();
  }
  async function requestRuleValues(issue,session,rowIds=null){
    const columns=session.ruleColumns.filter(column=>session.rulePlan?.columns.includes(column)),allRows=ReviewCore.affected(issue),selectedRows=rowIds?allRows.filter(row=>rowIds.includes(row._row)):allRows;
    if(!columns.length)return notify("Choose at least one context field to share with AI.");
    if(!selectedRows.length)return notify("No selected missing cells are available for suggestions.");
    const generation=++session.ruleGeneration;session.ruleBusy=true;session.ruleStatus="generating";session.ruleError="";
    const initial=selectedRows.map(row=>({rowId:row._row,columns,context:Object.fromEntries(columns.map(column=>[column,String(row[column]??"")])),value:null,reason:"",status:"pending"}));
    if(!rowIds){session.ruleProposals=initial;session.ruleProgress={completed:0,total:Math.ceil(selectedRows.length/aiRuleBatchSize)};}else session.ruleProgress={completed:0,total:1};
    renderPreservingReviewFocus();
    for(let offset=0;offset<initial.length;offset+=aiRuleBatchSize){
      const batch=initial.slice(offset,offset+aiRuleBatchSize),safe=batch.filter(proposal=>Object.values(proposal.context).every(value=>value.length<=300&&!ReviewCore.containsSensitiveText(value))),unsafe=batch.filter(proposal=>!safe.includes(proposal));
      unsafe.forEach(proposal=>{proposal.status="unresolved";proposal.reason="A requested context value could not be safely shared with AI.";});
      if(!safe.length){if(!rowIds)session.ruleProgress.completed++;continue;session.ruleError="This row's requested context cannot be safely shared with AI.";session.ruleStatus="error";break;}
      const rows=safe.map((proposal,index)=>({id:`r${index}`,values:proposal.context})),result=await ReviewCore.requestAi(issue,"rule-values",{column:issue.column,role:ruleTargetRole(issue),columns,rows},session.ruleInstruction);
      if(generation!==session.ruleGeneration)return;
      if(!result){session.ruleError=`AI unavailable: ${session.aiReason||"error"}${session.aiLocalOnly?" · Sensitive values stay local":""}`;session.ruleStatus="error";break;}
      session.ruleProvider=session.aiProvider||session.ruleProvider||"configured provider";
      result.suggestions.forEach(suggestion=>{const proposal=safe.find((entry,index)=>`r${index}`===suggestion.id);if(proposal){proposal.value=suggestion.value===null?null:ReviewCore.numericType(issue.column)?CleaningEngine.parseNumber(suggestion.value,columnPolicy(issue.column)).toFixed(ReviewCore.precision(issue.column)):suggestion.value;proposal.reason=suggestion.reason;proposal.status=suggestion.value===null?"unresolved":"suggested";}});
      if(!rowIds)session.ruleProgress.completed++;
      renderPreservingReviewFocus();
    }
    if(generation!==session.ruleGeneration)return;
    if(!rowIds&&session.ruleError)initial.filter(proposal=>proposal.status==="pending").forEach(proposal=>{proposal.status="unresolved";proposal.reason="No suggestion was generated because the AI request could not be completed.";});
    session.ruleBusy=false;if(session.ruleStatus==="generating")session.ruleStatus=session.ruleError?"error":"ready";
    if(rowIds){const replacement=initial[0],existing=session.ruleProposals.findIndex(proposal=>proposal.rowId===replacement.rowId);if(!session.ruleError){if(existing>=0)session.ruleProposals[existing]=replacement;else session.ruleProposals.push(replacement);session.ruleProgress.completed=1;}else if(existing>=0)session.ruleProposals[existing].status=session.ruleProposals[existing].value===null?"unresolved":"suggested";}
    renderPreservingReviewFocus();
  }
  function refreshRuleSelection(issue,session){
    const approved=(session.ruleProposals||[]).filter(proposal=>proposal.status==="approved"&&proposal.value!==null),before=ReviewCore.affected(issue).length;
    session.aiRuleApprovedIds=approved.map(proposal=>proposal.rowId);
    if(approved.length)session.fix="ai-rule-fill";else if(session.fix==="ai-rule-fill"){delete session.aiRuleApprovedIds;session.fix="";}
    ReviewCore.lockChanged(issue,before);if(session.tab==="fix")ReviewCore.compute(issue);else renderPreservingReviewFocus();
  }
  function ruleAction(issue,session,action,rowId){
    const proposal=session.ruleProposals.find(entry=>entry.rowId===Number(rowId));if(!proposal)return;
    if(action==="suggest"){proposal.status="pending";refreshRuleSelection(issue,session);requestRuleValues(issue,session,[proposal.rowId]);return;}
    proposal.status=action==="approve"?"approved":action==="undo"?"suggested":"rejected";refreshRuleSelection(issue,session);
  }
  function approveAllRuleSuggestions(issue,session){session.ruleProposals.forEach(proposal=>{if(proposal.value!==null&&proposal.status==="suggested")proposal.status="approved";});refreshRuleSelection(issue,session);}
  function scopeEdited(issue,session,edit) {
    const before=lockedRows(issue,session).length;invalidateRuleSuggestions(session);edit();ReviewCore.lockChanged(issue,before);session.compareKey="";
    // MISS-D-04: the dependent almost-empty finding updates from locks without changing source values.
    if(lockedRows(issue,session).length/Math.max(1,state.rows.length)>=.95 && !state.issues.some(item=>item.column===issue.column&&item.reviewType==="constant")) {
      const dependent=ReviewModules.constant.detect({headers:[issue.column],rows:state.rows,profile:cleaningProfile()})[0];
      if(dependent)state.issues.push({...dependent,id:Math.max(0,...state.issues.map(item=>item.id))+1});
    }
    renderPreservingReviewFocus();
  }
  function bind(issue,session) {
     document.querySelectorAll('[data-ui="review.explore.missing.value"]').forEach(button=>button.onclick=()=>{session.explicitSelection=true;scopeEdited(issue,session,()=>{const value=button.dataset.value;session.locked=session.locked.includes(value)?session.locked.filter(entry=>entry!==value):session.locked.concat(value);});});
    document.getElementById("missingShowRepresentations")?.addEventListener("click",()=>{session.showRepresentations=true;renderPreservingReviewFocus();});
     document.getElementById("missingAiPicks")?.addEventListener("click",()=>{session.explicitSelection=true;scopeEdited(issue,session,()=>{session.locked=picks(session);});});
    document.getElementById("missingRefreshAi")?.addEventListener("click",()=>{session.assessmentRequested=false;session.missingAssessment=null;session.ai=null;aiExplore(issue,session);});
     document.getElementById("missingDropLink")?.addEventListener("click",()=>ReviewCore.select(state.issues.find(item=>item.column===issue.column&&item.reviewType==="constant").id));
     document.getElementById("reviewRulePlan")?.addEventListener("click",()=>requestRulePlan(issue,session));
     document.getElementById("reviewRuleGenerate")?.addEventListener("click",()=>requestRuleValues(issue,session));
     document.getElementById("reviewRuleApproveAll")?.addEventListener("click",()=>approveAllRuleSuggestions(issue,session));
     document.querySelectorAll("[data-ai-rule-column]").forEach(input=>input.addEventListener("change",()=>{const columns=[...document.querySelectorAll("[data-ai-rule-column]:checked")].map(control=>control.dataset.aiRuleColumn);if(JSON.stringify(columns)===JSON.stringify(session.ruleColumns))return;session.ruleColumns=columns;session.ruleProposals=[];session.ruleStatus="planned";session.ruleError="";delete session.aiRuleApprovedIds;if(session.fix==="ai-rule-fill")session.fix="";session.preview=null;if(session.tab==="fix")ReviewCore.compute(issue);else renderPreservingReviewFocus();}));
     document.querySelectorAll("[data-ai-rule-action]").forEach(button=>button.addEventListener("click",()=>ruleAction(issue,session,button.dataset.aiRuleAction,button.dataset.aiRuleRow)));
    const fillEdited=edit=>{const before=lockedRows(issue,session).length;edit();ReviewCore.lockChanged(issue,before);markProjectDirty();if(session.tab==="fix")ReviewCore.compute(issue);else renderPreservingReviewFocus();};
    document.getElementById("missingAddLock")?.addEventListener("change",event=>{if(event.target.value&&session.locks.length<3)fillEdited(()=>{session.groupingUserChosen=true;session.autoGroupColumn="";session.locks.push(event.target.value);session.banding[event.target.value]={mode:"quantiles",k:5,minCategoryCount:5};});});
    document.getElementById("missingFillGroup")?.addEventListener("change",event=>{const column=event.target.value;if(column&&session.locks[0]!==column)fillEdited(()=>{session.groupingUserChosen=true;session.autoGroupColumn="";session.locks=[column];session.banding[column] ||= {mode:"quantiles",k:5,minCategoryCount:5};});});
    document.querySelectorAll("[data-remove-lock]").forEach(button=>button.onclick=()=>fillEdited(()=>{session.groupingUserChosen=true;session.autoGroupColumn="";session.locks.splice(Number(button.dataset.removeLock),1);}));
    document.querySelectorAll("[data-missing-band]").forEach(input=>input.onchange=()=>fillEdited(()=>{const column=input.dataset.missingBand,stats=cleaningProfile().columns.find(profile=>profile.column===column).statistics;session.banding[column]={mode:input.value,k:5,minCategoryCount:5,width:Math.max((stats.max-stats.min)/5 || 1,Number.EPSILON),edges:[0,5,10,20,50]};}));
    document.querySelectorAll("[data-missing-edges]").forEach(input=>input.onchange=()=>{const column=input.dataset.missingEdges,band=session.banding[column],previous=structuredClone(band);if(band.mode==="fixedWidth")band.width=Number(input.value);else band.edges=input.value.split(",").map(Number);try{grouped(issue,session);fillEdited(()=>{});}catch(error){session.banding[column]=previous;session.bandCache=null;notify(error.message);}});
     document.getElementById("missingColumns")?.addEventListener("click",()=>{const panel=document.createElement("dialog"),current=new Set(contextColumns(issue,session));panel.innerHTML=`<header><h2>Context columns</h2><button class="btn2" id="reviewCloseRows">Close</button></header>${state.headers.filter(column=>column!==issue.column&&!session.locks.includes(column)).map(column=>`<label><input type="checkbox" data-add-context="${escapeHtml(column)}" ${current.has(column)?"checked":""}>${escapeHtml(column)}</label>`).join("")}`;ReviewCore.openRowsPanel(panel,"missingColumns");panel.querySelectorAll("[data-add-context]").forEach(input=>input.onchange=()=>{session.chosenContextColumns=[...panel.querySelectorAll("[data-add-context]:checked")].map(input=>input.dataset.addContext);markProjectDirty();renderPreservingReviewFocus();});});
    document.getElementById("missingShowAll")?.addEventListener("change",event=>{session.showAll=event.target.checked;renderPreservingReviewFocus();});
     document.querySelectorAll(".grp[data-group]>.ghead").forEach(header=>{const toggle=()=>{const group=header.parentElement,key=group.dataset.group;session.openGroups[key]=!group.classList.contains("open");renderPreservingReviewFocus();};header.onclick=toggle;header.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();toggle();}};});
    document.querySelectorAll("[data-group-show]").forEach(button=>button.onclick=()=>{session.groupLimits||={};session.groupLimits[button.dataset.groupShow]=(session.groupLimits[button.dataset.groupShow]||6)+50;renderPreservingReviewFocus();});
    let dragged=null;document.querySelectorAll("[data-lock-chip]").forEach(chip=>{chip.ondragstart=()=>{dragged=Number(chip.dataset.lockChip);};chip.ondragover=event=>event.preventDefault();chip.ondrop=event=>{event.preventDefault();if(dragged===null)return;fillEdited(()=>{const [column]=session.locks.splice(dragged,1);session.locks.splice(Number(chip.dataset.lockChip),0,column);});};});
    document.getElementById("missingConstant")?.addEventListener("change",event=>{session.value=event.target.value;ReviewCore.compute(issue);});
    document.getElementById("missingMedianValue")?.addEventListener("input",event=>{session.medianValue=event.target.value;});
    document.getElementById("missingMedianValue")?.addEventListener("change",()=>ReviewCore.compute(issue));
    document.getElementById("missingBlankMeans")?.addEventListener("change",event=>{session.blankMeansValue=event.target.checked;ReviewCore.compute(issue);});
    document.getElementById("missingKnnK")?.addEventListener("change",event=>{session.knnK=Number(event.target.value);ReviewCore.compute(issue);});
    document.querySelectorAll("[data-knn-column]").forEach(input=>input.onchange=()=>{session.knnColumns=[...document.querySelectorAll("[data-knn-column]:checked")].map(input=>input.dataset.knnColumn);ReviewCore.compute(issue);});
     ["missingPreviewGroups","missingReviewGroups"].forEach(id=>document.getElementById(id)?.addEventListener("change",event=>{session.byGroup=event.target.checked;renderPreservingReviewFocus();}));
     if(session.tab==="explore") {
       if(session.compareKey===JSON.stringify([state.datasetRevision,session.locked])&&!session.comparePending){if(!session.assessmentRequested&&groups(issue).some(group=>group.value))setTimeout(()=>{if(state.selectedIssue===issue.id&&session.tab==="explore")aiExplore(issue,session);},0);}
       else if(!session.comparePending)setTimeout(()=>compare(issue,session),0);
     }
  }
  function decisionMetadata(issue,session) {const aiRule=session.fix==="ai-rule-fill"||(session.aiRuleApprovedIds||[]).length>0;return {chartGroups:grouped(issue,session).map(group=>({label:group.label,rowIds:group.rows.map(row=>row._row)})),...(aiRule?{aiRuleColumns:[...session.ruleColumns],aiRuleInstruction:session.ruleInstruction,aiRulePlan:session.rulePlan?.explanation||"",aiRuleProvider:session.ruleProvider||session.aiProvider||"configured provider"}:{})};}
  function invalidate(session) {session.missingAssessment=null;invalidateRuleSuggestions(session);if(session.assessmentRequested){session.aiMode="explore";session.aiStatus="error";session.aiReason="error";session.aiStale=true;}}
  function groupControls(issue,session){ // MISS-E-11, MISS-E-12, MISS-E-22 / C5
     return session.locks.map((column,index)=>`<span class="chip" draggable="true" data-lock-chip="${index}">${escapeHtml(column)}${session.autoGroupColumn===column&&!session.groupingUserChosen?'<span class="hint">strongest pattern</span>':""}${ReviewCore.numericType(column)?`<select data-missing-band="${escapeHtml(column)}" data-ui="review.explore.missing.bands" aria-label="Groups for ${escapeHtml(column)}"><option value="quantiles" ${(session.banding[column]?.mode||"quantiles")==="quantiles"?"selected":""}>5 quantiles</option><option value="fixedWidth" ${session.banding[column]?.mode==="fixedWidth"?"selected":""}>Fixed width</option><option value="custom" ${session.banding[column]?.mode==="custom"?"selected":""}>Custom edges</option></select>${["fixedWidth","custom"].includes(session.banding[column]?.mode)?`<input data-missing-edges="${escapeHtml(column)}" aria-label="Width or edges" value="${escapeHtml(session.banding[column].width||session.banding[column].edges?.join(", ")||"")}">`:""}`:""}<button class="link" data-remove-lock="${index}" aria-label="Remove ${escapeHtml(column)}">×</button></span>`).join("")+(session.locks.length<3?`<select id="missingAddLock" aria-label="Add group column"><option value="">+ add column</option>${state.headers.filter(column=>column!==issue.column&&!idLike(column)&&!session.locks.includes(column)).map(column=>`<option>${escapeHtml(column)}</option>`).join("")}</select>`:"")+`<label><input type="checkbox" id="missingShowAll" ${session.showAll?"checked":""}>Show groups with no gaps</label><button class="link" id="missingColumns">+ columns</button>`;
  }
  function exploreContent(issue,session){ // MISS-E-01…22 / LAY-01, LAY-03: shared selection and grouped table slots.
     init(issue,session);const c=ReviewComponents,list=groups(issue),population=detectorRows(),selected=lockedRows(issue,session),ids=new Set(selected.map(row=>row._row)),onlyBlank=list.length===1&&!list[0].value;
     if(!ReviewCore.numericType(issue.column)&&!isDate(issue)){const order=["","NULL","N/A","#N/A","-","Unknown"];list.sort((a,b)=>{const ai=order.findIndex(value=>value.toLowerCase()===a.value.trim().toLowerCase()),bi=order.findIndex(value=>value.toLowerCase()===b.value.trim().toLowerCase());return (ai<0?order.length:ai)-(bi<0?order.length:bi)||b.rows.length-a.rows.length;});}
    const report=session.missingAssessment||(session.aiMode==="explore"?session.ai:null),ready=session.aiStatus==="ready"||Boolean(session.missingAssessment);
    const items=list.slice(0,session.showRepresentations?list.length:200).map(group=>({value:group.value||"(blank)",count:group.rows.length,share:`${(group.rows.length/population.length*100).toFixed(1)}%`,button:true,ui:"review.explore.missing.value",attrs:{"data-value":group.value,"aria-pressed":session.locked.includes(group.value)},control:'<span class="rc-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>',meta:!group.value?"always missing":ready&&report?.assessments?.find(entry=>entry.value===group.value)?`<span data-ui="review.explore.missing.confidence">AI ${Math.round(report.assessments.find(entry=>entry.value===group.value).confidence)}%</span>`:session.aiStatus==="pending"?"AI …":"review the meaning"}));
     const ai=onlyBlank?`<p data-ui="review.explore.missing.only-blanks">Only blank cells found (${list[0].rows.length}, ${(list[0].rows.length/population.length*100).toFixed(1)}%), treated as missing. Nothing for AI to judge.</p>`:`${ReviewCore.aiStatus(issue)}${ready&&report?`<p>AI · ${escapeHtml(session.assessmentProvider||session.aiProvider||"configured provider")}: ${c.text(report.note)}</p><button class="link text-button" id="missingAiPicks">Select AI picks</button>`:""}<button class="link text-button" id="missingRefreshAi">Refresh AI</button>`;
    const total=`${selected.length} cells selected (${(selected.length/Math.max(1,population.length)*100).toFixed(1)}% of rows)`;
    const columns=[{key:"_row",label:"Row",numeric:true},...new Set([issue.column,...session.locks,...contextColumns(issue,session)])].map(item=>typeof item==="string"?{key:item,label:item,numeric:ReviewCore.numericType(item)}:item);
    const rate=rows=>rows.filter(row=>ids.has(row._row)).length/Math.max(1,rows.length),sort=items=>items.filter(group=>session.showAll||rate(group.rows)>0).sort((a,b)=>rate(b.rows)-rate(a.rows));
    const outer=sort(grouped(issue,session,population,session.locks.slice(0,1))).map(group=>({...group,...(session.locks.length>1?{children:sort(grouped(issue,session,group.rows,session.locks.slice(1)))}:{})}));
    const highest=outer[0],overall=selected.length/Math.max(1,population.length),even=outer.every(group=>Math.abs(rate(group.rows)-overall)<=.03);
    const takeaway=session.locks.length?(even?`Gaps are spread evenly across ${session.locks[0]}; no single group explains them.`:`Gaps are most common in ${highest?.label||"the selected groups"} (${((highest?rate(highest.rows):0)*100).toFixed(1)}% vs ${(overall*100).toFixed(1)}% overall), so inspect that group's entries.`):"Compare missing values with complete entries; add a group to inspect where the gaps concentrate.";
    const flat=population.filter(row=>ids.has(row._row)).slice(0,4).concat(population.filter(row=>!ids.has(row._row)).slice(0,2)).map(row=>Object.fromEntries(columns.map(column=>[column.key,column.key==="_row"?row._row:{value:canonical(row[column.key])?row[column.key]:"—",raw:true,problem:column.key===issue.column&&ids.has(row._row)}])));
    const evidence=c.toolbar("Group rows by",groupControls(issue,session),"review.explore.missing.locks")+c.headline(takeaway,"review.explore.missing.headline")+(session.locks.length?c.groupedTable(outer,{columns,target:issue.column,selectedIds:ids,overall,session,ui:"review.explore.missing.sheet"}):c.table({columns,rows:flat,ui:"review.explore.missing.sheet"}));
    return {lead:`Which values in ${issue.column} mean something was not recorded?`,sub:`Select the values to include in the next fix for ${c.count(selected.length)}.`,selection:c.selection(items,{ui:"review.explore.missing.values",total,ai})+(list.length>200&&!session.showRepresentations?'<button class="text-button" id="missingShowRepresentations">Show all values</button>':"")+(selected.length/Math.max(1,population.length)>=.95?'<button class="text-button" id="missingDropLink">This column is almost empty: consider removing it →</button>':""),evidence,evidenceTitle:"Where are the gaps?",grouping:session.locks.join(" · ")};
  }
  function fixContent(issue,session,preview,option){ // MISS-F-07 / C6: one changed-only view.
    const key=option.key.replace(/^ai:/,"");if(["leave","drop-rows"].includes(key))return {text:key==="leave"?"No values change.":`${preview.removedRows.length} entries are removed; no values are filled.`};
    if(key==="ai-rule-fill"){
      const evidence=new Map((session.ruleProposals||[]).filter(entry=>entry.status==="approved").map(entry=>[entry.rowId,entry])),rows=preview.patches.filter(patch=>patch.column===issue.column).map(patch=>{const entry=evidence.get(patch.rowId);return {row:patch.rowId,context:{value:entry?entry.columns.map(column=>`${column}: ${entry.context[column]||"(blank)"}`).join(" · "):"Reviewed context",raw:true},value:{value:patch.after,raw:true},reason:entry?.reason||"Reviewed AI suggestion"};});
      const copies=duplicateCopyRowIds(state.headers,state.rows),before=detectorRows(),after=preview.after.filter(row=>!copies.has(row._row));
      return {text:`${rows.length} individually approved AI suggestions from ${ReviewComponents.text(session.ruleProvider||"the configured AI provider")}. Each suggestion used only the context fields you confirmed.`,visual:ReviewCore.numericType(issue.column)?ReviewCharts.histogram(issue.column,before,after,{missingBefore:new Set(preview.beforeExcludedIds),missingAfter:new Set(preview.afterExcludedIds),patches:preview.patches,snapshot:true,compact:true}):ReviewComponents.changedLabels(issue.column,before,after),examples:ReviewComponents.table({columns:[{key:"row",label:"Row",numeric:true},{key:"context",label:"Reviewed context"},{key:"value",label:issue.column},{key:"reason",label:"AI explanation"}],rows,ui:"review.fix.ai.rule.preview",card:false,limit:50})};
    }
    if(["median-by-group","mode-by-group"].includes(key)){
      const provenance=new Map((preview.provenance||[]).map(entry=>[entry.rowId,entry])),groups=new Map();
      for(const patch of preview.patches){const group=provenance.get(patch.rowId)?.groupLabel||"Overall fallback";if(!groups.has(group))groups.set(group,[]);groups.get(group).push(patch);}
      const rows=[...groups].map(([label,patches])=>({group:label,rows:patches.length,fill:ReviewCore.numericType(issue.column)?CleaningEngine.stats(patches.flatMap(patch=>{try{return [CleaningEngine.parseNumber(patch.after,columnPolicy(issue.column))];}catch{return [];}})).median:ReviewPageEngine.frequencies(patches.map(patch=>({[issue.column]:patch.after})),issue.column)[0]?.value||"No donor value"}));
      const columns=[{key:"group",label:"Fill group"},{key:"rows",label:"Missing cells",numeric:true},{key:"fill",label:key==="median-by-group"?"Median fill":"Most common value"}];
      const examples=ReviewComponents.table({columns,rows:rows.map(row=>({...row,fill:ReviewCore.numericType(issue.column)?ReviewCore.format(row.fill,issue.column):row.fill})),ui:"review.fix.missing.groups",card:false});
      const copies=duplicateCopyRowIds(state.headers,state.rows),before=detectorRows(),after=preview.after.filter(row=>!copies.has(row._row));return {visual:ReviewCharts.histogram(issue.column,before,after,{missingBefore:new Set(preview.beforeExcludedIds),missingAfter:new Set(preview.afterExcludedIds),patches:preview.patches,snapshot:true,compact:true}),examples,text:`${preview.patches.length} selected gaps receive the reviewed ${key==="median-by-group"?"median":"most common value"} for their group.`};
    }
    const copies=duplicateCopyRowIds(state.headers,state.rows),before=detectorRows(),after=preview.after.filter(row=>!copies.has(row._row));return {visual:ReviewCore.numericType(issue.column)?ReviewCharts.histogram(issue.column,before,after,{missingBefore:new Set(preview.beforeExcludedIds),missingAfter:new Set(preview.afterExcludedIds),patches:preview.patches,snapshot:true,compact:true}):ReviewComponents.changedLabels(issue.column,before,after)};
  }
  function reviewContent(issue,decision){ // MISS-R-01…04 / T3 slots, using approved snapshots only.
    const impact=decision.reviewImpact,copies=duplicateCopyRowIds(state.headers,impact.beforeRows),beforeRows=impact.beforeRows.filter(row=>!copies.has(row._row)),afterRows=impact.afterRows.filter(row=>!copies.has(row._row)),numeric=["number","integer"].includes(decision.reviewSpec?.targetRole),filled=["leaveMissing","remove","retain"].includes(decision.treatment.operation)?0:decision.patches.length;
    const columns=[{key:"row",label:"Row",numeric:true},{key:"before",label:"Before"},{key:"after",label:"After"},...(decision.reviewSpec?.aiRuleColumns||decision.reviewSpec?.locks||[]).slice(0,3).map(column=>({key:column,label:column}))],byId=new Map(impact.afterRows.map(row=>[row._row,row]));
    const examples=decision.patches.filter(patch=>patch.column===issue.column).slice(0,5).map(patch=>({row:patch.rowId,before:{value:patch.before||"(blank)",raw:true},after:{value:patch.after||"(blank)",raw:true},...Object.fromEntries(columns.slice(3).map(column=>[column.key,afterRows.find(row=>row._row===patch.rowId)?.[column.key]||"Not recorded"]))}));
    return {lead:filled?`${filled} ${ReviewComponents.noun()} now have a reviewed value in ${issue.column}.`:`${decision.rows.length} ${ReviewComponents.noun()} reviewed without filling values.`,sub:`${decision.reviewSpec?.label||decision.title} · ${new Date(decision.createdAt).toLocaleTimeString()} · ${decision.reviewSpec?.aiRuleProvider?`AI · ${decision.reviewSpec.aiRuleProvider} · `:""}${decision.reviewSpec?.aiRulePlan?`Rule: ${decision.reviewSpec.aiRulePlan} · `:""}${decision.note||"No note"}`,count:decision.rows.length,change:{metrics:[{label:"Values filled",value:filled},{label:"Missing",value:`${impact.beforeMissing} → ${impact.afterMissing}`},...(numeric?[{label:"Median",value:`${ReviewCore.format(impact.beforeStats.median,issue.column)} → ${ReviewCore.format(impact.afterStats.median,issue.column)}`},{label:"Mean",value:`${ReviewCore.format(impact.beforeStats.mean,issue.column)} → ${ReviewCore.format(impact.afterStats.mean,issue.column)}`}]:[{label:"Rows removed",value:decision.removedRows.length}])],visual:filled?(numeric?ReviewCharts.histogram(issue.column,beforeRows,afterRows,{missingBefore:new Set(impact.beforeExcludedIds),missingAfter:new Set(impact.afterExcludedIds),patches:decision.patches,snapshot:true,policy:decision.reviewSpec.targetPolicy}):ReviewComponents.changedLabels(issue.column,beforeRows,afterRows)):"",text:filled?"":"No cell values were filled."},examples:ReviewComponents.table({columns,rows:examples,ui:"review.review.sample",empty:"No example values change for this decision."})};
  }
  return {detect,unit:"cells",count,queueCount,queueCountLabel,countLabel,remainingCandidates,groups,init,lockedRows,isDate,contextColumns,grouped,exploreContent,fixContent,reviewContent,renderExplore:(issue,session)=>ReviewComponents.explore(issue,exploreContent(issue,session)),getFixOptions,reminder,consequence,aiContext,aiExplore,aiFix,aiRuleAvailable,aiRuleRequestHtml:ruleRequestHtml,invalidate,bind};
})();
