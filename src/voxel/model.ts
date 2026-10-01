import * as THREE from 'three';
import type { VoxelModel, VoxelPart, Vec3, ModelBounds } from '../contracts.ts';
import { FACE_KEYS } from './surfaces.ts';

export const DEFAULT_COLOR = '#b6c793';
export const cellKey = (x:number,y:number,z:number) => `${x},${y},${z}`;
export const cloneModel = (model:VoxelModel):VoxelModel => structuredClone(model);
let serial = 0;
export const newPartId = () => `part-${Date.now().toString(36)}-${++serial}`;
export function partMatrix(part:VoxelPart):THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...part.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)),new THREE.Vector3(1,1,1));
}
export function createDefaultModel():VoxelModel {
  const model:VoxelModel={version:1,name:'我的伪装',pivot:[16,0,16],parts:[{id:newPartId(),name:'主体',cells:[],position:[0,0,0],rotation:[0,0,0]}]};
  for(let x=12;x<20;x++)for(let y=0;y<8;y++)for(let z=12;z<20;z++)model.parts[0].cells.push({x,y,z,color:DEFAULT_COLOR});
  return model;
}
export function modelVolume(model:VoxelModel):number {
  if(model.parts.length===1)return model.parts[0].cells.length;
  const occupied=new Set<string>(), v=new THREE.Vector3();
  for(const p of model.parts){const matrix=partMatrix(p);for(const c of p.cells){v.set(c.x+.5,c.y+.5,c.z+.5).applyMatrix4(matrix);occupied.add(cellKey(Math.floor(v.x+1e-7),Math.floor(v.y+1e-7),Math.floor(v.z+1e-7)));}}
  return occupied.size;
}
export function modelBounds(model:VoxelModel):ModelBounds {
  const box=new THREE.Box3(), point=new THREE.Vector3();
  for(const p of model.parts){const matrix=partMatrix(p);for(const c of p.cells)for(let i=0;i<8;i++)box.expandByPoint(point.set(c.x+(i&1),c.y+((i>>1)&1),c.z+((i>>2)&1)).applyMatrix4(matrix));}
  if(box.isEmpty())return {min:[0,0,0],max:[0,0,0]};
  box.translate(new THREE.Vector3(...model.pivot).negate());
  const tidy=(n:number)=>Math.abs(n-Math.round(n))<1e-8?Math.round(n):n;
  return {min:box.min.toArray().map(tidy) as Vec3,max:box.max.toArray().map(tidy) as Vec3};
}
export function validateModel(model:VoxelModel):{valid:boolean;reason?:string} {
  if(!model||![1,2].includes(model.version)||!Array.isArray(model.parts)||model.parts.length>64||!Array.isArray(model.pivot)||model.pivot.length!==3||model.pivot.some(n=>!Number.isFinite(n)))return {valid:false,reason:'模型数据无效'};
  let count=0; const ids=new Set<string>();
  for(const p of model.parts){
    if(!p||!Array.isArray(p.cells)||!Array.isArray(p.position)||p.position.length!==3||!Array.isArray(p.rotation)||p.rotation.length!==3||[...p.position,...p.rotation].some(n=>!Number.isFinite(n))||ids.has(p.id))return {valid:false,reason:'分件数据无效'};
    ids.add(p.id); const keys=new Set<string>();
    for(const c of p.cells){if(!c||![c.x,c.y,c.z].every(n=>Number.isInteger(n)&&n>=0&&n<32)||!/^#[\da-f]{6}$/i.test(c.color))return {valid:false,reason:'体素必须位于 32 × 32 × 32 格内'};
      if(c.faceColors&&(typeof c.faceColors!=='object'||Array.isArray(c.faceColors)||Object.entries(c.faceColors).some(([face,color])=>!FACE_KEYS.includes(face as typeof FACE_KEYS[number])||!/^#[\da-f]{6}$/i.test(color))))return {valid:false,reason:'体素面颜色数据无效'};
      const key=cellKey(c.x,c.y,c.z);if(keys.has(key))return {valid:false,reason:'分件内有重复体素'};keys.add(key);count++;}
  }
  if(!count)return {valid:false,reason:'至少保留一个体素'};
  if(count>32768)return {valid:false,reason:'模型最多包含 32³ 个体素'};
  const b=modelBounds(model);
  for(let i=0;i<3;i++){
    if(b.min[i]+model.pivot[i]<-1e-5||b.max[i]+model.pivot[i]>32+1e-5)return {valid:false,reason:'操作超出 32 × 32 × 32 建模范围'};
    const margin=Math.max(2,(b.max[i]-b.min[i])*.25);
    if(b.min[i]>margin||b.max[i]<-margin)return {valid:false,reason:'Pivot 必须靠近模型的可见部分'};
  }
  return {valid:true};
}
export function createPresetModel(kind:string):VoxelModel {
  const model=createDefaultModel(),p=model.parts[0];p.cells=[];const cells=new Map<string,typeof p.cells[number]>();
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>{for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++)for(let c=z;c<z+d;c++)cells.set(cellKey(a,b,c),{x:a,y:b,z:c,color});};
  const names:Record<string,string>={plant:'窗边绿植',book:'复古书册',crate:'木制收纳箱',lamp:'蘑菇台灯',cup:'陶瓷马克杯',chair:'橡木餐椅'};model.name=names[kind]??'基础方块';p.name=model.name;
  if(kind==='plant'){
    box(11,0,11,10,2,10,'#976a52');box(12,2,12,8,7,8,'#bb8061');box(11,8,11,10,2,10,'#d29573');box(12,10,12,8,1,8,'#645640');box(15,10,15,2,12,2,'#56724a');
    box(9,15,13,7,3,5,'#638750');box(16,19,12,8,3,6,'#789a60');box(11,23,13,8,3,6,'#88a970');box(14,26,14,4,3,4,'#648b51');
  }else if(kind==='book'){
    box(8,0,12,16,2,9,'#8f5962');box(9,2,13,14,3,7,'#e6dac0');box(8,5,12,16,1,9,'#ac6670');box(8,1,12,2,4,9,'#8f5962');box(12,6,13,10,1,7,'#748a96');
  }else if(kind==='crate'){
    box(6,0,6,20,2,20,'#927457');box(6,2,6,20,12,2,'#b18e67');box(6,2,24,20,12,2,'#b18e67');box(6,2,8,2,12,16,'#b18e67');box(24,2,8,2,12,16,'#b18e67');box(6,14,6,20,2,20,'#c7a279');
    for(const y of [4,9]){box(6,y,5,20,1,1,'#82674d');box(6,y,26,20,1,1,'#82674d');}for(const x of [8,22]){box(x,0,5,2,16,1,'#795f47');box(x,0,26,2,16,1,'#795f47');}
  }else if(kind==='lamp'){
    box(10,0,10,12,2,12,'#849176');box(14,2,14,4,15,4,'#b09b76');box(8,17,8,16,3,16,'#ded1a0');box(6,20,6,20,3,20,'#eee0ba');box(8,23,8,16,3,16,'#f4e9ce');box(11,26,11,10,2,10,'#e4d7b3');
  }else if(kind==='cup'){
    box(10,0,10,12,2,12,'#d5d8c6');box(10,2,10,12,11,2,'#e3e6d4');box(10,2,20,12,11,2,'#e3e6d4');box(10,2,12,2,11,8,'#e3e6d4');box(20,2,12,2,11,8,'#e3e6d4');box(22,3,14,5,2,4,'#c9d2bf');box(22,10,14,5,2,4,'#c9d2bf');box(25,5,14,2,5,4,'#c9d2bf');box(12,7,12,8,1,8,'#78523a');
  }else if(kind==='chair'){
    for(const x of [7,22])for(const z of [7,22])box(x,0,z,3,18,3,'#a58662');box(6,18,6,20,3,20,'#b99b71');box(7,21,22,3,10,3,'#9b805e');box(22,21,22,3,10,3,'#9b805e');box(7,27,22,18,4,3,'#c3a77d');
  }else return createDefaultModel();
  p.cells=[...cells.values()];return model;
}
