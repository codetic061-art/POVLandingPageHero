import * as THREE from "three";

const roundCoord = (v: number) => Math.round(v * 1e4) / 1e4;

export interface GeometryBucket {
  p: number[];
  n: number[];
  uv: number[];
  idx: number[];
}

export type MaterialKind = "clay" | "plant" | "glass";
export type LineKind = "structure" | "furniture" | "detail" | "floorGrid" | "glassGlint";

export interface PrototypeData {
  p: Float32Array;
  n: Float32Array;
  uv: Float32Array;
  edges: Float32Array;
}

/**
 * Boolean orthogonal solid modeller adapted from apartment-3d-plan/js/solid.js.
 * Produces a watertight triangle skin with zero internal faces and extracts
 * only true geometric corners (never seams across coplanar wall segments).
 */
export class RectSolid {
  private ops: Array<[0 | 1, number, number, number, number, number, number]> = [];

  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    this.ops.push([
      1,
      roundCoord(Math.min(x0, x1)),
      roundCoord(Math.min(y0, y1)),
      roundCoord(Math.min(z0, z1)),
      roundCoord(Math.max(x0, x1)),
      roundCoord(Math.max(y0, y1)),
      roundCoord(Math.max(z0, z1)),
    ]);
    return this;
  }

  sub(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    this.ops.push([
      0,
      roundCoord(Math.min(x0, x1)),
      roundCoord(Math.min(y0, y1)),
      roundCoord(Math.min(z0, z1)),
      roundCoord(Math.max(x0, x1)),
      roundCoord(Math.max(y0, y1)),
      roundCoord(Math.max(z0, z1)),
    ]);
    return this;
  }

  build(): { geometry: THREE.BufferGeometry; edges: number[]; faceCount: number } {
    const uniq = (arr: number[]) => [...new Set(arr)].sort((a, b) => a - b);
    const xs = uniq(this.ops.flatMap((o) => [o[1], o[4]]));
    const ys = uniq(this.ops.flatMap((o) => [o[2], o[5]]));
    const zs = uniq(this.ops.flatMap((o) => [o[3], o[6]]));
    const ix = new Map(xs.map((v, i) => [v, i]));
    const iy = new Map(ys.map((v, i) => [v, i]));
    const iz = new Map(zs.map((v, i) => [v, i]));
    const nx = xs.length - 1;
    const ny = ys.length - 1;
    const nz = zs.length - 1;
    const occ = new Uint8Array(nx * ny * nz);
    const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);

    for (const o of this.ops) {
      const i0 = ix.get(o[1])!;
      const i1 = ix.get(o[4])!;
      const j0 = iy.get(o[2])!;
      const j1 = iy.get(o[5])!;
      const k0 = iz.get(o[3])!;
      const k1 = iz.get(o[6])!;
      for (let k = k0; k < k1; k++) {
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            occ[id(i, j, k)] = o[0];
          }
        }
      }
    }

    const at = (i: number, j: number, k: number) =>
      i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : occ[id(i, j, k)];

    const bucket: GeometryBucket = { p: [], n: [], uv: [], idx: [] };
    const quad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number],
      nrm: [number, number, number],
    ) => {
      const base = bucket.p.length / 3;
      for (const v of [a, b, c, d]) {
        bucket.p.push(v[0], v[1], v[2]);
        bucket.n.push(nrm[0], nrm[1], nrm[2]);
        if (nrm[0] !== 0) bucket.uv.push(v[2], v[1]);
        else if (nrm[1] !== 0) bucket.uv.push(v[0], v[2]);
        else bucket.uv.push(v[0], v[1]);
      }
      bucket.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    let faceCount = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!occ[id(i, j, k)]) continue;
          const x0 = xs[i];
          const x1 = xs[i + 1];
          const y0 = ys[j];
          const y1 = ys[j + 1];
          const z0 = zs[k];
          const z1 = zs[k + 1];
          if (!at(i + 1, j, k)) {
            quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
            faceCount++;
          }
          if (!at(i - 1, j, k)) {
            quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
            faceCount++;
          }
          if (!at(i, j + 1, k)) {
            quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
            faceCount++;
          }
          if (!at(i, j - 1, k)) {
            quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
            faceCount++;
          }
          if (!at(i, j, k + 1)) {
            quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
            faceCount++;
          }
          if (!at(i, j, k - 1)) {
            quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
            faceCount++;
          }
        }
      }
    }

    const edges: number[] = [];
    const axes: Array<{
      n: [number, number, number];
      c: [number[], number[], number[]];
      perm: [number, number, number];
    }> = [
      { n: [nx, ny, nz], c: [xs, ys, zs], perm: [0, 1, 2] },
      { n: [ny, nz, nx], c: [ys, zs, xs], perm: [1, 2, 0] },
      { n: [nz, nx, ny], c: [zs, xs, ys], perm: [2, 0, 1] },
    ];

    for (const axis of axes) {
      const [na, nb, nc] = axis.n;
      const [ca, cb, cc] = axis.c;
      const perm = axis.perm;
      const cell = (a: number, b: number, c: number) => {
        const v = [0, 0, 0];
        v[perm[0]] = a;
        v[perm[1]] = b;
        v[perm[2]] = c;
        return at(v[0], v[1], v[2]);
      };
      const point = (a: number, b: number, c: number): [number, number, number] => {
        const v: [number, number, number] = [0, 0, 0];
        v[perm[0]] = a;
        v[perm[1]] = b;
        v[perm[2]] = c;
        return v;
      };

      for (let b = 0; b <= nb; b++) {
        for (let c = 0; c <= nc; c++) {
          let runStart = -1;
          let runSig = "";
          const flush = (endA: number) => {
            if (runStart < 0) return;
            const p0 = point(ca[runStart], cb[b], cc[c]);
            const p1 = point(ca[endA], cb[b], cc[c]);
            edges.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
            runStart = -1;
          };
          for (let a = 0; a < na; a++) {
            const f00 = cell(a, b - 1, c - 1);
            const f10 = cell(a, b, c - 1);
            const f01 = cell(a, b - 1, c);
            const f11 = cell(a, b, c);
            const sum = f00 + f10 + f01 + f11;
            const diag = sum === 2 && f00 === f11;
            if (sum === 1 || sum === 3 || diag) {
              const sig = `${f00}${f10}${f01}${f11}`;
              if (runStart >= 0 && sig !== runSig) flush(a);
              if (runStart < 0) {
                runStart = a;
                runSig = sig;
              }
            } else {
              flush(a);
            }
          }
          flush(na);
        }
      }
    }

    return {
      geometry: bucketToGeometry(bucket),
      edges,
      faceCount,
    };
  }
}

