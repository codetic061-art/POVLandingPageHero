import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import type { CollisionWorld } from "./collisionWorld";

type MoveDir = "fwd" | "back" | "left" | "right";

function mapEventToMoveDir(e: KeyboardEvent): MoveDir | null {
  switch (e.code) {
    case "KeyW":
    case "ArrowUp":
      return "fwd";
    case "KeyS":
    case "ArrowDown":
      return "back";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    default:
      break;
  }
  switch (e.key.toLowerCase()) {
    case "w":
      return "fwd";
    case "s":
      return "back";
    case "a":
      return "left";
    case "d":
      return "right";
    default:
      return null;
  }
}

function normalizeAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export interface CameraPose {
  position: readonly [number, number, number];
  yaw: number;
  pitch: number;
}

export interface FirstPersonState {
  x: number;
  y: number;
  z: number;
  feetY: number;
  yaw: number;
  pitch: number;
  surfaceId: string;
  pointerLocked: boolean;
  poseLocked: boolean;
}

interface PoseTransition {
  fromX: number;
  fromY: number;
  fromZ: number;
  fromYaw: number;
  fromPitch: number;
  toX: number;
  toY: number;
  toZ: number;
  toYaw: number;
  toPitch: number;
  elapsed: number;
  duration: number;
  enteringPose: boolean;
}

/**
 * Walkable First-Person camera controller (~1.60 m eye height above active floor/step)
 * with reliable keyboard state sync, drag/pointer-lock mouse-look, jam-proof collisions,
 * and smooth seated/workstation pose transitions.
 */
