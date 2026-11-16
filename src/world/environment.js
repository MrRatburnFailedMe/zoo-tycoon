import * as THREE from 'three';
import { prep, merge } from '../util/build.js';
import { mulberry32 } from '../util/math.js';

// Hazy, slightly washed-out palette: soft blue overhead, milky haze at the horizon.
const SKY_TOP = new THREE.Color(0x4f86c6);
const HORIZON = new THREE.Color(0xc3d3dc);

export function buildEnvironment(game) {
  const { scene, camera } = game;
  const sunDir = new THREE.Vector3(0.62, 0.42, 0.38).normalize();

  scene.fog = new THREE.Fog(HORIZON, 70, 980);
  scene.background = HORIZON;

  // Gradient sky dome with a soft sun.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: HORIZON }, bottom: { value: new THREE.Color(0xa9b9a0) }, sunDir: { value: sunDir } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top, horizon, bottom, sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0, 0.92, 0.75) * pow(s, 900.0) * 6.0;
          c += vec3(1.0, 0.85, 0.6) * pow(s, 12.0) * 0.25;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xc9dcf0, 0x6b6a4a, 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe6c2, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Low-poly clouds.
  const rand = mulberry32(77);
  const clouds = [];
  for (let i = 0; i < 22; i++) {
    const parts = [];
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = 4 + rand() * 6;
      parts.push(prep(new THREE.IcosahedronGeometry(1, 0), 0xffffff, { pos: [k * 5 - n * 2.5, rand() * 2, rand() * 6 - 3], scale: [s * 1.3, s * 0.7, s], jitter: 0.25 }));
    }
    const c = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: 0x9fb4c8, emissiveIntensity: 0.35, fog: false }));
    const a = rand() * Math.PI * 2, r = 80 + rand() * 320;
    c.position.set(Math.cos(a) * r, 80 + rand() * 50, Math.sin(a) * r);
    c.userData.speed = 1 + rand() * 1.5;
    scene.add(c);
    clouds.push(c);
  }

  buildMountains(scene, rand);

  const target = new THREE.Vector3();
  return {
    sunDir,
    update(dt) {
      sky.position.copy(camera.position);
      // keep the shadow frustum centred on the player
      const p = game.player.body.position;
      target.set(Math.round(p.x), Math.round(p.y), Math.round(p.z));
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 120);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 420) c.position.x = -420;
      }
    },
  };
}

// A ring of faceted low-poly mountain ranges around the valley. Two layers: a nearer green-grey
// range and a taller snowy one behind it; the fog washes them out into the haze.
function buildMountains(scene, rand) {
  const ridge = (a, seed) =>
    Math.abs(Math.sin(a * 5 + seed)) * 0.45 + Math.abs(Math.sin(a * 11 + seed * 2.3)) * 0.3 +
    Math.abs(Math.sin(a * 23 + seed * 0.7)) * 0.15 + Math.sin(a * 2 + seed) * 0.2;
  const layers = [
    { r0: 330, r1: 520, peak: 55, seed: 1.7, low: 0x5f7a4c, high: 0x77826e, snow: 999 },
    { r0: 560, r1: 900, peak: 150, seed: 4.1, low: 0x6f7c74, high: 0x8c9294, snow: 105 },
  ];
  const geos = [];
  for (const L of layers) {
    const SEG = 160, RINGS = 9;
    const g = new THREE.BufferGeometry();
    const verts = [], cols = [];
    const P = (i, j) => {
      const a = (i / SEG) * Math.PI * 2;
      const t = j / RINGS; // 0 = inner foot, 1 = outer foot
      const r = L.r0 + (L.r1 - L.r0) * t;
      const crest = Math.sin(t * Math.PI); // high in the middle of the band
      const h = Math.max(0, L.peak * crest * (0.35 + ridge(a, L.seed)) + (rand() - 0.5) * 14 * crest) - 4;
      return [Math.cos(a) * r + (rand() - 0.5) * 8, h, Math.sin(a) * r + (rand() - 0.5) * 8];
    };
    const grid = [];
    for (let i = 0; i <= SEG; i++) { grid.push([]); for (let j = 0; j <= RINGS; j++) grid[i].push(i === SEG ? grid[0][j] : P(i, j)); }
    const c = new THREE.Color(), lo = new THREE.Color(L.low), hi = new THREE.Color(L.high), white = new THREE.Color(0xeef2f4);
    const tri = (A, B, Cc) => {
      verts.push(...A, ...B, ...Cc);
      const y = (A[1] + B[1] + Cc[1]) / 3;
      c.copy(lo).lerp(hi, Math.min(1, y / (L.peak * 0.7)));
      if (y > L.snow * (0.85 + rand() * 0.3)) c.copy(white);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RINGS; j++) {
      const a = grid[i][j], b = grid[i + 1][j], d = grid[i][j + 1], e = grid[i + 1][j + 1];
      tri(a, d, b); tri(b, d, e);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    geos.push(g);
  }
  const m = new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
  scene.add(m);
}
