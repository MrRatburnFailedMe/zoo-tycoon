import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from './physics.js';
import { ITEMS } from './items.js';
import { heightAt, pondWaterY } from './world/terrain.js';
import { GATE, PLAZA, OFFICE, HIPPO, POND, MONKEY, LION, TICKET_BOOTH, CART_SPAWN, PENGUIN, ELEPHANT, GORILLA } from './world/layout.js';

// Testing / mod menu. Tab (or `) toggles it; V toggles fly anywhere.
// Settings live on game.mods and are read by the player, grabber and main loop.
export const DEFAULT_MODS = {
  fly: false, god: false, speed: 1, jump: 1, gravity: 1, timeScale: 1, throwPower: 1, fov: 75,
  fog: true, shadows: true, hands: true, stats: false,
};

const ray = new CANNON.RaycastResult();

// Highest solid surface at (x, z), so teleports land on decks, rocks and floors.
function groundAt(game, x, z) {
  ray.reset();
  game.world.raycastClosest(new CANNON.Vec3(x, 80, z), new CANNON.Vec3(x, -40, z), { collisionFilterMask: G.STATIC, skipBackfaces: true }, ray);
  return ray.hasHit ? ray.hitPointWorld.y : heightAt(x, z);
}

const TELEPORTS = [
  { name: 'Gate', x: GATE.x, z: GATE.z - 6, face: [PLAZA.x, PLAZA.z] },
  { name: 'Plaza', x: PLAZA.x, z: PLAZA.z + 3, face: [MONKEY.x, MONKEY.z] },
  { name: 'Office', x: OFFICE.x + 2, z: OFFICE.z, face: [OFFICE.x - 6, OFFICE.z] },
  { name: 'Ticket desk', x: TICKET_BOOTH.x, z: TICKET_BOOTH.z - 0.6, face: [TICKET_BOOTH.x, TICKET_BOOTH.z + 5] },
  { name: 'Golf cart', x: CART_SPAWN.x + 2, z: CART_SPAWN.z, face: [CART_SPAWN.x, CART_SPAWN.z] },
  { name: 'Penguins', x: PENGUIN.view[0], z: PENGUIN.view[1], face: [PENGUIN.x, PENGUIN.z] },
  { name: 'Elephants', x: ELEPHANT.view[0], z: ELEPHANT.view[1], face: [ELEPHANT.x, ELEPHANT.z] },
  { name: 'Gorillas', x: GORILLA.view[0], z: GORILLA.view[1], face: [GORILLA.x, GORILLA.z] },
  { name: 'Hippo deck', x: HIPPO.view[0], z: HIPPO.view[1], face: [HIPPO.x, HIPPO.z] },
  { name: 'Hippo swamp', x: POND.x - 2, z: POND.z + 2, face: [HIPPO.x + 6, HIPPO.z], water: true },
  { name: 'Monkey window', x: MONKEY.view[0], z: MONKEY.view[1], face: [MONKEY.x, MONKEY.z] },
  { name: 'Inside monkeys', x: MONKEY.x + 6, z: MONKEY.z + 4, face: [MONKEY.x, MONKEY.z] },
  { name: 'Lion window', x: LION.view[0], z: LION.view[1], face: [LION.x, LION.z] },
  { name: 'Inside lions', x: LION.x + 5, z: LION.z + 5, face: [LION.x, LION.z] },
  { name: 'Sky view', x: PLAZA.x + 30, z: PLAZA.z + 45, y: 45, face: [PLAZA.x, PLAZA.z - 10], fly: true },
];

export class ModMenu {
  constructor(game) {
    this.game = game;
    game.mods = { ...DEFAULT_MODS };
    this.spawned = [];
    this.open = false;
    this.count = 1;
    this.fpsT = 0;
    this.frames = 0;
    this.fps = 0;
    this.build();
    this.stats = document.createElement('div');
    this.stats.id = 'modstats';
    document.body.appendChild(this.stats);

    addEventListener('keydown', (e) => {
      if (e.repeat || game.mode === 'computer') return;
      if (e.code === 'Tab' || e.code === 'Backquote') { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.open) this.toggle();
      else if (e.code === 'KeyV' && game.mode === 'play') this.set('fly', !game.mods.fly);
    });
  }

