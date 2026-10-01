import * as THREE from 'three';
import type {ActorState,MapWorld,ModelBounds,Phase} from './contracts.ts';import type {Physics} from './physics.ts';import {modelBounds} from './voxel/model.ts';
export interface BotIntent {direction:THREE.Vector3;sprint:boolean;jump:boolean;attack:boolean;target?:ActorState;lookAt?:THREE.Vector3;taunt:boolean;}
interface Brain {node:number;path:number[];until:number;heard?:THREE.Vector3;heardUntil:number;chase?:number;lastSeen?:THREE.Vector3;lastSeenAt:number;suspect?:number;evidence:number;fireAt:number;lastPos:THREE.Vector3;stuck:number;nextTaunt:number;escapeUntil:number;nextEscape:number;lastThreatAt:number;lastHp:number;}
export function findPath(world:MapWorld,start:number,end:number,allowed?:(node:number)=>boolean,edgeAllowed?:(a:number,b:number)=>boolean):number[]{if(start<0||end<0)return[];const queue=[start],previous=new Map<number,number>([[start,-1]]);for(let i=0;i<queue.length;i++){const n=queue[i];if(n===end)break;for(const next of world.nav[n].links)if(!previous.has(next)&&(!allowed||allowed(next))&&(!edgeAllowed||edgeAllowed(n,next))){previous.set(next,n);queue.push(next)}}if(!previous.has(end))return[];const path=[];for(let n=end;n!==start&&n!==-1;n=previous.get(n)??-1)path.push(n);return path.reverse()}
export class BotDirector {
 brains=new Map<number,Brain>();clearance=new Map<number,Set<number>>();world:MapWorld;physics:Physics;
 private bounds=new Map<number,ModelBounds>();private edges=new Map<number,Map<string,boolean>>();
 constructor(world:MapWorld,physics:Physics){this.world=world;this.physics=physics}
 reset(){this.brains.clear();this.clearance.clear();this.bounds.clear();this.edges.clear()}
 beginHunt(actors:ActorState[],time:number){
  for(const actor of actors){
   if(actor.role==='hunter'){this.brains.delete(actor.id);continue}
   const b=this.brain(actor,time);b.nextTaunt=time+35+actor.id*3;b.escapeUntil=0;b.nextEscape=0;b.lastThreatAt=-Infinity;b.lastHp=actor.hp;
  }
 }
 private bodyBounds(actor:ActorState){let bounds=this.bounds.get(actor.id);if(!bounds){bounds=actor.role==='hunter'?{min:[-9,0,-7],max:[9,48,7]}:modelBounds(actor.model);this.bounds.set(actor.id,bounds)}return bounds}
 private nodePosition(actor:ActorState,node:number){const p=new THREE.Vector3(...this.world.nav[node].position);p.y+=.12-this.bodyBounds(actor).min[1];return p}
 private passage(actor:ActorState,from:THREE.Vector3,to:THREE.Vector3){
  if(Math.abs(from.y-to.y)>1)return false;
  const bounds=this.bodyBounds(actor),delta=to.clone().sub(from),yaw=Math.atan2(-delta.x,-delta.z),steps=Math.max(1,Math.ceil(delta.length()/6));
  // Flat movement needs the controller's 0.12 contact offset plus canFit's
  // 0.025 shape inset. A merely tangent shelf/bench edge is not a safe route.
  // Keep the real vertical bounds so grounding and explicit autostep links
  // retain their physical support heights.
  const travelBounds:ModelBounds={min:[bounds.min[0]-.2,bounds.min[1],bounds.min[2]-.2],max:[bounds.max[0]+.2,bounds.max[1],bounds.max[2]+.2]};
  for(let i=1;i<=steps;i++){
   const position=from.clone().lerp(to,i/steps);
   if(!this.physics.canFit(travelBounds,position,yaw))return false;
   const foot=position.clone();foot.y+=bounds.min[1]+.5;
   if(!this.physics.ray(foot,new THREE.Vector3(0,-1,0),2))return false;
  }
  return true;
 }
 private edgeAllowed(actor:ActorState,a:number,c:number){
  let cache=this.edges.get(actor.id);if(!cache){cache=new Map();this.edges.set(actor.id,cache)}
  const key=`${Math.min(a,c)}:${Math.max(a,c)}`;let result=cache.get(key);
  if(result===undefined){const from=this.nodePosition(actor,a),to=this.nodePosition(actor,c),dy=Math.abs(from.y-to.y);
   // Explicit stair links are already validated by the map; flat links also need this body's clearance.
   result=dy>1?dy<=8.2&&from.distanceTo(to)<40:this.passage(actor,from,to);cache.set(key,result);
  }
  return result;
 }
 private route(actor:ActorState,b:Brain,node:number,allowed:(n:number)=>boolean,time:number){
  if(node<0)return false;
  const start=this.nearest(actor.position,allowed),path=findPath(this.world,start,node,allowed,(a,c)=>this.edgeAllowed(actor,a,c));
  if(start!==node&&!path.length)return false;
  b.node=node;b.path=path;b.until=time+2;return true;
 }
 brain(actor:ActorState,time:number){let b=this.brains.get(actor.id);if(!b){b={node:-1,path:[],until:0,heardUntil:0,lastSeenAt:-Infinity,evidence:0,fireAt:Infinity,lastPos:actor.position.clone(),stuck:0,nextTaunt:time+35+actor.id*3,escapeUntil:0,nextEscape:0,lastThreatAt:-Infinity,lastHp:actor.hp};this.brains.set(actor.id,b)}return b}
 private escape(actor:ActorState,threats:ActorState[],b:Brain,allowed:(n:number)=>boolean,time:number){
  const candidates=this.world.nav.map((n,i)=>{
   const p=this.nodePosition(actor,i),travel=p.distanceTo(actor.position);
   if(!allowed(i)||travel<35||travel>280)return{i,score:-Infinity};
   let danger=0,distance=Infinity;
   for(const hunter of threats){distance=Math.min(distance,p.distanceTo(hunter.position));if(this.physics.visible(hunter.position.clone().add(new THREE.Vector3(0,35,0)),p.clone().add(new THREE.Vector3(0,5,0))))danger++}
   return{i,score:(threats.length-danger)*300+Math.min(300,distance)-travel*.45+(n.hide?25:0)};
  }).filter(c=>Number.isFinite(c.score)).sort((a,c)=>c.score-a.score);
  for(const candidate of candidates.slice(0,12))if(this.route(actor,b,candidate.i,allowed,time))return true;
  return false;
 }
 nearest(position:THREE.Vector3,allowed?:(node:number)=>boolean){let best=-1,d=Infinity;this.world.nav.forEach((n,i)=>{if(allowed&&!allowed(i))return;const p=new THREE.Vector3(...n.position);const score=p.distanceToSquared(position)+Math.abs(p.y-position.y)*120;if(score<d){d=score;best=i}});return best}
 hear(source:ActorState,actors:ActorState[],time:number){
  for(const actor of actors)if(actor.role==='hunter'&&actor.alive){
   const distance=actor.position.distanceTo(source.position);
   const clear=this.physics.visible(actor.position.clone().add(new THREE.Vector3(0,30,0)),source.position.clone().add(new THREE.Vector3(0,6,0)));
   if(distance*(clear?1:1.9)>380)continue;
   // A reproducible bearing error gives a search area, never an actor identity.
   const angle=actor.id*2.39+source.id*1.71+time*.83,radius=16+distance*.06+(clear?0:24);
   const b=this.brain(actor,time);b.heard=source.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));b.heardUntil=time+9;b.until=0;
  }
 }
 decide(actor:ActorState,actors:ActorState[],phase:Phase,dt:number,time:number):BotIntent{
  const b=this.brain(actor,time);
  const intent:BotIntent={direction:new THREE.Vector3(),sprint:false,jump:false,attack:false,taunt:false};if(phase==='reveal'||(phase==='preparation'&&actor.role==='hunter'))return intent;
  let allowedNodes=this.clearance.get(actor.id);if(!allowedNodes){allowedNodes=new Set();const bounds=this.bodyBounds(actor);this.world.nav.forEach((n,i)=>{if(actor.role==='hunter'&&n.hide)return;const pos=this.nodePosition(actor,i);if(this.physics.canFit(bounds,pos))allowedNodes!.add(i)});this.clearance.set(actor.id,allowedNodes)}const allowed=(i:number)=>allowedNodes!.has(i);
  const eye=actor.position.clone().add(new THREE.Vector3(0,actor.role==='hunter'?40:8,0));
  const enemies=actors.filter(a=>a.alive&&a.role!==actor.role).sort((a,c)=>a.position.distanceToSquared(actor.position)-c.position.distanceToSquared(actor.position));
  const near=enemies.find(a=>Math.abs(a.position.y-actor.position.y)<62&&this.physics.visible(eye,a.position.clone().add(new THREE.Vector3(0,a.role==='hunter'?30:5,0))));
  let goal:THREE.Vector3|undefined;
  if(actor.role==='hunter'&&phase==='hunt'){
   if(time-b.lastSeenAt>4){b.chase=undefined;b.lastSeen=undefined}
   if(time>=b.heardUntil)b.heard=undefined;
   const forward=new THREE.Vector3(-Math.sin(actor.yaw),0,-Math.cos(actor.yaw));
   const found=enemies.find(a=>{const delta=a.position.clone().sub(actor.position),distance=delta.length();delta.y=0;
    return distance<260&&Math.abs(a.position.y-actor.position.y)<80&&forward.dot(delta.normalize())>Math.cos(55*Math.PI/180)&&
     this.physics.visible(eye,a.position.clone().add(new THREE.Vector3(0,5,0)))&&
     (Math.hypot(a.velocity.x,a.velocity.z)>8||b.chase===a.id||(b.heard&&a.position.distanceTo(b.heard)<55));
   });
   if(found){
    if(b.suspect!==found.id){b.suspect=found.id;b.evidence=0;b.fireAt=Infinity}
    b.evidence+=Math.min(dt,.1);intent.lookAt=found.position.clone().add(new THREE.Vector3(0,5,0));
    const moving=Math.hypot(found.velocity.x,found.velocity.z)>8;
    const confirm=b.chase===found.id?.2:moving?.45:b.heard&&found.position.distanceTo(b.heard)<55?.95:1.2;
    if(b.evidence<confirm)return intent;
    if(!Number.isFinite(b.fireAt))b.fireAt=time+.35;
    b.chase=found.id;b.lastSeen=found.position.clone();b.lastSeenAt=time;
    goal=found.position;intent.target=found;const distance=goal.distanceTo(actor.position);
    intent.attack=distance<230&&time>=b.fireAt;intent.sprint=distance>170;
    if(distance<90)return intent;
   }else{
    b.suspect=undefined;b.evidence=0;b.fireAt=Infinity;
    goal=b.lastSeen??b.heard;if(goal)intent.lookAt=goal.clone().add(new THREE.Vector3(0,5,0));
   }
  }
  if(actor.role==='hider'){
   const injured=actor.hp<b.lastHp;
   const threats=phase==='hunt'?enemies.filter(h=>{
    const delta=actor.position.clone().sub(h.position),visible=delta.length()<200&&Math.abs(delta.y)<62&&this.physics.visible(eye,h.position.clone().add(new THREE.Vector3(0,30,0)));
    const observed=h as ActorState&{aim?:boolean;shotTimer?:number};delta.y=0;
    const aiming=!!observed.aim&&new THREE.Vector3(-Math.sin(h.yaw),0,-Math.cos(h.yaw)).dot(delta.normalize())>Math.cos(.22);
    return visible&&(injured||(aiming&&((observed.shotTimer??0)>0||Math.hypot(actor.velocity.x,actor.velocity.z)>8))||time<b.escapeUntil);
   }):[];
   if(threats.length){
    b.lastThreatAt=time;b.escapeUntil=time+4;
    if(time>=b.nextEscape||b.node<0){this.escape(actor,threats,b,allowed,time);b.nextEscape=time+1.25}
   }
   intent.sprint=time<b.escapeUntil;
   if(phase==='hunt'&&time>b.nextTaunt){
    const settled=b.node>=0&&b.path.length===0&&actor.position.distanceTo(this.nodePosition(actor,b.node))<10;
    intent.taunt=settled&&actor.hp>=65&&time-b.lastThreatAt>20&&(!near||near.position.distanceTo(actor.position)>300)&&this.world.nav[b.node].links.length>=2;
    b.nextTaunt=time+(intent.taunt?55+actor.id*4:12);
   }
   b.lastHp=actor.hp;
  }
  if(goal){const horizontal=goal.clone().sub(actor.position);horizontal.y=0;if(this.passage(actor,actor.position,goal)){intent.direction.copy(horizontal.normalize());return intent}const node=this.nearest(goal,allowed);if(node!==b.node||time>b.until){if(!this.route(actor,b,node,allowed,time)){b.node=-1;b.path=[]}}}
  else if(b.node<0||(actor.role==='hunter'&&time>b.until)){
   const options=this.world.nav.map((n,i)=>({n,i})).filter(({n,i})=>allowed(i)&&n.position[0]<700&&(actor.role==='hunter'?!n.hide:n.hide));
   const offset=Math.floor((Math.sin(actor.id*81.32+Math.floor(time/12)*7.11)*.5+.5)*options.length)%options.length;
   for(let attempt=0;attempt<options.length;attempt++)if(this.route(actor,b,options[(offset+attempt)%options.length].i,allowed,time))break;
   b.until=time+(actor.role==='hider'?Infinity:8);
  }
  while(b.path.length&&actor.position.distanceTo(this.nodePosition(actor,b.path[0]))<10)b.path.shift();
  const next=b.path[0]??b.node;if(next>=0&&this.world.nav[next]){const target=this.nodePosition(actor,next),delta=target.clone().sub(actor.position);if(delta.length()<10){if(actor.role==='hunter')b.until=0}else{intent.direction.set(delta.x,0,delta.z).normalize();intent.jump=delta.y>9}}
  if(actor.position.distanceTo(b.lastPos)<.03&&intent.direction.lengthSq()>0)b.stuck+=dt;else b.stuck=0;b.lastPos.copy(actor.position);if(b.stuck>.8){intent.jump=true;if(b.stuck>2){b.until=0;b.path=[];b.node=-1;b.stuck=0}}
  return intent;
 }
}
