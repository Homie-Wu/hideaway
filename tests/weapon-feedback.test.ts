import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { Combat } from '../src/combat.ts';
import { Effects } from '../src/effects.ts';
import { PracticeRange } from '../src/practice-range.ts';
import { Recoil } from '../src/recoil.ts';
import { Session, DEFAULT_SETTINGS } from '../src/session.ts';
import { createDefaultModel } from '../src/voxel/model.ts';
import type { Actor } from '../src/runtime.ts';
import type { MapWorld } from '../src/contracts.ts';

registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: 'export default {};', shortCircuit: true } : next(url, context); } });
const { Game } = await import('../src/game.ts');

test('actual controls, simulation and camera share a smooth recoil offset that returns to the original aim', () => {
  const game: any = Object.create(Game.prototype), group = new THREE.Group(), scene = new THREE.Scene();
  scene.add(group);
  const range = new PracticeRange(group, [[912, 40, -56]]);
  const actor = {
    id: 0, role: 'hunter', alive: true, hp: 100, score: 0, position: new THREE.Vector3(850, .2, -56),
    velocity: new THREE.Vector3(), bounds: { min: [-9, 0, -7], max: [9, 48, 7] },
    weapon: 'shotgun', gun: 'shotgun', ammo: 6, reserve: 36, fireCooldown: 0, reloadTimer: 0, switchTimer: 0,
    shotTimer: 0, meleeTimer: 0, hurtTimer: 0, stun: 0, knockdown: 0, ramCooldown: 0, yaw: -Math.PI / 2,
    pitch: 0, aim: false, crouch: false, physical: { grounded: true }, visual: new THREE.Group(), model: createDefaultModel(),
  } as unknown as Actor;
  const session = new Session({ ...DEFAULT_SETTINGS, players: 2, hunters: 1, role: 'hunter' }); session.start('hunt');
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, .1, 2200), input = {
    locked: true, tap: () => false, key: () => false, buttons: new Set([0]), clicked: new Set([0]), wheel: 0, dx: 0, dy: 0,
  };
  const combat = new Combat({ group } as MapWorld, { play: () => {} } as any, new Effects(scene), () => {}, () => {}); combat.actors = [actor];
  Object.assign(game, {
    actors: [actor], map: { group }, settings: { ...DEFAULT_SETTINGS }, session, combat, recoil: new Recoil(), botRecoil: new Map(),
    input, editor: { active: false }, ui: { screen: 'game', toast: () => {} },
    physics: { canFit: () => true, step: () => {} }, rendering: { camera }, running: true,
    yaw: -Math.PI / 2, pitch: -.035, eyeHeight: 42, cameraStride: 0, firstPerson: true,
    moveActor: () => {},
  });
  try {
    const original = game.pitch;
    game.controls(1 / 60); game.updateCamera(1 / 60);
    assert.equal(actor.ammo, 5); assert.equal(range.targets[0].hits, 1);
    assert.equal(game.pitch, original); assert.equal(game.recoil.pitch, 0);
    assert.equal(camera.rotation.x, original, 'the firing frame cannot teleport the camera angle');
    input.buttons.clear(); input.clicked.clear();
    let peak = 0;
    for (let frame = 0; frame < 240; frame++) {
      game.simulate(1 / 120); game.updateCamera(1 / 120);
      peak = Math.max(peak, game.recoil.pitch);
      assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(game.aimDirection()) > .999999, 'the reticle and next shot use the same spring angle');
    }
    assert.ok(peak > .05 && peak < .11, `shotgun kick must be visible and bounded: ${peak}`);
    assert.equal(game.pitch, original, 'recoil is never accumulated into mouse input');
    assert.ok(Math.abs(camera.rotation.x - original) < 0.00001, 'the camera returns to the original aim');
    assert.equal(actor.score, 0); assert.equal(actor.hp, 100);
  } finally { range.dispose(); }
});
