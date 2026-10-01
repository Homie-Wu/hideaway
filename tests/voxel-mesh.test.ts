import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultModel, cloneModel } from '../src/voxel/model.ts';
import { createModelView, updateModelView, disposeModelView } from '../src/voxel/meshing.ts';

test('solid 8 cube emits only surface faces into one draw call',()=>{
  const view=createModelView(createDefaultModel());
  assert.equal(view.children.length,1);
  const mesh=view.children[0] as THREE.Mesh;
  assert.equal(mesh.geometry.getAttribute('position').count,6*8*8*6);
  disposeModelView(view);
});
test('unchanged parts reuse geometry and transforms do not trigger remeshing',()=>{
  const m=createDefaultModel(); const view=createModelView(m);const mesh=view.children[0] as THREE.Mesh;const geometry=mesh.geometry;
  const moved=cloneModel(m);moved.parts[0].position[0]=.25;updateModelView(view,moved);
  assert.equal(mesh.geometry,geometry);assert.equal(mesh.position.x,-15.75);
  moved.parts[0].cells[0].color='#ff0000';updateModelView(view,moved);
  assert.notEqual(mesh.geometry,geometry);assert.equal(view.children.length,1);disposeModelView(view);
});

test('painting one region preserves distant chunks and removing a boundary cell updates both sides',()=>{
 const m=createDefaultModel();for(let x=20;x<29;x++)m.parts[0].cells.push({x,y:0,z:12,color:'#ffffff'});
 const view=createModelView(m),far=view.children.find(c=>c.userData.chunk==='4,0,2') as THREE.Mesh,farGeometry=far.geometry;
 m.parts[0].cells[0].color='#00ff00';updateModelView(view,m);assert.equal(far.geometry,farGeometry);
 const near=view.children.find(c=>c.userData.chunk==='3,0,2') as THREE.Mesh,before=near.geometry.getAttribute('position').count;
 m.parts[0].cells=m.parts[0].cells.filter(c=>!(c.x===19&&c.y===0&&c.z===12));updateModelView(view,m);
 assert.equal(near.geometry.getAttribute('position').count,before+6);assert.equal(far.geometry,farGeometry);disposeModelView(view);
});
