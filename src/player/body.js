import * as THREE from 'three';
import { createCharacter, LOOKS } from '../characters/character.js';

// Your own body: the same character model your friends and the visitors use, in your colours.
// On foot it walks under the camera (look down and you see your legs; it casts your shadow); the
// first-person hands are drawn separately, so its arms and head are tucked away. In the golf cart
// it sits in the driver's seat with both hands on the steering wheel, turning it as you steer.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const TINY = 0.0001;

// Turn a bone so the direction toward its child points along worldDir.
function aim(bone, child, worldDir) {
  const along = _a.copy(child.position).normalize();
  bone.getWorldQuaternion(_q);
  const cur = along.applyQuaternion(_q);
  _q2.setFromUnitVectors(cur, _b.copy(worldDir).normalize());
  _q.premultiply(_q2);
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(_q));
  bone.updateWorldMatrix(false, true);
}

export class PlayerBody {
  constructor(game) {
    this.game = game;
    this.char = createCharacter(LOOKS[0]);
    this.root = this.char.root;
    this.root.traverse((o) => { if (o.isMesh) o.userData.isPlayer = true; });
    game.scene.add(this.root);
    const B = this.char.bones;
    this.B = B;
    // arm lengths from the rest pose, for the steering-wheel reach
    this.root.updateMatrixWorld(true);
    const len = (p, c) => B[p].getWorldPosition(_a).distanceTo(B[c].getWorldPosition(_b));
    this.upper = len('UpperArmL', 'LowerArmL');
    this.lower = len('LowerArmL', 'PalmL');
  }

  setScale(bone, s) { bone.scale.setScalar(s); }

  update(dt) {
    const g = this.game, p = g.player, B = this.B, st = this.char.state;
    const cart = p.driving && p.driving.isCart ? p.driving : null;
    const flying = g.mods.fly;
    this.root.visible = !flying && g.mode !== 'computer' && !(p.driving && p.driving.seat === true);
    if (!this.root.visible) return;
    const v = p.body.velocity;
    if (cart) {
      st.speed = 0;
      this.char.animate(dt);
      // sit: hips on the cushion, thighs forward, shins down
      cart.tilt.updateMatrixWorld(true);
      const hip = cart.tilt.localToWorld(_c.copy(cart.SEAT).add(_d.set(0, -0.14, -0.14)));
      this.root.position.copy(hip).y -= 0.8;
      this.root.quaternion.copy(cart.tilt.getWorldQuaternion(_q));
      this.root.updateMatrixWorld(true);
      B.Head.scale.setScalar(TINY);
      for (const s of ['L', 'R']) B['UpperArm' + s].scale.setScalar(1);
      const fwd = _d.set(0, 0, 1).applyQuaternion(this.root.quaternion);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.root.quaternion);
      for (const s of ['L', 'R']) {
        aim(B['UpperLeg' + s], B['LowerLeg' + s], _c.copy(fwd).addScaledVector(down, 0.15));
        aim(B['LowerLeg' + s], B['LowerLeg' + s].children.find((c) => c.isBone) || B['LowerLeg' + s].children[0], _c.copy(down).addScaledVector(fwd, 0.35));
      }
      // hands on the wheel rim at ten and two, which turns with the wheel
      for (const s of ['L', 'R']) {
        const grip = cart.wheelGrip(s === 'L' ? 1 : -1, _c);
        this.reachArm(s, grip);
      }
      return;
    }
    // on foot: stand under the camera, a little behind it so looking down shows your chest and legs
    st.speed = Math.hypot(v.x, v.z);
    this.char.animate(dt);
    for (const s of ['L', 'R']) B['UpperArm' + s].scale.setScalar(TINY);
    B.Head.scale.setScalar(TINY);
    const yaw = p.yaw + Math.PI;
    this.root.position.set(p.body.interpolatedPosition.x - Math.sin(yaw) * 0.22, p.feetY, p.body.interpolatedPosition.z - Math.cos(yaw) * 0.22);
    this.root.quaternion.setFromAxisAngle(_a.set(0, 1, 0), yaw);
  }

  // Two-bone reach: shoulder → elbow → hand, elbow bending down and out.
  reachArm(s, target) {
    const B = this.B, up = B['UpperArm' + s], lo = B['LowerArm' + s], palm = B['Palm' + s];
    const S = up.getWorldPosition(new THREE.Vector3());
    const toT = new THREE.Vector3().subVectors(target, S);
    const a = this.upper, b = this.lower;
    const d = Math.min(toT.length(), a + b - 0.002);
    const dir = toT.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const side = s === 'L' ? 1 : -1;
    const hint = new THREE.Vector3(side * 0.6, -1, 0).applyQuaternion(this.root.quaternion);
    const perp = hint.sub(dir.clone().multiplyScalar(hint.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(1 - cosA * cosA));
    aim(up, lo, E.clone().sub(S));
    aim(lo, palm, target.clone().sub(E));
  }
}
