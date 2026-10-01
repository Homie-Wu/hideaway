import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultModel, createPresetModel, cloneModel, modelBounds, modelVolume, validateModel } from '../src/voxel/model.ts';
import { editVolume, floodFill, ModelHistory, splitSelection, mergeParts, transformPart, autoSnapPart } from '../src/voxel/operations.ts';

test('initial model is grounded 8 cubed with bounds relative to its pivot', () => {
  const m = createDefaultModel();
  assert.equal(modelVolume(m), 512);
  assert.deepEqual(modelBounds(m), { min: [-4, 0, -4], max: [4, 8, 4] });
  assert.equal(validateModel(m).valid, true);
});
test('all six disguise presets contain a legal voxel model', () => {
  for (const kind of ['plant','book','crate','lamp','cup','chair']) {
    const m = createPresetModel(kind);
    assert.equal(validateModel(m).valid, true, kind);
    assert.ok(modelVolume(m)>0,kind);
  }
});
test('three dimensional volume adds every cell once and erases exactly that box', () => {
  const m = createDefaultModel();
  editVolume(m, m.parts[0].id, [20,1,12], [22,3,14], 'add', '#ffffff');
  assert.equal(modelVolume(m),539);
  editVolume(m, m.parts[0].id, [22,3,14], [20,1,12], 'add', '#ffffff');
  assert.equal(modelVolume(m),539);
  editVolume(m,m.parts[0].id,[20,1,12],[22,3,14],'remove');
  assert.equal(modelVolume(m),512);
});
test('whole voxel corners and sensible pivot enforce 32 cube even after smooth transform', () => {
  const m = createDefaultModel();
  m.parts[0].position[1] = -.01;
  assert.equal(validateModel(m).valid,false);
  m.parts[0].position[1] = 0;
  m.pivot = [31,31,31];
  assert.equal(validateModel(m).valid,false);
});
test('paint bucket stops at disconnected cells and differently coloured surfaces', () => {
  const m=createDefaultModel();
  m.parts[0].cells=[{x:12,y:0,z:12,color:'#ffffff'},{x:13,y:0,z:12,color:'#ffffff'},{x:14,y:0,z:12,color:'#000000'},{x:18,y:0,z:12,color:'#ffffff'}];
  floodFill(m,m.parts[0].id,[12,0,12],'#aabbcc');
  assert.deepEqual(m.parts[0].cells.map(c=>c.color),['#aabbcc','#aabbcc','#000000','#ffffff']);
});
test('atomic validation rejects operations and invalid undo without changing history', () => {
  let blocked=false;
  const h=new ModelHistory(createDefaultModel(),()=>({valid:!blocked,reason:'墙体'}));
  const candidate=cloneModel(h.model);
  editVolume(candidate,candidate.parts[0].id,[20,0,12],[20,0,12],'add');
  blocked=true; assert.equal(h.commit(candidate).valid,false); assert.equal(modelVolume(h.model),512);
  blocked=false; assert.equal(h.commit(candidate).valid,true); assert.equal(modelVolume(h.model),513);
  blocked=true; assert.equal(h.undo().valid,false); assert.equal(modelVolume(h.model),513);
  blocked=false; assert.equal(h.undo().valid,true); assert.equal(modelVolume(h.model),512);
  assert.equal(h.redo().valid,true); assert.equal(modelVolume(h.model),513);
});
test('split then merge conserves geometry and rotates parts around their centers', () => {
  const m=createDefaultModel();
  const id=splitSelection(m,m.parts[0].id,[12,0,12],[15,7,19]);
  assert.ok(id); assert.equal(m.parts.length,2); assert.equal(modelVolume(m),512);
  transformPart(m,id!,'rotate','y',Math.PI/2);
  assert.equal(validateModel(m).valid,true);
  const before=modelBounds(m); mergeParts(m);
  assert.equal(m.parts.length,1); assert.equal(validateModel(m).valid,true);
  assert.deepEqual(modelBounds(m),before);
});
test('deleting the last voxel is rejected by history', () => {
  const h=new ModelHistory(createDefaultModel(),()=>({valid:true}));
  const m=cloneModel(h.model); m.parts[0].cells=[];
  assert.equal(h.commit(m).valid,false); assert.equal(modelVolume(h.model),512);
});
test('merging a freely rotated solid part preserves a filled interior after voxel baking',()=>{
  const m=createDefaultModel();transformPart(m,m.parts[0].id,'rotate','y',Math.PI/4);
  m.parts.push({id:'distant-marker',name:'标记',position:[0,0,0],rotation:[0,0,0],cells:[{x:1,y:0,z:1,color:'#ffffff'}]});
  mergeParts(m);const occupied=new Set(m.parts[0].cells.map(c=>`${c.x},${c.y},${c.z}`));
  for(let x=10;x<22;x++)for(let z=10;z<22;z++)if(Math.abs(x+.5-16)+Math.abs(z+.5-16)<Math.sqrt(32))for(let y=0;y<8;y++)assert.ok(occupied.has(`${x},${y},${z}`),`missing interior ${x},${y},${z}`);
});

test('automatic snapping joins nearby overlapping faces without pulling toward unrelated parts',()=>{
 const m=createDefaultModel();m.parts.push({id:'other',name:'other',position:[.2,0,0],rotation:[0,0,0],cells:[{x:20,y:0,z:12,color:'#ffffff'}]});
 autoSnapPart(m,m.parts[0].id,'move');assert.ok(Math.abs(m.parts[0].position[0]-.2)<1e-6);
 const far=createDefaultModel();far.parts.push({id:'far',name:'far',position:[.2,0,0],rotation:[0,0,0],cells:[{x:20,y:30,z:12,color:'#ffffff'}]});autoSnapPart(far,far.parts[0].id,'move');assert.equal(far.parts[0].position[0],0);
});
