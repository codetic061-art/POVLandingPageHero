import type { CSSProperties, ReactNode } from "react";

export type SceneBounds = readonly [x: number, y: number, width: number, height: number];

/** Keep separate DOM layers aligned to the original 1600 × 900 illustration. */
export function sceneLayerStyle([x, y, width, height]: SceneBounds): CSSProperties {
  return {
    position: "absolute",
    left: `${(x / 1600) * 100}%`,
    top: `${(y / 900) * 100}%`,
    width: `${(width / 1600) * 100}%`,
    height: `${(height / 900) * 100}%`,
  };
}

export function SceneSvgLayer({
  name,
  bounds,
  children,
}: {
  name: string;
  bounds: SceneBounds;
  children: ReactNode;
}) {
  return (
    <svg
      className="scene-svg-layer"
      data-name={name}
      data-scene-layer={name}
      viewBox={bounds.join(" ")}
      width={bounds[2]}
      height={bounds[3]}
      style={sceneLayerStyle(bounds)}
      aria-hidden="true"
      focusable="false"
    >
      <title>{name}</title>
      {children}
    </svg>
  );
}
