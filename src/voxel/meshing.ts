import * as THREE from 'three';
import type { VoxelModel, VoxelPart, VoxelCell } from '../contracts.ts';
import { cellKey } from './model.ts';
import { faceColor, FACE_KEYS } from './surfaces.ts';

const faces=[
  {normal:[1,0,0],corners:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],shade:.91},
  {normal:[-1,0,0],corners:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],shade:.8},
  {normal:[0,1,0],corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],shade:1},
  {normal:[0,-1,0],corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],shade:.65},
  {normal:[0,0,1],corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],shade:.88},
  {normal:[0,0,-1],corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],shade:.78},
];
/** Surface-only geometry; occupancy includes adjacent chunks, so seams stay closed. */
export function buildPartGeometry(part:VoxelPart,cells=part.cells,occupied=new Set(part.cells.map(c=>cellKey(c.x,c.y,c.z)))):THREE.BufferGeometry {
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],color=new THREE.Color();
  for(const c of cells){for(const [index,face] of faces.entries()){const [nx,ny,nz]=face.normal;if(occupied.has(cellKey(c.x+nx,c.y+ny,c.z+nz)))continue;color.set(faceColor(c,FACE_KEYS[index]));
    for(const i of [0,1,2,0,2,3]){const v=face.corners[i];positions.push(c.x+v[0],c.y+v[1],c.z+v[2]);normals.push(nx,ny,nz);colors.push(color.r*face.shade,color.g*face.shade,color.b*face.shade);}
  }}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
interface PartView {cells:Map<string,VoxelCell>;chunks:Map<string,THREE.Mesh>}
interface ViewState { material:THREE.MeshStandardMaterial; parts:Map<string,PartView>; }
// Offset X/Z boundaries to keep the starter 8³ model in one draw call.
const chunkKey=(x:number,y:number,z:number)=>`${Math.floor((x+4)/8)},${Math.floor(y/8)},${Math.floor((z+4)/8)}`;
export function createModelView(model:VoxelModel):THREE.Group {
  const group=new THREE.Group();group.name='voxel-model';group.userData.voxelState={material:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0}),parts:new Map()} satisfies ViewState;updateModelView(group,model);return group;
}
export function updateModelView(group:THREE.Group,model:VoxelModel):void {
  const state=group.userData.voxelState as ViewState;if(!state)throw new Error('Not a voxel model view');const ids=new Set<string>();
  for(const part of model.parts){ids.add(part.id);let entry=state.parts.get(part.id);
    if(!entry){entry={cells:new Map(),chunks:new Map()};state.parts.set(part.id,entry);}
    const current=new Map(part.cells.map(c=>[cellKey(c.x,c.y,c.z),c])),dirty=new Set<string>(),chunks=new Map<string,VoxelCell[]>();
    const changed=(c:VoxelCell,shape:boolean)=>{dirty.add(chunkKey(c.x,c.y,c.z));if(shape)for(const f of faces)dirty.add(chunkKey(c.x+f.normal[0],c.y+f.normal[1],c.z+f.normal[2]));};
    for(const c of part.cells){const key=cellKey(c.x,c.y,c.z),old=entry.cells.get(key),chunk=chunkKey(c.x,c.y,c.z);if(!old||old.color!==c.color||FACE_KEYS.some(face=>faceColor(old,face)!==faceColor(c,face)))changed(c,!old);let list=chunks.get(chunk);if(!list){list=[];chunks.set(chunk,list)}list.push(c);}
    for(const [key,c] of entry.cells)if(!current.has(key))changed(c,true);
    const occupied=new Set(current.keys());
    for(const chunk of dirty){let mesh=entry.chunks.get(chunk);const cells=chunks.get(chunk);if(!cells){if(mesh){mesh.geometry.dispose();group.remove(mesh);entry.chunks.delete(chunk)}continue;}
      const geometry=buildPartGeometry(part,cells,occupied);
      if(mesh){mesh.geometry.dispose();mesh.geometry=geometry;}else{mesh=new THREE.Mesh(geometry,state.material);mesh.userData.partId=part.id;mesh.userData.chunk=chunk;mesh.castShadow=true;mesh.receiveShadow=true;entry.chunks.set(chunk,mesh);group.add(mesh);}
    }
    for(const mesh of entry.chunks.values()){mesh.name=part.name;mesh.position.set(part.position[0]-model.pivot[0],part.position[1]-model.pivot[1],part.position[2]-model.pivot[2]);mesh.rotation.set(...part.rotation);}
    entry.cells=new Map([...current].map(([key,c])=>[key,structuredClone(c)]));
  }
  for(const [id,entry] of state.parts)if(!ids.has(id)){for(const mesh of entry.chunks.values()){group.remove(mesh);mesh.geometry.dispose();}state.parts.delete(id);}
  group.updateMatrixWorld(true);
}
export function disposeModelView(group:THREE.Group):void {
  const state=group.userData.voxelState as ViewState|undefined;if(!state)return;
  for(const entry of state.parts.values())for(const mesh of entry.chunks.values())mesh.geometry.dispose();state.material.dispose();group.clear();state.parts.clear();delete group.userData.voxelState;
}
