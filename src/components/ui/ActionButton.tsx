"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// The hero action buttons (Buy/Sell, Deposit/Withdraw). `positive` is the
// brand-green money-in / long side; `negative` is the red money-out / short
// side. Both get a gradient fill, a colour-matched glow that swells on hover,
// a top sheen, and a tactile lift/press so they read as real, pressable chips.
const GRADIENT: Record<Variant, string> = {
  positive:
    "linear-gradient(135deg, color-mix(in srgb, var(--brand) 78%, #fff) 0%, var(--brand) 52%, color-mix(in srgb, var(--brand) 84%, #000) 100%)",
  negative:
    "linear-gradient(135deg, color-mix(in srgb, #FF5000 90%, #fff) 0%, #FF5000 52%, color-mix(in srgb, #FF5000 80%, #000) 100%)",
};

const GLOW: Record<Variant, string> = {
  positive: "color-mix(in srgb, var(--brand) 55%, transparent)",
  negative: "color-mix(in srgb, #FF5000 55%, transparent)",
};

type Variant = "positive" | "negative";

type Props = {
  variant: Variant;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
};

export function ActionButton({
  variant,
  children,
  onClick,
  disabled,
  type = "button",
  className,
  ...rest
}: Props) {
  const positive = variant === "positive";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      {...rest}
      style={
        {
          backgroundImage: GRADIENT[variant],
          color: positive ? "#000" : "#fff",
          // Consumed by the arbitrary shadow utilities below.
          "--glow": GLOW[variant],
        } as CSSProperties
      }
      className={cn(
        "group relative h-12 rounded-xl overflow-hidden select-none",
        "inline-flex items-center justify-center gap-2",
        "text-sm font-bold uppercase tracking-widest",
        "shadow-[0_5px_16px_-8px_var(--glow),inset_0_1px_0_rgba(255,255,255,0.35)]",
        "transition-[transform,box-shadow,filter] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:brightness-[1.04]",
        "hover:shadow-[0_14px_30px_-8px_var(--glow),inset_0_1px_0_rgba(255,255,255,0.5)]",
        "active:translate-y-0 active:scale-[0.985] active:brightness-95",
        "active:shadow-[0_3px_10px_-6px_var(--glow),inset_0_1px_0_rgba(255,255,255,0.3)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/40",
        "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none disabled:saturate-[0.65]",
        className,
      )}
    >
      {/* Top sheen — brightens on hover for a glassy, lit-from-above finish. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent opacity-70 transition-opacity group-hover:opacity-100"
      />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
