import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3, VoxelModel } from '../src/contracts.ts';
import { buildPropAsset, buildOrientedPropAsset } from '../src/world/voxel-props.ts';
import { layout } from '../src/world/design-layout.ts';
import { assetToModel, voxelCollisionBoxes, type VoxelAsset } from '../src/world/voxel-asset.ts';
import { modelBounds, modelVolume, validateModel } from '../src/voxel/model.ts';

const index=(a:VoxelAsset,x:number,y:number,z:number)=>(z*a.size[1]+y)*a.size[0]+x;
const sample=(a:VoxelAsset,x:number,y:number,z:number)=>a.cells[index(a,x,y,z)];

function assertSupported(a:VoxelAsset):void {
  const [w,h,d]=a.size,visited=new Uint8Array(a.cells.length),queue:number[]=[];
  for(let z=0;z<d;z++)for(let x=0;x<w;x++)if(sample(a,x,0,z)){const i=index(a,x,0,z);visited[i]=1;queue.push(i);}
  assert.ok(queue.length,'the prop rests on occupied bottom cells');
  for(let cursor=0;cursor<queue.length;cursor++){
    const i=queue[cursor],x=i%w,y=Math.floor(i/w)%h,z=Math.floor(i/(w*h));
    for(const [dx,dy,dz] of [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]]){
      const nx=x+dx,ny=y+dy,nz=z+dz;
      if(nx<0||ny<0||nz<0||nx>=w||ny>=h||nz>=d)continue;
      const next=index(a,nx,ny,nz);if(a.cells[next]&&!visited[next]){visited[next]=1;queue.push(next);}
    }
  }
  assert.equal(queue.length,a.cells.filter(Boolean).length,'every visible cell connects through face neighbours to a support');
}

function assertCollisionMatches(a:VoxelAsset):void {
  const coverage=new Uint8Array(a.cells.length);
  for(const box of voxelCollisionBoxes(a,[0,0,0],'prop','test')){
    const min=box.center.map((n,i)=>n-box.size[i]/2);
    assert.ok([...min,...box.size].every(Number.isInteger));
    for(let z=min[2];z<min[2]+box.size[2];z++)for(let y=min[1];y<min[1]+box.size[1];y++)for(let x=min[0];x<min[0]+box.size[0];x++){
      const i=index(a,x,y,z);assert.equal(coverage[i],0,'collision cuboids never overlap');coverage[i]=1;
    }
  }
  for(let i=0;i<a.cells.length;i++)assert.equal(coverage[i],a.cells[i]?1:0,'collision excludes every cavity and includes every detail');
}

test('every current prop has an explicit native recipe and at least its default variant',()=>{
  assert.ok(layout.props.length);
  assert.equal(new Set(layout.props.map(p=>p.id)).size,layout.props.length);
  for(const prop of layout.props){
    assert.ok(prop.variants.length,`${prop.id} has a native model`);
    assert.deepEqual(prop.variants[0].size,[prop.rect[2],prop.height,prop.rect[3]]);
    assert.equal(prop.variants[0].name,prop.name);
  }
});

// A repeated book at another shelf is the same recipe; each distinct size, palette,
// variant and orientation still gets the complete model and collision verification.
const recipes=new Map<string,{name:string;size:Vec3;color:string;variant:number;yaw:number}>();
for(const prop of layout.props)for(const [variant,row] of prop.variants.entries()){
  const recipe={name:row.name,size:row.size,color:prop.color,variant,yaw:prop.yaw};
  recipes.set(JSON.stringify(recipe),recipe);
}
for(const [key,row] of recipes)test(`${row.name} ${row.size.join('×')} yaw ${row.yaw}: native grid, exact size, supported, editable and JSON stable (${key})`,()=>{
  const asset=buildOrientedPropAsset(row.name,row.size,row.color,row.variant,row.yaw);
  assert.deepEqual(asset.size,row.size);
  assert.equal(asset.cells.length,row.size[0]*row.size[1]*row.size[2]);
  assert.ok(asset.palette.length>=5,'at least four material colours distinguish structure and details');
  assert.ok(new Set(asset.cells.filter(Boolean)).size>=4,'four material colours remain visible in the finished occupancy');
  if(!['遥控器','游戏机'].includes(row.name))assert.ok(asset.cells.filter(Boolean).length<asset.cells.length*.96,'shaped props retain an actual silhouette');
  const model=assetToModel(asset,row.name);
  assert.deepEqual(validateModel(model),{valid:true});
  const bounds=modelBounds(model);
  assert.deepEqual(bounds.min.map((n,i)=>n+model.pivot[i]),[0,0,0]);
  assert.deepEqual(bounds.max.map((n,i)=>n+model.pivot[i]),row.size);
  assert.equal(modelVolume(model),asset.cells.filter(Boolean).length);
  assert.ok(model.parts[0].cells.every(c=>[c.x,c.y,c.z].every(n=>Number.isInteger(n)&&n>=0&&n<=31)));
  assert.deepEqual(model.parts[0].position,[0,0,0]);
  assert.deepEqual(model.parts[0].rotation,[0,0,0]);
  const saved=JSON.parse(JSON.stringify(model)) as VoxelModel;
  assert.deepEqual(saved,model);assert.deepEqual(validateModel(saved),{valid:true});
  assert.deepEqual(modelBounds(saved),bounds);
  assertSupported(asset);
  assertCollisionMatches(asset);
});

