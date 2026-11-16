import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StaticBatch, staticBody, mat, mesh } from '../util/build.js';
import { angleDiff } from '../util/math.js';
import { heightAt } from './terrain.js';
import { PENGUIN, ELEPHANT, GORILLA } from './layout.js';
import { signBoard, fenceRing } from './zoo.js';

// The three newer exhibits: Penguin Cove (icy pool behind low glass), Elephant Plains (sandy yard,
// log fence, watering hole) and Gorilla Forest (tall glass viewing wall, rocks, climbing frame).

// Calls fn for each straight segment around a circle, skipping the angles skip() rejects.
function ring(cx, cz, r, segLen, skip, fn) {
  const n = Math.ceil((2 * Math.PI * r) / segLen);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (skip((a0 + a1) / 2)) continue;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    fn({ a0, a1, x0, z0, x1, z1, y: Math.min(heightAt(x0, z0), heightAt(x1, z1)), L: Math.hypot(x1 - x0, z1 - z0), yaw: Math.atan2(x1 - x0, z1 - z0), mx: (x0 + x1) / 2, mz: (z0 + z1) / 2 });
  }
}

function disc(game, x, z, r, color, lift = 0.04, opts = {}) {
  const m = mesh(new THREE.CircleGeometry(r, 28), mat(color, opts), { cast: false });
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, heightAt(x, z) + lift, z);
  game.scene.add(m);
  return m;
}

function boulder(game, batch, x, z, s, color = 0x9a958c) {
  const y = heightAt(x, z);
  batch.add(new THREE.IcosahedronGeometry(s, 0), color, { pos: [x, y + s * 0.45, z], scale: [1.2, 0.8, 1], rot: [0, x * 3, 0] });
  staticBody(game, new CANNON.Sphere(s * 0.85), x, y + s * 0.3, z);
}

function tree(game, batch, x, z, h, canopy = 0x4f8a3a) {
  const y = heightAt(x, z);
  batch.add(new THREE.CylinderGeometry(0.18, 0.3, h, 7), 0x6b5038, { pos: [x, y + h / 2, z] });
  batch.add(new THREE.CylinderGeometry(1.8, 2.2, 0.5, 8), canopy, { pos: [x, y + h + 0.1, z] });
  batch.add(new THREE.IcosahedronGeometry(1.2, 0), canopy, { pos: [x + 0.4, y + h + 0.5, z - 0.2], scale: [1.4, 0.5, 1.3] });
  staticBody(game, new CANNON.Cylinder(0.3, 0.3, h, 6), x, y + h / 2, z);
}

const facing = (e, x, z) => Math.atan2(x - e.x, z - e.z); // sign faces away from its exhibit, toward visitors

