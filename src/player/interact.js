import * as THREE from 'three';
import { GRAB_REACH } from './grab.js';

const REACH = 3.0;

function findEntity(o) {
  for (let n = o; n; n = n.parent) if (n.userData.entity) return n.userData.entity;
  return null;
}
function isVisible(o) {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

// Crosshair raycast: figures out what you're looking at and shows the prompt.
export class Interactor {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.center = new THREE.Vector2(0, 0);
    this.hit = null;
  }

  update() {
    const g = this.game;
    this.ray.setFromCamera(this.center, g.camera);
    this.hit = null;
    for (const h of this.ray.intersectObjects(g.pickables, true)) {
      if (h.object.isSprite || !isVisible(h.object)) continue;
      const entity = findEntity(h.object);
      if (!entity) continue;
      if (entity === g.grabber.entity) continue; // looking past whatever you're carrying
      if (!entity.blocker) this.hit = { entity, object: h.object, point: h.point, distance: h.distance };
      break;
    }

    let text = '';
    if (g.grabber.held) {
      const e = g.grabber.entity;
      const t = this.hit?.entity;
      const click = t?.interact ? `<kbd>Click</kbd> ${t.interactLabel || 'Use'}` : e.type === 'trashbag' && t?.trash && t.type !== 'trashbag' ? `<kbd>Click</kbd> Bag the ${t.label.toLowerCase()}` : '<kbd>Click</kbd> Drop';
      text = `${click} &nbsp; Hold <kbd>Q</kbd> Throw &nbsp; Hold <kbd>R</kbd> Look${e.use ? ` &nbsp; <kbd>F</kbd> ${e.useLabel}` : ''}`;
      g.hud.crosshair('holding');
    } else if (this.hit) {
      const e = this.hit.entity;
      const parts = [];
      if (e.getGrabBody && this.hit.distance <= GRAB_REACH) parts.push(`<kbd>Click</kbd> Grab ${e.label}`);
      else if (e.interact) parts.push(`<kbd>Click</kbd> ${e.interactLabel}`);
      else if (e.getGrabBody) parts.push(`Get closer to grab ${e.label}`);
      text = parts.join(' &nbsp; ');
      g.hud.crosshair('active');
    } else g.hud.crosshair('');
    g.hud.prompt(text);

    if (g.input.justPressed('KeyE') && this.hit?.entity.interact) {
      g.hands.punch();
      this.hit.entity.interact();
    }
  }
}
