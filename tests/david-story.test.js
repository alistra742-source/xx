import { test } from 'node:test';
import assert from 'node:assert/strict';
import { davidStory, isDavidTopic, DAVID_TOPIC } from '../shared/david-story.js';
import { normalizeProject } from '../shared/schema.js';
import { playbackOrder, pendingChoice } from '../shared/choices.js';

const sum = (scenes) => scenes.reduce((s, sc) => s + sc.duration, 0);

for (const duration of [120, 240]) {
  test(`David story fits ${duration}s and normalizes`, () => {
    const raw = davidStory(duration);
    const project = normalizeProject(raw, { topic: DAVID_TOPIC, duration });
    assert.equal(project.duration, duration);
    assert.ok(Math.abs(sum(project.scenes) - duration) < 0.5);
    assert.ok(project.scenes.length <= 48);
  });

  test(`David story ${duration}s pauses at the choice and plays the picked branch`, () => {
    const project = normalizeProject(davidStory(duration), { topic: DAVID_TOPIC, duration });
    const choiceIndex = project.scenes.findIndex((s) => s.choice);
    assert.ok(choiceIndex >= 0);
    assert.equal(pendingChoice(project.scenes), choiceIndex);
    for (let pick = 0; pick < 3; pick++) {
      const order = playbackOrder(project.scenes, { [choiceIndex]: pick });
      assert.equal(order[choiceIndex], choiceIndex);
      assert.ok(order.length > choiceIndex + 1);
      assert.ok(project.scenes[order[order.length - 1]].endsStory);
    }
  });
}

test('David topic is detected', () => {
  assert.equal(isDavidTopic(DAVID_TOPIC), true);
  assert.equal(isDavidTopic('a cat learns to surf'), false);
});
