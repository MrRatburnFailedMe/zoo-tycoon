import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, MASK } from '../physics.js';
import { createCharacter } from './character.js';
import { Ragdoll } from './ragdoll.js';
import { labelSprite } from '../util/textures.js';
import { heightAt } from '../world/terrain.js';
import { sfx } from '../audio.js';
import { angleDiff } from '../util/math.js';
import { Health, healthSprite } from '../health.js';

const ray = new CANNON.RaycastResult();

// Placeholder for the other three players. Stands around, gets knocked into a ragdoll
// by fast objects or a sprinting player, then pops back up. Swap the AI for network input later.
export class Friend {
  constructor(game, { look, x, z, y = null, yaw = 0 }) {
    this.game = game;
    this.look = look;
    this.label = look.name;
    this.grabBoost = 3;
    this.home = { x, z, y, yaw };
    this.char = createCharacter(look);
    this.root = this.char.root;
    this.root.traverse((o) => { if (o.isMesh) o.userData.entity = this; });
    this.tag = labelSprite(look.name);
    this.tag.position.set(0, 2.1, 0);
    this.root.add(this.tag);
    this.health = new Health(100);
    this.hpBar = healthSprite(this.health);
    this.hpBar.position.set(0, 1.97, 0);
    this.root.add(this.hpBar);
    game.scene.add(this.root);
    game.pickables.push(this.root);

    this.body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.KINEMATIC, collisionFilterMask: MASK.KINEMATIC });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.28, 0.86, 0.2)), new CANNON.Vec3(0, 0.86, 0));
    this.body.addEventListener('collide', (e) => {
      if (this.state !== 'stand' || this.pendingHit) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const isPlayer = e.body === game.player?.body;
      if ((isPlayer && v > 5.5) || (!isPlayer && v > 4.5 && e.body.mass > 0.3)) this.pendingHit = e.body;
    });

    this.state = 'stand';
    this.ragdoll = null;
    this.downTime = 0;
    this.popT = 0;
    this.yaw = yaw;
    this.waveCd = 3 + Math.random() * 5;
    this.standAt(x, y ?? heightAt(x, z), z, yaw);
  }

  standAt(x, y, z, yaw) {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = true;
    this.tag.visible = true;
    this.hpBar.visible = true;
    this.root.scale.set(1, 1, 1);
    this.char.resetPose();
    this.char.state.paused = false;
    this.yaw = yaw;
    this.body.position.set(x, y, z);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    this.game.world.addBody(this.body);
    this.state = 'stand';
  }

  // Grabber API
  getGrabBody(object, point) {
    if (this.state === 'stand') this.ragdollify(new CANNON.Vec3(0, 1, 0));
    return point ? this.ragdoll.nearest(point) : this.ragdoll.torso;
  }

  onThrow(dir, speed) { this.ragdoll?.push(dir, speed * 0.8); }

  ragdollify(velocity) {
    if (this.state !== 'stand') return;
    this.state = 'ragdoll';
    this.downTime = 0;
    this.root.updateMatrixWorld(true);
    this.root.scale.set(1, 1, 1);
    this.root.updateMatrixWorld(true);
    this.char.state.paused = true;
    this.tag.visible = false;
    this.hpBar.visible = false;
    this.ragdoll = new Ragdoll(this.game, this.char);
    this.ragdoll.onImpact = (v) => this.health.damage(Math.round((v - 5) * 3));
    this.ragdoll.spawn(this.root.matrixWorld, this.root.quaternion, velocity);
    this.game.world.removeBody(this.body);
    sfx.oof();
  }

  standUp() {
    const t = this.ragdoll.torso.position;
    // Get up right where the torso lies (searching from just above it, so we never pop onto a roof).
    let x = t.x, z = t.z, yTop = t.y + 0.6;
    if (t.y < -30 || Math.hypot(x, z) > 135) { x = this.home.x; z = this.home.z; yTop = heightAt(x, z) + 2; }
    if (this.health.hp <= 0) this.health.reset();
    if (this.game.grabber.entity === this) this.game.grabber.release();
    this.ragdoll.despawn();
    this.ragdoll = null;
    ray.reset();
    this.game.world.raycastClosest(new CANNON.Vec3(x, yTop, z), new CANNON.Vec3(x, yTop - 80, z),
      { collisionFilterMask: G.STATIC, skipBackfaces: true }, ray);
    const y = ray.hasHit ? ray.hitPointWorld.y : heightAt(x, z);
    this.standAt(x, y, z, Math.random() * Math.PI * 2);
    this.popT = 0.5;
    sfx.pop();
  }

  // before physics step
  preStep() {
    if (this.ragdoll) this.ragdoll.clampSpeed();
    if (this.pendingHit && this.state === 'stand') {
      const v = this.pendingHit.velocity;
      this.ragdollify(new CANNON.Vec3(v.x * 0.6, v.y * 0.6 + 2.5, v.z * 0.6));
      this.health.damage(Math.round(v.length() * 2.5));
      this.game.hud.big('BONK!');
    }
    this.pendingHit = null;
  }

  update(dt, t) {
    if (this.state === 'ragdoll') {
      this.ragdoll.sync();
      this.downTime += dt;
      const held = this.game.grabber.entity === this;
      const torso = this.ragdoll.torso;
      // fell through the ground or off the world: get straight back up
      const lost = torso.position.y < heightAt(torso.position.x, torso.position.z) - 2 || Math.hypot(torso.position.x, torso.position.z) > 135;
      const downFor = this.health.hp <= 0 ? 8 : 5; // knocked out stays down longer
      if (lost || torso.position.y < -30 || (this.downTime > downFor && !held && !this.seatedIn && torso.velocity.length() < 1.2)) this.standUp();
      return;
    }

    // Idle: turn toward a nearby player, wave now and then.
    const p = this.game.player.body.position;
    const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z;
    const dist = Math.hypot(dx, dz);
    const s = this.char.state;
    if (dist < 9) {
      const want = Math.atan2(dx, dz);
      const rel = angleDiff(want, this.yaw);
      if (Math.abs(rel) > 0.9) this.yaw += rel * Math.min(1, dt * 2);
      s.lookYaw = Math.max(-0.9, Math.min(0.9, angleDiff(want, this.yaw)));
      this.waveCd -= dt;
      if (this.waveCd < 0) { s.wave = 1.6; this.waveCd = 8 + Math.random() * 8; }
    } else {
      s.lookYaw = Math.sin(t * 0.4 + this.home.x) * 0.5;
    }
    s.wave = Math.max(0, s.wave - dt);
    this.root.rotation.y = this.yaw;
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);
    this.char.animate(dt, t);

    // Get-up squash & stretch.
    if (this.popT > 0) {
      this.popT -= dt;
      const k = Math.max(0, this.popT / 0.5);
      const sy = 1 + Math.sin(k * Math.PI * 3) * 0.25 * k;
      this.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    } else this.root.scale.set(1, 1, 1);
  }
}
