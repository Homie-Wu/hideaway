import { designRoom, type DesignFurniture } from './design-layout.ts';
import { VoxelBuilder, type VoxelAsset } from './voxel-asset.ts';

type Side='北'|'东'|'南'|'西';
const ceramic='#edf0e8',metal='#d1dfe0',darkMetal='#293139';
const shade=(color:string,amount:number)=>'#'+[1,3,5].map(index=>Math.max(0,Math.min(255,parseInt(color.slice(index,index+2),16)+amount)).toString(16).padStart(2,'0')).join('');
const side=(text:string|undefined):Side|undefined=>text?.includes('东')?'东':text?.includes('西')?'西':text?.includes('南')?'南':text?.includes('北')?'北':undefined;

function facing(spec:DesignFurniture):Side {
  if(side(spec.facing))return side(spec.facing)!;
  if((spec.kind==='shelf'||spec.kind==='sofa')&&side(spec.hide?.access))return side(spec.hide?.access)!;
  const defaults:Record<string,Side>={K01:'南',K02:'南',K03:'西',D06:'南',D07:'东',L04:'南',F02:'西',F03:'西',R06:'西'};
  return defaults[spec.id]??(['北','东','南','西'] as Side[])[Math.round(spec.yaw/90)%4];
}

/** Boxes are placed directly inside the approved world-aligned footprint. */
class Recipe {
  readonly builder:VoxelBuilder;
  readonly w:number;readonly h:number;readonly d:number;
  readonly front:Side;readonly width:number;readonly depth:number;
  readonly main:string;readonly edge:string;readonly light:string;readonly accent:string;readonly fabric:string;
  readonly spec:DesignFurniture;
  constructor(spec:DesignFurniture){
    this.spec=spec;
    [this.w,this.d]=[spec.rect[2],spec.rect[3]];this.h=spec.height;
    this.builder=new VoxelBuilder([this.w,this.h,this.d]);this.front=facing(spec);
    [this.width,this.depth]=this.front==='北'||this.front==='南'?[this.w,this.d]:[this.d,this.w];
    this.main=spec.color;this.edge=shade(spec.color,-28);this.light=shade(spec.color,20);
    const palette=designRoom(spec.room).palette;
    this.accent=palette[1];this.fabric=palette[0];
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color=this.main):void {this.builder.box(x,y,z,w,h,d,color);}
  cut(x:number,y:number,z:number,w:number,h:number,d:number):void {this.builder.carve(x,y,z,w,h,d);}
  plane(u:number,y:number,v:number,w:number,h:number,d:number,color=this.main):void {
    if(this.front==='北')this.box(u,y,v,w,h,d,color);
    else if(this.front==='南')this.box(this.w-u-w,y,this.d-v-d,w,h,d,color);
    else if(this.front==='东')this.box(this.w-v-d,y,u,d,h,w,color);
    else this.box(v,y,this.d-u-w,d,h,w,color);
  }
  clearPlane(u:number,y:number,v:number,w:number,h:number,d:number):void {
    if(this.front==='北')this.cut(u,y,v,w,h,d);
    else if(this.front==='南')this.cut(this.w-u-w,y,this.d-v-d,w,h,d);
    else if(this.front==='东')this.cut(this.w-v-d,y,u,d,h,w);
    else this.cut(v,y,this.d-u-w,d,h,w);
  }
  legs(top:number,thickness=4,color=this.edge):void {
    for(const x of [0,this.w-thickness])for(const z of [0,this.d-thickness])this.box(x,0,z,thickness,top,thickness,color);
  }
  slab(top:number,thickness=4,color=this.main,inset=0):void {this.box(inset,top-thickness,inset,this.w-inset*2,thickness,this.d-inset*2,color);}
}

function table(r:Recipe):void {
  const clearance=r.spec.hide?r.spec.hide.y-r.spec.y+r.spec.hide.clearHeight:r.h-8;
  const thickness=Math.min(8,r.h-clearance);
  r.legs(r.h-thickness);r.slab(r.h,thickness);
  // A narrow inset border remains part of the tabletop rather than sitting above it.
  r.box(0,r.h-1,0,r.w,1,2,r.light);r.box(0,r.h-1,r.d-2,r.w,1,2,r.light);
  r.box(0,r.h-1,2,2,1,r.d-4,r.light);r.box(r.w-2,r.h-1,2,2,1,r.d-4,r.light);
  // Wood planks and knots are colors within the tabletop, so nothing floats above its support plane.
  for(let z=8;z<r.d-4;z+=8)r.box(2,r.h-1,z,r.w-4,1,1,r.edge);
  for(let x=10;x<r.w-8;x+=24)r.box(x,r.h-1,Math.min(r.d-4,5+(x%3)*8),5,1,2,r.light);
  for(const x of [0,r.w-4])for(const z of [0,r.d-4]){
    r.box(x,0,z,4,3,4,r.edge);
    r.box(x,r.h-thickness-4,z,4,4,4,r.light);
  }
  if(r.spec.id==='K04')for(const x of [0,r.w-4])for(const z of [0,r.d-4])r.box(x,0,z,4,8,4,metal);
}

