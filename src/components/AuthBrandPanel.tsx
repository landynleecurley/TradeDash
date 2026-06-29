import { Activity } from "lucide-react";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

// Static, illustrative tickers — styled like the dashboard watchlist rows.
// Purely decorative (not live data).
const TICKERS = [
  { symbol: "AAPL", price: "229.87", change: 1.24 },
  { symbol: "NVDA", price: "138.45", change: 2.81 },
  { symbol: "TSLA", price: "412.30", change: -0.92 },
  { symbol: "SPY", price: "604.18", change: 0.46 },
];

const DEFAULT_SUBTITLE =
  "One account for your portfolio, your wallet, and the card that spends it.";

/**
 * Shared left-hand brand panel for the auth routes (login / signup / reset).
 * Hidden on mobile (md:flex). The headline and tickers stay constant; only the
 * `subtitle` changes between contexts (e.g. per signup step) so the panel never
 * feels static while the right-hand flow advances.
 */
export function AuthBrandPanel({ subtitle = DEFAULT_SUBTITLE }: { subtitle?: string }) {
  return (
    <div className="hidden md:flex md:w-1/2 relative flex-col justify-between overflow-hidden border-r border-border/50 p-10 lg:p-12">
      {/* Soft brand glow radiating from the top-left corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(130% 110% at 0% 0%, var(--brand-1a) 0%, transparent 50%)" }}
      />
      {/* Faint grid, masked so it fades toward the bottom-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 75%)",
        }}
      />

      {/* Logo */}
      <div className="relative flex items-center gap-2 font-bold text-xl tracking-tight">
        <Activity className="h-6 w-6" style={{ color: PROFIT }} />
        TradeDash
      </div>

      {/* Headline + subtitle + ticker rows */}
      <div className="relative max-w-md">
        <h2 className="text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">
          Invest, spend,
          <br />
          and grow.
        </h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed transition-colors">
          {subtitle}
        </p>

        <div
          aria-hidden="true"
          className="mt-8 rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden bg-background/40 backdrop-blur-sm"
        >
          {TICKERS.map(t => {
            const positive = t.change >= 0;
            return (
              <div key={t.symbol} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-bold tracking-tight">{t.symbol}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">${t.price}</span>
                </div>
                <span
                  className="text-sm font-bold font-mono tabular-nums"
                  style={{ color: positive ? PROFIT : LOSS }}
                >
                  {positive ? "+" : ""}
                  {t.change.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trust line */}
      <p className="relative text-xs text-muted-foreground">
        256-bit encryption · SIPC insured · No commission trades
      </p>
    </div>
  );
}
