/**
 * Detects whether the current device/viewport uses coarse touch input.
 */
export function detectTouchEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const maxTouch = typeof navigator !== "undefined" ? navigator.maxTouchPoints > 0 : false;
  return coarse || maxTouch;
}

export interface VirtualJoystickCallbacks {
  onMove: (forward: number, strafe: number) => void;
  onTouchDetected?: () => void;
}

export interface VirtualJoystickController {
  isTouchMode: () => boolean;
  setTouchModeForced: (forced: boolean) => void;
  setVisible: (visible: boolean) => void;
  getVector: () => { forward: number; strafe: number };
  reset: () => void;
  dispose: () => void;
}

const DEADZONE = 0.12;
const MAX_RADIUS_PX = 40;

/**
 * Minimal architectural virtual thumb joystick positioned in the bottom-left corner
 * for comfortable one-thumb first-person movement on touchscreen devices.
 * Automatically hidden on desktop mouse/keyboard sessions, in Orbit mode, while seated,
 * and inside the Virtual Meeting Room.
 */
export function createVirtualJoystick(
  host: HTMLDivElement,
  callbacks: VirtualJoystickCallbacks,
): VirtualJoystickController {
  let touchMode = detectTouchEnvironment();
  let visibleRequested = false;
  let activePointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let forward = 0;
  let strafe = 0;

  const zoneEl = document.createElement("div");
  zoneEl.className = "atrium-touch-joystick";
  zoneEl.setAttribute("data-name", "Atrium / Virtual joystick");
  zoneEl.setAttribute("role", "application");
  zoneEl.setAttribute("aria-label", "Movement joystick");
  zoneEl.setAttribute("aria-hidden", "true");

  const ringEl = document.createElement("div");
  ringEl.className = "atrium-joystick-base";

  const knobEl = document.createElement("div");
  knobEl.className = "atrium-joystick-knob";

  ringEl.append(knobEl);
  zoneEl.append(ringEl);
  host.append(zoneEl);

  const syncVisibility = () => {
    const show = touchMode && visibleRequested;
    zoneEl.classList.toggle("is-visible", show);
    zoneEl.setAttribute("aria-hidden", String(!show));
    if (!show) {
      resetStick();
    }
  };

  const applyKnob = (dx: number, dy: number) => {
    knobEl.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
  };

  const resetStick = () => {
    activePointerId = null;
    zoneEl.classList.remove("is-active");
    applyKnob(0, 0);
    if (forward !== 0 || strafe !== 0) {
      forward = 0;
      strafe = 0;
      callbacks.onMove(0, 0);
    }
  };

  const updateFromClient = (clientX: number, clientY: number) => {
    const rawDx = clientX - originX;
    const rawDy = clientY - originY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(MAX_RADIUS_PX, dist);
    const angle = dist > 1e-4 ? Math.atan2(rawDy, rawDx) : 0;
    const dx = Math.cos(angle) * clampedDist;
    const dy = Math.sin(angle) * clampedDist;
    applyKnob(dx, dy);

    const norm = clampedDist / MAX_RADIUS_PX;
    if (norm < DEADZONE) {
      forward = 0;
      strafe = 0;
    } else {
      const scaled = (norm - DEADZONE) / (1 - DEADZONE);
      // Upward thumb push (-dy) = forward (+1); rightward push (+dx) = strafe right (+1)
      strafe = Math.cos(angle) * scaled;
      forward = -Math.sin(angle) * scaled;
    }
    callbacks.onMove(forward, strafe);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!touchMode || !visibleRequested) return;
    if (activePointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerId = e.pointerId;
    const rect = ringEl.getBoundingClientRect();
    originX = rect.left + rect.width * 0.5;
    originY = rect.top + rect.height * 0.5;
    zoneEl.classList.add("is-active");
    zoneEl.setPointerCapture?.(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    e.stopPropagation();
    if (zoneEl.hasPointerCapture?.(e.pointerId)) {
      zoneEl.releasePointerCapture(e.pointerId);
    }
    resetStick();
  };

  // Promote touch mode cleanly if user touches canvas on hybrid laptops/tablets
  const onGlobalTouchStart = () => {
    if (!touchMode) {
      touchMode = true;
      syncVisibility();
      callbacks.onTouchDetected?.();
    }
  };

  const onBlur = () => resetStick();

  zoneEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  zoneEl.addEventListener("pointermove", onPointerMove, { passive: false });
  zoneEl.addEventListener("pointerup", onPointerUp);
  zoneEl.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("touchstart", onGlobalTouchStart, { passive: true, once: true });
  window.addEventListener("blur", onBlur);

  syncVisibility();

  return {
    isTouchMode: () => touchMode,
    setTouchModeForced(forced) {
      touchMode = forced;
      syncVisibility();
    },
    setVisible(visible) {
      visibleRequested = visible;
      syncVisibility();
    },
    getVector: () => ({ forward, strafe }),
    reset: resetStick,
    dispose() {
      resetStick();
      zoneEl.removeEventListener("pointerdown", onPointerDown);
      zoneEl.removeEventListener("pointermove", onPointerMove);
      zoneEl.removeEventListener("pointerup", onPointerUp);
      zoneEl.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("touchstart", onGlobalTouchStart);
      window.removeEventListener("blur", onBlur);
      zoneEl.remove();
    },
  };
}