function shelf(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.plane(0,0,d-2,w,h,2,r.edge);
  r.plane(0,0,0,2,h,d);r.plane(w-2,0,0,2,h,d);
  r.slab(8,4,r.edge,2);
  const declared=r.spec.supports.map(s=>s.y-r.spec.y);
  const hide=r.spec.hide,first=declared.length?Math.min(...declared):hide?hide.y-r.spec.y+hide.clearHeight+4:40;
  const levels=new Set([8,...declared,h]);
  if(!declared.length)for(let top=first;top<h-4;top+=40)levels.add(top);
  for(const top of [...levels].sort((a,b)=>a-b))r.slab(top,4,top===h?r.light:r.main,top===h?0:2);
  // Structural bay boundaries are always measured from the low world-coordinate edge.
  // Slot rectangles fit these bays; the asset never changes its structure to fit a placed prop.
  for(let offset=48;offset<w-4;offset+=48){
    if(r.front==='北'||r.front==='南')r.box(offset,first,2,2,h-first-4,r.d-4,r.edge);
    else r.box(2,first,offset,r.w-4,h-first-4,2,r.edge);
  }
  for(const top of levels){
    if(top<=8)continue;
    r.plane(2,top-3,0,w-4,2,2,r.light);
    for(let u=8;u<w-4;u+=24)r.plane(u,top-8,d-3,3,4,1,r.edge);
  }
  for(let u=8;u<w-4;u+=12)r.plane(u,8,d-2,1,h-12,1,r.light);
  if(r.spec.room==='bathroom'){
    r.plane(0,h-4,0,w,4,2,metal);r.plane(0,0,0,2,h,2,metal);r.plane(w-2,0,0,2,h,2,metal);
  }
}

function seat(r:Recipe,upholstered:boolean):void {
  const {width:w,depth:d,h}=r;
  if(!upholstered){
    r.legs(28,3);r.slab(32,4);r.slab(33,1,r.light,3);
    r.plane(0,28,d-3,3,h-28,3,r.edge);r.plane(w-3,28,d-3,3,h-28,3,r.edge);
    r.plane(0,h-5,d-3,w,5,3,r.light);
    for(let u=6;u<w-5;u+=6)r.plane(u,38,d-3,2,h-43,3);
    return;
  }
  const base= Math.max(16,r.spec.hide?r.spec.hide.clearHeight:16);
  r.legs(base,4,darkMetal);r.slab(base+8,8,r.edge);
  r.plane(6,base+8,3,w-12,8,d-9);
  r.plane(0,base,d-6,w,h-base,6,r.edge);
  r.plane(4,base+16,d-8,w-8,h-base-18,4,r.light);
  r.plane(0,base,0,6,28,d-6);r.plane(w-6,base,0,6,28,d-6);
  const segments=r.spec.kind==='sofa'?3:1,span=Math.floor((w-12)/segments);
  for(let segment=1;segment<segments;segment++)r.plane(6+segment*span,base+8,3,1,8,d-9,r.edge);
  // A small square throw cushion adds a recognizable fabric detail below the backrest cap.
  r.plane(8,base+16,d-16,Math.min(16,w-16),11,7,r.accent);
}

function bed(r:Recipe):void {
  const {w,h,d}=r,head=side(r.spec.headSide)??'北',north=head==='北',car=Boolean(r.spec.carFrontSide);
  const frame=18,mattress=34,duvet=38,pillow=44,inset=car?12:4;
  // A normal bed supports a low mattress; only small disguises fit beneath the eighteen-unit frame.
  r.legs(frame,4,r.edge);r.slab(frame+4,4,r.edge);
  r.box(inset,frame+4,4,w-inset*2,mattress-frame-4,d-8,ceramic);
  r.box(inset,frame+6,4,w-inset*2,1,d-8,r.light);
  const pillowZ=north?9:d-29,pillowWidth=Math.floor((w-32)/2);
  for(const x of [12,w-12-pillowWidth]){
    r.box(x,mattress,pillowZ,pillowWidth,pillow-mattress,20,ceramic);
    r.box(x+2,pillow-1,pillowZ+2,pillowWidth-4,1,16,'#ffffff');
  }
  const blanketZ=north?36:12,blanketDepth=d-48;
  r.box(inset+2,mattress,blanketZ,w-inset*2-4,duvet-mattress,blanketDepth);
  r.box(inset+2,duvet-2,north?36:d-42,w-inset*2-4,2,5,r.accent);
  for(const x of [inset,inset===4?w-8:w-16])r.box(x,30,blanketZ,4,duvet-30,blanketDepth);
  // Broad fabric fields with a few stitched seams remain readable without a noisy grid of pixels.
  for(let z=blanketZ+22;z<blanketZ+blanketDepth-8;z+=28)r.box(inset+4,duvet-1,z,w-inset*2-8,1,1,r.light);
  const headZ=north?0:d-6,footZ=north?d-4:0;
  r.box(0,0,headZ,w,h,6,r.edge);
  r.box(4,30,north?4:d-6,w-8,h-34,2,r.main);
  r.box(0,h-4,headZ,w,4,6,r.light);
  for(let x=14;x<w-8;x+=20)r.box(x,34,north?5:d-6,2,h-42,1,r.light);
  if(!car){
    r.box(0,frame,0,4,10,d,r.edge);r.box(w-4,frame,0,4,10,d,r.edge);
    r.box(0,frame,footZ,w,12,4,r.main);r.box(0,28,footZ,w,2,4,r.light);return;
  }
  // The car is a grounded low body, with broad side panels touching the axle and tires.
  for(const x of [0,w-8])for(const z of [6,d-30]){
    r.box(x,6,z,8,12,24,darkMetal);r.box(x,2,z+4,8,22,16,darkMetal);
    r.box(x===0?0:w-2,9,z+8,2,8,8,metal);
  }
  for(const x of [4,w-12])r.box(x,8,6,8,20,d-12,r.main);
  for(const x of [8,w-10])r.box(x,27,32,2,3,d-64,r.light);
  const front=side(r.spec.carFrontSide)??'北',frontZ=front==='北'?0:d-16;
  r.box(8,8,frontZ,w-16,20,16,r.main);
  r.box(14,28,front==='北'?0:d-12,w-28,4,12,r.light);
  for(const x of [14,w-26])r.box(x,23,front==='北'?1:d-4,12,4,3,ceramic);
  r.box(32,14,front==='北'?0:d-2,w-64,6,2,darkMetal);
  for(let x=36;x<w-34;x+=8)r.box(x,15,front==='北'?0:d-1,3,4,1,metal);
}

