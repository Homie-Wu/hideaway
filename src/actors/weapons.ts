import type { WeaponId, WeaponSpec } from '../contracts.ts';

/** Damage is per pellet. Ranges use the same world units as a 48-unit hunter. */
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  knife: { id: 'knife', name: '野营匕首', damage: 42, penalty: 3, magazine: 0, reserve: 0, interval: 0.52, reload: 0, range: 35, spread: 0, pellets: 1, recoil: 0.014 },
  pistol: { id: 'pistol', name: '松雀 · 手枪', damage: 29, penalty: 5, magazine: 12, reserve: 72, interval: 0.31, reload: 1.35, range: 780, spread: 0.006, pellets: 1, recoil: 0.022 },
  smg: { id: 'smg', name: '雨燕 · 冲锋枪', damage: 12, penalty: 2, magazine: 28, reserve: 168, interval: 0.095, reload: 1.8, range: 590, spread: 0.021, pellets: 1, recoil: 0.035 },
  shotgun: { id: 'shotgun', name: '山鹬 · 霰弹枪', damage: 13, penalty: 11, magazine: 6, reserve: 36, interval: 0.92, reload: 2.25, range: 410, spread: 0.063, pellets: 7, recoil: 0.09 },
};

export function damageForDistance(spec: WeaponSpec, distance: number): number {
  if (!Number.isFinite(distance) || distance > spec.range) return 0;
  const d = Math.max(0, distance);
  if (spec.id === 'knife') return spec.damage;
  const fullDamageUntil = spec.id === 'shotgun' ? 65 : spec.id === 'smg' ? 170 : 300;
  const minimum = spec.id === 'shotgun' ? 0.1 : spec.id === 'smg' ? 0.4 : 0.68;
  const progress = Math.max(0, Math.min(1, (d - fullDamageUntil) / (spec.range - fullDamageUntil)));
  return spec.damage * (1 - progress * (1 - minimum));
}

export function wrongHitPenalty(spec: WeaponSpec, hit: 'air' | 'world' | 'hider'): number {
  return hit === 'world' ? spec.penalty : 0;
}
