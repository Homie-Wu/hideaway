import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BotDirector} from '../src/bots.ts';
import {Physics} from '../src/physics.ts';
import {createDefaultModel} from '../src/voxel/model.ts';
import {MOTION} from '../src/movement.ts';
import type {ActorState,MapWorld,WorldBox} from '../src/contracts.ts';

const floor:WorldBox={center:[0,-1,0],size:[1400,2,1400],kind:'floor',room:'test'};
const wall:WorldBox={center:[50,50,0],size:[4,100,100],kind:'wall',room:'test'};
function actor(id:number,role:'hunter'|'hider',x:number,z=0):ActorState {
 return {id,name:String(id),role,alive:true,hp:100,score:0,total:0,yaw:-Math.PI/2,
  position:new THREE.Vector3(x,.12,z),velocity:new THREE.Vector3(),model:createDefaultModel()};
}
async function fixture(boxes:WorldBox[]=[floor]) {
 const physics=await Physics.create();physics.loadWorld(boxes);
 const world={nav:[{position:[0,0,0],links:[1],room:'test'},
  {position:[100,0,0],links:[0,2],room:'test',hide:true},
  {position:[200,0,0],links:[1],room:'test',hide:true}]} as MapWorld;
 const hunter=actor(1,'hunter',0),hider=actor(2,'hider',100),actors=[hunter,hider];
 return {physics,world,hunter,hider,actors,bot:new BotDirector(world,physics)};
}
function observe(bot:BotDirector,hunter:ActorState,actors:ActorState[],start:number,seconds:number) {
 let intent=bot.decide(hunter,actors,'hunt',.1,start);
 for(let elapsed=.1;elapsed<seconds;elapsed+=.1)intent=bot.decide(hunter,actors,'hunt',.1,start+elapsed);
 return intent;
}

test('grounded gravity velocity does not reveal a stationary disguise',async()=>{
 const f=await fixture();try{
  f.hider.velocity.y=-2-MOTION.gravity/60;
  const intent=observe(f.bot,f.hunter,f.actors,0,3);
  assert.equal(intent.target,undefined);assert.equal(intent.attack,false);
 }finally{f.physics.dispose()}
});

test('moving hider behind the hunter is not perceived until the hunter turns',async()=>{
 const f=await fixture();try{
  f.hider.position.x=-100;f.hider.velocity.x=20;
  assert.equal(observe(f.bot,f.hunter,f.actors,0,2).target,undefined);
  f.hunter.yaw=Math.PI/2;
  assert.equal(observe(f.bot,f.hunter,f.actors,2,1.5).target,f.hider);
 }finally{f.physics.dispose()}
});

test('visible motion needs confirmation and a separate first-shot delay',async()=>{
 const f=await fixture();try{
  f.hider.velocity.x=20;
  const first=f.bot.decide(f.hunter,f.actors,'hunt',.1,0);
  assert.equal(first.target,undefined);assert.equal(first.attack,false);
  const confirmed=observe(f.bot,f.hunter,f.actors,.1,.5);
  assert.equal(confirmed.target,f.hider);assert.equal(confirmed.attack,false);
  assert.equal(observe(f.bot,f.hunter,f.actors,.6,.7).attack,true);
 }finally{f.physics.dispose()}
});

test('close stationary disguise is not identified just by proximity',async()=>{
 const f=await fixture();try{
  f.hider.position.x=35;
  assert.equal(observe(f.bot,f.hunter,f.actors,0,.7).target,undefined);
  assert.equal(observe(f.bot,f.hunter,f.actors,.7,4).target,undefined);
 }finally{f.physics.dispose()}
});

test('walls block fire, tracking uses last seen position, and recognition expires',async()=>{
 const f=await fixture();try{
  f.hider.velocity.x=20;
  assert.equal(observe(f.bot,f.hunter,f.actors,0,1.5).attack,true);
  f.physics.loadWorld([floor,wall]);f.hider.position.x=180;f.hider.velocity.set(0,0,0);
  const hidden=f.bot.decide(f.hunter,f.actors,'hunt',.1,2);
  assert.equal(hidden.target,undefined);assert.equal(hidden.attack,false);
  assert.ok(hidden.lookAt&&hidden.lookAt.x<130,'search only the last seen position');
  observe(f.bot,f.hunter,f.actors,3,6);
  f.physics.loadWorld([floor]);
  assert.equal(observe(f.bot,f.hunter,f.actors,10,2).target,undefined);
 }finally{f.physics.dispose()}
});

