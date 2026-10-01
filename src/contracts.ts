import type * as THREE from 'three';
export type Vec3 = [number, number, number];
export type Role = 'hunter' | 'hider';
export type RolePreference = Role | 'random';
export type WeaponId = 'knife' | 'pistol' | 'smg' | 'shotgun';
export type Phase = 'menu' | 'practice' | 'preparation' | 'hunt' | 'reveal' | 'sessionEnd';
export interface WorldBox { center: Vec3; size: Vec3; kind: 'wall' | 'floor' | 'furniture' | 'prop' | 'boundary'; room: string; }
export interface NavPoint { position: Vec3; links: number[]; room: string; hide?: boolean; }
export interface RoomZone {name:string;min:Vec3;max:Vec3;}
export interface MapWorld { group:THREE.Group; colliders:WorldBox[]; nav:NavPoint[]; rooms:RoomZone[]; hiderSpawn:Vec3; hunterSpawn:Vec3; lobbySpawn:Vec3; menuCamera:Vec3; menuTarget:Vec3; randomize:(seed:number,ratio:number)=>void; dispose:()=>void; }
export type VoxelFace = 'px'|'nx'|'py'|'ny'|'pz'|'nz';
export interface VoxelCell { x:number;y:number;z:number;color:string;faceColors?:Partial<Record<VoxelFace,string>>; }
export interface VoxelPart { id:string;name:string;cells:VoxelCell[];position:Vec3;rotation:Vec3; }
export interface VoxelModel { version:1|2;name:string;parts:VoxelPart[];pivot:Vec3; }
export interface ModelBounds { min:Vec3;max:Vec3; }
export interface EditorHooks { getPosition:()=>THREE.Vector3; getYaw:()=>number; validate:(candidate:VoxelModel,previous:VoxelModel)=>{valid:boolean;reason?:string}; onChange:(model:VoxelModel)=>void; onClose:()=>void; notify:(message:string)=>void; }
export interface HunterPose { speed:number; sprint:boolean; grounded:boolean; crouch:boolean; aim:boolean; pitch:number; turn:number; weapon:WeaponId; shot:number; reload:number; melee:number; hurt:number; dead:number; knockdown?:number; switchWeapon:number; }
export interface HunterRig { group:THREE.Group; update:(dt:number,pose:HunterPose)=>void; setFirstPerson:(enabled:boolean)=>void; dispose:()=>void; }
export interface WeaponSpec { id:WeaponId;name:string;damage:number;penalty:number;magazine:number;reserve:number;interval:number;reload:number;range:number;spread:number;pellets:number;recoil:number; }
export interface GameSettings { players:number;hunters:number;preparationSeconds:number;huntSeconds:number;randomRatio:number;forcedTauntSeconds:number;role:RolePreference;gun:Exclude<WeaponId,'knife'>;volume:number;musicVolume:number;sensitivity:number;quality:'high'|'medium'; }
export interface ActorState { id:number;name:string;role:Role;position:THREE.Vector3;velocity:THREE.Vector3;yaw:number;hp:number;alive:boolean;score:number;total:number;model:VoxelModel; }
