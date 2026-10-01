import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PracticeRange } from '../src/practice-range.ts';
import { createWorld } from '../src/world/index.ts';
import { layout } from '../src/world/design-layout.ts';

function fixture() {
  const group = new THREE.Group();
  const range = new PracticeRange(group, [[912, 40, -56], [912, 40, 8]]);
  return { group, range };
}

test('a real visible target can be raycast and a bullseye falls smoothly and automatically resets', () => {
  const { group, range } = fixture();
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(848, 40, -56), new THREE.Vector3(1, 0, 0));
  const hit = ray.intersectObject(group, true)[0];
  assert.equal(hit.object.userData.practiceTargetIndex, 0);
  const feedback = range.hitTarget(0, hit.point);
  assert.equal(feedback?.points, 10);
  assert.equal(feedback?.total, 10);
  assert.equal(range.targets[0].hinge.rotation.z, 0, 'impact must not teleport the target');
  range.update(1 / 60);
  assert.ok(range.targets[0].hinge.rotation.z < 0);
  for (let i = 0; i < 60; i++) range.update(1 / 60);
  assert.ok(range.targets[0].hinge.rotation.z < -1.3, 'plate has genuinely fallen flat');
  assert.equal(range.hitTarget(0, hit.point), null, 'a falling or downed plate cannot be farmed');
  for (let i = 0; i < 240; i++) range.update(1 / 60);
  assert.ok(Math.abs(range.targets[0].hinge.rotation.z) < 0.001);
  assert.equal(range.targets[0].available, true);
  assert.equal(range.hitTarget(0, hit.point)?.total, 20);
  range.reset(); assert.equal(range.total, 0); assert.equal(range.targets[0].hits, 0);
  range.dispose(); assert.equal(group.children.length, 0);
});

test('target score distinguishes center and outer ring, and empty/invalid targets cannot score', () => {
  const { range } = fixture();
  assert.equal(range.hitTarget(0, new THREE.Vector3(910, 47, -56))?.points, 5);
  assert.equal(range.hitTarget(1, new THREE.Vector3(910, 50, 17))?.points, 2);
  assert.equal(range.hitTarget(20, new THREE.Vector3()), null);
  for (const target of range.targets) target.mesh.geometry.getAttribute('position').array.forEach(value => assert.ok(Number.isFinite(value)));
  range.dispose();
});

test('house range plates are unobstructed, attached to solid support arms, and fall without clipping the backstop', () => {
  const world = createWorld(), range = world.group.userData.practiceRange as PracticeRange;
  try {
    assert.equal(range.targets.length, layout.preparationFeatures.firingRange.targets.length);
    for (const [index, center] of layout.preparationFeatures.firingRange.targets.entries()) {
      world.group.updateMatrixWorld(true);
      const origin = new THREE.Vector3(layout.preparationFeatures.firingRange.shootingLineX, center[1], center[2]);
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(1, 0, 0), 0.3, 200); ray.layers.enableAll();
      const hit = ray.intersectObject(world.group, true).find(h => h.object.visible)!;
      assert.equal(hit.object.userData.practiceTargetIndex, index, 'the nearest actual mesh is the steel board');
      const attachPoint = [center[0] + 1, center[1] - 13, center[2]];
      assert.ok(world.colliders.some(box => box.kind === 'furniture' && attachPoint.every((value, axis) => value >= box.center[axis] - box.size[axis] / 2 && value <= box.center[axis] + box.size[axis] / 2)), 'hinge connects to a real physical support arm');
      range.hitTarget(index, hit.point);
      for (let frame = 0; frame < 300; frame++) {
        range.update(1 / 60); world.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(range.targets[index].mesh);
        assert.ok(bounds.max.x < 936, `plate clips the range backstop at ${bounds.max.x}`);
      }
    }
  } finally { world.dispose(); }
});
