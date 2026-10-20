// Script service: tries the local LLM first (when configured) and always falls
// back to the deterministic template generator. Never throws for model failures.
import { normalizeProject } from '../../shared/schema.js';
import { templateProject } from './template.js';

export function createScriptService({ llm, log = console }) {
  return async function generateScript(req) {
    if (llm.enabled()) {
      try {
        return await llm.generateScript(req);
      } catch (err) {
        log.warn?.(`[script] ${err.message}. Using template generator.`);
        const project = normalizeProject(templateProject(req), req);
        return { project, source: 'template', warning: err.message };
      }
    }
    const project = normalizeProject(templateProject(req), req);
    return { project, source: 'template', warning: null };
  };
}
