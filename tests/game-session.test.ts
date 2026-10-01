import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {normalizeSettings} from '../src/session.ts';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:next(url,context)}});
const {Game}=await import('../src/game.ts');
test('old saved settings get independent music volume and invalid levels are bounded',()=>{
 assert.equal(normalizeSettings({volume:.3}).musicVolume,.55);
 assert.equal(normalizeSettings({musicVolume:2}).musicVolume,1);
 assert.equal(normalizeSettings({musicVolume:0}).musicVolume,0);
});
test('the actual frame drives music with phase and pause state',()=>{
 const calls:any[]=[]; const noop=()=>{};
 const game:any={disposed:false,lastTime:100,frameCount:0,fpsTimer:0,accumulator:0,running:true,
  session:{phase:'preparation',remaining:80},input:{locked:true,endFrame:noop},ui:{screen:'game'},editor:{active:false},
  updateVisuals:noop,updateCamera:noop,sound:{updateListener:noop,updateAmbience:noop,updateMusic:(...args:any[])=>calls.push(args)},
  rendering:{camera:{position:new THREE.Vector3(),getWorldDirection:()=>new THREE.Vector3()},render:noop},effects:{update:noop},hudTimer:0};
 const old=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>0;
 try{Game.prototype.frame.call(game,101);game.input.locked=false;Game.prototype.frame.call(game,102);
  assert.deepEqual(calls, [['preparation',80,false],['preparation',80,true]]);
 }finally{globalThis.requestAnimationFrame=old}
});

test('actual menu and menu settings frames keep music active while an in-game settings screen pauses it',()=>{
 const calls:any[]=[];const noop=()=>{};
 const game:any={disposed:false,lastTime:100,frameCount:0,fpsTimer:0,accumulator:0,running:false,
  session:{phase:'menu',remaining:0},input:{locked:false,endFrame:noop},ui:{screen:'menu'},editor:{active:false},
  updateVisuals:noop,updateCamera:noop,sound:{updateListener:noop,updateAmbience:noop,updateMusic:(...args:any[])=>calls.push(args)},
  rendering:{camera:{position:new THREE.Vector3(),getWorldDirection:()=>new THREE.Vector3()},render:noop},effects:{update:noop},hudTimer:0};
 const old=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>0;
 try{
  Game.prototype.frame.call(game,101);game.ui.screen='settings';Game.prototype.frame.call(game,102);
  game.running=true;game.session.phase='hunt';game.session.remaining=40;Game.prototype.frame.call(game,103);
  assert.deepEqual(calls,[['menu',0,false],['menu',0,false],['hunt',40,true]]);
 }finally{globalThis.requestAnimationFrame=old;}
});
