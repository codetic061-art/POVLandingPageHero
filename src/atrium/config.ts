export type AtriumViewMode = "orbit" | "firstPerson";

export interface PlantSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  potWidth: number;
  potDepth: number;
  potHeight: number;
  leafCount: number;
  leafHeight: number;
  leafSpread: number;
  leafWidth: number;
  registerCollider: boolean;
}

/**
 * Centralized architectural & navigation configuration for the 3D office atrium.
 * Coordinates are metric (1 unit = 1.00 m):
 *   X: West (-X, left from entrance) to East (+X, right from entrance)
 *   Y: Elevation above finished ground floor (Y = 0.00 m)
 *   Z: Front entrance plane at Z = 0.00 m; interior extends into -Z; exterior apron is +Z
 */
export const ATRIUM_CONFIG = {
  visualStyle: {
    background: "#f6f6f4",
    exteriorGround: "#f3f3f0",
    clayWhite: "#fbfbfa",
    plantGreen: "#6d8e68",
    glassTint: "#e7eff2",
    glassOpacity: 0.16,
    outlineInk: "#232528",
    subtleGridInk: "#d5d6d8",
    glassGlintInk: "#595e65",
    lineWidths: {
      structure: 1.35,
      furniture: 0.95,
      detail: 0.72,
      floorGrid: 0.55,
    },
  },

  envelope: {
    halfWidth: 4.85, // 9.70 m clear interior width (-4.85..+4.85)
    depth: 13.2, // 13.20 m clear interior depth (0.00..-13.20)
    ceilingHeight: 6.6, // Double-height atrium ceiling
    groundSoffitY: 3.18, // Underside of left & right mezzanines
    upperFloorY: 3.48, // Walkable upper mezzanine floor elevation (0.30 m slab)
    extWallT: 0.3, // Exterior wall thickness
    intWallT: 0.16, // Interior partition thickness
    slabT: 0.28, // Ground & roof structural slab thickness
    parapetH: 0.24, // Exterior roof parapet height
    frontApronZ: 5.6, // Exterior entrance terrace depth (+Z)
    floorGridSize: 1.15, // Architectural floor joint grid
    baseboardH: 0.08,
  },

  entrance: {
    halfClearWidth: 2.66, // 5.32 m monumental double doorway clear span
    clearHeight: 3.36, // Aligns with mezzanine fascia band
    casingWidth: 0.19,
    casingDepth: 0.07,
    leafWidth: 2.63,
    leafHeight: 3.32,
    leafThickness: 0.064,
    openAngleDeg: 114, // Swings outward into foreground framing the view
    hingeOffsetsY: [0.54, 1.68, 2.82] as const,
  },

  leftWing: {
    slabX0: -4.85,
    slabX1: -2.85, // 2.00 m wide cantilevered left gallery
    railingX: -2.91,
    railingHeight: 1.08,
    railingBays: 7,
    railingZ0: -0.1,
    railingZ1: -10.55,
    upperRoom: {
      x0: -4.85,
      x1: -2.85,
      z0: -10.55,
      z1: -13.2,
      topY: 5.86, // Stepped below 6.60 m ceiling per reference image
      doorX0: -4.25,
      doorX1: -3.32,
      doorTopY: 5.58,
    },
    groundWindows: {
      zStart: -3.15,
      zEnd: -9.55,
      sillY: 0.54,
      headY: 2.72,
      bays: 3,
    },
    clerestoryWindow: {
      zStart: -0.75,
      zEnd: -2.65,
      sillY: 3.95,
      headY: 6.1,
    },
    rearAlcove: {
      pierX0: -3.01,
      pierX1: -2.85,
      pierZ0: -9.8,
      pierZ1: -13.2,
      credenzaX0: -4.72,
      credenzaX1: -3.08,
      credenzaZ0: -12.64,
      credenzaZ1: -13.18,
      credenzaH: 0.92,
      shelfY1: 1.48,
      shelfY2: 1.96,
    },
    downlightX: -3.82,
    downlightZs: [-2.4, -4.6, -6.8, -9.0] as const,
  },

  rightWing: {
    slabX0: 2.35,
    slabX1: 4.85, // 2.50 m right mezzanine total width
    stairwellX0: 3.52, // Leaves 1.17 m walkable upper gallery along X = 2.35..3.52
    stairwellX1: 4.85,
    stairwellZ0: -4.85,
    stairwellZ1: -9.35,
    plinthY: 0.72,
    columns: [
      { x0: 2.38, x1: 2.84, z0: -4.42, z1: -4.88 },
      { x0: 2.38, x1: 2.84, z0: -8.92, z1: -9.38 },
    ] as const,
    nicheWallX0: 3.38,
    nicheWallX1: 3.52,
    nicheZ0: -4.88,
    nicheZ1: -8.92,
    shelfY1: 1.62,
    shelfY2: 2.22,
    glassPartition: {
      x: 2.41,
      z0: -0.08,
      z1: -13.12,
      transomY: 4.56, // 1.08 m above 3.48 m slab
      bays: 8,
    },
    upperEastWindows: {
      zStart: -1.3,
      zEnd: -11.9,
      sillY: 4.2,
      headY: 6.12,
      bays: 5,
    },
    downlightX: 2.92,
    downlightZs: [-1.8, -3.5, -6.0, -7.8, -10.6] as const,
  },

  staircase: {
    lowerFlight: {
      xStart: 1.18, // Steps ascend in +X from 1.18 -> 2.50
      z0: -2.35,
      z1: -4.85,
      treads: 4,
      treadDepth: 0.33,
      riserHeight: 0.18, // 4 * 0.18 = 0.72 m lower landing
    },
    lowerLanding: {
      x0: 2.5,
      x1: 4.85,
      z0: -0.15,
      z1: -4.85,
      y: 0.72,
    },
    upperFlight: {
      x0: 3.52,
      x1: 4.85,
      zStart: -4.85, // Ascends in -Z from -4.85 -> -9.35
      treads: 15,
      treadDepth: 0.3,
      riserHeight: (3.48 - 0.72) / 15, // Exact 0.184 m rise to Y = 3.48 m
      handrailHeight: 0.94,
    },
  },

  furniture: {
    leftDesk: {
      cx: -2.02,
      cz: -4.95,
      widthX: 0.98,
      lengthZ: 2.06,
      height: 0.75,
    },
    lounge: {
      leftChair: { x: -1.96, z: -11.05, yaw: 0.36 },
      sideTable: { x: -1.18, z: -11.26, radius: 0.26, height: 0.46 },
      rightChair: { x: -0.42, z: -11.05, yaw: -0.32 },
    },
    meeting: {
      cx: 0.84,
      cz: -7.95,
      widthX: 0.86,
      lengthZ: 1.76,
      height: 0.75,
      benchX: 1.62,
    },
    rightNicheCube: {
      cx: 2.95,
      cz: -5.65,
      y0: 0.72,
      widthX: 0.52,
      depthZ: 0.56,
      height: 0.52,
    },
    upperDesks: [
      { cx: 4.08, cz: -2.45, y0: 3.48, widthX: 0.82, lengthZ: 1.56, chairSide: 1 as const },
      { cx: 4.08, cz: -11.35, y0: 3.48, widthX: 0.82, lengthZ: 1.56, chairSide: 1 as const },
    ],
  },

  plants: [
    {
      id: "foreground-left",
      x: -2.16,
      y: 0,
      z: -1.72,
      potWidth: 0.52,
      potDepth: 0.52,
      potHeight: 0.52,
      leafCount: 15,
      leafHeight: 0.94,
      leafSpread: 0.42,
      leafWidth: 0.115,
      registerCollider: true,
    },
    {
      id: "foreground-right",
      x: 2.02,
      y: 0,
      z: -1.72,
      potWidth: 0.52,
      potDepth: 0.52,
      potHeight: 0.52,
      leafCount: 15,
      leafHeight: 0.96,
      leafSpread: 0.43,
      leafWidth: 0.115,
      registerCollider: true,
    },
    {
      id: "left-shelf-plant",
      x: -4.28,
      y: 1.99,
      z: -12.92,
      potWidth: 0.23,
      potDepth: 0.23,
      potHeight: 0.22,
      leafCount: 11,
      leafHeight: 0.38,
      leafSpread: 0.2,
      leafWidth: 0.06,
      registerCollider: false,
    },
    {
      id: "right-plinth-plant",
      x: 2.94,
      y: 0.72,
      z: -7.72,
      potWidth: 0.4,
      potDepth: 0.4,
      potHeight: 0.4,
      leafCount: 13,
      leafHeight: 0.68,
      leafSpread: 0.32,
      leafWidth: 0.095,
      registerCollider: true,
    },
    {
      id: "right-shelf-plant",
      x: 3.16,
      y: 2.25,
      z: -5.85,
      potWidth: 0.22,
      potDepth: 0.22,
      potHeight: 0.2,
      leafCount: 10,
      leafHeight: 0.34,
      leafSpread: 0.18,
      leafWidth: 0.055,
      registerCollider: false,
    },
    {
      id: "upper-right-planter",
      x: 2.82,
      y: 3.48,
      z: -1.38,
      potWidth: 0.46,
      potDepth: 0.72,
      potHeight: 0.42,
      leafCount: 16,
      leafHeight: 0.84,
      leafSpread: 0.38,
      leafWidth: 0.108,
      registerCollider: true,
    },
  ] satisfies readonly PlantSpec[],

  lighting: {
    sunPosition: [-13.8, 12.2, 4.8] as const,
    sunTarget: [1.4, 1.9, -11.2] as const,
    sunIntensity: 1.55,
    hemisphereSky: "#ffffff",
    hemisphereGround: "#e7e8ea",
    hemisphereIntensity: 1.25,
  },

  navigation: {
    orbit: {
      defaultPosition: [0, 1.56, 4.18] as const,
      defaultTarget: [0, 2.08, -6.1] as const,
      defaultFov: 50,
      portraitFov: 68,
      minDistance: 1.2,
      maxDistance: 36,
      maxPolarAngle: Math.PI * 0.495,
      dampingFactor: 0.08,
    },
    firstPerson: {
      eyeHeight: 1.6,
      playerRadius: 0.23,
      maxSpeed: 3.1,
      accel: 20,
      damping: 11,
      maxStepDeltaY: 0.42,
      defaultSpawn: {
        x: 0,
        z: 1.15,
        yaw: 0,
        pitch: -0.02,
      },
    },
  },
} as const;
