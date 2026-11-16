import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { mat, mesh } from '../util/build.js';
import { clamp, damp } from '../util/math.js';
import { heightAt } from './terrain.js';
import { sfx } from '../audio.js';

// A golf cart for zipping around the park. E to hop in or out, WASD to drive, Space to honk.
// It's a heavy box that slides on the ground (no wheel physics); the body is kept level and the
// mesh tilts to follow the slope. Friends and loose items get bowled over.

const MAX_FWD = 9, MAX_REV = 4, ACCEL = 5, BRAKE = 12, WHEELBASE = 1.7;
const SEAT = new THREE.Vector3(-0.3, 0.98, 0.15); // driver's seat, where the player's body centre sits

export class GolfCart {
  constructor(game, x, z, yaw = 0) {
    this.game = game;
    this.label = 'Golf Cart';
    this.interactLabel = 'Drive';
    this.yaw = yaw;
    this.speed = 0;
    this.driving = false;
    this.honkCd = 0;
    this.buildMesh();
    const b = this.body = new CANNON.Body({
      mass: 300, material: game.mats.player, fixedRotation: true, linearDamping: 0.05,
      collisionFilterGroup: G.ITEM, collisionFilterMask: MASK.ITEM,
    });
    b.addShape(new CANNON.Box(new CANNON.Vec3(0.62, 0.3, 1.15)), new CANNON.Vec3(0, 0.5, 0));
    b.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, 0.3, 0.85));
    b.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, 0.3, -0.85));
    b.position.set(x, heightAt(x, z) + 0.1, z);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    game.world.addBody(b);
    game.world.addEventListener('preStep', () => this.preStep());
    this.root.traverse((o) => (o.userData.entity = this));
    game.pickables.push(this.root);
  }

  buildMesh() {
    const g = this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    g.add(this.tilt);
    const white = mat(0xf7f3e8), green = mat(0x2f8f4a), dark = mat(0x26292c), tan = mat(0xc9a66b), chrome = mat(0xcfd6db, { metalness: 0.6, roughness: 0.3 });
    const add = (geo, m, x, y, z, parent = this.tilt) => { const o = mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
    add(new THREE.BoxGeometry(1.25, 0.35, 2.3), white, 0, 0.45, 0);
    add(new THREE.BoxGeometry(1.27, 0.08, 2.32), green, 0, 0.6, 0);
    add(new THREE.BoxGeometry(1.2, 0.5, 0.5), white, 0, 0.75, 0.95); // nose / dash
    add(new THREE.BoxGeometry(1.1, 0.12, 0.6), tan, 0, 0.78, 0.0); // seat
    add(new THREE.BoxGeometry(1.1, 0.5, 0.12), tan, 0, 1.05, -0.32); // seat back
    add(new THREE.BoxGeometry(1.1, 0.3, 0.75), green, 0, 0.72, -0.8); // rear bed
    for (const [x, z] of [[-0.55, 0.75], [0.55, 0.75], [-0.55, -0.45], [0.55, -0.45]]) add(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), chrome, x, 1.25, z);
    add(new THREE.BoxGeometry(1.35, 0.06, 1.6), green, 0, 1.88, 0.15); // canopy
    add(new THREE.BoxGeometry(1.0, 0.35, 0.03), mat(0x9fd3e6, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 }), 0, 1.3, 0.78);
    const col = add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), dark, -0.3, 1.08, 0.62);
    col.rotation.x = -0.6;
    this.wheel = add(new THREE.TorusGeometry(0.16, 0.025, 6, 14), dark, -0.3, 1.25, 0.5);
    this.wheel.rotation.x = -0.9;
    this.wheels = [];
    for (const [x, z] of [[-0.62, 0.8], [0.62, 0.8], [-0.62, -0.8], [0.62, -0.8]]) {
      const w = add(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), dark, x, 0.24, z);
      w.rotation.z = Math.PI / 2;
      this.wheels.push(w);
    }
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.1, 0.03), mat(0xfff3b0, { emissive: 0xffe08a, emissiveIntensity: 0.6 }), s * 0.42, 0.75, 1.21);
    this.game.scene.add(g);
  }

  interact() { if (!this.driving) this.enter(); }

  enter() {
    const g = this.game;
    g.grabber.release();
    this.driving = true;
    g.player.driving = this;
    g.player.body.collisionResponse = false;
    this.honkCd = 0.3;
    sfx.engine(1, 90);
  }

  exit() {
    const g = this.game, p = g.player;
    this.driving = false;
    p.driving = null;
    const b = this.body.position;
    const side = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); // the driver's (left) side
    const x = b.x + side.x * 1.3, z = b.z + side.z * 1.3;
    p.body.position.set(x, Math.max(heightAt(x, z), b.y) + 1.1, z);
    p.body.velocity.set(this.body.velocity.x * 0.5, 0, this.body.velocity.z * 0.5);
    p.body.collisionResponse = true;
  }

  // Called from the main loop before the physics step.
  update(dt) {
    const g = this.game, input = g.input;
    let throttle = 0, steer = 0;
    if (this.driving) {
      if (input.justPressed('KeyE')) { this.exit(); return; }
      if (input.down('KeyW')) throttle += 1;
      if (input.down('KeyS')) throttle -= 1;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
      this.honkCd -= dt;
      if (input.justPressed('Space') && this.honkCd <= 0) { sfx.honk(); this.honkCd = 0.5; }
    }
    const want = throttle > 0 ? MAX_FWD * g.mods.speed : throttle < 0 ? -MAX_REV : 0;
    const rate = Math.sign(want - this.speed) !== Math.sign(this.speed) && this.speed !== 0 ? BRAKE : ACCEL;
    this.speed += clamp(want - this.speed, -rate * dt, rate * dt);
    if (!throttle) this.speed *= 1 - Math.min(1, dt * 1.2);
    // bumped into something: lose the speed the body actually lost
    const actual = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (Math.abs(this.speed) > actual + 2.5) this.speed = Math.sign(this.speed) * (actual + 1);
    const dyaw = steer * 0.55 * (this.speed / WHEELBASE) * dt;
    this.yaw += dyaw;
    if (this.driving) g.player.yaw += dyaw; // the camera turns with the cart
    this.wheel.rotation.z += (steer * 1.2 - this.wheel.rotation.z) * damp(10, dt);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.24;
    if (this.driving && Math.abs(this.speed) > 0.5 && (this.hum = (this.hum || 0) - dt) <= 0) {
      this.hum = 0.11;
      sfx.engine(0.6, 60 + Math.abs(this.speed) * 9);
    }
  }

  preStep() {
    const b = this.body, v = b.velocity;
    v.x = Math.sin(this.yaw) * this.speed;
    v.z = Math.cos(this.yaw) * this.speed;
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);
    if (b.position.y < heightAt(b.position.x, b.position.z) - 1) b.position.y = heightAt(b.position.x, b.position.z) + 0.5; // never sink under the hill
    if (this.driving) {
      // carry the driver
      const p = this.game.player.body;
      const seat = SEAT.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      p.position.set(b.position.x + seat.x, b.position.y + seat.y, b.position.z + seat.z);
      p.velocity.copy(v);
      p.force.y -= p.mass * this.game.world.gravity.y;
    }
  }

  // After the physics step: place the mesh, tilted to the slope under the wheels.
  sync() {
    const b = this.body.interpolatedPosition;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const h = (dx, dz) => heightAt(b.x + fx * dz + fz * dx, b.z + fz * dz - fx * dx);
    const pitch = Math.atan2(h(0, -0.9) - h(0, 0.9), 1.8);
    const roll = Math.atan2(h(0.6, 0) - h(-0.6, 0), 1.2);
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.set(0, this.yaw, 0);
    this.tilt.rotation.set(pitch, 0, roll, 'XZY');
  }
}

