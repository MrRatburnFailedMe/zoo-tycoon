import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from './physics.js';
import { mat, mesh, paint } from './util/build.js';
import { heightAt, pondWaterY } from './world/terrain.js';
import { POND, PLAZA, DUMPSTER, ENCLOSURES, GATE, OFFICE, LION } from './world/layout.js';
import { sfx } from './audio.js';
import { canvasTexture } from './util/textures.js';

const V = (x, y, z) => new CANNON.Vec3(x, y, z);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const box = (hx, hy, hz) => new CANNON.Box(V(hx, hy, hz));
function add(g, geo, color, x = 0, y = 0, z = 0, opts) {
  const m = mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// Cartoon admission ticket: orange stub, wobbly lettering, a lion in a party hat.
let ticketTex = null;
function ticketTexture() {
  if (ticketTex) return ticketTex;
  ticketTex = canvasTexture(512, 256, (g, w, h) => {
    const INK = '#2b2440';
    g.fillStyle = INK; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 26); g.fill();
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.roundRect(8, 8, 130, h - 16, [26, 0, 0, 26]); g.fill();
    g.setLineDash([10, 10]); g.lineWidth = 5; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(140, 16); g.lineTo(140, h - 16); g.stroke(); g.setLineDash([]);
    for (const y of [0, h]) for (let x = 40; x < w; x += 70) { g.fillStyle = INK; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill(); }
    // lion face on the stub
    g.lineWidth = 6;
    g.fillStyle = '#c96b1e'; g.beginPath(); g.arc(73, 128, 50, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffcf6b'; g.beginPath(); g.arc(73, 132, 32, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK; for (const x of [62, 84]) { g.beginPath(); g.arc(x, 124, 5, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(73, 140, 9, 0.1, Math.PI - 0.1); g.stroke();
    g.fillStyle = '#58b8f0'; g.beginPath(); g.moveTo(55, 92); g.lineTo(73, 40); g.lineTo(91, 92); g.closePath(); g.fill(); g.stroke();
    g.textAlign = 'center'; g.lineJoin = 'round';
    const word = (t, x, y, size, fill, rot = 0) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.font = `900 ${size}px "Baloo 2", system-ui`;
      g.lineWidth = size / 5; g.strokeStyle = INK; g.strokeText(t, 0, 0);
      g.fillStyle = fill; g.fillText(t, 0, 0); g.restore();
    };
    word('ZOO TYCOON', 325, 92, 62, '#fff', -0.04);
    word('ADMIT ONE', 325, 160, 46, '#7cd05a', 0.03);
    g.font = '700 20px Inter, system-ui'; g.fillStyle = INK;
    
  });
  return ticketTex;
}

