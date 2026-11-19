import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from '../physics.js';
import { clamp } from '../util/math.js';
import { sfx } from '../audio.js';

const FOLLOW = 14; // how fast a held thing catches up with the carry spot (1/s)
const MAX_SPEED = 12; // fast enough to keep up, slow enough not to tunnel through walls
export const GRAB_REACH = 2.3; // you have to walk up to things to pick them up
const _v = new THREE.Vector3();
const COLLAR = new CANNON.Vec3(0, 0.26, 0);
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // item +Y toward the viewer
const TILT_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.9); // in the hand: face tipped toward you
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
      if (input.mousePressed(0)) {
        // clicking something you can use while holding stuff hands it over (ticket to a visitor, cash
        // into the register, card through the reader, a friend into the cart); otherwise put it down
        const hit = this.game.interact.hit;
        if (hit?.entity.interact && hit.entity !== this.entity) { this.game.hands.punch(); hit.entity.interact(); return; }
        // holding a trash bag: click litter to stuff it in the bag
        if (this.entity.type === 'trashbag' && hit?.entity.trash && hit.entity.type !== 'trashbag' && hit.distance <= GRAB_REACH) { this.game.hands.punch(); this.game.trash.bag(this.entity, hit.entity); return; }
        return this.release();
      }
      if (input.down('KeyQ')) {
        if (!this.charging) { this.charging = true; this.charge = 0; }
        this.charge = Math.min(1, this.charge + (1 / 60) / 1.1);
      } else if (this.charging) return this.throw(this.charge);
      if (input.justPressed('KeyF') && this.entity.use) this.entity.use(this);
      // R: bring it up close and turn its face to you (read a ticket, admire a banana)
      this.inspecting = input.down('KeyR') && !this.ragdoll && !this.isAnimal;
      // The held thing sits in your hands, in camera space: small things in the right hand, bigger
      // things between both hands, animals right up in your face, a friend dangling by the collar.
      const L = this.layout;
      const off = this.inspecting ? _v.set(0, -0.03, -(0.22 + L.r * 1.2)) : _v.copy(L.off);
      camera.localToWorld(off);
      this.target.set(off.x, off.y, off.z);
      if (this.inspecting || (L.small && this.held.mass < 1)) {
        _q.copy(camera.quaternion).multiply(this.inspecting ? FACE_UP : TILT_UP);
        this.held.quaternion.slerp(new CANNON.Quaternion(_q.x, _q.y, _q.z, _q.w), 0.3, this.held.quaternion);
        this.held.angularVelocity.set(0, 0, 0);
      }
      // Wedged behind something for a moment: drop it rather than fight the wall.
      this.stuck = this.held.position.distanceTo(this.target) > 1.8 ? this.stuck + 1 / 60 : 0;
      if (this.stuck > 0.5) { sfx.snap(); this.release(); }
    } else if (input.mousePressed(0)) {
      const hit = this.game.interact.hit;
      if (hit && hit.entity.getGrabBody && hit.distance <= GRAB_REACH) this.grab(hit);
      else if (hit && hit.entity.interact) { this.game.hands.punch(); hit.entity.interact(); } // left click is the use button
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
    this.charging = false;
    this.charge = 0;
    this.isAnimal = !!this.entity.updateHeld;
    this.layout = this.makeLayout(hit.entity);
    if (hit.point) this.game.hands.reach(this.game.camera.worldToLocal(hit.point.clone()));
    // Nothing you carry should shove you around (all of a ragdoll's parts included).
    const bodies = hit.entity.ragdoll ? Object.values(hit.entity.ragdoll.bodies) : [this.held];
    this.saved = bodies.map((b) => [b, b.collisionFilterMask, b.angularDamping]);
    for (const b of bodies) { b.collisionFilterMask &= ~G.PLAYER; b.wakeUp(); }
    // small things ride in your hand without bumping into the counter or the desk
    if (this.layout.small || this.isAnimal) this.held.collisionFilterMask = 0;
    this.held.angularDamping = 0.9;
    this.ragdoll = hit.entity.ragdoll || null;
    if (this.ragdoll) {
      this.held.angularDamping = 0.6;
      this.held.pointToWorldFrame(COLLAR, this.hand.position);
      this.game.world.addBody(this.hand);
      this.joint = new CANNON.PointToPointConstraint(this.hand, new CANNON.Vec3(), this.held, COLLAR, 2500);
      this.game.world.addConstraint(this.joint);
      for (const p of Object.values(this.ragdoll.bodies)) p.linearDamping = 0.3; // less pendulum, still floppy
    }
    sfx.grab();
  }

  // Where the held thing sits (camera space) and where each hand grips it.
  makeLayout(entity) {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    if (this.ragdoll) {
      // the right hand holds them up by the collar; they dangle in front of you
      return { r: 0.3, off: V3(0.05, -0.12, -0.75), right: V3(0.08, -0.16, -0.66), left: null, collar: true };
    }
    if (this.isAnimal) {
      // right in your face: it's pretty much all you can see
      const L = entity.L || 0.6, W = entity.W || L * 0.5, H = entity.H || L * 0.6;
      const z = -(0.16 + Math.min(L, 1.6) * 0.3);
      return { r: L / 2, off: V3(0, -0.06 - H * 0.12, z), right: V3(W * 0.5 + 0.03, -0.14 - H * 0.2, z + 0.06), left: V3(-(W * 0.5 + 0.03), -0.14 - H * 0.2, z + 0.06) };
    }
    const r = Math.min(this.held.boundingRadius || 0.2, 0.9);
    if (r < 0.2 && this.held.mass < 3) {
      // one-handed: it sits in your right hand
      return { r, off: V3(0.19, -0.2, -0.46), right: V3(0.235, -0.285, -0.39), left: null, small: true };
    }
    // two-handed: hands on either side
    const z = -(0.38 + r), y = -0.22 - Math.min(r, 0.5) * 0.25;
    return { r, off: V3(0, y, z), right: V3(r * 0.85 + 0.02, y - 0.04, z + 0.05), left: V3(-(r * 0.85 + 0.02), y - 0.04, z + 0.05) };
  }

  // Camera-space wrist targets for the first-person hands (null = that hand is free).
  get grip() {
    if (!this.held || !this.layout) return null;
    if (this.inspecting) { const z = -(0.22 + this.layout.r * 1.2); return { right: new THREE.Vector3(0.05, -0.09, z + 0.07), left: null }; }
    return this.layout;
  }

  release() {
    const b = this.held;
    if (!b) return;
    // never let go of something inside a wall or a counter: pull it back to this side of whatever is in the way
    if (this.layout?.small || this.isAnimal) {
      const cam = this.game.camera.position, ray = new CANNON.RaycastResult();
      const from = new CANNON.Vec3(cam.x, cam.y, cam.z);
      this.game.world.raycastClosest(from, b.position, { collisionFilterMask: G.STATIC | G.KINEMATIC, skipBackfaces: true }, ray);
      if (ray.hasHit) {
        const d = b.position.vsub(from), len = d.length();
        b.position.copy(from.vadd(d.scale(Math.max(0, ray.distance - 0.12) / len)));
      }
    }
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
    this.layout = null;
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
      h.velocity.set((t.x - h.position.x) / dt, (t.y - h.position.y) / dt, (t.z - h.position.z) / dt);
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