test('cup mouths, bowls and pitchers have open interiors and the mug handle has a hole',()=>{
  for(const name of ['杯子','方形茶杯','茶杯','水杯','果汁杯']){
    const a=buildPropAsset(name,[16,16,16],'#b75637');
    assert.equal(sample(a,6,15,8),0,`${name} mouth is open`);
    assert.equal(sample(a,6,9,8),0,`${name} has a real cavity`);
    if(name==='杯子'||name==='方形茶杯'||name==='茶杯'){
      assert.equal(sample(a,13,8,8),0,'mug handle opening');
      assert.ok(sample(a,15,8,8),'outer handle grip');
    }
    assertCollisionMatches(a);
  }
  for(const name of ['碗','水果碗']){
    const a=buildPropAsset(name,[24,12,24],'#ddd4b6');
    assert.equal(sample(a,12,11,12),0,'bowl rim does not seal its mouth');assertCollisionMatches(a);
  }
  const pitcher=buildPropAsset('玻璃水壶',[24,24,24],'#9cbdba');
  assert.equal(sample(pitcher,10,23,12),0,'pitcher mouth is open');
  const kettle=buildPropAsset('茶壶',[24,20,24],'#cdb680');
  assert.equal(sample(kettle,12,10,12),0,'tea pot retains its hollow interior below the lid');assertCollisionMatches(kettle);
});

test('lamp stems, toy wheels, keyboard keys, globe stand and planted stems are physical voxels',()=>{
  for(const [name,size] of [['台灯',[28,28,28]],['玩具车',[28,12,20]],['小货车',[28,12,20]],['键盘',[32,4,16]],['体素地球仪',[28,28,28]],['小花盆',[20,28,20]]] as [string,Vec3][]){
    const a=buildPropAsset(name,size,'#78924f');assertSupported(a);assertCollisionMatches(a);
  }
  const lamp=buildPropAsset('台灯',[28,28,28],'#ddb95e');
  assert.ok(sample(lamp,14,12,14),'narrow upright lamp stem');
  assert.equal(sample(lamp,4,12,4),0,'the stem leaves real empty space beneath the shade');
  const car=buildPropAsset('玩具车',[28,12,20],'#cf603e');
  for(const x of [5,22])for(const z of [0,19])assert.ok(sample(car,x,2,z),'four corner wheels contact the floor');
  const monitor=buildPropAsset('方形显示器',[32,28,20],'#365e67');
  assert.ok(monitor.palette.includes('#5ab5bd'),'screen illumination is a separate voxel material');
});

test('named alternatives use different recipes rather than a single fallback box',()=>{
  for(const [base,other,size] of [['杯子','方形茶杯',[16,16,16]],['碗','水果碗',[24,12,24]],['玩具车','小货车',[28,12,20]],['储物纸盒','清洁用品盒',[16,20,28]]] as [string,string,Vec3][]){
    const a=buildPropAsset(base,size,'#a78852'),b=buildPropAsset(other,size,'#a78852',1);
    assert.notDeepEqual(Array.from(a.cells),Array.from(b.cells),`${base} and ${other} have distinct geometry/material placement`);
    const byVariant=buildPropAsset(base,size,'#a78852',1);
    assert.deepEqual(byVariant,b,'the base-name variant selector also resolves its named alternative');
  }
  assert.throws(()=>buildPropAsset('未批准物件',[16,16,16],'#a78852'),/Unknown|Unsupported|未知/);
});

test('props reject noninteger, oversized, invalid-colour and invalid-variant requests',()=>{
  for(const size of [[33,16,16],[0,16,16],[16,15.5,16]] as Vec3[])assert.throws(()=>buildPropAsset('杯子',size,'#b75637'));
  assert.throws(()=>buildPropAsset('杯子',[16,16,16],'red'));
  assert.throws(()=>buildPropAsset('杯子',[16,16,16],'#b75637',-1));
  assert.throws(()=>buildPropAsset('杯子',[16,16,16],'#b75637',1.5));
});