// ---- Item catalogue. Each build() returns a visual group + physics shapes (same local frame). ----
// Swap the visuals for real models; keep the shapes roughly matching.
export const ITEMS = {
  crate: {
    name: 'Crate', mass: 8, sound: 'wood',
    build() {
      const g = new THREE.Group();
      add(g, B(0.6, 0.6, 0.6), 0xb07a45);
      for (const y of [-0.27, 0.27]) for (const z of [-0.27, 0.27]) add(g, B(0.62, 0.07, 0.07), 0x7a5230, 0, y, z);
      for (const x of [-0.27, 0.27]) add(g, B(0.07, 0.62, 0.62), 0x8a5c35, x, 0, 0).scale.set(1, 0.12, 1);
      return { group: g, shapes: [{ shape: box(0.3, 0.3, 0.3) }] };
    },
  },
  ball: {
    name: 'Beach Ball', mass: 0.5, material: 'bouncy', sound: 'ball', linearDamping: 0.15, angularDamping: 0.2, toy: true,
    build({ scale = 1 } = {}) {
      const geo = new THREE.IcosahedronGeometry(0.35, 1);
      const pos = geo.attributes.position;
      const cols = [0xe74c3c, 0xffffff, 0x3498db, 0xf1c40f, 0xffffff, 0x2ecc71].map((c) => new THREE.Color(c));
      paint(geo, 0xffffff);
      const col = geo.attributes.color;
      for (let i = 0; i < pos.count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const c = Math.abs(cy) > 0.3 ? new THREE.Color(0xffffff) : cols[Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6];
        for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
      }
      const g = new THREE.Group();
      g.add(mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35 })));
      g.scale.setScalar(scale);
      return { group: g, shapes: [{ shape: new CANNON.Sphere(0.35 * scale) }], radius: 0.35 * scale };
    },
  },
  cone: {
    name: 'Traffic Cone', mass: 1.5, sound: 'soft',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.035, 0.19, 0.55, 10), 0xff6a1a, 0, 0.02, 0);
      add(g, new THREE.CylinderGeometry(0.105, 0.135, 0.1, 10), 0xffffff, 0, 0.04, 0);
      add(g, B(0.4, 0.04, 0.4), 0x222222, 0, -0.27, 0);
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.04, 0.19, 0.55, 8), offset: V(0, 0.02, 0) }, { shape: box(0.2, 0.02, 0.2), offset: V(0, -0.27, 0) }] };
    },
  },
  bucket: {
    name: 'Bucket', mass: 1.2, sound: 'metal',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.2, 0.16, 0.36, 12, 1, true), 0x2f80c8, 0, 0, 0, { side: THREE.DoubleSide });
      add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12), 0x2a70b0, 0, -0.17, 0);
      const h = add(g, new THREE.TorusGeometry(0.19, 0.01, 4, 12, Math.PI), 0x999999, 0, 0.18, 0);
      h.rotation.y = Math.PI / 2;
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.2, 0.16, 0.36, 8) }] };
    },
  },
  trashbag: {
    name: 'Trash Bag', mass: 2.5, trash: true, sound: 'soft', linearDamping: 0.1,
    build() {
      const g = new THREE.Group();
      const b = add(g, new THREE.IcosahedronGeometry(0.3, 1), 0x24272b, 0, 0, 0, { roughness: 0.35 });
      b.scale.set(1, 1.15, 0.95);
      add(g, new THREE.ConeGeometry(0.08, 0.14, 5), 0x24272b, 0, 0.38, 0, { roughness: 0.35 });
      add(g, B(0.12, 0.03, 0.03), 0xf1c40f, 0, 0.33, 0);
      return { group: g, shapes: [{ shape: new CANNON.Sphere(0.31) }] };
    },
  },
  poop: {
    name: 'Poop', mass: 0.4, trash: true, sound: 'squish', angularDamping: 0.4,
    build({ scale = 1 } = {}) {
      const g = new THREE.Group();
      const brown = 0x6b4423;
      add(g, new THREE.IcosahedronGeometry(0.12, 0), brown, 0, -0.02, 0, { roughness: 0.3 }).scale.set(1.2, 0.7, 1.2);
      add(g, new THREE.IcosahedronGeometry(0.09, 0), brown, 0.01, 0.06, 0, { roughness: 0.3 }).scale.set(1.1, 0.75, 1.1);
      add(g, new THREE.ConeGeometry(0.05, 0.08, 5), brown, 0, 0.13, 0, { roughness: 0.3 });
      g.scale.setScalar(scale);
      return { group: g, shapes: [{ shape: new CANNON.Sphere(0.11 * scale) }], radius: 0.12 * scale };
    },
  },
  banana: {
    name: 'Banana Peel', mass: 0.2, trash: true, sound: 'soft',
    build() {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const p = add(g, B(0.07, 0.025, 0.2), 0xf5d142, Math.sin(i) * 0.08, 0, Math.cos(i) * 0.05);
        p.rotation.y = i * 1.1;
      }
      add(g, B(0.04, 0.05, 0.04), 0x6b5320, 0, 0.03, 0);
      return { group: g, shapes: [{ shape: box(0.12, 0.03, 0.12) }] };
    },
  },
  broom: {
    name: 'Broom', mass: 1.4, sound: 'wood',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.022, 0.022, 1.4, 6), 0xa0703f);
      add(g, B(0.34, 0.1, 0.08), 0xc0392b, 0, -0.72, 0);
      add(g, B(0.36, 0.16, 0.06), 0xe0c068, 0, -0.84, 0);
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.03, 0.03, 1.4, 6) }, { shape: box(0.18, 0.12, 0.04), offset: V(0, -0.8, 0) }] };
    },
  },
  megaphone: {
    name: 'Megaphone', mass: 1, sound: 'metal', useLabel: 'Honk (+hype)',
    build() {
      const g = new THREE.Group();
      const c = add(g, new THREE.CylinderGeometry(0.05, 0.15, 0.36, 10, 1, true), 0xf2f2f2, 0, 0, 0, { side: THREE.DoubleSide });
      c.rotation.x = Math.PI / 2;
      const r = add(g, new THREE.CylinderGeometry(0.152, 0.152, 0.04, 10, 1, true), 0xe2523c, 0, 0, 0.17, { side: THREE.DoubleSide });
      r.rotation.x = Math.PI / 2;
      add(g, B(0.05, 0.14, 0.06), 0x333333, 0, -0.1, -0.07);
      const q = new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0);
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.05, 0.15, 0.36, 8), quat: q }] };
    },
    use(game, item) {
      const now = performance.now();
      if (now - (item.lastHonk || 0) < 900) return;
      item.lastHonk = now;
      sfx.honk();
      game.hud.big('BUY TICKETS!!', '#ff8a3d');
      game.state.addHype(1.5);
    },
  },
  chair: {
    name: 'Office Chair', mass: 9, sound: 'wood',
    build() {
      const g = new THREE.Group();
      add(g, B(0.5, 0.08, 0.5), 0x2d3238, 0, 0.46, 0);
      add(g, B(0.48, 0.55, 0.06), 0x2d3238, 0, 0.78, -0.23);
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.38, 6), 0x777777, 0, 0.23, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = add(g, B(0.05, 0.04, 0.3), 0x333333, Math.sin(a) * 0.14, 0.04, Math.cos(a) * 0.14);
        leg.rotation.y = a;
      }
      return {
        group: g,
        shapes: [
          { shape: box(0.25, 0.04, 0.25), offset: V(0, 0.46, 0) },
          { shape: box(0.24, 0.27, 0.03), offset: V(0, 0.78, -0.23) },
          { shape: new CANNON.Cylinder(0.05, 0.05, 0.4, 6), offset: V(0, 0.23, 0) },
          { shape: new CANNON.Cylinder(0.3, 0.3, 0.06, 8), offset: V(0, 0.04, 0) },
        ],
      };
    },
  },
  plant: {
    name: 'Potted Plant', mass: 4, sound: 'soft',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.18, 0.14, 0.32, 8), 0xc0643b, 0, 0.16, 0);
      add(g, new THREE.IcosahedronGeometry(0.28, 0), 0x3f9a3a, 0, 0.55, 0);
      add(g, new THREE.IcosahedronGeometry(0.18, 0), 0x52b046, 0.12, 0.72, 0.05);
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.18, 0.14, 0.32, 8), offset: V(0, 0.16, 0) }, { shape: new CANNON.Sphere(0.27), offset: V(0, 0.56, 0) }] };
    },
  },
  mug: {
    name: 'Coffee Mug', mass: 0.3, sound: 'metal',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), 0xffffff);
      add(g, new THREE.CylinderGeometry(0.043, 0.043, 0.005, 10), 0x4a2c17, 0, 0.05, 0);
      const h = add(g, new THREE.TorusGeometry(0.03, 0.01, 4, 8), 0xffffff, 0.055, 0, 0);
      h.rotation.y = 0;
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.05, 0.045, 0.11, 8) }] };
    },
  },
  ticket: {
    name: 'Zoo Ticket', mass: 0.05, sound: 'soft', linearDamping: 0.4, angularDamping: 0.6,
    build() {
      const g = new THREE.Group();
      const face = new THREE.MeshStandardMaterial({ map: ticketTexture(), roughness: 0.6 });
      const edge = mat(0x2b2440);
      g.add(mesh(B(0.24, 0.01, 0.12), [edge, edge, face, face, edge, edge]));
      return { group: g, shapes: [{ shape: box(0.12, 0.012, 0.06) }], radius: 0.1 };
    },
  },
  cash: {
    name: 'Cash', mass: 0.3, sound: 'soft',
    // a fan of zoo dollars: one note per bill in the amount ($20 lion, $10 elephant, $5 penguin, $1 monkey)
    build({ value = 20 } = {}) {
      const g = new THREE.Group();
      const notes = [];
      let left = value;
      for (const d of [100, 50, 20, 10, 5, 1]) while (left >= d && notes.length < 6) { notes.push(d); left -= d; }
      const COL = { 100: 0x9a6bd6, 50: 0xe2523c, 20: 0xf2a33a, 10: 0x6f8fb8, 5: 0x2fb3a8, 1: 0x6fbf5a };
      notes.forEach((d, i) => {
        const n = add(g, B(0.2, 0.008, 0.1), COL[d], 0, i * 0.009, 0);
        n.rotation.y = (i - notes.length / 2) * 0.12;
        add(g, B(0.05, 0.009, 0.05), 0xfff3c4, 0, i * 0.009 + 0.001, 0).rotation.y = n.rotation.y;
      });
      return { group: g, shapes: [{ shape: box(0.1, 0.025, 0.05) }], radius: 0.1 };
    },
  },
  parcel: {
    name: 'ZooMart box', mass: 4, sound: 'soft', useLabel: 'Open box',
    build() {
      const g = new THREE.Group();
      add(g, B(0.56, 0.44, 0.48), 0xc69c62, 0, 0, 0, { roughness: 0.95 });
      add(g, B(0.565, 0.012, 0.09), 0x2fb38a, 0, 0.222, 0); // tape across the lid
      add(g, B(0.09, 0.445, 0.485), 0x2fb38a, 0, 0, 0); // tape round the middle
      add(g, B(0.12, 0.002, 0.12), 0xfff3c4, -0.18, 0.223, 0.14); // shipping label
      for (const sx of [-1, 1]) add(g, B(0.005, 0.05, 0.16), 0x8a6a45, sx * 0.281, 0.12, 0); // hand holes
      return { group: g, shapes: [{ shape: box(0.28, 0.22, 0.24) }], radius: 0.35 };
    },
    use(game, item) {
      const p = item.body.position, t = item.contents || 'ball';
      game.grabber.release();
      game.items.remove(item);
      sfx.drop();
      const it = game.items.spawn(t, p.x, p.y + 0.3, p.z);
      it.body.velocity.set(0, 2.5, 0);
      // the empty box flattens into cardboard litter
      game.items.spawn('cardboard', p.x + 0.3, p.y, p.z);
    },
  },
  cardboard: {
    name: 'Flattened box', mass: 0.6, sound: 'soft', trash: true,
    build() {
      const g = new THREE.Group();
      add(g, B(0.7, 0.03, 0.5), 0xc69c62, 0, 0, 0, { roughness: 1 });
      add(g, B(0.7, 0.032, 0.08), 0x2fb38a, 0, 0, 0);
      return { group: g, shapes: [{ shape: box(0.35, 0.02, 0.25) }], radius: 0.35 };
    },
  },
  card: {
    name: 'Bank card', mass: 0.05, sound: 'soft', linearDamping: 0.4, angularDamping: 0.6,
    build({ color = 0x3f78c2 } = {}) {
      const g = new THREE.Group();
      add(g, B(0.086, 0.004, 0.054), color, 0, 0, 0, { metalness: 0.3, roughness: 0.4 });
      add(g, B(0.016, 0.005, 0.012), 0xd4b14a, -0.022, 0, 0.008, { metalness: 0.8, roughness: 0.3 }); // chip
      add(g, B(0.086, 0.005, 0.01), 0x111111, 0, -0.0005, -0.018); // stripe
      return { group: g, shapes: [{ shape: box(0.043, 0.004, 0.027) }], radius: 0.06 };
    },
  },
  feed: {
    name: 'Animal Feed', mass: 6, sound: 'soft', food: true,
    build() {
      const g = new THREE.Group();
      add(g, B(0.45, 0.6, 0.25), 0xc9a466, 0, 0, 0, { roughness: 1 });
      add(g, B(0.47, 0.18, 0.27), 0x3d7a3a, 0, 0.05, 0);
      add(g, new THREE.ConeGeometry(0.16, 0.12, 4), 0xc9a466, 0, 0.35, 0);
      return { group: g, shapes: [{ shape: box(0.22, 0.3, 0.12) }] };
    },
  },
  fish: {
    name: 'Fish Bucket', mass: 3, sound: 'metal', food: true,
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.22, 0.18, 0.34, 10), 0xd8dde2, 0, 0, 0, { metalness: 0.4 });
      for (let i = 0; i < 4; i++) {
        const f = add(g, new THREE.ConeGeometry(0.05, 0.22, 4), 0x7fa6c4, Math.cos(i * 1.6) * 0.08, 0.2, Math.sin(i * 1.6) * 0.08);
        f.rotation.set(0.4 * Math.cos(i), 0, 0.4 * Math.sin(i));
      }
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.22, 0.18, 0.34, 8) }] };
    },
  },
  bananas: {
    name: 'Banana Crate', mass: 5, sound: 'wood', food: true,
    build() {
      const g = new THREE.Group();
      add(g, B(0.5, 0.25, 0.4), 0xb07a45);
      for (let i = 0; i < 6; i++) add(g, new THREE.CapsuleGeometry(0.04, 0.16, 2, 5), 0xf5d142, -0.18 + (i % 3) * 0.18, 0.16, i < 3 ? -0.08 : 0.08).rotation.z = Math.PI / 2;
      return { group: g, shapes: [{ shape: box(0.25, 0.17, 0.2) }] };
    },
  },
  spray: {
    name: 'Cleaning Spray', mass: 0.6, sound: 'metal', useLabel: 'Spray (clean up poop)',
    build() {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8), 0x3fb8e0);
      add(g, B(0.05, 0.08, 0.1), 0xffffff, 0, 0.15, 0.02);
      add(g, B(0.03, 0.03, 0.08), 0xe2523c, 0, 0.17, 0.09);
      return { group: g, shapes: [{ shape: new CANNON.Cylinder(0.07, 0.07, 0.3, 8) }] };
    },
    use(game, item) {
      const now = performance.now();
      if (now - (item.lastUse || 0) < 400) return;
      item.lastUse = now;
      sfx.splash(0.5);
      const p = item.body.position;
      let n = 0;
      for (const it of [...game.items.list]) {
        if (it.type !== 'poop' || it.body.position.distanceTo(p) > 3.5) continue;
        game.items.remove(it);
        n++;
      }
      if (n) { sfx.cash(); game.animals.shout(`+${n} clean`, p.x, p.y + 0.6, p.z, '#9fe0ff'); }
      else game.animals.shout('pssht', p.x, p.y + 0.4, p.z, '#9fe0ff');
    },
  },
  glasskit: {
    name: 'Glass Repair Kit', mass: 2, sound: 'metal', useLabel: 'Repair all glass',
    build() {
      const g = new THREE.Group();
      add(g, B(0.4, 0.2, 0.3), 0xe2523c);
      add(g, B(0.42, 0.04, 0.32), 0xffffff, 0, 0.02, 0);
      add(g, B(0.12, 0.04, 0.04), 0x333333, 0, 0.12, 0);
      return { group: g, shapes: [{ shape: box(0.2, 0.1, 0.15) }] };
    },
    use(game, item) {
      const n = game.glass.repairAll();
      const p = item.body.position;
      game.animals.shout(n ? `Fixed ${n} pane${n > 1 ? 's' : ''}!` : 'Nothing broken', p.x, p.y + 0.6, p.z, '#ffffff');
      if (n) { sfx.cash(); game.items.remove(item); }
    },
  },
  haybale: {
    name: 'Hay Bale', mass: 14, sound: 'soft', food: true,
    build() {
      const g = new THREE.Group();
      add(g, B(0.9, 0.5, 0.55), 0xe2c45a);
      for (const x of [-0.25, 0.25]) add(g, B(0.03, 0.52, 0.57), 0x8a5a2b, x, 0, 0);
      return { group: g, shapes: [{ shape: box(0.45, 0.25, 0.275) }] };
    },
  },
};

