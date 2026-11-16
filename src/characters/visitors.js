import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { createCharacter } from './character.js';
import { heightAt } from '../world/terrain.js';
import { GATE, PLAZA, TURNSTILES, ENCLOSURES, PENGUIN, ELEPHANT, GORILLA } from '../world/layout.js';
import { angleDiff } from '../util/math.js';
import { canvasTexture } from '../util/textures.js';
import { sfx } from '../audio.js';

// Visitors walk up the road, queue at the ticket window, and wait for you to hand them a ticket
// (hold one and press E on them, or just drop it in front of them). They pay by card or cash,
// go through a turnstile, look at an exhibit or two, and head home. Leave them waiting too long
// and they give up and go home grumpy.

const SPAWN = { x: 3.6, z: 96 };
const ROAD = { x: 4.4, z: 68 }; // where the road meets the queue
const MAX_IN_PARK = 12, MAX_QUEUE = 6, PATIENCE = 70;
const NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Isla', 'Jai', 'Kemi', 'Leo', 'Mia', 'Noah', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Umar', 'Vera', 'Wes', 'Xin', 'Yara', 'Zed'];
const SHIRTS = [0xe2523c, 0x3f78c2, 0xffd34d, 0x8e55a8, 0x2fb38a, 0xff8a3d, 0xf06292, 0x4caf50, 0xffffff];
const PANTS = [0x3d3d3d, 0x4f6178, 0xb8a070, 0x2b3a55, 0x6b4a2e];
const SKIN = [0xf0cdb0, 0xe8b48c, 0xc68c5e, 0x8d5a3b, 0x5c3a24];
const HAIR = [0x1d1a18, 0x3a2618, 0xb5651d, 0xe0c068, 0x111111, 0x7a7a7a];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let bubbleTex = null;
function bubble() {
  bubbleTex ||= canvasTexture(128, 96, (g) => {
    g.fillStyle = '#fff'; g.strokeStyle = '#2b2440'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(6, 6, 116, 64, 18); g.moveTo(50, 70); g.lineTo(64, 90); g.lineTo(74, 70); g.fill(); g.stroke();
    g.fillStyle = '#ffd34d'; g.beginPath(); g.roundRect(26, 22, 76, 34, 6); g.fill(); g.stroke();
    g.fillStyle = '#2b2440'; g.font = '900 22px "Baloo 2", system-ui'; g.textAlign = 'center'; g.fillText('TICKET?', 64, 47);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, depthTest: false }));
  s.scale.set(0.6, 0.45, 1);
  s.renderOrder = 9;
  return s;
}

// Route from just inside the gate to an exhibit's viewing spot, along the paths.
function routeTo(e) {
  if (e === PENGUIN) return [[0, 41], e.view];
  if (e === ELEPHANT) return [[0, 28], e.view];
  if (e === GORILLA) return [[0, 29], [-26, 29], e.view];
  // the rest hang off the plaza: walk round the fountain to the side facing the exhibit
  const r = 5.8, want = Math.atan2(e.view[1] - PLAZA.z, e.view[0] - PLAZA.x);
  const pts = [[0, 20]];
  let a = Math.PI / 2;
  const step = angleDiff(want, a) > 0 ? Math.PI / 4 : -Math.PI / 4;
  for (let i = 0; i < 8 && Math.abs(angleDiff(want, a)) > Math.PI / 5; i++) { a += step; pts.push([PLAZA.x + Math.cos(a) * r, PLAZA.z + Math.sin(a) * r]); }
  pts.push([PLAZA.x + Math.cos(want) * (PLAZA.r + 0.5), PLAZA.z + Math.sin(want) * (PLAZA.r + 0.5)], e.view);
  return pts;
}

