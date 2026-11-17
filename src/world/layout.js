// Zoo blueprint. Everything sits on a rolling hilltop centred on (0, 0); +Z is south (toward the gate).
// Move things here and the terrain, paths, fences and spawns all follow.

export const PLAZA = { x: 0, z: 8, r: 8 };
export const OFFICE = { x: -19, z: 19, w: 11, d: 8 }; // door on the east (+X) wall
export const GATE = { x: 0, z: 52 };
export const PERIMETER_R = 52;
// Front gate: three tight turnstile lanes in the middle, the ticket booth on the east side.
export const TICKET_BOOTH = { x: 7, z: 52 };
export const GATE_W = 19; // width of the opening in the perimeter fence
export const TURNSTILES = [-1.2, 0, 1.2]; // lane x positions, at GATE.z (lanes are 0.85 m wide)
export const TRUCK_BAY = { x: -1.2, z: 61 }; // where delivery trucks park (rear doors facing the gate)
export const CART_SPAWN = { x: 4.5, z: 36 };
export const DUMPSTER = { x: -16, z: 26.6 };

// Hippo swamp: a pit dug into the downhill east side. The muddy beach on the far (east) side
// doubles as the keeper ramp; visitors look down from the deck on the plaza side.
export const HIPPO = { id: 'hippo', name: 'HIPPO SWAMP', x: 27, z: -4, r: 12, depth: 4.6, waterR: 7.2, deckAngle: Math.PI * 0.93 };
// The water body the player/items float in (kept as POND so physics code stays generic).
export const POND = { x: HIPPO.x - 0.8, z: HIPPO.z, r: HIPPO.waterR };
// a muddy island in the middle of the pond the hippos haul out onto and nap on
export const HIPPO_ISLAND = { x: POND.x + 0.6, z: POND.z + 0.4, r: 2.3 };

// Monkey house: a glass box with a lattice roof, on the north crest.
export const MONKEY = { id: 'monkey', name: 'MONKEY HOUSE', x: -1, z: -31, w: 24, d: 16, h: 7, r: 15 };

// Lion enclosure: raised savanna with a rock outcrop, tall fence, viewing window toward the plaza.
export const LION = { id: 'lion', name: "LION'S DEN", x: -30, z: -8, r: 13 };

// Penguin cove: icy pool behind low glass, west of the entrance road.
export const PENGUIN = { id: 'penguin', name: 'PENGUIN COVE', x: -13, z: 40, r: 7 };
// Elephant plains: big sandy yard with a log fence, east of the entrance road.
export const ELEPHANT = { id: 'elephant', name: 'ELEPHANT PLAINS', x: 28, z: 25, r: 11 };
// Gorilla forest: rocky glade behind a tall glass wall, west of the office, south of the lions.
export const GORILLA = { id: 'gorilla', name: 'GORILLA FOREST', x: -37, z: 17, r: 7 };

export const ENCLOSURES = [HIPPO, MONKEY, LION, PENGUIN, ELEPHANT, GORILLA];

// Where each exhibit is viewed from / where keepers get in.
HIPPO.view = [HIPPO.x + Math.cos(HIPPO.deckAngle) * (HIPPO.r + 1.2), HIPPO.z + Math.sin(HIPPO.deckAngle) * (HIPPO.r + 1.2)];
HIPPO.keeperAngle = 0.15;
MONKEY.view = [MONKEY.x, MONKEY.z + MONKEY.d / 2 + 2.2];
MONKEY.door = [MONKEY.x + MONKEY.w / 2, MONKEY.z + 3]; // keeper door, east wall
LION.viewAngle = Math.atan2(PLAZA.z - LION.z, PLAZA.x - LION.x);
LION.view = [LION.x + Math.cos(LION.viewAngle) * (LION.r + 2), LION.z + Math.sin(LION.viewAngle) * (LION.r + 2)];
LION.keeperAngle = LION.viewAngle + Math.PI * 0.62;
for (const e of [PENGUIN, ELEPHANT, GORILLA]) {
  e.viewAngle = e === PENGUIN ? 0 : e === ELEPHANT ? Math.atan2(PLAZA.z + 20 - e.z, PLAZA.x - e.x) : 0.15;
  e.view = [e.x + Math.cos(e.viewAngle) * (e.r + 1.8), e.z + Math.sin(e.viewAngle) * (e.r + 1.8)];
  e.keeperAngle = e.viewAngle + Math.PI;
  e.keeper = [e.x + Math.cos(e.keeperAngle) * (e.r + 1.4), e.z + Math.sin(e.keeperAngle) * (e.r + 1.4)];
}

const officeDoor = [OFFICE.x + OFFICE.w / 2 + 1.2, OFFICE.z];
const lionKeeper = [LION.x + Math.cos(LION.keeperAngle) * (LION.r + 1.5), LION.z + Math.sin(LION.keeperAngle) * (LION.r + 1.5)];
const hippoKeeper = [HIPPO.x + Math.cos(HIPPO.keeperAngle) * (HIPPO.r + 1.5), HIPPO.z + Math.sin(HIPPO.keeperAngle) * (HIPPO.r + 1.5)];
LION.keeper = lionKeeper;
HIPPO.keeper = hippoKeeper;
MONKEY.keeper = [MONKEY.door[0] + 1.6, MONKEY.door[1]];
const loopNE = [14, -20];
const loopNW = [-20, -24];
const loopE = [40, -14];

