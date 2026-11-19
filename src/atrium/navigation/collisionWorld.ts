import { ATRIUM_CONFIG } from "../config";

export interface Collider3D {
  tag: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

export interface WalkSurface {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  heightAt: (x: number, z: number) => number;
}

export interface ResolvedStep {
  x: number;
  z: number;
  feetY: number;
  surfaceId: string;
}

/**
 * Multi-elevation 3D collision & walkable-surface solver with jam-proof
 * wall/furniture sliding and escape resolution for staircases and mezzanines.
 */
export class CollisionWorld {
  private readonly staticColliders: Collider3D[] = [];
  private dynamicColliders: Collider3D[] = [];
  private readonly surfaces: WalkSurface[] = [];
  private readonly maxStepDeltaY = ATRIUM_CONFIG.navigation.firstPerson.maxStepDeltaY;

  addCollider(
    tag: string,
    ax0: number,
    ay0: number,
    az0: number,
    ax1: number,
    ay1: number,
    az1: number,
  ): void {
    this.staticColliders.push({
      tag,
      x0: Math.min(ax0, ax1),
      x1: Math.max(ax0, ax1),
      y0: Math.min(ay0, ay1),
      y1: Math.max(ay0, ay1),
      z0: Math.min(az0, az1),
      z1: Math.max(az0, az1),
    });
  }

  setDynamicColliders(colliders: Collider3D[]): void {
    this.dynamicColliders = colliders.map((c) => ({
      tag: c.tag,
      x0: Math.min(c.x0, c.x1),
      x1: Math.max(c.x0, c.x1),
      y0: Math.min(c.y0, c.y1),
      y1: Math.max(c.y0, c.y1),
      z0: Math.min(c.z0, c.z1),
      z1: Math.max(c.z0, c.z1),
    }));
  }

  addSurface(
    id: string,
    ax0: number,
    az0: number,
    ax1: number,
    az1: number,
    heightAt: (x: number, z: number) => number,
  ): void {
    this.surfaces.push({
      id,
      x0: Math.min(ax0, ax1),
      x1: Math.max(ax0, ax1),
      z0: Math.min(az0, az1),
      z1: Math.max(az0, az1),
      heightAt,
    });
  }

  getColliderCount(): number {
    return this.staticColliders.length + this.dynamicColliders.length;
  }

  getSurfaceCount(): number {
    return this.surfaces.length;
  }

  private getAllColliders(): readonly Collider3D[] {
    return this.dynamicColliders.length > 0
      ? [...this.staticColliders, ...this.dynamicColliders]
      : this.staticColliders;
  }

  /**
   * Finds the walkable surface at (x, z) closest to refFeetY within step tolerance.
   */
  findSurface(
    x: number,
    z: number,
    refFeetY: number,
    allowAnyElevation = false,
  ): { feetY: number; id: string } | null {
    let best: { feetY: number; id: string; diff: number } | null = null;
    for (const s of this.surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const y = s.heightAt(x, z);
      const diff = Math.abs(y - refFeetY);
      if (!allowAnyElevation && diff > this.maxStepDeltaY) continue;
      if (!best || diff < best.diff || (Math.abs(diff - best.diff) < 0.02 && y > best.feetY)) {
        best = { feetY: y, id: s.id, diff };
      }
    }
    return best ? { feetY: best.feetY, id: best.id } : null;
  }

  private maxPenetration(x: number, z: number, feetY: number, r: number): number {
    const bodyBottom = feetY + 0.24;
    const bodyTop = feetY + 1.72;
    const all = this.getAllColliders();
    let maxPen = 0;
    for (const b of all) {
      if (b.y1 <= bodyBottom || b.y0 >= bodyTop) continue;
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx;
      const dz = z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < r * r) {
        const pen = r - Math.sqrt(distSq);
        if (pen > maxPen) maxPen = pen;
      }
    }
    return maxPen;
  }

