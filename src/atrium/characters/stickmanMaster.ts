import * as THREE from "three";

export type StickmanVariant = "male" | "female";
export type StickmanPose = "seated-typing" | "seated-meeting" | "standing-idle";

export interface WebcamMountMetadata {
  slotType: "head-video-replacement";
  width: number;
  height: number;
  headRadius: number;
  facing: "+z";
}

export interface StickmanRigDiagnostics {
  id: string;
  variant: StickmanVariant;
  pose: StickmanPose;
  hasSeparateHeadGroup: boolean;
  hasWebcamMount: boolean;
  originalHeadVisible: boolean;
  fingerCountPerHand: number;
}

const HEAD_RADIUS = 0.152;
const TORSO_HEIGHT = 0.44;
const UPPER_ARM_LEN = 0.255;
const FOREARM_LEN = 0.235;
const THIGH_LEN = 0.35;
const SHIN_LEN = 0.35;

/**
 * Shared reusable master geometries and materials for both original stickman designs
 * (exact visual match to SelectionCharacter.tsx: male with 3 hair strands & blue tie;
 * female with ivory bob hair, eyelashes, pink bow & ivory A-line dress).
 * Every stickman instance in the scene clones/references these master assets.
 */
export class StickmanMasterAssets {
  readonly materials: {
    ivory: THREE.MeshStandardMaterial;
    charcoal: THREE.MeshStandardMaterial;
    maleTieBlue: THREE.MeshStandardMaterial;
    femaleBowPink: THREE.MeshStandardMaterial;
    outline: THREE.MeshBasicMaterial;
  };

  readonly geometries: {
    headSphere: THREE.SphereGeometry;
    eyeOval: THREE.SphereGeometry;
    eyebrowCurve: THREE.TubeGeometry;
    smileCurve: THREE.TubeGeometry;
    eyelash: THREE.CylinderGeometry;
    maleHairStrands: THREE.TubeGeometry[];
    femaleHairShell: THREE.BufferGeometry;
    femaleHairSideLeft: THREE.BufferGeometry;
    femaleHairSideRight: THREE.BufferGeometry;
    femaleBowLoop: THREE.BufferGeometry;
    femaleBowKnot: THREE.SphereGeometry;
    maleTorsoSpine: THREE.CylinderGeometry;
    maleTieKnot: THREE.BufferGeometry;
    maleTieBlade: THREE.BufferGeometry;
    femaleDress: THREE.LatheGeometry;
    jointSphere: THREE.SphereGeometry;
    upperArm: THREE.CylinderGeometry;
    forearm: THREE.CylinderGeometry;
    thigh: THREE.CylinderGeometry;
    shin: THREE.CylinderGeometry;
    shoe: THREE.BufferGeometry;
    handPalm: THREE.BufferGeometry;
    fingerGeos: THREE.BufferGeometry[];
    thumbGeo: THREE.BufferGeometry;
  };

  private readonly allDisposables: Array<{ dispose: () => void }> = [];

