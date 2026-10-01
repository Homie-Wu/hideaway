import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultModel, cloneModel, validateModel } from '../src/voxel/model.ts';
import { faceColor, paintSurface, floodSurface } from '../src/voxel/surfaces.ts';
import { duplicateSelection, mergeParts, transformPart, ModelHistory } from '../src/voxel/operations.ts';
import { createModelView, updateModelView, disposeModelView } from '../src/voxel/meshing.ts';

test('legacy color remains the fallback and a brush changes only exposed hit-facing cells',()=>{
  const m=createDefaultModel(),p=m.parts[0];
  paintSurface(m,p.id,[16,4,19],'pz','#ff0000',3);
  assert.equal(m.version,2);assert.equal(validateModel(m).valid,true);
  assert.equal(p.cells.filter(c=>faceColor(c,'pz')==='#ff0000').length,9);
  assert.ok(p.cells.every(c=>faceColor(c,'nz')===c.color));
  assert.ok(p.cells.every(c=>c.color==='#b6c793'));
  paintSurface(m,p.id,[16,4,18],'pz','#00ff00',3);
  assert.equal(p.cells.filter(c=>faceColor(c,'pz')==='#00ff00').length,0);
});

test('bucket fills only a connected coplanar surface of the same face color',()=>{
  const m=createDefaultModel(),p=m.parts[0];
  floodSurface(m,p.id,[16,4,19],'pz','#ff0000');
  assert.equal(p.cells.filter(c=>faceColor(c,'pz')==='#ff0000').length,64);
  assert.ok(p.cells.every(c=>faceColor(c,'nz')===c.color));
  paintSurface(m,p.id,[16,4,19],'pz','#00ff00');
  floodSurface(m,p.id,[16,4,19],'pz','#0000ff');
  assert.equal(p.cells.filter(c=>faceColor(c,'pz')==='#0000ff').length,1);
});

test('face changes remesh their chunk and preserve colors across history and duplicate',()=>{
  const m=createDefaultModel(),view=createModelView(m),mesh=view.children[0] as THREE.Mesh,old=mesh.geometry;
  const history=new ModelHistory(m,()=>({valid:true})),candidate=cloneModel(m);
  paintSurface(candidate,candidate.parts[0].id,[16,4,19],'pz','#ff0000');
  history.commit(candidate);updateModelView(view,history.model);assert.notEqual(mesh.geometry,old);
  history.undo();assert.equal(history.model.parts[0].cells.some(c=>c.faceColors),false);
  history.redo();assert.equal(history.model.parts[0].cells.some(c=>c.faceColors?.pz==='#ff0000'),true);
  const id=duplicateSelection(candidate,candidate.parts[0].id,[16,4,19],[16,4,19]);
  const copy=candidate.parts.find(p=>p.id===id)!.cells[0];copy.faceColors!.pz='#00ff00';
  assert.equal(candidate.parts[0].cells.find(c=>c.x===16&&c.y===4&&c.z===19)!.faceColors!.pz,'#ff0000');disposeModelView(view);
});

test('mirror and merge rotate face colors with geometry',()=>{
  const m=createDefaultModel(),p=m.parts[0];p.cells=[{x:16,y:4,z:16,color:'#ffffff',faceColors:{pz:'#ff0000'}}];m.version=2;
  transformPart(m,p.id,'mirror','z',1);assert.equal(faceColor(p.cells[0],'nz'),'#ff0000');
  transformPart(m,p.id,'rotate','y',Math.PI/2);
  m.parts.push({id:'marker',name:'marker',cells:[{x:12,y:4,z:12,color:'#ffffff'}],position:[0,0,0],rotation:[0,0,0]});
  mergeParts(m);assert.equal(faceColor(m.parts[0].cells.find(c=>c.x===16&&c.z===16)!,'nx'),'#ff0000');
});

test('malformed face color is rejected without invalidating legacy saves',()=>{
  const m=createDefaultModel();assert.equal(validateModel(m).valid,true);
  (m.parts[0].cells[0] as any).faceColors={pz:'red'};assert.equal(validateModel(m).valid,false);
});

test('clearing a painted face restores that voxel base color rather than the starter palette',()=>{
  const m=createDefaultModel(),p=m.parts[0];p.cells=[{x:16,y:4,z:16,color:'#987654',faceColors:{pz:'#ff0000'}}];
  paintSurface(m,p.id,[16,4,16],'pz',null);
  assert.equal(faceColor(p.cells[0],'pz'),'#987654');assert.equal(p.cells[0].faceColors,undefined);
});
