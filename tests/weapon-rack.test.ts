import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponRack } from '../src/weapon-rack.ts';
import { layout } from '../src/world/design-layout.ts';
import { createWorld } from '../src/world/index.ts';

test('four visible rack weapons select by their true raycast silhouette within reach', () => {
  const group = new THREE.Group();
  const spec = layout.furniture.find(furniture => furniture.id === layout.preparationFeatures.weaponStation.furniture)!;
  const rack = new WeaponRack(group, spec);
  assert.equal(rack.weapons.length, 4);
  for (const weapon of rack.weapons) {
    group.updateMatrixWorld(true);
    const center = weapon.mesh.getWorldPosition(new THREE.Vector3());
    const origin = center.clone().add(new THREE.Vector3(40, 0, 0));
    assert.equal(rack.pick(origin, center.clone().sub(origin).normalize(), 64), weapon.id);
    assert.equal(rack.pick(origin.clone().add(new THREE.Vector3(80, 0, 0)), new THREE.Vector3(-1, 0, 0), 64), null);
  }
  const first = rack.weapons[0], center = first.mesh.getWorldPosition(new THREE.Vector3());
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 100, 150), new THREE.MeshBasicMaterial());
  wall.position.copy(center).add(new THREE.Vector3(20, 0, 0)); group.add(wall);
  assert.equal(rack.pick(center.clone().add(new THREE.Vector3(40, 0, 0)), new THREE.Vector3(-1, 0, 0), 64), null, 'the nearest wall blocks selection');
  rack.dispose(); assert.equal(group.userData.weaponRack, undefined);
});

test('the actual house weapon cabinet exposes every gun without its shelves blocking selection', () => {
  const world = createWorld();
  const rack = world.group.userData.weaponRack as WeaponRack | undefined ?? new WeaponRack(world.group, layout.furniture.find(furniture => furniture.id === 'P02')!);
  try {
    for (const weapon of rack.weapons) {
      world.group.updateMatrixWorld(true);
      const center = weapon.mesh.getWorldPosition(new THREE.Vector3());
      const origin = center.clone().add(new THREE.Vector3(40, -3, 0));
      assert.equal(rack.pick(origin, center.clone().sub(origin).normalize()), weapon.id);
    }
  } finally { rack.dispose(); world.dispose(); }
});
