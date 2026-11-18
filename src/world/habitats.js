import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { StaticBatch, staticBody, mat, mesh } from '../util/build.js';
import { angleDiff } from '../util/math.js';
import { heightAt } from './terrain.js';
import { PENGUIN, ELEPHANT, GORILLA, DEN } from './layout.js';

// The three newer exhibits: Penguin Cove (icy pool behind low glass), Elephant Plains (sandy yard,
// log fence, watering hole) and Gorilla Forest (tall glass viewing wall, rocks, climbing frame).

// Calls fn for each straight segment around a regular polygon (sides corners, first corner at angle
// rot), cut into pieces about segLen long, skipping pieces whose middle angle skip() rejects.
function ring(cx, cz, r, segLen, skip, fn, sides = 4, rot = Math.PI / 4) {
  for (let k = 0; k < sides; k++) {
    const c0 = rot + (k / sides) * Math.PI * 2, c1 = rot + ((k + 1) / sides) * Math.PI * 2;
    const ax = cx + Math.cos(c0) * r, az = cz + Math.sin(c0) * r, bx = cx + Math.cos(c1) * r, bz = cz + Math.sin(c1) * r;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / segLen));
    for (let i = 0; i < n; i++) {
      const x0 = ax + (bx - ax) * (i / n), z0 = az + (bz - az) * (i / n), x1 = ax + (bx - ax) * ((i + 1) / n), z1 = az + (bz - az) * ((i + 1) / n);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, a0 = Math.atan2(z0 - cz, x0 - cx), a1 = Math.atan2(z1 - cz, x1 - cx);
      if (skip(Math.atan2(mz - cz, mx - cx))) continue;
      fn({ a0, a1, x0, z0, x1, z1, y: Math.min(heightAt(x0, z0), heightAt(x1, z1)), L: Math.hypot(x1 - x0, z1 - z0), yaw: Math.atan2(x1 - x0, z1 - z0), mx, mz, mid: Math.atan2(mz - cz, mx - cx) });
    }
  }
}

// Flat ground shaped like the enclosure (a regular polygon matching ring()).
function disc(game, x, z, r, color, lift = 0.04, opts = {}, sides = 28, rot = 0) {
  const m = mesh(new THREE.CircleGeometry(r, sides, -rot), mat(color, opts), { cast: false });
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, heightAt(x, z) + lift, z);
  game.scene.add(m);
  return m;
}

// Post-and-rail fence along a polygon.
function polyFence(game, batch, cx, cz, r, sides, rot, { skip, color, postColor, height = 1.6, rails = 3 }) {
  ring(cx, cz, r, 2.4, skip, (s) => {
    batch.add(new THREE.CylinderGeometry(0.11, 0.13, height + 0.2, 6), postColor, { pos: [s.x0, s.y + (height + 0.2) / 2, s.z0] });
    for (let k = 0; k < rails; k++) batch.add(new THREE.BoxGeometry(0.08, 0.14, s.L + 0.1), color, { pos: [s.mx, s.y + 0.4 + (k * (height - 0.4)) / Math.max(1, rails - 1), s.mz], rot: [0, s.yaw, 0] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.1, height / 2 + 0.3, s.L / 2)), s.mx, s.y + height / 2 + 0.3, s.mz, s.yaw);
  }, sides, rot);
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


