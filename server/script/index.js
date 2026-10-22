// Storyboards come from the configured model when there is one. Without one the
// studio's own writer turns the prompt into a complete project, so Make my story
// always produces a video-ready storyboard instead of a configuration error.
// A configured model that fails still surfaces its own error: the built-in
// writer never silently replaces a model's answer.
import { improvePromptLocally } from './llm.js';
import { normalizeProject } from '../../shared/schema.js';
import { writeInstantStory } from './instant.js';

/** Storyboard from the built-in writer — no model, no network, no account. */
export function instantProject(req) {
  return normalizeProject(writeInstantStory(req), req);
}

function planText(project) {
  const cast = project.characters.map((c) => `${c.name} (${c.role})`).join(', ');
  const header = `${project.title} — ${project.tone} story, ${project.duration}s, ${project.scenes.length} scenes.\nCast: ${cast}.`;
  const scenes = project.scenes.map((s, i) => `Scene ${i + 1} (${Math.round(s.duration * 10) / 10}s) — ${s.purpose}\nAction: ${s.action}\nCamera: ${s.camera}, ${s.cameraMotion}. ${s.shotDescription}\nContinuity: ${s.continuity}\nNarration: ${s.narration}`).join('\n\n');
  return `${header}\n\n${scenes}`;
}

const modelReady = (llm) => Boolean(llm && typeof llm.enabled === 'function' && llm.enabled());

export function createScriptService({ llm }) {
  return async function generateScript(req) {
    if (modelReady(llm)) return llm.generateScript(req);
    return { project: instantProject(req), source: 'instant' };
  };
}

/** Scene-by-scene production plan: model-authored, or from the built-in writer. */
export function instantEnhance(req) {
  const project = instantProject(req);
  return { enhancedPrompt: planText(project), scenes: project.scenes, project, source: 'instant' };
}

/** Prompt improvement: model-authored, or a cleaned-up version of the idea itself. */
export function instantImprove(topic) {
  return improvePromptLocally(topic);
}

export { modelReady };
