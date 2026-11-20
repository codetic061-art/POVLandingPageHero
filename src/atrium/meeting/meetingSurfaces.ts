import * as THREE from "three";
import type { StickmanVariant } from "../characters/stickmanMaster";
import portraitMale1Url from "./assets/portrait_male_1.jpg";
import portraitFemale1Url from "./assets/portrait_female_1.jpg";
import portraitMale2Url from "./assets/portrait_male_2.jpg";
import portraitFemale2Url from "./assets/portrait_female_2.jpg";
import portraitMale3Url from "./assets/portrait_male_3.jpg";

export type MeetingDisplayKind = "screen" | "whiteboard";

const MALE_PORTRAIT_URLS = [portraitMale1Url, portraitMale2Url, portraitMale3Url] as const;
const FEMALE_PORTRAIT_URLS = [portraitFemale1Url, portraitFemale2Url] as const;

/**
 * Shared portrait texture loader & cache for demo human webcam portraits.
 * Designed so any participant's flat 2D circular portrait material can swap to a
 * live THREE.VideoTexture in a future update without rebuilding the participant model.
 */
export class MeetingPortraitLibrary {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, THREE.Texture>();
  private readonly onTextureLoaded?: () => void;

  constructor(onTextureLoaded?: () => void) {
    this.onTextureLoaded = onTextureLoaded;
  }

