import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ATRIUM_CONFIG, type AtriumViewMode } from "./config";
import { GeometryKit, bucketToGeometry, type LineKind } from "./geometry/solid";
import { createAtriumMaterials } from "./materials";
import { buildArchitecture } from "./builders/architecture";
import { buildStaircase } from "./builders/staircase";
import { buildFurniture } from "./builders/furniture";
import { buildPlants } from "./builders/plants";
import { CollisionWorld } from "./navigation/collisionWorld";
import { FirstPersonController, type FirstPersonState } from "./navigation/firstPersonController";

export interface AtriumDiagnostics {
  renderer: "three-webgl";
  viewMode: AtriumViewMode;
  doorAngleDeg: number;
  cameraPosition: [number, number, number];
  orbitTarget: [number, number, number];
  firstPerson: FirstPersonState;
  solidMeshCount: number;
  triangleCount: number;
  colliderCount: number;
  walkSurfaceCount: number;
  materialNames: string[];
  hasTextures: boolean;
}

export interface AtriumSceneApi {
  getMode: () => AtriumViewMode;
  setMode: (mode: AtriumViewMode) => void;
  resetView: () => void;
  setDoorProgress: (progress: number) => void;
  animateDoorsOpen: (durationMs?: number) => void;
  setOrbitPose: (position: [number, number, number], target: [number, number, number]) => void;
  spawnFirstPerson: (x: number, z: number, yaw?: number, pitch?: number, feetY?: number) => FirstPersonState;
  stepFirstPerson: (forward: number, strafe: number, dt: number) => FirstPersonState;
  rotateFirstPerson: (dxPx: number, dyPx: number) => FirstPersonState;
  getDiagnostics: () => AtriumDiagnostics;
  resize: () => void;
  dispose: () => void;
}

export interface CreateAtriumSceneOptions {
  host: HTMLDivElement;
  initialMode?: AtriumViewMode;
  reducedMotion?: boolean;
  onModeChange?: (mode: AtriumViewMode) => void;
}