class Visitor {
  constructor(mgr) {
    const game = mgr.game;
    this.game = game;
    this.mgr = mgr;
    this.name = pick(NAMES);
    this.label = `Visitor ${this.name}`;
    this.interactLabel = 'Give ticket';
    this.char = createCharacter({ shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR), socks: 0x333333 });
    this.root = this.char.root;
    const s = 0.88 + Math.random() * 0.2;
    this.root.scale.setScalar(s);
    this.root.traverse((o) => { if (o.isMesh) o.userData.entity = this; });
    this.bubble = bubble();
    this.bubble.position.set(0, 2.3, 0);
    this.bubble.visible = false;
    this.root.add(this.bubble);
    game.scene.add(this.root);
    game.pickables.push(this.root);
    this.body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.KINEMATIC, collisionFilterMask: MASK.KINEMATIC });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.85 * s, 0.2)), new CANNON.Vec3(0, 0.85 * s, 0));
    this.body.addEventListener('collide', (e) => {
      if (e.body.mass > 0.2 && e.body !== game.player.body && Math.abs(e.contact.getImpactVelocityAlongNormal()) > 4) this.bonked = true;
    });
    game.world.addBody(this.body);
    this.pos = new THREE.Vector3(SPAWN.x + (Math.random() - 0.5), 0, SPAWN.z);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.yaw = Math.PI;
    this.speed = 1.3 + Math.random() * 0.4;
    this.path = [[ROAD.x, ROAD.z]];
    this.state = 'arrive';
    this.wait = 0;
    this.arrivedAt = game.time;
    this.byCard = Math.random() < 0.6;
    this.plan = [...ENCLOSURES].sort(() => Math.random() - 0.5).slice(0, 1 + (Math.random() < 0.4 ? 1 : 0));
  }

  // E on a visitor at the window while holding a ticket.
  interact() {
    const g = this.game, held = g.grabber.entity;
    if (this.state !== 'queue' || this.mgr.queue[0] !== this) { this.say(this.state === 'queue' ? 'Wait your turn!' : 'Hi!'); return; }
    if (held?.type !== 'ticket') { this.say('I need a ticket!'); return; }
    g.grabber.release();
    g.items.remove(held);
    this.admit();
  }

  admit() {
    this.mgr.admitted(this);
    this.state = 'pay';
    this.wait = 1.1;
    this.bubble.visible = false;
    this.game.gate.pay(this.byCard, this.pos);
    this.say(this.byCard ? 'Card, please!' : 'Keep the change!');
  }

  say(text, color = '#ffffff') { this.game.animals.shout(text, this.pos.x, this.pos.y + 2.1, this.pos.z, color); }

  // walk along this.path; returns true once at the end
  walk(dt) {
    if (!this.path.length) return true;
    const [tx, tz] = this.path[0];
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { this.path.shift(); return !this.path.length; }
    const want = Math.atan2(dx, dz);
    this.yaw += angleDiff(want, this.yaw) * Math.min(1, dt * 8);
    const step = Math.min(d, this.speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.moving = true;
    return false;
  }

  update(dt, t) {
    const g = this.game, mgr = this.mgr;
    this.moving = false;
    if (this.bonked) {
      this.bonked = false;
      this.say(pick(['OW!', 'HEY!', 'Rude!!', 'My head!']), '#ffb0a0');
      g.state.addHype(-0.5);
    }
    switch (this.state) {
      case 'arrive':
        if (this.walk(dt)) { this.state = 'queue'; mgr.queue.push(this); }
        break;
      case 'queue': {
        const i = mgr.queue.indexOf(this);
        const slot = mgr.slot(i);
        this.path = [slot];
        if (this.walk(dt)) this.yaw += angleDiff(Math.PI, this.yaw) * Math.min(1, dt * 6);
        this.wait += dt;
        this.bubble.visible = i === 0 && Math.hypot(slot[0] - this.pos.x, slot[1] - this.pos.z) < 0.4;
        this.bubble.position.y = 2.3 + Math.sin(t * 4) * 0.05;
        if (i === 0) this.checkDroppedTicket();
        if (this.wait > PATIENCE) {
          mgr.queue.splice(i, 1);
          this.bubble.visible = false;
          this.say(pick(['Too slow!', 'Forget this zoo!', 'I\'m going to the aquarium!']), '#ffb0a0');
          g.state.addHype(-2);
          mgr.log(this, 'gave up waiting', 0);
          this.state = 'home';
          this.path = [[ROAD.x, ROAD.z], [SPAWN.x, SPAWN.z]];
        }
        break;
      }
      case 'pay':
        this.yaw += angleDiff(Math.PI, this.yaw) * Math.min(1, dt * 6);
        if ((this.wait -= dt) <= 0) {
          this.lane = Math.floor(Math.random() * TURNSTILES.length);
          const lx = TURNSTILES[this.lane];
          this.path = [[lx - 0.2, GATE.z + 1.6], [lx - 0.2, GATE.z - 1.6], [0, GATE.z - 6]];
          this.state = 'enter';
        }
        break;
      case 'enter':
      case 'leave': {
        const before = this.pos.z;
        const done = this.walk(dt);
        if ((before - GATE.z) * (this.pos.z - GATE.z) <= 0 && before !== this.pos.z) g.gate.pass(this.lane);
        if (done) {
          if (this.state === 'leave') { this.state = 'home'; this.path = [[ROAD.x, ROAD.z], [SPAWN.x, SPAWN.z]]; }
          else this.nextExhibit();
        }
        break;
      }
      case 'tour':
        if (this.walk(dt)) {
          this.state = 'watch';
          this.wait = 12 + Math.random() * 15;
          if (Math.random() < 0.5) this.say(pick(['Wow!', 'So cute!', 'Look, Mum!', 'Ewww', 'Amazing!', '🤩']), '#ffd34d');
          g.state.addHype(0.6);
        }
        break;
      case 'watch': {
        const e = this.target;
        this.yaw += angleDiff(Math.atan2(e.x - this.pos.x, e.z - this.pos.z), this.yaw) * Math.min(1, dt * 3);
        if ((this.wait -= dt) <= 0) {
          if (Math.random() < 0.18) g.items.spawn(Math.random() < 0.5 ? 'banana' : 'trashbag', this.pos.x + 0.4, this.pos.y + 0.3, this.pos.z + 0.4); // litterbug
          this.nextExhibit();
        }
        break;
      }
      case 'home':
        if (this.walk(dt)) { mgr.remove(this); return; }
        break;
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);
    this.char.state.speed = this.moving ? this.speed : 0;
    this.char.animate(dt, t);
  }

  // A ticket left on the counter (or thrown at them) in front of the visitor at the window.
  checkDroppedTicket() {
    const g = this.game;
    for (const it of g.items.list) {
      if (it.type !== 'ticket' || g.grabber.entity === it) continue;
      const p = it.body.position;
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.1 && p.y > this.pos.y + 0.6 && p.y < this.pos.y + 2.2) {
        g.items.remove(it);
        this.admit();
        return;
      }
    }
  }

  nextExhibit() {
    this.target = this.plan.shift();
    if (!this.target) {
      // back out through a turnstile
      this.state = 'leave';
      const here = [this.pos.x, this.pos.z];
      this.lane = Math.floor(Math.random() * TURNSTILES.length);
      const lx = TURNSTILES[this.lane];
      this.path = [...(this.came || []).slice().reverse(), [0, GATE.z - 6], [lx + 0.2, GATE.z - 1.6], [lx + 0.2, GATE.z + 1.6]];
      if (!this.path.length) this.path = [here];
      return;
    }
    this.state = 'tour';
    const r = routeTo(this.target).map(([x, z]) => [x + (Math.random() - 0.5) * 1.2, z + (Math.random() - 0.5) * 1.2]);
    this.path = [...(this.came || []).slice().reverse(), ...r];
    this.came = r.slice(0, -1);
  }
}

