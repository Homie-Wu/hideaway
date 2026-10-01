import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout} from '../src/world/design-layout.ts';
import {buildFurnitureAsset} from '../src/world/voxel-furniture.ts';
import type {VoxelAsset} from '../src/world/voxel-asset.ts';
const cell=(a:VoxelAsset,x:number,y:number,z:number)=>a.cells[(z*a.size[1]+y)*a.size[0]+x];

test('adult beds have a low sleeping surface with a small accessible void, not forty-unit stilts',()=>{
  for(const id of ['M01','G01']){
    const spec=layout.furniture.find(f=>f.id===id)!,a=buildFurnitureAsset(spec),[w,,d]=a.size;
    assert.ok(cell(a,w/2,25,d/2),`${id}: mattress starts below hunter waist height`);
    assert.ok(!cell(a,w/2,45,d/2),`${id}: duvet top remains below forty-five`);
    assert.ok(spec.hide!.clearHeight<=20&&spec.hide!.maxModel<=16,'under-bed access matches the actual low frame');
    assert.ok(!cell(a,w/2,10,d/2),'under-bed void stays open for small disguises');
  }
});

test('the car bed has a grounded body physically joining all four tires and a low mattress',()=>{
  const a=buildFurnitureAsset(layout.furniture.find(f=>f.id==='C01')!),[w,,d]=a.size;
  for(const x of [3,w-4])for(const z of [14,d-15]){
    assert.ok(cell(a,x,10,z),'tires reach the ground');
    assert.ok(cell(a,x,22,z),'tires join the body at axle height');
    assert.ok(cell(a,x+ (x===3?4:-4),22,z),'body extends inward from the tire, without a hanging gap');
  }
  assert.ok(cell(a,w/2,25,d/2),'low mattress sits in the car body');
  assert.equal(cell(a,w/2,45,d/2),0,'car is not a raised bunk on four thin posts');
});
