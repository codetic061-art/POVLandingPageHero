import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import { GeometryKit, RectSolid, bucketToGeometry, transformGeometry } from "../geometry/solid";
import type { AtriumMaterials } from "../materials";
import {
  type StickmanInstance,
  type StickmanMasterAssets,
  type StickmanRigDiagnostics,
  type StickmanVariant,
} from "../characters/stickmanMaster";

export interface MeetingParticipantSpec {
  id: string;
  name: string;
  variant: StickmanVariant;
}

export interface MeetingLayoutMetrics {
  participantCount: number;
  totalSeats: number;
  tableRadius: number;
  chairRadius: number;
  roomHalfSpan: number;
  minChairChordSpacing: number;
  seatArcSpacing: number;
  tableTopY: number;
  chairBackTopY: number;
  cameraEyeY: number;
}

export interface MeetingDiagnostics {
  active: boolean;
  transitioning: boolean;
  participantCount: number;
  layout: MeetingLayoutMetrics;
  cameraPosition: [number, number, number];
  cameraYawDeg: number;
  cameraPitchDeg: number;
  isPitchLocked: boolean;
  isPositionStationary: boolean;
  participants: Array<{
    id: string;
    name: string;
    variant: StickmanVariant;
    seatIndex: number;
    angleDegFromUserForward: number;
    distanceToUserEye: number;
    headWorldPos: [number, number, number];
    rig: StickmanRigDiagnostics;
  }>;
}

export interface VirtualMeetingRoom {
  group: THREE.Group;
  getParticipantCount: () => number;
  setParticipants: (specs: readonly MeetingParticipantSpec[]) => MeetingLayoutMetrics;
  setParticipantCount: (count: number) => MeetingLayoutMetrics;
  getCharacters: () => StickmanInstance[];
  isActive: () => boolean;
  enter: (fromPosition: THREE.Vector3, fromYaw: number, fromPitch: number, immediate?: boolean) => void;
  exit: (
    toPosition: THREE.Vector3,
    toYaw: number,
    toPitch: number,
    onComplete: () => void,
    immediate?: boolean,
  ) => void;
  setYaw: (yawRad: number) => void;
  steerCursorNormalized: (nx: number, ny?: number) => void;
  resetView: () => void;
  update: (timeSec: number, dtSec: number) => boolean;
  getDiagnostics: () => MeetingDiagnostics;
  dispose: () => void;
}

const FLOOR_Y = ATRIUM_CONFIG.envelope.upperFloorY; // 3.48 m (upper floor level)
const CEIL_Y = ATRIUM_CONFIG.envelope.ceilingHeight; // 6.60 m (3.12 m clear ceiling)
const DOOR_WALL_Z = -(ATRIUM_CONFIG.envelope.depth + ATRIUM_CONFIG.envelope.extWallT + 0.02); // -13.52 m
const DOOR_X = 3.05; // Aligned directly with upper-right landing Meeting Room door
const TABLE_TOP_Y = FLOOR_Y + 0.74;
const TABLE_THICKNESS = 0.048;
const CHAIR_SEAT_Y = FLOOR_Y + 0.45;
const CHAIR_BACK_TOP_Y = FLOOR_Y + 0.835; // Strictly below seated chin (0.945 m) & shoulders (0.885 m)
const USER_EYE_Y = FLOOR_Y + 1.105; // Eye-to-eye with seated stickman head center (1.097 m)
const LOCKED_PITCH = -0.022; // Level gaze focused squarely on participants' heads & faces
const MAX_HOVER_YAW = THREE.MathUtils.degToRad(108); // Effortlessly reaches immediate left & right neighbors even at 25+ seats
const MEETING_FOV = 54;
const MEETING_PORTRAIT_FOV = 68;
const TRANSITION_SEC = 0.58;

const DEFAULT_DEMO_NAMES = [
  "Alex",
  "Maya",
  "Daniel",
  "Sofia",
  "Liam",
  "Elena",
  "Noah",
  "Chloe",
  "Ethan",
  "Aria",
  "Lucas",
  "Nora",
  "Owen",
  "Hana",
  "Leo",
  "Zoe",
  "Mason",
  "Clara",
  "Julian",
  "Mila",
  "Caleb",
  "Eva",
  "Henry",
  "Ruby",
  "Theo",
  "Iris",
] as const;

export function createDefaultMeetingParticipants(count = 5): MeetingParticipantSpec[] {
  const safeCount = Math.max(1, Math.min(32, Math.floor(count)));
  const result: MeetingParticipantSpec[] = [];
  for (let i = 0; i < safeCount; i++) {
    result.push({
      id: `meeting-participant-${i + 1}`,
      name: DEFAULT_DEMO_NAMES[i % DEFAULT_DEMO_NAMES.length],
      variant: i % 2 === 0 ? "male" : "female",
    });
  }
  return result;
}

/**
 * Computes non-overlapping circular table, chair ring, and room dimensions
 * for any participant count (tested from 2 up to 24+ participants).
 */
