import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { clamp, damp } from '../util/math.js';
import { heightAt, pondWaterY } from '../world/terrain.js';
import { POND } from '../world/layout.js';
import { sfx } from '../audio.js';

const RADIUS = 0.35;
const FOOT = 0.85; // body center → soles
const EYE = 0.62; // body center → eyes
const WALK = 4.4, SPRINT = 7.4, JUMP = 5.6;
const GROUND_MASK = G.STATIC | G.ITEM | G.RAGDOLL | G.KINEMATIC;

const ray = new CANNON.RaycastResult();
const from = new CANNON.Vec3(), to = new CANNON.Vec3();

// First-person capsule controller (three stacked spheres, rotation locked, zero friction).
// Velocity-driven so it feels snappy; goofy bits = slipping on poop, getting bonked, faceplanting.
export class Player {
  constructor(game, spawn) {
    this.game = game;
    this.spawn = spawn;
    const body = new CANNON.Body({
      mass: 70, material: game.mats.player, fixedRotation: true, allowSleep: false, linearDamping: 0,
      collisionFilterGroup: G.PLAYER, collisionFilterMask: MASK.PLAYER,
    });
    for (const y of [-0.5, 0, 0.5]) body.addShape(new CANNON.Sphere(RADIUS), new CANNON.Vec3(0, y, 0));
    game.world.addBody(body);
    this.body = body;

    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.roll = 0;
    this.grounded = false;
    this.groundNormal = new CANNON.Vec3(0, 1, 0);
    this.minAirVy = 0;
    this.jumpCd = 0;
    this.slip = 0;
    this.slipDir = 1;
    this.stun = 0;
    this.shake = 0;
    this.inWater = false;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.lastStep = 0;
    this.dip = 0;
    this.dipVel = 0;
    this.fov = 75;
    this.move = new THREE.Vector2();
    this.sprinting = false;
    this.pendingImpulse = null;
    this.waterY = pondWaterY();
    this.respawn();

    game.world.addEventListener('preStep', () => this.preStep());
    body.addEventListener('collide', (e) => this.onCollide(e));
  }

  get feetY() { return this.body.position.y - FOOT; }

  // Mod menu fly mode: no gravity, no collisions, move along the view direction.
  setFly(on) {
    this.body.collisionResponse = !on;
    this.body.velocity.set(0, 0, 0);
    this.slip = this.stun = 0;
  }

  updateFly(dt) {
    const { input } = this.game;
    const v = this.body.velocity;
    let ix = 0, iz = 0, iy = 0;
    if (input.down('KeyW')) iz += 1;
    if (input.down('KeyS')) iz -= 1;
    if (input.down('KeyD')) ix += 1;
    if (input.down('KeyA')) ix -= 1;
    if (input.down('Space')) iy += 1;
    if (input.down('ControlLeft') || input.down('KeyC')) iy -= 1;
    this.move.set(ix, iz);
    this.sprinting = false;
    const fast = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = 12 * this.game.mods.speed * (fast ? 3 : 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = new THREE.Vector3(-sy * cp * iz + cy * ix, sp * iz + iy, -cy * cp * iz - sy * ix);
    if (want.lengthSq() > 1) want.normalize();
    const k = Math.min(1, 8 * dt);
    v.x += (want.x * speed - v.x) * k;
    v.y += (want.y * speed - v.y) * k;
    v.z += (want.z * speed - v.z) * k;
    this.grounded = false;
    this.inWater = false;
    this.minAirVy = 0;
  }

  respawn() {
    const { x, z } = this.spawn;
    this.body.position.set(x, heightAt(x, z) + FOOT + 0.3, z);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, 0);
  }

  checkGround() {
    const p = this.body.position;
    from.set(p.x, p.y, p.z);
    to.set(p.x, p.y - FOOT - 0.3, p.z);
    ray.reset();
    this.game.world.raycastClosest(from, to, { collisionFilterMask: GROUND_MASK, skipBackfaces: true }, ray);
    const was = this.grounded;
    this.grounded = ray.hasHit && ray.distance < FOOT + 0.14 && ray.hitNormalWorld.y > 0.55 && this.jumpCd <= 0.12;
    if (this.grounded) this.groundNormal.copy(ray.hitNormalWorld);
    else this.minAirVy = Math.min(this.minAirVy, this.body.velocity.y);

    if (!was && this.grounded) {
      const vy = this.minAirVy;
      if (vy < -4) { this.dipVel = vy * 0.06; sfx.land(-vy); }
      if (vy < -13 && this.stun <= 0) {
        this.stun = 1.1;
        this.shake = 0.5;
        this.game.health.damagePlayer(Math.round((-vy - 11) * 5));
        sfx.oof();
      }
      this.minAirVy = 0;
    }
  }

