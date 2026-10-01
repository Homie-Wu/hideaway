import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {Combat} from '../src/combat.ts';import {createDefaultModel} from '../src/voxel/model.ts';import {createModelView} from '../src/voxel/meshing.ts';import {Effects} from '../src/effects.ts';import {WEAPONS} from '../src/actors/index.ts';import type {SoundSystem} from '../src/actors/index.ts';import type {Actor} from '../src/runtime.ts';import type {MapWorld,WeaponId} from '../src/contracts.ts';
import {PracticeRange} from '../src/practice-range.ts';
function fixture(weapon:WeaponId='pistol'){const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);const model=createDefaultModel();const shooter={id:0,role:'hunter',hp:100,alive:true,position:new THREE.Vector3(0,0,0),weapon,gun:weapon==='knife'?'pistol':weapon,ammo:99,reserve:99,score:0,fireCooldown:0,reloadTimer:0,switchTimer:0,stun:0,aim:true,visual:new THREE.Group(),model,velocity:new THREE.Vector3()} as unknown as Actor;const sound={play:()=>{}} as unknown as SoundSystem;const combat=new Combat({group} as MapWorld,sound,new Effects(scene),()=>{},()=>{});combat.actors=[shooter];return{scene,group,shooter,combat}}
test('real raycasts distinguish air from world and charge a shotgun mistake once per trigger',()=>{const{group,shooter,combat}=fixture('shotgun');assert.equal(combat.shoot(shooter,new THREE.Vector3(0,0,-1),'hunt'),true);assert.equal(shooter.hp,100);group.add(new THREE.Mesh(new THREE.BoxGeometry(400,400,5),new THREE.MeshBasicMaterial()));group.children[0].position.set(0,40,-90);shooter.fireCooldown=0;combat.shoot(shooter,new THREE.Vector3(0,0,-1),'hunt');assert.equal(shooter.hp,100-WEAPONS.shotgun.penalty)});
test('visible hider receives damage while scenery behind it does not penalize shooter',()=>{const{group,shooter,combat}=fixture();const target={...shooter,id:1,role:'hider',position:new THREE.Vector3(0,36,-50),visual:createModelView(createDefaultModel())} as Actor;target.visual.position.copy(target.position);combat.actors.push(target);const wall=new THREE.Mesh(new THREE.BoxGeometry(100,100,5),new THREE.MeshBasicMaterial());wall.position.set(0,40,-80);group.add(wall);combat.shoot(shooter,new THREE.Vector3(0,0,-1),'hunt');assert.ok(target.hp<100);assert.equal(shooter.hp,100);assert.ok(shooter.score>0)});

test('sample-room light layers preserve target hits and scenery penalties',()=>{
 const {group,shooter,combat}=fixture();
 const target={...shooter,id:1,role:'hider',position:new THREE.Vector3(0,36,-50),visual:createModelView(createDefaultModel())} as Actor;
 target.visual.position.copy(target.position);target.visual.traverse(o=>o.layers.set(1));combat.actors.push(target);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(100,100,5),new THREE.MeshBasicMaterial());wall.position.set(0,40,-80);wall.layers.set(1);group.add(wall);
 combat.shoot(shooter,new THREE.Vector3(0,0,-1),'hunt');assert.ok(target.hp<100,'lit-room hider must receive damage');assert.equal(shooter.hp,100);
 combat.actors=[shooter];shooter.fireCooldown=0;combat.shoot(shooter,new THREE.Vector3(0,0,-1),'hunt');assert.equal(shooter.hp,100-WEAPONS.pistol.penalty,'lit-room wall must count as scenery');
});
test('preparation rejects attacks and dead players cannot reload; reload transfers available reserve only',()=>{const{shooter,combat}=fixture();assert.equal(combat.shoot(shooter,new THREE.Vector3(0,0,-1),'preparation'),false);shooter.ammo=2;shooter.reserve=3;combat.reload(shooter);assert.ok(shooter.reloadTimer>0);combat.update(shooter,2);assert.equal(shooter.ammo,5);assert.equal(shooter.reserve,0);shooter.alive=false;shooter.reserve=4;combat.reload(shooter);assert.equal(shooter.reloadTimer,0)});
test('sprinting hider impact stuns and pushes hunter, grants points, and has cooldown',()=>{const{shooter,combat}=fixture();const hider={...shooter,role:'hider',position:new THREE.Vector3(0,0,10),velocity:new THREE.Vector3(0,0,-80),sprint:true,ramCooldown:0,score:0} as Actor;assert.equal(combat.ram(hider,shooter),true);assert.ok(shooter.velocity.length()>70);assert.ok(shooter.stun>0);assert.equal(hider.score,25);assert.equal(combat.ram(hider,shooter),false)});

test('preparation cooldowns and ammo still apply while any-direction shots cannot hurt other people',()=>{
 const {shooter,combat,group}=fixture();shooter.position.set(784,0,48);shooter.ammo=2;
 const victim={...shooter,id:1,role:'hider',hp:100,score:9,position:new THREE.Vector3(784,40,16),visual:new THREE.Group()} as Actor;
 victim.visual.add(new THREE.Mesh(new THREE.BoxGeometry(20,30,20),new THREE.MeshBasicMaterial()));victim.visual.position.copy(victim.position);combat.actors.push(victim);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(100,100,4),new THREE.MeshBasicMaterial());wall.position.set(784,40,-20);group.add(wall);
 assert.equal(combat.shoot(shooter,new THREE.Vector3(0,0,-1),'preparation'),true);assert.equal(shooter.ammo,1);
 assert.equal(combat.shoot(shooter,new THREE.Vector3(0,0,-1),'preparation'),false);assert.equal(shooter.ammo,1);
 assert.equal(victim.hp,100);assert.equal(victim.score,9);assert.equal(shooter.hp,100);assert.equal(shooter.score,0);
});

test('real shotgun pellets knock down a tagged steel target once and keep training points out of the match score',()=>{
 const {shooter,combat,group}=fixture('shotgun');shooter.position.set(848,0,-56);
 const range=new PracticeRange(group,[[912,40,-56]]),feedback:{points:number|undefined,total:number|undefined}[]=[];
 combat.onPracticeHit=(_actor,_index,points,total)=>feedback.push({points,total});
 assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);
 assert.equal(range.targets[0].hits,1);assert.equal(feedback.length,1);assert.ok(range.total>=5);
 assert.equal(feedback[0].total,range.total);assert.equal(shooter.score,0);assert.equal(shooter.hp,100);
 assert.equal(combat.effects.particles.length,14);assert.ok(combat.effects.particles.every(p=>p.velocity.x<0),'hot fragments bounce toward the shooter off the plate');
 assert.equal(range.targets[0].hinge.rotation.z,0);range.update(1/60);assert.ok(range.targets[0].hinge.rotation.z<0);
 shooter.fireCooldown=0;assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);
 assert.equal(feedback.length,1);assert.equal(range.targets[0].hits,1);
 assert.equal(combat.effects.particles.length,28,'a second steel impact still gives sparks while the fallen target cannot award more points');
 range.dispose();
});
