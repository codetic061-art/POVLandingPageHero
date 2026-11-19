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
  float r = 0.85;
  // Ground floor & upper mezzanine floor contact darkening
  occ += (1.0 - abs(nn.y)) * exp(-max(p.y, 0.0) / r) * 0.65;
  if (p.y > 3.43 && (p.x < -2.80 || p.x > 2.30)) {
    occ += (1.0 - abs(nn.y)) * exp(-max(p.y - 3.48, 0.0) / r) * 0.55;
  }
  // Mezzanine soffit & main ceiling corner occlusion
  if (p.y < 3.20 && (p.x < -2.80 || p.x > 2.30) && p.z < -0.05) {
    occ += (1.0 - max(0.0, nn.y)) * exp(-max(3.18 - p.y, 0.0) / 0.72) * 0.58;
  }
  occ += (1.0 - max(0.0, nn.y)) * exp(-max(6.60 - p.y, 0.0) / 0.95) * 0.45;
  // Perimeter wall corner occlusion inside the atrium
  if (p.z < 0.05 && p.z > -13.25 && abs(p.x) < 4.90) {
    occ += (1.0 - abs(nn.x)) * (exp(-max(p.x + 4.85, 0.0) / r) + exp(-max(4.85 - p.x, 0.0) / r)) * 0.42;
    occ += (1.0 - abs(nn.z)) * exp(-max(p.z + 13.20, 0.0) / 0.95) * 0.48;
  }
  return clamp(1.0 - 0.22 * occ, 0.70, 1.0);
}
`;

function attachAnalyticalAO(
  material: THREE.MeshStandardMaterial,
  cacheKey: string,
  strength = 1,
): THREE.MeshStandardMaterial {
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
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
          reflectedLight.directDiffuse *= mix(1.0, aoFactor, 0.35);
        }`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return material;
}

/**
 * Strict 3-material architectural concept model palette:
 *   1. Solid matte white clay for all architecture and furniture
 *   2. Subtle natural botanical green for plants only
 *   3. Clear, lightly transparent physical glass for windows, railings, and partitions
 * Plus thin dark graphite screen-space outlines and soft neutral contact shadows.
 */
export function createAtriumMaterials(): AtriumMaterials {
  const { visualStyle } = ATRIUM_CONFIG;
  const disposable: THREE.Material[] = [];
  const lineMaterials: LineMaterial[] = [];
  const resolution = new THREE.Vector2(1440, 900);

  // 1. Solid matte white clay (no PBR maps, no roughness/normal textures)
  const clay = attachAnalyticalAO(
    new THREE.MeshStandardMaterial({
      name: "clay-white",
      color: new THREE.Color(visualStyle.clayWhite),
      roughness: 0.93,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    "atrium-clay-ao",
    1.0,
  );
  disposable.push(clay);

  // 2. Subtle natural botanical green (used strictly for plant foliage)
  const plant = attachAnalyticalAO(
    new THREE.MeshStandardMaterial({
      name: "plant-green",
      color: new THREE.Color(visualStyle.plantGreen),
      roughness: 0.86,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    "atrium-plant-ao",
    0.85,
  );
  disposable.push(plant);

  // 3. Clear, lightly transparent physical glass
  const glass = new THREE.MeshPhysicalMaterial({
    name: "clear-glass",
    color: new THREE.Color(visualStyle.glassTint),
    roughness: 0.07,
    metalness: 0.02,
    transmission: 0.0,
    transparent: true,
    opacity: visualStyle.glassOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposable.push(glass);

  const lineSpec: Record<LineKind, { color: string; width: number }> = {
    structure: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.structure },
    furniture: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.furniture },
    detail: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.detail },
    floorGrid: { color: visualStyle.subtleGridInk, width: visualStyle.lineWidths.floorGrid },
    glassGlint: { color: visualStyle.glassGlintInk, width: visualStyle.lineWidths.detail },
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

  function createContactShadow(strength = 0.16): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      name: "contact-shadow",
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
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
          gl_FragColor = vec4(0.11, 0.12, 0.13, alpha);
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
