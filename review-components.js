// LAY-01…08, LAY-30…32: shared content-driven templates; issue modules provide values, never their own page layout.
var ReviewComponents = (() => {
  // UI copy is authored explicitly; never rename dataset fields or user notes through a word-replacement filter.
  const plain=value=>String(value??"");
  const text=value=>escapeHtml(plain(value));
  const attrs=values=>Object.entries(values||{}).map(([key,value])=>` ${key}="${escapeHtml(value)}"`).join("");
  const noun=()=>/healthcare|patient|visit/i.test(state.fileName)?"patients":/marketing|campaign/i.test(state.fileName)?"campaigns":/sales|order/i.test(state.fileName)?"orders":"entries";
  const count=(n,unit=noun())=>`${Number(n).toLocaleString()} ${unit}`;
  const short=value=>plain(value);
  // C1 / LAY-02, LAY-18, LAY-50: one truthful question, decision or outcome.
  function lead(title,sub=""){const line=text(sub).replace(/\$[\d,.]+|\b\d[\d,.]*%?/,value=>`<b>${value}</b>`);return `<div class="rc-lead" data-ui="review.lead"><p>${text(title)}</p>${sub?`<div>${line}</div>`:""}</div>`;}
  // C2: one deterministic takeaway, never a fabricated interpretation or cutoff.
  function headline(value,ui="review.headline"){return value?`<p class="rc-headline" data-ui="${ui}">${text(value)}</p>`:"";}
  // C3 / LAY-13, LAY-14: identical tracks for every selected value, shape, type, group or violation.
  function selection(items,{ui="review.select",total="",ai="",empty="No values need selection."}={}){
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{},visible=session.expandedLists?.[ui]?items:items.slice(0,200);
    const rows=visible.map(item=>{
      const body=`<span class="rc-choice-control">${item.control||""}</span><span class="rc-choice-value">${item.valueHtml??(item.raw===false?text(item.value):`<code>${escapeHtml(item.value)}</code>`)}${item.extra||""}</span><span class="rc-num">${escapeHtml(item.count??"")}</span><span class="rc-num rc-share">${escapeHtml(item.share??"")}</span><span class="rc-choice-meta">${item.meta||""}</span>`;
      const attributes=attrs(Object.fromEntries(Object.entries({...item.attrs,"data-ui":item.ui||ui}).filter(([key])=>key!=="class")));
      if(item.details)return `<details class="rc-choice-group" ${item.open?"open":""}${attributes}><summary class="rc-choice-row">${body}</summary><div class="rc-indent">${item.details}</div></details>`;
      return `<${item.button?"button":"div"} class="rc-choice-row ${item.className||item.attrs?.class||""}"${attributes}>${body}</${item.button?"button":"div"}>`;
    }).join("");
    return `<div class="rc-select-layout" data-ui="review.select"><div><div class="rc-card rc-selection" data-ui="${ui}">${rows||`<p class="rc-empty">${text(empty)}</p>`}</div>${total?`<p class="rc-total">${text(total)}</p>`:""}${items.length>visible.length?`<button class="text-button" data-review-show-all="${ui}">Show all ${items.length} values</button>`:""}</div>${ai?`<aside class="rc-ai">${ai}</aside>`:""}</div>`;
  }
  // C4 / LAY-12: real cells; numeric alignment is shared; raw source text is never rewritten by copy rules.
  function table({columns,rows,ui="review.table",card=true,limit=Infinity,empty="No example rows are available.",rowAttrs}={}){
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{};limit=session.expandedLists?.[ui]?Infinity:Math.min(limit,200);
    const cell=value=>value&&typeof value==="object"&&!Array.isArray(value)?`${value.control||""}${value.raw?`<code>${escapeHtml(value.value)}</code>`:escapeHtml(value.value??"")}`:escapeHtml(value??"");
    return `<div class="rc-table-scroll ${card?"rc-card":""}" data-ui="${ui}" tabindex="0"><table><thead><tr>${columns.map(column=>`<th scope="col" class="${column.numeric?"rc-num":""}">${text(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,limit).map(row=>`<tr${attrs(rowAttrs?.(row))}>${columns.map(column=>{const value=row[column.key];return `<td class="${column.numeric?"rc-num":""} ${value?.problem?"rc-problem":""} ${value?.removed?"rc-removed":""}">${cell(value)}</td>`;}).join("")}</tr>`).join("")||`<tr><td colspan="${columns.length}">${text(empty)}</td></tr>`}</tbody></table>${rows.length>limit?`<div class="rc-more"><button class="text-button" data-review-show-all="${ui}">Show all ${rows.length} rows</button></div>`:""}</div>`;
  }
  function groupedTable(groups,{columns,target,ui="review.table",selectedIds=new Set(),overall=0,limit=6,session,card=true,path=[]}={}){
    return `<div class="${card?"rc-card":""} rc-group-table" data-ui="${ui}">${groups.map((group,index)=>{
      const key=JSON.stringify(path.concat(group.labels||[group.label])),open=session.openGroups[key]??index<3,problem=group.rows.filter(row=>selectedIds.has(row._row)),normal=group.rows.filter(row=>!selectedIds.has(row._row)),max=session.groupLimits?.[key]||limit,shown=open?problem.slice(0,max-2).concat(normal.slice(0,max===limit?2:Math.max(2,max-problem.length))):[],rate=problem.length/Math.max(1,group.rows.length)*100;
      const mapped=shown.map(row=>Object.fromEntries(columns.map(column=>[column.key,column.key==="_row"?row._row:{value:String(row[column.key]??"").trim()?row[column.key]:"—",raw:true,problem:column.key===target&&selectedIds.has(row._row)}])));
      return `<details class="rc-evidence-group" data-ui="review.explore.missing.group" data-group="${escapeHtml(key)}" ${open?"open":""}><summary><span>${text(group.label)} · ${group.rows.length} rows</span><span class="rc-num">${problem.length} missing</span><span class="rc-rate">${rate.toFixed(1)}% <i><b style="width:${rate}%"></b><em style="left:${overall*100}%"></em></i></span></summary>${open?`<div class="rc-indent">${group.children?groupedTable(group.children,{columns,target,ui,selectedIds,overall,limit,session,card:false,path:path.concat(group.labels||[group.label])}):table({columns,rows:mapped,card:false})}${!group.children&&group.rows.length>shown.length?`<div class="rc-more"><button class="text-button" data-group-show="${escapeHtml(key)}">${Math.max(0,problem.length-(max-2))} more missing · ${normal.length} present rows</button></div>`:""}</div>`:""}</details>`;
    }).join("")}</div>`;
  }
  // C5 / LAY-04: control markup is content, but positioning belongs to this toolbar.
  function toolbar(label,controls,ui="review.toolbar"){return `<div class="rc-toolbar" data-ui="${ui}"><span>${text(label)}</span>${controls}</div>`;}
  // C6 / LAY-20: before is neutral; changed/filled is blue; only problems are orange.
  function change({metrics=[],visual="",examples="",text:message="",ui="review.change"}={}){
    return `<div class="rc-card rc-change" data-ui="${ui}">${metrics.length?`<div class="rc-metrics" data-ui="review.review.metrics">${metrics.slice(0,4).map(item=>`<div><span>${text(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`).join("")}</div>`:""}${message?`<p>${text(message)}</p>`:""}${visual}${examples}</div>`;
  }
  function changedLabels(column,before,after){
    const a=new Map(ReviewPageEngine.frequencies(before,column).map(group=>[group.value,group.rows.length])),b=new Map(ReviewPageEngine.frequencies(after,column).map(group=>[group.value,group.rows.length])),keys=[...new Set([...a.keys(),...b.keys()])],changed=keys.filter(key=>(a.get(key)||0)!==(b.get(key)||0)),max=Math.max(1,...changed.flatMap(key=>[a.get(key)||0,b.get(key)||0]));
    return `<div class="rc-legend"><span><i class="before"></i>Before</span><span><i class="after"></i>After</span><span>${text(noun())} per label</span></div>${changed.map(key=>`<div class="rc-label-change"><code>${escapeHtml(key||"(missing)")}</code><span><i class="rc-before-bar" style="width:${(a.get(key)||0)/max*100}%"></i><i class="rc-after-bar" style="width:${(b.get(key)||0)/max*100}%"></i></span><span class="rc-num">${a.get(key)||0} → ${b.get(key)||0}</span></div>`).join("")}<p class="rc-total">${keys.length-changed.length} other labels unchanged</p>`;
  }
  function preferred(issue,options){
    const common={missing:ReviewCore.numericType(issue.column)?"median-by-group":"mode-by-group",outlier:"cap","duplicate-values":"keep-first","duplicate-rows":"keep-most-complete",format:"set-missing","type-mismatch":"set-missing",scale:"custom-factor","category-variants":"case-title",whitespace:"trim",invalid:"cap-to-rule","cross-column":"set-missing",constant:"drop-column","leading-zeros":"to-text","multi-value":"split-to-columns",sensitive:"hash"};
    const keep=options.find(option=>["leave","keep","keep-all","keep-as-text"].includes(option.key)),first=options[0],second=options.find(option=>option.key===common[issue.reviewType]&&option!==first)||options.find(option=>option!==first&&option!==keep);
    return [...new Set([first,second,keep].filter(Boolean))];
  }
  function description(issue,option,session,preview){
    if(option.disabled)return plain(option.disabled);
    if(option.key.startsWith("ai:"))return short(session.aiFixProposal?.reason||"Suggested for your review; no values change until you approve.");
    if(session.fix===option.key&&preview){const effect=ReviewCore.moduleFor(issue).consequence(issue,session,preview,option),figures=(effect.figures||[]).slice(0,2).map(figure=>`${figure.label}: ${figure.before} → ${figure.after}`).join("; ");return short(effect.effect||figures||effect.sentence);}
    const n=ReviewCore.exploreScope(issue).length,key=option.key,unit=noun();
    if(issue.reviewType==="category-variants"&&["case-lower","case-title","case-upper","trim"].includes(key))return "Formats every nonblank label in the column; matching names may merge beyond the selected groups.";
    if(key==="drop-column")return "Removes this column and its values from the working file; review dependent rules before approving.";
    if(issue.reviewType?.startsWith("duplicate")&&key!=="keep-all")return "Keeps the chosen copy in each selected group and removes the others; entry counts and totals change.";
    if(key==="constant")return `${count(n,unit)} will appear as “${session.value||"Unknown"}” in ${issue.column} reports.`;
    if(["keep","keep-all","keep-as-text","leave"].includes(key))return `${count(n,unit)} stay unchanged in your reports.`;
    if(key.includes("drop")||key.startsWith("keep-")&&key!=="keep-first"&&issue.reviewType?.startsWith("duplicate"))return `Changes which ${unit} remain in your reports; review the exact totals before approving.`;
    if(["median","mean","mode","median-by-group","mode-by-group","knn"].includes(key))return `Estimates values for ${count(n,unit)}; averages or label totals will change.`;
    if(key==="set-missing")return `${count(n,unit)} receive a blank value and stay visible for a later missing-value decision.`;
    return `Updates ${count(n,unit)} using this method; only the selected values change.`;
  }
  // C7 / LAY-05, LAY-07, LAY-53: adjacent consequences; three choices plus a selected More choice.
  function options(issue,choices,session,preview,settings=""){
    const initial=preferred(issue,choices),selected=choices.find(option=>option.key===session.fix),visible=[...initial];if(selected&&!visible.includes(selected))visible.push(selected);const more=choices.filter(option=>!visible.includes(option));
    return `<div class="rc-card rc-options" data-ui="review.options">${visible.map(option=>{
      const active=session.fix===option.key,risk=typeof option.risk==="function"?option.risk(session):option.risk,extras=settings+(active&&option.requiresNote&&!settings.includes('id="reviewNote"')?`<label>Why is keeping these values appropriate?<input id="reviewNote" maxlength="2000" value="${escapeHtml(session.note)}"></label>`:"");let params=active&&option.params?option.params(issue,session):"",inline="";
      if(params&&["constant","fixed-cap","custom-factor","pad-zeros"].includes(option.key.replace(/^ai:/,""))){const holder=document.createElement("div");holder.innerHTML=params;const defining=holder.querySelector('input:not([type="checkbox"])');if(defining){inline=`<span class="rc-inline-edit">${defining.outerHTML}</span>`;defining.remove();params=holder.innerHTML;}}
      return `<div class="rc-option ${active?"selected":""}" data-ui="review.fix.option" data-fix-row="${escapeHtml(option.key)}"><input type="radio" name="review-method" id="reviewFix-${escapeHtml(option.key)}" data-fix="${escapeHtml(option.key)}" value="${escapeHtml(option.key)}" ${active?"checked":""}><label for="reviewFix-${escapeHtml(option.key)}">${text(option.label)} ${inline}</label><span class="rc-risk ${ReviewCore.risks[risk]||"neutral"}" data-ui="review.fix.risk">${text(risk)}</span><p class="rc-option-description" data-ui="review.fix.consequence">${text(description(issue,option,session,preview))}${option.disabled?'<button class="text-button" data-option-setup>Choose what is needed →</button>':""}</p>${params?`<div class="rc-option-parameters">${params}</div>`:""}${active&&extras?`<div class="rc-option-parameters">${extras}</div>`:""}</div>`;
    }).join("")}<div class="rc-more">More: ${more.map(option=>`<button class="text-button" data-fix="${escapeHtml(option.key)}">${text(option.label)}</button>`).join(" ")}${ReviewCore.moduleFor(issue).aiFix?'<button class="text-button" id="reviewAskAi">Ask AI for a fix</button>':""}<button class="text-button" id="reviewMetricSettings">Impact metric</button><button class="text-button" id="reviewScopeSettings">Apply to</button></div></div>`;
  }
  // C8 / LAY-06, LAY-54: one counted action, with its own reserved layout space.
  function footer({summary="",links="",label,id="",action=""}={}){return `<footer class="rc-footer" data-ui="review.footer"><div><span>${summary?text(summary):links}</span><button class="primary" id="${id}" data-layout-action="${action}">${text(label)}</button></div></footer>`;}
  function section(title,content,slot){return content?`<section class="rc-section" data-review-section="${slot}">${title?`<h2>${text(title)}</h2>`:""}${content}</section>`:"";}
  function explore(issue,content){
    const n=ReviewCore.exploreScope(issue).length;
    const controls=section(content.controlsTitle||"Define the check",content.controls,"controls");
    const selection=section(content.selectionTitle||"Review the values",content.selection,"selection");
    const evidence=section(content.evidenceTitle||"Inspect the context",content.evidence,"evidence");
    return `${lead(content.lead,content.sub)}${controls}${content.evidenceFirst?evidence+selection:selection+evidence}${footer({summary:`${count(n)} selected${content.grouping?` · ${content.grouping}`:""}`,label:`Choose a fix for ${count(n)}`,id:"reviewChooseFix",action:"fix"})}`;
  }
  function actionLabel(issue,option,preview){const key=option.key.replace(/^ai:/,""),n=preview?.selectedIds.length??ReviewCore.exploreScope(issue).length;
    if(key==="drop-column")return `Remove 1 column`;
    if(key==="constant"&&!ReviewCore.numericType(issue.column))return `Label ${count(n)} “${ReviewCore.data(issue).value||"Unknown"}”`;
    if(["keep","leave","keep-all","keep-as-text","to-text"].includes(key))return `Keep ${count(n)} unchanged`;
    if(key==="drop-rows")return `Remove ${count(n)}`;
    if(key==="split-to-rows")return `Split ${count(n)} into values`;
    if(key==="mask"||key==="hash")return `${key==="mask"?"Mask":"Code"} ${n} values`;
    if(key.includes("cap"))return `Cap ${n} values`;
    if(key==="set-missing")return `Blank ${n} values`;
    if(key.startsWith("keep-")||key==="merge"||key==="rule"||key==="one-by-one")return `Resolve ${n} repeated ${noun()}`;
    if(issue.reviewType==="missing")return `Fill ${n} missing values`;
    if(issue.reviewType==="format"||issue.reviewType==="type-mismatch")return `Convert ${n} values`;
    return `Fix ${n} values`;
  }
  function fix(issue,content){return `${lead(content.lead,content.sub)}${section("Options",content.options,"options")}${section("What changes",content.change,"change")}${footer({links:`<button class="text-button" id="reviewRows">See the ${ReviewCore.exploreScope(issue).length} rows</button><button class="text-button" id="reviewAddNote">Add a note</button>`,label:content.action,id:"reviewApply",action:"apply"})}`;}
  function review(issue,content){return `${lead(content.lead,content.sub)}${section("Numbers",content.change,"numbers")}${section("Examples",content.examples,"examples")}${footer({links:'<button class="text-button" id="reviewNext">Next issue →</button>',label:`Undo ${content.count??0} changes`,id:"reviewUndo",action:"undo"})}`;}
  return {plain,text,attrs,noun,count,short,lead,headline,selection,table,groupedTable,toolbar,change,changedLabels,options,footer,explore,fix,review,actionLabel};
})();
