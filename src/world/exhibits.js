import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch, staticBody, prep, merge, paint, mat, mesh } from '../util/build.js';
import { mulberry32, angleDiff } from '../util/math.js';
import { G, MASK } from '../physics.js';
import { heightAt, pondWaterY } from './terrain.js';
import { HIPPO, POND, MONKEY, LION, PLAZA } from './layout.js';
import { signBoard } from './zoo.js';
import { pineTier, rockGeo, scatter, leafMat, swayMaterial } from './nature.js';

// The three animal exhibits. No animals yet: just their homes.
// Hippo Swamp (pit with murky water), Monkey House (glass box jungle), Lion's Den (savanna + tall fence).

const UP = new THREE.Vector3(0, 1, 0);
import { glassMat } from './glass.js';

// Walk a circle in roughly segLen chunks, skipping any segment whose middle angle `skip` rejects.
function ring(cx, cz, r, segLen, skip, fn) {
  const n = Math.ceil((2 * Math.PI * r) / segLen);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (skip && skip((a0 + a1) / 2)) continue;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    fn({ a0, a1, x0, z0, x1, z1, y0: heightAt(x0, z0), y1: heightAt(x1, z1), L: Math.hypot(x1 - x0, z1 - z0), yaw: Math.atan2(x1 - x0, z1 - z0), mx: (x0 + x1) / 2, mz: (z0 + z1) / 2 });
  }
}

// Box between two ground points (a wall/rail segment), into a batch, with optional collider.
function segBox(game, batch, s, { h, t, color, lift = 0, collide = true }) {
  const y = Math.min(s.y0, s.y1);
  batch.add(new THREE.BoxGeometry(t, h, s.L + 0.04), color, { pos: [s.mx, y + lift + h / 2 - 0.1, s.mz], rot: [0, s.yaw, 0] });
  if (collide) staticBody(game, new CANNON.Box(new CANNON.Vec3(t / 2, h / 2 + 0.1, s.L / 2)), s.mx, y + lift + h / 2 - 0.1, s.mz, s.yaw);
}

// Hanging rope / vine as a tube along a sagging curve between two points.
function sagTube(batch, a, b, sag, radius, color, seg = 12) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  batch.add(new THREE.TubeGeometry(curve, seg, radius, 4, false), color);
  return curve;
}

function chainLinkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#3c463f';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(64, 64);
  g.moveTo(64, 0); g.lineTo(0, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Soft round blob texture for mist.
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function quadXY(w, h, uvW, uvH) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvW, uv.getY(i) * uvH);
  return g;
}

export function buildExhibits(game) {
  const batch = new StaticBatch();
  const glass = [];
  const updaters = [];
  const rand = mulberry32(4242);
  const placements = { rock: [], fern: [], reed: [], cattail: [], lily: [], acacia: [], willow: [] };

  buildHippo(game, batch, rand, placements, updaters);
  buildMonkey(game, batch, glass, rand, placements, updaters);
  buildLion(game, batch, glass, rand, placements);

  batch.build(game.scene);
  if (glass.length) {
    const g = new THREE.Mesh(mergeGeometries(glass), glassMat);
    g.renderOrder = 2;
    game.scene.add(g);
  }

  // Shared instanced dressing.
  scatter(game, rockGeo(), placements.rock, { collider: (pl) => { if (pl.s > 0.45) staticBody(game, new CANNON.Sphere(pl.s * 0.8), pl.x, pl.y + 0.1, pl.z); } });
  scatter(game, merge([pineTier(0.55, 0.9, 0.5, 0x4c7a34, 7, 0.3), pineTier(0.75, 0.6, 0.45, 0x5d8c3c, 6, 0.3)]), placements.fern);
  scatter(game, reedGeo(rand), placements.reed, { material: swayMaterial(game, 0.5) });
  scatter(game, prep(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 5), 0x5a3a22, { pos: [0, 1.75, 0] }), placements.cattail);
  scatter(game, acaciaTree(), placements.acacia, { collider: (pl) => staticBody(game, new CANNON.Cylinder(0.25 * pl.s, 0.3 * pl.s, 3 * pl.s, 6), pl.x, pl.y + 1.5 * pl.s, pl.z) });
  scatter(game, willowTree(), placements.willow, { collider: (pl) => staticBody(game, new CANNON.Cylinder(0.35 * pl.s, 0.4 * pl.s, 3 * pl.s, 6), pl.x, pl.y + 1.5 * pl.s, pl.z) });
  const lilies = scatter(game, lilyGeo(), placements.lily);
  if (lilies) { lilies.castShadow = false; }

  return { update(t, dt) { for (const u of updaters) u(t, dt); } };
}

