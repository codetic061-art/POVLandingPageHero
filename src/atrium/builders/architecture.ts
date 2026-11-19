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

  const bucket = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  const edges: number[] = [];

  const w = entrance.leafWidth;
  const h = entrance.leafHeight;
  const t = entrance.leafThickness;
  // When closed (rotation.y = 0), left leaf extends +X from -halfClearWidth -> 0; right leaf extends -X from +halfClearWidth -> 0
  const x0 = side === -1 ? 0.008 : -w;
  const x1 = side === -1 ? w : -0.008;

  // Main solid door slab (stiles + rails + core)
  const stileW = 0.23;
  const botRailH = 0.2;
  const midRailY0 = 0.92;
  const midRailY1 = 1.14;
  const topRailH = 0.22;

  const lx0 = Math.min(x0, x1);
  const lx1 = Math.max(x0, x1);
  // Outer stiles & rails full thickness
  pushBox(bucket, edges, lx0, 0, -t / 2, lx0 + stileW, h, t / 2);
  pushBox(bucket, edges, lx1 - stileW, 0, -t / 2, lx1, h, t / 2);
  pushBox(bucket, edges, lx0 + stileW, 0, -t / 2, lx1 - stileW, botRailH, t / 2);
  pushBox(bucket, edges, lx0 + stileW, midRailY0, -t / 2, lx1 - stileW, midRailY1, t / 2);
  pushBox(bucket, edges, lx0 + stileW, h - topRailH, -t / 2, lx1 - stileW, h, t / 2);

  // Recessed solid center panels (complete on both front and back faces!)
  const px0 = lx0 + stileW;
  const px1 = lx1 - stileW;
  const panelT = t * 0.46;
  // Lower recessed panel
  pushBox(bucket, edges, px0, botRailH, -panelT / 2, px1, midRailY0, panelT / 2);
  // Upper tall recessed panel
  pushBox(bucket, edges, px0, midRailY1, -panelT / 2, px1, h - topRailH, panelT / 2);

  // Stepped perimeter panel molding beads on BOTH front (+Z) and back (-Z) faces
  const beadW = 0.032;
  const beadZ = t / 2 - 0.006;
  for (const [py0, py1] of [
    [botRailH, midRailY0],
    [midRailY1, h - topRailH],
  ] as const) {
    for (const faceSign of [-1, 1] as const) {
      const zA = faceSign > 0 ? panelT / 2 : -beadZ;
      const zB = faceSign > 0 ? beadZ : -panelT / 2;
      pushBox(bucket, edges, px0, py0, zA, px1, py0 + beadW, zB);
      pushBox(bucket, edges, px0, py1 - beadW, zA, px1, py1, zB);
      pushBox(bucket, edges, px0, py0 + beadW, zA, px0 + beadW, py1 - beadW, zB);
      pushBox(bucket, edges, px1 - beadW, py0 + beadW, zA, px1, py1 - beadW, zB);
    }
  }

  // Minimalist architectural pull handle on inner/meeting stile (both faces)
  const handleX = side === -1 ? lx1 - 0.11 : lx0 + 0.11;
  for (const faceSign of [-1, 1] as const) {
    const hz0 = faceSign * (t / 2);
    const hz1 = faceSign * (t / 2 + 0.038);
    pushBox(bucket, edges, handleX - 0.012, 1.0, hz0, handleX + 0.012, 1.03, hz1);
    pushBox(bucket, edges, handleX - 0.012, 1.42, hz0, handleX + 0.012, 1.45, hz1);
    pushBox(
      bucket,
      edges,
      handleX - 0.014,
      0.98,
      faceSign * (t / 2 + 0.034),
      handleX + 0.014,
      1.47,
      faceSign * (t / 2 + 0.054),
    );
  }

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
    const eg = new THREE.EdgesGeometry(cyl, 32);
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
 * Builds the watertight 360-degree building shell, mezzanines, columns,
 * glazing walls, railings, ceiling downlights, floor grid, and entrance doors.
 */
