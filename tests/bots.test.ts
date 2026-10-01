import {test} from 'node:test';import assert from 'node:assert/strict';import {findPath} from '../src/bots.ts';import type {MapWorld} from '../src/contracts.ts';
test('navigation traverses stairs through linked nodes and returns empty on disconnected areas',()=>{const world={nav:[{position:[0,0,0],links:[1]},{position:[0,8,16],links:[0,2]},{position:[0,16,32],links:[1]},{position:[1000,0,0],links:[]}]} as unknown as MapWorld;assert.deepEqual(findPath(world,0,2),[1,2]);assert.deepEqual(findPath(world,0,3),[])});

test('clearance filter prevents routes through low hiding spaces',()=>{
 const world={nav:[{position:[0,0,0],links:[1]},{position:[100,0,0],links:[0,2],hide:true},{position:[200,0,0],links:[1]}]} as unknown as MapWorld;
 assert.deepEqual(findPath(world,0,2,i=>i!==1),[]);
});
