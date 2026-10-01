import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type {ModelBounds,VoxelModel,VoxelPart,WorldBox} from './contracts.ts';
export interface ProxyBox {center:THREE.Vector3;half:THREE.Vector3;rotation:THREE.Quaternion;local:THREE.Vector3;partId:string;}
const vector=(v:number[])=>new THREE.Vector3(v[0],v[1],v[2]);
const partQuat=(p:VoxelPart)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation));
export function voxelBoxes(model:VoxelModel):ProxyBox[]{
 const result:ProxyBox[]=[];
 for(const part of model.parts){const occupied=new Set(part.cells.map(c=>c.x+32*c.y+1024*c.z));const has=(x:number,y:number,z:number)=>x<32&&y<32&&z<32&&occupied.has(x+32*y+1024*z);
  for(const cell of part.cells){const{x,y,z}=cell;if(!has(x,y,z))continue;let sx=1,sy=1,sz=1;while(has(x+sx,y,z))sx++;
   while(z+sz<32&&Array.from({length:sx},(_,i)=>has(x+i,y,z+sz)).every(Boolean))sz++;
   while(y+sy<32){let full=true;for(let k=0;k<sz&&full;k++)for(let i=0;i<sx;i++)if(!has(x+i,y+sy,z+k)){full=false;break}if(!full)break;sy++}
   for(let k=0;k<sz;k++)for(let j=0;j<sy;j++)for(let i=0;i<sx;i++)occupied.delete(x+i+32*(y+j)+1024*(z+k));
   const local=new THREE.Vector3(x+sx/2,y+sy/2,z+sz/2),rotation=partQuat(part);result.push({local,center:local.clone().applyQuaternion(rotation).add(vector(part.position)).sub(vector(model.pivot)),half:new THREE.Vector3(sx/2,sy/2,sz/2),rotation,partId:part.id});
  }
 }return result;
}
export interface PhysicsActor {id:number;body:RAPIER.RigidBody;collider:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;position:THREE.Vector3;grounded:boolean;bounds:ModelBounds;yaw:number;}
let initialization:Promise<void>|undefined;
export class Physics {
 world:RAPIER.World;boxes:WorldBox[]=[];staticHandles=new Set<number>();actors=new Map<number,PhysicsActor>();
 constructor(){this.world=new RAPIER.World({x:0,y:-150,z:0})}
 static async create(){initialization??=RAPIER.init();await initialization;return new Physics()}
 loadWorld(boxes:WorldBox[]){this.boxes=boxes;for(const handle of this.staticHandles){const c=this.world.getCollider(handle);if(c)this.world.removeCollider(c,true)}this.staticHandles.clear();for(const b of boxes){const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(...b.size.map(v=>Math.max(.02,v/2)) as [number,number,number]).setTranslation(...b.center));this.staticHandles.add(c.handle)}this.world.step()}
 addActor(id:number,position:THREE.Vector3,bounds:ModelBounds):PhysicsActor {const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y,position.z));const h=vector(bounds.max).sub(vector(bounds.min)).multiplyScalar(.5),c=vector(bounds.max).add(vector(bounds.min)).multiplyScalar(.5);const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.2,h.x),Math.max(.2,h.y),Math.max(.2,h.z)).setTranslation(c.x,c.y,c.z),body);const controller=this.world.createCharacterController(.12);controller.enableAutostep(8.2,2,false);controller.enableSnapToGround(2);controller.setSlideEnabled(true);controller.setMaxSlopeClimbAngle(Math.PI/3);const actor={id,body,collider,controller,position:position.clone(),grounded:false,bounds,yaw:0};this.actors.set(id,actor);return actor}
 removeActor(actor:PhysicsActor){this.world.removeCharacterController(actor.controller);this.world.removeRigidBody(actor.body);this.actors.delete(actor.id)}
 resize(actor:PhysicsActor,bounds:ModelBounds){actor.bounds=bounds;const h=vector(bounds.max).sub(vector(bounds.min)).multiplyScalar(.5),c=vector(bounds.max).add(vector(bounds.min)).multiplyScalar(.5);actor.collider.setShape(new RAPIER.Cuboid(Math.max(.2,h.x),Math.max(.2,h.y),Math.max(.2,h.z)));actor.collider.setTranslationWrtParent(c);this.world.propagateModifiedBodyPositionsToColliders()}
 teleport(actor:PhysicsActor,pos:THREE.Vector3){actor.position.copy(pos);actor.body.setTranslation(pos,true);actor.body.setNextKinematicTranslation(pos);this.world.propagateModifiedBodyPositionsToColliders()}
 canFit(bounds:ModelBounds,position:THREE.Vector3,yaw=0){const half=vector(bounds.max).sub(vector(bounds.min)).multiplyScalar(.5),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),center=vector(bounds.max).add(vector(bounds.min)).multiplyScalar(.5).applyQuaternion(rotation).add(position);return !this.world.intersectionWithShape(center,rotation,new RAPIER.Cuboid(Math.max(.01,half.x-.025),Math.max(.01,half.y-.025),Math.max(.01,half.z-.025)),undefined,undefined,undefined,undefined,c=>this.staticHandles.has(c.handle))}
 /** Detect a reachable vertical structural face, using the whole rotated actor collider. */
 climbSurface(actor:PhysicsActor){
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.yaw);
  const center=vector(actor.bounds.max).add(vector(actor.bounds.min)).multiplyScalar(.5).applyQuaternion(q).add(actor.position);
  const half=vector(actor.bounds.max).sub(vector(actor.bounds.min)).multiplyScalar(.5);
  const c=Math.abs(Math.cos(actor.yaw)),s=Math.abs(Math.sin(actor.yaw)),extent=new THREE.Vector3(c*half.x+s*half.z,half.y,s*half.x+c*half.z);
  let best:{normal:THREE.Vector3;top:number;gap:number;box:WorldBox}|undefined;
  for(const box of this.boxes){
   if(box.kind!=='wall'||box.size[1]<12)continue;
   const lo=vector(box.center).addScaledVector(vector(box.size),-.5),hi=vector(box.center).addScaledVector(vector(box.size),.5);
   if(center.y-extent.y>hi.y+.7||center.y+extent.y<lo.y+1)continue;
   for(const axis of [0,2]){const other=axis===0?2:0;
    if(center.getComponent(other)+extent.getComponent(other)<=lo.getComponent(other)+.3||center.getComponent(other)-extent.getComponent(other)>=hi.getComponent(other)-.3)continue;
    for(const sign of [-1,1]){const face=(sign<0?lo:hi).getComponent(axis);const gap=sign*(center.getComponent(axis)-face)-extent.getComponent(axis);
     if(gap<-.3||gap>2.5||best&&gap>=best.gap)continue;
     best={normal:new THREE.Vector3().setComponent(axis,sign),top:hi.y,gap,box};
    }
   }
  }
  return best;
 }
 move(actor:PhysicsActor,delta:THREE.Vector3,yaw=0){const turn=THREE.MathUtils.euclideanModulo(yaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI,start=actor.yaw,steps=Math.max(1,Math.ceil(Math.abs(turn)/(Math.PI/36)));for(let i=1;i<=steps;i++){const next=start+turn*i/steps;if(!this.canFit(actor.bounds,actor.position,next))break;actor.yaw=next}actor.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.yaw),true);this.world.propagateModifiedBodyPositionsToColliders();actor.controller.computeColliderMovement(actor.collider,delta,undefined,undefined,c=>this.staticHandles.has(c.handle));const m=actor.controller.computedMovement();actor.position.add(new THREE.Vector3(m.x,m.y,m.z));actor.body.setTranslation(actor.position,true);actor.body.setNextKinematicTranslation(actor.position);actor.grounded=actor.controller.computedGrounded();
  // Rapier's tolerances can settle a voxel-sized body slightly below a very
  // large floor. Anchor grounded feet to the actual support plane, keeping
  // editing legality and rendered feet in agreement across model sizes.
  if(actor.grounded&&delta.y<=0){const foot=actor.position.y+actor.bounds.min[1];let support=-Infinity;for(const box of this.boxes){const top=box.center[1]+box.size[1]/2;if(Math.abs(top-foot)<.3&&actor.position.x>box.center[0]-box.size[0]/2&&actor.position.x<box.center[0]+box.size[0]/2&&actor.position.z>box.center[2]-box.size[2]/2&&actor.position.z<box.center[2]+box.size[2]/2)support=Math.max(support,top)}if(Number.isFinite(support)){actor.position.y=support-actor.bounds.min[1]+.12;actor.body.setTranslation(actor.position,true);actor.body.setNextKinematicTranslation(actor.position)}}
  this.world.propagateModifiedBodyPositionsToColliders();return m}
 step(dt:number){this.world.timestep=Math.max(1/240,Math.min(dt,1/30));this.world.step()}
 ray(origin:THREE.Vector3,direction:THREE.Vector3,distance:number){return this.world.castRay(new RAPIER.Ray(origin,direction),distance,true,undefined,undefined,undefined,undefined,c=>this.staticHandles.has(c.handle))}
 visible(a:THREE.Vector3,b:THREE.Vector3){const d=b.clone().sub(a),length=d.length();if(length<.01)return true;const hit=this.ray(a,d.divideScalar(length),Math.max(0,length-.3));return !hit}
 cameraPosition(target:THREE.Vector3,desired:THREE.Vector3){const delta=desired.clone().sub(target),length=delta.length();if(length<.01)return desired;const hit=this.world.castShape(target,{x:0,y:0,z:0,w:1},delta.clone().divideScalar(length),new RAPIER.Ball(2),0,length,true,undefined,undefined,undefined,undefined,c=>this.staticHandles.has(c.handle));return hit?target.clone().addScaledVector(delta.normalize(),Math.max(1,hit.time_of_impact-1)):desired}
 validateEdit(candidate:VoxelModel,previous:VoxelModel,pos:THREE.Vector3,yaw:number):{valid:boolean;reason?:string}{
  const yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);const toWorld=(v:THREE.Vector3)=>v.applyQuaternion(yawQ).add(pos);
  // A direct selection drag splits its cells and moves them in one transaction.
  // Recover the exact removed-cell source so the new id still receives a volume sweep.
  const sourceParts=new Map(previous.parts.map(part=>[part.id,part]));
  const cellKey=(cell:{x:number;y:number;z:number})=>cell.x+32*cell.y+1024*cell.z;
  for(const part of candidate.parts){if(sourceParts.has(part.id))continue;
   for(const source of previous.parts){const remainder=candidate.parts.find(p=>p.id===source.id);if(!remainder)continue;
    const kept=new Set(remainder.cells.map(cellKey)),removed=new Set(source.cells.filter(cell=>!kept.has(cellKey(cell))).map(cellKey));
    if(removed.size===part.cells.length&&part.cells.every(cell=>removed.has(cellKey(cell)))){sourceParts.set(part.id,source);break;}
   }
  }
  const boxes=voxelBoxes(candidate);if(boxes.length===0)return{valid:false,reason:'至少保留一个体素'};
  for(const box of boxes){const center=toWorld(box.center.clone()),rot=yawQ.clone().multiply(box.rotation);const shape=new RAPIER.Cuboid(Math.max(.001,box.half.x-.025),Math.max(.001,box.half.y-.025),Math.max(.001,box.half.z-.025));const intersects=(p:THREE.Vector3,q:THREE.Quaternion)=>this.world.intersectionWithShape(p,q,shape,undefined,undefined,undefined,undefined,c=>this.staticHandles.has(c.handle));
   if(intersects(center,rot))return{valid:false,reason:'模型碰到墙面、家具或地面，请缩小或移开后编辑'};
   const old=sourceParts.get(box.partId);
   if(!old){const sources=voxelBoxes(previous).map(b=>toWorld(b.center.clone()));const origin=sources.sort((a,b)=>a.distanceToSquared(center)-b.distanceToSquared(center))[0];if(origin&&!this.visible(origin,center))return{valid:false,reason:'新增分件不能隔着墙体或家具生成'};continue}
   const oldCenter=old?box.local.clone().applyQuaternion(partQuat(old)).add(vector(old.position)).sub(vector(previous.pivot)):new THREE.Vector3(16,4,16).sub(vector(previous.pivot));toWorld(oldCenter);
   const oldRot=old?yawQ.clone().multiply(partQuat(old)):rot.clone();const distance=center.distanceTo(oldCenter),angle=oldRot.angleTo(rot);if(distance>.001||angle>.001){const steps=Math.max(1,Math.ceil(distance/1),Math.ceil(angle/(Math.PI/36)));let last=oldCenter;for(let s=1;s<=steps;s++){const t=s/steps,p=oldCenter.clone().lerp(center,t),q=oldRot.clone().slerp(rot,t),delta=p.clone().sub(last);if(intersects(p,q))return{valid:false,reason:'这次变换会穿过实体，已拒绝'};if(delta.lengthSq()>.0001){const hit=this.world.castShape(last,q,delta,shape,0,1,true,undefined,undefined,undefined,undefined,c=>this.staticHandles.has(c.handle));if(hit&&hit.time_of_impact<.999)return{valid:false,reason:'不能利用建模越过墙体或家具'}}last=p}}
   if(old){const oldCells=new Set(old.cells.map(c=>c.x+32*c.y+1024*c.z));const current=candidate.parts.find(p=>p.id===box.partId)!;if(current.cells.some(c=>!oldCells.has(c.x+32*c.y+1024*c.z))){const oldMin=old.cells[0];if(oldMin){const origin=toWorld(new THREE.Vector3(oldMin.x+.5,oldMin.y+.5,oldMin.z+.5).applyQuaternion(partQuat(old)).add(vector(old.position)).sub(vector(previous.pivot)));if(!this.visible(origin,center))return{valid:false,reason:'新增体素不能隔着实体生成'}}}}
  }return{valid:true};
 }
 dispose(){this.world.free()}
}
