import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { RIG } from './character.js';
import { sfx } from '../audio.js';

const V = (a) => new CANNON.Vec3(a[0], a[1], a[2]);
const Y = new CANNON.Vec3(0, 1, 0), X = new CANNON.Vec3(1, 0, 0);
const NECK = 0.6; // most the head may turn away from the body (rad), so it never spins round
const _cq = new CANNON.Quaternion(), _cq2 = new CANNON.Quaternion();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();

// Ten physics bodies (torso, head, upper/lower arms and legs) that pose the character model's
// skeleton while it's knocked over or carried: elbows and knees bend one way only, like real ones.
// Each body drives a few bones (RIG[part].bones); bones not listed keep the pose they had when it fell.
export class Ragdoll {
  constructor(game, char) {
    this.game = game;
    this.char = char;
    this.bodies = {};
    this.constraints = [];
    this.links = []; // { bone, body, offset: Quaternion }
    this.onPostStep = () => this.limitNeck();
    for (const [name, def] of Object.entries(RIG)) {
      const shape = def.radius ? new CANNON.Sphere(def.radius) : new CANNON.Box(V(def.half));
      const body = new CANNON.Body({
        mass: def.mass, material: game.mats.item, linearDamping: 0.05, angularDamping: name === 'head' ? 0.8 : 0.5,
        collisionFilterGroup: G.RAGDOLL, collisionFilterMask: MASK.RAGDOLL, sleepSpeedLimit: 0.2,
      });
      body.addShape(shape);
      body.addEventListener('collide', (e) => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 3) sfx.hit('body', v, game.camera.position.distanceTo(body.position));
        if (v > 6 && e.body.mass !== 0 || v > 9) this.onImpact?.(v);
      });
      this.bodies[name] = body;
    }

    const b = this.bodies;
    const rel = (name, pivotOf) => { // joint position relative to a body's center
      const p = RIG[pivotOf].pivot, c = RIG[name].center;
      return new CANNON.Vec3(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    };
    // Every joint is a cone around the part's rest direction (its up axis, or bent for elbows/knees),
    // plus a hinge for elbows and knees so they only fold the one way.
    const joint = (parent, child, angle, twist, bend) => {
      const axisA = bend ? new CANNON.Vec3(0, Math.cos(bend), Math.sin(bend)) : Y;
      this.constraints.push(new CANNON.ConeTwistConstraint(b[parent], b[child], {
        pivotA: rel(parent, child), pivotB: rel(child, child), axisA, axisB: Y, angle, twistAngle: twist,
      }));
      if (bend) this.constraints.push(new CANNON.HingeConstraint(b[parent], b[child], {
        pivotA: rel(parent, child), pivotB: rel(child, child), axisA: X, axisB: X,
      }));
    };
    joint('torso', 'head', Math.PI / 6, Math.PI / 10);
    for (const s of ['L', 'R']) {
      joint('torso', 'upperArm' + s, Math.PI / 2, Math.PI / 4);
      joint('upperArm' + s, 'lowerArm' + s, 0.75, 0.1, -0.75); // elbow: hand folds forward
      joint('torso', 'upperLeg' + s, Math.PI / 3, Math.PI / 10);
      joint('upperLeg' + s, 'lowerLeg' + s, 0.7, 0.1, 0.7); // knee: foot folds back
    }
  }

  get torso() { return this.bodies.torso; }

  // Place every body where the standing character had that part, remember how each bone sits
  // relative to its body, then hand it to physics.
  spawn(matrixWorld, quaternion, velocity) {
    const v = new THREE.Vector3();
    this.char.root.updateMatrixWorld(true);
    this.links.length = 0;
    for (const [name, def] of Object.entries(RIG)) {
      const body = this.bodies[name];
      v.set(...def.center).applyMatrix4(matrixWorld);
      body.position.set(v.x, v.y, v.z);
      body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      body.previousPosition.copy(body.position);
      body.interpolatedPosition.copy(body.position);
      body.previousQuaternion.copy(body.quaternion);
      body.interpolatedQuaternion.copy(body.quaternion);
      body.velocity.copy(velocity);
      body.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      this.game.world.addBody(body);
      const inv = quaternion.clone().invert();
      for (const boneName of def.bones) {
        const bone = this.char.bones[boneName];
        this.links.push({ bone, body, offset: inv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())) });
      }
    }
    const hips = this.char.bones.Hips;
    this.hipOffset = hips.getWorldPosition(new THREE.Vector3()).sub(v.set(...RIG.torso.center).applyMatrix4(matrixWorld))
      .applyQuaternion(quaternion.clone().invert());
    // The model's feet are IK bones hanging off the skeleton root, not the shins. Pin each foot
    // to its shin as it sits now, so the feet come along instead of staying where it fell.
    const bones = this.char.bones;
    this.feet = [['FootL', 'LowerLegL'], ['FootR', 'LowerLegR']]
      .filter(([foot, leg]) => bones[foot] && bones[leg])
      .map(([foot, leg]) => ({
        foot: bones[foot], leg: bones[leg],
        rel: new THREE.Matrix4().copy(bones[leg].matrixWorld).invert().multiply(bones[foot].matrixWorld),
      }));
    for (const c of this.constraints) this.game.world.addConstraint(c);
    this.game.world.addEventListener('postStep', this.onPostStep);
    this.sync();
  }

  despawn() {
    this.game.world.removeEventListener('postStep', this.onPostStep);
    for (const c of this.constraints) this.game.world.removeConstraint(c);
    for (const body of Object.values(this.bodies)) this.game.world.removeBody(body);
  }

  // Backstop for the neck joint: if a hard hit still twists the head too far, put it back in range.
  limitNeck() {
    const t = this.torso, h = this.bodies.head;
    t.quaternion.conjugate(_cq).mult(h.quaternion, _cq); // head relative to torso
    if (_cq.w < 0) { _cq.x = -_cq.x; _cq.y = -_cq.y; _cq.z = -_cq.z; _cq.w = -_cq.w; }
    const angle = 2 * Math.acos(Math.min(1, _cq.w));
    if (angle <= NECK) return;
    _cq2.set(0, 0, 0, 1).slerp(_cq, NECK / angle, _cq2);
    t.quaternion.mult(_cq2, h.quaternion);
    h.angularVelocity.copy(t.angularVelocity);
  }

  // The body part nearest a world point (what the player grabbed).
  nearest(point) {
    let best = this.torso, bd = Infinity;
    for (const body of Object.values(this.bodies)) {
      const d = body.position.distanceTo(new CANNON.Vec3(point.x, point.y, point.z));
      if (d < bd) { bd = d; best = body; }
    }
    return best;
  }

  // Keep the flop believable: cap speeds so parts can't tunnel through walls or launch off the map.
  clampSpeed(max = 22) {
    for (const body of Object.values(this.bodies)) {
      const v = body.velocity.length();
      if (v > max) body.velocity.scale(max / v, body.velocity);
      const w = body.angularVelocity.length();
      if (w > 25) body.angularVelocity.scale(25 / w, body.angularVelocity);
    }
  }

  push(dir, speed) {
    for (const body of Object.values(this.bodies)) {
      body.velocity.x += dir.x * speed;
      body.velocity.y += dir.y * speed + 2;
      body.velocity.z += dir.z * speed;
      body.wakeUp();
    }
  }

  sync() {
    // Hips follow the torso body's position. The legs aren't children of Hips but of its parent
    // (the Body bone), so move that parent instead; otherwise the legs stay behind and stretch.
    const t = this.torso;
    const hips = this.char.bones.Hips, pivot = hips.parent;
    _q.copy(t.interpolatedQuaternion);
    _p.copy(this.hipOffset).applyQuaternion(_q).add(t.interpolatedPosition);
    hips.updateWorldMatrix(true, false);
    _p.sub(hips.getWorldPosition(_v)).add(pivot.getWorldPosition(_v));
    pivot.parent.updateWorldMatrix(true, false);
    pivot.position.copy(pivot.parent.worldToLocal(_p));
    pivot.updateMatrixWorld(true);
    // every linked bone: world rotation = body rotation * offset, converted to the parent's space
    for (const l of this.links) {
      _q.copy(l.body.interpolatedQuaternion).multiply(l.offset);
      l.bone.parent.getWorldQuaternion(_pq);
      l.bone.quaternion.copy(_pq.invert().multiply(_q));
      l.bone.updateMatrixWorld(true);
    }
    for (const { foot, leg, rel } of this.feet) {
      _m.multiplyMatrices(leg.matrixWorld, rel).premultiply(_mi.copy(foot.parent.matrixWorld).invert());
      _m.decompose(foot.position, foot.quaternion, foot.scale);
      foot.updateMatrixWorld(true);
    }
    // keep raycasts (grabbing) working on the moved skin
    for (const m of this.char.meshes) { m.computeBoundingSphere(); m.computeBoundingBox(); }
  }
}
