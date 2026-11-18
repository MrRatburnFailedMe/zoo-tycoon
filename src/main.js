import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { GameState } from './state.js';
import { sfx } from './audio.js';
import { buildEnvironment } from './world/environment.js';
import { buildTerrain } from './world/terrain.js';
import { buildNature } from './world/nature.js';
import { buildZoo } from './world/zoo.js';
import { buildOffice } from './world/office.js';
import { buildBathroom } from './world/bathroom.js';
import { buildExhibits } from './world/exhibits.js';
import { Items, spawnStarterItems, ITEMS } from './items.js';
import { Player } from './player/player.js';
import { Grabber } from './player/grab.js';
import { Hands } from './player/hands.js';
import { Interactor } from './player/interact.js';
import { Friend } from './characters/friend.js';
import { LOOKS, loadCharacterModel } from './characters/character.js';
import { Computer } from './computer/computer.js';
import { GATE, PLAZA, CART_SPAWN } from './world/layout.js';
import { Glass } from './world/glass.js';
import { buildHabitats } from './world/habitats.js';
import { buildGate } from './world/gate.js';
import { Visitors } from './characters/visitors.js';
import { Delivery } from './world/delivery.js';
import { GolfCart } from './world/cart.js';
import { DEFAULT_MODS } from './modDefaults.js';
import { buildAnimals } from './world/animals.js';
import { PlayerHealth } from './health.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 2200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const { world, mats } = createPhysics();
await loadCharacterModel();

// One shared context object everything hangs off. Easy to inspect from the console: window.game
const game = {
  canvas, renderer, scene, camera, world, mats,
  pickables: [], // objects the crosshair raycast can hit
  links: [], // { body, object } pairs synced after each physics step
  uniforms: { time: { value: 0 } },
  mods: { ...DEFAULT_MODS },
  mode: 'menu', // menu | play | computer | resuming | feedback
  version: '0.10.0',
  time: 0,
};
window.game = game;

game.state = new GameState();
game.hud = new HUD(game);
game.input = new Input(canvas);
game.env = buildEnvironment(game);
game.terrain = buildTerrain(game);
buildNature(game);
game.zoo = buildZoo(game);
game.glass = new Glass(game);
game.exhibits = buildExhibits(game);
game.habitats = buildHabitats(game);
game.items = new Items(game);
game.itemName = (type) => ITEMS[type]?.name || type;
game.computer = new Computer(game);
game.office = buildOffice(game);
buildBathroom(game);
game.gate = buildGate(game);
game.player = new Player(game, { x: GATE.x, z: GATE.z - 6, yaw: 0 });
game.grabber = new Grabber(game);
game.hands = new Hands(LOOKS[0]);
game.interact = new Interactor(game);
const spot = game.office.spots.friend;
game.friends = [
  new Friend(game, { look: LOOKS[1], x: spot[0], y: spot[1], z: spot[2], yaw: Math.PI / 2 }),
  new Friend(game, { look: LOOKS[2], x: PLAZA.x + 4.5, z: PLAZA.z + 4.5, yaw: 0.6 }),
  new Friend(game, { look: LOOKS[3], x: 5, z: 45, yaw: -Math.PI / 2 }),
];
spawnStarterItems(game);
// Tab: mod menu. Owner builds only (the page sets window.ZOO_OWNER); the public site ships without mods.js.
if (window.ZOO_OWNER) {
  const { ModMenu } = await import('./mods.js');
  game.modMenu = new ModMenu(game);
}
game.health = new PlayerHealth(game);
await buildAnimals(game);
game.visitors = new Visitors(game);
game.delivery = new Delivery(game);
game.cart = new GolfCart(game, CART_SPAWN.x, CART_SPAWN.z, Math.PI);

// ---- Menu / pointer lock ----
const menu = document.getElementById('menu');
const playBtn = document.getElementById('play');
function showMenu(label) {
  game.mode = 'menu';
  playBtn.textContent = label;
  menu.classList.remove('hidden');
}
playBtn.addEventListener('click', () => {
  sfx.unlock();
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    game.mode = 'play';
    menu.classList.add('hidden');
  } else if (game.mode === 'play') {
    game.grabber.release();
    showMenu('Resume');
  }
});
document.addEventListener('pointerlockerror', () => { if (game.mode !== 'computer') showMenu('Resume'); });
// N: feedback window. Only the private claude.ai build has it (its page sets window.ZOO_FEEDBACK);
// the public site ships without feedback.js. The game is frozen while it's open.
if (window.ZOO_FEEDBACK) {
  const { Feedback } = await import('./feedback.js');
  game.feedback = new Feedback(game, {
    onOpen() {
      game.mode = 'feedback';
      if (document.pointerLockElement) document.exitPointerLock();
    },
    onClose(prev) {
      if (prev === 'play') { game.mode = 'resuming'; canvas.requestPointerLock()?.catch?.(() => {}); } // a refusal still fires pointerlockerror → Resume menu
      else game.mode = prev;
    },
  });
}
// Called by the computer when you stand up.
game.resume = (viaClick) => {
  if (viaClick) {
    game.mode = 'resuming';
    canvas.requestPointerLock();
  } else showMenu('Resume');
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  game.hands.resize(camera.aspect);
});

// ---- Main loop ----
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); // a stale timestamp must never run time backwards
  last = now;
  const { player, grabber } = game;
  const running = game.mode !== 'menu' && game.mode !== 'feedback';

  if (running) {
    const sdt = dt * game.mods.timeScale;
    game.time += sdt;
    game.uniforms.time.value = game.time;
    if (game.mode === 'play') {
      player.update(dt);
      if (!player.driving || player.driving.seat) { // you can work the desk from the gate chair
        game.interact.update();
        grabber.update();
      }
    }
    game.cart.update(game.mode === 'play' ? dt : 0);
    for (const f of game.friends) f.preStep();

    world.step(1 / 60, sdt, 8);

    for (const l of game.links) {
      l.object.position.copy(l.body.interpolatedPosition);
      l.object.quaternion.copy(l.body.interpolatedQuaternion);
    }
    game.cart.sync();
    game.glass.update(dt);
    game.items.update();
    game.gate.update(dt);
    game.visitors.update(sdt, game.time);
    game.delivery.update(sdt);
    for (const f of game.friends) f.update(dt, game.time);
    game.office.update();
    game.zoo.update(game.time, dt);
    game.exhibits.update(game.time, dt);
    game.animals.update(game.time, sdt);
    game.health.update(dt);
    game.terrain.update(game.time);
    game.state.update(dt);
  }

  if (game.mode === 'computer') game.computer.updateCamera(dt);
  else player.postStep(running ? dt : 0);
  game.env.update(dt);
  game.modMenu?.update(dt);

  game.hands.update(dt, {
    visible: game.mods.hands && (!player.driving || player.driving.seat) && (game.mode === 'play' || game.mode === 'resuming'),
    holding: !!grabber.held && game.mode === 'play',
    heavy: grabber.heavy,
    charge: grabber.charging ? grabber.charge : 0,
    bob: player.bobPhase,
    bobAmt: player.bobAmt,
    lookDX: player.lookDX || 0,
    lookDY: player.lookDY || 0,
    fov: camera.fov,
  });

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(game.hands.scene, game.hands.camera);
  game.input.endFrame();
}

game.frame = frame; // lets tools/trailer.js step the game by hand
requestAnimationFrame(frame);
document.getElementById('loading').classList.add('done');
