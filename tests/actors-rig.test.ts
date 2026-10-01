import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHunterRig } from '../src/actors/rig.ts';
import type { HunterPose } from '../src/contracts.ts';

const idle: HunterPose = { speed: 0, sprint: false, grounded: true, crouch: false, aim: false, pitch: 0, turn: 0, weapon: 'pistol', shot: 0, reload: 0, melee: 0, hurt: 0, dead: 0, switchWeapon: 0 };

test('hunter has a 48-unit silhouette and gun remains parented to a hand', () => {
  const rig = createHunterRig();
  const bounds = new THREE.Box3().setFromObject(rig.group);
  assert.ok(bounds.max.y >= 47 && bounds.max.y <= 49, `height is ${bounds.max.y}`);
  assert.ok(bounds.min.y > -0.1 && bounds.min.y < 0.1, `feet are ${bounds.min.y}`);
  assert.equal(rig.group.getObjectByName('weapons')?.parent?.name, 'right-hand');
  rig.dispose();
});

test('first person suppresses the body and preserves weapon arms', () => {
  const rig = createHunterRig();
  rig.setFirstPerson(true);
  assert.equal(rig.group.getObjectByName('head')?.visible, false);
  assert.equal(rig.group.getObjectByName('torso-geometry')?.visible, false);
  assert.equal(rig.group.getObjectByName('right-arm')?.visible, true);
  rig.setFirstPerson(false);
  assert.equal(rig.group.getObjectByName('head')?.visible, true);
  rig.dispose();
});

test('all action poses remain finite and zero-delta does not advance death animation', () => {
  const rig = createHunterRig();
  for (const weapon of ['knife', 'pistol', 'smg', 'shotgun'] as const) {
    for (let i = 0; i < 100; i++) rig.update(1 / 60, { ...idle, weapon, speed: 110, sprint: true, grounded: i > 40, aim: i < 30, pitch: 0.5, turn: 0.5, shot: 0.4, reload: 0.5, melee: 0.8, hurt: 0.6 });
  }
  rig.group.traverse(object => {
    assert.ok(object.position.toArray().every(Number.isFinite));
    assert.ok(object.quaternion.toArray().every(Number.isFinite));
  });
  rig.update(1 / 60, { ...idle, dead: 1 });
  const before = rig.group.getObjectByName('pelvis')!.position.clone();
  rig.update(0, { ...idle, dead: 1 });
  assert.ok(before.equals(rig.group.getObjectByName('pelvis')!.position));
  rig.dispose();
});

test('prone death keeps the held weapon above the ground', () => {
  const rig = createHunterRig();
  for (let i = 0; i < 180; i++) rig.update(1 / 60, { ...idle, weapon: 'shotgun', dead: 1 });
  rig.group.updateMatrixWorld(true);
  const muzzle = rig.group.getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3());
  assert.ok(muzzle.y > 0, `muzzle went underground: ${muzzle.y}`);
  rig.dispose();
});

test('running feet stay planted during stance as the root moves forward', () => {
  const rig = createHunterRig();
  const ankle = rig.group.getObjectByName('left-ankle');
  assert.ok(ankle, 'the left foot exposes its articulated ankle');
  let last: THREE.Vector3 | null = null, plantedFrames = 0;
  for (let i = 0; i < 300; i++) {
    rig.group.position.z -= 110 / 120;
    rig.update(1 / 120, { ...idle, speed: 110, sprint: true });
    const position = ankle.getWorldPosition(new THREE.Vector3());
    if (i > 100 && last && Math.abs(position.y - 3) < 0.01 && Math.abs(last.y - 3) < 0.01) {
      assert.ok(Math.abs(position.z - last.z) < 0.08, 'the support foot visibly slides');
      plantedFrames++;
    }
    last = position;
  }
  assert.ok(plantedFrames > 40, 'run cycle includes real planted support phases');
  rig.dispose();
});

test('support feet follow actual sideways and backward travel', () => {
  for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
    const rig = createHunterRig();
    const ankle = rig.group.getObjectByName('left-ankle')!;
    let last: THREE.Vector3 | null = null, plantedFrames = 0;
    for (let i = 0; i < 220; i++) {
      rig.group.position.addScaledVector(direction, 70 / 120);
      rig.update(1 / 120, { ...idle, speed: 70 });
      const position = ankle.getWorldPosition(new THREE.Vector3());
      if (i > 100 && last && Math.abs(position.y - 3) < 0.01 && Math.abs(last.y - 3) < 0.01) {
        assert.ok(position.distanceTo(last) < 0.08, `support foot slides ${position.distanceTo(last)} while strafing or reversing`);
        plantedFrames++;
      }
      last = position;
    }
    assert.ok(plantedFrames > 25);
    rig.dispose();
  }
});

test('head tracking and gait transitions develop over frames rather than snapping', () => {
  const rig = createHunterRig(), neck = rig.group.getObjectByName('neck')!;
  rig.update(1 / 60, { ...idle, pitch: 1, turn: 0.5, speed: 70, sprint: true });
  assert.ok(neck.rotation.x > 0 && neck.rotation.x < 0.2, `neck snapped to ${neck.rotation.x}`);
  const first = neck.rotation.x;
  for (let i = 0; i < 30; i++) rig.update(1 / 60, { ...idle, pitch: 1, speed: 70, sprint: true });
  assert.ok(neck.rotation.x > first && neck.rotation.x > 0.48);
  const beforeStop = rig.group.getObjectByName('pelvis')!.position.y;
  rig.update(1 / 60, idle);
  assert.ok(Math.abs(rig.group.getObjectByName('pelvis')!.position.y - beforeStop) < 0.7);
  rig.dispose();
});

test('zero-time firing updates cannot teleport the held gun or advance its recoil', () => {
  const rig = createHunterRig();
  const hand = rig.group.getObjectByName('right-hand')!;
  rig.group.updateMatrixWorld(true);
  const initial = hand.getWorldQuaternion(new THREE.Quaternion());
  rig.update(0, { ...idle, weapon: 'shotgun', shot: 1 });
  const unchanged = hand.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(initial.angleTo(unchanged) < 1e-6);
  for (let i = 0; i < 6; i++) rig.update(1 / 120, { ...idle, weapon: 'shotgun', shot: 1 - i / 20 });
  assert.ok(initial.angleTo(hand.getWorldQuaternion(new THREE.Quaternion())) > 0.005);
  rig.dispose();
});
