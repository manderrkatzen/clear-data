// Stage 8 / CORE-02: the old rp* selectors are replaced by the review_spec acceptance suites.
const {spawnSync} = require("node:child_process");
const suites = {
  missing:["missing"],outliers:["outliers"],duplicates:["duplicates"],format:["format","format_details"],
  labels:["labels"],whitespace:["whitespace"],invalid:["invalid"],cross:["cross"],
  constant:["constant"],zeros:["zeros"],multi:["multi"],sensitive:["sensitive"],shared:["shared"]
};
const selected = process.env.REVIEW_STAGE || "all";
if (selected !== "all" && !suites[selected]) throw new Error(`Unknown REVIEW_STAGE: ${selected}`);
for (const suite of selected === "all" ? Object.values(suites).flat() : suites[selected]) {
  const file = suite === "format_details" ? "verify_spec_format_details.cjs" : `verify_spec_${suite}_ui.cjs`;
  const result = spawnSync(process.execPath,[require.resolve(`./${file}`)],{stdio:"inherit",env:process.env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
