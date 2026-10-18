// LAY-01…08, LAY-30…32: shared content-driven templates; issue modules provide values, never their own page layout.
var ReviewComponents = (() => {
  // UI copy is authored explicitly; never rename dataset fields or user notes through a word-replacement filter.
  const plain=value=>String(value??"");
  const text=value=>escapeHtml(plain(value));
  const attrs=values=>Object.entries(values||{}).map(([key,value])=>` ${key}="${escapeHtml(value)}"`).join("");
  const noun=()=>/healthcare|patient|visit/i.test(state.fileName)||state.headers.some(column=>/patient|visit/i.test(column))?"patients":/marketing|campaign/i.test(state.fileName)?"campaigns":/sales|order/i.test(state.fileName)||state.headers.some(column=>/order_id|order_date|revenue|sales_rep/i.test(column))?"orders":state.headers.some(column=>/campaign|impression|click_through_rate/i.test(column))?"campaigns":"entries";
  const count=(n,unit=noun())=>{const amount=Number(n),singular=unit.endsWith("ies")?`${unit.slice(0,-3)}y`:unit.endsWith("s")?unit.slice(0,-1):unit;return `${amount.toLocaleString()} ${amount===1?singular:unit}`;};
  const rowLabel=id=>{const row=[...(state.rows||[]),...(state.allRows||[]),...(state.original||[])].find(item=>item._row===Number(id));return row?.row_id??id;};
  const short=value=>plain(value);
  // C1 / LAY-02, LAY-18, LAY-50: one truthful question, decision or outcome.
  function lead(title,sub=""){return `<p class="lead" data-ui="review.lead">${text(title)}</p>${sub?`<p class="lead-sub" data-ui="review.lead.sub">${sub}</p>`:""}`;}
  // C2: one deterministic takeaway, never a fabricated interpretation or cutoff.
  function headline(value,ui="review.headline"){return value?`<div class="headline" data-ui="${ui}">${text(value)}</div>`:"";}
  // C3 / LAY-13, LAY-14: identical tracks for every selected value, shape, type, group or violation.
  function selection(items,{ui="review.select",total="",ai="",empty="No values need selection."}={}){ // CORE-58: long value lists scroll locally even after Show all.
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{},visible=session.expandedLists?.[ui]?items:items.slice(0,200);
    const rows=visible.map(item=>{
      const selected=item.attrs?.["aria-pressed"]===true||String(item.attrs?.["aria-pressed"])==="true"||item.control?.includes("checked"),control=item.control?.includes("<input")?item.control:`<span class="chk${selected?" on":""}" aria-hidden="true"></span>`,value=item.valueHtml??(item.raw===false?text(item.value):`<span class="mono">${escapeHtml(item.value)}</span>`),body=`<span class="control">${control}</span><span class="mono">${value}${item.extra||""}</span><span class="r num">${escapeHtml(item.count??"")}</span><span class="r num">${escapeHtml(item.share??"")}</span><span class="m">${item.meta||""}</span>`;
      const attributes=attrs(Object.fromEntries(Object.entries({...item.attrs,"data-ui":item.ui||ui}).filter(([key])=>key!=="class")));
      if(item.details)return `<details class="grp${item.open?" open":""}" ${item.open?"open":""}${attributes}><summary class="ghead">${body}</summary><div class="body-rows">${item.details}</div></details>`;
      return `<div class="vrow ${item.className||item.attrs?.class||""}" role="${item.button?"button":"row"}" tabindex="${item.button?"0":"-1"}"${attributes}>${body}</div>`;
    }).join("");
    const scrollRegion=items.length>6||Boolean(session.expandedLists?.[ui]);
    return `<div class="vals${ai?"":" solo"}" data-ui="review.select"><div><div class="card" data-ui="${ui}" ${scrollRegion?'tabindex="0"':""} role="region" aria-label="Selectable review values">${rows||`<p class="meta">${text(empty)}</p>`}</div>${total?`<div class="total" data-ui="review.select.total">${text(total)}</div>`:""}${items.length>visible.length?`<button class="link" data-review-show-all="${ui}">Show all ${items.length} values</button>`:""}</div>${ai?`<aside class="card ai">${ai}</aside>`:""}</div>`;
  }
  // C4 / LAY-12: real cells; numeric alignment is shared; raw source text is never rewritten by copy rules.
  function table({columns,rows,ui="review.table",card=true,limit=Infinity,empty="No example rows are available.",rowAttrs,progressive=false}={}){ // CORE-58: shared tables keep long row sets inside their own scroller.
    const session=ReviewCore.current()?ReviewCore.data(ReviewCore.current()):{};limit=progressive?limit:session.expandedLists?.[ui]?Infinity:Math.min(limit,200);
    const cell=(value,key)=>value&&typeof value==="object"&&!Array.isArray(value)?`${value.control||""}${value.raw?`<code>${escapeHtml(value.value)}</code>`:escapeHtml(value.value??"")}`:escapeHtml((key==="row"||key==="_row")&&Number.isInteger(Number(value))?rowLabel(value):value??"");
    return `<div class="${card?"card":""} scroll-x" data-ui="${ui}" tabindex="0"><table><thead><tr>${columns.map(column=>`<th scope="col" class="${column.numeric&&!/^(?:row|_row)$/i.test(column.key)?"r":""}">${text(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,limit).map(row=>`<tr${attrs(rowAttrs?.(row))}>${columns.map(column=>{const value=row[column.key],numeric=column.numeric&&!/^(?:row|_row)$/i.test(column.key);return `<td class="${numeric?"r num":""} ${value?.problem?"gap":""} ${value?.removed?"old":""}">${cell(value,column.key)}</td>`;}).join("")}</tr>`).join("")||`<tr><td colspan="${columns.length}">${text(empty)}</td></tr>`}</tbody></table>${rows.length>limit?`<div class="more"><button class="link" data-review-show-all="${ui}">Show all ${rows.length} rows</button></div>`:""}</div>`;
  }
  // GROUP-01…05: inspection tabs never alter locks or treatment scope. Only active rows are mounted.
  const groupBrowsers=new Map(),groupBatch=100;
  function beginGroupedRender(){groupBrowsers.clear();}
  function groupBrowser(groups,{ui="review.groups",session,columns,rowMap=row=>row,header=()=>"",panel,empty="No groups to inspect."}={}){
    session ||= ReviewCore.data(ReviewCore.current());
    session.groupBrowsers ||= {};
    const view=session.groupBrowsers[ui] ||= {active:"",positions:{},limits:{},tabScroll:0};
    const keys=groups.map(group=>JSON.stringify(group.key??group.value??group.labels??group.label));
    let active=keys.indexOf(view.active);if(active<0)active=0;view.active=keys[active]||"";
    if(!groups.length)return `<p class="meta">${text(empty)}</p>`;
    const group=groups[active],key=keys[active],shown=Math.min(group.rows.length,view.limits[key]||groupBatch);
    const id=`groups-${Array.from(ui).reduce((hash,char)=>(Math.imul(hash,31)+char.charCodeAt(0))>>>0,7).toString(36)}`;
    groupBrowsers.set(ui,{view,groups,keys,active,shown});
    const content=panel?panel(group,active):table({columns,rows:group.rows.slice(0,shown).map(row=>rowMap(row,group)),card:false,progressive:true,ui:`${ui}.rows`}),summary=header(group,active);
    return `<div class="card group-browser" data-group-browser="${escapeHtml(ui)}" data-ui="${escapeHtml(ui)}"><div class="group-tabs" role="tablist" aria-label="Row groups" aria-orientation="horizontal">${groups.map((entry,index)=>`<button type="button" role="tab" id="${id}-tab-${index}" aria-controls="${id}-panel" aria-selected="${index===active}" tabindex="${index===active?0:-1}" data-group-tab="${index}" title="${text(entry.label??entry.value??`Group ${index+1}`)}"><span>${text(entry.label??entry.value??`Group ${index+1}`)}</span><small>${entry.rows.length.toLocaleString()}</small></button>`).join("")}</div><div id="${id}-panel" role="tabpanel" aria-labelledby="${id}-tab-${active}">${summary?`<div class="group-summary">${summary}</div>`:""}${content}${!panel?`<p class="group-progress" role="status">${shown.toLocaleString()} of ${group.rows.length.toLocaleString()} rows${shown<group.rows.length?" · Scroll for more":""}</p>`:""}</div></div>`;
  }
  function bindGroupBrowsers(root){
    root.querySelectorAll("[data-group-browser]").forEach(host=>{
      const config=groupBrowsers.get(host.dataset.groupBrowser);if(!config)return;
      const {view,keys,active,groups}=config,tabs=host.querySelector(":scope > .group-tabs"),buttons=[...tabs.querySelectorAll("[data-group-tab]")];
      tabs.scrollLeft=view.tabScroll||0;
      tabs.addEventListener("scroll",()=>{view.tabScroll=tabs.scrollLeft;},{passive:true});
      const select=index=>{if(index===active)return;view.active=keys[index];renderPreservingReviewFocus();const next=document.getElementById(buttons[index].id);next?.focus({preventScroll:true});next?.scrollIntoView({block:"nearest",inline:"nearest"});};
      buttons.forEach((button,index)=>{
        button.onclick=()=>select(index);
        button.onkeydown=event=>{let next=index;if(event.key==="ArrowRight")next=(index+1)%buttons.length;else if(event.key==="ArrowLeft")next=(index+buttons.length-1)%buttons.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=buttons.length-1;else return;event.preventDefault();event.stopPropagation();select(next);};
      });
      const scroller=host.querySelector(":scope > [role=tabpanel] > .scroll-x");if(!scroller)return;
      const position=view.positions[keys[active]]||{top:0,left:0};scroller.scrollTop=position.top;scroller.scrollLeft=position.left;
      scroller.setAttribute("aria-label",`Rows in ${groups[active].label??groups[active].value??"selected group"}`);
      scroller.addEventListener("scroll",()=>{
        view.positions[keys[active]]={top:scroller.scrollTop,left:scroller.scrollLeft};
        if(config.shown<groups[active].rows.length&&scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-80){view.limits[keys[active]]=config.shown+groupBatch;renderPreservingReviewFocus();}
      },{passive:true});
    });
  }
  function groupedTable(groups,{columns,target,ui="review.table",selectedIds=new Set(),overall=0,session,path=[]}={}){
    return groupBrowser(groups.map(group=>({...group,rows:group.rows.filter(row=>selectedIds.has(row._row)).concat(group.rows.filter(row=>!selectedIds.has(row._row)))})),{ui,session,columns,rowMap:row=>Object.fromEntries(columns.map(column=>[column.key,column.key==="_row"?row._row:{value:String(row[column.key]??"").trim()?row[column.key]:"—",raw:true,problem:column.key===target&&selectedIds.has(row._row)}])),header:group=>{const missing=group.rows.filter(row=>selectedIds.has(row._row)).length;return `<strong>${text(group.label)}</strong><span>${missing.toLocaleString()} selected gaps · ${(missing/Math.max(1,group.rows.length)*100).toFixed(1)}% of this group · ${(overall*100).toFixed(1)}% overall</span>`;},...(groups.some(group=>group.children)?{panel:group=>group.children?groupedTable(group.children,{columns,target,selectedIds,overall,session,path:path.concat(group.label),ui:`${ui}.${JSON.stringify(path.concat(group.label))}`}):""}:{})});
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
    const common={missing:ReviewCore.numericType(issue.column)?"median-by-group":"mode-by-group",outlier:options.some(option=>option.key==="ai-typos")?"ai-typos":"cap","duplicate-values":"new-ids","duplicate-rows":"keep-most-complete",format:"set-missing","type-mismatch":"set-missing",scale:"to-majority","category-variants":"case-title",whitespace:"trim",invalid:"set-missing","cross-column":"recalculate",constant:"drop-column","leading-zeros":"to-text","multi-value":"split-to-columns",sensitive:"hash"};
    const usable=options.filter(option=>!option.disabled),choices=usable.length?usable:options,keep=choices.find(option=>["leave","keep","keep-all","keep-as-text"].includes(option.key)),preferredKey=issue.reviewType==="format"&&issue.type==="Format mismatch"?(issue.date?"to-target":"to-number"):common[issue.reviewType],recommended=choices.find(option=>option.key===preferredKey),first=recommended||choices[0],second=choices.find(option=>option!==first&&option!==keep);
    return [...new Set([first,second,keep].filter(Boolean))];
  }
  function description(issue,option,session,preview){
    if(option.disabled)return plain(option.disabled);
    if(option.description)return plain(option.description);
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
  function options(issue,choices,session,preview,settings="",aiRequest="",aiRuleRequest=""){
    const initial=preferred(issue,choices),selected=choices.find(option=>option.key===session.fix)||choices[0],visible=[...initial];if(selected&&!visible.includes(selected))visible.push(selected);const more=choices.filter(option=>!visible.includes(option));
    return `<div class="card" data-ui="review.options">${visible.map(option=>{
      const active=selected?.key===option.key,risk=typeof option.risk==="function"?option.risk(session):option.risk,extras=settings+(active&&option.requiresNote&&!settings.includes('id="reviewNote"')?`<label>Why is keeping these values appropriate?<input id="reviewNote" maxlength="2000" value="${escapeHtml(session.note)}"></label>`:"");let params=active&&option.params?option.params(issue,session):"",inline="";
      if(params&&["constant","fixed-cap","custom-factor","pad-zeros"].includes(option.key.replace(/^ai:/,""))){const holder=document.createElement("div");holder.innerHTML=params;const defining=holder.querySelector('input:not([type="checkbox"])');if(defining){inline=`<span class="inline-edit">${defining.outerHTML}</span>`;defining.remove();params=holder.innerHTML;}}
      const badge=risk==="Doesn't change values"?"b-neu":risk==="Doesn't invent information"?"b-ok":risk==="Removes data"?"b-bad":"b-warn";
      return `<div class="opt${active?" on":""}" data-ui="review.options.item" data-o="${escapeHtml(option.key)}" data-fix-row="${escapeHtml(option.key)}"><span class="radio" aria-hidden="true"></span><span class="title">${option.labelHtml||text(option.label)} ${inline}</span><span class="badge ${badge}" data-ui="review.fix.risk">${text(risk)}</span><div class="desc" data-ui="review.fix.consequence">${text(description(issue,option,session,preview))}${option.disabled?` <button class="link" data-option-setup>${text(option.setupLabel||"Choose what is needed →")}</button>`:""}</div>${params?`<div class="extra">${params}</div>`:""}${active&&extras?`<div class="extra">${extras}</div>`:""}</div>`;
      }).join("")}<div class="moreopts">More:${more.map(option=>`<button class="link" data-fix="${escapeHtml(option.key)}">${text(option.label)}</button>`).join(" ")}${ReviewCore.moduleFor(issue).aiFix?`<button class="link" id="reviewAskAi" aria-expanded="${Boolean(session.askOpen)}" aria-controls="reviewAiRequest">Ask AI for a fix</button>`:""}${ReviewCore.moduleFor(issue).aiRuleAvailable?.(issue)?`<button class="link" id="reviewAskAiRule" aria-expanded="${Boolean(session.ruleOpen)}" aria-controls="reviewAiRuleRequest">Fill using an AI rule</button>`:""}<button class="link" id="reviewMetricSettings">Impact metric</button><button class="link" id="reviewScopeSettings">Apply to</button></div></div>${aiRequest?`<div class="card ai" id="reviewAiRequest" data-ui="review.fix.ai">${aiRequest}</div>`:""}${aiRuleRequest}`;
  }
  // C8 / LAY-06, LAY-54: one counted action, with its own reserved layout space.
  function footer({summary="",links="",label,id="",action=""}={}){return `<footer class="foot" data-ui="review.footer"><div class="in"><span class="sum">${summary?summary:links}</span><button class="btn" id="${id}" data-layout-action="${action}" data-ui="review.footer.primary">${text(label)}</button></div></footer>`;}
  function section(title,content,slot){return content?`<section data-review-section="${slot}">${title?`<h3>${text(title)}</h3>`:""}${content}</section>`:"";}
  function explore(issue,content){
    const n=ReviewCore.exploreScope(issue).length;
    const controls=section(content.controlsTitle||"Define the check",content.controls,"controls");
    const selection=section(content.selectionTitle||"Review the values",content.selection,"selection");
    const evidence=section(content.evidenceTitle||"Inspect the context",content.evidence,"evidence");
    return `${lead(content.lead,content.sub)}${controls}${content.evidenceFirst?evidence+selection:selection+evidence}${footer({summary:content.footerSummary||`<b>${count(n)}</b> selected${content.grouping?` · grouped by ${text(content.grouping)}`:""}`,label:content.footerLabel||`Choose a fix for ${count(n)} →`,id:content.footerId||"reviewChooseFix",action:content.footerAction||"fix"})}`;
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
  function fix(issue,content){const change=content.change?`<div class="scroll-x" data-ui="review.fix.preview">${content.change}</div>`:"";return `${lead(content.lead,content.sub)}${section("Options",content.options,"options")}${section("What changes",change,"change")}${footer({links:`<button class="link" id="reviewRows">See the ${ReviewCore.exploreScope(issue).length} rows</button><button class="link" id="reviewAddNote">Add a note</button><span class="meta" id="reviewApplyReason" data-ui="review.fix.apply-reason" role="status" hidden></span>`,label:content.action,id:"reviewApply",action:"apply"})}`;}
  function review(issue,content){return `${lead(content.lead,content.sub)}${section("Numbers",content.change,"numbers")}${section("Examples",content.examples,"examples")}${footer({links:'<button class="link" id="reviewNext">Next issue →</button>',label:`Undo ${content.count??0} changes`,id:"reviewUndo",action:"undo"})}`;}
  return {plain,text,attrs,noun,count,rowLabel,short,lead,headline,selection,table,groupedTable,groupBrowser,beginGroupedRender,bindGroupBrowsers,toolbar,change,changedLabels,preferred,options,footer,explore,fix,review,actionLabel};
})();
