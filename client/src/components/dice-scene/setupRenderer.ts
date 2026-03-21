import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface RendererSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  onResize: () => void;
}

export function setupRenderer(canvas: HTMLCanvasElement): RendererSetup {
  const isMobile = navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
  const SHADOW_SIZE = isMobile ? 1024 : 2048;
  const PX_RATIO = Math.min(window.devicePixelRatio, isMobile ? 2 : 3);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, isMobile ? 18 : 14, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(PX_RATIO);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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
  dirLight.shadow.normalBias = 0.02;
  scene.add(dirLight);

  const spot = new THREE.SpotLight(0xffeedd, 0.4, 30, Math.PI / 4, 0.5, 2);
  spot.position.set(0, 12, 0);
  scene.add(spot);

  const onResize = () => {
    const mobile = navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 2 : 3));
  };

  return { scene, camera, renderer, controls, onResize };
}
