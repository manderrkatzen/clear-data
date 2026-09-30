const MAX_BODY_BYTES = 64 * 1024;
const MAX_INSTRUCTION_LENGTH = 300;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validateRequest(payload) {
  const { instruction, context } = payload || {};
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > MAX_INSTRUCTION_LENGTH) throw new Error("A bounded instruction is required.");
  if (!context || typeof context.column !== "string" || !["numeric", "categorical"].includes(context.type) || !Array.isArray(context.allowedOperations)) throw new Error("The proposal context is incomplete.");
  if (!Number.isInteger(context.affectedRecords) || context.affectedRecords < 1) throw new Error("Affected record count is invalid.");
  return { instruction: instruction.trim(), context };
}

function proposalPrompt(instruction, context) {
  return `You are a data-cleaning proposal service. Return ONLY JSON. Current issue context: ${JSON.stringify(context)}. User instruction: ${JSON.stringify(instruction)}. Select only an operation from allowedOperations. Return {"operation":"...","column":"...","value":number|null,"mapping":{"source":"target"},"assumptions":["..."],"warnings":["..."]}. Use value only for fill_missing and mapping only for map_categories. Never propose data changes outside the provided column and affected records.`;
}

function parsePlan(text) {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("The AI response was not a structured proposal.");
  return JSON.parse(jsonText);
}

function validatePlan(plan, context) {
  if (!plan || !context.allowedOperations.includes(plan.operation)) throw new Error("The proposed operation is not allowed for this issue.");
  if (plan.column !== context.column) throw new Error("The proposal targeted a different column.");
  if (plan.operation === "fill_missing" && (!Number.isFinite(plan.value) || context.type !== "numeric")) throw new Error("The proposed numeric fill is invalid.");
  if (plan.operation === "map_categories") {
    if (context.type !== "categorical" || !plan.mapping || typeof plan.mapping !== "object" || Array.isArray(plan.mapping)) throw new Error("The proposed category mapping is invalid.");
    const allowedSources = new Set(Object.keys(context.categoryValues || {}));
    if (!Object.entries(plan.mapping).every(([source, target]) => allowedSources.has(source) && typeof target === "string" && target.trim())) throw new Error("The proposal mapped values outside the reviewed category set.");
  }
  return {
    operation: plan.operation,
    column: plan.column,
    value: plan.value,
    mapping: plan.operation === "map_categories" ? plan.mapping : undefined,
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions.slice(0, 3) : [],
    warnings: Array.isArray(plan.warnings) ? plan.warnings.slice(0, 3) : [],
    requiresConfirmation: true,
  };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) return json({ error: "AI is not configured for this deployment." }, 503);
    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    const payload = await request.json();
    if (JSON.stringify(payload).length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    const { instruction, context } = validateRequest(payload);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input: proposalPrompt(instruction, context),
        text: { format: { type: "json_object" } },
        temperature: 0,
        max_output_tokens: 300,
      }),
    });
    if (!response.ok) return json({ error: "The AI provider did not accept the proposal request." }, 502);
    const result = await response.json();
    return json({ proposal: validatePlan(parsePlan(result.output_text || ""), context), provider: "openai" });
  } catch (error) {
    return json({ error: error.message || "Proposal could not be created." }, 422);
  }
}
