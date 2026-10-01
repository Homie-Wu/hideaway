import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, damageForDistance, wrongHitPenalty } from '../src/actors/weapons.ts';

test('only mistaken hits on real scenery cost hunter health', () => {
  for (const spec of Object.values(WEAPONS)) {
    assert.equal(wrongHitPenalty(spec, 'air'), 0);
    assert.equal(wrongHitPenalty(spec, 'hider'), 0);
    assert.equal(wrongHitPenalty(spec, 'world'), spec.penalty);
  }
});

test('shotgun excels at close range but loses damage faster than pistol', () => {
  const shotgun = WEAPONS.shotgun;
  assert.ok(shotgun.damage * shotgun.pellets > WEAPONS.pistol.damage);
  assert.ok(damageForDistance(shotgun, 35) > damageForDistance(shotgun, 230));
  assert.ok(damageForDistance(shotgun, 230) / shotgun.damage < damageForDistance(WEAPONS.pistol, 230) / WEAPONS.pistol.damage);
  assert.equal(damageForDistance(shotgun, shotgun.range + 1), 0);
});

test('weapons have distinct cadence accuracy recoil and mistaken hit cost', () => {
  assert.ok(WEAPONS.smg.interval < WEAPONS.pistol.interval);
  assert.ok(WEAPONS.pistol.interval < WEAPONS.shotgun.interval);
  assert.ok(WEAPONS.pistol.spread < WEAPONS.smg.spread);
  assert.ok(WEAPONS.smg.spread < WEAPONS.shotgun.spread);
  assert.ok(WEAPONS.pistol.recoil < WEAPONS.smg.recoil);
  assert.ok(WEAPONS.smg.recoil < WEAPONS.shotgun.recoil);
  assert.ok(WEAPONS.pistol.penalty < WEAPONS.shotgun.penalty);
});

test('knife has a strictly bounded reach and distance damage remains finite', () => {
  assert.equal(damageForDistance(WEAPONS.knife, 0), WEAPONS.knife.damage);
  assert.equal(damageForDistance(WEAPONS.knife, WEAPONS.knife.range + 0.01), 0);
  assert.equal(damageForDistance(WEAPONS.pistol, NaN), 0);
  assert.equal(damageForDistance(WEAPONS.pistol, -1), WEAPONS.pistol.damage);
});
