const $ = (id) => document.getElementById(id);

// The in-game screen is kept clean: just a crosshair. prompt/toast/big stay as no-ops
// so gameplay code can keep calling them (handy if we want subtle feedback back later).
export class HUD {
  constructor() {
    this.el = { cross: $('crosshair') };
  }

  prompt() {}
  toast() {}
  big() {}

  crosshair(state) {
    this.el.cross.className = state || '';
  }
}
