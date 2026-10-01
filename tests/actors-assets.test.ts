import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {cacheHunterAssetScene,disposeHunterAssets,hunterAssetUrl} from '../src/actors/assets.ts';
import {createHunterRig} from '../src/actors/rig.ts';
import type {HunterPose} from '../src/contracts.ts';

test('hunter GLB URL stays inside Vite base path when deployed under a subpath',()=>{
 assert.equal(hunterAssetUrl('/hideaway/'),'/hideaway/models/characters/hunter-kit.glb');
});

test('real Blender GLB exports shared colored meshes in joint-local coordinates',async()=>{
 const bytes=await readFile(new URL('../public/models/characters/hunter-kit.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 cacheHunterAssetScene(gltf.scene);
 const rig=createHunterRig(),other=createHunterRig();
 try{
  assert.equal(rig.group.userData.assetSource,'blender-glb');
  const bounds=new THREE.Box3().setFromObject(rig.group);
  assert.ok(bounds.max.y>=47&&bounds.max.y<=49,`Blender head height ${bounds.max.y}`);
  assert.ok(Math.abs(bounds.min.y)<.1,`Blender feet ${bounds.min.y}`);
  let meshes=0;rig.group.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;if(o.name!=='muzzle-flash')assert.ok(o.geometry.getAttribute('color'),'export retains authored palette')}});
  assert.ok(meshes<25,`draw meshes ${meshes}`);
  const a=rig.group.getObjectByName('pistol-geometry') as THREE.Mesh,b=other.group.getObjectByName('pistol-geometry') as THREE.Mesh;
  assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
  const idle:HunterPose={speed:0,sprint:false,grounded:true,crouch:false,aim:false,pitch:0,turn:0,weapon:'pistol',shot:0,reload:0,melee:0,hurt:0,dead:0,switchWeapon:0};
  for(const weapon of ['knife','pistol','smg','shotgun'] as const){for(let i=0;i<90;i++)rig.update(1/60,{...idle,weapon,aim:true,pitch:.4,reload:i/90});assert.equal(rig.group.getObjectByName(weapon)?.visible,true)}
  rig.setFirstPerson(true);assert.equal(rig.group.getObjectByName('head')?.visible,false);assert.equal(rig.group.getObjectByName('right-arm')?.visible,true);
 }finally{rig.dispose();other.dispose();disposeHunterAssets()}
});
