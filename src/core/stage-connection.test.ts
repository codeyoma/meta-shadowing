import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageConnectionPoints } from './stage-connection';

test('the dotted connection starts and ends at the supplied coin centers', () => {
  const points = stageConnectionPoints(400, 88, 200, 164);
  assert.deepEqual(points[0], { x: 88, y: 0 });
  assert.deepEqual(points.at(-1), { x: 200, y: 164 });
});

test('connections curve in both directions without leaving narrow or wide cards', () => {
  for (const width of [240, 400, 700]) {
    for (const [from, to] of [[0.22, 0.5], [0.5, 0.78], [0.78, 0.5], [0.5, 0.22]]) {
      const start = width * from!, end = width * to!;
      const points = stageConnectionPoints(width, start, end, 164);
      assert.ok(points.length > 8);
      assert.ok(points.every(p => p.x >= 4 && p.x <= width - 4 && p.y >= 0 && p.y <= 164));
      assert.ok(points.some(p => Math.abs(p.x - (start + (end - start) * p.y / 164)) > 20));
      for (let i = 1; i < points.length; i++) {
        assert.ok(points[i]!.y >= points[i - 1]!.y);
        assert.ok(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) <= 17);
      }
    }
  }
});

test('larger text rows retain a continuous connection to the next coin', () => {
  const points = stageConnectionPoints(400, 200, 312, 304);
  assert.deepEqual(points.at(-1), { x: 312, y: 304 });
  assert.ok(points.length > stageConnectionPoints(400, 200, 312, 164).length);
});

test('unmeasured or invalid geometry draws no dots', () => {
  assert.deepEqual(stageConnectionPoints(0, 0, 0, 164), []);
  assert.deepEqual(stageConnectionPoints(400, 88, 200, 0), []);
  assert.deepEqual(stageConnectionPoints(400, NaN, 200, 164), []);
});
