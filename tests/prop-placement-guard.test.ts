import test from 'node:test';
import assert from 'node:assert/strict';
import {placementProblem} from '../src/world/prop-placement.ts';
import type {AssetPlacement} from '../src/world/voxel-scene.ts';
import type {WorldBox} from '../src/contracts.ts';
const shelf:WorldBox={center:[0,6,0],size:[32,4,24],kind:'furniture',room:'书房'};
const prop:AssetPlacement={id:'test',room:'书房',origin:[-8,8,-8],size:[16,20,16],kind:'prop'};
const surface={id:'book-bay',rect:[-14,-10,28,20] as [number,number,number,number],y:8};
test('shelf slots must have actual support and complete vertical headroom',()=>{
  assert.equal(placementProblem(prop,surface,[shelf],[]),null);
  assert.match(placementProblem(prop,surface,[shelf,{...shelf,center:[0,24,0]}],[])!,/实体/);
  assert.match(placementProblem(prop,surface,[],[])!,/支撑/);
});
test('a prop cannot escape its shelf footprint, use a wrong support height or overlap its neighbour',()=>{
  assert.match(placementProblem({...prop,origin:[-16,8,-8]},surface,[shelf],[])!,/表面/);
  assert.match(placementProblem({...prop,origin:[-8,10,-8]},surface,[shelf],[])!,/高度/);
  assert.match(placementProblem(prop,surface,[shelf],[{...prop,id:'neighbour'}])!,/neighbour/);
});
