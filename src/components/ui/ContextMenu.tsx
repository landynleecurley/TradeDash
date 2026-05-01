"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type ContextMenuItem =
  | {
      kind: "item";
      label: string;
      icon?: ReactNode;
      onClick: () => void;
      disabled?: boolean;
      destructive?: boolean;
      shortcut?: string;
    }
  | { kind: "separator" }
  | { kind: "header"; label: string };

const MENU_WIDTH = 224;
const VIEWPORT_PAD = 8;

/**
 * useContextMenu wires a right-click handler to any element and renders a
 * portal-mounted floating menu at the cursor. Items support icons, keyboard
 * shortcuts (display only), separators, headers, and a destructive variant.
 *
 * Returns:
 *   - onContextMenu: spread onto the trigger
 *   - menu: a node to render somewhere in the same tree (the portal handles
 *           the actual DOM mount, so the placement doesn't matter visually)
 */
export function useContextMenu(items: ContextMenuItem[] | (() => ContextMenuItem[])) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [resolvedItems, setResolvedItems] = useState<ContextMenuItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);

  // Keep the items ref live so the handler always reads the latest closure
  // (the consumer might pass a new array on every render).
  useEffect(() => {
    itemsRef.current = items;
  });

  const close = useCallback(() => {
    setPosition(null);
    setActiveIndex(-1);
  }, []);

  const firstActive = (list: ContextMenuItem[]): number => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === "item" && !(list[i] as Extract<ContextMenuItem, { kind: "item" }>).disabled) return i;
    }
    return -1;
  };

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const list = typeof itemsRef.current === "function" ? itemsRef.current() : itemsRef.current;
    if (list.length === 0) return;

    // Initial cursor position; we'll re-clamp after measuring height below.
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - VIEWPORT_PAD);
    setResolvedItems(list);
    setActiveIndex(firstActive(list));
    setPosition({ x, y: e.clientY });
  }, []);

  // After the menu mounts, measure and flip up if it would overflow the
  // bottom of the viewport.
  useLayoutEffect(() => {
    if (!position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const overflow = position.y + rect.height + VIEWPORT_PAD - window.innerHeight;
    if (overflow > 0) {
      setPosition(p => (p ? { x: p.x, y: Math.max(VIEWPORT_PAD, p.y - rect.height) } : null));
    }
  }, [position]);

  // Outside click + keyboard handlers, plus close on scroll/resize so a
  // stale menu doesn't sit at a now-wrong cursor position.
  useEffect(() => {
    if (!position) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(curr => {
          const len = resolvedItems.length;
          if (len === 0) return curr;
          const dir = e.key === "ArrowDown" ? 1 : -1;
          let next = curr;
          // Walk until we land on an enabled item, give up after a full lap.
          for (let i = 0; i < len; i++) {
            next = (next + dir + len) % len;
            const item = resolvedItems[next];
            if (item.kind === "item" && !item.disabled) return next;
          }
          return curr;
        });
      } else if (e.key === "Enter") {
        const item = resolvedItems[activeIndex];
        if (item?.kind === "item" && !item.disabled) {
          item.onClick();
          close();
        }
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position, resolvedItems, activeIndex, close]);

  const menu = useMemo(() => {
    if (!position || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{ left: position.x, top: position.y, width: MENU_WIDTH }}
        className="fixed z-[100] rounded-lg border border-border/60 bg-card shadow-2xl py-1 text-card-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 origin-top-left"
        onContextMenu={e => e.preventDefault()}
      >
        {resolvedItems.map((item, i) => {
          if (item.kind === "separator") {
            return <div key={`sep-${i}`} className="my-1 h-px bg-border/60" role="separator" />;
          }
          if (item.kind === "header") {
            return (
              <p
                key={`hdr-${i}`}
                className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
              >
                {item.label}
              </p>
            );
          }
          const active = i === activeIndex && !item.disabled;
          return (
            <button
              key={`item-${i}-${item.label}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                close();
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 outline-none transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                item.destructive
                  ? active
                    ? "bg-rose-500/10 text-rose-500"
                    : "text-rose-500 hover:bg-rose-500/10"
                  : active
                    ? "bg-foreground/5 text-foreground"
                    : "text-foreground hover:bg-foreground/5",
              )}
            >
              {item.icon !== undefined && (
                <span className="inline-flex items-center justify-center shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] font-mono text-muted-foreground/70 tracking-widest shrink-0">
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  }, [position, resolvedItems, activeIndex, close]);

  return { onContextMenu, menu };
}