export class Visitors {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.queue = [];
    this.history = [];
    this.spawnCd = 3;
  }

  slot(i) {
    const w = this.game.gate.window;
    return [w.x, w.z + i * 0.95];
  }

  admitted(v) {
    this.queue.splice(this.queue.indexOf(v), 1);
    this.log(v, v.byCard ? 'card' : 'cash', this.game.state.ticketPrice);
  }

  log(v, how, paid) {
    this.history.unshift({ name: v.name, how, paid, time: Date.now() });
    this.history.length = Math.min(this.history.length, 30);
  }

  // Gate computer actions.
  admitNext() { const v = this.queue[0]; if (v) { v.byCard = true; v.admit(); } return v; }
  turnAway(v) {
    const i = this.queue.indexOf(v);
    if (i < 0) return;
    this.queue.splice(i, 1);
    v.bubble.visible = false;
    v.say('Fine then!', '#ffb0a0');
    this.log(v, 'turned away', 0);
    v.state = 'home';
    v.path = [[ROAD.x, ROAD.z], [SPAWN.x, SPAWN.z]];
  }

  remove(v) {
    const g = this.game;
    g.scene.remove(v.root);
    g.world.removeBody(v.body);
    g.pickables.splice(g.pickables.indexOf(v.root), 1);
    this.list.splice(this.list.indexOf(v), 1);
  }

  update(dt, t) {
    const s = this.game.state;
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      // arrivals follow demand (visitors per minute) with a bit of randomness
      this.spawnCd = 60 / Math.max(0.5, s.demand) * (0.5 + Math.random());
      const coming = this.list.filter((v) => v.state === 'arrive').length;
      if (this.list.length < MAX_IN_PARK && this.queue.length + coming < MAX_QUEUE) this.list.push(new Visitor(this));
    }
    for (const v of [...this.list]) v.update(dt, t);
  }
}
