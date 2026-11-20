import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import {
  GeometryKit,
  RectSolid,
  bucketToGeometry,
  pushBox,
  transformGeometry,
} from "../geometry/solid";
import type { AtriumMaterials } from "../materials";
import type { Collider3D, CollisionWorld } from "../navigation/collisionWorld";

export interface EntranceDoorController {
  group: THREE.Group;
  setOpenProgress: (progress: number) => void;
  getOpenAngleDeg: () => number;
  dispose: () => void;
}

export interface BuiltArchitecture {
  shellGeometry: THREE.BufferGeometry;
  shellFloorGeometry: THREE.BufferGeometry;
  shellEdges: number[];
  doors: EntranceDoorController;
}

function buildEntranceDoorLeaf(
  side: -1 | 1,
  materials: AtriumMaterials,
  disposableGeos: THREE.BufferGeometry[],
): THREE.Group {
  const { entrance } = ATRIUM_CONFIG;
  const pivot = new THREE.Group();
  pivot.name = side === -1 ? "entrance-door-left" : "entrance-door-right";
  const hingeX = side * entrance.halfClearWidth;
  const hingeZ = ATRIUM_CONFIG.envelope.extWallT - 0.02;
  pivot.position.set(hingeX, 0.015, hingeZ);

  const w = entrance.leafWidth;
  const h = entrance.leafHeight;
  const t = entrance.leafThickness;
  // When closed (rotation.y = 0), left leaf extends +X from -halfClearWidth -> 0; right leaf extends -X from +halfClearWidth -> 0
  const x0 = side === -1 ? 0.008 : -w;
  const x1 = side === -1 ? w : -0.008;

  const stileW = 0.23;
  const botRailH = 0.2;
  const midRailY0 = 0.92;
  const midRailY1 = 1.14;
  const topRailH = 0.22;

  const lx0 = Math.min(x0, x1);
  const lx1 = Math.max(x0, x1);
  const px0 = lx0 + stileW;
  const px1 = lx1 - stileW;
  const panelT = t * 0.46;
  const beadW = 0.032;
  const beadZ = t / 2 - 0.008;

  // Build watertight door slab + recessed panels + stepped molding beads via RectSolid (zero internal seams!)
  const doorSolid = new RectSolid();
  doorSolid.add(lx0, 0, -t / 2, lx1, h, t / 2);

  // Carve recessed lower & upper panel cavities on both front (+Z) and back (-Z) faces
  for (const [py0, py1] of [
    [botRailH, midRailY0],
    [midRailY1, h - topRailH],
  ] as const) {
    // Outer step recess
    doorSolid.sub(px0, py0, beadZ, px1, py1, t / 2 + 0.01);
    doorSolid.sub(px0, py0, -t / 2 - 0.01, px1, py1, -beadZ);
    // Deep inner panel recess leaving clean stepped molding bead
    doorSolid.sub(px0 + beadW, py0 + beadW, panelT / 2, px1 - beadW, py1 - beadW, beadZ + 0.01);
    doorSolid.sub(px0 + beadW, py0 + beadW, -beadZ - 0.01, px1 - beadW, py1 - beadW, -panelT / 2);
  }

  // Minimalist architectural pull handles integrated cleanly on meeting stile (both faces)
  const handleX = side === -1 ? lx1 - 0.11 : lx0 + 0.11;
  for (const faceSign of [-1, 1] as const) {
    const hz0 = faceSign > 0 ? t / 2 : -(t / 2 + 0.036);
    const hz1 = faceSign > 0 ? t / 2 + 0.036 : -t / 2;
    doorSolid.add(handleX - 0.012, 1.0, hz0, handleX + 0.012, 1.03, hz1);
    doorSolid.add(handleX - 0.012, 1.42, hz0, handleX + 0.012, 1.45, hz1);
    const barZ0 = faceSign > 0 ? t / 2 + 0.034 : -(t / 2 + 0.054);
    const barZ1 = faceSign > 0 ? t / 2 + 0.054 : -(t / 2 + 0.034);
    doorSolid.add(handleX - 0.014, 0.98, barZ0, handleX + 0.014, 1.47, barZ1);
  }

  const builtDoor = doorSolid.build();
  const bucket = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  const edges: number[] = [...builtDoor.edges];

  // Append watertight door geometry
  const srcDoor = builtDoor.geometry.index ? builtDoor.geometry.toNonIndexed() : builtDoor.geometry;
  {
    const p = srcDoor.attributes.position;
    const nrm = srcDoor.attributes.normal;
    const uv = srcDoor.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      bucket.p.push(p.getX(i), p.getY(i), p.getZ(i));
      bucket.n.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      bucket.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      bucket.idx.push(i);
    }
  }
  if (srcDoor !== builtDoor.geometry) srcDoor.dispose();
  builtDoor.geometry.dispose();

  // Cylindrical barrel hinges along hinge axis
  for (const hy of entrance.hingeOffsetsY) {
    const cyl = new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12);
    cyl.translate(0, hy, 0.012);
    const src = cyl.toNonIndexed();
    const p = src.attributes.position;
    const nrm = src.attributes.normal;
    const uv = src.attributes.uv;
    const base = bucket.p.length / 3;
    for (let i = 0; i < p.count; i++) {
      bucket.p.push(p.getX(i), p.getY(i), p.getZ(i));
      bucket.n.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      bucket.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      bucket.idx.push(base + i);
    }
    const eg = new THREE.EdgesGeometry(cyl, 34);
    const ep = eg.attributes.position;
    for (let i = 0; i < ep.count; i++) edges.push(ep.getX(i), ep.getY(i), ep.getZ(i));
    eg.dispose();
    src.dispose();
    cyl.dispose();
  }

  const doorGeo = bucketToGeometry(bucket);
  disposableGeos.push(doorGeo);
  const doorMesh = new THREE.Mesh(doorGeo, materials.clay);
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  pivot.add(doorMesh);

  const doorLines = materials.createLines("structure", edges);
  if (doorLines) {
    disposableGeos.push(doorLines.geometry);
    pivot.add(doorLines);
  }

  return pivot;
}

