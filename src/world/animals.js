import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { loadGLB } from '../util/glb.js';
import { heightAt, pondWaterY } from './terrain.js';
import { LION, HIPPO, POND, MONKEY, PENGUIN, ELEPHANT, GORILLA } from './layout.js';
import { penguinGeo, elephantGeo, gorillaGeo } from './beasts.js';
import { angleDiff, clamp, damp } from '../util/math.js';
import { sfx } from '../audio.js';

// Zoo animals. The models are static meshes (no skeleton), so the walk cycle, breathing, head turns,
// tail swish and lying down are all done in the vertex shader. Everything else is a small state machine.
//
// Per-species numbers are fractions of the model's length (L) or height (H) unless noted.
const SPECIES = {
  lion: {
    url: 'assets/lion.glb', yaw: -Math.PI / 2, length: 2.2, color: 0xcf9550,
    legTop: 0.43, headZ: 0.33, neckY: 0.78, tailZ: -0.33, stride: 0.12, lift: 0.1, tail: 0.1,
    walk: 1.3, run: 6.8, turn: 2.6, sleepChance: 0.22, sideSleep: true,
  },
  hippo: {
    url: 'assets/hippo.glb', yaw: -Math.PI / 2, length: 3.1, color: 0x87716b,
    legTop: 0.3, headZ: 0.27, neckY: 0.62, tailZ: -0.44, stride: 0.08, lift: 0.06, tail: 0.03,
    walk: 0.9, run: 3.6, turn: 1.3, sleepChance: 0.25,
  },
  baboon: {
    url: 'assets/baboon.glb', yaw: 0, length: 0.95, color: null,
    legTop: 0.42, headZ: 0.3, neckY: 0.72, tailZ: -0.38, stride: 0.13, lift: 0.1, tail: 0.06,
    walk: 1.4, run: 4.2, turn: 4.5, sleepChance: 0.16,
  },
  // built from primitives in beasts.js
  penguin: {
    build: penguinGeo, yaw: 0, length: 0.5, color: null,
    legTop: 0.1, headZ: 0.6, neckY: 0.8, tailZ: -0.42, stride: 0.16, lift: 0.05, tail: 0.0, sway: 0.24,
    walk: 0.7, run: 1.8, turn: 3.5, sleepChance: 0.1,
  },
  elephant: {
    build: elephantGeo, yaw: 0, length: 4.4, color: null,
    legTop: 0.4, headZ: 0.12, neckY: 0.75, tailZ: -0.44, stride: 0.08, lift: 0.05, tail: 0.03,
    walk: 1.0, run: 3.2, turn: 1.0, sleepChance: 0.14,
  },
  gorilla: {
    build: gorillaGeo, yaw: 0, length: 1.7, color: null,
    legTop: 0.36, headZ: 0.24, neckY: 0.71, tailZ: -0.7, stride: 0.12, lift: 0.08, tail: 0.0,
    walk: 1.0, run: 3.6, turn: 3, sleepChance: 0.18,
  },
};

const VERT = /* glsl */`
#include <begin_vertex>
{
  vec3 p = position;
  // legs: everything below the leg line, except the tail
  float legF = clamp(1.0 - p.y / uLegTop, 0.0, 1.0) * step(uTailZ, p.z);
  float fr = step(0.0, p.z), sd = step(0.0, p.x);
  // walking: four-beat (left hind, left fore, right hind, right fore); galloping: fronts then hinds
  float ph = uPhase + mix(3.14159 * sd + 1.5708 * fr, 3.14159 * fr + 0.6 * sd, uGallop);
  float swing = sin(ph), up = max(0.0, cos(ph)); // up > 0 while the foot travels forward in the air
  float lower = smoothstep(0.4, 1.0, legF); // knee/hock down
  transformed.z += swing * uStride * legF * uWalk;
  transformed.z -= up * uLift * 0.8 * lower * uWalk; // the lower leg folds back as the foot lifts
  float lift = up * uLift * legF * legF * uWalk;
  // lying down: fold the legs, lower the body
  float low = min(p.y, uLegTop), high = max(p.y - uLegTop, 0.0);
  transformed.y = low * (1.0 - 0.72 * uSleep) + high + lift;
  // breathing
  float rate = mix(2.6, 1.2, uSleep);
  transformed.x *= 1.0 + sin(uTime * rate) * mix(0.02, 0.05, uSleep) * (1.0 - legF);
  // head turn / nod around the neck
  float hw = smoothstep(uHeadZ, uHeadZ + 0.14 * uL, p.z);
  vec3 piv = vec3(0.0, uNeckY - 0.72 * uSleep * uLegTop, uHeadZ);
  vec3 d = transformed - piv;
  float a = uHeadPitch * hw, b = uHeadYaw * hw;
  d = vec3(d.x, d.y * cos(a) - d.z * sin(a), d.y * sin(a) + d.z * cos(a));
  d = vec3(d.x * cos(b) + d.z * sin(b), d.y, -d.x * sin(b) + d.z * cos(b));
  transformed = piv + d;
  // tail swish
  float tw = clamp((uTailZ - p.z) / (0.25 * uL), 0.0, 1.0);
  transformed.x += sin(uTime * 2.3 + p.z * 3.0) * uTail * tw * (1.0 - 0.7 * uSleep);
}`;

