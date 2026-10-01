import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout,type DesignFurniture} from '../src/world/design-layout.ts';
import {buildFurnitureAsset} from '../src/world/voxel-furniture.ts';
import type {VoxelAsset} from '../src/world/voxel-asset.ts';
const cell=(a:VoxelAsset,x:number,y:number,z:number)=>a.cells[(z*a.size[1]+y)*a.size[0]+x];
const base={...layout.furniture.find(f=>f.id==='O07')!,supports:[],hide:undefined};

test('a pergola provides an open tall shelter with connected posts and separated roof slats',()=>{
  const a=buildFurnitureAsset({...base,kind:'pergola',rect:[0,0,176,128],height:112} as DesignFurniture);
  for(const x of [2,173])for(const z of [2,125])assert.ok(cell(a,x,80,z),'corner post joins the overhead beam');
  assert.equal(cell(a,88,20,64),0,'no solid plinth or invisible full footprint collision');
  assert.equal(cell(a,88,80,64),0,'room for hunters below the overhead structure');
  assert.ok(cell(a,88,106,18),'slats make a real roof silhouette');
  assert.equal(cell(a,88,106,26),0,'air gaps between roof slats preserve patterned light');
});

test('a small playground has a raised play deck, climbable ladder and stepped slide reaching the ground',()=>{
  const a=buildFurnitureAsset({...base,kind:'playground',rect:[0,0,112,64],height:80} as DesignFurniture);
  assert.ok(cell(a,44,46,40),'play deck supports the climber');
  assert.equal(cell(a,44,20,40),0,'open under the deck');
  assert.ok(cell(a,109,2,36),'slide lands at ground height');
  assert.ok(cell(a,68,42,36),'slide joins the upper deck');
  assert.equal(cell(a,4,12,4),0,'northwest ground is clear at the adjacent bench entrance');
});

test('long narrow outdoor flower beds distribute stepped plants along their length and contain restrained flower colors',()=>{
  const a=buildFurnitureAsset({...base,kind:'planter',rect:[0,0,32,128],height:40,color:'#759560'});
  for(const z of [16,48,80,112])assert.ok(cell(a,16,22,z),'each part of the long bed has a planted stem');
  assert.ok(a.palette.includes('#d86a68')&&a.palette.includes('#c386b0'),'a few flowers have colored petals');
  assert.equal(cell(a,1,30,16),0,'leaves remain inset from the raised bed border');
});
