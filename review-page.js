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
let reviewScreenParent=null,reviewScreenNext=null;
function restoreReviewReferenceShell(){
  if(!document.body.classList.contains("ui-pages-active"))return;
  if(reviewScreenParent)reviewScreenParent.insertBefore(screen,reviewScreenNext?.parentNode===reviewScreenParent?reviewScreenNext:null);
  screen.classList.remove("reference-screen");document.querySelector(".app-shell")?.classList.remove("reference-hidden");document.querySelector("#reviewReferenceStyles").disabled=true;document.body.classList.remove("ui-pages-active");
}
function renderReviewPage() {
  $("#topEyebrow").textContent="REVIEW";
  if(!reviewScreenParent){reviewScreenParent=screen.parentNode;reviewScreenNext=screen.nextSibling;}
  screen.classList.add("reference-screen");document.body.append(screen);document.body.classList.add("ui-pages-active");document.querySelector(".app-shell")?.classList.add("reference-hidden");document.querySelector("#reviewReferenceStyles").disabled=false;
  const open=state.issues.filter(issue=>issue.status==="open"),selected=state.issues.find(issue=>issue.id===state.selectedIssue)||open[0]||state.issues[0];if(selected)state.selectedIssue=selected.id;
  const ordered=[...state.issues].sort((a,b)=>state.headers.indexOf(a.displayColumn||a.column)-state.headers.indexOf(b.displayColumn||b.column)||ReviewCore.order.indexOf(a.reviewType)-ReviewCore.order.indexOf(b.reviewType));
  const grouped=new Map();for(const issue of ordered){const column=issue.displayColumn||issue.column;if(!grouped.has(column))grouped.set(column,[]);grouped.get(column).push(issue);}
  const list=[...grouped].map(([column,issues])=>`<div class="col" data-column="${escapeHtml(column)}">${escapeHtml(column)}</div>${issues.map(issue=>{const module=ReviewCore.moduleFor(issue),count=module.queueCount?module.queueCount(issue):module.count?module.count(issue):reviewRows(issue).length,status=issue.status==="open"?"open":issue.status==="valid"?"accepted":"fixed";return `<a href="#" class="item ${selected?.id===issue.id?"on":""}" id="reviewIssue${issue.id}" data-ui="review.list.item" data-review-issue="${issue.id}" aria-current="${selected?.id===issue.id?"page":"false"}"><span>${escapeHtml(ReviewPageEngine.labels[issue.reviewType]||issue.type)}</span><span class="c num">${status==="open"?count.toLocaleString():status}</span></a>`;}).join("")}`).join("");
  const tab=selected?ReviewCore.data(selected).tab:"explore",decision=selected&&state.changes.find(change=>change.issue.id===selected.id),main=selected?reviewIssueHtml(selected):'<div class="wrap"><h1>No findings</h1><p>The current checks found no issues to review.</p></div>';
  const template=document.createElement("template");
  template.innerHTML=`<div class="app"><nav class="nav" data-ui="app.nav"><div class="brand">ClearData</div><a href="#" data-workspace-screen="data">Dataset</a><a href="#" data-workspace-screen="view">Explore</a><a href="#" class="on" data-workspace-screen="issues">Review <span class="pill">${open.length}</span></a><a href="#" data-workspace-screen="changes">Decisions</a><a href="#" data-workspace-screen="report">Report</a></nav><div class="shell"><header class="top" data-ui="app.top"><span class="file">${escapeHtml(state.fileName||"Dataset")}</span><span class="ver">${state.changes.length?"Working version":"Original"}</span>${decision?'<button class="link" data-ui="top.undo">Undo last change</button>':""}</header><div class="body"><aside class="issues" data-ui="review.list"><div class="hd"><span>ISSUES</span><span>${open.length} open</span></div>${list}</aside><main class="main" data-ui="review.main"><div class="content"><div class="wrap">${main}</div></div></main></div></div></div>`;
  const nextApp=template.content.firstElementChild,footer=nextApp.querySelector(".main .foot");if(footer)nextApp.querySelector(".main").append(footer);
  const currentApp=screen.firstElementChild;if(currentApp)patchReviewDom(currentApp,nextApp);else screen.replaceChildren(nextApp);const app=screen.firstElementChild;
  prepareReviewBindings(app);
  app.querySelectorAll("[data-review-issue]").forEach(button=>button.onclick=event=>{event.preventDefault();ReviewCore.select(Number(button.dataset.reviewIssue));});
  app.querySelectorAll("[data-workspace-screen]").forEach(link=>link.onclick=event=>{event.preventDefault();go(link.dataset.workspaceScreen);});
  app.querySelector('[data-ui="top.undo"]')?.addEventListener("click",()=>{const change=state.changes[0];if(change)rollbackChange(change.id);render();});
  if(selected)ReviewCore.bindShared(selected);
}
function reviewIssueHtml(issue) { // CORE-14, CORE-15, CORE-16, CORE-20, CORE-49, CORE-61, CORE-62
  const session=ReviewCore.data(issue),module=ReviewCore.moduleFor(issue);module.init?.(issue,session);
  const rows=ReviewCore.exploreScope(issue),count=module.count?module.count(issue):reviewRows(issue).length,unit=module.unit || "cells",decision=state.changes.find(change=>change.issue.id===issue.id),countLabel=module.countLabel?module.countLabel(issue):unit==="percent"?`${count}% ${issue.unit?.includes("empty")?"empty":"one value"}`:ReviewCore.count(count,unit);
  const fixed=issue.status!=="open",changed=decision?.patches?.filter(patch=>patch.column===issue.column).length||0,fixedCount=decision?.removedRows?.length||changed||decision?.rows?.length||count,operation=decision?.treatment?.operation,verb=operation==="remove"?"removed":operation==="retain"?"accepted":operation==="leaveMissing"?"left missing":changed?"changed":"reviewed",title=fixed?`${ReviewComponents.count(fixedCount,operation==="remove"?"rows":module.unit||"values")} ${verb}`:`${ReviewPageEngine.labels[issue.reviewType]||issue.type} · ${countLabel}`;
  return `<div class="head" data-ui="review.header"><div><h1>${escapeHtml(issue.displayColumn||issue.column)}</h1><div class="sub">${ReviewComponents.text(title)}</div></div>${fixed?'<span class="state" data-ui="review.header.state">Fixed</span>':'<button class="link" id="reviewAccept" data-ui="review.header.accept">Accept as is</button>'}</div><nav class="tabs" data-ui="review.tabs" aria-label="Issue review">${["explore","fix","review"].map(tab=>`<a href="#" class="tab ${session.tab===tab?"on":""} ${tab==="review"&&!decision?"off":""}" id="reviewTab-${tab}" data-review-tab="${tab}" aria-current="${session.tab===tab?"page":"false"}">${tab[0].toUpperCase()+tab.slice(1)}</a>`).join("")}</nav><div class="tab-content ${session.tab}" data-tab="${session.tab}">${session.tab==="explore"?module.renderExplore(issue,session):session.tab==="fix"?ReviewCore.fixHtml(issue):ReviewCore.reviewHtml(issue)}</div>`;
}
// CORE-19: shortcuts never intercept value, note, instruction, or content editing.
document.addEventListener("keydown",event=>{
  if(state.screen!=="issues"||event.altKey||event.ctrlKey||event.metaKey||event.target.closest("input,textarea,select,[contenteditable=true],.review-row-panel"))return;
  const issue=ReviewCore.current();if(!issue)return;
  if(["1","2","3"].includes(event.key)){event.preventDefault();ReviewCore.switchTab(issue,["explore","fix","review"][Number(event.key)-1]);}
  if(["j","k"].includes(event.key)){event.preventDefault();const open=state.issues.filter(item=>item.status==="open"),index=open.findIndex(item=>item.id===issue.id),next=open[(index+(event.key==="j"?1:open.length-1)+open.length)%open.length];if(next)ReviewCore.select(next.id);}
  if(["ArrowLeft","ArrowRight"].includes(event.key)&&event.target.matches("[data-review-tab]")){event.preventDefault();const tabs=[...document.querySelectorAll("[data-review-tab]:not(.off)")],index=tabs.indexOf(event.target),next=tabs[(index+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length];if(next){ReviewCore.switchTab(issue,next.dataset.reviewTab);document.getElementById(next.id)?.focus();}}
});
document.addEventListener("click",event=>{document.querySelectorAll(".priority-add[open]").forEach(picker=>{if(!picker.contains(event.target))picker.open=false;});});
// CORE-20, CORE-48: resizing recomposites only display geometry, keeping the preview and scope.
let reviewResizeTimer,reviewViewportWidth=window.innerWidth;
window.addEventListener("resize",()=>{if(window.innerWidth===reviewViewportWidth)return;reviewViewportWidth=window.innerWidth;clearTimeout(reviewResizeTimer);reviewResizeTimer=setTimeout(()=>{if(typeof state!=="undefined"&&state.screen==="issues"&&state.headers.length)renderPreservingReviewFocus();},100);});
