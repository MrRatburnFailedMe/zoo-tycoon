import * as THREE from 'three';
import { buildCozy } from './cozy.js';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { solidBox, mat, mesh, BLOCKER } from '../util/build.js';
import { canvasTexture, plankTexture, signTexture } from '../util/textures.js';
import { heightAt } from './terrain.js';
import { OFFICE } from './layout.js';
import { sfx } from '../audio.js';

const H = 3.0; // wall height
const T = 0.2; // wall thickness
const WALL = 0xf2e8d5, TRIM = 0x6b4a2e;

// Build a straight wall from A to B out of segments: ['solid', len] | ['window', len] | ['door', len].
function wall(game, ax, az, bx, bz, segs, baseY, glass) {
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L, uz = (bz - az) / L;
  const yaw = -Math.atan2(uz, ux);
  let s = 0;
  for (const [type, len] of segs) {
    const c = s + len / 2;
    const cx = ax + ux * c, cz = az + uz * c;
    const piece = (y0, y1, opts = {}) => solidBox(game, { size: [len, y1 - y0, opts.t || T], pos: [cx, baseY + (y0 + y1) / 2, cz], yaw, color: opts.color || WALL, material: opts.material });
    if (type === 'solid') piece(0, H);
    else if (type === 'door') piece(2.4, H);
    else if (type === 'window') {
      piece(0, 1.0);
      piece(2.2, H);
      piece(0.97, 1.03, { color: TRIM, t: T + 0.12 }); // sill
      const g = piece(1.0, 2.2, { material: glass, t: 0.04 });
      g.castShadow = false;
    }
    s += len;
  }
}

