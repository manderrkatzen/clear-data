// LAY-01…08, LAY-30…32: shared content-driven templates; issue modules provide values, never their own page layout.
var ReviewComponents = (() => {
  // UI copy is authored explicitly; never rename dataset fields or user notes through a word-replacement filter.
  const plain=value=>String(value??"");
  const text=value=>escapeHtml(plain(value));
  const attrs=values=>Object.entries(values||{}).map(([key,value])=>` ${key}="${escapeHtml(value)}"`).join("");
  const noun=()=>/healthcare|patient|visit/i.test(state.fileName)?"patients":/marketing|campaign/i.test(state.fileName)?"campaigns":/sales|order/i.test(state.fileName)?"orders":"entries";
  const count=(n,unit=noun())=>{const amount=Number(n),singular=unit.endsWith("ies")?`${unit.slice(0,-3)}y`:unit.endsWith("s")?unit.slice(0,-1):unit;return `${amount.toLocaleString()} ${amount===1?singular:unit}`;};
  const short=value=>plain(value);
  // C1 / LAY-02, LAY-18, LAY-50: one truthful question, decision or outcome.
  function lead(title,sub=""){return `<p class="lead" data-ui="review.lead">${text(title)}</p>${sub?`<p class="lead-sub" data-ui="review.lead.sub">${sub}</p>`:""}`;}
  // C2: one deterministic takeaway, never a fabricated interpretation or cutoff.
  function headline(value,ui="review.headline"){return value?`<div class="headline" data-ui="${ui}">${text(value)}</div>`:"";}
  // C3 / LAY-13, LAY-14: identical tracks for every selected value, shape, type, group or violation.
  function selection(items,{ui="review.select",total="",ai="",empty="No values need selection."}={}){
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{},visible=session.expandedLists?.[ui]?items:items.slice(0,200);
    const rows=visible.map(item=>{
      const selected=item.attrs?.["aria-pressed"]===true||String(item.attrs?.["aria-pressed"])==="true"||item.control?.includes("checked"),control=item.control?.includes("<input")?item.control:`<span class="chk${selected?" on":""}" aria-hidden="true"></span>`,value=item.valueHtml??(item.raw===false?text(item.value):`<span class="mono">${escapeHtml(item.value)}</span>`),body=`<span class="control">${control}</span><span class="mono">${value}${item.extra||""}</span><span class="r num">${escapeHtml(item.count??"")}</span><span class="r num">${escapeHtml(item.share??"")}</span><span class="m">${item.meta||""}</span>`;
      const attributes=attrs(Object.fromEntries(Object.entries({...item.attrs,"data-ui":item.ui||ui}).filter(([key])=>key!=="class")));
      if(item.details)return `<details class="grp${item.open?" open":""}" ${item.open?"open":""}${attributes}><summary class="ghead">${body}</summary><div class="body-rows">${item.details}</div></details>`;
      return `<div class="vrow ${item.className||item.attrs?.class||""}" role="${item.button?"button":"row"}" tabindex="${item.button?"0":"-1"}"${attributes}>${body}</div>`;
    }).join("");
    return `<div class="vals${ai?"":" solo"}" data-ui="review.select"><div><div class="card" data-ui="${ui}">${rows||`<p class="meta">${text(empty)}</p>`}</div>${total?`<div class="total" data-ui="review.select.total">${text(total)}</div>`:""}${items.length>visible.length?`<button class="link" data-review-show-all="${ui}">Show all ${items.length} values</button>`:""}</div>${ai?`<aside class="card ai">${ai}</aside>`:""}</div>`;
  }
  // C4 / LAY-12: real cells; numeric alignment is shared; raw source text is never rewritten by copy rules.
  function table({columns,rows,ui="review.table",card=true,limit=Infinity,empty="No example rows are available.",rowAttrs}={}){
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{};limit=session.expandedLists?.[ui]?Infinity:Math.min(limit,200);
    const cell=value=>value&&typeof value==="object"&&!Array.isArray(value)?`${value.control||""}${value.raw?`<code>${escapeHtml(value.value)}</code>`:escapeHtml(value.value??"")}`:escapeHtml(value??"");
    return `<div class="${card?"card":""} scroll-x" data-ui="${ui}" tabindex="0"><table><thead><tr>${columns.map(column=>`<th scope="col" class="${column.numeric?"r":""}">${text(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,limit).map(row=>`<tr${attrs(rowAttrs?.(row))}>${columns.map(column=>{const value=row[column.key];return `<td class="${column.numeric?"r num":""} ${value?.problem?"gap":""} ${value?.removed?"old":""}">${cell(value)}</td>`;}).join("")}</tr>`).join("")||`<tr><td colspan="${columns.length}">${text(empty)}</td></tr>`}</tbody></table>${rows.length>limit?`<div class="more"><button class="link" data-review-show-all="${ui}">Show all ${rows.length} rows</button></div>`:""}</div>`;
  }
  function groupedTable(groups,{columns,target,ui="review.table",selectedIds=new Set(),overall=0,limit=6,session,card=true,path=[]}={}){
    return `<div class="${card?"card":""}" data-ui="${ui}">${groups.map((group,index)=>{
      const key=JSON.stringify(path.concat(group.labels||[group.label])),open=session.openGroups[key]??index<3,problem=group.rows.filter(row=>selectedIds.has(row._row)),normal=group.rows.filter(row=>!selectedIds.has(row._row)),max=session.groupLimits?.[key]||limit,shown=open?problem.slice(0,max-2).concat(normal.slice(0,max===limit?2:Math.max(2,max-problem.length))):[],rate=problem.length/Math.max(1,group.rows.length)*100;
      const mapped=shown.map(row=>Object.fromEntries(columns.map(column=>[column.key,column.key==="_row"?row._row:{value:String(row[column.key]??"").trim()?row[column.key]:"—",raw:true,problem:column.key===target&&selectedIds.has(row._row)}])));
      return `<div class="grp${open?" open":""}" data-ui="review.explore.missing.group" data-group="${escapeHtml(key)}"><div class="ghead" role="button" tabindex="0"><span>▸</span><span class="t">${text(group.label)} <span>· ${group.rows.length} rows</span></span><span class="n num">${problem.length} missing</span><span class="rate num">${rate.toFixed(1)}% <i><b style="width:${rate}%"></b><u style="left:${overall*100}%"></u></i></span></div>${open?`<div class="body-rows">${group.children?groupedTable(group.children,{columns,target,ui,selectedIds,overall,limit,session,card:false,path:path.concat(group.labels||[group.label])}):table({columns,rows:mapped,card:false})}${!group.children&&group.rows.length>shown.length?`<div class="more"><button class="link" data-group-show="${escapeHtml(key)}">${Math.max(0,problem.length-(max-2))} more missing · ${normal.length} present rows</button></div>`:""}</div>`:""}</div>`;
    }).join("")}</div>`;
  }
  // C5 / LAY-04: control markup is content, but positioning belongs to this toolbar.
  function toolbar(label,controls,ui="review.toolbar"){return `<div class="toolbar" data-ui="${ui}">${text(label)} ${controls}</div>`;}
  // C6 / LAY-20: before is neutral; changed/filled is blue; only problems are orange.
  function change({metrics=[],visual="",examples="",text:message="",ui="review.change"}={}){
    return `<div class="card change" data-ui="${ui}">${metrics.length?`<div class="metrics" data-ui="review.review.metrics">${metrics.slice(0,4).map(item=>`<div><div class="l">${text(item.label)}</div><div class="v">${escapeHtml(item.value)}</div></div>`).join("")}</div>`:""}${message?`<p class="meta">${text(message)}</p>`:""}${visual}${examples}</div>`;
  }
  function changedLabels(column,before,after){
    const a=new Map(ReviewPageEngine.frequencies(before,column).map(group=>[group.value,group.rows.length])),b=new Map(ReviewPageEngine.frequencies(after,column).map(group=>[group.value,group.rows.length])),keys=[...new Set([...a.keys(),...b.keys()])],changed=keys.filter(key=>(a.get(key)||0)!==(b.get(key)||0)),max=Math.max(1,...changed.flatMap(key=>[a.get(key)||0,b.get(key)||0]));
    return `<div class="rc-legend"><span><i class="before"></i>Before</span><span><i class="after"></i>After</span><span>${text(noun())} per label</span></div>${changed.map(key=>`<div class="rc-label-change"><code>${escapeHtml(key||"(missing)")}</code><span><i class="rc-before-bar" style="width:${(a.get(key)||0)/max*100}%"></i><i class="rc-after-bar" style="width:${(b.get(key)||0)/max*100}%"></i></span><span class="rc-num">${a.get(key)||0} → ${b.get(key)||0}</span></div>`).join("")}<p class="rc-total">${keys.length-changed.length} other labels unchanged</p>`;
  }
  function preferred(issue,options){
    const common={missing:ReviewCore.numericType(issue.column)?"median-by-group":"mode-by-group",outlier:options.some(option=>option.key==="ai-typos")?"ai-typos":"cap","duplicate-values":"keep-first","duplicate-rows":"keep-most-complete",format:"set-missing","type-mismatch":"set-missing",scale:"custom-factor","category-variants":"case-title",whitespace:"trim",invalid:"cap-to-rule","cross-column":"set-missing",constant:"drop-column","leading-zeros":"to-text","multi-value":"split-to-columns",sensitive:"hash"};
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
    if(key==="new-ids")return `Assigns a new unique identifier to repeated ${unit}, keeping every row and its measured values.`;
    if(issue.reviewType?.startsWith("duplicate")&&key!=="keep-all")return "Keeps the chosen copy in each selected group and removes the others; entry counts and totals change.";
    if(key==="constant")return `${count(n,unit)} will appear as “${session.value||"Unknown"}” in ${issue.column} reports.`;
    if(["keep","keep-all","keep-as-text","leave"].includes(key))return `${count(n,unit)} stay unchanged in your reports.`;
    if(key.includes("drop")||key.startsWith("keep-")&&key!=="keep-first"&&issue.reviewType?.startsWith("duplicate"))return `Changes which ${unit} remain in your reports; review the exact totals before approving.`;
    if(["median","mean","mode","median-by-group","mode-by-group","knn"].includes(key))return `Estimates values for ${count(n,unit)}; averages or label totals will change.`;
    if(key==="set-missing")return `${count(n,unit)} receive a blank value and stay visible for a later missing-value decision.`;
    return `Updates ${count(n,unit)} using this method; only the selected values change.`;
  }
  // C7 / LAY-05, LAY-07, LAY-53: adjacent consequences; three choices plus a selected More choice.
  function options(issue,choices,session,preview,settings="",aiRequest=""){
    const initial=preferred(issue,choices),selected=choices.find(option=>option.key===session.fix)||choices[0],visible=[...initial];if(selected&&!visible.includes(selected))visible.push(selected);const more=choices.filter(option=>!visible.includes(option));
    return `<div class="card" data-ui="review.options">${visible.map(option=>{
      const active=selected?.key===option.key,risk=typeof option.risk==="function"?option.risk(session):option.risk,extras=settings+(active&&option.requiresNote&&!settings.includes('id="reviewNote"')?`<label>Why is keeping these values appropriate?<input id="reviewNote" maxlength="2000" value="${escapeHtml(session.note)}"></label>`:"");let params=active&&option.params?option.params(issue,session):"",inline="";
      if(params&&["constant","fixed-cap","custom-factor","pad-zeros"].includes(option.key.replace(/^ai:/,""))){const holder=document.createElement("div");holder.innerHTML=params;const defining=holder.querySelector('input:not([type="checkbox"])');if(defining){inline=`<span class="inline-edit">${defining.outerHTML}</span>`;defining.remove();params=holder.innerHTML;}}
      const badge=risk==="Doesn't change values"?"b-neu":risk==="Doesn't invent information"?"b-ok":risk==="Removes data"?"b-bad":"b-warn";
      return `<div class="opt${active?" on":""}" data-ui="review.options.item" data-o="${escapeHtml(option.key)}" data-fix-row="${escapeHtml(option.key)}"><span class="radio" aria-hidden="true"></span><span class="title">${text(option.label)} ${inline}</span><span class="badge ${badge}" data-ui="review.fix.risk">${text(risk)}</span><div class="desc" data-ui="review.fix.consequence">${text(description(issue,option,session,preview))}${option.disabled?` <button class="link" data-option-setup>${text(option.setupLabel||"Choose what is needed →")}</button>`:""}</div>${params?`<div class="extra">${params}</div>`:""}${active&&extras?`<div class="extra">${extras}</div>`:""}</div>`;
    }).join("")}<div class="moreopts">More:${more.map(option=>`<button class="link" data-fix="${escapeHtml(option.key)}">${text(option.label)}</button>`).join(" ")}${ReviewCore.moduleFor(issue).aiFix?`<button class="link" id="reviewAskAi" aria-expanded="${Boolean(session.askOpen)}" aria-controls="reviewAiRequest">Ask AI for a fix</button>`:""}<button class="link" id="reviewMetricSettings">Impact metric</button><button class="link" id="reviewScopeSettings">Apply to</button></div>${aiRequest?`<div class="extra" id="reviewAiRequest" data-ui="review.fix.ai">${aiRequest}</div>`:""}</div>`;
  }
  // C8 / LAY-06, LAY-54: one counted action, with its own reserved layout space.
  function footer({summary="",links="",label,id="",action=""}={}){return `<footer class="foot" data-ui="review.footer"><div class="in"><span class="sum">${summary?summary:links}</span><button class="btn" id="${id}" data-layout-action="${action}" data-ui="review.footer.primary">${text(label)}</button></div></footer>`;}
  function section(title,content,slot){return content?`<section data-review-section="${slot}">${title?`<h3>${text(title)}</h3>`:""}${content}</section>`:"";}
  function explore(issue,content){
    const n=ReviewCore.exploreScope(issue).length;
    const controls=section(content.controlsTitle||"Define the check",content.controls,"controls");
    const selection=section(content.selectionTitle||"Review the values",content.selection,"selection");
    const evidence=section(content.evidenceTitle||"Inspect the context",content.evidence,"evidence");
    return `${lead(content.lead,content.sub)}${controls}${content.evidenceFirst?evidence+selection:selection+evidence}${footer({summary:`<b>${count(n)}</b> selected${content.grouping?` · grouped by ${text(content.grouping)}`:""}`,label:`Choose a fix for ${count(n)} →`,id:"reviewChooseFix",action:"fix"})}`;
  }
  function actionLabel(issue,option,preview){const key=option.key.replace(/^ai:/,""),n=preview?.selectedIds.length??ReviewCore.exploreScope(issue).length;
    if(key==="drop-column")return `Remove 1 column`;
    if(key==="constant"&&!ReviewCore.numericType(issue.column))return `Label ${count(n)} “${ReviewCore.data(issue).value||"Unknown"}”`;
    if(["keep","leave","keep-all","keep-as-text","to-text"].includes(key))return `Keep ${count(n)} unchanged`;
    if(key==="drop-rows")return `Remove ${count(n)}`;
    if(key==="new-ids"){const groups=ReviewCore.moduleFor(issue).groups?.(issue).filter(group=>ReviewCore.data(issue).locked?.includes(group.value)).length;return `Assign new IDs to ${preview?.patches?.length??groups??n} repeated ${groups===1?"entry":"entries"}`;}
    if(key==="split-to-rows")return `Split ${count(n)} into values`;
    if(key==="mask"||key==="hash")return `${key==="mask"?"Mask":"Code"} ${n} values`;
    if(key.includes("cap"))return `Cap ${n} values`;
    if(key==="set-missing")return `Blank ${n} values`;
    if(key.startsWith("keep-")||key==="merge"||key==="rule"||key==="one-by-one")return `Resolve ${n} repeated ${noun()}`;
    if(issue.reviewType==="missing")return `Fill ${n} missing values`;
    if(issue.reviewType==="format"||issue.reviewType==="type-mismatch")return `Convert ${n} values`;
    return `Fix ${n} values`;
  }
  function fix(issue,content){return `${lead(content.lead,content.sub)}${section("Options",content.options,"options")}${section("What changes",content.change,"change")}${footer({links:`<button class="link" id="reviewRows">See the ${ReviewCore.exploreScope(issue).length} rows</button><button class="link" id="reviewAddNote">Add a note</button>`,label:content.action,id:"reviewApply",action:"apply"})}`;}
  function review(issue,content){return `${lead(content.lead,content.sub)}${section("Numbers",content.change,"numbers")}${section("Examples",content.examples,"examples")}${footer({links:'<button class="link" id="reviewNext">Next issue →</button>',label:`Undo ${content.count??0} changes`,id:"reviewUndo",action:"undo"})}`;}
  return {plain,text,attrs,noun,count,short,lead,headline,selection,table,groupedTable,toolbar,change,changedLabels,options,footer,explore,fix,review,actionLabel};
})();
