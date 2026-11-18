import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { smoothstep, hash2, lerp } from '../util/math.js';
import { FLATTEN, POND, PLAZA, HIPPO, LION, MONKEY, HIPPO_ISLAND, pathDist, inMonkeyHouse } from './layout.js';

export const TERRAIN_SIZE = 280;
export const TERRAIN_SEGS = 200;

const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));

// The raw land: a broad hilltop with rolling humps and dips across the zoo grounds,
// falling away into a valley. Lion side sits up high, hippo side dips down.
export function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = 22 * Math.exp(-(r * r) / (2 * 62 * 62));
  // rolling humps inside the grounds
  h += Math.sin(x * 0.065 + 1.3) * Math.cos(z * 0.058 - 0.7) * 2.6;
  h += Math.sin(x * 0.12 + z * 0.09) * 0.7 + Math.cos(z * 0.14 - x * 0.06) * 0.55;
  h += 4.2 * gauss(x, z, LION.x - 4, LION.z - 6, 16); // lion hill
  h += 2.4 * gauss(x, z, MONKEY.x, MONKEY.z - 6, 14); // monkey crest
  h -= 3.2 * gauss(x, z, HIPPO.x + 6, HIPPO.z + 6, 15); // low swampy side
  h += 2.2 * gauss(x, z, 22, 30, 9) - 1.6 * gauss(x, z, -26, 36, 10); // a knoll and a hollow down south
  // big valley swells beyond the fence
  h += Math.sin(x * 0.021 - 0.4) * Math.sin(z * 0.018 + 2.1) * 7 * smoothstep(52, 110, r);
  // fade at the map edge so the distant ground plane meets it seamlessly
  const edge = Math.max(Math.abs(x), Math.abs(z));
  return lerp(h, -0.2, smoothstep(112, 138, edge));
}

let zones = null;
function flattenZones() {
  if (!zones) {
    zones = FLATTEN.map((f) => ({ ...f, h: baseHeight(f.x, f.z) }));
    // raise the gate forecourt part-way toward the plaza so the entrance road isn't a cliff
    zones[2].h = lerp(zones[2].h, zones[1].h, 0.4);
    zones[5].h = zones[2].h - 0.3; // truck bay sits level with the forecourt
  }
  return zones;
}
const hippoRim = () => flattenZones()[3].h;

export function pondWaterY() {
  return hippoRim() - HIPPO.depth + 2.05; // higher water: hippos sit closer to the viewing deck
}

// How far below the rim the hippo pit is at (x, z). Steep wall on the visitor deck side,
// a long muddy beach on the far side that keepers can walk down.
function hippoDig(x, z) {
  const dx = x - POND.x, dz = z - POND.z;
  const d = Math.hypot(dx, dz);
  if (d > HIPPO.r + 0.5) return 0;
  const s = Math.cos(Math.atan2(dz, dx) - HIPPO.deckAngle); // 1 = deck side, -1 = beach side
  const inner = lerp(HIPPO.waterR - 3.4, HIPPO.r - 2.4, (s + 1) / 2);
  const outer = HIPPO.r - 0.6;
  let dig = HIPPO.depth * (1 - smoothstep(inner, outer, d));
  // lumpy mud bottom and a little island to haul out on
  dig += Math.sin(x * 0.9) * Math.cos(z * 1.1) * 0.18 * (1 - smoothstep(inner, outer, d));
  // the island: a flat-topped mud mound poking ~0.35 m out of the water
  const isl = 1 - smoothstep(HIPPO_ISLAND.r * 0.65, HIPPO_ISLAND.r * 1.25, Math.hypot(x - HIPPO_ISLAND.x, z - HIPPO_ISLAND.z));
  dig = lerp(dig, HIPPO.depth - 2.05 - 0.35 + Math.sin(x * 2.1 + z) * 0.05, isl);
  return dig;
}

// The entrance road from the gate up to the plaza is graded into one long, even ramp (the raw
// hillside there was a ~35 degree drop), fading back into the natural slope either side.
function roadGrade(x, z, h) {
  const z0 = PLAZA.z + PLAZA.r + 1, z1 = 45; // plaza edge -> gate forecourt
  if (z < z0 - 6 || z > z1 + 6) return h;
  const zs = flattenZones();
  const hp = zs[1].h, hg = zs[2].h;
  const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  const target = lerp(hp, hg, t);
  const w = (1 - smoothstep(7, 16, Math.abs(x))) * (1 - smoothstep(z1, z1 + 6, z)) * (1 - smoothstep(z0, z0 - 6, z));
  return lerp(h, target, w);
}

