import * as THREE from 'three';
import type {MapWorld,Vec3,VoxelModel,WorldBox} from '../contracts.ts';
import {layout,designRoom,type DesignProp} from './design-layout.ts';
import {designArchitecture} from './design-architecture.ts';
import {buildFurnitureAsset} from './voxel-furniture.ts';
import {buildOrientedPropAsset} from './voxel-props.ts';
import {placementProblem} from './prop-placement.ts';
import {assetToModel,type VoxelAsset} from './voxel-asset.ts';
import {VoxelScene,disposeVoxelScene,type AssetPlacement} from './voxel-scene.ts';
import {createNavigation,rooms} from './navigation.ts';
import {PracticeRange} from '../practice-range.ts';
import {WeaponRack} from '../weapon-rack.ts';

function random(seed:number){let state=seed>>>0;return()=>{state+=0x6d2b79f5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const outside=(room:string)=>['front','back','west','east','balcony'].includes(room);

/** Reviewed layout data is the sole source of positions, sizes, surfaces and room semantics. */
export function createWorld():MapWorld {
  const group=new THREE.Group();group.name='拾光住宅 · 体素住宅';
  const fixed=new VoxelScene(),furnitureModels:VoxelModel[]=[];
  designArchitecture(fixed,group);
  for(const spec of layout.furniture){
    const asset=buildFurnitureAsset(spec),origin:Vec3=[spec.rect[0],spec.y,spec.rect[1]];
    fixed.add({id:spec.id,name:spec.name,room:designRoom(spec.room).name,origin,size:asset.size,kind:'furniture',yaw:spec.yaw,mimickable:!!spec.mimickable},asset,{layer:outside(spec.room)?0:1,glass:spec.kind==='glass-partition',emissive:spec.kind==='wall-light'});
    if(spec.mimickable)furnitureModels.push(assetToModel(asset,spec.name));
  }
  group.add(fixed.build('voxel-architecture-and-furniture'));
  const practiceRange=new PracticeRange(group,layout.preparationFeatures.firingRange.targets);
  const station=layout.furniture.find(row=>row.id===layout.preparationFeatures.weaponStation.furniture);
  if(!station)throw new Error('武器架必须存在于住宅布局中');
  const weaponRack=new WeaponRack(group,station);
  practiceRange.group.traverse(object=>object.layers.set(1));weaponRack.group.traverse(object=>object.layers.set(1));
  const fixedBoxes=fixed.boxes,colliders=[...fixedBoxes],nav:MapWorld['nav']=[];
  let propsGroup:THREE.Group|undefined,disposed=false;
  const cache=new Map<string,VoxelAsset>();
  const propAsset=(name:string,size:Vec3,color:string,variant:number,yaw:number)=>{
    const key=`${name}:${size}:${color}:${variant}:${yaw}`;
    if(!cache.has(key))cache.set(key,buildOrientedPropAsset(name,size,color,variant,yaw));
    return cache.get(key)!;
  };
  const supports=layout.furniture.flatMap(f=>f.supports);
  const legal=(p:AssetPlacement,spec:DesignProp,placed:AssetPlacement[])=>{
    const support=supports.find(s=>s.id===spec.support);
    return placementProblem(p,support,fixedBoxes,placed)===null;
  };
  const baselines:AssetPlacement[]=layout.props.map(spec=>({id:spec.id,name:spec.name,room:designRoom(spec.room).name,origin:[spec.rect[0],spec.y,spec.rect[1]],size:[spec.rect[2],spec.height,spec.rect[3]],kind:'prop',support:spec.support,yaw:spec.yaw,mimickable:spec.mimickable}));
  for(const [i,placement] of baselines.entries()){
    const problem=placementProblem(placement,supports.find(s=>s.id===layout.props[i].support),fixedBoxes,baselines);
    if(problem)throw new Error(`场景物件 ${placement.id} (${placement.name}) 无法摆放：${problem}`);
  }
  const randomize=(seed:number,ratio=.2)=>{
    if(disposed)return;
    const rand=random(Number.isFinite(seed)?seed:1),changeRatio=Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:.2));
    const props=new VoxelScene(),models=[...furnitureModels],placed:AssetPlacement[]=[];
    let changed=0,fallbacks=0;
    for(const [specIndex,spec] of layout.props.entries()){
      const baseline=baselines[specIndex];
      let placement=baseline,variant=0;
      if(spec.randomizable&&rand()<changeRatio){
        const index=Math.floor(rand()*spec.variants.length),option=spec.variants[index];
        const candidate:AssetPlacement={...baseline,name:option.name,size:[...option.size],origin:[baseline.origin[0]+Math.round((rand()-.5)*4),baseline.origin[1],baseline.origin[2]+Math.round((rand()-.5)*4)]};
        if(candidate.size.every((n,a)=>n<=spec.maxSize[a])&&legal(candidate,spec,[...placed,...baselines])){placement=candidate;variant=index;changed++;}else fallbacks++;
      }
      placed.push(placement);
      const asset=propAsset(placement.name!,placement.size,spec.color,variant,spec.yaw);
      props.add(placement,asset,{layer:outside(spec.room)?0:1});
      if(spec.mimickable)models.push(assetToModel(asset,placement.name!));
    }
    if(propsGroup){group.remove(propsGroup);disposeVoxelScene(propsGroup);}
    propsGroup=props.build('voxel-small-objects');group.add(propsGroup);
    colliders.splice(0,colliders.length,...fixedBoxes,...props.boxes);
    nav.splice(0,nav.length,...createNavigation(colliders));
    group.userData.assets=[...fixed.placements,...props.placements];group.userData.mimicModels=models;
    group.userData.world={layoutId:layout.meta.id,name:'拾光住宅',randomSlots:layout.props.length,changedSlots:changed,fallbacks,staticColliders:fixedBoxes.length,dynamicColliders:props.boxes.length,seed,randomRatio:changeRatio};
  };
  group.userData.spawns=layout.spawns;group.userData.preparationFeatures=layout.preparationFeatures;
  randomize(2026,0);
  return {group,colliders,nav,rooms:rooms.map(r=>({...r,min:[...r.min],max:[...r.max]})),hiderSpawn:[...layout.spawns.hider],hunterSpawn:[...layout.spawns.hunterRelease],lobbySpawn:[...layout.spawns.hunterPreparation],menuCamera:[...layout.spawns.menuCamera],menuTarget:[...layout.spawns.menuTarget],randomize,
    dispose:()=>{if(!disposed){disposed=true;practiceRange.dispose();weaponRack.dispose();disposeVoxelScene(group);cache.clear();colliders.length=0;nav.length=0;group.clear();}}};
}
