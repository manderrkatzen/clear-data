// Review detection and additional pure treatments. Existing calculations stay in CleaningEngine.
var ReviewPageEngine = ((CleaningEngine) => {
  const labels = { missing: "Missing values", "duplicate-rows": "Duplicate rows", "duplicate-values": "Repeated values", outlier: "Outliers", format: "Format mismatch", "type-mismatch": "Wrong type", "category-variants": "Inconsistent labels", whitespace: "Hidden spaces & characters", scale: "Mixed units / scale", invalid: "Impossible values", "cross-column": "Conflicting columns", constant: "Empty or constant column", "leading-zeros": "Lost leading zeros / IDs as numbers", "multi-value": "Multiple values in one cell", sensitive: "Sensitive data" };
  const extraOperations = ["mode", "groupMode", "previous", "next", "interpolate", "log", "dateFormat", "dateCap", "titlecase", "absolute", "rowValues", "swapDates", "trimEnds", "stripInvisible", "collapseSpaces", "removeHidden", "fixEncoding", "cleanCharacters", "dropColumn", "padZeros", "toText", "splitColumns", "splitRows", "splitFlags", "firstValue", "mask", "hash", "valueMap"];
  const text = value => String(value ?? "");
  const nullToken = value => /^(null|n\/?a|none|nil|undefined|--?|\?|#n\/a)$/i.test(text(value).trim());
  const normalized = value => text(value).normalize("NFKC").trim().toLowerCase().replace(/[\p{P}\s_]+/gu, "");
  function labelKey(value,column) {
    const key = normalized(value);
    if (key === "ny") return "newyork";
    const states = {ny:"newyork",ca:"california",tx:"texas",fl:"florida",wa:"washington"}, countries = {us:"unitedstates",usa:"unitedstates",uk:"unitedkingdom",gb:"unitedkingdom",greatbritain:"unitedkingdom"};
    return /state|province/i.test(column) ? states[key] || key : /country/i.test(column) ? countries[key] || key : key;
  }
  const frequencies = (rows, column, key = value => text(value)) => {
    const groups = new Map();
    for (const row of rows) { const value = key(row[column],row); if (!groups.has(value)) groups.set(value, { value, rows: [] }); groups.get(value).rows.push(row); }
    return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
  };
  function pattern(value, date = false, dateFormat = "") {
    const v = text(value).trim();
    if (!v) return "(blank)";
    if (date && dateFormat === "excel" && /^\d+$/.test(v)) return "Excel serial";
    if (date) return /^\d{4}-\d{2}-\d{2}$/.test(v) ? "YYYY-MM-DD" : /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v) ? `${dateFormat === "dmy" || Number(v.split(/[/-]/)[0]) > 12 ? "D" : "M"}${v.includes("/") ? "/" : "-"}${dateFormat === "dmy" || Number(v.split(/[/-]/)[0]) > 12 ? "M" : "D"}${v.includes("/") ? "/" : "-"}YYYY` : /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v) ? "DD.MM.YYYY" : /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(v) ? "DD-Mon-YYYY" : "text";
    if (/[$€£¥]/.test(v)) return "with currency";
    if (/%$/.test(v)) return "with %";
    if (/^[-+]?\d+,\d{1,2}$/.test(v)) return "decimal comma";
    if (/\d,\d{3}/.test(v)) return "with ,";
    try { CleaningEngine.parseNumber(v); return "plain"; } catch { return "text"; }
  }
  function sensitiveType(value, column = "") {
    const v = text(value).trim().replace(/^'(?=\+?\d)/, "");
    if (!v || /^(?:\+\d{1,3}\s*)?\*{3,}/.test(v) || /^.\*{3,}@/.test(v) || /^sha256:[a-f0-9]{64}$/.test(v)) return "";
    if (!v.includes("*") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email";
    // SENS-D-01: card candidates require Luhn, not just a long digit string.
    const digits = v.replace(/[ -]/g, "");
    if (/^\d{13,19}$/.test(digits)) {
      let sum = 0;
      for (let i = digits.length - 1, alternate = false; i >= 0; i--, alternate = !alternate) { let digit = Number(digits[i]); if (alternate) { digit *= 2; if (digit > 9) digit -= 9; } sum += digit; }
      if (sum % 10 === 0 && !/^0+$/.test(digits)) return "card";
    }
    if (/^\d{3}-\d{2}-\d{4}$/.test(v)) return "SSN";
    if (/^[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}$/i.test(v)) return "IBAN";
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every(part => Number(part) <= 255) || /^(?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}$/i.test(v) && v.includes(":")) return "IP address";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) && /^\+?[\d ()-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15) return "phone";
    if (/(?:^|[_\s])(?:email|phone|mobile|ssn|dob|name|address)(?:$|[_\s])/i.test(column)) return "named personal field";
    return "";
  }
  function mask(value) { const v = text(value).replace(/^'(?=\+?\d)/,"");if(v.includes("@"))return `${v[0]}***@${v.split("@")[1]}`;const country=/^\+(\d{1,3})[ (.-]/.exec(v);return country?`+${country[1]} *** *** ${v.replace(/\D/g,"").slice(-4)}`:v.length<=4?"***":`${"*".repeat(Math.max(3,v.length-4))}${v.slice(-4)}`; }
  function whitespaceTypes(value) {
    const v = text(value), types = [];
    if (v !== v.trim()) types.push("leading / trailing spaces");
    if (/ {2,}/.test(v)) types.push("double spaces");
    if (/\u00a0/.test(v)) types.push("non-breaking spaces");
    if (/[\t\r\n]/.test(v)) types.push("line breaks / tabs");
    if (/[\u200b-\u200d\u2060\ufeff]/.test(v)) types.push("zero-width characters");
    if (/Ã.|Â.|â€/.test(v)) types.push("broken encoding");
    return types;
  }
  function suggestedRange(column, role) {
    if (role === "date") return { type: "date", min: "1900-01-01", max: new Date().toISOString().slice(0, 10) };
    if (/age/i.test(column)) return { type: "number", min: 0, max: 120 };
    if (/rating|stars/i.test(column)) return { type: "number", min: 1, max: 5 };
    if (/pct|percent/i.test(column)) return { type: "number", min: 0, max: 100 };
    if (/price|quantity|qty|duration|days|cost|impressions|clicks/i.test(column)) return { type: "number", min: 0, max: "" };
    return null;
  }
  function violates(value, range, dateFormat = "") {
    if (!text(value).trim() || nullToken(value)) return false;
    try { const v = range.type === "date" ? dateValue(value,dateFormat || (Number(text(value).split(/[/-]/)[0]) > 12 ? "dmy" : "mdy")) : CleaningEngine.parseNumber(value); return range.min !== "" && v < range.min || range.max !== "" && v > range.max; } catch { return true; }
  }
  function detect(headers, rows, profile, existing, classifications = [], repeatableColumns = [], configuredRanges = {}, dateFormats = {}) {
    const findings = [];
    const byId = new Map(rows.map(row => [row._row,row]));
    const add = (column, reviewType, selected, details = {}) => {
      if (!selected.length) return;
      const recommendation = ({ missing: ["number", "integer"].includes(profile.columns.find(p => p.column === column)?.role) ? "impute" : "keep", outlier: "outlier", "duplicate-rows": "duplicates", "duplicate-values": "duplicates" })[reviewType] || "manual";
      findings.push({ column, columnRole: profile.columns.find(p => p.column === column)?.role || "text", reviewType, type: labels[reviewType], label: labels[reviewType], rows: selected, severity: "medium", summary: `${selected.length} affected rows in ${column}. Review the evidence before changing values.`, recommendation, status: "open", ...details });
    };
    const keyed = existing.find(i => i.recommendation === "duplicates" && i.duplicateDefinition?.mode === "key");
    if (keyed && !repeatableColumns.includes(keyed.column)) add(keyed.column,"duplicate-values",keyed.rows,{duplicateDefinition:keyed.duplicateDefinition});
    for (const p of profile.columns) {
      const column = p.column, present = rows.filter(r => text(r[column]).trim()), groups = frequencies(present, column), numeric = ["number", "integer"].includes(p.role), date = p.role === "date" || p.role !== "identifier" && (existing.some(item => item.column === column && item.candidate?.kind === "date_format") || present.length > 0 && present.filter(row => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$|^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(row[column]) || dateFormats[JSON.stringify([row._row,column,row[column]])]).length / present.length >= .6);
      const knownMissing = new Set(existing.filter(i => i.column === column && ["impute", "keep"].includes(i.recommendation)).flatMap(i => i.rows.map(r => r._row)));
      const sentinels = new Set(numeric ? groups.filter(group => { try { return [0,-1,999,9999].includes(CleaningEngine.parseNumber(group.value,p.policy)); } catch { return false; } }).map(group => group.value) : []);
      const reviewed = new Set(classifications.filter(e => e.column === column && ["resolved","legitimate","not_applicable"].includes(e.meaning) && byId.get(e.rowId)?.[column] === e.value).map(e => e.rowId));
      add(column, "missing", rows.filter(r => knownMissing.has(r._row) || !reviewed.has(r._row) && (!text(r[column]).trim() || nullToken(r[column]) || sentinels.has(text(r[column])))),{date});
      const outlier = existing.find(i => i.column === column && i.recommendation === "outlier");
      if (outlier) add(column, "outlier", outlier.rows, { outlier: outlier.outlier, outlierDefinition: outlier.outlierDefinition });
      const repeat = groups.filter(g => g.rows.length > 1);
      if (!repeatableColumns.includes(column) && CleaningEngine.isIdentifier(column) && (/(?:_?id)$/i.test(column) || groups.length / (present.length || 1) >= .95)) add(column, "duplicate-values", repeat.flatMap(g => g.rows), { duplicateDefinition: { mode: "key", columns: [column] } });
      const formatOf = row => dateFormats[JSON.stringify([row._row,column,row[column]])] || (p.policy.dateFormat !== "iso" ? p.policy.dateFormat : "");
      const patterns = frequencies(present, column, (value,row) => pattern(value,date,formatOf(row)));
      if (date || numeric || p.role !== "identifier" && patterns.some(g => !["plain", "text"].includes(g.value))) {
        if (patterns.length > 1 || date && patterns.some(group => group.value === "text") || !date && patterns.some(g => !["plain", "text"].includes(g.value))) add(column, "format", present, { date });
        if (numeric || date) add(column, "type-mismatch", present.filter(r => pattern(r[column],date,formatOf(r)) === "text" && !nullToken(r[column])), { date });
      }
      const clusters = new Map();
      if (!numeric && !date && !CleaningEngine.isIdentifier(column)) {
        groups.forEach(g => { const key = labelKey(g.value,column); if (!clusters.has(key)) clusters.set(key, []); clusters.get(key).push(g); });
        const variants = [...clusters.values()].filter(c => c.length > 1);
        add(column, "category-variants", variants.flatMap(c => c.flatMap(g => g.rows)), { clusters: variants.map(c => c.map(g => g.value)) });
      }
      add(column, "whitespace", present.filter(r => whitespaceTypes(r[column]).length));
      if (numeric) {
        const numbers = present.flatMap(r => { try { return [{ row: r, value: CleaningEngine.parseNumber(r[column]) }]; } catch { return []; } });
        const small = numbers.filter(e => e.value > 0 && e.value <= 1), large = numbers.filter(e => e.value > 1 && e.value <= 100);
        if (/pct|percent|rate/i.test(column) && small.length >= 3 && large.length >= 3) add(column, "scale", numbers.map(e => e.row));
        else if (numbers.length > 10) { const sorted = numbers.map(e => Math.abs(e.value)).filter(v => v > 0).sort((a,b) => a-b), median = CleaningEngine.stats(sorted).median; if (median > 0 && numbers.filter(e => Math.abs(e.value) >= median * 100).length >= 3) add(column, "scale", numbers.map(e => e.row)); }
      }
      const declared = existing.find(i => i.column === column && i.recommendation === "schema");
      const range = configuredRanges[column] || (declared && ["number","integer"].includes(declared.rule.type) ? {type:"number",min:declared.rule.minimum ?? "",max:declared.rule.maximum ?? ""} : suggestedRange(column, date ? "date" : p.role));
      if (range) add(column, "invalid", present.filter(r => violates(r[column],range,formatOf(r))), { range, date });
      const blanks = rows.length - present.length;
      if (blanks / rows.length >= .95 || (groups[0]?.rows.length || 0) / rows.length >= .99) add(column, "constant", rows);
      if (CleaningEngine.isIdentifier(column) && present.every(r => /^\d+$/.test(text(r[column]).trim()))) {
        const lengths = frequencies(present, column, v => text(v).trim().length);
        if (lengths.length > 1) add(column, "leading-zeros", present, { width: Number(lengths[0].value) });
      }
      const multi = present.filter(r => /;|\|| \/ |,\s*[^\d]/.test(r[column]));
      if (multi.length && multi.length < present.length * .5) add(column, "multi-value", multi, { separator: multi.some(r => text(r[column]).includes(";")) ? ";" : multi.some(r => text(r[column]).includes("|")) ? "|" : multi.some(r => text(r[column]).includes(" / ")) ? " / " : "," });
      add(column, "sensitive", present.filter(r => sensitiveType(r[column], column)));
    }
    const duplicates = new Map();
    rows.forEach(r => { const key = JSON.stringify(headers.map(c => r[c])); if (!duplicates.has(key)) duplicates.set(key, []); duplicates.get(key).push(r); });
    add(headers[0], "duplicate-rows", [...duplicates.values()].filter(g => g.length > 1).flat(), { displayColumn: "All columns", duplicateDefinition: { mode: "exact", columns: headers } });
    for (const i of existing.filter(i => ["metric", "metricBlocked", "relation", "schema", "valid"].includes(i.recommendation))) add(i.column, i.recommendation === "schema" ? "invalid" : "cross-column", i.rows, { ...i, reviewType: i.recommendation === "schema" ? "invalid" : "cross-column" });
    const find = regex => headers.find(c => regex.test(c));
    const suggest = (target, left, right, operation) => {
      if (!target || !left || !right || findings.some(i => i.reviewType === "cross-column" && i.column === target)) return;
      const rule = { id: `auto:${target}`, name: `${target} = ${left} ${operation === "difference" ? "−" : "+"} ${right}`, target, column: target, left, right, operation, factor: 1, decimals: 2, tolerance: 1 };
      const violations = rows.filter(r => { try { const a = CleaningEngine.parseNumber(r[left]), b = CleaningEngine.parseNumber(r[right]), t = CleaningEngine.parseNumber(r[target]); return Math.abs(t - (operation === "difference" ? a-b : a+b)) > rule.tolerance; } catch { return false; } });
      add(target, "cross-column", violations, { rule, recommendation: "manual" });
    };
    suggest(find(/^profit(?:_|$)/i), find(/^revenue(?:_|$)/i), find(/^(?:cost|total_cost)(?:_|$)/i), "difference");
    const start = find(/start.*date|date.*start/i), end = find(/end.*date|date.*end/i);
    if (start && end) add(end, "cross-column", rows.filter(r => { try { return dateValue(r[end],dateFormats[JSON.stringify([r._row,end,r[end]])] || profile.columns.find(column => column.column === end).policy.dateFormat) < dateValue(r[start],dateFormats[JSON.stringify([r._row,start,r[start]])] || profile.columns.find(column => column.column === start).policy.dateFormat); } catch { return false; } }), { rule: { id: `auto:${end}`, name: `${end} must be on or after ${start}`, column: end, left: end, right: start, kind: "comparison", operator: ">=", comparisonType: "date" } });
    const clicks = find(/^clicks$/i), impressions = find(/^impressions$/i);
    if (clicks && impressions && !findings.some(i => i.reviewType === "cross-column" && i.column === clicks)) add(clicks, "cross-column", rows.filter(r => Number(r[clicks]) > Number(r[impressions])), { rule: { id: "auto:clicks", name: "clicks must not exceed impressions", column: clicks, left: clicks, right: impressions, kind: "comparison", operator: "<=", comparisonType: "number" } });
    const total = find(/^total(?:_|$)/i), parts = headers.filter(c => /^(?:subtotal|tax|shipping|fee)(?:_|$)/i.test(c));
    if (total && parts.length >= 2 && !findings.some(i => i.reviewType === "cross-column" && i.column === total)) {
      const rule = {id:`auto:${total}`,name:`${total} = ${parts.join(" + ")}`,column:total,target:total,left:parts[0],right:parts[1],operation:"sum",terms:parts,factor:1,decimals:2,tolerance:1};
      add(total,"cross-column",rows.filter(r => { try { return Math.abs(CleaningEngine.parseNumber(r[total])-parts.reduce((n,c) => n+CleaningEngine.parseNumber(r[c]),0)) > 1; } catch { return false; } }),{rule});
    }
    const unique = new Map();
    findings.forEach(i => { const key = `${i.column}:${i.reviewType}`; if (!unique.has(key)) unique.set(key, i); });
    return [...unique.values()].map((i, index) => ({ ...i, id: index + 1 }));
  }
  function dateValue(value, source = "mdy") {
    const v = text(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return CleaningEngine.parseDate(v);
    if(v.includes("T")) {const [head,time]=v.split("T"),day=dateValue(head,source),parsed=Date.parse(`${day}T${time}`);if(!Number.isFinite(parsed))throw new Error("not a real date");return new Date(parsed).toISOString().slice(0,10);}
    if(/^\d{4}\/\d{2}\/\d{2}$/.test(v))return CleaningEngine.parseDate(v.replaceAll("/","-"));
    if(/^\d{5}$/.test(v)&&Number(v)>=20000&&Number(v)<=60000)return CleaningEngine.parseDate(v,"excel");
    const long=/^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(v);
    if(long){const months=["january","february","march","april","may","june","july","august","september","october","november","december"],month=months.findIndex(name=>name===long[1].toLowerCase()||name.slice(0,3)===long[1].toLowerCase())+1;return CleaningEngine.parseDate(`${long[3]}-${String(month).padStart(2,"0")}-${long[2].padStart(2,"0")}`);}
    const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v);
    if (named) { const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(named[2].toLowerCase())+1; return CleaningEngine.parseDate(`${named[3]}-${String(month).padStart(2,"0")}-${named[1].padStart(2,"0")}`); }
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v)) return CleaningEngine.parseDate(v.replaceAll(".", "/"), "dmy");
    if(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)){const parts=v.split(/[/-]/);if(Number(parts[0])>12)return CleaningEngine.parseDate(v,"dmy");if(Number(parts[1])>12)return CleaningEngine.parseDate(v,"mdy");}
    return CleaningEngine.parseDate(v, source);
  }
  function renderDate(iso, format) {
    const [y,m,d] = iso.slice(0,10).split("-");
    if (format === "dmy") return `${d}/${m}/${y}`;
    if (format === "mdy") return `${m}/${d}/${y}`;
    if (format === "mon") return `${d}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)-1]}-${y}`;
    if(format==="ymdSlash")return `${y}/${m}/${d}`;
    if(format==="dotted")return `${d}.${m}.${y}`;
    if(format==="long")return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)-1]} ${Number(d)}, ${y}`;
    if(format==="excel") {const days=Math.round((Date.parse(`${y}-${m}-${d}`)-Date.UTC(1899,11,31))/86400000);return String(days>=60?days+1:days);}
    return iso;
  }
  function fixEncoding(value) {
    const cp = {"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
    return text(value).replace(/[ÃÂ][\u0080-\u00bf]|â(?:€[^\s]|[\u0080-\u00bf]{2})/g,part => { try { return decodeURIComponent(Array.from(part,c => `%${(cp[c] || c.charCodeAt(0)).toString(16).padStart(2,"0")}`).join("")); } catch { return part; } });
  }
  function applyPreview(headers, rows, preview) {
    const next = rows.map(r => ({ ...r })), byId = new Map(next.map(r => [r._row,r]));
    preview.patches.forEach(p => { if (byId.has(p.rowId)) byId.get(p.rowId)[p.column] = p.after; });
    const removed = new Set(preview.removedRows.map(r => r._row));
    return next.filter(r => !removed.has(r._row)).concat((preview.addedRows || []).map(r => ({ ...r })));
  }
  function treatment(headers, rows, eligibleIds, column, draft, policy, classifications, options) {
    const selected = CleaningEngine.scopeRows(rows, eligibleIds, draft.scope, { ...options, policies: options.policies || [policy], classifications });
    const patches = [], blocked = [], removedRows = [], addedRows = [], addedColumns = [], removedColumns = [], provenance = [], rowLineage = [];
    const ids = new Set(selected.map(r => r._row)), reference = rows.filter(r => !ids.has(r._row) && CleaningEngine.observationState(r,column,policy,classifications) === "present");
    const mode = values => frequencies(values, column)[0]?.value;
    const referenceStats = CleaningEngine.stats(reference.flatMap(r => { try { return [CleaningEngine.parseNumber(r[column],policy)]; } catch { return []; } }));
    let groupLabels = null;
    if (draft.operation === "groupMode" && draft.groupBanding && draft.groupColumns?.length) {
      const analysis = typeof AnalysisEngine !== "undefined" ? AnalysisEngine : require("./analysis-engine.js"), context = analysis.prepare(headers,rows,{...options,policies:options.policies || [policy],classifications});
      const definitions = draft.groupColumns.map(c => analysis.bandsFor(context,c,draft.groupBanding[c] || {mode:"quantiles",k:5,minCategoryCount:5}));
      groupLabels = new Map(rows.map((r,i) => [r._row,definitions.map(d => d.labels[i]).join(" · ")]));
    }
    const addColumn = name => { if (headers.includes(name) || addedColumns.includes(name)) throw new Error(`Column ${name} already exists.`); addedColumns.push(name); };
    if (draft.operation === "dropColumn") { if (headers.length < 2) throw new Error("Keep at least one column."); removedColumns.push(column); }
    if (draft.operation === "log") addColumn(`${column}_log`);
    if (draft.operation === "splitColumns") {
      if (!draft.separator) throw new Error("Choose a separator.");
      const count = Math.max(...selected.map(r => text(r[column]).split(draft.separator).length), 1);
      if (count > 50) throw new Error("Splitting is limited to 50 columns.");
      for (let i = 1; i <= count; i++) addColumn(`${column}_${i}`);
    }
    // MULTI-F-01: encode the complete column into new flags; original cells stay intact.
    if (draft.operation === "splitFlags") {
      if (!draft.separator) throw new Error("Choose a separator.");
      const values = [...new Set(rows.flatMap(row => text(row[column]).split(draft.separator).map(value => value.trim()).filter(Boolean)))];
      if (!values.length || values.length > 20) throw new Error("Flags need between 1 and 20 distinct values.");
      for (const value of values) {
        const name = `${column}_${value}`;
        if (name.length > 200 || name === "_row") throw new Error("A flag column name is too long.");
        addColumn(name);
        for (const row of rows) patches.push({rowId:row._row,column:name,before:"",after:text(row[column]).split(draft.separator).map(part => part.trim()).includes(value) ? "1" : "0"});
      }
    }
    let nextId = Math.max(0, ...rows.map(r => r._row), ...(options.identityIds || []));
    for (const row of selected) {
      const before = text(row[column]); let after = before;
      try {
        if (["mode","groupMode"].includes(draft.operation)) {
          if (draft.operation === "groupMode" && !draft.groupColumns?.length) throw new Error("Choose grouping columns.");
          const source = draft.operation === "groupMode" ? reference.filter(r => groupLabels ? groupLabels.get(r._row) === groupLabels.get(row._row) : draft.groupColumns.every(c => r[c] === row[c])) : reference;
          after = mode(source); if (after === undefined) throw new Error("No present reference values in this group.");
          const donors = source.filter(r => r[column] === after); provenance.push({rowId:row._row,column,method:draft.operation,sourceRowIds:donors.slice(0,20).map(r => r._row),sourceCount:donors.length,groupLabel:groupLabels?.get(row._row) || ""});
        }
        if (["previous","next","interpolate"].includes(draft.operation)) {
          if (!headers.includes(draft.orderColumn)) throw new Error("Choose a date column for ordering.");
          const orderFormat = options.policies?.find(policy => policy.column === draft.orderColumn)?.dateFormat || "iso", orderedDate = record => dateValue(record[draft.orderColumn],options.dateFormats?.[JSON.stringify([record._row,draft.orderColumn,record[draft.orderColumn]])] || orderFormat);
          const t = Date.parse(orderedDate(row));
          const ordered = reference.flatMap(r => { try { return [{ row:r, t:Date.parse(orderedDate(r)) }]; } catch { return []; } }).sort((a,b) => a.t-b.t || a.row._row-b.row._row);
          const previous = ordered.filter(e => e.t < t).at(-1), next = ordered.find(e => e.t > t);
          if (draft.operation === "interpolate") { if (!previous || !next) throw new Error("Interpolation needs present values on both sides."); const a = CleaningEngine.parseNumber(previous.row[column],policy), b = CleaningEngine.parseNumber(next.row[column],policy); after = (a+(b-a)*(t-previous.t)/(next.t-previous.t)).toFixed(Number(draft.decimals)); }
          else { const neighbour = draft.operation === "previous" ? previous : next; if (!neighbour) throw new Error("No present neighbour in the chosen direction."); after = neighbour.row[column]; }
          provenance.push({rowId:row._row,column,method:draft.operation,orderColumn:draft.orderColumn,sourceRowIds:draft.operation === "interpolate" ? [previous.row._row,next.row._row] : [(draft.operation === "previous" ? previous : next).row._row]});
        }
        const sourceDateFormat = draft.forceDateInterpretation ? draft.dateFormat : options.dateFormats?.[JSON.stringify([row._row,column,before])] || draft.dateFormat;
        if (draft.operation === "dateFormat") after = renderDate(dateValue(before,sourceDateFormat),draft.targetFormat);
        if (draft.operation === "dateCap") { const iso = dateValue(before,sourceDateFormat); if (draft.lower && draft.upper && draft.lower > draft.upper) throw new Error("Minimum date must not exceed maximum."); after = draft.lower && iso < draft.lower ? CleaningEngine.parseDate(draft.lower) : draft.upper && iso > draft.upper ? CleaningEngine.parseDate(draft.upper) : iso; }
        if (draft.operation === "titlecase") after = before.toLowerCase().replace(/\b\p{L}/gu,c => c.toUpperCase());
        if (draft.operation === "absolute") after = Math.abs(CleaningEngine.parseNumber(before,policy)).toFixed(Number(draft.decimals));
        if (draft.operation === "rowValues") { if(typeof draft.rowMapping?.[row._row]!=="string")throw new Error("No checked target value for this row.");after=draft.rowMapping[row._row]; }
        if (draft.operation === "swapDates") {
          if(!headers.includes(draft.otherColumn)||draft.otherColumn===column)throw new Error("Choose the other date column.");
          const formatFor=field=>options.dateFormats?.[JSON.stringify([row._row,field,row[field]])] || options.policies?.find(policy=>policy.column===field)?.dateFormat || "iso";
          const other=dateValue(row[draft.otherColumn],formatFor(draft.otherColumn)), current=dateValue(before,formatFor(column));
          after=other; patches.push({rowId:row._row,column:draft.otherColumn,before:row[draft.otherColumn],after:current});
        }
        if (draft.operation === "trimEnds") after = before.trim();
        if (draft.operation === "stripInvisible") after = before.replace(/[\u200b-\u200d\u2060\ufeff\r\n]/g,"");
        if (draft.operation === "collapseSpaces") after = before.replace(/\s+/g," ");
        if (["removeHidden","cleanCharacters"].includes(draft.operation)) after = before.replace(/[\u200b-\u200d\u2060\ufeff]/g,"").replace(/[\t\r\n\u00a0]/g," ");
        if (["fixEncoding","cleanCharacters"].includes(draft.operation)) after = fixEncoding(after);
        if(draft.operation==="fixEncoding"&&(after.includes("\ufffd")||whitespaceTypes(after).includes("broken encoding")))throw new Error("Encoding repair could not produce valid characters; review the original source."); // WS-F-03
        if (draft.operation === "cleanCharacters") after = after.trim().replace(/\s+/g," ");
        if (draft.operation === "cleanCharacters" && draft.characterTypes) { after=before;const selected=new Set(draft.characterTypes);if(selected.has("zero-width characters"))after=after.replace(/[\u200b-\u200d\u2060\ufeff]/g,"");if(selected.has("line breaks / tabs"))after=after.replace(/[\r\n\t]/g," ");if(selected.has("non-breaking spaces"))after=after.replace(/\u00a0/g," ");if(selected.has("double spaces"))after=after.replace(/ {2,}/g," ");if(selected.has("leading / trailing spaces"))after=after.trim();if(selected.has("broken encoding")){after=fixEncoding(after);if(after.includes("\ufffd")||whitespaceTypes(after).includes("broken encoding"))throw new Error("Encoding repair could not produce valid characters; review the original source.");} }
        if (draft.operation === "padZeros") { const raw=before.trim();if (!/^\d+$/.test(raw) || !Number.isInteger(Number(draft.width)) || draft.width < raw.length || draft.width > 100) throw new Error("Choose a length at least as long as this digit-only code (maximum 100)."); after = raw.padStart(Number(draft.width),"0"); }
        if (draft.operation === "valueMap") { if (!Object.hasOwn(draft.mapping || {},before)) throw new Error("AI could not confidently parse this value."); after = draft.mapping[before]; }
        if (draft.operation === "mask") after = mask(before);
        if (draft.operation === "hash") { if (!draft.mapping?.[before]) throw new Error("Prepare the SHA-256 preview first."); after = draft.mapping[before]; }
        if (["firstValue","splitRows","splitColumns"].includes(draft.operation)) {
          if (!draft.separator) throw new Error("Choose a separator.");
          const parts = before.split(draft.separator).map(v => v.trim()).filter(Boolean);
          if (parts.length < 2) throw new Error("The chosen separator is absent. Choose the right separator or keep this value.");
          if (draft.operation === "splitColumns") addedColumns.forEach((c,i) => patches.push({ rowId:row._row,column:c,before:"",after:parts[i] || "" }));
          else { after = parts[0]; if (draft.operation === "splitRows") { if (parts.length > 100) throw new Error("Splitting is limited to 100 rows per cell."); parts.slice(1).forEach((value,index) => { const added = {...row,[column]:value,_row:++nextId}; addedRows.push(added); rowLineage.push({rowId:added._row,sourceRowId:row._row,column,part:index+2}); }); } }
        }
        if (draft.operation === "log") { const n = CleaningEngine.parseNumber(before,policy),offset=Number(draft.logOffset||0);if(n+offset<=0)throw new Error("Log requires x + offset to be positive.");patches.push({rowId:row._row,column:`${column}_log`,before:"",after:Math.log(n+offset).toFixed(Number(draft.decimals))}); }
        if (after !== before) patches.push({rowId:row._row,column,before,after});
      } catch (error) { blocked.push({rowId:row._row,reason:error.message}); }
    }
    const patched = new Set(patches.map(patch=>JSON.stringify([patch.rowId,patch.column]))),derivedUnavailable=[];
    addedColumns.forEach((c,index) => rows.filter(r => !patched.has(JSON.stringify([r._row,c]))).forEach(r => {
      let after=draft.operation==="splitColumns"?text(r[column]).split(draft.separator).map(value=>value.trim()).filter(Boolean)[index] || "":"";
      // OUT: a derived log column covers the usable column, while originals and scoped decisions stay intact.
      if(draft.operation==="log"&&CleaningEngine.observationState(r,column,policy,classifications)==="present") {try{const value=CleaningEngine.parseNumber(r[column],policy)+Number(draft.logOffset||0);if(value<=0)throw new Error("x + offset must be positive");after=Math.log(value).toFixed(Number(draft.decimals));}catch(error){derivedUnavailable.push({rowId:r._row,reason:error.message});}}
      patches.push({rowId:r._row,column:c,before:"",after});
    }));
    return { selectedIds:selected.map(r => r._row),patches,blocked,removedRows,addedRows,addedColumns,removedColumns,referenceStats,provenance,rowLineage,derivedUnavailable };
  }
  function replay(originalHeaders, original, changes) {
    let headers = [...originalHeaders], rows = original.map(r => ({ ...r }));
    for (const change of [...changes].reverse()) {
      const structure = change.structure || {};
      for (const c of structure.addedColumns || []) if (!headers.includes(c)) { headers.push(c); rows.forEach(r => { r[c] = ""; }); }
      const activeIds = new Set(rows.map(row => row._row));
      // Undo an earlier structural decision without hiding later explicitly approved patches.
      for (const patch of change.patches) {
        if (!headers.includes(patch.column)) { headers.push(patch.column); rows.forEach(row => { row[patch.column] = ""; }); }
        if (!activeIds.has(patch.rowId)) {
          const source = change.reviewImpact?.beforeRows.find(row => row._row === patch.rowId);
          if (!source) throw new Error("A later decision references an unavailable row identity.");
          rows.push({...source});
          activeIds.add(patch.rowId);
        }
      }
      rows = applyPreview(headers,rows,{patches:change.patches,removedRows:change.removedRows || [],addedRows:structure.addedRows || []});
      headers = headers.filter(c => !(structure.removedColumns || []).includes(c));
    }
    return { headers, rows };
  }
  function identityPool(original,current,changes,audit = []) {
    const pool = new Map(original.map(r => [r._row,{...r}]));
    for (const entry of [...audit.map(e => e.decision),...changes]) for (const row of entry?.structure?.addedRows || []) if (!pool.has(row._row)) pool.set(row._row,{...row});
    current.forEach(r => pool.set(r._row,r));
    return [...pool.values()];
  }
  return { labels,extraOperations,frequencies,pattern,sensitiveType,mask,whitespaceTypes,suggestedRange,violates,detect,treatment,applyPreview,replay,identityPool,dateValue,renderDate,normalized,labelKey };
})(typeof CleaningEngine !== "undefined" ? CleaningEngine : require("./cleaning-engine.js"));
if (typeof module !== "undefined") module.exports = ReviewPageEngine;
