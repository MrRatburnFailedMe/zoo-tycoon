import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StaticBatch, staticBody, solidBox, mat, mesh, BLOCKER } from '../util/build.js';
import { signTexture } from '../util/textures.js';
import { angleDiff } from '../util/math.js';
import { heightAt } from './terrain.js';
import { ENCLOSURES, PERIMETER_R, GATE, GATE_W, PLAZA, DUMPSTER, OFFICE } from './layout.js';

const Y = new CANNON.Vec3(0, 1, 0);

// Ring fence with an opening. All rails/posts go into one batch; each segment gets a thin collider.
function fenceRing(game, batch, cx, cz, r, { gapAngle = null, gapWidth = 2.8, color, postColor = color, height = 1.2, rails = 2, segLen = 2.4 }) {
  const n = Math.ceil((2 * Math.PI * r) / segLen);
  const post = new THREE.BoxGeometry(0.14, height + 0.15, 0.14);
  const gapEdges = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (gapAngle !== null && Math.abs(angleDiff(mid, gapAngle)) < gapWidth / (2 * r) + Math.PI / n * 0.5) { gapEdges.push(a0, a1); continue; }
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
    batch.add(post, postColor, { pos: [x0, y0 + (height + 0.15) / 2 - 0.05, z0], rot: [0, -a0, 0] });
    batch.add(post, postColor, { pos: [x1, y1 + (height + 0.15) / 2 - 0.05, z1], rot: [0, -a1, 0] });
    const L = Math.hypot(x1 - x0, z1 - z0);
    const rail = new THREE.BoxGeometry(0.07, 0.09, L);
    for (let k = 1; k <= rails; k++) {
      const h = (height * k) / (rails + 0.4);
      batch.add(rail, color, { pos: [(x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2], lookAt: [x1, y1 + h, z1] });
    }
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.08, (height + 0.6) / 2, L / 2)), (x0 + x1) / 2, Math.min(y0, y1) + (height + 0.6) / 2 - 0.2, (z0 + z1) / 2, yaw);
  }
  // Chunky gate posts on both sides of the opening.
  if (gapAngle !== null) {
    const gp = new THREE.BoxGeometry(0.3, height + 0.6, 0.3);
    for (const a of [gapEdges[0], gapEdges[gapEdges.length - 1]]) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      batch.add(gp, postColor, { pos: [x, heightAt(x, z) + (height + 0.6) / 2 - 0.1, z] });
    }
  }
}

export function signBoard(game, text, x, z, yaw, { w = 2.2, h = 0.7, postH = 1.6, bg = '#2f5d3a', fg = '#fff3c4', sub } = {}) {
  const y = heightAt(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  const wood = mat(0x6b4a2e);
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.1, postH + h, 0.1), wood);
    p.position.set((s * w) / 2 * 0.85, (postH + h) / 2, 0);
    g.add(p);
  }
  const tex = signTexture(text, { bg, fg, sub, w: 1024, h: Math.round((1024 * h) / w) });
  const board = mesh(new THREE.BoxGeometry(w, h, 0.08), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })]);
  board.position.set(0, postH + h / 2, 0);
  g.add(board);
  game.scene.add(g);
  return g;
}

export { fenceRing };

