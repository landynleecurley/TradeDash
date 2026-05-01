"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const TRANSITION_MS = 180;

// Track open dialogs so only the topmost responds to Escape — and so the body
// scroll lock only releases when the last one closes.
const openStack: Array<() => void> = [];

let scrollLockCount = 0;
let savedScrollY = 0;

function lockBodyScroll() {
  if (scrollLockCount === 0 && typeof document !== "undefined") {
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && typeof document !== "undefined") {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, savedScrollY);
  }
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    el => el.offsetParent !== null || el === document.activeElement,
  );
}

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Visible heading. Also wired to aria-labelledby. */
  title?: ReactNode;
  /** Subtle text under the title. Wired to aria-describedby. */
  subtitle?: ReactNode;
  /** Tiny uppercase eyebrow above the title. */
  eyebrow?: ReactNode;
  /** Icon shown in a tinted circle next to the title. */
  icon?: ReactNode;
  /** Tint color for the icon circle (defaults to neutral). */
  iconColor?: string;
  size?: Size;
  /**
   * When true, Escape and backdrop clicks won't close. Use during in-flight
   * async work so users don't lose state to a misclick.
   */
  busy?: boolean;
  /** Hide the X close button (still escapable unless busy). */
  showClose?: boolean;
  /** Hide the chrome header — render children only. */
  hideHeader?: boolean;
  /** Optional class on the inner panel. */
  panelClassName?: string;
  /** Optional ref for the element that should take initial focus. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Optional aria-label when no title is supplied. */
  ariaLabel?: string;
};

export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  eyebrow,
  icon,
  iconColor,
  size = "md",
  busy = false,
  showClose = true,
  hideHeader = false,
  panelClassName,
  initialFocusRef,
  ariaLabel,
}: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const [phase, setPhase] = useState<"closed" | "entering" | "open" | "leaving">(open ? "entering" : "closed");
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    busyRef.current = busy;
  });

  // Drive the open/close phase machine.
  useEffect(() => {
    if (open && phase === "closed") {
      setPhase("entering");
    } else if (!open && (phase === "open" || phase === "entering")) {
      setPhase("leaving");
    }
  }, [open, phase]);

  // Once we're in the "entering" frame, paint, then flip to "open" so the
  // transition class change actually animates.
  useLayoutEffect(() => {
    if (phase !== "entering") return;
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // After the leaving transition, fully unmount.
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("closed"), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const isMounted = phase !== "closed";
  const isVisible = phase === "open";

  // Body scroll lock + stack registration. Tied to the mounted lifecycle so
  // Escape stack and scroll lock release in lock-step.
  useEffect(() => {
    if (!isMounted) return;
    lockBodyScroll();
    const close = () => onCloseRef.current?.();
    openStack.push(close);
    return () => {
      const idx = openStack.lastIndexOf(close);
      if (idx >= 0) openStack.splice(idx, 1);
      unlockBodyScroll();
    };
  }, [isMounted]);

  // Escape — only the topmost open modal handles it.
  useEffect(() => {
    if (!isMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busyRef.current) return;
      if (openStack[openStack.length - 1] !== onCloseRef.current) return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isMounted]);

  // Initial focus + restore on close.
  useEffect(() => {
    if (phase === "entering") {
      previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    }
    if (phase === "open" && panelRef.current) {
      const target =
        initialFocusRef?.current ??
        focusableWithin(panelRef.current).find(
          el => !el.hasAttribute("data-modal-close"),
        ) ??
        panelRef.current;
      target.focus({ preventScroll: true });
    }
    if (phase === "closed" && previouslyFocused.current) {
      try {
        previouslyFocused.current.focus({ preventScroll: true });
      } catch {
        /* element no longer in DOM */
      }
      previouslyFocused.current = null;
    }
  }, [phase, initialFocusRef]);

  // Focus trap — Tab/Shift+Tab cycle within the panel.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = focusableWithin(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const onBackdrop = useCallback(() => {
    if (busyRef.current) return;
    onCloseRef.current?.();
  }, []);

  if (!isMounted) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onBackdrop}
        className={[
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={[
          // Layout
          "relative w-full sm:w-full max-h-[90vh] overflow-y-auto",
          "bg-card text-card-foreground border border-border/50 shadow-2xl",
          // Mobile: bottom sheet. Desktop: centered card.
          "rounded-t-2xl sm:rounded-2xl",
          "sm:m-4",
          SIZE_CLASS[size],
          // Animation
          "transition-all motion-reduce:transition-none",
          isVisible
            ? "opacity-100 translate-y-0 sm:scale-100"
            : "opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95",
          panelClassName ?? "",
        ].join(" ")}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        {showClose && (
          <button
            type="button"
            onClick={() => {
              if (busyRef.current) return;
              onCloseRef.current?.();
            }}
            data-modal-close
            disabled={busy}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {!hideHeader && (title || subtitle || eyebrow || icon) && (
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start gap-3 pr-8">
              {icon && (
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                  style={
                    iconColor
                      ? { backgroundColor: `${iconColor}1a`, color: iconColor }
                      : undefined
                  }
                >
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {eyebrow && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h2
                    id={titleId}
                    className="text-lg font-bold tracking-tight leading-snug"
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p
                    id={subtitleId}
                    className="text-sm text-muted-foreground leading-relaxed"
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="px-6 pb-6 space-y-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

/**
 * Standardized footer for modal action rows. Right-aligned by default;
 * pass `align="between"` to push a destructive secondary action to the left.
 */
export function ModalFooter({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "end" | "between" | "stretch";
  className?: string;
}) {
  const alignClass =
    align === "between"
      ? "justify-between"
      : align === "stretch"
        ? "[&>*]:flex-1"
        : "justify-end";
  return (
    <div className={["flex flex-wrap items-center gap-2 pt-1", alignClass, className ?? ""].join(" ")}>
      {children}
    </div>
  );
}
