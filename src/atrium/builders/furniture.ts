import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import {
  GeometryKit,
  RectSolid,
  type PrototypeData,
  bakePrototype,
  bevelPad,
  transformGeometry,
} from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Extrudes a 2D profile defined in the side (Z, Y) plane across width `widthX`
 * centered at X = 0, with smooth architectural bevels and proper outward normals.
 * Local profile coordinates: shape.x -> +Z (forward), shape.y -> +Y (up).
 */
function extrudeSideProfile(
  shape: THREE.Shape,
  widthX: number,
  bevel = 0.01,
  curveSegments = 10,
): THREE.BufferGeometry {
  const depth = Math.max(0.01, widthX - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  // Center along Z (extrusion depth) before rotating so shape.x -> +Z, shape.y -> +Y, depth -> X
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sculpted ergonomic 5-star caster swivel office task chair prototype
 * (centered at X=0, Z=0, casters resting cleanly on Y=0, facing +Z).
 */
function createSwivelChairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];

  // Central pneumatic gas-lift column, tapered collar, and base hub
  const hub = new THREE.CylinderGeometry(0.04, 0.048, 0.056, 14);
  hub.translate(0, 0.112, 0);
  parts.push(hub);

  const lowerStem = new THREE.CylinderGeometry(0.026, 0.03, 0.17, 14);
  lowerStem.translate(0, 0.22, 0);
  parts.push(lowerStem);

  const upperStem = new THREE.CylinderGeometry(0.02, 0.023, 0.15, 14);
  upperStem.translate(0, 0.35, 0);
  parts.push(upperStem);

  // 5-star tapered architectural caster legs + dual-wheel hooded casters resting on Y = 0
  const legRadius = 0.285;
  for (let i = 0; i < 5; i++) {
    const ang = (i * Math.PI * 2) / 5;
    const spoke = bevelPad(0.034, 0.024, legRadius, 0.008, 0.004, 4);
    spoke.rotateX(0.11);
    spoke.translate(0, 0.088, legRadius / 2);
    spoke.rotateY(ang);
    parts.push(spoke);

    const wheelX = Math.sin(ang) * (legRadius - 0.016);
    const wheelZ = Math.cos(ang) * (legRadius - 0.016);

    // Dual-wheel caster assembly
    const wheel = new THREE.CylinderGeometry(0.026, 0.026, 0.032, 14);
    wheel.rotateZ(Math.PI / 2);
    wheel.rotateY(ang);
    wheel.translate(wheelX, 0.026, wheelZ);
    parts.push(wheel);

    // Caster hood & vertical stem pin
    const hood = bevelPad(0.038, 0.018, 0.044, 0.01, 0.004, 4);
    hood.rotateY(ang);
    hood.translate(wheelX, 0.044, wheelZ);
    parts.push(hood);

    const pin = new THREE.CylinderGeometry(0.01, 0.01, 0.038, 10);
    pin.translate(wheelX, 0.068, wheelZ);
    parts.push(pin);
  }

  // Under-seat synchronized tilt mechanism housing (tucked cleanly beneath the seat shell)
  const mech = bevelPad(0.17, 0.042, 0.2, 0.016, 0.006, 4);
  mech.translate(0, 0.402, -0.01);
  parts.push(mech);

  // Sculpted continuous curved ergonomic chair shell (waterfall seat + lumbar curve + reclined back)
  // Shape coords: x = +Z (forward), y = +Y (up)
  const shellShape = new THREE.Shape();
  shellShape.moveTo(0.22, 0.44);
  shellShape.quadraticCurveTo(0.232, 0.468, 0.18, 0.478);
  shellShape.quadraticCurveTo(0.02, 0.476, -0.13, 0.482);
  shellShape.quadraticCurveTo(-0.185, 0.488, -0.195, 0.555);
  shellShape.quadraticCurveTo(-0.205, 0.70, -0.245, 0.895);
  shellShape.quadraticCurveTo(-0.258, 0.926, -0.282, 0.916);
  shellShape.quadraticCurveTo(-0.294, 0.905, -0.286, 0.875);
  shellShape.quadraticCurveTo(-0.248, 0.69, -0.236, 0.535);
  shellShape.quadraticCurveTo(-0.228, 0.442, -0.14, 0.436);
  shellShape.lineTo(0.185, 0.432);
  shellShape.quadraticCurveTo(0.215, 0.432, 0.22, 0.44);
  const shell = extrudeSideProfile(shellShape, 0.46, 0.009, 10);
  parts.push(shell);

  // Plush contoured inner seat cushion pad nestled on top of the shell
  const seatPad = bevelPad(0.41, 0.032, 0.36, 0.042, 0.009, 5);
  seatPad.translate(0, 0.468, 0.025);
  parts.push(seatPad);

  // Clean non-self-intersecting architectural C-loop armrests (outer profile clockwise, hollow-free sleek swept arm)
  const armShape = new THREE.Shape();
  armShape.moveTo(0.035, 0.452); // Seat side mount front
  armShape.lineTo(0.088, 0.595); // Swept front support rising
  armShape.quadraticCurveTo(0.108, 0.658, 0.055, 0.668); // Smooth front elbow curve
  armShape.lineTo(-0.155, 0.668); // Horizontal forearm pad top
  armShape.quadraticCurveTo(-0.202, 0.668, -0.214, 0.635); // Rear join into backrest
  armShape.lineTo(-0.214, 0.610);
  armShape.quadraticCurveTo(-0.185, 0.638, -0.145, 0.638); // Forearm pad underside
  armShape.lineTo(0.038, 0.638);
  armShape.quadraticCurveTo(0.068, 0.638, 0.052, 0.592); // Inner front leg curve
  armShape.lineTo(0.004, 0.452); // Seat side mount rear
  armShape.closePath();

  for (const side of [-1, 1] as const) {
    const arm = extrudeSideProfile(armShape, 0.034, 0.005, 8);
    arm.translate(side * 0.238, 0, 0);
    parts.push(arm);
  }

  return bakePrototype(parts, 28);
}

