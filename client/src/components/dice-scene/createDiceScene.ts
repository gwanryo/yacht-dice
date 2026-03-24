import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  DICE_SIZE, DICE_HALF, CUP_BR, CUP_TR, CUP_H,
  LIFT_HEIGHT, PHYS_STEP, MAX_SUB, TABLE_HALF,
  FADE_SPEED, COL_FLY, COL_STAGGER, LIFT_DUR,
  SLIDE_DUR, POUR_DUR, SETTLE_THRESH, PRESENT_DUR,
  DICE_INIT_POS, PRESENT_ROW, S,
  type State,
} from './constants';
import { createTable } from './table';
import { createCupVisual } from './cup';
import { createPhysicsWorld } from './physics';
import { faceQuats, readTopFace, mkDie, UP } from './dice';
import { slerpCannon } from './slerp';
import { setupRenderer } from './setupRenderer';
import { createCameraController } from './cameraController';

export interface DiceSceneAPI {
  setValues(v: number[]): void;
  setHeld(h: boolean[]): void;
  shake(): void;
  roll(): boolean;
  onResult(cb: (values: number[]) => void): void;
}

export function createDiceScene(canvas: HTMLCanvasElement) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Scene, Camera, Renderer, Lighting ── */
  const { scene, camera, renderer, controls, onResize } = setupRenderer(canvas);
  window.addEventListener('resize', onResize, { passive: true });

  /* ── Camera controller ── */
  const cam = createCameraController(camera, controls);

  /* ── Table ── */
  scene.add(createTable());

  /* ── Dice meshes ── */
  const diceOpacity = [1, 1, 1, 1, 1];
  const diceMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const d = mkDie();
    d.position.set(...DICE_INIT_POS[i]);
    d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(d);
    diceMeshes.push(d);
  }

  function updateDiceOpacity() {
    for (let i = 0; i < 5; i++) {
      const shouldHide = heldDice[i] && state !== S.IDLE && state !== S.PRESENT && state !== S.RESULT;
      const target = shouldHide ? 0 : 1;
      const rate = shouldHide ? FADE_SPEED * 1.2 : FADE_SPEED;
      diceOpacity[i] += (target - diceOpacity[i]) * rate;
      if (Math.abs(diceOpacity[i] - target) < 0.01) diceOpacity[i] = target;
      const needsTransparency = diceOpacity[i] < 0.999;
      const mats = diceMeshes[i].material as THREE.MeshStandardMaterial[];
      mats.forEach(m => { m.opacity = diceOpacity[i]; m.transparent = needsTransparency; });
      diceMeshes[i].castShadow = diceOpacity[i] > 0.5;
      diceMeshes[i].visible = diceOpacity[i] > 0.01;
    }
  }

  /* ── Cup visual ── */
  const cupGroup = createCupVisual();
  const cupRestPos = new THREE.Vector3(0, 0, 0);
  cupGroup.position.copy(cupRestPos);
  scene.add(cupGroup);

  /* ── Physics ── */
  const { world, diceBodies, cupBody } = createPhysicsWorld(DICE_INIT_POS);
  cupBody.position.set(cupRestPos.x, cupRestPos.y, cupRestPos.z);

  /* ── Scratch objects ── */
  const _invQ = new CANNON.Quaternion();
  const _rel = new CANNON.Vec3();
  const _local = new CANNON.Vec3();
  const _nl = new CANNON.Vec3();
  const _nudgeForce = new CANNON.Vec3();
  const _nudgePoint = new CANNON.Vec3();
  const _cupDown = new CANNON.Vec3();
  const _extraG = new CANNON.Vec3();
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
  let state: State = S.IDLE;
  let targetVals: (number | null)[] = [null, null, null, null, null];
  let _onResultCallback: ((values: number[]) => void) | null = null;
  let _pendingRoll = false;

  function setDiceShadows(on: boolean) { diceMeshes.forEach(m => m.castShadow = on); }

  function setState(s: State) {
    state = s;
    controls.enabled = (s === S.IDLE || s === S.RESULT);
    setDiceShadows(s === S.IDLE || s === S.SETTLE || s === S.PRESENT || s === S.RESULT);
    if (s !== S.PRESENT) cam.animateTo(s);
  }

  /* ── Collecting ── */
  let colStart = 0, colPhase = 0;
  let colStartPos: { x: number; y: number; z: number }[] = [];

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
      if ((elapsed > 400 && allSlow) || elapsed > 1500) startShake();
    }
  }

  /* ── Shaking ── */
  let shakeStart = 0, shakePhase = 0;
  let diceRelPos: ReturnType<typeof captureDiceRelToCup> = [];

  function startShake() {
    setState(S.SHAKE);
    shakeStart = performance.now();
    shakePhase = 0;
    diceRelPos = captureDiceRelToCup();
    freezeDiceKinematic();
  }

  function constrainDiceToCup() {
    cupBody.quaternion.conjugate(_invQ);
    diceBodies.forEach((body, i) => {
      if (heldDice[i]) return;
      body.position.vsub(cupBody.position, _rel);
      _invQ.vmult(_rel, _local);
      const t = Math.max(0, Math.min(_local.y / CUP_H, 1));
      const maxR = CUP_BR + (CUP_TR - CUP_BR) * t - DICE_HALF - 0.15;
      const r = Math.sqrt(_local.x * _local.x + _local.z * _local.z);
      if (r > maxR || _local.y < -0.5 || _local.y > CUP_H + 0.5) {
        _nl.set((Math.random() - 0.5) * 0.2, DICE_HALF + 0.05, (Math.random() - 0.5) * 0.2);
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
        if (_pendingRoll) {
          _pendingRoll = false;
          startRoll();
          return;
        }
        diceBodies.forEach((b, i) => {
          if (heldDice[i]) return;
          b.type = CANNON.Body.DYNAMIC;
          b.velocity.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
          b.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        });
      }
      return;
    }

    // SHAKE phase — multi-layered hand-shake motion
    const se = performance.now() - shakeStart;
    const t = se * 0.001; // seconds
    const baseFreq = 4.5; // Hz — natural hand shake speed

    // Multi-harmonic position: irregular figure-8 + noise
    const px = Math.sin(t * baseFreq) * 0.55
             + Math.sin(t * baseFreq * 1.73 + 0.5) * 0.20
             + Math.sin(t * baseFreq * 3.1 + 2.1) * 0.08;
    const pz = Math.cos(t * baseFreq * 0.87) * 0.45
             + Math.cos(t * baseFreq * 2.3 + 1.3) * 0.15
             + Math.sin(t * baseFreq * 4.7 + 0.7) * 0.06;

    // Asymmetric bounce: quick snap up, gentle settle down
    const bounceRaw = Math.sin(t * baseFreq * 2.1) * 0.5 + 0.5;
    const bounceY = Math.pow(bounceRaw, 0.6) * 0.25
                  + Math.abs(Math.sin(t * baseFreq * 3.3)) * 0.08;

    // Tilt follows velocity (inertia effect)
    const rx = -Math.cos(t * baseFreq) * 0.28
             - Math.cos(t * baseFreq * 1.73 + 0.5) * 0.12;
    const rz = Math.sin(t * baseFreq * 0.87) * 0.22
             + Math.sin(t * baseFreq * 2.3 + 1.3) * 0.08;
    const ry = Math.sin(t * 2.1) * 0.10;

    cupBody.position.set(cupRestPos.x + px, LIFT_HEIGHT + bounceY, cupRestPos.z + pz);
    cupBody.quaternion.setFromEuler(rx, ry, rz);

    // Cup-local gravity: push dice toward cup floor even when tilted
    _cupDown.set(0, -1, 0);
    cupBody.quaternion.vmult(_cupDown, _cupDown);
    diceBodies.forEach((b, i) => {
      if (heldDice[i]) return;
      _extraG.copy(_cupDown);
      _extraG.scale(b.mass * 9.82 * 1.5, _extraG);
      b.applyForce(_extraG, b.position);
    });

    // Nudge — more frequent, random direction, scaled by active count
    const activeDiceCount = diceBodies.reduce((n, _, i) => n + (heldDice[i] ? 0 : 1), 0);
    const nudgeScale = Math.min(activeDiceCount / 3, 1.0);
    const nudgeInterval = 200 + Math.sin(t * 7.3) * 50;

    if (se % nudgeInterval < 17) {
      diceBodies.forEach((b, i) => {
        if (heldDice[i]) return;
        if (b.velocity.length() < 4) {
          const angle = Math.random() * Math.PI * 2;
          // Cup-local nudge: lateral only (no upward push), then rotate to world space
          _nudgeForce.set(
            Math.cos(angle) * 0.3 * nudgeScale,
            0,
            Math.sin(angle) * 0.3 * nudgeScale,
          );
          cupBody.quaternion.vmult(_nudgeForce, _nudgeForce);
          b.applyImpulse(_nudgeForce, _nudgePoint);
        }
      });
    }

    diceBodies.forEach((b, i) => {
      if (heldDice[i]) return;
      const v = b.velocity.length();
      if (v > 6) b.velocity.scale(6 / v, b.velocity);
      const av = b.angularVelocity.length();
      if (av > 12) b.angularVelocity.scale(12 / av, b.angularVelocity);
    });

    constrainDiceToCup();
  }

  /* ── Rolling ── */
  let rollStart = 0, rollPhase = 0;
  let rollDiceRelPos: ReturnType<typeof captureDiceRelToCup> = [];
  let rollStartCupPos: { x: number; y: number; z: number } | null = null;
  let rollStartCupQ: CANNON.Quaternion | null = null;

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

  /* ── Independent cup visual animation (runs after physics cup is removed) ── */
  let cupPourActive = false;
  let cupPourStart = 0;
  const CUP_VISUAL_DUR = 900; // duration of reveal+exit after physics removal

  function setCupShadows(on: boolean) {
    cupGroup.traverse(child => {
      if ((child as THREE.Mesh).isMesh) child.castShadow = on;
    });
  }

  function updateCupVisual() {
    if (!cupPourActive) return;
    const t = Math.min((performance.now() - cupPourStart) / CUP_VISUAL_DUR, 1);
    const pourX = cupRestPos.x - 3.5;
    const pourZ = cupRestPos.z;

    let tiltAngle: number;
    let liftY: number;
    let slideX: number;

    if (t < 0.3) {
      // Reveal: 100°→140°, rapid lift
      const p = t / 0.3;
      const ep = p * p;
      tiltAngle = -(Math.PI * 0.56 + ep * Math.PI * 0.22);
      liftY = ep * 6;
      slideX = ep * -1.5;
    } else {
      // Exit: 140°→180°, accelerate out
      const p = (t - 0.3) / 0.7;
      const ep = p * p;
      tiltAngle = -(Math.PI * 0.78 + ep * Math.PI * 0.22);
      liftY = 6 + ep * 10;
      slideX = -1.5 + ep * -3;
    }

    // Fade out shadow as cup lifts (shadow off once liftY > 2)
    if (liftY > 2) setCupShadows(false);

    // Clearance
    const sinA = Math.sin(tiltAngle), cosA = Math.cos(tiltAngle);
    const minY = Math.min(CUP_BR * sinA, -CUP_BR * sinA, CUP_TR * sinA + CUP_H * cosA, -CUP_TR * sinA + CUP_H * cosA);
    const clearY = Math.max(0, -minY + 0.15);

    cupGroup.position.set(pourX + slideX, clearY + liftY, pourZ);
    cupGroup.quaternion.setFromEuler(new THREE.Euler(0, 0, tiltAngle));

    if (t >= 1) {
      cupPourActive = false;
      cupGroup.position.set(-8, 0, 0);
      cupGroup.quaternion.set(0, 0, 0, 1);
      setCupShadows(true); // restore for next round
    }
  }

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
          b.velocity.set(
            (Math.random() - 0.5) * 3,  // slight random X
            -2,                           // downward
            2 + Math.random() * 2        // forward push
          );
          b.angularVelocity.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
          );
        });
      }
    } else {
      const t = Math.min(elapsed / POUR_DUR, 1);
      const pourX = cupRestPos.x - 3.5;
      const pourZ = cupRestPos.z;

      // Phase 1 (Spill): tilt and use physics cup
      if (t < 0.35) {
        const p = t / 0.35;
        const ep = 1 - Math.pow(1 - p, 2);
        const tiltAngle = -ep * (Math.PI * 0.56);
        const sinA = Math.sin(tiltAngle), cosA = Math.cos(tiltAngle);
        const minY = Math.min(CUP_BR * sinA, -CUP_BR * sinA, CUP_TR * sinA + CUP_H * cosA, -CUP_TR * sinA + CUP_H * cosA);
        const clearY = Math.max(0, -minY + 0.15);
        cupBody.position.set(pourX, clearY, pourZ);
        cupBody.quaternion.setFromEuler(0, 0, tiltAngle);
      }

      // At 35%: remove physics cup, start settle, begin independent cup visual anim
      if (t > 0.35 && (cupBody as CANNON.Body & { world: CANNON.World | null }).world) {
        world.removeBody(cupBody);
        cupPourStart = performance.now();
        cupPourActive = true;
        settleStart = performance.now();
        settleTargetCannonQ = targetVals.map(val => {
          const yaw = Math.random() * Math.PI * 2;
          const tq = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(faceQuats[val || 1]);
          return new CANNON.Quaternion(tq.x, tq.y, tq.z, tq.w);
        });
        setState(S.SETTLE);
      }
    }
  }

  /* ── Settling ── */
  function allStopped() {
    return diceBodies.every((b, i) => heldDice[i] || (b.velocity.length() < SETTLE_THRESH && b.angularVelocity.length() < SETTLE_THRESH));
  }

  function separateDice() {
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < 5; i++) {
        if (heldDice[i]) continue;
        for (let j = i + 1; j < 5; j++) {
          if (heldDice[j]) continue;
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
      if (heldDice[i]) return;
      if (!settleTargetCannonQ[i]) return;
      const blend = timeFactor * 0.12;
      if (blend > 0.003) {
        slerpCannon(body.quaternion, settleTargetCannonQ[i], blend, body.quaternion);
        body.quaternion.normalize();
        body.angularVelocity.scale(1 - timeFactor * 0.04, body.angularVelocity);
      }
    });
    if (el > 1200) diceBodies.forEach((b, i) => {
      if (heldDice[i]) return;
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
      if (heldDice[i]) return true;
      const t = settleTargetCannonQ[i];
      return Math.abs(body.quaternion.x * t.x + body.quaternion.y * t.y + body.quaternion.z * t.z + body.quaternion.w * t.w) > 0.99;
    });
    const heldCount = heldDice.filter(Boolean).length;
    const minSettleTime = heldCount >= 3 ? 500 : 800;
    if ((el > minSettleTime && allStopped() && closeEnough) || el > 4000) {
      separateDice();
      diceBodies.forEach((body, i) => {
        body.type = CANNON.Body.KINEMATIC;
        body.velocity.setZero();
        body.angularVelocity.setZero();
        if (!heldDice[i]) body.quaternion.copy(settleTargetCannonQ[i]);
      });
      diceMeshes.forEach((m, i) => {
        if (heldDice[i]) return;
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
  const presentRowPos = PRESENT_ROW.map(([x, y, z]) => new THREE.Vector3(x, y, z));

  function startPresent() {
    presentStart = performance.now();
    presentFromPos = diceMeshes.map(m => m.position.clone());
    presentFromQ = diceMeshes.map(m => m.quaternion.clone());
    presentToQ = targetVals.map((val, i) =>
      heldDice[i] ? diceMeshes[i].quaternion.clone() : faceQuats[val || 1].clone()
    );
    cam.animateTo(S.RESULT);
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

  /* ── Instant result (reduced motion) ── */
  function instantResult() {
    // Remove cup from view
    if ((cupBody as CANNON.Body & { world: CANNON.World | null }).world) world.removeBody(cupBody);
    cupGroup.position.set(-8, 0, 0);
    cupGroup.quaternion.set(0, 0, 0, 1);

    // Place dice at PRESENT_ROW with target faces
    for (let i = 0; i < 5; i++) {
      const [x, y, z] = PRESENT_ROW[i];
      const fq = faceQuats[targetVals[i] || 1];
      diceBodies[i].type = CANNON.Body.KINEMATIC;
      diceBodies[i].velocity.setZero();
      diceBodies[i].angularVelocity.setZero();
      diceBodies[i].position.set(x, y, z);
      diceBodies[i].quaternion.set(fq.x, fq.y, fq.z, fq.w);
      diceMeshes[i].position.set(x, y, z);
      diceMeshes[i].quaternion.copy(fq);
      diceOpacity[i] = 1;
      const mats = diceMeshes[i].material as THREE.MeshStandardMaterial[];
      mats.forEach(m => { m.opacity = 1; });
      diceMeshes[i].visible = true;
      diceMeshes[i].castShadow = true;
    }

    cam.animateTo(S.RESULT);
    setState(S.RESULT);
  }

  /* ── Sync & Loop ── */
  function sync() {
    for (let i = 0; i < 5; i++) {
      // Skip held dice except during PRESENT (they need to animate to the row)
      if (heldDice[i] && state !== S.PRESENT) continue;
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
    // Cup visual animation runs independently of state machine
    updateCupVisual();
  }

  let lastFrameTime = performance.now();
  let animFrameId = 0;
  let paused = false;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (paused) return;
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    upState();
    if (state !== S.IDLE && state !== S.RESULT) world.step(PHYS_STEP, dt, MAX_SUB);
    if (state === S.SETTLE) settleNudge();
    sync();
    updateDiceOpacity();
    cam.update(state, diceMeshes);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const onVisibilityChange = () => {
    paused = document.hidden;
    if (!paused) lastFrameTime = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

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
        _pendingRoll = false;
        // Fill any null targetVals with random
        targetVals = targetVals.map(v => (v !== null && v >= 1 && v <= 6) ? v : Math.ceil(Math.random() * 6));
        if (prefersReducedMotion) {
          // Skip collect/shake, wait for roll() to place dice
          setState(S.SHAKE);
          shakePhase = 1;
          shakeStart = performance.now();
          if (!(cupBody as CANNON.Body & { world: CANNON.World | null }).world) world.addBody(cupBody);
          cupBody.position.set(cupRestPos.x, LIFT_HEIGHT, cupRestPos.z);
          cupBody.quaternion.set(0, 0, 0, 1);
          freezeDiceKinematic();
          return;
        }
        startCollect();
      }
    },
    roll() {
      if (prefersReducedMotion && (state === S.SHAKE || state === S.COLLECT)) {
        instantResult();
        // Defer callback so GamePage's setRollPhase('rolling') lands first
        requestAnimationFrame(() => {
          if (_onResultCallback) _onResultCallback(targetVals.slice() as number[]);
        });
        return true;
      }
      if (state === S.SHAKE) {
        _pendingRoll = false;
        startRoll();
        return true;
      }
      if (state === S.COLLECT) {
        _pendingRoll = true;
        return true;
      }
      return false;
    },
    onResult(cb) {
      _onResultCallback = cb;
    },
  };

  /* ── Cleanup ── */
  const cleanup = () => {
    cancelAnimationFrame(animFrameId);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    controls.dispose();
    renderer.dispose();

    // Dispose all scene children
    const texProps = ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'displacementMap', 'alphaMap'] as const;
    scene.traverse(obj => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      const mat = (obj as THREE.Mesh).material;
      if (mat) {
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach(m => {
          const stdMat = m as THREE.MeshStandardMaterial;
          for (const prop of texProps) {
            if (stdMat[prop]) { stdMat[prop].dispose(); }
          }
          m.dispose();
        });
      }
    });
  };

  return { api, cleanup };
}
