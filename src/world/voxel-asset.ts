import * as THREE from 'three';
import type { Vec3, VoxelModel, WorldBox } from '../contracts.ts';
import { newPartId } from '../voxel/model.ts';

/** Local integer occupancy, with empty cells at index 0 and colors in palette[1..]. */
export interface VoxelAsset {
  size:Vec3;
  cells:Uint16Array;
  palette:string[];
}

function sizeVolume(size:Vec3):number {
  if(!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isSafeInteger(n)||n<=0))throw new RangeError('Voxel size must contain three positive integers');
  const volume=size[0]*size[1]*size[2];
  if(!Number.isSafeInteger(volume)||volume>0xffffffff)throw new RangeError('Voxel occupancy exceeds typed-array capacity');
  return volume;
}

function checkedColor(color:string):string {
  if(typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw new TypeError('Voxel colors must use #rrggbb');
  return color.toLowerCase();
}

/** Validate shared data once before a consumer touches its indexed occupancy. */
function validateAsset(asset:VoxelAsset):number {
  const volume=sizeVolume(asset.size);
  if(!(asset.cells instanceof Uint16Array)||asset.cells.length!==volume)throw new RangeError('Voxel occupancy length does not match its size');
  if(!Array.isArray(asset.palette)||asset.palette.length<1||asset.palette.length>65536)throw new RangeError('Voxel palette must contain an empty slot and at most 65535 colors');
  for(let index=1;index<asset.palette.length;index++)checkedColor(asset.palette[index]);
  let occupied=0;
  for(let index=0;index<asset.cells.length;index++){
    const cell=asset.cells[index];
    if(cell>=asset.palette.length)throw new RangeError('Voxel occupancy references a missing palette color');
    if(cell)occupied++;
  }
  return occupied;
}

export class VoxelBuilder {
  private readonly dimensions:Vec3;
  private readonly occupancy:Uint16Array;
  private readonly palette:string[]=[''];
  private readonly colorIndices=new Map<string,number>();

  constructor(size:Vec3){
    this.occupancy=new Uint16Array(sizeVolume(size));
    this.dimensions=[...size];
  }

  private checkRegion(x:number,y:number,z:number,w:number,h:number,d:number):void {
    if(![x,y,z,w,h,d].every(Number.isSafeInteger)||x<0||y<0||z<0||w<0||h<0||d<0||x+w>this.dimensions[0]||y+h>this.dimensions[1]||z+d>this.dimensions[2])throw new RangeError('Voxel box must use nonnegative integers within the asset size');
  }

  private fill(x:number,y:number,z:number,w:number,h:number,d:number,value:number):void {
    const [sx,sy]=this.dimensions;
    for(let layer=z;layer<z+d;layer++)for(let row=y;row<y+h;row++){
      const start=(layer*sy+row)*sx+x;
      this.occupancy.fill(value,start,start+w);
    }
  }

  /** Paint an integer box. Zero extents are valid empty operations. */
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string):this {
    this.checkRegion(x,y,z,w,h,d);
    const normalized=checkedColor(color);
    if(!w||!h||!d)return this;
    let value=this.colorIndices.get(normalized);
    if(value===undefined){
      if(this.palette.length===65536)throw new RangeError('Voxel palette exceeds 65535 colors');
      value=this.palette.length;this.palette.push(normalized);this.colorIndices.set(normalized,value);
    }
    this.fill(x,y,z,w,h,d,value);
    return this;
  }

  carve(x:number,y:number,z:number,w:number,h:number,d:number):this {
    this.checkRegion(x,y,z,w,h,d);
    if(w&&h&&d)this.fill(x,y,z,w,h,d,0);
    return this;
  }

  /** Return a snapshot so a later edit or consumer cannot change another asset. */
  finish():VoxelAsset {
    return {size:[...this.dimensions],cells:this.occupancy.slice(),palette:[...this.palette]};
  }
}