export function buildZoo(game) {
  const { scene } = game;
  const batch = new StaticBatch();

  // ---- Perimeter fence with the main gate ----
  fenceRing(game, batch, 0, 0, PERIMETER_R, { gapAngle: Math.PI / 2, gapWidth: GATE_W, color: 0x8a6a45, height: 1.1, rails: 2, segLen: 3 });

  // Gate arch.
  const gy = heightAt(GATE.x, GATE.z);
  for (const s of [-1, 1]) {
    solidBox(game, { size: [0.9, 5.2, 0.9], pos: [GATE.x + s * 4.5, gy + 2.4, GATE.z], color: 0xb9a184 });
    solidBox(game, { size: [1.1, 0.35, 1.1], pos: [GATE.x + s * 4.5, gy + 5.1, GATE.z], color: 0x7a5533, collide: false });
  }
  const archTex = signTexture('ZOO TYCOON', { bg: '#3d7a3a', fg: '#ffe27a', edge: '#5b3a1e', size: 170, sub: 'EST. TODAY · HILLTOP' });
  const arch = mesh(new THREE.BoxGeometry(10.2, 1.5, 0.45), [mat(0x5b3a1e), mat(0x5b3a1e), mat(0x5b3a1e), mat(0x5b3a1e),
    new THREE.MeshStandardMaterial({ map: archTex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: archTex, roughness: 0.6 })]);
  arch.position.set(GATE.x, gy + 5.7, GATE.z);
  arch.rotation.y = Math.PI; // readable from outside
  scene.add(arch);

  // ---- Plaza: fountain, benches, lamps, signpost ----
  const py = heightAt(PLAZA.x, PLAZA.z);
  const stone = 0xc9c1b0;
  batch.add(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 14), stone, { pos: [PLAZA.x, py + 0.3, PLAZA.z] });
  batch.add(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8), stone, { pos: [PLAZA.x, py + 1.0, PLAZA.z] });
  batch.add(new THREE.CylinderGeometry(1.2, 0.5, 0.35, 10), stone, { pos: [PLAZA.x, py + 1.85, PLAZA.z] });
  staticBody(game, new CANNON.Cylinder(3.4, 3.4, 0.7, 14), PLAZA.x, py + 0.3, PLAZA.z);
  staticBody(game, new CANNON.Cylinder(0.5, 0.5, 2, 8), PLAZA.x, py + 1, PLAZA.z);
  const fountainWater = mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x4fb4d6, roughness: 0.05, transparent: true, opacity: 0.85, flatShading: true }), { cast: false });
  fountainWater.position.set(PLAZA.x, py + 0.58, PLAZA.z);
  scene.add(fountainWater);
  const spray = buildSpray(scene, PLAZA.x, py + 2.0, PLAZA.z);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = PLAZA.x + Math.cos(a) * 6.3, bz = PLAZA.z + Math.sin(a) * 6.3;
    bench(game, batch, bx, bz, Math.atan2(PLAZA.x - bx, PLAZA.z - bz));
  }
  const lamps = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    lamps.push([PLAZA.x + Math.cos(a) * 7.6, PLAZA.z + Math.sin(a) * 7.6]);
  }
  for (let z = 18; z < 48; z += 10) lamps.push([-3, z], [3, z + 5]);
  for (const [lx, lz] of lamps) lampPost(game, batch, lx, lz);

  // Direction signs at the plaza.
  ENCLOSURES.forEach((e) => {
    const a = Math.atan2(e.view[1] - PLAZA.z, e.view[0] - PLAZA.x);
    const sx = PLAZA.x + Math.cos(a) * 9.4, sz = PLAZA.z + Math.sin(a) * 9.4;
    signBoard(game, `${e.name} →`, sx + Math.cos(a + 1.57) * 2.4, sz + Math.sin(a + 1.57) * 2.4, Math.atan2(PLAZA.x - sx, PLAZA.z - sz), { w: 1.8, h: 0.45, postH: 1.4, bg: '#7a5533' });
  });
  signBoard(game, 'ZOO HQ · STAFF', -9.5, 16, Math.atan2(PLAZA.x + 9.5, PLAZA.z - 16), { w: 1.8, h: 0.45, postH: 1.4, bg: '#7a5533' });

  // ---- Bins: anything marked as trash dropped in here gets disposed ----
  const bins = [];
  {
    const { x, z } = DUMPSTER;
    const y = heightAt(x, z);
    const W = 2.4, D = 1.4, H = 1.25, t = 0.08, green = 0x2f6b3a;
    solidBox(game, { size: [W, t, D], pos: [x, y + 0.2, z], color: green });
    solidBox(game, { size: [W, H, t], pos: [x, y + 0.2 + H / 2, z - D / 2], color: green });
    solidBox(game, { size: [W, H * 0.85, t], pos: [x, y + 0.2 + (H * 0.85) / 2, z + D / 2], color: green });
    solidBox(game, { size: [t, H, D], pos: [x - W / 2, y + 0.2 + H / 2, z], color: green });
    solidBox(game, { size: [t, H, D], pos: [x + W / 2, y + 0.2 + H / 2, z], color: green });
    for (const s of [-1, 1]) solidBox(game, { size: [0.2, 0.25, 0.2], pos: [x + s * (W / 2 - 0.2), y + 0.06, z], color: 0x222222, collide: false });
    const lid = mesh(new THREE.BoxGeometry(W + 0.05, 0.06, D), mat(0x234f2c));
    lid.position.set(x, y + 0.2 + H + 0.45, z - D / 2 - 0.45);
    lid.rotation.x = -1.2;
    scene.add(lid);
    const label = mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTexture('POOP & TRASH', { bg: '#2f6b3a', edge: '#2f6b3a', fg: '#fff', size: 120 }) }), { cast: false });
    label.position.set(x, y + 0.75, z + D / 2 + 0.05);
    scene.add(label);
    bins.push({ name: 'Dumpster', contains: (p) => Math.abs(p.x - x) < W / 2 && Math.abs(p.z - z) < D / 2 && p.y > y + 0.2 && p.y < y + 0.2 + H + 0.3 });
  }
  const binSpots = [[4.5, 16], [-4.5, 32], [PLAZA.x - 8.5, PLAZA.z + 3], [11, -8], [-13, -6], [6, -20]];
  for (const [bx, bz] of binSpots) {
    const y = heightAt(bx, bz);
    batch.add(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 10), 0x3d7a3a, { pos: [bx, y + 0.45, bz] });
    batch.add(new THREE.CylinderGeometry(0.37, 0.37, 0.06, 10), 0x2b2b2b, { pos: [bx, y + 0.92, bz] });
    staticBody(game, new CANNON.Cylinder(0.35, 0.35, 0.95, 10), bx, y + 0.47, bz);
    bins.push({ name: 'Bin', contains: (p) => Math.hypot(p.x - bx, p.z - bz) < 0.45 && p.y > y + 0.9 && p.y < y + 1.5 });
  }

  batch.build(scene);

  return {
    bins,
    update(t, dt) {
      fountainWater.position.y = py + 0.58 + Math.sin(t * 2) * 0.015;
      spray.update(dt);
    },
  };
}

