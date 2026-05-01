"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  AnimatedNumber,
  formatCurrency,
  formatSignedCurrency,
} from "@/components/ui/AnimatedNumber";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, ShoppingBag,
  Crown, CalendarDays, Activity, Target,
} from "lucide-react";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const AMBER = "#F59E0B";

// ── helpers ──────────────────────────────────────────────────────────────

const ymd = (unix: number) => {
  const d = new Date(unix * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
};

export default function AnalyticsPage() {
  const { transactions, isReady } = useGlobalStockData();

  // ── hero stats: lifetime totals + active days ──────────────────────────
  const stats = useMemo(() => {
    let deposits = 0, withdrawals = 0, tradeVolume = 0, cardSpent = 0;
    let goldFees = 0, goldEarnings = 0;
    const days = new Set<string>();
    for (const tx of transactions) {
      days.add(ymd(tx.t));
      if (tx.type === 'DEPOSIT') {
        if (tx.symbol === 'Gold interest · 5% APY' || tx.symbol === 'Gold deposit match · 1%') {
          goldEarnings += tx.amount;
        } else {
          deposits += tx.amount;
        }
      } else if (tx.type === 'WITHDRAW') {
        withdrawals += tx.amount;
      } else if (tx.type === 'BUY' || tx.type === 'SELL') {
        tradeVolume += tx.amount;
      } else if (tx.type === 'CARD_SPEND') {
        cardSpent += tx.amount;
      } else if (tx.type === 'MEMBERSHIP') {
        goldFees += tx.amount;
      }
    }
    return { deposits, withdrawals, tradeVolume, cardSpent, goldFees, goldEarnings, activeDays: days.size };
  }, [transactions]);

  // ── cumulative cash-flow series ────────────────────────────────────────
  const cashFlow = useMemo(() => {
    if (transactions.length === 0) return [] as { t: number; time: string; net: number; deposits: number; withdrawals: number }[];
    const sorted = [...transactions].sort((a, b) => a.t - b.t);
    let depCum = 0, wdCum = 0;
    const points = sorted.map(tx => {
      if (tx.type === 'DEPOSIT' && tx.symbol !== 'Gold interest · 5% APY' && tx.symbol !== 'Gold deposit match · 1%') {
        depCum += tx.amount;
      } else if (tx.type === 'WITHDRAW') {
        wdCum += tx.amount;
      }
      return {
        t: tx.t,
        time: new Date(tx.t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        deposits: depCum,
        withdrawals: wdCum,
        net: depCum - wdCum,
      };
    });
    return points;
  }, [transactions]);

  // ── top symbols by trade volume ────────────────────────────────────────
  const topSymbols = useMemo(() => {
    const map = new Map<string, { buy: number; sell: number }>();
    for (const tx of transactions) {
      if ((tx.type !== 'BUY' && tx.type !== 'SELL') || !tx.symbol) continue;
      const row = map.get(tx.symbol) ?? { buy: 0, sell: 0 };
      if (tx.type === 'BUY') row.buy += tx.amount;
      else row.sell += tx.amount;
      map.set(tx.symbol, row);
    }
    return [...map.entries()]
      .map(([symbol, v]) => ({ symbol, volume: v.buy + v.sell, buy: v.buy, sell: v.sell }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 7);
  }, [transactions]);

  // ── win/loss on closed trades (avg-cost ledger) ────────────────────────
  const closedTrades = useMemo(() => {
    type Lot = { shares: number; cost: number };
    const ledger = new Map<string, Lot>();
    let wins = 0, losses = 0, winSum = 0, lossSum = 0;
    const trades: { gain: number; symbol: string; t: number }[] = [];
    const sorted = [...transactions].sort((a, b) => a.t - b.t);
    for (const tx of sorted) {
      if (!tx.symbol || tx.shares == null) continue;
      if (tx.type === 'BUY') {
        const lot = ledger.get(tx.symbol) ?? { shares: 0, cost: 0 };
        lot.shares += tx.shares;
        lot.cost += tx.amount;
        ledger.set(tx.symbol, lot);
      } else if (tx.type === 'SELL') {
        const lot = ledger.get(tx.symbol);
        if (!lot || lot.shares <= 0) continue;
        const avg = lot.cost / lot.shares;
        const soldCost = avg * tx.shares;
        const gain = tx.amount - soldCost;
        trades.push({ gain, symbol: tx.symbol, t: tx.t });
        if (gain >= 0) { wins += 1; winSum += gain; }
        else { losses += 1; lossSum += Math.abs(gain); }
        lot.shares -= tx.shares;
        lot.cost -= soldCost;
        if (lot.shares <= 0.0000001) ledger.delete(tx.symbol);
      }
    }
    const total = wins + losses;
    return {
      total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      avgWin: wins > 0 ? winSum / wins : 0,
      avgLoss: losses > 0 ? lossSum / losses : 0,
      net: winSum - lossSum,
      bestTrade: trades.reduce<{ gain: number; symbol: string; t: number } | null>(
        (best, t) => (best === null || t.gain > best.gain) ? t : best, null,
      ),
      worstTrade: trades.reduce<{ gain: number; symbol: string; t: number } | null>(
        (worst, t) => (worst === null || t.gain < worst.gain) ? t : worst, null,
      ),
    };
  }, [transactions]);

  // ── activity heatmap: last 12 weeks, transactions per day ──────────────
  const heatmap = useMemo(() => {
    // Anchor on the upcoming Sunday so the grid's right edge aligns to today.
    const now = new Date();
    const dow = now.getDay(); // 0 = Sun
    const endOfWeek = new Date(now);
    endOfWeek.setHours(0, 0, 0, 0);
    endOfWeek.setDate(now.getDate() + (6 - dow));
    const weeks = 12;
    const days = weeks * 7;
    const start = new Date(endOfWeek);
    start.setDate(endOfWeek.getDate() - (days - 1));

    // Bucket transactions by ymd.
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      const key = ymd(tx.t);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const grid: { date: Date; count: number; isFuture: boolean }[][] = [];
    let max = 0;
    for (let w = 0; w < weeks; w++) {
      const week: { date: Date; count: number; isFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const isFuture = date > now;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const count = isFuture ? 0 : (counts.get(`${y}-${m}-${day}`) ?? 0);
        if (count > max) max = count;
        week.push({ date, count, isFuture });
      }
      grid.push(week);
    }
    return { grid, max };
  }, [transactions]);

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Identity + tabs */}
        <section className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Your activity</h1>
          <p className="text-sm text-muted-foreground">
            Lifetime stats and patterns derived from every transaction on your TradeDash account.
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 mt-4 border-b border-border/40 pb-2">
            <NavTab href="/account">Investing</NavTab>
            <NavTab href="/analytics" active>Analytics</NavTab>
            <NavTab href="/settings">Settings</NavTab>
          </nav>
        </section>

        {!isReady ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        ) : transactions.length === 0 ? (
          <section className="rounded-lg border border-dashed border-border/60 p-12 flex flex-col items-center text-center gap-3">
            <Activity className="h-8 w-8 text-muted-foreground" />
            <p className="text-base font-bold tracking-tight">No activity yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Make your first deposit or trade and your stats will start populating here.
            </p>
            <Link
              href="/wallet"
              className="text-xs font-bold uppercase tracking-widest mt-2 hover:underline"
              style={{ color: PROFIT }}
            >
              Open Wallet →
            </Link>
          </section>
        ) : (
          <>
            {/* ── Hero stats ───────────────────────────────────────────── */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile
                icon={<ArrowDownToLine className="h-4 w-4" />}
                label="Deposits"
                value={stats.deposits}
                color={PROFIT}
              />
              <StatTile
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                label="Withdrawals"
                value={stats.withdrawals}
                color={LOSS}
              />
              <StatTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="Trade volume"
                value={stats.tradeVolume}
                sub={`${closedTrades.total} closed`}
              />
              <StatTile
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Card spend"
                value={stats.cardSpent}
              />
              <StatTile
                icon={<Crown className="h-4 w-4" />}
                label="Gold net"
                value={stats.goldEarnings - stats.goldFees}
                signed
                sub={`${compact(stats.goldEarnings)} earned · ${compact(stats.goldFees)} paid`}
                color={AMBER}
              />
              <StatTile
                icon={<CalendarDays className="h-4 w-4" />}
                label="Active days"
                value={stats.activeDays}
                isCount
              />
            </section>

            {/* ── Cash flow chart ──────────────────────────────────────── */}
            <section className="space-y-4">
              <header>
                <h2 className="text-lg font-bold tracking-tight">Cash flow</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Cumulative deposits and withdrawals over time. Net = deposits − withdrawals.
                </p>
              </header>
              <div className="h-[260px] -mx-4 sm:-mx-6 md:mx-0" style={{ touchAction: 'pan-y' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={cashFlow} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PROFIT} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={PROFIT} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="wdGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={LOSS} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={LOSS} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin', 'auto']} />
                    <XAxis hide dataKey="time" />
                    <Tooltip
                      cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3', strokeOpacity: 0.6 }}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        padding: '8px 10px',
                      }}
                      labelStyle={{ color: 'var(--muted-foreground)', fontSize: '11px' }}
                      itemStyle={{ fontWeight: 600 }}
                      formatter={(v, name) => [
                        typeof v === 'number' ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v,
                        name === 'deposits' ? 'Deposits' : name === 'withdrawals' ? 'Withdrawals' : 'Net',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="deposits"
                      stroke={PROFIT}
                      strokeWidth={2}
                      fill="url(#depGrad)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="withdrawals"
                      stroke={LOSS}
                      strokeWidth={1.5}
                      fill="url(#wdGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <Legend swatch={PROFIT} label="Deposits" />
                <Legend swatch={LOSS} label="Withdrawals" />
                <span className="text-muted-foreground font-mono">
                  Net{" "}
                  <AnimatedNumber
                    value={stats.deposits - stats.withdrawals}
                    formatter={formatSignedCurrency()}
                    className="font-semibold text-foreground"
                  />
                </span>
              </div>
            </section>

            {/* ── Win/loss + Top symbols (side-by-side on lg) ──────────── */}
            <section className="grid lg:grid-cols-2 gap-6">
              {/* Win/Loss */}
              <div className="rounded-lg border border-border/40 p-5 space-y-4">
                <header className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold tracking-tight uppercase tracking-widest">Win / Loss</h2>
                </header>
                {closedTrades.total === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No closed trades yet. Your win rate will appear once you sell a position.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold font-mono tabular-nums">
                          {closedTrades.winRate.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {closedTrades.wins}W · {closedTrades.losses}L
                        </span>
                      </div>
                      {/* Win/loss bar */}
                      <div className="h-2 rounded-full overflow-hidden flex bg-foreground/10">
                        <div
                          style={{ width: `${closedTrades.winRate}%`, backgroundColor: PROFIT }}
                          className="transition-all"
                        />
                        <div
                          style={{ width: `${100 - closedTrades.winRate}%`, backgroundColor: LOSS }}
                          className="transition-all"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <SmallStat label="Avg win" value={`+$${closedTrades.avgWin.toFixed(2)}`} color={PROFIT} />
                      <SmallStat label="Avg loss" value={`-$${closedTrades.avgLoss.toFixed(2)}`} color={LOSS} />
                      <SmallStat
                        label="Best trade"
                        value={closedTrades.bestTrade ? `+$${closedTrades.bestTrade.gain.toFixed(2)}` : '—'}
                        sub={closedTrades.bestTrade?.symbol}
                        color={PROFIT}
                      />
                      <SmallStat
                        label="Worst trade"
                        value={closedTrades.worstTrade ? `${closedTrades.worstTrade.gain >= 0 ? '+' : '-'}$${Math.abs(closedTrades.worstTrade.gain).toFixed(2)}` : '—'}
                        sub={closedTrades.worstTrade?.symbol}
                        color={closedTrades.worstTrade && closedTrades.worstTrade.gain >= 0 ? PROFIT : LOSS}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Top symbols */}
              <div className="rounded-lg border border-border/40 p-5 space-y-4">
                <header className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold tracking-tight uppercase tracking-widest">Most traded</h2>
                </header>
                {topSymbols.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trades yet.</p>
                ) : (
                  <div className="h-[200px]" style={{ touchAction: 'pan-y' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={topSymbols} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                        <YAxis
                          type="category"
                          dataKey="symbol"
                          tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--foreground)' }}
                          tickLine={false}
                          axisLine={false}
                          width={50}
                        />
                        <XAxis type="number" hide />
                        <Tooltip
                          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            padding: '6px 10px',
                          }}
                          labelStyle={{ color: 'var(--foreground)', fontSize: '11px', fontWeight: 700 }}
                          formatter={(v) => [
                            typeof v === 'number' ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v,
                            'Volume',
                          ]}
                        />
                        <Bar dataKey="volume" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {topSymbols.map((row) => (
                            <Cell key={row.symbol} fill={row.sell > row.buy ? LOSS : PROFIT} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>

            {/* ── Activity heatmap ─────────────────────────────────────── */}
            <section className="space-y-4">
              <header className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Activity heatmap</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Transactions per day for the last 12 weeks. Darker squares = busier days.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Less</span>
                  {[0, 1, 2, 3, 4].map(level => (
                    <span
                      key={level}
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: heatColor(level, 4) }}
                    />
                  ))}
                  <span>More</span>
                </div>
              </header>
              <div className="overflow-x-auto -mx-6 px-6">
                <div className="inline-flex gap-1">
                  {heatmap.grid.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.map((cell, di) => {
                        const level = heatmap.max > 0 ? Math.min(4, Math.ceil((cell.count / heatmap.max) * 4)) : 0;
                        return (
                          <div
                            key={di}
                            className="h-3 w-3 rounded-sm transition-colors"
                            style={{
                              backgroundColor: cell.isFuture
                                ? 'transparent'
                                : heatColor(level, 4),
                              outline: cell.isFuture ? '1px dashed var(--border)' : 'none',
                              outlineOffset: '-1px',
                            }}
                            title={`${cell.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}${cell.count ? ` · ${cell.count} ${cell.count === 1 ? 'txn' : 'txns'}` : ''}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatTile({
  icon, label, value, sub, color, signed, isCount,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color?: string;
  signed?: boolean;
  isCount?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-6 w-6 rounded-md bg-foreground/5 flex items-center justify-center">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <AnimatedNumber
        value={value}
        formatter={isCount
          ? (n: number) => Math.round(n).toString()
          : signed
            ? formatSignedCurrency()
            : formatCurrency()}
        className="font-mono font-bold text-xl tabular-nums block"
        style={color ? { color } : undefined}
      />
      {sub && <p className="text-[10px] font-mono text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function SmallStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold mt-1 text-sm" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: swatch }} />
      {label}
    </span>
  );
}

// 5-step heat ramp on the brand color. Level 0 = base muted, level 4 = full.
function heatColor(level: number, max: number): string {
  if (level <= 0) return 'var(--muted)';
  const pct = (level / max) * 100;
  return `color-mix(in srgb, var(--brand) ${pct}%, var(--muted))`;
}

function NavTab({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm font-semibold tracking-tight pb-2 -mb-px border-b-2 transition-colors ${
        active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  );
}
