import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DICE_SIZE } from './constants';
import { pipTex } from './textures';

export const FACE_MAP = [3, 4, 1, 6, 2, 5];

export const PIP_AXES: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1),
  5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
};

export const UP = new THREE.Vector3(0, 1, 0);
const _scratch = new THREE.Vector3();

export const faceQuats: Record<number, THREE.Quaternion> = {};
for (let v = 1; v <= 6; v++) {
  faceQuats[v] = new THREE.Quaternion().setFromUnitVectors(PIP_AXES[v], UP);
}

export function readTopFace(quat: THREE.Quaternion): number {
  let best = 1, bestDot = -2;
  for (let v = 1; v <= 6; v++) {
    const dot = _scratch.copy(PIP_AXES[v]).applyQuaternion(quat).dot(UP);
    if (dot > bestDot) { bestDot = dot; best = v; }
  }
  return best;
}

let sharedGeometry: RoundedBoxGeometry | null = null;

export function mkDie(): THREE.Mesh {
  if (!sharedGeometry) {
    sharedGeometry = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 4, 0.06);
  }
  const ms = FACE_MAP.map(v => new THREE.MeshStandardMaterial({ map: pipTex(v), roughness: 0.4, metalness: 0.05, transparent: true }));
  const m = new THREE.Mesh(sharedGeometry, ms);
  m.castShadow = m.receiveShadow = true;
  return m;
}