  // ---- UI ----
  build() {
    const el = document.createElement('div');
    el.id = 'mods';
    el.innerHTML = `<div class="mods-head"><b>MOD MENU</b><span>Tab to close · V to fly</span></div><div class="mods-body"></div>`;
    document.body.appendChild(el);
    this.el = el;
    const body = el.querySelector('.mods-body');
    this.controls = {};
    const section = (title) => {
      const s = document.createElement('section');
      s.innerHTML = `<h3>${title}</h3>`;
      body.appendChild(s);
      return s;
    };
    const toggle = (parent, key, label) => {
      const b = document.createElement('button');
      b.className = 'tog';
      b.textContent = label;
      b.onclick = () => this.set(key, !this.game.mods[key]);
      parent.appendChild(b);
      this.controls[key] = { sync: () => b.classList.toggle('on', !!this.game.mods[key]) };
    };
    const slider = (parent, key, label, min, max, step) => {
      const row = document.createElement('label');
      row.className = 'slider';
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const input = row.querySelector('input'), out = row.querySelector('output');
      input.oninput = () => this.set(key, parseFloat(input.value));
      parent.appendChild(row);
      this.controls[key] = { sync: () => { input.value = this.game.mods[key]; out.textContent = key === 'fov' ? `${this.game.mods[key]}°` : `${(+this.game.mods[key]).toFixed(2)}×`; } };
    };
    const button = (parent, label, fn, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = fn;
      parent.appendChild(b);
      return b;
    };
    const grid = (parent) => { const g = document.createElement('div'); g.className = 'grid'; parent.appendChild(g); return g; };

    let s = section('Player');
    let g = grid(s);
    toggle(g, 'fly', 'Fly / noclip');
    toggle(g, 'god', 'God mode');
    slider(s, 'speed', 'Move speed', 0.5, 5, 0.25);
    slider(s, 'jump', 'Jump height', 0.5, 5, 0.25);
    slider(s, 'throwPower', 'Throw power', 0.5, 6, 0.25);
    slider(s, 'fov', 'Field of view', 60, 110, 1);

    s = section('Teleport');
    g = grid(s);
    for (const t of TELEPORTS) button(g, t.name, () => this.teleport(t));

    s = section('Spawn in front of you');
    g = grid(s);
    for (const [type, def] of Object.entries(ITEMS)) button(g, def.name, () => this.spawn(type));
    g = grid(s);
    const countBtn = button(g, 'Amount: 1', () => {
      this.count = this.count === 1 ? 5 : this.count === 5 ? 20 : 1;
      countBtn.textContent = `Amount: ${this.count}`;
    });
    button(g, 'Item rain', () => this.itemRain());
    button(g, 'Clear spawned', () => this.clearSpawned(), 'warn');

    s = section('Friends');
    g = grid(s);
    button(g, 'Knock all over', () => this.knockFriends(3));
    button(g, 'Launch to sky', () => this.knockFriends(22));
    button(g, 'Bring to me', () => this.bringFriends());
    button(g, 'Heal everyone', () => { this.game.health.player.reset(); for (const f of this.game.friends) f.health.reset(); });

    s = section('Animals');
    g = grid(s);
    button(g, 'Everyone sleep', () => { for (const a of this.game.animals.list) { a.setState('sleep', 30); a.sideways = !!a.sp.sideSleep; } });
    button(g, 'Wake up', () => { for (const a of this.game.animals.list) if (a.state === 'sleep') a.sleepWake(); });
    button(g, 'Do tricks', () => { for (const a of this.game.animals.list) if (!['chase', 'held', 'tossed'].includes(a.state)) a.startAct(); });
    button(g, 'Monkeys swing', () => { for (const a of this.game.animals.list) if (a.kind === 'baboon' && a.state !== 'swing') a.startSwing(); });

    s = section('World');
    slider(s, 'gravity', 'Gravity', 0, 2, 0.05);
    slider(s, 'timeScale', 'Time speed', 0.1, 2, 0.05);
    g = grid(s);
    toggle(g, 'fog', 'Fog');
    toggle(g, 'shadows', 'Shadows');
    toggle(g, 'hands', 'Hands');
    toggle(g, 'stats', 'FPS / position');

    s = section('');
    g = grid(s);
    button(g, 'Reset all mods', () => { for (const k in DEFAULT_MODS) this.set(k, DEFAULT_MODS[k]); });
    button(g, 'Respawn at gate', () => this.teleport(TELEPORTS[0]));

    s = section('Credits');
    s.insertAdjacentHTML('beforeend', `<p class="credits">
      "Low-poly Lion" (skfb.ly/ozVuC) by Calfan, CC BY-NC 4.0<br>
      "Low poly hippo" (skfb.ly/6SntT) by MrEliptik, CC BY 4.0<br>
      "Baboon" by Poly by Google, CC BY<br>
      Player model by Quaternius</p>`);

    for (const c of Object.values(this.controls)) c.sync();
  }