export class FirstPersonController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly world: CollisionWorld;
  private enabled = false;

  private readonly eyeHeight = ATRIUM_CONFIG.navigation.firstPerson.eyeHeight;
  private readonly radius = ATRIUM_CONFIG.navigation.firstPerson.playerRadius;
  private readonly maxSpeed = ATRIUM_CONFIG.navigation.firstPerson.maxSpeed;
  private readonly accel = ATRIUM_CONFIG.navigation.firstPerson.accel;
  private readonly damping = ATRIUM_CONFIG.navigation.firstPerson.damping;

  private pos = { x: 0, y: 1.6, z: 1.15 };
  private feetY = 0;
  private smoothedFeetY = 0;
  private surfaceId = "ground-atrium";
  private vel = { x: 0, z: 0 };
  private yaw = 0;
  private pitch = -0.02;

  // Interactive seated / desk-focus pose state
  private poseLocked = false;
  private poseBaseYaw = 0;
  private poseBasePitch = 0;
  private savedStandingPose: {
    x: number;
    z: number;
    feetY: number;
    yaw: number;
    pitch: number;
  } | null = null;
  private transition: PoseTransition | null = null;

  private readonly activeDirs = new Set<MoveDir>();
  private virtualMove = { forward: 0, strafe: 0 };
  private touchLookPending = { dx: 0, dy: 0 };
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };
  private touchLookId: number | null = null;
  private lastTouch = { x: 0, y: 0 };
  private pointerLocked = false;
  private renderDirty = true;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    world: CollisionWorld,
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.bindEvents();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isInInteractivePose(): boolean {
    return this.poseLocked || Boolean(this.transition?.enteringPose);
  }

  /**
   * Feeds continuous normalized analog movement (-1..+1) from the mobile virtual joystick.
   */
  setVirtualMove(forward: number, strafe: number): void {
    this.virtualMove.forward = THREE.MathUtils.clamp(forward, -1, 1);
    this.virtualMove.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
  }

  clearInputState(): void {
    this.activeDirs.clear();
    this.virtualMove.forward = 0;
    this.virtualMove.strafe = 0;
    this.touchLookPending.dx = 0;
    this.touchLookPending.dy = 0;
    this.dragging = false;
    this.touchLookId = null;
    this.vel.x = 0;
    this.vel.z = 0;
  }

  getState(): FirstPersonState {
    return {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      feetY: this.feetY,
      yaw: this.yaw,
      pitch: this.pitch,
      surfaceId: this.surfaceId,
      pointerLocked: this.pointerLocked,
      poseLocked: this.poseLocked,
    };
  }

  spawnAt(x: number, z: number, yaw = 0, pitch = -0.02, hintFeetY?: number): void {
    this.cancelPoseImmediate();
    const initialSurf =
      hintFeetY !== undefined
        ? this.world.findSurface(x, z, hintFeetY, false) ??
          this.world.findSurface(x, z, hintFeetY, true)
        : this.world.findSurface(x, z, 0, true);
    const baseY = initialSurf?.feetY ?? 0;
    const resolved = this.world.resolveMove(x, z, baseY, x, z, this.radius);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;
    this.feetY = resolved.feetY;
    this.smoothedFeetY = resolved.feetY;
    this.surfaceId = resolved.surfaceId;
    this.pos.y = this.smoothedFeetY + this.eyeHeight;
    this.vel.x = 0;
    this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = pitch;
    this.applyToCamera();
    this.renderDirty = true;
  }

  enable(customSpawn?: { x: number; z: number; yaw?: number; pitch?: number; feetY?: number }): void {
    this.enabled = true;
    this.clearInputState();
    this.cancelPoseImmediate();
    const def = ATRIUM_CONFIG.navigation.firstPerson.defaultSpawn;
    if (customSpawn) {
      this.spawnAt(
        customSpawn.x,
        customSpawn.z,
        customSpawn.yaw ?? 0,
        customSpawn.pitch ?? -0.02,
        customSpawn.feetY,
      );
    } else {
      this.spawnAt(def.x, def.z, def.yaw, def.pitch, 0);
    }
    this.camera.near = 0.08;
    this.camera.far = 160;
    this.camera.fov = this.camera.aspect < 0.85 ? 74 : 60;
    this.camera.updateProjectionMatrix();
    this.applyToCamera();
    this.renderDirty = true;
  }

  disable(): void {
    this.enabled = false;
    this.clearInputState();
    this.cancelPoseImmediate();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  /**
   * Smoothly transitions the First-Person camera into a seated chair or desk-focus pose.
   */
  enterPose(pose: CameraPose, durationSec = 0.65): void {
    if (!this.savedStandingPose) {
      this.savedStandingPose = {
        x: this.pos.x,
        z: this.pos.z,
        feetY: this.feetY,
        yaw: this.yaw,
        pitch: this.pitch,
      };
    }
    this.activeDirs.clear();
    this.vel.x = 0;
    this.vel.z = 0;
    this.poseLocked = true;
    this.poseBaseYaw = pose.yaw;
    this.poseBasePitch = pose.pitch;

    const targetYaw = this.yaw + normalizeAngleDelta(this.yaw, pose.yaw);
    this.transition = {
      fromX: this.pos.x,
      fromY: this.pos.y,
      fromZ: this.pos.z,
      fromYaw: this.yaw,
      fromPitch: this.pitch,
      toX: pose.position[0],
      toY: pose.position[1],
      toZ: pose.position[2],
      toYaw: targetYaw,
      toPitch: pose.pitch,
      elapsed: 0,
      duration: Math.max(0.05, durationSec),
      enteringPose: true,
    };
    this.renderDirty = true;
  }

  /**
   * Smoothly returns from a seated/focused pose back to the saved standing First-Person pose.
   */
  exitPose(durationSec = 0.5): void {
    if (!this.poseLocked && !this.transition) return;
    const stand = this.savedStandingPose ?? {
      x: this.pos.x,
      z: this.pos.z,
      feetY: this.feetY,
      yaw: this.yaw,
      pitch: -0.02,
    };
    const standY = stand.feetY + this.eyeHeight;
    const targetYaw = this.yaw + normalizeAngleDelta(this.yaw, stand.yaw);
    this.transition = {
      fromX: this.pos.x,
      fromY: this.pos.y,
      fromZ: this.pos.z,
      fromYaw: this.yaw,
      fromPitch: this.pitch,
      toX: stand.x,
      toY: standY,
      toZ: stand.z,
      toYaw: targetYaw,
      toPitch: stand.pitch,
      elapsed: 0,
      duration: Math.max(0.05, durationSec),
      enteringPose: false,
    };
    this.renderDirty = true;
  }

  cancelPoseImmediate(): void {
    if (this.savedStandingPose) {
      this.pos.x = this.savedStandingPose.x;
      this.pos.z = this.savedStandingPose.z;
      this.feetY = this.savedStandingPose.feetY;
      this.smoothedFeetY = this.savedStandingPose.feetY;
      this.pos.y = this.smoothedFeetY + this.eyeHeight;
      this.yaw = this.savedStandingPose.yaw;
      this.pitch = this.savedStandingPose.pitch;
      this.savedStandingPose = null;
    }
    this.poseLocked = false;
    this.transition = null;
    this.renderDirty = true;
  }

  rotateLook(dxPx: number, dyPx: number): void {
    if (Math.abs(dxPx) < 1e-4 && Math.abs(dyPx) < 1e-4) return;
    // Ignore drag-look mid-transition so camera smoothly settles onto seat/desk
    if (this.transition) return;
    const sens = 0.0024;
    if (this.poseLocked) {
      // Allow comfortable natural head-turn while seated or inspecting a workstation
      const maxYawOffset = 1.05;
      const nextYaw = this.yaw - dxPx * sens;
      const deltaYaw = normalizeAngleDelta(this.poseBaseYaw, nextYaw);
      this.yaw = this.poseBaseYaw + THREE.MathUtils.clamp(deltaYaw, -maxYawOffset, maxYawOffset);
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dyPx * sens,
        Math.max(-1.1, this.poseBasePitch - 0.55),
        Math.min(0.85, this.poseBasePitch + 0.55),
      );
    } else {
      this.yaw -= dxPx * sens;
      this.pitch = Math.max(-1.28, Math.min(1.28, this.pitch - dyPx * sens));
    }
    if (this.enabled) {
      this.applyToCamera();
      this.renderDirty = true;
    }
  }

  /**
   * Deterministic movement helper usable both from the animation loop and automated tests.
   */
  stepInput(forwardInput: number, strafeInput: number, dtRaw: number): FirstPersonState {
    if (this.poseLocked || this.transition) {
      return this.getState();
    }
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));
    let fwd = forwardInput;
    let strafe = strafeInput;
    const len = Math.hypot(fwd, strafe);
    if (len > 1) {
      fwd /= len;
      strafe /= len;
    }

    // Camera forward in XZ plane for YXZ yaw: (-sin(yaw), -cos(yaw))
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const dirX = -sinY * fwd + cosY * strafe;
    const dirZ = -cosY * fwd - sinY * strafe;

    if (len > 0.01) {
      // Smooth exponential approach toward target velocity for crisp, framerate-independent feel
      const targetVx = dirX * this.maxSpeed;
      const targetVz = dirZ * this.maxSpeed;
      const accelBlend = 1 - Math.exp(-(this.accel / this.maxSpeed) * dt);
      this.vel.x += (targetVx - this.vel.x) * accelBlend;
      this.vel.z += (targetVz - this.vel.z) * accelBlend;
    } else {
      const damp = Math.exp(-this.damping * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
      if (Math.hypot(this.vel.x, this.vel.z) < 0.008) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }

    const nextX = this.pos.x + this.vel.x * dt;
    const nextZ = this.pos.z + this.vel.z * dt;
    const resolved = this.world.resolveMove(
      this.pos.x,
      this.pos.z,
      this.feetY,
      nextX,
      nextZ,
      this.radius,
    );

    // Only zero out the axis that was genuinely blocked so diagonal wall-sliding stays fluid
    const movedX = resolved.x - this.pos.x;
    const movedZ = resolved.z - this.pos.z;
    const wantedX = nextX - this.pos.x;
    const wantedZ = nextZ - this.pos.z;
    if (Math.abs(wantedX) > 1e-4 && Math.abs(movedX) < Math.abs(wantedX) * 0.25) {
      this.vel.x = 0;
    }
    if (Math.abs(wantedZ) > 1e-4 && Math.abs(movedZ) < Math.abs(wantedZ) * 0.25) {
      this.vel.z = 0;
    }

    this.pos.x = resolved.x;
    this.pos.z = resolved.z;
    this.feetY = resolved.feetY;
    this.surfaceId = resolved.surfaceId;
    const yBlend = 1 - Math.exp(-18 * dt);
    this.smoothedFeetY += (this.feetY - this.smoothedFeetY) * yBlend;
    if (Math.abs(this.feetY - this.smoothedFeetY) < 0.002) {
      this.smoothedFeetY = this.feetY;
    }
    this.pos.y = this.smoothedFeetY + this.eyeHeight;
    this.applyToCamera();
    this.renderDirty = true;
    return this.getState();
  }

  step(dtRaw: number): boolean {
    if (!this.enabled) return false;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));

    // Handle smooth camera transition into/out of seated or desk-focus poses
    if (this.transition) {
      const tr = this.transition;
      tr.elapsed = Math.min(tr.duration, tr.elapsed + dt);
      const t = tr.elapsed / tr.duration;
      // Smooth cubic ease-in-out
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.pos.x = THREE.MathUtils.lerp(tr.fromX, tr.toX, eased);
      this.pos.y = THREE.MathUtils.lerp(tr.fromY, tr.toY, eased);
      this.pos.z = THREE.MathUtils.lerp(tr.fromZ, tr.toZ, eased);
      this.yaw = THREE.MathUtils.lerp(tr.fromYaw, tr.toYaw, eased);
      this.pitch = THREE.MathUtils.lerp(tr.fromPitch, tr.toPitch, eased);
      this.applyToCamera();

      if (tr.elapsed >= tr.duration) {
        const wasEntering = tr.enteringPose;
        this.transition = null;
        if (wasEntering) {
          this.poseBaseYaw = this.yaw;
          this.poseBasePitch = this.pitch;
        } else {
          this.poseLocked = false;
          if (this.savedStandingPose) {
            this.feetY = this.savedStandingPose.feetY;
            this.smoothedFeetY = this.savedStandingPose.feetY;
            this.savedStandingPose = null;
          }
        }
      }
      this.renderDirty = false;
      return true;
    }

    // Smoothly interpolate accumulated touch-drag look deltas for comfortable mobile camera rotation
    if (Math.abs(this.touchLookPending.dx) > 0.05 || Math.abs(this.touchLookPending.dy) > 0.05) {
      const lookBlend = 1 - Math.exp(-22 * dt);
      const stepDx = this.touchLookPending.dx * lookBlend;
      const stepDy = this.touchLookPending.dy * lookBlend;
      this.touchLookPending.dx -= stepDx;
      this.touchLookPending.dy -= stepDy;
      this.rotateLook(stepDx, stepDy);
    } else if (this.touchLookPending.dx !== 0 || this.touchLookPending.dy !== 0) {
      this.rotateLook(this.touchLookPending.dx, this.touchLookPending.dy);
      this.touchLookPending.dx = 0;
      this.touchLookPending.dy = 0;
    }

    if (!this.poseLocked) {
      let fwd = this.virtualMove.forward;
      let strafe = this.virtualMove.strafe;
      if (this.activeDirs.has("fwd")) fwd += 1;
      if (this.activeDirs.has("back")) fwd -= 1;
      if (this.activeDirs.has("right")) strafe += 1;
      if (this.activeDirs.has("left")) strafe -= 1;

      const moving =
        Math.abs(fwd) > 0.01 ||
        Math.abs(strafe) > 0.01 ||
        Math.hypot(this.vel.x, this.vel.z) > 0.005 ||
        Math.abs(this.feetY - this.smoothedFeetY) > 0.002;
      if (moving) {
        this.stepInput(fwd, strafe, dt);
      }
    }

    if (this.renderDirty) {
      this.renderDirty = false;
      return true;
    }
    return false;
  }

  applyToCamera(): void {
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private bindEvents(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const dir = mapEventToMoveDir(e);
      if (dir) {
        e.preventDefault();
        // If a toolbar button currently has focus, return focus to canvas so Space/Arrows never hijack controls
        if (target && target.tagName === "BUTTON") {
          target.blur();
          this.canvas.focus({ preventScroll: true });
        }
        this.activeDirs.add(dir);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const dir = mapEventToMoveDir(e);
      if (dir) {
        this.activeDirs.delete(dir);
      }
    };

    const onFocusLoss = () => {
      this.clearInputState();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        this.clearInputState();
      }
    };

    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) {
        this.dragging = false;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.enabled || e.button !== 0) return;
      this.canvas.focus({ preventScroll: true });
      this.dragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    };

    const onDblClick = () => {
      if (!this.enabled) return;
      if (!this.pointerLocked && this.canvas.requestPointerLock) {
        try {
          void this.canvas.requestPointerLock();
        } catch {
          // Pointer Lock may be declined in headless or iframe sandboxes; drag-look remains active.
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.rotateLook(e.movementX || 0, e.movementY || 0);
      } else if (this.dragging) {
        // Guard against mouse button released outside window
        if ((e.buttons & 1) === 0) {
          this.dragging = false;
          return;
        }
        this.rotateLook(e.clientX - this.lastMouse.x, e.clientY - this.lastMouse.y);
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = () => {
      this.dragging = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!this.enabled || this.touchLookId !== null) return;
      // Only handle touches directly on the WebGL canvas (never UI buttons or virtual joystick)
      if (e.target !== this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        // Reserve bottom-left thumb zone for the virtual joystick when standing
        const inJoystickCorner =
          !this.poseLocked &&
          t.clientX < rect.left + Math.min(180, rect.width * 0.42) &&
          t.clientY > rect.bottom - 220;
        if (inJoystickCorner) continue;
        this.touchLookId = t.identifier;
        this.lastTouch = { x: t.clientX, y: t.clientY };
        break;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.enabled || this.touchLookId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.touchLookId) {
          e.preventDefault();
          const dx = (t.clientX - this.lastTouch.x) * 1.45;
          const dy = (t.clientY - this.lastTouch.y) * 1.25;
          this.touchLookPending.dx += dx;
          this.touchLookPending.dy += dy;
          this.lastTouch = { x: t.clientX, y: t.clientY };
          this.renderDirty = true;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchLookId) {
          this.touchLookId = null;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onFocusLoss);
    window.addEventListener("contextmenu", onFocusLoss);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    this.canvas.addEventListener("mousedown", onMouseDown);
    this.canvas.addEventListener("dblclick", onDblClick);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    this.canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    this.canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    this.canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });

    this.cleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onFocusLoss);
      window.removeEventListener("contextmenu", onFocusLoss);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      this.canvas.removeEventListener("mousedown", onMouseDown);
      this.canvas.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      this.canvas.removeEventListener("touchstart", onTouchStart);
      this.canvas.removeEventListener("touchmove", onTouchMove);
      this.canvas.removeEventListener("touchend", onTouchEnd);
      this.canvas.removeEventListener("touchcancel", onTouchEnd);
    });
  }

  dispose(): void {
    this.disable();
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
  }
}
