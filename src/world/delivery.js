import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { mat, mesh } from '../util/build.js';
import { signTexture } from '../util/textures.js';
import { heightAt } from './terrain.js';
import { TRUCK_BAY } from './layout.js';
import { sfx } from '../audio.js';

// ZooMart deliveries. 10–15 s after an order a box truck reverses up the road to the front gate
// (beep, beep), opens its back doors and waits with your stuff inside. It leaves once you've
// taken everything out, or after two minutes (anything left behind goes back to the store).

const L = 3.6, W = 2.1, BOX_H = 2.1, FLOOR = 0.75; // cargo box size; floor height above the road
const PARK_Z = TRUCK_BAY.z + L / 2; // truck origin = middle of the cargo box
const START_Z = 112, DRIVE_TIME = 6.5, WAIT = 120;

export class Delivery {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.timer = 0;
    this.items = [];
    this.build();
  }

  build() {
    const g = this.root = new THREE.Group();
    const white = mat(0xf4f1ea), green = mat(0x2fb38a), dark = mat(0x2a2d30), glassM = mat(0x9fd3e6, { roughness: 0.1, metalness: 0.4 });
    const add = (geo, m, x, y, z) => { const o = mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    // cargo box (open at the back, -Z)
    add(new THREE.BoxGeometry(W, 0.12, L), dark, 0, FLOOR, 0);
    add(new THREE.BoxGeometry(0.08, BOX_H, L), white, -W / 2, FLOOR + BOX_H / 2, 0);
    add(new THREE.BoxGeometry(0.08, BOX_H, L), white, W / 2, FLOOR + BOX_H / 2, 0);
    add(new THREE.BoxGeometry(W, 0.08, L), white, 0, FLOOR + BOX_H, 0);
    add(new THREE.BoxGeometry(W, BOX_H, 0.08), white, 0, FLOOR + BOX_H / 2, L / 2);
    const logo = signTexture('ZooMart', { bg: '#2fb38a', fg: '#fff', edge: '#1f7a5c', size: 170, sub: 'FAST · FRESH · FURRY' });
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshStandardMaterial({ map: logo }), { cast: false });
      p.position.set(s * (W / 2 + 0.045), FLOOR + BOX_H * 0.6, 0);
      p.rotation.y = s * Math.PI / 2;
      g.add(p);
    }
    add(new THREE.BoxGeometry(W + 0.02, 0.3, L + 0.02), green, 0, FLOOR + 0.25, 0);
    // cab at the front (+Z)
    add(new THREE.BoxGeometry(W, 1.5, 1.6), green, 0, FLOOR + 0.6, L / 2 + 0.9);
    add(new THREE.BoxGeometry(W - 0.1, 0.6, 0.05), glassM, 0, FLOOR + 1.0, L / 2 + 1.72);
    add(new THREE.BoxGeometry(W + 0.04, 0.25, 0.3), dark, 0, FLOOR - 0.05, L / 2 + 1.75);
    for (const s of [-1, 1]) {
      const hl = add(new THREE.BoxGeometry(0.3, 0.15, 0.05), mat(0xfff3b0, { emissive: 0xffe08a, emissiveIntensity: 0.8 }), s * 0.7, FLOOR + 0.2, L / 2 + 1.72);
      hl.castShadow = false;
    }
    // wheels
    this.wheels = [];
    for (const [x, z] of [[-1, -1.1], [1, -1.1], [-1, 1.2], [1, 1.2], [-1, 2.5], [1, 2.5]]) {
      const w = add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark, x * (W / 2 - 0.05), 0.42, z);
      w.rotation.z = Math.PI / 2;
      this.wheels.push(w);
    }
    // back doors, hinged on the outer edges
    this.doors = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(s * W / 2, FLOOR + BOX_H / 2, -L / 2);
      const d = mesh(new THREE.BoxGeometry(W / 2, BOX_H, 0.06), white);
      d.position.x = -s * W / 4;
      hinge.add(d);
      g.add(hinge);
      this.doors.push({ hinge, s });
    }
    this.doorOpen = 0;
    g.visible = false;
    this.game.scene.add(g);

    // one kinematic body: floor, walls and roof of the box, plus the cab
    const b = this.body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.KINEMATIC, collisionFilterMask: MASK.KINEMATIC | G.ITEM });
    const box = (x, y, z, hx, hy, hz) => b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z));
    box(0, FLOOR - 0.15, 0, W / 2, 0.21, L / 2);
    box(-W / 2, FLOOR + BOX_H / 2, 0, 0.05, BOX_H / 2, L / 2);
    box(W / 2, FLOOR + BOX_H / 2, 0, 0.05, BOX_H / 2, L / 2);
    box(0, FLOOR + BOX_H, 0, W / 2, 0.05, L / 2);
    box(0, FLOOR + BOX_H / 2, L / 2, W / 2, BOX_H / 2, 0.05);
    box(0, FLOOR + 0.6, L / 2 + 0.9, W / 2, 0.75, 0.8);
  }

  canOrder() { return this.state === 'idle'; }

  order(types) {
    this.pending = types;
    this.state = 'ordered';
    this.timer = 10 + Math.random() * 5; // seconds until it pulls up
  }

  status() {
    const s = Math.ceil(this.timer);
    switch (this.state) {
      case 'ordered': case 'arriving': return `Your truck arrives at the front gate in ${s}s`;
      case 'parked': return `Truck is at the front gate, doors open: unload it! (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left)`;
      case 'leaving': return 'Truck is heading back to the warehouse. You can order again in a moment.';
      default: return null;
    }
  }

  // truck origin along the road at distance z, sitting on the ground
  place(z) {
    const x = TRUCK_BAY.x;
    const yb = heightAt(x, z - 1.2), yf = heightAt(x, z + 2.4);
    this.root.position.set(x, (yb + yf) / 2, z);
    this.root.rotation.set(Math.atan2(yb - yf, 3.6), 0, 0);
    this.root.updateMatrixWorld();
    this.body.position.set(x, this.root.position.y, z);
    this.body.quaternion.setFromEuler(this.root.rotation.x, 0, 0);
  }

  inCargo(p) {
    const local = this.root.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
    return Math.abs(local.x) < W / 2 && Math.abs(local.z) < L / 2 + 0.2 && local.y > FLOOR - 0.3 && local.y < FLOOR + BOX_H;
  }

  update(dt) {
    const game = this.game;
    if (this.state === 'idle') return;
    this.timer -= dt;
    const near = Math.max(0, 1 - game.camera.position.distanceTo(this.root.position) / 60);
    switch (this.state) {
      case 'ordered':
        if (this.timer <= DRIVE_TIME) { this.state = 'arriving'; this.root.visible = true; game.world.addBody(this.body); this.beep = 0; }
        break;
      case 'arriving': {
        const k = 1 - Math.max(0, this.timer) / DRIVE_TIME;
        const e = 1 - Math.pow(1 - k, 2.2); // reversing in, slowing down at the end
        const z = START_Z + (PARK_Z - START_Z) * e;
        const vz = (z - this.root.position.z) / Math.max(dt, 1e-3);
        this.place(z);
        this.body.velocity.set(0, 0, vz);
        for (const w of this.wheels) w.rotation.x += vz * dt / 0.42;
        if ((this.beep -= dt) <= 0) { this.beep = 0.7; sfx.reverse(near); }
        if (this.timer <= 0) {
          this.place(PARK_Z);
          this.body.velocity.set(0, 0, 0);
          this.state = 'parked';
          this.timer = WAIT;
          this.unload();
          sfx.honk();
          game.animals.shout('DELIVERY!', this.root.position.x, this.root.position.y + 3.6, this.root.position.z, '#2fb38a');
        }
        break;
      }
      case 'parked': {
        this.doorOpen = Math.min(1, this.doorOpen + dt * 1.5);
        const left = this.items.filter((it) => game.items.list.includes(it) && this.inCargo(it.body.position));
        if (!left.length && !this.emptyAt) this.emptyAt = 2.5;
        if (this.emptyAt && (this.emptyAt -= dt) <= 0) this.leave();
        else if (this.timer <= 0) { for (const it of left) game.items.remove(it); this.leave(); }
        break;
      }
      case 'leaving': {
        this.doorOpen = Math.max(0, this.doorOpen - dt * 1.5);
        if (this.doorOpen > 0) break;
        const z = this.root.position.z + dt * Math.min(12, (this.speed = (this.speed || 0) + dt * 4));
        this.place(z);
        this.body.velocity.set(0, 0, this.speed);
        for (const w of this.wheels) w.rotation.x -= this.speed * dt / 0.42;
        if (z > START_Z) {
          this.state = 'idle';
          this.root.visible = false;
          game.world.removeBody(this.body);
        }
        break;
      }
    }
    for (const d of this.doors) d.hinge.rotation.y = -d.s * this.doorOpen * 1.9;
  }

  // Stack the order inside the box, in rows from the back doors forward.
  unload() {
    this.items = [];
    this.emptyAt = 0;
    this.doorOpen = 0;
    this.pending.forEach((type, i) => {
      const col = i % 3, row = Math.floor(i / 3) % 4, layer = Math.floor(i / 12);
      const local = new THREE.Vector3((col - 1) * 0.62, FLOOR + 0.3 + layer * 0.5, -L / 2 + 0.5 + row * 0.8);
      const p = this.root.localToWorld(local);
      // everything ships boxed: carry the box out, press F to open it
      const box = this.game.items.spawn('parcel', p.x, p.y, p.z, { yaw: (Math.random() - 0.5) * 0.2 });
      box.contents = type;
      box.label = `Box (${this.game.itemName?.(type) || type})`;
      this.items.push(box);
    });
  }

  leave() {
    this.state = 'leaving';
    this.speed = 0;
    this.emptyAt = 0;
    sfx.honk();
  }
}
