import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout as design,type DesignFurniture,type Rect} from '../src/world/design-layout.ts';
const overlap=(a:Rect,b:Rect)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
const furniture=(id:string)=>design.furniture.find(f=>f.id===id)!;
const center=(rect:Rect)=>[rect[0]+rect[2]/2,rect[1]+rect[3]/2];

test('every prop and its largest variant fit their actual supporting surface and remain native editor size',()=>{
  const supports=design.furniture.flatMap(f=>f.supports),failures:string[]=[];
  for(const p of design.props){
    const support=supports.find(s=>s.id===p.support);
    const sizes=[[p.rect[2],p.height,p.rect[3]],...p.variants.map(v=>v.size)];
    for(const size of sizes){
      if(size.some(n=>!Number.isInteger(n)||n<1||n>32))failures.push(`${p.id}: exceeds native editor`);
      if(support&&(p.y!==support.y||p.rect[0]<support.rect[0]||p.rect[1]<support.rect[1]||p.rect[0]+size[0]>support.rect[0]+support.rect[2]||p.rect[1]+size[2]>support.rect[1]+support.rect[3]))failures.push(`${p.id}: escapes ${support.id}`);
    }
    if(!support&&p.support!=='floor')failures.push(`${p.id}: missing support ${p.support}`);
  }
  assert.deepEqual(failures,[]);
});

test('ordinary doors retain full 64-unit furniture-free approach regions on both sides',()=>{
  const failures:string[]=[];
  for(const door of design.doors.filter(d=>d.kind!=='sliding')){
    const [x,z]=door.center;
    const clear:Rect=door.axis==='x'?[x-door.width/2,z-64,door.width,128]:[x-64,z-door.width/2,128,door.width];
    for(const f of design.furniture)if(design.rooms.find(r=>r.id===f.room)?.floor===door.floor&&f.y<door.floor*128+88&&f.y+f.height>door.floor*128&&overlap(clear,f.rect))failures.push(`${door.id}: ${f.id}`);
    for(const p of design.props)if(design.rooms.find(r=>r.id===p.room)?.floor===door.floor&&p.y<door.floor*128+88&&overlap(clear,p.rect))failures.push(`${door.id}: ${p.id}`);
  }
  assert.deepEqual(failures,[]);
});

test('cabinet use regions remain clear of other furniture',()=>{
  const failures:string[]=[];
  assert.ok(design.furniture.filter(f=>Object.hasOwn(f,'useClearance')).length>=20,'functional service areas must be declared, not assumed');
  for(const f of design.furniture as (DesignFurniture&{useClearance?:{rect:Rect;y:number;height:number}})[]){
    if(!f.useClearance)continue;
    for(const other of design.furniture)if(other.id!==f.id&&other.y<f.useClearance.y+f.useClearance.height&&other.y+other.height>f.useClearance.y&&overlap(f.useClearance.rect,other.rect))failures.push(`${f.id}: blocked by ${other.id}`);
  }
  assert.deepEqual(failures,[]);
});

test('all declared walking routes retain their full width through corners and avoid low furniture and floor props',()=>{
  const failures:string[]=[];
  for(const route of design.routes){
    const base=route.floor*128,half=route.width/2;
    for(let index=1;index<route.points.length;index++){
      const [a,b]=[route.points[index-1],route.points[index]];
      const swept:Rect=[Math.min(a[0],b[0])-half,Math.min(a[1],b[1])-half,Math.abs(a[0]-b[0])+route.width,Math.abs(a[1]-b[1])+route.width];
      for(const f of design.furniture)if(f.y<base+48&&f.y+f.height>base&&overlap(swept,f.rect))failures.push(`${route.id}: ${f.id}`);
      for(const p of design.props)if(p.y<base+48&&p.y+p.height>base&&overlap(swept,p.rect))failures.push(`${route.id}: ${p.id}`);
    }
  }
  assert.deepEqual(failures,[],'a corner needs the full route width as well as the straight segment');
});

test('all indoor props leave the physical ceiling clear',()=>{
  const outside=new Set(['front','back','west','east','balcony']),failures:string[]=[];
  for(const p of design.props){const room=design.rooms.find(r=>r.id===p.room)!;if(!outside.has(room.id)&&p.y+p.height>room.floor*128+120)failures.push(`${p.id}: top ${p.y+p.height}`);}
  assert.deepEqual(failures,[]);
});

