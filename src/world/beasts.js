import * as THREE from 'three';
import { prep, merge } from '../util/build.js';

// Low-poly animals built from primitives (no model files): one vertex-coloured geometry each,
// facing +Z with feet at y = 0. animals.js rescales them to the species' real length and animates
// them in the vertex shader like the loaded models.

const S = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const C = (rt, rb, h, n = 7) => new THREE.CylinderGeometry(rt, rb, h, n);

export function penguinGeo() {
  const BLACK = 0x22252b, WHITE = 0xf4f4f0, ORANGE = 0xf29a2e;
  return merge([
    prep(S(0.3, 8, 6), BLACK, { pos: [0, 0.5, -0.02], scale: [1, 1.55, 0.95], jitter: 0.02 }), // body
    prep(S(0.26, 8, 6), WHITE, { pos: [0, 0.47, 0.07], scale: [0.9, 1.45, 0.8] }), // belly
    prep(S(0.19, 8, 6), BLACK, { pos: [0, 1.0, 0.03] }), // head
    prep(S(0.06, 5, 4), WHITE, { pos: [-0.08, 1.04, 0.15] }), prep(S(0.06, 5, 4), WHITE, { pos: [0.08, 1.04, 0.15] }),
    prep(S(0.025, 4, 3), BLACK, { pos: [-0.08, 1.05, 0.2] }), prep(S(0.025, 4, 3), BLACK, { pos: [0.08, 1.05, 0.2] }),
    prep(new THREE.ConeGeometry(0.06, 0.2, 5), ORANGE, { pos: [0, 0.97, 0.27], rot: [Math.PI / 2, 0, 0] }), // beak
    prep(new THREE.BoxGeometry(0.06, 0.42, 0.16), BLACK, { pos: [-0.31, 0.6, 0], rot: [0, 0, 0.25] }), // flippers
    prep(new THREE.BoxGeometry(0.06, 0.42, 0.16), BLACK, { pos: [0.31, 0.6, 0], rot: [0, 0, -0.25] }),
    prep(new THREE.BoxGeometry(0.12, 0.04, 0.2), ORANGE, { pos: [-0.1, 0.02, 0.08] }), // feet
    prep(new THREE.BoxGeometry(0.12, 0.04, 0.2), ORANGE, { pos: [0.1, 0.02, 0.08] }),
    prep(C(0.04, 0.05, 0.12, 5), ORANGE, { pos: [-0.1, 0.08, 0.02] }), prep(C(0.04, 0.05, 0.12, 5), ORANGE, { pos: [0.1, 0.08, 0.02] }),
    prep(new THREE.ConeGeometry(0.1, 0.18, 4), BLACK, { pos: [0, 0.14, -0.28], rot: [-2.2, 0, 0] }), // tail
  ]);
}

