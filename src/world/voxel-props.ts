import type { Vec3 } from '../contracts.ts';
import { VoxelBuilder, type VoxelAsset } from './voxel-asset.ts';

const C={cream:'#eee3c6',paper:'#f2e9d4',ink:'#344249',metal:'#7d9395',gold:'#ddb64f',red:'#d45c46',blue:'#5189aa',green:'#598c43',leaf:'#89b65a',soil:'#6b4934',wood:'#a4794c',screen:'#5ab5bd',white:'#f3efe2'};

function tone(color:string,amount:number):string {
  return '#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(color.slice(i,i+2),16)+amount)).toString(16).padStart(2,'0')).join('');
}

/** Recipes use design fractions, rounded once to native integer cell boundaries. */
function painter(size:Vec3,color:string){
  const b=new VoxelBuilder(size),dark=tone(color,-36),light=tone(color,32);
  const edge=(n:number,axis:number)=>Math.round(n*size[axis]/32);
  const region=(x:number,y:number,z:number,X:number,Y:number,Z:number):[number,number,number,number,number,number]=>{
    const min=[edge(x,0),edge(y,1),edge(z,2)],max=[edge(X,0),edge(Y,1),edge(Z,2)];
    // Small accepted objects still need one physical cell for every thin detail.
    for(let axis=0;axis<3;axis++)if([X-x,Y-y,Z-z][axis]>0&&min[axis]===max[axis]){
      if(max[axis]<size[axis])max[axis]++;else min[axis]--;
    }
    return [min[0],min[1],min[2],Math.max(0,max[0]-min[0]),Math.max(0,max[1]-min[1]),Math.max(0,max[2]-min[2])];
  };
  const box=(x:number,y:number,z:number,X:number,Y:number,Z:number,c=color)=>b.box(...region(x,y,z,X,Y,Z),c);
  const carve=(x:number,y:number,z:number,X:number,Y:number,Z:number)=>b.carve(...region(x,y,z,X,Y,Z));
  const cell=(x:number,y:number,z:number,c:string)=>b.box(x,y,z,1,1,1,c);
  const ellipsoid=(x:number,y:number,z:number,X:number,Y:number,Z:number,c=color)=>{
    const [ox,oy,oz,w,h,d]=region(x,y,z,X,Y,Z);if(!w||!h||!d)return;
    for(let k=0;k<d;k++)for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const nx=(i+.5-w/2)/(w/2),ny=(j+.5-h/2)/(h/2),nz=(k+.5-d/2)/(d/2);
      if(nx*nx+ny*ny+nz*nz<=1)cell(ox+i,oy+j,oz+k,tone(c,j<h/3?-20:j>h*2/3?20:i<w/3?-8:0));
    }
  };
  // A one-cell foot/saucer ensures the specified complete footprint touches its support.
  b.box(0,0,0,size[0],1,size[2],dark);
  return {b,box,carve,cell,ellipsoid,edge,color,dark,light,size};
}
type Painter=ReturnType<typeof painter>;

function octagon(p:Painter,x:number,y:number,z:number,X:number,Y:number,Z:number,c:string,cut=3):void {
  p.box(x+cut,y,z,X-cut,Y,Z,c);p.box(x,y,z+cut,X,Y,Z-cut,c);
  p.box(x+cut/2,y,z+cut/2,X-cut/2,Y,Z-cut/2,c);
}

function cup(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p,handle=['杯子','方形茶杯','茶杯'].includes(name),right=handle?24:32;
  if(name==='方形茶杯'){
    box(0,1,1,right,32,31,color);carve(3,4,4,right-3,32,28);
  }else{
    octagon(p,0,1,0,right,32,32,color,3);
    octagon(p,2,1,2,right-2,5,30,dark,2);
    carve(4,5,5,right-4,32,27);
    carve(6,5,3,right-6,32,29);
  }
  box(3,29,1,right-3,32,3,light);box(3,29,29,right-3,32,31,light);
  box(0,12,8,2,16,24,light);box(1,8,10,3,10,22,C.cream);
  if(handle){
    box(22,5,12,32,9,20,light);box(22,23,12,32,27,20,light);
    box(29,9,12,32,23,20,color);
    box(30,11,13,32,21,19,light);
  }
  if(name==='果汁杯'){
    octagon(p,4,5,5,28,13,27,C.gold,2);box(25,13,7,27,32,9,C.red);
    box(2,17,10,4,26,18,C.white);
  }else if(name==='水杯')box(1,8,11,3,24,17,C.white);
}

function bowl(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  octagon(p,8,1,8,24,6,24,dark,2);
  octagon(p,4,6,4,28,13,28,color,3);
  octagon(p,2,13,2,30,21,30,color,3);
  octagon(p,0,21,0,32,29,32,light,4);
  octagon(p,0,29,0,32,32,32,C.cream,4);
  carve(5,22,5,27,32,27);carve(7,15,7,25,32,25);carve(10,9,10,22,32,22);
  if(name==='水果碗'){
    p.ellipsoid(8,9,8,17,24,18,C.red);p.ellipsoid(17,12,12,25,26,24,C.gold);
    box(12,24,13,14,27,15,C.green);
  }
}

function plates(p:Painter,name:string):void {
  const {box,carve,color,light,dark}=p,stack=['叠盘','叠餐碟'].includes(name),count=stack?3:1;
  for(let i=0;i<count;i++){
    const y=i*32/count,top=(i+1)*32/count;
    octagon(p,2,y,2,30,top-5,30,i%2?light:color,3);
    octagon(p,0,top-5,0,32,top,32,i%2?color:light,4);
    carve(5,top-3,5,27,top,27);
    octagon(p,4,top-4,4,28,top-3,28,C.cream,1);
  }
  if(name==='钥匙盘'){
    box(8,20,13,22,25,16,C.gold);box(8,20,10,10,26,19,dark);
    box(19,20,16,21,26,19,C.metal);box(16,20,16,18,26,18,C.metal);
  }
}