  constructor() {
    const track = <T extends { dispose: () => void }>(item: T): T => {
      this.allDisposables.push(item);
      return item;
    };

    // Clean matte architectural materials matching the office & onboarding palette
    this.materials = {
      ivory: track(
        new THREE.MeshStandardMaterial({
          name: "stickman-ivory",
          color: new THREE.Color("#faf8f3"),
          roughness: 0.84,
          metalness: 0.0,
          envMapIntensity: 0.16,
        }),
      ),
      charcoal: track(
        new THREE.MeshStandardMaterial({
          name: "stickman-charcoal",
          color: new THREE.Color("#292b2e"),
          roughness: 0.78,
          metalness: 0.0,
          envMapIntensity: 0.18,
        }),
      ),
      maleTieBlue: track(
        new THREE.MeshStandardMaterial({
          name: "stickman-tie-blue",
          color: new THREE.Color("#4257f5"),
          roughness: 0.72,
          metalness: 0.0,
          envMapIntensity: 0.2,
        }),
      ),
      femaleBowPink: track(
        new THREE.MeshStandardMaterial({
          name: "stickman-bow-pink",
          color: new THREE.Color("#ec81aa"),
          roughness: 0.72,
          metalness: 0.0,
          envMapIntensity: 0.2,
        }),
      ),
      outline: track(
        new THREE.MeshBasicMaterial({
          name: "stickman-outline",
          color: new THREE.Color("#292b2e"),
          side: THREE.BackSide,
        }),
      ),
    };

    // ---- Head & Facial Feature Master Geometries ----
    const headSphere = track(new THREE.SphereGeometry(HEAD_RADIUS, 28, 22));

    // Vertical oval eyes matching SelectionCharacter.tsx (rx: 3.4, ry: 6)
    const eyeOval = track(new THREE.SphereGeometry(0.0155, 14, 12));
    eyeOval.scale(0.68, 1.18, 0.42);

    // Subtle arched eyebrow tube
    const browCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.017, 0.0, 0.0),
      new THREE.Vector3(0.0, 0.0085, 0.003),
      new THREE.Vector3(0.017, -0.001, 0.0),
    );
    const eyebrowCurve = track(new THREE.TubeGeometry(browCurve, 10, 0.0044, 8, false));

    // Classic warm curved smile conforming to front of head sphere
    const smilePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const u = (t - 0.5) * 2; // -1..+1
      const sx = u * 0.068;
      const sy = -0.032 - (1 - u * u) * 0.032;
      const sz = Math.sqrt(Math.max(0.001, HEAD_RADIUS * HEAD_RADIUS - sx * sx - sy * sy)) + 0.003;
      smilePts.push(new THREE.Vector3(sx, sy, sz));
    }
    const smileCurve = track(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePts), 16, 0.0048, 8, false),
    );

    const eyelash = track(new THREE.CylinderGeometry(0.0022, 0.0016, 0.014, 6));

    // Male signature 3 curved hair strands sprouting cleanly from top crown
    const makeStrand = (pts: THREE.Vector3[], radius = 0.0062) =>
      track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, radius, 8, false));

    const maleHairStrands = [
      // Left leaning tuft
      makeStrand([
        new THREE.Vector3(-0.048, HEAD_RADIUS - 0.014, 0.012),
        new THREE.Vector3(-0.062, HEAD_RADIUS + 0.022, 0.014),
        new THREE.Vector3(-0.072, HEAD_RADIUS + 0.048, 0.008),
      ]),
      // Center tall arching tuft
      makeStrand([
        new THREE.Vector3(-0.006, HEAD_RADIUS - 0.006, 0.016),
        new THREE.Vector3(-0.016, HEAD_RADIUS + 0.036, 0.02),
        new THREE.Vector3(0.006, HEAD_RADIUS + 0.064, 0.016),
      ]),
      // Right sweeping tuft
      makeStrand([
        new THREE.Vector3(0.038, HEAD_RADIUS - 0.012, 0.014),
        new THREE.Vector3(0.056, HEAD_RADIUS + 0.028, 0.014),
        new THREE.Vector3(0.088, HEAD_RADIUS + 0.044, 0.006),
      ]),
    ];

    // Female sculpted 3D ivory bob hair — closed smooth rear/top volume + closed tapered flared side locks
    const femaleHairShell = track(new THREE.SphereGeometry(HEAD_RADIUS * 1.075, 28, 22));
    femaleHairShell.scale(1.06, 1.03, 1.04);

    // Closed tapered bob side lock (LatheGeometry with smooth rounded top & flared closed tip)
    const lockPts = [
      new THREE.Vector2(0.0, -0.178),
      new THREE.Vector2(0.022, -0.172),
      new THREE.Vector2(0.036, -0.145),
      new THREE.Vector2(0.031, -0.095),
      new THREE.Vector2(0.033, -0.025),
      new THREE.Vector2(0.034, 0.045),
      new THREE.Vector2(0.022, 0.088),
      new THREE.Vector2(0.0, 0.096),
    ];
    const makeHairLock = (side: -1 | 1) => {
      const geo = track(new THREE.LatheGeometry(lockPts, 16));
      geo.scale(0.88, 1.0, 1.18);
      // Gently flare the bottom tip outward in classic bob style
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = THREE.MathUtils.clamp((0.04 - y) / 0.22, 0, 1);
        const flare = t * t * 0.048 * side;
        pos.setX(i, pos.getX(i) + flare + side * 0.148);
        pos.setZ(i, pos.getZ(i) - 0.032 + t * 0.012);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    };
    const femaleHairSideLeft = makeHairLock(-1);
    const femaleHairSideRight = makeHairLock(1);

    // Female signature pink hair bow (#EC81AA) — puffy sculpted 3D ribbon loop + center knot
    const bowLoopShape = new THREE.Shape();
    bowLoopShape.moveTo(0, 0);
    bowLoopShape.bezierCurveTo(0.028, 0.045, 0.085, 0.052, 0.092, 0.012);
    bowLoopShape.bezierCurveTo(0.096, -0.024, 0.042, -0.042, 0, -0.006);
    bowLoopShape.closePath();
    const femaleBowLoop = track(
      new THREE.ExtrudeGeometry(bowLoopShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.007,
        bevelSegments: 2,
        curveSegments: 10,
      }),
    );
    femaleBowLoop.translate(0, 0, -0.011);
    femaleBowLoop.computeVertexNormals();
    const femaleBowKnot = track(new THREE.SphereGeometry(0.022, 14, 12));

    // ---- Torso, Male Tie & Female Dress Master Geometries ----
    const maleTorsoSpine = track(new THREE.CylinderGeometry(0.026, 0.028, TORSO_HEIGHT, 14));
    maleTorsoSpine.translate(0, TORSO_HEIGHT / 2, 0);

    // Male sculpted 3D blue tie knot & tapered tie blade matching SelectionCharacter.tsx
    const knotShape = new THREE.Shape();
    knotShape.moveTo(-0.016, 0.014);
    knotShape.lineTo(0.016, 0.014);
    knotShape.lineTo(0.021, -0.01);
    knotShape.lineTo(0, -0.028);
    knotShape.lineTo(-0.021, -0.01);
    knotShape.closePath();
    const maleTieKnot = track(
      new THREE.ExtrudeGeometry(knotShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.003,
        bevelSegments: 2,
      }),
    );
    maleTieKnot.computeVertexNormals();

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.013, 0);
    bladeShape.lineTo(0.013, 0);
    bladeShape.lineTo(0.032, -0.22);
    bladeShape.lineTo(0, -0.268);
    bladeShape.lineTo(-0.032, -0.22);
    bladeShape.closePath();
    const maleTieBlade = track(
      new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.0025,
        bevelSegments: 2,
      }),
    );
    maleTieBlade.computeVertexNormals();

    // Female sculpted 3D ivory A-line dress (matching SelectionCharacter.tsx)
    const dressPts = [
      new THREE.Vector2(0.0, 0.01),
      new THREE.Vector2(0.165, 0.0),
      new THREE.Vector2(0.185, 0.025),
      new THREE.Vector2(0.145, 0.15),
      new THREE.Vector2(0.095, 0.30),
      new THREE.Vector2(0.052, 0.42),
      new THREE.Vector2(0.034, 0.455),
      new THREE.Vector2(0.0, 0.455),
    ];
    const femaleDress = track(new THREE.LatheGeometry(dressPts, 24));
    femaleDress.computeVertexNormals();

    // ---- Cylindrical 3D Limbs, Joints & Shoes ----
    const jointSphere = track(new THREE.SphereGeometry(0.024, 12, 10));

    const upperArm = track(new THREE.CylinderGeometry(0.02, 0.018, UPPER_ARM_LEN, 12));
    upperArm.translate(0, -UPPER_ARM_LEN / 2, 0);

    const forearm = track(new THREE.CylinderGeometry(0.0175, 0.0155, FOREARM_LEN, 12));
    forearm.translate(0, -FOREARM_LEN / 2, 0);

    const thigh = track(new THREE.CylinderGeometry(0.024, 0.021, THIGH_LEN, 12));
    thigh.translate(0, -THIGH_LEN / 2, 0);

    const shin = track(new THREE.CylinderGeometry(0.02, 0.0175, SHIN_LEN, 12));
    shin.translate(0, -SHIN_LEN / 2, 0);

    // Sculpted rounded 3D shoe
    const shoeShape = new THREE.Shape();
    shoeShape.moveTo(-0.025, 0);
    shoeShape.lineTo(0.095, 0);
    shoeShape.quadraticCurveTo(0.105, 0.038, 0.045, 0.046);
    shoeShape.quadraticCurveTo(-0.022, 0.048, -0.028, 0.022);
    shoeShape.closePath();
    const shoe = track(
      new THREE.ExtrudeGeometry(shoeShape, {
        depth: 0.048,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.006,
        bevelSegments: 2,
        curveSegments: 8,
      }),
    );
    shoe.translate(0, 0, -0.024);
    shoe.rotateY(-Math.PI / 2); // Toe points toward +Z
    shoe.computeVertexNormals();

    // ---- Proper 3D Hand with 5 Distinguishable Fingers (Palm + Thumb + 4 Fingers) ----
    const palmShape = new THREE.Shape();
    palmShape.moveTo(-0.024, 0);
    palmShape.quadraticCurveTo(-0.032, 0.025, -0.028, 0.056);
    palmShape.quadraticCurveTo(0, 0.064, 0.028, 0.056);
    palmShape.quadraticCurveTo(0.032, 0.025, 0.024, 0);
    palmShape.closePath();
    const handPalm = track(
      new THREE.ExtrudeGeometry(palmShape, {
        depth: 0.016,
        bevelEnabled: true,
        bevelThickness: 0.0055,
        bevelSize: 0.005,
        bevelSegments: 2,
        curveSegments: 8,
      }),
    );
    handPalm.rotateX(Math.PI / 2); // Palm extends forward along +Z, flat in XZ plane
    handPalm.translate(0, 0.008, 0);
    handPalm.computeVertexNormals();

    // Four distinct tapered fingers (index, middle, ring, pinky) with gentle relaxed curl
    const fingerSpecs = [
      { len: 0.052, rad: 0.0062 }, // index
      { len: 0.058, rad: 0.0064 }, // middle
      { len: 0.053, rad: 0.006 }, // ring
      { len: 0.043, rad: 0.0052 }, // pinky
    ];
    const fingerGeos = fingerSpecs.map(({ len, rad }) => {
      const fCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.004, len * 0.55),
        new THREE.Vector3(0, -0.016, len),
      ]);
      return track(new THREE.TubeGeometry(fCurve, 8, rad, 8, false));
    });

    // Distinct opposable thumb
    const thumbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.018, -0.004, 0.022),
      new THREE.Vector3(0.026, -0.012, 0.044),
    ]);
    const thumbGeo = track(new THREE.TubeGeometry(thumbCurve, 8, 0.0072, 8, false));

    this.geometries = {
      headSphere,
      eyeOval,
      eyebrowCurve,
      smileCurve,
      eyelash,
      maleHairStrands,
      femaleHairShell,
      femaleHairSideLeft,
      femaleHairSideRight,
      femaleBowLoop,
      femaleBowKnot,
      maleTorsoSpine,
      maleTieKnot,
      maleTieBlade,
      femaleDress,
      jointSphere,
      upperArm,
      forearm,
      thigh,
      shin,
      shoe,
      handPalm,
      fingerGeos,
      thumbGeo,
    };
  }

  /**
   * Instantiates a rigged, animatable, webcam-ready 3D stickman reusing the master assets.
   */
  createInstance(id: string, variant: StickmanVariant, phaseOffset = 0): StickmanInstance {
    return new StickmanInstance(id, variant, this, phaseOffset);
  }

  dispose(): void {
    for (const item of this.allDisposables) {
      item.dispose();
    }
    this.allDisposables.length = 0;
  }
}