/** Indexed greedy surface mesh: only exposed faces, merged when their color agrees. */
export function buildVoxelGeometry(asset:VoxelAsset):THREE.BufferGeometry {
  const occupied=validateAsset(asset),positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
  const dimensions=asset.size,[sx,sy]=dimensions,strides=[1,sx,sx*sy];
  const tints=asset.palette.map((color,index)=>index?new THREE.Color(color):new THREE.Color());

  const quad=(axis:number,u:number,v:number,plane:number,i:number,j:number,w:number,h:number,cell:number)=>{
    const vertex=positions.length/3,sign=cell>0?1:-1,tint=tints[Math.abs(cell)],point:Vec3=[0,0,0],normal:Vec3=[0,0,0];
    point[axis]=plane;normal[axis]=sign;
    for(const [a,b] of [[i,j],[i+w,j],[i+w,j+h],[i,j+h]]){
      point[u]=a;point[v]=b;positions.push(...point);normals.push(...normal);colors.push(tint.r,tint.g,tint.b);
    }
    if(sign>0)indices.push(vertex,vertex+1,vertex+2,vertex,vertex+2,vertex+3);
    else indices.push(vertex,vertex+3,vertex+2,vertex,vertex+2,vertex+1);
  };

  if(occupied)for(let axis=0;axis<3;axis++){
    // Cyclic axes ensure e_u x e_v points along the positive face normal.
    const u=(axis+1)%3,v=(axis+2)%3,width=dimensions[u],height=dimensions[v],mask=new Int32Array(width*height);
    for(let layer=-1;layer<dimensions[axis];layer++){
      let offset=0;
      for(let j=0;j<height;j++)for(let i=0;i<width;i++){
        const index=i*strides[u]+j*strides[v]+layer*strides[axis];
        const before=layer<0?0:asset.cells[index],after=layer+1>=dimensions[axis]?0:asset.cells[index+strides[axis]];
        // Color changes inside solid occupancy never create internal surfaces.
        mask[offset++]=before&&after?0:before?before:-after;
      }
      for(let j=0;j<height;j++)for(let i=0;i<width;){
        const start=j*width+i,cell=mask[start];
        if(!cell){i++;continue;}
        let w=1,h=1;
        while(i+w<width&&mask[start+w]===cell)w++;
        rows:while(j+h<height){
          for(let column=0;column<w;column++)if(mask[start+h*width+column]!==cell)break rows;
          h++;
        }
        quad(axis,u,v,layer+1,i,j,w,h,cell);
        for(let row=0;row<h;row++)mask.fill(0,start+row*width,start+row*width+w);
        i+=w;
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/** Disjoint solid cuboids in world space; color boundaries do not split collision. */
export function voxelCollisionBoxes(asset:VoxelAsset,origin:Vec3,kind:WorldBox['kind'],room:string):WorldBox[] {
  const occupied=validateAsset(asset);
  if(!Array.isArray(origin)||origin.length!==3||origin.some(n=>!Number.isFinite(n)))throw new RangeError('Voxel collision origin must contain three finite coordinates');
  const boxes:WorldBox[]=[];
  if(!occupied)return boxes;
  const [sx,sy,sz]=asset.size,cells=asset.cells,claimed=new Uint8Array(cells.length),slice=sx*sy;
  const free=(index:number)=>cells[index]!==0&&claimed[index]===0;
  // Claim broad upper slabs first, then their supports, to keep tables at five boxes.
  for(let y=sy-1;y>=0;y--)for(let z=0;z<sz;z++)for(let x=0;x<sx;){
    const start=z*slice+y*sx+x;
    if(!free(start)){x++;continue;}
    let w=1,d=1,h=1;
    while(x+w<sx&&free(start+w))w++;
    depths:while(z+d<sz){
      for(let column=0;column<w;column++)if(!free(start+d*slice+column))break depths;
      d++;
    }
    layers:while(y-h>=0){
      for(let depth=0;depth<d;depth++)for(let column=0;column<w;column++)if(!free(start-h*sx+depth*slice+column))break layers;
      h++;
    }
    const minY=y-h+1;
    for(let depth=0;depth<d;depth++)for(let row=0;row<h;row++){
      const index=(z+depth)*slice+(minY+row)*sx+x;
      claimed.fill(1,index,index+w);
    }
    boxes.push({center:[origin[0]+x+w/2,origin[1]+minY+h/2,origin[2]+z+d/2],size:[w,h,d],kind,room});
    x+=w;
  }
  return boxes;
}

/** Export small assets in the same unscaled format used by the disguise editor. */
export function assetToModel(asset:VoxelAsset,name:string):VoxelModel {
  const occupied=validateAsset(asset);
  if(asset.size.some(n=>n>32))throw new RangeError('Disguise assets must fit within 32 x 32 x 32 voxels');
  if(!occupied)throw new RangeError('A disguise model must contain at least one voxel');
  const [sx,sy,sz]=asset.size,part:VoxelModel['parts'][number]={id:newPartId(),name,cells:[],position:[0,0,0],rotation:[0,0,0]};
  for(let z=0;z<sz;z++)for(let y=0;y<sy;y++)for(let x=0;x<sx;x++){
    const cell=asset.cells[(z*sy+y)*sx+x];
    if(cell)part.cells.push({x,y,z,color:asset.palette[cell]});
  }
  return {version:2,name,parts:[part],pivot:[sx/2,0,sz/2]};
}
