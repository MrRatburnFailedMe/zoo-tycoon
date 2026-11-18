import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { solidBox, staticBody, mat, mesh } from '../util/build.js';
import { heightAt } from './terrain.js';
import { GATE, GATE_W, TICKET_BOOTH, TURNSTILES } from './layout.js';
import { G } from '../physics.js';
import { sfx } from '../audio.js';
import { Register } from './register.js';
import { modelCopy, placeProp } from './props.js';

// The front gate: three tight turnstile lanes (you have to push through the arms), low walls either
// side so there's no way round, and a compact ticket booth. In the booth: a rolling stool on a rail
// along the counter, the cash register, a ticket printer, a card swipe reader and the desk computer.

const LANE_HALF = 0.425; // half the lane width
const ARM_Y = 0.92;

// A small canvas screen for a few lines of status text (register / reader displays).
function screen(w, h, px = 256) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const draw = (lines, bg = '#1f3b2c', fg = '#b6ffb0') => {
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const size = i === 0 ? c.height * 0.32 : c.height * 0.2;
      g.font = `800 ${size}px "Baloo 2", system-ui`;
      g.fillText(l, c.width / 2, c.height * (lines.length === 1 ? 0.5 : 0.3 + i * 0.3));
    });
    tex.needsUpdate = true;
  };
  return { m, draw };
}