/**
 * Builds a sculpted modern lounge armchair prototype with gently sloped rounded arms,
 * angled backrest shell, plush cushions, and clean splayed legs (facing +Z).
 */
function createLoungeArmchairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];

  // 4 clean splayed tapered legs touching Y = 0
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = new THREE.CylinderGeometry(0.022, 0.013, 0.21, 10);
      leg.rotateZ(sx * 0.13);
      leg.rotateX(-sz * 0.13);
      leg.translate(sx * 0.31, 0.10, sz * 0.27);
      parts.push(leg);
    }
  }

  // Lower upholstered frame apron
  const base = bevelPad(0.78, 0.125, 0.72, 0.06, 0.014, 5);
  base.translate(0, 0.185, 0.01);
  parts.push(base);

  // Softly contoured sloped side arms (smooth rounded profile in YZ plane)
  const armProfile = new THREE.Shape();
  armProfile.moveTo(0.36, 0.21);
  armProfile.lineTo(0.36, 0.51);
  armProfile.quadraticCurveTo(0.355, 0.575, 0.27, 0.585);
  armProfile.lineTo(-0.18, 0.615);
  armProfile.quadraticCurveTo(-0.32, 0.625, -0.35, 0.53);
  armProfile.lineTo(-0.35, 0.21);
  armProfile.closePath();

  for (const side of [-1, 1] as const) {
    const arm = extrudeSideProfile(armProfile, 0.125, 0.014, 8);
    arm.translate(side * 0.34, 0, 0);
    parts.push(arm);
  }

  // Reclined wrap-around outer back shell
  const backProfile = new THREE.Shape();
  backProfile.moveTo(-0.21, 0.21);
  backProfile.lineTo(-0.24, 0.735);
  backProfile.quadraticCurveTo(-0.255, 0.795, -0.315, 0.785);
  backProfile.quadraticCurveTo(-0.365, 0.775, -0.36, 0.70);
  backProfile.lineTo(-0.34, 0.21);
  backProfile.closePath();
  const backShell = extrudeSideProfile(backProfile, 0.76, 0.016, 8);
  parts.push(backShell);

  // Plump softly beveled seat cushion
  const seat = bevelPad(0.56, 0.135, 0.57, 0.055, 0.018, 5);
  seat.translate(0, 0.30, 0.06);
  parts.push(seat);

  // Angled plush back cushion pillow nestled comfortably inside the shell
  const backCushion = bevelPad(0.55, 0.37, 0.135, 0.055, 0.018, 5);
  backCushion.rotateX(-0.19);
  backCushion.translate(0, 0.415, -0.155);
  parts.push(backCushion);

  return bakePrototype(parts, 30);
}

/**
 * Builds a sculpted modern 4-leg curved-shell collaborative meeting chair prototype (facing +Z).
 */
function createMeetingChairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];
  const seatH = 0.445;

  // 4 clean tapered splayed legs + under-seat mounting spider
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = new THREE.CylinderGeometry(0.017, 0.011, seatH + 0.01, 10);
      leg.rotateZ(sx * 0.095);
      leg.rotateX(-sz * 0.095);
      leg.translate(sx * 0.185, seatH / 2, sz * 0.185);
      parts.push(leg);
    }
  }

  // Under-seat structural cross cradle
  const underFrame = bevelPad(0.32, 0.024, 0.32, 0.03, 0.006, 4);
  underFrame.translate(0, seatH - 0.02, 0.0);
  parts.push(underFrame);

  // Continuous sculpted curved seat + ergonomic backrest shell (side profile in YZ plane)
  const shellShape = new THREE.Shape();
  shellShape.moveTo(0.21, seatH - 0.005);
  shellShape.quadraticCurveTo(0.222, seatH + 0.022, 0.17, seatH + 0.032);
  shellShape.quadraticCurveTo(0.01, seatH + 0.028, -0.13, seatH + 0.038);
  shellShape.quadraticCurveTo(-0.18, seatH + 0.048, -0.19, seatH + 0.11);
  shellShape.quadraticCurveTo(-0.205, seatH + 0.24, -0.235, seatH + 0.39);
  shellShape.quadraticCurveTo(-0.246, seatH + 0.415, -0.268, seatH + 0.408);
  shellShape.quadraticCurveTo(-0.28, seatH + 0.398, -0.272, seatH + 0.372);
  shellShape.quadraticCurveTo(-0.242, seatH + 0.225, -0.228, seatH + 0.09);
  shellShape.quadraticCurveTo(-0.218, seatH - 0.005, -0.135, seatH - 0.008);
  shellShape.lineTo(0.18, seatH - 0.01);
  shellShape.quadraticCurveTo(0.205, seatH - 0.01, 0.21, seatH - 0.005);

  const shell = extrudeSideProfile(shellShape, 0.45, 0.008, 10);
  parts.push(shell);

  return bakePrototype(parts, 28);
}

/**
 * Builds a properly hinged 3D open laptop prototype (base resting on Y=0,
 * hinge firmly connected at rear edge, open display facing +Z).
 */
function createLaptopPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];
  const w = 0.34;
  const d = 0.235;
  const baseH = 0.013;
  const screenH = 0.225;
  const screenT = 0.009;

  // Slim beveled chassis base
  const base = bevelPad(w, baseH, d, 0.014, 0.003, 5);
  parts.push(base);

  // Subtle recessed keyboard island & trackpad detail
  const keys = bevelPad(w - 0.044, 0.003, d * 0.46, 0.005, 0.001, 3);
  keys.translate(0, baseH - 0.0005, -0.024);
  parts.push(keys);

  const trackpad = bevelPad(0.105, 0.0025, 0.068, 0.005, 0.0008, 3);
  trackpad.translate(0, baseH - 0.0005, 0.062);
  parts.push(trackpad);

  // Cylindrical hinge clutch along rear edge connecting base and display
  const hingeZ = -d / 2 + 0.011;
  const hingeY = baseH;
  const hinge = new THREE.CylinderGeometry(0.0055, 0.0055, w * 0.72, 10);
  hinge.rotateZ(Math.PI / 2);
  hinge.translate(0, hingeY, hingeZ);
  parts.push(hinge);

  // Properly hinged angled display lid (bottom edge pivots cleanly right on the hinge barrel!)
  const screen = bevelPad(w, screenT, screenH, 0.012, 0.0025, 5);
  // Shift so local Z runs from 0 (bottom hinge edge) to +screenH (top edge)
  screen.translate(0, -screenT / 2, screenH / 2);
  // Rotate upward around the bottom hinge edge (X-axis) to ~104 deg open angle (facing +Z)
  screen.rotateX(-Math.PI / 2 - 0.24);
  // Place hinge pivot directly onto the rear clutch barrel
  screen.translate(0, hingeY, hingeZ);
  parts.push(screen);

  return bakePrototype(parts, 36);
}