export function bucketToGeometry(bucket: GeometryBucket): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.p, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.n, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
  geometry.setIndex(bucket.idx);
  geometry.computeBoundingSphere();
  return geometry;
}

export function pushBox(
  bucket: GeometryBucket,
  edges: number[] | null,
  ax0: number,
  ay0: number,
  az0: number,
  ax1: number,
  ay1: number,
  az1: number,
): void {
  const x0 = Math.min(ax0, ax1);
  const x1 = Math.max(ax0, ax1);
  const y0 = Math.min(ay0, ay1);
  const y1 = Math.max(ay0, ay1);
  const z0 = Math.min(az0, az1);
  const z1 = Math.max(az0, az1);

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    nrm: [number, number, number],
  ) => {
    const base = bucket.p.length / 3;
    for (const v of [a, b, c, d]) {
      bucket.p.push(v[0], v[1], v[2]);
      bucket.n.push(nrm[0], nrm[1], nrm[2]);
      if (nrm[0] !== 0) bucket.uv.push(v[2], v[1]);
      else if (nrm[1] !== 0) bucket.uv.push(v[0], v[2]);
      else bucket.uv.push(v[0], v[1]);
    }
    bucket.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);

  if (edges) {
    const corners: Array<[number, number, number]> = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const [a, b] of pairs) {
      edges.push(
        corners[a][0],
        corners[a][1],
        corners[a][2],
        corners[b][0],
        corners[b][1],
        corners[b][2],
      );
    }
  }
}