test('television, desk screen, dining chairs, fridge and balcony seat face their actual users',()=>{
  assert.equal(furniture('K02').facing,'东');assert.equal(furniture('L01').facing,'东');assert.equal(furniture('L08').facing,'西');
  const monitor=design.props.find(p=>p.id==='t02')!,keyboard=design.props.find(p=>p.id==='t03')!;
  assert.equal(monitor.yaw,180);assert.ok(keyboard.rect[1]>=monitor.rect[1]+monitor.rect[3]);
  assert.equal(furniture('D02').facing,'南');assert.equal(furniture('D03').facing,'北');assert.equal(furniture('D04').facing,'东');assert.equal(furniture('D05').facing,'西');
  assert.equal(furniture('A02').facing,'西');
  const rug=design.decor.find(d=>d.room==='living'&&d.kind==='rug')!;
  assert.deepEqual(center(rug.rect),center(furniture('L02').rect),'rug belongs beneath the coffee table');
  assert.deepEqual(center(design.decor.find(d=>d.room==='dining'&&d.kind==='rug')!.rect),center(furniture('D01').rect));
});

test('TV stand accessories leave the screen clear from the sofa side',()=>{
  const tv=furniture('L08');
  const blocking=design.props.filter(p=>p.support===`${tv.mount}-top`&&p.rect[0]<tv.rect[0]&&p.rect[1]<tv.rect[1]+tv.rect[3]&&p.rect[1]+p.rect[3]>tv.rect[1]&&p.y+p.height>tv.y+8);
  assert.deepEqual(blocking.map(p=>p.id),[],'an accessory can fit on the cabinet but still obstruct the screen');
});

test('laundry equipment is indoors, outdoor seating stays usable, and gardens have coherent planting and maintenance areas',()=>{
  for(const room of ['kitchen','dining','living','bathroom','storage','foyer','master','study','kids','guest','gallery','landing','front','back','east'])assert.ok(design.props.some(p=>p.room===room),`${room} has actual everyday belongings`);
  for(const kind of ['washing-machine','laundry-rack']){
    const equipment=design.furniture.filter(f=>f.kind===kind);assert.ok(equipment.length>0);
    assert.ok(equipment.every(f=>f.room==='storage'),'laundry equipment belongs to the indoor utility room');
  }
  for(const id of ['W01','W03'])assert.ok(furniture(id).useClearance!.rect[3]>=48,'laundry and folding have usable standing space');
  assert.ok(design.furniture.some(f=>f.room==='west'&&f.kind==='planter'));
  assert.ok(design.furniture.some(f=>f.room==='west'&&f.kind==='bench'));
  assert.ok(design.furniture.some(f=>f.room==='east'&&f.kind==='pegboard'));
  assert.ok(!design.props.some(p=>p.name==='球'&&['front','back','west','east'].includes(p.room)),'loose basketball has no place without a basketball zone');
  for(const id of ['M01','C01','G01'])assert.ok(furniture(id).height<=64,'beds should have an upright headboard without becoming high platforms');
  for(const bench of design.furniture.filter(f=>f.kind==='bench'&&['front','back','west','east','balcony'].includes(f.room)))assert.ok(!design.props.some(p=>bench.supports.some(s=>s.id===p.support)),'outdoor seats are kept free for sitting');
});

test('desks and dining tables retain substantial clear working surface instead of receiving filler props',()=>{
  for(const id of ['D01','L02','T01','C02','G03','R03','R04','O07']){
    const f=furniture(id),props=design.props.filter(p=>f.supports.some(s=>s.id===p.support));
    const occupied=props.reduce((total,p)=>total+p.rect[2]*p.rect[3],0);
    assert.ok(occupied<=f.rect[2]*f.rect[3]*.35,`${id}: more than two thirds of the surface stays usable`);
  }
  const table=design.props.filter(p=>p.support==='D01-top');
  assert.equal(table.filter(p=>p.name==='餐盘').length,4,'one plate is assigned to each dining chair');
  assert.equal(table.filter(p=>p.name==='花瓶').length,1,'one central decorative focal point');
  assert.ok(table.filter(p=>p.name.includes('杯')).length<=4,'cups relate to seats rather than empty grid slots');
  assert.ok(design.props.filter(p=>p.support==='C02-top').every(p=>['书桌台灯','小地球仪','书本'].includes(p.name)),'child desk has a lamp, globe and actual work area');
});