export function buildHabitats(game) {
  const batch = new StaticBatch();
  const pools = [];

  // ---------- Penguin Cove ----------
  {
    const { x: cx, z: cz, r } = PENGUIN;
    disc(game, cx, cz, r, 0xe9f3f7, 0.03);
    const pool = { x: cx - 1.6, z: cz - 0.6, r: 2.8 };
    const water = disc(game, pool.x, pool.z, pool.r, 0x3d9fd6, 0.06, { roughness: 0.1, transparent: true, opacity: 0.88 });
    water.renderOrder = 1;
    pools.push(pool);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      batch.add(new THREE.IcosahedronGeometry(0.35, 0), i % 2 ? 0xffffff : 0xdcecf3, { pos: [pool.x + Math.cos(a) * (pool.r + 0.2), heightAt(cx, cz) + 0.12, pool.z + Math.sin(a) * (pool.r + 0.2)], scale: [1, 0.5, 1] });
    }
    // icebergs to climb on
    for (const [dx, dz, s] of [[2.6, -2.5, 0.9], [3.2, 1.8, 0.7], [-0.5, 3.5, 0.8], [1.5, 3.4, 0.5]]) boulder(game, batch, cx + dx, cz + dz, s, 0xf2f8fb);
    // curb + breakable glass all the way round, keeper door at the back
    const gateHalf = 0.18;
    ring(cx, cz, r, 2.4, (a) => Math.abs(angleDiff(a, PENGUIN.keeperAngle)) < gateHalf, (s) => {
      batch.add(new THREE.BoxGeometry(0.4, 0.5, s.L + 0.05), 0xb8c4c8, { pos: [s.mx, s.y + 0.22, s.mz], rot: [0, s.yaw, 0] });
      batch.add(new THREE.BoxGeometry(0.12, 1.75, 0.12), 0x5d7a86, { pos: [s.x0, s.y + 0.85, s.z0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.2, 0.25, s.L / 2)), s.mx, s.y + 0.22, s.mz, s.yaw);
      game.glass.add(s.mx, s.y + 0.48 + 0.6, s.mz, s.L - 0.06, 1.2, s.yaw, { thick: 0.04, colliderThick: 0.15 });
    });
    for (const side of [-1, 1]) {
      const a = PENGUIN.keeperAngle + side * gateHalf, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      batch.add(new THREE.BoxGeometry(0.2, 1.8, 0.2), 0x5d7a86, { pos: [x, heightAt(x, z) + 0.9, z] });
    }
    signBoard(game, PENGUIN.name, PENGUIN.view[0] + 0.3, PENGUIN.view[1] + 3.2, facing(PENGUIN, PENGUIN.view[0], PENGUIN.view[1] + 3.2), { sub: 'they waddle so you don\'t have to', bg: '#2f6f9e' });
  }

  // ---------- Elephant Plains ----------
  {
    const { x: cx, z: cz, r } = ELEPHANT;
    disc(game, cx, cz, r - 0.2, 0xd9bf86, 0.03);
    const hole = { x: cx + 3.5, z: cz - 3, r: 2.4 };
    disc(game, hole.x, hole.z, hole.r, 0x4a8fb0, 0.07, { roughness: 0.1 });
    disc(game, hole.x, hole.z, hole.r + 0.6, 0x8a6a45, 0.05);
    fenceRing(game, batch, cx, cz, r, { gapAngle: ELEPHANT.keeperAngle, gapWidth: 3, color: 0x7a5533, postColor: 0x5e4430, height: 1.6, rails: 3, segLen: 2.6 });
    tree(game, batch, cx - 4, cz + 3.5, 4.2, 0x6b8f3a);
    tree(game, batch, cx + 5, cz + 4.5, 3.6, 0x5d8a34);
    for (const [dx, dz, s] of [[-5.5, -3, 1.1], [-2, -6.5, 0.8], [6.5, 0.5, 0.9]]) boulder(game, batch, cx + dx, cz + dz, s, 0xb3a184);
    // feeding trough
    const tx = cx - 1, tz = cz - 2, ty = heightAt(tx, tz);
    batch.add(new THREE.BoxGeometry(2.2, 0.5, 0.7), 0x6b4a2e, { pos: [tx, ty + 0.25, tz] });
    batch.add(new THREE.BoxGeometry(2.0, 0.08, 0.5), 0xe2c45a, { pos: [tx, ty + 0.48, tz] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(1.1, 0.25, 0.35)), tx, ty + 0.25, tz);
    signBoard(game, ELEPHANT.name, ELEPHANT.view[0] - 1.5, ELEPHANT.view[1] + 2.4, facing(ELEPHANT, ELEPHANT.view[0] - 1.5, ELEPHANT.view[1] + 2.4), { sub: 'please do not lend them your peanuts', bg: '#8a6a45' });
  }

  // ---------- Gorilla Forest ----------
  {
    const { x: cx, z: cz, r } = GORILLA;
    disc(game, cx, cz, r - 0.1, 0x4f7a34, 0.03);
    const winHalf = 0.95, gateHalf = 0.2;
    // tall glass wall on the visitor side, a log palisade everywhere else
    ring(cx, cz, r, 2.2, (a) => Math.abs(angleDiff(a, GORILLA.keeperAngle)) < gateHalf, (s) => {
      const mid = (s.a0 + s.a1) / 2;
      if (Math.abs(angleDiff(mid, GORILLA.viewAngle)) < winHalf) {
        batch.add(new THREE.BoxGeometry(0.5, 0.6, s.L + 0.05), 0x8f8a80, { pos: [s.mx, s.y + 0.27, s.mz], rot: [0, s.yaw, 0] });
        batch.add(new THREE.BoxGeometry(0.16, 3.4, 0.16), 0x3b3b3b, { pos: [s.x0, s.y + 1.7, s.z0] });
        staticBody(game, new CANNON.Box(new CANNON.Vec3(0.25, 0.3, s.L / 2)), s.mx, s.y + 0.27, s.mz, s.yaw);
        game.glass.add(s.mx, s.y + 0.58 + 1.4, s.mz, s.L - 0.08, 2.8, s.yaw, { colliderThick: 0.2 });
      } else {
        const n = Math.round(s.L / 0.28);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t;
          const h = 3.1 + Math.sin(i * 2.3 + s.a0 * 7) * 0.25;
          batch.add(new THREE.CylinderGeometry(0.13, 0.14, h, 6), i % 2 ? 0x6b5038 : 0x7a5a3c, { pos: [x, heightAt(x, z) + h / 2, z] });
        }
        staticBody(game, new CANNON.Box(new CANNON.Vec3(0.15, 1.6, s.L / 2)), s.mx, s.y + 1.55, s.mz, s.yaw);
      }
    });
    // climbing frame: four log posts, a platform and a hanging tyre-rope
    const fx = cx - 2.2, fz = cz - 1.5, fy = heightAt(fx, fz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      batch.add(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), 0x6b5038, { pos: [fx + dx, fy + 1.3, fz + dz] });
      staticBody(game, new CANNON.Cylinder(0.14, 0.14, 2.6, 6), fx + dx, fy + 1.3, fz + dz);
    }
    for (let i = 0; i < 6; i++) batch.add(new THREE.BoxGeometry(2.3, 0.08, 0.34), i % 2 ? 0x7a5a3c : 0x86664a, { pos: [fx, fy + 2.0, fz - 0.9 + i * 0.36] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(1.15, 0.05, 1.1)), fx, fy + 2.0, fz);
    batch.add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), 0xb59a6a, { pos: [fx + 1.6, fy + 1.9, fz] });
    batch.add(new THREE.TorusGeometry(0.3, 0.1, 6, 10), 0x2a2a2a, { pos: [fx + 1.6, fy + 1.05, fz], rot: [Math.PI / 2, 0, 0] });
    tree(game, batch, cx + 2.5, cz - 4, 4.5, 0x3f7a30);
    tree(game, batch, cx - 4.5, cz + 3.2, 3.8, 0x467d36);
    for (const [dx, dz, s] of [[3.5, 2.5, 1.0], [-1, 4.5, 0.7], [-5, -2.5, 0.9]]) boulder(game, batch, cx + dx, cz + dz, s);
    for (let i = 0; i < 20; i++) {
      const a = i * 2.4, d = 1.5 + (i * 0.37) % (r - 2);
      batch.add(new THREE.ConeGeometry(0.35, 0.7, 5), i % 2 ? 0x3f7a2e : 0x5c8a35, { pos: [cx + Math.cos(a) * d, heightAt(cx, cz) + 0.3, cz + Math.sin(a) * d] });
    }
    signBoard(game, GORILLA.name, GORILLA.view[0] + 0.5, GORILLA.view[1] - 3.4, facing(GORILLA, GORILLA.view[0] + 0.5, GORILLA.view[1] - 3.4), { sub: 'no, you can\'t arm-wrestle them', bg: '#3f6b3a' });
  }

  batch.build(game.scene);
  return { pools };
}