// Little routines each species breaks into now and then. pose() gets the time into the act (t),
// progress (k, 0..1) and an in/out envelope (e), and returns any of:
// rear (body pitch about the back feet, negative = front up), roll, lift, spin (rad), headYaw, headPitch.
// lift is metres, except for hippos where it's in body heights.
const ACTS = {
  baboon: [
    { name: 'stand', dur: [2.5, 4.5], pose: (t, k, e) => ({ rear: -1.2 * e, headPitch: 0.85 * e, headYaw: Math.sin(t * 1.3) * 0.8 * e }) },
    { name: 'drum', dur: [1.6, 2.2], say: true, pose: (t, k, e) => ({ rear: -1.15 * e, roll: Math.sin(t * 22) * 0.07 * e, lift: Math.abs(Math.sin(t * 11)) * 0.05 * e, headPitch: 0.6 * e }) },
    { name: 'sit', dur: [3, 6], pose: (t, k, e) => ({ rear: -0.55 * e, headPitch: 0.45 * e, headYaw: Math.sin(t * 0.7) * 0.6 * e }) },
    { name: 'scratch', dur: [2, 3.5], pose: (t, k, e) => ({ rear: -0.5 * e, roll: Math.sin(t * 18) * 0.05 * e, headYaw: (0.5 + Math.sin(t * 9) * 0.15) * e, headPitch: 0.6 * e }) },
    { name: 'spin', dur: [1.1, 1.1], say: true, pose: (t, k) => ({ lift: Math.sin(k * Math.PI) * 0.9, spin: k * k * (3 - 2 * k) * Math.PI * 2 }) },
  ],
  hippo: [
    { name: 'gape', dur: [2.5, 3.5], say: true, pose: (t, k, e) => ({ rear: -0.3 * e, headPitch: -0.9 * e }) },
    { name: 'stand', dur: [1.8, 2.6], say: true, pose: (t, k, e) => ({ rear: -0.75 * e, headPitch: 0.4 * e }) },
    { name: 'roll', dur: [2.6, 2.6], pose: (t, k) => ({ roll: k * k * (3 - 2 * k) * Math.PI * 2 }) },
    { name: 'shake', dur: [1.2, 1.6], pose: (t, k) => ({ roll: Math.sin(t * 16) * 0.22 * (1 - k), headYaw: Math.sin(t * 16 + 1) * 0.3 * (1 - k) }) },
    { name: 'dunk', dur: [2.5, 3], water: true, pose: (t, k, e) => ({ lift: -0.55 * e, headPitch: -0.2 * e }) },
    // sink out of sight, then burst up out of the water mouth open, hang there, flop back down
    { name: 'surface', dur: [3.4, 4], water: true, say: true, pose: (t, k) => {
      const sink = smooth(k / 0.22) * (1 - smooth((k - 0.22) / 0.1));
      const up = smooth((k - 0.26) / 0.1) * (1 - smooth((k - 0.78) / 0.18));
      return { lift: -0.5 * sink + (0.45 + Math.sin(t * 5) * 0.04) * up, rear: -0.4 * up, headPitch: -0.85 * up * smooth((k - 0.34) / 0.1) };
    } },
    { name: 'peek', dur: [3, 5], water: true, pose: (t, k, e) => ({ lift: 0.3 * e, headYaw: Math.sin(t * 1.1) * 0.7 * e, headPitch: -0.15 * e }) },
  ],
  penguin: [
    { name: 'flap', dur: [1.4, 2.2], say: true, pose: (t, k, e) => ({ roll: Math.sin(t * 14) * 0.14 * e, lift: Math.abs(Math.sin(t * 7)) * 0.08 * e }) },
    { name: 'hop', dur: [0.8, 0.8], pose: (t, k) => ({ lift: Math.sin(k * Math.PI) * 0.35 }) },
    { name: 'slide', dur: [2.2, 3.2], move: 2.6, pose: (t, k, e) => ({ rear: 1.35 * e, headPitch: -1.2 * e }) }, // belly slide
    { name: 'dive', dur: [2, 3], water: true, pose: (t, k, e) => ({ lift: -0.45 * e }) },
  ],
  elephant: [
    { name: 'trumpet', dur: [2, 2.6], say: true, pose: (t, k, e) => ({ rear: -0.25 * e, headPitch: -0.9 * e }) },
    { name: 'stomp', dur: [1.8, 2.4], say: true, pose: (t, k, e) => ({ rear: -0.5 * e * Math.abs(Math.sin(k * Math.PI * 2)), headPitch: -0.4 * e }) },
    { name: 'dust', dur: [2.5, 3.5], pose: (t, k, e) => ({ roll: Math.sin(t * 6) * 0.08 * e, headPitch: 0.6 * e, headYaw: Math.sin(t * 3) * 0.5 * e }) },
  ],
  gorilla: [
    { name: 'beat', dur: [1.8, 2.4], say: true, pose: (t, k, e) => ({ rear: -1.15 * e, roll: Math.sin(t * 22) * 0.06 * e, headPitch: 0.7 * e }) },
    { name: 'sit', dur: [4, 8], pose: (t, k, e) => ({ rear: -0.65 * e, headPitch: 0.5 * e, headYaw: Math.sin(t * 0.6) * 0.6 * e }) },
    { name: 'scratch', dur: [2, 3], pose: (t, k, e) => ({ rear: -0.6 * e, headYaw: (0.5 + Math.sin(t * 9) * 0.15) * e, headPitch: 0.6 * e }) },
  ],
  lion: [
    { name: 'roar', dur: [2, 2.6], say: true, pose: (t, k, e) => ({ rear: -0.2 * e, headPitch: -0.6 * e }) },
    { name: 'sit', dur: [4, 8], pose: (t, k, e) => ({ rear: -0.45 * e, headPitch: 0.35 * e, headYaw: Math.sin(t * 0.5) * 0.5 * e }) },
    // lying like a sphinx, watching the visitors
    { name: 'lie', dur: [6, 12], pose: (t, k, e) => ({ fold: e, headPitch: -0.1 * e, headYaw: Math.sin(t * 0.4) * 0.8 * e }) },
    // lying down licking a front paw
    { name: 'groom', dur: [4, 7], pose: (t, k, e) => ({ fold: e, headPitch: (0.75 + Math.sin(t * 7) * 0.12) * e, headYaw: 0.35 * e }) },
    { name: 'yawn', dur: [2, 2.6], pose: (t, k, e) => ({ rear: -0.35 * e, headPitch: -0.8 * Math.sin(k * Math.PI) }) },
  ],
};
// What each small animal does when you pick it up: words it yells, how often, and in what colour.
const PANIC = {
  baboon: { words: ['EEK!', 'OOK OOK!!', 'LET GO!', 'EEEEE!'], color: '#ffd23a', every: 0.75 },
  hippo: { words: ['AAAAAAAH!', 'WAAAAAH!', 'MOMMY!!', 'PUT ME DOWN!', 'AAAAA!'], color: '#ff7aa8', every: 1.15 },
  penguin: { words: ['SQUAWK!', 'HONK HONK!', 'NOT THE FACE!', 'FLAP FLAP!', 'I CAN\'T FLY!!'], color: '#9fe0ff', every: 0.7 },
  elephant: { words: ['PAWOOOO!', 'MAMA!!', 'TOOT TOOT!', 'PUT ME DOWN!'], color: '#c9b6ff', every: 1.1 },
  gorilla: { words: ['OOH OOH!', 'GRRR!', 'HANDS OFF!', 'OOK!'], color: '#ffb36b', every: 0.8 },
};
const SLAPPERS = ['baboon', 'gorilla']; // these fight back when picked up
const HEAVY = { hippo: 45, elephant: 60, gorilla: 14, penguin: 6, baboon: 9 };
const FAMILY_ACT = { hippo: 'stand', elephant: 'trumpet', gorilla: 'beat' }; // what the grown-ups do when you grab a baby
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _up = new THREE.Vector3();
const UPY = new CANNON.Vec3(0, 1, 0);

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ACT_CHANCE = { baboon: 0.35, hippo: 0.35, lion: 0.35, penguin: 0.45, elephant: 0.35, gorilla: 0.4 };
const SWING_CHANCE = 0.4; // baboons: how often they go for the vines instead
const NO_POSE = {};

function patch(material, u) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform float ' + Object.keys(u).join(', ') + ';\n' + shader.vertexShader.replace('#include <begin_vertex>', VERT);
  };
  material.customProgramCacheKey = () => 'animal';
  return material;
}

// Bake the model into one geometry: facing +Z, feet at y = 0, centred, scaled to its real length.
async function loadSpecies(name) {
  const sp = SPECIES[name];
  let geo, map = null;
  if (sp.build) geo = sp.build();
  else {
    const gltf = await loadGLB(sp.url);
    gltf.scene.updateMatrixWorld(true);
    let src = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
    map = src.material.map || null;
  }
  geo.rotateY(sp.yaw);
  geo.computeBoundingBox();
  let b = geo.boundingBox, c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z);
  geo.scale(...Array(3).fill(sp.length / (b.max.z - b.min.z)));
  geo.computeBoundingBox();
  geo.computeVertexNormals();
  b = geo.boundingBox;
  return { name, sp, geo, map, L: b.max.z - b.min.z, H: b.max.y, W: b.max.x - b.min.x };
}

// Floating Z's over sleeping animals.
let zTex = null;
function zTexture() {
  if (zTex) return zTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 54px "Baloo 2", system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#2b3b55';
  g.strokeText('z', 32, 34);
  g.fillStyle = '#fff';
  g.fillText('z', 32, 34);
  zTex = new THREE.CanvasTexture(c);
  zTex.colorSpace = THREE.SRGBColorSpace;
  return zTex;
}

const circle = (x, z, r) => ({
  contains: (px, pz) => Math.hypot(px - x, pz - z) < r,
  random: () => { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; return [x + Math.cos(a) * d, z + Math.sin(a) * d]; },
  center: [x, z], r,
});
const box = (x, z, hw, hd) => ({
  contains: (px, pz) => Math.abs(px - x) < hw && Math.abs(pz - z) < hd,
  random: () => [x + (Math.random() * 2 - 1) * hw, z + (Math.random() * 2 - 1) * hd],
  center: [x, z], r: Math.min(hw, hd),
});

const ray = new CANNON.RaycastResult();
const _F = new THREE.Vector3(), _G = new THREE.Vector3(), _A = new THREE.Vector3();
const from = new CANNON.Vec3(), to = new CANNON.Vec3();