const tmp = new THREE.Vector3();

export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.waterY = pondWaterY();
    game.world.addEventListener('preStep', () => this.buoyancy());
  }

  spawn(type, x, y, z, opts = {}) {
    const { game } = this;
    const def = ITEMS[type];
    const { group, shapes, radius } = def.build(opts);
    const s = opts.scale || 1;
    const body = new CANNON.Body({
      mass: def.mass * s * s * s,
      material: game.mats[def.material || 'item'],
      collisionFilterGroup: G.ITEM, collisionFilterMask: MASK.ITEM,
      linearDamping: def.linearDamping ?? 0.03, angularDamping: def.angularDamping ?? 0.12,
      sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6,
    });
    for (const sh of shapes) body.addShape(sh.shape, sh.offset, sh.quat);
    body.position.set(x, y, z);
    if (opts.yaw) body.quaternion.setFromAxisAngle(V(0, 1, 0), opts.yaw);
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.interpolatedQuaternion.copy(body.quaternion);
    game.world.addBody(body);

    const item = { type, def, body, group, label: def.name, trash: !!def.trash, radius: radius || 0.3, home: [x, y, z, opts] };
    item.getGrabBody = () => body;
    if (def.use) { item.use = () => def.use(game, item); item.useLabel = def.useLabel; }
    group.traverse((o) => { o.userData.entity = item; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.position.set(x, y, z);
    game.scene.add(group);
    game.pickables.push(group);
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.5) sfx.hit(def.sound, v, game.camera.position.distanceTo(group.position));
    });
    this.list.push(item);
    return item;
  }

  remove(item) {
    const { game } = this;
    if (game.grabber.entity === item) game.grabber.release();
    game.world.removeBody(item.body);
    game.scene.remove(item.group);
    game.pickables.splice(game.pickables.indexOf(item.group), 1);
    this.list.splice(this.list.indexOf(item), 1);
  }

  count(type) { return this.list.reduce((n, i) => n + (i.type === type), 0); }

  // Things float in the penguin pond.
  buoyancy() {
    const wy = this.waterY;
    const apply = (b, r) => {
      if (Math.hypot(b.position.x - POND.x, b.position.z - POND.z) > POND.r + 1.5) return;
      const depth = wy - (b.position.y - r);
      if (depth <= 0) return;
      const k = Math.min(1, depth / (r * 2));
      b.force.y += b.mass * 9.82 * 1.7 * k;
      b.force.x -= b.velocity.x * b.mass * 1.2 * k;
      b.force.y -= b.velocity.y * b.mass * 2 * k;
      b.force.z -= b.velocity.z * b.mass * 1.2 * k;
    };
    for (const it of this.list) apply(it.body, it.radius);
    for (const f of this.game.friends) if (f.ragdoll) for (const b of Object.values(f.ragdoll.bodies)) apply(b, 0.15);
  }

  update() {
    const { game } = this;
    const binned = [];
    for (const it of this.list) {
      const b = it.body;
      it.group.position.copy(b.interpolatedPosition);
      it.group.quaternion.copy(b.interpolatedQuaternion);
      if (b.position.y < -30) { // fell off the world: put it back
        b.position.set(it.home[0], it.home[1] + 1, it.home[2]);
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
      }
      if (it.trash && game.grabber.entity !== it && game.zoo.bins.some((bn) => bn.contains(tmp.copy(b.position)))) binned.push(it);
    }
    for (const it of binned) this.remove(it);
    game.state.setPoop(this.count('poop'));
    for (const it of binned) {
      sfx.cash();
      game.hud.toast(`Binned ${it.label.toLowerCase()}, cleanliness ${game.state.cleanliness}%`, 'info');
    }
  }
}