/**
 * A rigged 3D stickman character instance with:
 * - Articulated pelvis, torso, shoulders, elbows, wrists, 5-fingered hands, hips, knees & feet
 * - Detachable head group & dedicated webcamMount slot prepared for future live video replacement
 * - Procedural office typing, meeting attentive idle/nod, and standing idle animations
 */
export class StickmanInstance {
  readonly id: string;
  readonly variant: StickmanVariant;
  readonly root: THREE.Group;

  // Articulated rig nodes
  readonly pelvis: THREE.Group;
  readonly torso: THREE.Group;
  readonly headSocket: THREE.Group;
  readonly originalHeadGroup: THREE.Group;
  readonly webcamMount: THREE.Group;

  readonly leftShoulder: THREE.Group;
  readonly leftElbow: THREE.Group;
  readonly leftWrist: THREE.Group;
  readonly rightShoulder: THREE.Group;
  readonly rightElbow: THREE.Group;
  readonly rightWrist: THREE.Group;
  readonly leftHip: THREE.Group;
  readonly leftKnee: THREE.Group;
  readonly rightHip: THREE.Group;
  readonly rightKnee: THREE.Group;

  private pose: StickmanPose = "seated-meeting";
  private readonly phaseOffset: number;
  private readonly fingerCountPerHand = 5;