export function roundedRectShape(w: number, d: number, r = 0.03): THREE.Shape {
  const hw = w / 2;
  const hd = d / 2;
  const cr = Math.min(r, hw * 0.45, hd * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-hw + cr, -hd);
  s.lineTo(hw - cr, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  s.lineTo(hw, hd - cr);
  s.quadraticCurveTo(hw, hd, hw - cr, hd);
  s.lineTo(-hw + cr, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  s.lineTo(-hw, -hd + cr);
  s.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);
  return s;
}

export function bevelPad(
  w: number,
  h: number,
  d: number,
  radius = 0.028,
  bevel = 0.012,
  curveSegments = 5,
): THREE.BufferGeometry {
  const ih = Math.max(0.004, h - bevel * 2);
  const g = new THREE.ExtrudeGeometry(
    roundedRectShape(Math.max(0.016, w - bevel * 2), Math.max(0.016, d - bevel * 2), radius),
    {
      depth: ih,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments,
    },
  );
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  return g;
}

export function transformGeometry(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  ry = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

export function bakePrototype(
  geometries: THREE.BufferGeometry[],
  edgeAngle = 32,
): PrototypeData {
  const pArr: number[] = [];
  const nArr: number[] = [];
  const uvArr: number[] = [];
  const edgeArr: number[] = [];

  for (const rawGeo of geometries) {
    const src = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    const pos = src.attributes.position;
    const nrm = src.attributes.normal;
    const uv = src.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      pArr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      nArr.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      uvArr.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    const eg = new THREE.EdgesGeometry(rawGeo, edgeAngle);
    const ep = eg.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      edgeArr.push(ep.getX(i), ep.getY(i), ep.getZ(i));
    }
    eg.dispose();
    if (src !== rawGeo) src.dispose();
    rawGeo.dispose();
  }

  return {
    p: new Float32Array(pArr),
    n: new Float32Array(nArr),
    uv: new Float32Array(uvArr),
    edges: new Float32Array(edgeArr),
  };
}

/**
 * Collects procedural solid geometry into material buckets and clean line-weight
 * edge arrays so the entire atrium renders with minimal draw calls.
 */
export class GeometryKit {
  readonly buckets: Record<MaterialKind, GeometryBucket> = {
    clay: { p: [], n: [], uv: [], idx: [] },
    plant: { p: [], n: [], uv: [], idx: [] },
    glass: { p: [], n: [], uv: [], idx: [] },
  };

  readonly lines: Record<LineKind, number[]> = {
    structure: [],
    furniture: [],
    detail: [],
    floorGrid: [],
    glassGlint: [],
  };

  readonly contactFootprints: Array<{
    cx: number;
    y: number;
    cz: number;
    width: number;
    depth: number;
    strength: number;
  }> = [];

  box(
    mat: MaterialKind,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    lineKind: LineKind | null = "structure",
  ): void {
    pushBox(
      this.buckets[mat],
      lineKind ? this.lines[lineKind] : null,
      x0,
      y0,
      z0,
      x1,
      y1,
      z1,
    );
  }

  geo(
    mat: MaterialKind,
    g: THREE.BufferGeometry,
    lineKind: LineKind | null = "furniture",
    edgeAngle = 32,
    disposeInput = true,
  ): void {
    const B = this.buckets[mat];
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.attributes.position;
    const nrm = src.attributes.normal;
    const uv = src.attributes.uv;
    const base = B.p.length / 3;
    for (let i = 0; i < p.count; i++) {
      B.p.push(p.getX(i), p.getY(i), p.getZ(i));
      B.n.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      B.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      B.idx.push(base + i);
    }
    if (lineKind !== null) {
      const eg = new THREE.EdgesGeometry(g, edgeAngle);
      const E = this.lines[lineKind];
      const ep = eg.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        E.push(ep.getX(i), ep.getY(i), ep.getZ(i));
      }
      eg.dispose();
    }
    if (src !== g) src.dispose();
    if (disposeInput) g.dispose();
  }

  stamp(
    mat: MaterialKind,
    proto: PrototypeData,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    lineKind: LineKind | null = "furniture",
    scale = 1,
  ): void {
    const B = this.buckets[mat];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const base = B.p.length / 3;
    const count = proto.p.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      const px = proto.p[i3] * scale;
      const py = proto.p[i3 + 1] * scale;
      const pz = proto.p[i3 + 2] * scale;
      B.p.push(x + px * cos + pz * sin, y + py, z - px * sin + pz * cos);

      const nx = proto.n[i3];
      const ny = proto.n[i3 + 1];
      const nz = proto.n[i3 + 2];
      B.n.push(nx * cos + nz * sin, ny, -nx * sin + nz * cos);
      B.uv.push(proto.uv[i2], proto.uv[i2 + 1]);
      B.idx.push(base + i);
    }

    if (lineKind !== null) {
      const E = this.lines[lineKind];
      const eCount = proto.edges.length / 3;
      for (let i = 0; i < eCount; i++) {
        const i3 = i * 3;
        const ex = proto.edges[i3] * scale;
        const ey = proto.edges[i3 + 1] * scale;
        const ez = proto.edges[i3 + 2] * scale;
        E.push(x + ex * cos + ez * sin, y + ey, z - ex * sin + ez * cos);
      }
    }
  }

  segment(
    lineKind: LineKind,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): void {
    this.lines[lineKind].push(x0, y0, z0, x1, y1, z1);
  }

  contactShadow(
    cx: number,
    y: number,
    cz: number,
    width: number,
    depth: number,
    strength = 0.17,
  ): void {
    this.contactFootprints.push({ cx, y, cz, width, depth, strength });
  }
}