function cabinet(r:Recipe,top=r.h):void {
  const {width:w,depth:d}=r,h=top;
  r.legs(6,3);r.slab(8,4,r.edge);
  r.plane(0,6,2,3,h-6,d-2,r.edge);r.plane(w-3,6,2,3,h-6,d-2,r.edge);
  r.plane(3,6,d-3,w-6,h-6,3,r.edge);r.slab(h,4,r.light);
  for(let top=32;top<h-8;top+=28)r.slab(top,3,r.edge,3);
  const bays=Math.max(1,Math.ceil(w/48)),bay=Math.floor((w-6)/bays);
  for(let i=0;i<bays;i++){
    const u=3+i*bay,width=i===bays-1?w-3-u:bay;
    r.plane(u,8,1,width-1,h-12,3);
    r.plane(u+2,10,0,width-5,Math.max(4,h-24),1,r.light);
    // Recessed frames, separate drawer seams and short pixel grain make the face readable at play distance.
    r.plane(u+3,11,0,width-7,2,1,r.edge);r.plane(u+3,h-20,0,width-7,2,1,r.edge);
    for(let stripe=u+6;stripe<u+width-4;stripe+=8)r.plane(stripe,14,0,1,Math.max(2,h-36),1,r.main);
    // Brass handles have volume inside the first layer of the footprint.
    r.plane(u+Math.max(2,width-8),Math.floor(h/2),0,3,8,2,r.accent);
    if(h<70){
      r.plane(u,h-16,0,width-1,1,2,r.edge);
      r.plane(u+Math.max(3,Math.floor(width/2)-4),h-11,0,8,2,2,r.accent);
    }else{
      r.plane(u+4,12,0,Math.max(2,width-10),2,1,r.edge);
      r.plane(u+4,h-8,0,Math.max(2,width-10),2,1,r.edge);
      r.plane(u+Math.max(2,width-8),Math.floor(h/2)-2,0,3,12,2,metal);
    }
  }
}

function kitchen(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  if(r.spec.kind==='fridge'){
    r.box(2,0,2,r.w-4,h,r.d-4,r.edge);
    r.plane(0,2,2,2,h-2,d-2,r.light);r.plane(w-2,2,2,2,h-2,d-2,r.light);
    r.plane(2,2,1,w-4,h-4,2);r.slab(h,2,r.light);
    const split=Math.floor(h*.63);
    r.plane(2,split,0,w-4,2,2,darkMetal);
    r.plane(2,2,0,w-4,split-2,1,r.light);
    r.plane(2,split+2,0,w-4,h-split-4,1,r.light);
    r.plane(6,split-24,0,3,20,3,metal);r.plane(6,split+6,0,3,17,3,metal);
    r.plane(5,split-22,0,1,16,1,darkMetal);r.plane(5,split+8,0,1,13,1,darkMetal);
    // Feet, kick grille, freezer seam, hinges and door magnets all follow the declared front.
    r.plane(0,0,0,w,3,d,darkMetal);
    for(let u=5;u<w-3;u+=4)r.plane(u,3,0,2,3,1,r.edge);
    for(const y of [split-3,h-7])r.plane(w-4,y,0,2,3,2,metal);
    r.plane(w-15,h-20,0,6,6,1,r.fabric);r.plane(w-22,h-27,0,5,5,1,'#d95336');
    r.plane(w-17,14,0,6,5,1,r.accent);
    r.plane(w-23,30,0,13,10,1,ceramic);r.plane(w-21,35,0,8,1,1,r.edge);return;
  }
  const top=r.spec.kind==='counter'&&r.spec.supports.length?Math.min(...r.spec.supports.map(s=>s.y-r.spec.y)):h;
  cabinet(r,top);
  r.slab(top,4,r.spec.kind==='counter'?r.accent:metal);
  // Exposed bevels retain the room's main cabinet color.
  r.box(0,top-1,0,r.w,1,2,r.main);r.box(0,top-1,r.d-2,r.w,1,2,r.main);
  if(r.spec.kind==='counter'){
    // The countertop's support plane stays fixed while the tap has its own raised silhouette.
    const start=Math.floor(r.w*.58);
    for(const x of [start,start+34]){
      r.box(x,top-8,8,30,8,24,metal);r.cut(x+2,top-7,10,26,7,20);
      r.box(x+12,top-7,17,6,1,6,darkMetal);
      for(let z=14;z<27;z+=6)r.box(x+2,top-6,z,2,1,8,r.edge);
    }
    const tapX=start+31,tapTop=Math.min(h,top+16);
    r.box(tapX,top,2,2,tapTop-top,4,metal);
    r.box(tapX,tapTop-4,2,2,4,12,metal);
    r.box(tapX,tapTop-6,12,2,2,2,r.edge);
    r.box(tapX-5,top,2,4,3,4,metal);r.box(tapX+3,top,2,4,3,4,metal);
    return;
  }
  // Burner rings are stepped square rings rather than smooth cylinder meshes.
  for(const u of [14,w-30])for(const v of [7,d-21]){
    r.plane(u,h-2,v,16,2,14,darkMetal);
    r.plane(u+2,h-1,v+2,12,1,10,r.edge);
    r.plane(u+5,h-1,v+4,6,1,6,'#d95336');
    r.plane(u+7,h-1,v,2,1,14,metal);r.plane(u,h-1,v+6,16,1,2,metal);
  }
  r.plane(12,10,0,w-24,23,2,darkMetal);r.plane(16,13,0,w-32,16,1,'#253b41');
  r.plane(14,34,0,w-28,3,2,metal);
  for(let u=10;u<w-8;u+=16)r.plane(u,40,0,4,4,2,darkMetal);
}

