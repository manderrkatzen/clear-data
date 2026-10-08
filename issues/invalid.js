// INV-D-01…04: name-based bounds need observed support; calendar parsing belongs to Format.
ReviewModules.invalid = (() => {
  function suggested(column,profile,rows) {
    let rule=null;
    if (/age/i.test(column)) rule={min:0,max:120};
    else if (/rating/i.test(column)) rule={min:1,max:profile.statistics.max<=10 && profile.statistics.max>5 ? 10 : 5};
    else if (/pct|percent/i.test(column)) rule={min:0,max:100};
    else if (/quantity|qty|price|amount|cost|revenue|spend|_days$|duration/i.test(column)) rule={min:0,max:""};
    else if (/heart_rate/i.test(column)) rule={min:20,max:250};
    else if (/^bmi$/i.test(column)) rule={min:10,max:80};
    else if (/_bp$|systolic/i.test(column)) rule={min:50,max:260};
    else if (/_date$/i.test(column)) rule={type:"date",min:"1900-01-01",max:new Date().toISOString().slice(0,10)};
    else if (/email/i.test(column)) rule={type:"email",min:"",max:""};
    if (!rule) return null;
    rule.type ||= "number";
    const present=rows.filter(row=>String(row[column]??"").trim()), usable=present.filter(row=>{try{parse(row[column],rule,column,row._row);return true;}catch{return false;}});
    return usable.length && usable.filter(row=>!violates(row[column],rule,column,row._row)).length/usable.length>=.95 ? rule : null;
  }
  function parse(value,rule,column,rowId) { return rule.type==="date" ? ReviewPageEngine.dateValue(value,reviewDateFormats()[JSON.stringify([rowId,column,value])] || columnPolicy(column).dateFormat) : rule.type==="number" ? CleaningEngine.parseNumber(value,columnPolicy(column)) : value; }
  function violates(value,rule,column="",rowId=null) {
    if (!String(value??"").trim() || !rule) return false;
    if (rule.type==="email") return !String(value).includes("@");
    try { const valueParsed=parse(value,rule,column,rowId);return rule.min!=="" && valueParsed<rule.min || rule.max!=="" && valueParsed>rule.max; } catch { return false; }
  }
  function schemaRule(issue,session) { return issue.rule ? {...issue.rule,...(session.range?.type==="number" ? {minimum:session.range.min===""?null:session.range.min,maximum:session.range.max===""?null:session.range.max} : {})} : null; }
  function violations(rows,issue,session) { const declared=schemaRule(issue,session); return rows.filter(row=>declared ? (declared.type!=="date" || (()=>{try{parse(row[issue.column],{type:"date"},issue.column,row._row);return true;}catch{return false;}})()) && schemaProblems(row,declared).length : violates(row[issue.column],session.range || issue.range,issue.column,row._row)); }
  function detect(dataset) {
    const removed=new Set(state.changes.map(change=>change.treatment?.removedRule).filter(Boolean));
    return dataset.headers.flatMap(column=>{
      const profile=dataset.profile.columns.find(profile=>profile.column===column), declared=state.ruleConfig.schema.find(rule=>rule.column===column), override=state.reviewPage?.[`${column}:invalid`]?.range;
      if (removed.has(declared?.id || column)) return [];
      const range=override || (declared && ["number","integer"].includes(declared.type) ? {type:"number",min:declared.minimum??"",max:declared.maximum??""} : suggested(column,profile,dataset.rows));
      if (!range && !declared) return [];
      const finding={column,reviewType:"invalid",type:"Impossible values",label:"Impossible values",recommendation:declared?"schema":"manual",severity:"medium",summary:"These cells violate a supported valid-value rule.",rule:declared || null,ruleId:declared?.id,range,status:"open",suggested:!declared,unit:"values"}, rows=violations(dataset.rows,finding,{range});
      return rows.length ? [{...finding,rows}] : [];
    });
  }
  function init(issue,session) { if (!session.range && issue.range) session.range={...issue.range};session.originalRowIds ||= issue.rows.map(row=>row._row);if(session.locked===null)session.locked=issue.rows.map(row=>String(row._row)); }
  function rows(issue,session) { return violations(state.rows,issue,session); }
  function lockedRows(issue,session) { init(issue,session);const ids=new Set(session.locked.map(Number));return rows(issue,session).filter(row=>ids.has(row._row)); }
  function count(issue) { return rows(issue,ReviewCore.data(issue)).length; }
  function ruleText(issue,session) { const rule=session.range || issue.range;if(!rule)return `${issue.column}: your ${issue.rule.type} schema check`;return rule.type==="email" ? `${issue.column} must contain @` : `${issue.column} must be ${rule.min!==""?`≥ ${rule.min}`:"within"}${rule.max!==""?` and ≤ ${rule.max}`:""}`; }
  function contexts(issue) { return state.headers.filter(column=>column!==issue.column && !CleaningEngine.isIdentifier(column)).slice(0,2); }
  function chart(issue,before,after,range,options={}) { return range?.type==="date" ? ReviewCharts.timeline(issue.column,before,after,range) : ReviewCore.numericType(issue.column) ? ReviewCharts.histogram(issue.column,before,after,{...options,range}) : '<p class="review-empty-copy">This is a text rule; inspect the representations in the row list.</p>'; }
  function renderExplore(issue,session) { // INV-E-01, INV-E-02, INV-E-03, INV-E-04, INV-E-05
    init(issue,session);const invalid=rows(issue,session),context=contexts(issue),rule=session.range,pattern=context.map(column=>{const values=new Set(invalid.map(row=>row[column]));return invalid.length && values.size===1 ? `All ${invalid.length} violating values are in ${column} ${[...values][0]} — review whether this is an expected subgroup.` : "";}).find(Boolean),shown=session.showAllInvalid ? invalid : invalid.slice(0,200);
    return `<section class="invalid-explore" data-ui="review.explore.invalid"><div data-ui="review.explore.invalid.rule"><h2>Rule: ${escapeHtml(ruleText(issue,session))}</h2><span>${issue.suggested?"suggested":"your rule"}</span>${rule && rule.type!=="email" ? `<label>Minimum<input id="invalidMin" type="${rule.type==="date"?"date":"number"}" step="any" value="${rule.min}"></label><label>Maximum<input id="invalidMax" type="${rule.type==="date"?"date":"number"}" step="any" value="${rule.max}"></label>` : ""}<button class="text-button" id="invalidRemoveRule">Remove rule</button></div><p data-ui="review.explore.invalid.count">${invalid.length?`${invalid.length} values break this rule`:"No values break this rule"}</p>${session.rangeError?`<p role="alert">${escapeHtml(session.rangeError)}</p>`:""}<div data-ui="review.explore.invalid.chart">${chart(issue,state.rows,state.rows,rule,{compact:true,title:`${invalid.length} values lie outside the shaded valid range`})}</div>${pattern?`<p data-ui="review.explore.invalid.pattern">${escapeHtml(pattern)}</p>`:""}<div class="review-table-scroll" data-ui="review.explore.invalid.list"><table><thead><tr><th>Lock</th><th>Row</th><th>Value</th>${context.map(column=>`<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${shown.map(row=>`<tr><td><input type="checkbox" data-invalid-row="${row._row}" ${session.locked.includes(String(row._row))?"checked":""}></td><td>${row._row}</td><td>${escapeHtml(row[issue.column])}</td>${context.map(column=>`<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${invalid.length>200&&!session.showAllInvalid?'<button class="text-button" id="invalidShowAll">Show all violating rows</button>':""}<button class="secondary" id="invalidAi">Why might these be here? AI</button>${session.aiRequested?ReviewCore.aiStatus(issue):""}${session.ai?`<p>AI · ${escapeHtml(session.aiProvider)}: ${escapeHtml(session.ai.note)}</p>`:""}</section>`;
  }
  function getFixOptions(issue,session) {
    init(issue,session);const rule=session.range,numeric=ReviewCore.numericType(issue.column),date=rule?.type==="date",valid=ReviewCharts.numeric(state.rows.filter(row=>!rows(issue,session).some(invalid=>invalid._row===row._row)),issue.column),median=CleaningEngine.stats(valid).median;
    const options=[{key:"set-missing",label:"Mark as missing",risk:"Doesn't invent information",compute:()=>({operation:"missing",interpretation:"missing"})},{key:"cap-to-rule",label:"Clamp to the rule",risk:"Estimates values",disabled:!numeric&&!date?"Clamping requires a numerical or date range":!rule || rule.min===""&&rule.max===""?"Set at least one range bound":"",compute:()=>({operation:date?"dateCap":"cap",lower:String(rule?.min??""),upper:String(rule?.max??""),dateFormat:columnPolicy(issue.column).dateFormat})},...(rule?.min===0?[{key:"abs",label:"Remove the minus sign",risk:"Estimates values",compute:()=>({operation:"absolute"})}]:[]),{key:"replace-median",label:"Replace with median",risk:"Estimates values",disabled:!numeric?"A median needs a numerical column":median===null?"No valid reference observations":"",more:true,compute:()=>({operation:"constant",value:String(median)})},{key:"drop-rows",label:"Remove rows",risk:"Removes data",more:true,compute:()=>({operation:"remove"})},{key:"keep",label:"Keep as is (they’re valid)",risk:"Doesn't change values",compute:()=>({operation:"retain",interpretation:"legitimate"})}];
    return options.map(option=>({...option,compute:async()=>({...await option.compute(),validRange:rule,validSchema:schemaRule(issue,session)})}));
  }
  function reminder(issue,session) { return `Fixing: ${lockedRows(issue,session).length} values breaking “${ruleText(issue,session)}”`; }
  function consequence(issue,session,preview,option) { // INV-F-01
    const carrying=ReviewCore.measure(issue),old=CleaningEngine.stats(ReviewCharts.numeric(state.rows,issue.column)),after=CleaningEngine.stats(ReviewCharts.numeric(preview.after,issue.column));
    return {sentence:`These ${carrying.rows.length} rows hold ${ReviewCore.money(carrying.carry,carrying.metric)}; ${option.key==="set-missing"?`${preview.patches.length} records get a missing ${issue.column}`:`${preview.patches.length} reviewed cells change`}.`,figures:ReviewCore.numericType(issue.column)?[{label:`Mean ${issue.column}`,before:ReviewCore.format(old.mean,issue.column),after:ReviewCore.format(after.mean,issue.column)},{label:"Column total",before:ReviewCore.format(ReviewCore.total(state.rows,issue.column),issue.column),after:ReviewCore.format(ReviewCore.total(preview.after,issue.column),issue.column)}]:[],reason:option.key==="keep"?"Retains the observations instead of assuming the rule is always appropriate. You can relax the bounds in Explore.":"The rule identifies the affected cells; the selected treatment decides their meaning."};
  }
  function renderPreview(issue,session,preview) { // INV-F-02
    return ReviewCore.sampleTable(issue,preview.patches,contexts(issue),20);
  }
  function renderReview(issue,decision) { // INV-R-01, INV-R-02, INV-R-03
    const before=decision.reviewImpact.beforeRows,after=decision.reviewImpact.afterRows,range=decision.treatment.validRange || issue.range,definition={...issue,rule:decision.treatment.validSchema || issue.rule},session={range};
    return `${ReviewCore.metricStrip([{label:"Cells changed",value:decision.patches.length},{label:"Rows removed",value:decision.removedRows.length},{label:"Columns added / removed",value:"0 / 0"},{label:"Violations",value:`${violations(before,definition,session).length} → ${violations(after,definition,session).length}`},...(ReviewCore.numericType(issue.column)?[{label:"Mean",value:`${ReviewCore.format(decision.reviewImpact.beforeStats.mean,issue.column)} → ${ReviewCore.format(decision.reviewImpact.afterStats.mean,issue.column)}`}]:[])])}<div data-ui="review.review.chart">${chart(issue,before,after,range,{patches:decision.patches})}</div>${ReviewCore.sampleTable(issue,decision.patches,contexts(issue))}`;
  }
  async function aiExplore(issue,session) { // INV-A-01: bounded context values, not source rows.
    const contextColumns=contexts(issue), selected=lockedRows(issue,session),context={column:issue.column,type:"invalid",role:ReviewCore.numericType(issue.column)?"number":session.range?.type==="date"?"date":"text",headers:state.headers,meaning:`${ruleText(issue,session)}. ${columnPolicy(issue.column).meaning}`.slice(0,300),allowedFixes:getFixOptions(issue,session).filter(option=>!option.disabled).map(option=>option.key),count:state.rows.length,affected:selected.length,values:ReviewPageEngine.frequencies(selected,issue.column).slice(0,20).map(group=>({value:group.value,count:group.rows.length,locked:true})),samples:selected.slice(0,20).map(row=>contextColumns.map(column=>`${column}: ${row[column]}`).join(" · ").slice(0,500)),statistics:{},groups:[]};
    await ReviewCore.requestAi(issue,"explore",context);
  }
  function bind(issue,session) {
    document.querySelectorAll("[data-invalid-row]").forEach(input=>input.onchange=()=>{const before=lockedRows(issue,session).length,id=input.dataset.invalidRow;session.locked=input.checked?session.locked.concat(id):session.locked.filter(value=>value!==id);ReviewCore.lockChanged(issue,before);renderPreservingReviewFocus();});
    [["invalidMin","min"],["invalidMax","max"]].forEach(([id,key])=>document.getElementById(id)?.addEventListener("change",event=>{
      const next={...session.range,[key]:session.range.type==="number"?(event.target.value===""?"":Number(event.target.value)):event.target.value};
      if (next.min!==""&&next.max!==""&&next.min>next.max) {session.rangeError="Minimum must not exceed maximum. Change the bounds and try again.";return renderPreservingReviewFocus();}
      session.rangeError="";session.range=next;issue.range={...next};issue.rangeEdited=true;issue.rows=rows(issue,session);session.locked=issue.rows.map(row=>String(row._row));session.preview=null;renderPreservingReviewFocus();
    }));
    document.getElementById("invalidRemoveRule")?.addEventListener("click",()=>ReviewCore.accept(issue,{removedRule:issue.ruleId||issue.column}));
    document.getElementById("invalidAi")?.addEventListener("click",()=>aiExplore(issue,session));
    document.getElementById("invalidShowAll")?.addEventListener("click",()=>{session.showAllInvalid=true;renderPreservingReviewFocus();});
    if (!rows(issue,session).length && document.getElementById("reviewAccept")) document.getElementById("reviewAccept").onclick=()=>{const ids=new Set(session.originalRowIds);issue.rows=state.rows.filter(row=>ids.has(row._row));ReviewCore.accept(issue);};
  }
  return {detect,init,count,unit:"values",lockedRows,contextColumns:contexts,renderExplore,getFixOptions,reminder,consequence,renderPreview,renderReview,aiExplore,bind};
})();