export function buildArchitecture(
  kit: GeometryKit,
  materials: AtriumMaterials,
  collisionWorld: CollisionWorld,
): BuiltArchitecture {
  const { envelope, entrance, leftWing, rightWing, staircase } = ATRIUM_CONFIG;
  const hw = envelope.halfWidth;
  const depth = envelope.depth;
  const ceilY = envelope.ceilingHeight;
  const extT = envelope.extWallT;
  const slabT = envelope.slabT;

  const solid = new RectSolid();

  // 1. Ground structural slab + exterior podium apron (complete from below & all 360° sides)
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
  // Hollow upper-left room walls & stepped roof so interior is genuine 3D volume
  const iw = envelope.intWallT;
  solid.add(ur.x0, envelope.upperFloorY, ur.z0 - iw, ur.x1, ur.topY, ur.z0); // South face wall
  solid.add(ur.x1 - iw, envelope.upperFloorY, ur.z1, ur.x1, ur.topY, ur.z0); // East face wall
  solid.add(ur.x0, ur.topY - iw, ur.z1, ur.x1, ur.topY, ur.z0); // Flat roof cap below main ceiling
  // Carve upper-left room doorway
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
  // Continuous plinth north of lower landing under columns & niche
  solid.add(rightWing.slabX0, 0, -depth, rightWing.nicheWallX1, rightWing.plinthY, ll.z1);
  // Rear right partition pier closing the right alcove cleanly
  solid.add(rightWing.slabX0, rightWing.plinthY, -depth, rightWing.nicheWallX1, envelope.groundSoffitY, -11.85);
  solid.sub(rightWing.slabX0 + 0.14, 1.05, -13.0, rightWing.slabX0 + 0.34, 2.88, -12.05);

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

  const builtShell = solid.build();

  // ---- Stepped Entrance Portal Casing / Architrave (both exterior +Z and interior -Z) ----
  const cw0 = entrance.halfClearWidth;
  const cw1 = cw0 + entrance.casingWidth;
  const ch0 = entrance.clearHeight;
  const ch1 = ch0 + entrance.casingWidth;
  const cd = entrance.casingDepth;

  // Exterior stepped architrave (+Z face)
  kit.box("clay", -cw1, 0, extT, -cw0, ch1, extT + cd, "structure");
  kit.box("clay", cw0, 0, extT, cw1, ch1, extT + cd, "structure");
  kit.box("clay", -cw0, ch0, extT, cw0, ch1, extT + cd, "structure");
  // Outer fine shadow-bead trim
  kit.box("clay", -cw1 - 0.045, 0, extT, -cw1, ch1 + 0.045, extT + cd * 0.55, "detail");
  kit.box("clay", cw1, 0, extT, cw1 + 0.045, ch1 + 0.045, extT + cd * 0.55, "detail");
  kit.box("clay", -cw1 - 0.045, ch1, extT, cw1 + 0.045, ch1 + 0.045, extT + cd * 0.55, "detail");

  // Interior matching architrave (-Z face)
  kit.box("clay", -cw1, 0, -cd * 0.75, -cw0, ch1, 0, "structure");
  kit.box("clay", cw0, 0, -cd * 0.75, cw1, ch1, 0, "structure");
  kit.box("clay", -cw1, ch0, -cd * 0.75, cw1, ch1, 0, "structure");
  // Jamb rebate stops & low threshold saddle
  kit.box("clay", -cw0, 0, 0.04, -cw0 + 0.022, ch0, extT - 0.07, "detail");
  kit.box("clay", cw0 - 0.022, 0, 0.04, cw0, ch0, extT - 0.07, "detail");
  kit.box("clay", -cw0, ch0 - 0.022, 0.04, cw0, ch0, extT - 0.07, "detail");
  kit.box("clay", -cw0, 0, -0.02, cw0, 0.014, extT + 0.03, "detail");

  // Upper-left office doorway casing & recessed white clay door panel
  kit.box("clay", ur.doorX0 - 0.08, envelope.upperFloorY, ur.z0, ur.doorX0, ur.doorTopY + 0.08, ur.z0 + 0.035, "detail");
  kit.box("clay", ur.doorX1, envelope.upperFloorY, ur.z0, ur.doorX1 + 0.08, ur.doorTopY + 0.08, ur.z0 + 0.035, "detail");
  kit.box("clay", ur.doorX0 - 0.08, ur.doorTopY, ur.z0, ur.doorX1 + 0.08, ur.doorTopY + 0.08, ur.z0 + 0.035, "detail");
  kit.box("clay", ur.doorX0 + 0.01, envelope.upperFloorY, ur.z0 - 0.09, ur.doorX1 - 0.01, ur.doorTopY - 0.01, ur.z0 - 0.045, "furniture");

  // ---- Glazing Systems (Physical 3D Glass + Mullions + Crisp Reflections) ----
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
    // Outer perimeter frame
    kit.box("clay", xA, y0, zEnd, xB, y0 + frameT, zStart, "structure");
    kit.box("clay", xA, y1 - frameT, zEnd, xB, y1, zStart, "structure");

    const spanZ = zEnd - zStart;
    for (let i = 0; i <= bays; i++) {
      const mz = zStart + (spanZ * i) / bays;
      const mw = i === 0 || i === bays ? frameT : 0.055;
      kit.box("clay", xA, y0 + frameT, mz - mw / 2, xB, y1 - frameT, mz + mw / 2, "structure");
    }
    // Inner casement step & physical glass pane per bay
    for (let i = 0; i < bays; i++) {
      const bz0 = zStart + (spanZ * i) / bays - 0.032;
      const bz1 = zStart + (spanZ * (i + 1)) / bays + 0.032;
      const py0 = y0 + frameT;
      const py1 = y1 - frameT;
      kit.box("glass", wallX - 0.009, py0, bz1, wallX + 0.009, py1, bz0, "detail");

      if (addGlints) {
        const midZ = (bz0 + bz1) / 2;
        const gx = wallX + 0.014;
        kit.segment("glassGlint", gx, py0 + 0.42, midZ + 0.28, gx, py0 + 1.18, midZ - 0.16);
        kit.segment("glassGlint", gx, py0 + 0.72, midZ + 0.34, gx, py0 + 1.56, midZ - 0.14);
      }
    }
  };

  // West tall ground-floor windows + upper sunlight clerestory + East upper windows
  addGlazedWindowBank(-hw - extT / 2, gw.zStart, gw.zEnd, gw.sillY, gw.headY, gw.bays, true);
  addGlazedWindowBank(-hw - extT / 2, cw.zStart, cw.zEnd, cw.sillY, cw.headY, 2, false);
  addGlazedWindowBank(hw + extT / 2, ew.zStart, ew.zEnd, ew.sillY, ew.headY, ew.bays, false);

  // Left rear alcove side-lite glass panel
  kit.box("clay", lp.pierX0 - 0.01, 0.94, -11.55, lp.pierX1 + 0.01, 0.99, -10.1, "detail");
  kit.box("clay", lp.pierX0 - 0.01, 2.81, -11.55, lp.pierX1 + 0.01, 2.86, -10.1, "detail");
  kit.box("glass", (lp.pierX0 + lp.pierX1) / 2 - 0.008, 0.99, -11.53, (lp.pierX0 + lp.pierX1) / 2 + 0.008, 2.81, -10.12, "detail");

  // Upper-Left Balcony Glass Railing
  {
    const rx = leftWing.railingX;
    const ry0 = envelope.upperFloorY;
    const ry1 = ry0 + leftWing.railingHeight;
    const rz0 = leftWing.railingZ0;
    const rz1 = leftWing.railingZ1;
    // Base shoe & continuous top handrail
    kit.box("clay", rx - 0.032, ry0, rz1, rx + 0.032, ry0 + 0.075, rz0, "structure");
    kit.box("clay", rx - 0.034, ry1 - 0.052, rz1, rx + 0.034, ry1, rz0, "structure");

    const bays = leftWing.railingBays;
    for (let i = 0; i <= bays; i++) {
      const pz = rz0 + ((rz1 - rz0) * i) / bays;
      kit.box("clay", rx - 0.026, ry0 + 0.075, pz - 0.026, rx + 0.026, ry1 - 0.052, pz + 0.026, "furniture");
      if (i < bays) {
        const nz = rz0 + ((rz1 - rz0) * (i + 1)) / bays;
        kit.box("glass", rx - 0.008, ry0 + 0.078, nz + 0.028, rx + 0.008, ry1 - 0.055, pz - 0.028, "detail");
      }
    }
  }

  // Upper-Right Full-Height Framed Glass Partition Wall (Y = 3.48 -> 6.60 m)
  {
    const gp = rightWing.glassPartition;
    const gx = gp.x;
    const gy0 = envelope.upperFloorY;
    const gy1 = ceilY;
    const gt = gp.transomY;
    // Bottom sill, middle railing-height transom, and ceiling header track
    kit.box("clay", gx - 0.035, gy0, gp.z1, gx + 0.035, gy0 + 0.065, gp.z0, "structure");
    kit.box("clay", gx - 0.035, gt - 0.032, gp.z1, gx + 0.035, gt + 0.032, gp.z0, "structure");
    kit.box("clay", gx - 0.035, gy1 - 0.06, gp.z1, gx + 0.035, gy1, gp.z0, "structure");

    for (let i = 0; i <= gp.bays; i++) {
      const mz = gp.z0 + ((gp.z1 - gp.z0) * i) / gp.bays;
      kit.box("clay", gx - 0.032, gy0 + 0.065, mz - 0.028, gx + 0.032, gy1 - 0.06, mz + 0.028, "structure");
      if (i < gp.bays) {
        const nz = gp.z0 + ((gp.z1 - gp.z0) * (i + 1)) / gp.bays;
        // Lower glass panel
        kit.box("glass", gx - 0.009, gy0 + 0.068, nz + 0.03, gx + 0.009, gt - 0.034, mz - 0.03, "detail");
        // Upper tall glass panel
        kit.box("glass", gx - 0.009, gt + 0.034, nz + 0.03, gx + 0.009, gy1 - 0.062, mz - 0.03, "detail");
        if (i % 2 === 1) {
          const midZ = (mz + nz) / 2;
          const rx = gx - 0.015;
          kit.segment("glassGlint", rx, gt + 0.42, midZ + 0.22, rx, gt + 1.25, midZ - 0.18);
          kit.segment("glassGlint", rx, gt + 0.72, midZ + 0.26, rx, gt + 1.54, midZ - 0.14);
        }
      }
    }
  }

  // ---- Recessed Circular Ceiling Downlights under Left & Right Soffits ----
  const addDownlight = (lx: number, ly: number, lz: number) => {
    const bezel = new THREE.CylinderGeometry(0.088, 0.088, 0.014, 16);
    transformGeometry(bezel, lx, ly - 0.006, lz);
    kit.geo("clay", bezel, "detail", 28);
    const core = new THREE.CylinderGeometry(0.056, 0.056, 0.018, 16);
    transformGeometry(core, lx, ly - 0.008, lz);
    kit.geo("clay", core, "detail", 28);
  };
  for (const lz of leftWing.downlightZs) addDownlight(leftWing.downlightX, envelope.groundSoffitY, lz);
  for (const lz of rightWing.downlightZs) addDownlight(rightWing.downlightX, envelope.groundSoffitY, lz);

  // ---- Subtle Architectural Baseboard Trim & Floor Joint Grid ----
  const bh = envelope.baseboardH;
  kit.box("clay", -hw, 0, -depth, rightWing.slabX0, bh, -depth + 0.024, "detail");
  kit.box("clay", -hw, 0, -depth, -hw + 0.024, bh, 0, "detail");

  const grid = envelope.floorGridSize;
  const gridY = 0.002;
  for (let gx = -grid * 4; gx <= grid * 4 + 0.01; gx += grid) {
    if (gx <= -hw + 0.05 || gx >= hw - 0.05) continue;
    const zMin = -depth + 0.02;
    const zMax = envelope.frontApronZ - 0.05;
    // Trim grid lines cleanly around the right raised plinth
    if (gx > staircase.lowerLanding.x0 - 0.02) {
      kit.segment("floorGrid", gx, gridY, 0.02, gx, gridY, zMax);
    } else if (gx > rightWing.slabX0 - 0.02) {
      kit.segment("floorGrid", gx, gridY, staircase.lowerLanding.z1, gx, gridY, zMax);
    } else {
      kit.segment("floorGrid", gx, gridY, zMin, gx, gridY, zMax);
    }
  }
  for (let gz = envelope.frontApronZ - grid; gz >= -depth + 0.05; gz -= grid) {
    const xMax =
      gz > 0
        ? hw - 0.02
        : gz > staircase.lowerFlight.z0
          ? staircase.lowerLanding.x0
          : gz > staircase.lowerFlight.z1
            ? staircase.lowerFlight.xStart
            : rightWing.slabX0;
    kit.segment("floorGrid", -hw + 0.02, gridY, gz, xMax, gridY, gz);
  }

  // Upper-right mezzanine floor grid lines
  for (let gz = -1.15; gz >= -depth + 0.4; gz -= grid) {
    const xMax =
      gz < rightWing.stairwellZ0 && gz > rightWing.stairwellZ1
        ? rightWing.stairwellX0
        : rightWing.slabX1 - 0.02;
    kit.segment("floorGrid", rightWing.glassPartition.x + 0.04, envelope.upperFloorY + 0.002, gz, xMax, envelope.upperFloorY + 0.002, gz);
  }

  // ---- Register Walkable Surfaces & Architectural Colliders ----
  // Exterior entrance terrace + threshold
  collisionWorld.addSurface("entrance-apron", -hw + 0.25, -0.25, hw - 0.25, envelope.frontApronZ - 0.4, () => 0);
  // Main ground-floor atrium
  collisionWorld.addSurface("ground-atrium", -hw + 0.12, -depth + 0.12, rightWing.slabX0 - 0.02, 0.25, () => 0);
  // Ground floor strip in front of lower stairs (Z = -2.35..0, X = 1.18..2.50)
  collisionWorld.addSurface("ground-right-entry", 1.0, -2.35, staircase.lowerLanding.x0 - 0.02, 0.0, () => 0);

  // Upper-right mezzanine connected walkable zones (Y = 3.48 m)
  const uy = envelope.upperFloorY;
  collisionWorld.addSurface("upper-right-rear-landing", rightWing.glassPartition.x + 0.08, -depth + 0.12, hw - 0.12, rightWing.stairwellZ1 + 0.15, () => uy);
  collisionWorld.addSurface("upper-right-gallery", rightWing.glassPartition.x + 0.08, rightWing.stairwellZ1 - 0.1, rightWing.stairwellX0 - 0.08, rightWing.stairwellZ0 + 0.1, () => uy);
  collisionWorld.addSurface("upper-right-front-office", rightWing.glassPartition.x + 0.08, rightWing.stairwellZ0 - 0.1, hw - 0.12, -0.12, () => uy);

  // Perimeter wall colliders
  collisionWorld.addCollider("west-wall", -hw - extT, 0, -depth - extT, -hw, ceilY, extT);
  collisionWorld.addCollider("east-wall", hw, 0, -depth - extT, hw + extT, ceilY, extT);
  collisionWorld.addCollider("north-wall", -hw - extT, 0, -depth - extT, hw + extT, ceilY, -depth);
  collisionWorld.addCollider("south-wall-left", -hw - extT, 0, -0.05, -entrance.halfClearWidth, ceilY, extT + 0.05);
  collisionWorld.addCollider("south-wall-right", entrance.halfClearWidth, 0, -0.05, hw + extT, ceilY, extT + 0.05);
  collisionWorld.addCollider("south-wall-upper", -entrance.halfClearWidth, entrance.clearHeight, -0.05, entrance.halfClearWidth, ceilY, extT + 0.05);
  // Exterior apron perimeter bounds
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
    // Swing outward (+Z and outward ±X): left hinge (-X) rotates -angleRad, right hinge (+X) rotates +angleRad
    leftDoor.rotation.y = -angleRad;
    rightDoor.rotation.y = angleRad;

    const dyn: Collider3D[] = [];
    for (const side of [-1, 1] as const) {
      const hx = side * entrance.halfClearWidth;
      const hz = extT - 0.02;
      const rot = side === -1 ? -angleRad : angleRad;
      // Endpoint of leaf along local X
      const localEndX = side === -1 ? entrance.leafWidth : -entrance.leafWidth;
      const ex = hx + localEndX * Math.cos(rot);
      const ez = hz - localEndX * Math.sin(rot);
      // Approximate leaf with 3 tight segments so open doors block walking through the door slab while leaving the portal wide open
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