// ============================ HIPPO SWAMP ============================
function buildHippo(game, batch, rand, P, updaters) {
  const { x: cx, z: cz } = POND;
  const R = HIPPO.r - 0.2;
  const rimY = heightAt(cx + R, cz);
  const waterY = pondWaterY();
  const deckHalf = 3.7 / (HIPPO.r - 0.2), gateHalf = 0.12;
  const STONE = 0x948d7e, CAP = 0xb3ab99, WOOD = 0x7a5a3c, WOOD_DARK = 0x5e4430;

  // Low mossy stone wall around the rim, open where the deck and keeper gate are.
  ring(cx, cz, R, 2.2, (a) => Math.abs(angleDiff(a, HIPPO.deckAngle)) < deckHalf || Math.abs(angleDiff(a, HIPPO.keeperAngle)) < gateHalf, (s) => {
    segBox(game, batch, s, { h: 0.95, t: 0.55, color: STONE });
    batch.add(new THREE.BoxGeometry(0.7, 0.12, s.L + 0.06), CAP, { pos: [s.mx, Math.min(s.y0, s.y1) + 0.9, s.mz], rot: [0, s.yaw, 0] });
    if (rand() < 0.4) batch.add(new THREE.BoxGeometry(0.58, 0.05, s.L * 0.6), 0x5f7a3a, { pos: [s.mx, Math.min(s.y0, s.y1) + 0.98, s.mz], rot: [0, s.yaw, 0] }); // moss
  });
  // Keeper gate: two posts and a rickety wooden gate swung open.
  for (const side of [-1, 1]) {
    const a = HIPPO.keeperAngle + side * gateHalf;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    batch.add(new THREE.BoxGeometry(0.4, 1.5, 0.4), STONE, { pos: [x, rimY + 0.65, z] });
    batch.add(new THREE.BoxGeometry(0.5, 0.1, 0.5), CAP, { pos: [x, rimY + 1.42, z] });
  }
  {
    const a = HIPPO.keeperAngle - gateHalf;
    const hx = cx + Math.cos(a) * R, hz = cz + Math.sin(a) * R;
    const open = a + Math.PI / 2 + 1.2;
    const gx = hx + Math.cos(open) * 0.75, gz = hz + Math.sin(open) * 0.75;
    for (const y of [0.35, 0.95]) batch.add(new THREE.BoxGeometry(0.08, 0.12, 1.5), WOOD, { pos: [gx, rimY + y, gz], rot: [0, Math.atan2(Math.cos(open), Math.sin(open)), 0] });
    batch.add(new THREE.BoxGeometry(0.08, 0.12, 1.7), WOOD, { pos: [gx, rimY + 0.65, gz], rot: [0.62, Math.atan2(Math.cos(open), Math.sin(open)), 0] });
  }

  // Viewing deck cantilevered over the pit.
  {
    const a = HIPPO.deckAngle;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); // outward
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const yaw = Math.atan2(dir.x, dir.z);
    const inR = R - 3.4, outR = R + 1.6, W = 6.4;
    const len = outR - inR, midR = (inR + outR) / 2;
    const deckY = rimY + 0.3;
    const at = (r, s, y = 0) => [cx + dir.x * r + side.x * s, deckY + y, cz + dir.z * r + side.z * s];
    // planks
    for (let i = 0; i < Math.round(W / 0.4); i++) {
      const s = -W / 2 + 0.2 + i * 0.4;
      batch.add(new THREE.BoxGeometry(0.36, 0.1, len), i % 3 ? WOOD : 0x84634a, { pos: at(midR, s), rot: [0, yaw, 0] });
    }
    staticBody(game, new CANNON.Box(new CANNON.Vec3(W / 2, 0.15, len / 2)), ...at(midR, 0, -0.07), yaw);
    // stilts down into the mud
    for (const r of [inR + 0.3, inR + 1.7]) for (const s of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const [x, , z] = at(r, s);
      const gy = heightAt(x, z);
      const h = deckY - gy;
      batch.add(new THREE.CylinderGeometry(0.14, 0.16, h, 6), WOOD_DARK, { pos: [x, gy + h / 2, z] });
      staticBody(game, new CANNON.Cylinder(0.16, 0.16, h, 6), x, gy + h / 2, z);
    }
    // railing on the three pit-facing sides
    const railPost = new THREE.BoxGeometry(0.12, 1.1, 0.12);
    const posts = [];
    for (let k = 0; k <= 6; k++) posts.push([inR, -W / 2 + (k * W) / 6]);
    for (let k = 1; k <= 3; k++) { posts.push([inR + (k * (R - inR)) / 3, -W / 2]); posts.push([inR + (k * (R - inR)) / 3, W / 2]); }
    for (const [r, s] of posts) batch.add(railPost, WOOD_DARK, { pos: at(r, s, 0.6) });
    const rail = (r0, s0, r1, s1, y, t = 0.09) => {
      const A = at(r0, s0, y), B = at(r1, s1, y);
      const L = Math.hypot(B[0] - A[0], B[2] - A[2]);
      batch.add(new THREE.BoxGeometry(t, t, L), WOOD, { pos: [(A[0] + B[0]) / 2, y + deckY, (A[2] + B[2]) / 2], rot: [0, Math.atan2(B[0] - A[0], B[2] - A[2]), 0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.06, 0.6, L / 2)), (A[0] + B[0]) / 2, deckY + 0.6, (A[2] + B[2]) / 2, Math.atan2(B[0] - A[0], B[2] - A[2]));
    };
    for (const y of [1.12, 0.6]) {
      rail(inR, -W / 2, inR, W / 2, y);
      rail(inR, -W / 2, R, -W / 2, y);
      rail(inR, W / 2, R, W / 2, y);
    }
    signBoard(game, HIPPO.name, ...[at(outR + 1.2, W / 2 + 1)[0], at(outR + 1.2, W / 2 + 1)[2]], yaw + Math.PI, { sub: 'they are not as friendly as they look', bg: '#4a5e33' });
  }

  // Lily pads, reeds and cattails along the waterline.
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r = 1 + Math.sqrt(rand()) * (HIPPO.waterR - 1.4);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (heightAt(x, z) > waterY - 0.08) continue;
    P.lily.push({ x, z, y: waterY + 0.025, s: 0.5 + rand() * 0.7, yaw: rand() * 6.28, tint: rand() });
  }
  for (let i = 0; i < 700; i++) {
    const a = rand() * Math.PI * 2, r = HIPPO.waterR - 2.5 + rand() * 4.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < waterY - 0.6 || y > waterY + 0.9) continue;
    const s = 0.7 + rand() * 0.6;
    P.reed.push({ x, z, y: y - 0.05, s, yaw: rand() * 6.28, tint: rand() });
    if (rand() < 0.18) P.cattail.push({ x, z, y: y - 0.05, s, yaw: 0, tint: rand() });
  }
  // Mossy boulders on the mud banks.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, r = HIPPO.waterR - 1 + rand() * 3.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.abs(angleDiff(a, HIPPO.deckAngle)) < 0.35) continue;
    P.rock.push({ x, z, y: heightAt(x, z) - 0.2, s: 0.4 + rand() * 0.9, yaw: rand() * 6.28, tint: rand() * 0.3, solid: true });
  }

  // Dead snag trees standing in the swamp, and a log half-sunk in the water.
  const snag = (x, z, h, lean) => {
    const y = heightAt(x, z) - 0.3;
    batch.add(new THREE.CylinderGeometry(0.12, 0.32, h, 6), 0x6b6255, { pos: [x + lean * h * 0.5, y + h / 2, z], rot: [0, 0, -lean] });
    for (let k = 0; k < 3; k++) {
      const by = y + h * (0.5 + k * 0.15), ba = rand() * 6.28;
      batch.add(new THREE.CylinderGeometry(0.03, 0.07, 1.4, 5), 0x6b6255, { pos: [x + lean * (by - y) + Math.cos(ba) * 0.5, by + 0.35, z + Math.sin(ba) * 0.5], rot: [Math.sin(ba) * 0.9, 0, -Math.cos(ba) * 0.9] });
    }
    staticBody(game, new CANNON.Cylinder(0.3, 0.3, h, 6), x, y + h / 2, z);
  };
  snag(cx + 3.3, cz + 3.2, 4.6, 0.12);
  snag(cx - 2.5, cz - 4.6, 3.4, -0.2);
  {
    const lx = cx + 1.2, lz = cz + 1.4;
    batch.add(new THREE.CylinderGeometry(0.32, 0.36, 4.2, 7), 0x6a5038, { pos: [lx, waterY + 0.05, lz], rot: [Math.PI / 2, 0.6, 0] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.34, 0.3, 2.1)), lx, waterY + 0.05, lz, 0.6);
  }
  // Mud mounds on the beach.
  for (let i = 0; i < 6; i++) {
    const a = HIPPO.keeperAngle + (rand() - 0.5) * 2.2, r = HIPPO.waterR - 0.5 + rand() * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    batch.add(new THREE.SphereGeometry(0.8 + rand() * 0.6, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x4f3e2d, { pos: [x, heightAt(x, z) - 0.15, z], scale: [1.3, 0.35, 1] });
  }

  // Droopy swamp willows around the rim.
  for (const [a, s] of [[-1.2, 1.1], [1.25, 1], [2.3, 0.9], [-2.4, 1.2], [0.75, 0.85]]) {
    const r = R + 2.5 + rand() * 1.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    P.willow.push({ x, z, y: heightAt(x, z) - 0.1, s, yaw: rand() * 6.28, tint: rand(), solid: true });
  }

  // Low mist drifting over the water.
  const mistMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.22, depthWrite: false, color: 0xe6efe6 });
  const mists = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mistMat);
    m.rotation.x = -Math.PI / 2;
    m.userData = { a: rand() * 6.28, r: rand() * 3.5, sp: 0.05 + rand() * 0.06, y: waterY + 0.35 + rand() * 0.5 };
    game.scene.add(m);
    mists.push(m);
  }
  updaters.push((t) => {
    for (const m of mists) {
      const u = m.userData;
      const a = u.a + t * u.sp;
      m.position.set(cx + Math.cos(a) * u.r, u.y + Math.sin(t * 0.4 + u.a) * 0.08, cz + Math.sin(a) * u.r);
      m.rotation.z = a;
    }
  });
}

