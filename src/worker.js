import ai from "./ai.cjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The deployed runtime always uses OpenAI; local Ollama is Node-only.
    const config = { ...env, AI_MODE: "deployed" };
    if (url.pathname === "/api/ai/status") return ai.json(ai.providerConfig(config));
    if (url.pathname === "/api/ai/proposals") return ai.handleProposal(request, config);
    if (url.pathname === "/api/ai/interpretations") return ai.handleInterpretations(request, config);
    if (url.pathname.startsWith("/api/")) return ai.json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
