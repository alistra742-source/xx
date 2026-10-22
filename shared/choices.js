// Resolves the order of scenes a viewer plays. A scene with a choice ends and the
// viewer picks an option; the chosen option's goto scene is played next. Scenes
// without a choice continue to the following scene in the authored order.

/** Scene indexes played in order, given the viewer's picks (scene index -> option index). */
export function playbackOrder(scenes, picks = {}, limit = scenes.length * 2) {
  const order = [];
  let i = 0;
  while (i >= 0 && i < scenes.length && order.length < limit) {
    order.push(i);
    const choice = scenes[i].choice;
    if (choice && choice.options?.length >= 2) {
      const picked = picks[i];
      if (picked === undefined) break; // waiting for the viewer
      const option = choice.options[picked] ?? choice.options[0];
      i = option.goto;
    } else {
      i += 1;
    }
  }
  return order;
}

/** Index of the scene that presents a pending choice, or -1 if none is pending. */
export function pendingChoice(scenes, picks = {}) {
  const order = playbackOrder(scenes, picks);
  const last = order[order.length - 1];
  return last !== undefined && scenes[last].choice && picks[last] === undefined ? last : -1;
}
