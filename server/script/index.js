// Production stories are always model authored. Never substitute an unrelated
// canned plot when configuration, authentication or generation fails.
import { ScriptError } from './llm.js';

export function createScriptService({ llm }) {
  return async function generateScript(req) {
    if (!llm) throw new ScriptError('Configure a language model before creating a story.', 'LLM_NOT_CONFIGURED', 503, false);
    return llm.generateScript(req);
  };
}
