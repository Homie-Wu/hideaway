import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {Physics,voxelBoxes} from '../src/physics.ts';import type {VoxelModel} from '../src/contracts.ts';
import {createDefaultModel,createPresetModel} from '../src/voxel/model.ts';
import {transformPart,splitSelection} from '../src/voxel/operations.ts';
const model=(offset=0):VoxelModel=>({version:1,name:'test',pivot:[0,0,0],parts:[{id:'a',name:'a',position:[offset,0,0],rotation:[0,0,0],cells:[{x:0,y:0,z:0,color:'#ffffff'},{x:1,y:0,z:0,color:'#ffffff'}]}]});
test('adjacent voxels merge into a solid collision proxy without losing holes',()=>{assert.equal(voxelBoxes(model()).length,1);const m=model();m.parts[0].cells.push({x:3,y:0,z:0,color:'#ffffff'});assert.equal(voxelBoxes(m).length,2)});
test('model edits reject intersections and swept movement through thin walls',async()=>{const p=await Physics.create();p.loadWorld([{center:[5,2,0],size:[1,8,10],kind:'wall',room:'test'},{center:[0,-1,0],size:[100,2,100],kind:'floor',room:'test'}]);const pos=new THREE.Vector3(0,.1,0);assert.equal(p.validateEdit(model(4),model(),pos,0).valid,false);assert.equal(p.validateEdit(model(8),model(),pos,0).valid,false);assert.equal(p.validateEdit(model(1),model(),pos,0).valid,true);p.dispose()});
test('controller lands on floor and cannot walk through a wall',async()=>{const p=await Physics.create();p.loadWorld([{center:[0,-1,0],size:[100,2,100],kind:'floor',room:'test'},{center:[10,10,0],size:[2,20,100],kind:'wall',room:'test'}]);const a=p.addActor(1,new THREE.Vector3(0,8,0),{min:[-1,0,-1],max:[1,4,1]});for(let i=0;i<120;i++){p.move(a,new THREE.Vector3(.3,-.5,0));p.step(1/60)}assert.ok(a.position.x<8.1);assert.ok(a.position.y>=0&&a.position.y<.3);p.dispose()});

test('a grounded taller preset is legal without sweeping its entire new shape through the floor',async()=>{const p=await Physics.create();p.loadWorld([{center:[0,-1,0],size:[100,2,100],kind:'floor',room:'test'}]);const old=createDefaultModel();for(const kind of ['plant','cup','lamp','book','crate','chair'])assert.equal(p.validateEdit(createPresetModel(kind),old,new THREE.Vector3(0,.12,0),0).valid,true,kind);p.dispose()});

test('standing is blocked under a table while crouching fits; rotation cannot enter a wall',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[0,-1,0],size:[100,2,100],kind:'floor',room:'test'},{center:[0,46,0],size:[30,4,30],kind:'furniture',room:'test'},{center:[30,16,0],size:[2,32,80],kind:'wall',room:'test'}]);
 assert.equal(p.canFit({min:[-9,0,-7],max:[9,41,7]},new THREE.Vector3(0,.12,0)),true);
 assert.equal(p.canFit({min:[-9,0,-7],max:[9,48,7]},new THREE.Vector3(0,.12,0)),false);
 const a=p.addActor(8,new THREE.Vector3(25,.12,0),{min:[-2,0,-10],max:[2,8,10]});p.move(a,new THREE.Vector3(0,-.02,0),Math.PI/2);
 assert.ok(a.yaw<Math.PI/2);assert.ok(p.canFit(a.bounds,a.position,a.yaw));p.dispose();
});

test('editing rejects rotation that crosses an obstacle even when both endpoints fit',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[5.25,4,0],size:[.2,12,.2],kind:'wall',room:'test'}]);
 const before=createDefaultModel(),after=structuredClone(before);transformPart(after,after.parts[0].id,'rotate','y',Math.PI/2);
 const position=new THREE.Vector3(0,.12,0);assert.equal(p.validateEdit(before,before,position,0).valid,true);assert.equal(p.validateEdit(after,after,position,0).valid,true);assert.equal(p.validateEdit(after,before,position,0).valid,false);p.dispose();
});

test('moving a selection that splits during the same transaction sweeps its full volume around wall corners',async()=>{
 const p=await Physics.create();p.loadWorld([{center:[6.5,4,1.9],size:[1,10,4.2],kind:'wall',room:'test'}]);
 const before=createDefaultModel(),after=structuredClone(before),position=new THREE.Vector3(0,.12,0);
 const id=splitSelection(after,after.parts[0].id,[12,4,12],[19,7,15])!;
 after.parts.find(part=>part.id===id)!.position[0]=12;
 assert.equal(p.validateEdit(before,before,position,0).valid,true);
 assert.equal(p.validateEdit(after,after,position,0).valid,true);
 assert.equal(p.validateEdit(after,before,position,0).valid,false,'a clear center ray does not prove the selected volume can pass');
 p.dispose();
});