export function elephantGeo() {
  const GREY = 0x8f8a86, DARK = 0x77726e, PINK = 0xc99a94, IVORY = 0xf3ead6;
  const parts = [
    prep(S(1, 9, 7), GREY, { pos: [0, 2.0, 0], scale: [0.95, 0.9, 1.45], jitter: 0.06 }), // body
    prep(S(0.62, 8, 6), GREY, { pos: [0, 2.35, 1.55], jitter: 0.04 }), // head
    prep(S(0.18, 5, 4), DARK, { pos: [0, 2.85, 1.45] }),
  ];
  for (const [x, z] of [[-0.5, 0.85], [0.5, 0.85], [-0.5, -0.85], [0.5, -0.85]]) {
    parts.push(prep(C(0.3, 0.28, 1.5, 8), GREY, { pos: [x, 0.75, z] }));
    parts.push(prep(C(0.31, 0.31, 0.1, 8), IVORY, { pos: [x, 0.05, z] })); // toenails, sort of
  }
  // trunk: tapering segments curling down
  let p = new THREE.Vector3(0, 2.15, 2.05), a = 0.35;
  for (let i = 0; i < 6; i++) {
    const r = 0.2 - i * 0.025, len = 0.32;
    const dir = new THREE.Vector3(0, -Math.cos(a), Math.sin(a));
    const mid = p.clone().addScaledVector(dir, len / 2);
    parts.push(prep(C(r - 0.02, r, len + 0.04, 6), GREY, { pos: mid.toArray(), rot: [a, 0, 0] }));
    p.addScaledVector(dir, len);
    a -= 0.05;
  }
  for (const s of [-1, 1]) {
    parts.push(prep(S(0.6, 7, 5), GREY, { pos: [s * 0.62, 2.45, 1.3], scale: [0.18, 1, 0.85], rot: [0, s * 0.35, 0] })); // ears
    parts.push(prep(S(0.5, 7, 5), PINK, { pos: [s * 0.66, 2.42, 1.36], scale: [0.1, 0.85, 0.7], rot: [0, s * 0.35, 0] }));
    parts.push(prep(new THREE.ConeGeometry(0.07, 0.55, 5), IVORY, { pos: [s * 0.25, 1.8, 2.05], rot: [1.9, 0, s * 0.2] })); // tusks
    parts.push(prep(S(0.07, 5, 4), 0x222222, { pos: [s * 0.32, 2.5, 1.98] })); // eyes
  }
  parts.push(prep(C(0.04, 0.06, 0.8, 5), DARK, { pos: [0, 1.85, -1.5], rot: [0.35, 0, 0] })); // tail
  parts.push(prep(new THREE.ConeGeometry(0.09, 0.2, 5), 0x333333, { pos: [0, 1.45, -1.63], rot: [Math.PI + 0.35, 0, 0] }));
  return merge(parts);
}

export function gorillaGeo() {
  const FUR = 0x3b3b3e, DARK = 0x2a2a2c, SKIN = 0x5b4e48, CHEST = 0x4b4545, SILVER = 0x8b8b8f;
  const parts = [
    prep(S(0.55, 8, 6), FUR, { pos: [0, 1.0, 0.1], scale: [1.05, 0.85, 1.25], jitter: 0.05 }), // torso
    prep(S(0.45, 8, 6), SILVER, { pos: [0, 1.05, -0.35], scale: [0.95, 0.7, 0.9] }), // silverback
    prep(S(0.42, 8, 6), FUR, { pos: [0, 1.2, 0.45], scale: [1.35, 0.8, 0.8] }), // shoulders
    prep(S(0.35, 7, 5), CHEST, { pos: [0, 0.95, 0.55], scale: [1, 1, 0.5] }),
    prep(S(0.26, 8, 6), FUR, { pos: [0, 1.32, 0.88], scale: [1, 1.1, 1] }), // head
    prep(S(0.2, 7, 5), DARK, { pos: [0, 1.55, 0.82], scale: [1, 0.8, 1] }), // crest
    prep(S(0.16, 7, 5), SKIN, { pos: [0, 1.27, 1.04], scale: [1.15, 0.9, 0.7] }), // face
    prep(new THREE.BoxGeometry(0.34, 0.06, 0.1), DARK, { pos: [0, 1.4, 1.06] }), // brow
    prep(S(0.03, 4, 3), 0x111111, { pos: [-0.07, 1.34, 1.13] }), prep(S(0.03, 4, 3), 0x111111, { pos: [0.07, 1.34, 1.13] }),
  ];
  for (const s of [-1, 1]) {
    // long arms reaching to the knuckles
    parts.push(prep(C(0.13, 0.11, 0.62, 7), FUR, { pos: [s * 0.55, 0.9, 0.55], rot: [0.15, 0, s * 0.12] }));
    parts.push(prep(C(0.11, 0.1, 0.55, 7), FUR, { pos: [s * 0.6, 0.36, 0.62] }));
    parts.push(prep(S(0.12, 6, 4), DARK, { pos: [s * 0.6, 0.07, 0.66], scale: [1, 0.6, 1.2] }));
    // short legs
    parts.push(prep(C(0.15, 0.12, 0.55, 7), FUR, { pos: [s * 0.32, 0.3, -0.42] }));
    parts.push(prep(new THREE.BoxGeometry(0.2, 0.08, 0.3), DARK, { pos: [s * 0.32, 0.04, -0.36] }));
  }
  return merge(parts);
}
