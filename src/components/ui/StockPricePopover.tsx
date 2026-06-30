"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useGlobalStockData } from "@/components/StockDataProvider";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${money(n)}`;

/**
 * Wraps a price/value element so clicking it pops a quick stats card —
 * last price, day trend, today's P&L, and total P&L for that symbol. Renders
 * as a <span> trigger and stops propagation so it works even inside a row that
 * navigates on click.
 */
export function StockPricePopover({
  symbol,
  children,
  side = "top",
}: {
  symbol: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const { stocks, dayPnLBySymbol } = useGlobalStockData();
  const stock = stocks.find(s => s.symbol === symbol);

  // No live entry (shouldn't happen where this is used) — render plainly.
  if (!stock) return <>{children}</>;

  const up = stock.change >= 0;
  const trendColor = up ? PROFIT : LOSS;
  const held = stock.shares > 0;
  const todayPnL = dayPnLBySymbol[symbol]?.dollar ?? stock.shares * stock.change;
  const totalPnL = stock.price * stock.shares - stock.costBasisTotal;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={<span />}
        nativeButton={false}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className="cursor-pointer underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} sideOffset={6} className="z-50">
          <Popover.Popup className="min-w-[13rem] origin-(--transform-origin) rounded-lg border border-border bg-card p-3 shadow-xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {symbol} · Last
              </span>
              <span className="font-mono font-bold tabular-nums">${stock.price.toFixed(2)}</span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Day trend</span>
              <span
                className="inline-flex items-center gap-1 font-mono font-bold tabular-nums text-sm"
                style={{ color: trendColor }}
              >
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {up ? "+" : ""}{stock.changePercent.toFixed(2)}% ({signed(stock.change)})
              </span>
            </div>

            {held ? (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today&rsquo;s gain/loss</span>
                  <span className="font-mono font-bold tabular-nums text-sm" style={{ color: todayPnL >= 0 ? PROFIT : LOSS }}>
                    {signed(todayPnL)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total gain/loss</span>
                  <span className="font-mono font-bold tabular-nums text-sm" style={{ color: totalPnL >= 0 ? PROFIT : LOSS }}>
                    {signed(totalPnL)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                Watchlist only — no open position.
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
