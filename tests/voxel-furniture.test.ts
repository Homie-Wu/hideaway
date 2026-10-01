import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, type DesignFurniture } from '../src/world/design-layout.ts';
import { buildFurnitureAsset } from '../src/world/voxel-furniture.ts';
import { buildVoxelGeometry, voxelCollisionBoxes, type VoxelAsset } from '../src/world/voxel-asset.ts';

const spec=(id:string)=>layout.furniture.find(item=>item.id===id)!;
const index=(asset:VoxelAsset,x:number,y:number,z:number)=>(z*asset.size[1]+y)*asset.size[0]+x;
const cell=(asset:VoxelAsset,x:number,y:number,z:number)=>asset.cells[index(asset,x,y,z)];
const color=(asset:VoxelAsset,x:number,y:number,z:number)=>asset.palette[cell(asset,x,y,z)];
const occupied=(asset:VoxelAsset)=>asset.cells.reduce((total,value)=>total+(value?1:0),0);

function emptyRegion(asset:VoxelAsset,id:string,x:number,y:number,z:number,w:number,h:number,d:number):void {
  for(let dz=z;dz<z+d;dz++)for(let dy=y;dy<y+h;dy++)for(let dx=x;dx<x+w;dx++)assert.equal(cell(asset,dx,dy,dz),0,`${id}: blocked at ${dx},${dy},${dz}`);
}

test('every scene furniture recipe stays on its declared dimensions and produces exact integer surfaces and collision',()=>{
  assert.ok(layout.furniture.length>0);
  for(const item of layout.furniture){
    const asset=buildFurnitureAsset(item),[w,h,d]=asset.size;
    assert.deepEqual(asset.size,[item.rect[2],item.height,item.rect[3]],item.id);
    assert.equal(asset.cells.length,w*h*d);assert.ok(occupied(asset)>0,item.id);
    assert.ok(asset.palette.includes(item.color.toLowerCase()),`${item.id}: primary color is retained`);
    assert.ok(asset.palette.length>=3,`${item.id}: recognizable material accents`);
    const geometry=buildVoxelGeometry(asset),position=geometry.getAttribute('position');
    assert.ok(position.count>0,item.id);
    assert.deepEqual(geometry.boundingBox?.min.toArray(),[0,0,0],`${item.id}: occupied origin matches its approved footprint`);
    assert.deepEqual(geometry.boundingBox?.max.toArray(),[w,h,d],`${item.id}: visible extents match the approved size`);
    for(let vertex=0;vertex<position.count;vertex++)for(let axis=0;axis<3;axis++){
      const value=position.getComponent(vertex,axis);
      assert.ok(Number.isInteger(value)&&value>=0&&value<=asset.size[axis],`${item.id}: surface outside approved dimensions`);
    }
    const covered=new Uint8Array(asset.cells.length);
    for(const box of voxelCollisionBoxes(asset,[item.rect[0],item.y,item.rect[1]],'furniture',item.room)){
      const min=[box.center[0]-box.size[0]/2-item.rect[0],box.center[1]-box.size[1]/2-item.y,box.center[2]-box.size[2]/2-item.rect[1]];
      assert.ok([...min,...box.size].every(Number.isInteger));
      for(let z=min[2];z<min[2]+box.size[2];z++)for(let y=min[1];y<min[1]+box.size[1];y++)for(let x=min[0];x<min[0]+box.size[0];x++){
        assert.ok(x>=0&&y>=0&&z>=0&&x<w&&y<h&&z<d,item.id);
        const offset=index(asset,x,y,z);assert.equal(covered[offset],0,`${item.id}: overlapping collision`);covered[offset]=1;
      }
    }
    for(let offset=0;offset<covered.length;offset++)assert.equal(covered[offset],asset.cells[offset]?1:0,`${item.id}: collision fills a void or misses a visible cell`);
    geometry.dispose();
  }
});

test('each hiding volume and its approach from the documented access side stay physically open',()=>{
  for(const item of layout.furniture){
    const hide=item.hide;if(!hide)continue;
    const asset=buildFurnitureAsset(item),[w,,d]=asset.size;
    const x=hide.rect[0]-item.rect[0],z=hide.rect[1]-item.rect[1],y=hide.y-item.y,hw=hide.rect[2],hd=hide.rect[3],h=hide.clearHeight;
    emptyRegion(asset,item.id,x,y,z,hw,h,hd);
    if(hide.access.includes('东'))emptyRegion(asset,item.id,x,y,z,w-x,h,hd);
    if(hide.access.includes('西'))emptyRegion(asset,item.id,0,y,z,x+hw,h,hd);
    if(hide.access.includes('南'))emptyRegion(asset,item.id,x,y,z,hw,h,d-z);
    if(hide.access.includes('北'))emptyRegion(asset,item.id,x,y,0,hw,h,z+hd);
  }
});