export function buildHabitats(game) {
  const batch = new StaticBatch();
  const pools = [];

  // ---------- Penguin Cove ----------
  {
    const { x: cx, z: cz, r } = PENGUIN;
    const SIDES = 6, ROT = 0; // hexagonal cove
    disc(game, cx, cz, r, 0xe9f3f7, 0.03, {}, SIDES, ROT);
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
    const gateHalf = 0.22;
    ring(cx, cz, r, 2.4, (a) => Math.abs(angleDiff(a, PENGUIN.keeperAngle)) < gateHalf, (s) => {
      batch.add(new THREE.BoxGeometry(0.4, 0.5, s.L + 0.05), 0xb8c4c8, { pos: [s.mx, s.y + 0.22, s.mz], rot: [0, s.yaw, 0] });
      batch.add(new THREE.BoxGeometry(0.12, 1.75, 0.12), 0x5d7a86, { pos: [s.x0, s.y + 0.85, s.z0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.2, 0.25, s.L / 2)), s.mx, s.y + 0.22, s.mz, s.yaw);
      game.glass.add(s.mx, s.y + 0.48 + 0.6, s.mz, s.L - 0.06, 1.2, s.yaw, { thick: 0.04, colliderThick: 0.15 });
    }, SIDES, ROT);

  }

  // ---------- Elephant Plains ----------
  {
    const { x: cx, z: cz, r } = ELEPHANT;
    const SIDES = 4, ROT = 0; // diamond-shaped yard
    disc(game, cx, cz, r - 0.2, 0xd9bf86, 0.03, {}, SIDES, ROT);
    const hole = { x: cx + 2.5, z: cz - 2.5, r: 2.2 };
    disc(game, hole.x, hole.z, hole.r, 0x4a8fb0, 0.07, { roughness: 0.1 });
    disc(game, hole.x, hole.z, hole.r + 0.6, 0x8a6a45, 0.05);
    polyFence(game, batch, cx, cz, r, SIDES, ROT, { skip: (a) => Math.abs(angleDiff(a, ELEPHANT.keeperAngle)) < 0.14, color: 0x7a5533, postColor: 0x5e4430, height: 1.7, rails: 3 });
    tree(game, batch, cx - 3, cz + 2.5, 4.2, 0x6b8f3a);
    tree(game, batch, cx + 3.5, cz + 3, 3.6, 0x5d8a34);
    for (const [dx, dz, s] of [[-4.5, -1.5, 1.1], [-1, -5, 0.8], [5.5, 0.5, 0.9]]) boulder(game, batch, cx + dx, cz + dz, s, 0xb3a184);
    // feeding trough
    const tx = cx - 1, tz = cz - 2, ty = heightAt(tx, tz);
    batch.add(new THREE.BoxGeometry(2.2, 0.5, 0.7), 0x6b4a2e, { pos: [tx, ty + 0.25, tz] });
    batch.add(new THREE.BoxGeometry(2.0, 0.08, 0.5), 0xe2c45a, { pos: [tx, ty + 0.48, tz] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(1.1, 0.25, 0.35)), tx, ty + 0.25, tz);
  }

  // ---------- Gorilla Forest ----------
  {
    const { x: cx, z: cz, r } = GORILLA;
    const SIDES = 4, ROT = Math.PI / 4; // a square glass house, like the monkeys'
    disc(game, cx, cz, r - 0.1, 0x4f7a34, 0.03, {}, SIDES, ROT);
    const gateHalf = 0.12, H = 3.2;
    ring(cx, cz, r, 2.4, (a) => Math.abs(angleDiff(a, GORILLA.keeperAngle)) < gateHalf, (s) => {
      batch.add(new THREE.BoxGeometry(0.5, 0.6, s.L + 0.05), 0x8f8a80, { pos: [s.mx, s.y + 0.27, s.mz], rot: [0, s.yaw, 0] });
      batch.add(new THREE.BoxGeometry(0.16, H + 0.7, 0.16), 0x2f3336, { pos: [s.x0, s.y + (H + 0.7) / 2, s.z0] });
      batch.add(new THREE.BoxGeometry(0.14, 0.14, s.L + 0.1), 0x2f3336, { pos: [s.mx, s.y + H + 0.62, s.mz], rot: [0, s.yaw, 0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.25, 0.3, s.L / 2)), s.mx, s.y + 0.27, s.mz, s.yaw);
      game.glass.add(s.mx, s.y + 0.58 + H / 2, s.mz, s.L - 0.08, H, s.yaw, { colliderThick: 0.2 });
    }, SIDES, ROT);
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
      const a = i * 2.4, d = 1.5 + (i * 0.37) % (r * 0.7 - 2);
      batch.add(new THREE.ConeGeometry(0.35, 0.7, 5), i % 2 ? 0x3f7a2e : 0x5c8a35, { pos: [cx + Math.cos(a) * d, heightAt(cx, cz) + 0.3, cz + Math.sin(a) * d] });
    }
  }

  // ---------- Lion's Den ----------
  {
    const { x: cx, z: cz, r } = DEN;
    const SIDES = 5, ROT = DEN.viewAngle; // a pentagon with one corner pointing at the path
    disc(game, cx, cz, r - 0.1, 0xc9a86a, 0.03, {}, SIDES, ROT + Math.PI / SIDES);
    const H = 3.0;
    ring(cx, cz, r, 2.2, (a) => Math.abs(angleDiff(a, DEN.keeperAngle)) < 0.13, (s) => {
      const facing = Math.abs(angleDiff(s.mid, DEN.viewAngle)) < 0.8;
      // stone footing all round
      batch.add(new THREE.BoxGeometry(0.6, 0.7, s.L + 0.1), 0x9a8f7e, { pos: [s.mx, s.y + 0.3, s.mz], rot: [0, s.yaw, 0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.3, 0.35, s.L / 2)), s.mx, s.y + 0.3, s.mz, s.yaw);
      if (facing) {
        // glass on the visitor side, dark steel frame
        batch.add(new THREE.BoxGeometry(0.18, H + 0.7, 0.18), 0x2f3336, { pos: [s.x0, s.y + (H + 0.7) / 2, s.z0] });
        batch.add(new THREE.BoxGeometry(0.16, 0.16, s.L + 0.1), 0x2f3336, { pos: [s.mx, s.y + H + 0.62, s.mz], rot: [0, s.yaw, 0] });
        game.glass.add(s.mx, s.y + 0.66 + H / 2, s.mz, s.L - 0.1, H, s.yaw, { colliderThick: 0.2 });
      } else {
        // tall rough rock wall
        const n = Math.max(1, Math.round(s.L / 1.1));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t, h = 3.4 + Math.sin(i * 1.7 + s.a0 * 5) * 0.4;
          batch.add(new THREE.IcosahedronGeometry(0.85, 0), i % 2 ? 0x8f8578 : 0x9d9284, { pos: [x, heightAt(x, z) + h * 0.45, z], scale: [0.9, h / 1.6, 0.8], rot: [0, i * 1.3, 0.1] });
        }
        staticBody(game, new CANNON.Box(new CANNON.Vec3(0.45, 1.9, s.L / 2)), s.mx, s.y + 1.9, s.mz, s.yaw);
      }
    }, SIDES, ROT + Math.PI / SIDES);
    // the cave: a ring of big rocks with a dark mouth, at the back of the den
    const back = DEN.viewAngle + Math.PI;
    const kx = cx + Math.cos(back) * r * 0.42, kz = cz + Math.sin(back) * r * 0.42, ky = heightAt(kx, kz);
    const caveYaw = Math.atan2(cx - kx, cz - kz);
    for (let i = 0; i < 7; i++) {
      const a = caveYaw + Math.PI * 0.35 + (i / 6) * Math.PI * 1.3;
      const rx = kx + Math.sin(a) * 1.9, rz = kz + Math.cos(a) * 1.9;
      batch.add(new THREE.IcosahedronGeometry(1.15, 0), i % 2 ? 0x8a8174 : 0x958b7d, { pos: [rx, ky + 0.8, rz], scale: [1, 1.2, 1], rot: [0, i, 0] });
      staticBody(game, new CANNON.Sphere(1.0), rx, ky + 0.8, rz);
    }
    batch.add(new THREE.IcosahedronGeometry(2.3, 0), 0x8f8578, { pos: [kx - Math.sin(caveYaw) * 0.6, ky + 2.0, kz - Math.cos(caveYaw) * 0.6], scale: [1.2, 0.55, 1.1] }); // roof slab
    staticBody(game, new CANNON.Box(new CANNON.Vec3(2.2, 0.5, 2.2)), kx - Math.sin(caveYaw) * 0.6, ky + 2.1, kz - Math.cos(caveYaw) * 0.6, caveYaw);
    batch.add(new THREE.CircleGeometry(1.6, 10), 0x2a241d, { pos: [kx, ky + 0.05, kz], rot: [-Math.PI / 2, 0, 0] }); // shadowy floor
    // pride rock: a big flat-topped rock to lounge on
    const px = cx + Math.cos(DEN.viewAngle + 1.4) * r * 0.35, pz = cz + Math.sin(DEN.viewAngle + 1.4) * r * 0.35, py = heightAt(px, pz);
    batch.add(new THREE.CylinderGeometry(1.9, 2.4, 1.2, 7), 0xa39886, { pos: [px, py + 0.6, pz] });
    batch.add(new THREE.CylinderGeometry(1.7, 1.9, 0.12, 7), 0xb3a893, { pos: [px, py + 1.22, pz] });
    staticBody(game, new CANNON.Cylinder(2.1, 2.3, 1.25, 7), px, py + 0.62, pz);
    // a shade tree and a fallen log to scratch
    tree(game, batch, cx + Math.cos(DEN.viewAngle - 1.5) * r * 0.45, cz + Math.sin(DEN.viewAngle - 1.5) * r * 0.45, 4.6, 0x6b8f3a);
    const lx = cx + Math.cos(DEN.viewAngle - 0.4) * r * 0.25, lz = cz + Math.sin(DEN.viewAngle - 0.4) * r * 0.25;
    batch.add(new THREE.CylinderGeometry(0.3, 0.34, 2.8, 7), 0x6b5038, { pos: [lx, heightAt(lx, lz) + 0.3, lz], rot: [0, 0.7, Math.PI / 2] });
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39, d = 1.2 + (i * 0.53) % (r * 0.75);
      batch.add(new THREE.ConeGeometry(0.22, 0.6, 4), i % 2 ? 0xc2a35a : 0xb39448, { pos: [cx + Math.cos(a) * d, heightAt(cx, cz) + 0.25, cz + Math.sin(a) * d] }); // dry grass tufts
    }
  }

  batch.build(game.scene);
  return { pools };
}
