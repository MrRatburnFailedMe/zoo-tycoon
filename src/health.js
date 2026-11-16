import * as THREE from 'three';
import { sfx } from './audio.js';

const REGEN_DELAY = 4; // seconds after a hit before healing starts
const REGEN_RATE = 6; // hp per second

// Hit points for one player. Heals back up a few seconds after the last hit.
export class Health {
  constructor(max = 100) {
    this.max = max;
    this.hp = max;
    this.since = 99;
    this.listeners = [];
  }

  get frac() { return this.hp / this.max; }

  damage(n) {
    if (n <= 0 || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.since = 0;
    this.emit();
  }

  reset() { this.hp = this.max; this.since = 99; this.emit(); }

  update(dt) {
    this.since += dt;
    if (this.hp > 0 && this.hp < this.max && this.since > REGEN_DELAY) {
      this.hp = Math.min(this.max, this.hp + REGEN_RATE * dt);
      this.emit();
    }
  }

  on(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
}

// Bar colour from green (full) through yellow to red (empty).
export function hpColor(f) {
  return `hsl(${Math.round(f * 110)}, 75%, 50%)`;
}

// Health bar floating over a friend's head.
export function healthSprite(health) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 20;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, 128, 20);
    g.fillStyle = 'rgba(20,24,22,.75)';
    g.beginPath(); g.roundRect(0, 0, 128, 20, 10); g.fill();
    g.fillStyle = hpColor(health.frac);
    g.beginPath(); g.roundRect(3, 3, Math.max(0, 122 * health.frac), 14, 7); g.fill();
    tex.needsUpdate = true;
  };
  draw();
  let last = -1;
  health.on((h) => { const q = Math.round(h.hp); if (q !== last) { last = q; draw(); } });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.11, 1);
  s.renderOrder = 10;
  return s;
}

// The local player's bar (bottom-left of the screen) plus knockout handling.
export class PlayerHealth {
  constructor(game) {
    this.game = game;
    this.player = new Health(100);
    this.bar = document.getElementById('hpfill');
    this.flash = document.getElementById('hurt');
    this.ko = 0;
    this.player.on((h) => {
      this.bar.style.width = `${h.frac * 100}%`;
      this.bar.style.background = hpColor(h.frac);
    });
    this.player.emit();
  }

  damagePlayer(n) {
    const { game } = this;
    if (game.mods.god || this.ko > 0) return;
    this.player.damage(n);
    sfx.hurt();
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
    if (this.player.hp <= 0) this.knockout();
  }

  // Out of health: black out, wake up at the gate.
  knockout() {
    this.ko = 2.2;
    document.getElementById('ko').classList.add('on');
    this.game.grabber.release();
  }

  update(dt) {
    this.player.update(dt);
    for (const f of this.game.friends) f.health.update(dt);
    if (this.ko > 0) {
      this.ko -= dt;
      if (this.ko <= 0) {
        this.game.player.respawn();
        this.player.reset();
        document.getElementById('ko').classList.remove('on');
      }
    }
  }
}
