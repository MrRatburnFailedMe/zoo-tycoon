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
      if (Math.abs(e.contact.getImpactVelocityAlongNormal()) > BREAK_SPEED) this.pending.push({ pane, v: o.velocity.clone(), at: o.position.clone() });
    });
    this.panes.push(pane);
    return pane;
  }

  // Bodies can't be removed in the middle of a physics step, so breaks are applied afterwards.
  // Shatter from the impact point: jagged spokes and rings of cracks cut the pane into real
  // polygon shards. Inner shards fall out; some outer ones stay stuck in the frame until it's fixed.
  smash(pane, v = new CANNON.Vec3(), at = null) {
    if (pane.broken) return;
    pane.broken = true;
    pane.timer = REPAIR_AFTER;
    pane.m.visible = false;
    this.game.world.removeBody(pane.body);
    const p = pane.m.position, hw = pane.w / 2, hh = pane.h / 2;
    sfx.glass(this.loud(p));
    const along = new THREE.Vector3(Math.sin(pane.yaw), 0, Math.cos(pane.yaw)), up = new THREE.Vector3(0, 1, 0);
    // impact point in pane coordinates (u along the width, v up)
    let cu = (Math.random() - 0.5) * pane.w * 0.4, cv = (Math.random() - 0.5) * pane.h * 0.4;
    if (at) {
      const d = new THREE.Vector3(at.x - p.x, at.y - p.y, at.z - p.z);
      cu = THREE.MathUtils.clamp(d.dot(along), -hw * 0.8, hw * 0.8);
      cv = THREE.MathUtils.clamp(d.y, -hh * 0.8, hh * 0.8);
    }
    const J = (a) => (Math.random() - 0.5) * a;
    // spokes
    const K = 9 + Math.floor(Math.random() * 5);
    const angs = [];
    for (let i = 0; i < K; i++) angs.push(((i + 0.5 + J(0.7)) / K) * Math.PI * 2);
    // distance from the impact to the frame along each spoke
    const toEdge = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      const tx = dx > 0 ? (hw - cu) / dx : dx < 0 ? (-hw - cu) / dx : Infinity;
      const ty = dy > 0 ? (hh - cv) / dy : dy < 0 ? (-hh - cv) / dy : Infinity;
      return Math.min(tx, ty);
    };
    const size = Math.min(pane.w, pane.h);
    const rings = [size * (0.08 + Math.random() * 0.06), size * (0.25 + Math.random() * 0.12), size * (0.5 + Math.random() * 0.2)];
    const pt = (a, r) => [cu + Math.cos(a) * r, cv + Math.sin(a) * r];
    const grid = angs.map((a) => {
      const e = toEdge(a);
      const pts = rings.map((r) => pt(a + J(0.25), Math.min(r * (0.8 + Math.random() * 0.4), e * 0.92)));
      return [...pts, pt(a, e)];
    });
    const corners = [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
    const between = (a0, a1, c) => {
      let ca = Math.atan2(c[1] - cv, c[0] - cu);
      while (ca < a0) ca += Math.PI * 2;
      return ca < a1;
    };
    const polys = [];
    for (let i = 0; i < K; i++) {
      const A = grid[i], B = grid[(i + 1) % K];
      polys.push({ pts: [[cu + J(0.02), cv + J(0.02)], A[0], B[0]], outer: false });
      for (let j = 0; j < rings.length - 1; j++) {
        // split each band cell diagonally now and then for extra jaggedness
        if (Math.random() < 0.5) { polys.push({ pts: [A[j], A[j + 1], B[j + 1]], outer: false }); polys.push({ pts: [A[j], B[j + 1], B[j]], outer: false }); }
        else polys.push({ pts: [A[j], A[j + 1], B[j + 1], B[j]], outer: false });
      }
      const last = rings.length - 1;
      const a0 = angs[i], a1 = i + 1 < K ? angs[i + 1] : angs[0] + Math.PI * 2;
      const edge = [A[last], A[last + 1]];
      for (const c of corners) if (between(a0, a1, c)) edge.push(c);
      edge.push(B[last + 1], B[last]);
      polys.push({ pts: edge, outer: true });
    }
    pane.stuck = [];
    for (const { pts, outer } of polys) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const pos = [];
      for (let k = 1; k < pts.length - 1; k++) for (const q of [pts[0], pts[k], pts[k + 1]]) {
        const w = along.clone().multiplyScalar(q[0] - cx).addScaledVector(up, q[1] - cy);
        pos.push(w.x, w.y, w.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const s = new THREE.Mesh(geo, shardMat);
      s.position.copy(p).addScaledVector(along, cx).addScaledVector(up, cy);
      this.game.scene.add(s);
      if (outer && Math.random() < 0.55) { pane.stuck.push(s); continue; } // left jagged in the frame
      const out = Math.max(0.2, 1.2 - Math.hypot(cx - cu, cy - cv) / size); // pieces near the hit fly furthest
      this.shards.push({
        s, life: 2.5 + Math.random() * 1.5,
        v: new THREE.Vector3(v.x * 0.35 * out + J(2.5), Math.random() * 1.5, v.z * 0.35 * out + J(2.5)),
        spin: new THREE.Vector3(J(14), J(14), J(14)),
      });
    }
    this.game.animals?.shout('CRASH!', p.x, p.y + pane.h / 2 + 0.3, p.z, '#bfeaff');
  }

  repair(pane) {
    for (const s of pane.stuck || []) { this.game.scene.remove(s); s.geometry.dispose(); }
    pane.stuck = [];
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
    for (const { pane, v, at } of this.pending) this.smash(pane, v, at);
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
      else { sh.s.rotation.x += sh.spin.x * dt; sh.s.rotation.y += sh.spin.y * dt; sh.s.rotation.z += sh.spin.z * dt; }
      if (sh.life <= 0) { this.game.scene.remove(sh.s); sh.s.geometry.dispose(); this.shards.splice(i, 1); }
    }
  }

  groundY(p) { return heightAt(p.x, p.z) + 0.02; }
}
