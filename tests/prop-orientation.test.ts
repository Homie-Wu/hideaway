import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrientedPropAsset} from '../src/world/voxel-props.ts';
import {assetToModel} from '../src/world/voxel-asset.ts';
import {modelBounds,validateModel} from '../src/voxel/model.ts';

const cell=(a:ReturnType<typeof buildOrientedPropAsset>,x:number,y:number,z:number)=>a.palette[a.cells[(z*a.size[1]+y)*a.size[0]+x]];
test('a display screen faces its actual compass direction at every quarter turn',()=>{
  const original=buildOrientedPropAsset('方形显示器',[24,24,8],'#697d76',0,0);
  const north=cell(original,12,16,2);assert.ok(north,'display has an occupied front');
  assert.notEqual(north,cell(original,12,16,4),'screen differs from rear casing');
  for(const [yaw,size,point] of [[0,[24,24,8],[12,16,2]],[90,[8,24,24],[5,16,12]],[180,[24,24,8],[11,16,5]],[270,[8,24,24],[2,16,11]]] as const){
    const a=buildOrientedPropAsset('方形显示器',[...size],'#697d76',0,yaw);
    assert.deepEqual(a.size,size);assert.equal(cell(a,point[0],point[1],point[2]),north,`screen must face ${yaw}`);
    const m=assetToModel(a,'显示器');assert.equal(validateModel(m).valid,true);
    const b=modelBounds(m);assert.deepEqual(b.max.map((v,i)=>v-b.min[i]),size,'editor uses the oriented native dimensions');
  }
});
test('orientation never moves the support base and rejects a non-voxel angle',()=>{
  for(const yaw of [0,90,180,270,-90,450]){
    const a=buildOrientedPropAsset('茶杯',[16,16,12],'#d4c7a4',0,yaw);
    for(let x=0;x<16;x++)for(let z=0;z<12;z++)assert.ok(cell(a,x,0,z),'rotated base remains fully supported');
  }
  assert.throws(()=>buildOrientedPropAsset('茶杯',[16,16,12],'#d4c7a4',0,45),/quarter|90|整数/);
});