function vanity(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  const top=r.spec.supports.length?Math.min(...r.spec.supports.map(s=>s.y-r.spec.y)):48;
  r.legs(40,4,metal);r.slab(8,4,r.edge);r.slab(top,8);
  // Open bottom compartment: pipe remains at the wall and never crosses the hide bay.
  r.plane(Math.floor(w/2)-2,8,d-5,4,32,4,metal);
  const basinW=Math.floor(w*.5),u=Math.floor((w-basinW)/2);
  r.plane(u,top-7,10,basinW,7,d-20,ceramic);
  r.clearPlane(u+3,top-6,13,basinW-6,6,d-26);
  r.plane(Math.floor(w/2)-2,top-6,Math.floor(d/2)-2,4,1,4,metal);
  const faucetTop=Math.min(h,top+16);
  r.plane(Math.floor(w/2)-2,top,d-6,4,faucetTop-top,4,metal);
  r.plane(Math.floor(w/2)-2,faucetTop-4,d-16,4,4,14,metal);
  r.plane(Math.floor(w/2)-2,faucetTop-6,d-16,4,2,3,r.edge);
  r.plane(Math.floor(w/2)+5,top,d-6,6,3,4,metal);
}

function toilet(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  // Canonical front is the seat opening; tank is behind it at the north wall in B03.
  const bw=w-12,seatBottom=20;
  r.plane(12,0,9,w-24,8,d-28,r.edge);
  r.plane(10,8,8,w-20,12,d-24);
  r.plane(6,seatBottom,4,bw,8,d-18);
  r.plane(4,23,8,w-8,5,d-26);
  r.plane(0,23,12,w,2,18);
  r.plane(12,20,0,w-24,4,8);
  r.clearPlane(13,24,12,w-26,7,d-34);
  r.plane(6,14,d-14,w-12,h-14,14);
  r.plane(4,h-3,d-14,w-8,3,14,ceramic);
  r.plane(Math.floor(w/2)-3,h-2,d-8,6,2,3,metal);
}

function flatPanel(r:Recipe,kind:'television'|'mirror'|'glass-partition'|'backstop'):void {
  if(kind==='glass-partition'){
    const alongX=r.w>r.d,width=alongX?r.w:r.d,depth=alongX?r.d:r.w;
    // A single thin pane has continuous collision; its frame and pale pixel highlights are solid cells too.
    if(alongX){
      r.box(0,0,Math.floor(depth/2)-1,width,r.h,2);
      r.box(0,0,0,width,3,depth,metal);r.box(0,r.h-3,0,width,3,depth,metal);
      for(const x of [0,width-3])r.box(x,0,0,3,r.h,depth,metal);
      for(let y=20;y<r.h-10;y+=24)r.box(Math.floor(width/3),y,Math.floor(depth/2)-1,Math.min(12,width-6),2,1,r.light);
    }else{
      r.box(Math.floor(depth/2)-1,0,0,2,r.h,width);
      r.box(0,0,0,depth,3,width,metal);r.box(0,r.h-3,0,depth,3,width,metal);
      for(const z of [0,width-3])r.box(0,0,z,depth,r.h,3,metal);
      for(let y=20;y<r.h-10;y+=24)r.box(Math.floor(depth/2)-1,y,Math.floor(width/3),1,2,Math.min(12,width-6),r.light);
    }
    return;
  }
  const {width:w,depth:d,h}=r;
  if(kind==='television'){
    r.plane(Math.floor(w/2)-10,0,0,20,3,d,r.edge);
    r.plane(Math.floor(w/2)-3,3,2,6,8,Math.max(1,d-3),darkMetal);
    r.plane(0,10,d-3,w,h-10,3);
    r.plane(0,10,0,w,h-10,d-2,r.edge);
    r.plane(3,13,0,w-6,h-17,1,r.accent);
    r.plane(5,15,0,Math.floor(w*.25),4,1,r.light);
    r.plane(w-7,11,0,2,1,1,ceramic);return;
  }
  if(kind==='mirror'){
    r.plane(0,0,d-2,w,h,2,r.edge);
    r.plane(0,0,0,2,h,d,metal);r.plane(w-2,0,0,2,h,d,metal);
    r.plane(0,0,0,w,2,d,metal);r.plane(0,h-2,0,w,2,d,metal);
    r.plane(2,2,0,w-4,h-4,1);
    for(let u=4;u<w-10;u+=16)r.plane(u,Math.min(h-8,8+Math.floor(u/3)),0,8,3,1,ceramic);
    return;
  }
  r.plane(0,0,d-4,w,h,4,r.edge);
  r.plane(0,0,0,4,h,d,metal);r.plane(w-4,0,0,4,h,d,metal);
  r.plane(0,0,0,w,4,d,metal);r.plane(0,h-4,0,w,4,d,metal);
  r.plane(4,4,1,w-8,h-8,d-5);
  for(let u=12;u<w-8;u+=16)for(let y=12;y<h-6;y+=16)r.plane(u,y,0,3,3,1,r.light);
}