function addWorkDesk(
  kit: GeometryKit,
  collisionWorld: CollisionWorld,
  tag: string,
  cx: number,
  y0: number,
  cz: number,
  widthX: number,
  lengthZ: number,
  height: number,
  includePedestal: boolean,
): void {
  const topT = 0.042;
  const legW = 0.052;
  const x0 = cx - widthX / 2;
  const x1 = cx + widthX / 2;
  const z0 = cz - lengthZ / 2;
  const z1 = cz + lengthZ / 2;

  // Smooth chamfered tabletop
  const top = bevelPad(widthX, topT, lengthZ, 0.018, 0.006, 5);
  transformGeometry(top, cx, y0 + height - topT, cz);
  kit.geo("clay", top, "furniture", 36);

  // Watertight structural leg + under-top apron frame (RectSolid eliminates all leg-to-apron overlap seams!)
  const legY1 = y0 + height - topT;
  const inset = 0.042;
  const frameSolid = new RectSolid();
  for (const lx of [x0 + inset, x1 - inset - legW]) {
    for (const lz of [z0 + inset, z1 - inset - legW]) {
      frameSolid.add(lx, y0, lz, lx + legW, legY1, lz + legW);
    }
  }
  // Recessed perimeter structural apron rails under tabletop
  const apronY0 = legY1 - 0.056;
  frameSolid.add(x0 + inset, apronY0, z0 + inset + 0.012, x1 - inset, legY1, z0 + inset + 0.042);
  frameSolid.add(x0 + inset, apronY0, z1 - inset - 0.042, x1 - inset, legY1, z1 - inset - 0.012);
  frameSolid.add(x0 + inset + 0.012, apronY0, z0 + inset, x0 + inset + 0.042, legY1, z1 - inset);
  frameSolid.add(x1 - inset - 0.042, apronY0, z0 + inset, x1 - inset - 0.012, legY1, z1 - inset);
  kit.solid("clay", frameSolid, "furniture");

  if (includePedestal) {
    const pedW = 0.42;
    const pedD = 0.54;
    const pedH = height - topT - 0.04;
    const px0 = cx - pedW / 2;
    const pz0 = cz - lengthZ / 2 + 0.16;
    const pedSolid = new RectSolid();
    pedSolid.add(px0 + 0.015, y0, pz0 + 0.015, px0 + pedW - 0.015, y0 + 0.035, pz0 + pedD - 0.015);
    pedSolid.add(px0, y0 + 0.035, pz0, px0 + pedW, y0 + 0.02 + pedH, pz0 + pedD);
    kit.solid("clay", pedSolid, "furniture");
    // Subtle drawer front reveals
    for (const dy of [0.24, 0.44]) {
      kit.segment("detail", px0 + 0.02, y0 + dy, pz0 + pedD + 0.002, px0 + pedW - 0.02, y0 + dy, pz0 + pedD + 0.002);
    }
  }

  kit.contactShadow(cx, y0 + 0.002, cz, widthX + 0.16, lengthZ + 0.16, 0.13);
  collisionWorld.addCollider(tag, x0 - 0.04, y0, z0 - 0.04, x1 + 0.04, y0 + height + 0.1, z1 + 0.04);
}

/**
 * Adds a refined architectural storage credenza with recessed toe-kick, beveled top,
 * and articulated cabinet doors.
 */
function addCredenza(
  kit: GeometryKit,
  collisionWorld: CollisionWorld,
  tag: string,
  x0: number,
  y0: number,
  z1: number,
  x1: number,
  h: number,
  z0: number,
  doorFace: "+z" | "-x",
  doors: number,
): void {
  const cabSolid = new RectSolid();
  if (doorFace === "+z") {
    cabSolid.add(x0 + 0.03, y0, z1, x1 - 0.03, y0 + 0.07, z0 - 0.04);
    cabSolid.add(x0, y0 + 0.07, z1, x1, y0 + h - 0.034, z0 - 0.018);
    const dw = (x1 - x0 - 0.035 * (doors + 1)) / doors;
    for (let i = 0; i < doors; i++) {
      const dx0 = x0 + 0.035 + i * (dw + 0.035);
      cabSolid.add(dx0, y0 + 0.095, z0 - 0.018, dx0 + dw, y0 + h - 0.052, z0);
    }
  } else {
    cabSolid.add(x0 + 0.04, y0, z1 + 0.03, x1, y0 + 0.065, z0 - 0.03);
    cabSolid.add(x0 + 0.018, y0 + 0.065, z1, x1, y0 + h - 0.034, z0);
    const dw = (z0 - z1 - 0.035 * (doors + 1)) / doors;
    for (let i = 0; i < doors; i++) {
      const dz0 = z1 + 0.035 + i * (dw + 0.035);
      cabSolid.add(x0, y0 + 0.09, dz0, x0 + 0.018, y0 + h - 0.052, dz0 + dw);
    }
  }
  kit.solid("clay", cabSolid, "furniture");

  const counter = bevelPad(x1 - x0 + 0.02, 0.034, Math.abs(z0 - z1) + 0.02, 0.01, 0.004, 4);
  transformGeometry(counter, (x0 + x1) / 2, y0 + h - 0.034, (z0 + z1) / 2);
  kit.geo("clay", counter, "furniture", 36);

  kit.contactShadow((x0 + x1) / 2, y0 + 0.002, (z0 + z1) / 2, x1 - x0 + 0.12, Math.abs(z0 - z1) + 0.12, 0.14);
  collisionWorld.addCollider(tag, x0, y0, z1, x1, y0 + h + 0.15, z0);
}

