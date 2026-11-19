import * as THREE from 'three';
import { mat, mesh, solidBox } from '../util/build.js';
import { canvasTexture } from '../util/textures.js';

// Cozy bits for the staff office: picture posters (no writing), a bookshelf, warm string lights,
// curtains, a cork board of snapshots, a wall clock, hanging plants, cushions and a blanket on the
// sofa, a striped rug and the office cat asleep in its bed.

const P = (w, h, draw) => canvasTexture(w, h, draw);

// ---- poster art: flat cartoon scenes ----
const POSTERS = [
  // sunset with a giraffe
  (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#ff8a3d'); sky.addColorStop(0.6, '#ffd34d'); sky.addColorStop(1, '#ffe9a8');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(w * 0.5, h * 0.55, w * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b3b05';
    g.fillRect(0, h * 0.82, w, h);
    g.beginPath(); g.ellipse(w * 0.62, h * 0.7, w * 0.16, h * 0.06, 0, 0, Math.PI * 2); g.fill(); // body
    g.save(); g.translate(w * 0.72, h * 0.66); g.rotate(-0.45); g.fillRect(-w * 0.03, -h * 0.34, w * 0.06, h * 0.34); g.restore(); // neck
    g.beginPath(); g.ellipse(w * 0.86, h * 0.36, w * 0.06, h * 0.03, 0.3, 0, Math.PI * 2); g.fill(); // head
    for (const x of [0.5, 0.56, 0.68, 0.74]) g.fillRect(w * x, h * 0.72, w * 0.025, h * 0.12);
    g.fillRect(w * 0.1, h * 0.55, w * 0.03, h * 0.3); g.beginPath(); g.ellipse(w * 0.115, h * 0.55, w * 0.14, h * 0.05, 0, 0, Math.PI * 2); g.fill(); // acacia
  },
  // hippo in a bubble bath
  (g, w, h) => {
    g.fillStyle = '#7fd3ef'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc((i * 97) % w, (i * 53) % (h * 0.5), 10 + (i % 4) * 6, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.roundRect(w * 0.1, h * 0.55, w * 0.8, h * 0.3, 40); g.fill(); // tub
    g.fillStyle = '#b08a86'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.25, h * 0.14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c99a96'; g.beginPath(); g.ellipse(w * 0.5, h * 0.56, w * 0.17, h * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2440'; for (const x of [0.4, 0.6]) { g.beginPath(); g.arc(w * x, h * 0.44, 7, 0, Math.PI * 2); g.fill(); }
    for (const x of [0.44, 0.56]) { g.beginPath(); g.arc(w * x, h * 0.56, 4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(w * (0.15 + i * 0.065), h * 0.58 + Math.sin(i) * 8, 18, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffd34d'; g.beginPath(); g.ellipse(w * 0.78, h * 0.5, 22, 16, 0, 0, Math.PI * 2); g.fill(); // rubber duck
    g.beginPath(); g.arc(w * 0.8, h * 0.44, 12, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ff8a3d'; g.fillRect(w * 0.82, h * 0.44, 12, 5);
  },
  // penguin in sunglasses on an ice floe
  (g, w, h) => {
    g.fillStyle = '#2b5fa8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3f78c2'; g.fillRect(0, h * 0.7, w, h);
    g.fillStyle = '#e6f6ff'; g.beginPath(); g.moveTo(w * 0.1, h * 0.75); g.lineTo(w * 0.9, h * 0.75); g.lineTo(w * 0.8, h * 0.82); g.lineTo(w * 0.2, h * 0.82); g.fill();
    g.fillStyle = '#22252b'; g.beginPath(); g.ellipse(w * 0.5, h * 0.55, w * 0.2, h * 0.22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.ellipse(w * 0.5, h * 0.6, w * 0.13, h * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.roundRect(w * 0.36, h * 0.4, w * 0.12, h * 0.05, 6); g.roundRect(w * 0.52, h * 0.4, w * 0.12, h * 0.05, 6); g.fill(); g.fillRect(w * 0.47, h * 0.41, w * 0.06, 4);
    g.fillStyle = '#f29a2e'; g.beginPath(); g.moveTo(w * 0.46, h * 0.48); g.lineTo(w * 0.5, h * 0.52); g.lineTo(w * 0.54, h * 0.48); g.fill();
    for (let i = 0; i < 30; i++) { g.fillStyle = '#fff'; g.fillRect((i * 71) % w, (i * 37) % (h * 0.6), 3, 3); }
  },
  // lion with a crown
  (g, w, h) => {
    g.fillStyle = '#7cd05a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#6fbf5a' : '#86d866'; g.beginPath(); g.moveTo(w / 2, h / 2); g.arc(w / 2, h / 2, w, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); g.fill(); }
    g.fillStyle = '#b5651d'; g.beginPath(); g.arc(w / 2, h * 0.55, w * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5c26b'; g.beginPath(); g.arc(w / 2, h * 0.57, w * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2440'; for (const x of [0.43, 0.57]) { g.beginPath(); g.arc(w * x, h * 0.53, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5a3410'; g.beginPath(); g.ellipse(w / 2, h * 0.6, 12, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(w * 0.36, h * 0.3); g.lineTo(w * 0.36, h * 0.2); g.lineTo(w * 0.43, h * 0.26); g.lineTo(w * 0.5, h * 0.16); g.lineTo(w * 0.57, h * 0.26); g.lineTo(w * 0.64, h * 0.2); g.lineTo(w * 0.64, h * 0.3); g.fill();
  },
  // elephant spraying a rainbow
  (g, w, h) => {
    g.fillStyle = '#ffe9f2'; g.fillRect(0, 0, w, h);
    ['#e2523c', '#ff8a3d', '#ffd34d', '#7cd05a', '#3f78c2', '#8e55a8'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 16; g.beginPath(); g.arc(w * 0.62, h * 0.6, w * 0.5 - i * 16, Math.PI, Math.PI * 1.75); g.stroke(); });
    g.fillStyle = '#9aa3ad'; g.beginPath(); g.ellipse(w * 0.35, h * 0.72, w * 0.22, h * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.18, h * 0.6, w * 0.12, 0, Math.PI * 2); g.fill();
    g.fillRect(w * 0.06, h * 0.55, w * 0.05, h * 0.25);
    g.fillStyle = '#b8c0c8'; g.beginPath(); g.ellipse(w * 0.26, h * 0.6, w * 0.07, h * 0.07, 0, 0, Math.PI * 2); g.fill();
    for (const x of [0.22, 0.3, 0.42, 0.5]) { g.fillStyle = '#9aa3ad'; g.fillRect(w * x, h * 0.78, w * 0.05, h * 0.12); }
    g.fillStyle = '#2b2440'; g.beginPath(); g.arc(w * 0.15, h * 0.57, 5, 0, Math.PI * 2); g.fill();
  },
];

function posterMesh(i, w = 0.6, h = 0.8) {
  const tex = P(384, 512, (g, W, H) => { POSTERS[i % POSTERS.length](g, W, H); g.strokeStyle = '#fff'; g.lineWidth = 18; g.strokeRect(0, 0, W, H); });
  const grp = new THREE.Group();
  grp.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), { cast: false }));
  // tape at the corners
  for (const [x, y] of [[-1, 1], [1, 1]]) {
    const t = mesh(new THREE.PlaneGeometry(0.08, 0.03), mat(0xfff3c4, { transparent: true, opacity: 0.85 }), { cast: false });
    t.position.set(x * (w / 2 - 0.02), y * (h / 2 - 0.01), 0.002);
    t.rotation.z = x * 0.6;
    grp.add(t);
  }
  return grp;
}

export function buildCozy(game, { xw, xe, zn, zs, fy, H, T, deskX, deskZ }) {
  const { scene } = game;
  const add = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
  const iz = 0.09; // how far proud of a wall things hang

  // posters: above the desk (west wall), on the south wall by the bookshelf, beside the door
  add(posterMesh(0), xw + T / 2 + iz, fy + 1.75, deskZ - 1.6, Math.PI / 2);
  add(posterMesh(1), xw + T / 2 + iz, fy + 1.75, deskZ + 1.95, Math.PI / 2);
  add(posterMesh(2, 0.55, 0.72), (xw + xe) / 2 - 0.1, fy + 1.6, zs - T / 2 - iz, Math.PI);
  add(posterMesh(3, 0.55, 0.72), (xw + xe) / 2 + 0.8, fy + 1.6, zs - T / 2 - iz, Math.PI);
  add(posterMesh(4, 0.45, 0.6), xe - T / 2 - iz, fy + 1.7, zn + (zs - zn) / 2 - 1.15, -Math.PI / 2);

  // cork board of snapshots above the monitor
  const cork = new THREE.Group();
  cork.add(mesh(new THREE.BoxGeometry(0.03, 0.55, 0.9), mat(0xb88a5a, { roughness: 1 }), { cast: false }));
  const snapCols = [0x7fd3ef, 0xffd34d, 0x7cd05a, 0xff8a7a, 0xc9b6ff, 0xffb347];
  for (let i = 0; i < 7; i++) {
    const ph = mesh(new THREE.BoxGeometry(0.005, 0.13, 0.11), mat(0xffffff), { cast: false });
    ph.position.set(0.02, -0.15 + (i % 2) * 0.22 + Math.sin(i) * 0.03, -0.36 + i * 0.12);
    ph.rotation.x = Math.sin(i * 2.3) * 0.2;
    const pic = mesh(new THREE.BoxGeometry(0.006, 0.09, 0.09), mat(snapCols[i % snapCols.length]), { cast: false });
    pic.position.y = 0.012;
    ph.add(pic);
    const pin = mesh(new THREE.SphereGeometry(0.012, 6, 4), mat([0xe2523c, 0x3f78c2, 0x2fb38a][i % 3]), { cast: false });
    pin.position.set(0.01, 0.055, 0);
    ph.add(pin);
    cork.add(ph);
  }
  add(cork, xw + T / 2 + 0.03, fy + 1.95, deskZ - 0.2);

  // bookshelf against the south wall
  const shelf = new THREE.Group();
  const wood = mat(0x7a4e2c, { roughness: 0.8 });
  for (const s of [-1, 1]) { const side = mesh(new THREE.BoxGeometry(0.04, 1.9, 0.32), wood); side.position.set(s * 0.5, 0.95, 0); shelf.add(side); }
  const bookCols = [0xe2523c, 0x3f78c2, 0xffd34d, 0x2fb38a, 0x8e55a8, 0xff8a3d, 0xf3efe2, 0x6b4a2e];
  for (let r = 0; r < 5; r++) {
    const board = mesh(new THREE.BoxGeometry(1.0, 0.03, 0.32), wood); board.position.set(0, 0.03 + r * 0.44, 0); shelf.add(board);
    if (r === 4) continue;
    let x = -0.46;
    for (let i = 0; x < 0.42; i++) {
      const bw = 0.035 + ((i * 7 + r * 3) % 5) * 0.01, bh = 0.24 + ((i * 5 + r) % 4) * 0.035;
      if ((i + r) % 7 === 6) { x += 0.08; continue; } // a gap
      const book = mesh(new THREE.BoxGeometry(bw, bh, 0.22), mat(bookCols[(i * 3 + r) % bookCols.length], { roughness: 0.9 }), { cast: false });
      book.position.set(x + bw / 2, 0.045 + r * 0.44 + bh / 2, 0.02);
      if ((i + r) % 9 === 8) book.rotation.z = 0.25;
      shelf.add(book);
      x += bw + 0.004;
    }
  }
  // a little plant and a jar of treats on top
  const pot = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8), mat(0xc96b3a)); pot.position.set(-0.25, 1.98, 0); shelf.add(pot);
  const leaves = mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x4f9a3a, { flatShading: true })); leaves.position.set(-0.25, 2.12, 0); shelf.add(leaves);
  const jar = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.5, roughness: 0.1 })); jar.position.set(0.25, 2.0, 0); shelf.add(jar);
  add(shelf, (xw + xe) / 2 - 1.2, fy, zs - T / 2 - 0.2, Math.PI);
  solidBox(game, { size: [1.04, 1.9, 0.34], pos: [(xw + xe) / 2 - 1.2, fy + 0.95, zs - T / 2 - 0.2], color: 0x7a4e2c, collide: true, cast: false, block: false }).visible = false;

  // warm string lights round the top of the walls
  const bulbs = [];
  const run = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.32); for (let i = 0; i <= n; i++) { const k = i / n; bulbs.push([x0 + (x1 - x0) * k, fy + H - 0.25 - Math.sin(k * Math.PI * (n / 4)) ** 2 * 0.1, z0 + (z1 - z0) * k]); } };
  const m = 0.12;
  run(xw + m, zn + m, xe - m, zn + m); run(xe - m, zs - m, xw + m, zs - m); run(xw + m, zn + m, xw + m, zs - m);
  const bulbGeo = new THREE.SphereGeometry(0.03, 6, 4);
  const cols = [0xffd27a, 0xff9a5a, 0xfff1c4, 0xffb0c8];
  cols.forEach((c, ci) => {
    const list = bulbs.filter((_, i) => i % cols.length === ci);
    const inst = new THREE.InstancedMesh(bulbGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }), list.length);
    const mm = new THREE.Matrix4();
    list.forEach((b, i) => inst.setMatrixAt(i, mm.makeTranslation(b[0], b[1], b[2])));
    inst.castShadow = false;
    scene.add(inst);
  });

  // curtains either side of the north and south windows
  const curtain = mat(0xd9893a, { roughness: 1, side: THREE.DoubleSide });
  const cx = (xw + xe) / 2;
  for (const [wz, face] of [[zn + T / 2 + 0.06, 0], [zs - T / 2 - 0.06, Math.PI]]) {
    for (const wx of [xw + 1.5 + 1.1, cx + 1.8 + 1.1]) {
      for (const s of [-1, 1]) {
        const c = mesh(new THREE.BoxGeometry(0.45, 1.9, 0.04), curtain, { cast: false });
        c.position.set(wx + s * 1.2, fy + 1.4, wz);
        c.rotation.y = face;
        scene.add(c);
        for (let f = 0; f < 3; f++) { // folds
          const fold = mesh(new THREE.BoxGeometry(0.05, 1.9, 0.06), mat(0xc0762d, { roughness: 1 }), { cast: false });
          fold.position.set(wx + s * 1.2 - 0.15 + f * 0.15, fy + 1.4, wz);
          scene.add(fold);
        }
      }
      const rod = mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.9, 6), mat(0x4a3426), { cast: false });
      rod.rotation.z = Math.PI / 2;
      rod.position.set(wx, fy + 2.38, wz);
      scene.add(rod);
    }
  }

  // wall clock (no numbers, just ticks)
  const clock = new THREE.Group();
  const face = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), mat(0xfff8e8), { cast: false }); face.rotation.x = Math.PI / 2; clock.add(face);
  const rim = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), mat(0xe2523c), { cast: false }); clock.add(rim);
  for (let i = 0; i < 12; i++) { const t = mesh(new THREE.BoxGeometry(0.012, 0.04, 0.01), mat(0x2b2440), { cast: false }); t.position.set(Math.sin(i / 12 * Math.PI * 2) * 0.16, Math.cos(i / 12 * Math.PI * 2) * 0.16, 0.025); t.rotation.z = -i / 12 * Math.PI * 2; clock.add(t); }
  const hour = mesh(new THREE.BoxGeometry(0.02, 0.1, 0.01), mat(0x2b2440), { cast: false }); hour.geometry.translate(0, 0.05, 0); hour.position.z = 0.03; clock.add(hour);
  const minute = mesh(new THREE.BoxGeometry(0.014, 0.15, 0.01), mat(0x2b2440), { cast: false }); minute.geometry.translate(0, 0.075, 0); minute.position.z = 0.035; clock.add(minute);
  add(clock, xe - 0.75, fy + 2.2, zn + T / 2 + 0.05);

  // hanging plants by the windows
  for (const [x, z] of [[xw + 2.6, zn + 0.5], [cx + 2.9, zn + 0.5], [cx + 2.9, zs - 0.5]]) {
    const hp = new THREE.Group();
    const cord = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 3), mat(0xffffff), { cast: false }); cord.position.y = 0.3; hp.add(cord);
    const bowl = mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xf3efe2, { side: THREE.DoubleSide })); hp.add(bowl);
    for (let i = 0; i < 7; i++) {
      const vine = mesh(new THREE.BoxGeometry(0.03, 0.35 + (i % 3) * 0.12, 0.03), mat(0x4f9a3a), { cast: false });
      const a = (i / 7) * Math.PI * 2;
      vine.position.set(Math.cos(a) * 0.12, -0.15 - (i % 3) * 0.06, Math.sin(a) * 0.12);
      vine.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      hp.add(vine);
    }
    const top = mesh(new THREE.IcosahedronGeometry(0.15, 0), mat(0x5fae45, { flatShading: true }), { cast: false }); top.position.y = 0.05; hp.add(top);
    add(hp, x, fy + H - 0.75, z);
  }

  // cushions and a knitted blanket on the sofa
  const sofaX = (xw + xe) / 2 + 2.2, sofaZ = zs - 0.6;
  for (const [dx, c, r] of [[-0.75, 0xffd34d, 0.25], [0.7, 0x2fb38a, -0.2], [0.05, 0xff8a7a, 0.1]]) {
    const cu = mesh(new THREE.BoxGeometry(0.42, 0.38, 0.14), mat(c, { roughness: 1 }));
    cu.position.set(sofaX + dx, fy + 0.62, sofaZ - 0.22);
    cu.rotation.set(-0.3, 0, r);
    scene.add(cu);
  }
  const blanket = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.9), new THREE.MeshStandardMaterial({ map: P(128, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) { g.fillStyle = (y / 16) % 2 ? '#e8d4b0' : '#c25b3a'; g.fillRect(0, y, w, 16); } }), roughness: 1 }));
  blanket.position.set(sofaX + 0.75, fy + 0.45, sofaZ + 0.05);
  blanket.rotation.set(0, 0.2, 0.08);
  scene.add(blanket);

  // striped rug under the coffee table
  const rugTex = P(256, 160, (g, w, h) => {
    g.fillStyle = '#c96b3a'; g.fillRect(0, 0, w, h);
    ['#f3e6c8', '#3d7a3a', '#f3e6c8', '#ffd34d'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, 20 + i * 32, w, 10); });
    g.fillStyle = '#f3e6c8'; for (let x = 0; x < w; x += 8) { g.fillRect(x, 0, 3, 6); g.fillRect(x, h - 6, 3, 6); }
  });
  const rug = mesh(new THREE.PlaneGeometry(3.0, 2.0), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }), { cast: false });
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(cx + 0.7, fy + 0.014, (zn + zs) / 2 + 0.4);
  scene.add(rug);

  // the office cat, curled up asleep in a basket
  const cat = new THREE.Group();
  const bed = mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.12, 14), mat(0x8a5a32, { roughness: 1 })); bed.position.y = 0.06; cat.add(bed);
  const cushion = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14), mat(0xc9b6ff, { roughness: 1 })); cushion.position.y = 0.12; cat.add(cushion);
  const fur = mat(0xff9a4a, { roughness: 1, flatShading: true });
  const body = mesh(new THREE.SphereGeometry(0.17, 8, 6), fur); body.scale.set(1.2, 0.6, 1); body.position.y = 0.22; cat.add(body);
  const head = mesh(new THREE.SphereGeometry(0.09, 8, 6), fur); head.position.set(0.15, 0.22, 0.08); cat.add(head);
  for (const s of [-1, 1]) { const ear = mesh(new THREE.ConeGeometry(0.035, 0.06, 4), fur); ear.position.set(0.17 + s * 0.03, 0.31, 0.08 + s * 0.04); cat.add(ear); }
  const tail = mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10, Math.PI), fur); tail.rotation.x = Math.PI / 2; tail.position.y = 0.17; cat.add(tail);
  add(cat, sofaX - 1.55, fy, sofaZ - 0.1, 0.4);
  cat.userData.breathe = body;

  // the main light warmer and a little dimmer, for the cosy look
  return {
    update(t) {
      body.scale.y = 0.6 + Math.sin(t * 1.4) * 0.03; // the cat breathes
      const now = new Date();
      minute.rotation.z = -now.getMinutes() / 60 * Math.PI * 2;
      hour.rotation.z = -(now.getHours() % 12 + now.getMinutes() / 60) / 12 * Math.PI * 2;
    },
  };
}
