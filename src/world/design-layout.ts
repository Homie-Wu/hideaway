import raw from './layout.json' with {type:'json'};
import type {Vec3} from '../contracts.ts';
export type Rect = [number,number,number,number];
export interface DesignRoom {id:string;name:string;floor:number;bounds:Rect;palette:string[];description:string;}
export interface DesignHide {rect:Rect;y:number;clearHeight:number;maxModel:number;access:string;note:string;}
export interface DesignSupport {id:string;rect:Rect;y:number;}
export interface DesignFurniture {id:string;room:string;name:string;kind:string;rect:Rect;y:number;height:number;color:string;yaw:number;facing?:string;headSide?:string;carFrontSide?:string;artTheme?:string;material?:string;purpose?:string;mount?:string;hide?:DesignHide;supports:DesignSupport[];mimickable?:boolean;useClearance?:{rect:Rect;y:number;height:number;purpose:string};}
export interface DesignProp {id:string;room:string;name:string;rect:Rect;y:number;height:number;color:string;support:string;yaw:number;mimickable:boolean;randomizable:boolean;maxSize:Vec3;variants:{id:string;name:string;size:Vec3}[];}
export interface DesignDoor {id:string;floor:number;axis:'x'|'z';center:[number,number];width:number;rooms:string[];kind?:string;}
export interface DesignWindow {id:string;floor:number;axis:'x'|'z';center:[number,number];width:number;sill:number;height:number;room:string;}
export interface DesignRoute {id:string;room:string;floor:number;width:number;points:[number,number][];}
export interface DesignLayout {
 meta:{title:string;id:string};rooms:DesignRoom[];furniture:DesignFurniture[];props:DesignProp[];doors:DesignDoor[];windows:DesignWindow[];routes:DesignRoute[];
 boundaries:{house:Rect;garden:Rect;preparation:Rect;wallThickness:number;preparationRoofY:number};
 stairs:{floorHeight:number;riser:number;tread:number;flightWidth:number;lowerFlight:{rect:Rect;steps:number};upperFlight:{rect:Rect;steps:number};intermediate:{rect:Rect;y:number};lowerLanding:{rect:Rect;y:number};upperLanding:{rect:Rect;y:number};floorOpening:Rect};
 spawns:{hider:Vec3;hunterRelease:Vec3;hunterPreparation:Vec3;preparationSlots:Vec3[];menuCamera:Vec3;menuTarget:Vec3};
 lights:{room:string;position:Vec3;color:string;fixtureSize:Vec3}[];decor:{room:string;kind:string;rect:Rect;color:string;blocking:boolean}[];
 preparationFeatures:{weaponStation:{furniture:string;weapons:string[];interaction:Vec3;activationDistance:number};firingRange:{rect:Rect;shootingLineX:number;shootDirection:string;targets:Vec3[];backstop:string;note:string}};
 validation:{hideEntrances:{furniture:string;entry:[number,number,string];model:number;modelWithMargin:number;[key:string]:unknown}[]};
}
export const layout = raw as unknown as DesignLayout;
export const floorY = (room:DesignRoom) => room.floor * 128;
export const designRoom = (id:string) => layout.rooms.find(room=>room.id===id)!;
