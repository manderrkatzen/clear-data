const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const config = {
  mode: process.env.AI_MODE || "local",
  ollamaUrl: process.env.OLLAMA_URL || "http://192.168.56.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.2:3b",
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  maxRequests: Number(process.env.AI_MAX_REQUESTS_PER_HOUR || 10),
};
const mimeTypes = { ".css": "text/css", ".csv": "text/csv", ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const requestWindows = new Map();

function sendJson(response, status, body) { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(body)); }
function readJson(request) { return new Promise((resolve, reject) => { let body = ""; request.on("data", (chunk) => { body += chunk; if (body.length > 65536) reject(new Error("Request too large")); }); request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); } }); request.on("error", reject); }); }
function rateLimit(request) { const key = request.socket.remoteAddress || "unknown"; const now = Date.now(); const window = requestWindows.get(key)?.filter((time) => now - time < 3600000) || []; if (window.length >= config.maxRequests) return false; window.push(now); requestWindows.set(key, window); return true; }
function validateRequest(payload) { const { instruction, context } = payload || {}; if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 300) throw new Error("A bounded instruction is required."); if (!context || typeof context.column !== "string" || !["numeric", "categorical"].includes(context.type) || !Array.isArray(context.allowedOperations)) throw new Error("The proposal context is incomplete."); if (!Number.isInteger(context.affectedRecords) || context.affectedRecords < 1) throw new Error("Affected record count is invalid."); return { instruction: instruction.trim(), context };
}
function parsePlan(text) { const json = text.match(/\{[\s\S]*\}/)?.[0]; if (!json) throw new Error("The AI response was not a structured proposal."); return JSON.parse(json); }
function validatePlan(plan, context) { if (!plan || !context.allowedOperations.includes(plan.operation)) throw new Error("The proposed operation is not allowed for this issue."); if (plan.column !== context.column) throw new Error("The proposal targeted a different column."); if (plan.operation === "fill_missing" && (!Number.isFinite(plan.value) || context.type !== "numeric")) throw new Error("The proposed numeric fill is invalid."); if (plan.operation === "map_categories") { if (context.type !== "categorical" || !plan.mapping || typeof plan.mapping !== "object" || Array.isArray(plan.mapping)) throw new Error("The proposed category mapping is invalid."); const allowedSources = new Set(Object.keys(context.categoryValues || {})); if (!Object.entries(plan.mapping).every(([source, target]) => allowedSources.has(source) && typeof target === "string" && target.trim())) throw new Error("The proposal mapped values outside the reviewed category set."); } return { operation: plan.operation, column: plan.column, value: plan.value, mapping: plan.operation === "map_categories" ? plan.mapping : undefined, assumptions: Array.isArray(plan.assumptions) ? plan.assumptions.slice(0, 3) : [], warnings: Array.isArray(plan.warnings) ? plan.warnings.slice(0, 3) : [], requiresConfirmation: true };
}
function proposalPrompt(instruction, context) { return `You are a data-cleaning proposal service. Return ONLY JSON. Current issue context: ${JSON.stringify(context)}. User instruction: ${JSON.stringify(instruction)}. Select only an operation from allowedOperations. Return {"operation":"...","column":"...","value":number|null,"mapping":{"source":"target"},"assumptions":["..."],"warnings":["..."]}. Use value only for fill_missing and mapping only for map_categories. Never propose data changes outside the provided column and affected records.`; }
async function askOllama(prompt) { const response = await fetch(new URL("/api/generate", config.ollamaUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: config.ollamaModel, prompt, stream: false, format: "json", options: { temperature: 0 } }), signal: AbortSignal.timeout(45000) }); if (!response.ok) throw new Error("Ollama did not accept the proposal request."); return (await response.json()).response; }
async function askOpenAi(prompt) { if (!config.openAiKey) throw new Error("Deployed AI is not configured on this server."); const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.openAiKey}` }, body: JSON.stringify({ model: config.openAiModel, input: prompt, text: { format: { type: "json_object" } }, temperature: 0, max_output_tokens: 300 }), signal: AbortSignal.timeout(45000) }); if (!response.ok) throw new Error("OpenAI did not accept the proposal request."); const result = await response.json(); return result.output_text || ""; }
async function createProposal(request, response) { if (!rateLimit(request)) return sendJson(response, 429, { error: "AI proposal limit reached. Try again later." }); try { const { instruction, context } = validateRequest(await readJson(request)); const prompt = proposalPrompt(instruction, context); const raw = config.mode === "deployed" ? await askOpenAi(prompt) : await askOllama(prompt); sendJson(response, 200, { proposal: validatePlan(parsePlan(raw), context), provider: config.mode }); } catch (error) { sendJson(response, 422, { error: error.message || "Proposal could not be created." }); } }

http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/ai/config") return sendJson(response, 200, { mode: config.mode, model: config.mode === "deployed" ? config.openAiModel : config.ollamaModel, maxRequestsPerHour: config.maxRequests });
  if (request.method === "POST" && request.url === "/api/ai/proposals") return createProposal(request, response);
  const pathname = request.url === "/" ? "index.html" : decodeURIComponent(request.url).replace(/^\/+/, "");
  const file = path.resolve(root, pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, content) => { if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500); return response.end(); } response.writeHead(200, { "content-type": `${mimeTypes[path.extname(file)] || "application/octet-stream"}; charset=utf-8` }); response.end(content); });
}).listen(4174, "0.0.0.0", () => console.log(`Data Quality Copilot: http://localhost:4174 (${config.mode} AI mode)`));
