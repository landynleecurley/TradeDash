"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell, CheckCheck, Coins, CreditCard, Crown, ShieldAlert, Sparkles,
  TrendingUp, Wallet, Megaphone,
} from "lucide-react";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions";
import type { AppNotification, NotificationCategory } from "@/lib/useStockData";

const PROFIT = "var(--brand)";
const GOLD = "#E8B530";
const ROSE = "#FF5000";
const BLUE = "#3B82F6";

const CATEGORY: Record<NotificationCategory, { icon: React.ReactNode; color: string; label: string }> = {
  trade:    { icon: <TrendingUp className="h-3.5 w-3.5" />, color: PROFIT, label: 'Trade' },
  transfer: { icon: <Wallet     className="h-3.5 w-3.5" />, color: BLUE,   label: 'Transfer' },
  card:     { icon: <CreditCard className="h-3.5 w-3.5" />, color: PROFIT, label: 'Card' },
  gold:     { icon: <Coins      className="h-3.5 w-3.5" />, color: GOLD,   label: 'Gold' },
  security: { icon: <ShieldAlert className="h-3.5 w-3.5" />, color: ROSE,  label: 'Security' },
  alert:    { icon: <Crown      className="h-3.5 w-3.5" />, color: GOLD,   label: 'Alert' },
  product:  { icon: <Megaphone  className="h-3.5 w-3.5" />, color: BLUE,   label: 'Product' },
};

function relativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function NotificationsBell({ className = "" }: { className?: string }) {
  const { notifications, notificationPrefs, refresh } = useGlobalStockData();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  // Apply preferences: items whose category has inApp turned off don't
  // appear in the feed (we still keep them in the DB for if/when the
  // toggle flips back on).
  const visible = notifications.filter(n => notificationPrefs[n.category]?.inApp !== false);
  const unread = visible.filter(n => !n.readAt).length;

  // Anchor the popover under the bell. Re-measure on scroll/resize so it
  // doesn't drift when the page header changes height.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const compute = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    compute();
    const close = () => setOpen(false);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // Outside-click + Escape to dismiss.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleItemClick = async (n: AppNotification) => {
    if (!n.readAt) {
      await markNotificationRead(n.id);
      // The realtime subscription will refresh too, but we trigger eagerly
      // so the unread count drops without waiting for the round-trip.
      void refresh();
    }
    setOpen(false);
  };

  const handleMarkAll = async () => {
    if (unread === 0) return;
    await markAllNotificationsRead();
    void refresh();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className={`relative h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors ${className}`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: ROSE }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Notifications"
          className="fixed z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-lg border border-border/60 bg-card shadow-2xl overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          style={{ top: position.top, right: position.right }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <p className="text-sm font-bold tracking-tight">
              Notifications
              {unread > 0 && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">({unread} new)</span>
              )}
            </p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40 inline-flex items-center gap-1"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto divide-y divide-border/40">
            {visible.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/50 mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">You&rsquo;re all caught up.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  We&rsquo;ll ping you here when something happens on your account.
                </p>
              </div>
            ) : (
              visible.map(n => {
                const meta = CATEGORY[n.category];
                const unreadDot = !n.readAt;
                const inner = (
                  <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${unreadDot ? 'bg-foreground/[0.02]' : ''} hover:bg-foreground/[0.04]`}>
                    <span
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                    >
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-semibold tracking-tight truncate">{n.title}</p>
                        <span className="text-[10px] font-medium text-muted-foreground shrink-0 ml-auto">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: meta.color }}>
                        {meta.label}
                      </p>
                    </div>
                    {unreadDot && (
                      <span
                        className="h-2 w-2 rounded-full shrink-0 mt-2"
                        style={{ backgroundColor: ROSE }}
                        aria-label="Unread"
                      />
                    )}
                  </div>
                );
                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => handleItemClick(n)}
                      className="block"
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-border/40 flex items-center justify-between bg-foreground/[0.02]">
            <Link
              href="/settings#notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Preferences
            </Link>
            {visible.length > 0 && (
              <span className="text-[10px] text-muted-foreground/70">
                Showing {visible.length} {visible.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

