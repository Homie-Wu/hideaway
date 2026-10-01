import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WeaponId } from './contracts.ts';
import type { DesignFurniture } from './world/design-layout.ts';

type Brick = [number, number, number, number, number, number, number];
const metal = 0x3e535c, edge = 0x9ab0b1, black = 0x20313a, wood = 0xba885b, amber = 0xe9bd6e;
const recipes: Record<WeaponId, Brick[]> = {
  knife: [[0,-10,0,4,12,4,wood],[0,-3,0,10,2,4,amber],[0,8,0,4,20,2,edge],[-1,19,0,2,2,2,edge],[0,-10,2.5,2,8,1,black]],
  pistol: [[-4,-4,0,4,12,4,wood],[0,4,0,16,4,5,metal],[0,6,0,16,2,5,edge],[7,4,0,2,2,3,black],[-6,8,0,2,2,2,amber],[0,-1,0,6,2,2,black],[3,1,0,2,4,2,black]],
  smg: [[0,0,0,6,18,5,metal],[0,13,0,3,12,3,black],[0,20,0,4,2,4,edge],[-4,-8,0,4,12,4,wood],[4,-7,0,4,14,4,black],[4,-15,0,5,2,5,amber],[0,-16,0,6,5,4,black],[-4,4,0,4,5,4,black],[0,0,3,2,12,1,edge]],
  shotgun: [[0,1,0,6,12,5,metal],[0,15,-1,2,18,3,black],[0,15,2,2,18,2,edge],[0,25,0,4,2,5,edge],[0,10,0,6,6,5,wood],[0,-9,0,6,10,4,wood],[-3,-15,0,8,6,4,wood],[-5,-19,0,9,2,5,black],[3,-5,0,2,8,4,wood]],
};

/** Real silhouettes on the rack are the controls; empty slots cannot select guns. */
export class WeaponRack {
  readonly group = new THREE.Group();
  readonly weapons: { id: WeaponId; mesh: THREE.Mesh }[] = [];
  private parent: THREE.Group;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.23 });

  constructor(parent: THREE.Group, furniture: DesignFurniture) {
    this.parent = parent; this.group.name = 'weapon-rack-controls';
    const [x, z, w, d] = furniture.rect;
    const facing = furniture.facing ?? '东';
    const yaw = ({ 北: Math.PI, 东: Math.PI / 2, 南: 0, 西: -Math.PI / 2 } as Record<string, number>)[facing] ?? Math.PI / 2;
    const normal = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.group.position.set(x + w / 2, furniture.y, z + d / 2);
    this.group.position.addScaledVector(normal, (facing === '东' || facing === '西' ? w : d) / 2 - 6);
    this.group.rotation.y = yaw;
    const width = facing === '东' || facing === '西' ? d : w;
    (['knife', 'pistol', 'smg', 'shotgun'] as WeaponId[]).forEach((id, index) => {
      const pieces = recipes[id].map(([cx, cy, cz, bw, bh, bd, hex]) => {
        const geometry = new THREE.BoxGeometry(bw, bh, bd);
        geometry.translate(Math.round(cx - bw / 2) + bw / 2, Math.round(cy - bh / 2) + bh / 2, Math.round(cz - bd / 2) + bd / 2);
        const color = new THREE.Color(hex), colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
      });
      const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
      const mesh = new THREE.Mesh(geometry, this.material); mesh.name = `rack-weapon-${id}`;
      mesh.position.set((index + 0.5) * width / 4 - width / 2, 43, 0);
      mesh.userData.rackWeapon = id; mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh); this.weapons.push({ id, mesh });
    });
    parent.add(this.group); parent.userData.weaponRack = this;
  }

  pick(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 64): WeaponId | null {
    if (!origin.toArray().every(Number.isFinite) || !direction.toArray().every(Number.isFinite) || direction.lengthSq() < 0.001) return null;
    this.parent.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(origin, direction.clone().normalize(), 0.3, maxDistance);
    ray.layers.enable(1);
    const hit = ray.intersectObject(this.parent, true).find(intersection => {
      for (let object: THREE.Object3D | null = intersection.object; object; object = object.parent) if (!object.visible) return false;
      return true;
    });
    return hit?.object.userData.rackWeapon ?? null;
  }

  dispose(): void {
    for (const weapon of this.weapons) weapon.mesh.geometry.dispose();
    this.material.dispose(); this.group.removeFromParent();
    if (this.parent.userData.weaponRack === this) delete this.parent.userData.weaponRack;
  }
}
