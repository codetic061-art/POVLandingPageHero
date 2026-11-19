import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import {
  GeometryKit,
  type PrototypeData,
  bakePrototype,
  bevelPad,
  transformGeometry,
} from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Builds a reusable 5-star caster swivel office task chair prototype in local coordinates
 * (centered at X=0, Z=0, base touching Y=0, facing +Z).
 */
function createSwivelChairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];

  // Central pneumatic column & base hub
  const hub = new THREE.CylinderGeometry(0.038, 0.044, 0.06, 12);
  hub.translate(0, 0.11, 0);
  parts.push(hub);

  const stem = new THREE.CylinderGeometry(0.024, 0.028, 0.3, 12);
  stem.translate(0, 0.28, 0);
  parts.push(stem);

  // 5-star caster legs + 5 dual-wheel cylindrical casters touching Y = 0
  const legRadius = 0.28;
  for (let i = 0; i < 5; i++) {
    const ang = (i * Math.PI * 2) / 5;
    const spoke = bevelPad(0.034, 0.026, legRadius, 0.008, 0.004);
    spoke.rotateX(0.11);
    spoke.translate(0, 0.085, legRadius / 2);
    spoke.rotateY(ang);
    parts.push(spoke);

    const wheelX = Math.sin(ang) * (legRadius - 0.015);
    const wheelZ = Math.cos(ang) * (legRadius - 0.015);
    const caster = new THREE.CylinderGeometry(0.026, 0.026, 0.028, 12);
    caster.rotateZ(Math.PI / 2);
    caster.rotateY(ang);
    caster.translate(wheelX, 0.026, wheelZ);
    parts.push(caster);

    const pin = new THREE.CylinderGeometry(0.01, 0.01, 0.045, 8);
    pin.translate(wheelX, 0.058, wheelZ);
    parts.push(pin);
  }

  // Under-seat tilt mechanism box
  const mech = bevelPad(0.16, 0.042, 0.18, 0.015, 0.006);
  mech.translate(0, 0.41, -0.01);
  parts.push(mech);

  // Contoured upholstered seat cushion
  const seat = bevelPad(0.48, 0.064, 0.46, 0.055, 0.016);
  seat.translate(0, 0.45, 0.02);
  parts.push(seat);

  // Spine upright & sculpted ergonomic backrest
  const spine = bevelPad(0.07, 0.26, 0.036, 0.012, 0.005);
  spine.rotateX(-0.14);
  spine.translate(0, 0.47, -0.21);
  parts.push(spine);

  const back = bevelPad(0.45, 0.44, 0.056, 0.06, 0.016);
  back.rotateX(-0.13);
  back.translate(0, 0.56, -0.2);
  parts.push(back);

  // Sleek loop armrests on left & right
  for (const side of [-1, 1] as const) {
    const riser = bevelPad(0.028, 0.19, 0.042, 0.008, 0.004);
    riser.translate(side * 0.245, 0.47, -0.04);
    parts.push(riser);

    const armPad = bevelPad(0.048, 0.028, 0.25, 0.014, 0.006);
    armPad.translate(side * 0.245, 0.655, 0.01);
    parts.push(armPad);
  }

  return bakePrototype(parts, 34);
}

/**
 * Builds a sculpted modern lounge armchair prototype (centered at X=0, Z=0, facing +Z).
 */
function createLoungeArmchairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];

  // 4 splayed tapered legs
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = new THREE.CylinderGeometry(0.022, 0.014, 0.2, 10);
      leg.rotateZ(sx * 0.14);
      leg.rotateX(-sz * 0.14);
      leg.translate(sx * 0.31, 0.095, sz * 0.28);
      parts.push(leg);
    }
  }

  // Lower upholstered frame
  const base = bevelPad(0.8, 0.14, 0.74, 0.07, 0.02);
  base.translate(0, 0.18, 0);
  parts.push(base);

  // Plush seat cushion
  const seat = bevelPad(0.56, 0.13, 0.56, 0.06, 0.022);
  seat.translate(0, 0.31, 0.05);
  parts.push(seat);

  // Curved side bolster arms
  for (const side of [-1, 1] as const) {
    const arm = bevelPad(0.14, 0.38, 0.7, 0.055, 0.022);
    arm.translate(side * 0.34, 0.24, 0.01);
    parts.push(arm);
  }

  // Wrap-around back shell & angled back cushion
  const backShell = bevelPad(0.78, 0.5, 0.14, 0.06, 0.02);
  backShell.translate(0, 0.26, -0.3);
  parts.push(backShell);

  const backCushion = bevelPad(0.54, 0.36, 0.13, 0.055, 0.024);
  backCushion.rotateX(-0.18);
  backCushion.translate(0, 0.41, -0.19);
  parts.push(backCushion);

  return bakePrototype(parts, 36);
}

