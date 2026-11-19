import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { ATRIUM_CONFIG } from "./config";
import type { LineKind } from "./geometry/solid";

export interface AtriumMaterials {
  clay: THREE.MeshStandardMaterial;
  plant: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  lineMaterials: LineMaterial[];
  createLines: (kind: LineKind, positions: number[]) => LineSegments2 | null;
  createContactShadow: (strength?: number) => THREE.ShaderMaterial;
  setResolution: (width: number, height: number) => void;
  dispose: () => void;
}

const AO_DECL = /* glsl */ `
varying vec3 vAtriumWp;
varying vec3 vAtriumWn;

float atriumAO(vec3 p, vec3 nn) {
  float occ = 0.0;
  float r = 0.78;
  // Smooth interior bounding mask so exterior facades stay bright and clean
  float insideZ = smoothstep(0.18, -0.15, p.z) * smoothstep(-13.45, -13.10, p.z);
  float insideX = smoothstep(5.05, 4.78, abs(p.x));
  float interiorMask = insideZ * insideX;

  // Ground floor contact occlusion (only above Y = 0)
  float aboveGround = smoothstep(-0.08, 0.02, p.y);
  occ += aboveGround * (1.0 - abs(nn.y)) * exp(-max(p.y, 0.0) / r) * 0.52;

  // Smooth upper mezzanine floor contact darkening (no hard Y step seams)
  float wingMask = smoothstep(-2.62, -2.92, p.x) + smoothstep(2.12, 2.42, p.x);
  wingMask = clamp(wingMask, 0.0, 1.0) * interiorMask;
  float aboveMezz = smoothstep(3.40, 3.52, p.y);
  occ += wingMask * aboveMezz * (1.0 - abs(nn.y)) * exp(-max(p.y - 3.48, 0.0) / r) * 0.42;

  // Smooth mezzanine soffit under-corner occlusion
  float belowSoffit = smoothstep(3.26, 3.12, p.y) * smoothstep(2.10, 2.75, p.y);
  occ += wingMask * belowSoffit * (1.0 - max(0.0, nn.y)) * exp(-max(3.18 - p.y, 0.0) / 0.65) * 0.40;

  // Main atrium ceiling corner occlusion
  float nearCeil = smoothstep(5.30, 6.25, p.y);
  occ += interiorMask * nearCeil * (1.0 - max(0.0, nn.y)) * exp(-max(6.60 - p.y, 0.0) / 0.90) * 0.38;

  // Perimeter wall corner occlusion inside the atrium
  occ += interiorMask * (1.0 - abs(nn.x)) * (exp(-max(p.x + 4.85, 0.0) / r) + exp(-max(4.85 - p.x, 0.0) / r)) * 0.30;
  occ += interiorMask * (1.0 - abs(nn.z)) * exp(-max(p.z + 13.20, 0.0) / 0.90) * 0.34;

  return clamp(1.0 - 0.21 * occ, 0.77, 1.0);
}
`;