/**
 * Splits a 1D line segment [a, b] around blocked intervals so floor grid lines
 * stop cleanly at planters or architectural obstacles instead of bleeding through them.
 */
function clipIntervals(
  start: number,
  end: number,
  blocked: Array<[number, number]>,
): Array<[number, number]> {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  let spans: Array<[number, number]> = [[lo, hi]];
  for (const [b0, b1] of blocked) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of spans) {
      if (b1 <= s0 || b0 >= s1) {
        next.push([s0, s1]);
      } else {
        if (b0 > s0 + 0.01) next.push([s0, b0]);
        if (b1 < s1 - 0.01) next.push([b1, s1]);
      }
    }
    spans = next;
  }
  return spans;
}

/**
 * Builds the watertight 360-degree building shell, mezzanines, columns,
 * glazing walls, railings, ceiling downlights, floor grid, and entrance doors.
 */
export function buildArchitecture(
  kit: GeometryKit,
  materials: AtriumMaterials,
  collisionWorld: CollisionWorld,
): BuiltArchitecture {
  const { envelope, entrance, leftWing, rightWing, staircase, plants } = ATRIUM_CONFIG;
  const hw = envelope.halfWidth;
  const depth = envelope.depth;
  const ceilY = envelope.ceilingHeight;
  const extT = envelope.extWallT;
  const slabT = envelope.slabT;

  const solid = new RectSolid();

  // 1. Ground structural slab + exterior podium apron (complete solid foundation from below & all 360° sides)
  solid.add(-hw - extT - 0.35, -slabT, -depth - extT - 0.35, hw + extT + 0.35, 0, envelope.frontApronZ);

  // 2. Four double-height exterior walls (watertight perimeter)
  solid.add(-hw - extT, 0, -depth - extT, -hw, ceilY + slabT, extT); // West wall
  solid.add(hw, 0, -depth - extT, hw + extT, ceilY + slabT, extT); // East wall
  solid.add(-hw - extT, 0, -depth - extT, hw + extT, ceilY + slabT, -depth); // North (back) wall
  solid.add(-hw - extT, 0, 0, hw + extT, ceilY + slabT, extT); // South (front entrance) wall

  // 3. Full roof slab & architectural perimeter parapet coping
  solid.add(-hw - extT, ceilY, -depth - extT, hw + extT, ceilY + slabT, extT);
  const parT = 0.22;
  const roofTop = ceilY + slabT;
  const parTop = roofTop + envelope.parapetH;
  solid.add(-hw - extT, roofTop, -depth - extT, -hw - extT + parT, parTop, extT);
  solid.add(hw + extT - parT, roofTop, -depth - extT, hw + extT, parTop, extT);
  solid.add(-hw - extT, roofTop, -depth - extT, hw + extT, parTop, -depth - extT + parT);
  solid.add(-hw - extT, roofTop, extT - parT, hw + extT, parTop, extT);

  // 4. Carve monumental front entrance doorway opening
  solid.sub(
    -entrance.halfClearWidth,
    0,
    -0.06,
    entrance.halfClearWidth,
    entrance.clearHeight,
    extT + 0.08,
  );

  // 5. Carve West ground-floor tall window bays & upper-front sunlight clerestory
  const gw = leftWing.groundWindows;
  solid.sub(-hw - extT - 0.05, gw.sillY, gw.zEnd, -hw + 0.05, gw.headY, gw.zStart);
  const cw = leftWing.clerestoryWindow;
  solid.sub(-hw - extT - 0.05, cw.sillY, cw.zEnd, -hw + 0.05, cw.headY, cw.zStart);

  // 6. Carve East upper-office daylight windows
  const ew = rightWing.upperEastWindows;
  solid.sub(hw - 0.05, ew.sillY, ew.zEnd, hw + extT + 0.05, ew.headY, ew.zStart);

  // 7. Left Mezzanine Slab + Upper-Left Enclosed Office Room + Rear Alcove Pier
  solid.add(leftWing.slabX0, envelope.groundSoffitY, -depth, leftWing.slabX1, envelope.upperFloorY, 0);
  const ur = leftWing.upperRoom;
  const iw = envelope.intWallT;
  solid.add(ur.x0, envelope.upperFloorY, ur.z0 - iw, ur.x1, ur.topY, ur.z0); // South face wall
  solid.add(ur.x1 - iw, envelope.upperFloorY, ur.z1, ur.x1, ur.topY, ur.z0); // East face wall
  solid.add(ur.x0, ur.topY - iw, ur.z1, ur.x1, ur.topY, ur.z0); // Flat roof cap below main ceiling
  solid.sub(ur.doorX0, envelope.upperFloorY, ur.z0 - iw - 0.04, ur.doorX1, ur.doorTopY, ur.z0 + 0.04);

  // Left rear ground-floor alcove side pier with framed side-lite opening
  const lp = leftWing.rearAlcove;
  solid.add(lp.pierX0, 0, lp.pierZ1, lp.pierX1, envelope.groundSoffitY, lp.pierZ0);
  solid.sub(lp.pierX0 - 0.04, 0.94, -11.55, lp.pierX1 + 0.04, 2.86, -10.1);

  // 8. Right Mezzanine Slab (with stairwell opening subtracted cleanly!)
  solid.add(rightWing.slabX0, envelope.groundSoffitY, -depth, rightWing.slabX1, envelope.upperFloorY, 0);
  solid.sub(
    rightWing.stairwellX0,
    envelope.groundSoffitY - 0.04,
    rightWing.stairwellZ1,
    rightWing.stairwellX1 + 0.02,
    envelope.upperFloorY + 0.04,
    rightWing.stairwellZ0,
  );

  // 9. Right Lower Landing, Continuous Shelving Plinth, Square Columns & Niche Backing Wall
  const ll = staircase.lowerLanding;
  solid.add(ll.x0, 0, ll.z1, ll.x1, ll.y, 0);
  // Continuous plinth north of lower landing under columns & niche (aligned flush at rightWing.slabX0 = 2.35)
  solid.add(rightWing.slabX0, 0, -depth, rightWing.nicheWallX1, rightWing.plinthY, ll.z1);
  // Clean solid rear right partition pier closing the right shelving alcove
  solid.add(rightWing.slabX0, rightWing.plinthY, -depth, rightWing.nicheWallX1, envelope.groundSoffitY, -11.85);

  // Two prominent square structural columns on the right plinth
  for (const col of rightWing.columns) {
    solid.add(col.x0, rightWing.plinthY, col.z1, col.x1, envelope.groundSoffitY, col.z0);
  }
  // Niche backing wall separating shelving alcove from stairwell
  solid.add(
    rightWing.nicheWallX0,
    rightWing.plinthY,
    rightWing.nicheZ1,
    rightWing.nicheWallX1,
    envelope.groundSoffitY,
    rightWing.nicheZ0,
  );

  // Exclude buried underside edges of the foundation slab at Y = -slabT and split walkable floor tops into warm gray
  const builtShell = solid.build(
    (_x0, y0, _z0, _x1, y1, _z1) => !(y0 <= -slabT + 0.002 && y1 <= -slabT + 0.002),
    [0, rightWing.plinthY, envelope.upperFloorY],
  );

  // ---- Stepped Entrance Portal Casing / Architrave (watertight RectSolid, zero corner overlap seams!) ----
  const cw0 = entrance.halfClearWidth;
  const cw1 = cw0 + entrance.casingWidth;
  const ch0 = entrance.clearHeight;
  const ch1 = ch0 + entrance.casingWidth;
  const cd = entrance.casingDepth;

  const casingSolid = new RectSolid();
  // Exterior stepped architrave (+Z face)
  casingSolid.add(-cw1, 0, extT, -cw0, ch1, extT + cd);
  casingSolid.add(cw0, 0, extT, cw1, ch1, extT + cd);
  casingSolid.add(-cw0, ch0, extT, cw0, ch1, extT + cd);
  // Outer subtle shadow-bead trim
  casingSolid.add(-cw1 - 0.045, 0, extT, -cw1, ch1 + 0.045, extT + cd * 0.55);
  casingSolid.add(cw1, 0, extT, cw1 + 0.045, ch1 + 0.045, extT + cd * 0.55);
  casingSolid.add(-cw1 - 0.045, ch1, extT, cw1 + 0.045, ch1 + 0.045, extT + cd * 0.55);
  // Interior matching architrave (-Z face)
  casingSolid.add(-cw1, 0, -cd * 0.75, -cw0, ch1, 0);
  casingSolid.add(cw0, 0, -cd * 0.75, cw1, ch1, 0);
  casingSolid.add(-cw1, ch0, -cd * 0.75, cw1, ch1, 0);
  // Jamb rebate stops
  casingSolid.add(-cw0, 0, 0.04, -cw0 + 0.022, ch0, extT - 0.07);
  casingSolid.add(cw0 - 0.022, 0, 0.04, cw0, ch0, extT - 0.07);
  casingSolid.add(-cw0, ch0 - 0.022, 0.04, cw0, ch0, extT - 0.07);
  kit.solid("clay", casingSolid, "structure", (_x0, y0, _z0, _x1, y1) => !(y0 <= 0.001 && y1 <= 0.001));

  // Subtle low architectural threshold bar matching warm-gray floor
  kit.box("floor", -cw0, 0, 0.0, cw0, 0.012, extT, "detail");

  // Upper-left office doorway casing & recessed white clay door panel (watertight RectSolid)
  const upperDoorFrame = new RectSolid();
  upperDoorFrame.add(ur.doorX0 - 0.08, envelope.upperFloorY, ur.z0, ur.doorX0, ur.doorTopY + 0.08, ur.z0 + 0.035);
  upperDoorFrame.add(ur.doorX1, envelope.upperFloorY, ur.z0, ur.doorX1 + 0.08, ur.doorTopY + 0.08, ur.z0 + 0.035);
  upperDoorFrame.add(ur.doorX0 - 0.08, ur.doorTopY, ur.z0, ur.doorX1 + 0.08, ur.doorTopY + 0.08, ur.z0 + 0.035);
  kit.solid("clay", upperDoorFrame, "detail");
  kit.box("clay", ur.doorX0 + 0.01, envelope.upperFloorY, ur.z0 - 0.09, ur.doorX1 - 0.01, ur.doorTopY - 0.01, ur.z0 - 0.045, "furniture");

  // ---- Glazing Systems (Watertight RectSolid Mullions + Physical Clear Tinted Reflective Glass) ----
  const addGlazedWindowBank = (
    wallX: number,
    zStart: number,
    zEnd: number,
    y0: number,
    y1: number,
    bays: number,
    addGlints: boolean,
  ) => {
    const frameD = extT + 0.03;
    const xA = wallX - frameD / 2;
    const xB = wallX + frameD / 2;
    const frameT = 0.065;

    const frameSolid = new RectSolid();
    frameSolid.add(xA, y0, zEnd, xB, y0 + frameT, zStart);
    frameSolid.add(xA, y1 - frameT, zEnd, xB, y1, zStart);

    const spanZ = zEnd - zStart;
    for (let i = 0; i <= bays; i++) {
      const mz = zStart + (spanZ * i) / bays;
      const mw = i === 0 || i === bays ? frameT : 0.055;
      frameSolid.add(xA, y0, mz - mw / 2, xB, y1, mz + mw / 2);
    }
    kit.solid("clay", frameSolid, "structure");

    // Clear reflective glass panes nestled cleanly inside mullions (no redundant double edge lines!)
    for (let i = 0; i < bays; i++) {
      const bz0 = zStart + (spanZ * i) / bays - 0.028;
      const bz1 = zStart + (spanZ * (i + 1)) / bays + 0.028;
      const py0 = y0 + frameT;
      const py1 = y1 - frameT;
      kit.box("glass", wallX - 0.008, py0, bz1, wallX + 0.008, py1, bz0, null);

      if (addGlints) {
        const midZ = (bz0 + bz1) / 2;
        const gx = wallX + 0.015;
        kit.segment("glassGlint", gx, py0 + 0.44, midZ + 0.26, gx, py0 + 1.16, midZ - 0.16);
        kit.segment("glassGlint", gx, py0 + 0.74, midZ + 0.32, gx, py0 + 1.54, midZ - 0.14);
      }
    }
  };

  // West tall ground-floor windows + upper sunlight clerestory + East upper windows
  addGlazedWindowBank(-hw - extT / 2, gw.zStart, gw.zEnd, gw.sillY, gw.headY, gw.bays, true);
  addGlazedWindowBank(-hw - extT / 2, cw.zStart, cw.zEnd, cw.sillY, cw.headY, 2, false);
  addGlazedWindowBank(hw + extT / 2, ew.zStart, ew.zEnd, ew.sillY, ew.headY, ew.bays, false);

  // Left rear alcove side-lite glass panel (clean frame + clear glass, zero double seams)
  const sideLiteFrame = new RectSolid();
  sideLiteFrame.add(lp.pierX0 - 0.01, 0.94, -11.55, lp.pierX1 + 0.01, 0.99, -10.1);
  sideLiteFrame.add(lp.pierX0 - 0.01, 2.81, -11.55, lp.pierX1 + 0.01, 2.86, -10.1);
  sideLiteFrame.add(lp.pierX0 - 0.01, 0.94, -11.55, lp.pierX1 + 0.01, 2.86, -11.5);
  sideLiteFrame.add(lp.pierX0 - 0.01, 0.94, -10.15, lp.pierX1 + 0.01, 2.86, -10.1);
  kit.solid("clay", sideLiteFrame, "detail");
  kit.box(
    "glass",
    (lp.pierX0 + lp.pierX1) / 2 - 0.007,
    0.99,
    -11.5,
    (lp.pierX0 + lp.pierX1) / 2 + 0.007,
    2.81,
    -10.15,
    null,
  );

  // Upper-Left Balcony Glass Railing (watertight RectSolid base shoe + posts + handrail + clear reflective glass)
  {
    const rx = leftWing.railingX;
    const ry0 = envelope.upperFloorY;
    const ry1 = ry0 + leftWing.railingHeight;
    const rz0 = leftWing.railingZ0;
    const rz1 = leftWing.railingZ1;
    const railSolid = new RectSolid();
    railSolid.add(rx - 0.032, ry0, rz1, rx + 0.032, ry0 + 0.072, rz0);
    railSolid.add(rx - 0.034, ry1 - 0.05, rz1, rx + 0.034, ry1, rz0);

    const bays = leftWing.railingBays;
    for (let i = 0; i <= bays; i++) {
      const pz = rz0 + ((rz1 - rz0) * i) / bays;
      railSolid.add(rx - 0.025, ry0, pz - 0.025, rx + 0.025, ry1, pz + 0.025);
      if (i < bays) {
        const nz = rz0 + ((rz1 - rz0) * (i + 1)) / bays;
        kit.box("glass", rx - 0.007, ry0 + 0.072, nz + 0.025, rx + 0.007, ry1 - 0.05, pz - 0.025, null);
      }
    }
    kit.solid("clay", railSolid, "structure");
  }

  // Upper-Right Full-Height Framed Glass Partition Wall (Y = 3.48 -> 6.60 m)
  {
    const gp = rightWing.glassPartition;
    const gx = gp.x;
    const gy0 = envelope.upperFloorY;
    const gy1 = ceilY;
    const gt = gp.transomY;

    const partSolid = new RectSolid();
    partSolid.add(gx - 0.034, gy0, gp.z1, gx + 0.034, gy0 + 0.064, gp.z0);
    partSolid.add(gx - 0.034, gt - 0.03, gp.z1, gx + 0.034, gt + 0.03, gp.z0);
    partSolid.add(gx - 0.034, gy1 - 0.058, gp.z1, gx + 0.034, gy1, gp.z0);

    for (let i = 0; i <= gp.bays; i++) {
      const mz = gp.z0 + ((gp.z1 - gp.z0) * i) / gp.bays;
      partSolid.add(gx - 0.03, gy0, mz - 0.026, gx + 0.03, gy1, mz + 0.026);
      if (i < gp.bays) {
        const nz = gp.z0 + ((gp.z1 - gp.z0) * (i + 1)) / gp.bays;
        // Lower clear reflective glass panel
        kit.box("glass", gx - 0.008, gy0 + 0.064, nz + 0.026, gx + 0.008, gt - 0.03, mz - 0.026, null);
        // Upper tall clear reflective glass panel
        kit.box("glass", gx - 0.008, gt + 0.03, nz + 0.026, gx + 0.008, gy1 - 0.058, mz - 0.026, null);
        if (i % 2 === 1) {
          const midZ = (mz + nz) / 2;
          const rx = gx - 0.015;
          kit.segment("glassGlint", rx, gt + 0.44, midZ + 0.22, rx, gt + 1.24, midZ - 0.16);
          kit.segment("glassGlint", rx, gt + 0.74, midZ + 0.26, rx, gt + 1.52, midZ - 0.12);
        }
      }
    }
    kit.solid("clay", partSolid, "structure");
  }

  // ---- Upper-Floor Virtual Meeting Room Entrance Door (North Wall at Top of Stairs) ----
  {
    const uy = envelope.upperFloorY;
    const dx = 3.05;
    const dw = 1.06;
    const dh = 2.28;
    const dz = -depth; // -13.20 m north wall interior face

    // Architectural door casing frame protruding gently into the upper landing
    const doorFrame = new RectSolid();
    doorFrame.add(dx - dw / 2 - 0.075, uy, dz, dx - dw / 2, uy + dh + 0.075, dz + 0.085);
    doorFrame.add(dx + dw / 2, uy, dz, dx + dw / 2 + 0.075, uy + dh + 0.075, dz + 0.085);
    doorFrame.add(dx - dw / 2 - 0.075, uy + dh, dz, dx + dw / 2 + 0.075, uy + dh + 0.075, dz + 0.085);
    kit.solid("clay", doorFrame, "structure");

    // Subtle muted-blue architectural lintel accent bar signifying the Meeting Room entrance
    kit.box(
      "accentBlue",
      dx - dw / 2 - 0.075,
      uy + dh + 0.075,
      dz,
      dx + dw / 2 + 0.075,
      uy + dh + 0.145,
      dz + 0.07,
      "detail",
    );

    // Solid dimensional door leaf + sleek recessed vision lite + pull handle
    kit.box("desk", dx - dw / 2, uy + 0.012, dz + 0.008, dx + dw / 2, uy + dh, dz + 0.056, "structure");
    // Vision glass frame & cool-blue reflective glazing
    kit.box("clay", dx - 0.27, uy + 0.88, dz + 0.052, dx + 0.27, uy + 0.92, dz + 0.068, "detail");
    kit.box("clay", dx - 0.27, uy + dh - 0.24, dz + 0.052, dx + 0.27, uy + dh - 0.20, dz + 0.068, "detail");
    kit.box("clay", dx - 0.27, uy + 0.88, dz + 0.052, dx - 0.23, uy + dh - 0.20, dz + 0.068, "detail");
    kit.box("clay", dx + 0.23, uy + 0.88, dz + 0.052, dx + 0.27, uy + dh - 0.20, dz + 0.068, "detail");
    kit.box("glass", dx - 0.23, uy + 0.92, dz + 0.056, dx + 0.23, uy + dh - 0.24, dz + 0.064, null);
    kit.segment("glassGlint", dx - 0.14, uy + 1.15, dz + 0.072, dx + 0.12, uy + 1.62, dz + 0.072);
    kit.segment("glassGlint", dx - 0.08, uy + 1.42, dz + 0.072, dx + 0.16, uy + 1.85, dz + 0.072);

    // Architectural champagne-gold vertical pull handle on right stile
    kit.box("accentGold", dx + 0.36, uy + 0.96, dz + 0.056, dx + 0.388, uy + 0.988, dz + 0.102, "detail");
    kit.box("accentGold", dx + 0.36, uy + 1.32, dz + 0.056, dx + 0.388, uy + 1.348, dz + 0.102, "detail");
    kit.box("accentGold", dx + 0.36, uy + 0.94, dz + 0.098, dx + 0.388, uy + 1.37, dz + 0.124, "detail");

    // Subtle dark threshold strip at floor plane
    kit.box("chairBase", dx - dw / 2, uy, dz, dx + dw / 2, uy + 0.012, dz + 0.11, "detail");
  }

  // ---- Recessed Circular Ceiling Downlights under Left & Right Soffits ----
  const addDownlight = (lx: number, ly: number, lz: number) => {
    const bezel = new THREE.CylinderGeometry(0.088, 0.088, 0.012, 18);
    transformGeometry(bezel, lx, ly - 0.005, lz);
    kit.geo("clay", bezel, "detail", 30);
    const core = new THREE.CylinderGeometry(0.054, 0.054, 0.016, 18);
    transformGeometry(core, lx, ly - 0.007, lz);
    kit.geo("accentGold", core, "detail", 30);
  };
  for (const lz of leftWing.downlightZs) addDownlight(leftWing.downlightX, envelope.groundSoffitY, lz);
  for (const lz of rightWing.downlightZs) addDownlight(rightWing.downlightX, envelope.groundSoffitY, lz);

  // ---- Subtle Architectural Baseboard Trim (watertight RectSolid) ----
  const bh = envelope.baseboardH;
  const baseboardSolid = new RectSolid();
  baseboardSolid.add(-hw, 0, -depth, rightWing.slabX0, bh, -depth + 0.022);
  baseboardSolid.add(-hw, 0, -depth, -hw + 0.022, bh, 0);
  kit.solid("clay", baseboardSolid, "detail", (_x0, y0, _z0, _x1, y1) => !(y0 <= 0.001 && y1 <= 0.001));

  // ---- Subtle Architectural Floor Joint Grid (clipped cleanly around planters & threshold) ----
  const groundPlantBoxes = plants
    .filter((p) => p.y === 0)
    .map((p) => ({
      x0: p.x - p.potWidth / 2 - 0.02,
      x1: p.x + p.potWidth / 2 + 0.02,
      z0: p.z - p.potDepth / 2 - 0.02,
      z1: p.z + p.potDepth / 2 + 0.02,
    }));

  const grid = envelope.floorGridSize;
  const gridY = 0.0008;
  for (let gx = -grid * 4; gx <= grid * 4 + 0.01; gx += grid) {
    if (gx <= -hw + 0.05 || gx >= hw - 0.05) continue;
    const zMin =
      gx > staircase.lowerLanding.x0 - 0.02
        ? extT + 0.02
        : gx > staircase.lowerFlight.xStart - 0.02
          ? staircase.lowerFlight.z0 + 0.02
          : -depth + 0.02;
    const zMax = envelope.frontApronZ - 0.05;

    const blockedZ: Array<[number, number]> = [[-0.02, extT + 0.02]];
    for (const pb of groundPlantBoxes) {
      if (gx >= pb.x0 && gx <= pb.x1) blockedZ.push([pb.z0, pb.z1]);
    }
    for (const [s0, s1] of clipIntervals(zMin, zMax, blockedZ)) {
      kit.segment("floorGrid", gx, gridY, s0, gx, gridY, s1);
    }
  }
  for (let gz = envelope.frontApronZ - grid; gz >= -depth + 0.05; gz -= grid) {
    if (gz >= -0.02 && gz <= extT + 0.02) continue;
    const xMax =
      gz > 0
        ? hw - 0.02
        : gz > staircase.lowerFlight.z0
          ? staircase.lowerLanding.x0 - 0.02
          : gz > staircase.lowerFlight.z1
            ? staircase.lowerFlight.xStart - 0.02
            : rightWing.slabX0 - 0.02;
    const blockedX: Array<[number, number]> = [];
    for (const pb of groundPlantBoxes) {
      if (gz >= pb.z0 && gz <= pb.z1) blockedX.push([pb.x0, pb.x1]);
    }
    for (const [s0, s1] of clipIntervals(-hw + 0.02, xMax, blockedX)) {
      kit.segment("floorGrid", s0, gridY, gz, s1, gridY, gz);
    }
  }

  // Upper-right mezzanine floor grid lines
  for (let gz = -1.15; gz >= -depth + 0.4; gz -= grid) {
    const xMax =
      gz < rightWing.stairwellZ0 && gz > rightWing.stairwellZ1
        ? rightWing.stairwellX0 - 0.05
        : rightWing.slabX1 - 0.02;
    kit.segment(
      "floorGrid",
      rightWing.glassPartition.x + 0.05,
      envelope.upperFloorY + 0.001,
      gz,
      xMax,
      envelope.upperFloorY + 0.001,
      gz,
    );
  }

  // ---- Register Walkable Surfaces & Architectural Colliders ----
  collisionWorld.addSurface("entrance-apron", -hw + 0.25, -0.25, hw - 0.25, envelope.frontApronZ - 0.4, () => 0);
  collisionWorld.addSurface("ground-atrium", -hw + 0.12, -depth + 0.12, rightWing.slabX0 - 0.02, 0.25, () => 0);
  collisionWorld.addSurface("ground-right-entry", 1.0, -2.35, staircase.lowerLanding.x0 - 0.02, 0.0, () => 0);

  const uy = envelope.upperFloorY;
  collisionWorld.addSurface(
    "upper-right-rear-landing",
    rightWing.glassPartition.x + 0.08,
    -depth + 0.12,
    hw - 0.12,
    rightWing.stairwellZ1 + 0.15,
    () => uy,
  );
  collisionWorld.addSurface(
    "upper-right-gallery",
    rightWing.glassPartition.x + 0.08,
    rightWing.stairwellZ1 - 0.1,
    rightWing.stairwellX0 - 0.08,
    rightWing.stairwellZ0 + 0.1,
    () => uy,
  );
  collisionWorld.addSurface(
    "upper-right-front-office",
    rightWing.glassPartition.x + 0.08,
    rightWing.stairwellZ0 - 0.1,
    hw - 0.12,
    -0.12,
    () => uy,
  );

  // Perimeter wall colliders
  collisionWorld.addCollider("west-wall", -hw - extT, 0, -depth - extT, -hw, ceilY, extT);
  collisionWorld.addCollider("east-wall", hw, 0, -depth - extT, hw + extT, ceilY, extT);
  collisionWorld.addCollider("north-wall", -hw - extT, 0, -depth - extT, hw + extT, ceilY, -depth);
  collisionWorld.addCollider("south-wall-left", -hw - extT, 0, -0.05, -entrance.halfClearWidth, ceilY, extT + 0.05);
  collisionWorld.addCollider("south-wall-right", entrance.halfClearWidth, 0, -0.05, hw + extT, ceilY, extT + 0.05);
  collisionWorld.addCollider("south-wall-upper", -entrance.halfClearWidth, entrance.clearHeight, -0.05, entrance.halfClearWidth, ceilY, extT + 0.05);
  collisionWorld.addCollider("apron-south-bound", -hw - extT, 0, envelope.frontApronZ - 0.25, hw + extT, 2.5, envelope.frontApronZ + 0.2);
  collisionWorld.addCollider("apron-west-bound", -hw - 0.3, 0, 0, -hw, 2.5, envelope.frontApronZ);
  collisionWorld.addCollider("apron-east-bound", hw, 0, 0, hw + 0.3, 2.5, envelope.frontApronZ);

  // Interior architectural piers, columns, plinths & glass partition colliders
  collisionWorld.addCollider("left-alcove-pier", lp.pierX0, 0, lp.pierZ1, lp.pierX1, envelope.groundSoffitY, lp.pierZ0);
  collisionWorld.addCollider("right-plinth-north", rightWing.slabX0, 0, -depth, rightWing.nicheWallX1, rightWing.plinthY + 0.4, ll.z1);
  collisionWorld.addCollider("right-landing-front-face", ll.x0, 0, ll.z0, ll.x1, ll.y + 0.4, 0.02);
  for (const [idx, col] of rightWing.columns.entries()) {
    collisionWorld.addCollider(`right-column-${idx}`, col.x0, 0, col.z1, col.x1, envelope.groundSoffitY, col.z0);
  }
  collisionWorld.addCollider(
    "right-niche-wall",
    rightWing.nicheWallX0,
    0,
    rightWing.nicheZ1,
    rightWing.nicheWallX1,
    envelope.groundSoffitY,
    rightWing.nicheZ0,
  );
  collisionWorld.addCollider(
    "upper-right-glass-partition",
    rightWing.glassPartition.x - 0.06,
    uy,
    rightWing.glassPartition.z1,
    rightWing.glassPartition.x + 0.06,
    ceilY,
    rightWing.glassPartition.z0,
  );

  // ---- Hinged Double Entrance Doors + Dynamic Collision Sync ----
  const doorsGroup = new THREE.Group();
  doorsGroup.name = "entrance-double-doors";
  const doorDisposables: THREE.BufferGeometry[] = [];
  const leftDoor = buildEntranceDoorLeaf(-1, materials, doorDisposables);
  const rightDoor = buildEntranceDoorLeaf(1, materials, doorDisposables);
  doorsGroup.add(leftDoor, rightDoor);

  let currentProgress = 1;
  const updateDoorPose = (progress: number) => {
    currentProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const angleRad = THREE.MathUtils.degToRad(entrance.openAngleDeg * currentProgress);
    leftDoor.rotation.y = -angleRad;
    rightDoor.rotation.y = angleRad;

    const dyn: Collider3D[] = [];
    for (const side of [-1, 1] as const) {
      const hx = side * entrance.halfClearWidth;
      const hz = extT - 0.02;
      const rot = side === -1 ? -angleRad : angleRad;
      const localEndX = side === -1 ? entrance.leafWidth : -entrance.leafWidth;
      const ex = hx + localEndX * Math.cos(rot);
      const ez = hz - localEndX * Math.sin(rot);
      for (let s = 0; s < 3; s++) {
        const t0 = s / 3;
        const t1 = (s + 1) / 3;
        const sx0 = THREE.MathUtils.lerp(hx, ex, t0);
        const sz0 = THREE.MathUtils.lerp(hz, ez, t0);
        const sx1 = THREE.MathUtils.lerp(hx, ex, t1);
        const sz1 = THREE.MathUtils.lerp(hz, ez, t1);
        dyn.push({
          tag: `door-leaf-${side}-${s}`,
          x0: Math.min(sx0, sx1) - 0.05,
          x1: Math.max(sx0, sx1) + 0.05,
          z0: Math.min(sz0, sz1) - 0.05,
          z1: Math.max(sz0, sz1) + 0.05,
          y0: 0,
          y1: entrance.leafHeight,
        });
      }
    }
    collisionWorld.setDynamicColliders(dyn);
  };
  updateDoorPose(1);

  return {
    shellGeometry: builtShell.geometry,
    shellFloorGeometry: builtShell.floorGeometry,
    shellEdges: builtShell.edges,
    doors: {
      group: doorsGroup,
      setOpenProgress: updateDoorPose,
      getOpenAngleDeg: () => entrance.openAngleDeg * currentProgress,
      dispose: () => {
        for (const g of doorDisposables) g.dispose();
      },
    },
  };
}
