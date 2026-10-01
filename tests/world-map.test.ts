import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';
import {Physics} from '../src/physics.ts';
import {findPath} from '../src/bots.ts';
import type {MapWorld, ModelBounds, Vec3, WorldBox} from '../src/contracts.ts';

let world:MapWorld;
before(()=>{world=createWorld();world.randomize(17,0);});
after(()=>world?.dispose());
const mainRooms=layout.rooms.filter(room=>room.id!=='prep');
const intersects=(p:Vec3,min:Vec3,max:Vec3,box:WorldBox)=>p.every((v,i)=>
  v+max[i]>box.center[i]-box.size[i]/2+.02&&v+min[i]<box.center[i]+box.size[i]/2-.02);
const hunterBounds:ModelBounds={min:[-9,0,-7],max:[9,48,7]};

test('all 20 playable rooms and all approved hiding destinations share one bidirectional navigation component',()=>{
  assert.equal(mainRooms.length,20);
  for(const room of mainRooms)assert.ok(world.nav.some(node=>node.room===room.name),`No reachable node in ${room.name}`);
  assert.ok(!world.nav.some(node=>node.room===layout.rooms.find(room=>room.id==='prep')!.name),'The sealed preparation area is outside the hunt graph');
  const visited=new Set([0]),queue=[0];
  for(let i=0;i<queue.length;i++)for(const link of world.nav[queue[i]].links){
    assert.ok(Number.isInteger(link)&&link>=0&&link<world.nav.length);
    assert.ok(world.nav[link].links.includes(queue[i]),'Every navigation connection is bidirectional');
    if(!visited.has(link)){visited.add(link);queue.push(link);}
  }
  assert.equal(visited.size,world.nav.length);
  for(const entrance of layout.validation.hideEntrances){
    const spec=layout.furniture.find(row=>row.id===entrance.furniture)!;
    const node=world.nav.find(node=>node.hide&&(node as typeof node&{furniture?:string}).furniture===spec.id);
    assert.ok(node,`${spec.id}: approved ${entrance.model} cube hiding destination is connected`);
    assert.equal((node as typeof node&{maxModel?:number}).maxModel,spec.hide!.maxModel);
  }
  for(const node of world.nav)assert.ok(!world.colliders.some(box=>intersects(node.position,[-3,.2,-3],[3,8,3],box)),
    `Navigation point is inside a solid: ${node.room} ${node.position}`);
});

test('random props rebuild in place, remain deterministic, and preserve fixed architecture and room semantics',()=>{
  const colliderReference=world.colliders,navReference=world.nav;
  const fixedCount=world.group.userData.world.staticColliders;
  const architecture=JSON.stringify(world.colliders.slice(0,fixedCount));
  try{
    world.randomize(99,0);const baseline=JSON.stringify(world.colliders);
    world.randomize(105,0);assert.equal(JSON.stringify(world.colliders),baseline,'Zero random ratio ignores the seed');
    world.randomize(105,1);const randomized=JSON.stringify(world.colliders);assert.notEqual(randomized,baseline);
    world.randomize(105,1);assert.equal(JSON.stringify(world.colliders),randomized,'Seed reproduces the entire solid prop layout');
    assert.equal(world.colliders,colliderReference);assert.equal(world.nav,navReference);
    assert.equal(JSON.stringify(world.colliders.slice(0,fixedCount)),architecture);
    const roomNames=new Set(layout.rooms.map(room=>room.name));
    assert.ok(world.colliders.slice(fixedCount).every(box=>box.kind==='prop'&&roomNames.has(box.room)));
    let meshes=0;world.group.traverse(obj=>{if(obj instanceof THREE.Mesh)meshes++;});
    assert.ok(meshes<180,`${meshes} draws exceed the static scene budget`);
  }finally{world.randomize(17,0);}
});

test('all actual round spawn slots are clear, the dining-table void stays open, and preparation is enclosed',()=>{
  const slots=world.group.userData.spawns.preparationSlots as Vec3[];
  assert.deepEqual(slots,layout.spawns.preparationSlots);assert.equal(slots.length,8);
  for(let i=0;i<8;i++){
    const hider:Vec3=[world.hiderSpawn[0]+(i%3-1)*30,.2,world.hiderSpawn[2]+Math.floor(i/3)*25];
    const hunter:Vec3=[slots[i][0],slots[i][1]+.2,slots[i][2]];
    assert.ok(!world.colliders.some(box=>intersects(hider,[-9,0,-9],[9,32,9],box)),`Hider spawn ${i}`);
    assert.ok(!world.colliders.some(box=>intersects(hunter,hunterBounds.min,hunterBounds.max,box)),`Hunter preparation slot ${i}`);
    const [rx,rz,rw,rd]=layout.preparationFeatures.firingRange.rect;
    assert.ok(hunter[0]+hunterBounds.max[0]<=rx||hunter[2]+hunterBounds.min[2]>=rz+rd||hunter[2]+hunterBounds.max[2]<=rz,'Slot is outside the practice firing lane');
  }
  const table=layout.furniture.find(row=>row.id==='D01')!,hide=table.hide!;
  const point:Vec3=[hide.rect[0]+hide.rect[2]/2,hide.y+.2,hide.rect[1]+hide.rect[3]/2];
  assert.ok(!world.colliders.some(box=>intersects(point,[-16,0,-16],[16,32,16],box)),'The full approved 32 cube fits under the actual dining table');
  const prep=layout.rooms.find(room=>room.id==='prep')!,walls=world.colliders.filter(box=>box.kind==='wall'&&box.room===prep.name&&box.size[1]>=128);
  assert.equal(walls.length,4);assert.ok(walls.every(box=>box.size[1]>=layout.boundaries.preparationRoofY));
  assert.ok(world.colliders.some(box=>box.kind==='boundary'&&box.room===prep.name&&box.center[1]-box.size[1]/2===128));
});