class Animal {
  constructor(game, proto, { x, z, scale = 1, region, group }) {
    this.game = game;
    this.kind = proto.name;
    this.sp = proto.sp;
    this.region = region;
    this.group = group;
    this.scale = scale;
    this.L = proto.L * scale;
    this.H = proto.H * scale;
    this.W = proto.W * scale;
    this.protoL = proto.L;
    // Babies and monkeys can be picked up (and they hate it).
    this.small = this.kind === 'baboon' || this.kind === 'penguin' || scale < 0.7;
    this.label = { baboon: 'Baboon', penguin: 'Penguin', hippo: 'Baby hippo', elephant: 'Baby elephant', gorilla: 'Baby gorilla' }[this.kind] || 'Cub';
    this.seed = Math.random() * 100;

    const L = proto.L, H = proto.H, sp = proto.sp;
    this.u = {
      uPhase: { value: 0 }, uWalk: { value: 0 }, uGallop: { value: 0 }, uSleep: { value: 0 }, uTime: { value: 0 },
      uHeadYaw: { value: 0 }, uHeadPitch: { value: 0 },
      uL: { value: L }, uLegTop: { value: sp.legTop * H }, uHeadZ: { value: sp.headZ * L }, uNeckY: { value: sp.neckY * H },
      uTailZ: { value: sp.tailZ * L }, uStride: { value: sp.stride * L }, uLift: { value: sp.lift * H }, uTail: { value: sp.tail * L },
    };
    const material = patch(new THREE.MeshStandardMaterial({
      color: sp.color ?? 0xffffff, map: proto.map, flatShading: true, roughness: 0.9, vertexColors: !!proto.geo.attributes.color,
    }), this.u);
    this.mesh = new THREE.Mesh(proto.geo, material);
    this.mesh.customDepthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.u);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // the shader moves vertices outside the static bounds
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); // lying on its side rolls this, rearing up pitches it
    this.tilt.add(this.mesh);
    // pivot at the back feet, so rearing up keeps the hind legs on the ground
    this.mesh.position.z = proto.L / 2;
    this.tilt.position.z = -proto.L / 2;
    this.root.add(this.tilt);
    this.root.scale.setScalar(scale);
    game.scene.add(this.root);
    if (this.small) {
      this.mesh.userData.entity = this;
      game.pickables.push(this.root);
    }

    // Solid to the player and thrown items.
    this.body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.KINEMATIC, collisionFilterMask: MASK.KINEMATIC });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(proto.W * scale * 0.4, this.H * 0.4, this.L * 0.42)), new CANNON.Vec3(0, this.H * 0.5, 0));
    this.body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (e.body.mass > 0.2 && e.body !== game.player.body && v > 4) this.startle(e.body.position);
    });
    game.world.addBody(this.body);

    this.zs = [0, 1, 2].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false }));
      s.visible = false;
      game.scene.add(s);
      return { s, t: 0 };
    });
    this.zCd = 0;

    this.x = x; this.z = z;
    this.yaw = Math.random() * Math.PI * 2;
    this.y = this.groundAt(x, z, heightAt(x, z) + 0.3);
    this.speed = 0;
    this.phase = 0;
    this.walk = 0;
    this.sleep = 0;
    this.roll = 0;
    this.rollDir = 1;
    this.headYaw = 0; this.headPitch = 0;
    this.hop = 0;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 4;
    this.target = null;
    this.prey = null;
    this.attackCd = 0;
    this.noiseCd = 5 + Math.random() * 20;
    this.swimming = false;
    this.act = null;
    this.actT = 0;
    this.pose = NO_POSE;
    this.rear = 0;
    this.gallop = 0;
    this.pace = 0.85 + Math.random() * 0.3; // everyone walks at their own speed
    this.sw = null; // swinging on the vines (baboons)
  }

  startAct() {
    let acts = ACTS[this.kind].filter((a) => !a.water || this.swimming);
    if (this.swimming && Math.random() < 0.75) acts = acts.filter((a) => a.water || a.name === 'gape');
    const act = acts[Math.floor(Math.random() * acts.length)];
    this.act = act;
    this.actT = 0;
    this.setState('act', act.dur[0] + Math.random() * (act.dur[1] - act.dur[0]));
    this.actDur = this.timer;
    if (act.say && this.noiseCd < 2) { this.say(); this.noiseCd = 5; }
  }

  // Highest solid surface under (x, z), searched from just above the animal so roofs are ignored.
  groundAt(x, z, fromY = this.y) {
    from.set(x, fromY + 1.2, z);
    to.set(x, fromY - 10, z);
    ray.reset();
    this.game.world.raycastClosest(from, to, { collisionFilterMask: G.STATIC, skipBackfaces: true }, ray);
    let y = ray.hasHit ? ray.hitPointWorld.y : heightAt(x, z);
    this.swimming = false;
    if (this.kind === 'hippo' && Math.hypot(x - POND.x, z - POND.z) < POND.r) {
      const float = this.game.animals.waterY - this.H * 0.62;
      if (y < float) { y = float; this.swimming = true; }
    }
    if (this.kind === 'penguin') {
      for (const pl of this.game.animals.pools) if (Math.hypot(x - pl.x, z - pl.z) < pl.r - 0.2) { y -= this.H * 0.5; this.swimming = true; }
    }
    return y;
  }

  loud(base = 1) {
    const d = this.game.camera.position.distanceTo(this.root.position);
    return base * clamp(1 - d / 45, 0, 1);
  }

  say() {
    const v = this.loud();
    if (v <= 0.02) return;
    if (this.kind === 'lion') sfx.roar(v);
    else if (this.kind === 'hippo') sfx.grunt(v);
    else if (this.kind === 'penguin') sfx.squawk(v);
    else if (this.kind === 'elephant') sfx.trumpet(v);
    else if (this.kind === 'gorilla') sfx.drum(v);
    else sfx.screech(v);
  }

  setState(s, timer, target = null) {
    if (this.sw && s !== 'swing') { this.sw.vine.holder = null; this.sw = null; }
    this.state = s;
    this.timer = timer;
    this.target = target;
  }

  // Pick what to do next.
  decide() {
    if (this.kind === 'baboon' && Math.random() < SWING_CHANCE && this.startSwing()) return;
    if (Math.random() < ACT_CHANCE[this.kind] * (this.swimming ? 1.8 : 1)) { this.startAct(); return; }
    const r = Math.random();
    if (r < this.sp.sleepChance) {
      // Hippos head for the water to nap; everyone else naps where they are or after a short walk.
      if (this.kind === 'hippo') {
        const a = Math.random() * Math.PI * 2, d = Math.random() * POND.r * 0.6;
        this.setState('walk', 30, [POND.x + Math.cos(a) * d, POND.z + Math.sin(a) * d]);
        this.thenSleep = true;
      } else {
        this.setState('sleep', 15 + Math.random() * 30);
        this.rollDir = Math.random() < 0.5 ? -1 : 1;
        this.sideways = this.sp.sideSleep && Math.random() < 0.6;
      }
    } else if (r < 0.75) {
      const run = this.kind === 'baboon' && Math.random() < 0.35;
      let target = this.region.random();
      // lions like to pace along the fence, one stretch after another
      if (this.kind === 'lion' && Math.random() < 0.55) {
        const [cx, cz] = this.region.center;
        this.paceA = this.paceA === undefined ? Math.atan2(this.z - cz, this.x - cx) : this.paceA + (Math.random() < 0.8 ? 0.7 : -0.7);
        target = [cx + Math.cos(this.paceA) * this.region.r * 0.9, cz + Math.sin(this.paceA) * this.region.r * 0.9];
      }
      this.setState(run ? 'run' : 'walk', 25, target);
    } else {
      this.setState('idle', 3 + Math.random() * 6);
      this.sniff = Math.random() < 0.5;
    }
  }

  startle(fromPos) {
    if (this.state === 'chase' || this.state === 'swing' || this.state === 'held' || this.state === 'tossed') return;
    if (this.state === 'sleep') { this.sleepWake(); return; }
    // run a few metres away from whatever hit us
    const dx = this.x - fromPos.x, dz = this.z - fromPos.z, d = Math.hypot(dx, dz) || 1;
    let tx = this.x + (dx / d) * 5, tz = this.z + (dz / d) * 5;
    if (!this.region.contains(tx, tz)) [tx, tz] = this.region.random();
    this.setState('run', 4, [tx, tz]);
    if (this.noiseCd < 3) { this.say(); this.noiseCd = 6; }
  }

  sleepWake() {
    this.setState('idle', 2);
    this.yawn = 1.2;
  }

  // Who this animal wants to go after (lions and hippos only), or null.
  findPrey() {
    if (this.kind !== 'lion' && this.kind !== 'hippo') return null;
    const game = this.game;
    const reach = this.kind === 'lion' ? LION.r - 0.3 : 7;
    const inside = (x, z) => this.kind === 'lion' ? this.region.contains(x, z) || Math.hypot(x - LION.x, z - LION.z) < reach
      : Math.hypot(x - this.x, z - this.z) < reach && Math.hypot(x - HIPPO.x, z - HIPPO.z) < HIPPO.r - 1;
    const p = game.player.body.position;
    if (!game.mods.fly && game.health.player.hp > 0 && inside(p.x, p.z) && p.y < this.y + 3) return { kind: 'player', pos: p };
    for (const f of game.friends) {
      const fp = f.state === 'ragdoll' ? f.ragdoll.torso.position : f.root.position;
      if (f.health.hp > 0 && inside(fp.x, fp.z) && fp.y < this.y + 3) return { kind: 'friend', friend: f, pos: fp };
    }
    return null;
  }

  attack(prey) {
    const game = this.game;
    const dx = prey.pos.x - this.x, dz = prey.pos.z - this.z, d = Math.hypot(dx, dz) || 1;
    const dmg = this.kind === 'lion' ? 22 : 30;
    if (prey.kind === 'player') {
      game.health.damagePlayer(dmg);
      game.player.pendingImpulse = { x: (dx / d) * 520, y: 300, z: (dz / d) * 520 };
      game.player.stun = 0.6;
      game.player.shake = 0.6;
    } else {
      const f = prey.friend;
      f.health.damage(dmg);
      const v = new CANNON.Vec3((dx / d) * 7, 5, (dz / d) * 7);
      if (f.state === 'stand') f.ragdollify(v);
      else f.ragdoll.push(new CANNON.Vec3(dx / d, 0.6, dz / d), 7);
    }
    this.lunge = 0.35;
    this.say();
  }

  // Walk/run toward (tx, tz). Returns true on arrival.
  steer(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.4 + this.L * 0.2) { this.speed = 0; return true; }
    const want = Math.atan2(dx, dz);
    const rel = angleDiff(want, this.yaw);
    this.yaw += clamp(rel, -this.sp.turn * dt, this.sp.turn * dt);
    const s = speed * this.pace * (Math.abs(rel) > 1.2 ? 0.25 : 1) * (this.swimming ? (this.kind === 'penguin' ? 2 : 0.7) : 1);
    this.speed += (s - this.speed) * damp(4, dt);
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt, nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    const ny = this.groundAt(nx, nz);
    // Blocked by the fence, a wall or a cliff? Give up on this target.
    if (!this.region.contains(nx, nz) || ny - this.y > 0.6 * Math.max(1, this.scale)) {
      this.speed = 0;
      this.target = this.region.random();
      return false;
    }
    this.x = nx; this.z = nz;
    this.y += (ny - this.y) * damp(12, dt);
    return false;
  }

  // ---- picked up ----
  // Grabbing swaps the kinematic body for a real dynamic one the hands can carry and throw.
  getGrabBody() {
    if (this.state === 'held' || this.state === 'tossed') return this.dyn;
    const game = this.game;
    if (!this.dyn) {
      this.dyn = new CANNON.Body({
        mass: HEAVY[this.kind] || 20, material: game.mats.item, linearDamping: 0.1, angularDamping: 0.5,
        collisionFilterGroup: G.ITEM, collisionFilterMask: MASK.ITEM,
      });
      this.dyn.addShape(new CANNON.Box(new CANNON.Vec3(this.W * 0.38, this.H * 0.4, this.L * 0.4)));
    }
    const b = this.dyn;
    b.position.set(this.x, this.y + this.H * 0.5 + 0.05, this.z);
    b.quaternion.setFromAxisAngle(UPY, this.yaw);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    game.world.removeBody(this.body);
    game.world.addBody(b);
    this.setState('held', 0);
    this.rear = 0;
    this.panicT = 0;
    this.shoutCd = 0;
    this.slapCd = 0.5;
    this.slapT = 0;
    this.say();
    return b;
  }

  shout(text, color = PANIC[this.kind]?.color || '#fff') {
    const p = this.root.position;
    this.game.animals.shout(text, p.x, p.y + this.H * 1.1, p.z, color);
  }

  updateHeld(dt, t) {
    const game = this.game, b = this.dyn, u = this.u;
    const held = game.grabber.entity === this;
    if (this.state === 'held' && !held) { this.state = 'tossed'; this.restT = 0; this.flightT = 0; }
    this.panicT += dt;
    const panic = PANIC[this.kind];

    if (held) {
      // squirm round to face you, wriggling
      b.quaternion.setFromAxisAngle(UPY, game.player.yaw + Math.sin(t * 9) * 0.25);
      b.angularVelocity.set(0, 0, 0);
      this.shoutCd -= dt;
      if (this.shoutCd < 0) {
        this.shoutCd = panic.every * (0.8 + Math.random() * 0.5);
        this.shout(panic.words[Math.floor(Math.random() * panic.words.length)]);
        if (this.kind === 'hippo') sfx.scream(1); else this.say();
        if (this.kind === 'penguin') this.flapT = 0.5;
      }
      if (SLAPPERS.includes(this.kind)) {
        // windmill slaps to the face
        this.slapCd -= dt;
        if (this.slapCd < 0) { this.slapCd = 0.45 + Math.random() * 0.7; this.slapT = 0.16; }
        if (this.slapT > 0) {
          this.slapT -= dt;
          if (this.slapT <= 0) {
            sfx.slap();
            game.player.shake = 0.7;
            game.player.yaw += (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.12); // head snaps sideways
            game.health.damagePlayer(2);
            this.shout(Math.random() < 0.6 ? 'SLAP!' : 'BONK!', '#ffffff');
          }
        }
      } else {
        // the whole family panics too
        for (const o of this.group) if (o !== this && !o.small && o.noiseCd < 0 && o.state !== 'act') {
          o.noiseCd = 4;
          o.say();
          if (!FAMILY_ACT[this.kind]) continue;
          o.act = ACTS[this.kind].find((a) => a.name === FAMILY_ACT[this.kind]);
          o.actT = 0;
          o.setState('act', 2.2);
          o.actDur = 2.2;
        }
      }
      if (this.kind === 'baboon' || this.kind === 'penguin') for (const o of this.group) if (o !== this && o.noiseCd < 0 && Math.random() < dt * 0.6) { o.say(); o.noiseCd = 3; }
    } else {
      // tossed: wait until it comes to rest, then pick itself up
      const v = b.velocity.length();
      this.restT = v < 0.7 ? this.restT + dt : 0;
      this.flightT += dt;
      if (b.position.y < -30 || this.restT > 0.4 || this.flightT > 8) { this.land(); return; }
    }

    // the mesh rides the physics body
    this.root.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    _up.set(0, -this.H * 0.5, 0).applyQuaternion(this.root.quaternion);
    this.root.position.set(b.position.x + _up.x, b.position.y + _up.y, b.position.z + _up.z);

    // flailing: legs going like mad, head shaking, body squashing and stretching
    const k = held ? 1 : 0.7;
    this.phase += dt * (this.kind === 'hippo' ? 16 : 26);
    u.uPhase.value = this.phase;
    u.uWalk.value = 1.7 * k;
    u.uGallop.value = 0.5;
    u.uSleep.value = 0;
    u.uTime.value = t * 3 + this.seed;
    u.uHeadYaw.value = Math.sin(t * (this.kind === 'hippo' ? 14 : 24)) * 0.55 * k;
    const lunge = this.slapT > 0 ? Math.sin((1 - this.slapT / 0.16) * Math.PI) : 0;
    if (this.kind === 'penguin') {
      // flapping like it might take off (it won't)
      u.uHeadPitch.value = -0.4;
      const sq = 1 + Math.sin(t * 30) * 0.1 * k;
      this.mesh.scale.set(sq, 1 / sq, 1);
      this.tilt.rotation.set(Math.sin(t * 7) * 0.3 * k, 0, Math.sin(t * 26) * 0.35 * k);
    } else if (this.kind === 'hippo' || this.kind === 'elephant') {
      u.uHeadPitch.value = -0.95 + Math.sin(t * 20) * 0.1; // mouth wide open, screaming
      const puff = 1 + Math.abs(Math.sin(t * 5)) * 0.18 * k;
      this.mesh.scale.set(puff, 1 / Math.sqrt(puff), puff);
      this.tilt.rotation.set(-0.35 * k, 0, Math.sin(t * 11) * 0.2 * k);
    } else {
      u.uHeadPitch.value = 0.6 - lunge * 0.4;
      const sq = 1 + Math.sin(t * 17) * 0.07 * k;
      this.mesh.scale.set(1 / sq, sq, 1 / sq);
      this.tilt.rotation.set((-1.1 - lunge * 0.5) * k, 0, Math.sin(t * 15) * 0.18 * k); // up on its hind legs, arms at your face
    }
    this.mesh.position.z = this.protoL / 2 + lunge * this.protoL * 0.7;
  }

  // Back on the ground after a throw: dizzy for a moment, then legs it.
  land() {
    const game = this.game, b = this.dyn;
    game.world.removeBody(b);
    game.world.addBody(this.body);
    let x = b.position.x, z = b.position.z;
    const home = this.region.contains(x, z) && b.position.y > -30;
    if (!home) {
      this.shout('*poof*', '#ffffff');
      [x, z] = this.region.random(); // thrown out of the enclosure: the keepers put it straight back
    }
    _e.setFromQuaternion(this.root.quaternion, 'YXZ');
    this.yaw = _e.y;
    this.x = x; this.z = z;
    this.y = this.groundAt(x, z, home ? b.position.y : heightAt(x, z) + 3);
    this.root.rotation.set(0, this.yaw, 0);
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.z = this.protoL / 2;
    this.tilt.rotation.set(0, 0, 0);
    this.rear = 0; this.roll = 0; this.walk = 0; this.speed = 0;
    this.dizzy = 2.4;
    this.setState('idle', 2.4);
    this.shout('@_@', '#9fe0ff');
    sfx.boing();
  }

  update(dt, t) {
    const sp = this.sp;
    if (this.state === 'held' || this.state === 'tossed') { this.updateHeld(dt, t); return; }
    this.timer -= dt;
    this.noiseCd -= dt;
    this.attackCd -= dt;
    this.yawn = Math.max(0, (this.yawn || 0) - dt);
    this.lunge = Math.max(0, (this.lunge || 0) - dt);

    // Predators react to anyone climbing in.
    const prey = this.findPrey();
    if (prey && this.state !== 'chase') {
      const d = Math.hypot(prey.pos.x - this.x, prey.pos.z - this.z);
      if (this.state !== 'sleep' || d < 5 || Math.random() < dt * 0.3) {
        this.setState('chase', 0);
        if (this.noiseCd < 4) { this.say(); this.noiseCd = 8; }
      }
    }

    let walking = false, headYaw = 0, headPitch = 0, sleeping = false;
    this.pose = NO_POSE;
    switch (this.state) {
      case 'act': {
        this.speed = 0;
        this.actT += dt;
        const d = this.actDur, t2 = this.actT;
        const e = clamp(Math.min(t2 / 0.4, (d - t2) / 0.4), 0, 1);
        if (this.act.move) { // belly slide: scoot forward while lying down
          const nx = this.x + Math.sin(this.yaw) * this.act.move * e * dt, nz = this.z + Math.cos(this.yaw) * this.act.move * e * dt;
          if (this.region.contains(nx, nz)) { this.x = nx; this.z = nz; this.y = this.groundAt(nx, nz); }
        }
        this.pose = this.act.pose(t2, clamp(t2 / d, 0, 1), e);
        headYaw = this.pose.headYaw || 0;
        headPitch = this.pose.headPitch || 0;
        if (this.act.name === 'dunk' && !this.splashed && t2 > d - 0.6) { this.splashed = true; sfx.splash(this.loud(0.8)); }
        if (this.timer < 0) { this.splashed = false; this.setState('idle', 1 + Math.random() * 3); }
        break;
      }
      case 'eat': {
        const it = this.food, items = this.game.items;
        if (!it || !items.list.includes(it) || this.game.grabber.entity === it || this.timer < 0) { this.food = null; this.setState('idle', 1); break; }
        const p = it.body.position;
        if (Math.hypot(p.x - this.x, p.z - this.z) > this.L * 0.55 + 0.35) { this.steer(p.x, p.z, sp.walk * 1.5, dt); walking = true; this.eatT = 0; break; }
        this.speed = 0;
        this.yaw += clamp(angleDiff(Math.atan2(p.x - this.x, p.z - this.z), this.yaw), -3 * dt, 3 * dt);
        headPitch = 0.7 + Math.sin(t * 9) * 0.15;
        this.eatT += dt;
        if (this.eatT > 0.5 && (this.chompCd = (this.chompCd || 0) - dt) < 0) { this.chompCd = 0.55; sfx.plop(this.loud(0.7)); }
        if (this.eatT > 4) {
          items.remove(it);
          this.food = null;
          this.shout('nom nom!', '#7cd05a');
          this.game.state.addHype(3);
          this.setState('idle', 2);
        }
        break;
      }
      case 'swing':
        if (this.sw.phase === 'go') walking = true;
        headPitch = this.updateSwing(dt);
        break;
      case 'sleep':
        sleeping = true;
        this.speed = 0;
        headPitch = 0.35;
        if (this.timer < 0) this.sleepWake();
        break;
      case 'idle':
        this.speed = 0;
        headYaw = Math.sin(t * 0.6 + this.seed) * 0.7;
        headPitch = this.sniff ? 0.45 + Math.sin(t * 3 + this.seed) * 0.08 : Math.sin(t * 0.4 + this.seed) * 0.1;
        if (this.kind === 'baboon' && Math.random() < dt * 0.3) this.hop = 1;
        if (this.timer < 0) this.decide();
        break;
      case 'walk':
      case 'run': {
        const arrived = this.steer(this.target[0], this.target[1], this.state === 'run' ? sp.run : sp.walk, dt);
        walking = true;
        headYaw = Math.sin(t * 0.5 + this.seed) * 0.25;
        if (this.kind === 'lion') headPitch = 0.15; // prowling, head low
        if (this.state === 'run' && this.kind === 'baboon' && this.hop <= 0 && Math.random() < dt * 1.5) this.hop = 1;
        if (arrived || this.timer < 0) {
          if (this.thenSleep) { this.thenSleep = false; this.setState('sleep', 20 + Math.random() * 25); this.sideways = false; }
          else this.setState('idle', 2 + Math.random() * 5);
        }
        break;
      }
      case 'chase': {
        const p = prey || this.findPrey();
        if (!p) { this.setState('idle', 2); break; }
        const d = Math.hypot(p.pos.x - this.x, p.pos.z - this.z);
        const reach = this.L * 0.55 + 0.6;
        if (d > reach) this.steer(p.pos.x, p.pos.z, sp.run, dt);
        else {
          this.speed = 0;
          this.yaw += clamp(angleDiff(Math.atan2(p.pos.x - this.x, p.pos.z - this.z), this.yaw), -4 * dt, 4 * dt);
          if (this.attackCd <= 0) { this.attack(p); this.attackCd = this.kind === 'lion' ? 1.4 : 2.2; }
        }
        walking = true;
        headPitch = -0.15;
        break;
      }
    }

    // Baboons flee when you get close inside their house.
    if (this.kind === 'baboon' && this.state !== 'run' && this.state !== 'sleep' && this.state !== 'swing') {
      const p = this.game.player.body.position;
      const dx = this.x - p.x, dz = this.z - p.z, d = Math.hypot(dx, dz);
      if (d < 3 && Math.abs(p.y - this.y) < 2) {
        let tx = this.x + (dx / d) * 4, tz = this.z + (dz / d) * 4;
        if (!this.region.contains(tx, tz)) [tx, tz] = this.region.random();
        this.setState('run', 3, [tx, tz]);
        if (this.noiseCd < 0) { this.say(); this.noiseCd = 4; }
      }
    }
    if (this.state === 'idle' && this.noiseCd < 0) {
      if (Math.random() < 0.4) this.say();
      this.noiseCd = 15 + Math.random() * 30;
    }
    if (this.dizzy > 0) {
      this.dizzy -= dt;
      headYaw = Math.sin(t * 7) * 0.7; headPitch = 0.3;
      if (this.dizzy <= 0) this.startle(this.game.player.body.position);
    }
    if (this.yawn > 0) { headPitch = -0.55 * Math.sin((this.yawn / 1.2) * Math.PI); headYaw = 0; }
    if (this.lunge > 0) headPitch = -0.3;

    const hanging = this.state === 'swing' && this.sw.phase !== 'go';
    // keep a little space from the others in the group
    for (const o of this.group) {
      if (o === this || hanging || o.state === 'swing') continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = (this.L + o.L) * 0.42;
      if (d < min && d > 0.001) {
        const nx = this.x + (dx / d) * (min - d) * 0.5 * Math.min(1, dt * 4), nz = this.z + (dz / d) * (min - d) * 0.5 * Math.min(1, dt * 4);
        if (this.region.contains(nx, nz)) { this.x = nx; this.z = nz; }
      }
    }
    if (!walking && !hanging && this.state !== 'chase') this.y += (this.groundAt(this.x, this.z) - this.y) * damp(6, dt);

    // ---- pose ----
    // Stride: bigger steps the faster it goes, and the step rate matched to the ground speed,
    // so the feet stay planted instead of skating.
    const gait = this.speed > 0.05 ? clamp(0.75 + 0.35 * this.speed / sp.walk, 0.75, 1.5) : 0;
    this.walk += (gait - this.walk) * damp(6, dt);
    const galloping = this.kind !== 'hippo' && this.speed > sp.walk * 2.2 ? 1 : 0;
    this.gallop += (galloping - this.gallop) * damp(4, dt);
    const amp = sp.stride * this.L * Math.max(this.walk, 0.6);
    this.phase += (this.speed / (4 * amp)) * Math.PI * 2 * dt;
    const fold = Math.max(sleeping ? 1 : 0, this.pose.fold || 0);
    this.sleep += (fold - this.sleep) * damp(fold ? 1.5 : 3, dt);
    this.roll += ((sleeping && this.sideways ? this.rollDir * 1.15 : 0) - this.roll) * damp(1.5, dt);
    this.headYaw += (headYaw - this.headYaw) * damp(4, dt);
    this.headPitch += (headPitch - this.headPitch) * damp(4, dt);
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.6);

    const u = this.u;
    u.uPhase.value = this.phase;
    u.uWalk.value = this.walk;
    u.uGallop.value = this.gallop;
    u.uSleep.value = this.sleep;
    u.uTime.value = t + this.seed;
    u.uHeadYaw.value = this.headYaw;
    const stepping = Math.min(1, this.walk);
    u.uHeadPitch.value = this.headPitch + Math.sin(this.phase * 2) * 0.05 * stepping; // head nods with each step

    const bob = Math.abs(Math.sin(this.phase)) * (0.03 + 0.06 * this.gallop) * this.H * stepping;
    const hopY = Math.sin(this.hop * Math.PI) * 0.45;
    const swimBob = this.swimming ? Math.sin(t * 1.3 + this.seed) * 0.05 : 0;
    // rolling onto a side pivots around the lower edge so the body doesn't sink into the ground
    const pose = this.pose;
    const roll = this.roll + (pose.roll || 0);
    const rollLift = Math.abs(Math.sin(roll)) * this.H * 0.12 + Math.max(0, -Math.cos(roll)) * this.H; // upside down: lift by a body height
    if (hanging) this.rear = pose.rear;
    else this.rear += ((pose.rear || 0) + (this.lunge > 0 ? -0.15 : 0) - this.rear) * damp(10, dt);
    const lift = (pose.lift || 0) * (this.kind === 'hippo' ? this.H : 1);
    if (this.kind === 'hippo' && this.swimming) this.splashCheck(lift);
    this.root.position.set(this.x, this.y + bob + hopY + swimBob + rollLift + lift, this.z);
    this.root.rotation.y = this.yaw + (pose.spin || 0);
    // hips sway side to side when walking; a gallop rocks the body nose-up, nose-down
    const sway = Math.sin(this.phase) * (sp.sway ?? 0.04) * stepping * (1 - this.gallop); // penguins waddle hard
    const rock = Math.sin(this.phase + 0.8) * 0.1 * this.gallop;
    this.tilt.rotation.z = roll + sway + (this.dizzy > 0 ? Math.sin(t * 5) * 0.2 * Math.min(1, this.dizzy) : 0);
    this.tilt.rotation.x = this.rear + rock;

    this.body.position.set(this.x, this.y, this.z);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);
    this.body.velocity.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);

    this.updateZs(dt, sleeping && this.sleep > 0.6);
  }

  // Splash whenever a swimming hippo breaks the surface or flops back in.
  splashCheck(lift) {
    const out = lift > this.H * 0.25, under = lift < -this.H * 0.3;
    const was = this.waterState || 'float', now = out ? 'out' : under ? 'under' : was === 'float' ? 'float' : (lift > this.H * 0.1 || lift < -this.H * 0.1) ? was : 'float';
    if (now !== was && (now === 'out' || was === 'out')) {
      this.game.animals.splash(this.x, this.game.animals.waterY, this.z, this.L * 0.5);
      sfx.splash(this.loud(1));
    }
    this.waterState = now;
  }

  // ---- vine swinging (baboons) ----
  // Walk under a free vine, leap up and grab it, swing like a pendulum hung from the roof, and either
  // let go at the top of a swing to fly to the next vine or drop back down to the floor.
  startSwing() {
    if (this.state === 'held' || this.state === 'tossed') return false;
    const vines = this.game.animals.vines.filter((v) => !v.holder);
    if (!vines.length) return false;
    let best = null, bd = Infinity;
    for (const v of vines) {
      const d = Math.hypot(v.x - this.x, v.z - this.z) + Math.random() * 4;
      if (d < bd) { bd = d; best = v; }
    }
    best.holder = this;
    this.setState('swing', 20, [best.x, best.z]);
    this.sw = { phase: 'go', vine: best, t: 0, swings: 0, hops: 0 };
    return true;
  }

  // the next free vine roughly ahead along the swing direction
  nextVine(from, yaw) {
    let best = null, bd = Infinity;
    for (const v of this.game.animals.vines) {
      if (v === from || v.holder) continue;
      const dx = v.x - from.x, dz = v.z - from.z, d = Math.hypot(dx, dz);
      if (d < 1.5 || d > 4.5 || Math.abs(angleDiff(Math.atan2(dx, dz), yaw)) > 0.6) continue;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // Place the animal so its back feet are at F and its body points along the swing angle th.
  hangAt(F, th) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.x = F.x + fx * this.L / 2;
    this.z = F.z + fz * this.L / 2;
    this.y = F.y;
    this.pose = { rear: -Math.PI / 2 - th };
  }

  // grip point / feet point for a vine at swing angle th
  gripOf(v, th, out) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return out.set(v.x + fx * Math.sin(th) * v.len, v.top - Math.cos(th) * v.len, v.z + fz * Math.sin(th) * v.len);
  }

  updateSwing(dt) {
    const s = this.sw, v = s.vine, reach = this.L * 0.8;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const feetBelow = (G, th) => _F.set(G.x + fx * Math.sin(th) * reach, G.y - Math.cos(th) * reach, G.z + fz * Math.sin(th) * reach);
    s.t += dt;
    if (s.phase === 'go') {
      if (this.steer(v.x, v.z, this.sp.run, dt) || Math.hypot(v.x - this.x, v.z - this.z) < 0.7) {
        const next = this.nextVine(v, this.yaw);
        this.yaw = next ? Math.atan2(next.x - v.x, next.z - v.z) : this.yaw;
        s.phase = 'leap'; s.t = 0;
        s.from = _A.set(this.x - fx * this.L / 2, this.y, this.z - fz * this.L / 2).clone();
        s.amp = 0.3;
        if (this.noiseCd < 2) { this.say(); this.noiseCd = 5; }
      } else if (this.timer < 0) this.setState('idle', 2);
      return 0;
    }
    const w = Math.sqrt(9.8 / (v.len + reach * 0.5));
    if (s.phase === 'leap') { // jump from the floor up to the vine's end
      const k = Math.min(1, s.t / 0.55), th = -s.amp;
      v.theta = th; v.yaw = this.yaw; v.omega = 0;
      const F = feetBelow(this.gripOf(v, th, _G), th);
      F.lerpVectors(s.from, F, smooth(k));
      F.y += Math.sin(k * Math.PI) * 0.8;
      this.hangAt(F, -Math.PI / 2 + (Math.PI / 2 + th) * smooth(k)); // stand up into the hang
      if (k >= 1) { s.phase = 'hang'; s.t = 0; s.apex = Math.PI; s.want = 1 + Math.floor(Math.random() * 3); }
      return 0.8 * k;
    }
    if (s.phase === 'hang') { // pumping the swing higher each time
      const ph = w * s.t, amp = Math.min(0.6, s.amp + s.t * 0.06);
      const th = -amp * Math.cos(ph);
      v.theta = th; v.yaw = this.yaw; v.omega = amp * w * Math.sin(ph);
      this.hangAt(feetBelow(this.gripOf(v, th, _G), th), th);
      if (ph >= s.apex) { // top of a forward swing: keep going, jump to the next vine, or let go
        s.apex += Math.PI * 2;
        s.swings++;
        const ready = s.swings >= s.want;
        const next = ready ? this.nextVine(v, this.yaw) : null;
        if (next && s.hops < 5) {
          s.phase = 'fly'; s.t = 0; s.next = next; s.th0 = th;
          s.g0 = this.gripOf(v, th, _G).clone();
          next.holder = this; v.holder = null;
          if (Math.random() < 0.5) this.say();
        } else if (ready) {
          s.phase = 'drop'; s.t = 0;
          s.vel = new THREE.Vector3(fx * 1.6, 1.2, fz * 1.6);
          s.F = feetBelow(this.gripOf(v, th, _G), th).clone();
          s.th = th;
          v.holder = null;
        }
      }
      return 1.1;
    }
    if (s.phase === 'fly') { // flying through the air to the next vine
      const n = s.next, k = Math.min(1, s.t / 0.5), back = 0.4;
      n.theta = -back * smooth(k); n.yaw = this.yaw; n.omega = 0;
      const g1 = this.gripOf(n, -back, _G);
      const G = _A.lerpVectors(s.g0, g1, k);
      G.y += Math.sin(k * Math.PI) * 0.6;
      const th = s.th0 + (-back - s.th0) * smooth(k);
      this.hangAt(feetBelow(G, th), th);
      if (k >= 1) {
        s.vine = n; s.phase = 'hang'; s.hops++; s.swings = 0; s.amp = back;
        s.t = 0; s.apex = Math.PI; s.want = Math.floor(Math.random() * 3);
      }
      return 1.1;
    }
    // drop: fall to the floor, tipping back onto all fours (th = -90° is standing)
    s.vel.y -= 9.8 * dt;
    s.F.addScaledVector(s.vel, dt);
    s.th += (-Math.PI / 2 - s.th) * damp(4, dt);
    const ground = this.groundAt(s.F.x, s.F.z, s.F.y + 0.5);
    if (s.F.y <= ground) {
      s.F.y = ground;
      this.hangAt(s.F, -Math.PI / 2);
      this.hop = 1;
      this.setState('idle', 1 + Math.random() * 2);
      return 0;
    }
    this.hangAt(s.F, s.th);
    return 1.1 * clamp(1 + s.th / (Math.PI / 2), 0, 1);
  }

  updateZs(dt, on) {
    this.zCd -= dt;
    if (on && this.zCd < 0) {
      const z = this.zs.find((q) => !q.s.visible);
      if (z) {
        z.t = 0;
        z.s.visible = true;
        const fx = Math.sin(this.yaw) * this.L * 0.35, fz = Math.cos(this.yaw) * this.L * 0.35;
        z.base = new THREE.Vector3(this.x + fx, this.y + this.H * 0.75, this.z + fz);
      }
      this.zCd = 1.1;
    }
    for (const z of this.zs) {
      if (!z.s.visible) continue;
      z.t += dt;
      const k = z.t / 2.4;
      if (k >= 1) { z.s.visible = false; continue; }
      const size = (0.25 + k * 0.3) * Math.max(0.6, this.scale);
      z.s.scale.set(size, size, size);
      z.s.position.set(z.base.x + Math.sin(k * 6) * 0.2, z.base.y + k * 1.2, z.base.z);
      z.s.material.opacity = Math.min(1, (1 - k) * 2);
    }
  }
}

