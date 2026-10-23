// CORE-40, CORE-41, CORE-42, CORE-43, CORE-44, CORE-45, CORE-46, CORE-47: traceable chart primitives.
var ReviewCharts = (() => {
  const colors = {before:"#C9CFD8",after:"#2E6BD9",neutral:"#C9CFD8",problem:"#E07B39"};
  const chartWidth = (options = {}) => {
    if(typeof window==="undefined")return 720;
    const viewport=window.innerWidth,rail=viewport>800?(document.querySelector(".sidebar")?.offsetWidth||196):0,task=viewport-rail-(viewport>800?260:0),gutters=viewport<=800?32:task<=520?48:96;
    const wrap=document.querySelector("#screen .main .wrap"),available=wrap?.clientWidth||task-gutters;
    return Math.max(240,Math.min(options.max||720,options.small&&viewport>620?(available-14)/2:available));
  };
  const numeric = (rows,column,excluded = new Set(),options = {}) => {
    const classifications=options.snapshot?[]:effectiveClassifications(),policy=options.policy || columnPolicy(column),index=new Map(classifications.map(entry=>[`${entry.rowId}:${entry.column}`,entry]));
    return rows.flatMap(row=>{if(excluded.has(row._row) || CleaningEngine.observationState(row,column,policy,index)!=="present")return [];try{return [CleaningEngine.parseNumber(row[column],policy)];}catch{return [];}});
  };
  function skew(values) { if (values.length < 3) return 0; const mean = CleaningEngine.stats(values).mean, variance = values.reduce((sum,value) => sum+(value-mean)**2,0)/values.length; return variance ? values.reduce((sum,value) => sum+(value-mean)**3,0)/values.length/variance**1.5 : 0; }
  function histogramChart(column,beforeRows,afterRows,options = {}) {
    const before = numeric(beforeRows,column,options.missingBefore || new Set(),options), after = numeric(afterRows,column,options.missingAfter || new Set(),options);
    if (!before.length && !after.length) return '<p class="review-empty-copy">No present numerical values are available for a distribution.</p>';
    const log = options.log ?? skew(before.length ? before : after) > 2, signed = before.concat(after).some(value => value < 0), transform = value => !log ? value : signed ? Math.sign(value)*Math.log1p(Math.abs(value)) : Math.log1p(Math.max(0,value)), inverse = value => !log ? value : signed ? Math.sign(value)*Math.expm1(Math.abs(value)) : Math.expm1(value);
    const sets = [before,after].map(values => values.map(transform)), distribution = AnalysisEngine.histogram(sets,20), bins = distribution.bins, canvasWidth=chartWidth(options), left = 42, width = canvasWidth-58, bottom = 166, height = 116;
    // CORE-41, CORE-44: percentages use each series' own population; the complete After series includes all changes.
    const afterIds=new Set(afterRows.map(row=>row._row)),marksByRow=new Map((options.patches || []).filter(patch=>patch.column===column).map(patch=>[patch.rowId,patch]));
    const filled=[...marksByRow.values()].flatMap(patch=>{if(!afterIds.has(patch.rowId) || options.missingAfter?.has(patch.rowId) || !String(patch.after??"").trim())return [];try{return [CleaningEngine.parseNumber(patch.after,options.policy || columnPolicy(column))];}catch{return [];}});
    const rates = distribution.sets.map((set,index) => set.counts.map(count => count/Math.max(1,sets[index].length))), ymax = options.ymax || Math.max(.01,...rates.flat()), x = value => left+Math.max(0,Math.min(1,(transform(value)-distribution.min)/(distribution.max-distribution.min || 1)))*width;
    // CORE-40…45: responsive geometry changes pixels, never the shared bins, rates, or medians.
    const issue=typeof ReviewCore.current==="function"?ReviewCore.current():null,current=issue?.column===column?issue:null,recorded=options.recorded ?? Boolean(current&&ReviewCore.data(current).tab==="review"),isFill=options.changeKind?options.changeKind==="fill":current?.reviewType==="missing";
    const binWidth=width/bins,barWidth=Math.max(1.5,binWidth*.4),beforeOffset=binWidth*.08,afterOffset=binWidth*.52,basePrecision=ReviewCore.precision(column);
    const problemSeries=/missing|flagged|violat/i.test(options.beforeLabel||"");
    const bars=distribution.sets[0].counts.map((_,index)=>{
      const start=inverse(distribution.min+(distribution.max-distribution.min)*index/bins),end=inverse(distribution.min+(distribution.max-distribution.min)*(index+1)/bins),span=Math.abs(end-start),decimals=Math.max(basePrecision,span?Math.min(12,Math.max(0,Math.ceil(-Math.log10(span))+1)):0),lower=ReviewCore.format(start,column,{decimals}),upper=ReviewCore.format(end,column,{decimals}),interval=lower===upper?`Value ${lower}`:`Value ${lower}–${upper}`,inclusive=index===bins-1||start===end;
      return [0,1].map(series=>{
        const count=distribution.sets[series].counts[index],share=rates[series][index],barHeight=share/ymax*height,label=series?(options.afterLabel||"After"):(options.beforeLabel||"Before"),valueText=`${count.toLocaleString()} ${count===1?"value":"values"} · ${(share*100).toLocaleString(undefined,{maximumFractionDigits:2})}%`,description=`${label}. ${interval}${!inclusive&&start!==end?", upper bound excluded":""}. ${valueText}`;
        return `<rect data-series="${series?"after":"before"}" data-bin-index="${index}" data-bin-start="${start}" data-bin-end="${end}" data-bin-count="${count}" data-tooltip-series="${escapeHtml(label)}" data-tooltip-range="${escapeHtml(interval)}" data-tooltip-values="${escapeHtml(valueText)}" data-bin-inclusive="${inclusive}" tabindex="${count?0:-1}" role="img" aria-label="${escapeHtml(description)}" x="${left+index*binWidth+(series?afterOffset:beforeOffset)}" y="${bottom-barHeight}" width="${barWidth}" height="${barHeight}" fill="${series?colors.after:problemSeries?colors.problem:"#B6CBF2"}"><title>${escapeHtml(description)}</title></rect>`;
      }).join("");
    }).join("");
    const medians = [CleaningEngine.stats(before).median,CleaningEngine.stats(after).median];
    // INV-E-03, INV-R-02: a visible bounded validity band shares the distribution's axes.
    const range=options.range, low=range?.min!==undefined && range.min!=="" ? x(Number(range.min)) : left, high=range?.max!==undefined && range.max!=="" ? x(Number(range.max)) : left+width;
    const validBand=range ? `<rect x="${low}" y="50" width="${Math.max(0,high-low)}" height="${height}" fill="${colors.after}" opacity=".09"/><text x="${low+3}" y="42">Valid range</text>` : "";
    const filledStats=CleaningEngine.stats(filled),minimum=ReviewCore.format(filledStats.min,column),maximum=ReviewCore.format(filledStats.max,column),landing=minimum===maximum?`with ${minimum}`:`with values between ${minimum} and ${maximum}`,amount=filled.length.toLocaleString(),takeaway=options.title || (filled.length?`${isFill?(recorded?"Filled":"Fill"):(recorded?"Updated":"Update")} ${amount} ${isFill?"missing cells":"values"} ${landing}.`:"Compare the value distributions before and after.");
    const grid=[0,.5,1].map(fraction=>{const y=bottom-height*fraction;return `<line x1="${left}" x2="${left+width}" y1="${y}" y2="${y}" stroke="${colors.before}" stroke-opacity=".4"/><text x="${left-8}" y="${y+4}" text-anchor="end">${Math.round(ymax*fraction*100)}%</text>`;}).join("");
    const details=[["Present numeric values",before.length.toLocaleString(),after.length.toLocaleString()],["Median",ReviewCore.format(medians[0],column),ReviewCore.format(medians[1],column)],["Below displayed range",distribution.sets[0].below,distribution.sets[1].below],["Above displayed range",distribution.sets[0].above,distribution.sets[1].above]];
    return `<figure class="review-chart review-chart-impact ${problemSeries?"histogram-problem":""} ${options.compact ? "compact" : ""}"><figcaption>${escapeHtml(takeaway)}</figcaption><div class="review-chart-legend"><span class="before">${escapeHtml(options.beforeLabel || "Before")}</span><span class="after">${escapeHtml(options.afterLabel || "After")}</span></div><svg viewBox="0 0 ${canvasWidth} 208" role="group" aria-label="${escapeHtml(takeaway)}"><text x="${left}" y="20">Share of values</text>${grid}${validBand}${bars}<text x="${left}" y="185">${ReviewCore.format(inverse(distribution.min),column)}</text><text x="${left+width}" y="185" text-anchor="end">${ReviewCore.format(inverse(distribution.max),column)}</text><text x="${left+width/2}" y="205" text-anchor="middle">${log?"Value (log scale)":"Value"}</text></svg><div class="review-bar-tooltip" role="tooltip" hidden><strong></strong><span></span><small></small></div><details class="review-chart-details"><summary>Chart details</summary><p>Each series uses its own present numeric values as the percentage base. Blank and nonnumeric cells are not plotted. The chart shows the central 1st–99th percentile range${log?" on a logarithmic value axis":""}; values outside it are counted below. Bar intervals include the lower bound and exclude the upper bound, except the final interval which includes both.</p><table><thead><tr><th scope="col">Measure</th><th scope="col">${escapeHtml(options.beforeLabel || "Before")}</th><th scope="col">${escapeHtml(options.afterLabel || "After")}</th></tr></thead><tbody>${details.map(([label,a,b])=>`<tr><th scope="row">${label}</th><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td></tr>`).join("")}</tbody></table></details></figure>`;
  }
  function categoryChart(column,before,after,options = {}) { // CORE-33: changed-only previews omit unchanged categories; full Review can override.
    const count = rows => ReviewPageEngine.frequencies(rows,column,options.canonicalize || (value=>String(value??""))), value = group => options.metric ? ReviewCore.total(group.rows,options.metric) : group.rows.length, old = new Map(count(before).map(group=>[group.value,value(group)])), next = new Map(count(after).map(group=>[group.value,value(group)])), keys = [...new Set([...old.keys(),...next.keys()])], changed = keys.filter(key=>(old.get(key)||0)!==(next.get(key)||0)), shown = options.keys || (options.changedOnly ? changed : keys.sort((a,b)=>(next.get(b)||0)-(next.get(a)||0)).slice(0,10));
    if (!options.changedOnly && (old.has("") || next.has("")) && !shown.includes("")) shown.push("");
    if (!shown.length) return '<p class="review-empty-copy">No category totals change.</p>';
    const max = Math.max(1,...shown.flatMap(key=>[Math.abs(old.get(key)||0),Math.abs(next.get(key)||0)]));
    return `<figure class="review-chart"><figcaption>${escapeHtml(options.title || `${changed.length} labels change; ${keys.length-changed.length} others unchanged`)}</figcaption><div class="review-chart-legend"><span class="before">Before</span><span class="after">After</span>${options.metric ? `<span>${escapeHtml(options.metric)}</span>` : ""}</div><div class="review-category-bars">${shown.map(key=>`<div class="${changed.includes(key) ? "changed" : "unchanged"}"><span>${escapeHtml(key || "(blank)")}</span><div><i class="before" style="width:${Math.abs(old.get(key)||0)/max*100}%"></i><i class="after" style="width:${Math.abs(next.get(key)||0)/max*100}%"></i></div><b>${options.metric ? ReviewCore.money(old.get(key)||0,options.metric) : old.get(key)||0} → ${options.metric ? ReviewCore.money(next.get(key)||0,options.metric) : next.get(key)||0}</b></div>`).join("")}</div></figure>`;
  }
  function timeline(column,before,after,range) { // INV-E-03, INV-R-02: date positions share one axis and a shaded valid interval.
    const parse=rows=>rows.flatMap(row=>{try{return [{row,date:ReviewPageEngine.dateValue(row[column],reviewDateFormats()[JSON.stringify([row._row,column,row[column]])] || columnPolicy(column).dateFormat)}];}catch{return [];}}), sets=[parse(before),parse(after)], values=sets.flat().map(entry=>Date.parse(entry.date));
    if (!values.length) return '<p class="review-empty-copy">No valid calendar dates are available for a timeline.</p>';
    const min=Math.min(...values),max=Math.max(...values),x=value=>35+Math.max(0,Math.min(1,(Date.parse(value)-min)/(max-min||1)))*635, low=range.min ? x(range.min) : 35, high=range.max ? x(range.max) : 670;
    return `<figure class="review-chart"><figcaption>Valid dates run from ${escapeHtml(range.min || "the first observed date")} to ${escapeHtml(range.max || "the last observed date")}</figcaption><div class="review-chart-legend"><span class="before">Before ${sets[0].length}</span><span class="after">After ${sets[1].length}</span></div><svg viewBox="0 0 720 130" role="img" aria-label="Date timeline with the valid interval shaded"><rect x="${low}" y="20" width="${Math.max(0,high-low)}" height="80" fill="${colors.after}" opacity=".09"/>${sets.map((entries,index)=>entries.map(entry=>`<circle cx="${x(entry.date)}" cy="${index ? 75 : 45}" r="3" fill="${index ? colors.after : colors.before}"><title>Row ${entry.row._row}: ${entry.date}</title></circle>`).join("")).join("")}<text x="35" y="122">${new Date(min).toISOString().slice(0,10)}</text><text x="670" y="122" text-anchor="end">${new Date(max).toISOString().slice(0,10)}</text></svg></figure>`;
  }
  function bindInteractions(root){
    root.querySelectorAll(".review-chart-impact").forEach(figure=>{
      const tooltip=figure.querySelector(".review-bar-tooltip");if(!tooltip)return;
      let pinned=null;
      const hide=()=>{tooltip.hidden=true;pinned=null;};
      const show=bar=>{
        tooltip.querySelector("strong").textContent=bar.dataset.tooltipSeries;
        tooltip.querySelector("span").textContent=bar.dataset.tooltipRange;
        tooltip.querySelector("small").textContent=bar.dataset.tooltipValues;
        tooltip.hidden=false;
        const bounds=figure.getBoundingClientRect(),mark=bar.getBoundingClientRect();
        tooltip.style.left=`${Math.max(8,Math.min(bounds.width-tooltip.offsetWidth-8,mark.left-bounds.left+mark.width/2-tooltip.offsetWidth/2))}px`;
        tooltip.style.top=`${Math.max(0,mark.top-bounds.top-tooltip.offsetHeight-8)}px`;
      };
      const barAt=event=>event.target.closest?.("[data-series][data-bin-index]");
      figure.onpointerover=event=>{const bar=barAt(event);if(bar&&!pinned)show(bar);};
      figure.onpointerout=event=>{if(barAt(event)&&!pinned)tooltip.hidden=true;};
      figure.addEventListener("focusin",event=>{const bar=barAt(event);if(bar)show(bar);});
      figure.addEventListener("focusout",()=>{if(!pinned)tooltip.hidden=true;});
      figure.onclick=event=>{const bar=barAt(event);if(!bar||pinned===bar)hide();else{pinned=bar;show(bar);}};
      figure.onkeydown=event=>{if(event.key==="Escape"){event.stopPropagation();hide();}else if(["Enter"," "].includes(event.key)&&barAt(event)){event.preventDefault();const bar=barAt(event);if(pinned===bar)hide();else{pinned=bar;show(bar);}}};
      root.addEventListener("pointerdown",event=>{if(!figure.contains(event.target))hide();},true);
    });
  }
  return {colors,numeric,skew,width:chartWidth,histogram:histogramChart,categories:categoryChart,timeline,bindInteractions};
})();
