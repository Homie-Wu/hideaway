import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3, WorldBox } from '../src/contracts.ts';
import { layout } from '../src/world/design-layout.ts';
import { createNavigation, roomAt } from '../src/world/navigation.ts';
import { gardenBounds, roomZones, sampleRoomPosition } from '../src/world/spaces.ts';
import { buildFurnitureAsset } from '../src/world/voxel-furniture.ts';
import { voxelCollisionBoxes } from '../src/world/voxel-asset.ts';

const slab=(x:number,z:number,w:number,d:number,y:number):WorldBox=>({center:[x+w/2,y-4,z+d/2],size:[w,8,d],kind:'floor',room:'test'});
function walkableFixture():WorldBox[] {
  const boxes:WorldBox[]=[slab(-608,-544,1216,1088,0),slab(-448,-320,728,640,128),slab(280,-320,168,8,128),slab(440,-312,8,200,128),slab(280,-112,168,432,128),slab(152,320,288,80,128)];
  boxes.push(slab(288,-304,144,64,64));
  for(let i=0;i<8;i++){
    boxes.push({center:[320,(i+1)*4,-120-i*16],size:[64,(i+1)*8,16],kind:'floor',room:'楼梯间'});
    boxes.push({center:[400,64+(i+1)*4,-232+i*16],size:[64,(i+1)*8,16],kind:'floor',room:'楼梯间'});
  }
  return boxes;
}

const intersects=(p:Vec3,box:WorldBox,height=50,radius=11)=>Math.abs(p[0]-box.center[0])<box.size[0]/2+radius-.05&&Math.abs(p[2]-box.center[2])<box.size[2]/2+radius-.05&&p[1]+height>box.center[1]-box.size[1]/2+.1&&p[1]+.1<box.center[1]+box.size[1]/2;
const at=(nav:ReturnType<typeof createNavigation>,p:Vec3)=>nav.findIndex(n=>n.position.every((v,i)=>v===p[i]));

test('Current room rectangles and main bounds match the approved layout exactly',()=>{
  assert.deepEqual(gardenBounds,{x:608,z:544,thickness:8});
  for(const room of layout.rooms){
    const zone=roomZones.find(z=>z.name===room.name);assert.ok(zone,room.name);
    assert.deepEqual([zone.min[0],zone.min[2],zone.max[0]-zone.min[0],zone.max[2]-zone.min[2]],room.bounds);
    assert.equal(roomAt([room.bounds[0]+room.bounds[2]/2,room.floor*128,room.bounds[1]+room.bounds[3]/2]),room.name);
  }
  assert.equal(roomAt([-300,128,-200]),'主卧');
  assert.equal(roomAt([0,128,-200]),'书房');
});

test('lighting samples every house interior, both levels and stair void, and the preparation interior',()=>{
  for(const room of layout.rooms.filter(r=>['kitchen','dining','living','bathroom','storage','foyer','hall0','master','study','kids','guest','gallery','landing','hall1','prep'].includes(r.id))){
    assert.equal(sampleRoomPosition({x:room.bounds[0]+room.bounds[2]/2,y:room.floor*128,z:room.bounds[1]+room.bounds[3]/2}),true,room.name);
  }
  for(const y of [0,64,124,128,200])assert.equal(sampleRoomPosition({x:320,y,z:-200}),true,'stairs have a continuous indoor light volume');
  for(const point of [{x:360,y:128,z:364},{x:0,y:0,z:432},{x:520,y:0,z:0},{x:0,y:124,z:0},{x:0,y:248,z:0}])assert.equal(sampleRoomPosition(point),false);
});

test('explicit door and route vertices, both U flights, and the balcony are connected without unsupported nodes',()=>{
  const boxes=walkableFixture(),nav=createNavigation(boxes);assert.ok(nav.length);
  for(const door of layout.doors){assert.ok(at(nav,[door.center[0],door.floor*128,door.center[1]])>=0,door.id);}
  for(const route of layout.routes.filter(r=>r.room!=='prep'))for(const [x,z] of route.points){
    const floor=layout.rooms.find(r=>r.id===route.room)!.floor;
    assert.ok(at(nav,[x,floor*128,z])>=0,`${route.id} ${x},${z}`);
  }
  for(const p of [[320,0,-80],[320,64,-264],[400,64,-264],[400,128,-80]] as Vec3[])assert.ok(at(nav,p)>=0,'exact stair entries and middle turn');
  for(let i=1;i<=8;i++){
    assert.ok(nav.some(n=>n.position[0]===320&&n.position[1]===i*8&&n.position[2]>=-240&&n.position[2]<=-112),'lower flight');
    assert.ok(nav.some(n=>n.position[0]===400&&n.position[1]===64+i*8&&n.position[2]>=-240&&n.position[2]<=-112),'upper flight');
  }
  for(const node of nav){
    assert.ok(node.position[0]>=-608&&node.position[0]<=608&&node.position[2]>=-544&&node.position[2]<=544);
    assert.ok(!boxes.some(b=>intersects(node.position,b)),`node intersects a solid: ${node.position}`);
    for(const link of node.links)assert.ok(nav[link].links.includes(nav.indexOf(node)));
  }
  const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const link of nav[queue[i]].links)if(!visited.has(link)){visited.add(link);queue.push(link);}
  assert.equal(visited.size,nav.length);assert.ok(nav.some(n=>n.room==='阳台'));
  assert.deepEqual(createNavigation([]),[]);
});

test('navigation never crosses a real wall or unsupported upper-floor void',()=>{
  const wall:WorldBox={center:[0,64,0],size:[8,128,1088],kind:'wall',room:'barrier'};
  const nav=createNavigation([slab(-608,-544,1216,1088,0),slab(-448,-320,160,640,128),wall]);
  assert.ok(nav.length);const sign=Math.sign(nav[0].position[0]);
  assert.ok(nav.every(n=>Math.sign(n.position[0])===sign),'the spawn-connected side cannot teleport through a wall');
  assert.ok(nav.every(n=>n.position[1]===0),'an upper platform without a stair link is removed');
});

test('all declared furniture voids have a supported small-model destination and a verified entrance',()=>{
  const furniture=layout.furniture.filter(f=>f.hide),boxes=walkableFixture();
  for(const spec of furniture)boxes.push(...voxelCollisionBoxes(buildFurnitureAsset(spec),[spec.rect[0],spec.y,spec.rect[1]],'furniture',spec.room));
  const nav=createNavigation(boxes),hides=nav.filter(n=>n.hide);
  assert.ok(furniture.length>=20);assert.equal(hides.length,furniture.length);
  for(const node of nav.filter(n=>!n.smallOnly))assert.ok(!boxes.some(b=>intersects(node.position,b)),'public nodes have full actor clearance; short ingress nodes are explicitly small-only');
  for(const spec of furniture){
    const hidden=hides.find(n=>'furniture' in n&&n.furniture===spec.id);assert.ok(hidden,`${spec.id} hide is reachable`);
    assert.equal(hidden.position[1],spec.hide!.y);
    assert.ok(!boxes.some(b=>intersects(hidden.position,b,spec.hide!.maxModel+4,spec.hide!.maxModel/2+2)),`${spec.id} supports the maximum approved model with margin`);
    assert.ok(hidden.links.length);
  }
});

