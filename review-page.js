// CORE-01…04: modules retain the common interface while shared components own every tab's layout.
Object.values(ReviewModules).forEach(module=>{module.renderReview=(issue,decision)=>{const content=module.reviewContent(issue,decision);return ReviewComponents.review(issue,{...content,change:ReviewComponents.change(content.change)});};});
// Keep live controls, scroll containers and disclosures mounted during local/background updates.
function patchReviewDom(current,next) {
  const key=node=>node.nodeType===1 ? node.id || [node.tagName,node.getAttribute("data-review-section"),node.getAttribute("data-ui"),node.getAttribute("data-row"),node.getAttribute("data-group"),node.getAttribute("data-column"),node.getAttribute("data-fix-row")].join("|") : `node:${node.nodeType}`;
  const compatible=(a,b)=>a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&key(a)===key(b));
  function patch(a,b) {
    if(a.isEqualNode(b))return;
    if(a.nodeType!==1){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;return;}
    const valueChanged=a.getAttribute("value")!==b.getAttribute("value"),checkedChanged=a.hasAttribute("checked")!==b.hasAttribute("checked");
    for(const attribute of [...a.attributes])if(!b.hasAttribute(attribute.name)&&!(a.tagName==="DETAILS"&&attribute.name==="open"))a.removeAttribute(attribute.name);
    for(const attribute of b.attributes)if(a.getAttribute(attribute.name)!==attribute.value&&!(a.tagName==="DETAILS"&&attribute.name==="open"))a.setAttribute(attribute.name,attribute.value);
    let cursor=a.firstChild;
    for(const child of [...b.childNodes]) {
      let match=cursor;
      if(!match||!compatible(match,child))match=[...a.childNodes].slice(cursor?[...a.childNodes].indexOf(cursor):a.childNodes.length).find(node=>compatible(node,child));
      if(match){if(match!==cursor)a.insertBefore(match,cursor);patch(match,child);cursor=match.nextSibling;}
      else a.insertBefore(child.cloneNode(true),cursor);
    }
    while(cursor){const following=cursor.nextSibling;cursor.remove();cursor=following;}
    if(a.tagName==="INPUT"){if(valueChanged&&a.value!==b.value)a.value=b.value;if(checkedChanged)a.checked=b.checked;}
    if(a.tagName==="SELECT"&&a.value!==b.value)a.value=b.value;
  }
  patch(current,next);
}
// Legacy modules bind native listeners directly. Track only listeners on this owned surface,
// so refreshing callbacks on retained nodes cannot accumulate duplicate actions.
const reviewNodeListeners=new WeakMap();
function prepareReviewBindings(root) {
  for(const node of [root,...root.querySelectorAll("*")]) {
    let registration=reviewNodeListeners.get(node);
    if(!registration){
      registration={add:node.addEventListener,remove:node.removeEventListener,list:[]};reviewNodeListeners.set(node,registration);
      node.addEventListener=function(type,callback,options){registration.list.push([type,callback,options]);registration.add.call(this,type,callback,options);};
    }
    for(const [type,callback,options] of registration.list)registration.remove.call(node,type,callback,options);
    registration.list=[];
  }
}
function renderReviewPage() {
  $("#topEyebrow").textContent="REVIEW";
  const open=state.issues.filter(issue=>issue.status==="open"),selected=state.issues.find(issue=>issue.id===state.selectedIssue)||open[0]||state.issues[0];if(selected)state.selectedIssue=selected.id;
  const filter=state.reviewKind || "all",query=(state.reviewSearch || "").toLowerCase(),visible=state.issues.filter(issue=>(filter==="all"||issue.reviewType===filter)&&(issue.displayColumn || issue.column).toLowerCase().includes(query));
  state.reviewQueueExpanded ||= {};
  function list(issues,key) { // CORE-10, CORE-11, CORE-58, CORE-60
    const columns=["All columns",...state.headers],ordered=[...issues].sort((a,b)=>columns.indexOf(a.displayColumn || a.column)-columns.indexOf(b.displayColumn || b.column)||ReviewCore.order.indexOf(a.reviewType)-ReviewCore.order.indexOf(b.reviewType)),groups=new Map();
    for(const issue of state.reviewQueueExpanded[key]?ordered:ordered.slice(0,200)) {const column=issue.displayColumn || issue.column;if(!groups.has(column))groups.set(column,[]);groups.get(column).push(issue);}
    return [...groups].map(([column,items])=>`<section class="review-issue-column" data-ui="review.issues.column" data-column="${escapeHtml(column)}"><h3>${escapeHtml(column)}</h3>${items.map(issue=>{const module=ReviewCore.moduleFor(issue),count=module.queueCount?module.queueCount(issue):module.count?module.count(issue):reviewRows(issue).length,status=issue.status==="open"?"open":issue.status==="valid"?"accepted":"fixed";return `<button id="reviewIssue${issue.id}" class="review-issue ${selected?.id===issue.id?"active":""}" data-ui="review.issues.item" data-review-issue="${issue.id}" data-column="${escapeHtml(issue.column)}" data-issue="${issue.reviewType || "manual"}" aria-pressed="${selected?.id===issue.id}"><i class="review-issue-dot ${status}" aria-label="${status}"></i><span>${ReviewComponents.text(ReviewPageEngine.labels[issue.reviewType] || issue.type)}</span><b title="${ReviewComponents.text(module.queueCountLabel?module.queueCountLabel(issue):ReviewCore.count(count,module.unit || "cells"))}">${count.toLocaleString()}</b></button>`;}).join("")}</section>`).join("")+(ordered.length>200&&!state.reviewQueueExpanded[key]?`<button class="text-button" data-queue-show-all="${key}">Show all ${ordered.length} issues</button>`:"");
  }
  // CORE-12, CORE-13: type/column filters and a collapsed, separately bounded resolved list.
  const template=document.createElement("template");
  template.innerHTML=`<div class="review-page"><aside class="review-issues" data-ui="review.issues"><div class="review-issues-heading"><h2>Issues</h2><span>${open.length} open</span></div><div class="review-issues-filter" data-ui="review.issues.filter"><select id="reviewTypeFilter" aria-label="Filter issue type"><option value="all">All issue types</option>${Object.entries(ReviewPageEngine.labels).map(([key,label])=>`<option value="${key}" ${filter===key?"selected":""}>${label}</option>`).join("")}</select><input id="reviewColumnSearch" type="search" aria-label="Search column name" placeholder="Search column name" value="${escapeHtml(state.reviewSearch || "")}"></div><div class="review-issue-list">${list(visible.filter(issue=>issue.status==="open"),"open") || '<p class="review-empty-copy">No matching open issues.</p>'}<details class="review-resolved" data-ui="review.issues.done"><summary>Resolved (${visible.filter(issue=>issue.status!=="open").length})</summary>${list(visible.filter(issue=>issue.status!=="open"),"resolved")}</details></div></aside><main class="review-main" data-ui="review.main">${selected?reviewIssueHtml(selected):'<h1>No findings</h1><p>The current checks found no issues to review.</p>'}</main></div>`;
  const nextPage=template.content.firstElementChild;
  const panel=nextPage.querySelector(".review-issues"),disclosure=document.createElement("details"),content=document.createElement("div");
  disclosure.className="review-queue-disclosure";content.className="review-queue-content";
  disclosure.innerHTML=`<summary>Browse issues <span>${open.length} open</span></summary>`;disclosure.open=innerWidth>900||Boolean(state.reviewQueueOpen);
  content.append(panel.querySelector(".review-issues-filter"),panel.querySelector(".review-issue-list"));disclosure.append(content);panel.append(disclosure);
  const task=nextPage.querySelector(".review-main"),footer=task.querySelector(".rc-footer");if(footer)task.append(footer);
  const currentPage=screen.querySelector(".review-page"),identity=JSON.stringify([selected?.id,selected?ReviewCore.data(selected).tab:null]);
  if(currentPage){
    const sameView=currentPage.dataset.viewIdentity===identity;
    const scroll=[currentPage,...currentPage.querySelectorAll("*")].filter(node=>(sameView||node.closest(".review-issues"))&&(node.scrollTop||node.scrollLeft||node.matches(".review-tab-content,.review-issue-list"))).map(node=>[node,node.scrollTop,node.scrollLeft]),windowX=window.scrollX,windowY=window.scrollY;
    // Navigation resets just the tab body; the queue and workspace frame stay mounted.
    if(!sameView){const oldBody=currentPage.querySelector("#reviewTabContent"),nextBody=nextPage.querySelector("#reviewTabContent");if(oldBody&&nextBody)oldBody.replaceWith(nextBody.cloneNode(true));}
    patchReviewDom(currentPage,nextPage);
    for(const [node,top,left] of scroll)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
    if(sameView&&(window.scrollX!==windowX||window.scrollY!==windowY))window.scrollTo(windowX,windowY);
  }
  else screen.replaceChildren(nextPage);
  const page=screen.querySelector(".review-page");page.dataset.viewIdentity=identity;prepareReviewBindings(page);
  $("#reviewTypeFilter").onchange=event=>{state.reviewKind=event.target.value;renderPreservingReviewFocus();};$("#reviewColumnSearch").oninput=event=>{state.reviewSearch=event.target.value;renderPreservingReviewFocus();};
  document.querySelectorAll("[data-review-issue]").forEach(button=>button.onclick=()=>ReviewCore.select(Number(button.dataset.reviewIssue)));
  document.querySelectorAll("[data-queue-show-all]").forEach(button=>button.onclick=()=>{state.reviewQueueExpanded[button.dataset.queueShowAll]=true;renderPreservingReviewFocus();});
  // CORE-20: on narrow screens, issue browsing is available without pushing the active task below a second dashboard.
  const liveDisclosure=page.querySelector(".review-queue-disclosure");
  liveDisclosure.addEventListener("toggle",()=>{if(liveDisclosure.isConnected&&innerWidth<=900)state.reviewQueueOpen=liveDisclosure.open;});
  if(selected)ReviewCore.bindShared(selected);
}
function reviewIssueHtml(issue) { // CORE-14, CORE-15, CORE-16, CORE-20, CORE-49, CORE-61, CORE-62
  const session=ReviewCore.data(issue),module=ReviewCore.moduleFor(issue);module.init?.(issue,session);
  const rows=ReviewCore.exploreScope(issue),count=module.count?module.count(issue):reviewRows(issue).length,unit=module.unit || "cells",decision=state.changes.find(change=>change.issue.id===issue.id),countLabel=module.countLabel?module.countLabel(issue):unit==="percent"?`${count}% ${issue.unit?.includes("empty")?"empty":"one value"}`:ReviewCore.count(count,unit);
  return `<header class="review-issue-header" data-ui="review.issue-header"><div><h1>${escapeHtml(issue.displayColumn || issue.column)}</h1><p>${ReviewComponents.text(ReviewPageEngine.labels[issue.reviewType] || issue.type)} · ${ReviewComponents.text(countLabel)}</p></div>${issue.status==="open"?'<button class="text-button" id="reviewAccept" data-ui="review.issue-header.accept">Accept as is</button>':'<span class="review-resolved-label">Reviewed</span>'}</header><nav class="review-tabs" data-ui="review.tabs" role="tablist" aria-label="Issue review">${["explore","fix","review"].map(tab=>`<button id="reviewTab-${tab}" data-review-tab="${tab}" role="tab" aria-selected="${session.tab===tab}" aria-controls="reviewTabContent" tabindex="${session.tab===tab?0:-1}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join("")}</nav><section id="reviewTabContent" class="review-tab-content ${session.tab}" role="tabpanel" aria-labelledby="reviewTab-${session.tab}">${session.tab==="explore"?module.renderExplore(issue,session):session.tab==="fix"?ReviewCore.fixHtml(issue):ReviewCore.reviewHtml(issue)}</section>`;
}
// CORE-19: shortcuts never intercept value, note, instruction, or content editing.
document.addEventListener("keydown",event=>{
  if(state.screen!=="issues"||event.altKey||event.ctrlKey||event.metaKey||event.target.closest("input,textarea,select,[contenteditable=true],.review-row-panel"))return;
  const issue=ReviewCore.current();if(!issue)return;
  if(["1","2","3"].includes(event.key)){event.preventDefault();ReviewCore.switchTab(issue,["explore","fix","review"][Number(event.key)-1]);}
  if(["j","k"].includes(event.key)){event.preventDefault();const open=state.issues.filter(item=>item.status==="open"),index=open.findIndex(item=>item.id===issue.id),next=open[(index+(event.key==="j"?1:open.length-1)+open.length)%open.length];if(next)ReviewCore.select(next.id);}
  if(["ArrowLeft","ArrowRight"].includes(event.key)&&event.target.matches("[data-review-tab]")){event.preventDefault();const tabs=[...document.querySelectorAll("[data-review-tab]:not(:disabled)")],index=tabs.indexOf(event.target),next=tabs[(index+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length];ReviewCore.switchTab(issue,next.dataset.reviewTab);document.getElementById(next.id)?.focus();}
});
document.addEventListener("click",event=>{document.querySelectorAll(".priority-add[open]").forEach(picker=>{if(!picker.contains(event.target))picker.open=false;});});
// CORE-20, CORE-48: resizing recomposites only display geometry, keeping the preview and scope.
let reviewResizeTimer,reviewViewportWidth=window.innerWidth;
window.addEventListener("resize",()=>{if(window.innerWidth===reviewViewportWidth)return;reviewViewportWidth=window.innerWidth;clearTimeout(reviewResizeTimer);reviewResizeTimer=setTimeout(()=>{if(typeof state!=="undefined"&&state.screen==="issues"&&state.headers.length)renderPreservingReviewFocus();},100);});