  getPortraitTexture(variant: StickmanVariant, index: number): THREE.Texture {
    const pool = variant === "male" ? MALE_PORTRAIT_URLS : FEMALE_PORTRAIT_URLS;
    const url = pool[index % pool.length];
    let tex = this.cache.get(url);
    if (!tex) {
      tex = this.loader.load(url, () => {
        this.onTextureLoaded?.();
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      this.cache.set(url, tex);
    }
    return tex;
  }

  dispose(): void {
    for (const tex of this.cache.values()) {
      tex.dispose();
    }
    this.cache.clear();
  }
}

export interface WebcamPortraitController {
  group: THREE.Group;
  /** Swaps the flat 2D circular face to any Texture (e.g., future live THREE.VideoTexture) without rebuilding the rig. */
  setMediaTexture: (texture: THREE.Texture) => void;
  /** Keeps the flat 2D portrait parallel to the viewer camera so it stays perfectly circular from all viewing angles. */
  orientToCamera: (camera: THREE.Camera) => void;
  dispose: () => void;
}

const _parentWorldQuat = new THREE.Quaternion();

/**
 * Creates a genuinely flat 2D circular webcam portrait with a thin, clean black ring outline.
 * Mounted directly inside stickman.getWebcamMount() while the original 3D stickman head is hidden.
 */
export function createWebcamPortraitBillboard(
  texture: THREE.Texture,
  radius = 0.215,
  outlineWidth = 0.015,
): WebcamPortraitController {
  const group = new THREE.Group();
  group.name = "flat-webcam-portrait";

  // Flat 2D circular portrait face (zero 3D sphere, zero extrusion, zero behind-head geometry)
  const faceGeo = new THREE.CircleGeometry(radius, 56);
  const faceMat = new THREE.MeshBasicMaterial({
    name: "meeting-webcam-portrait",
    map: texture,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.name = "webcam-portrait-face";
  faceMesh.position.z = 0.001;
  faceMesh.renderOrder = 2;

  // Thin, crisp flat 2D black outline ring framing the portrait
  const ringGeo = new THREE.RingGeometry(radius - 0.002, radius + outlineWidth, 56);
  const ringMat = new THREE.MeshBasicMaterial({
    name: "meeting-portrait-ring",
    color: 0x1d2026,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.name = "webcam-portrait-outline";
  ringMesh.position.z = 0.002;
  ringMesh.renderOrder = 3;

  group.add(faceMesh, ringMesh);

  return {
    group,
    setMediaTexture(nextTex) {
      faceMat.map = nextTex;
      faceMat.needsUpdate = true;
    },
    orientToCamera(camera) {
      if (!group.parent) return;
      group.parent.getWorldQuaternion(_parentWorldQuat);
      group.quaternion.copy(_parentWorldQuat).invert().multiply(camera.quaternion);
    },
    dispose() {
      faceGeo.dispose();
      faceMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}

export interface MeetingWallDisplay {
  kind: MeetingDisplayKind;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  centerWorld: THREE.Vector3;
  width: number;
  height: number;
  setHovered: (hovered: boolean) => void;
  dispose: () => void;
}

export interface WhiteboardWallDisplay extends MeetingWallDisplay {
  kind: "whiteboard";
  drawStrokeUV: (u0: number, v0: number, u1: number, v1: number, color: string, radiusPx?: number) => void;
  drawDotUV: (u: number, v: number, color: string, radiusPx?: number) => void;
  clearUserDrawings: () => void;
  getUserStrokeCount: () => number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Draws a crisp, readable desktop/dashboard screen-sharing prototype onto a 2D canvas
 * (matching the friendly illustrated dashboard aesthetic of the reference image).
 */
function renderScreenShareCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // Soft desktop wallpaper / app backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#eef3fb");
  bg.addColorStop(1, "#e2eaf7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Left desktop/app navigation rail (periwinkle indigo inspired by reference)
  const navW = 168;
  const navGrad = ctx.createLinearGradient(0, 0, 0, H);
  navGrad.addColorStop(0, "#4f72f5");
  navGrad.addColorStop(1, "#5d6af2");
  ctx.fillStyle = navGrad;
  ctx.fillRect(0, 0, navW, H);

  // Window traffic-light dots
  const dotColors = ["#ff6b6b", "#ffd166", "#51cf66"];
  dotColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(28 + i * 20, 26, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Workspace brand & sidebar nav items
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("POV Studio", 24, 72);

  const navItems = ["Overview", "Sprint Board", "Analytics", "Deployments", "Team Sync", "Docs"];
  navItems.forEach((label, idx) => {
    const iy = 104 + idx * 46;
    if (idx === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      drawRoundedRect(ctx, 14, iy - 22, navW - 28, 34, 8);
      ctx.fill();
    }
    ctx.fillStyle = idx === 0 ? "#ffffff" : "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.arc(32, iy - 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = idx === 0 ? "600 14px system-ui, sans-serif" : "500 14px system-ui, sans-serif";
    ctx.fillText(label, 48, iy);
  });

  // Live Screen Share status pill in sidebar footer
  ctx.fillStyle = "rgba(18, 28, 62, 0.28)";
  drawRoundedRect(ctx, 16, H - 64, navW - 32, 42, 10);
  ctx.fill();
  ctx.fillStyle = "#5ef2a8";
  ctx.beginPath();
  ctx.arc(32, H - 43, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText("Sharing Screen", 46, H - 39);

  // Main application browser window card
  const winX = navW + 24;
  const winY = 22;
  const winW = W - winX - 24;
  const winH = H - 44;

  ctx.save();
  ctx.shadowColor = "rgba(38, 56, 98, 0.12)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, winX, winY, winW, winH, 16);
  ctx.fill();
  ctx.restore();

  // Browser window top bar
  ctx.fillStyle = "#f7f9fd";
  drawRoundedRect(ctx, winX, winY, winW, 54, 16);
  ctx.fill();
  ctx.fillRect(winX, winY + 38, winW, 16);
  ctx.strokeStyle = "#e4ebf5";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(winX, winY + 54);
  ctx.lineTo(winX + winW, winY + 54);
  ctx.stroke();

  // Inner window dots + URL bar + presenter badge
  dotColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(winX + 24 + i * 18, winY + 27, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#ebf0f9";
  drawRoundedRect(ctx, winX + 90, winY + 13, 360, 28, 8);
  ctx.fill();
  ctx.fillStyle = "#5c6c84";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillText("app.pov-workspace.io / product-dashboard", winX + 106, winY + 32);

  // Presenter badge "A" (matching reference composition)
  ctx.fillStyle = "#314266";
  drawRoundedRect(ctx, winX + winW - 58, winY + 9, 38, 36, 9);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("A", winX + winW - 39, winY + 34);
  ctx.textAlign = "left";

  // Header & KPI Cards row
  const padX = winX + 30;
  ctx.fillStyle = "#1f2b40";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText("Q4 Product Launch — Weekly Metrics", padX, winY + 94);
  ctx.fillStyle = "#6c7d96";
  ctx.font = "500 14px system-ui, sans-serif";
  ctx.fillText("Live shared desktop view · Sprint 14 active", padX, winY + 116);

  const kpis = [
    { label: "Active Users", value: "24,890", delta: "+18.4%", accent: "#5b6cf7" },
    { label: "Sprint Velocity", value: "94 pts", delta: "+12.1%", accent: "#8c5cf6" },
    { label: "Build Health", value: "99.8%", delta: "Passing", accent: "#22b573" },
  ];
  const kpiW = (winW - 60 - 32) / 3;
  kpis.forEach((k, idx) => {
    const kx = padX + idx * (kpiW + 16);
    const ky = winY + 134;
    ctx.fillStyle = "#f7f9fd";
    drawRoundedRect(ctx, kx, ky, kpiW, 86, 12);
    ctx.fill();
    ctx.strokeStyle = "#e6ecf7";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#697b95";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(k.label, kx + 18, ky + 28);

    ctx.fillStyle = "#1e2a3e";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.fillText(k.value, kx + 18, ky + 64);

    ctx.fillStyle = k.accent;
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(k.delta, kx + kpiW - 76, ky + 62);
  });

  // Left Chart Card: Purple/Indigo Bar Chart (matching reference visual vibe)
  const chartY = winY + 240;
  const chartH = winH - 266;
  const barCardW = (winW - 60) * 0.57;
  ctx.fillStyle = "#f9fbff";
  drawRoundedRect(ctx, padX, chartY, barCardW, chartH, 14);
  ctx.fill();
  ctx.strokeStyle = "#e4ebf7";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#24324a";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("Feature Delivery Velocity", padX + 22, chartY + 34);

  // Subtle horizontal grid lines
  const plotX = padX + 26;
  const plotY = chartY + 58;
  const plotW = barCardW - 52;
  const plotH = chartH - 102;
  ctx.strokeStyle = "#e5ecf7";
  ctx.lineWidth = 1.2;
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
  }

  const barData = [
    { label: "W1", val: 0.34, color: "#9b64f7" },
    { label: "W2", val: 0.48, color: "#8d63f7" },
    { label: "W3", val: 0.72, color: "#7869f6" },
    { label: "W4", val: 0.61, color: "#8a62f7" },
    { label: "W5", val: 0.92, color: "#6870f6" },
    { label: "W6", val: 0.84, color: "#9f60f5" },
  ];
  const barGap = 24;
  const barW = (plotW - barGap * (barData.length + 1)) / barData.length;
  barData.forEach((b, idx) => {
    const bx = plotX + barGap + idx * (barW + barGap);
    const bh = plotH * b.val;
    const by = plotY + plotH - bh;
    ctx.fillStyle = b.color;
    drawRoundedRect(ctx, bx, by, barW, bh, 8);
    ctx.fill();

    ctx.fillStyle = "#6c7e98";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.label, bx + barW / 2, plotY + plotH + 24);
  });
  ctx.textAlign = "left";

  // Right Chart Card: Pie/Donut Chart + Task Checklist
  const rightCardX = padX + barCardW + 18;
  const rightCardW = winW - 60 - barCardW - 18;
  ctx.fillStyle = "#f9fbff";
  drawRoundedRect(ctx, rightCardX, chartY, rightCardW, chartH, 14);
  ctx.fill();
  ctx.strokeStyle = "#e4ebf7";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#24324a";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("Release Allocation", rightCardX + 22, chartY + 34);

  // Pie chart (matching the crisp blue/violet pie in reference)
  const pieCx = rightCardX + rightCardW * 0.5;
  const pieCy = chartY + 136;
  const pieR = Math.min(78, rightCardW * 0.28);
  const slices = [
    { start: -Math.PI * 0.5, end: Math.PI * 0.35, color: "#6584f7" },
    { start: Math.PI * 0.35, end: Math.PI * 1.05, color: "#8c6ff7" },
    { start: Math.PI * 1.05, end: Math.PI * 1.5, color: "#54b4f5" },
  ];
  for (const s of slices) {
    ctx.beginPath();
    ctx.moveTo(pieCx, pieCy);
    ctx.arc(pieCx, pieCy, pieR, s.start, s.end);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
  }

  // Legend & milestone checklist below pie chart
  const legendItems = [
    { label: "3D Meeting UI — 46%", color: "#6584f7" },
    { label: "Audio / Video — 34%", color: "#8c6ff7" },
    { label: "Whiteboard Sync — 20%", color: "#54b4f5" },
  ];
  legendItems.forEach((item, idx) => {
    const ly = chartY + 248 + idx * 32;
    ctx.fillStyle = item.color;
    drawRoundedRect(ctx, rightCardX + 24, ly - 11, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#36465f";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(item.label, rightCardX + 48, ly + 1);
  });
}

/**
 * Draws the clean frosted glass whiteboard base with friendly handwritten meeting notes
 * and generous open space for interactive user drawing.
 */
function renderWhiteboardBase(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // Clean light frosted-glass background with very subtle cool sheen
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#f5f9ff");
  grad.addColorStop(0.5, "#fbfdff");
  grad.addColorStop(1, "#edf4fc");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Very subtle architectural glass reflection diagonal streaks
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.moveTo(W * 0.08, 0);
  ctx.lineTo(W * 0.24, 0);
  ctx.lineTo(W * 0.06, H);
  ctx.lineTo(-W * 0.06, H);
  ctx.closePath();
  ctx.fill();

  // Subtle dot-grid writing guides (barely perceptible, helps writing feel natural)
  ctx.fillStyle = "rgba(120, 148, 184, 0.14)";
  for (let gx = 48; gx < W - 32; gx += 48) {
    for (let gy = 48; gy < H - 32; gy += 48) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Sample Handwritten Meeting Notes (inspired by reference image) ----
  ctx.save();
  ctx.strokeStyle = "#22345a";
  ctx.fillStyle = "#22345a";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Heading: "Team Ideas:"
  ctx.font = 'italic 700 54px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
  ctx.fillText("Team Ideas:", 68, 122);

  // Handwritten double-wavy underline
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(64, 138);
  ctx.quadraticCurveTo(215, 130, 392, 137);
  ctx.stroke();

  // Hand-drawn lightbulb icon in top-right (matching reference!)
  const bx = W - 154;
  const by = 128;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(bx, by, 34, Math.PI * 0.72, Math.PI * 2.28);
  ctx.lineTo(bx + 15, by + 48);
  ctx.lineTo(bx - 15, by + 48);
  ctx.closePath();
  ctx.stroke();
  // Bulb base lines
  ctx.beginPath();
  ctx.moveTo(bx - 13, by + 58);
  ctx.lineTo(bx + 13, by + 58);
  ctx.moveTo(bx - 9, by + 68);
  ctx.lineTo(bx + 9, by + 68);
  ctx.stroke();
  // Light rays
  const rays = [
    [-54, 0, -68, 0],
    [54, 0, 68, 0],
    [0, -52, 0, -66],
    [-39, -37, -50, -48],
    [39, -37, 50, -48],
  ];
  for (const [x1, y1, x2, y2] of rays) {
    ctx.beginPath();
    ctx.moveTo(bx + x1, by + y1);
    ctx.lineTo(bx + x2, by + y2);
    ctx.stroke();
  }

  // Bullet notes
  ctx.font = 'italic 600 42px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
  const bullets = [
    "• Build Together",
    "• Grow Faster",
    "• Dream Big",
  ];
  bullets.forEach((line, idx) => {
    ctx.fillText(line, 76, 232 + idx * 78);
  });

  // Friendly tilted accent note on lower-right ("Let's Innovate!")
  ctx.save();
  ctx.translate(W * 0.56, H * 0.67);
  ctx.rotate(-0.08);
  ctx.fillStyle = "#32589a";
  ctx.font = 'italic 700 46px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
  ctx.fillText("Let's Innovate!", 0, 0);
  // Sparkle lines
  ctx.strokeStyle = "#32589a";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(318, -42);
  ctx.lineTo(332, -58);
  ctx.moveTo(336, -24);
  ctx.lineTo(356, -30);
  ctx.moveTo(334, -4);
  ctx.lineTo(352, 4);
  ctx.stroke();
  ctx.restore();

  // Simple sketched action-item box on bottom-left
  ctx.strokeStyle = "#48689c";
  ctx.fillStyle = "#3c547a";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 68, H - 220, 420, 146, 16);
  ctx.stroke();
  ctx.font = 'italic 700 28px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
  ctx.fillText("Next Steps:", 92, H - 172);
  ctx.font = 'italic 500 25px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive, sans-serif';
  ctx.fillText("✓ Polish 3D Room", 96, H - 130);
  ctx.fillText("→ Prototype Notes", 96, H - 94);

  ctx.restore();
}

/**
 * Builds Display 1: Dedicated wall-mounted Screen Sharing display (flat 2D dashboard on 3D frame).
 */
export function createScreenShareDisplay(
  centerX: number,
  centerY: number,
  wallZ: number,
  width: number,
  height: number,
): MeetingWallDisplay {
  const group = new THREE.Group();
  group.name = "meeting-display-screen-share";
  group.position.set(centerX, centerY, wallZ);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const frameT = 0.044;
  const depth = 0.042;

  // Sleek dark slate monitor bezel / housing
  const bezelGeo = track(new THREE.BoxGeometry(width + frameT * 2, height + frameT * 2, depth));
  const bezelMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-screen-bezel",
      color: 0x262c36,
      roughness: 0.58,
      metalness: 0.08,
    }),
  );
  const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
  bezelMesh.position.z = depth / 2;
  group.add(bezelMesh);

  // Subtle dark architectural frame outline
  const bezelEdges = track(new THREE.EdgesGeometry(bezelGeo, 30));
  const bezelEdgeMat = track(new THREE.LineBasicMaterial({ color: 0x161a20 }));
  const bezelWire = new THREE.LineSegments(bezelEdges, bezelEdgeMat);
  bezelWire.position.copy(bezelMesh.position);
  group.add(bezelWire);

  // Flat 2D desktop/dashboard screen surface positioned cleanly in front of bezel (zero z-fighting!)
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = Math.round((1280 * height) / width);
  renderScreenShareCanvas(canvas);

  const screenTex = track(new THREE.CanvasTexture(canvas));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 4;

  const screenGeo = track(new THREE.PlaneGeometry(width, height));
  const screenMat = track(
    new THREE.MeshBasicMaterial({
      name: "meeting-screen-share-surface",
      map: screenTex,
      toneMapped: false,
    }),
  );
  const hitMesh = new THREE.Mesh(screenGeo, screenMat);
  hitMesh.name = "display-hit-screen";
  hitMesh.position.z = depth + 0.005;
  hitMesh.userData.displayKind = "screen" satisfies MeetingDisplayKind;
  group.add(hitMesh);

  // Soft hover highlight outline frame (visible only when targeted by mouse)
  const glowPad = frameT + 0.032;
  const glowShape = new THREE.Shape();
  const gw = width / 2 + glowPad;
  const gh = height / 2 + glowPad;
  glowShape.moveTo(-gw, -gh);
  glowShape.lineTo(gw, -gh);
  glowShape.lineTo(gw, gh);
  glowShape.lineTo(-gw, gh);
  glowShape.closePath();
  const hole = new THREE.Path();
  const hw = width / 2 + frameT * 0.85;
  const hh = height / 2 + frameT * 0.85;
  hole.moveTo(-hw, -hh);
  hole.lineTo(hw, -hh);
  hole.lineTo(hw, hh);
  hole.lineTo(-hw, hh);
  hole.closePath();
  glowShape.holes.push(hole);

  const glowGeo = track(new THREE.ShapeGeometry(glowShape));
  const glowMat = track(
    new THREE.MeshBasicMaterial({
      name: "meeting-display-hover-glow",
      color: 0x5aa8ff,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.z = depth + 0.008;
  glowMesh.renderOrder = 4;
  group.add(glowMesh);

  return {
    kind: "screen",
    group,
    hitMesh,
    centerWorld: new THREE.Vector3(centerX, centerY, wallZ + depth + 0.005),
    width,
    height,
    setHovered(hovered) {
      glowMat.opacity = hovered ? 0.92 : 0;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

/**
 * Builds Display 2: Dedicated interactive Glass Whiteboard / Meeting Notes surface.
 * Independent from the screen-sharing monitor; supports direct UV-mapped drawing in Writing mode.
 */
export function createWhiteboardDisplay(
  centerX: number,
  centerY: number,
  wallZ: number,
  width: number,
  height: number,
): WhiteboardWallDisplay {
  const group = new THREE.Group();
  group.name = "meeting-display-whiteboard";
  group.position.set(centerX, centerY, wallZ);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const border = 0.032;
  const depth = 0.026;

  // Sleek anodized light-slate glass board backing frame
  const frameGeo = track(new THREE.BoxGeometry(width + border * 2, height + border * 2, depth));
  const frameMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-whiteboard-frame",
      color: 0xb9c6d6,
      roughness: 0.45,
      metalness: 0.12,
    }),
  );
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.z = depth / 2;
  group.add(frameMesh);

  const frameEdges = track(new THREE.EdgesGeometry(frameGeo, 30));
  const frameEdgeMat = track(new THREE.LineBasicMaterial({ color: 0x3b485c }));
  const frameWire = new THREE.LineSegments(frameEdges, frameEdgeMat);
  frameWire.position.copy(frameMesh.position);
  group.add(frameWire);

  // Subtle metallic corner mounting standoffs (signature glass-board architectural detail)
  const pinGeo = track(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 14));
  pinGeo.rotateX(Math.PI / 2);
  const pinMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-whiteboard-pin",
      color: 0x708096,
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(sx * (width / 2 - 0.055), sy * (height / 2 - 0.055), depth + 0.008);
      group.add(pin);
    }
  }

  // Minimal marker tray along bottom edge with 2 colorful dry-erase markers
  const trayGeo = track(new THREE.BoxGeometry(width * 0.62, 0.024, 0.068));
  const trayMesh = new THREE.Mesh(trayGeo, frameMat);
  trayMesh.position.set(0, -height / 2 - border - 0.004, depth + 0.025);
  group.add(trayMesh);

  const markerGeo = track(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 10));
  markerGeo.rotateZ(Math.PI / 2);
  const markerNavyMat = track(new THREE.MeshStandardMaterial({ name: "marker-navy", color: 0x243b6b, roughness: 0.5 }));
  const markerCoralMat = track(new THREE.MeshStandardMaterial({ name: "marker-coral", color: 0xd9536f, roughness: 0.5 }));
  const m1 = new THREE.Mesh(markerGeo, markerNavyMat);
  m1.position.set(-0.14, -height / 2 - border + 0.014, depth + 0.036);
  const m2 = new THREE.Mesh(markerGeo, markerCoralMat);
  m2.position.set(0.02, -height / 2 - border + 0.014, depth + 0.036);
  group.add(m1, m2);

  // Interactive 2D Glass Whiteboard Canvas (pre-populated with sample notes + live drawing layer)
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = Math.round((1280 * height) / width);
  renderWhiteboardBase(canvas);

  const wbTex = track(new THREE.CanvasTexture(canvas));
  wbTex.colorSpace = THREE.SRGBColorSpace;
  wbTex.anisotropy = 4;

  const boardGeo = track(new THREE.PlaneGeometry(width, height));
  const boardMat = track(
    new THREE.MeshBasicMaterial({
      name: "meeting-whiteboard-surface",
      map: wbTex,
      toneMapped: false,
    }),
  );
  const hitMesh = new THREE.Mesh(boardGeo, boardMat);
  hitMesh.name = "display-hit-whiteboard";
  hitMesh.position.z = depth + 0.005;
  hitMesh.userData.displayKind = "whiteboard" satisfies MeetingDisplayKind;
  group.add(hitMesh);

  // Soft hover highlight outline frame
  const glowPad = border + 0.032;
  const glowShape = new THREE.Shape();
  const gw = width / 2 + glowPad;
  const gh = height / 2 + glowPad;
  glowShape.moveTo(-gw, -gh);
  glowShape.lineTo(gw, -gh);
  glowShape.lineTo(gw, gh);
  glowShape.lineTo(-gw, gh);
  glowShape.closePath();
  const hole = new THREE.Path();
  const hw = width / 2 + border * 0.85;
  const hh = height / 2 + border * 0.85;
  hole.moveTo(-hw, -hh);
  hole.lineTo(hw, -hh);
  hole.lineTo(hw, hh);
  hole.lineTo(-hw, hh);
  hole.closePath();
  glowShape.holes.push(hole);

  const glowGeo = track(new THREE.ShapeGeometry(glowShape));
  const glowMat = track(
    new THREE.MeshBasicMaterial({
      name: "meeting-whiteboard-hover-glow",
      color: 0x5aa8ff,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.z = depth + 0.009;
  glowMesh.renderOrder = 4;
  group.add(glowMesh);

  const ctx = canvas.getContext("2d");
  let userStrokeCount = 0;

  return {
    kind: "whiteboard",
    group,
    hitMesh,
    centerWorld: new THREE.Vector3(centerX, centerY, wallZ + depth + 0.005),
    width,
    height,
    setHovered(hovered) {
      glowMat.opacity = hovered ? 0.92 : 0;
    },
    drawStrokeUV(u0, v0, u1, v1, color, radiusPx = 5.5) {
      if (!ctx) return;
      const x0 = u0 * canvas.width;
      const y0 = (1 - v0) * canvas.height;
      const x1 = u1 * canvas.width;
      const y1 = (1 - v1) * canvas.height;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = radiusPx * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
      userStrokeCount++;
      wbTex.needsUpdate = true;
    },
    drawDotUV(u, v, color, radiusPx = 5.5) {
      if (!ctx) return;
      const x = u * canvas.width;
      const y = (1 - v) * canvas.height;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      userStrokeCount++;
      wbTex.needsUpdate = true;
    },
    clearUserDrawings() {
      renderWhiteboardBase(canvas);
      userStrokeCount = 0;
      wbTex.needsUpdate = true;
    },
    getUserStrokeCount: () => userStrokeCount,
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

/**
 * Builds a small white ceramic coffee mug with a crisp black `</>` programming symbol
 * on the front, dark coffee inside, D-handle, and subtle architectural outline.
 */
export function createProgrammingCoffeeMug(): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  group.name = "meeting-table-programming-mug";

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const mugR = 0.046;
  const mugH = 0.104;

  // Ceramic wrap texture with bold crisp black `</>` symbol centered on the +Z face
  const wrapCanvas = document.createElement("canvas");
  wrapCanvas.width = 512;
  wrapCanvas.height = 256;
  const ctx = wrapCanvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#faf9f5";
    ctx.fillRect(0, 0, wrapCanvas.width, wrapCanvas.height);

    // Subtle dark rim stripe along top & bottom edge for illustrated crispness
    ctx.fillStyle = "#22262c";
    ctx.fillRect(0, 0, wrapCanvas.width, 7);
    ctx.fillRect(0, wrapCanvas.height - 6, wrapCanvas.width, 6);

    // Three.js CylinderGeometry UV U=0.5 faces +Z (toward the seated viewer!)
    ctx.fillStyle = "#1b1f26";
    ctx.font = '800 94px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("</>", wrapCanvas.width * 0.5, wrapCanvas.height * 0.53);
  }

  const wrapTex = track(new THREE.CanvasTexture(wrapCanvas));
  wrapTex.colorSpace = THREE.SRGBColorSpace;
  wrapTex.anisotropy = 4;

  // Open-ended outer ceramic cylinder so top shows coffee surface cleanly
  const bodyGeo = track(new THREE.CylinderGeometry(mugR, mugR * 0.96, mugH, 32, 1, true));
  const bodyMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-mug-ceramic",
      map: wrapTex,
      roughness: 0.42,
      metalness: 0.0,
    }),
  );
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = mugH / 2;
  // CylinderGeometry UV U=0.5 faces -Z by default; rotate PI so bold `</>` faces +Z directly toward the seated viewer
  bodyMesh.rotation.y = Math.PI;
  group.add(bodyMesh);

  // Subtle silhouette outline around the mug body for illustrated harmony
  const outlineGeo = track(new THREE.CylinderGeometry(mugR * 1.045, mugR * 1.005, mugH * 1.01, 28, 1, true));
  const outlineMat = track(
    new THREE.MeshBasicMaterial({
      name: "meeting-mug-outline",
      color: 0x22262c,
      side: THREE.BackSide,
      toneMapped: false,
    }),
  );
  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
  outlineMesh.position.y = mugH / 2;
  group.add(outlineMesh);

  // White rim ring + dark brewed coffee top surface inside the mug
  const rimGeo = track(new THREE.TorusGeometry(mugR - 0.003, 0.004, 10, 32));
  rimGeo.rotateX(Math.PI / 2);
  const ceramicPlainMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-mug-white",
      color: 0xfaf9f5,
      roughness: 0.4,
      metalness: 0.0,
    }),
  );
  const rimMesh = new THREE.Mesh(rimGeo, ceramicPlainMat);
  rimMesh.position.y = mugH;
  group.add(rimMesh);

  const coffeeGeo = track(new THREE.CircleGeometry(mugR - 0.005, 28));
  coffeeGeo.rotateX(-Math.PI / 2);
  const coffeeMat = track(
    new THREE.MeshStandardMaterial({
      name: "meeting-mug-coffee",
      color: 0x452a1b,
      roughness: 0.28,
      metalness: 0.05,
    }),
  );
  const coffeeMesh = new THREE.Mesh(coffeeGeo, coffeeMat);
  coffeeMesh.position.y = mugH - 0.009;
  group.add(coffeeMesh);

  // Ceramic base cap
  const baseGeo = track(new THREE.CircleGeometry(mugR * 0.96, 24));
  baseGeo.rotateX(Math.PI / 2);
  const baseMesh = new THREE.Mesh(baseGeo, ceramicPlainMat);
  baseMesh.position.y = 0.001;
  group.add(baseMesh);

  // Curved 3D D-handle on the right side (+X) with crisp outline
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(mugR - 0.004, mugH * 0.76, 0),
    new THREE.Vector3(mugR + 0.032, mugH * 0.73, 0),
    new THREE.Vector3(mugR + 0.036, mugH * 0.48, 0),
    new THREE.Vector3(mugR + 0.028, mugH * 0.26, 0),
    new THREE.Vector3(mugR - 0.004, mugH * 0.24, 0),
  ]);
  const handleGeo = track(new THREE.TubeGeometry(handleCurve, 16, 0.0072, 10, false));
  const handleMesh = new THREE.Mesh(handleGeo, ceramicPlainMat);
  const handleOutlineGeo = track(new THREE.TubeGeometry(handleCurve, 16, 0.0096, 10, false));
  const handleOutlineMesh = new THREE.Mesh(handleOutlineGeo, outlineMat);
  group.add(handleMesh, handleOutlineMesh);

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
