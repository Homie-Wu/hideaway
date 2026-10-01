import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {layout} from '../src/world/design-layout.ts';
import {designArchitecture} from '../src/world/design-architecture.ts';
import {buildFurnitureAsset} from '../src/world/voxel-furniture.ts';
import {voxelCollisionBoxes} from '../src/world/voxel-asset.ts';
import {VoxelScene} from '../src/world/voxel-scene.ts';
import {placementProblem} from '../src/world/prop-placement.ts';
import type {Vec3,WorldBox} from '../src/contracts.ts';
const overlap=(a:Pick<WorldBox,'center'|'size'>,b:Pick<WorldBox,'center'|'size'>)=>a.center.every((n,i)=>Math.abs(n-b.center[i])<(a.size[i]+b.size[i])/2-.001);

test('actual scene solids never intersect architecture or each other, and real service areas remain usable',()=>{
  const architecture=new VoxelScene();designArchitecture(architecture,new THREE.Group());
  const furniture=layout.furniture.map(f=>({spec:f,boxes:voxelCollisionBoxes(buildFurnitureAsset(f),[f.rect[0],f.y,f.rect[1]],'furniture',f.room)}));
  const fixed=[...architecture.boxes,...furniture.flatMap(r=>r.boxes)],supports=layout.furniture.flatMap(f=>f.supports),failures:string[]=[];
  const props=layout.props.map(p=>({id:p.id,room:p.room,origin:[p.rect[0],p.y,p.rect[1]] as Vec3,size:[p.rect[2],p.height,p.rect[3]] as Vec3,kind:'prop' as const}));
  for(const [i,p] of props.entries()){
    const reason=placementProblem(p,supports.find(s=>s.id===layout.props[i].support),fixed,props);
    if(reason)failures.push(`${p.id}: ${reason}`);
  }
  for(const [i,row] of furniture.entries()){
    if(row.boxes.some(b=>architecture.boxes.some(a=>overlap(a,b))))failures.push(`${row.spec.id}: intersects actual architecture`);
    for(const other of furniture.slice(i+1))if(row.boxes.some(b=>other.boxes.some(a=>overlap(a,b))))failures.push(`${row.spec.id}/${other.spec.id}: solids overlap`);
    const clear=row.spec.useClearance;
    if(!clear)continue;
    const [x,z,w,d]=clear.rect,region={center:[x+w/2,clear.y+clear.height/2,z+d/2] as Vec3,size:[w,clear.height,d] as Vec3};
    for(const other of furniture)if(other!==row&&other.boxes.some(b=>overlap(region,b)))failures.push(`${row.spec.id}: ${clear.purpose} blocked by ${other.spec.id}`);
    for(const p of props)if(overlap(region,{center:p.origin.map((n,i)=>n+p.size[i]/2) as Vec3,size:p.size}))failures.push(`${row.spec.id}: ${clear.purpose} blocked by ${p.id}`);
  }
  assert.deepEqual(failures,[]);
});
