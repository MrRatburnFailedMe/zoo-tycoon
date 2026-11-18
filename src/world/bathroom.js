import * as THREE from 'three';
import { solidBox, mat, mesh } from '../util/build.js';
import { heightAt, pondWaterY } from './terrain.js';
import { BATHROOM, OFFICE, POND, HIPPO, PENGUIN } from './layout.js';
import { placeProp } from './props.js';
import { canvasTexture } from '../util/textures.js';
import { sfx } from '../audio.js';

// The park toilets: a small tiled block east of the entrance road, door on the west side.
// Two stalls (Pat Siefring's toilets, Quaternius paper holders and a spare stack), a row of
// Quaternius sinks with Poly soap dispensers. Click a toilet to flush, a sink to run the tap.
// Also places the odd prop around the park: power boxes and wooden docks.

const H = 2.8, T = 0.15;

function tileTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#e9eef1';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9c4ca';
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
}

export function buildBathroom(game) {
  const { scene } = game;
  const { x: cx, z: cz, w, d } = BATHROOM;
  const fy = heightAt(cx, cz) + 0.15;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const WALL = 0xd8e3e8, TRIM = 0x3f78c2;

  // floor slab and tiled floor
  solidBox(game, { size: [w + 0.4, 0.5, d + 0.4], pos: [cx, fy - 0.25, cz], color: 0xa59f94 });
  const tiles = tileTexture();
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(w / 1.2, d / 1.2);
  const floor = mesh(new THREE.PlaneGeometry(w - 0.1, d - 0.1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35 }), { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, fy + 0.005, cz);
  scene.add(floor);

  // walls: door gap in the middle of the west wall
  solidBox(game, { size: [w, H, T], pos: [cx, fy + H / 2, z0], color: WALL });
  solidBox(game, { size: [w, H, T], pos: [cx, fy + H / 2, z1], color: WALL });
  solidBox(game, { size: [T, H, d], pos: [x1, fy + H / 2, cz], color: WALL });
  const door = 1.3, side = (d - door) / 2;
  for (const s of [-1, 1]) solidBox(game, { size: [T, H, side], pos: [x0, fy + H / 2, cz + s * (door / 2 + side / 2)], color: WALL });
  solidBox(game, { size: [T, H - 2.3, door], pos: [x0, fy + 2.3 + (H - 2.3) / 2, cz], color: WALL });
  // blue trim band outside, roof with overhang, a vent
  for (const [sx, sz, px, pz] of [[w + 0.02, 0.18, cx, z0 - 0.01], [w + 0.02, 0.18, cx, z1 + 0.01], [0.18, d + 0.02, x1 + 0.01, cz]]) solidBox(game, { size: [sx, 0.25, sz], pos: [px, fy + 1.2, pz], color: TRIM, collide: false });
  solidBox(game, { size: [w + 0.8, 0.22, d + 0.8], pos: [cx, fy + H + 0.11, cz], color: 0x4b5560 });
  solidBox(game, { size: [0.6, 0.25, 0.6], pos: [cx + 1, fy + H + 0.35, cz], color: 0x9aa3a8, collide: false });
  // a little lamp
  const lamp = new THREE.PointLight(0xfff1d6, 7, 8, 1.6);
  lamp.position.set(cx, fy + H - 0.4, cz);
  scene.add(lamp);
  const panel = mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), mat(0xffffff, { emissive: 0xfff2d0, emissiveIntensity: 2 }), { cast: false });
  panel.position.set(cx, fy + H - 0.02, cz);
  scene.add(panel);

  // two stalls against the east wall, doors open toward the room
  const stallW = 1.25, stallD = 1.5;
  for (let i = 0; i < 2; i++) {
    const sz = z0 + 0.3 + stallW / 2 + i * (stallW + 0.05);
    const sxw = x1 - stallD; // stall front
    // partitions
    for (const e of [-1, 1]) solidBox(game, { size: [stallD, 1.9, 0.05], pos: [x1 - stallD / 2, fy + 0.15 + 0.95, sz + e * stallW / 2], color: 0x5d8fc0 });
    // half-open door
    const dr = mesh(new THREE.BoxGeometry(0.04, 1.8, stallW * 0.85), mat(0x5d8fc0));
    dr.position.set(sxw - 0.35, fy + 1.05, sz - stallW / 2 + 0.35);
    dr.rotation.y = 0.9;
    scene.add(dr);
    const toiletEntity = { label: 'Toilet', interactLabel: 'Flush', interact: () => { sfx.splash?.(0.6); sfx.flush?.(); } };
    placeProp(game, 'assets/toilet.glb', { x: x1 - 0.42, y: fy, z: sz, yaw: -Math.PI / 2, height: 0.78, entity: toiletEntity });
    placeProp(game, 'assets/toiletpaper.glb', { x: x1 - 0.95, y: fy + 0.55, z: sz + stallW / 2 - 0.08, yaw: Math.PI, size: 0.24, collide: false });
  }
  placeProp(game, 'assets/tpstack.glb', { x: x1 - 0.35, y: fy, z: z1 - 0.35, size: 0.42, collide: false });

  // sinks along the north wall, soap above each
  for (let i = 0; i < 2; i++) {
    const sx = x0 + 1.2 + i * 1.1;
    const sinkEntity = { label: 'Sink', interactLabel: 'Wash hands', interact: () => sfx.splash?.(0.3) };
    placeProp(game, 'assets/sink.glb', { x: sx, y: fy, z: z0 + 0.32, yaw: 0, height: 0.92, entity: sinkEntity, collide: true });
    placeProp(game, 'assets/soap.glb', { x: sx + 0.32, y: fy + 1.15, z: z0 + 0.14, size: 0.22, collide: false });
    const mirror = mesh(new THREE.PlaneGeometry(0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0xbfd9e6, metalness: 0.2, roughness: 0.15, emissive: 0x3a4a52, emissiveIntensity: 0.6 }), { cast: false });
    mirror.position.set(sx, fy + 1.55, z0 + T / 2 + 0.02);
    scene.add(mirror);
  }
  // power boxes on the outside walls of the toilets and the office
  placeProp(game, 'assets/powerbox.glb', { x: x1 + 0.3, y: fy, z: z1 - 0.6, yaw: Math.PI / 2, height: 1.3 });
  placeProp(game, 'assets/powerbox.glb', { x: OFFICE.x - OFFICE.w / 2 - 0.35, y: heightAt(OFFICE.x - OFFICE.w / 2 - 0.35, OFFICE.z + 2) + 0.05, z: OFFICE.z + 2, yaw: -Math.PI / 2, height: 1.3 });

  // wooden docks: a keeper jetty into the hippo pond (beach side) and one into the penguin pool
  {
    const wy = pondWaterY(), a = HIPPO.keeperAngle;
    const r = POND.r - 1.2, x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    placeProp(game, 'assets/dock.glb', { x, y: wy - 0.75, z, yaw: Math.atan2(Math.cos(a), Math.sin(a)), size: 3.4 });
  }
  {
    const pool = game.habitats?.pools?.[0];
    if (pool) {
      const x = pool.x + pool.r * 0.6, z = pool.z, y = heightAt(PENGUIN.x, PENGUIN.z) - 0.35;
      placeProp(game, 'assets/dock.glb', { x, y, z, yaw: Math.PI / 2, size: 1.7 });
    }
  }
}
