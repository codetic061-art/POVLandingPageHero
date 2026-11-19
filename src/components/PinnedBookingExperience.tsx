import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { PopButton } from "./PopButton";
import { ArchitecturalRoom } from "./illustrations/ArchitecturalRoom";
import { CharacterCutouts } from "./illustrations/CharacterCutouts";
import { BookingSelection, type BookingDetails } from "./BookingSelection";
import { DoorwayEntrance } from "./entrance/DoorwayEntrance";
import type { AtriumSceneApi, AtriumViewMode } from "./entrance/types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface PinnedBookingExperienceProps {
  children: ReactNode;
  /** The next milestone can consume validated details without coupling this scene to a route. */
  onContinue?: (details: BookingDetails) => void;
}

export function PinnedBookingExperience({ children, onContinue }: PinnedBookingExperienceProps) {
  const scope = useRef<HTMLElement>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const bookingActive = useRef(false);
  const formId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [entryDetails, setEntryDetails] = useState<BookingDetails | null>(null);
  const [entryReady, setEntryReady] = useState(false);
  const [viewMode, setViewMode] = useState<AtriumViewMode>("orbit");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [entryFailed, setEntryFailed] = useState(false);
  const detailsRef = useRef<BookingDetails | null>(null);
  const sceneRef = useRef<AtriumSceneApi | null>(null);
  const entryUnlocked = useRef(false);
  const activateEntry = useRef<((scene: AtriumSceneApi) => void) | null>(null);
  const resetEntry = useRef<(() => void) | null>(null);

  const handleSceneReady = useCallback((scene: AtriumSceneApi) => {
    sceneRef.current = scene;
    setEntryReady(true);
    setViewMode(scene.getMode());
    activateEntry.current?.(scene);
  }, []);

  const handleSceneError = useCallback(() => {
    resetEntry.current?.();
    sceneRef.current = null;
    detailsRef.current = null;
    setEntryReady(false);
    setEntryDetails(null);
    setEntryFailed(true);
    setConfirmation("The 3D atrium could not load. Reload to try again.");
  }, []);

  const returnToSelection = useCallback(() => {
    resetEntry.current?.();
    sceneRef.current = null;
    detailsRef.current = null;
    setEntryReady(false);
    setViewMode("orbit");
    setEntryDetails(null);
    setEntryFailed(false);
    setConfirmation("");
    scope.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({
      preventScroll: true,
    });
    if (!trigger.current) {
      scope.current
        ?.querySelector("form")
        ?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);

  useGSAP(
    () => {
      const root = scope.current!;
      const stage = root.querySelector<HTMLElement>(".experience-stage")!;
      const camera = root.querySelector<HTMLElement>(".office-camera")!;
      const door = root.querySelector<SVGGraphicsElement>("#central-architectural-door")!;
      const cta = root.querySelector<HTMLElement>(".experience-cta")!;
      const anchor = root.querySelector<HTMLElement>(".hero-cta-anchor")!;
      const target = root.querySelector<HTMLElement>(".booking-cta-target")!;
      const booking = root.querySelector<HTMLFormElement>(".booking-interface")!;
      const brand = root.querySelector<HTMLElement>(".hero-brand-composition")!;
      const entrance = root.querySelector<HTMLElement>(".entrance-overlay")!;
      const media = gsap.matchMedia();

      function setBookingAvailable(available: boolean) {
        bookingActive.current = available;
        root.dataset.bookingReady = String(available);
        booking.inert = !available;
        booking.setAttribute("aria-hidden", String(!available));
        brand.setAttribute("aria-hidden", String(available));
        if (!available && !entryUnlocked.current && booking.contains(document.activeElement)) {
          cta.querySelector("button")?.focus({ preventScroll: true });
        }
      }

      media.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
          compact: "(max-height: 560px) and (min-aspect-ratio: 4/3)",
        },
        (context) => {
          if (context.conditions!.reduced || context.conditions!.compact) {
            setReducedMotion(Boolean(context.conditions!.reduced));
            // CSS puts the form and the original CTA in normal document flow.
            setBookingAvailable(true);
            brand.removeAttribute("aria-hidden");
            activateEntry.current = (scene) => {
              entryUnlocked.current = true;
              root.dataset.entranceUnlocked = "true";
              root.dataset.entranceActive = "true";
              scene.setDoorProgress(1);
              scene.resize();
              setConfirmation(`${detailsRef.current?.name}, welcome to the 3D office atrium.`);
              entrance.scrollIntoView({ block: "start", behavior: "instant" });
            };
            resetEntry.current = () => {
              entryUnlocked.current = false;
              root.dataset.entranceUnlocked = "false";
              root.dataset.entranceActive = "false";
              setBookingAvailable(true);
            };
            if (sceneRef.current && detailsRef.current) activateEntry.current(sceneRef.current);
            return () => {
              activateEntry.current = null;
              resetEntry.current = null;
            };
          }

          setReducedMotion(false);
          entryUnlocked.current = false;
          root.dataset.entranceUnlocked = "false";
          root.dataset.entranceActive = "false";
          setBookingAvailable(false);
          const relativeY = (element: HTMLElement) =>
            element.getBoundingClientRect().top - root.getBoundingClientRect().top;

          const geometry = () => {
            const box = door.getBBox();
            const ratio = stage.clientWidth / 1600;
            const originX = (box.x + box.width / 2) * ratio;
            const originY = (box.y + box.height / 2) * ratio;
            return {
              originX,
              originY,
              scale: Math.min(
                2.6,
                Math.max(
                  1.25,
                  (root.clientHeight * 0.9) / (box.height * ratio),
                  (root.clientWidth * 0.66) / (box.width * ratio),
                ),
              ),
              y: root.clientHeight / 2 - (relativeY(stage) + originY),
            };
          };

          const setCameraOrigin = () => {
            const { originX, originY } = geometry();
            gsap.set(camera, { transformOrigin: `${originX}px ${originY}px` });
          };
          setCameraOrigin();
          // Keep centering percentage-based as the untouched button responsively resizes.
          gsap.set(cta, { x: 0, xPercent: -50 });

          let viewport = { width: window.innerWidth, height: window.innerHeight };
          let settledProgress = 0;
          let resizeProgress: number | null = null;
          let refreshing = false;
          const timeline = gsap.timeline({
            defaults: { ease: "power1.inOut" },
            scrollTrigger: {
              trigger: root,
              start: "top top",
              end: () => `+=${root.clientWidth < 640 ? 380 : 400}%`,
              pin: true,
              scrub: true,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onRefreshInit: () => {
                refreshing = true;
                const next = { width: window.innerWidth, height: window.innerHeight };
                if (next.width !== viewport.width || next.height !== viewport.height) {
                  resizeProgress = settledProgress;
                  viewport = next;
                }
                setCameraOrigin();
              },
              onRefresh: (self) => {
                // Mobile browsers can rescale scrollY on orientation/width changes.
                // Keep the same scene phase, but never intercept ordinary scrolling.
                if (resizeProgress !== null) {
                  const progress = resizeProgress;
                  resizeProgress = null;
                  self.scroll(self.start + progress * (self.end - self.start));
                  self.update();
                }
                settledProgress = self.progress;
                refreshing = false;
                updateAvailability(self);
                sceneRef.current?.resize();
              },
              onUpdate: (self) => {
                if (
                  !refreshing &&
                  window.innerWidth === viewport.width &&
                  window.innerHeight === viewport.height
                ) {
                  settledProgress = self.progress;
                }
                updateAvailability(self);
              },
            },
          });
          trigger.current = timeline.scrollTrigger!;

          timeline
            .addLabel("heroExit", 0)
            .to(
              '[data-character-side="left"]',
              { x: () => (-1700 * stage.clientWidth) / 1600, opacity: 0, duration: 3.2 },
              "heroExit",
            )
            .to(
              '[data-character-side="right"]',
              { x: () => (1700 * stage.clientWidth) / 1600, opacity: 0, duration: 3.2 },
              "heroExit",
            )
            .to(
              "[data-hero-brand]",
              { y: () => -root.clientHeight * 0.8, opacity: 0, duration: 3.4 },
              "heroExit",
            )
            .addLabel("buttonMove", 0.6)
            .fromTo(
              cta,
              { y: () => relativeY(anchor) },
              {
                y: () => relativeY(target),
                duration: 7.6,
                ease: "sine.inOut",
                // Re-measure the start even before buttonMove, including refreshes at scroll 0.
                immediateRender: true,
              },
              "buttonMove",
            )
            .addLabel("cameraPush", 1.4)
            .fromTo(
              camera,
              { scale: 1, y: 0 },
              { scale: () => geometry().scale, y: () => geometry().y, duration: 6.2, ease: "none" },
              "cameraPush",
            )
            .addLabel("bookingReveal", 5.4)
            .fromTo(
              "[data-booking-name]",
              { y: -64, autoAlpha: 0 },
              { y: 0, autoAlpha: 1, duration: 1.6 },
              "bookingReveal",
            )
            .fromTo(
              '[data-booking-card="male"]',
              {
                x: (_index, element: HTMLElement) =>
                  -(booking.offsetLeft + element.offsetLeft + element.offsetWidth + 24),
                autoAlpha: 0,
              },
              { x: 0, autoAlpha: 1, duration: 2.2 },
              "bookingReveal+=0.6",
            )
            .fromTo(
              '[data-booking-card="female"]',
              {
                x: (_index, element: HTMLElement) =>
                  root.clientWidth - (booking.offsetLeft + element.offsetLeft) + 24,
                autoAlpha: 0,
              },
              { x: 0, autoAlpha: 1, duration: 2.2 },
              "bookingReveal+=0.6",
            )
            .addLabel("bookingReady", 8.2)
            .to({}, { duration: 1.8 });

          function updateAvailability(self: ScrollTrigger) {
            const time = self.animation?.time() ?? 0;
            const available = !entryUnlocked.current && time >= 8.2 - 0.001 && time <= 10.001;
            if (available !== bookingActive.current) setBookingAvailable(available);
            root.dataset.entranceActive = String(entryUnlocked.current);
            brand.setAttribute("aria-hidden", String(time >= 3.4));
          }

          const entryContext = gsap.context(() => {}, root);
          const blockPinnedWheel = (event: WheelEvent) => {
            if (entryUnlocked.current) {
              event.preventDefault();
            }
          };
          entrance.addEventListener("wheel", blockPinnedWheel, { passive: false });

          activateEntry.current = (scene) => {
            if (entryUnlocked.current) {
              scene.resize();
              return;
            }
            entryContext.add(() => {
              const self = timeline.scrollTrigger!;
              self.scroll(self.end);
              self.update();
              entryUnlocked.current = true;
              root.dataset.entranceUnlocked = "true";
              root.dataset.entranceActive = "true";
              setBookingAvailable(false);
              gsap.to([booking, cta, camera], { autoAlpha: 0, duration: 0.45, ease: "power2.out" });
              gsap.fromTo(
                entrance,
                { autoAlpha: 0 },
                { autoAlpha: 1, duration: 0.5, ease: "power2.out" },
              );
              scene.resize();
              scene.animateDoorsOpen(820);
              setConfirmation(`${detailsRef.current?.name}, welcome to the 3D office atrium.`);
              root
                .querySelector<HTMLButtonElement>(".entrance-back")
                ?.focus({ preventScroll: true });
            });
          };
          resetEntry.current = () => {
            entryContext.revert();
            entryUnlocked.current = false;
            root.dataset.entranceUnlocked = "false";
            root.dataset.entranceActive = "false";
            gsap.set([booking, cta, camera], { clearProps: "opacity,visibility" });
            gsap.set(entrance, { clearProps: "opacity,visibility" });
            ScrollTrigger.refresh();
            const self = timeline.scrollTrigger!;
            self.scroll(self.end);
            self.update();
            setBookingAvailable(true);
          };
          if (sceneRef.current && detailsRef.current) activateEntry.current(sceneRef.current);

          let alive = true;
          let refreshFrame = 0;
          const refresh = () => {
            cancelAnimationFrame(refreshFrame);
            refreshFrame = requestAnimationFrame(() => {
              if (alive) ScrollTrigger.refresh();
            });
          };
          const images = Array.from(root.querySelectorAll("img, image"));
          images.forEach((image) => image.addEventListener("load", refresh));
          void document.fonts.ready.then(() => {
            if (alive) refresh();
          });

          return () => {
            alive = false;
            cancelAnimationFrame(refreshFrame);
            entrance.removeEventListener("wheel", blockPinnedWheel);
            images.forEach((image) => image.removeEventListener("load", refresh));
            trigger.current = null;
            activateEntry.current = null;
            resetEntry.current = null;
          };
        },
      );

      return () => {
        media.revert();
        delete root.dataset.bookingReady;
        booking.inert = false;
        booking.removeAttribute("aria-hidden");
        brand.removeAttribute("aria-hidden");
        delete root.dataset.entranceUnlocked;
        delete root.dataset.entranceActive;
      };
    },
    { scope },
  );

  return (
    <main ref={scope} className="booking-experience" id="top">
      {children}
      <div className="experience-hero">
        <div className="experience-stage">
          <div className="office-camera">
            <ArchitecturalRoom />
          </div>
          <CharacterCutouts />

          <div className="hero-brand-composition">
            <img
              data-hero-brand
              data-name="Brand / POV logo"
              src="/pov-logo.png"
              alt="POV logo"
              width={568}
              height={365}
              className="h-auto w-[54%] max-w-[258px] min-w-[156px] object-contain"
              draggable={false}
            />
            <h1
              data-hero-brand
              data-name="Brand / Slogan"
              className="mt-[2.2%] whitespace-nowrap font-normal tracking-[-0.018em] text-[#292B2E]"
              style={{ fontSize: "clamp(1.12rem, 1.78vw, 1.82rem)", lineHeight: 1.2 }}
            >
              We design experiences.
            </h1>
            <span className="hero-cta-anchor" aria-hidden="true" />
          </div>
        </div>
      </div>

      <BookingSelection
        formId={formId}
        onEdit={() => {
          setEntryFailed(false);
          if (detailsRef.current) returnToSelection();
          else setConfirmation("");
        }}
        onSubmit={(details) => {
          if (detailsRef.current) return;
          detailsRef.current = details;
          setEntryDetails(details);
          setEntryReady(false);
          setViewMode("orbit");
          setEntryFailed(false);
          setConfirmation(`Preparing the 3D atrium for you, ${details.name}…`);
          onContinue?.(details);
        }}
      />

      <div className="experience-cta" data-name="CTA / Let's Get Started!">
        <PopButton
          type="submit"
          form={formId}
          onClick={(event) => {
            if (bookingActive.current) return;
            event.preventDefault();
            if (trigger.current) {
              // Native scrolling drives the same timeline; no second animation competes with it.
              window.scrollTo({ top: trigger.current.end, behavior: "instant" });
              ScrollTrigger.update();
              scope.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({
                preventScroll: true,
              });
            }
          }}
        >
          Let&apos;s Get Started!
        </PopButton>
        <p className="booking-confirmation" role="status" aria-live="polite">
          {confirmation}
          {entryFailed && (
            <>
              {" "}
              <button
                type="button"
                className="cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
            </>
          )}
        </p>
      </div>

      <div
        className="entrance-overlay"
        data-name="3D office atrium"
        aria-hidden={!entryDetails}
      >
        {entryDetails && (
          <DoorwayEntrance
            reducedMotion={reducedMotion}
            onModeChange={setViewMode}
            onReady={handleSceneReady}
            onError={handleSceneError}
          />
        )}
      </div>
      {entryDetails && (
        <div className="entrance-controls" data-name="Atrium / Controls">
          <button className="entrance-back" type="button" onClick={returnToSelection}>
            Back to selection
          </button>
          <div className="atrium-mode-toolbar" role="toolbar" aria-label="3D viewing modes">
            <button
              type="button"
              className="atrium-mode-btn"
              aria-pressed={viewMode === "orbit"}
              disabled={!entryReady}
              onClick={() => sceneRef.current?.setMode("orbit")}
            >
              3D Orbit
            </button>
            <button
              type="button"
              className="atrium-mode-btn"
              aria-pressed={viewMode === "firstPerson"}
              disabled={!entryReady}
              onClick={() => sceneRef.current?.setMode("firstPerson")}
            >
              First Person
            </button>
            <button
              type="button"
              className="atrium-reset-btn"
              disabled={!entryReady}
              onClick={() => sceneRef.current?.resetView()}
            >
              Reset view
            </button>
          </div>
          <p className="entrance-hint">
            {!entryReady ? (
              "Preparing 3D atrium…"
            ) : viewMode === "orbit" ? (
              "360° Orbit · Drag to rotate · Scroll to zoom"
            ) : (
              "First Person · 1.60 m eye · WASD / Arrows + drag look"
            )}
          </p>
        </div>
      )}
    </main>
  );
}