function attachAnalyticalAO(
  material: THREE.MeshStandardMaterial,
  cacheKey: string,
  strength = 1,
): THREE.MeshStandardMaterial {
  material.polygonOffset = true;
  material.polygonOffsetFactor = 0.85;
  material.polygonOffsetUnits = 0.85;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAoStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vAtriumWp;\nvarying vec3 vAtriumWn;",
      )
      .replace(
        "#include <fog_vertex>",
        "#include <fog_vertex>\nvAtriumWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvAtriumWn = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uAoStrength;\n${AO_DECL}`)
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          vec3 nnA = normalize(vAtriumWn) * (gl_FrontFacing ? 1.0 : -1.0);
          float aoFactor = mix(1.0, atriumAO(vAtriumWp, nnA), uAoStrength);
          reflectedLight.indirectDiffuse *= aoFactor;
          reflectedLight.directDiffuse *= mix(1.0, aoFactor, 0.34);
        }`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

/**
 * Strict 3-material architectural concept model palette:
 *   1. Solid matte white clay for all architecture and furniture
 *   2. Natural soft botanical green for plants only
 *   3. Subtle, clear, slightly tinted physical glass with realistic studio reflections
 * Plus delicate graphite screen-space outlines and soft neutral contact shadows.
 */
export function createAtriumMaterials(): AtriumMaterials {
  const { visualStyle } = ATRIUM_CONFIG;
  const disposable: THREE.Material[] = [];
  const lineMaterials: LineMaterial[] = [];
  const resolution = new THREE.Vector2(1440, 900);

  // 1. Clean matte white architectural clay (zero textures, zero metallic sheen)
  const clay = attachAnalyticalAO(
    new THREE.MeshStandardMaterial({
      name: "clay-white",
      color: new THREE.Color(visualStyle.clayWhite),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.11,
      side: THREE.FrontSide,
    }),
    "atrium-clay-ao-v3",
    1.0,
  );
  disposable.push(clay);

  // 2. Natural soft green strictly for botanical plant leaves
  const plant = attachAnalyticalAO(
    new THREE.MeshStandardMaterial({
      name: "plant-green",
      color: new THREE.Color(visualStyle.plantGreen),
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.14,
      side: THREE.DoubleSide,
    }),
    "atrium-plant-ao-v3",
    0.55,
  );
  disposable.push(plant);

  // 3. Subtle, clear, slightly tinted architectural glass with realistic reflections
  const glass = new THREE.MeshPhysicalMaterial({
    name: "clear-glass",
    color: new THREE.Color(visualStyle.glassTint),
    roughness: 0.05,
    metalness: 0.0,
    ior: 1.5,
    reflectivity: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.35,
    transmission: 0.0,
    transparent: true,
    opacity: visualStyle.glassOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposable.push(glass);

  const lineSpec: Record<LineKind, { color: string; width: number; opacity: number }> = {
    structure: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.structure, opacity: 0.92 },
    furniture: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.furniture, opacity: 0.84 },
    detail: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.detail, opacity: 0.68 },
    floorGrid: { color: visualStyle.subtleGridInk, width: visualStyle.lineWidths.floorGrid, opacity: 0.72 },
    glassGlint: { color: visualStyle.glassGlintInk, width: visualStyle.lineWidths.detail, opacity: 0.40 },
  };

  function createLines(kind: LineKind, positions: number[]): LineSegments2 | null {
    if (positions.length < 6) return null;
    const spec = lineSpec[kind];
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: new THREE.Color(spec.color).getHex(),
      linewidth: spec.width,
      worldUnits: false,
      transparent: true,
      opacity: spec.opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      resolution: resolution.clone(),
    });
    lineMaterials.push(material);
    disposable.push(material);
    const segments = new LineSegments2(geometry, material);
    segments.name = `outlines-${kind}`;
    segments.frustumCulled = false;
    segments.renderOrder = kind === "floorGrid" ? 1 : 2;
    return segments;
  }

  function createContactShadow(strength = 0.14): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      name: "contact-shadow",
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.6,
      polygonOffsetUnits: -0.6,
      uniforms: {
        uStrength: { value: strength },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uStrength;
        void main() {
          vec2 e = smoothstep(vec2(0.0), vec2(0.48), vUv) * smoothstep(vec2(0.0), vec2(0.48), 1.0 - vUv);
          float alpha = pow(e.x * e.y, 1.45) * uStrength;
          gl_FragColor = vec4(0.14, 0.15, 0.17, alpha);
        }
      `,
    });
    disposable.push(mat);
    return mat;
  }

  return {
    clay,
    plant,
    glass,
    lineMaterials,
    createLines,
    createContactShadow,
    setResolution(width, height) {
      resolution.set(width, height);
      for (const m of lineMaterials) {
        m.resolution.set(width, height);
      }
    },
    dispose() {
      for (const m of disposable) {
        m.dispose();
      }
    },
  };
}
