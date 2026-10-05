// Pure, deterministic profiling and treatment functions shared by the browser,
// profiling worker, and Node regressions. No function mutates source records.
var CleaningEngine = (() => {
  const operations = ["retain", "missing", "constant", "median", "mean", "groupMedian", "trim", "lowercase", "uppercase", "map", "parseNumber", "parseDate", "cap", "remove", "recalculate", "deduplicate", "mergeDuplicates"];
  const missingPattern = /^(null|n\/?a|none|nil|unknown|not available|not applicable|missing|undefined|--?|\?)$/i;
  const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const text = value => String(value ?? "");
  const isIdentifier = column => /(^id$|[_\s]id$|code$|postal|zip|phone|account|identifier)/i.test(column);
  function parseNumber(value, policy = {}) {
    let raw = text(value).trim();
    if (!raw) throw new Error("Blank is not a numerical value.");
    const format = policy.numberFormat || "plain";
    if (format === "plain") {
      if (!decimalPattern.test(raw)) throw new Error("Choose an explicit number format for this value.");
    } else {
      let negative = false;
      if (/^\(.+\)$/.test(raw)) { negative = true; raw = raw.slice(1, -1).trim(); }
      if (policy.currency) raw = raw.replace(/^[$€£¥]\s*/, "");
      const percentage = raw.endsWith("%");
      if (percentage) {
        if (!policy.percentage) throw new Error("Choose whether percentages should become decimals.");
        raw = raw.slice(0, -1).trim();
      }
      const separator = format === "decimalComma" ? "." : ",";
      const decimal = format === "decimalComma" ? "," : ".";
      const escaped = character => character === "." ? "\\." : character;
      const pattern = new RegExp(`^[+-]?(?:\\d{1,3}(?:${escaped(separator)}\\d{3})+|\\d+)(?:${escaped(decimal)}\\d+)?$`);
      if (!pattern.test(raw)) throw new Error("Value does not match the selected separator format.");
      raw = raw.split(separator).join("").replace(decimal, ".");
      const number = Number(raw) * (negative ? -1 : 1) / (percentage ? 100 : 1);
      if (!Number.isFinite(number)) throw new Error("Numerical result must be finite.");
      return number;
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error("Numerical result must be finite.");
    return number;
  }
  function parseDate(value, format = "iso") {
    const raw = text(value).trim();
    let year, month, day;
    if (format === "excel") {
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 2958465 || Number(raw) === 60) throw new Error("Use a valid Excel 1900-system serial; serial 60 is an invalid leap day.");
      const date = new Date(Date.UTC(1899, 11, 31) + (Number(raw) - (Number(raw) > 60 ? 1 : 0)) * 86400000);
      return date.toISOString().slice(0, 10);
    }
    if (format === "iso") {
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (!parts) throw new Error("Expected YYYY-MM-DD, without silently discarding a timestamp.");
      [, year, month, day] = parts;
    } else {
      const parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
      if (!parts || !["mdy", "dmy"].includes(format)) throw new Error("Choose month/day/year or day/month/year explicitly.");
      year = parts[3]; month = parts[format === "mdy" ? 1 : 2]; day = parts[format === "mdy" ? 2 : 1];
    }
    const date = new Date(0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) throw new Error("Invalid calendar date.");
    return `${text(year).padStart(4, "0")}-${text(month).padStart(2, "0")}-${text(day).padStart(2, "0")}`;
  }
  function stats(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const quantile = p => { const position = (sorted.length - 1) * p, lower = Math.floor(position); return sorted.length ? sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower) : null; };
    return { count: sorted.length, mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null, median: quantile(.5), q1: quantile(.25), q3: quantile(.75), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
  }
  function normalizePolicies(policies = [], headers) {
    if (!Array.isArray(policies)) throw new Error("Column policies must be a list.");
    const seen = new Set();
    return policies.map(policy => {
      if (!policy || !headers.includes(policy.column) || seen.has(policy.column) || !["auto", "identifier", "number", "integer", "text", "date", "category", "boolean"].includes(policy.role)) throw new Error("Choose a unique existing column and supported role.");
      seen.add(policy.column);
      if (!Array.isArray(policy.missingTokens) || policy.missingTokens.length > 100 || policy.missingTokens.some(token => typeof token !== "string" || !token.trim() || token.length > 100)) throw new Error("Missing tokens must be bounded nonblank text values.");
      if (!["plain", "decimalPoint", "decimalComma"].includes(policy.numberFormat) || !["iso", "mdy", "dmy", "excel"].includes(policy.dateFormat) || typeof policy.currency !== "boolean" || typeof policy.percentage !== "boolean") throw new Error("Invalid number/date parsing policy.");
      if (!Number.isInteger(policy.decimals) || policy.decimals < 0 || policy.decimals > 12) throw new Error("Precision must be between 0 and 12 decimal places.");
      return { column: policy.column, role: policy.role, missingTokens: [...new Set(policy.missingTokens)], numberFormat: policy.numberFormat, dateFormat: policy.dateFormat, currency: policy.currency, percentage: policy.percentage, decimals: policy.decimals, meaning: text(policy.meaning).slice(0, 300) };
    });
  }
  function defaultPolicy(column) { return { column, role: "auto", missingTokens: [], numberFormat: "plain", dateFormat: "iso", currency: false, percentage: false, decimals: 2, meaning: "" }; }
  function missing(value, policy) { return !text(value).trim() || policy.missingTokens.some(token => token.trim().toLowerCase() === text(value).trim().toLowerCase()); }
  function profile(headers, rows, policies = [], schema = [], classifications = []) {
    const columns = [], candidates = [];
    const classified = new Map(classifications.map(entry => [`${entry.rowId}:${entry.column}`, entry]));
    for (const column of headers) {
      const policy = policies.find(entry => entry.column === column) || defaultPolicy(column);
      const entries = rows.map(row => ({ rowId: row._row, value: text(row[column]) }));
      const excluded = entry => { const decision = classified.get(`${entry.rowId}:${column}`); return decision?.value === entry.value && ["missing", "not_applicable"].includes(decision.meaning); };
      const observed = entries.filter(entry => entry.value.trim());
      const numeric = observed.filter(entry => { try { parseNumber(entry.value); return true; } catch { return false; } });
      const typedObserved = observed.filter(entry => !missingPattern.test(entry.value.trim()) && !missing(entry.value, policy));
      const numericIds = new Set(numeric.map(entry => entry.rowId));
      const schemaRole = schema.find(rule => rule.column === column)?.type;
      const hasLeadingZero = observed.some(entry => /^0\d+$/.test(entry.value.trim()));
      const role = policy.role !== "auto" ? policy.role : schemaRole && schemaRole !== "any" ? schemaRole : isIdentifier(column) || hasLeadingZero ? "identifier" : typedObserved.length && typedObserved.filter(entry => numericIds.has(entry.rowId)).length / typedObserved.length >= .6 ? "number" : /date|timestamp/i.test(column) ? "date" : "text";
      const counts = new Map();
      entries.forEach(entry => { if (!counts.has(entry.value)) counts.set(entry.value, []); counts.get(entry.value).push(entry.rowId); });
      const numericalStats = stats(numeric.filter(entry => !missing(entry.value, policy) && !excluded(entry)).map(entry => parseNumber(entry.value)));
      const columnProfile = { column, role, policy, total: rows.length, blanks: entries.length - observed.length, declaredMissing: entries.filter(entry => missing(entry.value, policy)).length, distinct: new Set(observed.map(entry => entry.value)).size, statistics: numericalStats, numericObserved: numeric.length };
      columns.push(columnProfile);
      const add = (kind, label, selected, evidence, score) => {
        if (!selected.length) return;
        const selectedIds = new Set(selected.map(entry => entry.rowId));
        const groups = [...counts].map(([value, rowIds]) => ({ value, rowIds: rowIds.filter(id => selectedIds.has(id)) })).filter(group => group.rowIds.length);
        candidates.push({ id: `${encodeURIComponent(column)}:${kind}`, column, kind, label, rowIds: [...selectedIds], groups, evidence, score, role, statistics: numericalStats, total: rows.length });
      };
      add("missing_token", "Possible missing-value representations", observed.filter(entry => missingPattern.test(entry.value.trim()) || missing(entry.value, policy)), "These tokens may mean unknown, not applicable, or a legitimate category. Confirm each representation.", .8);
      if (["number", "integer"].includes(role)) {
        const positive = numeric.filter(entry => parseNumber(entry.value) > 0);
        if (positive.length >= 3 && positive.length / Math.max(1, numeric.length) >= .7) add("sentinel", "Possible numerical missing sentinels", numeric.filter(entry => !missing(entry.value, policy) && [0, -1, 9999, 99999, -999].includes(parseNumber(entry.value))), "Potential sentinels in a predominantly positive numerical column. Zero is retained until you explicitly decide otherwise.", .45);
        add("number_format", "Numbers needing explicit parsing", observed.filter(entry => !missing(entry.value, policy) && !missingPattern.test(entry.value.trim()) && !numericIds.has(entry.rowId)), "Nonblank values were not parsed as ordinary decimal numbers. Choose separators, currency, or percentage semantics before conversion.", .85);
      } else if (role !== "identifier" && observed.some(entry => /^(?:[$€£¥]|\(\d)|\d+[,.]\d|\d+%$/.test(entry.value.trim()))) {
        add("number_format", "Possible formatted numerical values", observed.filter(entry => /[$€£¥%]|\d[,.]\d|^\(\d/.test(entry.value)), "Formatted values may be numerical; declaration and parsing are separate from inference.", .6);
      }
      add("spacing", "Whitespace or repeated spacing", observed.filter(entry => entry.value !== entry.value.trim() || /\s{2,}/.test(entry.value)), "Leading/trailing or repeated whitespace can create distinct labels and duplicate keys.", .75);
      if (!["number", "integer", "identifier", "date"].includes(role) && counts.size <= 200) {
        const buckets = new Map();
        observed.forEach(entry => { const key = entry.value.trim().toLowerCase().replace(/[ _-]+/g, " "); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(entry); });
        const variants = [...buckets.values()].filter(bucket => new Set(bucket.map(entry => entry.value)).size > 1).flat();
        add("category", "Possible equivalent category labels", variants, "Formatting-equivalent labels are candidates, not confirmed synonyms. Review the exact mapping.", .7);
      }
      if (role === "date" || observed.filter(entry => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(entry.value)).length >= Math.max(1, observed.length * .6)) {
        add("date_format", "Dates needing interpretation or correction", observed.filter(entry => { if (missing(entry.value, policy)) return false; try { parseDate(entry.value); return false; } catch { return true; } }), "Ambiguous dates require an explicit day/month interpretation. Invalid dates remain blocked until corrected.", .85);
      }
    }
    return { columns, candidates };
  }
  function scopeRows(rows, eligibleIds, scope = {}) {
    const eligible = new Set(eligibleIds);
    if (scope.mode && !["all", "selected", "condition"].includes(scope.mode)) throw new Error("Choose a supported treatment scope.");
    if (scope.mode === "selected" && (!Array.isArray(scope.rowIds) || scope.rowIds.some(id => !eligible.has(id)))) throw new Error("Selection must contain only records belonging to this finding.");
    if (scope.mode === "condition" && (!scope.column || !["=", "!=", "contains", ">", ">=", "<", "<="].includes(scope.operator) || !text(scope.value).trim())) throw new Error("Choose a field, operator, and nonblank condition value.");
    return rows.filter(row => {
      if (!eligible.has(row._row)) return false;
      if (scope.mode === "selected") return scope.rowIds.includes(row._row);
      if (scope.mode !== "condition") return true;
      if (!Object.hasOwn(row, scope.column)) throw new Error("Scope field is not present.");
      const left = text(row[scope.column]), right = text(scope.value);
      if (scope.operator === "contains") return left.toLowerCase().includes(right.toLowerCase());
      if (scope.operator === "=") return left === right;
      if (scope.operator === "!=") return left !== right;
      try { const a = parseNumber(left), b = parseNumber(right); return ({ ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b })[scope.operator]; } catch { return false; }
    });
  }
  function fixed(value, decimals) {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new Error("Result cannot be represented at the selected precision.");
    return value.toFixed(decimals);
  }
  function treatment(headers, rows, eligibleIds, column, draft, policy = defaultPolicy(column), classifications = []) {
    if (!headers.includes(column) || !operations.includes(draft.operation)) throw new Error("Choose a supported column and treatment.");
    const selected = scopeRows(rows, eligibleIds, draft.scope);
    const patches = [], blocked = [], removedRows = [];
    const selectedIds = new Set(selected.map(row => row._row));
    const decimals = draft.decimals ?? policy.decimals;
    if (!Number.isInteger(Number(decimals)) || Number(decimals) < 0 || Number(decimals) > 12) throw new Error("Precision must be between 0 and 12.");
    const classified = new Map(classifications.map(entry => [`${entry.rowId}:${entry.column}`, entry]));
    const reference = rows.filter(row => { const entry = classified.get(`${row._row}:${column}`); return !selectedIds.has(row._row) && !missing(row[column], policy) && !(entry?.value === row[column] && ["missing", "not_applicable"].includes(entry.meaning)); });
    const referenceValues = reference.flatMap(row => { try { return [parseNumber(row[column])]; } catch { return []; } });
    const referenceStats = stats(referenceValues);
    const mapping = draft.mapping || {};
    if (draft.operation === "map" && (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || !Object.keys(mapping).length || Object.entries(mapping).some(([source, target]) => !selected.some(row => row[column] === source) || typeof target !== "string"))) throw new Error("Mapping sources must belong to the reviewed scope and targets must be text.");
    if (draft.operation === "groupMedian" && (!headers.includes(draft.groupColumn) || draft.groupColumn === column)) throw new Error("Choose a different grouping column.");
    if (draft.operation === "cap" && ((!text(draft.lower).trim() && !text(draft.upper).trim()) || (text(draft.lower).trim() && text(draft.upper).trim() && parseNumber(draft.lower) > parseNumber(draft.upper)))) throw new Error("Choose at least one bound; lower must not exceed upper.");
    if (["deduplicate", "mergeDuplicates"].includes(draft.operation)) {
      const keys = draft.keys || headers;
      if (!Array.isArray(keys) || !keys.length || keys.some(key => !headers.includes(key))) throw new Error("Choose valid duplicate key columns.");
      if (!["first", "last", "complete", "selected"].includes(draft.survivor || "first")) throw new Error("Choose a supported survivor policy.");
      const groups = new Map();
      selected.forEach(row => { if (draft.keyMode && keys.some(key => !text(row[key]).trim())) return; const key = JSON.stringify(keys.map(field => row[field])); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); });
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const complete = row => headers.filter(field => text(row[field]).trim()).length;
        const survivor = draft.survivor === "last" ? group.at(-1) : draft.survivor === "complete" ? [...group].sort((a, b) => complete(b) - complete(a) || a._row - b._row)[0] : draft.survivor === "selected" ? group.find(row => draft.survivorIds?.includes(row._row)) : group[0];
        if (!survivor || (draft.survivor === "selected" && group.filter(row => draft.survivorIds?.includes(row._row)).length !== 1)) throw new Error("Select exactly one survivor in every duplicate group.");
        const conflict = headers.some(field => new Set(group.map(row => row[field]).filter(value => text(value).trim())).size > 1);
        if (conflict && !draft.acknowledgeConflicts) throw new Error("Review conflicting non-key values and acknowledge the survivor policy.");
        if (draft.operation === "mergeDuplicates") for (const field of headers) {
          const alternatives = [...new Set(group.map(row => row[field]).filter(value => text(value).trim()))];
          if (!text(survivor[field]).trim() && alternatives.length === 1) patches.push({ rowId: survivor._row, column: field, before: survivor[field], after: alternatives[0] });
        }
        removedRows.push(...group.filter(row => row !== survivor).map(row => ({ ...row })));
      }
    } else for (const row of selected) {
      const before = row[column];
      try {
        let after = before;
        if (draft.operation === "remove") { removedRows.push({ ...row }); continue; }
        if (draft.operation === "missing") after = "";
        if (draft.operation === "constant") {
          if (typeof draft.value !== "string") throw new Error("A replacement value is required.");
          after = draft.value;
        }
        if (["mean", "median", "groupMedian"].includes(draft.operation)) {
          let value = referenceStats[draft.operation === "mean" ? "mean" : "median"];
          if (draft.operation === "groupMedian") {
            if (!text(row[draft.groupColumn]).trim()) throw new Error("Blank group key; no estimate was fabricated.");
            value = stats(reference.filter(other => other[draft.groupColumn] === row[draft.groupColumn]).flatMap(other => { try { return [parseNumber(other[column])]; } catch { return []; } })).median;
          }
          if (value === null) throw new Error("No observed reference values; provide a reviewed constant or retain the record.");
          after = fixed(value, Number(decimals));
        }
        if (["trim", "lowercase", "uppercase"].includes(draft.operation)) {
          after = text(before).trim().replace(/\s+/g, " ");
          if (draft.operation === "lowercase") after = after.toLowerCase();
          if (draft.operation === "uppercase") after = after.toUpperCase();
        }
        if (draft.operation === "map") after = Object.hasOwn(mapping, before) ? mapping[before] : before;
        if (draft.operation === "parseNumber") after = fixed(parseNumber(before, { ...policy, ...draft }), Number(decimals));
        if (draft.operation === "parseDate") after = parseDate(before, draft.dateFormat || policy.dateFormat);
        if (draft.operation === "cap") after = fixed(Math.max(text(draft.lower).trim() ? parseNumber(draft.lower) : -Infinity, Math.min(text(draft.upper).trim() ? parseNumber(draft.upper) : Infinity, parseNumber(before))), Number(decimals));
        if (draft.operation === "recalculate") {
          const rule = draft.rule;
          if (!rule || !headers.includes(rule.left) || !headers.includes(rule.right) || !["sum", "difference", "product", "ratio"].includes(rule.operation)) throw new Error("Invalid metric definition.");
          const a = parseNumber(row[rule.left]), b = parseNumber(row[rule.right]);
          if (rule.operation === "ratio" && b === 0) throw new Error("Zero denominator.");
          after = fixed(({ sum: a + b, difference: a - b, product: a * b, ratio: a / b })[rule.operation] * rule.factor, rule.decimals);
        }
        if (after !== before) patches.push({ rowId: row._row, column, before, after });
      } catch (error) { blocked.push({ rowId: row._row, reason: error.message }); }
    }
    return { selectedIds: selected.map(row => row._row), patches, blocked, removedRows, referenceStats };
  }
  return { operations, parseNumber, parseDate, stats, profile, defaultPolicy, normalizePolicies, missing, scopeRows, treatment, isIdentifier };
})();
if (typeof module !== "undefined") module.exports = CleaningEngine;
