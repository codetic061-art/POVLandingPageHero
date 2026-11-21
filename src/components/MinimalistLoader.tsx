import { useLayoutEffect, useRef, useState } from "react";

export interface MinimalistLoaderProps {
  visible: boolean;
  /** Semantic context for screen readers ("3D office world" | "Virtual meeting room"). */
  contextLabel?: string;
}

interface TimeLapseLine {
  leftPct: number;
  heightVh: number;
  durationSec: number;
  delaySec: number;
  opacity: number;
  widthPx: number;
  mobileHide?: boolean;
}

// Deterministic varied thin vertical time-lapse strokes (strictly monochrome charcoal/black)
const TIMELAPSE_LINES: readonly TimeLapseLine[] = [
  { leftPct: 4.5, heightVh: 22, durationSec: 0.72, delaySec: -0.15, opacity: 0.24, widthPx: 1 },
  { leftPct: 9.2, heightVh: 32, durationSec: 0.96, delaySec: -0.62, opacity: 0.38, widthPx: 1.5, mobileHide: true },
  { leftPct: 14.0, heightVh: 16, durationSec: 0.62, delaySec: -0.34, opacity: 0.28, widthPx: 1 },
  { leftPct: 19.5, heightVh: 28, durationSec: 0.84, delaySec: -0.78, opacity: 0.18, widthPx: 1, mobileHide: true },
  { leftPct: 24.8, heightVh: 36, durationSec: 1.08, delaySec: -0.22, opacity: 0.34, widthPx: 1.5 },
  { leftPct: 30.2, heightVh: 18, durationSec: 0.66, delaySec: -0.51, opacity: 0.20, widthPx: 1, mobileHide: true },
  { leftPct: 35.6, heightVh: 26, durationSec: 0.88, delaySec: -0.09, opacity: 0.15, widthPx: 1 },
  { leftPct: 41.0, heightVh: 14, durationSec: 0.58, delaySec: -0.44, opacity: 0.14, widthPx: 1, mobileHide: true },
  { leftPct: 46.4, heightVh: 20, durationSec: 0.78, delaySec: -0.69, opacity: 0.12, widthPx: 1, mobileHide: true },
  { leftPct: 53.8, heightVh: 22, durationSec: 0.74, delaySec: -0.27, opacity: 0.12, widthPx: 1, mobileHide: true },
  { leftPct: 59.4, heightVh: 15, durationSec: 0.61, delaySec: -0.55, opacity: 0.15, widthPx: 1, mobileHide: true },
  { leftPct: 64.6, heightVh: 30, durationSec: 0.92, delaySec: -0.14, opacity: 0.17, widthPx: 1 },
  { leftPct: 70.0, heightVh: 19, durationSec: 0.68, delaySec: -0.82, opacity: 0.24, widthPx: 1, mobileHide: true },
  { leftPct: 75.4, heightVh: 34, durationSec: 1.04, delaySec: -0.37, opacity: 0.36, widthPx: 1.5 },
  { leftPct: 80.8, heightVh: 24, durationSec: 0.80, delaySec: -0.64, opacity: 0.20, widthPx: 1, mobileHide: true },
  { leftPct: 86.2, heightVh: 17, durationSec: 0.64, delaySec: -0.19, opacity: 0.30, widthPx: 1 },
  { leftPct: 91.0, heightVh: 29, durationSec: 0.94, delaySec: -0.48, opacity: 0.40, widthPx: 1.5, mobileHide: true },
  { leftPct: 95.6, heightVh: 21, durationSec: 0.71, delaySec: -0.31, opacity: 0.26, widthPx: 1 },
];

/**
 * Full-screen minimalist black-and-white animated loading experience.
 * Features thin upward vertical time-lapse lines and lowercase "loading" typography
 * where the detached dot of "i" arcs over to "l" and back with squash-and-stretch
 * compression/rebound on both letters.
 */
export function MinimalistLoader({
  visible,
  contextLabel = "3D experience",
}: MinimalistLoaderProps) {
  const wordRef = useRef<HTMLDivElement>(null);
  const letterLRef = useRef<HTMLSpanElement>(null);
  const letterIRef = useRef<HTMLSpanElement>(null);
  const [dotMetrics, setDotMetrics] = useState({
    startX: 0,
    jumpDx: -120,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      const word = wordRef.current;
      const elL = letterLRef.current;
      const elI = letterIRef.current;
      if (!word || !elL || !elI) return;
      const wRect = word.getBoundingClientRect();
      const lRect = elL.getBoundingClientRect();
      const iRect = elI.getBoundingClientRect();
      const iCenter = iRect.left - wRect.left + iRect.width * 0.5;
      const lCenter = lRect.left - wRect.left + lRect.width * 0.5;
      setDotMetrics({
        startX: iCenter,
        jumpDx: lCenter - iCenter,
        ready: true,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (wordRef.current) ro.observe(wordRef.current);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [visible]);

  return (
    <div
      className={`pov-loader ${visible ? "is-visible" : ""}`}
      data-name="Minimalist / Loading screen"
      data-loader-visible={String(visible)}
      role="status"
      aria-live="polite"
      aria-label={visible ? `Loading ${contextLabel}` : undefined}
      aria-hidden={!visible}
    >
      {/* Rapid upward monochromatic vertical time-lapse strokes */}
      <div className="pov-loader-lines" aria-hidden="true">
        {TIMELAPSE_LINES.map((line, idx) => (
          <span
            key={idx}
            className={`pov-loader-line ${line.mobileHide ? "pov-loader-line-desktop" : ""}`}
            style={
              {
                left: `${line.leftPct}%`,
                height: `${line.heightVh}vh`,
                width: `${line.widthPx}px`,
                opacity: line.opacity,
                animationDuration: `${line.durationSec}s`,
                animationDelay: `${line.delaySec}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Centered signature "loading" wordmark with jumping i-dot & squash-rebound letters */}
      <div
        ref={wordRef}
        className={`pov-loader-word ${dotMetrics.ready ? "is-measured" : ""}`}
        style={
          {
            "--dot-start-x": `${dotMetrics.startX.toFixed(2)}px`,
            "--dot-jump-x": `${dotMetrics.jumpDx.toFixed(2)}px`,
          } as React.CSSProperties
        }
      >
        <span ref={letterLRef} className="pov-loader-glyph pov-loader-l">
          l
        </span>
        <span className="pov-loader-glyph">o</span>
        <span className="pov-loader-glyph">a</span>
        <span className="pov-loader-glyph">d</span>
        {/* Unicode dotless i (\u0131) so the animated dot travels cleanly between i and l */}
        <span ref={letterIRef} className="pov-loader-glyph pov-loader-i">
          {"\u0131"}
        </span>
        <span className="pov-loader-glyph">n</span>
        <span className="pov-loader-glyph">g</span>

        <span className="pov-loader-dot-track" aria-hidden="true">
          <span className="pov-loader-dot-arc">
            <span className="pov-loader-dot" />
          </span>
        </span>
      </div>
    </div>
  );
}
