"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { SaveProgressModal } from "@/components/SaveProgressModal";

const STORAGE_KEY = "tradedash.demoBannerDismissed";

/**
 * Sticky banner shown to anonymous (demo-mode) users on every page in the
 * app shell. Dismissible per-session; reappears on next visit. Click the
 * CTA to open the SaveProgressModal which converts the anon session into
 * a permanent account.
 */
export function DemoBanner() {
  const { isAnonymous, isReady, refresh } = useGlobalStockData();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  });

  if (!isReady || !isAnonymous || dismissed) {
    // Mount the modal anyway so the conversion flow works for users on
    // pages that don't render the banner (e.g., dismissed state).
    return (
      <SaveProgressModal open={open} onClose={() => setOpen(false)} refresh={refresh} />
    );
  }

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    }
  };

  return (
    <>
      <div
        role="status"
        className="sticky top-0 z-30 flex items-center gap-3 px-4 py-2 border-b text-xs"
        style={{
          background: 'linear-gradient(90deg, var(--brand-1a) 0%, var(--brand-08) 50%, var(--brand-1a) 100%)',
          borderColor: 'var(--brand-30)',
        }}
      >
        <Sparkles
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: 'var(--brand)' }}
          aria-hidden
        />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-bold uppercase tracking-widest text-[10px] mr-2" style={{ color: 'var(--brand)' }}>
            Demo mode
          </span>
          <span className="text-foreground">You&rsquo;re using a sandbox account.</span>
          <span className="text-muted-foreground hidden sm:inline">
            {" "}Sign up to save your portfolio, alerts, and gold benefits.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px] uppercase tracking-widest transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand)', color: '#000' }}
        >
          Save progress
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <SaveProgressModal open={open} onClose={() => setOpen(false)} refresh={refresh} />
    </>
  );
}