function pot(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p,cactus=name==='像素仙人掌';
  octagon(p,5,1,5,27,4,27,dark,3);
  octagon(p,7,4,7,25,12,25,cactus?C.wood:color,2);
  octagon(p,5,12,5,27,15,27,cactus?tone(C.wood,25):light,3);
  carve(9,12,9,23,15,23);box(9,12,9,23,13,23,C.soil);
  if(cactus){
    box(13,13,13,19,32,19,C.green);box(14,16,12,16,30,13,C.leaf);
    box(5,19,13,14,23,18,C.green);box(5,20,13,9,28,18,C.leaf);
    box(18,22,14,28,26,19,C.green);box(24,25,14,28,30,19,C.leaf);
    for(const y of [17,22,27])box(18,y,16,20,y+1,17,C.cream);
    box(13,31,13,19,32,19,C.leaf);
  }else{
    box(15,13,15,17,30,17,C.green);
    // The branch overlaps the central stem even when the pot is only six cells deep.
    box(7,18,13,18,20,20,C.green);box(4,19,12,10,22,18,C.leaf);
    box(16,23,13,27,25,19,C.green);box(23,24,13,30,27,19,C.leaf);
    box(11,26,15,16,29,20,C.leaf);box(10,28,14,14,30,20,C.green);
    if(name==='小盆栽')box(12,29,12,20,32,20,C.leaf);
    else{
      box(13,29,12,19,32,20,C.gold);box(11,30,13,13,32,19,C.red);
      box(19,30,13,22,32,19,C.red);box(13,30,9,19,32,12,C.red);
      box(13,30,20,19,32,23,C.red);
    }
  }
}

function lamp(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  octagon(p,4,1,4,28,3,28,dark,4);octagon(p,7,3,7,25,5,25,C.metal,3);
  box(14,4,14,18,21,18,C.gold);box(15,5,13,17,19,14,light);
  if(name==='工具灯'){
    box(7,18,5,25,28,27,color);carve(10,20,4,22,26,8);
    box(10,20,5,22,26,7,C.cream);box(6,20,6,9,26,24,dark);
    box(12,28,13,20,32,19,C.metal);
  }else{
    octagon(p,0,20,0,32,23,32,dark,4);octagon(p,0,21,0,32,24,32,color,4);
    octagon(p,3,24,3,29,27,29,light,4);octagon(p,6,27,6,26,30,26,C.cream,3);
    octagon(p,10,30,10,22,32,22,light,2);
    // A hollow shade with a real socket under its stair-stepped canopy.
    carve(7,21,7,25,24,25);box(13,19,13,19,25,19,C.cream);
    for(const x of [7,15,23])box(x,22,2,x+1,24,4,C.gold);
  }
  box(23,3,11,25,5,14,C.red);
}

function kettle(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p,pitcher=name==='玻璃水壶';
  octagon(p,5,1,5,25,5,27,dark,3);octagon(p,5,5,4,25,24,28,color,3);
  carve(8,5,8,22,24,24);
  box(5,15,10,7,21,22,light);box(7,9,4,21,12,6,light);
  // Connected open handle on the right and stair-stepped pouring spout on the left.
  box(23,7,11,32,10,21,C.metal);box(23,23,11,32,26,21,C.metal);
  box(29,10,11,32,23,21,light);
  box(2,15,12,7,20,20,color);box(0,18,12,4,25,20,light);
  carve(0,21,14,5,23,18);
  if(pitcher){
    octagon(p,4,24,3,26,32,29,light,3);carve(8,24,7,22,32,25);
    box(6,6,8,8,23,11,C.white);
  }else{
    octagon(p,7,24,7,23,28,25,light,2);box(11,28,12,19,31,20,dark);
    box(12,31,13,18,32,19,C.gold);
  }
}

function bottle(p:Painter,name:string):void {
  const {box,color,light,dark}=p;
  octagon(p,3,1,3,29,5,29,dark,4);octagon(p,3,5,3,29,22,29,color,4);
  octagon(p,6,22,6,26,26,26,light,3);box(11,26,11,21,30,21,C.metal);
  if(name==='洗手液'){
    box(14,27,14,18,30,18,C.ink);box(10,30,8,23,32,18,C.cream);box(20,28,8,24,32,12,C.cream);
  }else box(10,29,10,22,32,22,name==='油瓶'?C.gold:C.ink);
  box(7,10,2,25,19,4,C.cream);box(11,12,1,22,14,3,dark);box(11,16,1,20,17,3,C.gold);
  if(name==='调味瓶')for(const x of [12,16,20])box(x,31,12,x+1,32,14,C.paper);
  if(name==='洗发水瓶')box(5,8,6,7,22,9,C.white);
}

function writingCup(p:Painter,name:string):void {
  const {box,carve,color,light}=p;
  octagon(p,1,1,1,31,22,31,color,3);carve(5,5,5,27,22,27);
  octagon(p,0,20,0,32,24,32,light,3);carve(5,20,5,27,24,27);
  box(2,9,11,4,15,21,C.cream);
  const colors=name==='牙刷杯'?[C.blue,C.red,C.leaf]:[C.gold,C.red,C.blue];
  for(let i=0;i<3;i++){
    const x=8+i*6,z=9+i*4,top=32-i*2;
    box(x,5,z,x+2,top,z+2,colors[i]);
    if(name==='牙刷杯'){box(x,top-5,z-1,x+3,top,z+3,C.cream);box(x,top-5,z-2,x+3,top,z-1,C.white);}
    else{box(x,top-3,z,x+2,top-1,z+2,C.wood);box(x,top-1,z,x+2,top,z+2,C.ink);}
  }
}