function bench(game, batch, x, z, yaw) {
  const y = heightAt(x, z);
  const wood = 0x9a6a3e, iron = 0x333333;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const at = (lx, ly, lz) => { const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(q); return [x + v.x, y + ly, z + v.z]; };
  batch.add(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood, { pos: at(0, 0.48, 0), rot: [0, yaw, 0] });
  batch.add(new THREE.BoxGeometry(1.8, 0.4, 0.06), wood, { pos: at(0, 0.82, -0.24), rot: [-0.15, yaw, 0] });
  for (const s of [-0.75, 0.75]) batch.add(new THREE.BoxGeometry(0.08, 0.5, 0.5), iron, { pos: at(s, 0.24, 0), rot: [0, yaw, 0] });
  staticBody(game, new CANNON.Box(new CANNON.Vec3(0.9, 0.26, 0.25)), ...at(0, 0.26, 0), yaw);
  staticBody(game, new CANNON.Box(new CANNON.Vec3(0.9, 0.2, 0.04)), ...at(0, 0.82, -0.24), yaw);
}

function lampPost(game, batch, x, z) {
  const y = heightAt(x, z);
  batch.add(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 6), 0x2e3a33, { pos: [x, y + 1.7, z] });
  batch.add(new THREE.CylinderGeometry(0.2, 0.25, 0.15, 6), 0x2e3a33, { pos: [x, y + 0.07, z] });
  batch.add(new THREE.ConeGeometry(0.32, 0.3, 6), 0x2e3a33, { pos: [x, y + 3.65, z] });
  const bulb = mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(0xfff1c4, { emissive: 0xffd27a, emissiveIntensity: 1.4 }), { cast: false });
  bulb.position.set(x, y + 3.42, z);
  game.scene.add(bulb);
  staticBody(game, new CANNON.Cylinder(0.1, 0.1, 3.4, 6), x, y + 1.7, z);
}

function buildSpray(scene, x, y, z) {
  const N = 140;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8f3ff, size: 0.09, transparent: true, opacity: 0.85 }));
  pts.frustumCulled = false;
  scene.add(pts);
  const reset = (i) => {
    const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 0.6;
    pos.set([x, y, z], i * 3);
    vel.set([Math.cos(a) * s, 2.5 + Math.random() * 1.2, Math.sin(a) * s], i * 3);
    life[i] = 0;
  };
  for (let i = 0; i < N; i++) { reset(i); life[i] = Math.random() * 1.2; }
  return {
    update(dt) {
      for (let i = 0; i < N; i++) {
        life[i] += dt;
        vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < y - 1.4) reset(i);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
