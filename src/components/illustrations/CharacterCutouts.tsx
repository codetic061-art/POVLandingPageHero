import { POV_PALETTE as P } from "./palette";
import { SceneSvgLayer, sceneLayerStyle, type SceneBounds } from "./SceneLayer";

const CHARACTER_IMAGES = [
  {
    id: "characters-left-standing",
    name: "People / Left standing pair",
    src: "/characters/left-standing.png",
    side: "left",
    bounds: [135.9, 321.4, 239.2, 440],
  },
  {
    id: "characters-left-lounge",
    name: "People / Left lounge pair",
    src: "/characters/left-lounge.png",
    side: "left",
    bounds: [334.9, 520.3, 419.1, 241],
  },
  {
    id: "characters-right-standing",
    name: "People / Right standing pair",
    src: "/characters/right-standing.png",
    side: "right",
    bounds: [1089, 332.8, 262.2, 420.8],
  },
  {
    id: "characters-right-desk",
    name: "People / Right desk worker",
    src: "/characters/right-desk.png",
    side: "right",
    bounds: [1404.8, 420.8, 195.2, 319.5],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  src: string;
  side: "left" | "right";
  bounds: SceneBounds;
}>;

/** Keep each original image in its own DOM layer rather than embedding it inside one SVG. */
export function CharacterCutouts() {
  return (
    <div
      id="pov-character-cutouts"
      className="hero-characters"
      data-name="Hero people"
      aria-hidden="true"
    >
      {(["left", "right"] as const).map((side) => (
        <div
          className="scene-layer-group"
          data-character-side={side}
          data-name={`People / ${side} exit group`}
          key={side}
        >
          {side === "left" ? (
            <SceneSvgLayer name="People / Left floor shadows" bounds={[147, 743.5, 583, 18]}>
              <ellipse cx="255" cy="754" rx="108" ry="7.5" fill={P.warmShadow} opacity={0.65} />
              <ellipse cx="534" cy="752" rx="196" ry="8.5" fill={P.warmShadow} opacity={0.65} />
            </SceneSvgLayer>
          ) : (
            <SceneSvgLayer name="People / Right floor shadows" bounds={[1098, 727.5, 492, 26]}>
              <ellipse cx="1222" cy="746" rx="124" ry="7.5" fill={P.warmShadow} opacity={0.65} />
              <ellipse cx="1502" cy="734" rx="88" ry="6.5" fill={P.warmShadow} opacity={0.62} />
            </SceneSvgLayer>
          )}
          {CHARACTER_IMAGES.filter((image) => image.side === side).map((image) => (
            <img
              key={image.id}
              id={image.id}
              data-name={image.name}
              data-scene-layer={image.name}
              className="scene-image-layer"
              src={image.src}
              alt=""
              width={image.bounds[2]}
              height={image.bounds[3]}
              style={sceneLayerStyle(image.bounds)}
              draggable={false}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