/**
 * Populates all ground-floor and upper-mezzanine desks, sculpted swivel chairs,
 * plush lounge armchairs, curved-shell meeting chairs, modern 2-seater loveseat sofa,
 * credenzas, floating shelves, books, blank frames, and ceramic vessels.
 */
export function buildFurniture(kit: GeometryKit, collisionWorld: CollisionWorld): void {
  const { furniture, leftWing, rightWing, envelope } = ATRIUM_CONFIG;

  const swivelChairProto = createSwivelChairPrototype();
  const loungeChairProto = createLoungeArmchairPrototype();
  const meetingChairProto = createMeetingChairPrototype();
  const laptopProto = createLaptopPrototype();

  // ---- 1. Left Ground-Floor Collaborative Desk, Laptop & 3 Sculpted Swivel Chairs ----
  const ld = furniture.leftDesk;
  addWorkDesk(
    kit,
    collisionWorld,
    "left-work-desk",
    ld.cx,
    0,
    ld.cz,
    ld.widthX,
    ld.lengthZ,
    ld.height,
    true,
  );
  // Properly hinged open 3D laptop + sleek notebook on the left desk
  kit.stamp("clay", laptopProto, ld.cx + 0.06, ld.height, ld.cz + 0.16, Math.PI * 0.48, "detail");
  const pad = bevelPad(0.22, 0.012, 0.28, 0.008, 0.003, 4);
  transformGeometry(pad, ld.cx + 0.14, ld.height, ld.cz - 0.30, 0.12);
  kit.geo("clay", pad, "detail", 34);

  const leftDeskChairs = [
    { id: "left-desk-chair-w1", x: ld.cx - 0.72, z: ld.cz + 0.48, yaw: Math.PI * 0.44 },
    { id: "left-desk-chair-w2", x: ld.cx - 0.72, z: ld.cz - 0.48, yaw: Math.PI * 0.54 },
    { id: "left-desk-chair-e1", x: ld.cx + 0.74, z: ld.cz + 0.24, yaw: -Math.PI * 0.56 },
  ];
  for (const ch of leftDeskChairs) {
    kit.stamp("clay", swivelChairProto, ch.x, 0, ch.z, ch.yaw, "furniture");
    kit.contactShadow(ch.x, 0.002, ch.z, 0.60, 0.60, 0.12);
    collisionWorld.addCollider(ch.id, ch.x - 0.28, 0, ch.z - 0.28, ch.x + 0.28, 0.98, ch.z + 0.28);
  }

  // ---- 2. Back-Left Built-In Credenza, Floating Shelves, Books & Blank Framed Panels ----
  {
    const alc = leftWing.rearAlcove;
    const x0 = alc.credenzaX0;
    const x1 = alc.credenzaX1;
    const z0 = alc.credenzaZ0;
    const z1 = alc.credenzaZ1;
    const h = alc.credenzaH;

    addCredenza(kit, collisionWorld, "left-credenza", x0, 0, z1, x1, h, z0, "+z", 3);

    // Two floating wall shelves above credenza
    const shelfX0 = x0 + 0.06;
    const shelfX1 = x1 - 0.06;
    const shelfZ1 = z1;
    const shelfZ0 = z1 + 0.34;
    for (const sy of [alc.shelfY1, alc.shelfY2]) {
      kit.box("clay", shelfX0, sy, shelfZ1, shelfX1, sy + 0.032, shelfZ0, "furniture");
    }

    // Lower shelf: row of 5 upright books + 1 leaning book on left, 3 horizontal stacked books on right
    const bookY = alc.shelfY1 + 0.032;
    for (let b = 0; b < 5; b++) {
      const bx = shelfX0 + 0.14 + b * 0.042;
      const bh = 0.23 + (b % 3) * 0.022;
      kit.box("clay", bx, bookY, shelfZ1 + 0.05, bx + 0.034, bookY + bh, shelfZ1 + 0.25, "detail");
    }
    const leanBook = bevelPad(0.034, 0.24, 0.2, 0.004, 0.002, 3);
    leanBook.rotateZ(-0.28);
    transformGeometry(leanBook, shelfX0 + 0.4, bookY + 0.01, shelfZ1 + 0.15);
    kit.geo("clay", leanBook, "detail", 34);

    for (let s = 0; s < 3; s++) {
      const w = 0.26 - s * 0.025;
      kit.box(
        "clay",
        shelfX1 - 0.42 + s * 0.012,
        bookY + s * 0.034,
        shelfZ1 + 0.07,
        shelfX1 - 0.42 + s * 0.012 + w,
        bookY + (s + 1) * 0.034,
        shelfZ1 + 0.26,
        "detail",
      );
    }

    // Upper shelf: two blank recessed architectural art frames (strictly zero text/logos!)
    const topShelfY = alc.shelfY2 + 0.032;
    const addBlankFrame = (fx: number, fz: number, fw: number, fh: number) => {
      const outer = bevelPad(fw, fh, 0.026, 0.006, 0.003, 4);
      outer.translate(0, 0, 0);
      outer.rotateX(-0.11);
      transformGeometry(outer, fx, topShelfY, fz);
      kit.geo("clay", outer, "detail", 34);

      const matBoard = bevelPad(fw - 0.056, fh - 0.056, 0.01, 0.004, 0.002, 3);
      matBoard.translate(0, 0.028, 0.012);
      matBoard.rotateX(-0.11);
      transformGeometry(matBoard, fx, topShelfY, fz);
      kit.geo("clay", matBoard, "detail", 34);
    };
    addBlankFrame(shelfX1 - 0.56, shelfZ1 + 0.11, 0.28, 0.34);
    addBlankFrame(shelfX1 - 0.28, shelfZ1 + 0.15, 0.24, 0.27);
  }

  // ---- 3. Center-Back Lounge Seating Group (2 Sculpted Lounge Armchairs + Round Side Table) ----
  {
    const { leftChair, rightChair, sideTable } = furniture.lounge;
    for (const [id, ch] of [
      ["lounge-chair-left", leftChair],
      ["lounge-chair-right", rightChair],
    ] as const) {
      kit.stamp("clay", loungeChairProto, ch.x, 0, ch.z, ch.yaw, "furniture");
      kit.contactShadow(ch.x, 0.002, ch.z, 0.86, 0.82, 0.13);
      collisionWorld.addCollider(id, ch.x - 0.42, 0, ch.z - 0.4, ch.x + 0.42, 0.86, ch.z + 0.4);
    }

    // Refined round modern side table with chamfered Lathe top profile + 3 splayed tapered legs
    const r = sideTable.radius;
    const topPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(r - 0.014, 0.0),
      new THREE.Vector2(r, 0.008),
      new THREE.Vector2(r, 0.026),
      new THREE.Vector2(r - 0.010, 0.032),
      new THREE.Vector2(0.0, 0.032),
    ];
    const top = new THREE.LatheGeometry(topPts, 28);
    transformGeometry(top, sideTable.x, sideTable.height - 0.032, sideTable.z);
    kit.geo("clay", top, "furniture", 38);

    // Subtle recessed under-top hub ring
    const underHub = new THREE.CylinderGeometry(r * 0.46, r * 0.46, 0.02, 20);
    transformGeometry(underHub, sideTable.x, sideTable.height - 0.042, sideTable.z);
    kit.geo("clay", underHub, "detail", 40);

    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3 + 0.3;
      const leg = new THREE.CylinderGeometry(0.015, 0.010, sideTable.height - 0.03, 12);
      leg.rotateZ(0.14);
      leg.translate(r * 0.48, (sideTable.height - 0.03) / 2, 0);
      leg.rotateY(ang);
      transformGeometry(leg, sideTable.x, 0, sideTable.z);
      kit.geo("clay", leg, "detail", 44);
    }
    kit.contactShadow(sideTable.x, 0.002, sideTable.z, r * 2.1, r * 2.1, 0.12);
    collisionWorld.addCollider(
      "lounge-side-table",
      sideTable.x - r,
      0,
      sideTable.z - r,
      sideTable.x + r,
      sideTable.height,
      sideTable.z + r,
    );
  }

  // ---- 4. Center-Right Meeting Table, 2 Curved-Shell Chairs, Modern 2-Seater Loveseat & 2 Laptops ----
  {
    const mt = furniture.meeting;
    addWorkDesk(
      kit,
      collisionWorld,
      "right-meeting-table",
      mt.cx,
      0,
      mt.cz,
      mt.widthX,
      mt.lengthZ,
      mt.height,
      false,
    );
    // Two properly hinged open 3D laptops on meeting table
    kit.stamp("clay", laptopProto, mt.cx - 0.04, mt.height, mt.cz + 0.32, -Math.PI * 0.52, "detail");
    kit.stamp("clay", laptopProto, mt.cx + 0.05, mt.height, mt.cz - 0.32, Math.PI * 0.46, "detail");

    // Two sculpted 4-leg curved-shell side chairs on West (-X) side facing +X
    for (const [idx, dz] of [0.42, -0.42].entries()) {
      const cx = mt.cx - mt.widthX / 2 - 0.26;
      const cz = mt.cz + dz;
      kit.stamp("clay", meetingChairProto, cx, 0, cz, Math.PI * 0.48 + (idx === 0 ? 0.06 : -0.05), "furniture");
      kit.contactShadow(cx, 0.002, cz, 0.50, 0.50, 0.12);
      collisionWorld.addCollider(`meeting-chair-${idx}`, cx - 0.24, 0, cz - 0.24, cx + 0.24, 0.88, cz + 0.24);
    }

    // Refined 2-Seater Modern Architectural Loveseat Sofa on East (+X) side facing -X
    const bx = mt.benchX;
    const bz = mt.cz;
    const benchLen = 1.66;
    const benchD = 0.66;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const leg = new THREE.CylinderGeometry(0.02, 0.013, 0.17, 12);
        leg.rotateZ(sx * 0.08);
        leg.rotateX(-sz * 0.06);
        transformGeometry(leg, bx + sx * (benchD / 2 - 0.085), 0.085, bz + sz * (benchLen / 2 - 0.10));
        kit.geo("clay", leg, "detail", 44);
      }
    }

    // Sculpted base deck
    const benchDeck = bevelPad(benchD, 0.125, benchLen, 0.045, 0.018, 5);
    transformGeometry(benchDeck, bx, 0.165, bz);
    kit.geo("clay", benchDeck, "furniture", 38);

    // Two plump beveled seat cushions
    for (const sz of [-0.385, 0.385]) {
      const cushion = bevelPad(benchD - 0.16, 0.125, 0.74, 0.05, 0.022, 6);
      transformGeometry(cushion, bx - 0.055, 0.285, bz + sz);
      kit.geo("clay", cushion, "furniture", 40);
    }

    // Gently angled full-length outer backrest shell
    const backShell = bevelPad(0.12, 0.49, benchLen, 0.045, 0.018, 5);
    backShell.rotateZ(-0.12);
    transformGeometry(backShell, bx + benchD / 2 - 0.085, 0.28, bz);
    kit.geo("clay", backShell, "furniture", 40);

    // Two plush angled back cushions
    for (const sz of [-0.385, 0.385]) {
      const backPillow = bevelPad(0.115, 0.36, 0.73, 0.05, 0.022, 6);
      backPillow.rotateZ(-0.17);
      transformGeometry(backPillow, bx + benchD / 2 - 0.165, 0.39, bz + sz);
      kit.geo("clay", backPillow, "furniture", 42);
    }

    // Sculpted slim curved end arms
    for (const sz of [-1, 1] as const) {
      const arm = bevelPad(benchD - 0.04, 0.29, 0.092, 0.036, 0.016, 5);
      transformGeometry(arm, bx, 0.28, bz + sz * (benchLen / 2 - 0.048));
      kit.geo("clay", arm, "furniture", 38);
    }

    kit.contactShadow(bx, 0.002, bz, benchD + 0.14, benchLen + 0.14, 0.14);
    collisionWorld.addCollider(
      "meeting-bench-sofa",
      bx - benchD / 2,
      0,
      bz - benchLen / 2,
      bx + benchD / 2,
      0.86,
      bz + benchLen / 2,
    );
  }

  // ---- 5. Right Shelving Alcove Cube, Floating Shelves & Ceramic Vessels ----
  {
    const rc = furniture.rightNicheCube;
    const x0 = rc.cx - rc.widthX / 2;
    const x1 = rc.cx + rc.widthX / 2;
    const z0 = rc.cz + rc.depthZ / 2;
    const z1 = rc.cz - rc.depthZ / 2;
    const cubeSolid = new RectSolid();
    cubeSolid.add(x0 + 0.015, rc.y0, z1 + 0.015, x1 - 0.015, rc.y0 + 0.03, z0 - 0.015);
    cubeSolid.add(x0, rc.y0 + 0.03, z1, x1, rc.y0 + rc.height, z0);
    kit.solid("clay", cubeSolid, "furniture", (_x0, ey0, _z0, _x1, ey1) => !(ey0 <= rc.y0 + 0.001 && ey1 <= rc.y0 + 0.001));
    kit.segment("detail", x0, rc.y0 + rc.height - 0.06, z0 + 0.002, x0, rc.y0 + rc.height - 0.06, z1 - 0.002);
    kit.segment("detail", x0, rc.y0 + rc.height - 0.06, z0 + 0.002, x1, rc.y0 + rc.height - 0.06, z0 + 0.002);
    kit.contactShadow(rc.cx, rc.y0 + 0.002, rc.cz, rc.widthX + 0.10, rc.depthZ + 0.10, 0.12);

    // Two floating shelves mounted on right niche wall (X = rightWing.nicheWallX0)
    const sx1 = rightWing.nicheWallX0;
    const sx0 = sx1 - 0.34;
    const sz0 = -5.32;
    const sz1 = -7.28;
    for (const sy of [rightWing.shelfY1, rightWing.shelfY2]) {
      kit.box("clay", sx0, sy, sz1, sx1, sy + 0.032, sz0, "furniture");
    }

    // Sculpted Lathe ceramic vessels on lower right shelf
    const yS1 = rightWing.shelfY1 + 0.032;
    const vase1Pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.055, 0.0),
      new THREE.Vector2(0.082, 0.09),
      new THREE.Vector2(0.068, 0.2),
      new THREE.Vector2(0.036, 0.26),
      new THREE.Vector2(0.044, 0.29),
    ];
    const vase1 = new THREE.LatheGeometry(vase1Pts, 18);
    transformGeometry(vase1, sx0 + 0.17, yS1, -6.72);
    kit.geo("clay", vase1, "detail", 36);

    const vase2Pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.05, 0.0),
      new THREE.Vector2(0.075, 0.07),
      new THREE.Vector2(0.048, 0.16),
    ];
    const vase2 = new THREE.LatheGeometry(vase2Pts, 18);
    transformGeometry(vase2, sx0 + 0.17, yS1, -6.32);
    kit.geo("clay", vase2, "detail", 36);

    const bowl = new THREE.CylinderGeometry(0.09, 0.055, 0.065, 18);
    transformGeometry(bowl, sx0 + 0.17, yS1 + 0.0325, -5.78);
    kit.geo("clay", bowl, "detail", 36);

    // Minimalist horizontal book volumes on upper right shelf next to small plant
    const yS2 = rightWing.shelfY2 + 0.032;
    kit.box("clay", sx0 + 0.06, yS2, -6.78, sx0 + 0.28, yS2 + 0.035, -6.42, "detail");
    kit.box("clay", sx0 + 0.08, yS2 + 0.035, -6.74, sx0 + 0.26, yS2 + 0.068, -6.46, "detail");
  }

  // ---- 6. Upper-Right Mezzanine Desks, Swivel Chairs & Refined Low Credenza (walkable at Y = 3.48 m!) ----
  for (const [idx, ud] of furniture.upperDesks.entries()) {
    addWorkDesk(
      kit,
      collisionWorld,
      `upper-right-desk-${idx}`,
      ud.cx,
      ud.y0,
      ud.cz,
      ud.widthX,
      ud.lengthZ,
      0.74,
      true,
    );
    kit.stamp("clay", laptopProto, ud.cx - 0.05, ud.y0 + 0.74, ud.cz, Math.PI * 0.5, "detail");
    const chX = ud.cx + ud.chairSide * 0.52;
    kit.stamp("clay", swivelChairProto, chX, ud.y0, ud.cz, -Math.PI * 0.5, "furniture");
    kit.contactShadow(chX, ud.y0 + 0.002, ud.cz, 0.58, 0.58, 0.11);
    collisionWorld.addCollider(
      `upper-right-chair-${idx}`,
      chX - 0.26,
      ud.y0,
      ud.cz - 0.26,
      chX + 0.26,
      ud.y0 + 0.96,
      ud.cz + 0.26,
    );
  }

  // Refined architectural low storage credenza visible cleanly through upper-right glass partition
  addCredenza(
    kit,
    collisionWorld,
    "upper-right-credenza",
    2.58,
    envelope.upperFloorY,
    -4.42,
    3.02,
    0.72,
    -3.48,
    "-x",
    2,
  );

  // ---- 7. Upper-Left Enclosed Office Interior Desk & Swivel Chair (for complete 360° Orbit inspection) ----
  {
    const uy = envelope.upperFloorY;
    addWorkDesk(kit, collisionWorld, "upper-left-office-desk", -4.15, uy, -12.15, 0.76, 1.38, 0.74, false);
    kit.stamp("clay", laptopProto, -4.15, uy + 0.74, -12.15, Math.PI * 0.5, "detail");
    kit.stamp("clay", swivelChairProto, -3.55, uy, -12.15, -Math.PI * 0.5, "furniture");
  }
}
