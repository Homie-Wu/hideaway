import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';
import {Physics} from '../src/physics.ts';
import {BotDirector,findPath} from '../src/bots.ts';
import {cloneModel,modelBounds,modelVolume} from '../src/voxel/model.ts';
import type {MapWorld,VoxelModel,ModelBounds,ActorState} from '../src/contracts.ts';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:next(url,context)}});
const {Game}=await import('../src/game.ts');

let world:MapWorld;
before(()=>{world=createWorld();world.randomize(17,0);});
after(()=>world?.dispose());
const model32:VoxelModel={version:2,name:'32立方通行验收',pivot:[16,0,16],parts:[{id:'cube',name:'cube',position:[0,0,0],rotation:[0,0,0],cells:Array.from({length:32**3},(_,i)=>({x:i%32,y:Math.floor(i/32)%32,z:Math.floor(i/1024),color:'#547e68'}))}]};
function moveGame(physics:Physics,actors:any[],phase='practice'){
 const game:any=Object.create(Game.prototype);Object.assign(game,{physics,map:world,actors,climbers:new Map(),session:{phase,elapsed:0},sound:{play:()=>{}},ui:{toast:()=>{}},surfaceAt:()=> 'tile'});return game;
}
function actor(physics:Physics,id:number,model:VoxelModel,position:THREE.Vector3){
 const bounds=modelBounds(model),physical=physics.addActor(id,position,bounds);
 return {id,name:`验证 ${id}`,role:'hider',alive:true,hp:100,score:0,total:0,model:cloneModel(model),bounds,volume:modelVolume(model),position:physical.position,physical,velocity:new THREE.Vector3(),yaw:0,previousYaw:0,sprint:false,crouch:false,stun:0,lastStep:0} as any;
}

test('the native 32 cube reaches all 20 rooms through actual Game movement and body-filtered navigation',async context=>{
 const physics=await Physics.create();physics.loadWorld(world.colliders);const failures:string[]=[];
 try{
  const bounds:ModelBounds={min:[-16,0,-16],max:[16,32,16]},director=new BotDirector(world,physics);
  const start=director.nearest(new THREE.Vector3(...world.hiderSpawn));
  const p=actor(physics,301,model32,new THREE.Vector3(...world.nav[start].position).add(new THREE.Vector3(0,.12,0))),game=moveGame(physics,[p]);
  const allowed=new Set(world.nav.flatMap((node,i)=>!node.hide&&physics.canFit(bounds,new THREE.Vector3(...node.position).add(new THREE.Vector3(0,.12,0)))?[i]:[]));
  for(const room of layout.rooms.filter(row=>row.id!=='prep')){
   const destinations=world.nav.map((node,i)=>({node,i})).filter(({node,i})=>node.room===room.name&&allowed.has(i));
   let reached=false,stopped='没有可用路线';
   for(const destination of destinations.slice(0,10)){
    const path=findPath(world,start,destination.i,i=>allowed.has(i),(a,b)=>(director as any).edgeAllowed(p,a,b));
    if(start!==destination.i&&!path.length)continue;
    physics.teleport(p.physical,new THREE.Vector3(...world.nav[start].position).add(new THREE.Vector3(0,.12,0)));p.velocity.set(0,0,0);p.physical.yaw=p.yaw=0;
    for(const index of path){
     const goal=new THREE.Vector3(...world.nav[index].position).add(new THREE.Vector3(0,.12,0));
     for(let step=0;step<180;step++){
      const delta=goal.clone().sub(p.position);if(Math.hypot(delta.x,delta.z)<2.3&&Math.abs(delta.y)<9)break;
      delta.y=0;game.session.elapsed+=1/60;Game.prototype.moveActor.call(game,p,delta.normalize(),false,false,1/60);physics.step(1/60);
     }
     if(p.position.distanceTo(goal)>15){stopped=`目标 ${goal.toArray()} 实际 ${p.position.toArray()}`;break;}
    }
    reached=p.position.distanceTo(new THREE.Vector3(...destination.node.position))<15&&physics.canFit(bounds,p.position,p.yaw);if(reached)break;
   }
   if(!reached)failures.push(`${room.name}: ${stopped}`);
  }
  assert.deepEqual(failures,[],'32³ geometry must rotate, climb and enter every ordinary room without jumping or teleporting along a route');
  context.diagnostic('Native 32³ controller reached all 20 room/outdoor destinations using real Game.moveActor + Rapier, including both levels.');
 }finally{physics.dispose();}
});

