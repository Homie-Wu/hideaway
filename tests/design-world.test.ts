import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';
import {modelBounds,validateModel} from '../src/voxel/model.ts';
import {buildOrientedPropAsset} from '../src/world/voxel-props.ts';
import {assetToModel} from '../src/world/voxel-asset.ts';
import type {MapWorld,Vec3,VoxelModel,WorldBox} from '../src/contracts.ts';

interface Placement {id:string;room:string;origin:Vec3;size:Vec3;kind:WorldBox['kind'];}
let world:MapWorld;
before(()=>{world=createWorld();world.randomize(17,0);});
after(()=>world?.dispose());
const placements=()=>{const rows=world.group.userData.assets;assert.ok(Array.isArray(rows),'world exposes its actual asset placements');return rows as Placement[];};
const roomId=(value:string)=>layout.rooms.find(room=>room.id===value||room.name===value)?.id;
const localSize=(model:VoxelModel):Vec3=>{const bounds=modelBounds(model);return bounds.max.map((value,axis)=>value-bounds.min[axis]) as Vec3;};

test('the world advertises its current reviewed layout and exposes exact spawn and preparation features',()=>{
  assert.equal(world.group.userData.world?.layoutId,layout.meta.id);
  assert.deepEqual(world.group.userData.spawns,layout.spawns);
  assert.deepEqual(world.group.userData.preparationFeatures,layout.preparationFeatures);
  assert.deepEqual(world.hiderSpawn,layout.spawns.hider);assert.deepEqual(world.hunterSpawn,layout.spawns.hunterRelease);assert.deepEqual(world.lobbySpawn,layout.spawns.hunterPreparation);
  assert.deepEqual(world.menuCamera,layout.spawns.menuCamera);assert.deepEqual(world.menuTarget,layout.spawns.menuTarget);
});

test('the enriched furniture and all baseline props retain unique IDs and current layout coordinates and sizes',()=>{
  assert.equal(new Set(layout.furniture.map(row=>row.id)).size,layout.furniture.length);assert.equal(new Set(layout.props.map(row=>row.id)).size,layout.props.length);
  const rows=placements();
  for(const [kind,specs] of [['furniture',layout.furniture],['prop',layout.props]] as const){
    const ids=new Set(specs.map(spec=>spec.id));assert.equal(rows.filter(row=>ids.has(row.id)).length,specs.length);
    for(const spec of specs){
      const matches=rows.filter(row=>row.id===spec.id);assert.equal(matches.length,1,`${spec.id}: exactly one real placement`);const row=matches[0];
      assert.equal(row.kind,kind,`${spec.id}: asset kind`);assert.equal(roomId(row.room),spec.room,`${spec.id}: room`);
      assert.deepEqual(row.origin,[spec.rect[0],spec.y,spec.rect[1]],`${spec.id}: world northwest bottom corner`);
      assert.deepEqual(row.size,[spec.rect[2],spec.height,spec.rect[3]],`${spec.id}: approved world footprint is already oriented`);
      assert.ok([...row.origin,...row.size].every(Number.isInteger),`${spec.id}: native integer voxel placement`);
    }
  }
});

test('every approved room has its exact X/Z bounds and correct floor elevation',()=>{
  for(const spec of layout.rooms){
    const matches=world.rooms.filter(room=>room.name===spec.name);assert.equal(matches.length,1,`${spec.id}: named room exists once`);const room=matches[0];
    assert.deepEqual([room.min[0],room.min[2],room.max[0],room.max[2]],[spec.bounds[0],spec.bounds[1],spec.bounds[0]+spec.bounds[2],spec.bounds[1]+spec.bounds[3]],`${spec.id}: room bounds`);
    assert.equal(room.min[1],spec.floor*128,`${spec.id}: floor level`);assert.ok(room.max[1]>room.min[1]);
  }
});

