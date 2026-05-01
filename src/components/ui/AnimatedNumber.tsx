"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  /** Format the (currently-animating) numeric value for display. */
  formatter?: (n: number) => string;
  /** Tween duration in ms. */
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  /** ARIA: announce the *target* value, not every intermediate frame. */
  ariaLabel?: string;
};

const defaultFormatter = (n: number) => n.toFixed(2);

/**
 * Smoothly animates between numeric values whenever `value` changes. Uses
 * requestAnimationFrame + easeOutCubic over `duration` ms. The very first
 * mount snaps to the target so we don't count up from 0 on page load.
 *
 * If a new `value` arrives mid-tween, the next animation starts from the
 * currently-displayed value (not the previous starting value), so rapid
 * successive updates stay visually continuous instead of jumping.
 */
export function AnimatedNumber({
  value,
  formatter = defaultFormatter,
  duration = 400,
  className,
  style,
  ariaLabel,
}: Props) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  // Keep the ref in sync with whatever React just rendered, so the next
  // `value` change can read the *current* on-screen number.
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    // Skip animation on initial mount — snap to the value as-is.
    if (!mountedRef.current) {
      mountedRef.current = true;
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    if (value === displayRef.current) return;

    // Restart any in-flight tween from the currently-displayed value so the
    // motion stays continuous through rapid updates.
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const to = value;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [value, duration]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <span className={className} style={style} aria-label={ariaLabel}>
      {formatter(display)}
    </span>
  );
}

/** Convenience: $X,XXX.XX */
export const formatCurrency = (decimals = 2) => (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** Convenience: signed $±X,XXX.XX (sign preserved through the tween). */
export const formatSignedCurrency = (decimals = 2) => (n: number) =>
  `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** Convenience: signed ±X.XX% */
export const formatSignedPercent = (decimals = 2) => (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