function coffee(p:Painter):void {
  const {box,carve,color,light,dark}=p;
  box(3,1,2,29,4,30,C.metal);box(0,3,17,32,30,32,color);
  box(0,4,3,6,30,20,dark);box(26,4,3,32,30,20,color);
  box(0,26,1,32,32,32,light);box(6,27,0,25,30,2,C.ink);
  box(9,29,0,19,31,1,C.screen);box(23,27,0,26,30,2,C.red);
  box(10,23,8,23,27,16,C.metal);box(14,19,10,18,24,13,C.ink);
  box(6,4,2,26,6,16,C.ink);
  for(const x of [9,13,17,21])box(x,5,3,x+1,6,15,C.metal);
  octagon(p,10,6,4,23,16,15,C.cream,2);carve(13,9,7,20,16,12);
  box(22,8,7,26,10,12,C.gold);box(24,10,7,26,14,12,C.gold);box(22,14,7,26,16,12,C.gold);
  box(28,6,20,31,25,29,C.blue);box(28,7,21,29,23,23,C.white);
}

function toaster(p:Painter):void {
  const {box,carve,color,light,dark}=p;
  octagon(p,0,2,0,32,26,32,color,3);octagon(p,1,23,1,31,27,31,light,2);
  for(const z of [7,21]){
    box(4,25,z-2,28,27,z+4,C.ink);carve(6,24,z,26,27,z+2);
    box(7,23,z,25,30,z+2,C.wood);box(9,30,z,23,32,z+2,C.gold);
    box(9,24,z,23,29,z+1,C.cream);
  }
  box(29,9,9,32,20,12,dark);box(28,18,8,32,21,13,C.ink);
  box(9,9,0,14,14,2,C.metal);box(18,10,0,22,13,2,C.red);
}

function electronics(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  if(name==='方形显示器'){
    box(8,1,4,24,3,28,C.metal);box(14,3,14,18,13,18,dark);
    box(0,9,12,32,32,20,color);box(2,11,11,30,30,13,C.ink);
    box(3,12,10,29,29,12,C.screen);box(5,25,9,27,27,11,C.white);
    box(5,15,9,13,23,11,C.blue);box(15,16,9,27,23,11,light);
    box(17,17,8,25,19,10,C.cream);box(15,10,9,18,11,13,C.gold);
  }else if(name==='键盘'){
    box(0,1,0,32,20,32,color);box(1,16,1,31,24,31,dark);
    for(let row=0;row<4;row++)for(let key=0;key<10;key++){
      const x=2+key*2.8,z=2+row*6;box(x,27,z,x+2,32,z+4,row===0&&key===0?C.red:row===0?light:C.cream);
    }
    box(10,27,27,24,32,31,C.cream);box(27,27,27,30,32,31,C.gold);
  }else if(name==='遥控器'){
    octagon(p,0,1,0,32,24,32,color,2);octagon(p,1,24,1,31,26,31,dark,2);
    box(3,26,3,7,32,7,C.red);box(25,26,3,29,32,7,C.gold);
    box(11,26,5,21,32,11,light);box(13,28,7,19,32,9,C.screen);
    for(const x of [5,14,23])for(const z of [15,21,27])box(x,26,z,x+4,32,z+3,C.cream);
  }else if(name==='游戏机'){
    box(2,1,0,30,28,32,color);box(0,6,2,3,26,30,dark);box(29,6,2,32,26,30,light);
    box(3,28,1,29,32,31,dark);box(6,17,0,26,19,2,C.ink);
    box(5,6,0,9,10,2,C.screen);box(22,7,0,27,11,2,C.red);
    for(const x of [5,9,13,17,21,25])box(x,4,28,x+1,24,32,C.ink);
    box(10,28,4,13,30,28,C.metal);
  }else if(name==='音箱'){
    box(1,1,1,31,32,31,color);box(0,3,0,32,30,3,dark);
    p.ellipsoid(5,5,0,27,23,4,C.ink);p.ellipsoid(10,9,0,22,19,2,C.metal);
    p.ellipsoid(11,24,0,21,30,3,C.ink);box(24,26,0,27,29,2,C.gold);
    for(const y of [6,10,14,18])box(5,y,0,7,y+1,1,light);
  }else{
    box(0,1,0,32,22,32,color);box(2,22,3,30,28,29,light);
    box(4,28,5,28,30,27,C.ink);box(6,29,7,26,32,25,C.paper);
    box(5,8,0,27,13,3,dark);carve(7,9,0,25,12,4);
    box(8,7,0,24,9,9,C.paper);box(23,18,0,28,22,2,C.screen);
    box(18,19,0,21,21,2,C.red);box(3,5,2,5,7,5,C.ink);
  }
}