  private pushOut(x: number, z: number, feetY: number, r: number): [number, number] {
    let px = x;
    let pz = z;
    const bodyBottom = feetY + 0.24;
    const bodyTop = feetY + 1.72;
    const all = this.getAllColliders();

    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (const b of all) {
        if (b.y1 <= bodyBottom || b.y0 >= bodyTop) continue;
        const cx = Math.max(b.x0, Math.min(px, b.x1));
        const cz = Math.max(b.z0, Math.min(pz, b.z1));
        const dx = px - cx;
        const dz = pz - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq < r * r) {
          moved = true;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = r - dist + 1e-4;
            px += (dx / dist) * push;
            pz += (dz / dist) * push;
          } else {
            const dL = px - b.x0;
            const dR = b.x1 - px;
            const dT = pz - b.z0;
            const dB = b.z1 - pz;
            const m = Math.min(dL, dR, dT, dB);
            if (m === dL) px = b.x0 - r - 1e-4;
            else if (m === dR) px = b.x1 + r + 1e-4;
            else if (m === dT) pz = b.z0 - r - 1e-4;
            else pz = b.z1 + r + 1e-4;
          }
        }
      }
      if (!moved) break;
    }
    return [px, pz];
  }

  private tryCandidate(
    candX: number,
    candZ: number,
    currFeetY: number,
    currPen: number,
    radius: number,
  ): { x: number; z: number; feetY: number; id: string; pen: number } | null {
    const [nx, nz] = this.pushOut(candX, candZ, currFeetY, radius);
    const surf = this.findSurface(nx, nz, currFeetY);
    if (!surf) return null;
    const pen = this.maxPenetration(nx, nz, surf.feetY, radius);
    // Accept if clear OR strictly escaping an overlapping tight corner
    if (pen <= 0.0025 || pen < currPen - 1e-4) {
      return { x: nx, z: nz, feetY: surf.feetY, id: surf.id, pen };
    }
    return null;
  }

  resolveMove(
    prevX: number,
    prevZ: number,
    prevFeetY: number,
    targetX: number,
    targetZ: number,
    radius = ATRIUM_CONFIG.navigation.firstPerson.playerRadius,
  ): ResolvedStep {
    const dist = Math.hypot(targetX - prevX, targetZ - prevZ);
    const steps = Math.max(1, Math.ceil(dist / 0.035));
    let cx = prevX;
    let cz = prevZ;
    let cy = prevFeetY;
    let surfaceId = this.findSurface(cx, cz, cy, true)?.id ?? "ground-atrium";

    const stepX = (targetX - prevX) / steps;
    const stepZ = (targetZ - prevZ) / steps;

    for (let i = 0; i < steps; i++) {
      const currPen = this.maxPenetration(cx, cz, cy, radius);

      // 1. Try full diagonal sub-step first for smooth gliding along obstacles
      const diag = this.tryCandidate(cx + stepX, cz + stepZ, cy, currPen, radius);
      if (diag) {
        cx = diag.x;
        cz = diag.z;
        cy = diag.feetY;
        surfaceId = diag.id;
        continue;
      }

      // 2. Fall back to independent X and Z axis sliding so corners never lock movement
      if (Math.abs(stepX) > 1e-6) {
        const slideX = this.tryCandidate(cx + stepX, cz, cy, currPen, radius);
        if (slideX) {
          cx = slideX.x;
          cz = slideX.z;
          cy = slideX.feetY;
          surfaceId = slideX.id;
        }
      }

      if (Math.abs(stepZ) > 1e-6) {
        const penAfterX = this.maxPenetration(cx, cz, cy, radius);
        const slideZ = this.tryCandidate(cx, cz + stepZ, cy, penAfterX, radius);
        if (slideZ) {
          cx = slideZ.x;
          cz = slideZ.z;
          cy = slideZ.feetY;
          surfaceId = slideZ.id;
        }
      }
    }

    return { x: cx, z: cz, feetY: cy, surfaceId };
  }
}
