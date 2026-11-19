import * as THREE from 'three';
import { DUMPSTER } from './layout.js';
import { heightAt } from './terrain.js';
import { sfx } from '../audio.js';

// Picking up litter. Hold a trash bag and click litter on the ground to stuff it in; the bag gets
// fatter with every piece until it's full at 10. Take a full bag to the dumpster and click it (or
// chuck the bag in) and the recycling pays out $1 to $10. Click the dumpster empty-handed for a new bag.

export const BAG_MAX = 10;
export const LITTER = ['can', 'chips', 'cup', 'banana', 'cardboard', 'paper'];

export class Trash {
  constructor(game) {
    this.game = game;
    const y = heightAt(DUMPSTER.x, DUMPSTER.z);
    this.at = new THREE.Vector3(DUMPSTER.x, y + 1.6, DUMPSTER.z);
    // an invisible click target over the dumpster
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.7), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(DUMPSTER.x, y + 0.85, DUMPSTER.z);
    const self = this;
    const entity = {
      label: 'Dumpster',
      get interactLabel() {
        const e = game.grabber.entity;
        if (e?.type === 'trashbag') return (e.count || 0) >= BAG_MAX ? 'Toss the bag' : `Bag isn't full (${e.count || 0}/${BAG_MAX})`;
        return e ? 'Toss it' : 'Take a new trash bag';
      },
      interact() { self.dumpsterClick(); },
    };
    hit.userData.entity = entity;
    game.scene.add(hit);
    game.pickables.push(hit);
  }

  // Stuff a piece of litter into the bag you're holding.
  bag(bagItem, litter) {
    const g = this.game, n = bagItem.count || 0;
    const p = litter.body.position;
    if (n >= BAG_MAX) { g.animals.shout('Bag is full!', p.x, p.y + 0.6, p.z, '#ffb0a0'); sfx.error?.(); return; }
    const at = [p.x, p.y, p.z];
    g.items.remove(litter);
    bagItem.count = n + 1;
    this.fatten(bagItem);
    sfx.rustle();
    if (bagItem.count >= BAG_MAX) {
      g.animals.shout('FULL!', at[0], at[1] + 0.6, at[2], '#3ddc5a');
      sfx.beep?.();
    } else g.animals.shout(`${bagItem.count}/${BAG_MAX}`, at[0], at[1] + 0.5, at[2], '#ffffff');
    if (litter.type === 'poop') g.state.setPoop(g.items.count('poop'));
  }

  // The bag grows as it fills.
  fatten(bagItem) {
    const k = 0.55 + (bagItem.count || 0) / BAG_MAX * 0.6;
    bagItem.group.children[0]?.scale.setScalar(k);
    bagItem.label = (bagItem.count || 0) >= BAG_MAX ? 'Trash Bag (FULL)' : `Trash Bag ${bagItem.count || 0}/${BAG_MAX}`;
  }

  dumpsterClick() {
    const g = this.game, e = g.grabber.entity;
    if (e?.type === 'trashbag') {
      if ((e.count || 0) < BAG_MAX) { g.animals.shout(`Fill it up first! ${e.count || 0}/${BAG_MAX}`, this.at.x, this.at.y, this.at.z, '#ffd34d'); return; }
      this.payout(e);
      return;
    }
    if (e) { // anything else: chuck it in
      g.grabber.release();
      e.body.position.set(this.at.x, this.at.y, this.at.z);
      e.body.velocity.set(0, -1, 0);
      return;
    }
    // a fresh empty bag
    const x = DUMPSTER.x + 1.6, z = DUMPSTER.z + 1.3;
    const bag = g.items.spawn('trashbag', x, heightAt(x, z) + 0.5, z);
    bag.count = 0;
    this.fatten(bag);
    sfx.rustle();
  }

  payout(bagItem) {
    const g = this.game;
    const cash = 1 + Math.floor(Math.random() * 10);
    g.items.remove(bagItem);
    g.state.deposit(cash);
    sfx.dumpster();
    setTimeout(() => sfx.cash?.(), 250);
    g.animals.shout(`+$${cash}`, this.at.x, this.at.y + 0.3, this.at.z, '#3ddc5a');
  }

  // A full bag thrown into the dumpster pays out too.
  update() {
    const g = this.game, bin = g.zoo.bins[0];
    for (const it of [...g.items.list]) {
      if (it.type !== 'trashbag' || g.grabber.entity === it || (it.count || 0) < BAG_MAX) continue;
      if (bin.contains(it.body.position)) this.payout(it);
    }
  }

  // Mod menu: scatter litter around you.
  spawnLitter(n = 12) {
    const g = this.game, p = g.player.body.position;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 6;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      g.items.spawn(LITTER[Math.floor(Math.random() * LITTER.length)], x, Math.max(heightAt(x, z), p.y - 0.8) + 0.4, z, { yaw: Math.random() * 6 });
    }
  }
}
