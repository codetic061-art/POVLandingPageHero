import * as THREE from "three";
import { ATRIUM_CONFIG, type PlantSpec } from "../config";
import { GeometryKit, pushBox } from "../geometry/solid";
import type { CollisionWorld } from "../navigation/collisionWorld";

/**
 * Constructs a genuine 3D keeled/arched botanical leaf blade with full solid volume
 * (front midrib ridge, back spine, left/right blade margins, and pointed tip)
 * so every leaf casts real shadows, is closed from 360 degrees, and produces
 * crisp technical pen outlines along its margins and midrib.
 */
function createSculptedLeafGeometry(
  length: number,
  maxWidth: number,
  archAngle: number,
  yawAngle: number,
): THREE.BufferGeometry {
  const segments = 6;
  const thickness = Math.max(0.01, maxWidth * 0.15);
  const positions: number[] = [];
  const indices: number[] = [];

  // Ring of 4 vertices per cross-section: [leftEdge, frontSpine, rightEdge, backSpine]
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Smooth arched spine trajectory in local (0, y, z)
    const bend = archAngle * t * t;
    const cy = Math.cos(bend * 0.55) * length * t;
    const cz = Math.sin(bend) * length * 0.58 * t;

    // Leaf width profile: narrow stem -> broad mid-blade -> sharp pointed tip
    const widthFactor = i === segments ? 0 : Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.96 + (1 - t) * 0.16;
    const hw = (maxWidth * 0.5) * widthFactor;
    const ht = (thickness * 0.5) * (1 - t * 0.75);

    // Tangent normal in YZ plane
    const ny = -Math.sin(bend * 0.7);
    const nz = Math.cos(bend * 0.7);

    if (i === segments) {
      // Single sharp apex vertex
      positions.push(0, cy, cz);
    } else {
      positions.push(-hw, cy, cz); // 0: left blade margin
      positions.push(0, cy + ny * ht, cz + nz * ht); // 1: front midrib ridge
      positions.push(hw, cy, cz); // 2: right blade margin
      positions.push(0, cy - ny * ht, cz - nz * ht); // 3: back midrib spine
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

  // Convert to non-indexed flat-faceted normals so every leaf margin & midrib shades crisply
  const flat = indexed.toNonIndexed();
  flat.computeVertexNormals();
  indexed.dispose();
  return flat;
}

function addPlanterAndPlant(
  kit: GeometryKit,
  collisionWorld: CollisionWorld,
  spec: PlantSpec,
): void {
  const { x, y, z, potWidth, potDepth, potHeight, leafCount, leafHeight, leafSpread, leafWidth } = spec;
  const hw = potWidth / 2;
  const hd = potDepth / 2;
  const rimT = Math.min(0.038, potWidth * 0.11);
  const soilY = y + potHeight - rimT * 1.35;

  // Matte-white clay planter pot with recessed top rim & interior soil bed (360° solid geometry)
  const clayB = kit.buckets.clay;
  const furnE = kit.lines.furniture;
  // Solid base + soil core up to soilY
  pushBox(clayB, furnE, x - hw, y, z - hd, x + hw, soilY, z + hd);
  // Four hollow upper rim walls rising above soilY to y + potHeight
  pushBox(clayB, furnE, x - hw, soilY, z - hd, x + hw, y + potHeight, z - hd + rimT);
  pushBox(clayB, furnE, x - hw, soilY, z + hd - rimT, x + hw, y + potHeight, z + hd);
  pushBox(clayB, furnE, x - hw, soilY, z - hd + rimT, x - hw + rimT, y + potHeight, z + hd - rimT);
  pushBox(clayB, furnE, x + hw - rimT, soilY, z - hd + rimT, x + hw, y + potHeight, z + hd - rimT);

  // Multi-tier rosette of 3D sculpted green leaves (plantGreen material strictly on leaves!)
  const goldenAngle = 2.39996323;
  for (let i = 0; i < leafCount; i++) {
    const tier = i / Math.max(1, leafCount - 1); // 0 = inner upright leaves, 1 = outer arching leaves
    const yaw = i * goldenAngle + (spec.id.length * 0.37);
    const arch = 0.24 + tier * 0.92;
    const len = leafHeight * (1.04 - tier * 0.24);
    const w = leafWidth * (0.88 + Math.sin(tier * Math.PI) * 0.26);
    const radialOffset = leafSpread * 0.16 * tier;

    const leafGeo = createSculptedLeafGeometry(len, w, arch, yaw);
    leafGeo.translate(
      x + Math.sin(yaw) * radialOffset,
      soilY - 0.015,
      z + Math.cos(yaw) * radialOffset,
    );
    // Low threshold (16 deg) captures both outer leaf silhouette edges and the central midrib crease
    kit.geo("plant", leafGeo, "furniture", 16);
  }

  if (potWidth >= 0.35) {
    kit.contactShadow(x, y + 0.003, z, potWidth + 0.18, potDepth + 0.18, 0.18);
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