// Vines across the monkey house that the baboons swing on. Each hangs from the roof and sways
// like a pendulum; while a baboon holds one, the baboon sets its angle.
function buildVines(game) {
  const roof = heightAt(MONKEY.x, MONKEY.z) + MONKEY.h, len = MONKEY.h - 3.3;
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x4b6a2a, flatShading: true, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c8a35, flatShading: true, roughness: 0.9 });
  const rope = new THREE.CylinderGeometry(0.045, 0.045, len, 5).translate(0, -len / 2, 0);
  const leaf = new THREE.ConeGeometry(0.15, 0.36, 4);
  const knot = new THREE.TorusGeometry(0.12, 0.04, 5, 8);
  return [-5.4, -2.6, 0.2, 3, 5.8].map((lx, i) => {
    const v = { x: MONKEY.x + lx, z: MONKEY.z + 1.5 + (i % 2) * 0.3, top: roof, len, theta: 0, omega: 0, yaw: 0, holder: null };
    v.obj = new THREE.Group();
    v.obj.position.set(v.x, roof, v.z);
    const r = new THREE.Mesh(rope, vineMat);
    r.castShadow = true;
    v.obj.add(r);
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(leaf, leafMat);
      l.position.set(0.08, -len * (0.15 + k * 0.17), 0);
      l.rotation.set(k * 1.3, k * 2.1, 1.3);
      v.obj.add(l);
    }
    const h = new THREE.Mesh(knot, vineMat);
    h.position.y = -len;
    v.obj.add(h);
    game.scene.add(v.obj);
    return v;
  });
}