export function heightAt(x, z) {
  let h = roadGrade(x, z, baseHeight(x, z));
  for (const f of flattenZones()) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.blend) h = lerp(h, f.h, 1 - smoothstep(f.r, f.r + f.blend, d));
  }
  // lion savanna: a rocky rise in the back half for the outcrop
  h += 1.8 * gauss(x, z, LION.x - 3.5, LION.z - 3, 4.5);
  h -= hippoDig(x, z);
  // monkey house floor: little bumps for the jungle bed
  if (inMonkeyHouse(x, z, -0.6)) h += 0.25 * Math.sin(x * 0.7) * Math.sin(z * 0.8) + 0.2;
  return h;
}

const C = (hex) => new THREE.Color(hex);
const GRASS = [C(0x8aa553), C(0x82a04d), C(0x91ab58), C(0x7d9a4a)];
const GRASS_DARK = C(0x5f7f3c);
const GRASS_DRY = C(0xb5ab6a);
const PATH = [C(0xcdb994), C(0xc4ae88), C(0xd3c19e)];
const ROCK = C(0x8a8579);
const MUD = C(0x5d4a35), MUD_WET = C(0x3f3426), ALGAE = C(0x55683a);
const SAVANNA = C(0xc8b07a), SAVANNA_DRY = C(0xd6c08a);
const SOIL = C(0x5a4630), MOSS = C(0x56733a);
const PLAZA_A = C(0xd2c7ae), PLAZA_B = C(0xc3b699);

function faceColor(x, y, z, ny, out, waterY) {
  const n = hash2(Math.floor(x * 0.25), Math.floor(z * 0.25)); // big soft patches
  out.copy(GRASS[Math.floor(hash2(x * 1.3, z * 1.7) * GRASS.length)]);
  out.lerp(GRASS_DARK, smoothstep(12, 0, y) * 0.45);
  out.lerp(GRASS_DRY, smoothstep(0.55, 0.95, n) * 0.35);

  // hippo pit: mud that gets wetter toward the water, algae at the waterline
  const hd = Math.hypot(x - POND.x, z - POND.z);
  if (hd < HIPPO.r) {
    const below = hippoRim() - y;
    if (below > 0.35) {
      out.copy(MUD).lerp(MUD_WET, smoothstep(waterY + 1.2, waterY, y));
      if (Math.abs(y - waterY) < 0.35) out.lerp(ALGAE, 0.6);
      out.lerp(C(0x6e5a40), hash2(x * 3.1, z * 2.9) * 0.25);
    } else out.lerp(ALGAE, 0.25);
  }
  // lion savanna
  if (Math.hypot(x - LION.x, z - LION.z) < LION.r + 0.4) {
    out.copy(SAVANNA).lerp(SAVANNA_DRY, hash2(x * 2.1, z * 2.3) * 0.6);
    out.lerp(GRASS_DRY, smoothstep(0.3, 0.8, n) * 0.4);
  }
  // monkey house: dark jungle soil with mossy patches
  if (inMonkeyHouse(x, z, 0.2)) {
    out.copy(SOIL).lerp(MOSS, smoothstep(0.3, 0.7, hash2(x * 0.6, z * 0.6)));
  }

  if (ny < 0.8) out.lerp(ROCK, smoothstep(0.8, 0.62, ny) * (hd < HIPPO.r ? 0.4 : 0.9));

  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) {
    out.copy((Math.floor(x / 1.6) + Math.floor(z / 1.6)) % 2 ? PLAZA_A : PLAZA_B);
  } else if (pathDist(x, z) < 0) {
    out.copy(PATH[Math.floor(hash2(x * 3.1, z * 2.7) * PATH.length)]);
  }
}

export function buildTerrain(game) {
  const { scene, world, mats } = game;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));

  // Non-indexed so every triangle gets its own flat normal and color (the low-poly look).
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const waterY = pondWaterY();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    faceColor(cx, cy, cz, nor.getY(i), col, waterY);
    for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  // Ground plane that continues past the map edge to the mountains.
  const far = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshStandardMaterial({ color: 0x6f8c48, roughness: 1 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.35;
  far.receiveShadow = true;
  scene.add(far);

  // Physics heightfield (same height function as the mesh).
  const n = TERRAIN_SEGS + 1;
  const es = TERRAIN_SIZE / TERRAIN_SEGS;
  const data = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(heightAt(-TERRAIN_SIZE / 2 + i * es, TERRAIN_SIZE / 2 - j * es));
    data.push(row);
  }
  const body = new CANNON.Body({ mass: 0, material: mats.ground, collisionFilterGroup: G.STATIC, collisionFilterMask: MASK.STATIC });
  body.addShape(new CANNON.Heightfield(data, { elementSize: es }));
  body.position.set(-TERRAIN_SIZE / 2, 0, TERRAIN_SIZE / 2);
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(body);

  // Murky swamp water in the hippo pit.
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(HIPPO.r - 1, 40),
    new THREE.MeshStandardMaterial({ color: 0x4d6a3e, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.9, flatShading: true }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, waterY, POND.z);
  water.receiveShadow = true;
  scene.add(water);

  return {
    update(t) { water.position.y = waterY + Math.sin(t * 0.9) * 0.015; },
  };
}