export const PATHS = [
  { a: [0, 84], b: [PLAZA.x, PLAZA.z], w: 4.2 }, // the road up the hill through the gate
  { a: [PLAZA.x, PLAZA.z], b: officeDoor, w: 3 },
  { a: officeDoor, b: [DUMPSTER.x + 2, DUMPSTER.z - 0.5], w: 2.2 },
  // visitor loop: plaza → hippo deck → monkey house → lion window → plaza
  { a: [PLAZA.x, PLAZA.z], b: HIPPO.view, w: 3.4 },
  { a: HIPPO.view, b: loopNE, w: 3 },
  { a: loopNE, b: MONKEY.view, w: 3 },
  { a: [PLAZA.x, PLAZA.z], b: MONKEY.view, w: 3.4 },
  { a: MONKEY.view, b: loopNW, w: 3 },
  { a: loopNW, b: LION.view, w: 3 },
  { a: [PLAZA.x, PLAZA.z], b: LION.view, w: 3.4 },
  // keeper tracks
  { a: loopNE, b: loopE, w: 2 },
  { a: loopE, b: hippoKeeper, w: 2 },
  { a: loopNE, b: MONKEY.door, w: 2 },
  { a: loopNW, b: lionKeeper, w: 2 },
  // the newer exhibits hang off the entrance road
  { a: [0, 40], b: PENGUIN.view, w: 2.8 },
  { a: [0, 28], b: ELEPHANT.view, w: 3 },
  { a: [0, 29], b: [-26, 29], w: 2.6 }, // south of the office and dumpster
  { a: [-26, 29], b: GORILLA.view, w: 2.6 },
  { a: [GATE.x + 7, GATE.z + 2], b: [GATE.x + 2, GATE.z + 12], w: 2.4 }, // queue to the ticket window
]; 

// Areas the terrain is levelled under (buildings, plaza, exhibits).
export const FLATTEN = [
  { x: OFFICE.x, z: OFFICE.z, r: 8.5, blend: 5 },
  { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 1, blend: 6 },
  { x: GATE.x + 2, z: GATE.z + 3, r: 10, blend: 20 }, // one level forecourt: turnstiles, ticket booth and the queue
  { x: HIPPO.x, z: HIPPO.z, r: HIPPO.r + 1.5, blend: 4 },
  { x: MONKEY.x, z: MONKEY.z, r: 14.5, blend: 5 },
  { x: TRUCK_BAY.x, z: TRUCK_BAY.z + 4, r: 6, blend: 16 }, // truck bay
  { x: PENGUIN.x, z: PENGUIN.z, r: PENGUIN.r + 1.5, blend: 4 },
  { x: ELEPHANT.x, z: ELEPHANT.z, r: ELEPHANT.r + 1.5, blend: 5 },
  { x: GORILLA.x, z: GORILLA.z, r: GORILLA.r + 1.5, blend: 4 },
  // level ground along the lion viewing window
  { x: LION.x + Math.cos(LION.viewAngle) * LION.r, z: LION.z + Math.sin(LION.viewAngle) * LION.r, r: 5.5, blend: 4 },
];

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// Signed distance to the nearest path edge (negative = on the path).
export function pathDist(x, z) {
  let best = Infinity;
  for (const p of PATHS) best = Math.min(best, distToSegment(x, z, p.a[0], p.a[1], p.b[0], p.b[1]) - p.w / 2);
  return best;
}

export function inMonkeyHouse(x, z, margin = 0) {
  return Math.abs(x - MONKEY.x) < MONKEY.w / 2 + margin && Math.abs(z - MONKEY.z) < MONKEY.d / 2 + margin;
}

// True when (x, z) is free for scattering trees/rocks.
export function isOpenGround(x, z, margin = 1.5) {
  if (pathDist(x, z) < margin) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + margin) return false;
  if (Math.abs(x - OFFICE.x) < OFFICE.w / 2 + margin + 1 && Math.abs(z - OFFICE.z) < OFFICE.d / 2 + margin + 1) return false;
  if (Math.hypot(x - DUMPSTER.x, z - DUMPSTER.z) < 3 + margin) return false;
  if (Math.hypot(x - TICKET_BOOTH.x, z - TICKET_BOOTH.z) < 3 + margin) return false;
  if (Math.hypot(x - GATE.x, z - GATE.z) < 7 + margin) return false;
  if (Math.hypot(x - HIPPO.x, z - HIPPO.z) < HIPPO.r + 1 + margin) return false;
  if (Math.hypot(x - LION.x, z - LION.z) < LION.r + margin) return false;
  if (inMonkeyHouse(x, z, margin + 1.5)) return false;
  for (const e of [PENGUIN, ELEPHANT, GORILLA]) if (Math.hypot(x - e.x, z - e.z) < e.r + 1 + margin) return false;
  const r = Math.hypot(x, z);
  if (Math.abs(r - PERIMETER_R) < margin + 0.5) return false;
  return true;
}
