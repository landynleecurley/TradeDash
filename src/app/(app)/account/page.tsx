"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AnimatedNumber,
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/components/ui/AnimatedNumber";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CreditCard, Crown, ScrollText, Settings, Wallet } from "lucide-react";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const AMBER = "#F59E0B";

// Stable palette for the allocation donut. Cash always uses muted; positions
// rotate through these.
const POSITION_COLORS = [
  PROFIT,
  "#3B82F6",  // blue
  "#A855F7",  // purple
  AMBER,
  "#EC4899",  // pink
  "#06B6D4",  // cyan
  "#84CC16",  // lime
  "#F97316",  // orange
];

export default function AccountPage() {
  const {
    stocks,
    transactions,
    card,
    displayName,
    email,
    isReady,
    totalPortfolioValue,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    cashBalance,
    totalWealth,
    membership,
    isGoldActive,
  } = useGlobalStockData();

  const allocations = useMemo(() => {
    const total = totalWealth;
    const positionAllocs = stocks
      .filter(s => s.shares > 0 && s.price > 0)
      .map(s => ({ key: s.symbol, label: s.symbol, name: s.name, value: s.shares * s.price }))
      .sort((a, b) => b.value - a.value);
    const all = [
      ...positionAllocs,
      ...(cashBalance > 0 ? [{ key: '__cash', label: 'Cash', name: 'Cash', value: cashBalance }] : []),
    ];
    return all.map((row, i) => ({
      ...row,
      pct: total > 0 ? (row.value / total) * 100 : 0,
      color: row.key === '__cash' ? '#6b7280' : POSITION_COLORS[i % POSITION_COLORS.length],
    }));
  }, [stocks, cashBalance, totalWealth]);

  const stats = useMemo(() => {
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let totalCardSpend = 0;
    for (const tx of transactions) {
      if (tx.type === 'DEPOSIT') totalDeposited += tx.amount;
      else if (tx.type === 'WITHDRAW') totalWithdrawn += tx.amount;
      else if (tx.type === 'CARD_SPEND') totalCardSpend += tx.amount;
    }
    const positionsHeld = stocks.filter(s => s.shares > 0).length;
    return { totalDeposited, totalWithdrawn, totalCardSpend, positionsHeld };
  }, [transactions, stocks]);

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Identity */}
        <section className="space-y-1">
          {isReady ? (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">
                {displayName || email?.split('@')[0] || 'Your account'}
              </h1>
              {isGoldActive && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.25em] px-2 py-1 rounded-full"
                  style={{ backgroundColor: '#E8B53020', color: '#E8B530' }}
                >
                  <Crown className="h-3 w-3" />
                  Gold
                </span>
              )}
            </div>
          ) : (
            <Skeleton className="h-9 w-48" />
          )}
          {isReady && email && (
            <p className="text-sm text-muted-foreground">{email}</p>
          )}
          <nav className="flex flex-wrap gap-x-6 gap-y-2 mt-4 border-b border-border/40 pb-2">
            <NavTab href="/account" active>Investing</NavTab>
            <NavTab href="/analytics">Analytics</NavTab>
            <NavTab href="/settings">Settings</NavTab>
          </nav>
        </section>

        {/* Portfolio + allocation */}
        <section className="grid md:grid-cols-[1fr_auto] gap-10 items-start">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Total portfolio value
              </p>
              {isReady ? (
                <h2 className="text-5xl font-bold font-mono tracking-tight mt-2 leading-none tabular-nums">
                  <AnimatedNumber value={totalWealth} formatter={formatCurrency()} duration={500} />
                </h2>
              ) : (
                <Skeleton className="h-12 w-56 mt-2" />
              )}
            </div>

            <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
              {!isReady ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : allocations.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No positions or cash yet. <Link href="/wallet" className="font-semibold text-foreground hover:underline">Deposit cash</Link> to get started.
                </p>
              ) : (
                allocations.map(row => (
                  <div key={row.key} className="flex items-center justify-between p-4 hover:bg-foreground/[0.02] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-tight">{row.label}</p>
                        {row.label !== row.name && (
                          <p className="text-xs text-muted-foreground truncate">{row.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 ml-3 text-sm">
                      <span className="font-mono text-muted-foreground tabular-nums w-16 text-right">
                        {row.pct.toFixed(2)}%
                      </span>
                      <span className="font-mono font-semibold tabular-nums w-24 text-right">
                        ${row.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="relative w-64 h-64 mx-auto md:mx-0">
            {isReady && allocations.length > 0 ? (
              <>
                <ResponsiveContainer width={256} height={256}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        padding: '6px 10px',
                      }}
                      formatter={(v, _n, p) => {
                        const num = typeof v === 'number' ? v : Number(v ?? 0);
                        const payload = (p as { payload?: { label?: string } } | undefined)?.payload;
                        return [`$${num.toFixed(2)}`, payload?.label ?? ''];
                      }}
                    />
                    <Pie
                      data={allocations}
                      dataKey="value"
                      nameKey="key"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={1}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {allocations.map((r, i) => <Cell key={`${r.key}-${i}`} fill={r.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total</span>
                  <AnimatedNumber
                    value={totalWealth}
                    formatter={formatCurrency()}
                    duration={500}
                    className="font-mono font-bold text-lg mt-1 tabular-nums"
                  />
                </div>
              </>
            ) : (
              <Skeleton className="rounded-full w-64 h-64" />
            )}
          </div>
        </section>

        {/* Cards grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card title="Buying Power" emphasis="Available to invest or spend">
            {isReady ? (
              <AnimatedNumber
                value={cashBalance}
                formatter={formatCurrency()}
                className="font-mono font-bold text-2xl tracking-tight tabular-nums"
              />
            ) : <Skeleton className="h-7 w-24" />}
            <Hint>{cashBalance <= 0 ? 'Deposit cash to start trading.' : 'Cash earns 0% APY until live banking is wired up.'}</Hint>
            <Link href="/wallet" className="inline-block text-xs font-bold uppercase tracking-widest mt-2 hover:underline" style={{ color: PROFIT }}>
              Manage cash →
            </Link>
          </Card>

          <Card title="Total Return" emphasis="All-time P&L">
            {isReady ? (
              <>
                <AnimatedNumber
                  value={totalGain}
                  formatter={formatSignedCurrency()}
                  className="font-mono font-bold text-2xl tracking-tight tabular-nums"
                  style={{ color: totalGain >= 0 ? PROFIT : LOSS }}
                />
                <AnimatedNumber
                  value={totalGainPercent}
                  formatter={formatSignedPercent()}
                  className="block text-xs font-mono mt-1 tabular-nums"
                  style={{ color: totalGain >= 0 ? PROFIT : LOSS }}
                />
              </>
            ) : <Skeleton className="h-7 w-24" />}
            <Hint>Portfolio value vs cost basis.</Hint>
          </Card>

          <Card title="Today's P&L" emphasis="Since previous close">
            {isReady ? (
              <>
                <AnimatedNumber
                  value={dayChange}
                  formatter={formatSignedCurrency()}
                  className="font-mono font-bold text-2xl tracking-tight tabular-nums"
                  style={{ color: dayChange >= 0 ? PROFIT : LOSS }}
                />
                <AnimatedNumber
                  value={dayChangePercent}
                  formatter={formatSignedPercent()}
                  className="block text-xs font-mono mt-1 tabular-nums"
                  style={{ color: dayChange >= 0 ? PROFIT : LOSS }}
                />
              </>
            ) : <Skeleton className="h-7 w-24" />}
            <Hint>Positions opened today are basis-adjusted.</Hint>
          </Card>

          <Card title="Active Positions" emphasis="Symbols with shares > 0">
            <Big>{isReady ? String(stats.positionsHeld) : null}</Big>
            <Hint>Out of {stocks.length} on your watchlist.</Hint>
          </Card>

          <Card title="Debit Card" emphasis="Virtual">
            {isReady ? (
              card ? (
                <>
                  <Big>•••• {card.cardNumber.slice(-4)}</Big>
                  <p className="text-xs font-mono mt-1" style={{
                    color: card.status === 'active' ? PROFIT : card.status === 'frozen' ? AMBER : 'var(--muted-foreground)',
                  }}>
                    {card.status.toUpperCase()}
                  </p>
                </>
              ) : (
                <>
                  <Big>—</Big>
                  <Hint>No card issued yet.</Hint>
                </>
              )
            ) : <Skeleton className="h-7 w-32" />}
            <Link href="/wallet" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest mt-2 hover:underline" style={{ color: PROFIT }}>
              <CreditCard className="h-3 w-3" />
              {card ? 'Manage card' : 'Issue card'} →
            </Link>
          </Card>

          <Card title="Lifetime Deposits" emphasis="Cash you've added">
            <Big>{isReady ? `$${stats.totalDeposited.toFixed(2)}` : null}</Big>
            <Hint>Lifetime withdrawals: ${stats.totalWithdrawn.toFixed(2)}</Hint>
          </Card>

          <Card title="Card Spending" emphasis="Lifetime virtual purchases">
            <Big>{isReady ? `$${stats.totalCardSpend.toFixed(2)}` : null}</Big>
            <Hint>Spend with your card from the wallet.</Hint>
          </Card>

          <Card title="Day Trades" emphasis="0 of unlimited">
            <Big>0</Big>
            <Hint>Virtual trading isn&apos;t flagged for PDT rules.</Hint>
          </Card>

          <Card title="TradeDash Gold" emphasis={isGoldActive ? `${membership?.plan ?? ''} plan` : "Premium membership"}>
            {isReady ? (
              isGoldActive ? (
                <>
                  <p className="font-mono font-bold text-2xl tracking-tight" style={{ color: '#E8B530' }}>
                    Active
                  </p>
                  <Hint>
                    {membership?.cancelledAt
                      ? <>Ends {membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</>
                      : <>Renews {membership?.expiresAt ? new Date(membership.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</>}
                  </Hint>
                </>
              ) : (
                <>
                  <Big>—</Big>
                  <Hint>Unlock the gold card and member perks for $5/mo.</Hint>
                </>
              )
            ) : <Skeleton className="h-7 w-24" />}
            <Link href="/gold" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest mt-2 hover:underline" style={{ color: '#E8B530' }}>
              <Crown className="h-3 w-3" />
              {isGoldActive ? 'Manage' : 'Upgrade'} →
            </Link>
          </Card>

          <Card title="Margin Investing" emphasis="Disabled">
            <p className="text-sm text-muted-foreground leading-relaxed">
              All trades are cash-only. Margin requires real broker integration, which TradeDash doesn&apos;t simulate.
            </p>
          </Card>
        </section>

        {/* Gold-only: realized vs unrealized P&L breakdown. Hidden when the
            user isn't an active Gold member. */}
        {isGoldActive && <DetailedPnL stocks={stocks} transactions={transactions} />}

        {/* Quick links */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickLink href="/wallet" icon={<Wallet className="h-4 w-4" />} label="Wallet" sub="Cash, transfers, debit card" />
          <QuickLink href="/activity" icon={<ScrollText className="h-4 w-4" />} label="Activity" sub="All transactions" />
          <QuickLink href="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" sub="Profile and security" />
        </section>
      </main>
    </div>
  );
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

function Card({ title, emphasis, children }: { title: string; emphasis?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 p-4 space-y-1 bg-foreground/[0.01]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      {emphasis && <p className="text-xs text-muted-foreground">{emphasis}</p>}
      <div className="pt-2">{children}</div>
    </div>
  );
}

function Big({ color, children }: { color?: string; children: React.ReactNode }) {
  if (children == null) return <Skeleton className="h-7 w-24" />;
  return (
    <p className="font-mono font-bold text-2xl tracking-tight" style={color ? { color } : undefined}>
      {children}
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>;
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border/40 p-4 hover:border-border hover:bg-foreground/[0.02] transition-colors flex items-start gap-3"
    >
      <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </Link>
  );
}

const GOLD = "#E8B530";

/**
 * Realized vs unrealized P&L summary, plus per-position cost basis. Realized
 * uses an average-cost running ledger walked over BUY/SELL transactions in
 * chronological order; unrealized comes straight off the live `stocks` array
 * (current price × shares − cost basis).
 */
function DetailedPnL({
  stocks,
  transactions,
}: {
  stocks: ReturnType<typeof useGlobalStockData>['stocks'];
  transactions: ReturnType<typeof useGlobalStockData>['transactions'];
}) {
  const { realized, perSymbol } = useMemo(() => {
    type Lot = { shares: number; costBasisTotal: number };
    const ledger = new Map<string, Lot>();
    const realizedBySymbol = new Map<string, number>();
    let realizedTotal = 0;

    // Walk transactions chronologically. `Tx.shares` and `Tx.symbol` are
    // populated for BUY/SELL only.
    const ordered = [...transactions].sort((a, b) => a.t - b.t);
    for (const tx of ordered) {
      if (!tx.symbol || tx.shares == null) continue;
      if (tx.type === 'BUY') {
        const lot = ledger.get(tx.symbol) ?? { shares: 0, costBasisTotal: 0 };
        lot.shares += tx.shares;
        lot.costBasisTotal += tx.amount;
        ledger.set(tx.symbol, lot);
      } else if (tx.type === 'SELL') {
        const lot = ledger.get(tx.symbol);
        if (!lot || lot.shares <= 0) continue;
        const avg = lot.costBasisTotal / lot.shares;
        const soldCost = avg * tx.shares;
        const gain = tx.amount - soldCost;
        realizedTotal += gain;
        realizedBySymbol.set(tx.symbol, (realizedBySymbol.get(tx.symbol) ?? 0) + gain);
        lot.shares -= tx.shares;
        lot.costBasisTotal -= soldCost;
        if (lot.shares <= 0.0000001) ledger.delete(tx.symbol);
      }
    }

    return { realized: realizedTotal, perSymbol: realizedBySymbol };
  }, [transactions]);

  const heldUnrealized = stocks
    .filter(s => s.shares > 0)
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      shares: s.shares,
      avgCost: s.avgCost,
      currentPrice: s.price,
      marketValue: s.shares * s.price,
      costBasisTotal: s.costBasisTotal,
      gain: s.shares * s.price - s.costBasisTotal,
      gainPct: s.costBasisTotal > 0
        ? ((s.shares * s.price - s.costBasisTotal) / s.costBasisTotal) * 100
        : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const unrealized = heldUnrealized.reduce((acc, p) => acc + p.gain, 0);
  const total = realized + unrealized;

  return (
    <section className="space-y-4 pt-4 border-t border-border/40">
      <header className="flex items-center gap-2">
        <Crown className="h-4 w-4" style={{ color: GOLD }} />
        <h2 className="text-lg font-bold tracking-tight">Detailed P&amp;L</h2>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.25em] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${GOLD}20`, color: GOLD }}
        >
          Gold
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PnLStat label="Realized" detail="Locked in by past sales" value={realized} />
        <PnLStat label="Unrealized" detail="On current open positions" value={unrealized} />
        <PnLStat label="Total return" detail="Realized + unrealized" value={total} />
      </div>

      {heldUnrealized.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Open positions · cost basis
          </p>
          <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
            {heldUnrealized.map(p => {
              const positive = p.gain >= 0;
              const realizedForSymbol = perSymbol.get(p.symbol) ?? 0;
              return (
                <div key={p.symbol} className="grid grid-cols-12 gap-3 p-4 items-center text-sm">
                  <div className="col-span-12 sm:col-span-3 min-w-0">
                    <p className="font-bold tracking-tight">{p.symbol}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.name}</p>
                  </div>
                  <PnLCell label="Avg cost" value={`$${p.avgCost.toFixed(2)}`} />
                  <PnLCell label="Mark" value={`$${p.currentPrice.toFixed(2)}`} />
                  <PnLCell label="Cost basis" value={`$${p.costBasisTotal.toFixed(2)}`} />
                  <PnLCell label="Market value" value={`$${p.marketValue.toFixed(2)}`} />
                  <div className="col-span-6 sm:col-span-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unrealized</p>
                    <p className="font-mono font-bold" style={{ color: positive ? PROFIT : LOSS }}>
                      {positive ? '+' : '-'}${Math.abs(p.gain).toFixed(2)}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: positive ? PROFIT : LOSS }}>
                      {positive ? '+' : ''}{p.gainPct.toFixed(2)}%
                    </p>
                    {realizedForSymbol !== 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Realized {realizedForSymbol >= 0 ? '+' : '-'}${Math.abs(realizedForSymbol).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function PnLStat({ label, detail, value }: { label: string; detail: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className="rounded-lg border border-border/40 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold text-2xl tracking-tight mt-2" style={{ color: positive ? PROFIT : LOSS }}>
        {positive ? '+' : '-'}${Math.abs(value).toFixed(2)}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{detail}</p>
    </div>
  );
}

function PnLCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-6 sm:col-span-2 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold mt-0.5 truncate">{value}</p>
    </div>
  );
}
