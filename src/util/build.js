import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, MASK } from '../physics.js';
import { hash3 } from './math.js';

// Shared flat-shaded materials, cached by color + options.
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts }));
  }
  return matCache.get(key);
}

export function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export const BLOCKER = { blocker: true }; // stops interaction raycasts (walls, desks...)

export function staticBody(game, shape, x, y, z, yaw = 0, offset) {
  const b = new CANNON.Body({ mass: 0, material: game.mats.ground, collisionFilterGroup: G.STATIC, collisionFilterMask: MASK.STATIC });
  b.addShape(shape, offset);
  b.position.set(x, y, z);
  if (yaw) b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
  game.world.addBody(b);
  return b;
}

// A box that is visible and solid. Registers itself as an interaction blocker.
export function solidBox(game, { size, pos, yaw = 0, color = 0xffffff, material, collide = true, cast = true, block = true }) {
  const [w, h, d] = size;
  const m = mesh(new THREE.BoxGeometry(w, h, d), material || mat(color), { cast });
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.y = yaw;
  game.scene.add(m);
  if (collide) staticBody(game, new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), pos[0], pos[1], pos[2], yaw);
  if (block) { m.userData.entity = BLOCKER; game.pickables.push(m); }
  return m;
}

// Collect lots of small static pieces into a single vertex-colored mesh (one draw call).
export class StaticBatch {
  constructor() { this.geos = []; this.dummy = new THREE.Object3D(); }

  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], lookAt = null, matrix = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!matrix) {
      const d = this.dummy;
      d.position.set(pos[0], pos[1], pos[2]);
      d.rotation.set(rot[0], rot[1], rot[2]);
      d.scale.set(scale[0], scale[1], scale[2]);
      if (lookAt) d.lookAt(lookAt[0], lookAt[1], lookAt[2]);
      d.updateMatrix();
      matrix = d.matrix;
    }
    g.applyMatrix4(matrix);
    paint(g, color);
    this.geos.push(g);
  }

  build(scene, { cast = true, receive = true, ...matOpts } = {}) {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos);
    merged.computeVertexNormals();
    const m = mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, ...matOpts }), { cast, receive });
    scene.add(m);
    return m;
  }
}

// Give a geometry a solid vertex color.
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Prepare a primitive for merging: non-indexed, no uv, vertex-colored, optional organic jitter.
export function prep(geo, color, { jitter = 0, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (jitter) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i,
        x + (hash3(x, y, z) - 0.5) * jitter,
        y + (hash3(y, z, x) - 0.5) * jitter,
        z + (hash3(z, x, y) - 0.5) * jitter);
    }
  }
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  return paint(g, color);
}

export function merge(geos) {
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  return g;
}