function updateVines(vines, dt) {
  for (const v of vines) {
    if (!v.holder) {
      v.omega += (-(9.8 / v.len) * v.theta - 0.5 * v.omega) * dt;
      v.theta += v.omega * dt;
    }
    v.obj.rotation.set(-v.theta, v.yaw, 0, 'YXZ');
  }
}

// Cartoon words that pop out over an animal ("EEK!", "SLAP!") and float away.
function buildShouts(game) {
  const cache = new Map();
  const texFor = (text, color) => {
    const key = text + color;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = '900 64px "Baloo 2", system-ui';
    g.font = font;
    c.width = Math.ceil(g.measureText(text).width + 40);
    c.height = 96;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = '#2b2440';
    g.strokeText(text, c.width / 2, 50);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const v = { t, aspect: c.width / c.height };
    cache.set(key, v);
    return v;
  };
  const pool = Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    s.visible = false;
    s.renderOrder = 10;
    game.scene.add(s);
    return { s, t: 1, x: 0, y: 0, z: 0, aspect: 1, drift: 0 };
  });
  const shout = (text, x, y, z, color) => {
    const p = pool.find((q) => q.t >= 1) || pool.reduce((a, q) => (q.t > a.t ? q : a));
    const { t, aspect } = texFor(text, color);
    p.s.material.map = t;
    p.s.material.needsUpdate = true;
    Object.assign(p, { t: 0, x, y, z, aspect, drift: (Math.random() - 0.5) * 1.2 });
    p.s.visible = true;
  };
  const update = (dt) => {
    for (const p of pool) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 1.1);
      if (p.t >= 1) { p.s.visible = false; continue; }
      const pop = p.t < 0.15 ? smooth(p.t / 0.15) * 1.25 : 1.25 - Math.min(0.25, (p.t - 0.15) * 2); // pops in with an overshoot
      const h = 0.42 * pop;
      p.s.scale.set(h * p.aspect, h, 1);
      p.s.position.set(p.x + p.drift * p.t, p.y + p.t * 1.1, p.z);
      p.s.material.opacity = Math.min(1, (1 - p.t) * 3);
    }
  };
  return { shout, update };
}

