import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import type { FirstPersonController } from "../navigation/firstPersonController";
import { detectTouchEnvironment } from "../navigation/touchControls";

export type InteractionTargetConfig = (typeof ATRIUM_CONFIG.interactions.targets)[number];

export interface InteractionSnapshot {
  nearestTargetId: string | null;
  activeTargetId: string | null;
  activeKind: "chair" | "desk" | "door" | null;
  holdProgress: number;
  promptVisible: boolean;
}

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Manages proximity detection, 1-second Hold-E circular progress ring (for selected
 * chairs/desks), instant Press-E entry for the upper-floor Meeting Room door,
 * 3D-projected floating Glassmorphism prompt, and single-tap touchscreen alternatives.
 */
export class AtriumInteractionManager {
  private readonly host: HTMLDivElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly fpController: FirstPersonController;
  private readonly onEnterMeetingRoom?: () => void;
  private readonly targets = ATRIUM_CONFIG.interactions.targets;
  private readonly holdDuration = ATRIUM_CONFIG.interactions.holdDurationSec;
  private readonly transitionDuration = ATRIUM_CONFIG.interactions.transitionDurationSec;

  // Reusable single DOM nodes (zero per-frame DOM allocations)
  private readonly promptEl: HTMLButtonElement;
  private readonly keyCapEl: HTMLSpanElement;
  private readonly titleEl: HTMLSpanElement;
  private readonly subtitleEl: HTMLSpanElement;
  private readonly ringProgressEl: SVGCircleElement;
  private readonly statusPillEl: HTMLButtonElement;
  private readonly statusTextEl: HTMLSpanElement;

  private readonly projVec = new THREE.Vector3();
  private enabled = false;
  private touchMode = detectTouchEnvironment();
  private lastTapAt = 0;
  private nearestTarget: InteractionTargetConfig | null = null;
  private activeTarget: InteractionTargetConfig | null = null;
  private holdingE = false;
  private waitReleaseAfterActivate = false;
  private holdProgress = 0;
  private promptVisible = false;
  private lastShownKey = "";
  private lastTransform = "";
  private readonly cleanups: Array<() => void> = [];

  constructor(
    host: HTMLDivElement,
    camera: THREE.PerspectiveCamera,
    fpController: FirstPersonController,
    onEnterMeetingRoom?: () => void,
  ) {
    this.host = host;
    this.camera = camera;
    this.fpController = fpController;
    this.onEnterMeetingRoom = onEnterMeetingRoom;

    // 1. Floating 3D-projected Glassmorphism prompt (interactive single-tap button on touch devices)
    this.promptEl = document.createElement("button");
    this.promptEl.type = "button";
    this.promptEl.className = "atrium-interaction-prompt";
    this.promptEl.setAttribute("data-name", "Atrium / Interaction prompt");
    this.promptEl.setAttribute("aria-live", "polite");
    this.promptEl.setAttribute("aria-hidden", "true");

    const keyWrap = document.createElement("div");
    keyWrap.className = "atrium-key-ring";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 40 40");
    svg.setAttribute("aria-hidden", "true");

    const track = document.createElementNS(svgNS, "circle");
    track.setAttribute("class", "atrium-ring-track");
    track.setAttribute("cx", "20");
    track.setAttribute("cy", "20");
    track.setAttribute("r", String(RING_RADIUS));

    this.ringProgressEl = document.createElementNS(svgNS, "circle");
    this.ringProgressEl.setAttribute("class", "atrium-ring-progress");
    this.ringProgressEl.setAttribute("cx", "20");
    this.ringProgressEl.setAttribute("cy", "20");
    this.ringProgressEl.setAttribute("r", String(RING_RADIUS));
    this.ringProgressEl.style.strokeDasharray = `${RING_CIRCUMFERENCE.toFixed(2)}`;
    this.ringProgressEl.style.strokeDashoffset = `${RING_CIRCUMFERENCE.toFixed(2)}`;

    svg.append(track, this.ringProgressEl);

    this.keyCapEl = document.createElement("span");
    this.keyCapEl.className = "atrium-key-letter";
    this.keyCapEl.textContent = "E";

    keyWrap.append(svg, this.keyCapEl);

    const textWrap = document.createElement("div");
    textWrap.className = "atrium-prompt-copy";

    this.titleEl = document.createElement("span");
    this.titleEl.className = "atrium-prompt-title";
    this.titleEl.textContent = "Have a seat";

    this.subtitleEl = document.createElement("span");
    this.subtitleEl.className = "atrium-prompt-subtitle";
    this.subtitleEl.textContent = "Hold E to sit";

    textWrap.append(this.titleEl, this.subtitleEl);
    this.promptEl.append(keyWrap, textWrap);
    this.host.append(this.promptEl);

    // 2. Minimal Glassmorphism active-state pill (tappable exit button on touch devices)
    this.statusPillEl = document.createElement("button");
    this.statusPillEl.type = "button";
    this.statusPillEl.className = "atrium-active-pill";
    this.statusPillEl.setAttribute("data-name", "Atrium / Seated status");
    this.statusPillEl.setAttribute("aria-hidden", "true");

    const pillDot = document.createElement("span");
    pillDot.className = "atrium-active-dot";

    this.statusTextEl = document.createElement("span");
    this.statusTextEl.className = "atrium-active-text";
    this.statusTextEl.textContent = "";

    this.statusPillEl.append(pillDot, this.statusTextEl);
    this.host.append(this.statusPillEl);

    this.syncTouchClasses();
    this.bindEvents();
  }