  update(dt) {
    const { input } = this.game;
    const b = this.body;
    const v = b.velocity;

    if (input.locked) {
      this.yaw -= input.dx * 0.0022;
      this.pitch = clamp(this.pitch - input.dy * 0.0022, -1.52, 1.52);
    }
    this.lookDX = input.dx;
    this.lookDY = input.dy;
    const mods = this.game.mods;
    if (this.driving) { this.grounded = true; this.minAirVy = 0; this.move.set(0, 0); this.sprinting = false; return; } // the cart moves us
    if (mods.fly) return this.updateFly(dt);
    if (mods.god) this.slip = this.stun = 0;

    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.slip = Math.max(0, this.slip - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.checkGround();

    const feet = this.feetY;
    this.inWater = Math.hypot(b.position.x - POND.x, b.position.z - POND.z) < POND.r + 1 && feet < this.waterY - 0.15;

    if (this.pendingImpulse) {
      v.x += this.pendingImpulse.x / b.mass;
      v.y += this.pendingImpulse.y / b.mass;
      v.z += this.pendingImpulse.z / b.mass;
      this.pendingImpulse = null;
      this.grounded = false;
      this.jumpCd = 0.3;
    }

    const control = this.slip <= 0 && this.stun <= 0;
    let ix = 0, iz = 0;
    if (control) {
      if (input.down('KeyW')) iz += 1;
      if (input.down('KeyS')) iz -= 1;
      if (input.down('KeyD')) ix += 1;
      if (input.down('KeyA')) ix -= 1;
    }
    this.move.set(ix, iz);
    this.sprinting = control && iz > 0 && (input.down('ShiftLeft') || input.down('ShiftRight'));
    const speed = (this.sprinting ? SPRINT : WALK) * mods.speed * (this.inWater ? 0.55 : 1) * (this.game.grabber.heavy ? 0.75 : 1);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * iz + cy * ix, wz = -cy * iz - sy * ix;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    if (control) {
      const accel = this.grounded ? 14 : this.inWater ? 4 : 2.2;
      const k = Math.min(1, accel * dt);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
    } else if (this.slip > 0 && this.grounded) {
      v.x *= 1 - 0.6 * dt; // banana-peel physics: barely any friction
      v.z *= 1 - 0.6 * dt;
    } else if (this.grounded) {
      v.x *= 1 - Math.min(1, 6 * dt);
      v.z *= 1 - Math.min(1, 6 * dt);
    }

    if (control && input.justPressed('Space') && (this.grounded || this.inWater) && this.jumpCd <= 0) {
      v.y = (this.inWater ? 4.2 : JUMP) * Math.sqrt(mods.jump);
      this.jumpCd = 0.3;
      this.grounded = false;
      sfx.jump();
    }

    this.checkSlip();

    if (b.position.y < -30) this.respawn();
  }

  // Walking fast over poop (or a banana peel) sends you flying.
  checkSlip() {
    if (this.slip > 0 || !this.grounded) return;
    const b = this.body, v = b.velocity;
    const hv = Math.hypot(v.x, v.z);
    if (hv < 2.2) return;
    const feet = this.feetY;
    for (const it of this.game.items.list) {
      if (it.type !== 'poop' && it.type !== 'banana') continue;
      if (this.game.grabber.entity === it) continue;
      const p = it.body.position;
      if (Math.abs(p.y - feet) > 0.45) continue;
      if (Math.hypot(p.x - b.position.x, p.z - b.position.z) > RADIUS + it.radius + 0.05) continue;
      this.slip = 1.5;
      this.slipDir = Math.random() < 0.5 ? -1 : 1;
      v.x *= 1.5;
      v.z *= 1.5;
      v.y = 3.2;
      this.jumpCd = 0.2;
      it.body.velocity.set(v.x * 0.8, 2, v.z * 0.8);
      it.body.wakeUp();
      sfx.slip();
      this.game.hud.big('WHOOPS!');
      return;
    }
  }

  preStep() {
    const b = this.body;
    if (this.driving) return;
    if (this.game.mods.fly) { b.force.y -= b.mass * this.game.world.gravity.y; return; }
    if (this.grounded && this.jumpCd <= 0 && this.slip <= 0 && !this.inWater) {
      // Cancel the downhill part of gravity so you don't creep down slopes while standing still,
      // and press into the ground a little so you don't launch off every bump.
      const n = this.groundNormal;
      const g = this.game.world.gravity.y;
      const gn = g * n.y;
      b.force.x += b.mass * (gn * n.x);
      b.force.y += -b.mass * (g - gn * n.y);
      b.force.z += b.mass * (gn * n.z);
      b.force.x -= n.x * b.mass * 6;
      b.force.y -= n.y * b.mass * 6;
      b.force.z -= n.z * b.mass * 6;
    }
    if (this.inWater) {
      const depth = this.waterY - this.feetY;
      b.force.y += b.mass * 9.82 * Math.min(1.3, depth * 1.1) - b.velocity.y * b.mass * 1.5;
    }
  }

  onCollide(e) {
    const other = e.body;
    if (this.driving) return;
    if (this.game.mods.god || this.game.mods.fly) return;
    if (other === this.game.grabber.held || other.type !== CANNON.Body.DYNAMIC || other.mass < 0.4) return;
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact < 7) return;
    const n = e.contact.bi === this.body ? e.contact.ni.negate() : e.contact.ni.clone();
    const strength = Math.min(impact * other.mass * 0.9, 450);
    this.pendingImpulse = { x: n.x * strength, y: Math.max(0.3, n.y) * strength * 0.5 + 120, z: n.z * strength };
    this.stun = Math.min(1.2, 0.3 + impact * 0.05);
    this.shake = 0.4;
    sfx.bonk();
    this.game.health.damagePlayer(Math.round(Math.min(40, impact * other.mass * 0.3)));
  }

