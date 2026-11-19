import * as CANNON from 'cannon-es';

// Collision groups. A pair collides when (A.group & B.mask) && (B.group & A.mask).
export const G = { STATIC: 1, PLAYER: 2, ITEM: 4, RAGDOLL: 8, KINEMATIC: 16 };
export const MASK = {
  STATIC: -1,
  PLAYER: G.STATIC | G.ITEM | G.RAGDOLL | G.KINEMATIC,
  ITEM: -1,
  RAGDOLL: G.STATIC | G.PLAYER | G.ITEM | G.KINEMATIC, // ragdoll parts ignore each other
  KINEMATIC: G.PLAYER | G.ITEM | G.RAGDOLL,
};

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 9;
  world.allowSleep = true;

  const contact = { friction: 0.45, restitution: 0.12, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 };
  Object.assign(world.defaultContactMaterial, contact);

  const mats = {
    ground: new CANNON.Material('ground'),
    item: new CANNON.Material('item'),
    bouncy: new CANNON.Material('bouncy'),
    player: new CANNON.Material('player'),
  };
  const pair = (a, b, o) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { ...contact, ...o }));
  // The player is frictionless; movement is driven by velocity, so it never sticks to walls.
  pair(mats.player, mats.ground, { friction: 0, restitution: 0 });
  pair(mats.player, mats.item, { friction: 0, restitution: 0 });
  pair(mats.player, mats.bouncy, { friction: 0, restitution: 0.6 });
  pair(mats.item, mats.ground, { friction: 0.55, restitution: 0.08 });
  pair(mats.item, mats.item, { friction: 0.45, restitution: 0.1 });
  pair(mats.bouncy, mats.ground, { friction: 0.4, restitution: 0.82 });
  pair(mats.bouncy, mats.item, { friction: 0.3, restitution: 0.7 });
  pair(mats.bouncy, mats.bouncy, { friction: 0.3, restitution: 0.85 });

  return { world, mats };
}
