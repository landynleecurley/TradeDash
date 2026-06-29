"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

/**
 * Small info affordance: an (i) icon that reveals a short description on hover
 * (desktop) or tap/click (mobile, since the trigger is also a button). Lets the
 * UI stay text-light while the explanation is one interaction away.
 *
 * Accessible: the trigger is labelled with the description, so screen readers
 * get the text without needing to open the popup.
 */
export function InfoHint({
  label,
  side = "top",
  size = "md",
  className,
}: {
  label: string;
  side?: Side;
  /** "sm" tracks tiny (text-[10px]) labels; "md" suits body text and headings. */
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "size-4" : "size-5";
  const glyph = size === "sm" ? "size-3" : "size-3.5";
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={120}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          box,
          className,
        )}
      >
        <Info className={glyph} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-[16rem] origin-(--transform-origin) rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {label}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
