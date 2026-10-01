import type { NavPoint, Vec3, WorldBox } from '../contracts.ts';
import { roomZones, gardenBounds } from './spaces.ts';
import { layout } from './design-layout.ts';
export const rooms = roomZones;

export function roomAt(point: Vec3) {
  const room=rooms.find(room=>point.every((v,a)=>v>=room.min[a]&&v<room.max[a]));
  if(room)return room.name;
  const [x,z,w,d]=layout.boundaries.house;
  if(point[0]>=x&&point[0]<x+w&&point[2]>=z&&point[2]<z+d&&point[1]>=0&&point[1]<256)
    return point[1]<128?'一楼横向走廊':'二楼横向走廊';
  return '花园';
}

class Occupancy {
  private cells = new Map<string, WorldBox[]>();
  constructor(boxes: WorldBox[]) {
    for (const box of boxes) {
      const left = Math.floor((box.center[0] - box.size[0] / 2) / 64);
      const right = Math.floor((box.center[0] + box.size[0] / 2) / 64);
      const back = Math.floor((box.center[2] - box.size[2] / 2) / 64);
      const front = Math.floor((box.center[2] + box.size[2] / 2) / 64);
      for (let x = left; x <= right; x++) for (let z = back; z <= front; z++) {
        const key = `${x}:${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key)!.push(box);
      }
    }
  }
  nearby(x: number, z: number, radius: number) {
    const found = new Set<WorldBox>();
    for (let cx = Math.floor((x - radius) / 64); cx <= Math.floor((x + radius) / 64); cx++)
      for (let cz = Math.floor((z - radius) / 64); cz <= Math.floor((z + radius) / 64); cz++)
        this.cells.get(`${cx}:${cz}`)?.forEach(box => found.add(box));
    return found;
  }
  clear(p: Vec3, height = 50, radius = 11) {
    for (const box of this.nearby(p[0], p[2], radius)) {
      if (Math.abs(p[0] - box.center[0]) < box.size[0] / 2 + radius - 0.05 &&
          Math.abs(p[2] - box.center[2]) < box.size[2] / 2 + radius - 0.05 &&
          p[1] + height > box.center[1] - box.size[1] / 2 + 0.1 &&
          p[1] + 0.1 < box.center[1] + box.size[1] / 2) return false;
    }
    return true;
  }
  floor(p: Vec3, furniture=false, inset=.05) {
    return [...this.nearby(p[0], p[2], 0)].some(box => (box.kind === 'floor'||furniture&&box.kind==='furniture') &&
      Math.abs(box.center[1] + box.size[1] / 2 - p[1]) < 0.11 &&
      Math.abs(p[0] - box.center[0]) <= box.size[0] / 2 - inset &&
      Math.abs(p[2] - box.center[2]) <= box.size[2] / 2 - inset);
  }
  passage(a: Vec3, b: Vec3, height = 50, radius = 11) {
    if(Math.abs(a[1]-b[1])>.11)return false;
    const distance = Math.hypot(a[0] - b[0], a[2] - b[2]);
    const samples = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const point:Vec3=[a[0]+(b[0]-a[0])*t,a[1],a[2]+(b[2]-a[2])*t];
      if(!this.floor(point)||!this.clear(point,height,radius))return false;
    }
    return true;
  }

  /** The controller can step 8.2 units; lift feet onto each real support before testing headroom. */
  stepPassage(a:Vec3,b:Vec3,height=50,radius=11):boolean {
    if(Math.abs(a[1]-b[1])>8.2)return false;
    const distance=Math.hypot(a[0]-b[0],a[2]-b[2]),samples=Math.max(1,Math.ceil(distance/4));
    let previous=a[1];
    for(let i=0;i<=samples;i++){
      const t=i/samples,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
      let support=-Infinity;
      for(const box of this.nearby(x,z,radius)){
        if(box.kind!=='floor'&&box.kind!=='furniture')continue;
        const top=box.center[1]+box.size[1]/2;
        if(top<Math.min(a[1],b[1])-.11||top>Math.max(a[1],b[1])+.11)continue;
        if(Math.abs(x-box.center[0])<box.size[0]/2+radius-.05&&Math.abs(z-box.center[2])<box.size[2]/2+radius-.05)support=Math.max(support,top);
      }
      if(!Number.isFinite(support)||Math.abs(support-previous)>8.2||!this.clear([x,support,z],height,radius))return false;
      previous=support;
    }
    return true;
  }
}

/** Ground coordinates describe feet; small-only furniture destinations carry their maximum model size. */
export function createNavigation(boxes: WorldBox[]) {
  const occupied = new Occupancy(boxes);
  const nav:(NavPoint&{maxModel?:number;furniture?:string;smallOnly?:true})[]=[],grid=new Map<string,number>(),points=new Map<string,number>();
  const key=(p:Vec3)=>p.join(':');
  const main=(p:Vec3)=>Math.abs(p[0])<=gardenBounds.x&&Math.abs(p[2])<=gardenBounds.z;
  const add=(position:Vec3,hide?:{maxModel:number;furniture:string})=>{
    const existing=points.get(key(position));if(existing!==undefined)return existing;
    nav.push({position,links:[],room:roomAt(position),...(!occupied.clear(position)?{smallOnly:true as const}:{}),...(hide?{hide:true,...hide}:{})});
    points.set(key(position),nav.length-1);
    return nav.length - 1;
  };
  const join = (a: number, b: number) => {
    if (!nav[a].links.includes(b)) nav[a].links.push(b);
    if (!nav[b].links.includes(a)) nav[b].links.push(a);
  };
  for (const y of [0, 128]) {
    for (let x = -608; x <= 608; x += 32) for (let z = -544; z <= 544; z += 32) {
      const position: Vec3 = [x, y, z];
      if (!occupied.floor(position) || !occupied.clear(position)) continue;
      const index = add(position);
      grid.set(`${x}:${y}:${z}`, index);
      for (const [dx, dz] of [[-32, 0], [0, -32]]) {
        const neighbor = grid.get(`${x + dx}:${y}:${z + dz}`);
        if (neighbor !== undefined && occupied.passage(position, nav[neighbor].position)) join(index, neighbor);
      }
    }
  }
  const nearestReachable = (point: Vec3, height = 50, radius = 11, maxDistance = 80) =>
    nav.map((n, i) => ({ i, n, distance: Math.hypot(point[0] - n.position[0], point[2] - n.position[2]) }))
      .filter(({ n, distance }) => !n.hide&&n.position[1] === point[1] && distance>0&&distance <= maxDistance &&
        occupied.passage(point, n.position, height, radius))
      .sort((a, b) => a.distance - b.distance).slice(0, 4);

  const insert=(point:Vec3,height=50,radius=11)=>{
    if(!main(point)||!occupied.floor(point)||!occupied.clear(point,height,radius))return undefined;
    const neighbors=nearestReachable(point,height,radius),index=add(point);
    neighbors.forEach(n=>join(index,n.i));return index;
  };
  // Exact doorway centers and both sides prevent the coarse grid from skipping wall openings.
  for(const door of layout.doors){
    const [x,z]=door.center,y=door.floor*128;
    for(const offset of [-32,0,32])insert([x+(door.axis==='z'?offset:0),y,z+(door.axis==='x'?offset:0)]);
  }
  for(const route of layout.routes){
    if(route.room==='prep')continue;
    const floor=layout.rooms.find(room=>room.id===route.room)!.floor,y=floor*128;
    for(let segment=1;segment<route.points.length;segment++){
      const a=route.points[segment-1],b=route.points[segment],distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
      let previous:number|undefined;
      const offsets=Array.from({length:Math.ceil(distance/16)},(_,i)=>i*16);offsets.push(distance);
      for(const offset of offsets){
        const t=distance?offset/distance:0,point:Vec3=[a[0]+(b[0]-a[0])*t,y,a[1]+(b[1]-a[1])*t],index=insert(point);
        if(index!==undefined&&previous!==undefined&&occupied.passage(nav[previous].position,point))join(previous,index);
        previous=index;
      }
    }
  }

  // A 32-wide model extends 16 units past its centre. Place stair feet on the
  // trailing tread edge so that footprint does not overlap the next higher rise.
  // The body is supported by the tread under its leading half, as in Rapier.
  const stairPoints:Vec3[]=[[320,0,-80]];
  for(let i=0;i<8;i++)stairPoints.push([320,(i+1)*8,-112-i*16]);
  stairPoints.push([320,64,-264],[400,64,-264]);
  for(let i=0;i<8;i++)stairPoints.push([400,64+(i+1)*8,-240+i*16]);
  stairPoints.push([400,128,-80]);
  let previous:number|undefined;
  for(const point of stairPoints){
    const index=main(point)&&occupied.floor(point,false,0)&&occupied.clear(point)?add(point):undefined;
    if(index!==undefined){
      if(previous!==undefined&&occupied.stepPassage(nav[previous].position,point))join(previous,index);
      if(point[1]===0||point[1]===128)nearestReachable(point).forEach(n=>join(index,n.i));
    }
    previous=index;
  }

  const attachEntrance=(entrance:Vec3,height:number,radius:number)=>{
    if(!occupied.floor(entrance)||!occupied.clear(entrance,height,radius))return undefined;
    const visited=new Set<string>([key(entrance)]),queue:{point:Vec3;previous:number}[]=[{point:entrance,previous:-1}];
    for(let cursor=0;cursor<queue.length;cursor++){
      const {point}=queue[cursor],neighbors=nearestReachable(point,height,radius,112);
      if(neighbors.length){
        let index=add(point);
        for(const neighbor of neighbors){
          const target=neighbor.n.position;
          // Enter furniture along its open faces. A cube that fits an axis
          // aligned gap can be wider when it rotates along a diagonal shortcut.
          const elbows:Vec3[]=[[point[0],point[1],target[2]],[target[0],point[1],point[2]]];
          const elbow=elbows.find(p=>occupied.passage(point,p,height,radius)&&occupied.passage(p,target,height,radius));
          if(elbow){const via=add(elbow);if(via!==index)join(index,via);if(via!==neighbor.i)join(via,neighbor.i);}
          else join(index,neighbor.i);
        }
        for(let at=queue[cursor].previous;at>=0;at=queue[at].previous){const previous=add(queue[at].point);join(previous,index);index=previous;}
        return index;
      }
      for(const [dx,dz] of [[16,0],[-16,0],[0,16],[0,-16]]){
        const next:Vec3=[point[0]+dx,point[1],point[2]+dz],id=key(next);
        if(visited.has(id)||!main(next)||Math.hypot(next[0]-entrance[0],next[2]-entrance[2])>112)continue;
        visited.add(id);
        if(occupied.passage(point,next,height,radius))queue.push({point:next,previous:cursor});
      }
    }
    return undefined;
  };
  for(const spec of layout.furniture){
    const hide=spec.hide;if(!hide)continue;
    const entry=layout.validation.hideEntrances.find(e=>e.furniture===spec.id);
    if(!entry)continue;
    const [x,z,side]=entry.entry;
    const radius=hide.maxModel/2+2,height=hide.maxModel+4;
    const entrance:Vec3=[x,spec.y,z],inside:Vec3=[x,hide.y,z];
    const [hx,hz,hw,hd]=hide.rect;
    inside[0]=Math.max(hx+radius,Math.min(hx+hw-radius,x));
    inside[2]=Math.max(hz+radius,Math.min(hz+hd-radius,z));
    if(side==='东')inside[0]=hx+hw-radius;else if(side==='西')inside[0]=hx+radius;
    else if(side==='南')inside[2]=hz+hd-radius;else if(side==='北')inside[2]=hz+radius;
    if(!main(inside)||!occupied.floor(inside,true)||!occupied.clear(inside,height,radius))continue;
    if(!occupied.stepPassage(entrance,inside,height,radius))continue;
    const outside=attachEntrance(entrance,height,radius);if(outside===undefined)continue;
    const index=add(inside,{maxModel:hide.maxModel,furniture:spec.id});join(outside,index);
  }

  // Prune isolated pockets so bots never select a point outside the playable connected region.
  if(!nav.length)return [];
  const start = nav.reduce((best, n, i) => {
    const d=Math.hypot(n.position[0]-layout.spawns.hider[0],n.position[1]-layout.spawns.hider[1],n.position[2]-layout.spawns.hider[2]);
    return d < best.d ? { i, d } : best;
  }, { i: 0, d: Infinity }).i;
  const reachable = new Set<number>([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const next of nav[queue[i]].links)
    if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
  const remap = new Map<number, number>();
  nav.forEach((_, i) => { if (reachable.has(i)) remap.set(i, remap.size); });
  return nav.filter((_, i) => reachable.has(i)).map(n => ({
    ...n, links: n.links.filter(i => reachable.has(i)).map(i => remap.get(i)!),
  }));
}