function books(p:Painter,name:string):void {
  const {box,color,dark,light}=p,upright=['书组','书架书组'].includes(name);
  const colors=[color,C.red,C.blue,C.gold,C.green];
  if(upright){
    for(let i=0;i<5;i++){
      const x=i*6.4,X=(i+1)*6.4,top=i===1?32:26+(i%3)*2;
      box(x,1,1,X,top,31,colors[i]);box(x+1,2,4,X-1,top-1,31,C.paper);
      box(x,top-2,0,X,top,32,tone(colors[i],25));
      box(x+1,7,0,X-1,8,3,C.gold);box(x+1,18,0,X-1,20,3,C.cream);
    }
  }else{
    const count=name==='书本'?1:name==='叠杂志'?4:3;
    for(let i=0;i<count;i++){
      const y=i*32/count,Y=(i+1)*32/count,c=colors[i],inset=i===0?0:i%2?4:2;
      box(inset,y,0,32-inset,y+2,32,c);box(inset,Y-2,0,32-inset,Y,32,c);
      box(inset+2,y+2,2,30-inset,Y-2,30,C.paper);
      box(inset,y,0,inset+2,Y,32,tone(c,-25));box(inset,y,30,32-inset,y+1,32,light);
      if(Y-y>=7)for(const line of [y+3,y+5])box(inset+2,line,0,30,line+1,2,C.cream);
    }
    box(7,30,8,25,32,22,light);box(9,31,10,23,32,12,dark);box(12,31,15,20,32,19,C.gold);
  }
}

function food(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  if(name==='汉堡餐盘'){
    octagon(p,0,1,0,32,4,32,C.cream,4);octagon(p,5,4,5,27,10,27,C.gold,4);
    octagon(p,4,10,4,28,13,28,C.green,3);octagon(p,6,13,6,26,17,26,C.red,2);
    octagon(p,5,17,5,27,22,27,C.soil,4);box(5,22,5,27,24,27,C.gold);
    octagon(p,4,24,4,28,28,28,color,4);octagon(p,7,28,7,25,31,25,light,4);
    box(11,31,11,21,32,21,C.gold);
    for(const [x,z] of [[10,10],[19,12],[15,20],[21,18],[9,20]])box(x,30,z,x+2,31,z+1,C.cream);
  }else if(name==='水果盒'){
    box(1,1,1,31,5,31,C.wood);box(0,5,0,32,18,3,color);box(0,5,29,32,18,32,color);
    box(0,5,3,3,18,29,dark);box(29,5,3,32,18,29,light);
    p.ellipsoid(3,5,4,16,26,18,C.red);p.ellipsoid(16,5,3,29,24,17,C.gold);
    p.ellipsoid(9,5,16,25,29,29,C.green);box(16,27,21,18,32,23,C.soil);
    box(18,29,22,23,31,25,C.leaf);box(0,14,0,32,16,3,C.cream);
  }else{
    octagon(p,0,1,0,32,25,32,color,2);box(0,24,0,32,29,32,light);
    carve(4,4,4,28,23,28);
    box(2,29,2,30,32,30,color);box(4,8,0,28,12,2,C.cream);
    box(13,25,0,19,31,3,C.metal);box(13,26,1,19,28,2,dark);
    if(name==='野餐盒'){
      for(const x of [6,14,22])box(x,3,0,x+2,22,1,C.gold);
      for(const y of [5,11,17])box(1,y,0,31,y+1,2,dark);
      box(7,29,12,10,32,20,C.wood);box(22,29,12,25,32,20,C.wood);
    }
  }
}

function containers(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  if(name==='工具盒'){
    box(0,1,0,32,24,32,color);carve(3,4,3,29,24,29);
    box(0,21,0,32,25,32,light);box(2,25,2,30,27,30,color);
    box(9,27,12,12,32,20,C.ink);box(20,27,12,23,32,20,C.ink);
    box(9,30,12,23,32,20,dark);carve(12,27,13,20,30,19);
    for(const x of [5,24]){box(x,17,0,x+3,25,2,C.metal);box(x,19,0,x+3,21,1,C.gold);}
    box(4,7,0,28,9,1,dark);box(2,3,0,4,17,2,C.metal);
  }else if(name==='清洁用品盒'){
    box(0,1,0,32,20,32,color);carve(3,4,3,29,20,29);
    box(0,18,0,32,22,3,light);box(0,18,29,32,22,32,light);
    box(2,4,7,12,27,24,C.blue);box(5,27,11,10,32,20,C.cream);
    box(18,4,6,28,27,20,C.gold);box(20,27,8,27,30,17,C.red);
    box(24,28,7,29,32,12,C.red);box(5,10,6,10,20,8,C.paper);
    box(12,4,23,28,29,29,C.leaf);for(const x of [15,20,25])box(x,21,22,x+2,31,29,C.cream);
  }else if(name==='文件收纳盒'){
    box(0,1,0,32,4,32,dark);box(0,4,0,3,32,32,color);box(29,4,0,32,32,32,light);
    box(3,4,29,29,32,32,color);box(3,4,0,29,14,3,color);
    for(let i=0;i<4;i++){
      const x=5+i*5.5;box(x,4,4,x+4,25+i*2,27,[C.blue,C.paper,C.red,C.gold][i]);
      box(x+1,24+i*2,9,x+3,28+i,15,C.paper);
    }
    box(11,7,0,21,11,1,C.cream);box(13,8,0,19,10,1,C.ink);
  }else if(name==='首饰盒'){
    octagon(p,0,1,0,32,26,32,color,3);carve(4,4,4,28,23,28);
    octagon(p,0,26,0,32,29,32,dark,2);octagon(p,2,29,2,30,32,30,light,2);
    box(13,21,0,19,29,2,C.gold);box(14,23,0,18,25,1,C.ink);
    for(const x of [5,25])box(x,28,5,x+2,32,7,C.gold);
    box(11,31,11,21,32,21,C.cream);box(14,31,14,18,32,18,C.gold);
  }else if(name==='小鞋盒'){
    box(1,1,1,31,26,31,color);carve(4,4,4,28,25,28);
    box(0,26,0,32,30,32,light);box(0,30,0,32,32,32,dark);
    box(9,12,0,23,20,2,C.paper);box(12,14,0,21,16,1,C.ink);
    box(5,27,0,27,29,1,C.cream);
  }else{
    box(0,1,0,32,29,32,color);carve(3,4,3,29,27,29);
    box(0,29,0,32,32,15,light);box(0,29,17,32,32,32,color);
    box(14,1,0,18,30,2,C.gold);box(14,30,0,18,32,32,C.gold);
    box(5,10,0,12,16,1,C.paper);box(7,11,0,10,12,1,C.ink);
    box(5,17,0,7,21,1,dark);box(5,19,0,11,21,1,dark);
  }
}

