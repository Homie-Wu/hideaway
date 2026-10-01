import * as THREE from 'three';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';

export class StableAOPass extends SSAOPass {
 syncCamera(){
  const camera=this.camera as THREE.PerspectiveCamera;
  const u=this.ssaoMaterial.uniforms;
  u.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
  u.cameraNear.value=camera.near;u.cameraFar.value=camera.far;
 }
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  this.syncCamera();
  const cameraMask=this.camera.layers.mask;this.camera.layers.disable(2);
  const hidden:THREE.Object3D[]=[];
  this.scene.traverse(object=>{
   if(object instanceof THREE.Mesh&&object.visible){
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.every(m=>m.transparent&&m.opacity<1)){hidden.push(object);object.visible=false}
   }
  });
  try{super.render(renderer,write,read,0,false)}finally{this.camera.layers.mask=cameraMask;hidden.forEach(o=>o.visible=true)}
 }
}
