import type { Vec3, VoxelCell, VoxelFace, VoxelModel, VoxelPart } from '../contracts.ts';

export const FACE_NORMALS:Record<VoxelFace,Vec3>={px:[1,0,0],nx:[-1,0,0],py:[0,1,0],ny:[0,-1,0],pz:[0,0,1],nz:[0,0,-1]};
export const FACE_KEYS=Object.keys(FACE_NORMALS) as VoxelFace[];
const key=(c:{x:number;y:number;z:number})=>`${c.x},${c.y},${c.z}`;
export const faceColor=(cell:VoxelCell,face:VoxelFace):string=>cell.faceColors?.[face]??cell.color;
export function normalFace(normal:{x:number;y:number;z:number}):VoxelFace{
  const a=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)],axis=a.indexOf(Math.max(...a));
  return axis===0?(normal.x>=0?'px':'nx'):axis===1?(normal.y>=0?'py':'ny'):(normal.z>=0?'pz':'nz');
}
export function setFaceColor(cell:VoxelCell,face:VoxelFace,color:string):void{
  if(color===cell.color){if(cell.faceColors){delete cell.faceColors[face];if(!Object.keys(cell.faceColors).length)delete cell.faceColors;}}
  else cell.faceColors={...cell.faceColors,[face]:color};
}
/** A brush covers exposed cells on the picked plane, never volume or rear faces. */
export function surfaceCells(part:VoxelPart,start:Vec3,face:VoxelFace,size=1):VoxelCell[]{
  const n=FACE_NORMALS[face],axis=n.findIndex(v=>v!==0),radius=Math.floor(size/2),occupied=new Set(part.cells.map(key));
  return part.cells.filter(c=>{
    const p=[c.x,c.y,c.z];return p[axis]===start[axis]&&p.every((v,i)=>i===axis||Math.abs(v-start[i])<=radius)&&!occupied.has(`${c.x+n[0]},${c.y+n[1]},${c.z+n[2]}`);
  });
}
export function paintSurface(model:VoxelModel,partId:string,start:Vec3,face:VoxelFace,color:string|null,size=1,visible?:(cell:VoxelCell)=>boolean):void{
  const p=model.parts.find(p=>p.id===partId);if(!p)return;
  for(const cell of surfaceCells(p,start,face,size))if(!visible||visible(cell)){setFaceColor(cell,face,color??cell.color);model.version=2;}
}
/** Fill the connected, coplanar surface selected by the hit normal. */
export function floodSurface(model:VoxelModel,partId:string,start:Vec3,face:VoxelFace,color:string|null,visible?:(cell:VoxelCell)=>boolean):void{
  const p=model.parts.find(p=>p.id===partId);if(!p)return;
  const cells=new Map(surfaceCells(p,start,face,65).filter(c=>!visible||visible(c)).map(c=>[key(c),c])),root=cells.get(start.join(','));if(!root)return;
  const source=faceColor(root,face);if(source===color)return;
  const axis=FACE_NORMALS[face].findIndex(v=>v!==0),queue=[root],seen=new Set([key(root)]);
  for(let i=0;i<queue.length;i++){const cell=queue[i];setFaceColor(cell,face,color??cell.color);for(let a=0;a<3;a++)if(a!==axis)for(const d of [-1,1]){const p=[cell.x,cell.y,cell.z];p[a]+=d;const k=p.join(','),next=cells.get(k);if(next&&!seen.has(k)&&faceColor(next,face)===source){seen.add(k);queue.push(next);}}}
  model.version=2;
}
