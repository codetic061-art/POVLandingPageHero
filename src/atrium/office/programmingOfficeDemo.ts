import * as THREE from "three";
import { ATRIUM_CONFIG } from "../config";
import {
  type StickmanInstance,
  type StickmanMasterAssets,
  type StickmanRigDiagnostics,
  type StickmanVariant,
} from "../characters/stickmanMaster";

export interface ProgrammingOfficeDemo {
  group: THREE.Group;
  characters: StickmanInstance[];
  update: (timeSec: number) => void;
  getDiagnostics: () => StickmanRigDiagnostics[];
}

/**
 * Populates the lower-floor programming office with 3 animated demo stickmen
 * reusing the master 3D stickman assets (2 at the left collaborative desk,
 * 1 at the center-right meeting desk), leaving interactive user seats open.
 */
export function createProgrammingOfficeDemo(
  masterAssets: StickmanMasterAssets,
): ProgrammingOfficeDemo {
  const { furniture } = ATRIUM_CONFIG;
  const ld = furniture.leftDesk;
  const mt = furniture.meeting;

  const group = new THREE.Group();
  group.name = "lower-floor-programming-demo";

  const placements: Array<{
    id: string;
    variant: StickmanVariant;
    x: number;
    y: number;
    z: number;
    yaw: number;
    phase: number;
  }> = [
    // Left desk south-west swivel chair (typing on front-west laptop)
    {
      id: "dev-left-1",
      variant: "male",
      x: ld.cx - 0.69,
      y: 0,
      z: ld.cz + 0.48,
      yaw: Math.PI * 0.47,
      phase: 0.4,
    },
    // Left desk north-west swivel chair (typing on rear-west laptop)
    {
      id: "dev-left-2",
      variant: "female",
      x: ld.cx - 0.69,
      y: 0,
      z: ld.cz - 0.48,
      yaw: Math.PI * 0.53,
      phase: 2.3,
    },
    // Center-right meeting table south-west chair (typing on existing laptop facing -X)
    {
      id: "dev-right-1",
      variant: "male",
      x: mt.cx - mt.widthX / 2 - 0.24,
      y: 0,
      z: mt.cz + 0.40,
      yaw: Math.PI * 0.52,
      phase: 4.1,
    },
  ];

  const characters: StickmanInstance[] = [];
  for (const p of placements) {
    const inst = masterAssets.createInstance(p.id, p.variant, p.phase);
    inst.setPose("seated-typing");
    inst.root.position.set(p.x, p.y, p.z);
    inst.root.rotation.y = p.yaw;
    group.add(inst.root);
    characters.push(inst);
  }

  return {
    group,
    characters,
    update(timeSec: number) {
      for (const ch of characters) {
        ch.update(timeSec);
      }
    },
    getDiagnostics() {
      return characters.map((ch) => ch.getDiagnostics());
    },
  };
}
