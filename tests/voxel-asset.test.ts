import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { Vec3, WorldBox } from '../src/contracts.ts';
import { VoxelBuilder, buildVoxelGeometry, voxelCollisionBoxes, assetToModel, type VoxelAsset } from '../src/world/voxel-asset.ts';
import { validateModel, modelVolume } from '../src/voxel/model.ts';
import { listModels, saveModel } from '../src/voxel/storage.ts';

const cellIndex=(size:Vec3,x:number,y:number,z:number)=>(z*size[1]+y)*size[0]+x;
const occupiedVolume=(asset:VoxelAsset)=>asset.cells.reduce((count,value)=>count+(value!==0?1:0),0);

function assertCollisionOccupancy(asset:VoxelAsset,boxes:WorldBox[],origin:Vec3):void {
  const covered=new Uint8Array(asset.cells.length);
  for(const box of boxes){
    const min=box.center.map((v,axis)=>v-box.size[axis]/2-origin[axis]);
    assert.ok([...min,...box.size].every(Number.isInteger),'collision edges remain on the voxel grid');
    for(let z=min[2];z<min[2]+box.size[2];z++)for(let y=min[1];y<min[1]+box.size[1];y++)for(let x=min[0];x<min[0]+box.size[0];x++){
      assert.ok(x>=0&&y>=0&&z>=0&&x<asset.size[0]&&y<asset.size[1]&&z<asset.size[2]);
      const index=cellIndex(asset.size,x,y,z);
      assert.equal(covered[index],0,`collision boxes overlap at ${x},${y},${z}`);
      covered[index]=1;
    }
  }
  for(let index=0;index<covered.length;index++)assert.equal(covered[index],asset.cells[index]?1:0,`collision occupancy differs at cell ${index}`);
}

function assertSurfaceOccupancy(asset:VoxelAsset,geometry:THREE.BufferGeometry):void {
  const expected=new Map<string,string>(),actual=new Map<string,string>();
  const sample=(p:Vec3)=>p.some((v,axis)=>v<0||v>=asset.size[axis])?0:asset.cells[cellIndex(asset.size,...p)];
  for(let z=0;z<asset.size[2];z++)for(let y=0;y<asset.size[1];y++)for(let x=0;x<asset.size[0];x++){
    const point:Vec3=[x,y,z],cell=sample(point);if(!cell)continue;
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const next:Vec3=[...point];next[axis]+=sign;if(sample(next))continue;
      const u=(axis+1)%3,v=(axis+2)%3;
      expected.set(`${axis},${sign},${point[axis]+(sign>0?1:0)},${point[u]},${point[v]}`,asset.palette[cell]);
    }
  }
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),color=geometry.getAttribute('color');
  assert.equal(position.count,normal.count);assert.equal(position.count,color.count);
  const count=geometry.index?.count??position.count;
  assert.equal(count%6,0);
  for(let offset=0;offset<count;offset+=6){
    const vertices:THREE.Vector3[]=[],indices:number[]=[];
    for(let corner=0;corner<6;corner++){
      const index=geometry.index?.getX(offset+corner)??offset+corner;indices.push(index);
      const point=new THREE.Vector3().fromBufferAttribute(position,index);vertices.push(point);
      assert.ok(point.toArray().every(Number.isInteger),'surface corners remain integer');
    }
    const outward=new THREE.Vector3().fromBufferAttribute(normal,indices[0]);
    const axis=outward.toArray().findIndex(n=>n!==0),sign=outward.getComponent(axis);
    assert.equal(Math.abs(sign),1);assert.equal(outward.length(),1);
    const tint=new THREE.Color().fromBufferAttribute(color,indices[0]);
    for(const index of indices){
      assert.deepEqual(new THREE.Vector3().fromBufferAttribute(normal,index).toArray(),outward.toArray());
      assert.deepEqual(new THREE.Color().fromBufferAttribute(color,index).toArray(),tint.toArray());
    }
    for(const triangle of [0,3]){
      const edgeA=vertices[triangle+1].clone().sub(vertices[triangle]),edgeB=vertices[triangle+2].clone().sub(vertices[triangle]);
      assert.ok(edgeA.cross(edgeB).dot(outward)>0,'triangle winding faces outward');
    }
    const bounds=new THREE.Box3().setFromPoints(vertices),u=(axis+1)%3,v=(axis+2)%3,plane=vertices[0].getComponent(axis);
    assert.equal(bounds.min.getComponent(axis),bounds.max.getComponent(axis));
    for(let j=bounds.min.getComponent(v);j<bounds.max.getComponent(v);j++)for(let i=bounds.min.getComponent(u);i<bounds.max.getComponent(u);i++){
      const key=`${axis},${sign},${plane},${i},${j}`;
      assert.equal(actual.has(key),false,`duplicate surface at ${key}`);
      actual.set(key,`#${tint.getHexString()}`);
    }
  }
  assert.deepEqual([...actual].sort(),[...expected].sort(),'rendered unit faces exactly match exposed occupancy');
}