function planter(r:Recipe):void {
  const {w,h,d}=r,pot=Math.max(8,Math.min(16,Math.floor(h/3)));
  r.box(0,0,0,w,pot,d,r.accent);r.box(2,pot-4,2,w-4,4,d-4,'#604c38');
  r.box(0,pot-2,0,w,2,2,r.edge);r.box(0,pot-2,d-2,w,2,2,r.edge);
  r.box(0,pot-2,2,2,2,d-4,r.edge);r.box(w-2,pot-2,2,2,2,d-4,r.edge);
  if(['front','back','west','east'].includes(r.spec.room)){
    // Plant the full long axis of the bed. Stepped leaf masses and a few blossoms replace identical single shoots.
    const nx=Math.max(1,Math.floor(w/32)),nz=Math.max(1,Math.floor(d/32)),sx=Math.floor(w/nx),sz=Math.floor(d/nz);
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
      const index=iz*nx+ix,cx=Math.floor((ix+.5)*sx),cz=Math.floor((iz+.5)*sz),top=h-(index%3)*2;
      const radius=Math.min(11,Math.floor(sx/2)-3,Math.floor(sz/2)-3),base=top-12;
      r.box(cx-1,pot,cz-1,2,base-pot+3,2,r.accent);
      r.box(cx-radius,base,cz-radius+2,radius*2,6,radius*2-4,r.main);
      r.box(cx-radius+2,base+2,cz-radius,radius*2-4,5,radius*2,r.light);
      r.box(cx-radius+3,base+6,cz-radius+3,radius*2-6,4,radius*2-6,r.main);
      r.box(cx-3,top-2,cz-3,6,2,6,r.light);
      if(r.spec.id!=='O10'&&h<=48&&index%2===0){
        const flower=['#d86a68','#d9b752','#c386b0'][index%3];
        r.box(cx-4,top-3,cz-1,8,2,2,flower);r.box(cx-1,top-3,cz-4,2,2,8,flower);
        r.box(cx-1,top-1,cz-1,2,1,2,'#e7c77a');
      }
    }
    for(let x=8;x<w-4;x+=16)r.box(x,pot-1,4,2,1,2,'#89715c');
    return;
  }
  const count=Math.max(1,Math.floor(w/24)),span=Math.floor(w/count);
  for(let i=0;i<count;i++){
    const cx=Math.floor((i+.5)*span),cz=Math.floor(d/2),trunkTop=h-8;
    r.box(cx-1,pot,cz-1,2,trunkTop-pot,2,r.accent);
    const radius=Math.min(10,Math.floor(span/2)-2,Math.floor(d/2)-2);
    for(const [dx,dz,y] of [[-radius,0,h-12],[radius-3,0,h-10],[0,-radius,h-8],[0,radius-3,h-10]] as [number,number,number][]){
      const bx=Math.max(2,Math.min(w-5,cx+dx)),bz=Math.max(2,Math.min(d-5,cz+dz));
      r.box(Math.min(cx,bx),y-3,cz-1,Math.abs(bx-cx)+2,2,2,r.edge);
      r.box(bx,y-3,Math.min(cz,bz),2,2,Math.abs(bz-cz)+2,r.edge);
      const leafW=Math.min(9,w-2-bx),leafD=Math.min(9,d-2-bz),leafH=Math.min(6,h-y);
      r.box(bx,y,bz,leafW,leafH,leafD,(i+dx+dz)%2?r.main:r.light);
      if(leafW>4&&leafD>4)r.box(bx+1,y+leafH-2,bz+1,leafW-2,2,leafD-2,r.main);
    }
    const canopyW=Math.min(span-4,Math.min(18,w-4)),canopyD=Math.min(18,d-4);
    const canopyX=Math.max(2,Math.min(w-canopyW-2,cx-Math.floor(canopyW/2))),canopyZ=Math.max(2,cz-Math.floor(canopyD/2));
    r.box(canopyX,h-8,canopyZ,canopyW,5,canopyD,r.main);
    r.box(canopyX+2,h-3,canopyZ+2,canopyW-4,3,canopyD-4,r.light);
    if(h<=32)r.box(cx-1,h-2,cz-1,2,2,2,r.spec.id==='O10'?r.light:'#d95336');
  }
  for(let x=8;x<w-4;x+=16)r.box(x,pot-1,4,2,1,2,'#89715c');
}

function sandbox(r:Recipe):void {
  r.box(0,0,0,r.w,r.h,r.d,r.accent);r.box(4,0,4,r.w-8,r.h,r.d-8);
  for(let x=12;x<r.w-12;x+=16)r.box(x,r.h-1,Math.floor(r.d/2)+(x%3-1)*4,4,1,3,r.light);
}

