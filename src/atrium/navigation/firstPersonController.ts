import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import type { CollisionWorld } from "./collisionWorld";

const MOVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export interface FirstPersonState {
  x: number;
  y: number;
  z: number;
  feetY: number;
  yaw: number;
  pitch: number;
  surfaceId: string;
  pointerLocked: boolean;
}

/**
 * Walkable First-Person camera controller (~1.60 m eye height above active floor/step)
 * supporting WASD / Arrow keys, click-drag look, double-click Pointer Lock, and touch look.
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

  private readonly keys = new Set<string>();
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };
  private touchLookId: number | null = null;
  private lastTouch = { x: 0, y: 0 };
  private pointerLocked = false;
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
    };
  }

  spawnAt(x: number, z: number, yaw = 0, pitch = -0.02, hintFeetY?: number): void {
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
  }

  enable(customSpawn?: { x: number; z: number; yaw?: number; pitch?: number; feetY?: number }): void {
    this.enabled = true;
    this.keys.clear();
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
  }

  disable(): void {
    this.enabled = false;
    this.keys.clear();
    this.dragging = false;
    this.touchLookId = null;
    this.vel.x = 0;
    this.vel.z = 0;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  rotateLook(dxPx: number, dyPx: number): void {
    const sens = 0.0024;
    this.yaw -= dxPx * sens;
    this.pitch = Math.max(-1.28, Math.min(1.28, this.pitch - dyPx * sens));
    if (this.enabled) this.applyToCamera();
  }

  /**
   * Deterministic movement helper usable both from the animation loop and tests.
   */
  stepInput(forwardInput: number, strafeInput: number, dtRaw: number): FirstPersonState {
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
      this.vel.x += dirX * this.accel * dt;
      this.vel.z += dirZ * this.accel * dt;
      const spd = Math.hypot(this.vel.x, this.vel.z);
      if (spd > this.maxSpeed) {
        this.vel.x = (this.vel.x / spd) * this.maxSpeed;
        this.vel.z = (this.vel.z / spd) * this.maxSpeed;
      }
    } else {
      const damp = Math.exp(-this.damping * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
      if (Math.hypot(this.vel.x, this.vel.z) < 0.01) {
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

    if (Math.abs(resolved.x - nextX) > 1e-4) this.vel.x = 0;
    if (Math.abs(resolved.z - nextZ) > 1e-4) this.vel.z = 0;

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
    return this.getState();
  }

  step(dtRaw: number): boolean {
    if (!this.enabled) return false;
    let fwd = 0;
    let strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;

    const moving =
      fwd !== 0 ||
      strafe !== 0 ||
      Math.hypot(this.vel.x, this.vel.z) > 0.005 ||
      Math.abs(this.feetY - this.smoothedFeetY) > 0.002;
    if (moving) {
      this.stepInput(fwd, strafe, dtRaw);
    }
    return moving;
  }

  applyToCamera(): void {
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private bindEvents(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (MOVE_CODES.has(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const onBlur = () => {
      this.keys.clear();
      this.dragging = false;
    };
    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!this.enabled || e.button !== 0) return;
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
        this.rotateLook(e.clientX - this.lastMouse.x, e.clientY - this.lastMouse.y);
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseUp = () => {
      this.dragging = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      if (!this.enabled || this.touchLookId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      this.touchLookId = t.identifier;
      this.lastTouch = { x: t.clientX, y: t.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!this.enabled || this.touchLookId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.touchLookId) {
          e.preventDefault();
          this.rotateLook((t.clientX - this.lastTouch.x) * 1.35, (t.clientY - this.lastTouch.y) * 1.35);
          this.lastTouch = { x: t.clientX, y: t.clientY };
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
    window.addEventListener("blur", onBlur);
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
      window.removeEventListener("blur", onBlur);
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