function makeCup():VoxelAsset {
  const builder=new VoxelBuilder([12,14,12]);
  builder.box(0,0,0,12,14,12,'#d5d8c6');
  builder.carve(2,2,2,8,12,8);
  builder.box(0,12,0,12,2,2,'#e3e6d4');
  return builder.finish();
}

test('builder uses z/y/x typed occupancy, overwrites color and carves exact volume',()=>{
  const size:Vec3=[5,4,6],builder=new VoxelBuilder(size);
  builder.box(1,1,2,3,2,3,'#AABBCC');builder.box(2,1,3,1,1,1,'#ddee00');builder.carve(1,2,2,1,1,2);
  const asset=builder.finish();
  assert.ok(asset.cells instanceof Uint16Array);assert.equal(asset.cells.length,120);
  assert.deepEqual(asset.size,size);assert.deepEqual(asset.palette,['','#aabbcc','#ddee00']);
  assert.equal(occupiedVolume(asset),16);
  assert.equal(asset.cells[(3*4+1)*5+2],2);assert.equal(asset.cells[(2*4+2)*5+1],0);
});

test('finish snapshots can be changed without mutating the builder or other assets',()=>{
  const size:Vec3=[2,2,2],builder=new VoxelBuilder(size);size[0]=30;
  builder.box(0,0,0,2,2,2,'#ffffff');const first=builder.finish();
  first.size[0]=90;first.cells.fill(0);first.palette[1]='#000000';
  const second=builder.finish();assert.deepEqual(second.size,[2,2,2]);assert.equal(occupiedVolume(second),8);assert.equal(second.palette[1],'#ffffff');
  builder.carve(0,0,0,1,1,1);assert.equal(occupiedVolume(second),8);assert.equal(occupiedVolume(builder.finish()),7);
});

test('builder rejects noninteger dimensions, negative extents, invalid colors and out-of-bounds edits',()=>{
  for(const size of [[0,4,4],[4,-1,4],[4,4.5,4],[4,Infinity,4]] as Vec3[])assert.throws(()=>new VoxelBuilder(size),RangeError);
  const builder=new VoxelBuilder([4,4,4]);
  for(const box of [[-.1,0,0,1,1,1],[-1,0,0,1,1,1],[0,0,0,-1,1,1],[3,0,0,2,1,1],[0,3,0,1,2,1],[0,0,3,1,1,2]] as number[][]){
    assert.throws(()=>builder.box(box[0],box[1],box[2],box[3],box[4],box[5],'#ffffff'),RangeError);
    assert.throws(()=>builder.carve(box[0],box[1],box[2],box[3],box[4],box[5]),RangeError);
  }
  assert.throws(()=>builder.box(0,0,0,1,1,1,'white'),TypeError);
  builder.box(4,4,4,0,0,0,'#ffffff');builder.carve(0,0,0,0,4,4);assert.equal(occupiedVolume(builder.finish()),0);
});

