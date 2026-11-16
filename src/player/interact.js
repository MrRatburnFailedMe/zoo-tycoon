import * as THREE from 'three';

const REACH = 3.6;

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
    if (!g.grabber.held) {
      for (const h of this.ray.intersectObjects(g.pickables, true)) {
        if (h.object.isSprite || !isVisible(h.object)) continue;
        const entity = findEntity(h.object);
        if (!entity) continue;
        if (!entity.blocker) this.hit = { entity, object: h.object, point: h.point, distance: h.distance };
        break;
      }
    }

    let text = '';
    if (g.grabber.held) {
      const e = g.grabber.entity;
      text = `Let go of <kbd>LMB</kbd> to drop &nbsp; <kbd>RMB</kbd> Throw${e.use ? ` &nbsp; <kbd>F</kbd> ${e.useLabel}` : ''}`;
      g.hud.crosshair('holding');
    } else if (this.hit) {
      const e = this.hit.entity;
      const parts = [];
      if (e.interact) parts.push(`<kbd>E</kbd> ${e.interactLabel}`);
      if (e.getGrabBody) parts.push(`Hold <kbd>LMB</kbd> to grab ${e.label}`);
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