test('the 48-unit Rapier hunter climbs every real tread of both U-stair flights and exits at Y128',async()=>{
  const physics=await Physics.create();physics.loadWorld(world.colliders);
  try{
    const hunter=physics.addActor(91,new THREE.Vector3(320,.2,-80),hunterBounds),visited=new Set<number>();
    for(const goal of [new THREE.Vector3(320,64,-264),new THREE.Vector3(400,64,-264),new THREE.Vector3(400,128,-80)]){
      for(let step=0;step<220;step++){
        const delta=goal.clone().sub(hunter.position);delta.y=0;if(delta.length()<1.2)break;
        delta.normalize().multiplyScalar(1.2);delta.y=-.1;physics.move(hunter,delta);physics.step(1/60);
        const tread=Math.round(hunter.position.y/8);if(tread>0&&tread<=16&&Math.abs(hunter.position.y-tread*8)<.5)visited.add(tread);
      }
      assert.ok(Math.hypot(hunter.position.x-goal.x,hunter.position.z-goal.z)<2,`Stopped before stair checkpoint ${goal.toArray()} at ${hunter.position.toArray()}`);
      assert.ok(Math.abs(hunter.position.y-goal.y)<.5,`Wrong support height at checkpoint: ${hunter.position.toArray()}`);
    }
    assert.deepEqual([...visited].sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i+1),'Both complete eight-tread flights were climbed without teleporting');
  }finally{physics.dispose();}
});

test('small props cross the entrance hall without sticking on overlapping floor contacts',async()=>{
  const physics=await Physics.create();physics.loadWorld(world.colliders);
  try{
    const prop=physics.addActor(98,new THREE.Vector3(-30,.2,world.hiderSpawn[2]),{min:[-4,0,-4],max:[4,8,4]});
    for(let i=0;i<120;i++){physics.move(prop,new THREE.Vector3(0,-.08,-1.1));physics.step(1/60);}
    assert.ok(prop.position.z<50,`Movement stuck at ${prop.position.z}`);assert.ok(prop.position.y>=0&&prop.position.y<.3);
  }finally{physics.dispose();}
});

test('prop and 48-unit hunter controllers physically travel from the entrance into all 20 rooms and outdoor zones',async()=>{
  const physics=await Physics.create();physics.loadWorld(world.colliders);
  try{
    const spawn=new THREE.Vector3(...world.hiderSpawn);
    const start=world.nav.map((node,i)=>({i,d:new THREE.Vector3(...node.position).distanceToSquared(spawn)})).sort((a,b)=>a.d-b.d)[0].i;
    const failures:string[]=[];
    for(const bounds of [{min:[-4,0,-4] as Vec3,max:[4,8,4] as Vec3},hunterBounds])for(const room of mainRooms){
      const options=world.nav.map((node,i)=>({node,i})).filter(({node})=>node.room===room.name&&!node.hide);
      let reached=false,last:THREE.Vector3|undefined;
      for(const option of options.slice(0,10)){
        const route=findPath(world,start,option.i,i=>!world.nav[i].hide);
        if(start!==option.i&&route.length===0)continue;
        const actor=physics.addActor(90,new THREE.Vector3(...world.nav[start].position).add(new THREE.Vector3(0,.2,0)),bounds);
        for(const node of route){
          const goal=new THREE.Vector3(...world.nav[node].position);
          for(let i=0;i<150;i++){
            const delta=goal.clone().sub(actor.position);if(Math.hypot(delta.x,delta.z)<2.3&&Math.abs(delta.y)<9)break;
            delta.y=0;delta.normalize().multiplyScalar(1.1);delta.y=-.15;physics.move(actor,delta);physics.step(1/60);
          }
          last=actor.position.clone();if(actor.position.distanceTo(goal)>15)break;
        }
        last=actor.position.clone();reached=last.distanceTo(new THREE.Vector3(...option.node.position))<15;
        if(reached)assert.ok(physics.canFit(bounds,last),'Final full actor bounds are physically clear');
        physics.removeActor(actor);if(reached)break;
      }
      if(!reached)failures.push(`${room.name}, height ${bounds.max[1]}: movement stopped at ${last?.toArray()??'no route'}`);
    }
    assert.deepEqual(failures,[],'Every approved destination must be reachable through real solid geometry');
  }finally{physics.dispose();}
});