test('a solid rectangular asset merges to six outward colored faces and one collision box',()=>{
  const builder=new VoxelBuilder([8,4,6]);builder.box(0,0,0,8,4,6,'#123456');const asset=builder.finish(),geometry=buildVoxelGeometry(asset);
  assert.equal(geometry.index?.count??geometry.getAttribute('position').count,36);
  assertSurfaceOccupancy(asset,geometry);
  assert.deepEqual(geometry.boundingBox?.min.toArray(),[0,0,0]);assert.deepEqual(geometry.boundingBox?.max.toArray(),[8,4,6]);
  const boxes=voxelCollisionBoxes(asset,[10,20,-30],'furniture','room');
  assert.deepEqual(boxes,[{center:[14,22,-27],size:[8,4,6],kind:'furniture',room:'room'}]);
  assertCollisionOccupancy(asset,boxes,[10,20,-30]);geometry.dispose();
});

test('adjacent differently colored solids keep their external colors without an internal face',()=>{
  const builder=new VoxelBuilder([2,1,1]);builder.box(0,0,0,1,1,1,'#ff0000');builder.box(1,0,0,1,1,1,'#00ff00');
  const asset=builder.finish(),geometry=buildVoxelGeometry(asset);
  assert.equal(geometry.index?.count??geometry.getAttribute('position').count,60);
  assertSurfaceOccupancy(asset,geometry);
  assert.equal(voxelCollisionBoxes(asset,[0,0,0],'prop','room').length,1);geometry.dispose();
});

test('a hollow cup renders its open mouth and collision never fills the interior',()=>{
  const asset=makeCup(),geometry=buildVoxelGeometry(asset),origin:Vec3=[-8,50,6],boxes=voxelCollisionBoxes(asset,origin,'prop','kitchen');
  assert.equal(occupiedVolume(asset),12*14*12-8*12*8);assert.equal(boxes.length,5);
  assertSurfaceOccupancy(asset,geometry);assertCollisionOccupancy(asset,boxes,origin);
  assert.ok(boxes.every(box=>box.kind==='prop'&&box.room==='kitchen'));geometry.dispose();
});

test('table slab and four corner legs preserve the full space under the table',()=>{
  const builder=new VoxelBuilder([20,14,16]);builder.box(0,12,0,20,2,16,'#b99b71');
  for(const x of [1,17])for(const z of [1,13])builder.box(x,0,z,2,12,2,'#8d6d4c');
  const asset=builder.finish(),boxes=voxelCollisionBoxes(asset,[0,0,0],'furniture','dining'),geometry=buildVoxelGeometry(asset);
  assert.equal(occupiedVolume(asset),20*2*16+4*2*12*2);assert.equal(boxes.length,5);
  assertCollisionOccupancy(asset,boxes,[0,0,0]);assertSurfaceOccupancy(asset,geometry);geometry.dispose();
});

test('irregular colored occupancies produce no duplicate faces, missing solids or filled voids',()=>{
  for(let seed=0;seed<6;seed++){
    const builder=new VoxelBuilder([5,4,6]);
    for(let z=0;z<6;z++)for(let y=0;y<4;y++)for(let x=0;x<5;x++)if((x*13+y*7+z*17+seed*11)%7<4)builder.box(x,y,z,1,1,1,(x+y+z)%2?'#c08040':'#3070b0');
    const asset=builder.finish(),before=asset.cells.slice(),geometry=buildVoxelGeometry(asset);
    assertSurfaceOccupancy(asset,geometry);assertCollisionOccupancy(asset,voxelCollisionBoxes(asset,[.5,-10,2.5],'furniture','test'),[.5,-10,2.5]);
    assert.deepEqual(asset.cells,before);geometry.dispose();
  }
});

test('empty assets emit neither geometry nor collision',()=>{
  const asset=new VoxelBuilder([3,4,5]).finish(),geometry=buildVoxelGeometry(asset);
  assert.equal(geometry.getAttribute('position').count,0);assert.deepEqual(voxelCollisionBoxes(asset,[0,0,0],'prop','empty'),[]);geometry.dispose();
});

