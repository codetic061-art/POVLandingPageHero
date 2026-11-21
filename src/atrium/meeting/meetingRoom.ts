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
import {
  MeetingPortraitLibrary,
  createProgrammingCoffeeMug,
  createScreenShareDisplay,
  createWebcamPortraitBillboard,
  createWhiteboardDisplay,
  type MeetingDisplayKind,
  type MeetingWallDisplay,
  type WebcamPortraitController,
  type WhiteboardWallDisplay,
} from "./meetingSurfaces";
import { detectTouchEnvironment } from "../navigation/touchControls";

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

export type MeetingFocusState = "seated" | "zooming-in" | "zoomed" | "writing" | "zooming-out";

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
  focusState: MeetingFocusState;
  hoveredDisplay: MeetingDisplayKind | null;
  focusedDisplay: MeetingDisplayKind | null;
  displayCount: number;
  hasProgrammingMug: boolean;
  viewerChairHidden: boolean;
  portraitCount: number;
  allOriginalHeadsHidden: boolean;
  whiteboardStrokeCount: number;
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
  prepareAssets: () => Promise<void>;
  setTouchMode: (touch: boolean) => void;
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
const TABLE_THICKNESS = 0.052;
const CHAIR_BACK_TOP_Y = FLOOR_Y + 0.835; // Strictly below seated portrait frames
const USER_EYE_Y = FLOOR_Y + 1.155; // Natural eye-level view across portraits, table mug & back-wall displays
const LOCKED_PITCH = -0.02; // Level gaze focused squarely on portraits & wall displays
const MAX_HOVER_YAW = THREE.MathUtils.degToRad(108);
const MEETING_FOV = 54;
const MEETING_PORTRAIT_FOV = 68;
const TRANSITION_SEC = 0.58;
const ZOOM_TRANSITION_SEC = 0.52;

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
  const totalSeats = Math.max(4, participantCount + 1); // seat 0 = viewer position (no chair/avatar rendered)
  const seatArcSpacing = totalSeats <= 8 ? 1.08 : totalSeats <= 14 ? 0.96 : 0.88;
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

  baseKit.box("chairBase", -0.1, 0.38, -0.1, 0.1, 0.42, 0.1, "detail");

  const seat = new THREE.BoxGeometry(0.48, 0.056, 0.45);
  transformGeometry(seat, 0, 0.422, 0.01);
  seatKit.geo("chair", seat, "furniture", 28);

  const frontRoll = new THREE.CylinderGeometry(0.028, 0.028, 0.478, 12);
  frontRoll.rotateZ(Math.PI / 2);
  transformGeometry(frontRoll, 0, 0.422, 0.235);
  seatKit.geo("chair", frontRoll, null);

  const backMain = new THREE.BoxGeometry(0.45, 0.34, 0.048);
  transformGeometry(backMain, 0, 0.655, -0.215);
  seatKit.geo("chair", backMain, "furniture", 28);

  const backTopRoll = new THREE.CylinderGeometry(0.024, 0.024, 0.45, 12);
  backTopRoll.rotateZ(Math.PI / 2);
  transformGeometry(backTopRoll, 0, 0.825, -0.215);
  seatKit.geo("chair", backTopRoll, null);

  for (const side of [-1, 1] as const) {
    const bolster = new THREE.BoxGeometry(0.046, 0.32, 0.068);
    transformGeometry(bolster, side * 0.218, 0.65, -0.19, -side * 0.22);
    seatKit.geo("chair", bolster, "detail", 32);

    baseKit.box("chairBase", side * 0.24 - 0.012, 0.42, -0.12, side * 0.24 + 0.012, 0.615, -0.08, "detail");
    baseKit.box("chairBase", side * 0.24 - 0.012, 0.42, 0.08, side * 0.24 + 0.012, 0.615, 0.12, "detail");
    seatKit.box("chair", side * 0.24 - 0.022, 0.612, -0.16, side * 0.24 + 0.022, 0.642, 0.15, "detail");
  }

  // Spine support flush behind cushion
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
 * Compact low-profile open laptop geometry placed in front of each meeting participant
 * (lid top strictly at ~0.145 m above tabletop so circular portraits remain 100% unobstructed).
 */
interface LaptopPrototype {
  geo: THREE.BufferGeometry;
  lines: number[];
  dispose: () => void;
}

function createMeetingLaptopPrototype(): LaptopPrototype {
  const kit = new GeometryKit();
  // Slim base keyboard deck (width 0.30 m, depth 0.20 m, height 0.014 m)
  kit.box("tech", -0.15, 0, -0.1, 0.15, 0.014, 0.1, "detail");
  // Tilted low-profile screen lid facing the seated participant (-Z = toward participant, +Z = toward table center)
  const lid = new THREE.BoxGeometry(0.3, 0.16, 0.012);
  lid.translate(0, 0.08, 0);
  lid.rotateX(0.32); // Tilted gently back toward table center
  lid.translate(0, 0.012, 0.092);
  kit.geo("tech", lid, "detail", 32);

  const geo = bucketToGeometry(kit.buckets.tech);
  return {
    geo,
    lines: [...kit.lines.detail],
    dispose() {
      geo.dispose();
    },
  };
}

const SCOPED_MEETING_UI_CSS = `
.meeting-context-hint {
  position: absolute;
  top: 22px;
  left: 50%;
  z-index: 39;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 1px solid rgb(186 214 245 / 44%);
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(32 48 72 / 82%), rgb(20 32 52 / 76%));
  box-shadow:
    0 8px 24px rgb(16 28 48 / 24%),
    0 0 18px rgb(86 144 232 / 24%),
    inset 0 1px 0 rgb(255 255 255 / 24%);
  backdrop-filter: blur(12px) saturate(135%);
  -webkit-backdrop-filter: blur(12px) saturate(135%);
  color: #f6f9fd;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  transform: translate(-50%, -6px);
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.meeting-context-hint.is-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.meeting-context-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 5px;
  border-radius: 5px;
  border: 1px solid rgb(255 255 255 / 34%);
  background: rgb(255 255 255 / 16%);
  color: #ffffff;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
}
.meeting-wb-toolbar {
  position: absolute;
  bottom: 72px;
  left: 50%;
  z-index: 41;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgb(186 214 245 / 44%);
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(30 44 68 / 86%), rgb(19 30 48 / 82%));
  box-shadow: 0 10px 26px rgb(16 28 48 / 26%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #f4f8fd;
  font-size: 12px;
  transform: translate(-50%, 8px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease, visibility 180ms ease;
}
.meeting-wb-toolbar.is-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translate(-50%, 0);
}
.meeting-wb-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 45%);
  cursor: pointer;
  padding: 0;
  transition: transform 120ms ease, border-color 120ms ease;
}
.meeting-wb-swatch[aria-pressed="true"] {
  border-color: #ffffff;
  transform: scale(1.18);
  box-shadow: 0 0 0 2px rgb(90 168 255 / 60%);
}
.meeting-wb-clear {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 26%);
  background: rgb(255 255 255 / 12%);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.meeting-wb-clear:hover {
  background: rgb(255 255 255 / 22%);
}
.meeting-touch-actions {
  position: absolute;
  top: max(18px, env(safe-area-inset-top));
  left: 50%;
  z-index: 42;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: calc(100vw - 24px);
  flex-wrap: wrap;
  pointer-events: none;
  transform: translate(-50%, -6px);
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.meeting-touch-actions.is-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.meeting-touch-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid rgb(186 214 245 / 48%);
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(32 48 72 / 86%), rgb(20 32 52 / 82%));
  box-shadow:
    0 8px 22px rgb(16 28 48 / 26%),
    0 0 18px rgb(86 144 232 / 24%),
    inset 0 1px 0 rgb(255 255 255 / 24%);
  backdrop-filter: blur(12px) saturate(135%);
  -webkit-backdrop-filter: blur(12px) saturate(135%);
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 110ms ease, background-color 140ms ease;
}
.meeting-touch-btn:active {
  transform: scale(0.96);
}
.meeting-touch-btn.is-primary {
  border-color: rgb(135 190 255 / 72%);
  background: linear-gradient(135deg, rgb(54 88 214 / 92%), rgb(42 66 168 / 88%));
}
@media (max-width: 639px) {
  .meeting-wb-toolbar {
    bottom: max(76px, calc(64px + env(safe-area-inset-bottom)));
    padding: 8px 14px;
    gap: 10px;
  }
  .meeting-wb-swatch {
    width: 26px;
    height: 26px;
  }
  .meeting-wb-clear {
    min-height: 32px;
    padding: 4px 12px;
    font-size: 12px;
  }
}
`;

