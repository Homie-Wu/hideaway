import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {Physics} from '../src/physics.ts';
import {MOTION} from '../src/movement.ts';
const bounds={min:[-4,0,-4] as [number,number,number],max:[4,8,4] as [number,number,number]};
test('jump preserves roughly 53 units of reach with under one second airtime',()=>{assert.ok(MOTION.jump*MOTION.jump/(2*MOTION.gravity)>=52);assert.ok(2*MOTION.jump/MOTION.gravity<1)});
test('wall contact uses rotated collider extent and excludes invisible boundaries',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[10,32,0],size:[2,64,80],kind:'wall',room:'test'}]);
 const a=p.addActor(1,new THREE.Vector3(4.8,.12,0),bounds);const hit=p.climbSurface(a);assert.ok(hit);assert.deepEqual(hit.normal.toArray(),[-1,0,0]);
 p.teleport(a,new THREE.Vector3(0,.12,0));assert.equal(p.climbSurface(a),undefined);
 p.loadWorld([{center:[10,32,0],size:[2,64,80],kind:'boundary',room:'test'}]);p.teleport(a,new THREE.Vector3(4.8,.12,0));assert.equal(p.climbSurface(a),undefined);p.dispose();
});
test('wall climb remains outside solid wall and is blocked by overhead ceiling',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[10,32,0],size:[2,64,80],kind:'wall',room:'test'},{center:[0,25,0],size:[30,2,60],kind:'floor',room:'ceiling'},{center:[0,-1,0],size:[100,2,100],kind:'floor',room:'floor'}]);
 const a=p.addActor(1,new THREE.Vector3(4.8,.12,0),bounds);
 for(let i=0;i<90;i++){p.move(a,new THREE.Vector3(.01,.65,0));p.step(1/60)}
 assert.ok(a.position.y>10);assert.ok(a.position.y+8<=24.1);assert.ok(a.position.x+4<=9.1);p.dispose();
});
test('climb can enter a ledge only by swept collision-checked movement with enough headroom',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[10,16,0],size:[2,32,80],kind:'wall',room:'test'}]);
 const a=p.addActor(1,new THREE.Vector3(4.8,32.2,0),bounds);p.move(a,new THREE.Vector3(1,0,0));assert.ok(a.position.x>5);
 p.loadWorld([{center:[10,16,0],size:[2,32,80],kind:'wall',room:'test'},{center:[15,41,0],size:[10,2,80],kind:'floor',room:'overhang'}]);
 p.teleport(a,new THREE.Vector3(4.8,32.2,0));assert.ok(p.canFit(bounds,a.position));p.move(a,new THREE.Vector3(8,0,0));assert.ok(a.position.x<6.1);p.dispose();
});
