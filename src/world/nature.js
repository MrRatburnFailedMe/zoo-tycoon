import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { prep, merge, staticBody, paint } from '../util/build.js';
import { mulberry32, hash2, smoothstep } from '../util/math.js';
import { heightAt } from './terrain.js';
import { isOpenGround, pathDist, PLAZA, OFFICE, HIPPO, POND, LION, inMonkeyHouse, PENGUIN, ELEPHANT, GORILLA, TICKET_BOOTH } from './layout.js';

// ---- Tree models (merged, vertex-colored). Replace these with your own meshes later. ----
const TRUNK = 0x5e4330;

// A star-shaped, drooping skirt of needles: the spiky layered pine look.
export function pineTier(y, radius, droop, color, points = 9, jag = 0.55) {
  const verts = [];
  const top = [0, y + droop * 0.35, 0];
  const ring = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.sin(i * 7.1) * 0.08;
    const r = i % 2 ? radius * jag : radius;
    ring.push([Math.cos(a) * r, y - (i % 2 ? droop * 0.55 : droop), Math.sin(a) * r]);
  }
  for (let i = 0; i < ring.length; i++) verts.push(...top, ...ring[(i + 1) % ring.length], ...ring[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

function pineTree() {
  const parts = [prep(new THREE.CylinderGeometry(0.1, 0.24, 6.2, 6), TRUNK, { pos: [0, 3.1, 0] })];
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const col = new THREE.Color(0x34502f).lerp(new THREE.Color(0x587a40), t * 0.7 + (i % 2) * 0.12).getHex();
    parts.push(pineTier(1.6 + i * 0.95, 2.3 * (1 - t * 0.78) + 0.25, 0.75 - t * 0.25, col, 8 + (i % 2)));
  }
  parts.push(prep(new THREE.ConeGeometry(0.28, 1.1, 5), 0x5b7d42, { pos: [0, 7.2, 0] }));
  return merge(parts);
}

function roundTree() {
  return merge([
    prep(new THREE.CylinderGeometry(0.16, 0.28, 3, 6), TRUNK, { pos: [0, 1.5, 0], jitter: 0.04 }),
    prep(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), TRUNK, { pos: [0.4, 2.6, 0], rot: [0, 0, -0.7] }),
    prep(new THREE.IcosahedronGeometry(1.6, 0), 0x6b8a42, { pos: [0, 3.7, 0], jitter: 0.45 }),
    prep(new THREE.IcosahedronGeometry(1.15, 0), 0x7a9a4a, { pos: [0.95, 4.1, 0.4], jitter: 0.3 }),
    prep(new THREE.IcosahedronGeometry(1.0, 0), 0x5e7c3a, { pos: [-0.8, 3.9, -0.5], jitter: 0.3 }),
  ]);
}

function bush() {
  return merge([
    prep(new THREE.IcosahedronGeometry(0.75, 0), 0x5c7a38, { pos: [0, 0.45, 0], jitter: 0.25, scale: [1.2, 0.8, 1] }),
    prep(new THREE.IcosahedronGeometry(0.55, 0), 0x6d8b42, { pos: [0.55, 0.4, 0.2], jitter: 0.2 }),
  ]);
}

export function rockGeo() {
  return merge([prep(new THREE.DodecahedronGeometry(1, 0), 0x8b877c, { jitter: 0.45, scale: [1.2, 0.75, 1] })]);
}

export const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });

export function scatter(game, geo, placements, { collider = null, material = leafMat } = {}) {
  if (!placements.length) return null;
  const inst = new THREE.InstancedMesh(geo, material, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  placements.forEach((pl, i) => {
    p.set(pl.x, pl.y, pl.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw);
    if (pl.sv) s.set(pl.s, pl.s * pl.sv, pl.s); else s.setScalar(pl.s);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    tint.setHSL(0.25, 0.15, 0.82 + pl.tint * 0.3);
    inst.setColorAt(i, tint);
    if (collider && pl.solid) collider(pl);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  game.scene.add(inst);
  return inst;
}

export function buildNature(game) {
  const rand = mulberry32(1234);
  const lists = { round: [], pine: [], bush: [], rock: [] };

  // Canopy footprint per tree kind, so trees never grow into each other.
  const CANOPY = { pine: 2.2, round: 2.4, bush: 1.1 };
  const taken = []; // { x, z, r }
  const fits = (x, z, r) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r);
  const place = (list, x, z, s, solid = true) => {
    const kind = list === lists.pine ? 'pine' : list === lists.round ? 'round' : list === lists.bush ? 'bush' : null;
    if (kind) {
      const r = CANOPY[kind] * s * 0.9;
      if (!fits(x, z, r)) return false;
      taken.push({ x, z, r });
    }
    list.push({ x, z, y: heightAt(x, z) - 0.1, s, yaw: rand() * Math.PI * 2, tint: rand(), solid });
    return true;
  };

  // Pine forest around the hilltop, outside the zoo fence. Mostly pines, like a mountain valley.
  for (let i = 0; i < 560; i++) {
    const a = rand() * Math.PI * 2;
    const r = 57 + Math.pow(rand(), 0.8) * 80;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > 134 || Math.abs(z) > 134 || pathDist(x, z) < 3) continue;
    const roll = rand();
    place(roll < 0.72 ? lists.pine : roll < 0.9 ? lists.round : lists.bush, x, z, 0.75 + rand() * 0.75);
  }
  // Far forest on the valley floor (no colliders, beyond the playable map).
  for (let i = 0; i < 320; i++) {
    const a = rand() * Math.PI * 2;
    const r = 145 + rand() * 160;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const list = rand() < 0.8 ? lists.pine : lists.round;
    const s = 1 + rand() * 1.1, cr = CANOPY.pine * s * 0.8;
    if (!fits(x, z, cr)) continue;
    taken.push({ x, z, r: cr });
    list.push({ x, z, y: -0.4, s, yaw: rand() * 6, tint: rand(), solid: false });
  }
  // Shade trees and bushes around the zoo grounds.
  let tries = 0, placed = 0;
  while (placed < 42 && tries++ < 900) {
    const a = rand() * Math.PI * 2, r = 9 + rand() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isOpenGround(x, z, 2.5)) continue;
    const roll = rand();
    if (place(roll < 0.45 ? lists.round : roll < 0.7 ? lists.pine : lists.bush, x, z, 0.75 + rand() * 0.4)) placed++;
  }
  // Rocks.
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2, r = 10 + rand() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r < 56 && !isOpenGround(x, z, 1.5)) continue;
    place(lists.rock, x, z, 0.3 + rand() * 0.9);
  }

  const trunkCollider = (k) => (pl) => staticBody(game, new CANNON.Cylinder(0.3 * pl.s * k, 0.35 * pl.s * k, 3 * pl.s, 6), pl.x, pl.y + 1.5 * pl.s, pl.z);
  scatter(game, roundTree(), lists.round, { collider: trunkCollider(1) });
  scatter(game, pineTree(), lists.pine, { collider: trunkCollider(0.8) });
  scatter(game, bush(), lists.bush);
  scatter(game, rockGeo(), lists.rock, { collider: (pl) => { if (pl.s > 0.5) staticBody(game, new CANNON.Sphere(pl.s * 0.85), pl.x, pl.y + 0.1, pl.z); } });

  buildGrass(game, rand);
}

