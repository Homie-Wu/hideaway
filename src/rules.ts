import type {ModelBounds,Phase,Role,Vec3} from './contracts.ts';
import {layout} from './world/design-layout.ts';

export function canTauntPhase(phase:Phase,forced=false):boolean {
 return phase==='hunt'||phase==='practice'&&!forced;
}

/** Inner wall faces and roof from the preparation room's actual layout. */
const [prepX,prepZ,prepW,prepD]=layout.boundaries.preparation,wall=layout.boundaries.wallThickness;
export const PREPARATION_ROOM={minX:prepX+wall,maxX:prepX+prepW-wall,minZ:prepZ+wall,maxZ:prepZ+prepD-wall,minY:0,maxY:layout.boundaries.preparationRoofY} as const;

/** The whole enclosed room permits practice shots in every valid direction. */
export function canPracticeShoot(position:Vec3,direction:Vec3):boolean {
 const room=PREPARATION_ROOM;
 return position.every(Number.isFinite)&&direction.every(Number.isFinite)&&direction.some(value=>value!==0)&&position[0]>=room.minX&&position[0]<=room.maxX&&position[2]>=room.minZ&&position[2]<=room.maxZ&&position[1]>=room.minY&&position[1]<room.maxY;
}

/** Check the entire yaw-rotated collider, rather than letting its center cross a wall first. */
export function needsPreparationReturn(phase:Phase,role:Role,position:Vec3,bounds:ModelBounds,yaw=0):boolean {
 if(phase!=='preparation'||role!=='hunter')return false;
 const c=Math.cos(yaw),s=Math.sin(yaw);
 const localX=(bounds.min[0]+bounds.max[0])/2,localZ=(bounds.min[2]+bounds.max[2])/2;
 const halfX=(bounds.max[0]-bounds.min[0])/2,halfZ=(bounds.max[2]-bounds.min[2])/2;
 const x=position[0]+c*localX+s*localZ,z=position[2]-s*localX+c*localZ;
 const extentX=Math.abs(c)*halfX+Math.abs(s)*halfZ,extentZ=Math.abs(s)*halfX+Math.abs(c)*halfZ;
 return x-extentX<PREPARATION_ROOM.minX||x+extentX>PREPARATION_ROOM.maxX||z-extentZ<PREPARATION_ROOM.minZ||z+extentZ>PREPARATION_ROOM.maxZ||position[1]+bounds.min[1]<PREPARATION_ROOM.minY||position[1]+bounds.max[1]>PREPARATION_ROOM.maxY;
}
