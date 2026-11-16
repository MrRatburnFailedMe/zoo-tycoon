import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidBox, staticBody, mat, mesh } from '../util/build.js';
import { canvasTexture, signTexture } from '../util/textures.js';
import { heightAt } from './terrain.js';
import { GATE, TICKET_BOOTH, TURNSTILES, ATM } from './layout.js';
import { ITEMS } from '../items.js';
import { sfx } from '../audio.js';

// The front gate: a row of turnstiles, the ticket desk booth (window onto the queue outside, with a
// computer, a card reader, a cash tray and a big pile of tickets), and an ATM just inside the zoo.

// A small canvas screen that can show a couple of lines of text.
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
      const size = i === 0 ? c.height * 0.3 : c.height * 0.17;
      g.font = `800 ${size}px "Baloo 2", system-ui`;
      g.fillText(l, c.width / 2, c.height * (lines.length === 1 ? 0.5 : 0.3 + i * 0.24));
    });
    tex.needsUpdate = true;
  };
  return { m, draw };
}

export function buildGate(game) {
  const { scene } = game;
  const gy = heightAt(GATE.x, GATE.z);
  const BX = TICKET_BOOTH.x, BZ = TICKET_BOOTH.z;
  const CREAM = 0xf3e6c8, RED = 0xe2523c, STEEL = 0x50595a;

  // ---- turnstiles ----
  const turnstiles = [];
  for (const x of [-3.9, -1.3, 1.3, 3.9]) {
    solidBox(game, { size: [0.12, 1.0, 2.2], pos: [x, gy + 0.5, GATE.z], color: STEEL });
    solidBox(game, { size: [0.16, 0.08, 2.3], pos: [x, gy + 1.02, GATE.z], color: 0xc9c1b0, collide: false });
  }
  for (const lx of TURNSTILES) {
    solidBox(game, { size: [0.34, 1.0, 0.7], pos: [lx + 1.0, gy + 0.5, GATE.z], color: 0x2f6b3a });
    solidBox(game, { size: [0.38, 0.06, 0.74], pos: [lx + 1.0, gy + 1.03, GATE.z], color: 0xd6d6d6, collide: false });
    const light = mesh(new THREE.BoxGeometry(0.02, 0.08, 0.14), mat(0x44ff66, { emissive: 0x22ff44, emissiveIntensity: 1 }), { cast: false });
    light.position.set(lx + 0.82, gy + 0.9, GATE.z + 0.2);
    scene.add(light);
    // three-armed rotor on an axis tilted 45° into the lane; the arms sit on a 45° cone around it,
    // so one of them always sticks straight out across the lane
    const hub = new THREE.Group();
    hub.position.set(lx + 0.82, gy + 0.9, GATE.z);
    hub.rotation.z = Math.PI / 4;
    const rotor = new THREE.Group();
    hub.add(rotor);
    const armMat = mat(0xd9dde0, { metalness: 0.6, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const f = Math.PI + (i / 3) * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(f), 1, Math.sin(f)).normalize();
      const arm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6), armMat);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      arm.position.copy(d).multiplyScalar(0.33);
      rotor.add(arm);
    }
    hub.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), mat(0x888888)));
    scene.add(hub);
    turnstiles.push({ x: lx, rotor, light, turn: 0, base: 0 });
  }
  // planter on the west side of the opening
  solidBox(game, { size: [5.2, 0.9, 1.2], pos: [-6.9, gy + 0.45, GATE.z], color: 0x9c8f7a });
  for (let i = 0; i < 6; i++) {
    const b = mesh(new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.12, 0), mat(i % 2 ? 0x4c8a3a : 0x5d9c44));
    b.position.set(-9 + i * 0.85, gy + 1.1, GATE.z + (i % 2 ? 0.2 : -0.2));
    scene.add(b);
  }

  // ---- booth ----
  const by = heightAt(BX, BZ);
  const W = 4, D = 4, H = 2.6, T = 0.15;
  solidBox(game, { size: [W + 0.3, 0.2, D + 0.3], pos: [BX, by + 0.02, BZ], color: 0x9c9488 });
  const fy = by + 0.12;
  solidBox(game, { size: [T, H, D], pos: [BX + W / 2, fy + H / 2, BZ], color: CREAM });
  solidBox(game, { size: [T, H, D], pos: [BX - W / 2, fy + H / 2, BZ], color: CREAM });
  // front (outside, +Z): counter-height wall, big window above
  solidBox(game, { size: [W, 1.0, T], pos: [BX, fy + 0.5, BZ + D / 2], color: CREAM });
  solidBox(game, { size: [W, 0.45, T], pos: [BX, fy + H - 0.22, BZ + D / 2], color: CREAM });
  for (const s of [-1, 1]) solidBox(game, { size: [0.2, H - 1.45, 0.2], pos: [BX + s * (W / 2 - 0.1), fy + 1.0 + (H - 1.45) / 2, BZ + D / 2], color: CREAM, collide: false });
  game.glass.add(BX - 0.85, fy + 1.55, BZ + D / 2, 1.6, 1.1, Math.PI / 2, { thick: 0.03, colliderThick: 0.04 }); // half window glass, half open hatch
  // back (inside, -Z): door in the middle
  for (const s of [-1, 1]) solidBox(game, { size: [1.3, H, T], pos: [BX + s * 1.35, fy + H / 2, BZ - D / 2], color: CREAM });
  solidBox(game, { size: [1.4, 0.4, T], pos: [BX, fy + H - 0.2, BZ - D / 2], color: CREAM });
  // roof: candy-stripe awning
  for (let i = 0; i < 9; i++) solidBox(game, { size: [0.5, 0.12, D + 1.2], pos: [BX - 2 + i * 0.5, fy + H + 0.06, BZ + 0.3], color: i % 2 ? 0xffffff : RED, collide: i === 4 });
  const sign = mesh(new THREE.BoxGeometry(3.2, 0.7, 0.1), [mat(0x5b3a1e), mat(0x5b3a1e), mat(0x5b3a1e), mat(0x5b3a1e),
    new THREE.MeshStandardMaterial({ map: signTexture('TICKETS', { bg: '#e2523c', fg: '#fff', edge: '#5b3a1e', size: 150, sub: 'ALL DAY · ALL ANIMALS' }) }), mat(0x5b3a1e)]);
  sign.position.set(BX, fy + H + 0.55, BZ + D / 2 + 0.6);
  scene.add(sign);
  // counter inside, under the window
  const cy = fy + 1.02;
  solidBox(game, { size: [W - 0.3, 0.06, 0.75], pos: [BX, cy, BZ + D / 2 - 0.42], color: 0x8a5a2b });
  solidBox(game, { size: [W - 0.3, 0.05, 0.35], pos: [BX, cy, BZ + D / 2 + 0.2], color: 0x8a5a2b }); // outside ledge
  solidBox(game, { size: [0.6, 0.75, 0.6], pos: [BX + 1.4, fy + 0.4, BZ - 1.2], color: 0x6b4426 }); // stool-ish cabinet

  // ---- desk computer (shares the office OS; opens on the Gate Desk app) ----
  const mon = new THREE.Group();
  mon.position.set(BX - 1.15, cy + 0.03, BZ + D / 2 - 0.5);
  const dark = mat(0x22262b, { roughness: 0.5 });
  const stand = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.25), dark);
  const neck = mesh(new THREE.BoxGeometry(0.06, 0.28, 0.05), dark); neck.position.y = 0.15;
  const bezel = mesh(new THREE.BoxGeometry(0.82, 0.5, 0.04), dark); bezel.position.y = 0.48;
  const disp = mesh(new THREE.PlaneGeometry(0.76, 0.44), new THREE.MeshBasicMaterial({ map: game.computer.texture, toneMapped: false }), { cast: false });
  disp.rotation.y = Math.PI;
  disp.position.set(0, 0.48, -0.022);
  mon.add(stand, neck, bezel, disp);
  scene.add(mon);
  const sc = new THREE.Vector3(mon.position.x, mon.position.y + 0.48, mon.position.z - 0.03);
  const pose = { position: sc.clone().add(new THREE.Vector3(0, 0.02, -0.55)), target: sc };
  const pc = { label: 'Gate computer', interactLabel: 'Use computer', interact: () => game.computer.open(pose, 'gate') };
  mon.traverse((o) => (o.userData.entity = pc));
  game.pickables.push(mon);

  // ---- card reader on the outside ledge, facing the queue ----
  const reader = new THREE.Group();
  reader.position.set(BX + 0.3, cy + 0.03, BZ + D / 2 + 0.22);
  const rb = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.24), mat(0x2b2b2b));
  const rh = mesh(new THREE.BoxGeometry(0.15, 0.2, 0.05), mat(0x333333)); rh.position.set(0, 0.12, -0.05); rh.rotation.x = -0.4;
  const rs = screen(0.12, 0.09);
  rs.m.position.set(0, 0.13, -0.02); rs.m.rotation.x = -0.4;
  reader.add(rb, rh, rs.m);
  scene.add(reader);
  const readerIdle = () => rs.draw(['TAP', `CARD · $${game.state.ticketPrice}`]);
  readerIdle();
  let readerT = 0;

  // ---- the ticket pile: grab it and a ticket comes off the top ----
  const tickets = [];
  const one = ITEMS.ticket.build().group.children[0];
  for (let i = 0; i < 46; i++) {
    const g = one.geometry.clone();
    g.rotateY((Math.random() - 0.5) * 1.2);
    g.translate((Math.random() - 0.5) * 0.12, i * 0.011 + (i > 30 ? (i - 30) * 0.004 : 0), (Math.random() - 0.5) * 0.08);
    tickets.push(g);
  }
  const pileMesh = mesh(mergeGeometries(tickets.map((g) => { g.clearGroups(); return g; })), one.material[2]);
  const pile = new THREE.Group();
  pile.add(pileMesh);
  pile.position.set(BX + 1.25, cy + 0.035, BZ + D / 2 - 0.45);
  scene.add(pile);
  const pileEntity = {
    label: 'Ticket pile',
    getGrabBody() {
      const p = pile.position;
      const it = game.items.spawn('ticket', p.x, p.y + 0.6, p.z, { yaw: Math.random() * 6 });
      sfx.click();
      it.body.itemOwner = it;
      return it.body;
    },
  };
  pile.traverse((o) => (o.userData.entity = pileEntity));
  game.pickables.push(pile);
  // a few loose ones fanned out next to it
  for (let i = 0; i < 4; i++) game.items.spawn('ticket', BX + 0.9 - i * 0.12, cy + 0.08 + i * 0.02, BZ + D / 2 - 0.35, { yaw: i * 0.5 });

  // cash tray: where paying visitors leave their notes
  solidBox(game, { size: [0.5, 0.05, 0.3], pos: [BX + 0.6, cy + 0.04, BZ + D / 2 + 0.22], color: 0x3d7a3a, collide: false, block: false });
  const trayAt = new THREE.Vector3(BX + 0.6, cy + 0.15, BZ + D / 2 - 0.1);

  // ---- ATM, just inside the zoo ----
  const ay = heightAt(ATM.x, ATM.z);
  const atm = new THREE.Group();
  atm.position.set(ATM.x, ay, ATM.z);
  atm.rotation.y = -Math.PI / 2; // screen faces west, toward the road
  const body = mesh(new THREE.BoxGeometry(0.95, 1.9, 0.7), mat(0x1e6091)); body.position.y = 0.95;
  const hood = mesh(new THREE.BoxGeometry(1.05, 0.25, 0.85), mat(0x174a70)); hood.position.set(0, 1.95, 0.05);
  const panel = mesh(new THREE.BoxGeometry(0.8, 0.9, 0.06), mat(0xd9e2ea)); panel.position.set(0, 1.15, 0.36);
  const as = screen(0.5, 0.36, 320);
  as.m.position.set(0, 1.35, 0.4);
  const slot = mesh(new THREE.BoxGeometry(0.4, 0.04, 0.05), mat(0x111111)); slot.position.set(0, 0.95, 0.4);
  const keys = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), mat(0x888888)); keys.position.set(0, 0.85, 0.45); keys.rotation.x = 0.5;
  atm.add(body, hood, panel, as.m, slot, keys);
  const logo = mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: signTexture('ZooBank ATM', { bg: '#1e6091', fg: '#fff', edge: '#174a70', size: 120 }), toneMapped: false }), { cast: false });
  logo.position.set(0, 1.95, 0.48);
  atm.add(logo);
  scene.add(atm);
  staticBody(game, new CANNON.Box(new CANNON.Vec3(0.35, 0.95, 0.48)), ATM.x, ay + 0.95, ATM.z, -Math.PI / 2);
  const money = (n) => `$${Math.round(n).toLocaleString()}`;
  const atmIdle = () => as.draw(['ZooBank', `Balance ${money(game.state.money)}`, `Cash to deposit ${money(game.state.cash)}`], '#0f3550', '#e6f4ff');
  atmIdle();
  game.state.on(() => { if (atmT <= 0) atmIdle(); if (readerT <= 0) readerIdle(); });
  let atmT = 0;
  const slotAt = new THREE.Vector3(ATM.x - 0.42, ay + 0.95, ATM.z);
  const deposit = (it) => {
    const n = game.state.deposit(it.value ?? 15);
    game.items.remove(it);
    sfx.cash();
    as.draw(['DEPOSITED', money(n), `Balance ${money(game.state.money)}`], '#0f5032', '#d8ffe0');
    atmT = 2.5;
    game.animals.shout(`+${money(n)} banked`, slotAt.x, slotAt.y + 1.2, slotAt.z, '#7cd05a');
  };
  const atmEntity = {
    label: 'ATM', interactLabel: 'Deposit cash',
    interact() {
      const held = game.grabber.entity;
      if (held?.type === 'cash') { game.grabber.release(); deposit(held); return; }
      // no cash in hand: feed in every note lying within reach
      const near = game.items.list.filter((it) => it.type === 'cash' && it.body.position.distanceTo(slotAt) < 3);
      if (near.length) { for (const it of near) deposit(it); return; }
      sfx.error();
      as.draw(['NO CASH', 'Bring notes from', 'the ticket desk'], '#50200f', '#ffe0d8');
      atmT = 2;
    },
  };
  atm.traverse((o) => (o.userData.entity = atmEntity));
  game.pickables.push(atm);

  return {
    turnstiles,
    window: new THREE.Vector3(BX - 0.3, by, BZ + D / 2 + 1.0), // where the customer at the front of the queue stands
    trayAt,
    // The visitor at the window has been given a ticket and pays.
    pay(byCard, visitorPos) {
      const price = game.state.sellTicket(byCard);
      if (byCard) {
        rs.draw(['APPROVED', `$${price} · thank you!`], '#0f5032', '#d8ffe0');
        sfx.beep();
        readerT = 2;
        game.animals.shout('*beep*', reader.position.x, reader.position.y + 0.5, reader.position.z, '#b6ffb0');
      } else {
        const it = game.items.spawn('cash', trayAt.x + (Math.random() - 0.5) * 0.2, trayAt.y, trayAt.z + (Math.random() - 0.5) * 0.1);
        it.value = price;
        sfx.cash();
        game.animals.shout(`$${price} cash`, visitorPos.x, visitorPos.y + 2.1, visitorPos.z, '#7cd05a');
      }
    },
    // spin a turnstile when someone walks through it
    pass(i) {
      const ts = turnstiles[i];
      if (ts.turn <= 0) { ts.turn = 1; sfx.click(); }
    },
    update(dt) {
      for (const ts of turnstiles) {
        if (ts.turn > 0) {
          ts.turn = Math.max(0, ts.turn - dt * 2.5);
          ts.rotor.rotation.y = ts.base + (1 - ts.turn) * (Math.PI * 2 / 3);
          if (ts.turn === 0) ts.base += Math.PI * 2 / 3;
        }
      }
      if (readerT > 0 && (readerT -= dt) <= 0) readerIdle();
      if (atmT > 0 && (atmT -= dt) <= 0) atmIdle();
      // notes dropped into the ATM slot get deposited
      for (const it of game.items.list) if (it.type === 'cash' && game.grabber.entity !== it && it.body.position.distanceTo(slotAt) < 0.45) { deposit(it); break; }
    },
  };
}