// One chunky clump of tall flat blades that lean outward, dark at the root and light at the tip.
function clumpGeo(rand, blades, height, width) {
  const verts = [], cols = [], norms = [];
  const root = [0.16, 0.24, 0.07], tip = [0.55, 0.62, 0.24];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand() * 0.6;
    const h = height * (0.6 + rand() * 0.5);
    const lean = 0.18 + rand() * 0.3;
    const ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08;
    const px = -Math.sin(a) * width, pz = Math.cos(a) * width; // blade faces outward
    verts.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * h * lean, h, oz + Math.sin(a) * h * lean);
    cols.push(...root, ...root, ...tip);
    for (let k = 0; k < 3; k++) norms.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  return g;
}

export function swayMaterial(game, strength = 1) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = game.uniforms.time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float w = sin(uTime * 1.4 + ip.x * 0.3 + ip.z * 0.22) * 0.6 + sin(uTime * 2.9 + ip.x * 0.8) * 0.2;
        transformed.x += w * position.y * ${(0.22 * strength).toFixed(3)};
        transformed.z += w * position.y * ${(0.12 * strength).toFixed(3)};
      #endif`);
    // Blades are lit from "up" on both faces; don't let three flip the normal on back faces.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  return material;
}

// Instanced grass clumps with wind sway. Dense patches out in the fields, short and sparse
// near paths, straw-coloured in the lion savanna.
function buildGrass(game, rand) {
  const geo = clumpGeo(rand, 9, 0.75, 0.075);
  const N = 48000;
  const inst = new THREE.InstancedMesh(geo, swayMaterial(game), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let count = 0;
  for (let i = 0; i < N * 4 && count < N; i++) {
    const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.62) * 100; // denser toward the zoo
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const pd = pathDist(x, z);
    if (pd < 0.25) continue;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.5) continue;
    if (Math.abs(x - OFFICE.x) < OFFICE.w / 2 + 0.6 && Math.abs(z - OFFICE.z) < OFFICE.d / 2 + 0.6) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < HIPPO.r - 0.5) continue; // the pit gets reeds instead
    if (inMonkeyHouse(x, z, 0.6) && (!inMonkeyHouse(x, z, -0.6) || rand() < 0.75)) continue; // clean glass line, sparse floor inside
    if (Math.hypot(x - PENGUIN.x, z - PENGUIN.z) < PENGUIN.r + 0.6) continue; // ice, not lawn
    if (Math.abs(Math.hypot(x - GORILLA.x, z - GORILLA.z) - GORILLA.r) < 0.6) continue; // clean glass line
    if (Math.hypot(x - ELEPHANT.x, z - ELEPHANT.z) < ELEPHANT.r - 0.5 && rand() < 0.7) continue; // mostly sand
    if (Math.abs(x - TICKET_BOOTH.x) < 2 && Math.abs(z - TICKET_BOOTH.z) < 1.8) continue; // not through the booth floor
    // patchy: noise decides how lush a spot is
    const patch = smoothstep(0.25, 0.75, hash2(Math.floor(x / 5), Math.floor(z / 5)) * 0.6 + hash2(Math.floor(x / 2), Math.floor(z / 2)) * 0.4);
    const nearPath = smoothstep(0.25, 3, pd);
    if (rand() > 0.35 + patch * 0.65) continue;
    const y = heightAt(x, z);
    p.set(x, y - 0.03, z);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    const tall = (0.45 + patch * 0.9) * (0.4 + nearPath * 0.6);
    s.set(0.9 + rand() * 0.6, tall * (0.7 + rand() * 0.6), 0.9 + rand() * 0.6);
    const lion = Math.hypot(x - LION.x, z - LION.z) < LION.r;
    if (lion) s.y *= 1.35;
    m.compose(p, q, s);
    inst.setMatrixAt(count, m);
    if (lion) tint.setHSL(0.12 + rand() * 0.03, 0.55, 0.95 + rand() * 0.1);
    else tint.setHSL(0.2 + rand() * 0.06, 0.25, 0.78 + rand() * 0.2);
    inst.setColorAt(count, tint);
    count++;
  }
  inst.count = count;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  game.scene.add(inst);
}
