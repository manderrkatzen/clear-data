const test = require("node:test");
const assert = require("node:assert/strict");
const review = require("../src/review-ai.cjs");
const context = () => ({column:"measure",type:"missing",role:"number",headers:["measure","channel","revenue"],allowedFixes:["constant","median","median-by-group","knn"],count:100,affected:20,meaning:"Recorded measurement",values:[{value:"",count:10,locked:true},{value:"NULL",count:10,locked:true}],samples:["10","20"],groups:[{label:"North",total:50,missing:10,statistics:{count:40,median:12,mean:13,min:10,max:20},rows:[{secret:"must not reach provider"}]}],statistics:{count:80,median:12},primaryMetric:{column:"revenue",kind:"numeric",total:1000,affectedTotal:200,affectedSharePercent:20}});
test("CORE-51 / MISS-A-02 forward medians and metric share, discard raw-row extras",()=>{
  const result=review.validateRequest({mode:"fix",context:context()});
  assert.equal(result.context.groups[0].statistics.median,12);
  assert.equal(result.context.primaryMetric.affectedSharePercent,20);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(!JSON.stringify(result).includes('"rows"'));
});
test("MISS-A-01 requires actual complete confidence assessments, never fabricated certainty",()=>{
  const input=review.validateRequest({mode:"explore",context:context()});
  assert.throws(()=>review.validateResult({note:"NULL may be missing. Check its source convention.",locks:["NULL"]},input),/Assess every/);
  assert.throws(()=>review.validateResult({note:"NULL may be missing. Check its source convention.",locks:["NULL"],assessments:[{value:"invented",confidence:99,reason:"Unknown"}]},input),/Invalid per-value/);
  const result=review.validateResult({note:"NULL may be missing. Check its source convention.",locks:["NULL"],assessments:[{value:"NULL",confidence:95,reason:"Review the source convention."}]},input);
  assert.equal(result.assessments[0].confidence,95);
  assert.equal(result.requiresConfirmation,true);
});
test("CORE-52 / MISS-A-03 validate confirmation, neighbours, roles and values",()=>{
  const input=review.validateRequest({mode:"fix",context:context()});
  assert.equal(review.validateResult({note:"Use the confirmed convention. Review its exact scope.",operation:"constant",params:{value:0,blankMeansValue:true}},input).params.blankMeansValue,true);
  assert.throws(()=>review.validateResult({note:"Use the source convention.",operation:"constant",params:{value:0,blankMeansValue:"true"}},input),/Invalid confirmed/);
  assert.throws(()=>review.validateResult({note:"Use nearby records.",operation:"knn",params:{k:51,columns:["channel"]}},input),/1–50/);
  assert.throws(()=>review.validateResult({note:"Use nearby records.",operation:"knn",params:{k:7,columns:["invented"]}},input),/similarity columns/);
  assert.throws(()=>review.validateRequest({mode:"fix",context:{...context(),role:"text"}}),/target value type/);
});
