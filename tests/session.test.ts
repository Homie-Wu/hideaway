import {test} from 'node:test';
import assert from 'node:assert/strict';
import { Session, DEFAULT_SETTINGS, scoreRate, tauntReady } from '../src/session.ts';
test('defaults preserve six minute preparation and eight minute hunt',()=>{assert.equal(DEFAULT_SETTINGS.preparationSeconds,360);assert.equal(DEFAULT_SETTINGS.huntSeconds,480)});
test('survival scoring keeps small disguises viable and bounds the large-model bonus',()=>{
 for(const volume of [1,64,511,512])assert.equal(scoreRate(volume,false),1);
 assert.equal(scoreRate(4096,false),2);
 for(const volume of [32768,65536,2097152])assert.equal(scoreRate(volume,false),3);
 for(const volume of [1,512,1024,4096,32768])assert.equal(scoreRate(volume,true),scoreRate(volume,false)*2);
});
test('volume rewards grow continuously with diminishing returns and affect future points only',()=>{
 const smallGain=scoreRate(1024,false)-scoreRate(512,false),largeGain=scoreRate(32768,false)-scoreRate(32256,false);
 assert.ok(smallGain>largeGain&&largeGain>0);
 for(const boundary of [512,32768])assert.ok(Math.abs(scoreRate(boundary+.001,false)-scoreRate(boundary-.001,false))<.00001);
 let score=scoreRate(512,false)*5;assert.equal(score,5);score+=scoreRate(4096,false)*5;assert.equal(score,15);
});
test('taunt accepts exact five second cooldown boundary',()=>{assert.equal(tauntReady(4.999,0),false);assert.equal(tauntReady(5,0),true)});
test('round traverses preparation hunt reveal next round with persistent totals',()=>{const s=new Session({...DEFAULT_SETTINGS,preparationSeconds:1,huntSeconds:2});s.start('hunt');assert.equal(s.phase,'preparation');s.advance(1,2,1);assert.equal(s.phase,'hunt');s.advance(2,2,1);assert.equal(s.phase,'reveal');s.advance(15,2,1);assert.equal(s.phase,'preparation');assert.equal(s.round,2)});
test('all hiders dead or hunters dead finishes hunt; practice never expires',()=>{const s=new Session(DEFAULT_SETTINGS);s.start('practice');s.advance(100000,1,0);assert.equal(s.phase,'practice');s.start('hunt');s.advance(360,1,1);s.advance(.1,0,1);assert.equal(s.phase,'reveal')});
