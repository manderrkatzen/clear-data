// Browser-local analytical computations. No source rows are mutated or sent to AI.
var AnalysisEngine = (() => {
  const engine = typeof CleaningEngine !== "undefined" ? CleaningEngine : require("./cleaning-engine.js");
  const cache = new WeakMap();
  const contexts = new WeakMap();
  const text = value => String(value ?? "").trim();
  const quantile = (sorted, p) => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * p, lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  };
  function policy(column, options = {}) {
    const declared = options.policies?.find(entry => entry.column === column) || engine.defaultPolicy(column);
    return declared;
  }
  function prepare(headers, rows, options = {}) {
    const contextKey = options.revision === undefined ? null : JSON.stringify([headers, options]);
    if (contextKey && contexts.get(rows)?.key === contextKey) return contexts.get(rows).context;
    let saved = cache.get(rows);
    if (!saved) { saved = new Map(); cache.set(rows, saved); }
    const classified = new Map((options.classifications || []).map(entry => [`${entry.rowId}:${entry.column}`, entry]));
    const columns = new Map();
    for (const column of headers) {
      const parsing = policy(column, options);
      const signature = JSON.stringify([parsing, rows.map(row => [row[column], classified.get(`${row._row}:${column}`)?.meaning])]);
      if (saved.get(column)?.signature === signature) { columns.set(column, saved.get(column)); continue; }
      const states = rows.map(row => engine.observationState(row, column, parsing, classified));
      const blanks = states.map(status => ["missing", "blank_unreviewed"].includes(status));
      const numbers = rows.map((row, index) => {
        if (states[index] !== "present") return null;
        if (parsing.numberFormat === "plain") {
          const raw = text(row[column]);
          if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return null;
          const value = Number(raw); return Number.isFinite(value) ? value : null;
        }
        try { return engine.parseNumber(row[column], parsing); } catch { return null; }
      });
      const dates = rows.map((row, index) => {
        if (states[index] !== "present") return null;
        if (parsing.dateFormat === "iso" && !/^\d{4}-\d{2}-\d{2}$/.test(text(row[column]))) return null;
        if (["mdy", "dmy"].includes(parsing.dateFormat) && !/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text(row[column]))) return null;
        try { return engine.parseDate(row[column], parsing.dateFormat).slice(0, 7); } catch { return null; }
      });
      const observed = states.filter(status => status === "present").length;
      const distinct = new Set(rows.filter((_, index) => states[index] === "present").map(row => text(row[column]))).size;
      const dateRole = parsing.role === "date" || (dates.filter(Boolean).length >= Math.max(1, observed * .9));
      const numericRole = ["number", "integer"].includes(parsing.role) || (parsing.role === "auto" && numbers.filter(Number.isFinite).length >= Math.max(1, observed * .9));
      const type = dateRole ? "date" : numericRole ? "numeric" : "categorical";
      const sorted = numbers.filter(Number.isFinite).sort((a, b) => a - b);
      const entry = { signature, states, blanks, numbers, dates, observed, distinct, type, sorted, policy: parsing, idLike: parsing.role === "identifier" || (engine.isIdentifier(column) && distinct / Math.max(1, observed) >= .95) };
      saved.set(column, entry); columns.set(column, entry);
    }
    const context = { headers, rows, columns, options };
    if (contextKey) contexts.set(rows, { key: contextKey, context });
    return context;
  }
  function statistics(values, alreadySorted = false) {
    const result = engine.stats(values, alreadySorted);
    result.iqr = result.count ? result.q3 - result.q1 : null;
    result.sd = result.count > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - result.mean) ** 2, 0) / (result.count - 1)) : 0;
    return result;
  }
  function cliffsDelta(missingValues, presentValues, alreadySorted = false) {
    if (!missingValues.length || !presentValues.length) return 0;
    const a = alreadySorted ? missingValues : [...missingValues].sort((x, y) => x - y), b = alreadySorted ? presentValues : [...presentValues].sort((x, y) => x - y);
    let lower = 0, upper = 0, difference = 0;
    for (const value of a) {
      while (lower < b.length && b[lower] < value) lower++;
      if (upper < lower) upper = lower;
      while (upper < b.length && b[upper] <= value) upper++;
      difference += lower - (b.length - upper);
    }
    return difference / (a.length * b.length);
  }
  function winsorizedSmd(a, b, combinedSorted = null) {
    if (!a.length || !b.length) return 0;
    const sorted = combinedSorted || [...a, ...b].sort((x, y) => x - y), low = quantile(sorted, .01), high = quantile(sorted, .99);
    const moments = values => {
      let mean = 0, m2 = 0, count = 0;
      for (const raw of values) { const value = Math.max(low, Math.min(high, raw)); count++; const delta = value - mean; mean += delta / count; m2 += delta * (value - mean); }
      return { count, mean, sd: Math.sqrt(m2 / Math.max(1, count - 1)) };
    };
    const x = moments(a), y = moments(b);
    const pooled = Math.sqrt(((x.count - 1) * x.sd ** 2 + (y.count - 1) * y.sd ** 2) / Math.max(1, x.count + y.count - 2));
    return pooled ? (x.mean - y.mean) / pooled : x.mean === y.mean ? 0 : Math.sign(x.mean - y.mean) * 1e6;
  }
  function histogram(groups, bins = 16, range = null, combinedSorted = null) {
    const sorted = combinedSorted || groups.flat().sort((a, b) => a - b);
    const min = range ? range.min : quantile(sorted, .01), max = range ? range.max : quantile(sorted, .99);
    const sets = groups.map(values => {
      const counts = Array(bins).fill(0);
      let below = 0, above = 0;
      for (const value of values) {
        if (value < min) { below++; continue; }
        if (value > max) { above++; continue; }
        counts[Math.max(0, Math.min(bins - 1, Math.floor((value - min) / (max - min || 1) * bins)))]++;
      }
      return { counts, below, above };
    });
    return { min, max, trueMin: sorted[0] ?? null, trueMax: sorted.at(-1) ?? null, bins, sets };
  }
  function compareColumn(context, targetColumn, column, indices) {
    const { rows, columns } = context, target = columns.get(targetColumn), comparison = columns.get(column);
    const selected = (indices || rows.map((_, index) => index)).filter(index => target.states[index] !== "not_applicable");
    const overallMissing = selected.filter(index => target.blanks[index]).length / Math.max(1, selected.length);
    const usable = selected.filter(index => comparison.states[index] === "present");
    const excludedBlankRows = selected.filter(index => comparison.blanks[index]).length;
    const excludedNotApplicableRows = selected.filter(index => comparison.states[index] === "not_applicable").length;
    if (comparison.type === "numeric") {
      const missingValues = [], presentValues = [];
      for (const index of usable) if (Number.isFinite(comparison.numbers[index])) (target.blanks[index] ? missingValues : presentValues).push(comparison.numbers[index]);
      if (new Set([...missingValues, ...presentValues]).size < 2) return null;
      missingValues.sort((a, b) => a - b); presentValues.sort((a, b) => a - b);
      const combinedSorted = [...missingValues, ...presentValues].sort((a, b) => a - b);
      const missingStats = statistics(missingValues, true), presentStats = statistics(presentValues, true);
      const delta = cliffsDelta(missingValues, presentValues, true), direction = Math.sign(delta), effectSize = Math.abs(delta);
      const directionText = direction > 0 ? "higher in missing group" : direction < 0 ? "lower in missing group" : "no directional difference";
      return { column, type: "numeric", effectSize, effectMeasure: "cliffs_delta", cliffsDelta: delta, winsorizedSmd: winsorizedSmd(missingValues, presentValues, combinedSorted), direction, directionText, strength: effectSize >= .33 ? "strong" : effectSize >= .147 ? "moderate" : effectSize > 0 ? "weak" : "none", missingStats, presentStats, histogram: histogram([missingValues, presentValues], 16, null, combinedSorted), excludedBlankRows, excludedNotApplicableRows, excludedInvalidRows: usable.length - missingValues.length - presentValues.length, summary: `${column}: ${directionText}; missing-group median ${missingStats.median ?? "unavailable"}; present-group median ${presentStats.median ?? "unavailable"}.` };
    }
    const counts = new Map();
    let invalid = 0;
    for (const index of usable) {
      const label = comparison.type === "date" ? comparison.dates[index] : text(rows[index][column]);
      if (label === null) { invalid++; continue; }
      if (!counts.has(label)) counts.set(label, { label, total: 0, missing: 0 });
      const group = counts.get(label); group.total++; if (target.blanks[index]) group.missing++;
    }
    if (counts.size < 2 || (comparison.type === "categorical" && counts.size > 30)) return null;
    const rates = [...counts.values()].map(group => ({ ...group, rate: group.missing / group.total, eligible: group.total >= 10 })).sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label));
    const eligible = rates.filter(group => group.eligible);
    const effectSize = Math.max(0, ...eligible.map(group => Math.abs(group.rate - overallMissing)));
    const direction = Object.fromEntries(eligible.map(group => [group.label, Math.sign(group.rate - overallMissing)]));
    const groups = selected.map(index => target.blanks[index] ? "missing" : "present");
    return { column, type: comparison.type, effectSize, direction, strength: effectSize >= .15 ? "strong" : effectSize >= .07 ? "moderate" : effectSize > 0 ? "weak" : "none", missingStats: { count: groups.filter(value => value === "missing").length }, presentStats: { count: groups.filter(value => value === "present").length }, [comparison.type === "date" ? "monthlyRates" : "categoryRates"]: rates, excludedBlankRows, excludedInvalidRows: invalid, summary: `${column}: ${rates.map(group => `${group.label} ${(group.rate * 100).toFixed(1)}% missing`).slice(0, 3).join("; ")}.` };
  }
  function compare(headers, rows, targetColumn, options = {}) {
    if (!headers.includes(targetColumn)) throw new Error("Choose an existing target column.");
    const context = prepare(headers, rows, options), target = context.columns.get(targetColumn);
    const nMissing = target.blanks.filter(Boolean).length, excludedNotApplicable = target.states.filter(status => status === "not_applicable").length, nPresent = rows.length - nMissing - excludedNotApplicable;
    if (nMissing < 5 || nPresent < 5) return { targetColumn, total: rows.length, nMissing, nPresent, excludedNotApplicable, insufficientData: true, results: [], pattern: "insufficient", note: "At least five missing and five present records are needed." };
    const candidates = options.columns || headers.filter(column => column !== targetColumn && !context.columns.get(column).idLike);
    if (!Array.isArray(candidates) || candidates.some(column => !headers.includes(column) || column === targetColumn)) throw new Error("Comparison columns must exist and differ from the target.");
    const results = candidates.map(column => compareColumn(context, targetColumn, column)).filter(Boolean).sort((a, b) => b.effectSize - a.effectSize || headers.indexOf(a.column) - headers.indexOf(b.column));
    const none = results.length >= 3 && results.every(result => ["weak", "none"].includes(result.strength));
    return { targetColumn, total: rows.length, nMissing, nPresent, excludedNotApplicable, insufficientData: false, results, pattern: none ? "none_detected" : "detected", note: none ? "Missing rows look like present rows in every other column. The gaps may depend on the missing value itself, so filling with an average could bias results." : "" };
  }
  function bandsFor(context, column, banding = {}) {
    const entry = context.columns.get(column);
    if (!entry) throw new Error("Choose an existing hold column.");
    if (entry.type !== "numeric") {
      const counts = new Map();
      context.rows.forEach((row, index) => { if (entry.states[index] === "present") { const key = text(row[column]); counts.set(key, (counts.get(key) || 0) + 1); } });
      return { labels: context.rows.map((row, index) => entry.states[index] !== "present" ? "Unknown" : counts.get(text(row[column])) < 10 ? "Other" : text(row[column])), numeric: false };
    }
    const mode = banding.mode || "quantiles";
    let edges;
    if (mode === "quantiles") {
      const k = Number(banding.k ?? 4);
      if (!Number.isInteger(k) || k < 2 || k > 20) throw new Error("Use 2–20 quantile bands.");
      edges = Array.from({ length: k - 1 }, (_, index) => quantile(entry.sorted, (index + 1) / k)).filter(Number.isFinite);
    } else if (mode === "fixedWidth") {
      const width = Number(banding.width);
      if (!Number.isFinite(width) || width <= 0) throw new Error("Band width must be positive.");
      const min = entry.sorted[0] ?? 0, max = entry.sorted.at(-1) ?? min;
      if ((max - min) / width > 200) throw new Error("Use a wider band (at most 200 bands).");
      edges = Array.from({ length: Math.floor((max - min) / width) }, (_, index) => min + width * (index + 1));
    } else if (mode === "custom") {
      edges = banding.edges;
      if (!Array.isArray(edges) || !edges.length || edges.length > 200 || edges.some((value, index) => !Number.isFinite(value) || (index && value <= edges[index - 1]))) throw new Error("Custom edges must be finite, unique, and increasing.");
    } else throw new Error("Choose quantiles, fixed width, or custom edges.");
    edges = [...new Set(edges)];
    const labels = edges.map((edge, index) => index ? `${edges[index - 1]} to < ${edge}` : `< ${edge}`).concat(edges.length ? `≥ ${edges.at(-1)}` : "All observed values");
    const indices = entry.numbers.map(value => value === null ? -1 : edges.filter(edge => value >= edge).length);
    return { labels: indices.map(index => index < 0 ? "Unknown" : labels[index]), indices, numeric: true, edges };
  }
  function holdSimilar(headers, rows, targetColumn, comparisonColumn, holdColumn, banding = {}, options = {}) {
    if (holdColumn === targetColumn || comparisonColumn === targetColumn || !headers.includes(comparisonColumn)) throw new Error("Hold and comparison columns must differ from the target.");
    const context = prepare(headers, rows, options), target = context.columns.get(targetColumn);
    if (!target) throw new Error("Choose an existing target column.");
    const unbanded = compareColumn(context, targetColumn, comparisonColumn);
    const definition = bandsFor(context, holdColumn, banding), groups = new Map();
    definition.labels.forEach((label, index) => { if (target.states[index] === "not_applicable") return; if (!groups.has(label)) groups.set(label, []); groups.get(label).push(index); });
    const bands = [...groups].map(([label, indices]) => {
      const nMissing = indices.filter(index => target.blanks[index]).length, nPresent = indices.length - nMissing;
      const result = compareColumn(context, targetColumn, comparisonColumn, indices);
      // A constant within-band comparison is a genuine zero effect, not absent evidence.
      return { label, nMissing, nPresent, missingStats: result?.missingStats || statistics(indices.filter(index => target.blanks[index]).map(index => context.columns.get(comparisonColumn).numbers[index]).filter(Number.isFinite)), presentStats: result?.presentStats || statistics(indices.filter(index => !target.blanks[index]).map(index => context.columns.get(comparisonColumn).numbers[index]).filter(Number.isFinite)), effectSize: result?.effectSize || 0, direction: result?.direction || 0, valid: nMissing >= 5 && nPresent >= 5 && (context.columns.get(comparisonColumn).type !== "numeric" || (result?.missingStats.count ?? 0) >= 5 && (result?.presentStats.count ?? 0) >= 5 || !result && indices.every(index => Number.isFinite(context.columns.get(comparisonColumn).numbers[index]))) };
    });
    const valid = bands.filter(band => band.valid), weight = valid.reduce((sum, band) => sum + band.nMissing + band.nPresent, 0);
    const combinedEffect = weight ? valid.reduce((sum, band) => sum + band.effectSize * (band.nMissing + band.nPresent), 0) / weight : 0;
    const sameDirection = band => typeof unbanded?.direction === "number" ? band.direction === unbanded.direction : Object.entries(unbanded?.direction || {}).filter(([label, direction]) => band.direction?.[label] === direction).length > Object.keys(unbanded?.direction || {}).length / 2;
    const unbandedEffect = unbanded?.effectSize || 0;
    const verdict = valid.length < 2 ? "insufficient" : combinedEffect <= unbandedEffect * .3 ? "explained" : combinedEffect >= unbandedEffect * .7 && valid.filter(sameDirection).length > valid.length / 2 ? "holds" : "partial";
    const nMissing = target.blanks.filter(Boolean).length;
    const unknownMissing = target.blanks.filter((blank, index) => blank && context.columns.get(holdColumn).blanks[index]).length;
    return { targetColumn, comparisonColumn, holdColumn, banding, unbandedEffect, combinedEffect, verdict, bands, warning: nMissing && unknownMissing / nMissing >= .5 ? "The hold column is missing in at least half of the target-missing records; this result is unreliable." : "", summary: `${comparisonColumn} while holding ${holdColumn}: ${verdict}; ${valid.length} usable bands.` };
  }
  function fillSimilar(headers, rows, targetColumn, params = {}, options = {}) {
    const context = prepare(headers, rows, options), target = context.columns.get(targetColumn);
    const method = params.method || "groupwise", columns = params.columns || params.holdColumns || [];
    if (!target || !["groupwise", "knn"].includes(method) || !Array.isArray(columns) || !columns.length || columns.some(column => column === targetColumn || !headers.includes(column)) || new Set(columns).size !== columns.length) throw new Error("Choose distinct similarity columns other than the target.");
    const minObserved = Number(params.minObserved ?? 5), k = Number(params.k ?? 7), statistic = params.statistic || "median";
    if (!Number.isInteger(minObserved) || minObserved < 1 || minObserved > 1000 || !Number.isInteger(k) || k < 1 || k > 50 || !["median", "mean"].includes(statistic)) throw new Error("Use a valid reference minimum, 1–50 neighbours, and median or mean.");
    const selected = params.rowIds ? new Set(params.rowIds) : null;
    const rowIds = new Set(rows.map(row => row._row));
    if (selected && [...selected].some(id => !rowIds.has(id))) throw new Error("Fill scope contains unknown source rows.");
    const donors = rows.map((row, index) => ({ row, index, value: target.numbers[index] })).filter(entry => target.states[entry.index] === "present" && Number.isFinite(entry.value) && !selected?.has(entry.row._row));
    const missing = rows.map((row, index) => ({ row, index })).filter(entry => target.blanks[entry.index] && (!selected || selected.has(entry.row._row)));
    const global = statistics(donors.map(entry => entry.value)).median;
    const definitions = columns.map(column => params.strict ? { labels: rows.map(row => String(row[column] ?? "")), numeric: false } : bandsFor(context, column, params.banding?.[column] || {}));
    const key = index => JSON.stringify(definitions.map(definition => definition.labels[index]));
    const groups = new Map();
    for (const donor of donors) { const label = key(donor.index); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(donor); }
    const ranges = columns.map(column => { const entry = context.columns.get(column); return (entry.sorted.at(-1) ?? 0) - (entry.sorted[0] ?? 0); });
    const features = columns.map((column, index) => {
      const comparison = context.columns.get(column), min = comparison.sorted[0] ?? 0;
      return { numeric: comparison.type === "numeric", values: rows.map((row, rowIndex) => comparison.states[rowIndex] !== "present" ? null : comparison.type === "numeric" ? comparison.numbers[rowIndex] === null ? null : (comparison.numbers[rowIndex] - min) / (ranges[index] || 1) : text(row[column])) };
    });
    const estimates = new Map();
    const fills = [], blocked = [];
    for (const entry of missing) {
      if (params.strict && columns.some(column => context.columns.get(column).states[entry.index] !== "present")) { blocked.push({ rowId: entry.row._row, reason: "Strict group fill requires observed group keys." }); continue; }
      const estimateKey = method === "groupwise" ? key(entry.index) : JSON.stringify(features.map(feature => feature.values[entry.index]));
      if (estimates.has(estimateKey)) { fills.push({ row: entry.row._row, ...estimates.get(estimateKey) }); continue; }
      let references = [], source = "global", bandLabel;
      if (method === "groupwise") {
        bandLabel = definitions.map((definition, index) => `${columns[index]}: ${definition.labels[entry.index]}`).join(" · ");
        references = groups.get(key(entry.index)) || [];
        if (references.length >= minObserved) source = "band";
        else {
          if (params.strict) { blocked.push({ rowId: entry.row._row, reason: "Strict group has no observed reference values; no fallback was applied." }); continue; }
          // Expand numeric bands in distance order; sparse categories share the Other pool.
          const distance = donor => definitions.reduce((sum, definition, index) => {
            if (definition.numeric) {
              const a = definition.indices[entry.index], b = definition.indices[donor.index];
              return a < 0 || b < 0 ? sum + (a === b ? 0 : 1e6) : sum + Math.abs(a - b);
            }
            const a = definition.labels[entry.index], b = definition.labels[donor.index];
            return sum + (a === b ? 0 : a === "Other" || b === "Other" ? 1 : 1e6);
          }, 0);
          const nearby = donors.map(donor => ({ donor, distance: distance(donor) })).filter(entry => entry.distance < 1e6).sort((a, b) => a.distance - b.distance || a.donor.index - b.donor.index);
          references = [];
          for (let offset = 0; offset < nearby.length;) {
            const limit = nearby[offset].distance;
            while (offset < nearby.length && nearby[offset].distance === limit) references.push(nearby[offset++].donor);
            if (references.length >= minObserved) break;
          }
          if (references.length >= minObserved) source = "widened"; else references = [];
        }
      } else {
        const neighbours = [];
        for (const donor of donors) {
          let distance = 0, used = 0;
          for (const feature of features) {
            const a = feature.values[entry.index], b = feature.values[donor.index];
            if (a === null) continue;
            used++;
            distance += b === null ? 1 : feature.numeric ? Math.abs(a - b) : a === b ? 0 : 1;
          }
          if (!used) continue;
          distance /= used;
          if (neighbours.length === k && (distance > neighbours.at(-1).distance || distance === neighbours.at(-1).distance && donor.index > neighbours.at(-1).index)) continue;
          const candidate = { ...donor, distance };
          neighbours.push(candidate); neighbours.sort((a, b) => a.distance - b.distance || a.index - b.index); if (neighbours.length > k) neighbours.pop();
        }
        references = neighbours;
        if (references.length) source = "knn";
      }
      const value = references.length ? statistics(references.map(entry => entry.value))[method === "knn" ? "median" : statistic] : global;
      if (value === null) { blocked.push({ rowId: entry.row._row, reason: "No observed numerical references are available." }); continue; }
      const estimate = { value, source, ...(bandLabel ? { bandLabel } : {}), ...(method === "knn" ? { neighbourRows: references.map(entry => entry.row._row) } : {}) };
      estimates.set(estimateKey, estimate);
      fills.push({ row: entry.row._row, ...estimate });
    }
    const before = target.numbers.filter((value, index) => !target.blanks[index] && Number.isFinite(value));
    const after = before.concat(fills.map(fill => fill.value));
    const distributions = histogram([before, after]);
    return { method, params: { ...params, method, columns, minObserved, k, statistic }, fills, blocked, fallbackCount: fills.filter(fill => ["widened", "global"].includes(fill.source)).length, beforeStats: statistics(before), afterStats: statistics(after), histogramBefore: { ...distributions, sets: [distributions.sets[0]] }, histogramAfter: { ...distributions, sets: [distributions.sets[1]] } };
  }
  function significance(headers, rows, targetColumn, result, options = {}) {
    const context = prepare(headers, rows, options), target = context.columns.get(targetColumn), iterations = 500;
    const results = result.results.map(entry => ({ ...entry }));
    if (result.nMissing > 20000 || result.nPresent > 20000) {
      results.slice(0, 5).forEach(entry => { entry.pValue = null; entry.significance = "skipped"; entry.significanceNote = "A target group exceeds 20,000 rows."; });
      return { ...result, results };
    }
    const applicable = rows.map((_, index) => index).filter(index => target.states[index] !== "not_applicable");
    const positions = new Map(applicable.map((index, position) => [index, position]));
    for (const entry of results.slice(0, 5)) {
      const comparison = context.columns.get(entry.column);
      const usable = applicable.filter(index => comparison.states[index] === "present" && (comparison.type !== "numeric" || Number.isFinite(comparison.numbers[index])) && (comparison.type !== "date" || comparison.dates[index] !== null));
      let seed = Number(options.permutationSeed ?? 1) >>> 0;
      for (const char of `${targetColumn}:${entry.column}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const labels = applicable.map(index => target.blanks[index] ? 1 : 0);
      let evaluate;
      if (comparison.type === "numeric") {
        const ordered = usable.map(index => ({ position: positions.get(index), value: comparison.numbers[index] })).sort((a, b) => a.value - b.value);
        const ranks = [];
        for (let offset = 0; offset < ordered.length;) {
          let end = offset + 1; while (end < ordered.length && ordered[end].value === ordered[offset].value) end++;
          const rank = (offset + 1 + end) / 2;
          for (let index = offset; index < end; index++) ranks.push({ position: ordered[index].position, rank });
          offset = end;
        }
        evaluate = () => { let n = 0, rankSum = 0; for (const entry of ranks) if (labels[entry.position]) { n++; rankSum += entry.rank; } const other = ranks.length - n; return n && other ? Math.abs((2 * rankSum - n * (n + 1) - n * other) / (n * other)) : 0; };
      } else {
        const counts = new Map(), members = [];
        for (const index of usable) { const label = comparison.type === "date" ? comparison.dates[index] : text(rows[index][entry.column]); if (!counts.has(label)) counts.set(label, { total: 0, missing: 0 }); counts.get(label).total++; members.push({ position: positions.get(index), group: counts.get(label) }); }
        const overall = result.nMissing / applicable.length;
        evaluate = () => { for (const group of counts.values()) group.missing = 0; for (const member of members) if (labels[member.position]) member.group.missing++; let effect = 0; for (const group of counts.values()) if (group.total >= 10) effect = Math.max(effect, Math.abs(group.missing / group.total - overall)); return effect; };
      }
      let extreme = 0;
      for (let iteration = 0; iteration < iterations; iteration++) {
        for (let index = labels.length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [labels[index], labels[other]] = [labels[other], labels[index]]; }
        if (evaluate() >= entry.effectSize - 1e-12) extreme++;
      }
      entry.pValue = extreme / iterations; entry.permutations = iterations;
      entry.significance = entry.pValue < .01 ? "robust" : entry.pValue < .05 ? "likely" : "could be chance";
    }
    return { ...result, results };
  }
  return { compare, holdSimilar, fillSimilar, prepare, bandsFor, statistics, histogram, policy, cliffsDelta, winsorizedSmd, significance };
})();
if (typeof module !== "undefined") module.exports = AnalysisEngine;
