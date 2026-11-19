# Limited 3D doorway milestone

## Scope

After a visitor enters a non-blank name, chooses a character, and presses the
**same original CTA**, native scrolling can continue into a double-door opening
and a short first-person camera move. The view stops **12 cm inside the
threshold**, not inside a complete walkable office.

The office-reference image informs the composition: double doors, clean
architectural outlines, a few desks/chairs, glazing lines, a gallery-edge fragment,
and five partial stair treads. There are **no people**, avatars, image cutouts,
textures, PBR finishes, realistic lighting, or material-reveal stage in the new
3D scene. The existing 2D Hero and its named movable source layers remain intact.

## Reference repository

Inspected:
https://github.com/codetic061-art/apartment-3d-plan

Relevant patterns were its separate line geometry, hinged `Group.rotation.y`
door pivots (`js/doors.js`), and scroll-driven perspective-camera rig
(`js/rig.js`, `js/main.js`). This implementation does not import that apartment's
floor plan, full environment, texture assets, Lenis, collision system, orbit
controls, or first-person input system. The office entrance is purpose-built from
simple geometry for this milestone.

## Rendering

`createDoorwayScene.ts` uses actual Three.js scene geometry, two opposite Y-axis
hinge pivots, and a perspective camera. **SVGRenderer**, rather than WebGL, projects
the scene to crisp CAD-style vector strokes. It is not a static screenshot or
CSS-only door rotation. No GPU/WebGL support or shader compilation is required.

The palette is the existing #F4F2ED paper, #292B2E outlines, and a restrained
#4257F5 desk-detail accent. Unlit paper-colored planes/door faces are occlusion
masks, not textured/shaded architectural finishes. Painter ordering keeps
interior strokes behind these masks and door outlines in front.

Interior strokes reveal progressively, including a partially drawn current edge.
SVGRenderer's Projector does not honor WebGL `drawRange`, so a progressively
expanded index prefix controls visible segments. The camera and door positions
are deterministic functions of one GSAP-controlled progress value. The camera's
starting projection is fitted to the actual existing SVG door rectangles before
the 2D/3D crossfade. Portrait screens use a wider lens to keep furniture visible.

Rendering is on demand for timeline updates and resize, with no perpetual render
loop. The Three.js/renderer/model module loads only after successful validation,
in a separate bundle. Observers, SVG nodes, geometries, materials, and timeline
extensions are cleaned up on back/unmount and media-preference changes.

## One coordinated, gated timeline

Before validation, the existing 0–10 Hero/selection sequence and its 400% desktop /
380% mobile range are unchanged. The user cannot scroll into the new stage first.

Once the scene is ready, the same pinned ScrollTrigger/timeline gains:

- `entrance` (10): cards/input and the unchanged CTA fade away.
- 10.45–11.3: crossfade from the existing 2D office to its fitted 3D doorway.
- `doorOpen` (10.8–18): a single progress driver controls opposite hinge rotations,
  progressive line construction, then the forward camera translation.
- `threshold` (18): doors reach 101 degrees and the camera stops at z = −0.12 m.

The scroll range increases by 1.8× only after validation (720% desktop / 684%
mobile overall), keeping pixels per original timeline unit unchanged. There is
no second pin, wheel interception, custom scroll container, or competing camera
animation. Up-scrolling closes the doors, erases the CAD reveal, restores the
selection interface, and can return all the way to the Hero.

**Back to selection** removes the extension, restores the original range, disposes
the 3D scene, and preserves the native form values. Reduced-motion and short
landscape layouts show a static open-door preview in ordinary document flow
without pinning. Live preference changes are supported.

## Interaction and limitations

- A character choice is still required, but no selected character is placed inside.
- The original button text/style/size are unchanged; “Let's go” refers to this
  existing confirmation action, not a duplicate CTA or new route.
- A failed module download restores the usable selection UI and offers **Reload
  page**. This is a deliberate recovery path because browsers cache failed ES
  module imports. Reload starts a fresh, non-persistent flow.
- Refresh does not persist/automatically authorize 3D entry. No form values or
  visitor details are sent to a backend or stored across visits.
- This is a vector-projected 3D entrance preview, not a finished WebGL game,
  editable native Figma 3D scene, booking system, full office tour, or free roam.

## Checks

The browser suite covers unchanged Hero/CTA geometry, delayed-logo positioning,
named 2D scene layers, validation/gating, lazy loading, door angles, progressive
stroke counts, first-person camera position, reverse scrolling, viewport changes,
back/re-entry cleanup, live reduced motion, static short-landscape preview,
module-load failure/reload recovery, and refresh without stale 3D state.

Headless Chromium screenshots are inspected at the closed, opening, and threshold
states on desktop and mobile. Physical devices, Safari, and Firefox are not
verified. The existing Vite >500 kB main-chunk warning remains; the new Three.js
scene is split into a separate lazy-loaded chunk.
