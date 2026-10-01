import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {StableAOPass} from '../src/stable-ao.ts';
test('AO reconstruction follows zoom and clipping changes without resizing the viewport',()=>{
 const camera=new THREE.PerspectiveCamera(68,1.6,1,2400),pass=new StableAOPass(new THREE.Scene(),camera,640,400);
 try{for(const fov of [48,55,68]){
  camera.fov=fov;camera.near=1.2;camera.updateProjectionMatrix();pass.syncCamera();
  const point=new THREE.Vector3(10,5,-100),clip=point.clone().applyMatrix4(camera.projectionMatrix);
  const reconstructed=clip.applyMatrix4(pass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value);
  assert.ok(reconstructed.distanceTo(point)<1e-8);
  assert.equal(pass.ssaoMaterial.uniforms.cameraNear.value,1.2);
 }}finally{pass.dispose()}
});
