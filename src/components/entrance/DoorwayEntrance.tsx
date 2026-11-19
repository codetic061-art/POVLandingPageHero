import { useEffect, useRef } from "react";
import type { AtriumSceneApi, AtriumViewMode } from "./types";

export function DoorwayEntrance({
  reducedMotion,
  onModeChange,
  onReady,
  onError,
}: {
  reducedMotion: boolean;
  onModeChange: (mode: AtriumViewMode) => void;
  onReady: (scene: AtriumSceneApi) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const modeCallbackRef = useRef(onModeChange);
  modeCallbackRef.current = onModeChange;

  useEffect(() => {
    let alive = true;
    let scene: AtriumSceneApi | undefined;
    // Keep the 3D engine out of the initial Hero/selection bundle.
    void import("../../atrium/createAtriumScene")
      .then(({ createAtriumScene }) => {
        if (!alive || !host.current) return;
        scene = createAtriumScene({
          host: host.current,
          initialMode: "orbit",
          reducedMotion: reducedRef.current,
          onModeChange: (next) => modeCallbackRef.current(next),
        });
        onReady(scene);
      })
      .catch(() => {
        if (alive) onError();
      });
    return () => {
      alive = false;
      scene?.dispose();
    };
  }, [onReady, onError]);

  return <div className="doorway-renderer" ref={host} data-name="3D office atrium scene" />;
}
