// Pure local record lenses, treatment comparisons, business metrics and checks.
var CapabilitiesEngine = (() => {
  const cleaning = typeof CleaningEngine !== "undefined" ? CleaningEngine : require("./cleaning-engine.js");
  const analysis = typeof AnalysisEngine !== "undefined" ? AnalysisEngine : require("./analysis-engine.js");
  function bandGroups(headers, rows, target, params = {}, options = {}) {
    const context = analysis.prepare(headers, rows, options);
    const columns = params.holdColumns || (params.holdColumn ? [params.holdColumn] : []);
    if (columns.some(column => column === target || !headers.includes(column))) throw new Error("Choose existing hold columns other than the target.");
    const definitions = columns.map(column => params.strict ? { labels: rows.map(row => String(row[column] ?? "")), numeric: false } : analysis.bandsFor(context, column, params.banding?.[column] || params.banding || {}));
    const groups = new Map();
    rows.forEach((row, index) => {
      const label = definitions.length ? definitions.map(definition => definition.labels[index]).join(" · ") : "All records";
      if (!groups.has(label)) groups.set(label, { label, indices: [] });
      groups.get(label).indices.push(index);
    });
    return { context, columns, groups: [...groups.values()] };
  }
  function recordView(headers, rows, target, params = {}, options = {}) {
    const grouped = bandGroups(headers, rows, target, params, options), targetEntry = grouped.context.columns.get(target);
    if (!targetEntry) throw new Error("Choose an existing target.");
    const ranking = params.ranking || analysis.compare(headers, rows, target, options).results;
    const columns = [...new Set([target, ...(params.columns || [...headers.filter(cleaning.isIdentifier), ...ranking.slice(0, 3).map(result => result.column)])])].filter(column => headers.includes(column));
    const patchMap = new Map((params.preview?.patches || []).filter(patch => patch.column === target).map(patch => [patch.rowId, patch.after]));
    const mode = params.mode || "affected";
    if (!["affected", "present", "both"].includes(mode)) throw new Error("Choose affected, present, or both records.");
    const limit = 100, allowance = Math.max(1, Math.floor(limit / Math.max(1, grouped.groups.length)));
    let displayedCount = 0;
    const bands = grouped.groups.map(group => {
      const affected = group.indices.filter(index => targetEntry.blanks[index]), present = group.indices.filter(index => targetEntry.states[index] === "present");
      const observed = present.map(index => targetEntry.numbers[index]).filter(Number.isFinite);
      const fills = affected.flatMap(index => { const value = patchMap.get(rows[index]._row); if (value === undefined) return []; try { return [cleaning.parseNumber(value)]; } catch { return []; } });
      const eligible = group.indices.filter(index => mode === "affected" ? targetEntry.blanks[index] : mode === "present" ? targetEntry.states[index] === "present" : targetEntry.states[index] !== "not_applicable");
      const comparison = params.comparisonColumn ? grouped.context.columns.get(params.comparisonColumn) : null;
      const missingStats = comparison ? analysis.statistics(affected.map(index => comparison.numbers[index]).filter(Number.isFinite)) : null;
      const presentStats = comparison ? analysis.statistics(present.map(index => comparison.numbers[index]).filter(Number.isFinite)) : null;
      const selected = eligible.slice(0, Math.min(allowance, limit - displayedCount)); displayedCount += selected.length;
      return { label: group.label, nMissing: affected.length, nPresent: present.length, nNotApplicable: group.indices.length - affected.length - present.length, missingRate: affected.length / Math.max(1, affected.length + present.length), missingStats, presentStats, fillValue: fills.length ? analysis.statistics(fills).median : null, totalVisible: eligible.length, rows: selected.map(index => ({ rowId: rows[index]._row, state: targetEntry.states[index], values: Object.fromEntries(columns.map(column => [column, rows[index][column]])), proposedValue: targetEntry.blanks[index] ? patchMap.get(rows[index]._row) ?? null : null })) };
    });
    return { target, columns, mode, bands, displayedCount, totalRecords: bands.reduce((sum, band) => sum + band.totalVisible, 0), inspectionOnly: true };
  }
  function proposedRows(rows, preview) {
    const proposed = rows.map(row => ({ ...row })), byId = new Map(proposed.map(row => [row._row, row]));
    for (const patch of preview.patches || []) { if (!byId.has(patch.rowId)) throw new Error("Preview references an unknown row."); byId.get(patch.rowId)[patch.column] = patch.after; }
    const removed = new Set((preview.removedRows || []).map(row => row._row));
    return proposed.filter(row => !removed.has(row._row));
  }
  function afterOptions(options, preview) {
    return { ...options, revision: undefined, classifications: [...(options.classifications || []), ...(preview.patches || []).map(patch => ({ rowId: patch.rowId, column: patch.column, value: patch.after, meaning: "resolved" }))] };
  }
  function bandImpact(headers, rows, target, preview, params = {}, options = {}) {
    const grouped = bandGroups(headers, rows, target, params, options), targetEntry = grouped.context.columns.get(target);
    const after = proposedRows(rows, preview), afterContext = analysis.prepare(headers, after, afterOptions(options, preview)), afterIndex = new Map(after.map((row, index) => [row._row, index]));
    const fills = new Map((preview.fillMetadata?.fills || []).map(fill => [fill.row, fill]));
    const patchMap = new Map((preview.patches || []).filter(patch => patch.column === target).map(patch => [patch.rowId, patch]));
    const globalBefore = targetEntry.numbers.filter(Number.isFinite), globalAfter = afterContext.columns.get(target).numbers.filter(Number.isFinite);
    const shared = analysis.histogram([globalBefore, globalAfter]);
    return { target, globalHistogram: shared, bands: grouped.groups.map(group => {
      const before = group.indices.map(index => targetEntry.numbers[index]).filter(Number.isFinite);
      const afterValues = group.indices.flatMap(index => { const next = afterIndex.get(rows[index]._row); const value = next === undefined ? null : afterContext.columns.get(target).numbers[next]; return Number.isFinite(value) ? [value] : []; });
      const breakdown = { band: 0, widened: 0, knn: 0, global: 0 };
      for (const index of group.indices) { const rowId = rows[index]._row; if (patchMap.has(rowId)) { const source = fills.get(rowId)?.source || "global"; breakdown[source] = (breakdown[source] || 0) + 1; } }
      return { label: group.label, observedCount: before.length, filledCount: group.indices.filter(index => patchMap.has(rows[index]._row)).length, beforeStats: analysis.statistics(before), afterStats: analysis.statistics(afterValues), sourceBreakdown: breakdown, sparse: before.length < 5, histogram: analysis.histogram([before, afterValues], 16, shared) };
    }) };
  }
  function candidatePreview(headers, rows, target, eligibleIds, draft, options = {}) {
    const policy = analysis.policy(target, options);
    const preview = cleaning.treatment(headers, rows, eligibleIds, target, draft, policy, options.classifications || [], options);
    const after = proposedRows(rows, preview), entry = analysis.prepare([target], after, afterOptions(options, preview)).columns.get(target);
    return { draft: JSON.parse(JSON.stringify(draft)), preview, afterStats: analysis.statistics(entry.numbers.filter(Number.isFinite)), values: entry.numbers.filter(Number.isFinite), cellsChanging: preview.patches.length, blockedCount: preview.blocked.length, fallbackCount: preview.fillMetadata?.fallbackCount || 0, kpiImpact: kpiImpact(headers, rows, preview, options.kpis || [], options) };
  }
  function compareCandidates(headers, rows, target, eligibleIds, drafts, options = {}) {
    if (!Array.isArray(drafts) || drafts.length < 2 || drafts.length > 4) throw new Error("Compare two to four treatment candidates.");
    const scope = JSON.stringify(drafts[0].scope || { mode: "all" });
    if (drafts.some(draft => JSON.stringify(draft.scope || { mode: "all" }) !== scope)) throw new Error("All candidates must use the same explicit scope.");
    const before = analysis.prepare([target], rows, options).columns.get(target).numbers.filter(Number.isFinite);
    const candidates = drafts.map(draft => candidatePreview(headers, rows, target, eligibleIds, draft, options));
    const histogram = analysis.histogram([before, ...candidates.map(candidate => candidate.values)]), countScale = Math.max(1, ...histogram.sets.flatMap(set => set.counts));
    candidates.forEach((candidate, index) => { candidate.histogram = { ...histogram, sets: [histogram.sets[0], histogram.sets[index + 1]], countScale }; delete candidate.values; });
    return { target, countScale, candidates, scope: drafts[0].scope || { mode: "all" }, transient: true };
  }
  function normalizeKpis(definitions, headers) {
    if (!Array.isArray(definitions) || definitions.length > 20) throw new Error("Define at most twenty KPIs.");
    const ids = new Set();
    return definitions.map((definition, index) => {
      if (!definition || !headers.includes(definition.metric) || !["sum", "mean", "median", "count", "ratio"].includes(definition.aggregation) || (definition.aggregation === "ratio" && !headers.includes(definition.denominator)) || (definition.groupBy && !headers.includes(definition.groupBy))) throw new Error("Choose existing KPI fields and a supported aggregation.");
      const id = String(definition.id || `kpi:${index}`); if (!id || ids.has(id)) throw new Error("KPI IDs must be unique."); ids.add(id);
      return { id, name: String(definition.name || definition.metric).slice(0, 200), metric: definition.metric, aggregation: definition.aggregation, denominator: definition.aggregation === "ratio" ? definition.denominator : null, groupBy: definition.groupBy || null };
    });
  }
  function suggestedKpis(headers) {
    const suggestions = [];
    if (["revenue_usd", "spend_usd", "channel"].every(column => headers.includes(column))) suggestions.push({ id: "suggested-roas", name: "ROAS", metric: "revenue_usd", denominator: "spend_usd", aggregation: "ratio", groupBy: "channel" });
    if (["profit_usd", "revenue_usd", "product_category"].every(column => headers.includes(column))) suggestions.push({ id: "suggested-margin", name: "Margin", metric: "profit_usd", denominator: "revenue_usd", aggregation: "ratio", groupBy: "product_category" });
    if (["hba1c_pct", "department"].every(column => headers.includes(column))) suggestions.push({ id: "suggested-hba1c", name: "Mean HbA1c", metric: "hba1c_pct", aggregation: "mean", groupBy: "department" });
    return suggestions;
  }
  function kpiValues(headers, rows, definition, options = {}) {
    const fields = [...new Set([definition.metric, definition.denominator, definition.groupBy].filter(Boolean))];
    const context = analysis.prepare(fields, rows, options), groups = new Map();
    rows.forEach((row, index) => {
      const observed = definition.groupBy && context.columns.get(definition.groupBy).states[index] === "present";
      const label = definition.groupBy ? observed ? String(row[definition.groupBy]) : "Unknown" : "All records";
      const key = !definition.groupBy ? "all" : observed ? `group:${JSON.stringify(label)}` : "unavailable";
      if (!groups.has(key)) groups.set(key, { label, indices: [] }); groups.get(key).indices.push(index);
    });
    if (definition.groupBy && [...groups.keys()].filter(key => key !== "unavailable").length > 30) throw new Error("KPI grouping fields support at most 30 observed categories plus Unknown.");
    const aggregate = indices => {
      const values = indices.map(index => context.columns.get(definition.metric).numbers[index]).filter(Number.isFinite);
      if (definition.aggregation === "count") return values.length;
      if (!values.length) return null;
      if (definition.aggregation === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
      if (definition.aggregation === "median") return analysis.statistics(values).median;
      const sum = values.reduce((total, value) => total + value, 0);
      if (definition.aggregation === "sum") return sum;
      const denominators = indices.map(index => context.columns.get(definition.denominator).numbers[index]).filter(Number.isFinite);
      const divisor = denominators.reduce((total, value) => total + value, 0);
      return denominators.length && divisor !== 0 ? sum / divisor : null;
    };
    const entries = [...groups].map(([key, group]) => ({ key, label: group.label, value: aggregate(group.indices), records: group.indices.length, rank: null, total: false }));
    const ordered = entries.filter(entry => Number.isFinite(entry.value)).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    ordered.forEach((entry, index) => { entry.rank = index && entry.value === ordered[index - 1].value ? ordered[index - 1].rank : index + 1; });
    entries.push({ key: "total", label: "Total", value: aggregate(rows.map((_, index) => index)), records: rows.length, rank: null, total: true });
    return entries;
  }
  function kpiImpact(headers, rows, preview, definitions, options = {}) {
    const kpis = normalizeKpis(definitions, headers); if (!kpis.length) return [];
    const after = proposedRows(rows, preview), proposedOptions = afterOptions(options, preview);
    return kpis.map(definition => {
      const before = kpiValues(headers, rows, definition, options), next = kpiValues(headers, after, definition, proposedOptions);
      const keys = [...new Set([...before, ...next].map(entry => entry.key))];
      const groups = keys.map(key => {
        const a = before.find(entry => entry.key === key), b = next.find(entry => entry.key === key), label = a?.label || b.label;
        const delta = Number.isFinite(a?.value) && Number.isFinite(b?.value) ? b.value - a.value : null;
        const percentDelta = delta !== null && a.value !== 0 ? delta / Math.abs(a.value) * 100 : delta === 0 ? 0 : null;
        const rankChanged = a?.rank !== b?.rank;
        return { key, label, before: a?.value ?? null, after: b?.value ?? null, delta, percentDelta, rankBefore: a?.rank ?? null, rankAfter: b?.rank ?? null, flagged: Math.abs(percentDelta || 0) >= 5 || rankChanged || (percentDelta === null && delta !== null && delta !== 0), total: key === "total" };
      });
      const magnitude = group => group.delta === null ? group.before !== group.after ? Infinity : 0 : Math.abs(group.percentDelta ?? group.delta);
      const ranked = groups.filter(group => !group.total && (Number.isFinite(group.before) || Number.isFinite(group.after))).sort((a, b) => magnitude(b) - magnitude(a) || a.label.localeCompare(b.label));
      const biggest = ranked[0];
      const headline = !biggest ? "Insufficient observations to measure KPI impact." : biggest.rankBefore !== biggest.rankAfter ? `${biggest.label} moves from #${biggest.rankBefore ?? "unranked"} to #${biggest.rankAfter ?? "unranked"} by ${definition.name}.` : biggest.percentDelta !== null && Math.abs(biggest.percentDelta) <= 2 ? "No group changes by more than 2%." : `${definition.name}: ${biggest.label} has the largest change (${biggest.percentDelta === null ? "undefined-baseline change" : `${biggest.percentDelta.toFixed(2)}%`}).`;
      return { definition, groups, headline };
    });
  }
  function exportData(headers, rows, changes, original, options = {}, rules = {}) {
    const current = new Map(original.map(row => [row._row, { ...row }])), meanings = new Map(), methods = new Map();
    const policy = column => (rules.columns || []).find(entry => entry.column === column) || cleaning.defaultPolicy(column);
    for (const change of [...changes].reverse()) {
      const operation = change.treatment?.operation || ({ imputeMean: "mean", imputeMedian: "median", recalculateMetric: "recalculate" })[change.title];
      const fills = new Map((change.treatment?.fillMetadata?.fills || []).map(fill => [fill.row, fill]));
      const patchedKeys = new Set((change.patches || []).map(patch => `${patch.rowId}:${patch.column}`));
      for (const patch of change.patches || []) {
        const row = current.get(patch.rowId); if (!row) continue;
        const key = `${patch.rowId}:${patch.column}`, status = cleaning.observationState(row, patch.column, policy(patch.column), meanings);
        let method = null;
        if (["mean", "median", "groupMedian", "groupwise", "knn"].includes(operation)) method = fills.get(patch.rowId)?.source === "global" ? "global_fallback" : ["groupMedian", "groupwise"].includes(operation) ? "group" : operation;
        if (operation === "constant" && (["missing", "blank_unreviewed"].includes(status) || change.interpretation === "missing")) method = "constant";
        if (operation === "recalculate") method = "recalculated";
        if (method) methods.set(key, method); else methods.delete(key);
        row[patch.column] = patch.after;
      }
      // A reviewed estimate can equal a sentinel's exact source text. Its
      // analytical provenance still changes even when no physical patch exists.
      for (const entry of change.interpretationValues || []) {
        if (patchedKeys.has(`${entry.rowId}:${entry.column}`)) continue;
        const row = current.get(entry.rowId); if (!row) continue;
        const status = cleaning.observationState(row, entry.column, policy(entry.column), meanings);
        const eligible = ["missing", "blank_unreviewed"].includes(status);
        let method = null;
        if (eligible && ["mean", "median", "groupMedian", "groupwise", "knn"].includes(operation)) method = fills.get(entry.rowId)?.source === "global" ? "global_fallback" : ["groupMedian", "groupwise"].includes(operation) ? "group" : operation;
        if (operation === "constant" && (eligible || change.interpretation === "missing")) method = "constant";
        if (operation === "recalculate") method = "recalculated";
        if (method) methods.set(`${entry.rowId}:${entry.column}`, method);
      }
      for (const entry of change.interpretationValues || []) meanings.set(`${entry.rowId}:${entry.column}`, entry);
    }
    const outputHeaders = [...headers], outputRows = rows.map(row => ({ ...row })), generated = [];
    if (options.includeFlags !== false) for (const column of headers) {
      if (!rows.some(row => methods.has(`${row._row}:${column}`))) continue;
      const unique = name => { let candidate = name, counter = 2; while (outputHeaders.includes(candidate)) candidate = `${name}_${counter++}`; outputHeaders.push(candidate); return candidate; };
      const flag = unique(`${column}_imputed`), methodField = options.includeMethods ? unique(`${column}_imputation_method`) : null;
      generated.push({ column, flag, methodField });
      outputRows.forEach(row => { const method = methods.get(`${row._row}:${column}`); row[flag] = method ? "1" : "0"; if (methodField) row[methodField] = method || ""; });
    }
    return { headers: outputHeaders, rows: outputRows, generated };
  }
  function safeCsvValue(value) {
    const text = String(value ?? "");
    if (!/^\s*[=+\-@]/.test(text)) return text;
    try { cleaning.parseNumber(text); return text; } catch { return `'${text}`; }
  }
  function suggestedRules(headers, rows, options = {}) {
    const context = analysis.prepare(headers, rows, options), suggestions = [];
    const find = pattern => headers.find(column => pattern.test(column));
    const measured = column => context.columns.get(column)?.numbers.filter(Number.isFinite) || [];
    const tolerance = column => (analysis.statistics(measured(column).map(Math.abs)).median || 0) * .01;
    const add = (kind, rule, test, note) => {
      let usable = 0, passed = 0;
      rows.forEach((row, index) => { const result = test(row, index); if (result === null) return; usable++; if (result) passed++; });
      if (usable && passed / usable >= .8) suggestions.push({ id: `suggestion:${rule.id}`, kind, rule, passed, usable, passRate: passed / usable, note });
    };
    const metric = (target, left, right, operation, factor = 1, extraTolerance = null, note = "") => {
      if (![target, left, right].every(Boolean) || target === left || target === right) return;
      const rule = { id: `suggested-metric:${target}`, name: `${target} from ${left} and ${right}`, target, left, right, operation, factor, decimals: 2, tolerance: extraTolerance ?? tolerance(target) };
      add("metrics", rule, (_, index) => {
        const a = context.columns.get(left).numbers[index], b = context.columns.get(right).numbers[index], value = context.columns.get(target).numbers[index];
        if (![a, b, value].every(Number.isFinite) || operation === "ratio" && b === 0) return null;
        const expected = ({ difference: a - b, product: a * b, ratio: a / b })[operation] * factor;
        const rounded = Number(expected.toFixed(rule.decimals));
        return Math.abs(value - rounded) <= rule.tolerance + Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(rounded)) * 4;
      }, note || "Locally tested identity; accepting runs checks, never recalculates values automatically.");
    };
    const profit = find(/^profit/i), revenue = find(/^revenue/i), cost = find(/^cost/i), spend = find(/^spend/i), clicks = find(/^clicks$/i), impressions = find(/^impressions$/i), quantity = find(/^quantity$/i), unit = find(/^unit_price/i);
    metric(profit, revenue, cost, "difference"); metric(find(/^roas$/i), revenue, spend, "ratio"); metric(find(/^cpc/i), spend, clicks, "ratio");
    const ctr = find(/^ctr|^click_through_rate/i);
    if (ctr) metric(ctr, clicks, impressions, "ratio", /pct/i.test(ctr) || measured(ctr).filter(value => value > 1).length > measured(ctr).length / 2 ? 100 : 1);
    if (revenue) metric(revenue, quantity, unit, "product", 1, (analysis.statistics(measured(revenue).map(Math.abs)).median || 0) * .25, "Approximate revenue identity with wide tolerance; discounts and price adjustments may apply.");
    for (const column of headers) {
      let type = "number", minimum, maximum;
      const values = measured(column);
      if (/rating/i.test(column) && values.length && values.every(value => Number.isInteger(value) && value >= 1 && value <= 5)) { type = "integer"; minimum = 1; maximum = 5; }
      else if (/_pct$|percent/i.test(column)) { minimum = 0; maximum = 100; }
      else if (/^age$/i.test(column)) { type = "integer"; minimum = 0; maximum = 120; }
      else if (/days/i.test(column) && !/date/i.test(column)) { minimum = 0; maximum = null; }
      else continue;
      const rule = { id: `suggested-schema:${column}`, column, type, required: false, minimum, maximum, allowed: [] };
      add("schema", rule, (_, index) => { const value = context.columns.get(column).numbers[index]; return !Number.isFinite(value) ? null : (type !== "integer" || Number.isInteger(value)) && value >= minimum && (maximum === null || value <= maximum); }, `${column}: ${type}, ${minimum} to ${maximum ?? "unbounded"}.`);
    }
    for (const [earlierPattern, laterPattern] of [[/order.*date/i, /deliver.*date/i], [/admi.*date/i, /discharge.*date/i]]) {
      const earlier = find(earlierPattern), later = find(laterPattern); if (!earlier || !later) continue;
      const rule = { id: `suggested-relation:${later}`, name: `${later} on or after ${earlier}`, kind: "comparison", column: later, left: later, right: earlier, operator: ">=", comparisonType: "date", value: "" };
      add("relations", rule, row => { try { if ([earlier, later].some(column => cleaning.observationState(row, column, analysis.policy(column, options), options.classifications || []) !== "present")) return null; return cleaning.parseDate(row[later]) >= cleaning.parseDate(row[earlier]); } catch { return null; } }, "Date ordering, tested on valid source dates.");
    }
    return suggestions;
  }
  function dependencyImpact(headers, rows, preview, definitions, options = {}) {
    const affectedFields = new Set((preview.patches || []).map(patch => patch.column));
    if (!definitions.some(rule => affectedFields.has(rule.left) || affectedFields.has(rule.right))) return [];
    const after = proposedRows(rows, preview), index = new Map(after.map((row, position) => [row._row, position]));
    return definitions.filter(rule => affectedFields.has(rule.left) || affectedFields.has(rule.right)).map(rule => {
      const fields = [...new Set([rule.target, rule.left, rule.right])], context = analysis.prepare(fields, after, afterOptions(options, preview));
      const changed = new Set((preview.patches || []).filter(patch => [rule.left, rule.right].includes(patch.column)).map(patch => patch.rowId));
      const violatingRowIds = [], blockedRowIds = [];
      for (const rowId of changed) {
        const position = index.get(rowId); if (position === undefined) continue;
        const a = context.columns.get(rule.left).numbers[position], b = context.columns.get(rule.right).numbers[position], target = context.columns.get(rule.target).numbers[position];
        if (![a, b].every(Number.isFinite) || rule.operation === "ratio" && b === 0) { blockedRowIds.push(rowId); continue; }
        const raw = ({ sum: a + b, difference: a - b, product: a * b, ratio: a / b })[rule.operation] * rule.factor;
        if (!Number.isFinite(raw)) { blockedRowIds.push(rowId); continue; }
        const expected = Number(raw.toFixed(rule.decimals));
        if (target === null || Math.abs(target - expected) > rule.tolerance + Number.EPSILON * Math.max(1, Math.abs(target), Math.abs(expected)) * 4) violatingRowIds.push(rowId);
      }
      return { ruleId: rule.id, target: rule.target, name: rule.name, changedRows: changed.size, violatingRowIds, blockedRowIds, followUp: `Review metric: ${rule.target}`, requiresSeparateApproval: true };
    });
  }
  function schemaProblems(row, rule, options = {}) {
    const status = cleaning.observationState(row, rule.column, analysis.policy(rule.column, options), options.classifications || []);
    if (status === "not_applicable") return [];
    if (status !== "present") return rule.required ? ["Required observation is missing or unreviewed blank"] : [];
    const value = String(row[rule.column] ?? "").trim(), problems = [];
    let number; try { number = cleaning.parseNumber(value, analysis.policy(rule.column, options)); } catch { number = null; }
    if (["number", "integer"].includes(rule.type) && number === null) problems.push("Expected a finite number");
    else if (rule.type === "integer" && !Number.isInteger(number)) problems.push("Expected an integer");
    if (rule.type === "date") { try { cleaning.parseDate(value); } catch { problems.push("Expected a valid YYYY-MM-DD calendar date"); } }
    if (rule.type === "boolean" && !["true", "false", "0", "1"].includes(value.toLowerCase())) problems.push("Expected true/false or 0/1");
    if (["number", "integer"].includes(rule.type) && number !== null) {
      if (rule.minimum !== null && number < rule.minimum) problems.push(`Below minimum ${rule.minimum}`);
      if (rule.maximum !== null && number > rule.maximum) problems.push(`Above maximum ${rule.maximum}`);
    }
    if (rule.allowed?.length && !rule.allowed.includes(value)) problems.push("Not in the allowed-value list (case-sensitive)");
    return problems;
  }
  function qualityScorecard(headers, rows, rules = {}, options = {}) {
    const context = analysis.prepare(headers, rows, options), classified = new Map((options.classifications || []).map(entry => [`${entry.rowId}:${entry.column}`, entry]));
    const shared = { ...options, classifications: classified };
    return headers.map(column => {
      const entry = context.columns.get(column), schema = (rules.schema || []).filter(rule => rule.column === column), metrics = (rules.metrics || []).filter(rule => rule.target === column), relations = (rules.relations || []).filter(rule => rule.column === column);
      const hasRules = schema.length + metrics.length + relations.length > 0;
      const nonblank = rows.map((row, index) => ({ row, index })).filter(({ row }) => String(row[column] ?? "").trim());
      const pass = ({ row, index }) => {
        if (schema.some(rule => schemaProblems(row, rule, shared).length)) return false;
        if (entry.states[index] === "not_applicable") return true;
        for (const rule of metrics) {
          const a = context.columns.get(rule.left).numbers[index], b = context.columns.get(rule.right).numbers[index], target = entry.numbers[index];
          if (![a, b, target].every(Number.isFinite) || rule.operation === "ratio" && b === 0) return false;
          const expected = Number((({ sum: a + b, difference: a - b, product: a * b, ratio: a / b })[rule.operation] * rule.factor).toFixed(rule.decimals));
          if (Math.abs(target - expected) > rule.tolerance + Number.EPSILON * Math.max(1, Math.abs(target), Math.abs(expected)) * 4) return false;
        }
        for (const rule of relations) {
          if (rule.kind === "requiredIf") { if (row[rule.left] === rule.value && entry.states[index] !== "present") return false; continue; }
          if ([rule.left, rule.right].some(field => context.columns.get(field).states[index] !== "present")) return false;
          let a = row[rule.left], b = row[rule.right];
          try { if (rule.comparisonType === "number") { a = cleaning.parseNumber(a, analysis.policy(rule.left, options)); b = cleaning.parseNumber(b, analysis.policy(rule.right, options)); } else if (rule.comparisonType === "date") { a = cleaning.parseDate(a); b = cleaning.parseDate(b); } } catch { return false; }
          if (!({ "=": a === b, "!=": a !== b, ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b })[rule.operator]) return false;
        }
        return true;
      };
      const validCount = hasRules ? nonblank.filter(pass).length : null;
      const role = analysis.policy(column, options).role;
      const isDate = entry.type === "date" || role === "date" || /(^|_)date($|_)|timestamp/i.test(column);
      let consistency = null, dominant = null;
      if (!entry.idLike && !cleaning.isIdentifier(column) && role !== "identifier" && (isDate || entry.type === "categorical" && role !== "boolean")) {
        const buckets = new Map();
        for (const { row } of nonblank) {
          const raw = String(row[column]);
          const family = isDate ? "date" : raw.trim().toLowerCase().replace(/[ _-]+/g, " ");
          const representation = isDate ? /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? "YYYY-MM-DD" : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw.trim()) ? "Slash day/month format" : "Other date representation" : raw;
          if (!buckets.has(family)) buckets.set(family, new Map()); const counts = buckets.get(family); counts.set(representation, (counts.get(representation) || 0) + 1);
        }
        let consistent = 0, largest = 0;
        for (const counts of buckets.values()) for (const [representation, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 1)) { consistent += count; if (count > largest) { largest = count; dominant = representation; } }
        consistency = nonblank.length ? consistent / nonblank.length * 100 : null;
      }
      return { column, nonblank: nonblank.length, hasRules, validCount, validity: hasRules && nonblank.length ? validCount / nonblank.length * 100 : null, consistency, dominant };
    });
  }
  return { bandGroups, recordView, proposedRows, afterOptions, bandImpact, candidatePreview, compareCandidates, normalizeKpis, suggestedKpis, kpiValues, kpiImpact, exportData, safeCsvValue, suggestedRules, dependencyImpact, schemaProblems, qualityScorecard };
})();
if (typeof module !== "undefined") module.exports = CapabilitiesEngine;
