// Earlier structural-suite entry point now verifies the shared spec and final issue modules.
const {spawnSync} = require("node:child_process");
for (const file of ["verify_spec_shared_ui.cjs","verify_spec_multi_ui.cjs","verify_spec_sensitive_ui.cjs"]) {
  const result = spawnSync(process.execPath,[require.resolve(`./${file}`)],{stdio:"inherit",env:process.env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