/**
 * Builds a 4-leg contoured collaborative meeting chair prototype (facing +Z).
 */
function createMeetingChairPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];
  const seatH = 0.45;

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = new THREE.CylinderGeometry(0.017, 0.012, seatH + 0.01, 10);
      leg.rotateZ(sx * 0.1);
      leg.rotateX(-sz * 0.1);
      leg.translate(sx * 0.19, seatH / 2, sz * 0.19);
      parts.push(leg);
    }
  }

  const seat = bevelPad(0.45, 0.052, 0.44, 0.05, 0.014);
  seat.translate(0, seatH, 0.01);
  parts.push(seat);

  const back = bevelPad(0.43, 0.37, 0.048, 0.055, 0.015);
  back.rotateX(-0.12);
  back.translate(0, seatH + 0.04, -0.19);
  parts.push(back);

  return bakePrototype(parts, 35);
}

/**
 * Builds a reusable open 3D laptop prototype (centered at X=0, Z=0, base on Y=0, screen facing +Z).
 */
function createLaptopPrototype(): PrototypeData {
  const parts: THREE.BufferGeometry[] = [];
  const w = 0.34;
  const d = 0.24;

  const base = bevelPad(w, 0.012, d, 0.014, 0.003);
  parts.push(base);

  // Subtle keyboard recess pad
  const keys = bevelPad(w - 0.04, 0.004, d * 0.52, 0.006, 0.001);
  keys.translate(0, 0.011, -0.02);
  parts.push(keys);

  // Open angled display lid
  const screen = bevelPad(w, 0.23, 0.01, 0.012, 0.003);
  screen.translate(0, 0.115, 0);
  screen.rotateX(-0.24);
  screen.translate(0, 0.01, -d / 2 + 0.01);
  parts.push(screen);

  return bakePrototype(parts, 30);
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
  const topT = 0.044;
  const legW = 0.056;
  const x0 = cx - widthX / 2;
  const x1 = cx + widthX / 2;
  const z0 = cz - lengthZ / 2;
  const z1 = cz + lengthZ / 2;

  // Chamfered tabletop
  const top = bevelPad(widthX, topT, lengthZ, 0.018, 0.006);
  transformGeometry(top, cx, y0 + height - topT, cz);
  kit.geo("clay", top, "furniture", 32);

  // 4 solid square architectural legs + recessed structural apron beams
  const legY1 = y0 + height - topT;
  const inset = 0.04;
  for (const lx of [x0 + inset, x1 - inset - legW]) {
    for (const lz of [z0 + inset, z1 - inset - legW]) {
      kit.box("clay", lx, y0, lz, lx + legW, legY1, lz + legW, "furniture");
    }
  }
  // Structural perimeter rails under top (visible from low angles)
  kit.box("clay", x0 + inset + legW, legY1 - 0.065, z0 + inset + 0.01, x1 - inset - legW, legY1, z0 + inset + 0.04, "detail");
  kit.box("clay", x0 + inset + legW, legY1 - 0.065, z1 - inset - 0.04, x1 - inset - legW, legY1, z1 - inset - 0.01, "detail");

  if (includePedestal) {
    const pedW = 0.42;
    const pedD = 0.54;
    const pedH = height - topT - 0.04;
    const px0 = cx - pedW / 2;
    const pz0 = cz - lengthZ / 2 + 0.16;
    kit.box("clay", px0, y0 + 0.02, pz0, px0 + pedW, y0 + 0.02 + pedH, pz0 + pedD, "furniture");
    // 3 drawer front reveals
    for (const dy of [0.22, 0.42]) {
      kit.segment("detail", px0 + 0.02, y0 + dy, pz0 + pedD + 0.002, px0 + pedW - 0.02, y0 + dy, pz0 + pedD + 0.002);
    }
  }

  kit.contactShadow(cx, y0 + 0.003, cz, widthX + 0.18, lengthZ + 0.18, 0.16);
  collisionWorld.addCollider(tag, x0 - 0.04, y0, z0 - 0.04, x1 + 0.04, y0 + height + 0.1, z1 + 0.04);
}