function cloth(p:Painter,name:string):void {
  const {box,color,light,dark}=p,colors=[color,light,C.cream];
  for(let i=0;i<3;i++){
    const y=i*32/3,Y=(i+1)*32/3,inset=i===0?0:2*i;
    octagon(p,inset,y,0,32-inset,Y,32,colors[i],2);
    box(inset+3,y+2,0,29-inset,y+4,2,dark);box(inset+2,Y-2,2,30-inset,Y,4,C.cream);
    if(name==='叠毛巾')for(const x of [7,23])box(x,y,0,x+1,Y,2,C.blue);
  }
  if(name==='折叠衣物'){
    box(8,25,9,24,30,23,color);box(12,30,9,20,32,14,C.paper);
    box(15,25,11,17,30,25,dark);box(12,30,9,14,32,18,light);box(18,30,9,20,32,18,light);
  }
}

function shoes(p:Painter):void {
  const {box,carve,color,light,dark}=p;
  for(const x of [1,18]){
    octagon(p,x,1,0,x+13,5,32,C.cream,2);octagon(p,x,5,0,x+13,13,32,color,2);
    octagon(p,x+1,13,10,x+12,24,31,color,2);box(x+1,24,18,x+12,32,31,dark);
    carve(x+4,17,21,x+9,32,27);box(x+2,29,18,x+11,32,21,light);
    // Lace rows rest on a rising instep, rather than hanging above the lower toe box.
    for(const z of [9,13,17]){
      const y=14+z-9;
      box(x+3,11,z-2,x+10,y,z+3,color);
      box(x+3,y,z,x+10,y+2,z+1,C.paper);
    }
    box(x+2,10,1,x+11,12,3,light);
  }
}

function frame(p:Painter):void {
  const {box,color,light,dark}=p;
  box(0,5,4,32,32,8,color);box(3,8,3,29,29,5,dark);box(5,10,2,27,27,4,C.cream);
  box(6,11,1,26,26,3,C.blue);box(6,11,0,26,17,2,C.leaf);
  p.ellipsoid(17,20,0,24,26,2,C.gold);box(9,13,0,15,21,2,C.red);
  box(12,6,8,20,22,12,dark);box(12,3,12,20,16,16,dark);box(12,1,16,20,5,31,C.wood);
  box(2,6,3,4,31,5,light);box(28,6,3,30,31,5,light);
}

function board(p:Painter):void {
  const {box,carve,color,light,dark}=p;
  box(0,1,0,27,30,32,color);box(27,1,10,32,30,22,color);
  box(0,30,0,27,32,32,light);box(27,30,10,32,32,22,light);
  carve(29,0,14,31,32,18);
  for(const x of [5,12,20])box(x,31,2,x+1,32,30,dark);
  box(2,31,4,4,32,8,C.cream);
}

function fryingPan(p:Painter):void {
  const {box,carve,color,dark,light}=p;
  octagon(p,0,1,1,25,23,31,dark,4);octagon(p,0,23,1,25,32,31,color,4);
  carve(4,14,6,21,32,26);octagon(p,5,13,7,20,14,25,C.metal,2);
  box(22,19,12,32,28,20,light);carve(29,19,14,31,28,18);
  box(24,18,12,28,23,20,C.wood);box(1,26,9,3,30,23,C.metal);
}

function soap(p:Painter):void {
  const {box,carve,color,dark,light}=p;
  octagon(p,0,1,0,32,11,32,dark,3);octagon(p,0,11,0,32,16,32,color,3);
  carve(4,10,5,28,16,27);octagon(p,6,10,7,26,29,25,C.cream,3);
  octagon(p,8,29,9,24,32,23,light,3);box(11,30,13,21,32,19,C.white);
  box(13,31,14,19,32,16,C.gold);
}

function gloves(p:Painter):void {
  const {box,color,dark,light}=p;
  for(const x of [1,18]){
    box(x,1,1,x+12,20,20,color);box(x+1,20,2,x+11,25,20,light);
    box(x,1,0,x+12,28,4,dark);box(x+2,28,0,x+10,32,4,C.cream);
    for(let i=0;i<4;i++)box(x+1+i*3,1,17,x+3+i*3,21,27+(i===1?5:i===2?3:0),color);
    box(x+10,1,8,x+14,20,17,light);box(x+3,21,6,x+8,26,8,C.gold);
  }
}

function vase(p:Painter):void {
  const {box,carve,color,dark,light}=p;
  octagon(p,8,1,8,24,4,24,dark,3);octagon(p,5,4,5,27,11,27,color,4);
  octagon(p,2,11,2,30,18,30,color,4);octagon(p,5,18,5,27,24,27,light,4);
  octagon(p,10,24,10,22,29,22,color,2);octagon(p,7,29,7,25,32,25,C.gold,2);
  carve(12,8,12,20,32,20);box(2,13,11,4,17,20,C.cream);
  box(8,20,5,24,22,7,C.gold);
}

