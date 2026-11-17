import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from '../physics.js';
import { clamp } from '../util/math.js';
import { sfx } from '../audio.js';

const FOLLOW = 14; // how fast a held thing catches up with the carry spot (1/s)
const MAX_SPEED = 12; // fast enough to keep up, slow enough not to tunnel through walls
const MIN_REACH = 1.1, MAX_REACH = 2.6;
const COLLAR = new CANNON.Vec3(0, 0.26, 0);
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // item +Y toward the viewer
const _q = new THREE.Quaternion(); // where a friend is held: the back of the collar, on the torso

// Carrying: click something to pick it up, click again to put it down. Hold Q to wind up a throw
// (longer = harder, up to ~1.1 s) and let go of Q to throw. Animals are held right up in your face. Things float at a fixed spot in front of you (they still bump into walls).
// A friend is held by the collar with a joint instead, so gravity still works on the rest of them:
// arms and legs dangle and swing as you move.
export class Grabber {
  constructor(game) {
    this.game = game;
    this.held = null;
    this.entity = null;
    this.target = new CANNON.Vec3();
    this.dist = 1.6;
    this.dir = new THREE.Vector3();
    this.stuck = 0;
    this.saved = [];
    this.charge = 0; // 0..1 while Q is held
    this.charging = false;
    // invisible "hand" the collar joint hangs from, moved to the carry spot every step
    this.hand = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0, allowSleep: false });
    this.joint = null;
    game.world.addEventListener('preStep', () => this.preStep());
  }

  get heavy() { return !!this.held && this.held.mass > 12; }

  update() {
    const { input, camera } = this.game;
    camera.getWorldDirection(this.dir);

    if (this.held) {
      if (!this.held.world) return this.release();
      if (input.mousePressed(0)) return this.release();
      if (input.down('KeyQ')) {
        if (!this.charging) { this.charging = true; this.charge = 0; }
        this.charge = Math.min(1, this.charge + (1 / 60) / 1.1);
      } else if (this.charging) return this.throw(this.charge);
      if (input.justPressed('KeyF') && this.entity.use) this.entity.use(this);
      // R: bring it up close and turn its face to you (read a ticket, admire a banana)
      this.inspecting = input.down('KeyR') && !this.ragdoll && !this.isAnimal;
      // animals are held with their face at your eye level (tall ones lower down), everything else a bit low
      const face = this.isAnimal ? -Math.max(0, (this.entity.H || 0.5) * 0.32 - 0.1) : this.inspecting ? 0 : -0.15;
      const dist = this.inspecting ? 0.3 + (this.held.boundingRadius || 0.1) : this.dist;
      this.target.set(
        camera.position.x + this.dir.x * dist,
        camera.position.y + this.dir.y * dist + face,
        camera.position.z + this.dir.z * dist);
      if (this.inspecting) {
        _q.copy(camera.quaternion).multiply(FACE_UP);
        this.held.quaternion.slerp(new CANNON.Quaternion(_q.x, _q.y, _q.z, _q.w), 0.3, this.held.quaternion);
        this.held.angularVelocity.set(0, 0, 0);
      }
      // Wedged behind something for a moment: drop it rather than fight the wall.
      this.stuck = this.held.position.distanceTo(this.target) > 1.8 ? this.stuck + 1 / 60 : 0;
      if (this.stuck > 0.5) { sfx.snap(); this.release(); }
    } else if (input.mousePressed(0)) {
      const hit = this.game.interact.hit;
      if (hit && hit.entity.getGrabBody) this.grab(hit);
      else this.game.hands.punch();
    }
  }

  grab(hit) {
    const body = hit.entity.getGrabBody(hit.object, hit.point);
    if (!body) return;
    this.held = body;
    this.entity = body.itemOwner || hit.entity; // a dispenser (the ticket pile) hands over a new item
    this.stuck = 0;
    // A friend is carried by the torso, everything else by its middle.
    if (hit.entity.ragdoll) this.held = hit.entity.ragdoll.torso;
    const radius = this.held.boundingRadius || 0.3;
    this.dist = clamp(1.15 + radius, MIN_REACH, MAX_REACH);
    this.charging = false;
    this.charge = 0;
    // Animals get held right up to your face so you can see how furious they are.
    this.isAnimal = !!this.entity.updateHeld;
    if (this.isAnimal) this.dist = 0.42 + (this.entity.L || 0.6) * 0.45;
    // Nothing you carry should shove you around (all of a ragdoll's parts included).
    const bodies = hit.entity.ragdoll ? Object.values(hit.entity.ragdoll.bodies) : [this.held];
    this.saved = bodies.map((b) => [b, b.collisionFilterMask, b.angularDamping]);
    for (const b of bodies) { b.collisionFilterMask &= ~G.PLAYER; b.wakeUp(); }
    this.held.angularDamping = 0.9;
    this.ragdoll = hit.entity.ragdoll || null;
    if (this.ragdoll) {
      this.held.angularDamping = 0.6;
      this.held.pointToWorldFrame(COLLAR, this.hand.position);
      this.game.world.addBody(this.hand);
      this.joint = new CANNON.PointToPointConstraint(this.hand, new CANNON.Vec3(), this.held, COLLAR, 2500);
      this.game.world.addConstraint(this.joint);
      for (const p of Object.values(this.ragdoll.bodies)) p.linearDamping = 0.3; // less pendulum, still floppy
      this.dist += 0.2;
    }
    sfx.grab();
  }

  release() {
    const b = this.held;
    if (!b) return;
    for (const [body, mask, damping] of this.saved) { body.collisionFilterMask = mask; body.angularDamping = damping; }
    this.saved = [];
    if (this.joint) {
      this.game.world.removeConstraint(this.joint);
      this.game.world.removeBody(this.hand);
      for (const p of Object.values(this.ragdoll.bodies)) {
        p.linearDamping = 0.05;
        const v = p.velocity.length(); // flailing limbs shouldn't fling them when you just let go
        if (v > 5) p.velocity.scale(5 / v, p.velocity);
      }
      this.joint = null;
    }
    this.ragdoll = null;
    this.charging = false;
    this.isAnimal = false;
    const v = b.velocity.length();
    if (v > 10) b.velocity.scale(10 / v, b.velocity);
    this.held = null;
    this.entity = null;
    sfx.drop();
  }

  throw(power = 0.6) {
    const b = this.held, e = this.entity;
    this.release();
    const speed = clamp(15 - b.mass * 0.7, 4, 15) * (0.3 + power * 1.1) * this.game.mods.throwPower;
    if (e.onThrow) e.onThrow(this.dir, speed);
    else {
      b.velocity.x += this.dir.x * speed;
      b.velocity.y += this.dir.y * speed + 1.5;
      b.velocity.z += this.dir.z * speed;
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    sfx.throw();
    this.game.hands.throwAnim();
  }

  // Steer the held body's velocity toward the carry spot (gravity cancelled while held).
  // A held friend instead hangs off the hand, which slides to the carry spot.
  preStep() {
    const b = this.held;
    if (!b) return;
    const t = this.target, pv = this.game.player.body.velocity;
    if (this.joint) {
      const h = this.hand, dt = this.game.world.dt || 1 / 60;
      h.velocity.set((t.x - h.position.x) / dt, (t.y + 0.55 - h.position.y) / dt, (t.z - h.position.z) / dt); // high enough that their feet dangle
      const s = h.velocity.length();
      if (s > MAX_SPEED * 1.5) h.velocity.scale(MAX_SPEED * 1.5 / s, h.velocity);
      return;
    }
    let vx = (t.x - b.position.x) * FOLLOW + pv.x;
    let vy = (t.y - b.position.y) * FOLLOW;
    let vz = (t.z - b.position.z) * FOLLOW + pv.z;
    const s = Math.hypot(vx, vy, vz);
    if (s > MAX_SPEED) { vx *= MAX_SPEED / s; vy *= MAX_SPEED / s; vz *= MAX_SPEED / s; }
    const k = this.heavy ? 0.35 : 0.6;
    b.velocity.x += (vx - b.velocity.x) * k;
    b.velocity.y += (vy - b.velocity.y) * k;
    b.velocity.z += (vz - b.velocity.z) * k;
    b.force.y -= b.mass * this.game.world.gravity.y;
    b.angularVelocity.scale(0.85, b.angularVelocity);
  }
}