// Splash rings and droplets on the hippo pond.
function buildSplashes(game) {
  const ringGeo = new THREE.RingGeometry(0.7, 1, 20).rotateX(-Math.PI / 2);
  const dropGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8f4f4, transparent: true, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, mat);
    const drops = Array.from({ length: 14 }, () => ({ m: new THREE.Mesh(dropGeo, mat), v: new THREE.Vector3() }));
    const g = new THREE.Group();
    g.add(ring);
    for (const d of drops) g.add(d.m);
    g.visible = false;
    game.scene.add(g);
    pool.push({ g, ring, mat, drops, t: 1, size: 1 });
  }
  const spawn = (x, y, z, size) => {
    const sp = pool.find((p) => p.t >= 1) || pool[0];
    sp.t = 0; sp.size = size;
    sp.g.position.set(x, y + 0.03, z);
    sp.g.visible = true;
    for (const d of sp.drops) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * size * 0.6;
      d.m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      d.v.set(Math.cos(a) * (1 + Math.random() * 2), 3 + Math.random() * 3.5, Math.sin(a) * (1 + Math.random() * 2)).multiplyScalar(Math.sqrt(size));
    }
  };
  const update = (dt) => {
    for (const p of pool) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 1.3);
      if (p.t >= 1) { p.g.visible = false; continue; }
      p.ring.scale.setScalar(p.size * (0.6 + p.t * 2.2));
      p.mat.opacity = 0.85 * (1 - p.t);
      for (const d of p.drops) {
        d.v.y -= 9.8 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.visible = d.m.position.y > -0.1;
      }
    }
  };
  return { spawn, update };
}

