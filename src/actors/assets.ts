import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const parts = new Map<string, THREE.Object3D>();
let pending: Promise<void> | undefined;
const required = ['hips-geometry','torso-geometry','neck-geometry','head-geometry','thigh','shin','boot','sleeve','forearm','glove','knife-geometry','pistol-geometry','smg-geometry','shotgun-geometry'];

export function hunterAssetUrl(baseUrl: string): string {
  return `${baseUrl}models/characters/hunter-kit.glb`;
}

/** Joint-local rigid parts share geometry/materials. No skin is duplicated or rebound. */
export function preloadHunterAssets(progress?: (message: string) => void): Promise<void> {
  if (pending) return pending;
  progress?.('正在加载猎人、四种武器与挂点…');
  pending = new GLTFLoader().loadAsync(hunterAssetUrl(import.meta.env.BASE_URL)).then(gltf => {
    cacheHunterAssetScene(gltf.scene);
    progress?.('猎人与四种武器已就绪');
  }).catch(error => { parts.clear(); pending = undefined; throw new Error(`猎人美术资源加载失败：${error instanceof Error ? error.message : error}`); });
  return pending;
}

export function cacheHunterAssetScene(scene: THREE.Object3D): void {
  for (const name of required) {
    const part = scene.getObjectByName(name);
    if (!part) throw new Error(`猎人资源缺少部件：${name}`);
    part.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    parts.set(name, part);
  }
}

export function hunterAsset(name: string): THREE.Object3D | undefined {
  const source = parts.get(name);
  if (!source) return undefined;
  const clone = source.clone(true);
  clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.set(1, 1, 1);
  return clone;
}

/** Called only after all hunter instances have been removed. */
export function disposeHunterAssets(): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const part of parts.values()) part.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); parts.clear(); pending = undefined;
}