export function computeMeetingLayout(participantCount: number): MeetingLayoutMetrics {
  const totalSeats = Math.max(4, participantCount + 1); // seat 0 = stationary user
  // Comfortable arc per seat: spacious 1.08 m for intimate meetings, scaling smoothly to 0.88 m for 20+ seats
  const seatArcSpacing =
    totalSeats <= 8 ? 1.08 : totalSeats <= 14 ? 0.96 : 0.88;
  const chairRadius = Math.max(1.85, (totalSeats * seatArcSpacing) / (2 * Math.PI));
  const tableRadius = Math.max(1.22, chairRadius - 0.58);
  const roomHalfSpan = Math.max(4.65, chairRadius + 1.95);
  const minChairChordSpacing = 2 * chairRadius * Math.sin(Math.PI / totalSeats);

  return {
    participantCount,
    totalSeats,
    tableRadius: +tableRadius.toFixed(3),
    chairRadius: +chairRadius.toFixed(3),
    roomHalfSpan: +roomHalfSpan.toFixed(3),
    minChairChordSpacing: +minChairChordSpacing.toFixed(3),
    seatArcSpacing,
    tableTopY: TABLE_TOP_Y,
    chairBackTopY: CHAIR_BACK_TOP_Y,
    cameraEyeY: USER_EYE_Y,
  };
}

/**
 * Builds a single reusable low-profile executive conference chair group
 * (sculpted slate blue-gray seat & contoured backrest strictly below head/shoulder height,
 * charcoal 5-star pedestal base, and sleek low armrests).
 */
interface ConferenceChairPrototypes {
  seatGeo: THREE.BufferGeometry;
  baseGeo: THREE.BufferGeometry;
  linesGeo: number[];
  dispose: () => void;
}

function createConferenceChairPrototypes(): ConferenceChairPrototypes {
  const seatKit = new GeometryKit();
  const baseKit = new GeometryKit();

  // Pedestal 5-star swivel base (Y = 0..0.42)
  const col = new THREE.CylinderGeometry(0.026, 0.032, 0.34, 14);
  transformGeometry(col, 0, 0.23, 0);
  baseKit.geo("chairBase", col, "furniture", 30);

  const hub = new THREE.CylinderGeometry(0.048, 0.056, 0.05, 14);
  transformGeometry(hub, 0, 0.068, 0);
  baseKit.geo("chairBase", hub, "furniture", 30);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const spoke = new THREE.BoxGeometry(0.03, 0.024, 0.25);
    transformGeometry(spoke, sa * 0.135, 0.054, ca * 0.135, a);
    baseKit.geo("chairBase", spoke, "detail", 32);

    const caster = new THREE.CylinderGeometry(0.02, 0.02, 0.024, 10);
    caster.rotateZ(Math.PI / 2);
    transformGeometry(caster, sa * 0.245, 0.022, ca * 0.245, a);
    baseKit.geo("chairBase", caster, null);
  }

  // Under-seat tilt mechanism plate
  baseKit.box("chairBase", -0.1, 0.38, -0.1, 0.1, 0.42, 0.1, "detail");

  // Sculpted upholstered conference seat (seat top = 0.45 m, width = 0.48 m, depth = 0.46 m)
  const seat = new THREE.BoxGeometry(0.48, 0.056, 0.45);
  transformGeometry(seat, 0, 0.422, 0.01);
  seatKit.geo("chair", seat, "furniture", 28);

  // Rounded front waterfall bolster
  const frontRoll = new THREE.CylinderGeometry(0.028, 0.028, 0.478, 12);
  frontRoll.rotateZ(Math.PI / 2);
  transformGeometry(frontRoll, 0, 0.422, 0.235);
  seatKit.geo("chair", frontRoll, null);

  // Curved low-profile backrest (Y = 0.47..0.835 -> cleanly below seated shoulders & head!)
  const backMain = new THREE.BoxGeometry(0.45, 0.34, 0.048);
  transformGeometry(backMain, 0, 0.655, -0.215);
  seatKit.geo("chair", backMain, "furniture", 28);

  const backTopRoll = new THREE.CylinderGeometry(0.024, 0.024, 0.45, 12);
  backTopRoll.rotateZ(Math.PI / 2);
  transformGeometry(backTopRoll, 0, 0.825, -0.215);
  seatKit.geo("chair", backTopRoll, null);

  // Slight wrap side bolsters on backrest
  for (const side of [-1, 1] as const) {
    const bolster = new THREE.BoxGeometry(0.046, 0.32, 0.068);
    transformGeometry(bolster, side * 0.218, 0.65, -0.19, -side * 0.22);
    seatKit.geo("chair", bolster, "detail", 32);

    // Low sleek conference armrests (top at 0.635 m, well below table & shoulders)
    baseKit.box("chairBase", side * 0.24 - 0.012, 0.42, -0.12, side * 0.24 + 0.012, 0.615, -0.08, "detail");
    baseKit.box("chairBase", side * 0.24 - 0.012, 0.42, 0.08, side * 0.24 + 0.012, 0.615, 0.12, "detail");
    seatKit.box("chair", side * 0.24 - 0.022, 0.612, -0.16, side * 0.24 + 0.022, 0.642, 0.15, "detail");
  }

  // Spine support connecting seat to rear of backrest (flush behind cushion)
  baseKit.box("chairBase", -0.036, 0.41, -0.272, 0.036, 0.64, -0.24, "detail");

  const seatGeo = bucketToGeometry(seatKit.buckets.chair);
  const baseGeo = bucketToGeometry(baseKit.buckets.chairBase);
  const linesGeo = [
    ...seatKit.lines.furniture,
    ...seatKit.lines.detail,
    ...baseKit.lines.furniture,
    ...baseKit.lines.detail,
  ];

  return {
    seatGeo,
    baseGeo,
    linesGeo,
    dispose() {
      seatGeo.dispose();
      baseGeo.dispose();
    },
  };
}