function pergola(r:Recipe):void {
  const {w,h,d}=r,beam=h-16;
  r.legs(beam,6,r.main);
  for(const z of [0,d-6])r.box(0,beam,z,w,8,6,r.edge);
  for(const x of [0,w-6])r.box(x,beam,6,6,8,d-12,r.edge);
  for(const x of [0,w-6])for(const z of [0,d-6]){
    r.box(x,0,z,6,4,6,r.light);r.box(x,beam-8,z,6,8,6,r.light);
  }
  for(let z=0;z<d-3;z+=16){
    r.box(0,beam+8,z,w,4,4,r.main);
    r.box(0,beam+11,z,w,1,1,r.light);
  }
  for(let x=8;x<w-5;x+=16)r.box(x,h-4,0,4,4,d,r.edge);
}

function playground(r:Recipe):void {
  const blue='#2d6084',slide='#b9543c';
  // Open elevated deck with broad posts; a short stepped climb and slide form one coherent play area.
  for(const x of [24,60])for(const z of [24,60])r.box(x,0,z,4,64,4,r.edge);
  r.box(24,44,24,40,4,40,r.main);
  for(let i=0;i<4;i++){
    r.box(i*6,0,40,6,(i+1)*12,24,r.main);
    r.box(i*6,(i+1)*12-2,40,6,2,24,r.light);
  }
  // Safety rails leave the west climbing opening and the east slide opening clear.
  r.box(24,56,24,40,3,3,r.accent);r.box(24,56,61,40,3,3,r.accent);
  for(const x of [32,44,56])for(const z of [24,62])r.box(x,48,z,2,8,2,r.light);
  for(let i=0;i<6;i++){
    const x=64+i*8,y=40-i*8;
    r.box(x,y,24,8,4,24,slide);
    for(const z of [22,48])r.box(x,y+4,z,8,8,2,r.accent);
    r.box(x,y+3,26,8,1,20,shade(slide,20));
  }
  r.box(64,44,24,8,2,24,slide);
  // The small stepped blue roof gives the tower a readable silhouette without closing the space beneath it.
  for(let i=0;i<4;i++){
    r.box(i*6,64+i*4,i*6,72-i*12,4,64-i*12,blue);
    r.box(i*6,67+i*4,i*6,72-i*12,1,2,shade(blue,16));
  }
}

function mailbox(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.slab(2,2,r.edge);
  r.plane(w/2-3,0,d/2-3,6,h-24,6,r.edge);
  r.plane(3,h-24,3,w-6,20,d-6);
  r.plane(5,h-4,3,w-10,4,d-6,r.light);
  r.plane(5,h-22,1,w-10,15,2,r.edge);r.plane(7,h-20,0,w-14,11,1);
  r.plane(9,h-16,0,w-18,2,1,darkMetal);
  r.plane(w-5,h-26,d/2,2,18,2,metal);r.plane(w-5,h-9,d/2,2,6,8,'#d95336');
}

function weaponStation(r:Recipe):void {
  const {width:w,depth:d,h}=r,bay=w/4;
  r.slab(8,8,r.edge);r.slab(h,4,r.light);
  r.plane(0,8,d-3,w,h-12,3,r.edge);
  for(let i=0;i<=4;i++)r.plane(Math.min(w-3,i*bay),8,0,3,h-12,d);
  r.plane(0,h-12,0,w,8,2,r.fabric);
  for(let i=0;i<4;i++){
    const u=Math.floor((i+.5)*bay);
    r.plane(u-7,10,1,14,3,d-4,r.light);
    r.plane(i*bay+7,h-10,0,7,3,1,i%2?r.accent:metal);
  }
}

function targetRack(r:Recipe):void {
  r.box(0,0,0,r.w,4,r.d,r.edge);
  for(const z of [24,88]){
    const u=r.width-z;
    // Only the fixed post belongs to map collision. The live knock-down board is a combat object.
    r.plane(u-2,4,7,4,24,2);
    r.plane(u-2,26,0,4,2,10,metal);
  }
  r.plane(3,r.h-4,7,r.width-6,4,2,r.light);
}

function bathroomDetail(r:Recipe):void {
  const {w,h,d,width,depth}=r;
  switch(r.spec.kind){
    case 'shower-column':
      r.plane(0,32,depth-2,width,4,2,r.edge);
      r.plane(width/2-1,0,depth-3,2,h-2,2,metal);
      r.plane(width/2-4,34,depth-5,8,8,4);
      r.plane(width/2-1,h-6,0,2,4,depth-2,metal);
      r.plane(width/2-7,h-3,0,14,3,5);
      for(let u=width/2-5;u<width/2+6;u+=3)r.plane(u,h-3,0,1,1,1,darkMetal);
      r.plane(width/2+3,21,depth-5,2,20,1,r.edge);break;
    case 'towel-rail':
      r.box(0,3,2,w,3,d-4,metal);
      r.box(0,h-3,2,w,3,d-4,metal);
      for(const z of [0,d-4])r.box(0,0,z,w,8,4);
      r.box(w-2,0,7,2,6,d-14,r.edge);break;
    case 'bin':
      r.box(2,0,2,w-4,h-3,d-4);
      r.cut(4,3,4,w-8,h-6,d-8);
      r.box(0,h-3,0,w,3,d,r.light);
      r.box(0,h-2,3,w,1,d-6,r.edge);r.box(w/2-3,h-1,d/2-2,6,1,4,darkMetal);
      r.box(w/2-3,0,0,6,2,3,metal);break;
    case 'brush-holder':
      r.box(0,0,0,w,2,d,r.edge);
      r.box(2,0,2,w-4,12,d-4);r.cut(4,3,4,w-8,9,d-8);
      r.box(5,6,5,w-10,5,d-10,r.edge);
      r.box(w/2-1,11,d/2-1,2,h-11,2,metal);break;
    case 'paper-holder':
      r.box(0,0,0,2,h,d,metal);r.box(0,5,2,w,2,2,metal);r.box(0,5,d-4,w,2,2,metal);
      r.box(2,4,4,w-2,8,d-8);r.box(3,2,5,w-3,2,d-10,ceramic);
      r.box(w-2,7,5,2,2,d-10,r.edge);break;
    case 'vent':
      r.box(0,0,d-2,w,h,2,r.edge);
      r.box(0,0,0,w,2,d);r.box(0,h-2,0,w,2,d);
      r.box(0,2,0,2,h-4,d);r.box(w-2,2,0,2,h-4,d);
      for(let x=4;x<w-2;x+=3)r.box(x,2,0,1,h-4,d,metal);break;
  }
}

