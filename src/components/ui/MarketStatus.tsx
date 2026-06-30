import { cn } from "@/lib/utils";

const PROFIT = "var(--brand)";

/**
 * Single header status pill — merges the market session and the live-data
 * connection into one indicator (so "After-Hours" and "Live" never show
 * side by side):
 *   - disconnected            → "Offline" (muted, no pulse)
 *   - connected + market open  → "Live" (brand green, pulsing)
 *   - connected + otherwise    → the session label (Pre-Market / After-Hours /
 *                                Closed) in its session color, pulsing
 */
export function MarketStatus({
  isLive,
  marketLabel,
  marketColor,
}: {
  isLive: boolean;
  marketLabel: string;
  marketColor: string;
}) {
  const status = !isLive
    ? { label: "Offline", color: "var(--muted-foreground)", pulse: false }
    : marketLabel === "Market Open"
      ? { label: "Live", color: PROFIT, pulse: true }
      : { label: marketLabel, color: marketColor, pulse: true };

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("h-2 w-2 rounded-full", status.pulse && "animate-pulse")}
        style={{ backgroundColor: status.color }}
      />
      <span
        className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest"
        style={{ color: status.color }}
      >
        {status.label}
      </span>
    </div>
  );
}