function car(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  box(0,8,5,32,15,27,dark);box(1,12,4,31,22,28,color);
  for(const x of [4,22])for(const z of [0,27]){
    p.ellipsoid(x,1,z,x+6,14,z+5,C.ink);
    box(x+1,4,z,x+5,10,z+1,C.metal);box(x+2,5,z,x+4,9,z+1,C.gold);
  }
  box(0,10,6,3,14,26,C.metal);box(29,10,6,32,14,26,C.metal);
  if(name==='小货车'){
    box(20,18,5,30,32,27,color);box(19,23,7,21,30,25,C.screen);
    box(22,24,4,29,30,6,C.screen);box(22,24,26,29,30,28,C.screen);
    box(2,20,5,18,24,27,C.wood);box(2,24,5,18,29,8,light);box(2,24,24,18,29,27,light);
    box(2,24,8,5,29,24,color);box(16,24,8,18,29,24,color);
    box(6,24,9,15,27,23,C.gold);
  }else{
    box(8,22,7,24,30,25,color);box(10,30,8,22,32,24,light);
    box(9,23,6,15,29,8,C.screen);box(17,23,6,23,29,8,C.screen);
    box(9,23,24,15,29,26,C.screen);box(17,23,24,23,29,26,C.screen);
    box(7,23,9,9,29,23,C.screen);box(23,23,9,25,29,23,C.screen);
  }
  box(29,16,7,32,20,12,C.cream);box(29,16,20,32,20,25,C.cream);
  box(0,15,7,2,19,11,C.red);box(0,15,21,2,19,25,C.red);
  box(29,14,13,32,17,19,C.ink);
}

function bear(p:Painter):void {
  const {box,ellipsoid,color,dark,light}=p;
  ellipsoid(4,1,3,14,9,21,dark);ellipsoid(18,1,3,28,9,21,dark);
  ellipsoid(8,6,9,24,23,28,color);ellipsoid(10,9,7,22,20,12,C.cream);
  ellipsoid(0,11,11,10,22,22,color);ellipsoid(22,11,11,32,22,22,color);
  ellipsoid(6,19,7,26,30,27,light);
  ellipsoid(5,26,10,13,32,19,color);ellipsoid(19,26,10,27,32,19,color);
  box(7,28,9,11,31,12,C.cream);box(21,28,9,25,31,12,C.cream);
  ellipsoid(11,21,4,21,26,10,C.cream);box(14,24,4,18,26,6,C.ink);
  box(10,26,7,12,28,9,C.ink);box(20,26,7,22,28,9,C.ink);
  box(13,21,5,19,22,7,dark);box(13,17,7,19,19,10,C.red);
  box(10,16,7,14,20,9,C.red);box(18,16,7,22,20,9,C.red);
}

function monster(p:Painter):void {
  const {box,ellipsoid,color,dark,light}=p;
  box(8,1,11,12,9,21,dark);box(20,1,11,24,9,21,dark);
  box(4,1,6,13,4,21,C.cream);box(19,1,6,28,4,21,C.cream);
  ellipsoid(3,6,3,29,30,29,color);
  box(0,12,13,7,16,19,color);box(25,12,13,32,16,19,color);
  box(5,25,12,10,32,20,C.cream);box(22,25,12,27,32,20,C.cream);
  ellipsoid(8,17,1,24,28,7,C.white);ellipsoid(12,18,0,20,26,4,C.blue);
  box(14,20,0,18,25,2,C.ink);box(14,23,0,16,25,1,C.white);
  box(10,11,2,22,14,6,C.ink);box(12,13,2,15,16,4,C.cream);
  box(18,13,2,21,16,4,C.cream);box(12,11,1,20,12,3,C.red);
  box(8,18,3,10,20,5,light);
}

function globe(p:Painter):void {
  const {box,ellipsoid,color,dark}=p;
  octagon(p,4,1,4,28,4,28,C.wood,4);box(13,4,13,19,10,19,C.metal);
  ellipsoid(5,9,5,27,30,27,color);
  const [w,h,d]=p.size,cx=16,cy=19.5,cz=16;
  // Continents replace occupied surface voxels only; each patch stays on the stepped globe.
  const asset=p.b.finish();
  for(let z=0;z<d;z++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(!asset.cells[(z*h+y)*w+x])continue;
    const nx=(x+.5)*32/w,ny=(y+.5)*32/h,nz=(z+.5)*32/d;
    if(ny<10||ny>29||nx<5||nx>27||nz<5||nz>27)continue;
    const longitude=Math.atan2(nz-cz,nx-cx),latitude=(ny-cy)/10.5;
    const patch=Math.sin(longitude*3+latitude*4)+Math.cos(longitude*5-latitude*6)>.8;
    if(patch)p.cell(x,y,z,ny>23?C.leaf:C.green);
    else if(Math.abs(ny-20)<.6)p.cell(x,y,z,C.cream);
  }
  // Meridian frame has a true empty gap from the globe around its left and right sides.
  box(0,12,14,3,26,18,C.gold);box(29,12,14,32,26,18,C.gold);
  box(3,8,14,7,14,18,C.gold);box(25,8,14,29,14,18,C.gold);
  // The meridian joins have overlapping joints, not diagonal-only voxel contact.
  box(3,5,14,29,9,18,C.gold);box(4,25,14,8,29,18,C.gold);
  box(2,24,14,8,28,18,C.gold);box(24,24,14,30,28,18,C.gold);
  box(24,25,14,28,29,18,C.gold);box(7,28,14,25,30,18,C.gold);
  box(10,30,14,22,32,18,C.gold);box(14,28,14,18,32,18,dark);
  box(12,8,13,20,10,19,C.metal);
}

