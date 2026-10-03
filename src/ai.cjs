const MAX_BODY_BYTES = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 45000;
const requestWindows = new Map();

function apiError(message, status = 422) { return Object.assign(new Error(message), { status }); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function maxRequests(env) {
  const value = Number(env.AI_MAX_REQUESTS_PER_HOUR || 10);
  return Number.isInteger(value) && value > 0 ? value : 10;
}
function providerConfig(env) {
  const local = env.AI_MODE === "local";
  return { available: local || Boolean(env.OPENAI_API_KEY), provider: local ? "ollama" : "openai", model: local ? env.OLLAMA_MODEL || "llama3.2:3b" : env.OPENAI_MODEL || "gpt-4.1-mini", maxRequestsPerHour: maxRequests(env), healthChecked: false };
}
function rateLimit(key, env) {
  const now = Date.now();
  // Process/isolate-local protection; not a durable distributed quota.
  for (const [address, times] of requestWindows) if (!times.length || times.at(-1) <= now - 3600000) requestWindows.delete(address);
  const times = (requestWindows.get(key) || []).filter((time) => time > now - 3600000);
  if (times.length >= maxRequests(env)) return false;
  times.push(now);
  requestWindows.set(key, times);
  return true;
}
async function readPayload(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw apiError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw apiError("Invalid JSON.");
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw apiError("Request too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw apiError("Invalid JSON."); }
}
function validateRequest(payload) {
  const { instruction, context } = payload || {};
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 300) throw apiError("A bounded instruction is required.");
  if (!context || typeof context.column !== "string" || !context.column.trim() || !["numeric", "categorical"].includes(context.type) || !Array.isArray(context.allowedOperations)) throw apiError("The proposal context is incomplete.");
  const operation = context.type === "numeric" ? "fill_missing" : "map_categories";
  if (context.allowedOperations.length !== 1 || context.allowedOperations[0] !== operation) throw apiError("The proposal context contains unsupported operations.");
  if (!Number.isInteger(context.affectedRecords) || context.affectedRecords < 1) throw apiError("Affected record count is invalid.");
  if (context.type === "categorical" && (!context.categoryValues || typeof context.categoryValues !== "object" || Array.isArray(context.categoryValues) || !Object.keys(context.categoryValues).length)) throw apiError("A reviewed category source set is required.");
  return { instruction: instruction.trim(), context };
}
function proposalPrompt(instruction, context) {
  return `You are a data-cleaning proposal service. Return ONLY JSON. Current issue context: ${JSON.stringify(context)}. User instruction: ${JSON.stringify(instruction)}. Select only an operation from allowedOperations. Return {"operation":"...","column":"...","value":number|null,"mapping":{"source":"target"},"assumptions":["..."],"warnings":["..."]}. Use value only for fill_missing and mapping only for map_categories. Never propose data changes outside the provided column and affected records.`;
}
function parsePlan(text) {
  if (typeof text !== "string") throw apiError("The AI response was not a structured proposal.");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw apiError("The AI response was not a structured proposal.");
  try { return JSON.parse(match[0]); } catch { throw apiError("The AI response contained invalid proposal JSON."); }
}
function responseText(result) {
  if (typeof result.output_text === "string" && result.output_text) return result.output_text;
  return (Array.isArray(result.output) ? result.output : [])
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text).join("");
}
function validatePlan(plan, context) {
  if (!plan || !context.allowedOperations.includes(plan.operation)) throw apiError("The proposed operation is not allowed for this issue.");
  if (plan.column !== context.column) throw apiError("The proposal targeted a different column.");
  if (plan.operation === "fill_missing" && (context.type !== "numeric" || !Number.isFinite(plan.value))) throw apiError("The proposed numeric fill is invalid.");
  if (plan.operation === "map_categories") {
    if (context.type !== "categorical" || !plan.mapping || typeof plan.mapping !== "object" || Array.isArray(plan.mapping) || !Object.keys(plan.mapping).length) throw apiError("The proposed category mapping is invalid.");
    if (!Object.entries(plan.mapping).every(([source, target]) => Object.hasOwn(context.categoryValues || {}, source) && typeof target === "string" && target.trim())) throw apiError("The proposal mapped values outside the reviewed category set.");
  }
  const caveats = (values) => Array.isArray(values) ? values.filter((value) => typeof value === "string").slice(0, 3).map((value) => value.slice(0, 600)) : [];
  return { operation: plan.operation, column: plan.column, value: plan.operation === "fill_missing" ? plan.value : undefined, mapping: plan.operation === "map_categories" ? plan.mapping : undefined, assumptions: caveats(plan.assumptions), warnings: caveats(plan.warnings), requiresConfirmation: true };
}
async function verifyTurnstile(request, token, env) {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (typeof token !== "string" || !token) throw apiError("Complete the security check before requesting an AI proposal.");
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (!response.ok || !(await response.json()).success) throw apiError("The security check could not be verified. Try again.");
}
async function askProvider(instruction, context, env) {
  const config = providerConfig(env);
  const prompt = proposalPrompt(instruction, context);
  let response;
  if (config.provider === "ollama") {
    response = await fetch(new URL("/api/generate", env.OLLAMA_URL || "http://192.168.56.1:11434"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: config.model, prompt, stream: false, format: "json", options: { temperature: 0 } }), signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } else {
    response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: config.model, input: prompt, text: { format: { type: "json_object" } }, temperature: 0, max_output_tokens: 300 }), signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  }
  if (!response.ok) throw apiError("The AI provider did not accept the proposal request.", 502);
  const result = await response.json();
  return config.provider === "ollama" ? result.response : responseText(result);
}
async function handleProposal(request, env) {
  if (request.method === "GET") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || "" });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  try {
    if (!providerConfig(env).available) return json({ error: "AI is not configured for this deployment." }, 503);
    const payload = await readPayload(request);
    const { instruction, context } = validateRequest(payload);
    const key = `${providerConfig(env).provider}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
    if (!rateLimit(key, env)) return json({ error: "AI proposal limit reached. Try again later." }, 429);
    await verifyTurnstile(request, payload.turnstileToken, env);
    const raw = await askProvider(instruction, context, env);
    return json({ proposal: validatePlan(parsePlan(raw), context), provider: providerConfig(env).provider });
  } catch (error) {
    const timeout = ["TimeoutError", "AbortError"].includes(error.name);
    return json({ error: timeout ? "The AI request timed out. Try again." : error.message || "Proposal could not be created." }, timeout ? 504 : error.status || 422);
  }
}

module.exports = { MAX_BODY_BYTES, PROVIDER_TIMEOUT_MS, json, providerConfig, readPayload, validateRequest, parsePlan, responseText, validatePlan, handleProposal };
