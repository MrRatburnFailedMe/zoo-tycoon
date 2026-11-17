import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { mat, mesh } from '../util/build.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
    const white = mat(0xf7f3e8, { roughness: 0.35 }), green = mat(0x2f8f4a, { roughness: 0.4 }), dark = mat(0x26292c, { roughness: 0.6 });
    const seatM = mat(0xe9dcc0, { roughness: 0.8 }), chrome = mat(0xcfd6db, { metalness: 0.7, roughness: 0.25 }), rubber = mat(0x1b1c1e, { roughness: 0.9 });
    const add = (geo, m, x, y, z, parent = this.tilt) => { const o = mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
    const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, r);
    // chassis and body
    add(rbox(1.2, 0.16, 2.3, 0.05), dark, 0, 0.32, 0);
    add(rbox(1.22, 0.32, 2.25, 0.1), white, 0, 0.5, 0.02);
    add(rbox(1.24, 0.06, 2.27, 0.03), green, 0, 0.42, 0.02); // stripe
    // front cowl with headlights and a bumper
    const cowl = add(rbox(1.16, 0.42, 0.62, 0.14), white, 0, 0.82, 0.86);
    cowl.rotation.x = -0.12;
    add(rbox(1.18, 0.08, 0.66, 0.04), green, 0, 1.03, 0.84).rotation.x = -0.12;
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 14), mat(0xfff3b0, { emissive: 0xffe08a, emissiveIntensity: 0.7 }), sx * 0.38, 0.8, 1.18).rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.075, 0.012, 6, 16), chrome, sx * 0.38, 0.8, 1.19);
    }
    add(rbox(1.26, 0.1, 0.12, 0.04), rubber, 0, 0.36, 1.2); // front bumper
    add(rbox(1.26, 0.1, 0.12, 0.04), rubber, 0, 0.36, -1.18); // rear bumper
    // floor mat and seats
    add(new THREE.BoxGeometry(1.05, 0.02, 0.6), rubber, 0, 0.67, 0.42);
    add(rbox(1.08, 0.16, 0.58, 0.07), seatM, 0, 0.8, 0.0);
    add(rbox(1.08, 0.48, 0.12, 0.06), seatM, 0, 1.08, -0.3).rotation.x = -0.12;
    for (const sx of [-1, 1]) add(rbox(0.06, 0.2, 0.5, 0.03), chrome, sx * 0.57, 0.95, 0.0); // armrests
    // rear basket with a golf bag of zoo supplies
    add(rbox(1.1, 0.32, 0.7, 0.04), green, 0, 0.74, -0.78);
    add(new THREE.BoxGeometry(1.0, 0.03, 0.62), dark, 0, 0.9, -0.78);
    const bag = add(new THREE.CylinderGeometry(0.13, 0.12, 0.7, 12), mat(0xe2523c), 0.3, 1.2, -0.85);
    bag.rotation.x = -0.25;
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), chrome, 0.26 + i * 0.04, 1.6, -0.95 + i * 0.02).rotation.x = -0.25;
    // roof on four posts
    for (const [x, z] of [[-0.56, 0.62], [0.56, 0.62], [-0.56, -0.42], [0.56, -0.42]]) add(new THREE.CylinderGeometry(0.025, 0.025, 1.12, 8), chrome, x, 1.48, z);
    add(rbox(1.36, 0.08, 1.5, 0.04), green, 0, 2.06, 0.12);
    add(rbox(1.3, 0.04, 1.44, 0.02), white, 0, 2.11, 0.12);
    // windscreen in a frame
    const ws = add(new THREE.BoxGeometry(1.08, 0.62, 0.02), mat(0x9fd3e6, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25 }), 0, 1.66, 0.64);
    ws.castShadow = false;
    add(new THREE.BoxGeometry(1.12, 0.03, 0.04), chrome, 0, 1.36, 0.64);
    // dash, steering column and wheel
    add(rbox(1.0, 0.12, 0.2, 0.04), dark, 0, 1.04, 0.6);
    const col = add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), dark, -0.28, 1.12, 0.48);
    col.rotation.x = -0.65;
    this.wheel = add(new THREE.TorusGeometry(0.17, 0.022, 8, 20), rubber, -0.28, 1.3, 0.34);
    this.wheel.rotation.x = -0.95;
    const spoke = mesh(new THREE.BoxGeometry(0.32, 0.02, 0.02), dark);
    this.wheel.add(spoke);
    // wheels: tyre, hubcap
    this.wheels = [];
    for (const [x, z] of [[-0.6, 0.78], [0.6, 0.78], [-0.6, -0.78], [0.6, -0.78]]) {
      const w = new THREE.Group();
      w.position.set(x, 0.24, z);
      const tyre = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 16), rubber); tyre.rotation.z = Math.PI / 2;
      const hub = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.19, 12), chrome); hub.rotation.z = Math.PI / 2;
      const nut = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), dark); nut.position.x = Math.sign(x) * 0.0;
      w.add(tyre, hub, nut);
      this.tilt.add(w);
      this.wheels.push(w);
    }
    this.game.scene.add(g);
  }

  interact() { if (!this.driving) this.enter(); }

  enter() {
    const g = this.game;
    g.grabber.release();
    this.driving = true;
    this.justEntered = true; // the same E press must not also hop straight back out
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
      if (this.justEntered) this.justEntered = false;
      else if (input.justPressed('KeyE')) { this.exit(); return; }
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