test('the real scene catalog contains every complete editable unscaled native disguise model',()=>{
  const models=world.group.userData.mimicModels as VoxelModel[];assert.ok(Array.isArray(models));
  const expected=[...layout.furniture.filter(row=>row.mimickable),...layout.props.filter(row=>row.mimickable)];assert.equal(models.length,expected.length);
  const expectedSizes=expected.map(row=>[row.rect[2],row.height,row.rect[3]].join(',')).sort(),actualSizes:string[]=[];
  for(const model of models){
    assert.equal(model.version,2);assert.equal(validateModel(model).valid,true,model.name);assert.ok(model.parts.length>0);
    const size=localSize(model);assert.ok(size.every(n=>Number.isInteger(n)&&n>0&&n<=32),`${model.name}: fits the native 32 cube`);actualSizes.push(size.join(','));
    for(const part of model.parts){assert.deepEqual(part.position,[0,0,0]);assert.deepEqual(part.rotation,[0,0,0]);assert.ok(part.cells.every(cell=>[cell.x,cell.y,cell.z].every(n=>Number.isInteger(n)&&n>=0&&n<32)));}
    assert.deepEqual(JSON.parse(JSON.stringify(model)),model,`${model.name}: full saveable JSON`);
  }
  assert.deepEqual(actualSizes.sort(),expectedSizes,'catalog dimensions match actual baseline scene assets');
  for(const id of ['B11','B12']){const spec=layout.furniture.find(row=>row.id===id)!;assert.ok(models.some(model=>model.name.includes(spec.name)),`${id}: mimickable bathroom furniture is also selectable`);}
});

test('the scene exports the actual oriented display and computer tower occupancy to the editor',()=>{
  const models=world.group.userData.mimicModels as VoxelModel[];
  for(const id of ['t02','t11']){
    const spec=layout.props.find(row=>row.id===id)!;
    const expected=assetToModel(buildOrientedPropAsset(spec.name,[spec.rect[2],spec.height,spec.rect[3]],spec.color,0,spec.yaw),spec.name);
    const actual=models.find(model=>model.name===spec.name)!;
    assert.ok(actual,`${id}: native model exists`);
    assert.deepEqual(actual.parts[0].cells,expected.parts[0].cells,`${id}: complete scene-facing voxel data, including color and front`);
    assert.deepEqual(actual.pivot,expected.pivot);
  }
});

test('an invalid baseline support height is rejected instead of silently clipping or falling back',()=>{
  const spec=layout.props[0],originalY=spec.y;
  try{spec.y+=1;assert.throws(()=>createWorld(),new RegExp(`场景物件 ${spec.id}.*无法摆放`));}
  finally{spec.y=originalY;}
});

test('world rendering uses integer voxel surfaces without imported environment GLBs or mesh scaling',()=>{
  world.group.updateMatrixWorld(true);let meshes=0;
  world.group.traverse(object=>{
    assert.notEqual(object.userData.sharedAsset,true,'environment GLB resource ownership is absent');
    assert.doesNotMatch(String(object.userData.assetSource??''),/blender|glb/i);
    if(!(object instanceof THREE.Mesh))return;meshes++;
    assert.deepEqual(object.scale.toArray(),[1,1,1],'native world meshes are unscaled');
    const position=object.geometry.getAttribute('position'),normal=object.geometry.getAttribute('normal'),color=object.geometry.getAttribute('color');
    assert.ok(position&&normal&&color,'voxel surface carries position, normal and palette color');assert.equal(position.count,normal.count);assert.equal(position.count,color.count);
    const point=new THREE.Vector3();for(let index=0;index<position.count;index++){
      point.fromBufferAttribute(position,index).applyMatrix4(object.matrixWorld);assert.ok(point.toArray().every(value=>Math.abs(value-Math.round(value))<1e-6),`integer voxel corner in ${object.name}`);
    }
  });
  assert.ok(meshes>0);assert.ok(meshes<180,`${meshes} world meshes exceed the retained scene budget`);
});