export function buildOffice(game) {
  const { scene } = game;
  const { x: ox, z: oz, w, d } = OFFICE;
  const floorY = heightAt(ox, oz) + 0.18;
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28 });

  // Foundation + wooden floor.
  solidBox(game, { size: [w + 0.6, 4, d + 0.6], pos: [ox, floorY - 2, oz], color: 0xa59f94 });
  const planks = plankTexture();
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(3, 2);
  const floor = mesh(new THREE.PlaneGeometry(w - 0.1, d - 0.1), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.6 }), { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ox, floorY + 0.005, oz);
  scene.add(floor);
  // Ramp up to the door.
  solidBox(game, { size: [1.8, 0.2, 2.2], pos: [ox + w / 2 + 1.0, floorY - 0.12, oz], color: 0xa59f94 });

  // Walls. North/south run along X; east/west run along Z between them.
  const xw = ox - w / 2, xe = ox + w / 2, zn = oz - d / 2, zs = oz + d / 2;
  const longWall = [['solid', 1.5], ['window', 2.2], ['solid', 3.6], ['window', 2.2], ['solid', 1.5]];
  wall(game, xw, zn, xe, zn, longWall, floorY, glass);
  wall(game, xw, zs, xe, zs, longWall, floorY, glass);
  wall(game, xw, zn + T / 2, xw, zs - T / 2, [['solid', d - T]], floorY, glass);
  wall(game, xe, zn + T / 2, xe, zs - T / 2, [['solid', 0.8], ['window', 1.6], ['solid', 0.7], ['door', 1.6], ['solid', 0.7], ['window', 1.6], ['solid', 0.8]], floorY, glass);

  // Roof with overhang + trim.
  solidBox(game, { size: [w + 0.9, 0.28, d + 0.9], pos: [ox, floorY + H + 0.14, oz], color: 0x4b5560 });
  solidBox(game, { size: [w + 1.0, 0.12, d + 1.0], pos: [ox, floorY + H + 0.34, oz], color: 0x3a434c, collide: false });

  // Interior light.
  const lamp = new THREE.PointLight(0xffc98a, 13, 14, 1.6); // warm and cosy
  lamp.position.set(ox, floorY + 2.6, oz);
  scene.add(lamp);
  const panel = mesh(new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0xffffff, { emissive: 0xfff2d0, emissiveIntensity: 2 }), { cast: false });
  panel.position.set(ox, floorY + H - 0.03, oz);
  scene.add(panel);

  // ---- Hinged physics door ----
  const doorW = 1.5, doorH = 2.35;
  const hinge = new CANNON.Body({ mass: 0 });
  hinge.position.set(xe, floorY + 1.22, oz - doorW / 2);
  game.world.addBody(hinge);
  const doorBody = new CANNON.Body({ mass: 20, material: game.mats.item, angularDamping: 0.75, linearDamping: 0.2, collisionFilterGroup: G.ITEM, collisionFilterMask: MASK.ITEM });
  doorBody.addShape(new CANNON.Box(new CANNON.Vec3(0.03, doorH / 2, doorW / 2)));
  doorBody.position.set(xe, floorY + 1.22, oz);
  game.world.addBody(doorBody);
  game.world.addConstraint(new CANNON.HingeConstraint(hinge, doorBody, {
    pivotA: new CANNON.Vec3(0, 0, 0), axisA: new CANNON.Vec3(0, 1, 0),
    pivotB: new CANNON.Vec3(0, 0, -doorW / 2), axisB: new CANNON.Vec3(0, 1, 0),
  }));
  const door = new THREE.Group();
  door.add(mesh(new THREE.BoxGeometry(0.06, doorH, doorW), mat(0x8a5a32)));
  for (const py of [0.5, -0.45]) {
    const p = mesh(new THREE.BoxGeometry(0.08, 0.7, doorW - 0.4), mat(0x9c6a3e));
    p.position.y = py;
    door.add(p);
  }
  const knob = mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0xd4af37, { metalness: 0.8, roughness: 0.3 }));
  knob.position.set(0.08, -0.1, doorW / 2 - 0.15);
  const knob2 = knob.clone();
  knob2.position.x = -0.08;
  door.add(knob, knob2);
  scene.add(door);
  const doorEntity = { label: 'Door', getGrabBody: () => doorBody };
  door.traverse((o) => (o.userData.entity = doorEntity));
  game.pickables.push(door);
  game.links.push({ body: doorBody, object: door });

  // ---- Furniture ----
  const fy = floorY;
  // Desk against the west wall.
  const deskX = xw + T / 2 + 0.45, deskZ = oz - 1.0;
  solidBox(game, { size: [0.85, 0.06, 1.9], pos: [deskX, fy + 0.76, deskZ], color: 0x8a5a32 });
  for (const sz of [-0.85, 0.85]) solidBox(game, { size: [0.75, 0.73, 0.06], pos: [deskX, fy + 0.365, deskZ + sz], color: 0x6b4426 });
  solidBox(game, { size: [0.7, 0.55, 0.45], pos: [deskX, fy + 0.45, deskZ + 0.55], color: 0x7a4e2c, collide: false });

  // Computer monitor (facing +X, into the room).
  const mon = new THREE.Group();
  mon.position.set(xw + T / 2 + 0.3, fy + 0.79, deskZ - 0.2);
  const dark = mat(0x22262b, { roughness: 0.5 });
  const base = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.4), dark); base.position.y = 0.015;
  const neck = mesh(new THREE.BoxGeometry(0.05, 0.32, 0.08), dark); neck.position.set(-0.04, 0.18, 0);
  const bezel = mesh(new THREE.BoxGeometry(0.05, 0.62, 1.02), dark); bezel.position.set(0, 0.62, 0);
  const screen = mesh(new THREE.PlaneGeometry(0.94, 0.55), new THREE.MeshBasicMaterial({ map: game.computer.texture, toneMapped: false }), { cast: false });
  screen.rotation.y = Math.PI / 2;
  screen.position.set(0.027, 0.63, 0);
  mon.add(base, neck, bezel, screen);
  const kb = mesh(new THREE.BoxGeometry(0.18, 0.02, 0.5), mat(0x2d3238)); kb.position.set(0.32, 0.01, 0.05);
  const mouse = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), mat(0x2d3238)); mouse.position.set(0.3, 0.015, 0.42);
  mon.add(kb, mouse);
  scene.add(mon);
  const screenCenter = new THREE.Vector3(mon.position.x + 0.03, mon.position.y + 0.63, mon.position.z);
  const pose = {
    position: screenCenter.clone().add(new THREE.Vector3(0.62, 0.02, 0)),
    target: screenCenter,
  };
  const pcEntity = { label: 'Computer', interactLabel: 'Use Computer', interact: () => game.computer.open(pose) };
  mon.traverse((o) => (o.userData.entity = pcEntity));
  game.pickables.push(mon);

  // Desk lamp.
  const dl = new THREE.Group();
  dl.position.set(deskX - 0.15, fy + 0.79, deskZ + 0.7);
  const dlb = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 8), mat(0x2f6b3a)); dl.add(dlb);
  const dla = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), mat(0x2f6b3a)); dla.position.y = 0.2; dla.rotation.z = 0.3; dl.add(dla);
  const dlh = mesh(new THREE.ConeGeometry(0.1, 0.15, 8, 1, true), mat(0x2f6b3a, { side: THREE.DoubleSide })); dlh.position.set(0.1, 0.38, 0); dlh.rotation.z = 2.2; dl.add(dlh);
  scene.add(dl);

  // Filing cabinet, water cooler, sofa, side table.
  solidBox(game, { size: [0.55, 1.3, 0.6], pos: [xw + 0.45, fy + 0.65, zn + 0.5], color: 0x8f969c });
  for (let i = 0; i < 3; i++) solidBox(game, { size: [0.02, 0.02, 0.2], pos: [xw + 0.74, fy + 0.3 + i * 0.4, zn + 0.5], color: 0x333333, collide: false, block: false });
  solidBox(game, { size: [0.4, 0.95, 0.4], pos: [xe - 0.45, fy + 0.475, zn + 0.45], color: 0xe9eef2 });
  const bottle = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0x6ec3f0, transparent: true, opacity: 0.7, roughness: 0.1 }));
  bottle.position.set(xe - 0.45, fy + 1.18, zn + 0.45);
  scene.add(bottle);
  solidBox(game, { size: [2.2, 0.42, 0.85], pos: [ox + 2.2, fy + 0.21, zs - 0.6], color: 0x3f6f8f });
  solidBox(game, { size: [2.2, 0.55, 0.2], pos: [ox + 2.2, fy + 0.65, zs - 0.95], color: 0x37627e });
  for (const s of [-1, 1]) solidBox(game, { size: [0.2, 0.62, 0.85], pos: [ox + 2.2 + s * 1.1, fy + 0.31, zs - 0.6], color: 0x37627e });
  solidBox(game, { size: [1.2, 0.05, 0.7], pos: [ox + 0.8, fy + 0.72, oz + 0.4], color: 0x9c6a3e });
  for (const [sx, sz] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) {
    solidBox(game, { size: [0.05, 0.7, 0.05], pos: [ox + 0.8 + sx, fy + 0.35, oz + 0.4 + sz], color: 0x6b4426, collide: false, block: false });
  }
  const tableBody = new CANNON.Body({ mass: 0, material: game.mats.ground, collisionFilterGroup: G.STATIC });
  tableBody.addShape(new CANNON.Box(new CANNON.Vec3(0.6, 0.36, 0.35)));
  tableBody.position.set(ox + 0.8, fy + 0.37, oz + 0.4);
  game.world.addBody(tableBody);


  // Whiteboard on the north wall.
  const wb = mesh(new THREE.PlaneGeometry(2.4, 1.25), new THREE.MeshStandardMaterial({ map: whiteboardTexture(), roughness: 0.4 }), { cast: false });
  wb.position.set(ox + 0.3, fy + 1.65, zn + T / 2 + 0.1); // proud of the wall so it never clips into it
  scene.add(wb);
  const frame = mesh(new THREE.BoxGeometry(2.5, 1.35, 0.05), mat(0xb0b5ba));
  frame.position.set(ox + 0.3, fy + 1.65, zn + T / 2 + 0.07);
  const tray = mesh(new THREE.BoxGeometry(2.3, 0.04, 0.1), mat(0xb0b5ba));
  tray.position.set(ox + 0.3, fy + 0.98, zn + T / 2 + 0.12);
  scene.add(tray);
  scene.add(frame);

  // Posters, bookshelf, string lights, curtains, the office cat...
  const cozy = buildCozy(game, { xw, xe, zn, zs, fy, H, T, deskX, deskZ });

  return {
    floorY,
    spots: {
      desk: [deskX + 0.05, fy + 0.85, deskZ + 0.3],
      table: [ox + 0.8, fy + 0.85, oz + 0.4],
      chair: [deskX + 0.95, fy + 0.05, deskZ - 0.1],
      plantA: [xe - 0.5, fy + 0.05, zs - 0.5],
      plantB: [xw + 0.5, fy + 0.05, zs - 0.5],
      friend: [ox + 1.6, fy, oz - 1.6],
    },
    update() {
      cozy.update(game.time);
      // keep the door awake-ish so it reacts promptly when pushed
      if (doorBody.sleepState === CANNON.Body.SLEEPING && game.player && game.player.body.position.distanceTo(doorBody.position) < 2) doorBody.wakeUp();
    },
  };
}