/**
 * Dedicated Upper-Floor Virtual Meeting Room module.
 * Cleanly separated from general office navigation & interaction logic.
 * - Dynamically scales circular conference table, chair ring, and architectural room shell
 *   for variable meeting sizes (default 5 demo participants, scalable to 20+ without overlap).
 * - Implements stationary seated camera with strictly horizontal-only mouse viewing
 *   (no walking, no vertical camera tilt, clear face visibility for immediate neighbors & across table).
 */
export function createVirtualMeetingRoom(
  host: HTMLDivElement,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  masterAssets: StickmanMasterAssets,
  materials: AtriumMaterials,
  onRequestExit?: () => void,
): VirtualMeetingRoom {
  const group = new THREE.Group();
  group.name = "upper-floor-virtual-meeting-room";

  const roomDynamicGroup = new THREE.Group();
  roomDynamicGroup.name = "meeting-room-shell-and-table";
  group.add(roomDynamicGroup);

  const participantsGroup = new THREE.Group();
  participantsGroup.name = "meeting-room-participants";
  group.add(participantsGroup);

  // Dedicated soft architectural lighting for the upper-floor conference room
  const lightsGroup = new THREE.Group();
  lightsGroup.name = "meeting-room-lights";
  const ringPendantLight = new THREE.PointLight(0xfff1d6, 1.35, 16, 1.0);
  const softFillA = new THREE.PointLight(0xf6f9ff, 0.58, 15, 1.0);
  const softFillB = new THREE.PointLight(0xfff4e2, 0.52, 15, 1.0);
  lightsGroup.add(ringPendantLight, softFillA, softFillB);
  group.add(lightsGroup);

  const chairProto = createConferenceChairPrototypes();
  let dynamicDisposables: THREE.BufferGeometry[] = [];
  let dynamicMaterials: THREE.Material[] = [];

  let participants: MeetingParticipantSpec[] = createDefaultMeetingParticipants(5);
  let characters: StickmanInstance[] = [];
  let layout: MeetingLayoutMetrics = computeMeetingLayout(participants.length);
  let roomCenterX = 0;
  let roomCenterZ = DOOR_WALL_Z - layout.roomHalfSpan;

  // Seated camera state (strictly stationary position, strictly locked horizontal-only pitch)
  let active = false;
  let yaw = 0;
  let targetYaw = 0;
  let hoverYaw = 0;
  let dragYawOffset = 0;
  let isDragging = false;
  let lastPointerX = 0;
  let activePointerId: number | null = null;

  // Smooth enter/exit camera transition (zero loading screens)
  let transitionState: null | {
    kind: "enter" | "exit";
    elapsed: number;
    duration: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromYaw: number;
    toYaw: number;
    fromPitch: number;
    toPitch: number;
    onComplete?: () => void;
  } = null;

  // Minimal Glassmorphism active meeting status bar
  const statusPillEl = document.createElement("div");
  statusPillEl.className = "atrium-active-pill atrium-meeting-pill";
  statusPillEl.setAttribute("data-name", "Meeting Room / Status");
  statusPillEl.setAttribute("aria-hidden", "true");

  const pillDot = document.createElement("span");
  pillDot.className = "atrium-active-dot";
  const statusTextEl = document.createElement("span");
  statusTextEl.className = "atrium-active-text";
  statusPillEl.append(pillDot, statusTextEl);
  host.append(statusPillEl);

  const updateStatusText = () => {
    statusTextEl.textContent = `Virtual Meeting (${participants.length} participants) · Move mouse left/right to look · Press E or Esc to leave`;
  };
  updateStatusText();

  const getUserEyePosition = (out = new THREE.Vector3()): THREE.Vector3 => {
    // Seated cleanly at seat 0 (south of circular table), slightly forward of backrest for optimal face framing
    return out.set(roomCenterX, USER_EYE_Y, roomCenterZ + layout.chairRadius - 0.14);
  };

  const getAdaptiveHoverYaw = (): number => {
    // Immediate neighbor angle on the circle is (90° - 180°/totalSeats); add 12° breathing margin
    const neighborAngle = Math.PI * 0.5 - Math.PI / layout.totalSeats;
    return Math.min(MAX_HOVER_YAW, neighborAngle + THREE.MathUtils.degToRad(12));
  };

  function clearDynamicBuild(): void {
    roomDynamicGroup.clear();
    participantsGroup.clear();
    characters = [];
    for (const g of dynamicDisposables) g.dispose();
    for (const m of dynamicMaterials) m.dispose();
    dynamicDisposables = [];
    dynamicMaterials = [];
  }

  function addDynamicMesh(
    parent: THREE.Object3D,
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    castShadow = false,
    receiveShadow = true,
    renderOrder = 0,
  ): THREE.Mesh | null {
    if (!geo.attributes.position || geo.attributes.position.count === 0) {
      geo.dispose();
      return null;
    }
    dynamicDisposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    return mesh;
  }

  /**
   * Rebuilds the room shell, circular conference table, chair ring, and seated demo stickmen
   * cleanly for the current participant list.
   */
  function rebuildMeetingRoom(): void {
    clearDynamicBuild();

    layout = computeMeetingLayout(participants.length);
    const R = layout.roomHalfSpan;
    const wallT = 0.24;
    // Keep room centered symmetrically at X = 0 for normal sizes
    roomCenterX = 0;
    roomCenterZ = DOOR_WALL_Z - R;

    const x0 = roomCenterX - R;
    const x1 = roomCenterX + R;
    const zSouth = DOOR_WALL_Z; // Inner face of south wall (aligned behind atrium north wall)
    const zNorth = roomCenterZ - R;
    const y0 = FLOOR_Y;
    const y1 = CEIL_Y;

    // Position dedicated conference lights smoothly above the circular table
    ringPendantLight.position.set(roomCenterX, y1 - 0.62, roomCenterZ);
    ringPendantLight.distance = Math.max(15, R * 3.1);
    softFillA.position.set(roomCenterX - R * 0.45, y0 + 2.15, roomCenterZ + R * 0.42);
    softFillA.distance = Math.max(14, R * 2.8);
    softFillB.position.set(roomCenterX + R * 0.45, y0 + 2.15, roomCenterZ - R * 0.35);
    softFillB.distance = Math.max(14, R * 2.8);

    const kit = new GeometryKit();

    // ---- 1. Architectural Conference Room Shell (Matte White Walls & Ceiling + Warm-Gray Floor) ----
    const shell = new RectSolid();
    const zSouthOut = zSouth + 0.04;
    // Floor slab & ceiling slab (flush with all 4 exterior wall edges — zero corner line artifacts!)
    shell.add(x0 - wallT, y0 - 0.28, zNorth - wallT, x1 + wallT, y0, zSouthOut);
    shell.add(x0 - wallT, y1, zNorth - wallT, x1 + wallT, y1 + 0.26, zSouthOut);
    // West, East, North & South walls
    shell.add(x0 - wallT, y0, zNorth - wallT, x0, y1, zSouthOut);
    shell.add(x1, y0, zNorth - wallT, x1 + wallT, y1, zSouthOut);
    shell.add(x0 - wallT, y0, zNorth - wallT, x1 + wallT, y1, zNorth);
    shell.add(x0 - wallT, y0, zSouth, x1 + wallT, y1, zSouthOut);

    // Carve modern horizontal panoramic windows on West & East walls, plus TWO balanced flanking windows
    // on the North wall leaving a clean solid architectural wall center for the presentation display
    const winSillY = y0 + 0.88;
    const winHeadY = y1 - 0.48;
    const winInset = 1.05;
    const northBoardHalf = Math.min(1.58, R * 0.34);
    shell.sub(x0 + winInset, winSillY, zNorth - wallT - 0.05, roomCenterX - northBoardHalf, winHeadY, zNorth + 0.05);
    shell.sub(roomCenterX + northBoardHalf, winSillY, zNorth - wallT - 0.05, x1 - winInset, winHeadY, zNorth + 0.05);
    shell.sub(x0 - wallT - 0.05, winSillY, zNorth + winInset, x0 + 0.05, winHeadY, zSouth - winInset);
    shell.sub(x1 - 0.05, winSillY, zNorth + winInset, x1 + wallT + 0.05, winHeadY, zSouth - winInset);

    const builtShell = shell.build(undefined, [y0]);
    addDynamicMesh(roomDynamicGroup, "meeting-shell-walls", builtShell.geometry, materials.clay, false, true);
    addDynamicMesh(roomDynamicGroup, "meeting-shell-floor", builtShell.floorGeometry, materials.floor, false, true);
    const shellLines = materials.createLines("structure", builtShell.edges);
    if (shellLines) {
      dynamicDisposables.push(shellLines.geometry);
      roomDynamicGroup.add(shellLines);
    }

    // Glazed mullions & reflective cool-blue tinted windows on North (flanking), West, and East walls
    const addMeetingWindowBank = (
      axis: "z" | "x",
      fixedCoord: number,
      spanStart: number,
      spanEnd: number,
      bays: number,
    ) => {
      const frame = new RectSolid();
      const ft = 0.05;
      if (axis === "z") {
        frame.add(spanStart, winSillY, fixedCoord - ft, spanEnd, winSillY + ft, fixedCoord + ft);
        frame.add(spanStart, winHeadY - ft, fixedCoord - ft, spanEnd, winHeadY, fixedCoord + ft);
        for (let i = 0; i <= bays; i++) {
          const mx = spanStart + ((spanEnd - spanStart) * i) / bays;
          frame.add(mx - 0.028, winSillY, fixedCoord - ft, mx + 0.028, winHeadY, fixedCoord + ft);
          if (i < bays) {
            const nx = spanStart + ((spanEnd - spanStart) * (i + 1)) / bays;
            kit.box("glass", mx + 0.028, winSillY + ft, fixedCoord - 0.008, nx - 0.028, winHeadY - ft, fixedCoord + 0.008, null);
          }
        }
      } else {
        frame.add(fixedCoord - ft, winSillY, spanStart, fixedCoord + ft, winSillY + ft, spanEnd);
        frame.add(fixedCoord - ft, winHeadY - ft, spanStart, fixedCoord + ft, winHeadY, spanEnd);
        for (let i = 0; i <= bays; i++) {
          const mz = spanStart + ((spanEnd - spanStart) * i) / bays;
          frame.add(fixedCoord - ft, winSillY, mz - 0.028, fixedCoord + ft, winHeadY, mz + 0.028);
          if (i < bays) {
            const nz = spanStart + ((spanEnd - spanStart) * (i + 1)) / bays;
            kit.box("glass", fixedCoord - 0.008, winSillY + ft, mz + 0.028, fixedCoord + 0.008, winHeadY - ft, nz - 0.028, null);
          }
        }
      }
      kit.solid("clay", frame, "detail");
    };

    const sideWindowBays = Math.max(3, Math.round((R * 2 - winInset * 2) / 1.8));
    const northFlankBays = Math.max(1, Math.round((R - winInset - northBoardHalf) / 1.4));
    addMeetingWindowBank("z", zNorth - wallT * 0.5, x0 + winInset, roomCenterX - northBoardHalf, northFlankBays);
    addMeetingWindowBank("z", zNorth - wallT * 0.5, roomCenterX + northBoardHalf, x1 - winInset, northFlankBays);
    addMeetingWindowBank("x", x0 - wallT * 0.5, zNorth + winInset, zSouth - winInset, sideWindowBays);
    addMeetingWindowBank("x", x1 + wallT * 0.5, zNorth + winInset, zSouth - winInset, sideWindowBays);

    // Subtle acoustic architectural wall ribs & baseboard trim
    kit.box("clay", x0, y0, zNorth, x1, y0 + 0.08, zNorth + 0.02, "detail");
    kit.box("clay", x0, y0, zSouth - 0.02, x1, y0 + 0.08, zSouth, "detail");
    kit.box("clay", x0, y0, zNorth, x0 + 0.02, y0 + 0.08, zSouth, "detail");
    kit.box("clay", x1 - 0.02, y0, zNorth, x1, y0 + 0.08, zSouth, "detail");

    // Subtle floor tile joint grid
    const grid = 1.15;
    for (let gx = x0 + grid; gx < x1 - 0.2; gx += grid) {
      kit.segment("floorGrid", gx, y0 + 0.001, zNorth + 0.05, gx, y0 + 0.001, zSouth - 0.05);
    }
    for (let gz = zNorth + grid; gz < zSouth - 0.2; gz += grid) {
      kit.segment("floorGrid", x0 + 0.05, y0 + 0.001, gz, x1 - 0.05, y0 + 0.001, gz);
    }

    // ---- 2. Visible Interior Entrance Door on South Wall (aligned with landing door at X = 3.05) ----
    {
      const dx = THREE.MathUtils.clamp(DOOR_X, x0 + 0.9, x1 - 0.9);
      const dw = 1.06;
      const dh = 2.28;
      const dz = zSouth;
      const frame = new RectSolid();
      frame.add(dx - dw / 2 - 0.07, y0, dz - 0.08, dx - dw / 2, y0 + dh + 0.07, dz);
      frame.add(dx + dw / 2, y0, dz - 0.08, dx + dw / 2 + 0.07, y0 + dh + 0.07, dz);
      frame.add(dx - dw / 2 - 0.07, y0 + dh, dz - 0.08, dx + dw / 2 + 0.07, y0 + dh + 0.07, dz);
      kit.solid("clay", frame, "structure");

      // Door leaf + vision lite + pull handle + blue architectural transom bar
      kit.box("desk", dx - dw / 2, y0 + 0.01, dz - 0.05, dx + dw / 2, y0 + dh, dz - 0.005, "structure");
      kit.box("glass", dx - 0.24, y0 + 0.92, dz - 0.058, dx + 0.24, y0 + dh - 0.22, dz - 0.05, null);
      kit.box("accentBlue", dx - dw / 2 - 0.07, y0 + dh + 0.07, dz - 0.06, dx + dw / 2 + 0.07, y0 + dh + 0.14, dz, "detail");
      kit.box("accentGold", dx - 0.38, y0 + 0.96, dz - 0.095, dx - 0.355, y0 + 1.32, dz - 0.05, "detail");
    }

    // ---- 3. Executive Office Details: Subtle Credenza & Corner Plants (well clear of table ring) ----
    {
      // Sleek matte neutral credenza against the north wall center
      const credW = Math.min(2.6, R * 0.56);
      kit.box("desk", roomCenterX - credW / 2, y0 + 0.08, zNorth + 0.04, roomCenterX + credW / 2, y0 + 0.72, zNorth + 0.48, "furniture");
      kit.box("chairBase", roomCenterX - credW / 2 + 0.08, y0, zNorth + 0.08, roomCenterX + credW / 2 - 0.08, y0 + 0.08, zNorth + 0.44, "detail");

      // Wall-mounted presentation screen / acoustic board on north wall above credenza (does not block any participant)
      const boardW = Math.min(2.8, R * 0.62);
      kit.box("tech", roomCenterX - boardW / 2, y0 + 1.18, zNorth + 0.02, roomCenterX + boardW / 2, y0 + 2.38, zNorth + 0.055, "detail");
      kit.box("accentBlue", roomCenterX - boardW / 2 + 0.04, y0 + 1.22, zNorth + 0.055, roomCenterX + boardW / 2 - 0.04, y0 + 2.34, zNorth + 0.062, null);

      // Two corner botanical planters for soft architectural warmth
      for (const side of [-1, 1] as const) {
        const px = side < 0 ? x0 + 0.56 : x1 - 0.56;
        const pz = zNorth + 0.56;
        const pot = new THREE.CylinderGeometry(0.22, 0.17, 0.42, 16);
        transformGeometry(pot, px, y0 + 0.21, pz);
        kit.geo("clay", pot, "furniture", 30);

        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + side * 0.4;
          const h = 0.58 + (i % 3) * 0.14;
          const leafGeo = new THREE.ConeGeometry(0.075, h, 5);
          leafGeo.scale(1.0, 1.0, 0.28);
          leafGeo.translate(0, h * 0.5, 0);
          leafGeo.rotateX(0.32 + (i % 2) * 0.16);
          leafGeo.rotateY(ang);
          leafGeo.translate(px, y0 + 0.39, pz);
          kit.geo("plant", leafGeo, null);
        }
      }
    }

    // ---- 4. Warm Champagne-Gold Circular Architectural Ring Pendant Overhead ----
    {
      const pendantR = Math.min(layout.tableRadius * 0.82, 2.15);
      const pendantY = y1 - 0.48;
      const ringGeo = new THREE.TorusGeometry(pendantR, 0.036, 12, 48);
      ringGeo.rotateX(Math.PI / 2);
      ringGeo.translate(roomCenterX, pendantY, roomCenterZ);
      kit.geo("accentGold", ringGeo, "detail", 36);

      // 4 crisp suspension rods to ceiling
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const rod = new THREE.CylinderGeometry(0.008, 0.008, 0.48, 8);
        transformGeometry(rod, roomCenterX + Math.cos(a) * pendantR, pendantY + 0.24, roomCenterZ + Math.sin(a) * pendantR);
        kit.geo("chairBase", rod, null);
      }
    }

    // ---- 5. Large Circular Conference Table (clean, beveled, zero face-blocking objects) ----
    {
      const tr = layout.tableRadius;
      const segs = Math.max(48, Math.min(96, Math.round(tr * 36)));

      // Main circular tabletop (matte light neutral, Y = TABLE_TOP_Y - TABLE_THICKNESS .. TABLE_TOP_Y)
      const topMain = new THREE.CylinderGeometry(tr, tr - 0.025, TABLE_THICKNESS, segs);
      transformGeometry(topMain, roomCenterX, TABLE_TOP_Y - TABLE_THICKNESS / 2, roomCenterZ);
      kit.geo("desk", topMain, "furniture", 28);

      // Subtle architectural recessed brass/champagne-gold center cable inlay ring (completely flat)
      const inlayR = Math.min(0.42, tr * 0.24);
      const inlay = new THREE.CylinderGeometry(inlayR, inlayR, 0.006, 36);
      transformGeometry(inlay, roomCenterX, TABLE_TOP_Y + 0.001, roomCenterZ);
      kit.geo("accentGold", inlay, "detail", 32);

      // Clean circular under-apron support
      const apron = new THREE.CylinderGeometry(tr * 0.72, tr * 0.72, 0.055, segs);
      transformGeometry(apron, roomCenterX, TABLE_TOP_Y - TABLE_THICKNESS - 0.025, roomCenterZ);
      kit.geo("chairBase", apron, null);

      // Architectural central pedestal (fluted clean cylinder + grounded footplate; for huge tables add perimeter drum ring)
      const pedR = Math.max(0.28, tr * 0.22);
      const pedH = TABLE_TOP_Y - TABLE_THICKNESS - y0 - 0.04;
      const pedestal = new THREE.CylinderGeometry(pedR * 0.9, pedR, pedH, 32);
      transformGeometry(pedestal, roomCenterX, y0 + 0.03 + pedH / 2, roomCenterZ);
      kit.geo("clay", pedestal, "furniture", 30);

      const basePlate = new THREE.CylinderGeometry(pedR * 1.38, pedR * 1.44, 0.032, 36);
      transformGeometry(basePlate, roomCenterX, y0 + 0.016, roomCenterZ);
      kit.geo("chairBase", basePlate, "detail", 32);

      // Soft contact shadow directly under circular table
      const shadowGeo = new THREE.PlaneGeometry(tr * 2.25, tr * 2.25);
      dynamicDisposables.push(shadowGeo);
      const shadowMat = materials.createContactShadow(0.14);
      dynamicMaterials.push(shadowMat);
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(roomCenterX, y0 + 0.002, roomCenterZ);
      shadowMesh.renderOrder = 1;
      roomDynamicGroup.add(shadowMesh);
    }

    // Flush bucketed static meeting-room meshes & lines
    const opaqueKinds = [
      "clay",
      "floor",
      "chair",
      "chairBase",
      "sofa",
      "desk",
      "tech",
      "accentBlue",
      "accentBeige",
      "accentGold",
      "plant",
    ] as const;
    for (const kind of opaqueKinds) {
      addDynamicMesh(
        roomDynamicGroup,
        `meeting-${kind}`,
        bucketToGeometry(kit.buckets[kind]),
        materials.byKind[kind],
        false,
        true,
        0,
      );
    }
    addDynamicMesh(
      roomDynamicGroup,
      "meeting-glass",
      bucketToGeometry(kit.buckets.glass),
      materials.glass,
      false,
      false,
      3,
    );

    const lineKinds = ["structure", "furniture", "detail", "floorGrid", "glassGlint"] as const;
    for (const kind of lineKinds) {
      const lineObj = materials.createLines(kind, kit.lines[kind]);
      if (lineObj) {
        dynamicDisposables.push(lineObj.geometry);
        roomDynamicGroup.add(lineObj);
      }
    }

    // ---- 6. Dynamically Arranged Conference Chairs + Demo Stickman Participants ----
    const totalSeats = layout.totalSeats;
    const chairR = layout.chairRadius;
    const seatLinePositions: number[] = [];
    const tmpVec = new THREE.Vector3();

    for (let seatIdx = 0; seatIdx < totalSeats; seatIdx++) {
      // Seat 0 = User's stationary chair at south (angle = 0 -> (centerX, centerZ + chairR), facing -Z).
      // Seat 1 = Immediate LEFT neighbor; Seat totalSeats-1 = Immediate RIGHT neighbor.
      const theta = (2 * Math.PI * seatIdx) / totalSeats;
      const sx = roomCenterX - Math.sin(theta) * chairR;
      const sz = roomCenterZ + Math.cos(theta) * chairR;
      const faceCenterYaw = Math.atan2(roomCenterX - sx, roomCenterZ - sz);

      // Place reusable low-profile conference chair
      const chairGroup = new THREE.Group();
      chairGroup.name = `meeting-chair-${seatIdx}`;
      chairGroup.position.set(sx, y0, sz);
      chairGroup.rotation.y = faceCenterYaw;

      const seatMesh = new THREE.Mesh(chairProto.seatGeo, materials.chair);
      seatMesh.receiveShadow = true;
      const baseMesh = new THREE.Mesh(chairProto.baseGeo, materials.chairBase);
      baseMesh.receiveShadow = true;
      chairGroup.add(seatMesh, baseMesh);
      roomDynamicGroup.add(chairGroup);

      // Transform chair wireframe edges into world space so lines batch into a single draw call
      const cosY = Math.cos(faceCenterYaw);
      const sinY = Math.sin(faceCenterYaw);
      for (let i = 0; i < chairProto.linesGeo.length; i += 3) {
        const lx = chairProto.linesGeo[i];
        const ly = chairProto.linesGeo[i + 1];
        const lz = chairProto.linesGeo[i + 2];
        tmpVec.set(sx + lx * cosY + lz * sinY, y0 + ly, sz - lx * sinY + lz * cosY);
        seatLinePositions.push(tmpVec.x, tmpVec.y, tmpVec.z);
      }

      // Seat 0 belongs to the user; seats 1..participants.length hold demo stickmen
      if (seatIdx > 0 && seatIdx <= participants.length) {
        const spec = participants[seatIdx - 1];
        const inst = masterAssets.createInstance(spec.id, spec.variant, seatIdx * 1.37);
        inst.setPose("seated-meeting");
        inst.root.position.set(sx, y0, sz);
        inst.root.rotation.y = faceCenterYaw;
        participantsGroup.add(inst.root);
        characters.push(inst);
      }
    }

    const chairLines = materials.createLines("furniture", seatLinePositions);
    if (chairLines) {
      dynamicDisposables.push(chairLines.geometry);
      roomDynamicGroup.add(chairLines);
    }

    updateStatusText();

    // If already seated in the meeting room when participant count changes, keep user smoothly seated at seat 0
    if (active && !transitionState) {
      applySeatedCameraPose();
    }
  }

  function applySeatedCameraPose(): void {
    const eye = getUserEyePosition();
    camera.position.copy(eye);
    camera.rotation.order = "YXZ";
    camera.rotation.set(LOCKED_PITCH, yaw, 0);
    const nextFov = camera.aspect < 0.85 ? MEETING_PORTRAIT_FOV : MEETING_FOV;
    if (Math.abs(camera.fov - nextFov) > 0.1) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  function setStatusPillVisible(visible: boolean): void {
    statusPillEl.classList.toggle("is-visible", visible);
    statusPillEl.setAttribute("aria-hidden", String(!visible));
  }

  // ---- Seated Horizontal-Only Mouse & Keyboard Handlers ----
  const cleanups: Array<() => void> = [];

  const onPointerMove = (e: PointerEvent) => {
    if (!active || transitionState) return;
    // STRICTLY HORIZONTAL: clientY / vertical movement is intentionally ignored
    if (isDragging && activePointerId === e.pointerId) {
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      dragYawOffset = THREE.MathUtils.clamp(
        dragYawOffset - dx * 0.0052,
        -Math.PI,
        Math.PI,
      );
      targetYaw = dragYawOffset + hoverYaw;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10) return;
    const nx = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    hoverYaw = -nx * getAdaptiveHoverYaw();
    targetYaw = dragYawOffset + hoverYaw;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!active || transitionState || e.button !== 0) return;
    isDragging = true;
    activePointerId = e.pointerId;
    lastPointerX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    isDragging = false;
    activePointerId = null;
    if (canvas.hasPointerCapture?.(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

    // Exit meeting room cleanly via E or Escape
    if (!e.repeat && (e.code === "Escape" || e.code === "KeyE" || e.key.toLowerCase() === "e")) {
      e.preventDefault();
      onRequestExit?.();
      return;
    }

    // Block walking keys (WASD / Up / Down) so user remains strictly stationary in their chair
    if (
      e.code === "KeyW" ||
      e.code === "KeyA" ||
      e.code === "KeyS" ||
      e.code === "KeyD" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight"
    ) {
      e.preventDefault();
      // Allow subtle horizontal-only look via Left/Right arrows as an accessibility aid
      if (e.code === "ArrowLeft") {
        dragYawOffset = THREE.MathUtils.clamp(dragYawOffset + 0.16, -Math.PI, Math.PI);
        targetYaw = dragYawOffset + hoverYaw;
      } else if (e.code === "ArrowRight") {
        dragYawOffset = THREE.MathUtils.clamp(dragYawOffset - 0.16, -Math.PI, Math.PI);
        targetYaw = dragYawOffset + hoverYaw;
      }
    }
  };

  const onBlur = () => {
    isDragging = false;
    activePointerId = null;
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("blur", onBlur);

  cleanups.push(() => {
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("blur", onBlur);
  });

  // Initial build with 5 demo participants
  rebuildMeetingRoom();

  return {
    group,
    getParticipantCount: () => participants.length,
    setParticipants(specs) {
      participants = specs.map((s) => ({ ...s }));
      rebuildMeetingRoom();
      return { ...layout };
    },
    setParticipantCount(count) {
      participants = createDefaultMeetingParticipants(count);
      rebuildMeetingRoom();
      return { ...layout };
    },
    getCharacters: () => characters,
    isActive: () => active,
    enter(fromPosition, fromYaw, fromPitch, immediate = false) {
      active = true;
      yaw = 0;
      targetYaw = 0;
      hoverYaw = 0;
      dragYawOffset = 0;
      isDragging = false;
      activePointerId = null;

      const eye = getUserEyePosition();
      camera.fov = camera.aspect < 0.85 ? MEETING_PORTRAIT_FOV : MEETING_FOV;
      camera.updateProjectionMatrix();

      if (immediate) {
        transitionState = null;
        applySeatedCameraPose();
      } else {
        transitionState = {
          kind: "enter",
          elapsed: 0,
          duration: TRANSITION_SEC,
          fromPos: fromPosition.clone(),
          toPos: eye.clone(),
          fromYaw,
          toYaw: 0,
          fromPitch,
          toPitch: LOCKED_PITCH,
        };
      }
      setStatusPillVisible(true);
    },
    exit(toPosition, toYaw, toPitch, onComplete, immediate = false) {
      isDragging = false;
      activePointerId = null;
      setStatusPillVisible(false);

      if (immediate || !active) {
        active = false;
        transitionState = null;
        onComplete();
        return;
      }

      transitionState = {
        kind: "exit",
        elapsed: 0,
        duration: TRANSITION_SEC * 0.85,
        fromPos: camera.position.clone(),
        toPos: toPosition.clone(),
        fromYaw: yaw,
        toYaw,
        fromPitch: LOCKED_PITCH,
        toPitch,
        onComplete: () => {
          active = false;
          onComplete();
        },
      };
    },
    setYaw(yawRad) {
      const clamped = THREE.MathUtils.clamp(yawRad, -Math.PI, Math.PI);
      yaw = clamped;
      targetYaw = clamped;
      hoverYaw = clamped;
      dragYawOffset = 0;
      if (active && !transitionState) {
        applySeatedCameraPose();
      }
    },
    steerCursorNormalized(nx, _ny = 0) {
      // Explicitly ignore _ny to guarantee vertical input never tilts the camera
      const clampedX = THREE.MathUtils.clamp(nx, -1, 1);
      hoverYaw = -clampedX * getAdaptiveHoverYaw();
      targetYaw = dragYawOffset + hoverYaw;
    },
    resetView() {
      yaw = 0;
      targetYaw = 0;
      hoverYaw = 0;
      dragYawOffset = 0;
      if (active && !transitionState) {
        applySeatedCameraPose();
      }
    },
    update(timeSec, dtSec) {
      // Animate seated meeting participants continuously when visible/active
      if (active || transitionState) {
        for (const ch of characters) {
          ch.update(timeSec);
        }
      }

      const dt = Math.min(0.05, Math.max(0.001, dtSec));

      if (transitionState) {
        transitionState.elapsed = Math.min(
          transitionState.duration,
          transitionState.elapsed + dt,
        );
        const u = transitionState.elapsed / transitionState.duration;
        const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

        camera.position.lerpVectors(transitionState.fromPos, transitionState.toPos, ease);
        let dYaw = transitionState.toYaw - transitionState.fromYaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;

        const curYaw = transitionState.fromYaw + dYaw * ease;
        const curPitch = THREE.MathUtils.lerp(
          transitionState.fromPitch,
          transitionState.toPitch,
          ease,
        );
        camera.rotation.order = "YXZ";
        camera.rotation.set(curPitch, curYaw, 0);

        if (u >= 1) {
          const done = transitionState;
          transitionState = null;
          if (done.kind === "enter") {
            yaw = 0;
            applySeatedCameraPose();
          } else {
            done.onComplete?.();
          }
        }
        return true;
      }

      if (!active) return false;

      // Smooth damped horizontal-only viewing
      const blend = 1 - Math.exp(-10.5 * dt);
      const diff = targetYaw - yaw;
      if (Math.abs(diff) > 1e-4) {
        yaw += diff * blend;
      } else {
        yaw = targetYaw;
      }
      applySeatedCameraPose();
      return true;
    },
    getDiagnostics() {
      const eye = getUserEyePosition();
      const headWorld = new THREE.Vector3();
      const posDiff = camera.position.distanceTo(eye);

      return {
        active,
        transitioning: transitionState !== null,
        participantCount: participants.length,
        layout: { ...layout },
        cameraPosition: [
          +camera.position.x.toFixed(3),
          +camera.position.y.toFixed(3),
          +camera.position.z.toFixed(3),
        ],
        cameraYawDeg: +THREE.MathUtils.radToDeg(yaw).toFixed(2),
        cameraPitchDeg: +THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(2),
        isPitchLocked: Math.abs(camera.rotation.x - LOCKED_PITCH) < 0.002,
        isPositionStationary: active ? posDiff < 0.005 : true,
        participants: characters.map((ch, idx) => {
          const seatIdx = idx + 1;
          const spec = participants[idx];
          ch.getHeadSocket().getWorldPosition(headWorld);
          const dx = headWorld.x - eye.x;
          const dz = headWorld.z - eye.z;
          // Angle from straight ahead (-Z); positive = left (-X), negative = right (+X)
          const angleRad = Math.atan2(-dx, -dz);
          return {
            id: spec.id,
            name: spec.name,
            variant: spec.variant,
            seatIndex: seatIdx,
            angleDegFromUserForward: +THREE.MathUtils.radToDeg(angleRad).toFixed(1),
            distanceToUserEye: +headWorld.distanceTo(eye).toFixed(3),
            headWorldPos: [
              +headWorld.x.toFixed(3),
              +headWorld.y.toFixed(3),
              +headWorld.z.toFixed(3),
            ],
            rig: ch.getDiagnostics(),
          };
        }),
      };
    },
    dispose() {
      for (const fn of cleanups) fn();
      cleanups.length = 0;
      clearDynamicBuild();
      chairProto.dispose();
      statusPillEl.remove();
    },
  };
}