test('declared shelves and tops exist at their world support height',()=>{
  for(const item of layout.furniture){
    const asset=buildFurnitureAsset(item);
    for(const support of item.supports){
      const x=support.rect[0]-item.rect[0],z=support.rect[1]-item.rect[1],y=support.y-item.y;
      // A declared slot is safe across its entire rectangle, including basin edges and bay dividers.
      for(let pz=z;pz<z+support.rect[3];pz++)for(let px=x;px<x+support.rect[2];px++){
        assert.ok(cell(asset,px,y-1,pz),`${support.id}: missing support top at ${px},${pz}`);
        if(y<asset.size[1])assert.equal(cell(asset,px,y,pz),0,`${support.id}: blocked slot above support at ${px},${pz}`);
      }
    }
  }
});

test('every baseline prop footprint has a solid support and clear furniture volume above it',()=>{
  for(const item of layout.furniture){
    const props=layout.props.filter(prop=>item.supports.some(support=>support.id===prop.support));
    if(!props.length)continue;
    const asset=buildFurnitureAsset(item);
    for(const prop of props){
      const x=prop.rect[0]-item.rect[0],z=prop.rect[1]-item.rect[1],y=prop.y-item.y;
      for(let dz=z;dz<z+prop.rect[3];dz++)for(let dx=x;dx<x+prop.rect[2];dx++)assert.ok(cell(asset,dx,y-1,dz),`${prop.id}: missing physical support`);
      emptyRegion(asset,`${prop.id}/${item.id}`,x,y,z,prop.rect[2],Math.min(prop.height,asset.size[1]-y),prop.rect[3]);
    }
  }
});

test('beds place raised pillows at the head and layered blankets toward the foot',()=>{
  for(const id of ['M01','G01','C01']){
    const item=spec(id),asset=buildFurnitureAsset(item),[w,h,d]=asset.size;
    assert.equal(h,64);
    const headZ=item.headSide==='南'?d-18:17,footZ=item.headSide==='南'?24:d-25;
    assert.equal(color(asset,20,42,headZ),'#edf0e8',`${id}: pillow follows headSide`);
    assert.equal(color(asset,Math.floor(w/2),37,footZ),item.color.toLowerCase(),`${id}: blanket follows foot end`);
  }
});

test('car-bed wheels are stepped corner solids and the north nose is separate from the south pillows',()=>{
  const asset=buildFurnitureAsset(spec('C01'));
  assert.equal(color(asset,1,20,14),'#293139');
  assert.equal(color(asset,asset.size[0]-2,20,asset.size[2]-15),'#293139');
  assert.equal(cell(asset,1,10,Math.floor(asset.size[2]/2)),0,'tires occupy four corners, not the entire side');
  assert.equal(color(asset,18,25,1),'#edf0e8');
  assert.equal(color(asset,70,42,150),'#edf0e8');
});

test('seats place backrests opposite their facing direction',()=>{
  const cases:[string,[number,number,number],[number,number,number]][]=[
    ['D02',[12,52,1],[12,52,22]],['D03',[12,52,22],[12,52,1]],
    ['D04',[1,52,16],[22,52,16]],['D05',[22,52,16],[1,52,16]],
    ['L01',[1,52,68],[54,52,68]],['G06',[1,52,16],[30,52,16]],
  ];
  for(const [id,back,front] of cases){const asset=buildFurnitureAsset(spec(id));assert.ok(cell(asset,...back),`${id}: backrest is on wrong side`);assert.equal(cell(asset,...front),0,`${id}: seat faces wrong direction`);}
});

test('television faces west and the bathroom fixtures retain ceramic, metal and glass details',()=>{
  const television=buildFurnitureAsset(spec('L08'));
  assert.equal(color(television,0,30,28),'#437a70');assert.equal(color(television,7,30,28),'#253b41');
  const toilet=buildFurnitureAsset(spec('B03'));
  assert.equal(cell(toilet,24,28,28),0,'open toilet bowl');assert.ok(cell(toilet,24,38,2),'north tank');assert.equal(cell(toilet,24,38,52),0);
  const basin=buildFurnitureAsset(spec('B01'));
  assert.equal(cell(basin,24,46,56),0,'open upper basin');assert.ok(cell(basin,0,47,0),'metal support edge');
  const glass=buildFurnitureAsset(spec('B08'));
  assert.equal(color(glass,60,60,4),'#a0cbd0');assert.ok(glass.palette.includes('#d1dfe0'));
  for(const id of ['B07','M07']){const mirror=buildFurnitureAsset(spec(id));assert.ok(occupied(mirror)<mirror.cells.length);}
});

test('weapon station exposes four empty selection bays and the fixed target rack has no static target faces',()=>{
  const station=buildFurnitureAsset(spec('P02'));
  for(const z of [11,33,55,77])assert.equal(cell(station,30,40,z),0,'selection bay must be accessible from east');
  const rack=buildFurnitureAsset(spec('P04'));
  for(const z of [24,88]){assert.equal(cell(rack,0,40,z),0,'live falling boards are not duplicated by static map collision');assert.ok(cell(rack,8,20,z),'target has a post');}
  assert.equal(cell(rack,0,40,56),0,'targets remain separate');
});

test('unknown furniture kinds fail explicitly instead of silently becoming a solid box',()=>{
  assert.throws(()=>buildFurnitureAsset({...spec('D01'),kind:'unknown'} as DesignFurniture),/Unsupported furniture/);
});

