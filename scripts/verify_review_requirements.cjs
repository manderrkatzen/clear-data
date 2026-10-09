// CORE-62: source traceability is checked against the local authoritative files, not inferred from T-suite counts.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.join(__dirname,".."),specRoot=process.env.REVIEW_SPEC_DIR || path.join(root,"review_spec"),names=process.argv.slice(2);
const modules=["review-core.js","review-page.js","review-charts.js","review-page-engine.js","review.js","review-ui.js","app.js","workspace.js","cleaning-engine.js","analysis-engine.js","src/review-ai.cjs",...fs.readdirSync(path.join(root,"issues")).filter(name=>name.endsWith(".js")).map(name=>`issues/${name}`)];
const sources=modules.map(file=>({file,text:fs.readFileSync(path.join(root,file),"utf8")}));
for(const name of names.length?names:["00_shared","01_missing"]) {
  const text=fs.readFileSync(path.join(specRoot,`${name}.md`),"utf8"),prefix=/prefix `([A-Z]+)`/.exec(text)?.[1],pattern=prefix==="CORE"?/\bCORE-\d{2}\b/g:new RegExp(`\\b${prefix}-[DEFRA]-\\d{2}\\b`,"g"),ids=[...new Set(text.match(pattern) || [])];
  const missing=ids.filter(id=>!sources.some(source=>(source.text.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || []).some(comment=>comment.includes(id))));
  assert.deepEqual(missing,[],`${name}: requirement IDs missing comments at their implementation points`);
  console.log(`${name}: ${ids.length} implementation IDs have source traceability. Behavioral evidence remains in the issue's contract and acceptance suites.`);
}
