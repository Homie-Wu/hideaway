import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocateRoles,DEFAULT_SETTINGS,normalizeSettings,Session} from '../src/session.ts';
test('new preferences default to random; saved fixed preferences remain intact',()=>{
 assert.equal(DEFAULT_SETTINGS.role,'random');
 assert.equal(normalizeSettings({}).role,'random');
 assert.equal(normalizeSettings({role:'hunter'}).role,'hunter');
 assert.equal(normalizeSettings({role:'hider'}).role,'hider');
});
test('sampling without replacement produces the two specified six-player outcomes',()=>{
 let i=0;const hunter=allocateRoles(6,2,'random',()=>[0,.45][i++]!);
 i=0;const hider=allocateRoles(6,2,'random',()=>[.4,.65][i++]!);
 assert.deepEqual(hunter.flatMap((r,i)=>r==='hunter'?[i]:[]),[0,3]);
 assert.deepEqual(hider.flatMap((r,i)=>r==='hunter'?[i]:[]),[2,4]);
});
test('every legal roster and fixed preference preserves both teams and exact hunter counts',()=>{
 for(let n=2;n<=8;n++)for(let h=1;h<n;h++)for(const role of ['random','hunter','hider'] as const)for(const value of [0,.17,.51,.999999]){
  const roles=allocateRoles(n,h,role,()=>value);assert.equal(roles.length,n);assert.equal(roles.filter(r=>r==='hunter').length,h);
  assert.ok(roles.every(r=>r==='hunter'||r==='hider'));if(role!=='random')assert.equal(roles[0],role);
 }
});
test('allocation rejects invalid roster/random source instead of silently constructing malformed teams',()=>{
 assert.throws(()=>allocateRoles(1,1,'random'));assert.throws(()=>allocateRoles(6,6,'hider'));
 assert.throws(()=>allocateRoles(6,2,'random',()=>1));
});
test('session assigns once per round, not on phase change, with a fresh draw at automatic next round',()=>{
 const draws=[0,.45,.4,.65,0,.45];let i=0;
 const s=new Session({...DEFAULT_SETTINGS,preparationSeconds:5,huntSeconds:10},()=>draws[i++]!);
 s.start('hunt');assert.equal(s.roles[0],'hunter');const roles=s.roles;
 s.advance(1,4,2);assert.equal(s.roles,roles);assert.equal(i,2);
 s.advance(4,4,2);assert.equal(s.roles,roles);s.advance(10,4,2);s.advance(s.revealDuration,4,2);
 assert.equal(s.round,2);assert.equal(s.roles[0],'hider');assert.equal(i,4);
});
test('practice only assigns local hider and does not mutate the saved preference or draw RNG',()=>{
 const settings={...DEFAULT_SETTINGS,role:'hunter' as const};const s=new Session(settings,()=>{throw Error('practice must not draw')});
 s.start('practice');assert.deepEqual(s.roles,['hider']);assert.equal(s.settings.role,'hunter');assert.equal(settings.role,'hunter');
});