  toggle() {
    const { game } = this;
    if (game.mode === 'computer') return;
    this.open = !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) {
      game.grabber.release();
      game.mode = 'mod'; // keeps the world running without the main menu popping up
      document.getElementById('menu').classList.add('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      game.resume(true);
    }
  }

  set(key, value) {
    const { game } = this;
    game.mods[key] = value;
    this.controls[key]?.sync();
    if (key === 'gravity') game.world.gravity.y = -9.82 * value;
    if (key === 'fog') game.scene.fog.far = value ? 980 : 1e6;
    if (key === 'shadows') game.scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = value; });
    if (key === 'fly') game.player.setFly(value);
  }

  // ---- actions ----
  teleport(t) {
    const { player } = this.game;
    if (t.fly && !this.game.mods.fly) this.set('fly', true);
    const b = player.body;
    const y = t.y ?? (t.water ? pondWaterY() + 0.5 : groundAt(this.game, t.x, t.z));
    b.position.set(t.x, y + 1.2, t.z);
    b.previousPosition.copy(b.position);
    b.interpolatedPosition.copy(b.position);
    b.velocity.set(0, 0, 0);
    player.yaw = Math.atan2(-(t.face[0] - t.x), -(t.face[1] - t.z));
    player.pitch = t.fly ? -0.45 : 0;
    if (this.open) this.toggle();
  }

  inFront(dist) {
    const cam = this.game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y = Math.max(dir.y, -0.2);
    return cam.position.clone().addScaledVector(dir.normalize(), dist);
  }

  spawn(type) {
    for (let i = 0; i < this.count; i++) {
      const p = this.inFront(2.5 + Math.random() * (this.count > 1 ? 2 : 0));
      p.x += (Math.random() - 0.5) * (this.count > 1 ? 2.5 : 0);
      p.z += (Math.random() - 0.5) * (this.count > 1 ? 2.5 : 0);
      p.y = Math.max(p.y, heightAt(p.x, p.z) + 0.6) + i * 0.4;
      this.spawned.push(this.game.items.spawn(type, p.x, p.y, p.z, { yaw: Math.random() * Math.PI * 2 }));
    }
  }

  itemRain() {
    const types = Object.keys(ITEMS).filter((t) => t !== 'chair' && t !== 'plant');
    const c = this.game.player.body.position;
    for (let i = 0; i < 25; i++) {
      const x = c.x + (Math.random() - 0.5) * 14, z = c.z + (Math.random() - 0.5) * 14;
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawned.push(this.game.items.spawn(type, x, c.y + 10 + Math.random() * 12, z, { yaw: Math.random() * 6 }));
    }
  }

  clearSpawned() {
    for (const it of this.spawned) if (this.game.items.list.includes(it)) this.game.items.remove(it);
    this.spawned.length = 0;
  }

  knockFriends(up) {
    for (const f of this.game.friends) {
      const a = Math.random() * Math.PI * 2;
      const v = new CANNON.Vec3(Math.cos(a) * 3, up, Math.sin(a) * 3);
      if (f.state === 'stand') f.ragdollify(v);
      else f.ragdoll.push(new CANNON.Vec3(0, 1, 0), up * 0.6);
    }
  }

  bringFriends() {
    const { player } = this.game;
    const p = player.body.position;
    this.game.friends.forEach((f, i) => {
      if (f.state === 'ragdoll') f.standUp();
      const a = player.yaw + Math.PI + (i - 1) * 0.7; // a fan in front of you
      const x = p.x - Math.sin(player.yaw) * 3 + Math.cos(a) * 1.4, z = p.z - Math.cos(player.yaw) * 3 - Math.sin(a) * 1.4;
      f.standAt(x, groundAt(this.game, x, z), z, Math.atan2(p.x - x, p.z - z));
    });
  }

  update(dt) {
    const { game } = this;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    this.stats.style.display = game.mods.stats ? 'block' : 'none';
    if (game.mods.stats) {
      const p = game.player.body.position;
      this.stats.textContent = `${this.fps} fps · ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · items ${game.items.list.length}`;
    }
  }
}