  constructor(
    id: string,
    variant: StickmanVariant,
    assets: StickmanMasterAssets,
    phaseOffset = 0,
  ) {
    this.id = id;
    this.variant = variant;
    this.phaseOffset = phaseOffset;

    const G = assets.geometries;
    const M = assets.materials;

    const makeMesh = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      castShadow = true,
      receiveShadow = true,
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      return mesh;
    };

    this.root = new THREE.Group();
    this.root.name = `stickman-${variant}-${id}`;

    this.pelvis = new THREE.Group();
    this.pelvis.name = "pelvis";
    this.root.add(this.pelvis);

    this.torso = new THREE.Group();
    this.torso.name = "torso";
    this.pelvis.add(this.torso);

    // ---- 1. Body Core (Male Spine + Blue Tie OR Female Ivory A-Line Dress) ----
    if (variant === "male") {
      this.torso.add(makeMesh(G.maleTorsoSpine, M.charcoal));
      const hipJoint = makeMesh(G.jointSphere, M.charcoal);
      this.torso.add(hipJoint);

      // Signature 3D blue tie
      const tieGroup = new THREE.Group();
      tieGroup.name = "male-blue-tie";
      tieGroup.position.set(0, TORSO_HEIGHT - 0.02, 0.025);
      const knot = makeMesh(G.maleTieKnot, M.maleTieBlue);
      const blade = makeMesh(G.maleTieBlade, M.maleTieBlue);
      blade.position.set(0, -0.018, 0.002);
      blade.rotation.x = -0.05;
      tieGroup.add(knot, blade);
      this.torso.add(tieGroup);
    } else {
      // Classic female ivory A-line dress with clean silhouette
      const dressMesh = makeMesh(G.femaleDress, M.ivory);
      dressMesh.position.y = -0.03;
      this.torso.add(dressMesh);
      // Subtle inverted-hull outline around dress so it stays crisp against white walls
      const dressOutline = new THREE.Mesh(G.femaleDress, M.outline);
      dressOutline.position.y = -0.03;
      dressOutline.scale.set(1.032, 1.015, 1.032);
      this.torso.add(dressOutline);
    }

