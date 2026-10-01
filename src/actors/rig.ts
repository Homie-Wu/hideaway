import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HunterPose, HunterRig, WeaponId } from '../contracts.ts';
import { hunterAsset } from './assets.ts';
import { Recoil } from '../recoil.ts';

type Brick = [number, number, number, number, number, number, number];
const down = new THREE.Vector3(0, -1, 0);
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

/** Every articulated part is one merged vertex-colored mesh, not one draw per voxel. */
export function createHunterRig(color = 0x377b78): HunterRig {
  const group = new THREE.Group(); group.name = 'hunter';
  const geometryCache: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 });
  const coat = color, coatDark = new THREE.Color(color).multiplyScalar(0.69).getHex();
  const coatLight = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15).getHex();
  const skin = 0xe4b18b, skinLight = 0xf1c39a, hair = 0x3b2c2a, navy = 0x343c4c;
  const ochre = 0xe4a95f, cream = 0xf5e4bf, leather = 0x71513f, sole = 0x344347;

  function joint(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const result = new THREE.Group(); result.name = name; result.position.set(x, y, z); parent.add(result); return result;
  }
  function bricks(name: string, parent: THREE.Object3D, boxes: Brick[]): THREE.Object3D {
    const asset = hunterAsset(name);
    if (asset) { parent.add(asset); group.userData.assetSource = 'blender-glb'; return asset; }
    const geometries = boxes.map(([x, y, z, w, h, d, hex]) => {
      const geometry = new THREE.BoxGeometry(w, h, d); geometry.translate(x, y, z);
      const shade = new THREE.Color(hex);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = shade.r; colors[i + 1] = shade.g; colors[i + 2] = shade.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
    });
    const merged = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose()); geometryCache.push(merged);
    const mesh = new THREE.Mesh(merged, material); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  const pelvis = joint('pelvis', group, 0, 20, 0);
  const hipMesh = bricks('hips-geometry', pelvis, [[0, 0.2, 0, 10.8, 5, 6.6, navy], [0, 2.4, 0, 11.4, 1.2, 7, leather], [0, 2.4, -3.7, 2.5, 1.5, 0.6, ochre]]);
  const torso = joint('chest', pelvis);
  const torsoMesh = bricks('torso-geometry', torso, [
    [0, 9, 0, 12.6, 13.2, 7.4, coat], [0, 3.5, 0, 13.4, 2.4, 8.2, coatDark],
    [-4.7, 8.5, -3.9, 2.1, 10.5, 0.6, coatLight], [4.7, 8.5, -3.9, 2.1, 10.5, 0.6, coatDark],
    [0, 9.2, -3.9, 0.7, 11.5, 0.7, ochre], [0, 13.7, -4.2, 2.1, 1.9, 0.5, cream],
    [-3.5, 7.1, -4.35, 3.8, 3.3, 1.1, coatDark], [3.5, 7.1, -4.35, 3.8, 3.3, 1.1, coatDark],
    [-3.5, 8.7, -4.9, 3.8, 0.7, 0.6, ochre], [3.5, 8.7, -4.9, 3.8, 0.7, 0.6, ochre],
    [-3.5, 7.8, -5, 0.6, 0.6, 0.4, cream], [3.5, 7.8, -5, 0.6, 0.6, 0.4, cream],
    [0, 15.6, 0, 6, 2.2, 6, ochre], [-1.3, 13.8, -4.5, 2.4, 3.9, 0.9, ochre],
    [0, 10, 4.8, 8.5, 10.8, 3.1, leather], [0, 11.4, 6.5, 7.2, 5.8, 0.5, ochre],
    [-3.5, 10, 6.7, 0.8, 9.6, 0.6, coatDark], [3.5, 10, 6.7, 0.8, 9.6, 0.6, coatDark],
    [-3.8, 11.1, -4.1, 1, 8, 0.6, leather], [3.8, 11.1, -4.1, 1, 8, 0.6, leather],
  ]);
  const neck = joint('neck', torso, 0, 17, 0);
  const neckMesh = bricks('neck-geometry', neck, [[0, 0.2, 0, 4.4, 2.4, 4.2, skin]]);
  const head = joint('head', neck, 0, 4, 0);
  bricks('head-geometry', head, [
    [0, 0.3, 0, 9.8, 8.8, 8.4, skin], [0, -3.6, -0.2, 8, 1.3, 7.4, skinLight],
    [-5.2, 0, 0, 1.2, 3.2, 2.5, skinLight], [5.2, 0, 0, 1.2, 3.2, 2.5, skin],
    [0, 0, -4.65, 1.8, 2.3, 1.3, skinLight],
    [-2.4, 1.05, -4.3, 2.2, 1.7, 0.4, cream], [2.4, 1.05, -4.3, 2.2, 1.7, 0.4, cream],
    [-2.1, 0.95, -4.58, 1.15, 1.35, 0.35, 0x29313a], [2.7, 0.95, -4.58, 1.15, 1.35, 0.35, 0x29313a],
    [-2.5, 2.45, -4.5, 2.6, 0.7, 0.5, hair], [2.5, 2.45, -4.5, 2.6, 0.7, 0.5, hair],
    [0, -2.2, -4.42, 2.8, 0.55, 0.35, 0x925b4a], [0, -3, -4.2, 3.4, 0.4, 0.3, skinLight],
    [0, 4.5, 0.4, 10.3, 1.5, 9.2, hair], [0, 1.4, 4.2, 10.2, 6.7, 1.1, hair],
    [-4.9, 2, 1, 1, 4.5, 7, hair], [4.9, 2, 1, 1, 4.5, 7, hair],
    [-3.7, 3.4, -4.2, 2.4, 2, 0.8, hair],
    [0, 5.6, 0, 11.4, 2.1, 10.1, coatDark], [0, 6.6, 0, 8.8, 0.8, 8.2, coat],
    [0, 4.65, -5.9, 10.6, 0.7, 4.4, coatDark], [0, 5.6, -5.18, 2.7, 1.4, 0.4, ochre],
    [0, 5.6, -5.46, 0.8, 0.8, 0.3, cream],
  ]);

  function makeLeg(side: number) {
    const hip = joint(side < 0 ? 'left-hip' : 'right-hip', pelvis, side * 3.3, -0.5, 0);
    bricks('thigh', hip, [[0, -4.6, 0, 4.3, 8.8, 5.6, navy], [side * 2.2, -4.5, 0.2, 0.65, 3.3, 3.8, 0x465668]]);
    const knee = joint(side < 0 ? 'left-knee' : 'right-knee', hip, 0, -9, 0);
    bricks('shin', knee, [[0, -3.3, 0, 3.9, 6.6, 4.5, navy], [0, -0.5, -2.35, 3.7, 2.8, 0.6, coatDark]]);
    const foot = joint(side < 0 ? 'left-ankle' : 'right-ankle', knee, 0, -7.5, 0);
    bricks('boot', foot, [[0, -0.4, -0.9, 4.7, 4.8, 7.1, leather], [0, -2.5, -1.2, 5.1, 1, 7.9, sole], [0, -0.8, -4.3, 4.7, 1.9, 0.7, ochre], [0, 1.6, 0, 4.2, 0.6, 4.9, ochre], [0, -0.1, -3.15, 3.2, 0.55, 0.75, cream]]);
    return { hip, knee, foot };
  }
  const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);
  function makeArm(side: number) {
    const upper = joint(side < 0 ? 'left-arm' : 'right-arm', torso, side * 7.4, 14, 0);
    bricks('sleeve', upper, [[0, -3.9, 0, 4.3, 7.8, 5.3, coat], [side * 2.3, -1.8, 0, 0.65, 3, 3.2, ochre], [side * 2.7, -1.8, 0, 0.2, 1.5, 1.7, cream]]);
    const lower = joint('elbow', upper, 0, -8.5, 0);
    bricks('forearm', lower, [[0, -2.7, 0, 3.8, 5.4, 4.5, coat], [0, -5.2, 0, 4.1, 1.5, 4.8, coatLight], [0, -6.7, 0, 3.3, 2.6, 3.6, skin]]);
    const hand = joint(side < 0 ? 'left-hand' : 'right-hand', lower, 0, -8.5, 0);
    bricks('glove', hand, [[0, -0.6, 0, 3.25, 2.5, 3, leather], [side * -1.75, -0.1, -0.65, 0.9, 1.7, 1.35, skinLight], [-0.95, -1.9, -0.25, 0.7, 0.9, 2.5, skin], [0, -1.9, -0.25, 0.7, 0.9, 2.5, skinLight], [0.95, -1.9, -0.25, 0.7, 0.9, 2.5, skin]]);
    return { upper, lower, hand, side };
  }
  const leftArm = makeArm(-1), rightArm = makeArm(1);
  const weapons = joint('weapons', rightArm.hand);
  const gunGroups: Record<WeaponId, THREE.Group> = { knife: joint('knife', weapons), pistol: joint('pistol', weapons), smg: joint('smg', weapons), shotgun: joint('shotgun', weapons) };
  const steel = 0x3c505b, steelLight = 0x8ba9ab, darkMetal = 0x243840;
  bricks('pistol-geometry', gunGroups.pistol, [[0, 0, 0, 2, 4.3, 2.3, leather], [0, 2.3, -3, 2.7, 2.9, 8, steel], [0, 3.2, -3, 2.8, 1.1, 8.2, steelLight], [0, 1.7, -7.2, 1.7, 1.7, 1.3, darkMetal], [0, 3.9, -5.8, 0.45, 0.5, 0.6, ochre], [0, 3.9, 0.2, 1.7, 0.5, 0.5, darkMetal], [0, 0.2, -2.3, 0.45, 1.8, 1.8, darkMetal], [0, -0.8, -2.5, 1.4, 0.5, 2.2, darkMetal], [1.45, 2.2, -2, 0.2, 0.7, 2.1, ochre]]);
  bricks('smg-geometry', gunGroups.smg, [[0, -0.2, 0, 2, 4.5, 2.4, leather], [0, 2, -3.1, 3.1, 3.7, 11.2, steel], [0, 2.4, -10, 1.7, 1.7, 4, darkMetal], [0, 2.4, -12.2, 2.2, 2.2, 1.2, steelLight], [0, 0.1, -5.2, 2, 5.8, 2.9, darkMetal], [0, -2.9, -5.2, 2.3, 0.8, 3.4, ochre], [0, 2.3, 4.3, 2.6, 2.5, 4.4, coatDark], [0, 1.5, 6.4, 2.7, 4.2, 1.3, leather], [0, 4.2, -2.3, 2.1, 0.6, 7, steelLight], [0, 5, -1.4, 2.2, 1.3, 2.8, darkMetal], [0, 5, -2.88, 1.3, 0.7, 0.2, 0x74cfbf], [1.65, 2.7, -4.2, 0.3, 0.9, 2.5, ochre]]);
  bricks('shotgun-geometry', gunGroups.shotgun, [[0, -0.1, 0.4, 2.3, 4.4, 2.7, leather], [0, 1.7, -2.1, 3.4, 3.8, 7.8, steel], [0, 2.7, -10, 2.1, 2.1, 12, darkMetal], [0, 0.8, -9.5, 1.8, 1.5, 10, steelLight], [0, 0.3, -6.7, 3.2, 3, 5, ochre], [0, 1.7, 4.9, 2.7, 2.5, 6.2, leather], [0, 0.5, 7.6, 3, 4.5, 1.4, coatDark], [0, 4, -14.4, 0.5, 0.6, 0.7, ochre], [1.82, 2.3, -0.9, 0.3, 1.2, 3.6, steelLight], [0, 2.7, -16.4, 2.6, 2.6, 0.8, steelLight], [0, 2.7, -16.85, 1.7, 1.7, 0.2, darkMetal]]);
  bricks('knife-geometry', gunGroups.knife, [[0, 0.3, 0, 1.9, 4.3, 1.9, leather], [0, 2.7, 0, 3.3, 0.8, 2.2, ochre], [0, 2.8, -4.1, 1, 2.4, 7, steelLight], [0, 3.2, -8.2, 0.8, 1.6, 1.2, cream], [0, 3.4, -9.1, 0.6, 1.1, 0.9, cream], [0.58, 2.3, -3.8, 0.15, 0.7, 6.4, darkMetal]]);
  const muzzle = joint('muzzle', weapons);
  for (const [weapon, z] of Object.entries({knife:0,pistol:-2,smg:-5.2,shotgun:-2.1})) {
    joint('grip-mount', gunGroups[weapon as WeaponId]);
    joint('magazine-mount', gunGroups[weapon as WeaponId], 0, -2, z);
  }
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd783, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flashGeometry = new THREE.OctahedronGeometry(1, 0); geometryCache.push(flashGeometry);
  const flash = new THREE.Mesh(flashGeometry, flashMaterial); flash.name = 'muzzle-flash'; flash.scale.set(1.8, 1.8, 4.5); flash.position.z = -2; muzzle.add(flash); flash.visible = false;
  const muzzlePositions: Record<WeaponId, [number, number, number]> = { knife: [0, 3, -10], pistol: [0, 2.3, -8], smg: [0, 2.4, -13], shotgun: [0, 2.7, -17] };

  let firstPerson = false, elapsed = 0, phase = 0, movement = 0, crouch = 0, aim = 0, dead = 0, landing = 0, air = 0, previousGround = true;
  let running = 0, lookPitch = 0, turning = 0, previousShot = 0;
  const gunRecoil = new Recoil();
  const targetRight = new THREE.Vector3(), targetLeft = new THREE.Vector3(), pitchRotation = new THREE.Quaternion(), targetOrientation = new THREE.Quaternion();
  const eye = new THREE.Vector3(0, 22, 0);
  const segment = new THREE.Vector3(), elbow = new THREE.Vector3(), direction = new THREE.Vector3(), pole = new THREE.Vector3();
  const parentRotation = new THREE.Quaternion(), endRotation = new THREE.Quaternion();
  const previousWorldPosition = new THREE.Vector3(), currentWorldPosition = new THREE.Vector3();
  const travel = new THREE.Vector3(0, 0, -1), travelDelta = new THREE.Vector3(), rootRotation = new THREE.Quaternion();
  const legTarget = new THREE.Vector3();
  let hasWorldPosition = false;

  function solveArm(arm: ReturnType<typeof makeArm>, target: THREE.Vector3, orientation: THREE.Quaternion, reach: number) {
    direction.copy(target).sub(arm.upper.position);
    const distance = clamp(direction.length(), 0.1, 16.95); direction.normalize();
    pole.set(arm.side * 0.85, -0.9, 0.3).addScaledVector(direction, -pole.dot(direction)).normalize();
    elbow.copy(arm.upper.position).addScaledVector(direction, distance / 2).addScaledVector(pole, Math.sqrt(8.5 ** 2 - (distance / 2) ** 2));
    segment.copy(elbow).sub(arm.upper.position).normalize();
    parentRotation.setFromUnitVectors(down, segment);
    arm.upper.quaternion.slerp(parentRotation, reach);
    segment.copy(target).sub(elbow).normalize();
    endRotation.setFromUnitVectors(down, segment);
    parentRotation.copy(arm.upper.quaternion).invert().multiply(endRotation);
    arm.lower.quaternion.slerp(parentRotation, reach);
    parentRotation.copy(arm.upper.quaternion).multiply(arm.lower.quaternion).invert().multiply(orientation);
    arm.hand.quaternion.slerp(parentRotation, reach);
  }

  const initial: HunterPose = { speed: 0, sprint: false, grounded: true, crouch: false, aim: false, pitch: 0, turn: 0, weapon: 'pistol', shot: 0, reload: 0, melee: 0, hurt: 0, dead: 0, switchWeapon: 0 };
  function update(dt: number, pose: HunterPose) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const blend = 1 - Math.exp(-dt * 13), slowBlend = 1 - Math.exp(-dt * 7);
    running = mix(running, pose.sprint ? 1 : 0, slowBlend);
    lookPitch = mix(lookPitch, clamp(pose.pitch, -1.35, 1.35), blend);
    turning = mix(turning, dt ? clamp(pose.turn / dt, -2, 2) : turning, slowBlend);
    if (pose.shot > previousShot + 0.05) gunRecoil.add(pose.weapon, pose.aim);
    previousShot = pose.shot; gunRecoil.update(dt);
    const stride = mix(30, 38, running);
    group.getWorldPosition(currentWorldPosition);
    if (hasWorldPosition && dt > 0 && pose.speed > 1) {
      travelDelta.copy(currentWorldPosition).sub(previousWorldPosition); travelDelta.y = 0;
      const distance = travelDelta.length();
      if (distance > 0.001 && distance < Math.max(5, pose.speed * dt * 3)) {
        group.getWorldQuaternion(rootRotation).invert(); travel.copy(travelDelta).applyQuaternion(rootRotation).normalize();
      }
    }
    previousWorldPosition.copy(currentWorldPosition); hasWorldPosition = true;
    elapsed += dt; phase += Math.max(0, pose.speed) * dt / stride * Math.PI * 2;
    movement = mix(movement, clamp(pose.speed / (pose.sprint ? 110 : 70), 0, 1), blend);
    crouch = mix(crouch, pose.crouch ? 1 : 0, blend); aim = mix(aim, pose.aim ? 1 : 0, blend); dead = mix(dead, pose.dead ? 1 : clamp(pose.knockdown ?? 0, 0, 1), slowBlend);
    if (!pose.grounded) air += dt;
    if (pose.grounded && !previousGround) { landing = Math.min(1, air * 2); air = 0; }
    previousGround = pose.grounded; landing *= Math.exp(-dt * 10);
    const breathe = Math.sin(elapsed * 2.2), step = Math.sin(phase), gait = movement * (pose.grounded ? 1 : 0), run = running;
    const alive = 1 - dead, recoil = gunRecoil.pitch, hurt = clamp(pose.hurt, 0, 1);
    const reload = Math.sin(clamp(pose.reload, 0, 1) * Math.PI), switching = Math.sin(clamp(pose.switchWeapon, 0, 1) * Math.PI);
    const slash = Math.sin(clamp(pose.melee, 0, 1) * Math.PI);
    pelvis.position.y = mix(20 - crouch * 7 - landing * 2 - gait * mix(3, 3.7, run) + Math.abs(Math.cos(phase)) * gait * 0.35, 4.5, dead);
    pelvis.position.z = dead * 2;
    pelvis.rotation.set(-dead * 1.38, 0, dead * 0.18);
    torso.rotation.set((gait * 0.06 * run + crouch * 0.12 - hurt * 0.12) * alive, (-turning * 0.045 + step * gait * 0.028 * (1 - aim * .75)) * alive, (-step * gait * 0.025 - travel.x * gait * .035 + hurt * 0.1) * alive);
    torso.position.y = breathe * 0.12 * alive;
    neck.rotation.x = clamp(lookPitch, -1.2, 1.2) * 0.52 * alive; neck.rotation.y = turning * 0.07 - step * gait * 0.012;
    const swing = mix(0.53, 0.73, run) * gait * alive;
    for (const [leg, offset] of [[leftLeg, 0], [rightLeg, Math.PI]] as const) {
      const cycle = Math.sin(phase + offset);
      leg.hip.rotation.x = cycle * swing - crouch * 0.52 + (pose.grounded ? 0 : -0.23) - dead * 0.15;
      leg.hip.rotation.z = dead * (offset ? -0.23 : 0.14);
      leg.knee.rotation.x = Math.max(0, -cycle) * swing * 1.2 + crouch * 1.03 + (pose.grounded ? 0 : 0.48) + dead * 0.2;
      leg.foot.rotation.x = -crouch * 0.47 - Math.max(0, cycle) * swing * 0.2;
      if (pose.grounded && dead < 0.02) {
        // A stance foot moves backward relative to the body at exactly the root's
        // forward speed. Analytic knee IK holds its sole on the floor throughout.
        const progress = ((phase + offset) % (Math.PI * 2)) / (Math.PI * 2);
        const swingProgress = clamp((progress - 0.5) * 2, 0, 1);
        const smoothSwing = swingProgress * swingProgress * (3 - 2 * swingProgress);
        const targetTravel = (progress < 0.5 ? -stride / 4 + progress * stride : stride / 4 - smoothSwing * stride / 2) * gait;
        const targetY = 3 + Math.sin(swingProgress * Math.PI) * gait * mix(3.2, 5.7, run) - pelvis.position.y + 0.5;
        legTarget.set(-travel.x * targetTravel, targetY, -travel.z * targetTravel);
        const distance = Math.min(16.4999, legTarget.length());
        direction.copy(legTarget).normalize();
        const along = (9 ** 2 - 7.5 ** 2 + distance ** 2) / (2 * distance);
        const bend = Math.sqrt(Math.max(0, 9 ** 2 - along ** 2));
        pole.set(0, 0, -1).addScaledVector(direction, -pole.dot(direction)).normalize();
        elbow.copy(direction).multiplyScalar(along).addScaledVector(pole, bend);
        segment.copy(elbow).normalize(); leg.hip.quaternion.setFromUnitVectors(down, segment);
        segment.copy(direction).multiplyScalar(distance).sub(elbow).normalize();
        endRotation.setFromUnitVectors(down, segment);
        leg.knee.quaternion.copy(leg.hip.quaternion).invert().multiply(endRotation);
        leg.foot.quaternion.copy(endRotation).invert();
      }
    }
    const bodyAim = firstPerson ? 15.2 : 10;
    const sway = step * gait * (firstPerson ? 0.3 : 0.5) * (1 - aim * 0.8);
    const holdDepth = firstPerson ? -12.3 : -8.2;
    targetRight.set(mix(3.8, firstPerson ? 0.2 : 2.1, aim) + sway, bodyAim + aim * 1.2 + breathe * 0.09 - reload * 4 - switching * 7, holdDepth - aim * (firstPerson ? 1 : 3) + recoil * 18);
    targetLeft.set(mix(firstPerson ? 1.8 : 3.1, -0.1, aim) + sway, bodyAim + aim * 1.2 + 0.3 - reload * 9 - switching * 7, pose.weapon === 'pistol' ? holdDepth - .3 : holdDepth - 3.9);
    if (!pose.aim) { targetRight.y -= movement * run * 2.5; targetLeft.y -= movement * run * 2.5; targetRight.z += movement * run * 2; targetLeft.z += movement * run * 2; }
    if (pose.weapon === 'knife') { targetRight.x += 1 - slash * 8; targetRight.z -= slash * 9; targetRight.y += slash * 3; targetLeft.set(-5.9 + sway, bodyAim - 4.5 + slash * 2, -4.1); }
    if (reload > 0) { targetLeft.x -= reload * 2; targetLeft.z += reload * 7; }
    pitchRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), lookPitch);
    targetRight.sub(eye).applyQuaternion(pitchRotation).add(eye); targetLeft.sub(eye).applyQuaternion(pitchRotation).add(eye);
    targetOrientation.setFromEuler(new THREE.Euler((lookPitch + recoil * 1.6 + switching * 0.75 + (pose.weapon === 'knife' ? slash * 0.2 : 0)) * alive + dead * 1.38, (gunRecoil.yaw - reload * 0.2 - slash * 0.45) * alive, -reload * 0.45 * alive - dead * 0.18));
    targetRight.lerp(new THREE.Vector3(7, 5, -1), dead); targetLeft.lerp(new THREE.Vector3(-7, 6, -1), dead);
    solveArm(rightArm, targetRight, targetOrientation, dt ? 1 - Math.exp(-dt * 30) : 0);
    solveArm(leftArm, targetLeft, targetOrientation, dt ? 1 - Math.exp(-dt * 30) : 0);
    for (const weapon of Object.keys(gunGroups) as WeaponId[]) gunGroups[weapon].visible = weapon === pose.weapon;
    muzzle.position.fromArray(muzzlePositions[pose.weapon]);
    flash.visible = pose.weapon !== 'knife' && pose.shot > 0.75 && !pose.dead;
    flash.scale.set(1.5 + recoil * 10, 1.5 + recoil * 10, pose.weapon === 'shotgun' ? 6 : 3.7); flash.rotation.z = elapsed * 35;
  }
  // Initialize real hand targets immediately, without advancing the public clock.
  update(0.1, initial); elapsed = 0;
  pelvis.position.y = 20;
  function setFirstPerson(enabled: boolean) {
    firstPerson = enabled;
    for (const object of [head, neckMesh, hipMesh, torsoMesh, leftLeg.hip, rightLeg.hip]) object.visible = !enabled;
    group.userData.firstPerson = enabled;
  }
  return { group, update, setFirstPerson, dispose: () => { geometryCache.forEach(geometry => geometry.dispose()); material.dispose(); flashMaterial.dispose(); group.removeFromParent(); } };
}
