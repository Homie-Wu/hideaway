import type {WorldBox} from '../contracts.ts';
import type {DesignSupport} from './design-layout.ts';
import type {AssetPlacement} from './voxel-scene.ts';

/** Validate the whole slot against real occupied surfaces; a bad baseline is never a randomization fallback. */
export function placementProblem(p:AssetPlacement,support:DesignSupport|undefined,fixed:WorldBox[],neighbours:AssetPlacement[]):string|null {
  const [x,y,z]=p.origin,[w,h,d]=p.size;
  if(support){
    if(y!==support.y)return `支撑高度不符：${support.id}`;
    const [sx,sz,sw,sd]=support.rect;
    if(x<sx||z<sz||x+w>sx+sw||z+d>sz+sd)return `越出支撑表面：${support.id}`;
  }
  const solid=fixed.find(b=>p.origin.every((v,i)=>v+p.size[i]>b.center[i]-b.size[i]/2+.001&&v<b.center[i]+b.size[i]/2-.001));
  if(solid)return `撞入实体 ${solid.kind}/${solid.room}：${solid.center}/${solid.size}`;
  const neighbour=neighbours.find(b=>p.id!==b.id&&p.origin.every((v,i)=>v+p.size[i]>b.origin[i]&&v<b.origin[i]+b.size[i]));
  if(neighbour)return `与物品 ${neighbour.id} 重叠`;
  const surfaces=fixed.filter(b=>Math.abs(b.center[1]+b.size[1]/2-y)<.01&&b.center[0]+b.size[0]/2>x&&b.center[0]-b.size[0]/2<x+w&&b.center[2]+b.size[2]/2>z&&b.center[2]-b.size[2]/2<z+d);
  for(let dx=0;dx<w;dx++)for(let dz=0;dz<d;dz++)if(!surfaces.some(b=>Math.abs(x+dx+.5-b.center[0])<=b.size[0]/2&&Math.abs(z+dz+.5-b.center[2])<=b.size[2]/2))return '没有连续实体支撑';
  return null;
}
