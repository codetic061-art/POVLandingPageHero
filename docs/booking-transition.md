# Hero → character selection

The existing `PopButton` and architectural/character assets are reused. Its source
and appearance are unchanged. At 1440 × 900, the original CTA was measured in
Chromium as 216.984375 × 48.171875 px at (611.5078125, 509.71875). It uses the
existing responsive padding/type, #4257F5 fill, #F4F2ED text, 2px #292B2E border,
12px radius, Plus Jakarta Sans 600, uppercase tracking, and three-part pop shadow.
Only its **outer positioning wrapper** is animated. A measured anchor inside the
brand composition controls its initial position. The Hero spacing refinement
raises the logo/slogan by 24–40px and gives the CTA a responsive 56–84px gap below
the slogan, putting the button slightly lower without altering the button itself.
The logo's intrinsic width/height reserve its space before the image loads. The
CTA's `fromTo` start renders immediately, so ScrollTrigger remeasures that anchor
on refresh even before `buttonMove` begins. This prevents the button from retaining
a pre-image-load or pre-resize position above the slogan at scroll zero.

## Animation

`PinnedBookingExperience` registers GSAP, ScrollTrigger, and useGSAP. One scoped,
scrubbed timeline pins the scene for 400% of viewport height (380% on mobile),
about 43–46% more scrolling than the previous version for a gentler pace.
Labels use a normalized ten-unit timeline:

- `heroExit` (0): original left/right cutouts and their shadows exit horizontally;
  the original transparent logo and slogan travel up.
- `buttonMove` (0.6): the sole CTA wrapper travels from the Hero anchor to the
  unchanged slot below the cards, using sine-in/out easing to avoid a sharp
  mid-transition acceleration. Neither the button nor its ancestors are camera-scaled.
- `cameraPush` (1.4): only the office wrapper scales. Its transform origin is
  calculated from the actual doorway SVG bounding box. A small vertical translation
  centers that focal point in the viewport; there is no rotation or door animation.
- `bookingReveal` (5.4): name field comes from above; front-facing SVG figures on
  glass cards come from opposite sides.
- `bookingReady` (8.2): all controls are in place; the last 18% holds that layout.

After a valid selection, the same timeline gains a gated eight-unit doorway
continuation (10–18). Its scroll range expands proportionally, preserving the
existing Hero/selection timing and positions. See [the doorway milestone](./doorway-transition.md).

`invalidateOnRefresh`, function-based measurements, font/image refreshes, and
GSAP's resize handling recalculate the layout. Normalized scene progress is
preserved across viewport changes, including mobile browser scroll rescaling.
MatchMedia and useGSAP revert the
timeline, pin, listeners, and inline animation styles during cleanup/StrictMode.
There are no wheel listeners or custom scroll containers.

Portrait layouts crop the existing room, not the interface, so the central doorway
remains legible. Reduced motion and short landscape viewports use ordinary
document flow: the Hero, form, then the same CTA. Neither fallback creates a pin.

## Interaction boundary

Hidden booking controls are inert until the reveal finishes. The name input has a
real label, autocomplete, required/whitespace validation, and a length limit. The
cards are native radios inside a fieldset: Tab, arrow keys, Space, and pointer/touch
selection work without a custom keyboard implementation. Selection survives
scroll reversal and resizing. Back-scrolling out of a focused form returns focus
to the visible CTA without scrolling the page.

The CTA in the Hero is an accessible shortcut to the completed selection screen.
At the final screen it submits the same form, validates locally, and loads the
limited 3D doorway preview. It does not create a booking. `onContinue(details)`
remains an optional integration callback; the current app does not supply it.
There is no storage, network submission, new route, or backend. Existing navigation
labels/links and their original prevent-default behavior are preserved.

## Verification

Use the already-running Vite server; these tests never start another one.

```sh
pnpm run build
pnpm exec tsc --noEmit
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:browser
```

Set `PLAYWRIGHT_BASE_URL` if the host is not on the default port 3000. On other
machines, omit the executable override and use an installed Playwright Chromium.
Playwright is a development-only testing dependency, not an animation library.

The browser suite covers desktop, tablet, and mobile sizes: initial CTA metrics,
pinning, intermediate/reverse animation, independent background scaling, closed
doors, single-button identity/style, keyboard/pointer selection, native validation,
local-only confirmation, refresh at the bottom, resize, 320px layout, live reduced
motion switching, short-landscape fallback, overflow, and runtime errors.
This repository has no configured lint command or pre-existing test suite.

### Results for this implementation

- `pnpm run build`: passed; Vite reports a >500 kB chunk warning in the host's
  `NODE_ENV=development` build environment.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run format --check` on all changed source/config/documentation files:
  passed.
- Standalone host `figma-oxlint` on the seven changed TS/TSX source, test, and
  configuration files: passed with no warnings or errors. This is a targeted
  check, not a claim that the repository has a configured lint script.
- `pnpm run test:browser` with system Chromium: all 33 tests passed across the
  three viewport projects.
- Headless Chromium screenshots were inspected at initial, intermediate, final,
  and reduced-motion states. Native wheel scrolling reached the final state and
  returned to the initial Hero at desktop, 390px, and 320px widths.

Firefox, Safari, physical touch devices, and real mobile software keyboards were
not tested. The original `PopButton.tsx`, palette, room vector geometry, and all
original image assets are unchanged. The room's DOM structure is now layered as
described below.

## Editable scene layers for Figma Design

The old single room SVG and SVG-embedded character images have been separated
without redrawing the artwork:

- Four original transparent PNGs are now four native HTML image elements. The
  standing/lounge pairs remain pairs within their source image; this does not
  turn raster images into editable vector people or separate an occluded pair.
- The left planter, right planter, pendant lamp, shelf/books/small plant, notes,
  framed art, doorway, walls, floor/background, and baseboards have separate SVG
  roots with their own bounds and descriptive names.
- The logo, slogan, navigation elements, and original CTA retain independent HTML
  elements and now have descriptive `data-name` labels.
- Contact shadows are separate layers. Only the two HTML exit-group wrappers
  receive the character animation; their pixel translations are converted from
  the original 1600 × 900 coordinates to preserve the existing scroll movement.

`SceneLayer.tsx` maps the original illustration coordinates to independent,
positioned SVG/image bounds. It is not a canvas renderer or a screenshot layer.
The browser suite checks that these are separate roots/native images and that
moving one image or planter does not move the other objects.

### Transfer to Figma Design

1. In the Make preview, return to the Hero (or scroll to the desired state).
2. Choose **Edit → Copy designs → Whole page**.
3. Paste into a Figma Design file and expand the resulting groups in **Layers**.

Copy designs captures the current preview state, not the live GSAP timeline.
Names/grouping in the native Figma result depend on Figma's conversion. The code
now supplies separate objects rather than one combined room/character SVG, but
native Design-layer conversion and exact layer naming could not be verified
from this coding environment. No Figma Design file has been created or modified.

Workflow reference:
https://help.figma.com/hc/en-us/articles/35060759685015-Copy-a-Figma-Make-preview-as-design-layers
