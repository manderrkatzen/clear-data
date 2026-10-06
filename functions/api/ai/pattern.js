import ai from "../../../src/ai.cjs";
export function onRequest(context) {
  return ai.handlePattern(context.request, { ...context.env, AI_MODE: "deployed" });
}
