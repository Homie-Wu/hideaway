import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from './contracts.ts';

export interface PracticeFeedback { index: number; points: number; total: number; }
export interface PracticeTarget {
  hinge: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  available: boolean;
  hits: number;
  angle: number;
  velocity: number;
  remaining: number;
  flash: number;
}

/** Two hinged steel plates share the fixed range's real support rods. */
export class PracticeRange {
  readonly group = new THREE.Group();
  readonly targets: PracticeTarget[] = [];
  total = 0;
  private parent: THREE.Group;

  constructor(parent: THREE.Group, centers: Vec3[]) {
    this.parent = parent;
    this.group.name = 'practice-targets';
    parent.add(this.group); parent.userData.practiceRange = this;
    centers.forEach((center, index) => {
      const hinge = new THREE.Group(); hinge.name = `target-hinge-${index}`;
      hinge.position.set(center[0], center[1] - 12, center[2]);
      const pieces: THREE.BufferGeometry[] = [];
      const block = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(Math.round(x - w / 2) + w / 2, Math.round(y - h / 2) + h / 2, Math.round(z - d / 2) + d / 2);
        const rgb = new THREE.Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(geometry);
      };
      // Stepped silhouette and pixel rings, with an actual thickness and hinge.
      for (let z = -11; z < 11; z += 2) for (let y = 1; y < 22; y += 2) {
        if ((y < 4 || y > 20) && Math.abs(z + 1) > 7) continue;
        const distance = Math.hypot(y - 11, z + 1);
        block(0, y + 1, z + 1, 4, 2, 2, 0x5c6a70);
        block(-2.5, y + 1, z + 1, 1, 2, 2,
          distance < 4 ? 0xd86645 : distance < 6 ? 0xf7e5b9 : distance < 8 ? 0x344451 : 0xe5dbc4);
      }
      block(0, 1, 0, 6, 2, 12, 0x9cabb0);
      for (const z of [-8, 8]) block(-3.1, 12, z, 1, 2, 2, 0x91a2a6);
      const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.54, metalness: 0.45 });
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `steel-target-${index}`;
      mesh.userData.practiceTargetIndex = index;
      mesh.castShadow = true; mesh.receiveShadow = true;
      hinge.add(mesh); this.group.add(hinge);
      this.targets.push({ hinge, mesh, available: true, hits: 0, angle: 0, velocity: 0, remaining: 0, flash: 0 });
    });
  }

  hitTarget(index: number, point: THREE.Vector3): PracticeFeedback | null {
    const target = this.targets[index];
    if (!target?.available || !point.toArray().every(Number.isFinite)) return null;
    target.hinge.updateWorldMatrix(true, false);
    const local = target.hinge.worldToLocal(point.clone());
    const distance = Math.hypot(local.y - 12, local.z);
    const points = distance <= 4 ? 10 : distance <= 9 ? 5 : 2;
    target.available = false; target.hits++; target.velocity = 5.5; target.remaining = 2.2; target.flash = 0.15;
    target.mesh.userData.practiceHits = target.hits;
    target.mesh.userData.practiceHitAt = performance.now();
    this.total += points;
    return { index, points, total: this.total };
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const target of this.targets) {
      target.remaining = Math.max(0, target.remaining - dt);
      target.flash = Math.max(0, target.flash - dt);
      const goal = target.remaining > 0 ? Math.PI / 2 : 0;
      // Exact damped spring motion gives a readable fall and a slower return.
      const w = goal ? 9 : 7, offset = target.angle - goal, term = target.velocity + w * offset, decay = Math.exp(-w * dt);
      target.angle = goal + (offset + term * dt) * decay;
      target.velocity = (target.velocity - w * term * dt) * decay;
      target.hinge.rotation.z = -target.angle;
      target.mesh.material.emissive.setHex(target.flash ? 0x6d4820 : 0);
      if (!target.remaining && target.angle < 0.003 && Math.abs(target.velocity) < 0.02) {
        target.angle = target.velocity = 0; target.hinge.rotation.z = 0; target.available = true;
      }
    }
  }

  reset(): void {
    this.total = 0;
    for (const target of this.targets) {
      target.available = true; target.hits = target.angle = target.velocity = target.remaining = target.flash = 0;
      target.hinge.rotation.z = 0; target.mesh.material.emissive.setHex(0);
      delete target.mesh.userData.practiceHits; delete target.mesh.userData.practiceHitAt;
    }
  }

  dispose(): void {
    for (const target of this.targets) { target.mesh.geometry.dispose(); target.mesh.material.dispose(); }
    this.group.removeFromParent();
    if (this.parent.userData.practiceRange === this) delete this.parent.userData.practiceRange;
  }
}
