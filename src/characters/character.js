import * as THREE from 'three';
import { loadGLB } from '../util/glb.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Four zookeeper looks, one per player slot. Each recolors the shared player model.
export const LOOKS = [
  { name: 'You', shirt: 0x5d8a3a, pants: 0xb8a070, skin: 0xe8b48c, hair: 0x3a2618, socks: 0x4a3426 },
  { name: 'Friend 2', shirt: 0xd9762f, pants: 0x4f6178, skin: 0xc68c5e, hair: 0x1d1a18, socks: 0x2e2a28 },
  { name: 'Friend 3', shirt: 0x3f78c2, pants: 0xb8a070, skin: 0x8d5a3b, hair: 0x111111, socks: 0x3a2b20 },
  { name: 'Friend 4', shirt: 0x8e55a8, pants: 0x3d3d3d, skin: 0xf0cdb0, hair: 0xb5651d, socks: 0x5a3b28 },
];

// Physics rig for the ragdoll. Feet at y=0, facing +Z, +X is the character's left.
// pivot = joint the part rotates around; center/half/radius = physics shape; bones = model bones it drives.
export const RIG = {
  torso: { pivot: [0, 0.78, 0.04], center: [0, 1.08, 0.04], half: [0.21, 0.32, 0.14], mass: 22, bones: ['Hips', 'Abdomen', 'Torso'] },
  head: { pivot: [0, 1.5, 0.02], center: [0, 1.66, 0.03], radius: 0.18, mass: 5, bones: ['Neck', 'Head'] },
  upperArmL: { pivot: [0.18, 1.42, 0.04], center: [0.2, 1.29, 0.03], half: [0.055, 0.14, 0.055], mass: 2, bones: ['UpperArmL'] },
  upperArmR: { pivot: [-0.18, 1.42, 0.04], center: [-0.2, 1.3, 0.04], half: [0.055, 0.14, 0.055], mass: 2, bones: ['UpperArmR'] },
  lowerArmL: { pivot: [0.22, 1.16, 0.01], center: [0.23, 0.97, 0.02], half: [0.05, 0.19, 0.05], mass: 1.6, bones: ['LowerArmL'] },
  lowerArmR: { pivot: [-0.22, 1.17, 0.03], center: [-0.23, 0.98, 0.04], half: [0.05, 0.19, 0.05], mass: 1.6, bones: ['LowerArmR'] },
  upperLegL: { pivot: [0.11, 0.8, 0.04], center: [0.12, 0.64, 0.06], half: [0.08, 0.17, 0.09], mass: 6, bones: ['UpperLegL'] },
  upperLegR: { pivot: [-0.12, 0.8, 0.04], center: [-0.13, 0.64, 0.06], half: [0.08, 0.17, 0.09], mass: 6, bones: ['UpperLegR'] },
  lowerLegL: { pivot: [0.13, 0.49, 0.08], center: [0.14, 0.26, 0.05], half: [0.07, 0.24, 0.08], mass: 4, bones: ['LowerLegL'] },
  lowerLegR: { pivot: [-0.14, 0.49, 0.09], center: [-0.15, 0.26, 0.06], half: [0.07, 0.24, 0.08], mass: 4, bones: ['LowerLegR'] },
};

const HEIGHT = 1.8;
const CLIP = (name) => `HumanArmature|Man_${name}`;
let model = null;

// Load the player model once before building any characters.
export async function loadCharacterModel(url = 'assets/quaternius-man.glb') {
  const gltf = await loadGLB(url);
  gltf.scene.updateMatrixWorld(true);
  const top = gltf.scene.getObjectByName('Head_end').getWorldPosition(new THREE.Vector3()).y;
  model = { scene: gltf.scene, clips: gltf.animations, scale: HEIGHT / top };
}

const MATERIAL_COLOR = { Shirt: 'shirt', Pants: 'pants', Skin: 'skin', Hair: 'hair', Socks: 'socks' };

// Animated character (friends now, remote players later). Same interface the ragdoll and Friend use.
export function createCharacter(look) {
  const root = new THREE.Group();
  const body = SkeletonUtils.clone(model.scene);
  body.scale.setScalar(model.scale);
  root.add(body);

  const meshes = [];
  body.traverse((o) => {
    if (!o.isMesh) return;
    const key = MATERIAL_COLOR[o.material.name];
    o.material = new THREE.MeshStandardMaterial({ color: key ? look[key] : o.material.color, flatShading: true, roughness: 0.85 });
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // skinned bounds don't follow the ragdoll
    meshes.push(o);
  });
  const bones = {};
  body.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // Bind pose, restored after a ragdoll so no bone is left twisted from the fall.
  const rest = Object.values(bones).map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const resetPose = () => {
    for (const [b, p, q, s] of rest) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s); }
    body.updateMatrixWorld(true);
  };

  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const name of ['Idle', 'Walk', 'Run', 'Clapping', 'Jump']) {
    const clip = model.clips.find((c) => c.name === CLIP(name));
    actions[name] = mixer.clipAction(clip);
  }
  for (const name of ['Idle', 'Walk', 'Run']) { actions[name].play(); actions[name].setEffectiveWeight(0); }
  actions.Idle.setEffectiveWeight(1);
  actions.Idle.time = Math.random() * 4;
  actions.Clapping.setLoop(THREE.LoopRepeat, 2);
  actions.Clapping.clampWhenFinished = false;

  const state = { speed: 0, wave: 0, lookYaw: 0, lookPitch: 0, paused: false };
  let clapping = false;
  const look_ = new THREE.Quaternion(), e = new THREE.Euler();
  const headRest = bones.Head.quaternion.clone();

  function animate(dt) {
    if (state.paused) return;
    // blend idle → walk → run by speed
    const s = state.speed;
    const walk = THREE.MathUtils.clamp(s / 2, 0, 1) * (1 - THREE.MathUtils.clamp((s - 3) / 2, 0, 1));
    const run = THREE.MathUtils.clamp((s - 3) / 2, 0, 1);
    actions.Idle.setEffectiveWeight(1 - Math.max(walk, run));
    actions.Walk.setEffectiveWeight(walk);
    actions.Run.setEffectiveWeight(run);
    // "wave" plays the clap animation over the top
    if (state.wave > 0 && !clapping) { clapping = true; actions.Clapping.reset().fadeIn(0.2).play(); }
    if (state.wave <= 0 && clapping) { clapping = false; actions.Clapping.fadeOut(0.3); }
    // Idle has no head track, so start from the rest pose each frame; otherwise the look turn
    // below piles up frame after frame and the head spins round and round.
    bones.Head.quaternion.copy(headRest);
    mixer.update(dt);
    // turn the head toward whoever we're looking at, on top of the animation
    look_.setFromEuler(e.set(state.lookPitch, state.lookYaw, 0));
    bones.Head.quaternion.multiply(look_);
  }

  return { root, body, bones, meshes, state, animate, mixer, resetPose };
}
