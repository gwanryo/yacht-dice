import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

export interface DiceSceneAPI {
  setValues(v: number[]): void;
  setHeld(h: boolean[]): void;
  shake(): void;
  roll(): void;
  onResult(cb: (values: number[]) => void): void;
}

/* ── Factory: creates the full 3D dice scene on the given canvas ── */
function createDiceScene(canvas: HTMLCanvasElement) {
  /* ── Constants ── */
  const isMobile = navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
  const SHADOW_SIZE = isMobile ? 1024 : 2048;
  const PX_RATIO = Math.min(window.devicePixelRatio, isMobile ? 2 : 3);
  const DICE_SIZE = 0.5, DICE_HALF = DICE_SIZE / 2;
  const CUP_BR = 1.3, CUP_TR = 1.7, CUP_H = 3.0;
  const LIFT_HEIGHT = 4.5;
  const PHYS_STEP = 1 / 120, MAX_SUB = 5;
  const TABLE_SIZE = 20, TABLE_HALF = TABLE_SIZE / 2, RAIL_R = 0.3;

  /* ── Scene, Camera, Renderer ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 14, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(PX_RATIO);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI / 2.5;
  controls.minDistance = 8;
  controls.maxDistance = 30;
  controls.target.set(0, 0, 0);

  /* ── Lighting ── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(5, 12, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 30;
  const camProps = ['left', 'right', 'top', 'bottom'] as const;
  [-14, 14, 14, -14].forEach((v, i) => {
    (dirLight.shadow.camera as unknown as Record<string, number>)[camProps[i]] = v;
  });
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);
  const spot = new THREE.SpotLight(0xffeedd, 0.4, 30, Math.PI / 4, 0.5);
  spot.position.set(0, 12, 0);
  scene.add(spot);

  /* ── Resize handler ── */
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  /* ── Textures ── */
  function noiseTex(base: string, sz: number, amt: number, rep?: number) {
    const c = document.createElement('canvas');
    c.width = c.height = sz;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, sz, sz);
    const d = ctx.getImageData(0, 0, sz, sz);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amt;
      d.data[i] = Math.max(0, Math.min(255, d.data[i] + n));
      d.data[i + 1] = Math.max(0, Math.min(255, d.data[i + 1] + n));
      d.data[i + 2] = Math.max(0, Math.min(255, d.data[i + 2] + n));
    }
    ctx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
    return t;
  }

  function bumpTex(sz: number, amt: number, rep?: number) {
    const c = document.createElement('canvas');
    c.width = c.height = sz;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, sz, sz);
    const d = ctx.getImageData(0, 0, sz, sz);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * amt;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
    return t;
  }

  /* ── Table ── */
  {
    const g = new THREE.Group();
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE),
      new THREE.MeshStandardMaterial({
        map: noiseTex('#2d5a27', 512, 15, 6),
        bumpMap: bumpTex(256, 40, 6),
        bumpScale: 0.02,
        roughness: 0.9,
      }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    g.add(felt);

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x3a1d0a, roughness: 0.4, metalness: 0.15,
      map: noiseTex('#2a1505', 256, 20, 6),
      bumpMap: bumpTex(256, 45, 6),
      bumpScale: 0.02,
    });
    const railGeo = new THREE.CapsuleGeometry(RAIL_R, TABLE_SIZE + RAIL_R * 2, 4, 16);

    [-(TABLE_HALF + RAIL_R), TABLE_HALF + RAIL_R].forEach(z => {
      const m = new THREE.Mesh(railGeo, railMat);
      m.rotation.z = Math.PI / 2;
      m.position.set(0, RAIL_R, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    });
    [-(TABLE_HALF + RAIL_R), TABLE_HALF + RAIL_R].forEach(x => {
      const m = new THREE.Mesh(railGeo, railMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, RAIL_R, 0);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    });
    scene.add(g);
  }

  /* ── Dice face mapping ── */
  const FACE_MAP = [3, 4, 1, 6, 2, 5];
  const PIP_AXES: Record<number, THREE.Vector3> = {
    1: new THREE.Vector3(0, 1, 0),
    6: new THREE.Vector3(0, -1, 0),
    2: new THREE.Vector3(0, 0, 1),
    5: new THREE.Vector3(0, 0, -1),
    3: new THREE.Vector3(1, 0, 0),
    4: new THREE.Vector3(-1, 0, 0),
  };
  const faceQuats: Record<number, THREE.Quaternion> = {};
  const _up = new THREE.Vector3(0, 1, 0);
  const _scratch = new THREE.Vector3();
  for (let v = 1; v <= 6; v++) {
    faceQuats[v] = new THREE.Quaternion().setFromUnitVectors(PIP_AXES[v], _up);
  }

  function readTopFace(quat: THREE.Quaternion) {
    let best = 1, bestDot = -2;
    for (let v = 1; v <= 6; v++) {
      const dot = _scratch.copy(PIP_AXES[v]).applyQuaternion(quat).dot(_up);
      if (dot > bestDot) { bestDot = dot; best = v; }
    }
    return best;
  }

  // Verify face quats
  for (let v = 1; v <= 6; v++) {
    const a = readTopFace(faceQuats[v]);
    if (a !== v) console.error(`faceQuats[${v}] shows ${a}!`);
  }

  /* ── Dice meshes ── */
  function pipTex(val: number) {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, s, s);
    const r = s * 0.08, cx = s / 2, cy = s / 2, o = s * 0.25;
    const P: Record<number, number[][]> = {
      1: [[cx, cy]],
      2: [[cx - o, cy - o], [cx + o, cy + o]],
      3: [[cx - o, cy - o], [cx, cy], [cx + o, cy + o]],
      4: [[cx - o, cy - o], [cx + o, cy - o], [cx - o, cy + o], [cx + o, cy + o]],
      5: [[cx - o, cy - o], [cx + o, cy - o], [cx, cy], [cx - o, cy + o], [cx + o, cy + o]],
      6: [[cx - o, cy - o], [cx + o, cy - o], [cx - o, cy], [cx + o, cy], [cx - o, cy + o], [cx + o, cy + o]],
    };
    ctx.fillStyle = '#1a1a1a';
    (P[val] || []).forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
    return new THREE.CanvasTexture(c);
  }

  function mkDie() {
    const g = new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE);
    const ms = FACE_MAP.map(v => new THREE.MeshStandardMaterial({ map: pipTex(v), roughness: 0.4, metalness: 0.05 }));
    const m = new THREE.Mesh(g, ms);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  const diceMeshes: THREE.Mesh[] = [];
  const diceInit: [number, number, number][] = [
    [-2.5, DICE_HALF, 2.5], [-1, DICE_HALF, 3], [0.5, DICE_HALF, 2], [2, DICE_HALF, 3], [3.5, DICE_HALF, 2.5],
  ];
  for (let i = 0; i < 5; i++) {
    const d = mkDie();
    d.position.set(...diceInit[i]);
    d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(d);
    diceMeshes.push(d);
  }

  /* ── Cup visual ── */
  function leatherTex(sz: number) {
    const c = document.createElement('canvas');
    c.width = c.height = sz;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, sz, sz);
    const d = ctx.getImageData(0, 0, sz, sz);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      d.data[i] = Math.max(0, Math.min(255, d.data[i] + n));
      d.data[i + 1] = Math.max(0, Math.min(255, d.data[i + 1] + n));
      d.data[i + 2] = Math.max(0, Math.min(255, d.data[i + 2] + n));
    }
    ctx.putImageData(d, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * sz, y = Math.random() * sz, r = 0.5 + Math.random() * 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  function leatherBump(sz: number) {
    const c = document.createElement('canvas');
    c.width = c.height = sz;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, sz, sz);
    const d = ctx.getImageData(0, 0, sz, sz);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 60;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    ctx.fillStyle = 'rgba(100,100,100,0.3)';
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * sz, y = Math.random() * sz, r = 1 + Math.random() * 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  const _leatherMap = leatherTex(512), _leatherBumpMap = leatherBump(512);
  const cupOuterMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.85, metalness: 0.05, side: THREE.FrontSide,
    map: _leatherMap, bumpMap: _leatherBumpMap, bumpScale: 0.04,
  });
  const cupInnerMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.85, metalness: 0.05, side: THREE.BackSide,
    map: _leatherMap, bumpMap: _leatherBumpMap, bumpScale: 0.04,
  });
  const cupBottomMat = new THREE.MeshStandardMaterial({
    color: 0xaa2222, roughness: 0.8, metalness: 0.05,
    map: noiseTex('#882222', 256, 12), bumpMap: bumpTex(256, 25), bumpScale: 0.015,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a843, roughness: 0.2, metalness: 0.85,
  });

  const cupGroup = new THREE.Group();
  const cupOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_TR, CUP_BR, CUP_H, 48, 1, true), cupOuterMat,
  );
  cupOuter.castShadow = true;
  cupOuter.position.y = CUP_H / 2;
  cupGroup.add(cupOuter);

  const cupInner = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_TR - 0.08, CUP_BR - 0.08, CUP_H - 0.05, 48, 1, true), cupInnerMat,
  );
  cupInner.position.y = CUP_H / 2 + 0.025;
  cupGroup.add(cupInner);

  const cupBottomViz = new THREE.Mesh(new THREE.CircleGeometry(CUP_BR - 0.08, 48), cupBottomMat);
  cupBottomViz.rotation.x = -Math.PI / 2;
  cupBottomViz.position.y = 0.03;
  cupBottomViz.castShadow = true;
  cupGroup.add(cupBottomViz);

  const cupBottomExt = new THREE.Mesh(new THREE.CircleGeometry(CUP_BR, 48), cupOuterMat);
  cupBottomExt.rotation.x = Math.PI / 2;
  cupBottomExt.position.y = 0.01;
  cupBottomExt.castShadow = true;
  cupGroup.add(cupBottomExt);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(CUP_TR, 0.05, 12, 48), goldMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CUP_H;
  cupGroup.add(rim);

  const band = new THREE.Mesh(new THREE.TorusGeometry((CUP_TR + CUP_BR) / 2 + 0.08, 0.02, 8, 48), goldMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = CUP_H * 0.55;
  cupGroup.add(band);

  const baseRim = new THREE.Mesh(new THREE.TorusGeometry(CUP_BR + 0.02, 0.035, 8, 48), goldMat);
  baseRim.rotation.x = Math.PI / 2;
  baseRim.position.y = 0.02;
  cupGroup.add(baseRim);

  const cupRestPos = new THREE.Vector3(0, 0, 0);
  cupGroup.position.copy(cupRestPos);
  scene.add(cupGroup);

  /* ── Physics world ── */
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.2;

  const gndMat = new CANNON.Material('gnd');
  const gndBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: gndMat });
  gndBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(gndBody);

  const tw = TABLE_HALF + RAIL_R;
  const wallDefs: [number, number, number, number, number, number][] = [
    [0, 1.5, -tw, tw, 1.5, 0.3], [0, 1.5, tw, tw, 1.5, 0.3],
    [-tw, 1.5, 0, 0.3, 1.5, tw], [tw, 1.5, 0, 0.3, 1.5, tw],
  ];
  wallDefs.forEach(([x, y, z, hx, hy, hz]) => {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(x, y, z);
    world.addBody(b);
  });

  const dMat = new CANNON.Material('dice');
  const diceBodies: CANNON.Body[] = [];
  for (let i = 0; i < 5; i++) {
    const b = new CANNON.Body({
      mass: 0.2,
      shape: new CANNON.Box(new CANNON.Vec3(DICE_HALF, DICE_HALF, DICE_HALF)),
      material: dMat, angularDamping: 0.4, linearDamping: 0.15,
    });
    b.position.set(...diceInit[i]);
    world.addBody(b);
    diceBodies.push(b);
  }
  world.addContactMaterial(new CANNON.ContactMaterial(dMat, gndMat, { friction: 0.6, restitution: 0.15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dMat, dMat, { friction: 0.5, restitution: 0.5 }));

  // Cup physics compound body
  const cupPhysMat = new CANNON.Material('cup');
  const cupBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: cupPhysMat });

  const WALL_SEGS = 32, WALL_RINGS = 6, WALL_DEPTH = 0.35;
  for (let ring = 0; ring < WALL_RINGS; ring++) {
    const t = (ring + 0.5) / WALL_RINGS;
    const rR = CUP_BR + (CUP_TR - CUP_BR) * t;
    const rY = t * CUP_H;
    const rH = CUP_H / WALL_RINGS;
    for (let i = 0; i < WALL_SEGS; i++) {
      const a = (i / WALL_SEGS) * Math.PI * 2;
      const sW = (2 * Math.PI * rR) / WALL_SEGS * 1.8;
      const sh = new CANNON.Box(new CANNON.Vec3(sW / 2, rH / 2 + 0.12, WALL_DEPTH));
      const off = new CANNON.Vec3(Math.cos(a) * rR, rY, Math.sin(a) * rR);
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, -a, 0);
      cupBody.addShape(sh, off, q);
    }
  }
  const botR = CUP_BR + 0.3, botH = 0.5;
  for (let i = 0; i < 5; i++) {
    const q = new CANNON.Quaternion();
    q.setFromEuler(0, (i / 5) * Math.PI, 0);
    cupBody.addShape(
      new CANNON.Box(new CANNON.Vec3(botR * (1 - i * 0.08), botH, botR * (1 - i * 0.08))),
      new CANNON.Vec3(0, 0, 0), q,
    );
  }
  cupBody.position.set(cupRestPos.x, cupRestPos.y, cupRestPos.z);
  world.addBody(cupBody);
  world.addContactMaterial(new CANNON.ContactMaterial(dMat, cupPhysMat, { friction: 0.5, restitution: 0.2 }));

  /* ── Scratch objects ── */
  const _invQ = new CANNON.Quaternion();
  const _rel = new CANNON.Vec3();
  const _local = new CANNON.Vec3();
  const _nl = new CANNON.Vec3();
  const _nudgeForce = new CANNON.Vec3();
  const _nudgePoint = new CANNON.Vec3();
  const _identityQ = new CANNON.Quaternion(0, 0, 0, 1);

  /* ── Held dice ── */
  let heldDice = [false, false, false, false, false];

  function freezeDiceKinematic() {
    diceBodies.forEach((b, i) => {
      if (heldDice[i]) return;
      b.type = CANNON.Body.KINEMATIC;
      b.velocity.setZero();
      b.angularVelocity.setZero();
    });
  }

  function captureDiceRelToCup() {
    return diceBodies.map(b => ({
      x: b.position.x - cupBody.position.x,
      y: b.position.y - cupBody.position.y,
      z: b.position.z - cupBody.position.z,
      qx: b.quaternion.x, qy: b.quaternion.y, qz: b.quaternion.z, qw: b.quaternion.w,
    }));
  }

  /* ── State machine ── */
  const S = { IDLE: 'IDLE', COLLECT: 'COLLECT', SHAKE: 'SHAKE', ROLL: 'ROLL', SETTLE: 'SETTLE', PRESENT: 'PRESENT', RESULT: 'RESULT' } as const;
  type State = typeof S[keyof typeof S];
  let state: State = S.IDLE;
  let targetVals: (number | null)[] = [null, null, null, null, null];
  let _onResultCallback: ((values: number[]) => void) | null = null;

  function setDiceShadows(on: boolean) { diceMeshes.forEach(m => m.castShadow = on); }

  function setState(s: State) {
    state = s;
    controls.enabled = (s === S.IDLE || s === S.RESULT);
    setDiceShadows(s === S.IDLE || s === S.SETTLE || s === S.PRESENT || s === S.RESULT);
    if (s !== S.PRESENT) animCam(s);
  }

  /* ── Collecting ── */
  let colStart = 0, colPhase = 0;
  let colStartPos: { x: number; y: number; z: number }[] = [];
  const COL_FLY = 700, COL_STAGGER = 150;

  function startCollect() {
    setState(S.COLLECT);
    colPhase = 0;
    colStart = performance.now();
    if (!(cupBody as CANNON.Body & { world: CANNON.World | null }).world) world.addBody(cupBody);
    cupBody.position.set(cupRestPos.x, cupRestPos.y, cupRestPos.z);
    cupBody.quaternion.set(0, 0, 0, 1);
    colStartPos = diceBodies.map(b => ({ x: b.position.x, y: b.position.y, z: b.position.z }));
    freezeDiceKinematic();
  }

  function updateCollect() {
    const now = performance.now();
    if (colPhase === 0) {
      let allDone = true;
      diceBodies.forEach((body, i) => {
        if (heldDice[i]) return;
        const elapsed = now - colStart - i * COL_STAGGER;
        if (elapsed < 0) { allDone = false; return; }
        let t = Math.min(elapsed / COL_FLY, 1);
        t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const sp = colStartPos[i];
        const angle = (i / 5) * Math.PI * 2, innerR = 0.35;
        const tx = cupRestPos.x + Math.cos(angle) * innerR;
        const tz = cupRestPos.z + Math.sin(angle) * innerR;
        const endY = cupRestPos.y + 1.0 + i * 0.12, arcH = 3.5 + i * 0.3;
        const linY = sp.y + (endY - sp.y) * t, arc = Math.sin(t * Math.PI) * arcH * (1 - t * 0.6);
        body.position.set(sp.x + (tx - sp.x) * t, linY + arc, sp.z + (tz - sp.z) * t);
        body.quaternion.setFromEuler(t * Math.PI * 2.5 + i, t * Math.PI * 1.5, i * 0.5);
        if (t < 1) allDone = false;
      });
      if (allDone) {
        colPhase = 1;
        colStart = now;
        diceBodies.forEach((body, i) => {
          if (heldDice[i]) return;
          body.type = CANNON.Body.DYNAMIC;
          body.velocity.set(0, -1, 0);
          body.angularVelocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        });
      }
    } else if (colPhase === 1) {
      const elapsed = now - colStart;
      const unheldBodies = diceBodies.filter((_, i) => !heldDice[i]);
      const allSlow = unheldBodies.every(b => b.velocity.length() < 0.3 && b.angularVelocity.length() < 0.3);
      if ((elapsed > 800 && allSlow) || elapsed > 2500) startShake();
    }
  }

  /* ── Shaking ── */
  let shakeStart = 0, shakePhase = 0;
  let diceRelPos: ReturnType<typeof captureDiceRelToCup> = [];
  const LIFT_DUR = 600;

  function startShake() {
    setState(S.SHAKE);
    shakeStart = performance.now();
    shakePhase = 0;
    diceRelPos = captureDiceRelToCup();
    freezeDiceKinematic();
  }

  function constrainDiceToCup() {
    cupBody.quaternion.conjugate(_invQ);
    diceBodies.forEach(body => {
      body.position.vsub(cupBody.position, _rel);
      _invQ.vmult(_rel, _local);
      const t = Math.max(0, Math.min(_local.y / CUP_H, 1));
      const maxR = CUP_BR + (CUP_TR - CUP_BR) * t - DICE_HALF - 0.15;
      const r = Math.sqrt(_local.x * _local.x + _local.z * _local.z);
      if (r > maxR || _local.y < -0.5 || _local.y > CUP_H + 0.5) {
        _nl.set((Math.random() - 0.5) * 0.4, CUP_H * 0.3, (Math.random() - 0.5) * 0.4);
        cupBody.quaternion.vmult(_nl, _rel);
        _rel.vadd(cupBody.position, _rel);
        body.position.copy(_rel);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      }
    });
  }

  function updateShake() {
    const elapsed = performance.now() - shakeStart;

    if (shakePhase === 0) {
      const t = Math.min(elapsed / LIFT_DUR, 1), e = t * t * (3 - 2 * t);
      const liftY = e * LIFT_HEIGHT;
      cupBody.position.set(cupRestPos.x, cupRestPos.y + liftY, cupRestPos.z);
      cupBody.quaternion.set(0, 0, 0, 1);
      diceBodies.forEach((b, i) => {
        if (heldDice[i]) return;
        const rp = diceRelPos[i];
        b.position.set(cupBody.position.x + rp.x, cupBody.position.y + rp.y, cupBody.position.z + rp.z);
        b.quaternion.set(rp.qx, rp.qy, rp.qz, rp.qw);
      });
      if (t >= 1) {
        shakePhase = 1;
        shakeStart = performance.now();
        diceBodies.forEach((b, i) => {
          if (heldDice[i]) return;
          b.type = CANNON.Body.DYNAMIC;
          b.velocity.set(0, 0, 0);
          b.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
        });
      }
      return;
    }

    // SHAKE phase
    const se = performance.now() - shakeStart;
    const swirl = se * 0.008;
    const circR = 0.5 + Math.sin(se * 0.003) * 0.12;

    const px = Math.sin(swirl) * circR + Math.sin(swirl * 2.3 + 1) * 0.08;
    const pz = Math.cos(swirl) * circR + Math.cos(swirl * 1.7 + 2) * 0.08;

    const tiltAmt = 0.22 + Math.sin(se * 0.005) * 0.04;
    const rx = -Math.sin(swirl) * tiltAmt;
    const rz = Math.cos(swirl) * tiltAmt;
    const ry = Math.sin(se * 0.004) * 0.08;

    const bounceY = Math.abs(Math.sin(swirl * 2)) * 0.08;

    cupBody.position.set(cupRestPos.x + px, LIFT_HEIGHT + bounceY, cupRestPos.z + pz);
    cupBody.quaternion.setFromEuler(rx, ry, rz);

    if (se % 800 < 17) {
      diceBodies.forEach(b => {
        if (b.velocity.length() < 2) {
          _nudgeForce.set((Math.random() - 0.5) * 0.12, 0.08, (Math.random() - 0.5) * 0.12);
          b.applyImpulse(_nudgeForce, _nudgePoint);
        }
      });
    }

    diceBodies.forEach(b => {
      const v = b.velocity.length();
      if (v > 5) b.velocity.scale(5 / v, b.velocity);
      const av = b.angularVelocity.length();
      if (av > 10) b.angularVelocity.scale(10 / av, b.angularVelocity);
    });

    constrainDiceToCup();
  }

  /* ── Rolling ── */
  let rollStart = 0, rollPhase = 0;
  let rollDiceRelPos: ReturnType<typeof captureDiceRelToCup> = [];
  let rollStartCupPos: { x: number; y: number; z: number } | null = null;
  let rollStartCupQ: CANNON.Quaternion | null = null;
  const SLIDE_DUR = 450, POUR_DUR = 800;

  function slerpCannon(qa: CANNON.Quaternion, qb: CANNON.Quaternion, t: number, result: CANNON.Quaternion) {
    let ax = qa.x, ay = qa.y, az = qa.z, aw = qa.w;
    let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
    let cosH = ax * bx + ay * by + az * bz + aw * bw;
    if (cosH < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cosH = -cosH; }
    if (cosH >= 1.0) { result.set(ax, ay, az, aw); return; }
    const half = Math.acos(cosH), sinH = Math.sqrt(1 - cosH * cosH);
    if (Math.abs(sinH) < 0.001) {
      result.set(ax * 0.5 + bx * 0.5, ay * 0.5 + by * 0.5, az * 0.5 + bz * 0.5, aw * 0.5 + bw * 0.5);
    } else {
      const rA = Math.sin((1 - t) * half) / sinH, rB = Math.sin(t * half) / sinH;
      result.set(ax * rA + bx * rB, ay * rA + by * rB, az * rA + bz * rB, aw * rA + bw * rB);
    }
    result.normalize();
  }

  function startRoll() {
    setState(S.ROLL);
    rollStart = performance.now();
    rollPhase = 0;
    rollStartCupPos = { x: cupBody.position.x, y: cupBody.position.y, z: cupBody.position.z };
    rollStartCupQ = cupBody.quaternion.clone();
    rollDiceRelPos = captureDiceRelToCup();
    freezeDiceKinematic();
  }

  let settleStart = 0;
  let settleTargetCannonQ: CANNON.Quaternion[] = [];

  function updateRoll() {
    const elapsed = performance.now() - rollStart;
    if (rollPhase === 0) {
      const t = Math.min(elapsed / SLIDE_DUR, 1), e = t * t * (3 - 2 * t);
      const endX = cupRestPos.x - 3.5;
      const cx = rollStartCupPos!.x + (endX - rollStartCupPos!.x) * e;
      const cy = rollStartCupPos!.y + (0 - rollStartCupPos!.y) * e;
      const cz = rollStartCupPos!.z + (cupRestPos.z - rollStartCupPos!.z) * e;
      cupBody.position.set(cx, cy, cz);
      slerpCannon(rollStartCupQ!, _identityQ, e, cupBody.quaternion);
      diceBodies.forEach((b, i) => {
        if (heldDice[i]) return;
        const rp = rollDiceRelPos[i];
        b.position.set(cx + rp.x, cy + rp.y, cz + rp.z);
        b.quaternion.set(rp.qx, rp.qy, rp.qz, rp.qw);
      });
      if (t >= 1) {
        rollPhase = 1;
        rollStart = performance.now();
        diceBodies.forEach((b, i) => {
          if (heldDice[i]) return;
          b.type = CANNON.Body.DYNAMIC;
          b.velocity.setZero();
          b.angularVelocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        });
      }
    } else {
      const t = Math.min(elapsed / POUR_DUR, 1);
      const tiltE = 1 - Math.pow(1 - t, 3);
      const tiltAngle = -tiltE * (Math.PI * 0.53);
      const liftY = tiltE * 2.5;
      const pourX = cupRestPos.x - 3.5, pourZ = cupRestPos.z;
      cupBody.position.set(pourX, liftY, pourZ);
      cupBody.quaternion.setFromEuler(0, 0, tiltAngle);
      if (t >= 1) {
        world.removeBody(cupBody);
        cupGroup.position.set(-8, 0, 0);
        cupGroup.quaternion.set(0, 0, 0, 1);
        settleStart = performance.now();
        settleTargetCannonQ = targetVals.map(val => {
          const yaw = Math.random() * Math.PI * 2;
          const tq = new THREE.Quaternion().setFromAxisAngle(_up, yaw).multiply(faceQuats[val || 1]);
          return new CANNON.Quaternion(tq.x, tq.y, tq.z, tq.w);
        });
        setState(S.SETTLE);
      }
    }
  }

  /* ── Settling ── */
  const SETTLE_THRESH = 0.08;

  function allStopped() {
    return diceBodies.every(b => b.velocity.length() < SETTLE_THRESH && b.angularVelocity.length() < SETTLE_THRESH);
  }

  function separateDice() {
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
          const dx = diceBodies[i].position.x - diceBodies[j].position.x;
          const dz = diceBodies[i].position.z - diceBodies[j].position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const minDist = DICE_SIZE * 1.4;
          if (dist < minDist) {
            const d = dist || 0.001;
            const push = (minDist - d) / 2 + 0.03;
            const nx = dx / d, nz = dz / d;
            diceBodies[i].position.x += nx * push;
            diceBodies[i].position.z += nz * push;
            diceBodies[j].position.x -= nx * push;
            diceBodies[j].position.z -= nz * push;
          }
        }
      }
    }
  }

  function settleNudge() {
    const el = performance.now() - settleStart;
    const timeFactor = Math.min(el / 1200, 1);
    diceBodies.forEach((body, i) => {
      if (!settleTargetCannonQ[i]) return;
      const blend = timeFactor * 0.12;
      if (blend > 0.003) {
        slerpCannon(body.quaternion, settleTargetCannonQ[i], blend, body.quaternion);
        body.quaternion.normalize();
        body.angularVelocity.scale(1 - timeFactor * 0.04, body.angularVelocity);
      }
    });
    if (el > 1200) diceBodies.forEach(b => {
      b.velocity.scale(0.93, b.velocity);
      b.angularVelocity.scale(0.93, b.angularVelocity);
    });
    const bound = TABLE_HALF - DICE_SIZE;
    diceBodies.forEach(b => {
      if (b.position.x < -bound) { b.position.x = -bound; b.velocity.x = Math.abs(b.velocity.x) * 0.2; }
      if (b.position.x > bound) { b.position.x = bound; b.velocity.x = -Math.abs(b.velocity.x) * 0.2; }
      if (b.position.z < -bound) { b.position.z = -bound; b.velocity.z = Math.abs(b.velocity.z) * 0.2; }
      if (b.position.z > bound) { b.position.z = bound; b.velocity.z = -Math.abs(b.velocity.z) * 0.2; }
    });
  }

  function updateSettle() {
    const el = performance.now() - settleStart;
    const closeEnough = settleTargetCannonQ.length === 5 && diceBodies.every((body, i) => {
      const t = settleTargetCannonQ[i];
      return Math.abs(body.quaternion.x * t.x + body.quaternion.y * t.y + body.quaternion.z * t.z + body.quaternion.w * t.w) > 0.99;
    });
    if ((el > 800 && allStopped() && closeEnough) || el > 4000) {
      separateDice();
      diceBodies.forEach((body, i) => {
        body.type = CANNON.Body.KINEMATIC;
        body.velocity.setZero();
        body.angularVelocity.setZero();
        body.quaternion.copy(settleTargetCannonQ[i]);
      });
      diceMeshes.forEach((m, i) => {
        m.position.copy(diceBodies[i].position as unknown as THREE.Vector3);
        const tq = settleTargetCannonQ[i];
        m.quaternion.set(tq.x, tq.y, tq.z, tq.w);
        const actual = readTopFace(m.quaternion);
        if (actual !== targetVals[i]) {
          m.quaternion.copy(faceQuats[targetVals[i] || 1]);
          diceBodies[i].quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w);
        }
      });
      startPresent();
    }
  }

  /* ── Present dice in a row ── */
  let presentStart = 0;
  let presentFromPos: THREE.Vector3[] = [];
  let presentFromQ: THREE.Quaternion[] = [];
  let presentToQ: THREE.Quaternion[] = [];
  const PRESENT_DUR = 900;
  const presentRowPos = [
    new THREE.Vector3(-2.5, DICE_HALF, 3.5),
    new THREE.Vector3(-1.25, DICE_HALF, 3.5),
    new THREE.Vector3(0, DICE_HALF, 3.5),
    new THREE.Vector3(1.25, DICE_HALF, 3.5),
    new THREE.Vector3(2.5, DICE_HALF, 3.5),
  ];

  function startPresent() {
    presentStart = performance.now();
    presentFromPos = diceMeshes.map(m => m.position.clone());
    presentFromQ = diceMeshes.map(m => m.quaternion.clone());
    presentToQ = targetVals.map(val => faceQuats[val || 1].clone());
    camF.p.copy(camera.position);
    camF.l.copy(controls.target);
    camTTo.p.set(...(camT[S.RESULT].p as [number, number, number]));
    camTTo.l.set(...(camT[S.RESULT].l as [number, number, number]));
    camAS = performance.now();
    camAnim = true;
    setState(S.PRESENT);
  }

  function updatePresent() {
    const el = performance.now() - presentStart;
    let t = Math.min(el / PRESENT_DUR, 1);
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    diceBodies.forEach((body, i) => {
      const from = presentFromPos[i], to = presentRowPos[i];
      const arcY = Math.sin(t * Math.PI) * 1.2;
      body.position.set(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t + arcY,
        from.z + (to.z - from.z) * t,
      );
    });
    diceMeshes.forEach((m, i) => {
      m.quaternion.slerpQuaternions(presentFromQ[i], presentToQ[i], t);
    });
    if (t >= 1) {
      diceBodies.forEach((body, i) => {
        body.position.set(presentRowPos[i].x, presentRowPos[i].y, presentRowPos[i].z);
      });
      diceMeshes.forEach((m, i) => m.quaternion.copy(presentToQ[i]));
      setState(S.RESULT);
      if (_onResultCallback) _onResultCallback(targetVals.slice() as number[]);
    }
  }

  /* ── Camera ── */
  const camT: Record<string, { p: number[]; l: number[] }> = {
    [S.IDLE]: { p: [0, 14, 5], l: [0, 0, 0] },
    [S.COLLECT]: { p: [0, 12, 4], l: [0, 1, 0] },
    [S.SHAKE]: { p: [2, LIFT_HEIGHT + 9, 5], l: [0, LIFT_HEIGHT, 0] },
    [S.ROLL]: { p: [0, 14, 5], l: [0, 0, 0] },
    [S.SETTLE]: { p: [0, 12, 5], l: [0, 0, 0] },
    [S.RESULT]: { p: [0, 10, 4], l: [0, 0, 3.5] },
  };
  let camAnim = false;
  const camF = { p: new THREE.Vector3(), l: new THREE.Vector3() };
  const camTTo = { p: new THREE.Vector3(), l: new THREE.Vector3() };
  let camAS = 0;
  const CAM_D = 1000;

  function animCam(s: string) {
    const t = camT[s];
    if (!t) return;
    camF.p.copy(camera.position);
    camF.l.copy(controls.target);
    camTTo.p.set(...(t.p as [number, number, number]));
    camTTo.l.set(...(t.l as [number, number, number]));
    camAS = performance.now();
    camAnim = true;
  }

  const _sc = new THREE.Vector3();
  function updateCam() {
    if (camAnim) {
      const el = performance.now() - camAS;
      let t = Math.min(el / CAM_D, 1);
      t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(camF.p, camTTo.p, t);
      controls.target.lerpVectors(camF.l, camTTo.l, t);
      if (t >= 1) camAnim = false;
    }
    if (state === S.SETTLE && !camAnim) {
      _sc.set(0, 0, 0);
      diceMeshes.forEach(m => _sc.add(m.position));
      _sc.divideScalar(5);
      controls.target.lerp(_sc, 0.05);
    }
  }

  /* ── Sync & Loop ── */
  function sync() {
    for (let i = 0; i < 5; i++) {
      diceMeshes[i].position.copy(diceBodies[i].position as unknown as THREE.Vector3);
      if (state !== S.PRESENT && state !== S.RESULT) {
        diceMeshes[i].quaternion.copy(diceBodies[i].quaternion as unknown as THREE.Quaternion);
      }
    }
    if ((cupBody as CANNON.Body & { world: CANNON.World | null }).world) {
      cupGroup.position.copy(cupBody.position as unknown as THREE.Vector3);
      cupGroup.quaternion.copy(cupBody.quaternion as unknown as THREE.Quaternion);
    }
  }

  function upState() {
    switch (state) {
      case S.COLLECT: updateCollect(); break;
      case S.SHAKE: updateShake(); break;
      case S.ROLL: updateRoll(); break;
      case S.SETTLE: updateSettle(); break;
      case S.PRESENT: updatePresent(); break;
    }
  }

  const clock = new THREE.Clock();
  let animFrameId = 0;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    upState();
    if (state !== S.IDLE && state !== S.RESULT) world.step(PHYS_STEP, dt, MAX_SUB);
    if (state === S.SETTLE) settleNudge();
    sync();
    updateCam();
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  /* ── API ── */
  const api: DiceSceneAPI = {
    setValues(v) {
      if (!Array.isArray(v) || v.length !== 5) return;
      targetVals = v.map(val => (val >= 1 && val <= 6) ? val : null);
    },
    setHeld(h) {
      if (Array.isArray(h) && h.length === 5) heldDice = h.slice();
    },
    shake() {
      if (state === S.IDLE || state === S.RESULT) {
        // Fill any null targetVals with random
        targetVals = targetVals.map(v => (v !== null && v >= 1 && v <= 6) ? v : Math.ceil(Math.random() * 6));
        startCollect();
      }
    },
    roll() {
      if (state === S.SHAKE) startRoll();
    },
    onResult(cb) {
      _onResultCallback = cb;
    },
  };

  /* ── Cleanup ── */
  const cleanup = () => {
    cancelAnimationFrame(animFrameId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.dispose();

    // Dispose all scene children
    scene.traverse(obj => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      const mat = (obj as THREE.Mesh).material;
      if (mat) {
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach(m => {
          if ((m as THREE.MeshStandardMaterial).map) (m as THREE.MeshStandardMaterial).map!.dispose();
          if ((m as THREE.MeshStandardMaterial).bumpMap) (m as THREE.MeshStandardMaterial).bumpMap!.dispose();
          m.dispose();
        });
      }
    });
  };

  return { api, cleanup };
}

/* ── React Component ── */
const DiceScene = forwardRef<DiceSceneAPI>(function DiceScene(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<DiceSceneAPI | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { api, cleanup } = createDiceScene(canvas);
    apiRef.current = api;
    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      apiRef.current = null;
      cleanupRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setValues(v) { apiRef.current?.setValues(v); },
    setHeld(h) { apiRef.current?.setHeld(h); },
    shake() { apiRef.current?.shake(); },
    roll() { apiRef.current?.roll(); },
    onResult(cb) { apiRef.current?.onResult(cb); },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
});

export default DiceScene;
