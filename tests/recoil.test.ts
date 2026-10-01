import test from 'node:test';
import assert from 'node:assert/strict';
import { Recoil } from '../src/recoil.ts';

test('firing applies an impulse without teleporting the camera, then rises and settles', () => {
  const recoil = new Recoil();
  recoil.add('shotgun');
  assert.equal(recoil.pitch, 0, 'the shot must not instantly jump to a new angle');
  recoil.update(1 / 120);
  const first = recoil.pitch;
  for (let i = 0; i < 5; i++) recoil.update(1 / 120);
  assert.ok(first > 0 && recoil.pitch > first, 'recoil develops over several frames');
  for (let i = 0; i < 240; i++) recoil.update(1 / 120);
  assert.ok(Math.abs(recoil.pitch) < 0.00001);
  assert.ok(Math.abs(recoil.yaw) < 0.00001);
});

test('aim reduces kick, successive shots accumulate, and decay is independent of frame rate', () => {
  const aimed = new Recoil(), hip = new Recoil(), repeated = new Recoil();
  aimed.add('smg', true); hip.add('smg'); repeated.add('smg');
  for (let i = 0; i < 6; i++) { aimed.update(1 / 120); hip.update(1 / 120); repeated.update(1 / 120); }
  assert.ok(aimed.pitch < hip.pitch);
  const before = repeated.pitch;
  repeated.add('smg');
  assert.equal(repeated.pitch, before);
  repeated.update(1 / 120);
  assert.ok(repeated.pitch > hip.pitch);
  const low = new Recoil(), high = new Recoil(); low.add('pistol'); high.add('pistol');
  for (let i = 0; i < 30; i++) low.update(1 / 30);
  for (let i = 0; i < 144; i++) high.update(1 / 144);
  assert.ok(Math.abs(low.pitch - high.pitch) < 1e-10);
  repeated.reset(); assert.equal(repeated.pitch, 0); assert.equal(repeated.yaw, 0);
});