export async function buildAnimals(game) {
  const [lion, hippo, baboon, penguin, elephant, gorilla] = await Promise.all(['lion', 'hippo', 'baboon', 'penguin', 'elephant', 'gorilla'].map(loadSpecies));
  const animals = { list: [], waterY: pondWaterY(), vines: buildVines(game), pools: game.habitats.pools };
  const splashes = buildSplashes(game);
  animals.splash = splashes.spawn;
  const shouts = buildShouts(game);
  animals.shout = shouts.shout;
  game.animals = animals;

  const lionArea = circle(LION.x, LION.z, LION.r - 1.8);
  const hippoArea = circle(HIPPO.x, HIPPO.z, HIPPO.r - 2.4);
  const monkeyArea = box(MONKEY.x, MONKEY.z, MONKEY.w / 2 - 1.3, MONKEY.d / 2 - 1.3);

  const add = (proto, region, group, opts) => {
    const [x, z] = opts.at || region.random();
    const a = new Animal(game, proto, { x, z, region, group, ...opts });
    group.push(a);
    animals.list.push(a);
    return a;
  };
  const lions = [], hippos = [], baboons = [];
  add(lion, lionArea, lions, { scale: 1.6, at: [LION.x + 3, LION.z + 2] });
  add(lion, lionArea, lions, { scale: 1.4, at: [LION.x - 4, LION.z - 1] });
  add(hippo, hippoArea, hippos, { scale: 1, at: [POND.x + 1, POND.z + 1] });
  add(hippo, hippoArea, hippos, { scale: 0.55, at: [POND.x - 2, POND.z - 2] }); // calf
  for (let i = 0; i < 4; i++) add(baboon, monkeyArea, baboons, { scale: i === 0 ? 1.15 : 0.8 + Math.random() * 0.25 });
  const penguins = [], elephants = [], gorillas = [];
  const penguinArea = circle(PENGUIN.x, PENGUIN.z, PENGUIN.r - 1.2);
  const elephantArea = circle(ELEPHANT.x, ELEPHANT.z, ELEPHANT.r - 2);
  const gorillaArea = circle(GORILLA.x, GORILLA.z, GORILLA.r - 1.4);
  for (let i = 0; i < 6; i++) add(penguin, penguinArea, penguins, { scale: 0.85 + Math.random() * 0.3 });
  add(elephant, elephantArea, elephants, { scale: 1, at: [ELEPHANT.x - 3, ELEPHANT.z + 1] });
  add(elephant, elephantArea, elephants, { scale: 0.85, at: [ELEPHANT.x + 3, ELEPHANT.z + 2] });
  add(elephant, elephantArea, elephants, { scale: 0.42, at: [ELEPHANT.x, ELEPHANT.z - 3] }); // calf
  add(gorilla, gorillaArea, gorillas, { scale: 1.1, at: [GORILLA.x + 2, GORILLA.z + 1] });
  add(gorilla, gorillaArea, gorillas, { scale: 0.85, at: [GORILLA.x - 1, GORILLA.z + 3] });
  add(gorilla, gorillaArea, gorillas, { scale: 0.45, at: [GORILLA.x, GORILLA.z - 3] }); // baby
  game.state.animalCount = animals.list.length;

  // Food left inside an enclosure gets eaten by whoever's closest and not busy.
  let foodCd = 1;
  const feed = (dt) => {
    if ((foodCd -= dt) > 0) return;
    foodCd = 1;
    for (const it of game.items.list) {
      if (!it.def.food || game.grabber.entity === it || animals.list.some((a) => a.food === it)) continue;
      const p = it.body.position;
      let best = null, bd = Infinity;
      for (const a of animals.list) {
        if (!['idle', 'walk', 'sleep', 'act'].includes(a.state) || !a.region.contains(p.x, p.z)) continue;
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) { best.food = it; best.setState('eat', 25); }
    }
  };

  animals.update = (t, dt) => {
    for (const a of animals.list) a.update(dt, t);
    feed(dt);
    updateVines(animals.vines, dt);
    splashes.update(dt);
    shouts.update(dt);
  };
  return animals;
}