  setTouchMode(touch: boolean): void {
    if (this.touchMode === touch) return;
    this.touchMode = touch;
    this.lastShownKey = "";
    this.syncTouchClasses();
    if (this.activeTarget) {
      this.statusTextEl.textContent = this.formatActiveLabel(this.activeTarget);
    }
  }

  private syncTouchClasses(): void {
    this.promptEl.classList.toggle("is-touch", this.touchMode);
    this.statusPillEl.classList.toggle("is-touch", this.touchMode);
  }

  private formatActiveLabel(target: InteractionTargetConfig): string {
    if (!this.touchMode) return target.activeLabel;
    if (target.kind === "chair") return "Seated · Tap to Stand";
    return "Focused · Tap to Return";
  }

  private formatPromptCopy(target: InteractionTargetConfig): {
    badge: string;
    title: string;
    subtitle: string;
  } {
    if (!this.touchMode) {
      return { badge: "E", title: target.title, subtitle: target.subtitle };
    }
    if (target.kind === "door") {
      return { badge: "Tap", title: "Tap to Enter", subtitle: "Virtual Meeting Room" };
    }
    if (target.kind === "chair") {
      return { badge: "Tap", title: "Tap to Sit", subtitle: "Have a seat" };
    }
    return { badge: "Tap", title: "Tap to Focus", subtitle: target.title };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetAll(true);
    }
  }

  /**
   * Programmatic hold trigger for deterministic testing and accessibility integrations.
   */
  setHoldingInteract(holding: boolean): void {
    if (!this.enabled) return;
    if (!holding) {
      this.holdingE = false;
      this.waitReleaseAfterActivate = false;
      return;
    }
    if (this.activeTarget) {
      this.exitActiveInteraction();
      return;
    }
    if (this.nearestTarget) {
      if (this.nearestTarget.triggerMode === "press") {
        this.activateTarget(this.nearestTarget);
        return;
      }
      this.holdingE = true;
    }
  }

  exitActiveInteraction(immediate = false): void {
    if (!this.activeTarget) return;
    this.activeTarget = null;
    this.holdingE = false;
    this.holdProgress = 0;
    this.syncRingUI();
    this.statusPillEl.classList.remove("is-visible");
    this.statusPillEl.setAttribute("aria-hidden", "true");
    if (immediate) {
      this.fpController.cancelPoseImmediate();
    } else {
      this.fpController.exitPose(this.transitionDuration * 0.8);
    }
  }

  resetAll(immediate = false): void {
    this.holdingE = false;
    this.waitReleaseAfterActivate = false;
    this.holdProgress = 0;
    this.nearestTarget = null;
    if (this.activeTarget) {
      this.exitActiveInteraction(immediate);
    }
    this.setPromptVisible(false);
    this.syncRingUI();
  }

  getSnapshot(): InteractionSnapshot {
    return {
      nearestTargetId: this.nearestTarget?.id ?? null,
      activeTargetId: this.activeTarget?.id ?? null,
      activeKind: this.activeTarget?.kind ?? null,
      holdProgress: +this.holdProgress.toFixed(3),
      promptVisible: this.promptVisible,
    };
  }

  /**
   * Advances proximity detection, hold-E ring progress, and 3D-to-2D prompt placement.
   * Returns true if visual state changed and warrants a WebGL frame update.
   */
  update(dtRaw: number): boolean {
    if (!this.enabled) return false;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));

    // If seated or focusing a workstation, keep floating prompt hidden and status pill visible
    if (this.activeTarget) {
      this.setPromptVisible(false);
      return false;
    }

    const fp = this.fpController.getState();
    const sinY = Math.sin(fp.yaw);
    const cosY = Math.cos(fp.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;

    // Pick closest eligible target within radius, using gentle look-direction preference
    // so nearby chair & desk pairs are effortlessly distinguishable
    let bestTarget: InteractionTargetConfig | null = null;
    let bestScore = Infinity;

    for (const target of this.targets) {
      const [px, py, pz] = target.proximityCenter;
      if (Math.abs(fp.feetY - py) > 0.65) continue;
      const dx = px - fp.x;
      const dz = pz - fp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > target.radius) continue;

      const invDist = dist > 1e-4 ? 1 / dist : 0;
      const lookDot = (dx * fwdX + dz * fwdZ) * invDist;
      const score = dist - lookDot * 0.48;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    const prevTargetId = this.nearestTarget?.id ?? null;
    const nextTargetId = bestTarget?.id ?? null;
    this.nearestTarget = bestTarget;

    // Cancel hold progress immediately if player leaves proximity or switches targets
    if (!bestTarget || prevTargetId !== nextTargetId) {
      if (this.holdProgress > 0) {
        this.holdProgress = 0;
        this.syncRingUI();
      }
      if (!bestTarget) {
        this.holdingE = false;
      }
    }

    if (!bestTarget) {
      this.setPromptVisible(false);
      return false;
    }

    // Update prompt label only when target or touch mode changes
    const shownKey = `${bestTarget.id}:${this.touchMode ? "t" : "k"}`;
    if (this.lastShownKey !== shownKey) {
      this.lastShownKey = shownKey;
      const copy = this.formatPromptCopy(bestTarget);
      this.keyCapEl.textContent = copy.badge;
      this.titleEl.textContent = copy.title;
      this.subtitleEl.textContent = copy.subtitle;
    }

    // Advance or smoothly reset the 1-second hold-E progress ring
    let changed = false;
    if (this.holdingE && !this.waitReleaseAfterActivate) {
      this.holdProgress = Math.min(1, this.holdProgress + dt / this.holdDuration);
      this.promptEl.classList.add("is-holding");
      this.syncRingUI();
      changed = true;
      if (this.holdProgress >= 1) {
        this.activateTarget(bestTarget);
        return true;
      }
    } else if (this.holdProgress > 0) {
      this.holdProgress = Math.max(0, this.holdProgress - dt * 5.5);
      if (this.holdProgress === 0) {
        this.promptEl.classList.remove("is-holding");
      }
      this.syncRingUI();
      changed = true;
    } else {
      this.promptEl.classList.remove("is-holding");
    }

    // Project 3D anchor onto viewport so the Glassmorphism prompt floats naturally in 3D space
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w < 10 || h < 10) return changed;

    this.camera.updateMatrixWorld();
    this.projVec.set(bestTarget.anchor[0], bestTarget.anchor[1], bestTarget.anchor[2]);
    this.projVec.project(this.camera);

    // Hide gracefully if target anchor is directly behind the camera
    if (this.projVec.z > 1.0) {
      this.setPromptVisible(false);
      return changed;
    }

    const rawX = (this.projVec.x * 0.5 + 0.5) * w;
    const rawY = (-this.projVec.y * 0.5 + 0.5) * h;
    // Keep indicator comfortably inside viewport bounds so it never clips or blocks bottom controls/joystick
    const padX = Math.min(118, w * 0.34);
    const padBottom = this.touchMode ? 124 : 104;
    const clampedX = THREE.MathUtils.clamp(rawX, padX, w - padX);
    const clampedY = THREE.MathUtils.clamp(rawY, 76, h - padBottom);

    const nextTransform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0) translate(-50%, -100%)`;
    if (nextTransform !== this.lastTransform) {
      this.lastTransform = nextTransform;
      this.promptEl.style.transform = nextTransform;
    }
    this.setPromptVisible(true);
    return changed;
  }

  private activateTarget(target: InteractionTargetConfig): void {
    this.holdingE = false;
    this.waitReleaseAfterActivate = true;
    this.holdProgress = 0;
    this.promptEl.classList.remove("is-holding");
    this.syncRingUI();
    this.setPromptVisible(false);

    if (target.kind === "door") {
      this.nearestTarget = null;
      this.onEnterMeetingRoom?.();
      return;
    }

    this.activeTarget = target;
    this.statusTextEl.textContent = this.formatActiveLabel(target);
    this.statusPillEl.classList.add("is-visible");
    this.statusPillEl.setAttribute("aria-hidden", "false");

    this.fpController.enterPose(target.pose, this.transitionDuration);
  }

  private setPromptVisible(visible: boolean): void {
    if (this.promptVisible === visible) return;
    this.promptVisible = visible;
    this.promptEl.classList.toggle("is-visible", visible);
    this.promptEl.setAttribute("aria-hidden", String(!visible));
  }

  private syncRingUI(): void {
    const offset = RING_CIRCUMFERENCE * (1 - this.holdProgress);
    this.ringProgressEl.style.strokeDashoffset = offset.toFixed(2);
    this.promptEl.dataset.progress = this.holdProgress.toFixed(2);
  }

  private bindEvents(): void {
    const isInteractKey = (e: KeyboardEvent) =>
      e.code === "KeyE" || e.key.toLowerCase() === "e";

    const onPromptClick = (e: MouseEvent) => {
      if (!this.enabled || !this.promptVisible || !this.nearestTarget) return;
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - this.lastTapAt < 260) return;
      this.lastTapAt = now;
      this.activateTarget(this.nearestTarget);
      this.waitReleaseAfterActivate = false;
    };

    const onStatusPillClick = (e: MouseEvent) => {
      if (!this.enabled || !this.activeTarget) return;
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - this.lastTapAt < 260) return;
      this.lastTapAt = now;
      this.exitActiveInteraction();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.code === "Escape" && this.activeTarget) {
        e.preventDefault();
        this.exitActiveInteraction();
        return;
      }

      if (isInteractKey(e)) {
        if (this.activeTarget) {
          if (!e.repeat && !this.waitReleaseAfterActivate) {
            e.preventDefault();
            this.exitActiveInteraction();
          }
          return;
        }
        if (this.nearestTarget) {
          e.preventDefault();
          if (this.nearestTarget.triggerMode === "press") {
            if (!e.repeat && !this.waitReleaseAfterActivate) {
              this.activateTarget(this.nearestTarget);
            }
            return;
          }
          this.holdingE = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isInteractKey(e)) {
        this.holdingE = false;
        this.waitReleaseAfterActivate = false;
      }
    };

    const onBlurOrHide = () => {
      this.holdingE = false;
      this.waitReleaseAfterActivate = false;
    };

    this.promptEl.addEventListener("click", onPromptClick);
    this.statusPillEl.addEventListener("click", onStatusPillClick);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlurOrHide);
    document.addEventListener("visibilitychange", onBlurOrHide);

    this.cleanups.push(() => {
      this.promptEl.removeEventListener("click", onPromptClick);
      this.statusPillEl.removeEventListener("click", onStatusPillClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlurOrHide);
      document.removeEventListener("visibilitychange", onBlurOrHide);
    });
  }

  dispose(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.promptEl.remove();
    this.statusPillEl.remove();
  }
}
