// Shape checks for the studio config the browser loads from /api/config.
// A static-only deployment answers that route with index.html, so the client
// has to reject it instead of rendering with an empty object.

export const MISSING_API_MESSAGE = 'This deployment is missing its API: /api/config did not return studio settings. Deploy the Worker build (npm run build:sites) so /api/* is served, then reload.';

export function configProblem(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return MISSING_API_MESSAGE;
  if (!payload.llm || typeof payload.llm !== 'object') return MISSING_API_MESSAGE;
  if (!payload.narration || typeof payload.narration !== 'object') return MISSING_API_MESSAGE;
  return null;
}

export function isStudioConfig(payload) {
  return configProblem(payload) === null;
}
