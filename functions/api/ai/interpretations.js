import ai from "../../../src/ai.cjs";

export function onRequest(context) {
  return ai.handleInterpretations(context.request, { ...context.env, AI_MODE: "deployed" });
}