test('bed structure has a separate thick mattress, raised pillows, blanket and upright headboard',()=>{
  for(const id of ['M01','G01','C01']){
    const item=spec(id),asset=buildFurnitureAsset(item),[w,,d]=asset.size;
    const south=item.headSide==='南',headZ=south?d-20:20,footZ=south?48:d-48;
    assert.equal(color(asset,w/2,30,headZ),'#edf0e8',`${id}: mattress must be twelve layers thick`);
    assert.equal(color(asset,20,42,headZ),'#edf0e8',`${id}: pillow must rise independently above mattress`);
    assert.equal(color(asset,w/2,37,footZ),item.color.toLowerCase(),`${id}: blanket has visible thickness`);
    assert.ok(cell(asset,w/2,60,south?d-2:2),`${id}: headboard rises above the pillow`);
    assert.equal(cell(asset,w/2,60,south?2:d-2),0,`${id}: foot remains visually lower than the headboard`);
  }
});

test('shelf boards remain continuous and never get cut to fit oversized prop slots',()=>{
  for(const item of layout.furniture.filter(row=>row.kind==='shelf')){
    const asset=buildFurnitureAsset(item);
    for(const support of item.supports){
      const top=support.y-item.y;
      for(let z=2;z<asset.size[2]-2;z++)for(let x=2;x<asset.size[0]-2;x++)
        assert.ok(cell(asset,x,top-1,z),`${item.id}: shelf has a prop-shaped hole at ${x},${top-1},${z}`);
    }
    const top=asset.size[1]-1;
    for(let z=0;z<asset.size[2];z++)for(let x=0;x<asset.size[0];x++)
      assert.ok(cell(asset,x,top,z),`${item.id}: top cap was cut open for a prop`);
  }
});

test('a kitchen sink uses a raised metal faucet above its counter support instead of a flat pixel',()=>{
  const item={...spec('K01'),height:64},asset=buildFurnitureAsset(item);
  assert.ok(cell(asset,20,47,20),'counter itself ends at the declared y48 worktop');
  assert.ok(cell(asset,184,59,2),'faucet upright rises above the y48 worktop');
  assert.ok(cell(asset,184,61,8),'faucet reaches forward over the recessed basin');
  assert.equal(cell(asset,168,47,20),0,'basin is recessed below the y48 worktop');
  assert.equal(cell(asset,20,55,20),0,'cabinet does not grow over the countertop');
});

test('washing machines, drying racks, tool boards and framed pixel art have distinct functional structure',()=>{
  const base={...spec('D06'),rect:[0,0,64,48] as [number,number,number,number],height:64,facing:'南',supports:[],hide:undefined};
  const washer=buildFurnitureAsset({...base,kind:'washing-machine'});
  assert.equal(color(washer,32,30,47),'#253b41','front loading drum faces the room');
  assert.ok(washer.palette.includes('#d1dfe0'),'controls and drum rim use metal');
  const rack=buildFurnitureAsset({...base,kind:'laundry-rack',height:88});
  assert.equal(cell(rack,32,12,24),0,'air and low clearance stay open under drying clothes');
  assert.ok(cell(rack,32,86,24),'upper drying rail exists');
  assert.ok(cell(rack,40,64,39),'clothing is hung from a rail');
  const pegboard=buildFurnitureAsset({...base,rect:[0,0,80,8],kind:'pegboard'});
  assert.ok(cell(pegboard,40,31,7),'tools protrude toward the front');
  assert.equal(cell(pegboard,71,8,0),0,'peg holes are actual empty cells');
  const art=buildFurnitureAsset({...base,rect:[0,0,64,4],height:32,kind:'wall-art'});
  assert.ok(art.palette.length>=6,'frame, canvas and colored pixel landscape are distinguishable');
  assert.notEqual(color(art,32,16,3),color(art,0,16,3),'framed art has an image rather than a blank panel');
});

test('refrigerator doors and handles face east into the kitchen working aisle',()=>{
  const fridge=spec('K02'),asset=buildFurnitureAsset(fridge),[w,,d]=asset.size;
  assert.equal(fridge.facing,'东');
  assert.equal(color(asset,w-1,40,7),'#d1dfe0','handle is on east door');
  assert.equal(color(asset,w-1,62,d-20),'#d95336','door magnet is visible on east face');
  assert.notEqual(color(asset,0,40,7),'#d1dfe0','back of refrigerator has no handle');
});

test('bathroom basin has a raised faucet and keeps its y48 support strips clear',()=>{
  const asset=buildFurnitureAsset({...spec('B01'),height:64});
  assert.ok(cell(asset,3,59,56),'tap rises from the rear side above the basin counter');
  assert.ok(cell(asset,10,61,56),'tap spout reaches over the hollow basin');
  assert.equal(cell(asset,24,47,56),0,'recessed basin is open at the y48 worktop');
  assert.ok(cell(asset,24,47,8),'north support strip remains a real solid worktop');
  assert.equal(cell(asset,24,55,8),0,'nothing protrudes into a declared prop slot');
});
