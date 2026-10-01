import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/world/index.ts';
import {layout} from '../src/world/design-layout.ts';
import type {MapWorld,Vec3,WorldBox} from '../src/contracts.ts';

interface Placement {id:string;origin:Vec3;size:Vec3;kind:WorldBox['kind'];}
interface Solid {box:WorldBox;min:Vec3;max:Vec3;owner:string;}
let world:MapWorld;
before(()=>{world=createWorld();});
after(()=>world?.dispose());
const bounds=(box:WorldBox,owner:string):Solid=>({box,owner,min:box.center.map((v,i)=>v-box.size[i]/2) as Vec3,max:box.center.map((v,i)=>v+box.size[i]/2) as Vec3});
const contains=(placement:Placement,box:Solid)=>placement.origin.every((v,i)=>box.min[i]>=v&&box.max[i]<=v+placement.size[i]);
const overlaps=(a:Solid,b:Solid)=>a.min.every((v,i)=>v<b.max[i]-.001&&a.max[i]>b.min[i]+.001);

for(const [seed,ratio] of [[17,0],[17,.2],[71,.2],[2026,.2],[17,1],[71,1],[2026,1]]){
  test(`all real prop solids have complete support, do not intersect and preserve routes (seed ${seed}, ${ratio*100}%)`,()=>{
    world.randomize(seed,ratio);
    const rows=world.group.userData.assets as Placement[],fixedCount=world.group.userData.world.staticColliders as number;
    const fixed=world.colliders.slice(0,fixedCount).map(box=>bounds(box,`${box.kind}/${box.room}`));
    const dynamic=world.colliders.slice(fixedCount).map(box=>bounds(box,'unassigned'));
    const failures=new Map<string,string>(),owners=new Map<Solid,string>();
    const fail=(key:string,message:string)=>{if(!failures.has(key))failures.set(key,message);};
    for(const spec of layout.props){
      const placement=rows.find(row=>row.id===spec.id)!;assert.ok(placement,`${spec.id}: real placement exists`);
      const pieces=dynamic.filter(box=>contains(placement,box));assert.ok(pieces.length>0,`${spec.id}: real collision occupancy exists`);
      const support=layout.furniture.flatMap(row=>row.supports).find(row=>row.id===spec.support);
      const bottom=pieces.filter(piece=>piece.min[1]===placement.origin[1]);assert.ok(bottom.length>0,`${spec.id}: occupied feet reach their stated support level`);
      for(const piece of pieces){
        const previous=owners.get(piece);if(previous&&previous!==spec.id)fail(`owner:${spec.id}`,`${previous}/${spec.id}: solid belongs to overlapping placements`);
        owners.set(piece,spec.id);piece.owner=spec.id;
        for(const other of fixed)if(overlaps(piece,other))fail(`fixed:${spec.id}:${other.owner}`,`${spec.id}: solid ${piece.min}/${piece.max} intersects fixed ${other.owner} ${other.min}/${other.max}`);
      }
      for(const piece of bottom)for(let z=piece.min[2]+.5;z<piece.max[2];z++)for(let x=piece.min[0]+.5;x<piece.max[0];x++){
        if(support&&(support.y!==placement.origin[1]||x<support.rect[0]||x>support.rect[0]+support.rect[2]||z<support.rect[1]||z>support.rect[1]+support.rect[3]))
          fail(`support:${spec.id}`,`${spec.id}: occupied base voxel ${x},${z} escapes declared support ${support.id}`);
        if(!fixed.some(other=>other.max[1]===placement.origin[1]&&x>=other.min[0]&&x<other.max[0]&&z>=other.min[2]&&z<other.max[2]))
          fail(`floating:${spec.id}`,`${spec.id}: base voxel ${x},${placement.origin[1]},${z} has no actual solid below it`);
      }
    }
    assert.equal(owners.size,dynamic.length,'Every dynamic collision box is contained in exactly one actual approved prop');
    for(let i=0;i<dynamic.length;i++)for(let j=i+1;j<dynamic.length;j++)if(overlaps(dynamic[i],dynamic[j]))
      fail(`overlap:${dynamic[i].owner}:${dynamic[j].owner}`,`${dynamic[i].owner}/${dynamic[j].owner}: actual occupied collision boxes intersect`);
    for(const room of layout.rooms.filter(row=>row.id!=='prep'))if(!world.nav.some(node=>node.room===room.name))fail(`room:${room.id}`,`${room.id}: randomization disconnected the approved room`);
    for(const entrance of layout.validation.hideEntrances)if(!world.nav.some(node=>node.hide&&(node as typeof node&{furniture?:string}).furniture===entrance.furniture))
      fail(`hide:${entrance.furniture}`,`${entrance.furniture}: randomization removed an approved hiding entrance`);
    assert.equal(failures.size,0,'Baseline and accepted variants must retain real support and disjoint solid occupancy:\n'+[...failures.values()].join('\n'));
  });
}
