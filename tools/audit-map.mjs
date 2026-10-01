import fs from 'node:fs';
import * as THREE from 'three';
import {layout} from '../src/world/design-layout.ts';
import {designArchitecture} from '../src/world/design-architecture.ts';
import {buildFurnitureAsset} from '../src/world/voxel-furniture.ts';
import {voxelCollisionBoxes} from '../src/world/voxel-asset.ts';
import {VoxelScene} from '../src/world/voxel-scene.ts';
import {placementProblem} from '../src/world/prop-placement.ts';

const overlap=(a,b)=>a.center.every((n,i)=>Math.abs(n-b.center[i])<(a.size[i]+b.size[i])/2-.001);
const architecture=new VoxelScene();designArchitecture(architecture,new THREE.Group());
const rows=layout.furniture.map(f=>({id:f.id,spec:f,boxes:voxelCollisionBoxes(buildFurnitureAsset(f),[f.rect[0],f.y,f.rect[1]],'furniture',f.room)}));
const fixed=[...architecture.boxes,...rows.flatMap(r=>r.boxes)],failures=[];
const supports=layout.furniture.flatMap(f=>f.supports);
const props=layout.props.map(p=>({id:p.id,room:p.room,origin:[p.rect[0],p.y,p.rect[1]],size:[p.rect[2],p.height,p.rect[3]],kind:'prop'}));
for(const [i,p] of props.entries()){
  const reason=placementProblem(p,supports.find(s=>s.id===layout.props[i].support),fixed,props);
  if(reason)failures.push({id:p.id,name:layout.props[i].name,reason});
}
for(const [i,row] of rows.entries()){
  if(row.boxes.some(b=>architecture.boxes.some(a=>overlap(a,b))))failures.push({id:row.id,reason:'家具实体撞入建筑'});
  for(const other of rows.slice(i+1))if(row.boxes.some(b=>other.boxes.some(a=>overlap(a,b))))failures.push({id:row.id,other:other.id,reason:'家具实体互相交叉'});
  const clear=row.spec.useClearance;
  if(clear){
    const [x,z,w,d]=clear.rect,region={center:[x+w/2,clear.y+clear.height/2,z+d/2],size:[w,clear.height,d]};
    const blockers=[...rows.filter(r=>r!==row).flatMap(r=>r.boxes.map(b=>({id:r.id,box:b}))),...props.map(p=>({id:p.id,box:{center:p.origin.map((n,i)=>n+p.size[i]/2),size:p.size}}))].filter(r=>overlap(region,r.box));
    if(blockers.length)failures.push({id:row.id,reason:`${clear.purpose}被占用`,blockers:[...new Set(blockers.map(r=>r.id))]});
  }
}
const report={layoutId:layout.meta.id,furniture:rows.length,props:props.length,checkedOperationZones:rows.filter(r=>r.spec.useClearance).length,failures};
fs.mkdirSync('.artifacts',{recursive:true});fs.writeFileSync('.artifacts/scene-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=failures.length?1:0;

