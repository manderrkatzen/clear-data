const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ai = require("./src/ai.cjs");

const root = __dirname;
const config = { ...process.env, AI_MODE: process.env.AI_MODE || "local" };
const mimeTypes = { ".css": "text/css", ".csv": "text/csv", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain" };
const assets = new Set(["index.html", "app.js", "spreadsheet.js", "workspace.js", "cleaning-engine.js", "profile-worker.js", "review.js", "review-ui.js", "review.css", "design-system.css", "fonts/source-sans-3-latin.woff2", "fonts/OFL.txt", "styles.css", "spreadsheet.css", "workspace.css", "healthcare_patient_visits.csv", "sales_orders.csv", "marketing_campaigns.csv"]);
for (const asset of ["analysis-engine.js", "analysis-worker.js", "analytics.js", "value-review.js"]) assets.add(asset);

async function sendWebResponse(response, result) {
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, rejected = false;
    request.on("data", (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > ai.MAX_BODY_BYTES) { rejected = true; reject(Object.assign(new Error("Request too large."), { status: 413 })); return; }
      chunks.push(chunk);
    });
    request.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    request.on("error", reject);
    request.on("aborted", () => reject(new Error("Request aborted.")));
  });
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost:4174");
    if (url.pathname === "/api/ai/status" || url.pathname === "/api/ai/config") {
      if (request.method !== "GET") return sendWebResponse(response, new Response("Method not allowed", { status: 405 }));
      return sendWebResponse(response, ai.json({ ...ai.providerConfig(config), mode: config.AI_MODE }));
    }
    if (["/api/ai/proposals", "/api/ai/interpretations", "/api/ai/pattern"].includes(url.pathname)) {
      if (Number(request.headers["content-length"]) > ai.MAX_BODY_BYTES) return sendWebResponse(response, ai.json({ error: "Request too large." }, 413));
      const body = request.method === "POST" ? await readBody(request) : undefined;
      const headers = new Headers({ "content-type": "application/json", "cf-connecting-ip": request.socket.remoteAddress || "unknown" });
      const webRequest = new Request(url, { method: request.method, headers, body });
      const handler = url.pathname === "/api/ai/pattern" ? ai.handlePattern : url.pathname === "/api/ai/interpretations" ? ai.handleInterpretations : ai.handleProposal;
      return sendWebResponse(response, await handler(webRequest, config));
    }
    if (url.pathname.startsWith("/api/")) return sendWebResponse(response, ai.json({ error: "Not found" }, 404));
    if (!["GET", "HEAD"].includes(request.method)) return sendWebResponse(response, new Response("Method not allowed", { status: 405 }));
    const pathname = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!assets.has(pathname)) return sendWebResponse(response, new Response("Not found", { status: 404 }));
    fs.readFile(path.join(root, pathname), (error, content) => {
      if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500); return response.end(); }
      response.writeHead(200, { "content-type": `${mimeTypes[path.extname(pathname)] || "application/octet-stream"}; charset=utf-8` });
      response.end(request.method === "HEAD" ? undefined : content);
    });
  } catch (error) {
    if (!response.headersSent) await sendWebResponse(response, ai.json({ error: error.message || "Request failed." }, error.status || 422));
  }
}).listen(4174, "0.0.0.0", () => console.log(`Data Quality Copilot: http://localhost:4174 (${config.AI_MODE} AI mode)`));
