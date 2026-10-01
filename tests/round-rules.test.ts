import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ModelBounds,Phase,Vec3} from '../src/contracts.ts';
import {canTauntPhase,needsPreparationReturn,PREPARATION_ROOM} from '../src/rules.ts';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';

const hunterBounds:ModelBounds={min:[-9,0,-7],max:[9,48,7]};

test('only an active hunt allows forced calls; practice allows voluntary audition only',()=>{
 const phases:Phase[]=['menu','practice','preparation','hunt','reveal','sessionEnd'];
 for(const phase of phases){
  assert.equal(canTauntPhase(phase,false),phase==='hunt'||phase==='practice',`${phase}: voluntary`);
  assert.equal(canTauntPhase(phase,true),phase==='hunt',`${phase}: forced`);
 }
});

test('preparation bounds match the inner faces of the real waiting-room walls',()=>{
 const world=createWorld();
 try{
  const room=layout.rooms.find(room=>room.id==='prep')!;
  const walls=world.colliders.filter(box=>box.kind==='wall'&&box.room===room.name&&box.size[1]===layout.boundaries.preparationRoofY);
  const xWalls=walls.filter(box=>box.size[0]<box.size[2]).sort((a,b)=>a.center[0]-b.center[0]);
  const zWalls=walls.filter(box=>box.size[2]<box.size[0]).sort((a,b)=>a.center[2]-b.center[2]);
  assert.equal(xWalls.length,2);assert.equal(zWalls.length,2);
  assert.equal(PREPARATION_ROOM.minX,xWalls[0].center[0]+xWalls[0].size[0]/2);
  assert.equal(PREPARATION_ROOM.maxX,xWalls[1].center[0]-xWalls[1].size[0]/2);
  assert.equal(PREPARATION_ROOM.minZ,zWalls[0].center[2]+zWalls[0].size[2]/2);
  assert.equal(PREPARATION_ROOM.maxZ,zWalls[1].center[2]-zWalls[1].size[2]/2);
  const roof=world.colliders.find(box=>box.kind==='boundary'&&box.room===room.name&&box.center[1]-box.size[1]/2===layout.boundaries.preparationRoofY);
  assert.ok(roof,'The formal preparation scene has a real physical roof');
  assert.equal(PREPARATION_ROOM.maxY,roof.center[1]-roof.size[1]/2);
 }finally{world.dispose()}
});

test('whole hunter body must remain inside every wall and below the formal roof',()=>{
 const safe:Vec3[]=[[729,.12,0],[935,.12,0],[832,.12,-89],[832,.12,89],[832,80,0]];
 for(const position of safe)assert.equal(needsPreparationReturn('preparation','hunter',position,hunterBounds,0),false);
 const escaped:Vec3[]=[[728.9,.12,0],[935.1,.12,0],[832,.12,-89.1],[832,.12,89.1],[832,80.1,0],[0,.12,175]];
 for(const position of escaped)assert.equal(needsPreparationReturn('preparation','hunter',position,hunterBounds,0),true,position.join(','));
});

test('containment uses rotated full bounds, including an off-center model pivot',()=>{
 assert.equal(needsPreparationReturn('preparation','hunter',[730,.12,0],hunterBounds,0),false);
 assert.equal(needsPreparationReturn('preparation','hunter',[730,.12,0],hunterBounds,Math.PI/4),true);
 assert.equal(needsPreparationReturn('preparation','hunter',[832,.12,87],hunterBounds,Math.PI/2),false);
 assert.equal(needsPreparationReturn('preparation','hunter',[832,.12,87.1],hunterBounds,Math.PI/2),true);
 const offset:ModelBounds={min:[0,0,0],max:[10,48,20]};
 assert.equal(needsPreparationReturn('preparation','hunter',[929,.12,0],offset,0),false);
 assert.equal(needsPreparationReturn('preparation','hunter',[929,.12,0],offset,Math.PI/2),true);
});

test('preparation confinement never restricts hiders or released hunters',()=>{
 const outside:Vec3=[0,.12,175];
 assert.equal(needsPreparationReturn('preparation','hider',outside,hunterBounds,0),false);
 for(const phase of ['menu','practice','hunt','reveal','sessionEnd'] as Phase[])
  assert.equal(needsPreparationReturn(phase,'hunter',outside,hunterBounds,0),false,phase);
});
