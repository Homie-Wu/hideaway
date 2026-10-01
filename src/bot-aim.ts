import * as THREE from 'three';
import type {BotIntent} from './bots.ts';
import type {Actor} from './runtime.ts';

/** Limited aim is also the actual shot direction; tracking never snaps to a target. */
export function aimBot(actor:Actor,intent:BotIntent,dt:number,time:number){
 const focus=intent.lookAt??intent.target?.position.clone().add(new THREE.Vector3(0,5,0));
 let yaw=actor.yaw,pitch=0,desired:THREE.Vector3|undefined;
 if(focus){
  desired=focus.clone().sub(actor.position.clone().add(new THREE.Vector3(0,40,0))).normalize();
  yaw=Math.atan2(-desired.x,-desired.z)+Math.sin(time*2.3+actor.id)*.018;
  pitch=Math.asin(desired.y)+Math.cos(time*1.7+actor.id)*.012;
 }else if(intent.direction.lengthSq()>.001)yaw=Math.atan2(-intent.direction.x,-intent.direction.z);
 const turn=Math.atan2(Math.sin(yaw-actor.yaw),Math.cos(yaw-actor.yaw));
 actor.yaw+=THREE.MathUtils.clamp(turn,-dt*2.2,dt*2.2);
 actor.pitch+=THREE.MathUtils.clamp(pitch-actor.pitch,-dt*1.5,dt*1.5);
 actor.aim=!!focus;
 const direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(actor.pitch,actor.yaw,0,'YXZ'));
 return {direction,canFire:!!desired&&!!intent.target&&direction.dot(desired)>Math.cos(.065)};
}
