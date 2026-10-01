import type { WeaponId } from './contracts.ts';
import { WEAPONS } from './actors/weapons.ts';

/** A critically damped impulse: shots change velocity, never the camera angle. */
export class Recoil {
  pitch = 0;
  yaw = 0;
  private pitchVelocity = 0;
  private yawVelocity = 0;
  private shots = 0;
  private readonly frequency = 20;

  add(weapon: WeaponId, aim = false): void {
    if (weapon === 'knife') return;
    const impulse = WEAPONS[weapon].recoil * (aim ? 0.7 : 1) * this.frequency * Math.E;
    this.pitchVelocity += impulse;
    this.yawVelocity += impulse * (this.shots++ % 2 ? -0.16 : 0.12);
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Exact solution remains stable at low FPS and never loses time to a clamp.
    const w = this.frequency, decay = Math.exp(-w * dt);
    const pitchTerm = this.pitchVelocity + w * this.pitch;
    const yawTerm = this.yawVelocity + w * this.yaw;
    this.pitch = (this.pitch + pitchTerm * dt) * decay;
    this.yaw = (this.yaw + yawTerm * dt) * decay;
    this.pitchVelocity = (this.pitchVelocity - w * pitchTerm * dt) * decay;
    this.yawVelocity = (this.yawVelocity - w * yawTerm * dt) * decay;
  }

  reset(): void {
    this.pitch = this.yaw = this.pitchVelocity = this.yawVelocity = this.shots = 0;
  }
}
