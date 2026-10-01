import * as THREE from 'three';
interface Particle{position:THREE.Vector3;velocity:THREE.Vector3;life:number;max:number;color:THREE.Color;size:number;}
export class Effects {
 scene:THREE.Scene;mesh:THREE.InstancedMesh;particles:Particle[]=[];traces:{line:THREE.Line;life:number}[]=[];
 constructor(scene:THREE.Scene){this.scene=scene;this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xffffff}),128);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.layers.set(2);this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh)}
 burst(position:THREE.Vector3,color=0xefc77e,count=10){for(let i=0;i<count&&this.particles.length<128;i++)this.particles.push({position:position.clone(),velocity:new THREE.Vector3((Math.random()-.5)*30,Math.random()*35,(Math.random()-.5)*30),life:.35+Math.random()*.4,max:.75,color:new THREE.Color(color),size:1+Math.random()*2})}
 /** Hot metal fragments rebound from the face rather than floating upwards as dust. */
 targetImpact(position:THREE.Vector3,incoming:THREE.Vector3){
  const rebound=incoming.clone().normalize().multiplyScalar(-28);
  for(let i=0;i<14&&this.particles.length<128;i++){
   const life=.15+Math.random()*.18;
   this.particles.push({position:position.clone(),velocity:rebound.clone().add(new THREE.Vector3((Math.random()-.5)*35,Math.random()*30,(Math.random()-.5)*35)),life,max:life,color:new THREE.Color(i%3?0xffdf8a:0xffffff),size:.5+Math.random()});
  }
 }
 trace(from:THREE.Vector3,to:THREE.Vector3){if(this.traces.length>24)return;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,to]),new THREE.LineBasicMaterial({color:0xffe9ac,transparent:true,opacity:.55}));line.layers.set(2);this.scene.add(line);this.traces.push({line,life:.055})}
 update(dt:number){this.particles=this.particles.filter(p=>p.life>0);const matrix=new THREE.Matrix4();this.particles.forEach((p,i)=>{p.life-=dt;p.velocity.y-=60*dt;p.position.addScaledVector(p.velocity,dt);matrix.compose(p.position,new THREE.Quaternion(),new THREE.Vector3().setScalar(Math.max(0,p.life/p.max)*p.size));this.mesh.setMatrixAt(i,matrix);this.mesh.setColorAt(i,p.color)});this.mesh.count=this.particles.length;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;this.traces=this.traces.filter(t=>{t.life-=dt;if(t.life<=0){this.scene.remove(t.line);t.line.geometry.dispose();(t.line.material as THREE.Material).dispose();return false}return true})}
}
