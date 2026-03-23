import * as THREE from 'three';
import { noiseTex, bumpTex } from './textures';
import { TABLE_SIZE, TABLE_HALF, RAIL_R } from './constants';

export function createTable(): THREE.Group {
  const g = new THREE.Group();

  const FRAME_W = 0.8;       // wooden frame width around felt
  const FRAME_H = 0.15;      // frame thickness
  const OUTER = TABLE_HALF + FRAME_W;

  // ── Materials ──
  const feltMat = new THREE.MeshStandardMaterial({
    map: noiseTex('#2d5a27', 512, 15, 6),
    bumpMap: bumpTex(256, 40, 6),
    bumpScale: 0.02,
    roughness: 0.9,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x3a1d0a, roughness: 0.4, metalness: 0.15,
    map: noiseTex('#2a1505', 256, 20, 6),
    bumpMap: bumpTex(256, 45, 6),
    bumpScale: 0.02,
  });

  // ── 1. Wooden base plate — covers entire table footprint ──
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(OUTER * 2, FRAME_H, OUTER * 2),
    woodMat,
  );
  base.position.y = -FRAME_H / 2;
  base.receiveShadow = true;
  g.add(base);

  // ── 2. Green felt — inset on top of base, exactly TABLE_SIZE ──
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE),
    feltMat,
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.005; // just above base top
  felt.receiveShadow = true;
  g.add(felt);

  // ── 3. Frame border strips — wooden ledge between felt edge and rail ──
  const stripH = RAIL_R * 0.6;  // height of the wooden ledge
  const stripGeos = [
    // along X: full outer width, FRAME_W deep
    new THREE.BoxGeometry(OUTER * 2, stripH, FRAME_W),
    // along Z: inner TABLE_SIZE width, FRAME_W deep (no overlap at corners)
    new THREE.BoxGeometry(FRAME_W, stripH, TABLE_SIZE),
  ];

  // Front & back strips (along X)
  [-1, 1].forEach(sign => {
    const m = new THREE.Mesh(stripGeos[0], woodMat);
    m.position.set(0, stripH / 2, sign * (TABLE_HALF + FRAME_W / 2));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  // Left & right strips (along Z)
  [-1, 1].forEach(sign => {
    const m = new THREE.Mesh(stripGeos[1], woodMat);
    m.position.set(sign * (TABLE_HALF + FRAME_W / 2), stripH / 2, 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });

  // ── 4. Rail cushions — sit on top of the frame strips ──
  const railLen = TABLE_SIZE;
  const railGeo = new THREE.CapsuleGeometry(RAIL_R, railLen, 4, 16);

  // Side rails (along X axis)
  [-1, 1].forEach(sign => {
    const m = new THREE.Mesh(railGeo, woodMat);
    m.rotation.z = Math.PI / 2;
    m.position.set(0, stripH + RAIL_R, sign * (TABLE_HALF + FRAME_W / 2));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  // End rails (along Z axis)
  [-1, 1].forEach(sign => {
    const m = new THREE.Mesh(railGeo, woodMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(sign * (TABLE_HALF + FRAME_W / 2), stripH + RAIL_R, 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });

  // ── 5. Corner posts — cylinders that connect rails at corners ──
  const postR = RAIL_R * 1.15;
  const postH = stripH + RAIL_R * 2;
  const postGeo = new THREE.CylinderGeometry(postR, postR, postH, 16);
  const cornerOff = TABLE_HALF + FRAME_W / 2;
  [
    [-cornerOff, -cornerOff],
    [cornerOff, -cornerOff],
    [-cornerOff, cornerOff],
    [cornerOff, cornerOff],
  ].forEach(([x, z]) => {
    const m = new THREE.Mesh(postGeo, woodMat);
    m.position.set(x, postH / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });

  return g;
}
