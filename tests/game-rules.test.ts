import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context)}});
const {Game}=await import('../src/game.ts');
import {Physics} from '../src/physics.ts';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';

test('preparation T has no score, cooldown, sound or reveal side effects',()=>{
 const events:string[]=[];
 const actor={alive:true,role:'hider',score:0,lastTaunt:-Infinity,position:new THREE.Vector3(),bounds:{max:[8,8,8]}};
 const game={session:{phase:'preparation',elapsed:20},actors:[actor],sound:{play:()=>events.push('sound')},bots:{hear:()=>events.push('heard')},effects:{burst:()=>events.push('effect')}};
 Game.prototype.taunt.call(game as any,actor as any);
 Game.prototype.taunt.call(game as any,actor as any,true);
 assert.equal(actor.score,0);assert.equal(actor.lastTaunt,-Infinity);assert.deepEqual(events,[]);
});

test('preparation hunter cannot escape through the roof or walls, while hunt allows release',async()=>{
 const map=createWorld(),physics=await Physics.create();physics.loadWorld(map.colliders);
 const bounds={min:[-9,0,-7] as [number,number,number],max:[9,48,7] as [number,number,number]};
 const physical=physics.addActor(2,new THREE.Vector3(832,270,-82),bounds);
 const actor={id:2,alive:true,role:'hunter',physical,position:physical.position,bounds,yaw:0,velocity:new THREE.Vector3(),stun:0,lastStep:0};
 const game={session:{phase:'preparation',elapsed:10},map,physics,actors:[actor],preparationPosition:(index:number)=>[...layout.spawns.preparationSlots[index]],climbers:new Map(),sound:{play:()=>{}},surfaceAt:()=> 'wood'};
 try{
  for(let i=0;i<24;i++){Game.prototype.moveActor.call(game as any,actor as any,new THREE.Vector3(0,0,-1),true,false,1/60);physics.step(1/60)}
  assert.ok(actor.position.z>-89&&actor.position.y+48<=128,'full body stays inside the room and below its roof');
  game.session.phase='hunt';physics.teleport(physical,new THREE.Vector3(832,270,-82));actor.velocity.set(0,0,0);
  for(let i=0;i<24;i++){Game.prototype.moveActor.call(game as any,actor as any,new THREE.Vector3(0,0,-1),true,false,1/60);physics.step(1/60)}
  assert.ok(actor.position.z<-110,'preparation guard must end when hunt starts');
 }finally{physics.dispose();map.dispose()}
});