    // ---- 2. Dedicated Head Socket + Detachable Original Head + Future Webcam Mount ----
    this.headSocket = new THREE.Group();
    this.headSocket.name = "head-socket";
    // Centered cleanly above shoulders so seated head center sits at ~1.10 m above floor
    this.headSocket.position.set(0, TORSO_HEIGHT + 0.195, 0);
    this.torso.add(this.headSocket);

    // Subtle charcoal neck connector underneath head socket (stays clear of webcam area)
    const neckMesh = makeMesh(G.jointSphere, M.charcoal);
    neckMesh.scale.set(0.75, 1.25, 0.75);
    neckMesh.position.set(0, TORSO_HEIGHT + 0.025, 0);
    this.torso.add(neckMesh);

    // Detachable original 3D head group (hiding/removing this clears 100% of head/face/hair/bow!)
    this.originalHeadGroup = new THREE.Group();
    this.originalHeadGroup.name = "original-stickman-head";
    this.headSocket.add(this.originalHeadGroup);

    const headMesh = makeMesh(G.headSphere, M.ivory);
    this.originalHeadGroup.add(headMesh);
    // Crisp subtle cartoon/architectural outline around rounded 3D head
    const headOutline = new THREE.Mesh(G.headSphere, M.outline);
    headOutline.scale.setScalar(1.036);
    this.originalHeadGroup.add(headOutline);

    // Facial features mounted on front (+Z) of head sphere
    for (const side of [-1, 1] as const) {
      const eye = makeMesh(G.eyeOval, M.charcoal, false, false);
      eye.position.set(side * 0.048, 0.018, HEAD_RADIUS - 0.008);
      eye.rotation.y = side * 0.28;
      this.originalHeadGroup.add(eye);

      const brow = makeMesh(G.eyebrowCurve, M.charcoal, false, false);
      brow.position.set(side * 0.048, 0.056, HEAD_RADIUS - 0.016);
      brow.rotation.y = side * 0.26;
      this.originalHeadGroup.add(brow);

      if (variant === "female") {
        // Two delicate eyelashes on each eye matching SelectionCharacter.tsx
        for (const [idx, dx] of [0.008, 0.017].entries()) {
          const lash = makeMesh(G.eyelash, M.charcoal, false, false);
          lash.position.set(side * (0.048 + dx), 0.036 - idx * 0.004, HEAD_RADIUS - 0.01);
          lash.rotation.z = -side * (0.45 + idx * 0.35);
          this.originalHeadGroup.add(lash);
        }
      }
    }

    const smile = makeMesh(G.smileCurve, M.charcoal, false, false);
    this.originalHeadGroup.add(smile);

