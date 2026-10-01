import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {aimBot} from '../src/bot-aim.ts';
test('hunter must turn before shooting, and recoil survives into subsequent aim',()=>{
 const actor:any={id:1,yaw:0,pitch:0,position:new THREE.Vector3()};
 const intent:any={direction:new THREE.Vector3(),target:{position:new THREE.Vector3(100,35,0)}};
 const first=aimBot(actor,intent,1/60,0);
 assert.equal(first.canFire,false);assert.ok(Math.abs(actor.yaw)<.04);
 for(let i=0;i<100;i++)aimBot(actor,intent,1/60,i/60);
 const locked=aimBot(actor,intent,1/60,2);assert.equal(locked.canFire,true);
 actor.pitch+=.2;const recoil=aimBot(actor,intent,1/60,2.02);
 assert.equal(recoil.canFire,false);assert.ok(actor.pitch>.15);
});
