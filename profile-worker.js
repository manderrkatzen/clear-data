importScripts("cleaning-engine.js");
self.onmessage = event => {
  const { revision, headers, rows, policies, schema, classifications } = event.data;
  try { self.postMessage({ revision, result: CleaningEngine.profile(headers, rows, policies, schema, classifications) }); }
  catch (error) { self.postMessage({ revision, error: error.message }); }
};