test('the formal preparation roof covers the whole inner room at Y128',()=>{
  const [x,z,w,d]=layout.rooms.find(room=>room.id==='prep')!.bounds,y=layout.boundaries.preparationRoofY;
  assert.ok(world.colliders.some(box=>box.center[1]-box.size[1]/2===y&&box.center[0]-box.size[0]/2<=x&&box.center[0]+box.size[0]/2>=x+w&&box.center[2]-box.size[2]/2<=z&&box.center[2]+box.size[2]/2>=z+d),'preparation is physically roofed in the normal game scene');
});

test('both practice target centers hit the separate hinged voxel plates and their real red bullseyes',()=>{
  const targets:THREE.Mesh[]=[];world.group.updateMatrixWorld(true);
  world.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.userData.practiceTargetIndex!==undefined)targets.push(object);});
  assert.ok(targets.length>0,'Practice targets exist as real marked meshes');
  const red=new THREE.Color('#d86645');
  for(const center of layout.preparationFeatures.firingRange.targets){
    const origin=new THREE.Vector3(layout.preparationFeatures.firingRange.shootingLineX,center[1],center[2]);
    const ray=new THREE.Raycaster(origin,new THREE.Vector3(1,0,0),0,200);ray.layers.enableAll();
    const hit=ray.intersectObjects(targets,false)[0];assert.ok(hit,`No actual target board at the approved center ${center}`);
    assert.ok(hit.point.distanceTo(new THREE.Vector3(center[0]-3,center[1],center[2]))<.1,`Bullseye ${center} instead hits ${hit.point.toArray()}`);
    const color=(hit.object as THREE.Mesh).geometry.getAttribute('color'),vertex=hit.face!.a;
    assert.ok(Math.abs(color.getX(vertex)-red.r)<1e-5&&Math.abs(color.getY(vertex)-red.g)<1e-5&&Math.abs(color.getZ(vertex)-red.b)<1e-5,
      `Approved target center ${center} must hit the actual red bullseye rather than the rack legs`);
  }
});

test('the normal map renders a closed house roof, eaves, stepped slopes and a ridge',()=>{
  const assets=world.group.userData.assets as {id:string;origin:Vec3;size:Vec3}[];
  const roof=assets.find(row=>row.id==='house-roof')!;
  assert.ok(roof);assert.deepEqual(roof.origin,[-448,248,-320]);assert.deepEqual(roof.size,[896,8,640]);
  assert.ok(assets.filter(row=>row.id.startsWith('roof-tiles-')).length>=40);
  assert.ok(assets.find(row=>row.id==='roof-ridge')!.origin[1]>320);
  const meshes:THREE.Mesh[]=[];world.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.userData.roof)meshes.push(object)});
  assert.ok(meshes.length>0);assert.ok(meshes.every(mesh=>mesh.visible&&(Array.isArray(mesh.material)?mesh.material:[mesh.material]).every(material=>!material.clippingPlanes)),'gameplay starts with a whole visible roof, clipping is only a local inspection view');
});

test('randomization keeps all approved slots and only admits native sizes within their design maximum',()=>{
  world.randomize(31,1);
  try{
    const rows=placements();for(const spec of layout.props){
      const matches=rows.filter(row=>row.id===spec.id);assert.equal(matches.length,1);const row=matches[0];
      assert.equal(row.origin[1],spec.y,`${spec.id}: support elevation is preserved`);assert.equal(roomId(row.room),spec.room);
      assert.ok(row.size.every((n,axis)=>Number.isInteger(n)&&n>0&&n<=spec.maxSize[axis]&&n<=32),`${spec.id}: accepted variant fits the native maximum`);
    }
    const models=world.group.userData.mimicModels as VoxelModel[];assert.equal(models.length,layout.furniture.filter(f=>f.mimickable).length+layout.props.filter(p=>p.mimickable).length);assert.ok(models.every(model=>validateModel(model).valid),'updated scene models remain editable');
  }finally{world.randomize(17,0);}
});
