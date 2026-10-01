import * as THREE from 'three';
import type {Vec3} from '../contracts.ts';
import {designRoom, layout, type Rect} from './design-layout.ts';
import {VoxelBuilder} from './voxel-asset.ts';
import {VoxelScene} from './voxel-scene.ts';

const tint=(hex:string,amount:number)=>`#${new THREE.Color(hex).offsetHSL(0,0,amount).getHexString()}`;
function clip(a:Rect,b:Rect):Rect|null {
  const x=Math.max(a[0],b[0]),z=Math.max(a[1],b[1]),r=Math.min(a[0]+a[2],b[0]+b[2]),f=Math.min(a[1]+a[3],b[1]+b[3]);
  return r>x&&f>z?[x,z,r-x,f-z]:null;
}

export function designArchitecture(scene:VoxelScene,group:THREE.Group) {
  let sequence=0;
  const solid=(id:string,rect:Rect,y:number,height:number,color:string,kind:'wall'|'floor'|'boundary'='wall',room='住宅',layer=1,roof=false)=>{
    const [x,z,w,d]=rect;
    scene.add({id,room,origin:[x,y,z],size:[w,height,d],kind},new VoxelBuilder([w,height,d]).box(0,0,0,w,height,d,color).finish(),{layer,roof});
  };
  const floor=(id:string,rect:Rect,y:number,thickness:number,level:number,outside=false,prep=false)=>{
    const [x,z,w,d]=rect,b=new VoxelBuilder([w,thickness,d]);
    b.box(0,0,0,w,thickness,d,id==='balcony-floor'?'#b6baa9':outside?'#57734b':'#886748');
    const paint=(r:Rect,color:string)=>{const c=clip(r,rect);if(c)b.box(c[0]-x,thickness-1,c[1]-z,c[2],1,c[3],color);};
    if(outside){
      // Paving is painted into the floor; there are no coplanar overlay meshes.
      for(const route of layout.routes.filter(r=>['front','back','west','east'].includes(r.room))){
        for(let i=1;i<route.points.length;i++){
          const a=route.points[i-1],q=route.points[i],s=route.width/2;
          paint([Math.min(a[0],q[0])-s,Math.min(a[1],q[1])-s,Math.abs(a[0]-q[0])+s*2,Math.abs(a[1]-q[1])+s*2],'#adad98');
        }
      }
    }else{
      for(const room of layout.rooms.filter(r=>r.floor===level&&(prep?r.id==='prep':!['front','back','west','east','prep','balcony'].includes(r.id)))){
        const [rx,rz,rw,rd]=room.bounds;
        const base=room.id==='bathroom'?'#dde5df':room.id==='kids'?'#273a58':room.id==='prep'?'#63746b':room.id==='kitchen'?'#c5c2a9':room.palette[1];
        paint(room.bounds,base);
        for(let px=rx;px<rx+rw;px+=32)for(let pz=rz;pz<rz+rd;pz+=32){
          const checker=room.id==='kitchen'?(Math.floor((px-rx)/32)+Math.floor((pz-rz)/32))%2?'#252c2c':'#d7d4bd':tint(base,((px+pz)%96===0?-.045:.015));
          paint([px,pz,Math.min(32,rx+rw-px),Math.min(32,rz+rd-pz)],checker);
          if(!['kitchen','bathroom','kids','prep'].includes(room.id))paint([px,pz,Math.min(32,rx+rw-px),1],tint(base,-.12));
        }
      }
    }
    for(const decoration of layout.decor){
      const room=designRoom(decoration.room);
      if(room.floor!==level||(prep?room.id!=='prep':room.id==='prep')||outside!==['front','back','west','east'].includes(room.id))continue;
      paint(decoration.rect,decoration.color);
      if(decoration.kind==='rug'){
        const [rx,rz,rw,rd]=decoration.rect;
        paint([rx,rz,rw,2],tint(decoration.color,-.1));paint([rx,rz+rd-2,rw,2],tint(decoration.color,-.1));
        paint([rx,rz,2,rd],tint(decoration.color,-.1));paint([rx+rw-2,rz,2,rd],tint(decoration.color,-.1));
        for(let t=4;t<rw-4;t+=8)paint([rx+t,rz+4,2,rd-8],tint(decoration.color,.04));
      }
      if(decoration.kind==='drain')for(let t=2;t<decoration.rect[2];t+=4)paint([decoration.rect[0]+t,decoration.rect[1]+2,1,decoration.rect[3]-4],'#263d44');
    }
    if(level===1&&!outside&&!prep){const c=clip(layout.stairs.floorOpening,rect);if(c)b.carve(c[0]-x,0,c[1]-z,c[2],thickness,c[3]);}
    scene.add({id,room:outside?'庭院':prep?'猎人准备区':'住宅',origin:[x,y-thickness,z],size:[w,thickness,d],kind:'floor'},b.finish(),{layer:outside?0:1});
  };
  floor('ground-floor',layout.boundaries.house,0,8,0);
  floor('upper-floor',layout.boundaries.house,128,8,1);
  for(const [i,r] of ([[-608,-544,1216,224],[-608,320,1216,224],[-608,-320,160,640],[448,-320,160,640]] as Rect[]).entries())floor(`garden-floor-${i}`,r,0,4,0,true);
  floor('preparation-floor',layout.boundaries.preparation,0,8,0,false,true);
  floor('balcony-floor',[152,320,288,80],128,8,1,true);

  const wall=(axis:'x'|'z',center:number,start:number,end:number,level:number,outside=false)=>{
    const horizontal=axis==='x',len=end-start,w=horizontal?len:8,d=horizontal?8:len;
    const origin:Vec3=horizontal?[start,level*128,center-4]:[center-4,level*128,start];
    const b=new VoxelBuilder([w,120,d]);
    // Paint each side with its adjacent room's palette, so shared walls remain a single solid.
    b.box(0,0,0,w,120,d,'#b8ac91');
    for(const room of layout.rooms.filter(r=>r.floor===level&&!['prep','front','back','west','east','balcony'].includes(r.id))){
      const [rx,rz,rw,rd]=room.bounds;
      const along=horizontal?rx:rz,extent=horizontal?rw:rd;
      const lower=horizontal?rz:rx,upper=lower+(horizontal?rd:rw);
      if(Math.abs(center-lower)!==4&&Math.abs(center-upper)!==4)continue;
      const a=Math.max(start,along),q=Math.min(end,along+extent);if(q<=a)continue;
      const face=Math.abs(center-upper)===4?0:7;
      const color=room.id==='bathroom'?'#d1dfdc':room.id==='kitchen'?'#546b60':room.id==='kids'?'#23384c':room.palette[0];
      if(horizontal){b.box(a-start,0,face,q-a,120,1,color);b.box(a-start,0,face,q-a,4,1,room.palette[1]);b.box(a-start,0,face,q-a,32,1,tint(color,-.05));}
      else{b.box(face,0,a-start,1,120,q-a,color);b.box(face,0,a-start,1,32,q-a,tint(color,-.05));b.box(face,0,a-start,1,4,q-a,room.palette[1]);}
    }
    for(const door of layout.doors.filter(q=>q.floor===level&&q.axis===axis&&q.kind!=='sliding'&&q.center[horizontal?1:0]===center&&q.center[horizontal?0:1]-q.width/2>=start&&q.center[horizontal?0:1]+q.width/2<=end)){
      const a=door.center[horizontal?0:1]-door.width/2-start;
      const trim=door.rooms.includes('bathroom')?'#d1dfe0':'#e2cd9e';
      b.carve(horizontal?a:0,0,horizontal?0:a,horizontal?door.width:8,88,horizontal?8:door.width);
      // Trim occupies the solid wall outside the approved clear aperture.
      if(a>=3&&a+door.width+3<=len){
        for(const edge of [a-3,a+door.width])horizontal?b.box(edge,0,0,3,91,8,trim):b.box(0,0,edge,8,91,3,trim);
        horizontal?b.box(a,88,0,door.width,3,8,trim):b.box(0,88,a,8,3,door.width,trim);
      }
    }
    for(const window of layout.windows.filter(q=>q.floor===level&&q.axis===axis&&q.center[horizontal?1:0]===center)){
      const a=window.center[horizontal?0:1]-window.width/2-start;
      const trim=window.room==='bathroom'?'#d1dfe0':'#d7b677';
      b.carve(horizontal?a:0,window.sill,horizontal?0:a,horizontal?window.width:8,window.height,horizontal?8:window.width);
      for(const yy of [window.sill,window.sill+window.height-3])horizontal?b.box(a,yy,0,window.width,3,8,trim):b.box(0,yy,a,8,3,window.width,trim);
      for(const edge of [a,a+window.width-3,a+window.width/2-1])horizontal?b.box(edge,window.sill,0,edge===a+window.width/2-1?2:3,window.height,8,trim):b.box(0,window.sill,edge,8,window.height,edge===a+window.width/2-1?2:3,trim);
      const size:Vec3=horizontal?[window.width,window.height,1]:[1,window.height,window.width];
      const position:Vec3=horizontal?[start+a,level*128+window.sill,center]:[center,level*128+window.sill,start+a];
      scene.add({id:`window-glass:${window.id}`,room:designRoom(window.room).name,origin:position,size,kind:'wall'},new VoxelBuilder(size).box(0,0,0,...size,'#7fa8a4').finish(),{glass:true,layer:1});
    }
    scene.add({id:`wall-${level}-${sequence++}`,room:'住宅',origin,size:[w,120,d],kind:'wall'},b.finish(),{layer:1});
  };
  for(const level of [0,1]){
    wall('x',-316,-448,448,level,true);wall('x',316,-448,448,level,true);
    wall('z',-444,-312,312,level,true);wall('z',444,-312,312,level,true);
    for(const z of [-44,44])wall('x',z,-440,440,level);
    for(const x of [-148,148,276])wall('z',x,-312,-48,level);
    for(const x of [-148,148])wall('z',x,48,312,level);
  }
  for(let i=0;i<8;i++){
    solid(`stair-lower-${i}`,[288,-112-(i+1)*16,64,16],0,(i+1)*8,'#aa8458','floor','楼梯间');
    solid(`stair-upper-${i}`,[368,-240+i*16,64,16],64,(i+1)*8,'#aa8458','floor','楼梯间');
  }
  solid('stair-turn',layout.stairs.intermediate.rect,56,8,'#aa8458','floor','楼梯间');
  // The rails sit in the central gap and outside the 64-wide flights.
  for(let i=0;i<8;i++){
    solid(`lower-rail-${i}`,[352,-112-(i+1)*16,4,16],(i+1)*8+34,4,'#465d55');
    solid(`upper-rail-${i}`,[364,-240+i*16,4,16],64+(i+1)*8+34,4,'#465d55');
    if(i%2===0){solid(`lower-post-${i}`,[352,-112-(i+1)*16,4,4],(i+1)*8,34,'#645d44');solid(`upper-post-${i}`,[364,-240+i*16,4,4],64+(i+1)*8,34,'#645d44');}
  }
  solid('turn-rail',[288,-308,144,4],98,4,'#465d55');
  for(const x of [288,352,428])solid(`turn-post-${x}`,[x,-308,4,4],64,34,'#645d44');
  solid('house-roof',layout.boundaries.house,248,8,'#655b49','boundary','屋顶',1,true);
  // Closed ceiling plus a hollow stepped tile shell: a whole house silhouette,
  // without allocating one enormous filled attic or removing the roof in play.
  const [hx,hz,hw,hd]=layout.boundaries.house;
  const eaves=8,half=hd/2+eaves,tread=16,rise=4,steps=Math.floor(half/tread);
  for(const [edge,rect] of [['north',[hx-eaves,hz-eaves,hw+eaves*2,eaves]],['south',[hx-eaves,hz+hd,hw+eaves*2,eaves]],['west',[hx-eaves,hz,eaves,hd]],['east',[hx+hw,hz,eaves,hd]]] as [string,Rect][])
    solid(`house-eaves-${edge}`,rect,252,4,'#54483b','boundary','屋顶',1,true);
  for(let step=0;step<steps;step++){
    const y=256+step*rise,north=hz-eaves+step*tread,south=hz+hd+eaves-(step+1)*tread;
    for(const [side,z] of [['north',north],['south',south]] as const)
      solid(`roof-tiles-${side}-${step}`,[hx-eaves,z,hw+eaves*2,tread],y,rise,step%3===0?'#8a5746':'#794939','boundary','屋顶',1,true);
    // Narrow gable infill, built separately from the tiles to retain a hollow attic.
    for(const [side,x] of [['west',hx],['east',hx+hw-4]] as const)
      solid(`roof-gable-${side}-${step}`,[x,north+tread,4,south-north-tread],256+step*rise,rise,'#c2b494','boundary','屋顶',1,true);
  }
  solid('roof-ridge',[hx-eaves,hz+hd/2-(half-steps*tread),hw+eaves*2,(half-steps*tread)*2],256+steps*rise,6,'#5e3a31','boundary','屋顶',1,true);
  solid('balcony-front',[152,396,288,4],128,40,'#677767','boundary','阳台',0);
  solid('balcony-west',[148,320,4,80],128,40,'#677767','boundary','阳台',0);
  solid('balcony-east',[440,320,4,80],128,40,'#677767','boundary','阳台',0);
  for(const [id,r] of ([['north',[-608,-544,1216,8]],['south',[-608,536,1216,8]],['west',[-608,-536,8,1072]],['east',[600,-536,8,1072]]] as [string,Rect][]))solid(`garden-fence-${id}`,r,0,64,'#718264','boundary','庭院',0);
  for(const [id,r] of ([['north',[712,-104,240,8]],['south',[712,96,240,8]],['west',[712,-96,8,192]],['east',[944,-96,8,192]]] as [string,Rect][]))solid(`preparation-wall-${id}`,r,0,128,'#40564d','wall','猎人准备区');
  solid('preparation-roof',layout.boundaries.preparation,128,8,'#40564d','boundary','猎人准备区',1,true);
  const [px,pz,pw,pd]=layout.boundaries.preparation;
  solid('preparation-eaves',[px-6,pz-6,pw+12,pd+12],136,4,'#354e48','boundary','猎人准备区',1,true);
  for(let step=0;step<6;step++){
    solid(`preparation-roof-tile-${step}`,[px-6,pz-6+step*32,pw+12,32],140+step*4,4,step%2?'#466a5c':'#547563','boundary','猎人准备区',1,true);
    if(step)for(const x of [px,px+pw-4])solid(`preparation-roof-gable-${x}-${step}`,[x,pz-6+step*32,4,32],140,step*4,'#40564d','boundary','猎人准备区',1,true);
  }
  solid('preparation-roof-edge',[px-6,pz+pd-14,pw+12,20],164,4,'#354e48','boundary','猎人准备区',1,true);
  for(const light of layout.lights){
    const size=light.fixtureSize,p:Vec3=[light.position[0]-size[0]/2,light.position[1]-size[1]/2,light.position[2]-size[2]/2];
    scene.add({id:`light-${light.room}`,room:designRoom(light.room).name,origin:p,size,kind:'prop'},new VoxelBuilder(size).box(0,0,0,...size,'#fff0ce').finish(),{layer:1,emissive:true});
    const l=new THREE.PointLight(light.color,10000,230,2);l.position.set(...light.position);l.layers.set(1);group.add(l);
    const ceiling=light.room==='prep'?128:designRoom(light.room).floor*128+120;
    if(ceiling>p[1]+size[1])solid(`light-stem-${light.room}`,[light.position[0]-1,light.position[2]-1,2,2],p[1]+size[1],ceiling-p[1]-size[1],'#e6dbc0','wall',designRoom(light.room).name);
  }
}
