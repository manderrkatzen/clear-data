const test = require("node:test");
const assert = require("node:assert/strict");
const cleaning = require("../cleaning-engine.js");
const engine = require("../review-page-engine.js");
const ai = require("../src/review-ai.cjs");
const rows = values => values.map((value,i) => ({_row:i+1,value,group:i < 3 ? "A" : "B",date:`2025-01-${String(i+1).padStart(2,"0")}`}));
const headers = ["value","group","date"];
const preview = (data,ids,operation,params = {}) => cleaning.treatment(headers,data,ids,"value",{operation,scope:{mode:"selected",rowIds:ids},decimals:2,...params},cleaning.defaultPolicy("value"),[],{});
test("ordered fills respect dates and block endpoints, without touching source",() => {
  const data = rows(["2","","","8",""]), original = JSON.stringify(data);
  assert.deepEqual(preview(data,[2,3,5],"previous",{orderColumn:"date"}).patches.map(p => p.after),["2","2","8"]);
  const next = preview(data,[2,3,5],"next",{orderColumn:"date"}); assert.deepEqual(next.patches.map(p => p.after),["8","8"]); assert.equal(next.blocked.length,1);
  const interpolation = preview(data,[2,3,5],"interpolate",{orderColumn:"date"}); assert.deepEqual(interpolation.patches.map(p => p.after),["4.00","6.00"]); assert.equal(interpolation.blocked.length,1);
  assert.equal(JSON.stringify(data),original);
});
test("categorical mode has group-scoped references and blocks empty groups",() => {
  const data = rows(["North","North","","South","South",""]);
  assert.deepEqual(preview(data,[3,6],"groupMode",{groupColumns:["group"]}).patches.map(p => p.after),["North","South"]);
  assert.equal(preview(rows(["","",""]),[1,2,3],"mode").blocked.length,3);
});
test("date interpretation is explicit and invalid/ambiguous dates cannot silently normalize",() => {
  const data = rows(["03/07/2025","31/02/2025","2025-03-07","07.03.2025"]);
  const p = preview(data,[1,2,3,4],"dateFormat",{dateFormat:"mdy",targetFormat:"dmy"});
  assert.deepEqual(p.patches.map(p => p.after),["07/03/2025","07/03/2025","07/03/2025"]); assert.equal(p.blocked.length,1);
});
test("alternate date outputs remain readable and retain their explicit day/month meaning",() => {
  const data = rows(["2025-03-07","2025-04-08"]);
  const formatted = preview(data,[1,2],"dateFormat",{dateFormat:"iso",targetFormat:"mon"});
  assert.equal(formatted.patches[0].after,"07-Mar-2025"); assert.equal(engine.dateValue("07-Mar-2025"),"2025-03-07");
  const after = engine.applyPreview(headers,data,formatted), detected = engine.detect(headers,after,cleaning.profile(headers,after),[]);
  assert.ok(!detected.some(issue => issue.column === "value" && ["invalid","type-mismatch"].includes(issue.reviewType)));
  const formats = {[JSON.stringify([1,"date","07/03/2025"])]:"dmy"};
  assert.equal(engine.dateValue("07/03/2025",formats[JSON.stringify([1,"date","07/03/2025"])]),"2025-03-07");
});
test("character treatments distinguish trimming, hidden characters, case, and mojibake",() => {
  const data = rows(["  paid  SOCIAL\u200b ","cafÃ©"]);
  assert.equal(preview(data,[1],"removeHidden").patches[0].after,"  paid  SOCIAL ");
  assert.equal(preview(data,[1],"cleanCharacters").patches[0].after,"paid SOCIAL");
  assert.equal(preview(data,[2],"fixEncoding").patches[0].after,"café");
  assert.equal(preview(rows(["pAID social"]),[1],"titlecase").patches[0].after,"Paid Social");
});
test("structural treatments preview complete effects and replay with rollback",() => {
  const data = rows(["a;b;c","d"]);
  const split = preview(data,[1],"splitColumns",{separator:";"});
  assert.deepEqual(split.addedColumns,["value_1","value_2","value_3"]);
  const history = [{patches:split.patches,removedRows:[],structure:{...split}}];
  const applied = engine.replay(headers,data,history);
  assert.equal(applied.rows[0].value_2,"b"); assert.equal(applied.rows[1].value_2,"");
  assert.deepEqual(engine.replay(headers,data,[]),{headers,rows:data});
  const splitRows = preview(data,[1],"splitRows",{separator:";",identityIds:[99]});
  assert.equal(splitRows.addedRows.length,2); assert.ok(splitRows.addedRows.every(r => r._row > 2));
  const log = preview(rows(["10","-2"]),[1,2],"log"); assert.equal(log.addedColumns[0],"value_log"); assert.equal(log.blocked.length,1);
  const drop = preview(data,[1,2],"dropColumn"); assert.deepEqual(engine.replay(headers,data,[{patches:[],removedRows:[],structure:drop}]).headers,["group","date"]);
});
test("leading zero padding and sensitive masking are scoped and reversible",() => {
  const data = rows(["123","01234"]), p = preview(data,[1],"padZeros",{width:5}); assert.equal(p.patches[0].after,"00123"); assert.equal(data[0].value,"123");
  assert.equal(preview(rows(["jane@gmail.com"]),[1],"mask").patches[0].after,"j***@gmail.com");
});
test("sensitive detection verifies Luhn and covers local personal-field patterns",() => {
  for (const [value,type] of [["jane@example.com","email"],["+1 (202) 555-4821","phone"],["4111 1111 1111 1111","card"],["123-45-6789","SSN"],["GB82 WEST 1234 5698 7654 32","IBAN"],["192.168.1.1","IP address"],["2001:db8::1","IP address"]]) assert.equal(engine.sensitiveType(value),type);
  assert.notEqual(engine.sensitiveType("4111 1111 1111 1112"),"card");
  assert.equal(engine.sensitiveType("999.168.1.1"),"");
  assert.equal(engine.sensitiveType("Jane Doe","customer_name"),"named personal field");
  assert.equal(engine.sensitiveType("***4821","phone"),"");
  assert.equal(engine.mask("Amy"),"***");
  assert.throws(() => ai.validateRequest({mode:"fix",context:{type:"sensitive"}}),/Invalid Review column/);
});
test("flags preserve source values and encode single-value rows as well as split cells",() => {
  const data = rows(["Email; Search","Email","Search"]), p = preview(data,[1],"splitFlags",{separator:";"});
  assert.deepEqual(p.addedColumns,["value_Email","value_Search"]);
  const applied = engine.applyPreview(headers,data,p);
  assert.equal(applied[0].value_Search,"1"); assert.equal(applied[1].value_Email,"1"); assert.equal(applied[1].value_Search,"0");
  assert.equal(applied[0].value,"Email; Search");
  assert.throws(() => preview(rows(Array.from({length:21},(_,i) => `part${i}; common`)),[1],"splitFlags",{separator:";"}),/20 distinct/);
});
test("structural rollback retains a later approved derived-column or child-row patch",() => {
  const data = rows(["a;b","c"]), later = {patches:[{rowId:3,column:"value_1",before:"",after:"reviewed"}],removedRows:[],reviewImpact:{beforeRows:data.concat({...data[0],_row:3,value:"b"})}};
  const restored = engine.replay(headers,data,[later]);
  assert.ok(restored.headers.includes("value_1")); assert.equal(restored.rows.find(r => r._row === 3).value_1,"reviewed"); assert.equal(restored.rows[0].value,"a;b");
});
test("inconsistent separators stay blocked rather than being silently reviewed as split",() => {
  const split = preview(rows(["a;b","x|y"]),[1,2],"splitRows",{separator:";"});
  assert.equal(split.addedRows.length,1); assert.deepEqual(split.blocked.map(entry=>entry.rowId),[2]); assert.equal(split.rowLineage[0].sourceRowId,1);
});
test("detection covers all requested new issue families",() => {
  const hs = ["record_id","age","rating","account_code","notes","email","constant","parts","end_date","start_date","profit","revenue","cost","rate","labels"];
  const rs = Array.from({length:100},(_,i) => ({_row:i+1,record_id:String(i===99?1:i+1),age:i===0?"oops":i===1?"-2":"30",rating:i===0?"7":"4",account_code:i===0?"1234":"01234",notes:i===0?"  café\u200b ":"ok",email:`person${i}@example.com`,constant:"yes",parts:i===0?"a;b":"a",end_date:"2025-01-01",start_date:"2025-01-02",profit:"5",revenue:"10",cost:"2",rate:i<50?"0.5":"50",labels:i===0?"paid_social":"Paid Social"}));
  const issues = engine.detect(hs,rs,cleaning.profile(hs,rs),[]), types = new Set(issues.map(i=>i.reviewType));
  for (const type of ["duplicate-values","type-mismatch","whitespace","invalid","constant","leading-zeros","multi-value","sensitive","cross-column","scale","category-variants"]) assert.ok(types.has(type),type);
});
test("AI summary and suggestions reject scope injection and low-confidence parses",() => {
  const context = {column:"date",type:"format",role:"date",headers:["date"],allowedFixes:["to-iso"],count:10,affected:2,values:[{value:"March 3rd 25",count:2,locked:true}],samples:[],groups:[]};
  const input = ai.validateRequest({mode:"parse",context});
  assert.deepEqual(Object.entries(ai.validateResult({note:"These need a source date.",mapping:{"March 3rd 25":{value:"2025-03-03",confidence:.7}}},input).mapping),[]);
  assert.throws(()=>ai.validateResult({note:"Change it.",operation:"drop-column"},input),/not allowed/);
  assert.throws(()=>ai.validateResult({note:"Parse it.",mapping:{other:{value:"2025-03-03",confidence:.99}}},input),/unsubmitted/);
  assert.throws(()=>ai.validateRequest({mode:"fix",context:{...context,samples:Array(21).fill("a")}}),/20 sample/);
});
test("Review endpoint uses bounded summaries and shared provider verification",async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url,options) => {
      assert.match(String(url),/api\/generate/);
      const payload = JSON.parse(options.body); assert.ok(!payload.prompt.includes('"rows"') && !payload.prompt.includes('"_row"'));
      return new Response(JSON.stringify({response:JSON.stringify({note:"Blanks may mean no discount. Confirm this convention.",locks:[""],operation:"constant",params:{value:"0"},reason:"Review the source convention."})}),{status:200,headers:{"content-type":"application/json"}});
    };
    const context = {column:"discount_pct",type:"missing",role:"number",headers:["discount_pct"],allowedFixes:["constant","median"],count:1000,affected:296,values:[{value:"",count:296,locked:true}],samples:["5","10"],groups:[]};
    const response = await ai.handleReview(new Request("http://test/api/ai/review",{method:"POST",headers:{"cf-connecting-ip":"review-unit"},body:JSON.stringify({mode:"fix",context})}),{AI_MODE:"local",AI_MAX_REQUESTS_PER_HOUR:20});
    assert.equal(response.status,200); const result = (await response.json()).result; assert.equal(result.operation,"constant"); assert.equal(result.requiresConfirmation,true);
    const blocked = await ai.handleReview(new Request("http://test/api/ai/review",{method:"POST",body:JSON.stringify({mode:"fix",context})}),{AI_MODE:"local",TURNSTILE_SECRET_KEY:"test"}); assert.equal(blocked.status,422);
  } finally { global.fetch = originalFetch; }
});
test("multi-value AI accepts the issue-specific 30 samples and rejects fabricated separators",()=>{
  const context={column:"channels",type:"multi-value",role:"text",headers:["channels"],allowedFixes:["split-to-rows"],count:100,affected:30,values:[{value:"Email; Search",count:30,locked:true}],samples:Array(30).fill("Email; Search"),groups:[]};
  const input=ai.validateRequest({mode:"explore",context});
  assert.equal(ai.validateResult({note:"These categories use semicolons. Review the row expansion before applying.",separator:";"},input).separator,";");
  assert.throws(()=>ai.validateResult({note:"Use pipe separators.",separator:"|"},input),/unobserved/);
  assert.throws(()=>ai.validateRequest({mode:"explore",context:{...context,samples:Array(31).fill("Email; Search")}}),/30 sample/);
});