function ball(p:Painter):void {
  const {ellipsoid,color,dark,light}=p;
  ellipsoid(0,1,0,32,32,32,color);
  const asset=p.b.finish(),[w,h,d]=p.size;
  for(let z=0;z<d;z++)for(let y=1;y<h;y++)for(let x=0;x<w;x++){
    if(!asset.cells[(z*h+y)*w+x])continue;
    const nx=(x+.5)/w,ny=(y+.5)/h,nz=(z+.5)/d;
    if(Math.abs(nx-.5)<.035||Math.abs(nz-.5)<.035)p.cell(x,y,z,dark);
    else if(Math.abs(ny-.5)<.045)p.cell(x,y,z,C.cream);
    else if(nx>.65&&ny>.65)p.cell(x,y,z,light);
  }
}

function blocks(p:Painter,_name:string,variant:number):void {
  const {box,carve,color,light}=p;
  box(1,1,1,18,12,16,color);box(17,1,9,31,13,31,C.gold);
  box(1,1,18,16,9,31,C.blue);box(4,12,5,14,24,15,C.red);
  box(4,24,5,14,28,15,light);box(6,28,7,12,32,13,C.cream);
  box(19,13,12,29,19,28,C.green);box(21,19,14,27,22,26,C.leaf);
  for(const [x,y,z] of [[3,12,3],[12,12,3],[20,13,12],[25,13,24],[4,9,22],[10,9,27]])box(x,y,z,x+3,y+3,z+3,C.cream);
  carve(20,4,11,28,8,12);if(variant%2)box(3,2,1,11,7,3,C.gold);
}

function suitcase(p:Painter):void {
  const {box,carve,color,dark,light}=p;
  for(const x of [4,23])for(const z of [5,23])box(x,1,z,x+4,6,z+4,C.ink);
  octagon(p,0,5,2,32,27,30,color,3);octagon(p,1,7,0,31,25,32,light,3);
  box(0,15,3,32,17,29,dark);box(0,7,15,32,25,17,dark);
  for(const x of [7,23])box(x,8,0,x+2,23,2,dark);
  box(9,26,12,12,32,20,C.metal);box(20,26,12,23,32,20,C.metal);
  box(9,30,12,23,32,20,C.ink);carve(12,27,13,20,30,19);
  box(6,16,0,10,20,2,C.gold);box(22,16,0,26,20,2,C.gold);
  box(15,10,0,21,13,2,C.paper);
}

function lifeObject(p:Painter,name:string):void {
  const {box,carve,color,dark,light}=p;
  if(name==='电脑主机'){
    box(2,1,2,30,32,30,color);box(3,3,0,29,30,3,dark);
    box(6,26,0,23,28,1,C.ink);box(23,25,0,27,29,2,C.screen);
    for(const y of [7,17]){octagon(p,7,y,0,24,y+8,2,C.metal,2);octagon(p,10,y+2,0,21,y+6,1,C.ink,1);box(14,y+2,0,17,y+6,1,light);}
    for(let z=6;z<28;z+=4)box(29,6,z,31,24,z+1,dark);
    box(5,3,31,27,28,32,light);box(7,5,31,11,25,32,C.ink);
  }else if(name==='鼠标'){
    octagon(p,3,1,0,29,15,32,dark,4);octagon(p,2,10,0,30,24,32,color,5);
    octagon(p,5,22,3,27,29,29,light,4);box(15,17,2,17,30,17,dark);
    box(13,25,7,19,32,13,C.ink);box(14,28,8,18,31,12,C.metal);
    box(3,15,12,4,21,20,C.blue);box(26,15,12,29,18,20,C.screen);
  }else if(name==='洗衣篮'){
    octagon(p,0,1,0,32,5,32,dark,3);box(2,5,2,30,27,30,color);
    carve(5,5,5,27,32,27);box(0,25,0,32,29,32,light);carve(3,25,3,29,32,29);
    for(const x of [6,12,18,24])for(const y of [9,16]){carve(x,y,1,x+3,y+5,5);carve(x,y,27,x+3,y+5,31);}
    for(const z of [6,12,18,24])for(const y of [9,16]){carve(1,y,z,5,y+5,z+3);carve(27,y,z,31,y+5,z+3);}
    box(10,28,0,22,32,3,C.cream);box(10,28,29,22,32,32,C.cream);
    box(2,6,2,5,25,5,C.metal);
  }else if(name==='洗衣液'){
    octagon(p,0,1,2,32,24,30,color,4);box(7,24,8,25,28,24,light);
    box(10,28,10,22,32,22,C.blue);box(11,30,10,21,32,12,C.cream);
    box(3,7,1,29,21,3,C.paper);box(6,10,0,25,12,2,C.blue);box(7,14,0,16,18,2,C.leaf);
    carve(25,15,10,30,23,22);box(27,18,24,31,22,27,dark);
  }else if(name==='园艺铲'){
    octagon(p,0,1,0,32,9,17,C.metal,5);box(3,9,3,29,15,16,light);
    box(12,10,5,20,18,19,C.ink);box(12,12,15,20,25,28,C.wood);
    box(11,19,20,21,30,32,color);box(11,29,23,21,32,31,dark);
    box(4,7,1,28,10,3,C.white);box(14,17,19,16,28,28,C.gold);
  }else if(name==='鸟屋'){
    box(5,1,5,27,24,28,C.wood);box(7,3,4,25,23,6,color);carve(10,10,3,22,20,10);
    box(12,8,0,20,10,10,C.gold);box(7,4,3,25,5,5,dark);
    for(let i=0;i<5;i++)box(i*3,24+i,2,32-i*3,25+i,30, i%2?color:dark);
    box(13,29,0,19,32,32,light);box(26,5,10,28,20,12,C.cream);
  }else if(name==='浇水壶'){
    octagon(p,7,1,5,27,24,29,color,3);octagon(p,8,24,6,26,26,28,light,3);
    carve(13,23,12,21,27,20);box(9,4,4,11,23,6,C.cream);
    box(3,13,11,9,19,20,color);box(0,18,10,5,26,21,light);box(0,24,8,3,28,23,C.metal);
    for(const z of [11,15,19])box(0,25,z,1,27,z+1,C.ink);
    box(25,8,12,32,12,21,dark);box(25,24,12,32,28,21,dark);box(29,11,12,32,25,21,light);
    box(12,26,8,15,32,11,C.gold);box(20,26,8,23,32,11,C.gold);box(12,30,8,23,32,11,light);
  }else{
    octagon(p,0,2,4,32,17,28,dark,4);box(5,15,3,27,24,26,color);
    box(21,17,4,31,25,20,color);
    octagon(p,0,2,12,11,21,32,color,3);octagon(p,21,2,12,32,21,32,color,3);
    box(6,25,7,10,30,18,C.ink);box(3,25,11,13,30,15,C.ink);
    for(const [x,z,c] of [[25,6,C.gold],[22,10,C.blue],[28,10,C.red],[25,14,C.green]] as const)box(x-1,24,z-1,x+2,31,z+2,c);
    octagon(p,11,23,19,17,32,25,C.ink,1);octagon(p,17,23,18,23,32,24,C.metal,1);
    box(14,23,6,17,27,9,C.cream);box(18,23,6,21,27,9,C.screen);
  }
}

