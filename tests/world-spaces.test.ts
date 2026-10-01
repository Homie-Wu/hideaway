import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';
import {Physics} from '../src/physics.ts';
import {gardenBounds} from '../src/world/spaces.ts';
import type {MapWorld,Vec3} from '../src/contracts.ts';

let world:MapWorld;
before(()=>{world=createWorld();world.randomize(17,0);});
after(()=>world?.dispose());

test('actual voxel lawn, paving and indoor flooring cover the whole ground once without coplanar overlays',()=>{
  const [gx,gz,gw,gd]=layout.boundaries.garden,coverage=new Uint8Array(gw*gd),colors=new Set<string>();let faces=0;
  world.group.updateMatrixWorld(true);
  world.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const geometry=object.geometry,index=geometry.index,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),color=geometry.getAttribute('color');
    assert.ok(index,'World surfaces use indexed voxel geometry');
    for(let offset=0;offset<index.count;offset+=6){
      const points=Array.from(new Set(Array.from({length:6},(_,i)=>index.getX(offset+i))));
      const corners=points.map(i=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld));
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      if(points.length!==4||points.some((i,p)=>Math.abs(new THREE.Vector3().fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix).y-1)>1e-6||Math.abs(corners[p].y)>1e-6))continue;
      const xs=corners.map(p=>p.x),zs=corners.map(p=>p.z);
      const x=Math.min(...xs),z=Math.min(...zs),right=Math.max(...xs),front=Math.max(...zs);
      if(right<=gx||x>=gx+gw||front<=gz||z>=gz+gd)continue;
      faces++;const vertex=points[0];colors.add([color.getX(vertex),color.getY(vertex),color.getZ(vertex)].join(','));
      assert.ok([x,z,right,front].every(Number.isInteger));
      for(let pz=Math.max(gz,z);pz<Math.min(gz+gd,front);pz++)for(let px=Math.max(gx,x);px<Math.min(gx+gw,right);px++){
        const cell=(pz-gz)*gw+px-gx;assert.equal(coverage[cell],0,`Duplicate ground face at ${px},${pz}`);coverage[cell]++;
      }
    }
  });
  assert.ok(faces>100,'The assertion inspected the rendered color-partitioned voxel floors');
  assert.ok(colors.size>=4,'Lawn, paving and room surface palettes are present');
  const uncovered=coverage.indexOf(0);assert.equal(uncovered,-1,`Ground surface gap at ${gx+uncovered%gw},${gz+Math.floor(uncovered/gw)}`);
});

test('full actor extents stop inside all four actual garden fence faces, including the front boundary',async()=>{
  const physics=await Physics.create();physics.loadWorld(world.colliders);
  try{
    const fences=world.colliders.filter(box=>box.kind==='boundary'&&box.room==='庭院');assert.equal(fences.length,4);
    const bounds=[{min:[-4,0,-4] as Vec3,max:[4,8,4] as Vec3},{min:[-9,0,-7] as Vec3,max:[9,48,7] as Vec3}];
    for(const b of bounds)for(const [axis,sign] of [[0,1],[0,-1],[2,1],[2,-1]]){
      const limit=(axis===0?gardenBounds.x:gardenBounds.z)-gardenBounds.thickness;
      const fence=fences.find(box=>sign*box.center[axis]>0&&box.size[axis]===gardenBounds.thickness)!;assert.ok(fence);
      assert.equal(sign*fence.center[axis]-fence.size[axis]/2,limit,'The visible wall agrees with the actual inner collision face');
      const position=new THREE.Vector3(0,.2,0).setComponent(axis,sign*(limit-40));
      const actor=physics.addActor(99,position,b),movement=new THREE.Vector3().setComponent(axis,sign*2);movement.y=-.1;
      for(let i=0;i<70;i++){physics.move(actor,movement);physics.step(1/60);}
      const edge=sign>0?actor.position.getComponent(axis)+b.max[axis]:-(actor.position.getComponent(axis)+b.min[axis]);
      assert.ok(edge<=limit+.3,`Actor leaked beyond the visible fence: ${axis},${sign},${edge}`);
      assert.ok(edge>limit-2,'Movement reached the actual fence instead of an unrelated obstacle');assert.ok(actor.position.y>=0&&actor.position.y<.3);
      physics.removeActor(actor);
    }
  }finally{physics.dispose();}
});

test('small disguises enter low bed voids, while the maximum disguise cannot clip through the mattress',async()=>{
  const physics=await Physics.create();physics.loadWorld(world.colliders);
  try{
    const failures:string[]=[];
    assert.equal(layout.furniture.find(row=>row.id==='C01')!.hide,undefined,'a low car bed is not a false full-size tunnel');
    for(const id of ['M01','G01'])for(const size of [8,12]){
      const spec=layout.furniture.find(row=>row.id===id)!,hide=spec.hide!,entrance=layout.validation.hideEntrances.find(row=>row.furniture===id)!;
      assert.equal(entrance.entry[2],'东');assert.equal(hide.maxModel,12);
      const bounds={min:[-size/2,0,-size/2] as Vec3,max:[size/2,size,size/2] as Vec3};
      const actor=physics.addActor(99,new THREE.Vector3(entrance.entry[0],hide.y+.2,entrance.entry[1]),bounds);
      const center=new THREE.Vector3(hide.rect[0]+hide.rect[2]/2,hide.y,hide.rect[1]+hide.rect[3]/2);
      for(const goal of [new THREE.Vector3(center.x,hide.y,entrance.entry[1]),center]){
        for(let step=0;step<160;step++){
          const delta=goal.clone().sub(actor.position);delta.y=0;if(delta.length()<1)break;
          delta.normalize();delta.y=-.08;physics.move(actor,delta);physics.step(1/60);
        }
      }
      if(Math.hypot(actor.position.x-center.x,actor.position.z-center.z)>=2||Math.abs(actor.position.y-hide.y)>=.5||!physics.canFit(bounds,actor.position))
        failures.push(`${id}, ${size} cube: bed void blocked at ${actor.position.toArray()}`);
      const centerFull=center.clone();centerFull.y+=.2;assert.equal(physics.canFit({min:[-16,0,-16],max:[16,32,16]},centerFull),false,'a 32 cube is blocked by the low platform');
      physics.removeActor(actor);
    }
    assert.deepEqual(failures,[],'All approved bed openings must admit their declared maximum model through real colliders');
  }finally{physics.dispose();}
});