test('sound supplies an uncertain search area, never immediate target identity',async()=>{
 const f=await fixture();try{
  f.bot.decide(f.hunter,f.actors,'hunt',.1,0);
  f.bot.hear(f.hider,f.actors,1);
  const heard=f.bot.brains.get(f.hunter.id)?.heard;
  assert.ok(heard);assert.ok(heard.distanceTo(f.hider.position)>5);
  const intent=f.bot.decide(f.hunter,f.actors,'hunt',.1,1);
  assert.equal(intent.target,undefined);assert.equal(intent.attack,false);
 }finally{f.physics.dispose()}
});

test('a wall reduces sound range while nearby muffled sound can still be investigated',async()=>{
 const f=await fixture([floor,wall]);try{
  f.hider.position.x=300;f.bot.decide(f.hunter,f.actors,'hunt',.1,0);
  f.bot.hear(f.hider,f.actors,1);
  assert.equal(f.bot.brains.get(f.hunter.id)?.heard,undefined);
  f.hider.position.x=100;f.bot.hear(f.hider,f.actors,2);
  assert.ok(f.bot.brains.get(f.hunter.id)?.heard);
 }finally{f.physics.dispose()}
});

test('a reached safe hiding place is retained across long waits and the hunt transition',async()=>{
 const f=await fixture();try{
  f.hunter.position.x=600;
  f.bot.decide(f.hider,f.actors,'preparation',.1,1);
  const chosen=f.bot.brains.get(f.hider.id)!.node;
  f.hider.position.set(...f.world.nav[chosen].position);f.hider.position.y+=.12;
  f.bot.decide(f.hider,f.actors,'preparation',.1,2);
  for(let time=40;time<=200;time+=40){
   const intent=f.bot.decide(f.hider,f.actors,'preparation',.1,time);
   assert.equal(intent.direction.lengthSq(),0,'safe disguise stays still');
   assert.equal(f.bot.brains.get(f.hider.id)!.node,chosen);
  }
  f.bot.beginHunt(f.actors,360);
  assert.equal(f.bot.decide(f.hider,f.actors,'hunt',.1,360).direction.lengthSq(),0);
  assert.equal(f.bot.brains.get(f.hider.id)!.node,chosen);
  assert.equal(f.bot.decide(f.hider,f.actors,'hunt',.1,361).taunt,false);
 }finally{f.physics.dispose()}
});

test('hider does not taunt or charge a nearby hunter just because its id is even',async()=>{
 const f=await fixture();try{
  f.hunter.position.x=80;
  f.bot.decide(f.hider,f.actors,'hunt',.1,0);
  const intent=f.bot.decide(f.hider,f.actors,'hunt',.1,100);
  assert.equal(intent.taunt,false);assert.equal(intent.sprint,false);
  assert.ok(intent.direction.x>=0,'escape moves away from the nearby hunter');
 }finally{f.physics.dispose()}
});

test('escape chooses reachable cover and follows its corner instead of running into the wall',async()=>{
 const f=await fixture([floor,{...wall,center:[60,50,100],size:[100,100,4]}]);try{
  f.world.nav=[
   {position:[100,0,0],links:[1,4],room:'test'},
   {position:[140,0,60],links:[0,2],room:'test'},
   {position:[140,0,140],links:[1,3],room:'test'},
   {position:[100,0,140],links:[2],room:'test',hide:true},
   {position:[220,0,0],links:[0],room:'test',hide:true},
  ];
  f.bot.decide(f.hider,f.actors,'preparation',.1,0);f.hider.hp=70;
  const intent=f.bot.decide(f.hider,f.actors,'hunt',.1,1);
  assert.equal(intent.sprint,true);assert.ok(intent.direction.z>.5,'follow the route around the wall');
  assert.equal(f.bot.brains.get(f.hider.id)!.node,3,'prefer covered endpoint over exposed straight retreat');
 }finally{f.physics.dispose()}
});

test('line of sight above low furniture is not a traversable movement shortcut',async()=>{
 const f=await fixture([floor,{center:[50,2,0],size:[12,4,40],kind:'furniture',room:'test'}]);try{
  f.hider.position.x=100;f.hunter.position.x=0;
  f.hider.velocity.x=20;
  f.world.nav=[
   {position:[0,0,0],links:[1],room:'test'},
   {position:[0,0,50],links:[0,2],room:'test'},
   {position:[100,0,50],links:[1,3],room:'test'},
   {position:[100,0,0],links:[2],room:'test'},
  ];
  const intent=observe(f.bot,f.hunter,f.actors,0,1.1);
  assert.ok(intent.direction.z>.5,'use floor clearance, not the eye ray');
 }finally{f.physics.dispose()}
});
