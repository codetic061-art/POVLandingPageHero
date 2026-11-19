import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import { GeometryKit, bevelPad, transformGeometry } from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Models the complete two-flight grand architectural staircase:
 *   - Lower 4-step wide podium flight (Y = 0.00 -> 0.72 m) ascending in +X
 *   - Intermediate right landing (Y = 0.72 m)
 *   - Upper 15-step flight (Y = 0.72 -> 3.48 m) ascending in -Z onto the upper mezzanine
 *   - Complete underside stringers/structure, wall handrails, and stairwell balustrade
 *   - Continuous walkable ramp surfaces and safety colliders for First-Person mode
 */
export function buildStaircase(kit: GeometryKit, collisionWorld: CollisionWorld): void {
  const { staircase, rightWing, envelope } = ATRIUM_CONFIG;
  const lf = staircase.lowerFlight;
  const ll = staircase.lowerLanding;
  const uf = staircase.upperFlight;

  // ---- 1. Lower 4-Step Wide Podium Flight (Y = 0.00 -> 0.72 m, ascending +X) ----
  for (let i = 0; i < lf.treads; i++) {
    const sx0 = lf.xStart + i * lf.treadDepth;
    const sx1 = sx0 + lf.treadDepth;
    const yTop = (i + 1) * lf.riserHeight;
    const treadH = 0.036;
    const nosing = 0.018;

    // Solid full-depth step riser & structural core down to Y = 0 (complete from all angles)
    kit.box("clay", sx0, 0, lf.z1, sx1, yTop - treadH, lf.z0, "structure");

    // Crisp bullnose overhanging architectural tread slab
    const tread = bevelPad(lf.treadDepth + nosing, treadH, Math.abs(lf.z0 - lf.z1), 0.008, 0.005);
    transformGeometry(
      tread,
      (sx0 + sx1) / 2 - nosing / 2,
      yTop - treadH,
      (lf.z0 + lf.z1) / 2,
    );
    kit.geo("clay", tread, "furniture", 34);
  }
  kit.contactShadow(
    lf.xStart - 0.05,
    0.003,
    (lf.z0 + lf.z1) / 2,
    0.26,
    Math.abs(lf.z0 - lf.z1) + 0.1,
    0.15,
  );

  // ---- 2. Upper 15-Step Main Flight (Y = 0.72 -> 3.48 m, ascending -Z) ----
  const treadT = 0.038;
  const stringerDrop = 0.28;
  for (let i = 0; i < uf.treads; i++) {
    const sz0 = uf.zStart - i * uf.treadDepth;
    const sz1 = sz0 - uf.treadDepth;
    const yPrev = ll.y + i * uf.riserHeight;
    const yTop = ll.y + (i + 1) * uf.riserHeight;
    const yUnderside = Math.max(ll.y, yPrev - stringerDrop);

    // Structural stepped stringer/carriage block & vertical riser (100% solid from below & behind)
    kit.box("clay", uf.x0, yUnderside, sz1, uf.x1, yTop - treadT, sz0, "structure");

    // Overhanging architectural tread with clean nosing facing +Z
    const nosing = 0.018;
    const tread = bevelPad(uf.x1 - uf.x0, treadT, uf.treadDepth + nosing, 0.008, 0.005);
    transformGeometry(
      tread,
      (uf.x0 + uf.x1) / 2,
      yTop - treadT,
      (sz0 + sz1) / 2 + nosing / 2,
    );
    kit.geo("clay", tread, "furniture", 34);
  }

  // Enclosed lower under-stair storage chamber wall at north end so underside is architecturally finished
  const ufEndZ = uf.zStart - uf.treads * uf.treadDepth;
  kit.box("clay", uf.x0, 0, ufEndZ - 0.14, uf.x1, ll.y, uf.zStart, "structure");

  // ---- 3. Sloped Architectural Handrails & Upper Stairwell Safety Balustrade ----
  // Sloped wall-mounted tubular handrail along East wall (X = uf.x1 - 0.07)
  const railX = uf.x1 - 0.07;
  const railCurve = new THREE.LineCurve3(
    new THREE.Vector3(railX, ll.y + uf.handrailHeight, uf.zStart - 0.08),
    new THREE.Vector3(railX, envelope.upperFloorY + uf.handrailHeight, ufEndZ + 0.06),
  );
  const handrailGeo = new THREE.TubeGeometry(railCurve, 12, 0.02, 10, false);
  kit.geo("clay", handrailGeo, "furniture", 38);
  for (const t of [0.06, 0.35, 0.65, 0.94]) {
    const pt = railCurve.getPoint(t);
    kit.box("clay", railX, pt.y - 0.014, pt.z - 0.014, uf.x1, pt.y + 0.014, pt.z + 0.014, "detail");
  }

  // Upper mezzanine stairwell safety glass balustrade along West edge (X = stairwellX0 - 0.04)
  // and South edge (Z = stairwellZ0 + 0.04) of the stairwell opening
  const uy = envelope.upperFloorY;
  const guardH = 1.04;
  const gx = rightWing.stairwellX0 - 0.04;
  const gz0 = rightWing.stairwellZ0 + 0.04;
  const gz1 = rightWing.stairwellZ1 + 0.18; // Stops cleanly before top step landing

  // West stairwell guardrail
  kit.box("clay", gx - 0.028, uy, gz1, gx + 0.028, uy + 0.065, gz0, "furniture");
  kit.box("clay", gx - 0.03, uy + guardH - 0.048, gz1, gx + 0.03, uy + guardH, gz0, "furniture");
  const westPosts = 3;
  for (let i = 0; i <= westPosts; i++) {
    const pz = gz0 + ((gz1 - gz0) * i) / westPosts;
    kit.box("clay", gx - 0.024, uy + 0.065, pz - 0.024, gx + 0.024, uy + guardH - 0.048, pz + 0.024, "detail");
    if (i < westPosts) {
      const nz = gz0 + ((gz1 - gz0) * (i + 1)) / westPosts;
      kit.box("glass", gx - 0.007, uy + 0.068, nz + 0.026, gx + 0.007, uy + guardH - 0.05, pz - 0.026, "detail");
    }
  }

  // South stairwell guardrail (separating front upper office from stairwell drop)
  const sx0 = gx;
  const sx1 = rightWing.slabX1 - 0.02;
  kit.box("clay", sx0, uy, gz0 - 0.028, sx1, uy + 0.065, gz0 + 0.028, "furniture");
  kit.box("clay", sx0, uy + guardH - 0.048, gz0 - 0.028, sx1, uy + guardH, gz0 + 0.028, "furniture");
  kit.box("clay", sx1 - 0.048, uy + 0.065, gz0 - 0.024, sx1, uy + guardH - 0.048, gz0 + 0.024, "detail");
  kit.box("glass", sx0 + 0.028, uy + 0.068, gz0 - 0.007, sx1 - 0.05, uy + guardH - 0.05, gz0 + 0.007, "detail");

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
