import * as THREE from 'three';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';

/** Render fixed light groups into one depth buffer. Light layers alone do not mask receivers. */
export class RoomRenderPass extends RenderPass {
 readonly roomLayer:number;
 constructor(scene:THREE.Scene,camera:THREE.Camera,layer:number){super(scene,camera);this.roomLayer=layer;this.clear=layer===0}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  const mask=this.camera.layers.mask,background=this.scene.background;
  this.camera.layers.set(this.roomLayer);
  if(this.roomLayer!==0)this.scene.background=null;
  try{super.render(renderer,write,read,0,false)}finally{this.camera.layers.mask=mask;this.scene.background=background}
 }
}
