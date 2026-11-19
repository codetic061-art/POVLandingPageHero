import * as THREE from "three";
import { ATRIUM_CONFIG, type PlantSpec } from "../config";
import { GeometryKit, RectSolid } from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Constructs a sculpted 3D botanical leaf blade with graceful outward arch,
 * cupped V-profile, full closed volume, and clean pointed tip.
 * Emits smooth shaded solid triangles plus delicate margin & midrib outlines.
 */
function createSculptedLeafGeometry(
  length: number,
  maxWidth: number,
  archAngle: number,
  yawAngle: number,
): { geometry: THREE.BufferGeometry; outlineSegments: number[] } {
  const segments = 9;
  const thickness = Math.max(0.011, maxWidth * 0.11);
  const positions: number[] = [];
  const indices: number[] = [];

  // Ring of 4 vertices per cross-section: [leftEdge, frontMidrib, rightEdge, backSpine]
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const bend = archAngle * Math.pow(t, 1.55);
    const cy = Math.cos(bend * 0.62) * length * t;
    const cz = Math.sin(bend) * length * 0.62 * t;

    // Broad lanceolate botanical leaf profile (narrow petiole -> broad lush mid-blade -> graceful pointed tip)
    const widthFactor =
      i === segments
        ? 0
        : Math.sin(Math.pow(t, 0.68) * Math.PI) * 0.98 + Math.pow(1 - t, 2.2) * 0.14;
    const hw = maxWidth * 0.5 * widthFactor;
    const ht = thickness * 0.5 * (1 - t * 0.72);
    // Subtle natural upward cup of the blade margins relative to midrib
    const cup = hw * 0.16;

    const ny = -Math.sin(bend * 0.7);
    const nz = Math.cos(bend * 0.7);

    if (i === segments) {
      positions.push(0, cy, cz);
    } else {
      positions.push(-hw, cy + ny * cup, cz + nz * cup); // 0: left blade margin
      positions.push(0, cy + ny * ht, cz + nz * ht); // 1: front midrib groove
      positions.push(hw, cy + ny * cup, cz + nz * cup); // 2: right blade margin
      positions.push(0, cy - ny * ht, cz - nz * ht); // 3: back midrib keel
    }
  }

  // Base cap triangles (closing bottom of stem at i = 0)
  indices.push(0, 2, 1, 0, 3, 2);

  // Side quads between cross-sections 0..segments-1
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const kNext = (k + 1) % 4;
      indices.push(a + k, b + k, b + kNext);
      indices.push(a + k, b + kNext, a + kNext);
    }
  }

  // Tip pyramid connecting last ring to apex
  const lastRing = (segments - 1) * 4;
  const apex = segments * 4;
  for (let k = 0; k < 4; k++) {
    const kNext = (k + 1) % 4;
    indices.push(lastRing + k, apex, lastRing + kNext);
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  indexed.rotateY(yawAngle);

  // Extract clean delicate architectural ink lines strictly along left margin, right margin, and central midrib
  const posAttr = indexed.attributes.position;
  const outlineSegments: number[] = [];
  const pushEdge = (ia: number, ib: number) => {
    outlineSegments.push(
      posAttr.getX(ia),
      posAttr.getY(ia),
      posAttr.getZ(ia),
      posAttr.getX(ib),
      posAttr.getY(ib),
      posAttr.getZ(ib),
    );
  };
  for (let i = 1; i < segments - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    pushEdge(a + 0, b + 0); // left margin
    pushEdge(a + 2, b + 2); // right margin
    pushEdge(a + 1, b + 1); // front midrib
  }
  pushEdge(lastRing + 0, apex);
  pushEdge(lastRing + 2, apex);
  pushEdge(lastRing + 1, apex);

  // Flat-faceted per-blade normals give crisp sunlit light/shadow separation across each leaf half
  const flat = indexed.toNonIndexed();
  flat.computeVertexNormals();
  indexed.dispose();
  return { geometry: flat, outlineSegments };
}

function addPlanterAndPlant(
  kit: GeometryKit,
  collisionWorld: CollisionWorld,
  spec: PlantSpec,
): void {
  const { x, y, z, potWidth, potDepth, potHeight, leafCount, leafHeight, leafSpread, leafWidth } = spec;
  const hw = potWidth / 2;
  const hd = potDepth / 2;
  const rimT = Math.min(0.036, potWidth * 0.11);
  const soilY = y + potHeight - rimT * 1.45;

  // Watertight matte-white clay planter pot with recessed top rim (zero corner seams!)
  const potSolid = new RectSolid();
  potSolid.add(x - hw, y, z - hd, x + hw, y + potHeight, z + hd);
  potSolid.sub(x - hw + rimT, soilY, z - hd + rimT, x + hw - rimT, y + potHeight + 0.02, z + hd - rimT);
  kit.solid("clay", potSolid, "furniture");

  // Layered botanical rosette of graceful arching soft-green 3D leaves
  const goldenAngle = 2.39996323;
  const detailLines = kit.lines.detail;
  for (let i = 0; i < leafCount; i++) {
    const tier = i / Math.max(1, leafCount - 1); // 0 = inner upright leaves, 1 = outer gracefully arching leaves
    const yaw = i * goldenAngle + spec.id.length * 0.41;
    const arch = 0.28 + tier * 1.05;
    const len = leafHeight * (1.02 - tier * 0.16);
    const w = leafWidth * (0.86 + Math.sin(tier * Math.PI) * 0.28);
    const radialOffset = leafSpread * 0.14 * tier;

    const tx = x + Math.sin(yaw) * radialOffset;
    const ty = soilY - 0.012;
    const tz = z + Math.cos(yaw) * radialOffset;

    const { geometry: leafGeo, outlineSegments } = createSculptedLeafGeometry(len, w, arch, yaw);
    leafGeo.translate(tx, ty, tz);
    kit.geo("plant", leafGeo, null);

    // Emit clean translated margin & midrib ink lines without dark inner clutter
    for (let k = 0; k < outlineSegments.length; k += 3) {
      detailLines.push(
        outlineSegments[k] + tx,
        outlineSegments[k + 1] + ty,
        outlineSegments[k + 2] + tz,
      );
    }
  }

  if (potWidth >= 0.35) {
    kit.contactShadow(x, y + 0.002, z, potWidth + 0.16, potDepth + 0.16, 0.14);
  }

  if (spec.registerCollider) {
    collisionWorld.addCollider(
      `plant-${spec.id}`,
      x - hw - 0.03,
      y,
      z - hd - 0.03,
      x + hw + 0.03,
      y + potHeight + leafHeight * 0.75,
      z + hd + 0.03,
    );
  }
}

/**
 * Builds all indoor planters and 3D botanical foliage defined in ATRIUM_CONFIG.plants.
 */
export function buildPlants(kit: GeometryKit, collisionWorld: CollisionWorld): void {
  for (const spec of ATRIUM_CONFIG.plants) {
    addPlanterAndPlant(kit, collisionWorld, spec);
  }
}