// Initial props scattered around the zoo.
export function spawnStarterItems(game) {
  const items = game.items;
  const at = (type, x, z, dy = 0.6, opts) => items.spawn(type, x, heightAt(x, z) + dy, z, opts);
  const s = game.office.spots;

  at('ball', PLAZA.x + 3, PLAZA.z + 5.5);
  at('ball', PLAZA.x - 4, PLAZA.z - 5);
  at('cone', GATE.x - 1.6, GATE.z - 3, 0.35);
  at('cone', GATE.x + 1.6, GATE.z - 3, 0.35);
  at('cone', GATE.x + 1.6, GATE.z - 5, 0.35);
  for (let i = 0; i < 3; i++) at('crate', DUMPSTER.x - 3 + i * 0.1, DUMPSTER.z + 0.2, 0.35 + i * 0.62);
  at('crate', DUMPSTER.x - 3.9, DUMPSTER.z + 1, 0.35);
  at('trashbag', DUMPSTER.x + 2, DUMPSTER.z + 1.2, 0.4);
  at('trashbag', DUMPSTER.x + 2.6, DUMPSTER.z + 0.6, 0.4);
  at('broom', OFFICE.x + OFFICE.w / 2 + 1.0, OFFICE.z + 2.6, 0.9, { yaw: 0.3 });
  at('banana', PLAZA.x + 6, PLAZA.z - 2, 0.2);
  at('banana', 1.5, 26, 0.2);

  items.spawn('chair', s.chair[0], s.chair[1], s.chair[2], { yaw: -Math.PI / 2 });
  items.spawn('megaphone', s.table[0] - 0.2, s.table[1] + 0.1, s.table[2]);
  items.spawn('banana', s.table[0] + 0.3, s.table[1], s.table[2] + 0.1);
  items.spawn('mug', s.desk[0], s.desk[1], s.desk[2]);
  items.spawn('plant', ...s.plantA);
  items.spawn('plant', ...s.plantB);

  // Keeper supplies by each exhibit's back door.
  for (const e of ENCLOSURES) at('bucket', e.keeper[0] + 1, e.keeper[1] + 0.8, 0.3);
  at('haybale', LION.keeper[0] - 1.5, LION.keeper[1] - 1, 0.4);
  at('haybale', LION.keeper[0] - 2.4, LION.keeper[1] - 0.2, 0.4, { yaw: 1.2 });
}