/**
 * Populates all ground-floor and upper-mezzanine desks, swivel chairs, lounge armchairs,
 * meeting table + bench sofa, built-in credenzas, floating shelves, books, frames, and vessels.
 */
export function buildFurniture(kit: GeometryKit, collisionWorld: CollisionWorld): void {
  const { furniture, leftWing, rightWing, envelope } = ATRIUM_CONFIG;

  const swivelChairProto = createSwivelChairPrototype();
  const loungeChairProto = createLoungeArmchairPrototype();
  const meetingChairProto = createMeetingChairPrototype();
  const laptopProto = createLaptopPrototype();

  // ---- 1. Left Ground-Floor Collaborative Desk, Laptop & 3 Swivel Chairs ----
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
  // Open 3D laptop + sleek notepad on the left desk
  kit.stamp("clay", laptopProto, ld.cx + 0.08, ld.height, ld.cz + 0.18, Math.PI * 0.48, "detail");
  const pad = bevelPad(0.22, 0.012, 0.28, 0.008, 0.003);
  transformGeometry(pad, ld.cx + 0.16, ld.height, ld.cz - 0.28, 0.12);
  kit.geo("clay", pad, "detail", 30);

  const leftDeskChairs = [
    { id: "left-desk-chair-w1", x: ld.cx - 0.72, z: ld.cz + 0.48, yaw: Math.PI * 0.44 },
    { id: "left-desk-chair-w2", x: ld.cx - 0.72, z: ld.cz - 0.48, yaw: Math.PI * 0.54 },
    { id: "left-desk-chair-e1", x: ld.cx + 0.74, z: ld.cz + 0.24, yaw: -Math.PI * 0.56 },
  ];
  for (const ch of leftDeskChairs) {
    kit.stamp("clay", swivelChairProto, ch.x, 0, ch.z, ch.yaw, "furniture");
    kit.contactShadow(ch.x, 0.003, ch.z, 0.62, 0.62, 0.14);
    collisionWorld.addCollider(ch.id, ch.x - 0.28, 0, ch.z - 0.28, ch.x + 0.28, 0.98, ch.z + 0.28);
  }

  // ---- 2. Back-Left Built-In Credenza, Floating Shelves, Books & Framed Panels ----
  {
    const alc = leftWing.rearAlcove;
    const x0 = alc.credenzaX0;
    const x1 = alc.credenzaX1;
    const z0 = alc.credenzaZ0; // -12.64 (front face)
    const z1 = alc.credenzaZ1; // -13.18 (against back wall)
    const h = alc.credenzaH;

    // Recessed toe-kick & main cabinet body
    kit.box("clay", x0 + 0.03, 0, z1, x1 - 0.03, 0.07, z0 - 0.04, "detail");
    kit.box("clay", x0, 0.07, z1, x1, h - 0.035, z0 - 0.02, "furniture");
    // Countertop slab
    const counter = bevelPad(x1 - x0 + 0.02, 0.036, Math.abs(z0 - z1) + 0.03, 0.01, 0.004);
    transformGeometry(counter, (x0 + x1) / 2, h - 0.036, (z0 + z1) / 2 + 0.01);
    kit.geo("clay", counter, "furniture", 32);

    // 3 articulated cabinet doors on +Z front face
    const doors = 3;
    const dw = (x1 - x0 - 0.04 * (doors + 1)) / doors;
    for (let i = 0; i < doors; i++) {
      const dx0 = x0 + 0.04 + i * (dw + 0.04);
      kit.box("clay", dx0, 0.1, z0 - 0.02, dx0 + dw, h - 0.06, z0, "detail");
    }
    kit.contactShadow((x0 + x1) / 2, 0.003, (z0 + z1) / 2, x1 - x0 + 0.12, 0.68, 0.18);
    collisionWorld.addCollider("left-credenza", x0, 0, z1, x1, h + 0.2, z0 + 0.04);

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
    const leanBook = bevelPad(0.034, 0.24, 0.2, 0.004, 0.002);
    leanBook.rotateZ(-0.28);
    transformGeometry(leanBook, shelfX0 + 0.4, bookY + 0.01, shelfZ1 + 0.15);
    kit.geo("clay", leanBook, "detail", 30);

    // Horizontal book stack on right side of lower shelf
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

    // Upper shelf: two blank architectural art frames on the right (zero text/logos!)
    const topShelfY = alc.shelfY2 + 0.032;
    const addBlankFrame = (fx: number, fz: number, fw: number, fh: number) => {
      const frame = new THREE.Group();
      const outer = bevelPad(fw, fh, 0.026, 0.006, 0.003);
      outer.translate(0, fh / 2, 0);
      outer.rotateX(-0.11);
      transformGeometry(outer, fx, topShelfY, fz);
      kit.geo("clay", outer, "detail", 30);

      const matBoard = bevelPad(fw - 0.06, fh - 0.06, 0.012, 0.004, 0.002);
      matBoard.translate(0, fh / 2, 0.01);
      matBoard.rotateX(-0.11);
      transformGeometry(matBoard, fx, topShelfY, fz);
      kit.geo("clay", matBoard, "detail", 30);
      void frame;
    };
    addBlankFrame(shelfX1 - 0.56, shelfZ1 + 0.11, 0.28, 0.34);
    addBlankFrame(shelfX1 - 0.28, shelfZ1 + 0.15, 0.24, 0.27);
  }

  // ---- 3. Center-Back Lounge Seating Group (2 Armchairs + Round Pedestal Side Table) ----
  {
    const { leftChair, rightChair, sideTable } = furniture.lounge;
    for (const [id, ch] of [
      ["lounge-chair-left", leftChair],
      ["lounge-chair-right", rightChair],
    ] as const) {
      kit.stamp("clay", loungeChairProto, ch.x, 0, ch.z, ch.yaw, "furniture");
      kit.contactShadow(ch.x, 0.003, ch.z, 0.88, 0.84, 0.16);
      collisionWorld.addCollider(id, ch.x - 0.42, 0, ch.z - 0.4, ch.x + 0.42, 0.86, ch.z + 0.4);
    }

    // Round modern side table between lounge chairs
    const top = new THREE.CylinderGeometry(sideTable.radius, sideTable.radius, 0.032, 24);
    transformGeometry(top, sideTable.x, sideTable.height - 0.016, sideTable.z);
    kit.geo("clay", top, "furniture", 32);

    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3 + 0.3;
      const leg = new THREE.CylinderGeometry(0.015, 0.012, sideTable.height - 0.02, 10);
      leg.rotateZ(0.14);
      leg.translate(sideTable.radius * 0.52, (sideTable.height - 0.02) / 2, 0);
      leg.rotateY(ang);
      transformGeometry(leg, sideTable.x, 0, sideTable.z);
      kit.geo("clay", leg, "detail", 34);
    }
    kit.contactShadow(sideTable.x, 0.003, sideTable.z, sideTable.radius * 2.2, sideTable.radius * 2.2, 0.14);
    collisionWorld.addCollider(
      "lounge-side-table",
      sideTable.x - sideTable.radius,
      0,
      sideTable.z - sideTable.radius,
      sideTable.x + sideTable.radius,
      sideTable.height,
      sideTable.z + sideTable.radius,
    );
  }

  // ---- 4. Center-Right Meeting Table, 2 Side Chairs, 2-Seater Bench Loveseat & 2 Laptops ----
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
    // Two open 3D laptops on meeting table
    kit.stamp("clay", laptopProto, mt.cx - 0.06, mt.height, mt.cz + 0.32, -Math.PI * 0.52, "detail");
    kit.stamp("clay", laptopProto, mt.cx + 0.06, mt.height, mt.cz - 0.32, Math.PI * 0.46, "detail");

    // Two 4-leg modern side chairs on West (-X) side facing +X
    for (const [idx, dz] of [0.42, -0.42].entries()) {
      const cx = mt.cx - mt.widthX / 2 - 0.24;
      const cz = mt.cz + dz;
      kit.stamp("clay", meetingChairProto, cx, 0, cz, Math.PI * 0.48 + (idx === 0 ? 0.06 : -0.05), "furniture");
      kit.contactShadow(cx, 0.003, cz, 0.52, 0.52, 0.14);
      collisionWorld.addCollider(`meeting-chair-${idx}`, cx - 0.24, 0, cz - 0.24, cx + 0.24, 0.88, cz + 0.24);
    }

    // 2-Seater Modern Bench / Loveseat Sofa on East (+X) side facing -X
    const bx = mt.benchX;
    const bz = mt.cz;
    const benchLen = 1.66;
    const benchD = 0.64;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const leg = new THREE.CylinderGeometry(0.02, 0.014, 0.16, 10);
        transformGeometry(leg, bx + sx * (benchD / 2 - 0.08), 0.08, bz + sz * (benchLen / 2 - 0.1));
        kit.geo("clay", leg, "detail", 35);
      }
    }
    const benchDeck = bevelPad(benchD, 0.14, benchLen, 0.04, 0.015);
    transformGeometry(benchDeck, bx, 0.16, bz);
    kit.geo("clay", benchDeck, "furniture", 34);

    // 2 seat cushions
    for (const sz of [-0.39, 0.39]) {
      const cushion = bevelPad(benchD - 0.14, 0.11, 0.74, 0.04, 0.016);
      transformGeometry(cushion, bx - 0.05, 0.3, bz + sz);
      kit.geo("clay", cushion, "furniture", 36);
    }
    // Structured full-length backrest & slim end arms
    const backrest = bevelPad(0.14, 0.46, benchLen, 0.04, 0.015);
    transformGeometry(backrest, bx + benchD / 2 - 0.07, 0.3, bz);
    kit.geo("clay", backrest, "furniture", 34);

    for (const sz of [-1, 1] as const) {
      const arm = bevelPad(benchD - 0.04, 0.26, 0.09, 0.03, 0.012);
      transformGeometry(arm, bx, 0.3, bz + sz * (benchLen / 2 - 0.045));
      kit.geo("clay", arm, "furniture", 34);
    }
    kit.contactShadow(bx, 0.003, bz, benchD + 0.14, benchLen + 0.14, 0.16);
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
    kit.box("clay", x0, rc.y0, z1, x1, rc.y0 + rc.height, z0, "furniture");
    // Crisp top lid reveal line
    kit.segment("detail", x0, rc.y0 + rc.height - 0.06, z0 + 0.002, x0, rc.y0 + rc.height - 0.06, z1 - 0.002);
    kit.segment("detail", x0, rc.y0 + rc.height - 0.06, z0 + 0.002, x1, rc.y0 + rc.height - 0.06, z0 + 0.002);
    kit.contactShadow(rc.cx, rc.y0 + 0.003, rc.cz, rc.widthX + 0.12, rc.depthZ + 0.12, 0.15);

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
    const vase1 = new THREE.LatheGeometry(vase1Pts, 16);
    transformGeometry(vase1, sx0 + 0.17, yS1, -6.72);
    kit.geo("clay", vase1, "detail", 32);

    const vase2Pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.05, 0.0),
      new THREE.Vector2(0.075, 0.07),
      new THREE.Vector2(0.048, 0.16),
    ];
    const vase2 = new THREE.LatheGeometry(vase2Pts, 16);
    transformGeometry(vase2, sx0 + 0.17, yS1, -6.32);
    kit.geo("clay", vase2, "detail", 32);

    const bowl = new THREE.CylinderGeometry(0.09, 0.055, 0.065, 16);
    transformGeometry(bowl, sx0 + 0.17, yS1 + 0.0325, -5.78);
    kit.geo("clay", bowl, "detail", 32);

    // Minimalist horizontal book volumes on upper right shelf next to small plant
    const yS2 = rightWing.shelfY2 + 0.032;
    kit.box("clay", sx0 + 0.06, yS2, -6.78, sx0 + 0.28, yS2 + 0.035, -6.42, "detail");
    kit.box("clay", sx0 + 0.08, yS2 + 0.035, -6.74, sx0 + 0.26, yS2 + 0.068, -6.46, "detail");
  }

  // ---- 6. Upper-Right Mezzanine Desks, Swivel Chairs & Credenzas (walkable at Y = 3.48 m!) ----
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
    kit.contactShadow(chX, ud.y0 + 0.003, ud.cz, 0.58, 0.58, 0.13);
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

  // Low architectural storage credenzas visible through upper-right glass partition
  kit.box("clay", 2.58, envelope.upperFloorY, -4.45, 3.05, envelope.upperFloorY + 0.78, -3.55, "furniture");
  collisionWorld.addCollider(
    "upper-right-credenza",
    2.58,
    envelope.upperFloorY,
    -4.45,
    3.05,
    envelope.upperFloorY + 0.85,
    -3.55,
  );

  // ---- 7. Upper-Left Enclosed Office Interior Desk & Chair (for complete 360° Orbit inspection) ----
  {
    const uy = envelope.upperFloorY;
    addWorkDesk(kit, collisionWorld, "upper-left-office-desk", -4.15, uy, -12.15, 0.76, 1.38, 0.74, false);
    kit.stamp("clay", swivelChairProto, -3.55, uy, -12.15, -Math.PI * 0.5, "furniture");
  }
}
