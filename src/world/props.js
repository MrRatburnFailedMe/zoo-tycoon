import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { loadGLB } from '../util/glb.js';
import { staticBody } from '../util/build.js';

// Small helpers for dropping Poly Pizza models into the world. Each model loads once and is
// cloned; materials are rebuilt as flat-shaded standard materials so they match the game's look.

const cache = new Map();
function load(url) {
  if (!cache.has(url)) cache.set(url, loadGLB(url).then((g) => g.scene).catch(() => null));
  return cache.get(url);
}

// A copy of the model, normalised: centred on X/Z, sitting on y = 0, scaled so its height (or its
// longest side, with `size`) matches, then turned by `yaw`. `recolor(mat, i)` may return a colour.
export async function modelCopy(url, { height, size, yaw = 0, recolor, rough = 0.7 } = {}) {
  const src = await load(url);
  if (!src) return null;
  const m = src.clone(true);
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((mt, i) => {
      const col = recolor?.(mt, i) ?? mt.color?.clone() ?? new THREE.Color(0xffffff);
      return new THREE.MeshStandardMaterial({ color: col, map: mt.map || null, roughness: rough, metalness: 0.1, flatShading: true });
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  const holder = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.y = yaw;
  turn.add(m);
  holder.add(turn);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(turn), s = bb.getSize(new THREE.Vector3());
  const k = size ? size / Math.max(s.x, s.y, s.z) : height ? height / s.y : 1;
  turn.scale.setScalar(k);
  turn.position.set(-((bb.min.x + bb.max.x) / 2) * k, -bb.min.y * k, -((bb.min.z + bb.max.z) / 2) * k);
  holder.userData.size = s.multiplyScalar(k);
  return holder;
}

// Put a static prop in the world, optionally with a box collider of its size.
export async function placeProp(game, url, { x, y, z, yaw = 0, collide = true, entity, ...opts }) {
  const m = await modelCopy(url, opts);
  if (!m) return null;
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  game.scene.add(m);
  if (collide) {
    const s = m.userData.size;
    staticBody(game, new CANNON.Box(new CANNON.Vec3(s.x / 2, s.y / 2, s.z / 2)), x, y + s.y / 2, z, yaw);
  }
  if (entity) { m.traverse((o) => (o.userData.entity = entity)); game.pickables.push(m); }
  return m;
}

// For item builders (which must return synchronously): an empty group the model fills in when loaded.
export function modelInto(group, url, opts) {
  modelCopy(url, opts).then((m) => { if (m) { m.position.y = opts.dy ?? 0; group.add(m); } });
  return group;
}