function washingMachine(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.box(0,4,0,r.w,h-4,r.d,r.main);r.slab(h,3,ceramic);
  for(const x of [0,r.w-5])for(const z of [0,r.d-5])r.box(x,0,z,5,4,5,darkMetal);
  r.plane(2,h-13,0,w-4,10,2,ceramic);
  r.plane(5,h-10,0,Math.floor(w*.3),5,1,r.edge);
  r.plane(w-12,h-10,0,6,6,2,darkMetal);r.plane(w-10,h-8,0,2,2,1,r.accent);
  for(let u=Math.floor(w*.5);u<w-16;u+=5)r.plane(u,h-8,0,2,2,1,darkMetal);
  const radius=Math.min(17,Math.floor(w/2)-6,Math.floor((h-18)/2)),cx=Math.floor(w/2),cy=Math.floor((h-12)/2);
  for(let row=-radius;row<=radius;row++){
    const half=Math.floor(Math.sqrt(radius*radius-row*row));
    if(!half)continue;
    r.plane(cx-half,cy+row,0,half*2,1,3,metal);
    if(Math.abs(row)<radius-3){
      const inner=Math.floor(Math.sqrt((radius-3)**2-row*row));
      if(inner)r.plane(cx-inner,cy+row,0,inner*2,1,1,'#253b41');
    }
  }
  r.plane(cx-radius+5,cy+3,0,4,8,1,'#537580');
  r.plane(cx+radius-4,cy-5,0,4,10,2,metal);
  r.plane(4,6,0,w-8,3,1,r.edge);r.plane(5,7,0,Math.min(12,w-10),1,1,metal);
}

function laundryRack(r:Recipe):void {
  const {w,h,d,width,depth}=r;
  r.legs(h,3,metal);
  for(const z of [0,d-3])r.box(0,h-3,z,w,3,3,metal);
  for(const x of [0,w-3])r.box(x,h-3,0,3,3,d,metal);
  for(let z=8;z<d-3;z+=8)r.box(2,h-2,z,w-4,2,2,r.edge);
  const clothBottom=Math.max(r.spec.hide?r.spec.hide.y-r.spec.y+r.spec.hide.clearHeight:40,h-40);
  let index=0;
  for(let u=8;u<width-12;u+=32){
    const clothW=Math.min(24,width-u-6),v=Math.min(depth-5,8+(index%2)*8);
    r.plane(u,clothBottom,v,clothW,h-2-clothBottom,2,index%2?r.fabric:ceramic);
    r.plane(u,clothBottom+3,v,clothW,3,1,r.accent);
    r.plane(u+2,h-5,v,2,4,2,r.main);r.plane(u+clothW-4,h-5,v,2,4,2,r.main);
    index++;
  }
}

function pegboard(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.plane(0,0,d-3,w,h,3,r.main);
  r.plane(0,0,d-3,w,3,3,r.edge);r.plane(0,h-3,d-3,w,3,3,r.edge);
  r.plane(0,0,d-3,3,h,3,r.edge);r.plane(w-3,0,d-3,3,h,3,r.edge);
  for(let u=8;u<w-4;u+=8)for(let y=8;y<h-4;y+=8)r.clearPlane(u,y,d-3,1,1,3);
  const center=Math.floor(w/2);
  // Hammer and forked wrench hang in front of the regularly drilled board.
  r.plane(center-2,12,0,4,Math.max(8,h-30),2,r.edge);
  r.plane(center-9,h-24,0,18,7,3,metal);
  r.plane(Math.max(6,center-24),14,0,3,Math.max(6,h-36),2,metal);
  r.plane(Math.max(3,center-27),h-26,0,9,4,2,metal);
  r.plane(Math.max(3,center-27),h-26,0,2,8,2,metal);
  r.plane(Math.max(3,center-20),h-26,0,2,8,2,metal);
  r.plane(Math.min(w-9,center+17),16,0,4,14,3,r.accent);
  r.plane(Math.min(w-8,center+18),30,0,2,Math.max(2,h-40),2,metal);
}