function reedGeo(rand) {
  const verts = [], cols = [], norms = [];
  for (let i = 0; i < 6; i++) {
    const a = rand() * 6.28, h = 1.3 + rand() * 0.7, w = 0.04, lean = 0.06 + rand() * 0.1;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    verts.push(-px, 0, -pz, px, 0, pz, Math.cos(a) * h * lean, h, Math.sin(a) * h * lean);
    cols.push(0.12, 0.15, 0.05, 0.12, 0.15, 0.05, 0.42, 0.45, 0.18);
    for (let k = 0; k < 3; k++) norms.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  return g;
}

function lilyGeo() {
  // A disc with a notch, plus a pink flower.
  return merge([
    prep(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 9, 1, false, 0.3, Math.PI * 2 - 0.6), 0x5b8a3a),
    prep(new THREE.ConeGeometry(0.09, 0.14, 5), 0xe7a5b8, { pos: [0.12, 0.07, 0.05] }),
  ]);
}

function willowTree() {
  return merge([
    prep(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 7), 0x5a4a38, { pos: [0, 1.7, 0], jitter: 0.08 }),
    prep(new THREE.IcosahedronGeometry(1.6, 0), 0x6b7c43, { pos: [0, 3.9, 0], jitter: 0.4, scale: [1.3, 0.7, 1.3] }),
    pineTier(4.2, 3.1, 2.6, 0x6f8247, 11, 0.75),
    pineTier(3.6, 2.4, 2.2, 0x5f7340, 9, 0.7),
  ]);
}