/**
 * Dedicated Upper-Floor Virtual Meeting Room module (strictly self-contained).
 * - Hybrid 3D architectural meeting room + flat 2D circular human webcam portrait frames
 *   attached to original 3D stickman bodies (original 3D heads hidden, ready for live video textures).
 * - Viewer seat & avatar completely omitted from foreground.
 * - Exactly TWO independent back-wall displays: Screen Sharing desktop dashboard & Glass Whiteboard.
 * - Proper 3D raycasting mouse targeting, hover highlight, Press Z to Zoom, Press A to Write
 *   (whiteboard only), and layered Esc return that never accidentally exits the meeting room.
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

  const roomShellGroup = new THREE.Group();
  roomShellGroup.name = "meeting-room-shell-and-table";
  group.add(roomShellGroup);

  const displaysGroup = new THREE.Group();
  displaysGroup.name = "meeting-room-back-displays";
  group.add(displaysGroup);

  const chairsAndPropsGroup = new THREE.Group();
  chairsAndPropsGroup.name = "meeting-room-chairs-and-props";
  group.add(chairsAndPropsGroup);

  const participantsGroup = new THREE.Group();
  participantsGroup.name = "meeting-room-participants";
  group.add(participantsGroup);

  // Dedicated soft warm-neutral architectural lighting for the conference room
  const lightsGroup = new THREE.Group();
  lightsGroup.name = "meeting-room-lights";
  const ringPendantLight = new THREE.PointLight(0xfff4df, 1.38, 16, 1.0);
  const softFillA = new THREE.PointLight(0xf6f9ff, 0.62, 15, 1.0);
  const softFillB = new THREE.PointLight(0xfff5e6, 0.56, 15, 1.0);
  lightsGroup.add(ringPendantLight, softFillA, softFillB);
  group.add(lightsGroup);

  const chairProto = createConferenceChairPrototypes();
  const laptopProto = createMeetingLaptopPrototype();
  let forceRenderFlag = false;
  let lastIdleAnimSec = -1;
  const portraitLibrary = new MeetingPortraitLibrary(() => {
    forceRenderFlag = true;
  });

  // Dedicated matte warm-sand conference tabletop materials matching reference aesthetic
  const warmTableMat = new THREE.MeshStandardMaterial({
    name: "meeting-table-warm",
    color: new THREE.Color("#e8c59e"),
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: 0.14,
  });
  const warmInlayMat = new THREE.MeshStandardMaterial({
    name: "meeting-table-inlay",
    color: new THREE.Color("#caa27a"),
    roughness: 0.84,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });

  let dynamicDisposables: THREE.BufferGeometry[] = [];
  let dynamicMaterials: THREE.Material[] = [];
  let dynamicCleanups: Array<() => void> = [];
  let portraitControllers: WebcamPortraitController[] = [];

  let screenDisplay: MeetingWallDisplay | null = null;
  let whiteboardDisplay: WhiteboardWallDisplay | null = null;
  let hasProgrammingMug = false;

  let participants: MeetingParticipantSpec[] = createDefaultMeetingParticipants(5);
  let characters: StickmanInstance[] = [];
  let layout: MeetingLayoutMetrics = computeMeetingLayout(participants.length);
  let roomCenterX = 0;
  let roomCenterZ = DOOR_WALL_Z - layout.roomHalfSpan;

  // Seated camera state (strictly stationary position, strictly locked horizontal-only pitch when seated)
  let active = false;
  let yaw = 0;
  let targetYaw = 0;
  let hoverYaw = 0;
  let dragYawOffset = 0;
  let isDraggingLook = false;
  let lastPointerX = 0;
  let activePointerId: number | null = null;

  // Display raycasting, zoom & whiteboard writing state machine
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2(0, 0);
  let pointerTracked = false;
  let focusState: MeetingFocusState = "seated";
  let hoveredDisplay: MeetingDisplayKind | null = null;
  let focusedDisplay: MeetingDisplayKind | null = null;

  // Whiteboard drawing interaction state
  let activeMarkerColor = "#22345a";
  let isDrawingStroke = false;
  let drawPointerId: number | null = null;
  let lastDrawUV: { u: number; v: number } | null = null;

  // Smooth zoom-in / zoom-out camera interpolation state
  let zoomAnim: null | {
    kind: "in" | "out";
    elapsed: number;
    duration: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromQuat: THREE.Quaternion;
    toQuat: THREE.Quaternion;
  } = null;
  const savedSeatedPos = new THREE.Vector3();
  let savedSeatedYaw = 0;

  // Smooth enter/exit meeting-room transition (zero loading screens)
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

  // Self-contained scoped styles & minimal contextual hints (owned & cleaned up by meeting room)
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-meeting-room-ui", "true");
  styleEl.textContent = SCOPED_MEETING_UI_CSS;
  document.head.append(styleEl);

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

  // Subtle top-center contextual hint pill (Press Z to Zoom / Press A to Write / Press Esc to Return)
  const contextHintEl = document.createElement("div");
  contextHintEl.className = "meeting-context-hint";
  contextHintEl.setAttribute("data-name", "Meeting Room / Context hint");
  contextHintEl.setAttribute("aria-live", "polite");
  contextHintEl.setAttribute("aria-hidden", "true");
  host.append(contextHintEl);

  // Minimal floating whiteboard marker bar (ONLY visible while actively writing on whiteboard)
  const wbToolbarEl = document.createElement("div");
  wbToolbarEl.className = "meeting-wb-toolbar";
  wbToolbarEl.setAttribute("data-name", "Meeting Room / Whiteboard tools");
  wbToolbarEl.setAttribute("aria-hidden", "true");

  const wbLabel = document.createElement("span");
  wbLabel.textContent = "Marker:";
  wbLabel.style.fontWeight = "600";
  wbToolbarEl.append(wbLabel);

  const swatchColors = [
    { name: "Navy", hex: "#22345a" },
    { name: "Blue", hex: "#2f6fed" },
    { name: "Coral", hex: "#d94b64" },
    { name: "Green", hex: "#228b5b" },
  ];
  const swatchButtons: HTMLButtonElement[] = [];
  for (const sc of swatchColors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "meeting-wb-swatch";
    btn.title = sc.name;
    btn.setAttribute("aria-label", `${sc.name} marker`);
    btn.setAttribute("aria-pressed", String(sc.hex === activeMarkerColor));
    btn.style.background = sc.hex;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      activeMarkerColor = sc.hex;
      for (const b of swatchButtons) {
        b.setAttribute("aria-pressed", String(b === btn));
      }
    });
    swatchButtons.push(btn);
    wbToolbarEl.append(btn);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "meeting-wb-clear";
  clearBtn.textContent = "Reset notes";
  clearBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    whiteboardDisplay?.clearUserDrawings();
    forceRenderFlag = true;
  });
  wbToolbarEl.append(clearBtn);
  host.append(wbToolbarEl);

  // Contextual touchscreen action buttons (visible ONLY on touch devices when actions are available)
  let touchMode = detectTouchEnvironment();
  let lastTouchActionAt = 0;
  const runTouchGuarded = (fn: () => void) => {
    const now = performance.now();
    if (now - lastTouchActionAt < 260) return;
    lastTouchActionAt = now;
    fn();
  };

  const touchActionsEl = document.createElement("div");
  touchActionsEl.className = "meeting-touch-actions";
  touchActionsEl.setAttribute("data-name", "Meeting Room / Touch actions");
  touchActionsEl.setAttribute("aria-hidden", "true");

  const touchZoomBtn = document.createElement("button");
  touchZoomBtn.type = "button";
  touchZoomBtn.className = "meeting-touch-btn is-primary";
  touchZoomBtn.setAttribute("data-touch-action", "zoom");
  touchZoomBtn.textContent = "Tap to Zoom";
  touchZoomBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    runTouchGuarded(() => {
      if (focusState === "seated" && hoveredDisplay) {
        startZoomToDisplay(hoveredDisplay);
      }
    });
  });

  const touchWriteBtn = document.createElement("button");
  touchWriteBtn.type = "button";
  touchWriteBtn.className = "meeting-touch-btn is-primary";
  touchWriteBtn.setAttribute("data-touch-action", "write");
  touchWriteBtn.textContent = "Tap to Write";
  touchWriteBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    runTouchGuarded(() => {
      if (focusState === "zoomed" && focusedDisplay === "whiteboard") {
        enterWhiteboardWritingMode();
      }
    });
  });

  const touchReturnBtn = document.createElement("button");
  touchReturnBtn.type = "button";
  touchReturnBtn.className = "meeting-touch-btn";
  touchReturnBtn.setAttribute("data-touch-action", "return");
  touchReturnBtn.textContent = "Tap to Return";
  touchReturnBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    runTouchGuarded(() => {
      if (focusState !== "seated") {
        startReturnFromZoom();
      }
    });
  });

  const touchLeaveBtn = document.createElement("button");
  touchLeaveBtn.type = "button";
  touchLeaveBtn.className = "meeting-touch-btn";
  touchLeaveBtn.setAttribute("data-touch-action", "leave");
  touchLeaveBtn.textContent = "Tap to Leave";
  touchLeaveBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    runTouchGuarded(() => {
      if (focusState === "seated") {
        onRequestExit?.();
      }
    });
  });

  touchActionsEl.append(touchZoomBtn, touchWriteBtn, touchReturnBtn, touchLeaveBtn);
  host.append(touchActionsEl);

  let lastHintMarkup = "";
  function syncContextualUI(): void {
    if (!active || transitionState) {
      contextHintEl.classList.remove("is-visible");
      contextHintEl.setAttribute("aria-hidden", "true");
      touchActionsEl.classList.remove("is-visible");
      touchActionsEl.setAttribute("aria-hidden", "true");
      wbToolbarEl.classList.remove("is-visible");
      wbToolbarEl.setAttribute("aria-hidden", "true");
      canvas.style.cursor = "";
      return;
    }

    const showStatus = focusState === "seated" && !touchMode;
    statusPillEl.classList.toggle("is-visible", showStatus);
    statusPillEl.setAttribute("aria-hidden", String(!showStatus));

    if (touchMode) {
      // Hide desktop keyboard hint pill; show ONLY currently available single-tap touch buttons
      contextHintEl.classList.remove("is-visible");
      contextHintEl.setAttribute("aria-hidden", "true");

      const canZoom = focusState === "seated" && hoveredDisplay !== null;
      const canWrite = focusState === "zoomed" && focusedDisplay === "whiteboard";
      const canReturn = focusState === "zoomed" || focusState === "writing" || focusState === "zooming-in";
      const canLeave = focusState === "seated";

      touchZoomBtn.style.display = canZoom ? "inline-flex" : "none";
      if (canZoom) {
        touchZoomBtn.textContent =
          hoveredDisplay === "whiteboard" ? "Tap to Zoom · Whiteboard" : "Tap to Zoom · Screen";
      }
      touchWriteBtn.style.display = canWrite ? "inline-flex" : "none";
      touchReturnBtn.style.display = canReturn ? "inline-flex" : "none";
      touchLeaveBtn.style.display = canLeave ? "inline-flex" : "none";

      const anyTouchAction = canZoom || canWrite || canReturn || canLeave;
      touchActionsEl.classList.toggle("is-visible", anyTouchAction);
      touchActionsEl.setAttribute("aria-hidden", String(!anyTouchAction));
    } else {
      touchActionsEl.classList.remove("is-visible");
      touchActionsEl.setAttribute("aria-hidden", "true");

      let hintMarkup = "";
      if (focusState === "seated" && hoveredDisplay) {
        hintMarkup = `Press <kbd>Z</kbd> to Zoom`;
      } else if (focusState === "zoomed" || focusState === "zooming-in") {
        if (focusedDisplay === "whiteboard") {
          hintMarkup = `Press <kbd>A</kbd> to Write &nbsp;·&nbsp; Press <kbd>Esc</kbd> to Return`;
        } else {
          hintMarkup = `Press <kbd>Esc</kbd> to Return`;
        }
      } else if (focusState === "writing") {
        hintMarkup = `Drag on Whiteboard to Write &nbsp;·&nbsp; Press <kbd>Esc</kbd> to Return`;
      }

      if (hintMarkup !== lastHintMarkup) {
        lastHintMarkup = hintMarkup;
        contextHintEl.innerHTML = hintMarkup;
      }
      const hintVisible = hintMarkup.length > 0;
      contextHintEl.classList.toggle("is-visible", hintVisible);
      contextHintEl.setAttribute("aria-hidden", String(!hintVisible));
    }

    const writingNow = focusState === "writing";
    wbToolbarEl.classList.toggle("is-visible", writingNow);
    wbToolbarEl.setAttribute("aria-hidden", String(!writingNow));
    canvas.style.cursor = writingNow
      ? "crosshair"
      : focusState === "seated" && hoveredDisplay
        ? "pointer"
        : "";
  }

  const updateStatusText = () => {
    statusTextEl.textContent = `Virtual Meeting (${participants.length} participants) · Move mouse to look & target displays · Press E or Esc to leave`;
  };
  updateStatusText();

  const getUserEyePosition = (out = new THREE.Vector3()): THREE.Vector3 => {
    // Viewer sits behind the camera at seat 0 (no viewer chair or avatar rendered)
    return out.set(roomCenterX, USER_EYE_Y, roomCenterZ + layout.chairRadius - 0.12);
  };

  const getAdaptiveHoverYaw = (): number => {
    const neighborAngle = Math.PI * 0.5 - Math.PI / layout.totalSeats;
    return Math.min(MAX_HOVER_YAW, neighborAngle + THREE.MathUtils.degToRad(12));
  };

  function getDisplayByKind(kind: MeetingDisplayKind | null): MeetingWallDisplay | null {
    if (kind === "screen") return screenDisplay;
    if (kind === "whiteboard") return whiteboardDisplay;
    return null;
  }

  function setParticipantsVisibleForFocus(visible: boolean): void {
    participantsGroup.visible = visible;
    chairsAndPropsGroup.visible = visible;
  }

  function clearDynamicBuild(): void {
    roomShellGroup.clear();
    displaysGroup.clear();
    chairsAndPropsGroup.clear();
    participantsGroup.clear();
    characters = [];
    for (const pc of portraitControllers) pc.dispose();
    portraitControllers = [];
    for (const fn of dynamicCleanups) fn();
    dynamicCleanups = [];
    screenDisplay = null;
    whiteboardDisplay = null;
    hasProgrammingMug = false;
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

  function rebuildMeetingRoom(): void {
    clearDynamicBuild();

    layout = computeMeetingLayout(participants.length);
    const R = layout.roomHalfSpan;
    const wallT = 0.24;
    roomCenterX = 0;
    roomCenterZ = DOOR_WALL_Z - R;

    const x0 = roomCenterX - R;
    const x1 = roomCenterX + R;
    const zSouth = DOOR_WALL_Z;
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

    // ---- 1. Architectural Conference Room Shell (Clean solid North wall for 2 displays + West/East daylight windows) ----
    const shell = new RectSolid();
    const zSouthOut = zSouth + 0.04;
    shell.add(x0 - wallT, y0 - 0.28, zNorth - wallT, x1 + wallT, y0, zSouthOut);
    shell.add(x0 - wallT, y1, zNorth - wallT, x1 + wallT, y1 + 0.26, zSouthOut);
    shell.add(x0 - wallT, y0, zNorth - wallT, x0, y1, zSouthOut);
    shell.add(x1, y0, zNorth - wallT, x1 + wallT, y1, zSouthOut);
    shell.add(x0 - wallT, y0, zNorth - wallT, x1 + wallT, y1, zNorth);
    shell.add(x0 - wallT, y0, zSouth, x1 + wallT, y1, zSouthOut);

    // Panoramic modern side windows on West (left) & East (right) walls matching reference image
    const winSillY = y0 + 0.84;
    const winHeadY = y1 - 0.46;
    const winInset = 1.05;
    shell.sub(x0 - wallT - 0.05, winSillY, zNorth + winInset, x0 + 0.05, winHeadY, zSouth - winInset);
    shell.sub(x1 - 0.05, winSillY, zNorth + winInset, x1 + wallT + 0.05, winHeadY, zSouth - winInset);

    const builtShell = shell.build(undefined, [y0]);
    addDynamicMesh(roomShellGroup, "meeting-shell-walls", builtShell.geometry, materials.clay, false, true);
    addDynamicMesh(roomShellGroup, "meeting-shell-floor", builtShell.floorGeometry, materials.floor, false, true);
    const shellLines = materials.createLines("structure", builtShell.edges);
    if (shellLines) {
      dynamicDisposables.push(shellLines.geometry);
      roomShellGroup.add(shellLines);
    }

    const addSideWindowBank = (fixedX: number, spanStart: number, spanEnd: number, bays: number) => {
      const frame = new RectSolid();
      const ft = 0.05;
      frame.add(fixedX - ft, winSillY, spanStart, fixedX + ft, winSillY + ft, spanEnd);
      frame.add(fixedX - ft, winHeadY - ft, spanStart, fixedX + ft, winHeadY, spanEnd);
      for (let i = 0; i <= bays; i++) {
        const mz = spanStart + ((spanEnd - spanStart) * i) / bays;
        frame.add(fixedX - ft, winSillY, mz - 0.028, fixedX + ft, winHeadY, mz + 0.028);
        if (i < bays) {
          const nz = spanStart + ((spanEnd - spanStart) * (i + 1)) / bays;
          kit.box("glass", fixedX - 0.008, winSillY + ft, mz + 0.028, fixedX + 0.008, winHeadY - ft, nz - 0.028, null);
        }
      }
      kit.solid("clay", frame, "detail");
    };
    const sideWindowBays = Math.max(3, Math.round((R * 2 - winInset * 2) / 1.8));
    addSideWindowBank(x0 - wallT * 0.5, zNorth + winInset, zSouth - winInset, sideWindowBays);
    addSideWindowBank(x1 + wallT * 0.5, zNorth + winInset, zSouth - winInset, sideWindowBays);

    // Subtle baseboard trim & floor joint grid
    kit.box("clay", x0, y0, zNorth, x1, y0 + 0.08, zNorth + 0.02, "detail");
    kit.box("clay", x0, y0, zSouth - 0.02, x1, y0 + 0.08, zSouth, "detail");
    kit.box("clay", x0, y0, zNorth, x0 + 0.02, y0 + 0.08, zSouth, "detail");
    kit.box("clay", x1 - 0.02, y0, zNorth, x1, y0 + 0.08, zSouth, "detail");

    const grid = 1.15;
    for (let gx = x0 + grid; gx < x1 - 0.2; gx += grid) {
      kit.segment("floorGrid", gx, y0 + 0.001, zNorth + 0.05, gx, y0 + 0.001, zSouth - 0.05);
    }
    for (let gz = zNorth + grid; gz < zSouth - 0.2; gz += grid) {
      kit.segment("floorGrid", x0 + 0.05, y0 + 0.001, gz, x1 - 0.05, y0 + 0.001, gz);
    }

    // ---- 2. Visible Interior Entrance Door on South Wall ----
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

      kit.box("desk", dx - dw / 2, y0 + 0.01, dz - 0.05, dx + dw / 2, y0 + dh, dz - 0.005, "structure");
      kit.box("glass", dx - 0.24, y0 + 0.92, dz - 0.058, dx + 0.24, y0 + dh - 0.22, dz - 0.05, null);
      kit.box("accentBlue", dx - dw / 2 - 0.07, y0 + dh + 0.07, dz - 0.06, dx + dw / 2 + 0.07, y0 + dh + 0.14, dz, "detail");
      kit.box("accentGold", dx - 0.38, y0 + 0.96, dz - 0.095, dx - 0.355, y0 + 1.32, dz - 0.05, "detail");
    }

    // ---- 3. EXACTLY TWO Separate Back-Wall Displays (Screen Sharing + Glass Whiteboard) ----
    {
      const displayCenterY = y0 + 1.84;
      const displayHeight = 1.50;
      const screenWidth = 2.62;
      const wbWidth = 2.28;
      const gap = 0.38;
      const totalSpan = screenWidth + gap + wbWidth;
      const screenCenterX = roomCenterX - totalSpan / 2 + screenWidth / 2;
      const wbCenterX = roomCenterX + totalSpan / 2 - wbWidth / 2;

      screenDisplay = createScreenShareDisplay(screenCenterX, displayCenterY, zNorth + 0.01, screenWidth, displayHeight);
      whiteboardDisplay = createWhiteboardDisplay(wbCenterX, displayCenterY, zNorth + 0.01, wbWidth, displayHeight);

      displaysGroup.add(screenDisplay.group, whiteboardDisplay.group);
      dynamicCleanups.push(() => {
        screenDisplay?.dispose();
        whiteboardDisplay?.dispose();
      });
    }

    // ---- 4. Corner Botanical Plants & Overhead Ceiling Downlights (friendly studio framing) ----
    {
      for (const side of [-1, 1] as const) {
        const px = side < 0 ? x0 + 0.56 : x1 - 0.56;
        const pz = zNorth + 0.54;
        const pot = new THREE.CylinderGeometry(0.22, 0.17, 0.44, 16);
        transformGeometry(pot, px, y0 + 0.22, pz);
        kit.geo("clay", pot, "furniture", 30);

        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + side * 0.35;
          const h = 0.64 + (i % 3) * 0.16;
          const leafGeo = new THREE.ConeGeometry(0.082, h, 5);
          leafGeo.scale(1.0, 1.0, 0.26);
          leafGeo.translate(0, h * 0.5, 0);
          leafGeo.rotateX(0.28 + (i % 2) * 0.15);
          leafGeo.rotateY(ang);
          leafGeo.translate(px, y0 + 0.41, pz);
          kit.geo("plant", leafGeo, null);
        }

        // Recessed soft ceiling downlights matching reference ceiling fixtures
        const bezel = new THREE.CylinderGeometry(0.14, 0.14, 0.014, 20);
        transformGeometry(bezel, roomCenterX + side * (R * 0.52), y1 - 0.008, zNorth + 1.35);
        kit.geo("accentGold", bezel, "detail", 32);
      }
    }

    // ---- 5. Warm Illustrated Circular Conference Table + Center Inlay ----
    {
      const tr = layout.tableRadius;
      const segs = Math.max(56, Math.min(96, Math.round(tr * 40)));

      const topGeo = new THREE.CylinderGeometry(tr, tr - 0.02, TABLE_THICKNESS, segs);
      topGeo.translate(roomCenterX, TABLE_TOP_Y - TABLE_THICKNESS / 2, roomCenterZ);
      addDynamicMesh(roomShellGroup, "meeting-circular-tabletop", topGeo, warmTableMat, false, true);

      // Clean architectural outline around tabletop rim
      const rimPts: number[] = [];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        rimPts.push(
          roomCenterX + Math.cos(a0) * tr,
          TABLE_TOP_Y + 0.001,
          roomCenterZ + Math.sin(a0) * tr,
          roomCenterX + Math.cos(a1) * tr,
          TABLE_TOP_Y + 0.001,
          roomCenterZ + Math.sin(a1) * tr,
        );
      }
      const rimLines = materials.createLines("furniture", rimPts);
      if (rimLines) {
        dynamicDisposables.push(rimLines.geometry);
        roomShellGroup.add(rimLines);
      }

      // Warm contrasting circular center inlay (matching reference table composition)
      const inlayR = Math.min(0.46, tr * 0.28);
      const inlayGeo = new THREE.CylinderGeometry(inlayR, inlayR, 0.006, 44);
      inlayGeo.translate(roomCenterX, TABLE_TOP_Y + 0.001, roomCenterZ);
      addDynamicMesh(roomShellGroup, "meeting-table-center-inlay", inlayGeo, warmInlayMat, false, true);

      const inlayPts: number[] = [];
      for (let i = 0; i < 44; i++) {
        const a0 = (i / 44) * Math.PI * 2;
        const a1 = ((i + 1) / 44) * Math.PI * 2;
        inlayPts.push(
          roomCenterX + Math.cos(a0) * inlayR,
          TABLE_TOP_Y + 0.0045,
          roomCenterZ + Math.sin(a0) * inlayR,
          roomCenterX + Math.cos(a1) * inlayR,
          TABLE_TOP_Y + 0.0045,
          roomCenterZ + Math.sin(a1) * inlayR,
        );
      }
      const inlayLines = materials.createLines("detail", inlayPts);
      if (inlayLines) {
        dynamicDisposables.push(inlayLines.geometry);
        roomShellGroup.add(inlayLines);
      }

      // Central pedestal & under-apron
      const apron = new THREE.CylinderGeometry(tr * 0.72, tr * 0.72, 0.055, segs);
      transformGeometry(apron, roomCenterX, TABLE_TOP_Y - TABLE_THICKNESS - 0.025, roomCenterZ);
      kit.geo("chairBase", apron, null);

      const pedR = Math.max(0.28, tr * 0.22);
      const pedH = TABLE_TOP_Y - TABLE_THICKNESS - y0 - 0.04;
      const pedestal = new THREE.CylinderGeometry(pedR * 0.9, pedR, pedH, 32);
      transformGeometry(pedestal, roomCenterX, y0 + 0.03 + pedH / 2, roomCenterZ);
      kit.geo("clay", pedestal, "furniture", 30);

      const basePlate = new THREE.CylinderGeometry(pedR * 1.38, pedR * 1.44, 0.032, 36);
      transformGeometry(basePlate, roomCenterX, y0 + 0.016, roomCenterZ);
      kit.geo("chairBase", basePlate, "detail", 32);

      // Soft contact shadow under table
      const shadowGeo = new THREE.PlaneGeometry(tr * 2.25, tr * 2.25);
      dynamicDisposables.push(shadowGeo);
      const shadowMat = materials.createContactShadow(0.14);
      dynamicMaterials.push(shadowMat);
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(roomCenterX, y0 + 0.002, roomCenterZ);
      shadowMesh.renderOrder = 1;
      roomShellGroup.add(shadowMesh);

      // ---- 6. Natural Tabletop Accessories: `</>` Programming Coffee Mug + Small Desk Plant ----
      const mug = createProgrammingCoffeeMug();
      // Placed cleanly in viewer's natural left foreground on the circular table, facing viewer (+Z)
      mug.group.position.set(roomCenterX - 0.34, TABLE_TOP_Y, roomCenterZ + tr - 0.34);
      mug.group.rotation.y = 0.16;
      chairsAndPropsGroup.add(mug.group);
      dynamicCleanups.push(() => mug.dispose());
      hasProgrammingMug = true;

      // Balanced small potted plant on right foreground of the circular table (compact, never obscures faces)
      const tablePlantKit = new GeometryKit();
      const tpx = roomCenterX + 0.38;
      const tpz = roomCenterZ + tr - 0.34;
      const miniPot = new THREE.CylinderGeometry(0.054, 0.042, 0.088, 16);
      transformGeometry(miniPot, tpx, TABLE_TOP_Y + 0.044, tpz);
      tablePlantKit.geo("clay", miniPot, "detail", 30);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.25;
        const lh = 0.115 + (i % 2) * 0.035;
        const lg = new THREE.ConeGeometry(0.026, lh, 5);
        lg.scale(1.0, 1.0, 0.28);
        lg.translate(0, lh * 0.5, 0);
        lg.rotateX(0.42 + (i % 3) * 0.14);
        lg.rotateY(a);
        lg.translate(tpx, TABLE_TOP_Y + 0.082, tpz);
        tablePlantKit.geo("plant", lg, null);
      }
      addDynamicMesh(chairsAndPropsGroup, "meeting-table-plant-pot", bucketToGeometry(tablePlantKit.buckets.clay), materials.clay, false, true);
      addDynamicMesh(chairsAndPropsGroup, "meeting-table-plant-leaves", bucketToGeometry(tablePlantKit.buckets.plant), materials.plant, false, true);
      const miniPotLines = materials.createLines("detail", tablePlantKit.lines.detail);
      if (miniPotLines) {
        dynamicDisposables.push(miniPotLines.geometry);
        chairsAndPropsGroup.add(miniPotLines);
      }
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
        roomShellGroup,
        `meeting-${kind}`,
        bucketToGeometry(kit.buckets[kind]),
        materials.byKind[kind],
        false,
        true,
        0,
      );
    }
    addDynamicMesh(
      roomShellGroup,
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
        roomShellGroup.add(lineObj);
      }
    }

    // ---- 7. Participant Chairs, Low-Profile Laptops & Stickmen with Flat Circular Webcam Portraits ----
    // CRITICAL: seatIdx starts at 1 so the local viewer's seat (0) NEVER renders a chair, avatar, or portrait!
    const totalSeats = layout.totalSeats;
    const chairR = layout.chairRadius;
    const laptopR = layout.tableRadius - 0.13;
    const seatLinePositions: number[] = [];
    const laptopLinePositions: number[] = [];
    const tmpVec = new THREE.Vector3();

    let malePortraitCounter = 0;
    let femalePortraitCounter = 0;

    for (let seatIdx = 1; seatIdx < totalSeats; seatIdx++) {
      const theta = (2 * Math.PI * seatIdx) / totalSeats;
      const sx = roomCenterX - Math.sin(theta) * chairR;
      const sz = roomCenterZ + Math.cos(theta) * chairR;
      const faceCenterYaw = Math.atan2(roomCenterX - sx, roomCenterZ - sz);

      // Participant chair
      const chairGroup = new THREE.Group();
      chairGroup.name = `meeting-chair-${seatIdx}`;
      chairGroup.position.set(sx, y0, sz);
      chairGroup.rotation.y = faceCenterYaw;

      const seatMesh = new THREE.Mesh(chairProto.seatGeo, materials.chair);
      seatMesh.receiveShadow = true;
      const baseMesh = new THREE.Mesh(chairProto.baseGeo, materials.chairBase);
      baseMesh.receiveShadow = true;
      chairGroup.add(seatMesh, baseMesh);
      chairsAndPropsGroup.add(chairGroup);

      const cosY = Math.cos(faceCenterYaw);
      const sinY = Math.sin(faceCenterYaw);
      for (let i = 0; i < chairProto.linesGeo.length; i += 3) {
        const lx = chairProto.linesGeo[i];
        const ly = chairProto.linesGeo[i + 1];
        const lz = chairProto.linesGeo[i + 2];
        tmpVec.set(sx + lx * cosY + lz * sinY, y0 + ly, sz - lx * sinY + lz * cosY);
        seatLinePositions.push(tmpVec.x, tmpVec.y, tmpVec.z);
      }

      // Participant laptop cleanly placed on circular table in front of hands
      if (seatIdx <= participants.length) {
        const lx = roomCenterX - Math.sin(theta) * laptopR;
        const lz = roomCenterZ + Math.cos(theta) * laptopR;
        const laptopMesh = new THREE.Mesh(laptopProto.geo, materials.tech);
        laptopMesh.name = `meeting-laptop-${seatIdx}`;
        laptopMesh.position.set(lx, TABLE_TOP_Y, lz);
        laptopMesh.rotation.y = faceCenterYaw;
        chairsAndPropsGroup.add(laptopMesh);

        for (let i = 0; i < laptopProto.lines.length; i += 3) {
          const px = laptopProto.lines[i];
          const py = laptopProto.lines[i + 1];
          const pz = laptopProto.lines[i + 2];
          tmpVec.set(lx + px * cosY + pz * sinY, TABLE_TOP_Y + py, lz - px * sinY + pz * cosY);
          laptopLinePositions.push(tmpVec.x, tmpVec.y, tmpVec.z);
        }

        // 3D Stickman body + Flat 2D Circular Webcam Portrait replacing the original 3D head
        const spec = participants[seatIdx - 1];
        const inst = masterAssets.createInstance(spec.id, spec.variant, seatIdx * 1.37);
        inst.setPose("seated-meeting");
        // Completely hide original 3D stickman head, eyes, smile, hair & bow
        inst.setOriginalHeadVisible(false);
        inst.root.position.set(sx, y0, sz);
        inst.root.rotation.y = faceCenterYaw;

        const portraitIdx = spec.variant === "male" ? malePortraitCounter++ : femalePortraitCounter++;
        const portraitTex = portraitLibrary.getPortraitTexture(spec.variant, portraitIdx);
        const portraitScale = totalSeats <= 10 ? 0.215 : 0.185;
        const portraitBillboard = createWebcamPortraitBillboard(portraitTex, portraitScale, 0.015);
        // Lift portrait center slightly above shoulder neck line so circular frame rests cleanly on top of neck
        portraitBillboard.group.position.set(0, 0.045, 0);
        inst.getWebcamMount().add(portraitBillboard.group);
        portraitControllers.push(portraitBillboard);

        participantsGroup.add(inst.root);
        characters.push(inst);
      }
    }

    const chairLines = materials.createLines("furniture", seatLinePositions);
    if (chairLines) {
      dynamicDisposables.push(chairLines.geometry);
      chairsAndPropsGroup.add(chairLines);
    }
    const laptopLines = materials.createLines("detail", laptopLinePositions);
    if (laptopLines) {
      dynamicDisposables.push(laptopLines.geometry);
      chairsAndPropsGroup.add(laptopLines);
    }

    updateStatusText();

    if (active && !transitionState && focusState === "seated") {
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

  function updateDisplayHoverRaycast(): boolean {
    if (!active || transitionState || focusState !== "seated") {
      if (hoveredDisplay !== null) {
        hoveredDisplay = null;
        screenDisplay?.setHovered(false);
        whiteboardDisplay?.setHovered(false);
        syncContextualUI();
        return true;
      }
      return false;
    }

    const targets: THREE.Object3D[] = [];
    if (screenDisplay) targets.push(screenDisplay.hitMesh);
    if (whiteboardDisplay) targets.push(whiteboardDisplay.hitMesh);
    if (targets.length === 0) return false;

    camera.updateMatrixWorld();

    let nextHover: MeetingDisplayKind | null = null;
    if (touchMode && touchSelectedDisplay) {
      nextHover = touchSelectedDisplay;
    } else if (pointerTracked) {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        nextHover = (hits[0].object.userData.displayKind as MeetingDisplayKind) ?? null;
      }
    }

    // Center-of-view fallback when steering via touch-drag or keyboard without mouse pointer
    if (!nextHover && (!pointerTracked || touchMode)) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0.04), camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        nextHover = (hits[0].object.userData.displayKind as MeetingDisplayKind) ?? null;
      }
    }

    if (nextHover !== hoveredDisplay) {
      hoveredDisplay = nextHover;
      screenDisplay?.setHovered(nextHover === "screen");
      whiteboardDisplay?.setHovered(nextHover === "whiteboard");
      syncContextualUI();
      return true;
    }
    return false;
  }

  function computeDisplayZoomPose(display: MeetingWallDisplay): {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
  } {
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const halfTanV = Math.tan(vFovRad / 2);
    const halfTanH = halfTanV * Math.max(0.45, camera.aspect);
    // Fill ~88-90% of viewport cleanly so entire display is readable & centered
    const distV = (display.height / 2) / (halfTanV * 0.87);
    const distH = (display.width / 2) / (halfTanH * 0.90);
    const zoomDist = Math.max(distV, distH);

    const pos = display.centerWorld.clone().add(new THREE.Vector3(0, 0, zoomDist));
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, "YXZ"));
    return { pos, quat };
  }

  function startZoomToDisplay(kind: MeetingDisplayKind): void {
    const display = getDisplayByKind(kind);
    if (!display) return;

    savedSeatedPos.copy(getUserEyePosition());
    savedSeatedYaw = yaw;
    focusedDisplay = kind;
    hoveredDisplay = null;
    screenDisplay?.setHovered(false);
    whiteboardDisplay?.setHovered(false);
    isDraggingLook = false;
    activePointerId = null;
    isDrawingStroke = false;
    drawPointerId = null;
    lastDrawUV = null;

    // Hide participants & chairs cleanly so focused display is completely unobstructed
    setParticipantsVisibleForFocus(false);

    const targetPose = computeDisplayZoomPose(display);
    focusState = "zooming-in";
    zoomAnim = {
      kind: "in",
      elapsed: 0,
      duration: ZOOM_TRANSITION_SEC,
      fromPos: camera.position.clone(),
      toPos: targetPose.pos,
      fromQuat: camera.quaternion.clone(),
      toQuat: targetPose.quat,
    };
    syncContextualUI();
    forceRenderFlag = true;
  }

  function startReturnFromZoom(): void {
    if (focusState === "seated") return;
    isDrawingStroke = false;
    drawPointerId = null;
    lastDrawUV = null;

    // Restore participants & chairs as camera pulls smoothly back to seated perspective
    setParticipantsVisibleForFocus(true);

    const seatedPos = getUserEyePosition();
    const seatedQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(LOCKED_PITCH, savedSeatedYaw, 0, "YXZ"),
    );

    focusState = "zooming-out";
    zoomAnim = {
      kind: "out",
      elapsed: 0,
      duration: ZOOM_TRANSITION_SEC * 0.92,
      fromPos: camera.position.clone(),
      toPos: seatedPos,
      fromQuat: camera.quaternion.clone(),
      toQuat: seatedQuat,
    };
    syncContextualUI();
    forceRenderFlag = true;
  }

  function enterWhiteboardWritingMode(): void {
    if (focusState !== "zoomed" || focusedDisplay !== "whiteboard") return;
    focusState = "writing";
    isDrawingStroke = false;
    drawPointerId = null;
    lastDrawUV = null;
    syncContextualUI();
    forceRenderFlag = true;
  }

  function raycastWhiteboardUV(clientX: number, clientY: number): { u: number; v: number } | null {
    if (!whiteboardDisplay) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObject(whiteboardDisplay.hitMesh, false);
    if (hits.length === 0 || !hits[0].uv) return null;
    return { u: hits[0].uv.x, v: hits[0].uv.y };
  }

  // ---- Seated Horizontal-Only Mouse Look, Raycasting Targeting, Zoom & Whiteboard Writing Handlers ----
  const cleanups: Array<() => void> = [];

  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerMovedDist = 0;
  let touchSelectedDisplay: MeetingDisplayKind | null = null;

  const raycastDisplayAtClient = (clientX: number, clientY: number): MeetingDisplayKind | null => {
    const targets: THREE.Object3D[] = [];
    if (screenDisplay) targets.push(screenDisplay.hitMesh);
    if (whiteboardDisplay) targets.push(whiteboardDisplay.hitMesh);
    if (targets.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;
    return (hits[0].object.userData.displayKind as MeetingDisplayKind) ?? null;
  };

  const setHoveredDisplayDirect = (next: MeetingDisplayKind | null) => {
    if (next === hoveredDisplay) return;
    hoveredDisplay = next;
    screenDisplay?.setHovered(next === "screen");
    whiteboardDisplay?.setHovered(next === "whiteboard");
    syncContextualUI();
    forceRenderFlag = true;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active || transitionState) return;

    const isTouch = e.pointerType === "touch";
    if (isTouch && !touchMode) {
      touchMode = true;
      syncContextualUI();
    }

    const rect = canvas.getBoundingClientRect();
    if (!isTouch && rect.width >= 10 && rect.height >= 10) {
      pointerNdc.set(
        THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1), -1, 1),
      );
      pointerTracked = true;
    }

    // Whiteboard interactive writing stroke (works identically for mouse & touch!)
    if (focusState === "writing") {
      if (isDrawingStroke && drawPointerId === e.pointerId && whiteboardDisplay) {
        const uv = raycastWhiteboardUV(e.clientX, e.clientY);
        if (uv) {
          if (lastDrawUV) {
            whiteboardDisplay.drawStrokeUV(lastDrawUV.u, lastDrawUV.v, uv.u, uv.v, activeMarkerColor, 5.2);
          } else {
            whiteboardDisplay.drawDotUV(uv.u, uv.v, activeMarkerColor, 5.2);
          }
          lastDrawUV = uv;
          forceRenderFlag = true;
        } else {
          lastDrawUV = null;
        }
      }
      return;
    }

    // Freeze camera movement while zoomed into a display
    if (focusState !== "seated") return;

    // STRICTLY HORIZONTAL drag viewing (mouse drag OR touch drag; vertical movement never tilts seated camera)
    if (isDraggingLook && activePointerId === e.pointerId) {
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      pointerMovedDist += Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      const dragSens = isTouch ? 0.0058 : 0.0052;
      const maxAngle = isTouch ? getAdaptiveHoverYaw() + THREE.MathUtils.degToRad(18) : Math.PI;
      dragYawOffset = THREE.MathUtils.clamp(dragYawOffset - dx * dragSens, -maxAngle, maxAngle);
      targetYaw = dragYawOffset + (isTouch ? 0 : hoverYaw);
      if (isTouch && Math.abs(dx) > 1.5) {
        touchSelectedDisplay = null;
        pointerTracked = false;
      }
      forceRenderFlag = true;
      return;
    }

    // Touch devices do not hover-pan without dragging
    if (isTouch) return;

    if (rect.width < 10) return;
    const nx = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    // Gentle center-stable curve so targeting either back-wall display stays rock-steady,
    // while moving toward left/right edges smoothly turns all the way to immediate neighbors
    const curvedX = Math.sign(nx) * Math.pow(Math.abs(nx), 1.65);
    hoverYaw = -curvedX * getAdaptiveHoverYaw();
    targetYaw = dragYawOffset + hoverYaw;
    updateDisplayHoverRaycast();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!active || transitionState || (e.pointerType !== "touch" && e.button !== 0)) return;
    if (e.pointerType === "touch" && !touchMode) {
      touchMode = true;
      syncContextualUI();
    }

    if (focusState === "writing" && whiteboardDisplay) {
      const uv = raycastWhiteboardUV(e.clientX, e.clientY);
      if (uv) {
        isDrawingStroke = true;
        drawPointerId = e.pointerId;
        lastDrawUV = uv;
        whiteboardDisplay.drawDotUV(uv.u, uv.v, activeMarkerColor, 5.2);
        canvas.setPointerCapture?.(e.pointerId);
        forceRenderFlag = true;
      }
      return;
    }

    if (focusState !== "seated") return;
    isDraggingLook = true;
    activePointerId = e.pointerId;
    lastPointerX = e.clientX;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerMovedDist = 0;
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (drawPointerId === e.pointerId) {
      isDrawingStroke = false;
      drawPointerId = null;
      lastDrawUV = null;
      if (canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    }
    if (activePointerId === e.pointerId) {
      const wasTap = e.pointerType === "touch" && pointerMovedDist < 16 && focusState === "seated";
      isDraggingLook = false;
      activePointerId = null;
      if (canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (wasTap) {
        const hit = raycastDisplayAtClient(e.clientX, e.clientY);
        touchSelectedDisplay = hit;
        setHoveredDisplayDirect(hit);
      }
    }
  };

  const onPointerLeave = () => {
    pointerTracked = false;
    isDrawingStroke = false;
    lastDrawUV = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active || transitionState) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

    // 1. Layered Esc handling: when zoomed or writing, Esc ONLY returns to seated view (never exits meeting!)
    if (!e.repeat && e.code === "Escape") {
      e.preventDefault();
      if (focusState !== "seated") {
        startReturnFromZoom();
      } else {
        onRequestExit?.();
      }
      return;
    }

    // 2. Press Z to Zoom into whichever back-wall display is currently targeted
    if (!e.repeat && (e.code === "KeyZ" || e.key.toLowerCase() === "z")) {
      if (focusState === "seated" && hoveredDisplay) {
        e.preventDefault();
        startZoomToDisplay(hoveredDisplay);
      }
      return;
    }

    // 3. Press A to enter Whiteboard Writing Mode (strictly ONLY when focused on whiteboard!)
    if (!e.repeat && (e.code === "KeyA" || e.key.toLowerCase() === "a")) {
      if (focusState === "zoomed" && focusedDisplay === "whiteboard") {
        e.preventDefault();
        enterWhiteboardWritingMode();
        return;
      }
      // Block A from doing anything else in meeting mode
      e.preventDefault();
      return;
    }

    // 4. Press E to leave meeting room ONLY when in normal seated mode (not zoomed/writing)
    if (!e.repeat && (e.code === "KeyE" || e.key.toLowerCase() === "e")) {
      if (focusState === "seated") {
        e.preventDefault();
        onRequestExit?.();
      }
      return;
    }

    // 5. Block walking keys so user stays strictly stationary in their seated position
    if (
      e.code === "KeyW" ||
      e.code === "KeyS" ||
      e.code === "KeyD" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight"
    ) {
      e.preventDefault();
      if (focusState === "seated") {
        if (e.code === "ArrowLeft") {
          dragYawOffset = THREE.MathUtils.clamp(dragYawOffset + 0.16, -Math.PI, Math.PI);
          targetYaw = dragYawOffset + hoverYaw;
        } else if (e.code === "ArrowRight") {
          dragYawOffset = THREE.MathUtils.clamp(dragYawOffset - 0.16, -Math.PI, Math.PI);
          targetYaw = dragYawOffset + hoverYaw;
        }
      }
    }
  };

  const onBlur = () => {
    isDraggingLook = false;
    activePointerId = null;
    isDrawingStroke = false;
    drawPointerId = null;
    lastDrawUV = null;
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("blur", onBlur);

  cleanups.push(() => {
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
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
    prepareAssets() {
      return portraitLibrary.preloadAll();
    },
    setTouchMode(touch) {
      if (touchMode === touch) return;
      touchMode = touch;
      syncContextualUI();
    },
    enter(fromPosition, fromYaw, fromPitch, immediate = false) {
      active = true;
      yaw = 0;
      targetYaw = 0;
      hoverYaw = 0;
      dragYawOffset = 0;
      isDraggingLook = false;
      activePointerId = null;
      focusState = "seated";
      focusedDisplay = null;
      hoveredDisplay = null;
      touchSelectedDisplay = null;
      zoomAnim = null;
      isDrawingStroke = false;
      lastDrawUV = null;
      setParticipantsVisibleForFocus(true);
      screenDisplay?.setHovered(false);
      whiteboardDisplay?.setHovered(false);

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
      syncContextualUI();
    },
    exit(toPosition, toYaw, toPitch, onComplete, immediate = false) {
      isDraggingLook = false;
      activePointerId = null;
      isDrawingStroke = false;
      drawPointerId = null;
      lastDrawUV = null;
      zoomAnim = null;
      focusState = "seated";
      focusedDisplay = null;
      hoveredDisplay = null;
      touchSelectedDisplay = null;
      setParticipantsVisibleForFocus(true);
      screenDisplay?.setHovered(false);
      whiteboardDisplay?.setHovered(false);
      statusPillEl.classList.remove("is-visible");
      statusPillEl.setAttribute("aria-hidden", "true");
      contextHintEl.classList.remove("is-visible");
      contextHintEl.setAttribute("aria-hidden", "true");
      touchActionsEl.classList.remove("is-visible");
      touchActionsEl.setAttribute("aria-hidden", "true");
      wbToolbarEl.classList.remove("is-visible");
      wbToolbarEl.setAttribute("aria-hidden", "true");
      canvas.style.cursor = "";

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
      if (active && !transitionState && focusState === "seated") {
        applySeatedCameraPose();
        updateDisplayHoverRaycast();
      }
    },
    steerCursorNormalized(nx, _ny = 0) {
      const clampedX = THREE.MathUtils.clamp(nx, -1, 1);
      hoverYaw = -clampedX * getAdaptiveHoverYaw();
      targetYaw = dragYawOffset + hoverYaw;
    },
    resetView() {
      if (focusState !== "seated") {
        startReturnFromZoom();
        return;
      }
      yaw = 0;
      targetYaw = 0;
      hoverYaw = 0;
      dragYawOffset = 0;
      if (active && !transitionState) {
        applySeatedCameraPose();
        updateDisplayHoverRaycast();
      }
    },
    update(timeSec, dtSec) {
      const dt = Math.min(0.05, Math.max(0.001, dtSec));

      // Animate seated stickman bodies & keep all flat 2D circular webcam portraits facing the viewer
      if ((active || transitionState) && participantsGroup.visible) {
        for (const ch of characters) {
          ch.update(timeSec);
        }
        participantsGroup.updateWorldMatrix(true, true);
        camera.updateMatrixWorld();
        for (const pc of portraitControllers) {
          pc.orientToCamera(camera);
        }
      }

      // 1. Enter / Exit meeting room camera transition
      if (transitionState) {
        transitionState.elapsed = Math.min(transitionState.duration, transitionState.elapsed + dt);
        const u = transitionState.elapsed / transitionState.duration;
        const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

        camera.position.lerpVectors(transitionState.fromPos, transitionState.toPos, ease);
        let dYaw = transitionState.toYaw - transitionState.fromYaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;

        const curYaw = transitionState.fromYaw + dYaw * ease;
        const curPitch = THREE.MathUtils.lerp(transitionState.fromPitch, transitionState.toPitch, ease);
        camera.rotation.order = "YXZ";
        camera.rotation.set(curPitch, curYaw, 0);

        if (u >= 1) {
          const done = transitionState;
          transitionState = null;
          if (done.kind === "enter") {
            yaw = 0;
            applySeatedCameraPose();
            syncContextualUI();
          } else {
            done.onComplete?.();
          }
        }
        return true;
      }

      if (!active) return false;

      // 2. Display zoom-in / zoom-out smooth interpolation
      if (zoomAnim) {
        zoomAnim.elapsed = Math.min(zoomAnim.duration, zoomAnim.elapsed + dt);
        const u = zoomAnim.elapsed / zoomAnim.duration;
        const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

        camera.position.lerpVectors(zoomAnim.fromPos, zoomAnim.toPos, ease);
        camera.quaternion.slerpQuaternions(zoomAnim.fromQuat, zoomAnim.toQuat, ease);

        if (u >= 1) {
          const finishedKind = zoomAnim.kind;
          zoomAnim = null;
          if (finishedKind === "in") {
            focusState = "zoomed";
          } else {
            focusState = "seated";
            focusedDisplay = null;
            yaw = savedSeatedYaw;
            applySeatedCameraPose();
          }
          syncContextualUI();
        }
        return true;
      }

      // 3. Zoomed or Whiteboard Writing static focused display pose (render strictly on-demand when drawing/resizing)
      if (focusState === "zoomed" || focusState === "writing") {
        const display = getDisplayByKind(focusedDisplay);
        let moved = false;
        if (display) {
          const pose = computeDisplayZoomPose(display);
          if (
            camera.position.distanceToSquared(pose.pos) > 1e-6 ||
            Math.abs(camera.quaternion.dot(pose.quat)) < 0.999999
          ) {
            camera.position.copy(pose.pos);
            camera.quaternion.copy(pose.quat);
            moved = true;
          }
        }
        const need = forceRenderFlag || moved;
        forceRenderFlag = false;
        return need;
      }

      // 4. Normal Seated Mode: full-rate rendering during camera damping/hover/load; gentle cadence when idle
      const blend = 1 - Math.exp(-10.5 * dt);
      const diff = targetYaw - yaw;
      let cameraMoved = false;
      if (Math.abs(diff) > 1e-4) {
        yaw += diff * blend;
        cameraMoved = true;
      } else if (yaw !== targetYaw) {
        yaw = targetYaw;
        cameraMoved = true;
      }
      applySeatedCameraPose();
      const hoverChanged = updateDisplayHoverRaycast();

      // Re-orient portraits cleanly after final camera yaw update for zero 1-frame billboard lag
      if (participantsGroup.visible) {
        camera.updateMatrixWorld();
        for (const pc of portraitControllers) {
          pc.orientToCamera(camera);
        }
      }

      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const idleTick = !reducedMotion && timeSec - lastIdleAnimSec >= 0.065;
      if (idleTick) {
        lastIdleAnimSec = timeSec;
      }
      const needRender = forceRenderFlag || cameraMoved || hoverChanged || idleTick;
      forceRenderFlag = false;
      return needRender;
    },
    getDiagnostics() {
      const eye = getUserEyePosition();
      const headWorld = new THREE.Vector3();
      const posDiff = camera.position.distanceTo(eye);
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");

      return {
        active,
        transitioning: transitionState !== null || zoomAnim !== null,
        participantCount: participants.length,
        layout: { ...layout },
        cameraPosition: [
          +camera.position.x.toFixed(3),
          +camera.position.y.toFixed(3),
          +camera.position.z.toFixed(3),
        ],
        cameraYawDeg: +THREE.MathUtils.radToDeg(focusState === "seated" ? yaw : euler.y).toFixed(2),
        cameraPitchDeg: +THREE.MathUtils.radToDeg(euler.x).toFixed(2),
        isPitchLocked: focusState === "seated" ? Math.abs(euler.x - LOCKED_PITCH) < 0.002 : true,
        isPositionStationary: active && focusState === "seated" ? posDiff < 0.005 : true,
        focusState,
        hoveredDisplay,
        focusedDisplay,
        displayCount: (screenDisplay ? 1 : 0) + (whiteboardDisplay ? 1 : 0),
        hasProgrammingMug,
        viewerChairHidden: chairsAndPropsGroup.getObjectByName("meeting-chair-0") === undefined,
        portraitCount: portraitControllers.length,
        allOriginalHeadsHidden: characters.every((ch) => !ch.getDiagnostics().originalHeadVisible),
        whiteboardStrokeCount: whiteboardDisplay?.getUserStrokeCount() ?? 0,
        participants: characters.map((ch, idx) => {
          const seatIdx = idx + 1;
          const spec = participants[idx];
          ch.getHeadSocket().getWorldPosition(headWorld);
          const dx = headWorld.x - eye.x;
          const dz = headWorld.z - eye.z;
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
      laptopProto.dispose();
      portraitLibrary.dispose();
      warmTableMat.dispose();
      warmInlayMat.dispose();
      statusPillEl.remove();
      contextHintEl.remove();
      touchActionsEl.remove();
      wbToolbarEl.remove();
      styleEl.remove();
      canvas.style.cursor = "";
    },
  };
}
