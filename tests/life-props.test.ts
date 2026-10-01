import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrientedPropAsset} from '../src/world/voxel-props.ts';
import {assetToModel,voxelCollisionBoxes} from '../src/world/voxel-asset.ts';
import {validateModel} from '../src/voxel/model.ts';
for(const name of ['电脑主机','鼠标','洗衣篮','洗衣液','园艺铲','鸟屋','浇水壶','手柄'])test(`${name} has a recognizable native recipe, exact collision and editable model`,()=>{
  const a=buildOrientedPropAsset(name,[24,24,24],'#628472',0,180);
  assert.ok(a.palette.length>=5);assert.ok(a.cells.some(c=>!c),'recognizable shape includes real empty space');
  assert.equal(validateModel(assetToModel(a,name)).valid,true);
  const occupied=a.cells.reduce((v,c)=>v+(c?1:0),0);
  assert.equal(voxelCollisionBoxes(a,[0,0,0],'prop','测试').reduce((v,b)=>v+b.size[0]*b.size[1]*b.size[2],0),occupied);
});
test('laundry basket has a hollow interior and real side ventilation holes',()=>{
  const a=buildOrientedPropAsset('洗衣篮',[32,32,32],'#628472');
  const get=(x:number,y:number,z:number)=>a.cells[(z*32+y)*32+x];
  assert.equal(get(16,20,16),0);assert.equal(get(16,30,16),0);assert.equal(get(7,12,1),0);
  assert.ok(get(16,1,16),'solid basket bottom supports laundry');
});