function acaciaTree() {
  return merge([
    prep(new THREE.CylinderGeometry(0.14, 0.24, 3.2, 5), 0x6a4a2c, { pos: [0.2, 1.6, 0], rot: [0, 0, -0.12] }),
    prep(new THREE.CylinderGeometry(0.08, 0.12, 1.5, 5), 0x6a4a2c, { pos: [-0.35, 3.0, 0], rot: [0, 0, 0.7] }),
    prep(new THREE.CylinderGeometry(2.4, 1.9, 0.5, 9), 0x8c9442, { pos: [0.4, 3.5, 0], jitter: 0.35 }),
    prep(new THREE.CylinderGeometry(1.4, 1.1, 0.42, 8), 0x9aa04b, { pos: [-1.0, 3.6, 0.3], jitter: 0.25 }),
  ]);
}

// ============================ MONKEY HOUSE ============================
function buildMonkey(game, batch, glass, rand, P, updaters) {
  const { x: cx, z: cz, w: W, d: D, h: H } = MONKEY;
  const y0 = heightAt(cx + W / 2 + 1, cz); // flattened floor level outside
  const STEEL = 0x3f4a47, CURB = 0xa9a294, WOOD = 0x7a5a3c, VINE = 0x4b6a2a, ROPE = 0xb59a6a;
  const curbH = 0.6;
  const doorZ = MONKEY.door[1], doorW = 1.8;
  const xs = [], zs = [];
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 4) xs.push(x);
  for (let z = -D / 2; z <= D / 2 + 0.01; z += 4) zs.push(z);

  // Concrete curb with glass on top; each wall listed as (start, end) in local coords.
  const walls = [
    [[-W / 2, -D / 2], [W / 2, -D / 2]],
    [[-W / 2, D / 2], [W / 2, D / 2]],
    [[-W / 2, -D / 2], [-W / 2, D / 2]],
    [[W / 2, -D / 2], [W / 2, doorZ - cz - doorW / 2]],
    [[W / 2, doorZ - cz + doorW / 2], [W / 2, D / 2]],
  ];
  for (const [[ax, az], [bx, bz]] of walls) {
    const L = Math.hypot(bx - ax, bz - az), mx = cx + (ax + bx) / 2, mz = cz + (az + bz) / 2;
    const yaw = Math.atan2(bx - ax, bz - az);
    batch.add(new THREE.BoxGeometry(0.5, curbH, L + 0.5), CURB, { pos: [mx, y0 + curbH / 2 - 0.05, mz], rot: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(0.6, 0.08, L + 0.6), 0xbdb6a6, { pos: [mx, y0 + curbH, mz], rot: [0, yaw, 0] });
    // breakable glass, one pane per ~4 m bay
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.25, curbH / 2, L / 2)), mx, y0 + curbH / 2, mz, yaw);
    const n = Math.max(1, Math.round(L / 4)), pw = L / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      game.glass.add(cx + ax + (bx - ax) * t, y0 + curbH + (H - curbH) / 2, cz + az + (bz - az) * t, pw - 0.02, H - curbH, yaw, { thick: 0.04, colliderThick: 0.25 });
    }
  }
  // Steel frame: posts, top ring, mid rail and the roof lattice.
  const post = new THREE.BoxGeometry(0.2, H, 0.2);
  const putPost = (lx, lz) => batch.add(post, STEEL, { pos: [cx + lx, y0 + H / 2, cz + lz] });
  for (const x of xs) { putPost(x, -D / 2); putPost(x, D / 2); }
  for (const z of zs.slice(1, -1)) { putPost(-W / 2, z); if (Math.abs(cz + z - doorZ) > doorW / 2 + 0.2) putPost(W / 2, z); }
  putPost(W / 2, doorZ - cz - doorW / 2 - 0.1); putPost(W / 2, doorZ - cz + doorW / 2 + 0.1);
  for (const y of [H, H * 0.55]) {
    batch.add(new THREE.BoxGeometry(W + 0.2, 0.18, 0.18), STEEL, { pos: [cx, y0 + y, cz - D / 2] });
    batch.add(new THREE.BoxGeometry(W + 0.2, 0.18, 0.18), STEEL, { pos: [cx, y0 + y, cz + D / 2] });
    batch.add(new THREE.BoxGeometry(0.18, 0.18, D), STEEL, { pos: [cx - W / 2, y0 + y, cz] });
    batch.add(new THREE.BoxGeometry(0.18, 0.18, D), STEEL, { pos: [cx + W / 2, y0 + y, cz] });
  }
  // door frame + header
  batch.add(new THREE.BoxGeometry(0.3, 0.25, doorW + 0.4), STEEL, { pos: [cx + W / 2, y0 + 2.4, doorZ] });
  batch.add(new THREE.BoxGeometry(1.4, 0.2, doorW + 0.4), CURB, { pos: [cx + W / 2 + 0.3, y0 + 0.02, doorZ] });
  {
    const g = new THREE.BoxGeometry(0.04, H - 2.5, doorW);
    g.translate(cx + W / 2, y0 + 2.5 + (H - 2.5) / 2, doorZ);
    glass.push(g.toNonIndexed());
  }
  // roof: a lattice of beams under a glass lid
  for (let x = -W / 2 + 2; x < W / 2; x += 2) batch.add(new THREE.BoxGeometry(0.12, 0.14, D), STEEL, { pos: [cx + x, y0 + H + 0.05, cz] });
  for (let z = -D / 2 + 2; z < D / 2; z += 2) batch.add(new THREE.BoxGeometry(W, 0.1, 0.1), STEEL, { pos: [cx, y0 + H + 0.12, cz + z] });
  {
    const g = new THREE.BoxGeometry(W, 0.04, D);
    g.translate(cx, y0 + H + 0.2, cz);
    glass.push(g.toNonIndexed());
  }

  const gy = (lx, lz) => heightAt(cx + lx, cz + lz);
  const V = (lx, y, lz) => new THREE.Vector3(cx + lx, y, cz + lz);

  // Jungle trees: bendy trunks with broad layered leaf canopies.
  const trees = [[-7.5, -3.2, 5.6], [6.5, -4, 5.9], [-1, 4.2, 5.2], [9.4, 4.4, 5]];
  const canopies = [];
  trees.forEach(([lx, lz, h], i) => {
    const base = gy(lx, lz);
    let px = 0, pz = 0;
    for (let k = 0; k < 3; k++) {
      const seg = h / 3, bend = (rand() - 0.5) * 0.35;
      batch.add(new THREE.CylinderGeometry(0.2 - k * 0.04, 0.32 - k * 0.05, seg + 0.1, 7), 0x6b5038, { pos: [cx + lx + px, base + seg * (k + 0.5), cz + lz + pz], rot: [bend, 0, -bend] });
      px += Math.sin(-bend) * seg * 0.5; pz += Math.sin(bend) * seg * 0.5;
    }
    const top = V(lx + px, base + h, lz + pz);
    canopies.push(top);
    if (i === 3) {
      // palm: long drooping fronds
      batch.add(pineTier(0, 3.2, 1.6, 0x5f8f3a, 7, 0.18), 0x5f8f3a, { pos: [top.x, top.y + 0.6, top.z] });
      batch.add(pineTier(0, 2.4, 1.2, 0x6f9c42, 6, 0.2), 0x6f9c42, { pos: [top.x, top.y + 0.8, top.z], rot: [0, 0.5, 0] });
    } else {
      batch.add(pineTier(0, 3, 0.7, 0x467d36, 8, 0.45), 0x467d36, { pos: [top.x, top.y - 0.2, top.z] });
      batch.add(pineTier(0, 2.2, 0.6, 0x569142, 7, 0.45), 0x569142, { pos: [top.x, top.y + 0.4, top.z], rot: [0, 0.4, 0] });
      batch.add(new THREE.IcosahedronGeometry(1.2, 0), 0x4a8238, { pos: [top.x, top.y + 0.4, top.z], scale: [1.4, 0.6, 1.4] });
    }
    staticBody(game, new CANNON.Cylinder(0.3, 0.3, h, 6), cx + lx + px / 2, base + h / 2, cz + lz + pz / 2);
  });

  // Wooden platforms (one around each of the two big trees, one free-standing on stilts).
  const platforms = [
    { lx: -7.5, lz: -3.2, y: 2.4, w: 3.2, d: 3.2 },
    { lx: 6.5, lz: -4, y: 3.2, w: 3, d: 2.6 },
    { lx: -8.8, lz: 4.2, y: 1.3, w: 2.6, d: 2.4, stilts: true },
  ];
  for (const p of platforms) {
    const base = gy(p.lx, p.lz);
    const py = base + p.y;
    for (let i = 0; i < Math.round(p.w / 0.4); i++) batch.add(new THREE.BoxGeometry(0.36, 0.1, p.d), i % 2 ? WOOD : 0x86664a, { pos: [cx + p.lx - p.w / 2 + 0.2 + i * 0.4, py, cz + p.lz] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(p.w / 2, 0.08, p.d / 2)), cx + p.lx, py, cz + p.lz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + p.lx + sx * (p.w / 2 - 0.15), z = cz + p.lz + sz * (p.d / 2 - 0.15);
      const gyy = heightAt(x, z);
      if (p.stilts) {
        batch.add(new THREE.CylinderGeometry(0.1, 0.12, py - gyy, 6), 0x5e4430, { pos: [x, gyy + (py - gyy) / 2, z] });
        staticBody(game, new CANNON.Cylinder(0.12, 0.12, py - gyy, 6), x, gyy + (py - gyy) / 2, z);
      } else {
        // diagonal braces back to the trunk
        batch.add(new THREE.BoxGeometry(0.08, 0.08, 1.8), 0x5e4430, { pos: [(x + cx + p.lx) / 2, py - 0.6, (z + cz + p.lz) / 2], lookAt: [cx + p.lx, py - 1.3, cz + p.lz] });
      }
    }
  }
  // stump steps up to the low platform
  for (const [lx, lz, h] of [[-6.6, 5.4, 0.5], [-7.2, 6.3, 0.9]]) {
    const b = gy(lx, lz);
    batch.add(new THREE.CylinderGeometry(0.42, 0.48, h, 7), 0x6b5038, { pos: [cx + lx, b + h / 2, cz + lz] });
    staticBody(game, new CANNON.Cylinder(0.45, 0.45, h, 7), cx + lx, b + h / 2, cz + lz);
  }

  // Rope bridge between the two tree platforms: sagging planks you can actually walk.
  {
    const A = V(-7.5 + 1.6, gy(-7.5, -3.2) + 2.4, -3.2), B = V(6.5 - 1.5, gy(6.5, -4) + 3.2, -4);
    const n = 22;
    const dir = B.clone().sub(A);
    const yaw = Math.atan2(dir.x, dir.z);
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize().multiplyScalar(0.55);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = A.clone().lerp(B, t);
      p.y -= Math.sin(t * Math.PI) * 0.9;
      batch.add(new THREE.BoxGeometry(1.1, 0.06, 0.32), i % 2 ? WOOD : 0x86664a, { pos: [p.x, p.y, p.z], rot: [0, yaw, 0] });
      staticBody(game, new CANNON.Box(new CANNON.Vec3(0.55, 0.05, 0.3)), p.x, p.y, p.z, yaw);
    }
    for (const s of [-1, 1]) {
      const a = A.clone().addScaledVector(side, s), b = B.clone().addScaledVector(side, s);
      a.y += 0.9; b.y += 0.9;
      sagTube(batch, a, b, 0.9, 0.035, ROPE, 20);
    }
  }

  // Vines: sagging between canopies and roof beams, plus strands hanging straight down.
  const roofY = y0 + H;
  for (let i = 0; i < 12; i++) {
    const a = canopies[i % canopies.length];
    const b = rand() < 0.5 ? canopies[(i + 1 + Math.floor(rand() * 2)) % canopies.length].clone() : V((rand() - 0.5) * (W - 2), roofY, (rand() - 0.5) * (D - 2));
    if (a.distanceTo(b) < 2) continue;
    sagTube(batch, a.clone().add(new THREE.Vector3(rand() - 0.5, -0.3, rand() - 0.5)), b, 1.2 + rand() * 1.8, 0.05, VINE, 14);
  }
  for (let i = 0; i < 26; i++) {
    const top = V((rand() - 0.5) * (W - 1.5), roofY, (rand() - 0.5) * (D - 1.5));
    const len = 2 + rand() * 3.2;
    const bot = top.clone(); bot.y -= len; bot.x += (rand() - 0.5) * 0.6;
    batch.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(top, top.clone().lerp(bot, 0.5).add(new THREE.Vector3(0.3, 0, 0.2)), bot), 6, 0.035, 4), VINE);
    for (let k = 0; k < 4; k++) {
      const p = top.clone().lerp(bot, 0.25 + k * 0.22);
      batch.add(new THREE.ConeGeometry(0.16, 0.38, 4), k % 2 ? 0x5c8a35 : 0x4a7a2e, { pos: [p.x + 0.1, p.y, p.z], rot: [rand() * 2, rand() * 6, 1.4] });
    }
  }

  // Tire swing on a real physics rope: give it a shove.
  {
    const anchor = V(1.5, roofY, -1);
    const len = 4.4;
    const tire = new CANNON.Body({ mass: 6, material: game.mats.item, collisionFilterGroup: G.ITEM, collisionFilterMask: MASK.ITEM, linearDamping: 0.08, angularDamping: 0.4 });
    tire.addShape(new CANNON.Cylinder(0.45, 0.45, 0.24, 10), new CANNON.Vec3(), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0));
    tire.position.set(anchor.x, anchor.y - len, anchor.z);
    game.world.addBody(tire);
    const pivot = new CANNON.Body({ mass: 0 });
    pivot.position.set(anchor.x, anchor.y, anchor.z);
    game.world.addBody(pivot);
    game.world.addConstraint(new CANNON.PointToPointConstraint(pivot, new CANNON.Vec3(), tire, new CANNON.Vec3(0, len, 0)));
    const tireMesh = mesh(new THREE.TorusGeometry(0.36, 0.13, 6, 12), mat(0x2a2a2a));
    game.scene.add(tireMesh);
    game.links.push({ body: tire, object: tireMesh });
    const ropeGeo = new THREE.BufferGeometry().setFromPoints([anchor, anchor]);
    const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: ROPE }));
    rope.frustumCulled = false;
    game.scene.add(rope);
    const top = new THREE.Vector3();
    updaters.push(() => {
      top.set(0, 0.45, 0).applyQuaternion(tireMesh.quaternion).add(tireMesh.position);
      const p = ropeGeo.attributes.position;
      p.setXYZ(1, top.x, top.y, top.z);
      p.needsUpdate = true;
    });
  }

  // Logs, rocks, a little pool, and ferns everywhere.
  for (const [lx, lz, yaw, len] of [[2, 1.5, 0.4, 3.2], [-3.5, -5.6, 1.4, 2.4]]) {
    const x = cx + lx, z = cz + lz, y = gy(lx, lz) + 0.28;
    batch.add(new THREE.CylinderGeometry(0.3, 0.34, len, 7), 0x6b5038, { pos: [x, y, z], rot: [Math.PI / 2, 0, yaw] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.3, 0.3, len / 2)), x, y, z, -yaw);
  }
  {
    const lx = 3.2, lz = 5.2, x = cx + lx, z = cz + lz, y = gy(lx, lz);
    const pool = mesh(new THREE.CircleGeometry(1.7, 14), new THREE.MeshStandardMaterial({ color: 0x4b8a8a, roughness: 0.1, transparent: true, opacity: 0.85 }), { cast: false });
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.12, z);
    game.scene.add(pool);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      P.rock.push({ x: x + Math.cos(a) * 1.9, z: z + Math.sin(a) * 1.9, y: y - 0.05, s: 0.35 + rand() * 0.25, yaw: rand() * 6, tint: rand() * 0.4, solid: false });
    }
  }
  for (let i = 0; i < 90; i++) {
    const lx = (rand() - 0.5) * (W - 1.4), lz = (rand() - 0.5) * (D - 1.4);
    P.fern.push({ x: cx + lx, z: cz + lz, y: gy(lx, lz) - 0.05, s: 0.7 + rand() * 0.9, yaw: rand() * 6.28, tint: rand() });
  }
  for (let i = 0; i < 8; i++) {
    const lx = (rand() - 0.5) * (W - 3), lz = (rand() - 0.5) * (D - 3);
    P.rock.push({ x: cx + lx, z: cz + lz, y: gy(lx, lz) - 0.15, s: 0.4 + rand() * 0.6, yaw: rand() * 6, tint: rand() * 0.4, solid: true });
  }

  signBoard(game, MONKEY.name, cx - 5, cz + D / 2 + 1.6, 0, { w: 3.2, h: 0.9, sub: 'please do not tap the glass', bg: '#3f6b3a' });
}

