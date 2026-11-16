import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { staticBody } from '../util/build.js';
import { sfx } from '../audio.js';
import { heightAt } from './terrain.js';

const BREAK_SPEED = 6.5; // how hard something has to hit a pane to smash it (m/s)
const REPAIR_AFTER = 90; // seconds before the maintenance crew fixes a broken pane (for a fee)
const REPAIR_COST = 40;

export const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe9ee, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const shardMat = new THREE.MeshStandardMaterial({ color: 0xe6f6fa, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
const shardGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.09, 0, -0.06, -0.05, 0, 0.07, -0.04, 0], 3));
  g.computeVertexNormals();
  return g;
})();

// Glass panes you can smash by throwing things at them. Each pane is its own mesh + thin collider;
// a hard enough hit from a thrown item shatters it into shards, and it's repaired a while later.
export class Glass {
  constructor(game) {
    this.game = game;
    this.panes = [];
    this.pending = [];
    this.shards = [];
  }

  // A pane w wide, h tall, centred at (x, y, z), facing along its local X axis after rotating by yaw.
  add(x, y, z, w, h, yaw, { thick = 0.05, colliderThick = 0.12 } = {}) {
    const game = this.game;
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, h, w), glassMat);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.renderOrder = 2;
    game.scene.add(m);
    const body = staticBody(game, new CANNON.Box(new CANNON.Vec3(colliderThick, h / 2, w / 2)), x, y, z, yaw);
    const pane = { m, body, w, h, yaw, broken: false, timer: 0 };
    body.addEventListener('collide', (e) => {
      const o = e.body;
      if (pane.broken || o.mass < 0.2 || o === game.player.body) return;
      if (Math.abs(e.contact.getImpactVelocityAlongNormal()) > BREAK_SPEED) this.pending.push({ pane, v: o.velocity.clone() });
    });
    this.panes.push(pane);
    return pane;
  }

  // Bodies can't be removed in the middle of a physics step, so breaks are applied afterwards.
  smash(pane, v = new CANNON.Vec3()) {
    if (pane.broken) return;
    pane.broken = true;
    pane.timer = REPAIR_AFTER;
    pane.m.visible = false;
    this.game.world.removeBody(pane.body);
    const p = pane.m.position;
    sfx.glass(this.loud(p));
    const n = Math.min(40, Math.round(pane.w * pane.h * 4) + 12);
    const along = new THREE.Vector3(Math.sin(pane.yaw), 0, Math.cos(pane.yaw));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(shardGeo, shardMat);
      s.position.copy(p).addScaledVector(along, (Math.random() - 0.5) * pane.w).add(new THREE.Vector3(0, (Math.random() - 0.5) * pane.h, 0));
      s.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.scale.setScalar(0.6 + Math.random() * 1.6);
      this.game.scene.add(s);
      this.shards.push({
        s, life: 2.5 + Math.random(),
        v: new THREE.Vector3(v.x * 0.3 + (Math.random() - 0.5) * 3, Math.random() * 2.5, v.z * 0.3 + (Math.random() - 0.5) * 3),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
    this.game.animals?.shout('CRASH!', p.x, p.y + pane.h / 2 + 0.3, p.z, '#bfeaff');
  }

  repair(pane) {
    pane.broken = false;
    pane.m.visible = true;
    this.game.world.addBody(pane.body);
  }

  repairAll() {
    let n = 0;
    for (const p of this.panes) if (p.broken) { this.repair(p); n++; }
    return n;
  }

  loud(p) { return Math.max(0.15, 1 - this.game.camera.position.distanceTo(p) / 50); }

  update(dt) {
    for (const { pane, v } of this.pending) this.smash(pane, v);
    this.pending.length = 0;
    for (const p of this.panes) {
      if (!p.broken) continue;
      p.timer -= dt;
      if (p.timer <= 0) {
        this.repair(p);
        this.game.state.spend(REPAIR_COST, 'Glass repair', 'repairs', { bill: true });
      }
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      sh.life -= dt;
      sh.v.y -= 9.8 * dt;
      sh.s.position.addScaledVector(sh.v, dt);
      if (sh.s.position.y < this.groundY(sh.s.position)) { sh.s.position.y = this.groundY(sh.s.position); sh.v.multiplyScalar(0.3); sh.v.y = Math.abs(sh.v.y) * 0.2; }
      else sh.s.rotation.x += sh.spin.x * dt, sh.s.rotation.y += sh.spin.y * dt;
      if (sh.life <= 0) { this.game.scene.remove(sh.s); this.shards.splice(i, 1); }
    }
  }

  groundY(p) { return heightAt(p.x, p.z) + 0.02; }
}