const RECIPES:Record<string,(p:Painter,name:string,variant:number)=>void>=Object.create(null);
function register(names:string[],recipe:(p:Painter,name:string,variant:number)=>void):void { for(const name of names)RECIPES[name]=recipe; }
register(['杯子','方形茶杯','茶杯','水杯','果汁杯'],cup);
register(['碗','水果碗'],bowl);
register(['餐盘','叠盘','叠餐碟','钥匙盘'],plates);
register(['像素仙人掌','像素花盆','小盆栽','小花盆'],pot);
register(['餐边台灯','小台灯','工具灯','台灯','床头台灯','书桌台灯','床头灯'],lamp);
register(['茶壶','水壶','玻璃水壶'],kettle);
register(['调味瓶','油瓶','洗手液','洗发水瓶'],bottle);
register(['笔筒','牙刷杯'],writingCup);
register(['咖啡机'],coffee);
register(['烤面包机'],toaster);
register(['方形显示器','键盘','遥控器','游戏机','音箱','方形打印机'],electronics);
register(['书本','叠书','叠杂志','书组','书架书组'],books);
register(['汉堡餐盘','水果盒','饭盒','野餐盒'],food);
register(['工具盒','储物纸盒','清洁用品盒','纸盒','小鞋盒','首饰盒','文件收纳盒'],containers);
register(['叠毛巾','折叠衣物'],cloth);
register(['鞋子'],shoes);
register(['相框'],frame);
register(['切菜板'],board);
register(['平底锅'],fryingPan);
register(['香皂盒'],soap);
register(['园艺手套'],gloves);
register(['花瓶'],vase);
register(['玩具车','小货车'],car);
register(['玩具熊'],bear);
register(['单眼玩具'],monster);
register(['体素地球仪','小地球仪'],globe);
register(['球'],ball);
register(['积木组'],blocks);
register(['小旅行箱'],suitcase);
register(['电脑主机','鼠标','洗衣篮','洗衣液','园艺铲','鸟屋','浇水壶','手柄'],lifeObject);

/** Every approved name has a recipe; unknown names never silently become a box. */
export function buildPropAsset(name:string,size:Vec3,color:string,variant=0):VoxelAsset {
  if(!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isSafeInteger(n)||n<=0||n>32))throw new RangeError('Prop dimensions must be positive integers no larger than 32');
  if(!Number.isSafeInteger(variant)||variant<0)throw new RangeError('Prop variant must be a nonnegative integer');
  if(!/^#[\da-f]{6}$/i.test(color))throw new TypeError('Prop colors must use #rrggbb');
  const alternatives:Record<string,string>={'杯子':'方形茶杯','碗':'水果碗','调味瓶':'油瓶','叠杂志':'叠书','储物纸盒':'清洁用品盒','玩具车':'小货车'};
  const selected=variant%2?alternatives[name]??name:name;
  const recipe=RECIPES[selected];if(!recipe)throw new Error(`Unknown approved prop: ${name}`);
  const p=painter(size,color.toLowerCase());recipe(p,selected,variant);return p.b.finish();
}

/** Plan yaw is clockwise from north. Rotate occupied cells, never stretch a model or rotate its already oriented footprint. */
export function buildOrientedPropAsset(name:string,worldSize:Vec3,color:string,variant=0,yaw=0):VoxelAsset {
  if(!Number.isSafeInteger(yaw)||yaw%90!==0)throw new RangeError('Voxel orientation must use integer 90-degree quarter turns');
  const turns=((yaw/90)%4+4)%4;
  const size:Vec3=turns%2?[worldSize[2],worldSize[1],worldSize[0]]:[...worldSize];
  let asset=buildPropAsset(name,size,color,variant);
  for(let turn=0;turn<turns;turn++){
    const [w,h,d]=asset.size,cells=new Uint16Array(asset.cells.length);
    for(let z=0;z<d;z++)for(let y=0;y<h;y++)for(let x=0;x<w;x++)cells[(x*h+y)*d+(d-1-z)]=asset.cells[(z*h+y)*w+x];
    asset={size:[d,h,w],cells,palette:asset.palette};
  }
  return asset;
}
