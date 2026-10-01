import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../src/combat.ts';
import { WEAPONS } from '../src/actors/index.ts';
import { needsPreparationReturn, PREPARATION_ROOM } from '../src/rules.ts';
import { createDefaultModel, createPresetModel } from '../src/voxel/model.ts';
import { layout } from '../src/world/design-layout.ts';
import type { Actor } from '../src/runtime.ts';
import type { MapWorld, WeaponId } from '../src/contracts.ts';

function practiceFixture(){
  const group=new THREE.Group();group.userData.preparationFeatures=layout.preparationFeatures;
  const target=new THREE.Mesh(new THREE.BoxGeometry(4,16,16),new THREE.MeshBasicMaterial());target.position.set(912,40,-56);target.userData.practiceTarget=0;group.add(target);
  const shooter={id:0,role:'hunter',hp:100,alive:true,position:new THREE.Vector3(848,0,-56),weapon:'pistol',gun:'pistol',ammo:12,reserve:72,score:0,fireCooldown:0,reloadTimer:0,switchTimer:0,stun:0,aim:true,visual:new THREE.Group(),model:createDefaultModel(),velocity:new THREE.Vector3()} as Actor;
  const events:string[]=[],sound={play:(name:string)=>events.push(name)},effects={trace:()=>events.push('trace'),burst:()=>events.push('burst')};
  const combat=new Combat({group} as MapWorld,sound as any,effects as any,()=>events.push('damage'),()=>events.push('hunt-hit'));
  combat.actors=[shooter];return{group,target,shooter,combat,events};
}

test('preparation confinement uses all wall faces, floor and the formal roof',()=>{
  assert.deepEqual(PREPARATION_ROOM,{minX:720,maxX:944,minZ:-96,maxZ:96,minY:0,maxY:128});
  const bounds={min:[-9,0,-7] as [number,number,number],max:[9,48,7] as [number,number,number]};
  for(const position of [[729,.2,0],[935,.2,0],[832,.2,-89],[832,.2,89],[832,80,0]] as [number,number,number][])assert.equal(needsPreparationReturn('preparation','hunter',position,bounds),false);
  for(const position of [[728.9,.2,0],[935.1,.2,0],[832,.2,-89.1],[832,.2,89.1],[832,80.1,0],[832,-.1,0]] as [number,number,number][])assert.equal(needsPreparationReturn('preparation','hunter',position,bounds),true);
  assert.equal(needsPreparationReturn('preparation','hunter',[730,.2,0],bounds,Math.PI/4),true);
  assert.equal(needsPreparationReturn('hunt','hunter',[0,300,0],bounds),false);
});

test('preparation target practice consumes ammo and gives sound and visual feedback without damage or score',()=>{
  const {combat,shooter,events,target}=practiceFixture();
  const hider={...shooter,id:1,role:'hider',hp:100,score:25,visual:new THREE.Group(),position:new THREE.Vector3(880,40,-56)} as Actor;
  hider.visual.add(new THREE.Mesh(new THREE.BoxGeometry(8,16,16),new THREE.MeshBasicMaterial()));
  hider.visual.position.copy(hider.position);combat.actors.push(hider);
  assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);
  assert.equal(shooter.ammo,11);assert.equal(shooter.hp,100);assert.equal(shooter.score,0);assert.equal(hider.hp,100);assert.equal(hider.score,25);
  assert.ok(events.includes('shot'));assert.ok(events.includes('targetHit'));assert.ok(events.includes('burst'));assert.ok(events.includes('trace'));
  assert.equal(events.includes('damage'),false);assert.equal(events.includes('hunt-hit'),false);assert.equal(target.userData.practiceHits,1);
});

test('hunters can shoot from every part of the preparation room in every direction',()=>{
  const {combat,shooter,events}=practiceFixture();
  for(const [position,direction] of [[[784,0,48],[1,0,0]],[[856,0,-56],[1,0,0]],[[848,0,48],[1,0,0]],[[848,0,-56],[-1,0,0]]] as number[][][]){
    shooter.position.set(position[0],position[1],position[2]);
    shooter.fireCooldown=0;
    assert.equal(combat.shoot(shooter,new THREE.Vector3(direction[0],direction[1],direction[2]),'preparation'),true);
  }
  assert.equal(shooter.ammo,8);assert.equal(events.filter(event=>event==='shot').length,4);
  assert.equal(shooter.hp,100);assert.equal(shooter.score,0);
});

test('scenery blocks a practice target but does not charge an error penalty',()=>{
  const {combat,shooter,events,group,target}=practiceFixture(),wall=new THREE.Mesh(new THREE.BoxGeometry(4,40,40),new THREE.MeshBasicMaterial());wall.position.set(884,40,-56);group.add(wall);
  assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);
  assert.equal(shooter.hp,100);assert.equal(shooter.score,0);assert.equal(target.userData.practiceHits,undefined);assert.equal(events.includes('damage'),false);assert.equal(events.includes('hit'),false);
});

test('rack support hits stay ordinary scenery and the nearest real target selects target two',()=>{
  const {combat,shooter,events,target}=practiceFixture();target.position.y=10;delete target.userData.practiceTarget;
  assert.equal(combat.shoot(shooter,new THREE.Vector3(64,-30,0).normalize(),'preparation'),true);assert.equal(target.userData.practiceHits,undefined);assert.equal(events.includes('hit'),false);
  target.position.set(912,40,8);target.userData.practiceTargetIndex=1;shooter.position.z=8;shooter.fireCooldown=0;const hits:number[]=[];combat.onPracticeHit=(_actor,index)=>hits.push(index);
  assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);assert.deepEqual(hits,[1]);assert.equal(target.userData.practiceHits,1);
});

test('shotgun target feedback is counted once per trigger rather than once per pellet',()=>{
  const {combat,shooter,events,target}=practiceFixture();shooter.weapon=shooter.gun='shotgun';shooter.ammo=6;
  assert.equal(combat.shoot(shooter,new THREE.Vector3(1,0,0),'preparation'),true);assert.equal(shooter.ammo,5);assert.equal(target.userData.practiceHits,1);assert.equal(events.filter(event=>event==='targetHit').length,1);assert.equal(shooter.score,0);
});

test('practice weapon supply changes all four weapons and replenishes the selected gun',()=>{
  const {combat,shooter}=practiceFixture();
  for(const weapon of ['pistol','smg','shotgun','knife'] as WeaponId[]){
    shooter.ammo=0;shooter.reserve=0;shooter.reloadTimer=2;
    (combat as any).supplyWeapon(shooter,weapon);
    assert.equal(shooter.weapon,weapon);assert.equal(shooter.ammo,WEAPONS[shooter.gun].magazine);assert.equal(shooter.reserve,WEAPONS[shooter.gun].reserve);assert.equal(shooter.reloadTimer,0);
    if(weapon!=='knife')assert.equal(shooter.gun,weapon);
  }
});
