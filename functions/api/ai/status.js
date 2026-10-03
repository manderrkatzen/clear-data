import ai from "../../../src/ai.cjs";

export function onRequestGet({ env }) {
  return ai.json(ai.providerConfig({ ...env, AI_MODE: "deployed" }));
}