function wallArt(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.plane(0,0,d-1,w,h,1,r.edge);
  r.plane(0,0,0,w,3,d,r.main);r.plane(0,h-3,0,w,3,d,r.light);
  r.plane(0,3,0,3,h-6,d,r.main);r.plane(w-3,3,0,3,h-6,d,r.light);
  const theme=r.spec.artTheme??'landscape';
  if(theme==='abstract'){
    r.plane(3,3,0,w-6,h-6,1,'#e0d8bc');
    const x=Math.floor(w*.4),y=Math.floor(h*.55);
    r.plane(3,y,0,x-3,h-y-3,1,'#b55342');r.plane(x+2,3,0,w-x-5,y-3,1,'#487a81');
    r.plane(3,3,0,x-3,Math.floor(h*.25),1,'#d4ab52');
    r.plane(x,3,0,2,h-6,1,'#2b3b3d');r.plane(3,y,0,w-6,2,1,'#2b3b3d');return;
  }
  if(theme==='botanical'){
    r.plane(3,3,0,w-6,h-6,1,'#e0d7b4');
    const stem=Math.floor(w/2);
    r.plane(stem,6,0,2,h-12,1,'#56734e');
    for(let y=9;y<h-7;y+=6){
      const left=y%12===9,leaf=Math.min(12,Math.floor(w/3)),x=left?stem-leaf:stem+2;
      r.plane(x,y,0,leaf,3,1,left?'#65815a':'#8a9c66');
      r.plane(x+(left?3:0),y+3,0,leaf-3,2,1,'#40614c');
    }
    r.plane(stem-6,4,0,14,3,1,'#a47951');return;
  }
  if(theme==='city'){
    r.plane(3,3,0,w-6,h-6,1,'#334d62');
    for(let x=5;x<w-7;x+=9){
      const height=8+(x%4)*3;
      r.plane(x,3,0,7,Math.min(height,h-8),1,x%2?'#6a7e86':'#82959a');
      for(let y=6;y<Math.min(height,h-8);y+=4)r.plane(x+2,y,0,2,2,1,'#e5bc75');
    }
    r.plane(w-13,h-12,0,5,5,1,'#d7cfaf');r.plane(4,4,0,w-8,2,1,'#b9a17c');return;
  }
  if(theme==='space'){
    r.plane(3,3,0,w-6,h-6,1,'#26384f');
    for(let x=7;x<w-5;x+=9)r.plane(x,6+(x*3)%(h-12),0,2,2,1,'#d8d6b5');
    const cx=Math.floor(w/2),cy=Math.floor(h/2);
    r.plane(cx-3,cy-4,0,6,12,1,'#d4d9d0');r.plane(cx-1,cy+8,0,2,3,1,'#e26c42');
    r.plane(cx-5,cy-3,0,10,3,1,'#bf5847');r.plane(cx-1,cy+2,0,2,3,1,'#589aa6');
    r.plane(cx-2,cy-8,0,4,4,1,'#e2b762');r.plane(w-14,7,0,7,6,1,'#998178');return;
  }
  r.plane(3,3,0,w-6,h-6,1,'#7094b5');
  r.plane(3,3,0,w-6,Math.floor((h-6)/3),1,'#6b9160');
  const sun=Math.max(3,Math.min(7,Math.floor(h/4)));
  r.plane(w-sun-7,h-sun-7,0,sun,sun,1,'#f0c65d');
  const peak=Math.floor(w*.38),peakH=Math.floor(h*.55);
  for(let row=0;row<peakH;row++){
    const left=Math.max(3,peak-row),right=Math.min(w-3,peak+row);
    if(right>left)r.plane(left,3+peakH-row,0,right-left,1,1,'#49674f');
  }
  r.plane(5,5,0,Math.max(1,w-10),2,1,'#b6cdcf');
}

function wallLight(r:Recipe):void {
  const {width:w,depth:d,h}=r;
  r.plane(0,0,d-1,w,h,1,r.edge);
  r.plane(2,3,0,w-4,h-6,d,r.main);
  r.plane(3,5,0,w-6,h-10,1,'#ffe4aa');
  r.plane(0,h-3,0,w,3,d,r.light);r.plane(0,0,0,w,3,d,darkMetal);
}

/** A furniture asset contains the same occupied cells later used for rendering and collision. */
export function buildFurnitureAsset(spec:DesignFurniture):VoxelAsset {
  const r=new Recipe(spec);
  switch(spec.kind){
    case 'table':case 'bench':table(r);break;
    case 'shelf':shelf(r);break;
    case 'chair':seat(r,false);break;
    case 'sofa':case 'armchair':seat(r,true);break;
    case 'bed':bed(r);break;
    case 'cabinet':cabinet(r);break;
    case 'counter':case 'fridge':case 'stove':kitchen(r);break;
    case 'vanity':vanity(r);break;
    case 'toilet':toilet(r);break;
    case 'television':case 'mirror':case 'glass-partition':case 'backstop':flatPanel(r,spec.kind);break;
    case 'planter':planter(r);break;
    case 'sandbox':sandbox(r);break;
    case 'pergola':pergola(r);break;
    case 'playground':playground(r);break;
    case 'mailbox':mailbox(r);break;
    case 'weapon-station':weaponStation(r);break;
    case 'target-rack':targetRack(r);break;
    case 'shower-column':case 'towel-rail':case 'bin':case 'brush-holder':case 'paper-holder':case 'vent':bathroomDetail(r);break;
    case 'washing-machine':washingMachine(r);break;
    case 'laundry-rack':laundryRack(r);break;
    case 'pegboard':pegboard(r);break;
    case 'wall-art':wallArt(r);break;
    case 'wall-light':wallLight(r);break;
    default:throw new Error(`Unsupported furniture kind: ${spec.kind}`);
  }
  return r.builder.finish();
}
