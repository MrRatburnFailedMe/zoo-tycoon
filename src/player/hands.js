import * as THREE from 'three';
import { mat, mesh } from '../util/build.js';
import { clamp, damp } from '../util/math.js';

const FWD = new THREE.Vector3(0, 0, -1);
const HAND_LEN = 0.12;
const MAX_LEN = 0.6; // arm length cap

// First-person arms, rendered in their own pass on top of the world so they never clip into walls.
// When carrying something both hands come up and hold it in front of you. Arms never stretch.
export class Hands {
  constructor(look) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x6a7f55, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(0.6, 1, 0.3);
    this.scene.add(key);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.arms = [this.makeArm(look, 1), this.makeArm(look, -1)];
    this.punchT = 0;
    this.throwT = 0;
    this.sway = new THREE.Vector2();
    this.tmp = new THREE.Vector3();
  }

  makeArm(look, side) {
    const pivot = new THREE.Group();
    const sleeveGeo = new THREE.BoxGeometry(0.11, 0.11, 1);
    sleeveGeo.translate(0, 0, -0.5);
    const sleeve = mesh(sleeveGeo, mat(look.shirt), { cast: false });
    const hand = new THREE.Group();
    const skin = mat(look.skin);
    const palm = mesh(new THREE.BoxGeometry(0.095, 0.045, 0.1), skin, { cast: false });
    palm.position.z = -0.05;
    hand.add(palm);
    const cuff = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), mat(0x222222), { cast: false });
    cuff.position.z = 0.0;
    hand.add(cuff);
    const fingers = new THREE.Group();
    fingers.position.set(0, 0, -0.1);
    for (let i = 0; i < 4; i++) {
      const f = mesh(new THREE.BoxGeometry(0.02, 0.025, 0.07), skin, { cast: false });
      f.position.set(-0.036 + i * 0.024, 0, -0.03);
      fingers.add(f);
    }
    hand.add(fingers);
    const thumb = mesh(new THREE.BoxGeometry(0.025, 0.025, 0.06), skin, { cast: false });
    thumb.position.set(-side * 0.055, 0.01, -0.05);
    thumb.rotation.y = side * 0.5;
    hand.add(thumb);
    pivot.add(sleeve, hand);
    this.root.add(pivot);
    const rest = new THREE.Vector3(0.3 * side, -0.4, 0.05);
    pivot.position.copy(rest);
    const restTarget = new THREE.Vector3(0.2 * side, -0.24, -0.5);
    return { pivot, sleeve, hand, fingers, side, rest, restTarget, cur: restTarget.clone(), vel: new THREE.Vector3(), curl: 0.3 };
  }

  punch() { this.punchT = 0.22; }
  throwAnim() { this.throwT = 0.3; }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  // s: { holding, heavy, bob, bobAmt, lookDX, lookDY, visible, fov }
  update(dt, s) {
    this.root.visible = s.visible;
    if (!s.visible) return;
    if (this.camera.fov !== s.fov) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    this.punchT = Math.max(0, this.punchT - dt);
    this.throwT = Math.max(0, this.throwT - dt);

    // Weapon-style sway: lag behind mouse movement + walk bob.
    this.sway.x += (-s.lookDX * 0.0004 - this.sway.x) * damp(10, dt);
    this.sway.y += (s.lookDY * 0.0004 - this.sway.y) * damp(10, dt);
    this.sway.clampScalar(-0.05, 0.05);
    this.root.position.set(
      this.sway.x + Math.cos(s.bob) * 0.012 * s.bobAmt,
      this.sway.y - Math.abs(Math.sin(s.bob)) * 0.02 * s.bobAmt,
      0);

    for (const a of this.arms) {
      const t = this.tmp;
      const holding = s.holding;
      if (holding) {
        // both hands out front, as if carrying a box (wider and lower when it's heavy)
        t.set(a.side * (s.heavy ? 0.22 : 0.16), s.heavy ? -0.26 : -0.2, -0.5);
        t.y += Math.sin(performance.now() * 0.004) * 0.004;
      } else {
        t.copy(a.restTarget);
        t.y += Math.sin(performance.now() * 0.0015 + a.side) * 0.006;
      }
      if (holding && s.charge > 0) {
        // winding up a throw: the throwing arm pulls back, and trembles once it's at full power
        const c = s.charge;
        if (a.side === 1) t.set(0.16 + c * 0.07, -0.2 + c * 0.09, -0.5 + c * 0.16);
        else t.set(-0.16 + c * 0.06, -0.2 + c * 0.03, -0.5 + c * 0.08);
        if (c >= 1) { const j = 0.018; t.x += (Math.random() - 0.5) * j; t.y += (Math.random() - 0.5) * j; t.z += (Math.random() - 0.5) * j; }
      }
      if (a.side === 1 && this.punchT > 0) t.set(0.06, -0.12, -0.85);
      if (this.throwT > 0) t.set(a.side * 0.12, -0.05, -0.9);
      t.sub(this.root.position);

      // Rubbery spring toward the target.
      a.vel.addScaledVector(t.sub(a.cur), 260 * dt).multiplyScalar(Math.max(0, 1 - 20 * dt));
      a.cur.addScaledVector(a.vel, dt);

      const dir = this.tmp.copy(a.cur).sub(a.pivot.position);
      const len = clamp(dir.length(), 0.25, MAX_LEN);
      a.pivot.quaternion.setFromUnitVectors(FWD, dir.normalize());
      a.sleeve.scale.z = len - HAND_LEN;
      a.hand.position.z = -(len - HAND_LEN);
      const curl = holding ? 1.3 : this.punchT > 0 ? 1.5 : 0.25;
      a.curl += (curl - a.curl) * damp(14, dt);
      a.fingers.rotation.x = -a.curl;
    }
  }
}