export function createAtriumScene({
  host,
  initialMode = "orbit",
  reducedMotion = false,
  onModeChange,
}: CreateAtriumSceneOptions): AtriumSceneApi {
  const { visualStyle, lighting, navigation } = ATRIUM_CONFIG;

  const canvas = document.createElement("canvas");
  canvas.className = "atrium-webgl-canvas";
  canvas.setAttribute("data-name", "3D office atrium canvas");
  canvas.tabIndex = 0;
  host.append(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(visualStyle.background);

  const camera = new THREE.PerspectiveCamera(navigation.orbit.defaultFov, 16 / 9, 0.08, 220);
  camera.rotation.order = "YXZ";

  // Clean matte exterior ground plane so 360-degree Orbit inspection has a seamless architectural horizon
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const groundGeo = new THREE.PlaneGeometry(240, 240);
  disposableGeometries.push(groundGeo);
  const groundMat = new THREE.MeshBasicMaterial({
    name: "exterior-ground",
    color: new THREE.Color(visualStyle.exteriorGround),
    toneMapped: false,
  });
  const groundPlane = new THREE.Mesh(groundGeo, groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -ATRIUM_CONFIG.envelope.slabT - 0.005;
  scene.add(groundPlane);

  // Build materials, collision world, and complete 3D architectural & interior kit
  const materials = createAtriumMaterials();
  const collisionWorld = new CollisionWorld();
  const kit = new GeometryKit();

  const arch = buildArchitecture(kit, materials, collisionWorld);
  buildStaircase(kit, collisionWorld);
  buildFurniture(kit, collisionWorld);
  buildPlants(kit, collisionWorld);

  const atriumRoot = new THREE.Group();
  atriumRoot.name = "office-atrium-3d";
  scene.add(atriumRoot);

  let solidMeshCount = 0;
  let triangleCount = 0;
  const addSolidMesh = (
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    castShadow: boolean,
    receiveShadow: boolean,
    renderOrder = 0,
  ) => {
    if (!geo.attributes.position || geo.attributes.position.count === 0) {
      geo.dispose();
      return;
    }
    disposableGeometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.renderOrder = renderOrder;
    atriumRoot.add(mesh);
    solidMeshCount++;
    const idxCount = geo.index ? geo.index.count : geo.attributes.position.count;
    triangleCount += Math.floor(idxCount / 3);
  };

  // 1. Watertight architectural building shell
  addSolidMesh("building-shell", arch.shellGeometry, materials.clay, true, true, 0);
  const shellLines = materials.createLines("structure", arch.shellEdges);
  if (shellLines) {
    disposableGeometries.push(shellLines.geometry);
    atriumRoot.add(shellLines);
  }

  // 2. Bucketed interior architecture, staircase, furniture, plants & physical glass
  addSolidMesh("clay-assemblies", bucketToGeometry(kit.buckets.clay), materials.clay, true, true, 0);
  addSolidMesh("plant-foliage", bucketToGeometry(kit.buckets.plant), materials.plant, true, true, 0);
  addSolidMesh("glass-glazing", bucketToGeometry(kit.buckets.glass), materials.glass, false, false, 3);

  // 3. Hinged monumental double entrance doors (count their triangles too)
  atriumRoot.add(arch.doors.group);
  arch.doors.group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      solidMeshCount++;
      const g = m.geometry;
      triangleCount += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
    }
  });

  // 4. Screen-space graphite outlines & subtle floor joint grid
  const lineKinds: LineKind[] = ["structure", "furniture", "detail", "floorGrid", "glassGlint"];
  for (const kind of lineKinds) {
    const lineObj = materials.createLines(kind, kit.lines[kind]);
    if (lineObj) {
      disposableGeometries.push(lineObj.geometry);
      atriumRoot.add(lineObj);
    }
  }

  // 5. Soft neutral planar contact shadows under furniture & planters
  for (const fp of kit.contactFootprints) {
    const plane = new THREE.PlaneGeometry(fp.width, fp.depth);
    disposableGeometries.push(plane);
    const shadowMesh = new THREE.Mesh(plane, materials.createContactShadow(fp.strength));
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(fp.cx, fp.y, fp.cz);
    shadowMesh.renderOrder = 1;
    atriumRoot.add(shadowMesh);
  }

  // ---- Studio Clay & Sunlight Shadow Rig ----
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(lighting.hemisphereSky),
    new THREE.Color(lighting.hemisphereGround),
    lighting.hemisphereIntensity,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, lighting.sunIntensity);
  sun.position.set(...lighting.sunPosition);
  sun.target.position.set(...lighting.sunTarget);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 42;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2.4;
  scene.add(sun, sun.target);

  // Balanced front-right neutral fill so foreground doors & columns read with crisp clay volume
  const fill = new THREE.DirectionalLight(0xffffff, 0.42);
  fill.position.set(8.5, 6.2, 9.5);
  scene.add(fill);

  // Gentle interior alcove bounce lights under left & right mezzanines
  const alcoveLights: Array<[number, number, number, number, number]> = [
    [-3.7, 2.85, -5.5, 0.9, 9],
    [-3.8, 2.85, -11.4, 1.05, 8],
    [2.9, 2.85, -6.8, 0.95, 8],
    [4.1, 5.9, -6.8, 0.75, 10],
  ];
  for (const [lx, ly, lz, inten, dist] of alcoveLights) {
    const pl = new THREE.PointLight(0xffffff, inten, dist, 1.6);
    pl.position.set(lx, ly, lz);
    scene.add(pl);
  }

  // ---- OrbitControls & FirstPersonController ----
  const orbitControls = new OrbitControls(camera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = navigation.orbit.dampingFactor;
  orbitControls.minDistance = navigation.orbit.minDistance;
  orbitControls.maxDistance = navigation.orbit.maxDistance;
  orbitControls.maxPolarAngle = navigation.orbit.maxPolarAngle;
  orbitControls.screenSpacePanning = true;

  const fpController = new FirstPersonController(camera, canvas, collisionWorld);

  let viewMode: AtriumViewMode = initialMode;
  let disposed = false;
  let rafId = 0;
  let doorAnimStart = 0;
  let doorAnimDuration = 0;
  let doorAnimActive = false;

  function syncDataset(): void {
    host.dataset.renderer = "three-webgl";
    host.dataset.viewMode = viewMode;
    host.dataset.doorAngle = arch.doors.getOpenAngleDeg().toFixed(2);
    host.dataset.cameraPos = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}`;
    const fp = fpController.getState();
    host.dataset.fpFeetY = fp.feetY.toFixed(2);
    host.dataset.fpSurface = fp.surfaceId;
  }

  function applyDefaultOrbitView(): void {
    const aspect = Math.max(0.4, camera.aspect);
    camera.fov = aspect < 0.85 ? navigation.orbit.portraitFov : navigation.orbit.defaultFov;
    camera.near = 0.08;
    camera.far = 220;
    camera.updateProjectionMatrix();
    camera.position.set(...navigation.orbit.defaultPosition);
    orbitControls.target.set(...navigation.orbit.defaultTarget);
    orbitControls.update();
  }

  function setMode(nextMode: AtriumViewMode): void {
    if (disposed) return;
    viewMode = nextMode;
    if (nextMode === "orbit") {
      fpController.disable();
      orbitControls.enabled = true;
      applyDefaultOrbitView();
    } else {
      orbitControls.enabled = false;
      fpController.enable();
      canvas.focus({ preventScroll: true });
    }
    onModeChange?.(nextMode);
    renderFrame();
  }

  function resetView(): void {
    if (disposed) return;
    if (viewMode === "orbit") {
      applyDefaultOrbitView();
    } else {
      fpController.enable();
    }
    renderFrame();
  }

  function renderFrame(): void {
    if (disposed) return;
    renderer.render(scene, camera);
    syncDataset();
  }

  function resize(): void {
    if (disposed) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    materials.setResolution(w, h);
    camera.aspect = w / h;
    if (viewMode === "orbit") {
      camera.fov = camera.aspect < 0.85 ? navigation.orbit.portraitFov : navigation.orbit.defaultFov;
    } else {
      camera.fov = camera.aspect < 0.85 ? 74 : 60;
    }
    camera.updateProjectionMatrix();
    renderFrame();
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(host);

  // Pre-compile shaders & bake initial soft shadow map
  arch.doors.setOpenProgress(reducedMotion ? 1 : 0);
  resize();
  setMode(initialMode);
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, camera);
  renderFrame();

  function animateDoorsOpen(durationMs = 820): void {
    if (disposed) return;
    if (reducedMotion || durationMs <= 0) {
      doorAnimActive = false;
      arch.doors.setOpenProgress(1);
      renderer.shadowMap.needsUpdate = true;
      renderFrame();
      return;
    }
    arch.doors.setOpenProgress(0);
    doorAnimStart = performance.now();
    doorAnimDuration = durationMs;
    doorAnimActive = true;
  }

  if (!reducedMotion) {
    animateDoorsOpen(820);
  }

  let prevTime = performance.now();
  const loop = (now: number) => {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.08, Math.max(0.001, (now - prevTime) / 1000));
    prevTime = now;

    let needsRender = false;

    if (doorAnimActive) {
      const raw = THREE.MathUtils.clamp((now - doorAnimStart) / doorAnimDuration, 0, 1);
      // Smooth cubic ease-out for architectural portal leaves
      const eased = 1 - Math.pow(1 - raw, 3);
      arch.doors.setOpenProgress(eased);
      renderer.shadowMap.needsUpdate = true;
      needsRender = true;
      if (raw >= 1) {
        doorAnimActive = false;
      }
    }

    if (viewMode === "orbit") {
      orbitControls.target.y = THREE.MathUtils.clamp(orbitControls.target.y, -0.1, 6.2);
      if (orbitControls.update()) {
        needsRender = true;
      }
    } else {
      if (fpController.step(dt)) {
        needsRender = true;
      }
    }

    if (needsRender) {
      renderFrame();
    }
  };
  rafId = requestAnimationFrame(loop);

  const api: AtriumSceneApi = {
    getMode: () => viewMode,
    setMode,
    resetView,
    setDoorProgress(progress) {
      doorAnimActive = false;
      arch.doors.setOpenProgress(progress);
      renderer.shadowMap.needsUpdate = true;
      renderFrame();
    },
    animateDoorsOpen,
    setOrbitPose(position, target) {
      if (viewMode !== "orbit") setMode("orbit");
      camera.position.set(position[0], position[1], position[2]);
      orbitControls.target.set(target[0], target[1], target[2]);
      orbitControls.update();
      renderFrame();
    },
    spawnFirstPerson(x, z, yaw = 0, pitch = -0.02, feetY) {
      if (viewMode !== "firstPerson") setMode("firstPerson");
      fpController.spawnAt(x, z, yaw, pitch, feetY);
      renderFrame();
      return fpController.getState();
    },
    stepFirstPerson(forward, strafe, dt) {
      if (viewMode !== "firstPerson") setMode("firstPerson");
      const state = fpController.stepInput(forward, strafe, dt);
      renderFrame();
      return state;
    },
    rotateFirstPerson(dxPx, dyPx) {
      if (viewMode !== "firstPerson") setMode("firstPerson");
      fpController.rotateLook(dxPx, dyPx);
      renderFrame();
      return fpController.getState();
    },
    getDiagnostics() {
      const usedMats = new Set<string>();
      let hasTextures = false;
      atriumRoot.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m.name !== "contact-shadow") usedMats.add(m.name);
          const std = m as THREE.MeshStandardMaterial;
          if (std.map || std.normalMap || std.roughnessMap || std.metalnessMap) {
            hasTextures = true;
          }
        }
      });
      return {
        renderer: "three-webgl",
        viewMode,
        doorAngleDeg: +arch.doors.getOpenAngleDeg().toFixed(2),
        cameraPosition: [
          +camera.position.x.toFixed(3),
          +camera.position.y.toFixed(3),
          +camera.position.z.toFixed(3),
        ],
        orbitTarget: [
          +orbitControls.target.x.toFixed(3),
          +orbitControls.target.y.toFixed(3),
          +orbitControls.target.z.toFixed(3),
        ],
        firstPerson: fpController.getState(),
        solidMeshCount,
        triangleCount,
        colliderCount: collisionWorld.getColliderCount(),
        walkSurfaceCount: collisionWorld.getSurfaceCount(),
        materialNames: [...usedMats].sort(),
        hasTextures,
      };
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      fpController.dispose();
      orbitControls.dispose();
      arch.doors.dispose();
      for (const g of disposableGeometries) g.dispose();
      groundMat.dispose();
      materials.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
      if ((window as Window & { __atriumScene?: AtriumSceneApi }).__atriumScene === api) {
        delete (window as Window & { __atriumScene?: AtriumSceneApi }).__atriumScene;
      }
    },
  };

  (window as Window & { __atriumScene?: AtriumSceneApi }).__atriumScene = api;
  return api;
}
