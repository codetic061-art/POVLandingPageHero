import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import { GeometryKit, RectSolid, bevelPad, transformGeometry } from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Creates a sloped rectangular-profile solid architectural handrail beam between two 3D points
 * so it has crisp dimensional faces, clean architectural outlines, and real shadow casting.
 */
function createSlopedBeamGeometry(
  start: THREE.Vector3,
  end: THREE.Vector3,
  widthX: number,
  heightY: number,
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  const geo = new THREE.BoxGeometry(widthX, heightY, length);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, -1),
    dir.clone().normalize(),
  );
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(mat);
  return geo;
}

/**
 * Models the complete two-flight grand architectural staircase:
 *   - Lower 4-step wide podium flight (Y = 0.00 -> 0.72 m) ascending in +X
 *   - Intermediate right landing (Y = 0.72 m) aligned cleanly with right wing datum
 *   - Upper 15-step flight (Y = 0.72 -> 3.48 m) ascending in -Z onto the upper mezzanine
 *   - Watertight RectSolid stair carriages, individual beveled treads & risers
 *   - Dimensional wall-mounted handrail, inner sloped handrail, and watertight glass balustrade
 *   - Continuous walkable ramp surfaces and safety colliders for First-Person mode
 */
export function buildStaircase(kit: GeometryKit, collisionWorld: CollisionWorld): void {
  const { staircase, rightWing, envelope } = ATRIUM_CONFIG;
  const lf = staircase.lowerFlight;
  const ll = staircase.lowerLanding;
  const uf = staircase.upperFlight;

  // ---- 1. Lower 4-Step Wide Podium Flight (Y = 0.00 -> 0.72 m, ascending +X) ----
  const treadH = 0.036;
  const nosing = 0.018;
  const lowerCore = new RectSolid();
  for (let i = 0; i < lf.treads; i++) {
    const sx0 = lf.xStart + i * lf.treadDepth;
    const sx1 = sx0 + lf.treadDepth;
    const yTop = (i + 1) * lf.riserHeight;
    // Solid full-depth riser & carriage block merged cleanly via RectSolid (zero internal step seams)
    lowerCore.add(sx0, 0, lf.z1, sx1, yTop - treadH, lf.z0);
  }
  kit.solid("clay", lowerCore, "structure");

  // Individual solid bullnose overhanging architectural treads for lower flight
  for (let i = 0; i < lf.treads; i++) {
    const sx0 = lf.xStart + i * lf.treadDepth;
    const sx1 = sx0 + lf.treadDepth;
    const yTop = (i + 1) * lf.riserHeight;
    const tread = bevelPad(lf.treadDepth + nosing, treadH, Math.abs(lf.z0 - lf.z1), 0.006, 0.004, 3);
    transformGeometry(
      tread,
      (sx0 + sx1) / 2 - nosing / 2,
      yTop - treadH,
      (lf.z0 + lf.z1) / 2,
    );
    kit.geo("clay", tread, "furniture", 36);
  }
  kit.contactShadow(
    lf.xStart - 0.05,
    0.002,
    (lf.z0 + lf.z1) / 2,
    0.24,
    Math.abs(lf.z0 - lf.z1) + 0.08,
    0.13,
  );

  // ---- 2. Upper 15-Step Main Flight (Y = 0.72 -> 3.48 m, ascending -Z) ----
  const treadT = 0.036;
  const stringerDrop = 0.30;
  const ufEndZ = uf.zStart - uf.treads * uf.treadDepth;

  const upperCore = new RectSolid();
  // Enclosed solid base chamber underneath the upper flight for a finished 360° underside
  upperCore.add(uf.x0, 0, ufEndZ - 0.14, uf.x1, ll.y, uf.zStart);

  for (let i = 0; i < uf.treads; i++) {
    const sz0 = uf.zStart - i * uf.treadDepth;
    const sz1 = sz0 - uf.treadDepth;
    const yPrev = ll.y + i * uf.riserHeight;
    const yTop = ll.y + (i + 1) * uf.riserHeight;
    const yUnderside = Math.max(ll.y, yPrev - stringerDrop);
    // Watertight stepped carriage/riser core (zero internal faces between adjacent steps)
    upperCore.add(uf.x0, yUnderside, sz1, uf.x1, yTop - treadT, sz0);
  }
  // Connect top carriage block solidly into the upper mezzanine floor slab thickness
  upperCore.add(uf.x0, envelope.groundSoffitY, ufEndZ - 0.18, uf.x1, envelope.upperFloorY - treadT, ufEndZ);
  kit.solid("clay", upperCore, "structure", (_x0, y0, _z0, _x1, y1) => !(y0 <= 0.001 && y1 <= 0.001));

  // Individual solid beveled architectural treads with crisp bullnose nosings facing +Z
  for (let i = 0; i < uf.treads; i++) {
    const sz0 = uf.zStart - i * uf.treadDepth;
    const sz1 = sz0 - uf.treadDepth;
    const yTop = ll.y + (i + 1) * uf.riserHeight;
    const isTopStep = i === uf.treads - 1;
    const tread = bevelPad(
      uf.x1 - uf.x0 - 0.004,
      treadT,
      uf.treadDepth + (isTopStep ? 0.018 : nosing),
      0.006,
      0.004,
      3,
    );
    transformGeometry(
      tread,
      (uf.x0 + uf.x1) / 2,
      yTop - treadT,
      (sz0 + sz1) / 2 + nosing / 2,
    );
    kit.geo("clay", tread, "furniture", 36);
  }

  // ---- 3. Dimensional Sloped Wall Handrail + Inner Handrail + Upper Stairwell Balustrade ----
  // Crisp rectangular-profile architectural wall handrail along East wall (X = uf.x1 - 0.068)
  const railX = uf.x1 - 0.068;
  const railStart = new THREE.Vector3(railX, ll.y + uf.handrailHeight, uf.zStart - 0.06);
  const railEnd = new THREE.Vector3(railX, envelope.upperFloorY + uf.handrailHeight, ufEndZ + 0.04);
  const eastRailBeam = createSlopedBeamGeometry(railStart, railEnd, 0.042, 0.048);
  kit.geo("clay", eastRailBeam, "furniture", 32);

  // Clean horizontal wall returns at bottom & top ends + neat bracket standoffs anchored into East wall
  const bracketTs = [0.02, 0.34, 0.67, 0.98];
  for (const t of bracketTs) {
    const pt = new THREE.Vector3().lerpVectors(railStart, railEnd, t);
    kit.box(
      "clay",
      railX + 0.02,
      pt.y - 0.015,
      pt.z - 0.015,
      uf.x1,
      pt.y + 0.015,
      pt.z + 0.015,
      "detail",
    );
  }

  // Upper mezzanine stairwell safety glass balustrade (watertight RectSolid frame + clear reflective glass)
  const uy = envelope.upperFloorY;
  const guardH = 1.04;
  const gx = rightWing.stairwellX0 - 0.04;
  const gz0 = rightWing.stairwellZ0 + 0.04;
  const gz1 = rightWing.stairwellZ1 + 0.18; // Stops cleanly before top step landing
  const sx0 = gx;
  const sx1 = rightWing.slabX1 - 0.02;

  // Sloped inner handrail along West side of upper flight joining cleanly to upper stairwell post
  const innerRailX = uf.x0 + 0.055;
  const innerStart = new THREE.Vector3(innerRailX, ll.y + uf.handrailHeight, uf.zStart - 0.14);
  const innerEnd = new THREE.Vector3(innerRailX, uy + guardH - 0.024, gz1);
  const innerRailBeam = createSlopedBeamGeometry(innerStart, innerEnd, 0.038, 0.044);
  kit.geo("clay", innerRailBeam, "furniture", 32);

  // Supports connecting the inner handrail cleanly down to the stair edge / niche wall
  for (const t of [0.05, 0.42, 0.78]) {
    const pt = new THREE.Vector3().lerpVectors(innerStart, innerEnd, t);
    kit.box(
      "clay",
      uf.x0,
      pt.y - 0.014,
      pt.z - 0.014,
      innerRailX - 0.018,
      pt.y + 0.014,
      pt.z + 0.014,
      "detail",
    );
  }

  const guardSolid = new RectSolid();
  // West stairwell guardrail frame (continuous shoe + handrail + posts)
  guardSolid.add(gx - 0.028, uy, gz1, gx + 0.028, uy + 0.064, gz0);
  guardSolid.add(gx - 0.03, uy + guardH - 0.048, gz1, gx + 0.03, uy + guardH, gz0);
  const westPosts = 3;
  for (let i = 0; i <= westPosts; i++) {
    const pz = gz0 + ((gz1 - gz0) * i) / westPosts;
    guardSolid.add(gx - 0.024, uy, pz - 0.024, gx + 0.024, uy + guardH, pz + 0.024);
    if (i < westPosts) {
      const nz = gz0 + ((gz1 - gz0) * (i + 1)) / westPosts;
      kit.box("glass", gx - 0.007, uy + 0.064, nz + 0.024, gx + 0.007, uy + guardH - 0.048, pz - 0.024, null);
    }
  }

  // South stairwell guardrail frame (separating front upper office from stairwell void)
  guardSolid.add(sx0, uy, gz0 - 0.028, sx1, uy + 0.064, gz0 + 0.028);
  guardSolid.add(sx0, uy + guardH - 0.048, gz0 - 0.028, sx1, uy + guardH, gz0 + 0.028);
  guardSolid.add(sx1 - 0.048, uy, gz0 - 0.024, sx1, uy + guardH, gz0 + 0.024);
  kit.box("glass", sx0 + 0.026, uy + 0.064, gz0 - 0.007, sx1 - 0.048, uy + guardH - 0.048, gz0 + 0.007, null);

  kit.solid("clay", guardSolid, "furniture");

  // ---- 4. Register Walkable Stair Ramp Surfaces & Guard Colliders ----
  const lfSpanX = lf.treads * lf.treadDepth;
  collisionWorld.addSurface(
    "stair-lower-flight",
    lf.xStart - 0.14,
    lf.z1 + 0.12,
    lf.xStart + lfSpanX + 0.12,
    lf.z0 - 0.12,
    (x) => {
      const t = THREE.MathUtils.clamp((x - lf.xStart) / lfSpanX, 0, 1);
      return t * ll.y;
    },
  );

  collisionWorld.addSurface(
    "stair-lower-landing",
    ll.x0 - 0.06,
    ll.z1 - 0.08,
    ll.x1 - 0.12,
    ll.z0 - 0.12,
    () => ll.y,
  );

  const ufSpanZ = uf.treads * uf.treadDepth;
  collisionWorld.addSurface(
    "stair-upper-flight",
    uf.x0 + 0.12,
    ufEndZ - 0.12,
    uf.x1 - 0.12,
    uf.zStart + 0.14,
    (_x, z) => {
      const t = THREE.MathUtils.clamp((uf.zStart - z) / ufSpanZ, 0, 1);
      return THREE.MathUtils.lerp(ll.y, envelope.upperFloorY, t);
    },
  );

  // Guardrail colliders on upper floor so First-Person camera cannot step into stairwell void
  collisionWorld.addCollider("upper-stairwell-west-guard", gx - 0.05, uy, gz1, gx + 0.05, uy + guardH, gz0);
  collisionWorld.addCollider("upper-stairwell-south-guard", sx0, uy, gz0 - 0.05, sx1, uy + guardH, gz0 + 0.05);
}