    if (variant === "male") {
      // Distinctive 3 hair strands on top of male stickman's head
      for (const strandGeo of G.maleHairStrands) {
        this.originalHeadGroup.add(makeMesh(strandGeo, M.charcoal, true, false));
      }
    } else {
      // Female sculpted ivory bob hair wrapping back & sides + distinctive pink bow
      const hairCap = makeMesh(G.femaleHairShell, M.ivory);
      hairCap.position.set(0, 0.008, -0.028);
      const hairCapOutline = new THREE.Mesh(G.femaleHairShell, M.outline);
      hairCapOutline.position.copy(hairCap.position);
      hairCapOutline.scale.setScalar(1.032);
      this.originalHeadGroup.add(hairCap, hairCapOutline);

      for (const lockGeo of [G.femaleHairSideLeft, G.femaleHairSideRight]) {
        const lock = makeMesh(lockGeo, M.ivory);
        const lockOutline = new THREE.Mesh(lockGeo, M.outline);
        lockOutline.scale.set(1.035, 1.02, 1.035);
        this.originalHeadGroup.add(lock, lockOutline);
      }

      // Distinctive pink hair bow perched cleanly on upper-right crown
      const bowGroup = new THREE.Group();
      bowGroup.name = "female-pink-bow";
      bowGroup.position.set(0.095, HEAD_RADIUS - 0.006, 0.036);
      bowGroup.rotation.set(0.12, 0.25, -0.44);

      const rightLoop = makeMesh(G.femaleBowLoop, M.femaleBowPink);
      const leftLoop = makeMesh(G.femaleBowLoop, M.femaleBowPink);
      leftLoop.scale.x = -1;
      const knot = makeMesh(G.femaleBowKnot, M.femaleBowPink);
      bowGroup.add(rightLoop, leftLoop, knot);
      this.originalHeadGroup.add(bowGroup);
    }

    // Dedicated, clean, unobstructed webcam video replacement mount (empty until future video stage)
    this.webcamMount = new THREE.Group();
    this.webcamMount.name = "webcam-video-mount";
    this.webcamMount.position.set(0, 0, 0);
    const meta: WebcamMountMetadata = {
      slotType: "head-video-replacement",
      width: HEAD_RADIUS * 2.15,
      height: HEAD_RADIUS * 2.15,
      headRadius: HEAD_RADIUS,
      facing: "+z",
    };
    this.webcamMount.userData.webcamSlot = meta;
    this.headSocket.add(this.webcamMount);

    // ---- 3. Articulated Arms & 5-Fingered 3D Hands ----
    const buildHand = (side: -1 | 1): THREE.Group => {
      const hand = new THREE.Group();
      hand.name = side === -1 ? "left-hand" : "right-hand";
      // Align hand continuation cleanly along local -Y (forearm axis) with palm facing -Z (downward when forearm extends forward)
      hand.rotation.x = Math.PI / 2;

      const palmMesh = makeMesh(G.handPalm, M.ivory, true, false);
      const palmOutline = new THREE.Mesh(G.handPalm, M.outline);
      palmOutline.scale.set(1.06, 1.12, 1.05);
      hand.add(palmMesh, palmOutline);

      // 4 distinct fingers across the front of the palm (with subtle outline for crisp readability)
      const xOffsets = [-0.022, -0.0075, 0.0075, 0.022];
      for (let i = 0; i < 4; i++) {
        // Mirror index->pinky order cleanly across left & right hands
        const fingerIdx = side === -1 ? 3 - i : i;
        const fGeo = G.fingerGeos[fingerIdx];
        const finger = makeMesh(fGeo, M.ivory, true, false);
        finger.position.set(xOffsets[i], 0.008, 0.056);
        const fOut = new THREE.Mesh(fGeo, M.outline);
        fOut.position.copy(finger.position);
        fOut.scale.set(1.16, 1.16, 1.03);
        hand.add(finger, fOut);
      }

      // Opposable thumb on the medial (inner) side of the palm
      const thumb = makeMesh(G.thumbGeo, M.ivory, true, false);
      thumb.position.set(-side * 0.024, 0.006, 0.022);
      thumb.scale.x = -side;
      const thumbOut = new THREE.Mesh(G.thumbGeo, M.outline);
      thumbOut.position.copy(thumb.position);
      thumbOut.scale.set(-side * 1.15, 1.15, 1.03);
      hand.add(thumb, thumbOut);

      return hand;
    };

    const buildArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.name = side === -1 ? "left-shoulder" : "right-shoulder";
      shoulder.position.set(side * 0.078, TORSO_HEIGHT - 0.025, 0);
      shoulder.add(makeMesh(G.jointSphere, M.charcoal));
      shoulder.add(makeMesh(G.upperArm, M.charcoal));

      const elbow = new THREE.Group();
      elbow.name = side === -1 ? "left-elbow" : "right-elbow";
      elbow.position.set(0, -UPPER_ARM_LEN, 0);
      elbow.add(makeMesh(G.jointSphere, M.charcoal));
      elbow.add(makeMesh(G.forearm, M.charcoal));
      shoulder.add(elbow);

      const wrist = new THREE.Group();
      wrist.name = side === -1 ? "left-wrist" : "right-wrist";
      wrist.position.set(0, -FOREARM_LEN, 0);
      wrist.add(buildHand(side));
      elbow.add(wrist);

