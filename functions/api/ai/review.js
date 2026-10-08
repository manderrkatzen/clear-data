import reviewAi from "../../../src/review-ai.cjs";
export function onRequest(context) { return reviewAi.handleReview(context.request, { ...context.env, AI_MODE: "deployed" }); }