export function buildGate(game) {
  const { scene } = game;
  const gy = heightAt(GATE.x, GATE.z);
  const BX = TICKET_BOOTH.x, BZ = TICKET_BOOTH.z;
  const CREAM = 0xf3e6c8, RED = 0xe2523c, STEEL = 0x50595a, GREEN = 0x2f6b3a, WOOD = 0x8a5a2b;
  const chrome = mat(0xd9dde0, { metalness: 0.7, roughness: 0.25 });

  // ---- turnstiles ----
  // cabinets between the lanes
  const cabX = [TURNSTILES[0] - 0.6, (TURNSTILES[0] + TURNSTILES[1]) / 2, (TURNSTILES[1] + TURNSTILES[2]) / 2, TURNSTILES[2] + 0.6];
  for (const x of cabX) {
    solidBox(game, { size: [0.3, 1.0, 1.3], pos: [x, gy + 0.5, GATE.z], color: GREEN });
    solidBox(game, { size: [0.36, 0.06, 1.36], pos: [x, gy + 1.03, GATE.z], color: 0xd6d6d6, collide: false });
    solidBox(game, { size: [0.32, 0.12, 1.32], pos: [x, gy + 0.06, GATE.z], color: 0x26292c, collide: false });
    // chrome guide rails on the lane sides
    for (const s of [-1, 1]) {
      const r = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8), chrome);
      r.rotation.x = Math.PI / 2;
      r.position.set(x + s * 0.17, gy + 0.85, GATE.z);
      scene.add(r);
    }
  }
  const turnstiles = [];
  TURNSTILES.forEach((lx, i) => {
    // the arms hang off the cabinet on the lane's west side, on an axis tilted 45° into the lane
    const hx = lx - LANE_HALF + 0.03;
    const hub = new THREE.Group();
    hub.position.set(hx, gy + ARM_Y, GATE.z);
    hub.rotation.z = -Math.PI / 4;
    const rotor = new THREE.Group();
    hub.add(rotor);
    for (let k = 0; k < 3; k++) {
      const f = (k / 3) * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(f), 1, Math.sin(f)).normalize();
      const arm = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), chrome);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      arm.position.copy(d).multiplyScalar(0.32);
      rotor.add(arm);
      const tip = mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0x222222));
      tip.position.copy(d).multiplyScalar(0.63);
      rotor.add(tip);
    }
    hub.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), mat(0x888888)));
    scene.add(hub);
    const light = mesh(new THREE.BoxGeometry(0.02, 0.08, 0.14), mat(0x44ff66, { emissive: 0x22ff44, emissiveIntensity: 1 }), { cast: false });
    light.position.set(hx - 0.12, gy + 1.03, GATE.z + 0.45);
    scene.add(light);
    // invisible bar across the lane: you have to push the arms round to get past
    const bar = staticBody(game, new CANNON.Box(new CANNON.Vec3(LANE_HALF, 0.55, 0.06)), lx, gy + 0.6, GATE.z, 0);
    turnstiles.push({ x: lx, i, rotor, light, bar, base: 0, angle: 0, side: 0, spin: 0 });
  });
  // low walls either side so the turnstiles are the only way through
  const wallTo = (x0, x1) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    solidBox(game, { size: [w, 1.25, 0.35], pos: [cx, gy + 0.62, GATE.z], color: 0xb9ad96 });
    solidBox(game, { size: [w + 0.04, 0.1, 0.45], pos: [cx, gy + 1.28, GATE.z], color: 0x8f846f, collide: false });
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.6) {
      const shrub = mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(x % 2 > 1 ? 0x4c8a3a : 0x5d9c44));
      shrub.position.set(x, gy + 1.45, GATE.z + 0.02);
      scene.add(shrub);
    }
  };
  wallTo(-GATE_W / 2 - 0.3, cabX[0] - 0.15);
  // the booth's west wall carries on to the turnstiles
  const W = 3.2, D = 2.8, H = 2.5, T = 0.14;
  wallTo(cabX[3] + 0.15, BX - W / 2);
  wallTo(BX + W / 2, GATE_W / 2 + 0.3);

  // ---- booth ----
  const by = heightAt(BX, BZ);
  const fy = by + 0.12;
  const front = BZ + D / 2; // the window wall faces the road (+Z)
  solidBox(game, { size: [W + 0.3, 0.2, D + 0.3], pos: [BX, by + 0.02, BZ], color: 0x9c9488 });
  solidBox(game, { size: [W - 0.1, 0.02, D - 0.1], pos: [BX, fy + 0.01, BZ], color: 0x6f8a9a, collide: false }); // lino
  solidBox(game, { size: [T, H, D], pos: [BX + W / 2, fy + H / 2, BZ], color: CREAM });
  solidBox(game, { size: [T, H, D], pos: [BX - W / 2, fy + H / 2, BZ], color: CREAM });
  // front: counter-height wall, wide window (half glass, half open hatch)
  solidBox(game, { size: [W, 1.0, T], pos: [BX, fy + 0.5, front], color: CREAM });
  solidBox(game, { size: [W, 0.4, T], pos: [BX, fy + H - 0.2, front], color: CREAM });
  for (const s of [-1, 1]) solidBox(game, { size: [0.16, H - 1.4, 0.16], pos: [BX + s * (W / 2 - 0.08), fy + 1.0 + (H - 1.4) / 2, front], color: CREAM, collide: false });
  game.glass.add(BX + 0.75, fy + 1.55, front, 1.3, 1.1, Math.PI / 2, { thick: 0.03, colliderThick: 0.04 });
  // back: door
  for (const s of [-1, 1]) solidBox(game, { size: [1.1, H, T], pos: [BX + s * 1.05, fy + H / 2, BZ - D / 2], color: CREAM });
  solidBox(game, { size: [1.0, 0.4, T], pos: [BX, fy + H - 0.2, BZ - D / 2], color: CREAM });
  // roof: candy-stripe awning
  for (let i = 0; i < 8; i++) solidBox(game, { size: [0.45, 0.1, D + 1.0], pos: [BX - W / 2 + 0.2 + i * 0.45, fy + H + 0.05, BZ + 0.3], color: i % 2 ? 0xffffff : RED, collide: i === 3 });
  solidBox(game, { size: [W + 0.3, 0.16, 0.08], pos: [BX, fy + H - 0.05, front + 0.82], color: RED, collide: false }); // scalloped edge (ish)
  // counter inside, under the window, plus a ledge outside
  const cy = fy + 1.02;
  solidBox(game, { size: [W - 0.2, 0.06, 0.62], pos: [BX, cy, front - 0.38], color: WOOD });
  solidBox(game, { size: [W - 0.2, 0.9, 0.06], pos: [BX, fy + 0.5, front - 0.66], color: 0x6b4426, collide: false }); // counter front panel
  solidBox(game, { size: [W - 0.4, 0.05, 0.3], pos: [BX, cy, front + 0.18], color: WOOD });
  // a little shelf of supplies on the back wall
  solidBox(game, { size: [0.9, 0.04, 0.3], pos: [BX + 1.0, fy + 1.6, BZ - D / 2 + 0.22], color: WOOD });
  for (let i = 0; i < 2; i++) solidBox(game, { size: [0.16, 0.22, 0.2], pos: [BX + 0.7 + i * 0.2, fy + 1.73, BZ - D / 2 + 0.22], color: [0xe2523c, 0xffd34d, 0x3f78c2, 0x2fb38a][i], collide: false });

  // ---- desk computer: prices, analytics and shopping only ----
  const mon = new THREE.Group();
  mon.position.set(BX - 1.2, cy + 0.03, front - 0.42);
  mon.rotation.y = -0.5;
  const dark = mat(0x22262b, { roughness: 0.5 });
  const stand = mesh(new THREE.BoxGeometry(0.26, 0.03, 0.2), dark);
  const neck = mesh(new THREE.BoxGeometry(0.05, 0.24, 0.04), dark); neck.position.y = 0.13;
  const bezel = mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), dark); bezel.position.y = 0.4;
  const disp = mesh(new THREE.PlaneGeometry(0.57, 0.33), new THREE.MeshBasicMaterial({ map: game.computer.texture, toneMapped: false }), { cast: false });
  disp.rotation.y = Math.PI;
  disp.position.set(0, 0.4, -0.022);
  mon.add(stand, neck, bezel, disp);
  scene.add(mon);
  const sc = new THREE.Vector3(0, 0.4, -0.03).applyAxisAngle(new THREE.Vector3(0, 1, 0), mon.rotation.y).add(mon.position);
  const back = new THREE.Vector3(0, 0, -0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), mon.rotation.y);
  const pose = { position: sc.clone().add(back).add(new THREE.Vector3(0, 0.02, 0)), target: sc };
  const pc = { label: 'Desk computer', interactLabel: 'Prices, analytics, shop', interact: () => game.computer.open(pose, 'gate') };
  mon.traverse((o) => (o.userData.entity = pc));
  game.pickables.push(mon);

  // ---- ticket printer ----
  const printer = new THREE.Group();
  printer.position.set(BX - 0.55, cy + 0.03, front - 0.45);
  printer.rotation.y = Math.PI; // tickets come out toward you
  const pbody = mesh(new THREE.BoxGeometry(0.3, 0.16, 0.26), mat(0xf2f2f2, { roughness: 0.4 })); pbody.position.y = 0.08;
  const ptop = mesh(new THREE.BoxGeometry(0.28, 0.03, 0.2), mat(0xe2523c)); ptop.position.set(0, 0.17, -0.02);
  const pslot = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.02), mat(0x111111)); pslot.position.set(0, 0.11, 0.13);
  const pbtn = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), mat(0x44ff66, { emissive: 0x22aa33, emissiveIntensity: 0.8 })); pbtn.position.set(0.1, 0.19, 0.05);
  const roll = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), mat(0xffb347)); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.19, -0.07);
  printer.add(pbody, ptop, pslot, pbtn, roll);
  scene.add(printer);
  let printCd = 0;
  const printerEntity = {
    label: 'Ticket printer', interactLabel: 'Print a ticket',
    interact() {
      if (printCd > 0) return;
      printCd = 0.45;
      const p = new THREE.Vector3(0, 0.12, 0.2).applyMatrix4(printer.matrixWorld);
      const it = game.items.spawn('ticket', p.x, p.y, p.z, { yaw: printer.rotation.y });
      const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), printer.rotation.y);
      it.body.velocity.set(out.x * 0.9, 0.6, out.z * 0.9);
      sfx.print();
      pbtn.scale.y = 0.4;
      setTimeout(() => (pbtn.scale.y = 1), 150);
    },
  };
  printer.traverse((o) => (o.userData.entity = printerEntity));
  game.pickables.push(printer);

  // ---- card swipe reader ----
  const reader = new THREE.Group();
  reader.position.set(BX + 0.05, cy + 0.03, front - 0.3);
  reader.rotation.y = Math.PI;
  const rb = mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), mat(0x2b2b2b)); rb.position.y = 0.05;
  const rail = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.035), mat(0x1a1a1a)); rail.position.set(0, 0.125, -0.03);
  const groove = mesh(new THREE.BoxGeometry(0.21, 0.04, 0.008), mat(0x050505)); groove.position.set(0, 0.13, -0.03);
  const rs = screen(0.12, 0.06);
  rs.m.position.set(0, 0.102, 0.03); rs.m.rotation.x = -Math.PI / 2 + 0.5;
  reader.add(rb, rail, groove, rs.m);
  scene.add(reader);
  const readerIdle = () => rs.draw(['SWIPE', 'CARD']);
  readerIdle();
  let readerT = 0;
  const swipeCard = { mesh: null, t: 0, payer: null };
  const readerEntity = {
    label: 'Card reader', interactLabel: 'Swipe card',
    interact() {
      const held = game.grabber.entity;
      if (held?.type !== 'card') { sfx.error(); rs.draw(['NEED', 'A CARD'], '#50200f', '#ffe0d8'); readerT = 1.2; return; }
      game.grabber.release();
      const payer = held.payer;
      game.items.remove(held);
      // the card slides through the slot
      const c = mesh(new THREE.BoxGeometry(0.085, 0.054, 0.004), mat(payer?.cardColor || 0x3f78c2, { metalness: 0.3, roughness: 0.4 }), { cast: false });
      reader.add(c);
      swipeCard.mesh = c; swipeCard.t = 0; swipeCard.payer = payer;
      sfx.swipe();
    },
  };
  reader.traverse((o) => (o.userData.entity = readerEntity));
  game.pickables.push(reader);

  // ---- cash register ----
  const register = new Register(game);
  const reg = new THREE.Group();
  reg.position.set(BX + 0.62, cy + 0.03, front - 0.42);
  reg.rotation.y = Math.PI - 0.25; // screen and keys face the cashier
  const drawer = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.38), mat(0x3a3f45)); drawer.position.y = 0.05;
  const rbody = mesh(new THREE.BoxGeometry(0.4, 0.14, 0.26), mat(0xffd34d, { roughness: 0.5 })); rbody.position.set(0, 0.17, -0.04);
  const keysG = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.14), mat(0x2b2b2b)); keysG.position.set(0, 0.25, 0.02); keysG.rotation.x = 0.35;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    const key = mesh(new THREE.BoxGeometry(0.05, 0.015, 0.03), mat(k === 3 ? 0xe2523c : 0xf3e6c8), { cast: false });
    key.position.set(-0.1 + k * 0.067, 0.262 + r * 0.012, -0.03 + r * 0.04);
    key.rotation.x = 0.35;
    reg.add(key);
  }
  const rsc = screen(0.22, 0.09);
  rsc.m.position.set(0, 0.36, -0.12);
  rsc.m.rotation.x = -0.25;
  const rscBack = mesh(new THREE.BoxGeometry(0.24, 0.11, 0.03), mat(0x2b2b2b)); rscBack.position.set(0, 0.36, -0.135); rscBack.rotation.x = -0.25;
  const post = mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), mat(0x2b2b2b)); post.position.set(0, 0.28, -0.13);
  reg.add(drawer, rbody, keysG, rscBack, rsc.m, post);
  scene.add(reg);
  const regIdle = () => rsc.draw(['ZOO REG', `$${game.state.ticketPrice} / ticket`], '#0f3550', '#e6f4ff');
  regIdle();
  game.state.on(() => { if (regT <= 0) regIdle(); });
  let regT = 0;
  const regEntity = {
    label: 'Cash register', interactLabel: 'Open register',
    interact() {
      const held = game.grabber.entity;
      if (held?.type === 'cash') { game.grabber.release(); register.open(held); }
      else register.open(null);
    },
  };
  reg.traverse((o) => (o.userData.entity = regEntity));
  game.pickables.push(reg);
  register.onSale = (lines) => { rsc.draw(lines, '#0f5032', '#d8ffe0'); regT = 2.5; drawer.position.z = 0.12; setTimeout(() => (drawer.position.z = 0), 900); };

  // ---- rolling stool on a rail behind the counter ----
  const stool = new THREE.Group();
  const seatY = fy + 0.72;
  const seatMesh = mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.08, 16), mat(0x2b2b2b, { roughness: 0.8 })); seatMesh.position.y = 0.72;
  const backrest = mesh(new THREE.BoxGeometry(0.34, 0.26, 0.05), mat(0x2b2b2b)); backrest.position.set(0, 1.0, -0.2);
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), chrome); pole.position.y = 0.38;
  const ring = mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 16), chrome); ring.rotation.x = Math.PI / 2; ring.position.y = 0.38;
  stool.add(seatMesh, backrest, pole, ring);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const leg = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), chrome);
    leg.position.set(Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14);
    leg.rotation.y = a;
    const wheel = mesh(new THREE.SphereGeometry(0.03, 6, 4), mat(0x111111));
    wheel.position.set(Math.sin(a) * 0.27, 0.03, Math.cos(a) * 0.27);
    stool.add(leg, wheel);
  }
  scene.add(stool);
  // the real chair model (Quaternius) replaces the box stool once it loads
  modelCopy('assets/officechair.glb', { height: 1.05, recolor: (m) => (m.color && m.color.b > m.color.r * 1.4 ? new THREE.Color(0xe2523c) : null) }).then((m) => {
    if (!m) return;
    stool.children.forEach((c) => (c.visible = false));
    m.scale.multiplyScalar(1.12); // a tall counter chair
    stool.add(m);
  });
  // a power box on the booth's back wall and a radio on the shelf
  placeProp(game, 'assets/powerbox.glb', { x: BX - W / 2 + 0.35, y: fy, z: BZ - D / 2 + 0.25, height: 1.2, collide: false });
  game.items.spawn('radio', BX + 1.22, fy + 1.78, BZ - D / 2 + 0.24, { yaw: 0 });
  const RAIL = { x0: BX - 1.15, x1: BX + 1.15, z: front - 1.0 };
  solidBox(game, { size: [RAIL.x1 - RAIL.x0 + 0.3, 0.02, 0.06], pos: [BX, fy + 0.02, RAIL.z], color: 0x999999, collide: false });
  const chair = {
    seat: true, label: 'Stool', interactLabel: 'Sit at the window',
    x: BX, vx: 0,
    interact() {
      const p = game.player;
      if (p.driving) return;
      game.grabber.release();
      p.driving = this;
      p.body.collisionResponse = false;
      p.yaw = Math.PI; // face the window (+Z)
      p.pitch = -0.05;
      sfx.click();
    },
    stand() {
      const p = game.player;
      p.driving = null;
      p.body.position.set(this.x, fy + 1.0, RAIL.z - 0.5);
      p.body.velocity.set(0, 0, 0);
      p.body.collisionResponse = true;
    },
    update(dt) {
      const input = game.input, p = game.player;
      if (p.driving !== this || game.mode !== 'play') { this.vx = 0; return; }
      if (input.justPressed('Space') || input.justPressed('KeyS')) { this.stand(); return; }
      // A/D roll along the counter, relative to which way you're facing
      const push = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      this.vx += push * Math.cos(p.yaw) * 14 * dt;
      this.vx *= 1 - Math.min(1, dt * 6);
      this.x = THREE.MathUtils.clamp(this.x + this.vx * dt, RAIL.x0, RAIL.x1);
      if (this.x === RAIL.x0 || this.x === RAIL.x1) this.vx = 0;
    },
  };
  stool.traverse((o) => (o.userData.entity = chair));
  game.pickables.push(stool);
  game.world.addEventListener('preStep', () => {
    const p = game.player;
    if (p.driving !== chair) return;
    p.body.position.set(chair.x, seatY + 0.2, RAIL.z);
    p.body.velocity.set(0, 0, 0);
    p.body.force.y -= p.body.mass * game.world.gravity.y;
  });

  const trayAt = new THREE.Vector3(BX + 0.3, cy + 0.12, front - 0.15); // where customers put their cash / card

  return {
    turnstiles,
    chair,
    register,
    window: new THREE.Vector3(BX + 0.3, by, front + 0.95), // where the customer at the front of the queue stands
    trayAt,
    // A visitor at the window hands over their payment.
    handOver(v) {
      const x = trayAt.x + (Math.random() - 0.5) * 0.2, z = trayAt.z;
      const it = game.items.spawn(v.byCard ? 'card' : 'cash', x, trayAt.y, z, { yaw: Math.PI + (Math.random() - 0.5) * 0.6, color: v.cardColor, value: v.tender });
      it.payer = v;
      if (!v.byCard) it.value = v.tender;
      sfx.click();
      return it;
    },
    // a visitor walking through spins the arms
    pass(i) {
      const ts = turnstiles[i];
      if (ts.spin <= 0) { ts.spin = 1; sfx.click(); }
    },
    update(dt) {
      printCd -= dt;
      chair.update(dt);
      stool.position.set(chair.x, fy, RAIL.z);
      if (game.player.driving === chair) stool.rotation.y = game.player.yaw + Math.PI;

      // turnstiles: the arms turn with you as you push through
      const pp = game.player.body.position;
      for (const ts of turnstiles) {
        const inLane = Math.abs(pp.x - ts.x) < LANE_HALF + 0.05 && Math.abs(pp.z - GATE.z) < 0.85 && Math.abs(pp.y - gy - 0.9) < 1.2;
        if (inLane) {
          if (!ts.side) ts.side = Math.sign(pp.z - GATE.z) || 1;
          const prog = THREE.MathUtils.clamp(0.5 - ts.side * (pp.z - GATE.z) / 1.3, 0, 1);
          ts.angle = ts.side * prog * (Math.PI * 2 / 3);
          ts.bar.collisionResponse = false;
          if (prog > 0.95 && !ts.clicked) { ts.clicked = true; sfx.click(); }
        } else {
          if (ts.side) {
            const done = Math.abs(ts.angle) > Math.PI / 3;
            if (done) ts.base += ts.angle >= 0 ? Math.PI * 2 / 3 : -Math.PI * 2 / 3;
            ts.angle = 0;
            ts.side = 0;
            ts.clicked = false;
          }
          ts.bar.collisionResponse = true;
        }
        if (ts.spin > 0) { ts.spin = Math.max(0, ts.spin - dt * 1.6); ts.angle = (1 - ts.spin) * (Math.PI * 2 / 3); if (!ts.spin) { ts.base += Math.PI * 2 / 3; ts.angle = 0; } }
        ts.rotor.rotation.y += (ts.base + ts.angle - ts.rotor.rotation.y) * Math.min(1, dt * 18);
        ts.light.material.emissive.setHex(inLane || ts.spin > 0 ? 0xff9900 : 0x22ff44);
      }

      // a swiped card runs through the slot, then the reader approves it
      if (swipeCard.mesh) {
        swipeCard.t += dt;
        const k = Math.min(1, swipeCard.t / 0.35);
        swipeCard.mesh.position.set(-0.12 + k * 0.24, 0.14, -0.03);
        if (swipeCard.t > 0.6) {
          reader.remove(swipeCard.mesh);
          swipeCard.mesh = null;
          const v = swipeCard.payer;
          if (v && v.awaitingPayment) {
            const amt = game.state.sellTickets(v.n, true);
            v.paidUp();
            rs.draw(['APPROVED', `$${amt}`], '#0f5032', '#d8ffe0');
            sfx.beep();
          } else { rs.draw(['NO SALE', ''], '#50200f', '#ffe0d8'); sfx.error(); }
          readerT = 2;
        }
      }
      if (readerT > 0 && (readerT -= dt) <= 0) readerIdle();
      if (regT > 0 && (regT -= dt) <= 0) regIdle();
    },
  };
}
