import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { ATRIUM_CONFIG } from "./config";
import type { LineKind, MaterialKind } from "./geometry/solid";

export interface AtriumMaterials {
  clay: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  chair: THREE.MeshStandardMaterial;
  chairBase: THREE.MeshStandardMaterial;
  sofa: THREE.MeshStandardMaterial;
  desk: THREE.MeshStandardMaterial;
  tech: THREE.MeshStandardMaterial;
  accentBlue: THREE.MeshStandardMaterial;
  accentBeige: THREE.MeshStandardMaterial;
  accentGold: THREE.MeshStandardMaterial;
  plant: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  byKind: Record<MaterialKind, THREE.Material>;
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
 * Refined minimal architectural concept palette:
 *   - Dominant matte white walls & structural shell
 *   - Very light warm-gray floors for subtle ground separation
 *   - Muted slate-blue & charcoal chairs + dusty blue lounge/loveseat upholstery
 *   - Light neutral desks/credenzas, graphite tech, restrained blue/beige/champagne-gold accents
 *   - Natural soft botanical green foliage
 *   - Subtle cool-blue tinted physical glass with studio reflections
 */
export function createAtriumMaterials(): AtriumMaterials {
  const { visualStyle } = ATRIUM_CONFIG;
  const disposable: THREE.Material[] = [];
  const lineMaterials: LineMaterial[] = [];
  const resolution = new THREE.Vector2(1440, 900);

  const makeMatte = (
    name: string,
    colorHex: string,
    roughness: number,
    envMapIntensity: number,
    aoStrength: number,
    side: THREE.Side = THREE.FrontSide,
    emissiveHex?: string,
    emissiveIntensity = 0,
  ) => {
    const mat = attachAnalyticalAO(
      new THREE.MeshStandardMaterial({
        name,
        color: new THREE.Color(colorHex),
        roughness,
        metalness: 0.0,
        envMapIntensity,
        side,
        ...(emissiveHex
          ? { emissive: new THREE.Color(emissiveHex), emissiveIntensity }
          : {}),
      }),
      `atrium-${name}-ao-v4`,
      aoStrength,
    );
    disposable.push(mat);
    return mat;
  };

  const clay = makeMatte("clay-white", visualStyle.clayWhite, 0.94, 0.11, 1.0);
  const floor = makeMatte("floor-warm-gray", visualStyle.floorWarmGray, 0.92, 0.12, 0.9);
  const chair = makeMatte("chair-slate", visualStyle.chairSlate, 0.86, 0.16, 0.72);
  const chairBase = makeMatte("chair-charcoal", visualStyle.chairCharcoal, 0.78, 0.18, 0.65);
  const sofa = makeMatte("sofa-blue", visualStyle.sofaBlue, 0.9, 0.14, 0.75);
  const desk = makeMatte("desk-neutral", visualStyle.deskNeutral, 0.91, 0.12, 0.85);
  const tech = makeMatte("tech-graphite", visualStyle.techGraphite, 0.72, 0.22, 0.55);
  const accentBlue = makeMatte("accent-blue", visualStyle.accentBlue, 0.78, 0.18, 0.5);
  const accentBeige = makeMatte("accent-beige", visualStyle.accentBeige, 0.9, 0.12, 0.7);
  const accentGold = makeMatte(
    "accent-gold",
    visualStyle.accentGold,
    0.72,
    0.26,
    0.45,
    THREE.FrontSide,
    "#f2d294",
    0.12,
  );
  const plant = makeMatte(
    "plant-green",
    visualStyle.plantGreen,
    0.85,
    0.14,
    0.55,
    THREE.DoubleSide,
  );

  // Subtle cool-blue tinted physical glass with realistic reflections
  const glass = new THREE.MeshPhysicalMaterial({
    name: "clear-glass",
    color: new THREE.Color(visualStyle.glassTint),
    roughness: 0.05,
    metalness: 0.0,
    ior: 1.5,
    reflectivity: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.38,
    transmission: 0.0,
    transparent: true,
    opacity: visualStyle.glassOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposable.push(glass);

  const byKind: Record<MaterialKind, THREE.Material> = {
    clay,
    floor,
    chair,
    chairBase,
    sofa,
    desk,
    tech,
    accentBlue,
    accentBeige,
    accentGold,
    plant,
    glass,
  };

  const lineSpec: Record<LineKind, { color: string; width: number; opacity: number }> = {
    structure: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.structure, opacity: 0.90 },
    furniture: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.furniture, opacity: 0.82 },
    detail: { color: visualStyle.outlineInk, width: visualStyle.lineWidths.detail, opacity: 0.66 },
    floorGrid: { color: visualStyle.subtleGridInk, width: visualStyle.lineWidths.floorGrid, opacity: 0.70 },
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
    floor,
    chair,
    chairBase,
    sofa,
    desk,
    tech,
    accentBlue,
    accentBeige,
    accentGold,
    plant,
    glass,
    byKind,
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
