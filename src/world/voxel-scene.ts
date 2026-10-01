import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Vec3, WorldBox} from '../contracts.ts';
import {buildVoxelGeometry, voxelCollisionBoxes, type VoxelAsset} from './voxel-asset.ts';

export interface AssetPlacement {id:string;room:string;origin:Vec3;size:Vec3;kind:WorldBox['kind'];name?:string;yaw?:number;support?:string;mimickable?:boolean;}
interface SurfaceOptions {layer?:number;glass?:boolean;roof?:boolean;practiceTarget?:boolean;emissive?:boolean;}
/** One occupancy source supplies the rendered surface and every solid collision box. */
export class VoxelScene {
  readonly boxes:WorldBox[]=[];
  readonly placements:AssetPlacement[]=[];
  private batches=new Map<string,{options:SurfaceOptions;geometries:THREE.BufferGeometry[]}>();
  private targets:THREE.Mesh[]=[];
  add(placement:AssetPlacement,asset:VoxelAsset,options:SurfaceOptions={}) {
    this.placements.push({...placement,origin:[...placement.origin],size:[...asset.size]});
    this.boxes.push(...voxelCollisionBoxes(asset,placement.origin,placement.kind,placement.room));
    const geometry=buildVoxelGeometry(asset).translate(...placement.origin);
    if(options.practiceTarget){
      const mesh=new THREE.Mesh(geometry,material(false));
      mesh.name=placement.id;mesh.userData.practiceTarget=0;mesh.layers.set(options.layer??1);
      mesh.castShadow=true;mesh.receiveShadow=true;this.targets.push(mesh);return;
    }
    const key=`${options.layer??1}:${!!options.glass}:${!!options.roof}:${!!options.emissive}`;
    if(!this.batches.has(key))this.batches.set(key,{options,geometries:[]});
    this.batches.get(key)!.geometries.push(geometry);
  }
  build(name:string) {
    const group=new THREE.Group();group.name=name;
    for(const [key,{options,geometries}] of this.batches){
      const geometry=mergeGeometries(geometries,false)!;
      geometries.forEach(g=>g.dispose());geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material(!!options.glass,!!options.emissive));
      mesh.name=`${name}:${key}`;mesh.layers.set(options.layer??1);
      mesh.castShadow=!options.glass;mesh.receiveShadow=true;
      if(options.roof)mesh.userData.roof=true;
      group.add(mesh);
    }
    if(this.targets.length)group.add(...this.targets);this.batches.clear();this.targets=[];
    return group;
  }
}

function material(glass:boolean,emissive=false) {
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:glass?.24:1,metalness:glass?.08:0,transparent:glass,opacity:glass?.3:1,depthWrite:!glass});
  if(emissive){mat.emissive.set('#ffe8bb');mat.emissiveIntensity=.65;}
  // A subtle one-voxel grain survives greedy meshing without adding individual cubes.
  if(!glass)mat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 voxelWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvoxelWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 voxelWorld;').replace('#include <color_fragment>','#include <color_fragment>\nvec3 cell = floor(voxelWorld + vec3(0.0001));\nfloat grain = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);\ndiffuseColor.rgb *= 0.95 + grain * 0.1;');
  };
  return mat;
}

export function disposeVoxelScene(group:THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
