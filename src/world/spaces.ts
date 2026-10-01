import type { RoomZone } from '../contracts.ts';
import { layout } from './design-layout.ts';

/** Shared spatial facts for visible fences, physics, ground cover, navigation and room labels. */
export const gardenBounds = { x: 608, z: 544, thickness: 8 } as const;
export const roomZones:RoomZone[]=layout.rooms.map(room=>({
  name:room.name,min:[room.bounds[0],room.floor*128,room.bounds[1]],
  max:[room.bounds[0]+room.bounds[2],room.id==='stairs'?256:(room.floor+1)*128,room.bounds[1]+room.bounds[3]],
}));

/** Fixed room membership for lighting; camera rotation never changes a surface's light set. */
export function sampleRoomPosition(p:{x:number;y:number;z:number}):boolean {
  const [x,z,w,d]=layout.boundaries.house,wall=layout.boundaries.wallThickness;
  const insideHouse=p.x>x+wall&&p.x<x+w-wall&&p.z>z+wall&&p.z<z+d-wall;
  const stairs=layout.rooms.find(room=>room.id==='stairs')!.bounds;
  const onStairs=p.x>=stairs[0]&&p.x<stairs[0]+stairs[2]&&p.z>=stairs[1]&&p.z<stairs[1]+stairs[3];
  if(insideHouse&&((p.y>=0&&p.y<120)||(p.y>=128&&p.y<248)||(onStairs&&p.y>=0&&p.y<248)))return true;
  const prep=layout.rooms.find(room=>room.id==='prep')!.bounds;
  return p.x>=prep[0]&&p.x<prep[0]+prep[2]&&p.z>=prep[1]&&p.z<prep[1]+prep[3]&&p.y>=0&&p.y<layout.boundaries.preparationRoofY-wall;
}