  // Camera follows the body with head-bob, landing dip, slip roll and shake.
  postStep(dt) {
    const cam = this.game.camera;
    const p = this.body.interpolatedPosition;
    const v = this.body.velocity;
    const hv = Math.hypot(v.x, v.z);
    const moving = this.grounded && hv > 0.6;
    this.bobAmt += ((moving ? Math.min(hv / 7, 1) : 0) - this.bobAmt) * damp(8, dt);
    if (moving) {
      this.bobPhase += dt * (4.5 + hv * 1.1);
      const step = Math.floor(this.bobPhase / Math.PI);
      if (step !== this.lastStep) { this.lastStep = step; sfx.step(hv); }
    }
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.07 * this.bobAmt - this.bobAmt * 0.035;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmt;

    this.dipVel += (-this.dip * 140 - this.dipVel * 14) * dt;
    this.dip += this.dipVel * dt;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    cam.position.set(p.x + cy * bobX, p.y + EYE + bobY + this.dip, p.z - sy * bobX);

    let targetRoll = -this.move.x * 0.022;
    let pitchOff = 0;
    if (this.slip > 0) {
      const t = 1 - this.slip / 1.5;
      const env = Math.sin(Math.min(1, t * 2.2) * Math.PI / 2) * Math.min(1, this.slip / 0.4);
      targetRoll = this.slipDir * 1.15 * env;
      pitchOff = 0.9 * env;
    }
    if (this.stun > 0) {
      targetRoll += Math.sin(performance.now() * 0.008) * 0.25 * Math.min(1, this.stun);
      pitchOff -= 0.3 * Math.min(1, this.stun);
    }
    this.roll += (targetRoll - this.roll) * damp(10, dt);
    let shakeX = 0, shakeY = 0;
    if (this.shake > 0) { shakeX = (Math.random() - 0.5) * this.shake * 0.12; shakeY = (Math.random() - 0.5) * this.shake * 0.12; }
    cam.rotation.set(clamp(this.pitch + pitchOff, -1.55, 1.55) + shakeX, this.yaw + shakeY, this.roll, 'YXZ');

    const targetFov = this.game.mods.fov + (this.sprinting && hv > 5 ? 8 : 0);
    this.fov += (targetFov - this.fov) * damp(6, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
}