test('seven actual scene-model bots settle in reachable furniture voids through Game movement',async context=>{
 const physics=await Physics.create();physics.loadWorld(world.colliders);const catalog=world.group.userData.mimicModels as VoxelModel[];
 try{
  const bots=new BotDirector(world,physics),actors=Array.from({length:7},(_,i)=>actor(physics,i+1,catalog[(i+2)%catalog.length],new THREE.Vector3(world.hiderSpawn[0]+((i+1)%3-1)*30,.2,world.hiderSpawn[2]+Math.floor((i+1)/3)*25)));
  const game=moveGame(physics,actors,'preparation'),settled=new Map<number,{time:number;furniture:string;position:number[]}>();
  for(let step=0;step<60*60&&settled.size<actors.length;step++){
   game.session.elapsed=step/60;
   for(const p of actors){
    const intent=bots.decide(p as ActorState,actors,'preparation',1/60,game.session.elapsed);Game.prototype.moveActor.call(game,p,intent.direction,intent.sprint,intent.jump,1/60);
    const brain=bots.brains.get(p.id),node=brain&&brain.node>=0?world.nav[brain.node]:undefined;
    if(node?.hide&&brain!.path.length===0&&p.position.distanceTo(new THREE.Vector3(...node.position).add(new THREE.Vector3(0,.12-p.bounds.min[1],0)))<10&&physics.canFit(p.bounds,p.position,p.yaw))
     settled.set(p.id,{time:game.session.elapsed,furniture:(node as any).furniture,position:p.position.toArray()});
    else settled.delete(p.id);
   }
   physics.step(1/60);
  }
  assert.equal(settled.size,actors.length,JSON.stringify(actors.filter(p=>!settled.has(p.id)).map(p=>({id:p.id,position:p.position.toArray(),brain:bots.brains.get(p.id)}))));
  context.diagnostic(JSON.stringify([...settled]));
 }finally{physics.dispose();}
});

test('a full 32-cube bot follows its real planned route upstairs into the study desk void',async context=>{
 const physics=await Physics.create();physics.loadWorld(world.colliders);
 try{
  const p=actor(physics,311,model32,new THREE.Vector3(...world.hiderSpawn).add(new THREE.Vector3(0,.2,0))),game=moveGame(physics,[p],'preparation'),bots=new BotDirector(world,physics);
  bots.decide(p,[p],'preparation',1/60,0);
  const target=world.nav.findIndex(node=>node.hide&&(node as any).furniture==='T01');assert.ok(target>=0,'the actual 32³ desk destination exists');
  const brain=bots.brains.get(p.id)!,allowed=bots.clearance.get(p.id)!;
  assert.ok((bots as any).route(p,brain,target,(i:number)=>allowed.has(i),0),'the bot body clearance admits the complete upper-floor route');
  brain.until=Infinity;
  let arrived=-1;
  for(let step=0;step<60*60;step++){
   game.session.elapsed=step/60;const intent=bots.decide(p,[p],'preparation',1/60,game.session.elapsed);Game.prototype.moveActor.call(game,p,intent.direction,intent.sprint,intent.jump,1/60);physics.step(1/60);
   if(brain.node===target&&brain.path.length===0&&p.position.distanceTo(new THREE.Vector3(...world.nav[target].position).add(new THREE.Vector3(0,.12,0)))<10){arrived=game.session.elapsed;break;}
  }
  assert.ok(arrived>=0,`full-size bot stopped at ${p.position.toArray()} with ${brain.path.length} route nodes left`);
  assert.ok(physics.canFit(p.bounds,p.position,p.yaw));assert.ok(Math.abs(p.position.y-128.12)<.1);
  context.diagnostic(`32³ bot reached T01 at ${arrived.toFixed(2)}s, ${p.position.toArray()}.`);
 }finally{physics.dispose();}
});
