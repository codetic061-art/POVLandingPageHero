import { useEffect, useRef } from "react";
import type { AtriumLoadingPhase, AtriumSceneApi, AtriumViewMode } from "./types";

export function DoorwayEntrance({
  reducedMotion,
  onModeChange,
  onLoadingChange,
  onReady,
  onError,
}: {
  reducedMotion: boolean;
  onModeChange: (mode: AtriumViewMode) => void;
  onLoadingChange?: (loading: boolean, phase: AtriumLoadingPhase) => void;
  onReady: (scene: AtriumSceneApi) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const modeCallbackRef = useRef(onModeChange);
  modeCallbackRef.current = onModeChange;
  const loadingCallbackRef = useRef(onLoadingChange);
  loadingCallbackRef.current = onLoadingChange;

  useEffect(() => {
    let alive = true;
    let scene: AtriumSceneApi | undefined;
    let readyRaf = 0;

    // Signal real initial 3D world loading while Three.js & scene geometry initialize
    loadingCallbackRef.current?.(true, "world");

    // Keep the 3D engine out of the initial Hero/selection bundle.
    void import("../../atrium/createAtriumScene")
      .then(({ createAtriumScene }) => {
        if (!alive || !host.current) return;
        scene = createAtriumScene({
          host: host.current,
          initialMode: "orbit",
          reducedMotion: reducedRef.current,
          onModeChange: (next) => modeCallbackRef.current(next),
          onLoadingChange: (loading, phase) => loadingCallbackRef.current?.(loading, phase),
        });
        // Wait for the initial WebGL frame to actually paint before dismissing the loader
        readyRaf = requestAnimationFrame(() => {
          if (!alive || !scene) return;
          loadingCallbackRef.current?.(false, null);
          onReady(scene);
        });
      })
      .catch(() => {
        if (alive) {
          loadingCallbackRef.current?.(false, null);
          onError();
        }
      });
    return () => {
      alive = false;
      cancelAnimationFrame(readyRaf);
      scene?.dispose();
    };
  }, [onReady, onError]);

  return <div className="doorway-renderer" ref={host} data-name="3D office atrium scene" />;
}