      this.torso.add(shoulder);
      return { shoulder, elbow, wrist };
    };

    const leftArm = buildArm(-1);
    this.leftShoulder = leftArm.shoulder;
    this.leftElbow = leftArm.elbow;
    this.leftWrist = leftArm.wrist;

    const rightArm = buildArm(1);
    this.rightShoulder = rightArm.shoulder;
    this.rightElbow = rightArm.elbow;
    this.rightWrist = rightArm.wrist;

    // ---- 4. Articulated Legs & Sculpted Shoes ----
    const shoeMat = variant === "male" ? M.charcoal : M.ivory;
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.name = side === -1 ? "left-hip" : "right-hip";
      hip.position.set(side * 0.068, 0, 0);
      hip.add(makeMesh(G.thigh, M.charcoal));

      const knee = new THREE.Group();
      knee.name = side === -1 ? "left-knee" : "right-knee";
      knee.position.set(0, -THIGH_LEN, 0);
      knee.add(makeMesh(G.jointSphere, M.charcoal));
      knee.add(makeMesh(G.shin, M.charcoal));

      const shoe = makeMesh(G.shoe, shoeMat);
      shoe.position.set(0, -SHIN_LEN - 0.015, 0.01);
      knee.add(shoe);

      hip.add(knee);
      this.pelvis.add(hip);
      return { hip, knee };
    };

    const leftLeg = buildLeg(-1);
    this.leftHip = leftLeg.hip;
    this.leftKnee = leftLeg.knee;

    const rightLeg = buildLeg(1);
    this.rightHip = rightLeg.hip;
    this.rightKnee = rightLeg.knee;

    this.applyBasePose("seated-meeting");
  }

  /**
   * Prepares for future webcam replacement: hides or shows the entire original 3D head
   * (sphere, facial details, hair strands, bob hair & bow), leaving webcamMount 100% clear.
   */
  setOriginalHeadVisible(visible: boolean): void {
    this.originalHeadGroup.visible = visible;
  }

  getHeadSocket(): THREE.Group {
    return this.headSocket;
  }

  getWebcamMount(): THREE.Group {
    return this.webcamMount;
  }

  setPose(pose: StickmanPose): void {
    this.pose = pose;
    this.applyBasePose(pose);
  }

  getDiagnostics(): StickmanRigDiagnostics {
    return {
      id: this.id,
      variant: this.variant,
      pose: this.pose,
      hasSeparateHeadGroup: this.originalHeadGroup.parent === this.headSocket,
      hasWebcamMount: this.webcamMount.parent === this.headSocket,
      originalHeadVisible: this.originalHeadGroup.visible,
      fingerCountPerHand: this.fingerCountPerHand,
    };
  }

  private applyBasePose(pose: StickmanPose): void {
    if (pose === "seated-typing") {
      // Ergonomic seated typing posture (pelvis at 0.53 m so elbows & forearms sit cleanly ABOVE 0.75 m desk top)
      this.pelvis.position.set(0, 0.53, -0.02);
      this.torso.rotation.set(0.06, 0, 0);
      this.headSocket.rotation.set(0.16, 0, 0);

      // Thighs forward horizontal, shins angled cleanly downward
      this.leftHip.rotation.set(-Math.PI / 2 + 0.06, 0.08, 0);
      this.rightHip.rotation.set(-Math.PI / 2 + 0.06, -0.08, 0);
      this.leftKnee.rotation.set(Math.PI / 2 - 0.14, 0, 0);
      this.rightKnee.rotation.set(Math.PI / 2 - 0.14, 0, 0);

      // Elbows at Y ~ 0.775 m (> 0.75 m desk) & 5-fingered hands hovering cleanly ABOVE laptop keyboard (Y ~ 0.795 m)
      this.leftShoulder.rotation.set(-0.84, 0.12, 0.14);
      this.rightShoulder.rotation.set(-0.84, -0.12, -0.14);
      this.leftElbow.rotation.set(-0.9, 0, -0.14);
      this.rightElbow.rotation.set(-0.9, 0, 0.14);
      this.leftWrist.rotation.set(0.22, 0, 0);
      this.rightWrist.rotation.set(0.22, 0, 0);
    } else if (pose === "seated-meeting") {
      // Upright, attentive seated posture around the circular conference table
      this.pelvis.position.set(0, 0.47, 0.01);
      this.torso.rotation.set(0.02, 0, 0);
      this.headSocket.rotation.set(0.0, 0, 0);

      this.leftHip.rotation.set(-Math.PI / 2 + 0.05, 0.09, 0);
      this.rightHip.rotation.set(-Math.PI / 2 + 0.05, -0.09, 0);
      this.leftKnee.rotation.set(Math.PI / 2 - 0.1, 0, 0);
      this.rightKnee.rotation.set(Math.PI / 2 - 0.1, 0, 0);

      // Relaxed arms with forearms & 5-fingered hands resting naturally flat at tabletop height (Y ~ 0.76 m)
      this.leftShoulder.rotation.set(-0.74, 0.12, 0.16);
      this.rightShoulder.rotation.set(-0.74, -0.12, -0.16);
      this.leftElbow.rotation.set(-1.12, 0, -0.18);
      this.rightElbow.rotation.set(-1.12, 0, 0.18);
      this.leftWrist.rotation.set(0.28, 0, 0);
      this.rightWrist.rotation.set(0.28, 0, 0);
    } else {
      // Standing relaxed idle
      this.pelvis.position.set(0, SHIN_LEN + THIGH_LEN + 0.05, 0);
      this.torso.rotation.set(0, 0, 0);
      this.headSocket.rotation.set(0, 0, 0);
      this.leftHip.rotation.set(0, 0, -0.04);
      this.rightHip.rotation.set(0, 0, 0.04);
      this.leftKnee.rotation.set(0, 0, 0);
      this.rightKnee.rotation.set(0, 0, 0);
      this.leftShoulder.rotation.set(0.06, 0, 0.14);
      this.rightShoulder.rotation.set(0.06, 0, -0.14);
      this.leftElbow.rotation.set(-0.24, 0, 0);
      this.rightElbow.rotation.set(-0.24, 0, 0);
      this.leftWrist.rotation.set(0, 0, 0);
      this.rightWrist.rotation.set(0, 0, 0);
    }
  }

  /**
   * Advances subtle, lifelike procedural animation based on active pose.
   */
  update(timeSec: number): void {
    const t = timeSec + this.phaseOffset;

    if (this.pose === "seated-typing") {
      // Subtle breathing & keyboard typing rhythm (alternating forearm/wrist micro-taps + occasional screen glance)
      const breathe = Math.sin(t * 1.9) * 0.008;
      this.torso.rotation.x = 0.06 + breathe;

      // Active typing bursts with brief thoughtful reading pauses
      const burstWave = Math.sin(t * 0.85);
      const typingActive = burstWave > -0.35 ? 1 : 0.15;
      const leftTap = Math.sin(t * 11.5) * 0.05 * typingActive;
      const rightTap = Math.sin(t * 11.5 + 2.4) * 0.05 * typingActive;

      this.leftElbow.rotation.x = -0.9 + leftTap;
      this.rightElbow.rotation.x = -0.9 + rightTap;
      this.leftWrist.rotation.x = 0.22 - leftTap * 1.3;
      this.rightWrist.rotation.x = 0.22 - rightTap * 1.3;

      // Gentle head scan across laptop code & subtle nod
      this.headSocket.rotation.y = Math.sin(t * 0.72) * 0.11;
      this.headSocket.rotation.x = 0.16 + Math.sin(t * 1.4) * 0.035;
      this.headSocket.rotation.z = Math.sin(t * 0.55) * 0.03;
    } else if (this.pose === "seated-meeting") {
      // Attentive meeting presence: subtle breathing, gentle head nods, slight natural look toward table peers
      const breathe = Math.sin(t * 1.65) * 0.007;
      this.torso.rotation.x = 0.02 + breathe;
      this.torso.rotation.y = Math.sin(t * 0.42) * 0.035;

      // Gentle attentive head turns and occasional affirmative nod
      const nodPulse = Math.max(0, Math.sin(t * 0.65) - 0.7) * 0.24 * Math.sin(t * 5.8);
      this.headSocket.rotation.y = Math.sin(t * 0.48) * 0.14;
      this.headSocket.rotation.x = -0.02 + Math.sin(t * 1.1) * 0.025 + nodPulse;
      this.headSocket.rotation.z = Math.sin(t * 0.36) * 0.035;

      // Subtle conversational hand shift resting above the table
      const gesture = Math.sin(t * 1.35) * 0.035;
      this.leftElbow.rotation.x = -1.12 + gesture;
      this.rightElbow.rotation.x = -1.12 - gesture * 0.7;
      this.leftWrist.rotation.x = 0.28 - gesture * 0.8;
      this.rightWrist.rotation.x = 0.28 + gesture * 0.6;
    } else {
      const breathe = Math.sin(t * 1.7) * 0.01;
      this.torso.rotation.x = breathe;
      this.headSocket.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
  }
}
