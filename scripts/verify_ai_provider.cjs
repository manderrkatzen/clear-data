const base = (process.env.BASE_URL || "https://clearview-data-quality-copilot.ritwikranjanpandey.workers.dev").replace(/\/$/, "");
const timeout = AbortSignal.timeout(60000);

(async () => {
  const statusResponse = await fetch(`${base}/api/ai/review`, { signal: AbortSignal.timeout(10000) });
  if (!statusResponse.ok) throw new Error(`AI status endpoint returned HTTP ${statusResponse.status}.`);
  const status = await statusResponse.json();
  if (!status.available) throw new Error(`AI provider is not configured (${status.provider || "unknown provider"}).`);
  if (status.turnstileSiteKey && !process.env.TURNSTILE_TOKEN) throw new Error("This deployment requires Turnstile; provide a valid TURNSTILE_TOKEN to run the provider check.");

  const started = performance.now();
  const response = await fetch(`${base}/api/ai/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: timeout,
    body: JSON.stringify({
      mode: "fix",
      instruction: "For this health check, fill the single blank text value with the exact label AI_HEALTHCHECK.",
      turnstileToken: process.env.TURNSTILE_TOKEN || "",
      context: {
        column: "healthcheck_label",
        type: "missing",
        role: "text",
        headers: ["healthcheck_label"],
        allowedFixes: ["constant"],
        count: 1,
        affected: 1,
        values: [{ value: "", count: 1, locked: true }],
        samples: [],
        groups: [],
        statistics: {},
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`AI provider check returned HTTP ${response.status}: ${payload.detail || payload.error || "unknown error"}`);
  const result = payload.result;
  if (result?.operation !== "constant" || result.params?.value !== "AI_HEALTHCHECK") throw new Error(`AI responded, but the validated health-check proposal was unexpected: ${JSON.stringify(result)}`);
  console.log(`AI provider check passed: ${payload.provider || status.provider} · ${status.model} · ${Math.round(performance.now() - started)} ms · validated constant proposal.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