test('asset consumers reject corrupt sizes, occupancy and palette indices',()=>{
  const valid=new VoxelBuilder([2,2,2]).finish();
  const corrupt=[{...valid,size:[2,2,1] as Vec3},{...valid,cells:new Uint16Array(7)},{...valid,cells:new Uint16Array(8).fill(9)},{...valid,palette:['','white']}];
  for(const asset of corrupt){
    assert.throws(()=>buildVoxelGeometry(asset));assert.throws(()=>voxelCollisionBoxes(asset,[0,0,0],'prop','test'));assert.throws(()=>assetToModel(asset,'bad'));
  }
  assert.throws(()=>voxelCollisionBoxes(valid,[Infinity,0,0],'prop','test'),RangeError);
});

test('small assets become version 2 models and retain complete JSON through model storage',async()=>{
  const asset=makeCup(),model=assetToModel(asset,'陶瓷杯');
  assert.equal(model.version,2);assert.equal(model.name,'陶瓷杯');assert.deepEqual(model.pivot,[6,0,6]);assert.equal(model.parts.length,1);
  const part=model.parts[0];assert.ok(part.id);assert.equal(part.name,'陶瓷杯');assert.deepEqual(part.position,[0,0,0]);assert.deepEqual(part.rotation,[0,0,0]);
  assert.equal(validateModel(model).valid,true);assert.equal(modelVolume(model),occupiedVolume(asset));
  for(const cell of part.cells){assert.ok([cell.x,cell.y,cell.z].every(n=>Number.isInteger(n)&&n>=0&&n<32));assert.equal(cell.color,asset.palette[asset.cells[cellIndex(asset.size,cell.x,cell.y,cell.z)]]);}
  assert.deepEqual(JSON.parse(JSON.stringify(model)),model);
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),stored=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)}});
  try{await saveModel(model,'data:image/png;base64,thumbnail');const rows=await listModels();assert.equal(rows.length,1);assert.deepEqual(rows[0].model,model);assert.equal(rows[0].thumbnail,'data:image/png;base64,thumbnail');}
  finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('model conversion rejects oversized and empty disguise assets',()=>{
  assert.throws(()=>assetToModel(new VoxelBuilder([33,2,2]).finish(),'too large'),RangeError);
  assert.throws(()=>assetToModel(new VoxelBuilder([2,33,2]).finish(),'too tall'),RangeError);
  assert.throws(()=>assetToModel(new VoxelBuilder([2,2,33]).finish(),'too deep'),RangeError);
  assert.throws(()=>assetToModel(new VoxelBuilder([2,2,2]).finish(),'empty'),RangeError);
});

test('largest furniture dimensions stay compact in occupancy, mesh and collision',(context)=>{
  const start=performance.now(),builder=new VoxelBuilder([176,104,176]);builder.box(0,96,0,176,8,176,'#b99b71');
  for(const x of [2,168])for(const z of [2,168])builder.box(x,0,z,6,96,6,'#8d6d4c');
  const asset=builder.finish(),built=performance.now(),geometry=buildVoxelGeometry(asset),meshed=performance.now(),boxes=voxelCollisionBoxes(asset,[0,0,0],'furniture','large'),collided=performance.now();
  assert.equal(asset.cells.byteLength,176*104*176*2);assert.equal(occupiedVolume(asset),176*8*176+4*6*96*6);
  assert.equal(boxes.length,5);assert.ok(geometry.getAttribute('position').count<2000);
  assert.equal(boxes.reduce((volume,box)=>volume+box.size[0]*box.size[1]*box.size[2],0),occupiedVolume(asset));
  context.diagnostic(`176x104x176: ${(asset.cells.byteLength/1024/1024).toFixed(2)} MiB occupancy; ${geometry.getAttribute('position').count} vertices; ${boxes.length} boxes; build ${(built-start).toFixed(1)}ms; mesh ${(meshed-built).toFixed(1)}ms; collision ${(collided-meshed).toFixed(1)}ms`);
  geometry.dispose();
});