// ============================ LION'S DEN ============================
function buildLion(game, batch, glass, rand, P) {
  const { x: cx, z: cz, r: R } = LION;
  const winHalf = 0.34, gateHalf = 0.11;
  const FENCE = 0x2f3b33, STONE = 0x9b927f, CAP = 0xb8ae98;
  const fenceH = 3.4, lean = 0.9;
  const link = new THREE.MeshStandardMaterial({ map: chainLinkTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const meshPanels = [];

  // Tall fence with an inward-leaning overhang, everywhere except the window and the keeper gate.
  ring(cx, cz, R, 2.6, (a) => Math.abs(angleDiff(a, LION.viewAngle)) < winHalf || Math.abs(angleDiff(a, LION.keeperAngle)) < gateHalf, (s) => {
    const y = Math.min(s.y0, s.y1);
    const inX = -Math.cos(s.a0) * lean, inZ = -Math.sin(s.a0) * lean;
    for (const [x, z, gy] of [[s.x0, s.z0, s.y0], [s.x1, s.z1, s.y1]]) {
      batch.add(new THREE.BoxGeometry(0.14, fenceH, 0.14), FENCE, { pos: [x, gy + fenceH / 2 - 0.1, z] });
      const a = Math.atan2(z - cz, x - cx);
      const top = [x, gy + fenceH - 0.1, z], tip = [x - Math.cos(a) * 0.85, gy + fenceH + 0.8, z - Math.sin(a) * 0.85];
      batch.add(new THREE.BoxGeometry(0.1, 0.1, 1.25), FENCE, { pos: [(top[0] + tip[0]) / 2, (top[1] + tip[1]) / 2, (top[2] + tip[2]) / 2], lookAt: tip });
    }
    for (const hh of [0.15, fenceH - 0.15]) batch.add(new THREE.BoxGeometry(0.07, 0.07, s.L), FENCE, { pos: [s.mx, y + hh, s.mz], rot: [0, s.yaw, 0] });
    // mesh panel
    const g = quadXY(s.L, fenceH - 0.2, s.L / 0.5, (fenceH - 0.2) / 0.5);
    g.rotateY(s.yaw + Math.PI / 2);
    g.translate(s.mx, y + fenceH / 2 - 0.05, s.mz);
    meshPanels.push(g);
    // overhang panel
    const o = quadXY(s.L, 1.25, s.L / 0.5, 2.5);
    o.rotateX(-0.75);
    o.rotateY(s.yaw + Math.PI / 2);
    o.translate(s.mx + inX * 0.45, y + fenceH + 0.38, s.mz + inZ * 0.45);
    meshPanels.push(o);
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.1, 2.3, s.L / 2)), s.mx, y + 2.1, s.mz, s.yaw);
  });
  const panels = new THREE.Mesh(mergeGeometries(meshPanels), link);
  panels.castShadow = true;
  game.scene.add(panels);

  // Viewing window: stone wall with big glass panes and chunky mullions.
  ring(cx, cz, R, 1.9, (a) => Math.abs(angleDiff(a, LION.viewAngle)) >= winHalf, (s) => {
    const y = Math.min(s.y0, s.y1);
    segBox(game, batch, s, { h: 1.05, t: 0.7, color: STONE, collide: false });
    batch.add(new THREE.BoxGeometry(0.85, 0.12, s.L + 0.05), CAP, { pos: [s.mx, y + 1.0, s.mz], rot: [0, s.yaw, 0] });
    batch.add(new THREE.BoxGeometry(0.16, 2.2, 0.16), FENCE, { pos: [s.x0, y + 2.1, s.z0] });
    batch.add(new THREE.BoxGeometry(0.2, 0.2, s.L + 0.1), FENCE, { pos: [s.mx, y + 3.2, s.mz], rot: [0, s.yaw, 0] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.36, 0.55, s.L / 2)), s.mx, y + 0.5, s.mz, s.yaw);
    game.glass.add(s.mx, y + 2.12, s.mz, s.L - 0.1, 2.1, s.yaw, { colliderThick: 0.3 });
  });
  // last mullion at the far end of the window
  {
    const a = LION.viewAngle + winHalf;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    batch.add(new THREE.BoxGeometry(0.3, 3.4, 0.3), FENCE, { pos: [x, heightAt(x, z) + 1.6, z] });
  }
  signBoard(game, LION.name, LION.view[0] + Math.cos(LION.viewAngle + 1.57) * 4, LION.view[1] + Math.sin(LION.viewAngle + 1.57) * 4,
    Math.atan2(PLAZA.x - LION.view[0], PLAZA.z - LION.view[1]), { sub: 'keep hands inside the zoo', bg: '#7a5533' });

  // Keeper gate: two heavy posts and double gates swung outward.
  for (const side of [-1, 1]) {
    const a = LION.keeperAngle + side * gateHalf;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = heightAt(x, z);
    batch.add(new THREE.BoxGeometry(0.3, fenceH + 0.4, 0.3), FENCE, { pos: [x, y + fenceH / 2, z] });
    const hingeX = x, hingeZ = z;
    const dirX = Math.cos(a) * 0.75 - Math.sin(a) * side * 0.65, dirZ = Math.sin(a) * 0.75 + Math.cos(a) * side * 0.65;
    const len = Math.hypot(dirX, dirZ);
    const gx = hingeX + dirX * 0.5, gz = hingeZ + dirZ * 0.5;
    const yaw = Math.atan2(dirX, dirZ);
    for (const hh of [0.2, 1.4, 2.6]) batch.add(new THREE.BoxGeometry(0.08, 0.08, len), FENCE, { pos: [gx, y + hh, gz], rot: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(0.08, 2.5, 0.08), FENCE, { pos: [hingeX + dirX, y + 1.4, hingeZ + dirZ] });
  }

  // Pride rock: a pile of big slabby boulders with a flat ledge pointing at the window.
  const rx = cx - 3.5, rz = cz - 3;
  const ry = heightAt(rx, rz);
  const boulders = [[0, 0, 2.6, 1.6], [2, 1.2, 1.8, 1.3], [-1.8, 1.5, 1.9, 1.2], [-0.6, -2, 2, 1.5], [1.4, -1.6, 1.5, 1.1]];
  for (const [dx, dz, s, sy] of boulders) {
    const x = rx + dx, z = rz + dz, y = heightAt(x, z);
    batch.add(new THREE.DodecahedronGeometry(1, 0), 0x9a8f7c, { pos: [x, y + s * sy * 0.35, z], scale: [s, s * sy * 0.8, s * 0.9], rot: [0, dx + dz, 0] });
    staticBody(game, new CANNON.Sphere(s * 0.8), x, y + s * sy * 0.35 - 0.2, z);
  }
  {
    const dir = Math.atan2(LION.view[1] - rz, LION.view[0] - rx);
    const lx = rx + Math.cos(dir) * 1.6, lz = rz + Math.sin(dir) * 1.6;
    const yaw = Math.atan2(Math.cos(dir), Math.sin(dir));
    batch.add(new THREE.BoxGeometry(2.6, 0.5, 4.2), 0xa69b86, { pos: [lx, ry + 2.5, lz], rot: [0.12, yaw, 0.04] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(1.3, 0.25, 2.1)), lx, ry + 2.5, lz, yaw);
  }
  // Den: a cave of two rocks and a roof slab.
  {
    const dx = cx + 5, dz = cz - 6, dy = heightAt(dx, dz);
    const yaw = Math.atan2(LION.view[0] - dx, LION.view[1] - dz);
    const side = [Math.cos(yaw), -Math.sin(yaw)];
    for (const s of [-1, 1]) {
      const x = dx + side[0] * s * 1.5, z = dz + side[1] * s * 1.5;
      batch.add(new THREE.DodecahedronGeometry(1, 0), 0x8f8572, { pos: [x, dy + 0.8, z], scale: [0.9, 1.2, 1.8], rot: [0, yaw, 0] });
      staticBody(game, new CANNON.Sphere(1), x, dy + 0.7, z);
    }
    batch.add(new THREE.BoxGeometry(4.2, 0.6, 3.4), 0x9a8f7c, { pos: [dx, dy + 2.0, dz], rot: [0.06, yaw, 0.05] });
    batch.add(new THREE.BoxGeometry(2.2, 1.5, 0.3), 0x2d2620, { pos: [dx - Math.sin(yaw) * 1.2, dy + 0.85, dz - Math.cos(yaw) * 1.2], rot: [0, yaw, 0] }); // dark back
    staticBody(game, new CANNON.Box(new CANNON.Vec3(2.1, 0.3, 1.7)), dx, dy + 2.0, dz, yaw);
  }
  // Fallen log, water trough, scattered rocks and acacias.
  {
    const x = cx + 2.5, z = cz + 4.5, y = heightAt(x, z) + 0.3;
    batch.add(new THREE.CylinderGeometry(0.34, 0.4, 4, 7), 0x7a6047, { pos: [x, y, z], rot: [Math.PI / 2, 0, 0.9] });
    batch.add(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), 0x7a6047, { pos: [x + 0.7, y + 0.5, z - 0.4], rot: [0.3, 0, 0.6] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(0.36, 0.36, 2)), x, y, z, -0.9);
  }
  {
    const x = cx + 7.5, z = cz + 2, y = heightAt(x, z);
    batch.add(new THREE.BoxGeometry(2.6, 0.55, 1.1), STONE, { pos: [x, y + 0.2, z], rot: [0, 0.5, 0] });
    staticBody(game, new CANNON.Box(new CANNON.Vec3(1.3, 0.3, 0.55)), x, y + 0.2, z, 0.5);
    const w = mesh(new THREE.BoxGeometry(2.3, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: 0x5a8f9a, roughness: 0.08 }), { cast: false });
    w.position.set(x, y + 0.43, z);
    w.rotation.y = 0.5;
    game.scene.add(w);
  }
  for (const [dx, dz, s] of [[6.5, -1.5, 1.15], [-7.5, 3.5, 1], [-2, 8, 0.9]]) {
    P.acacia.push({ x: cx + dx, z: cz + dz, y: heightAt(cx + dx, cz + dz) - 0.1, s, yaw: rand() * 6.28, tint: rand(), solid: true });
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 2 + rand() * (R - 3.5);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    P.rock.push({ x, z, y: heightAt(x, z) - 0.1, s: 0.3 + rand() * 0.7, yaw: rand() * 6, tint: 0.5 + rand() * 0.5, solid: true });
  }
}
