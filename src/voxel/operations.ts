import * as THREE from 'three';
import type { VoxelModel, Vec3, VoxelCell } from '../contracts.ts';
import { cellKey, cloneModel, DEFAULT_COLOR, newPartId, partMatrix, validateModel } from './model.ts';
import { faceColor, FACE_KEYS, FACE_NORMALS, normalFace } from './surfaces.ts';

export function volumeRange(a:Vec3,b:Vec3):{min:Vec3;max:Vec3}{return {min:a.map((v,i)=>Math.min(v,b[i])) as Vec3,max:a.map((v,i)=>Math.max(v,b[i])) as Vec3};}
export function inside(c:{x:number;y:number;z:number},a:Vec3,b:Vec3):boolean{const {min,max}=volumeRange(a,b);return c.x>=min[0]&&c.x<=max[0]&&c.y>=min[1]&&c.y<=max[1]&&c.z>=min[2]&&c.z<=max[2];}
export function editVolume(model:VoxelModel,partId:string,a:Vec3,b:Vec3,mode:'add'|'remove'|'paint',color=DEFAULT_COLOR):void {
  const p=model.parts.find(p=>p.id===partId);if(!p)return;
  if(mode==='remove'){p.cells=p.cells.filter(c=>!inside(c,a,b));return;}
  if(mode==='paint'){for(const c of p.cells)if(inside(c,a,b))c.color=color;return;}
  const {min,max}=volumeRange(a,b), cells=new Map(p.cells.map(c=>[cellKey(c.x,c.y,c.z),c]));
  for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++)if(!cells.has(cellKey(x,y,z)))cells.set(cellKey(x,y,z),{x,y,z,color});
  p.cells=[...cells.values()];
}
export function floodFill(model:VoxelModel,partId:string,start:Vec3,color:string):void {
  const p=model.parts.find(p=>p.id===partId);if(!p)return;const cells=new Map(p.cells.map(c=>[cellKey(c.x,c.y,c.z),c]));const root=cells.get(cellKey(...start));if(!root||root.color===color)return;
  const original=root.color,queue=[root];root.color=color;
  for(let i=0;i<queue.length;i++){const c=queue[i];for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const n=cells.get(cellKey(c.x+x,c.y+y,c.z+z));if(n&&n.color===original){n.color=color;queue.push(n);}}}
}
type Check={valid:boolean;reason?:string};
export class ModelHistory {
  model:VoxelModel;private past:VoxelModel[]=[];private future:VoxelModel[]=[];private validate:(candidate:VoxelModel,previous:VoxelModel)=>Check;
  constructor(model:VoxelModel,validate:(candidate:VoxelModel,previous:VoxelModel)=>Check){this.model=cloneModel(model);this.validate=validate;}
  get canUndo(){return this.past.length>0;} get canRedo(){return this.future.length>0;}
  private check(candidate:VoxelModel):Check{const check=validateModel(candidate);return check.valid?this.validate(candidate,this.model):check;}
  commit(candidate:VoxelModel):Check {const result=this.check(candidate);if(!result.valid)return result;if(JSON.stringify(candidate)===JSON.stringify(this.model))return result;this.past.push(cloneModel(this.model));if(this.past.length>50)this.past.shift();this.future=[];this.model=cloneModel(candidate);return result;}
  undo():Check {const candidate=this.past.at(-1);if(!candidate)return {valid:false,reason:'没有可撤销的操作'};const result=this.check(candidate);if(!result.valid)return result;this.future.push(cloneModel(this.model));this.model=this.past.pop()!;return result;}
  redo():Check {const candidate=this.future.at(-1);if(!candidate)return {valid:false,reason:'没有可重做的操作'};const result=this.check(candidate);if(!result.valid)return result;this.past.push(cloneModel(this.model));this.model=this.future.pop()!;return result;}
}
export function splitSelection(model:VoxelModel,partId:string,a:Vec3,b:Vec3):string|null {
  const p=model.parts.find(p=>p.id===partId);if(!p)return null;const selected=p.cells.filter(c=>inside(c,a,b));if(!selected.length)return null;
  if(selected.length===p.cells.length)return p.id;
  p.cells=p.cells.filter(c=>!inside(c,a,b));const id=newPartId();model.parts.push({id,name:`分件 ${model.parts.length+1}`,cells:selected,position:[...p.position],rotation:[...p.rotation]});return id;
}
export function duplicateSelection(model:VoxelModel,partId:string,a:Vec3,b:Vec3):string|null{
  const p=model.parts.find(p=>p.id===partId);if(!p)return null;const cells=p.cells.filter(c=>inside(c,a,b)).map(c=>structuredClone(c));if(!cells.length)return null;
  const id=newPartId();model.parts.push({id,name:`${p.name} 副本`,cells,position:[p.position[0]+1,p.position[1]+1,p.position[2]+1],rotation:[...p.rotation]});return id;
}
// Parts use T(position) × R(Euler XYZ), with integer voxel coordinates before the transform.
// Rotation adjusts the translation so the chosen part's visible center stays fixed.
export function transformPart(model:VoxelModel,partId:string,mode:'move'|'rotate'|'mirror',axis:'x'|'y'|'z',amount:number):void {
  const p=model.parts.find(p=>p.id===partId);if(!p||!p.cells.length)return;const ai={x:0,y:1,z:2}[axis];
  if(mode==='move'){p.position[ai]+=amount;return;}
  const box=new THREE.Box3();for(const c of p.cells){box.expandByPoint(new THREE.Vector3(c.x,c.y,c.z));box.expandByPoint(new THREE.Vector3(c.x+1,c.y+1,c.z+1));}const center=box.getCenter(new THREE.Vector3());
  if(mode==='mirror'){const sum=box.min.getComponent(ai)+box.max.getComponent(ai)-1;for(const c of p.cells){c[axis]=Math.round(sum-c[axis]);if(c.faceColors){const positive=FACE_KEYS[ai*2],negative=FACE_KEYS[ai*2+1],[a,b]=[c.faceColors[positive],c.faceColors[negative]];delete c.faceColors[positive];delete c.faceColors[negative];if(a)c.faceColors[negative]=a;if(b)c.faceColors[positive]=b;}}return;}
  const before=center.clone().applyMatrix4(partMatrix(p));const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation));const spin=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),amount);q.premultiply(spin);const euler=new THREE.Euler().setFromQuaternion(q);p.rotation=[euler.x,euler.y,euler.z];
  p.position=before.sub(center.applyQuaternion(q)).toArray() as Vec3;
}
export function mergeParts(model:VoxelModel):void {
  if(model.parts.length<2)return;const cells=new Map<string,VoxelCell>();const v=new THREE.Vector3();
  // Inverse sample each world grid center; forward rounding individual centers leaves holes at free angles.
  for(const p of model.parts){const matrix=partMatrix(p),inverse=matrix.clone().invert(),box=new THREE.Box3(),source=new Map(p.cells.map(c=>[cellKey(c.x,c.y,c.z),c]));for(const c of p.cells)for(let i=0;i<8;i++)box.expandByPoint(v.set(c.x+(i&1),c.y+((i>>1)&1),c.z+((i>>2)&1)).applyMatrix4(matrix));
    for(let x=Math.max(0,Math.floor(box.min.x));x<Math.min(32,Math.ceil(box.max.x));x++)for(let y=Math.max(0,Math.floor(box.min.y));y<Math.min(32,Math.ceil(box.max.y));y++)for(let z=Math.max(0,Math.floor(box.min.z));z<Math.min(32,Math.ceil(box.max.z));z++){
      v.set(x+.5,y+.5,z+.5).applyMatrix4(inverse);const c=source.get(cellKey(Math.floor(v.x+1e-7),Math.floor(v.y+1e-7),Math.floor(v.z+1e-7)));if(c){const baked:VoxelCell={x,y,z,color:c.color};if(c.faceColors){baked.faceColors={};for(const face of FACE_KEYS){const localFace=normalFace(new THREE.Vector3(...FACE_NORMALS[face]).transformDirection(inverse));const color=faceColor(c,localFace);if(color!==c.color)baked.faceColors[face]=color;}}cells.set(cellKey(x,y,z),baked);}
    }
  }
  model.parts=[{id:newPartId(),name:'合并主体',cells:[...cells.values()],position:[0,0,0],rotation:[0,0,0]}];
}
export function snapPart(model:VoxelModel,partId:string,kind:'grid'|'surface'|'part'|'angle',threshold=Infinity):void{
  const p=model.parts.find(p=>p.id===partId);if(!p)return;
  if(kind==='grid'){p.position=p.position.map(Math.round) as Vec3;return;}
  if(kind==='angle'){for(const axis of ['x','y','z'] as const){const n={x:0,y:1,z:2}[axis];transformPart(model,p.id,'rotate',axis,Math.round(p.rotation[n]/(Math.PI/12))*Math.PI/12-p.rotation[n]);}return;}
  const boxOf=(part:typeof p)=>{const box=new THREE.Box3(),mat=partMatrix(part!);for(const c of part!.cells)for(let i=0;i<8;i++)box.expandByPoint(new THREE.Vector3(c.x+(i&1),c.y+((i>>1)&1),c.z+((i>>2)&1)).applyMatrix4(mat));return box;};const box=boxOf(p);
  if(kind==='surface'){if(Math.abs(box.min.y)<=threshold)p.position[1]-=box.min.y;return;}
  let best=Infinity,bestAxis=0,bestDelta=0;
  for(const other of model.parts){if(other===p||!other.cells.length)continue;const b=boxOf(other);for(let axis=0;axis<3;axis++){if([0,1,2].some(i=>i!==axis&&(box.max.getComponent(i)<=b.min.getComponent(i)||box.min.getComponent(i)>=b.max.getComponent(i))))continue;for(const delta of [b.min.getComponent(axis)-box.max.getComponent(axis),b.max.getComponent(axis)-box.min.getComponent(axis)])if(Math.abs(delta)<=threshold&&Math.abs(delta)<Math.abs(best)){best=delta;bestAxis=axis;bestDelta=delta;}}}
  if(Number.isFinite(best))p.position[bestAxis]+=bestDelta;
}
/** Called during ordinary transforms. Shift deliberately bypasses snapping. */
export function autoSnapPart(model:VoxelModel,partId:string,mode:'move'|'rotate'):void{
  if(mode==='rotate'){snapPart(model,partId,'angle');return;}
  snapPart(model,partId,'grid');snapPart(model,partId,'surface',.35);snapPart(model,partId,'part',.35);
}