function whiteboardTexture() {
  return canvasTexture(1024, 534, (ctx, w, h) => {
    ctx.fillStyle = '#fbfcfd';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f4fa8';
    ctx.font = '700 64px "Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
    ctx.fillText('ZOO TO-DO LIST', 40, 80);
    ctx.font = '500 44px "Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
    const lines = ['1. Market the zoo (use the computer!)', '2. Sell tickets $$$', '3. Scoop poop into the dumpster', '4. Do NOT throw coworkers', '5. Find out who fed the lion a cone'];
    ctx.fillStyle = '#222';
    lines.forEach((l, i) => ctx.fillText(l, 50, 160 + i * 70));
    ctx.strokeStyle = '#d33';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(50, 368); ctx.lineTo(620, 352);
    ctx.stroke();
  });
}

function posterTexture() {
  return canvasTexture(512, 672, (ctx, w, h) => {
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a2410';
    ctx.textAlign = 'center';
    ctx.font = '900 54px "Baloo 2", system-ui';
    ctx.fillText('EMPLOYEE', w / 2, 90);
    ctx.fillText('OF THE MONTH', w / 2, 150);
    ctx.fillStyle = '#fff';
    ctx.fillRect(96, 200, 320, 320);
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(w / 2, 320, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(w / 2 - 80, 390, 160, 130);
    ctx.font = '900 140px "Baloo 2"';
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('?', w / 2, 370);
    ctx.fillStyle = '#3a2410';
    ctx.font = '700 32px Inter, system-ui';
    ctx.fillText('(it could be you)', w / 2, 590);
  });
}
