"use client";

import { useState } from "react";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { cn } from "@/lib/utils";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${money(n)}`;

/**
 * Tappable stat that cycles a symbol's metrics in place:
 *   Price → Day trend → Today's gain/loss → Total gain/loss → (back to Price)
 * Renders as a <span role="button"> and stops propagation so it works inside a
 * row that navigates on click. `initial` picks the starting metric (0 = price).
 */
export function CyclingStat({
  symbol,
  initial = 0,
  className,
}: {
  symbol: string;
  initial?: number;
  className?: string;
}) {
  const { stocks, dayPnLBySymbol } = useGlobalStockData();
  const stock = stocks.find(s => s.symbol === symbol);
  const [i, setI] = useState(initial);

  if (!stock) return null;

  const up = stock.change >= 0;
  const todayPnL = dayPnLBySymbol[symbol]?.dollar ?? stock.shares * stock.change;
  const totalPnL = stock.price * stock.shares - stock.costBasisTotal;

  const metrics: { label: string; value: string; color?: string }[] = [
    { label: "Price", value: `$${stock.price.toFixed(2)}` },
    { label: "Day", value: `${up ? "+" : ""}${stock.changePercent.toFixed(2)}%`, color: up ? PROFIT : LOSS },
    { label: "Today", value: signed(todayPnL), color: todayPnL >= 0 ? PROFIT : LOSS },
    { label: "Total", value: signed(totalPnL), color: totalPnL >= 0 ? PROFIT : LOSS },
  ];
  const m = metrics[i % metrics.length];

  const next = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setI(p => (p + 1) % metrics.length);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={next}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") next(e);
      }}
      aria-label={`${m.label} ${m.value}. Tap to cycle metric.`}
      title="Tap to cycle: price · day · today · total"
      className={cn(
        "flex flex-col items-end cursor-pointer select-none rounded px-1 -mx-1 hover:bg-foreground/5 transition-colors",
        className,
      )}
    >
      <span
        className="text-xs font-bold font-mono tabular-nums leading-tight"
        style={m.color ? { color: m.color } : undefined}
      >
        {m.value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 leading-tight">
        {m.label}
      </span>
    </span>
  );
}
