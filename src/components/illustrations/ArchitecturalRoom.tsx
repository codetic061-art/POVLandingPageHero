import { POV_PALETTE as P, STROKE as S } from "./palette";
import { SceneSvgLayer } from "./SceneLayer";

function FicusLeaf({
  cx,
  cy,
  rx,
  ry,
  rotate,
  fill = P.sage,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  fill?: string;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${rotate})`}>
      <path
        d={`M 0 ${ry} C ${-rx * 1.15} ${ry * 0.45}, ${-rx * 1.1} ${-ry * 0.55}, 0 ${-ry} C ${rx * 1.1} ${-ry * 0.55}, ${rx * 1.15} ${ry * 0.45}, 0 ${ry} Z`}
        fill={fill}
        stroke={P.charcoal}
        strokeWidth={1.15}
        strokeLinejoin="round"
      />
      <path
        d={`M 0 ${ry * 0.88} L 0 ${-ry * 0.62}`}
        stroke={P.charcoal}
        strokeWidth={0.85}
        strokeLinecap="round"
        opacity={0.75}
      />
    </g>
  );
}

export function ArchitecturalRoom() {
  // Vanishing point for subtle 1-point perspective floorboards
  const vpX = 800;
  const vpY = 540;
  const floorTargetsX = [-260, 40, 290, 505, 695, 865, 1055, 1275, 1525, 1840];

  return (
    <div id="pov-architectural-room" className="scene-layer-group" data-name="Office environment">
      <SceneSvgLayer name="Room / Background and floor" bounds={[-340, -240, 2280, 1360]}>
        <defs>
          <clipPath id="pov-floor-clip">
            <polygon points="-340,808 150,708 1418,708 1940,795 1940,1120 -340,1120" />
          </clipPath>
        </defs>

        {/* Base room ground */}
        <rect x="-340" y="-240" width="2280" height="1360" fill={P.canvas} />

        {/* Subtle floor surface plane */}
        <polygon points="-340,808 150,708 1418,708 1940,795 1940,1120 -340,1120" fill="#F6F4EF" />

        {/* Perspective floorboard lines clipped neatly to floor */}
        <g clipPath="url(#pov-floor-clip)" opacity={0.42}>
          {floorTargetsX.map((tx, idx) => (
            <line
              key={idx}
              x1={vpX}
              y1={vpY}
              x2={tx}
              y2={960}
              stroke={P.charcoal}
              strokeWidth={S.archThin}
            />
          ))}
        </g>
      </SceneSvgLayer>

      {/* ==================== LEFT ANGLED WALL ==================== */}
      <SceneSvgLayer name="Room / Left wall and window" bounds={[-320, -54, 526, 862]}>
        <g
          id="room-left-wall"
          stroke={P.charcoal}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Ceiling perspective line */}
          <line x1="-320" y1="-54" x2="206" y2="158" strokeWidth={1.1} />
          {/* Corner vertical reveal */}
          <line x1="150" y1="135" x2="150" y2="708" strokeWidth={1.1} />
          {/* Tall minimalist studio window on left angled wall */}
          <polygon points="-52,175 102,216 102,718 -52,749" fill="#F7F5F0" strokeWidth={1.1} />
          <polygon points="-42,188 92,224 92,712 -42,739" fill={P.canvas} strokeWidth={0.95} />
          {/* Window vertical mullion */}
          <line x1="34" y1="208" x2="34" y2="724" strokeWidth={1.0} />

          {/* Left wall baseboard */}
          <polygon points="-320,798 150,700 150,708 -320,808" fill={P.stone} strokeWidth={1.05} />
        </g>
      </SceneSvgLayer>

      {/* ==================== RIGHT ANGLED WALL ==================== */}
      <SceneSvgLayer name="Room / Right wall" bounds={[1374, -52, 546, 845]}>
        <g
          id="room-right-wall"
          stroke={P.charcoal}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Ceiling perspective line */}
          <line x1="1374" y1="162" x2="1920" y2="-52" strokeWidth={1.1} />
          {/* Corner vertical reveal */}
          <line x1="1418" y1="145" x2="1418" y2="708" strokeWidth={1.1} />
          {/* Secondary architectural wall seam */}
          <line x1="1468" y1="125" x2="1468" y2="716" strokeWidth={0.95} opacity={0.85} />

          {/* Right wall baseboard */}
          <polygon points="1418,700 1920,783 1920,793 1418,708" fill={P.stone} strokeWidth={1.05} />
        </g>
      </SceneSvgLayer>

      {/* Floating architectural shelf with books & small sage plant */}
      <SceneSvgLayer name="Decor / Shelf, books and small plant" bounds={[1418, 208, 206, 129]}>
        <g stroke={P.charcoal} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g id="right-wall-shelf">
            {/* Upright books */}
            <polygon
              points="1458,244 1474,242 1474,316 1458,318"
              fill={P.ivory}
              strokeWidth={1.15}
            />
            <polygon
              points="1474,238 1492,236 1492,314 1474,316"
              fill={P.charcoal}
              strokeWidth={1.15}
            />
            {/* Tiny Coral book spine accent */}
            <polygon
              points="1492,248 1503,247 1503,313 1492,314"
              fill={P.coral}
              strokeWidth={1.15}
            />
            {/* Leaning monograph */}
            <polygon
              points="1504,244 1521,241 1531,310 1514,312"
              fill={P.stone}
              strokeWidth={1.15}
            />
            {/* Horizontal stacked books */}
            <polygon
              points="1534,297 1594,290 1594,303 1534,310"
              fill={P.ivory}
              strokeWidth={1.1}
            />
            <polygon
              points="1540,285 1588,280 1588,291 1540,297"
              fill={P.stone}
              strokeWidth={1.1}
            />
            {/* Small potted plant atop stacked books */}
            <g id="shelf-mini-plant">
              <path d="M 1564 252 Q 1563 236 1556 224" strokeWidth={1.15} />
              <path d="M 1565 252 Q 1566 232 1568 216" strokeWidth={1.15} />
              <path d="M 1566 252 Q 1574 236 1582 227" strokeWidth={1.15} />
              <FicusLeaf cx={1552} cy={232} rx={5.5} ry={12} rotate={-34} fill={P.sageLight} />
              <FicusLeaf cx={1567} cy={222} rx={6} ry={13.5} rotate={4} fill={P.sage} />
              <FicusLeaf cx={1580} cy={233} rx={5.5} ry={12} rotate={36} fill={P.sageLight} />
              <FicusLeaf cx={1557} cy={244} rx={5} ry={10} rotate={-56} fill={P.sage} />
              <FicusLeaf cx={1576} cy={245} rx={5} ry={10} rotate={54} fill={P.sage} />
              <polygon
                points="1551,250 1579,247 1576,281 1554,284"
                fill={P.ivory}
                strokeWidth={1.2}
              />
            </g>

            {/* Floating shelf plank (3D perspective) */}
            <polygon
              points="1428,320 1624,298 1624,309 1428,331"
              fill={P.ivory}
              strokeWidth={1.2}
            />
            <polygon
              points="1428,331 1624,309 1612,316 1418,337"
              fill={P.warmDepth}
              strokeWidth={1.05}
            />
          </g>
        </g>
      </SceneSvgLayer>

      {/* ==================== BACK WALL BASEBOARDS ==================== */}
      <SceneSvgLayer name="Room / Back wall baseboards" bounds={[150, 700, 1268, 8]}>
        <rect
          x="150"
          y="700"
          width="312"
          height="8"
          fill={P.stone}
          stroke={P.charcoal}
          strokeWidth={1.05}
        />
        <rect
          x="1138"
          y="700"
          width="280"
          height="8"
          fill={P.stone}
          stroke={P.charcoal}
          strokeWidth={1.05}
        />
      </SceneSvgLayer>

      {/* ==================== BACK WALL DETAILS (LAMP, NOTES, ART) ==================== */}
      {/* Suspended Architectural Pendant Lamp */}
      <SceneSvgLayer name="Decor / Pendant lamp" bounds={[230, -240, 152, 494]}>
        <defs>
          <radialGradient id="pov-lamp-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F6DC99" stopOpacity="0.42" />
            <stop offset="65%" stopColor="#F6DC99" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#F4F2ED" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g id="pendant-lamp">
          {/* Subtle warm ambient light pool beneath lamp */}
          <ellipse cx="306" cy="222" rx="76" ry="32" fill="url(#pov-lamp-glow)" />
          {/* Ceiling cord extending cleanly beyond top viewport edge */}
          <line x1="306" y1="-240" x2="306" y2="148" stroke={P.charcoal} strokeWidth={2.2} />
          {/* Brass/charcoal socket neck */}
          <path
            d="M 298 158 L 300 146 C 300 143, 312 143, 312 146 L 314 158 Z"
            fill={P.charcoal}
            stroke={P.charcoal}
            strokeWidth={1.2}
          />
          {/* Matte charcoal bell shade */}
          <path
            d="M 293 158 C 272 162, 257 180, 253 205 L 359 205 C 355 180, 340 162, 319 158 Z"
            fill={P.charcoal}
            stroke={P.charcoal}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
          {/* Warm golden interior reflector diffuser */}
          <ellipse
            cx="306"
            cy="205"
            rx="53"
            ry="9.5"
            fill={P.gold}
            stroke={P.charcoal}
            strokeWidth={1.25}
          />
          <ellipse cx="306" cy="204.5" rx="44" ry="6.5" fill={P.goldGlow} />
          {/* Glowing warm bulb */}
          <path
            d="M 295 204 A 11 10 0 0 0 317 204 Z"
            fill="#FFFDF8"
            stroke={P.gold}
            strokeWidth={0.9}
          />
        </g>
      </SceneSvgLayer>

      {/* Minimalist Pinned Studio Notes (Left of Door) */}
      <SceneSvgLayer name="Decor / Wall notes" bounds={[314, 280, 116, 96]}>
        <g id="wall-sticky-notes" stroke={P.charcoal} strokeWidth={1.1}>
          {/* Top ivory note */}
          <rect x="314" y="280" width="36" height="36" rx="1" fill={P.ivory} />
          <line x1="332" y1="280" x2="332" y2="286" strokeWidth={1.1} />

          {/* Electric Blue accent note */}
          <path
            d="M 370 292 L 406 292 L 406 321 L 399 328 L 370 328 Z"
            fill={P.blue}
            strokeLinejoin="round"
          />
          <path d="M 399 328 L 399 321 L 406 321" fill="#6C7DF8" strokeLinejoin="round" />

          {/* Lower ivory note */}
          <rect x="394" y="340" width="36" height="36" rx="1" fill={P.ivory} />
          <line x1="412" y1="340" x2="412" y2="346" strokeWidth={1.1} />
        </g>
      </SceneSvgLayer>

      {/* Modernist Framed Geometric Print (Right of Door) */}
      <SceneSvgLayer name="Decor / Framed artwork" bounds={[1324, 282, 80, 98]}>
        <g id="wall-framed-art">
          {/* Subtle frame drop shadow */}
          <rect x="1328" y="286" width="76" height="94" fill={P.warmDepth} opacity={0.65} />
          {/* Outer frame */}
          <rect
            x="1324"
            y="282"
            width="76"
            height="94"
            fill={P.ivory}
            stroke={P.charcoal}
            strokeWidth={1.3}
          />
          {/* Inner mat opening */}
          <rect
            x="1333"
            y="291"
            width="58"
            height="76"
            fill="#F5F3EE"
            stroke={P.charcoal}
            strokeWidth={0.85}
            opacity={0.7}
          />
          {/* Electric Blue modernist lower semicircle */}
          <path d="M 1340 335 A 22 22 0 0 0 1384 335 Z" fill={P.blue} />
          {/* Balanced charcoal disc */}
          <circle cx="1372" cy="317" r="6.5" fill={P.charcoal} />
          {/* Tiny decorative coral dot */}
          <circle cx="1351" cy="322" r="3" fill={P.coral} />
        </g>
      </SceneSvgLayer>

      {/* ==================== CENTRAL SYMMETRICAL SPLIT DOUBLE ENTRANCE DOOR ==================== */}
      {/* Split cleanly down the center (x=800) into Left Leaf + Right Leaf for future left/right opening */}
      <SceneSvgLayer name="Room / Double doorway" bounds={[462, 118, 676, 595.5]}>
        <g id="central-architectural-door">
          {/* Outer Mitered Casing / Architrave */}
          <polygon
            points="462,708 462,118 1138,118 1138,708 1110,708 1110,146 490,146 490,708"
            fill="#F8F6F1"
            stroke={P.charcoal}
            strokeWidth={1.35}
            strokeLinejoin="round"
          />
          {/* 45-degree architectural miter joints at casing corners */}
          <line x1="462" y1="118" x2="490" y2="146" stroke={P.charcoal} strokeWidth={1.2} />
          <line x1="1138" y1="118" x2="1110" y2="146" stroke={P.charcoal} strokeWidth={1.2} />

          {/* Subtle inner trim step on casing */}
          <polyline
            points="471,708 471,127 1129,127 1129,708"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={0.75}
            opacity={0.45}
          />

          {/* 3D Recessed Jamb Reveal (Left, Top Soffit, Right) */}
          <polygon
            points="490,708 490,146 516,166 516,708"
            fill={P.stone}
            stroke={P.charcoal}
            strokeWidth={1.15}
            strokeLinejoin="round"
          />
          <polygon
            points="490,146 1110,146 1084,166 516,166"
            fill={P.warmDepth}
            stroke={P.charcoal}
            strokeWidth={1.15}
            strokeLinejoin="round"
          />
          <polygon
            points="1110,146 1110,708 1084,708 1084,166"
            fill={P.stone}
            stroke={P.charcoal}
            strokeWidth={1.15}
            strokeLinejoin="round"
          />

          {/* Door Stop Rebate Frame */}
          <polygon
            points="516,708 516,166 1084,166 1084,708 1078,708 1078,172 522,172 522,708"
            fill={P.ivory}
            stroke={P.charcoal}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />

          {/* LEFT DOOR LEAF (x = 522..800) */}
          <g id="door-leaf-left">
            <rect
              x="522"
              y="172"
              width="278"
              height="536"
              fill={P.canvas}
              stroke={P.charcoal}
              strokeWidth={1.45}
            />
            <polyline
              points="800,202 552,202 552,676 800,676"
              fill="none"
              stroke={P.charcoal}
              strokeWidth={1.05}
              strokeLinejoin="round"
            />
            <polyline
              points="800,209 559,209 559,669 800,669"
              fill="none"
              stroke={P.charcoal}
              strokeWidth={0.75}
              opacity={0.4}
              strokeLinejoin="round"
            />
            <line
              x1="552"
              y1="202"
              x2="559"
              y2="209"
              stroke={P.charcoal}
              strokeWidth={0.85}
              opacity={0.6}
            />
            <line
              x1="552"
              y1="676"
              x2="559"
              y2="669"
              stroke={P.charcoal}
              strokeWidth={0.85}
              opacity={0.6}
            />

            {/* Left Jamb Hinges */}
            {[246, 436, 626].map((hy) => (
              <g key={`left-hinge-${hy}`}>
                <rect x="519" y={hy} width="6" height="36" rx="2" fill={P.charcoal} />
                <line
                  x1="519"
                  y1={hy + 12}
                  x2="525"
                  y2={hy + 12}
                  stroke={P.ivory}
                  strokeWidth={0.9}
                />
                <line
                  x1="519"
                  y1={hy + 24}
                  x2="525"
                  y2={hy + 24}
                  stroke={P.ivory}
                  strokeWidth={0.9}
                />
              </g>
            ))}
          </g>

          {/* RIGHT DOOR LEAF (x = 800..1078) */}
          <g id="door-leaf-right">
            <rect
              x="800"
              y="172"
              width="278"
              height="536"
              fill={P.canvas}
              stroke={P.charcoal}
              strokeWidth={1.45}
            />
            <polyline
              points="800,202 1048,202 1048,676 800,676"
              fill="none"
              stroke={P.charcoal}
              strokeWidth={1.05}
              strokeLinejoin="round"
            />
            <polyline
              points="800,209 1041,209 1041,669 800,669"
              fill="none"
              stroke={P.charcoal}
              strokeWidth={0.75}
              opacity={0.4}
              strokeLinejoin="round"
            />
            <line
              x1="1048"
              y1="202"
              x2="1041"
              y2="209"
              stroke={P.charcoal}
              strokeWidth={0.85}
              opacity={0.6}
            />
            <line
              x1="1048"
              y1="676"
              x2="1041"
              y2="669"
              stroke={P.charcoal}
              strokeWidth={0.85}
              opacity={0.6}
            />

            {/* Right Jamb Hinges */}
            {[246, 436, 626].map((hy) => (
              <g key={`right-hinge-${hy}`}>
                <rect x="1075" y={hy} width="6" height="36" rx="2" fill={P.charcoal} />
                <line
                  x1="1075"
                  y1={hy + 12}
                  x2="1081"
                  y2={hy + 12}
                  stroke={P.ivory}
                  strokeWidth={0.9}
                />
                <line
                  x1="1075"
                  y1={hy + 24}
                  x2="1081"
                  y2={hy + 24}
                  stroke={P.ivory}
                  strokeWidth={0.9}
                />
              </g>
            ))}
          </g>

          {/* Crisp Center Vertical Door Split Seam (x = 800) */}
          <line x1="800" y1="172" x2="800" y2="708" stroke={P.charcoal} strokeWidth={1.5} />

          {/* Architectural Floor Sill / Threshold Plate */}
          <rect
            x="490"
            y="708"
            width="620"
            height="5.5"
            fill={P.warmDepth}
            stroke={P.charcoal}
            strokeWidth={1.2}
          />
        </g>
      </SceneSvgLayer>

      {/* ==================== FLANKING ARCHITECTURAL SAGE PLANTERS ==================== */}
      {/* Left Studio Ficus Planter */}
      <SceneSvgLayer name="Plants / Left planter" bounds={[3, 429, 134, 308]}>
        <g id="left-studio-planter">
          {/* Subtle floor shadow */}
          <ellipse cx="66" cy="730" rx="46" ry="6" fill={P.warmShadow} opacity={0.75} />
          {/* Stems */}
          <path
            d="M 62 638 C 58 585, 50 532, 42 478"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <path
            d="M 68 638 C 72 575, 76 520, 74 456"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <path
            d="M 72 638 C 84 595, 96 555, 108 514"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          {/* Layered botanical sage leaves */}
          <FicusLeaf cx={28} cy={562} rx={11} ry={25} rotate={-44} fill={P.sageLight} />
          <FicusLeaf cx={34} cy={504} rx={11.5} ry={26} rotate={-32} fill={P.sage} />
          <FicusLeaf cx={54} cy={468} rx={11} ry={25} rotate={-10} fill={P.sageLight} />
          <FicusLeaf cx={77} cy={458} rx={12} ry={27} rotate={8} fill={P.sage} />
          <FicusLeaf cx={102} cy={496} rx={11.5} ry={26} rotate={28} fill={P.sageLight} />
          <FicusLeaf cx={112} cy={544} rx={11} ry={25} rotate={42} fill={P.sage} />
          <FicusLeaf cx={42} cy={604} rx={10.5} ry={23} rotate={-52} fill={P.sage} />
          <FicusLeaf cx={96} cy={596} rx={10.5} ry={23} rotate={48} fill={P.sageLight} />
          <FicusLeaf cx={65} cy={532} rx={12} ry={27} rotate={-4} fill={P.sage} />
          <FicusLeaf cx={72} cy={584} rx={11} ry={24} rotate={14} fill={P.sageLight} />

          {/* Cylindrical Ceramic Pot */}
          <path
            d="M 30 634 L 102 634 L 97 726 C 97 730, 35 730, 35 726 Z"
            fill={P.ivory}
            stroke={P.charcoal}
            strokeWidth={1.35}
            strokeLinejoin="round"
          />
          {/* Subtle cylindrical shading on right third of pot */}
          <path d="M 80 635 L 101 635 L 96.5 725.5 C 90 727.5, 84 728, 78 728 Z" fill={P.stone} />
          {/* Pot top rim */}
          <ellipse
            cx="66"
            cy="634"
            rx="36"
            ry="4.5"
            fill={P.stone}
            stroke={P.charcoal}
            strokeWidth={1.3}
          />
        </g>
      </SceneSvgLayer>

      {/* Right Studio Ficus Planter */}
      <SceneSvgLayer name="Plants / Right planter" bounds={[1313, 457, 107, 265]}>
        <g id="right-studio-planter">
          <ellipse cx="1364" cy="716" rx="38" ry="5" fill={P.warmShadow} opacity={0.75} />
          {/* Stems */}
          <path
            d="M 1360 636 C 1356 590, 1348 544, 1342 496"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <path
            d="M 1365 636 C 1367 582, 1370 532, 1368 476"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.45}
            strokeLinecap="round"
          />
          <path
            d="M 1369 636 C 1378 596, 1388 560, 1398 524"
            fill="none"
            stroke={P.charcoal}
            strokeWidth={1.35}
            strokeLinecap="round"
          />
          {/* Layered botanical sage leaves */}
          <FicusLeaf cx={1334} cy={568} rx={9.5} ry={22} rotate={-40} fill={P.sageLight} />
          <FicusLeaf cx={1340} cy={514} rx={10} ry={23} rotate={-26} fill={P.sage} />
          <FicusLeaf cx={1366} cy={482} rx={10.5} ry={24} rotate={4} fill={P.sageLight} />
          <FicusLeaf cx={1390} cy={512} rx={10} ry={23} rotate={28} fill={P.sage} />
          <FicusLeaf cx={1398} cy={558} rx={9.5} ry={22} rotate={42} fill={P.sageLight} />
          <FicusLeaf cx={1344} cy={606} rx={9} ry={20} rotate={-48} fill={P.sage} />
          <FicusLeaf cx={1386} cy={600} rx={9} ry={20} rotate={46} fill={P.sage} />
          <FicusLeaf cx={1364} cy={544} rx={10.5} ry={23} rotate={-6} fill={P.sage} />

          {/* Cylindrical Ceramic Pot */}
          <path
            d="M 1334 634 L 1394 634 L 1390 712 C 1390 715, 1338 715, 1338 712 Z"
            fill={P.ivory}
            stroke={P.charcoal}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <path
            d="M 1376 635 L 1393 635 L 1389.5 711.5 C 1384 713, 1379 713.5, 1374 713.5 Z"
            fill={P.stone}
          />
          <ellipse
            cx="1364"
            cy="634"
            rx="30"
            ry="3.8"
            fill={P.stone}
            stroke={P.charcoal}
            strokeWidth={1.25}
          />
        </g>
      </SceneSvgLayer>
    </div>
  );
}
